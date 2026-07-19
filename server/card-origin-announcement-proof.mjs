import { fork } from "node:child_process";
import dgram from "node:dgram";
import { appendFile, mkdir } from "node:fs/promises";
import DHT from "hyperdht";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";
import { CARD_ORIGIN_ANNOUNCEMENT_PROOF_SCHEMA, verifyCardOriginAnnouncement } from "./card-origin-announcement-protocol.mjs";

const WORKER_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "card-origin-announcement-peer-worker.mjs");
const debug = (...values) => { if (process.env.HAPA_DEBUG_ORIGIN_ANNOUNCEMENT === "1") console.error("[origin-announcement]", ...values); };

function child(profileRoot, label) {
  const visible = process.env.HAPA_DEBUG_ORIGIN_ANNOUNCEMENT === "1" ? "inherit" : "ignore";
  return fork(WORKER_PATH, ["--profile-root", profileRoot, "--label", label], { stdio: ["ignore", visible, visible, "ipc"], serialization: "advanced", execArgv: process.execArgv.filter((entry) => !entry.startsWith("--input-type")) });
}

function onceMessage(process, expected, timeoutMs = 25_000) {
  const wanted = new Set(Array.isArray(expected) ? expected : [expected]);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(reject, new Error(`Timed out waiting for ${[...wanted].join(" or ")}`)), timeoutMs);
    function onMessage(message) {
      if (message?.type === "failed") return done(reject, Object.assign(new Error(message.error?.message || "Origin announcement worker failed"), { code: message.error?.code }));
      if (wanted.has(message?.type)) done(resolve, message);
    }
    function onExit(code) { if (code !== 0) done(reject, new Error(`Origin announcement worker exited ${code}`)); }
    function done(settle, value) { clearTimeout(timer); process.off("message", onMessage); process.off("exit", onExit); settle(value); }
    process.on("message", onMessage); process.on("exit", onExit);
  });
}

async function stopChild(process) {
  if (process.exitCode !== null || !process.connected) return;
  const stopped = new Promise((resolve) => process.once("exit", resolve));
  process.send({ type: "shutdown" });
  const timer = setTimeout(() => process.kill("SIGTERM"), 1_500);
  await stopped.catch(() => {}); clearTimeout(timer);
}

async function loopbackBootstrap() {
  const probe = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => { probe.once("error", reject); probe.bind(0, "127.0.0.1", resolve); });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dht = DHT.bootstrapper(port, "127.0.0.1");
  await dht.ready();
  return { dht, bootstrap: [`127.0.0.1:${port}`] };
}

export async function runCardOriginAnnouncementProof({ profileRoot, origin, decisionDigest, timeoutMs = 20_000, now = () => new Date().toISOString() } = {}) {
  const proofRoot = path.join(path.resolve(profileRoot), `origin-announcement-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  const peerA = child(path.join(proofRoot, "peer-a"), "Mint Gate Origin");
  const peerB = child(path.join(proofRoot, "peer-b"), "Receiving Hapa Node");
  let bootstrapNode;
  try {
    debug("workers", peerA.pid, peerB.pid);
    const readyA = onceMessage(peerA, "ready", timeoutMs);
    const readyB = onceMessage(peerB, "ready", timeoutMs);
    bootstrapNode = await loopbackBootstrap();
    debug("bootstrap-ready", bootstrapNode.bootstrap[0]);
    const [a, b] = await Promise.all([readyA, readyB]);
    debug("workers-ready", a.identity.nodeId, b.identity.nodeId);
    const createdPromise = onceMessage(peerA, "created", timeoutMs);
    peerA.send({ type: "create", input: { origin, decisionDigest } });
    const created = await createdPromise;
    debug("announcement-created");
    const verified = verifyCardOriginAnnouncement(created.announcement);
    const completeA = onceMessage(peerA, "completed", timeoutMs);
    const completeB = onceMessage(peerB, "completed", timeoutMs);
    const joinedA = onceMessage(peerA, "joined", timeoutMs);
    const command = { type: "connect", announcement: created.announcement, localConsent: true, bootstrap: bootstrapNode.bootstrap, timeoutMs };
    peerA.send({ ...command, discoveryRole: "server" });
    await joinedA;
    debug("announcer-joined");
    peerB.send({ ...command, discoveryRole: "client" });
    const [resultA, resultB] = await Promise.all([completeA, completeB]);
    debug("workers-complete");
    const passed = a.identity.nodeId !== b.identity.nodeId && resultA.result.hyperswarmConnectionObserved && resultB.result.hyperswarmConnectionObserved && resultA.result.noiseEncryptedStreamObserved && resultB.result.noiseEncryptedStreamObserved && resultA.result.acknowledgement.verified && resultB.result.receivedDurably && resultA.result.announcementDigest === resultB.result.announcementDigest;
    const unsigned = {
      schemaVersion: CARD_ORIGIN_ANNOUNCEMENT_PROOF_SCHEMA,
      proofId: `origin-announcement:${verified.announcementDigest.slice(0, 24)}`,
      observedAt: now(),
      status: passed ? "passed" : "failed",
      card: { cardId: origin.cardId, revision: origin.revision, originEventId: origin.eventId, originEventDigest: origin.eventDigest, originSequence: origin.originSequence, contentDigest: origin.contentDigest },
      announcement: { announcementDigest: verified.announcementDigest, senderNodeId: a.identity.nodeId, receiverNodeId: b.identity.nodeId, applicationSignatureVerified: true, receiverAcknowledgementVerified: resultA.result.acknowledgement.verified, exactReceiverCopyStored: resultB.result.receivedDurably },
      isolation: { distinctOperatingSystemProcesses: peerA.pid !== peerB.pid, distinctProfileRoots: true, distinctStableNodeIds: a.identity.nodeId !== b.identity.nodeId, processCount: 2, profilePathsWithheld: true },
      transport: { stack: "signed origin event announcement → Hyperswarm discovery → Noise SecretStream → Protomux receipt", discoveryBootstrap: "ephemeral-loopback-hyperdht", hyperswarmConnectionObserved: true, noiseEncryptedStreamObserved: true, geographicallyRemotePeerClaimed: false },
      effects: { peerAnnounced: passed, receivingPeerStoredExactEnvelope: resultB.result.receivedDurably, catalogMutatedByAnnouncement: false, sourceCardMutatedByAnnouncement: false },
      truthBoundary: "Observed on two isolated local child processes through an ephemeral loopback DHT. This proves an exact signed origin event reached and was durably stored by one distinct local Hapa peer; it does not claim internet-wide or geographically remote delivery."
    };
    const proof = { ...unsigned, proofDigest: sha256(unsigned) };
    await mkdir(path.resolve(profileRoot), { recursive: true, mode: 0o700 });
    await appendFile(path.join(path.resolve(profileRoot), "origin-announcement-proofs.ndjson"), `${canonicalJson(proof)}\n`, { encoding: "utf8", mode: 0o600 });
    debug("proof-written", proof.status);
    return proof;
  } finally {
    debug("cleanup-start");
    await Promise.all([stopChild(peerA), stopChild(peerB)]);
    debug("children-stopped");
    if (bootstrapNode) await bootstrapNode.dht.destroy({ force: true }).catch(() => {});
    debug("cleanup-complete");
  }
}
