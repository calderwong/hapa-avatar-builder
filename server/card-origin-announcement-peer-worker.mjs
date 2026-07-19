#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Hyperswarm from "hyperswarm";
import Protomux from "protomux";
import * as compact from "compact-encoding";

import { openGatePassIdentity, publicGatePassIdentity } from "./stargate-gate-pass-protocol.mjs";
import {
  CARD_ORIGIN_ANNOUNCEMENT_PROTOCOL,
  cardOriginAnnouncementTopic,
  createCardOriginAcknowledgement,
  createCardOriginAnnouncement,
  verifyCardOriginAcknowledgement,
  verifyCardOriginAnnouncement
} from "./card-origin-announcement-protocol.mjs";

function argument(name) { const index = process.argv.indexOf(name); return index === -1 ? null : process.argv[index + 1]; }
const profileRoot = argument("--profile-root");
const displayLabel = argument("--label") || "Hapa origin peer";
if (!profileRoot || typeof process.send !== "function") throw new Error("Origin announcement worker requires a profile root and IPC");

let identity;
let swarm;
let timeout;
let finished = false;
function send(payload) { if (process.connected) process.send(payload); }
function safeError(error) { return { code: error?.code || "origin_announcement_worker_failed", message: String(error?.message || error).replaceAll(profileRoot, "[private-profile]") }; }
async function cleanup() { clearTimeout(timeout); if (swarm) await swarm.destroy().catch(() => {}); swarm = null; }
async function fail(error) { if (finished) return; finished = true; await cleanup(); send({ type: "failed", error: safeError(error) }); setTimeout(() => process.exit(1), 20).unref(); }

async function connect(command) {
  if (command.localConsent !== true) throw Object.assign(new Error("Explicit receiving-node consent is required"), { code: "origin_announcement_consent_required" });
  const verification = verifyCardOriginAnnouncement(command.announcement);
  const topic = cardOriginAnnouncementTopic(command.announcement);
  const channelId = Buffer.from(verification.announcementDigest, "hex");
  if (!Array.isArray(command.bootstrap) || command.bootstrap.length !== 1 || !/^127\.0\.0\.1:[0-9]+$/.test(command.bootstrap[0])) throw new Error("Worker requires one ephemeral loopback DHT bootstrap");
  timeout = setTimeout(() => fail(Object.assign(new Error("Origin announcement handshake timed out"), { code: "origin_announcement_timeout" })), command.timeoutMs || 20_000);
  swarm = new Hyperswarm({ bootstrap: command.bootstrap });
  swarm.on("connection", (stream) => {
    const mux = Protomux.from(stream);
    let message;
    const channel = mux.createChannel({
      protocol: `${CARD_ORIGIN_ANNOUNCEMENT_PROTOCOL}/exact-origin-event`,
      id: channelId,
      onopen() {
        if (command.discoveryRole === "server") message.send(JSON.stringify({ kind: "announcement", envelope: command.announcement }));
      }
    });
    if (!channel) return stream.destroy();
    message = channel.addMessage({
      encoding: compact.string,
      onmessage(serialized) {
        let packet;
        try { packet = JSON.parse(serialized); } catch { return fail(new Error("Peer sent invalid origin announcement JSON")); }
        if (packet.kind === "announcement" && command.discoveryRole === "client") {
          Promise.resolve().then(async () => {
            const received = verifyCardOriginAnnouncement(packet.envelope);
            const receiverRoot = path.join(path.resolve(profileRoot), "p2p", "received-origin-announcements");
            await mkdir(receiverRoot, { recursive: true, mode: 0o700 });
            await writeFile(path.join(receiverRoot, `${received.announcementDigest}.json`), `${JSON.stringify(packet.envelope)}\n`, { encoding: "utf8", mode: 0o600 });
            const acknowledgement = createCardOriginAcknowledgement({ identity, announcementDigest: received.announcementDigest });
            message.send(JSON.stringify({ kind: "ack", envelope: acknowledgement }));
            await new Promise((resolve) => setTimeout(resolve, 60));
            await finish({ role: "receiver", received, acknowledgement, receivedDurably: true, stream });
          }).catch(fail);
        }
        if (packet.kind === "ack" && command.discoveryRole === "server") {
          try {
            const acknowledgement = verifyCardOriginAcknowledgement(packet.envelope, { announcementDigest: verification.announcementDigest });
            finish({ role: "announcer", received: verification, acknowledgement, receivedDurably: false, stream }).catch(fail);
          } catch (error) { fail(error); }
        }
      }
    });
    channel.open();
  });
  swarm.on("error", fail);
  const discovery = swarm.join(topic, { server: command.discoveryRole === "server", client: command.discoveryRole === "client" });
  await discovery.flushed();
  send({ type: "joined", discoveryRole: command.discoveryRole, topicWithheld: true });
}

async function finish({ role, received, acknowledgement, receivedDurably, stream }) {
  if (finished) return;
  finished = true;
  const result = {
    schemaVersion: "hapa.card-origin-announcement-worker-result.v1",
    role,
    announcementDigest: received.announcementDigest,
    cardId: received.announcement.cardId,
    revision: received.announcement.revision,
    originEventId: received.announcement.originEventId,
    acknowledgement: { verified: true, receiverNodeId: acknowledgement.receiverNodeId || identity.nodeId, decision: acknowledgement.decision || "received_exact_origin_event", acknowledgementDigest: acknowledgement.acknowledgementDigest || null },
    receivedDurably,
    hyperswarmConnectionObserved: true,
    noiseEncryptedStreamObserved: Boolean(stream?.noiseStream || stream?.handshakeHash || stream?.remotePublicKey),
    explicitLocalConsent: true
  };
  await cleanup();
  send({ type: "completed", result });
  setTimeout(() => process.exit(0), 20).unref();
}

process.on("message", async (command) => {
  try {
    if (command.type === "create") return send({ type: "created", announcement: createCardOriginAnnouncement({ identity, ...command.input }) });
    if (command.type === "connect") return await connect(command);
    if (command.type === "shutdown") { finished = true; await cleanup(); process.exit(0); }
    throw new Error("Unsupported worker command");
  } catch (error) { await fail(error); }
});
process.on("disconnect", async () => { await cleanup(); process.exit(0); });
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
identity = await openGatePassIdentity(profileRoot, { displayLabel });
send({ type: "ready", identity: publicGatePassIdentity(identity) });
