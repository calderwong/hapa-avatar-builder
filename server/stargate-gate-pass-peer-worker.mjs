#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import Hyperswarm from "hyperswarm";
import Protomux from "protomux";
import * as compact from "compact-encoding";
import {
  GATE_PASS_PROTOCOL,
  assertGatePassLeakFree,
  createGatePass,
  createGatePassAcknowledgement,
  createGatePassHello,
  openGatePassIdentity,
  parseGatePass,
  publicGatePassIdentity,
  selectGatePassDecision,
  verifyContextCardHandoff,
  verifyGatePassAcknowledgement,
  verifyGatePassHello
} from "./stargate-gate-pass-protocol.mjs";
import { sha256 } from "./stargate-p2p-canonical.mjs";

function argument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const profileRoot = argument("--profile-root");
const displayLabel = argument("--label") ?? "Hapa peer";
if (!profileRoot || typeof process.send !== "function") throw new Error("Gate Pass worker requires a profile root and IPC");

let identity;
let swarm;
let timeout;
let finished = false;

function send(payload) {
  if (process.connected) process.send(payload);
}

function safeError(error) {
  const message = String(error?.message ?? "Gate Pass worker failed").replaceAll(profileRoot, "[private-profile]");
  return { name: error?.name ?? "Error", code: error?.code ?? "gate_pass_worker_error", message };
}

async function cleanup() {
  clearTimeout(timeout);
  if (swarm) await swarm.destroy().catch(() => {});
  swarm = null;
}

async function fail(error) {
  if (finished) return;
  finished = true;
  await cleanup();
  send({ type: "failed", error: safeError(error) });
  setTimeout(() => process.exit(1), 20).unref();
}

async function connect(command) {
  if (command.localConsent !== true) throw Object.assign(new Error("Explicit receiving-node consent is required"), { code: "gate_pass_consent_required" });
  const parsedGatePass = parseGatePass(command.gatePassToken);
  const cardPacket = verifyContextCardHandoff(command.contextCardPacket, parsedGatePass);
  const ownHello = createGatePassHello({ identity, parsedGatePass });
  const secret = parsedGatePass.gatePass.cohortSecretBase64Url;
  const topic = Buffer.from(parsedGatePass.gate.rendezvousTopic, "hex");
  const channelId = Buffer.from(parsedGatePass.safeSummary.gateCommitment, "hex");
  let peerVerification = null;
  let remoteAcknowledgement = null;
  let localDecision = null;
  let connectionCount = 0;

  if (command.discoveryRole === "client") {
    const receiverRoot = path.join(path.resolve(profileRoot), "p2p", "received-cards");
    await mkdir(receiverRoot, { recursive: true, mode: 0o700 });
    await writeFile(path.join(receiverRoot, "stargate-context-card.json"), `${JSON.stringify(command.contextCardPacket)}\n`, { encoding: "utf8", mode: 0o600 });
  }
  timeout = setTimeout(() => fail(Object.assign(new Error("Gate Pass Hyperswarm handshake timed out"), { code: "gate_pass_timeout" })), command.timeoutMs ?? 30_000);
  if (!Array.isArray(command.bootstrap) || command.bootstrap.length !== 1 || !/^127\.0\.0\.1:[0-9]+$/.test(command.bootstrap[0])) throw new Error("Worker requires one ephemeral loopback DHT bootstrap");
  swarm = new Hyperswarm({ bootstrap: command.bootstrap });
  swarm.on("connection", (stream) => {
    connectionCount += 1;
    if (peerVerification) return stream.destroy();
    const mux = Protomux.from(stream);
    const channel = mux.createChannel({
      protocol: `${GATE_PASS_PROTOCOL}/signed-card-pass`,
      id: channelId,
      onopen() { message.send(JSON.stringify({ kind: "hello", envelope: ownHello })); }
    });
    if (!channel) return stream.destroy();
    const message = channel.addMessage({
      encoding: compact.string,
      onmessage(serialized) {
        let packet;
        try { packet = JSON.parse(serialized); } catch { return fail(new Error("Peer sent invalid JSON")); }
        if (packet.kind === "hello") {
          try {
            peerVerification = verifyGatePassHello(packet.envelope, { parsedGatePass });
            localDecision = selectGatePassDecision({
              verification: peerVerification,
              localConsent: command.localConsent === true,
              peerNodeId: peerVerification.peer.nodeId,
              blockedNodeIds: command.blockedNodeIds ?? []
            });
            const acknowledgement = createGatePassAcknowledgement({ identity, peerNodeId: peerVerification.peer.nodeId, helloDigest: peerVerification.helloDigest, ...localDecision });
            message.send(JSON.stringify({ kind: "ack", envelope: acknowledgement }));
            maybeComplete(stream);
          } catch (error) { fail(error); }
        }
        if (packet.kind === "ack") {
          try {
            if (!peerVerification) throw new Error("Acknowledgement arrived before peer hello");
            remoteAcknowledgement = verifyGatePassAcknowledgement(packet.envelope, {
              expectedSender: peerVerification.peer,
              expectedRecipient: identity.nodeId,
              expectedHelloDigest: sha256(ownHello)
            });
            maybeComplete(stream);
          } catch (error) { fail(error); }
        }
      }
    });
    channel.open();

    async function maybeComplete(activeStream) {
      if (finished || !peerVerification || !remoteAcknowledgement) return;
      const leakCheck = assertGatePassLeakFree({ ownHello, localDecision, remoteAcknowledgement, card: { globalCardId: cardPacket.globalCardId, revision: cardPacket.revision, packetDigest: cardPacket.packetDigest } }, [secret, parsedGatePass.gate.rendezvousTopic, parsedGatePass.gate.stargateAddress, command.gatePassToken]);
      if (!leakCheck.passed) return fail(new Error("Gate Pass handshake leak check failed"));
      finished = true;
      const result = {
        schemaVersion: "hapa.stargate-gate-pass-worker-result.v1",
        peer: peerVerification.peer,
        checks: { ...peerVerification.checks, contextCard: Object.values(cardPacket.checks).every(Boolean) },
        forbiddenFields: peerVerification.forbiddenFields,
        localDecision,
        remoteAcknowledgement,
        card: { globalCardId: cardPacket.globalCardId, revision: cardPacket.revision, packetDigest: cardPacket.packetDigest, receivedDurably: command.discoveryRole === "client" },
        connectionCount,
        hyperswarmConnectionObserved: true,
        noiseEncryptedStreamObserved: Boolean(activeStream?.noiseStream || activeStream?.handshakeHash || activeStream?.remotePublicKey),
        ephemeralLoopbackDhtBootstrap: true,
        applicationSignatureVerified: true,
        handshakeLeakCheck: leakCheck
      };
      await cleanup();
      send({ type: "completed", result });
      setTimeout(() => process.exit(0), 20).unref();
    }
  });
  swarm.on("error", fail);
  if (!["server", "client"].includes(command.discoveryRole)) throw new Error("Worker requires a bounded discovery role");
  const discovery = swarm.join(topic, { server: command.discoveryRole === "server", client: command.discoveryRole === "client" });
  await discovery.flushed();
  send({ type: "joined", topicWithheld: true, discoveryRole: command.discoveryRole });
}

process.on("message", async (command) => {
  try {
    if (command.type === "create_gate_pass") {
      const created = createGatePass({ identity, ...command.input });
      return send({ type: "gate_pass_created", gatePassToken: created.gatePassToken, safeSummary: created.safeSummary });
    }
    if (command.type === "connect") return await connect(command);
    if (command.type === "shutdown") {
      finished = true;
      await cleanup();
      process.exit(0);
    }
    throw new Error("Unsupported worker command");
  } catch (error) { await fail(error); }
});

process.on("disconnect", async () => { await cleanup(); process.exit(0); });
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

identity = await openGatePassIdentity(profileRoot, { displayLabel });
send({ type: "ready", identity: publicGatePassIdentity(identity) });
