import { fork } from "node:child_process";
import dgram from "node:dgram";
import { appendFile, mkdir } from "node:fs/promises";
import DHT from "hyperdht";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";
import { CARD_ORIGIN_ANNOUNCEMENT_PROOF_SCHEMA, verifyCardOriginAnnouncement } from "./card-origin-announcement-protocol.mjs";

const WORKER_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "card-origin-announcement-peer-worker.mjs");
export const CARD_ORIGIN_PEER_WORKER_ENV = "HAPA_CARD_ORIGIN_PEER_WORKER";
const debug = (...values) => { if (process.env.HAPA_DEBUG_ORIGIN_ANNOUNCEMENT === "1") console.error("[origin-announcement]", ...values); };

export function cardOriginAnnouncementWorkerForkOptions({ env = process.env } = {}) {
  const visible = env.HAPA_DEBUG_ORIGIN_ANNOUNCEMENT === "1" ? "inherit" : "ignore";
  return {
    stdio: ["ignore", visible, visible, "ipc"],
    serialization: "advanced",
    // A fork inherits process.execArgv by default. Inheriting `-e`/`--eval`
    // makes the child execute the parent's inline program instead of WORKER_PATH.
    execArgv: [],
    env: { ...env, [CARD_ORIGIN_PEER_WORKER_ENV]: "1" }
  };
}

export function assertCardOriginProofProcessBoundary({ env = process.env } = {}) {
  if (env[CARD_ORIGIN_PEER_WORKER_ENV] !== "1") return;
  throw Object.assign(new Error("A Card origin peer worker cannot start another origin-announcement proof"), {
    code: "card_origin_announcement_recursive_worker"
  });
}

function child(profileRoot, label) {
  return fork(WORKER_PATH, ["--profile-root", profileRoot, "--label", label], cardOriginAnnouncementWorkerForkOptions());
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

function childExited(childProcess) {
  return childProcess.exitCode !== null || childProcess.signalCode !== null;
}

async function waitForChildExit(childProcess, timeoutMs) {
  if (childExited(childProcess)) return true;
  return await new Promise((resolve) => {
    const onExit = () => done(true);
    const timer = setTimeout(() => done(false), timeoutMs);
    function done(exited) {
      clearTimeout(timer);
      childProcess.off("exit", onExit);
      resolve(exited);
    }
    childProcess.once("exit", onExit);
  });
}

async function stopChild(childProcess) {
  if (!childProcess || childExited(childProcess)) return true;
  if (childProcess.connected) {
    try { childProcess.send({ type: "shutdown" }); } catch {}
  }
  if (await waitForChildExit(childProcess, 1_500)) return true;
  try { childProcess.kill("SIGTERM"); } catch {}
  if (await waitForChildExit(childProcess, 1_500)) return true;
  try { childProcess.kill("SIGKILL"); } catch {}
  return await waitForChildExit(childProcess, 1_500);
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
  assertCardOriginProofProcessBoundary();
  const proofRoot = path.join(path.resolve(profileRoot), `origin-announcement-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  let peerA;
  let peerB;
  let bootstrapNode;
  try {
    peerA = child(path.join(proofRoot, "peer-a"), "Mint Gate Origin");
    peerB = child(path.join(proofRoot, "peer-b"), "Receiving Hapa Node");
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
    const stopped = await Promise.all([stopChild(peerA), stopChild(peerB)]);
    debug("children-stopped", stopped);
    if (bootstrapNode) await bootstrapNode.dht.destroy({ force: true }).catch(() => {});
    debug("cleanup-complete");
  }
}
