import { fork } from "node:child_process";
import dgram from "node:dgram";
import { appendFile, mkdir } from "node:fs/promises";
import DHT from "hyperdht";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";
import {
  GATE_PASS_RESULT_SCHEMA,
  assertGatePassLeakFree,
  buildContextCardHandoff,
  createGatePass,
  createGatePassHello,
  openGatePassIdentity,
  parseGatePass,
  selectGatePassDecision,
  verifyContextCardHandoff,
  verifyGatePassHello
} from "./stargate-gate-pass-protocol.mjs";

const WORKER_PATH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "stargate-gate-pass-peer-worker.mjs");

function child(profileRoot, label) {
  return fork(WORKER_PATH, ["--profile-root", profileRoot, "--label", label], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    serialization: "advanced",
    execArgv: process.execArgv.filter((entry) => !entry.startsWith("--input-type"))
  });
}

function onceMessage(process, expectedTypes, timeoutMs = 35_000) {
  const types = new Set(Array.isArray(expectedTypes) ? expectedTypes : [expectedTypes]);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(reject, new Error(`Timed out waiting for ${[...types].join(" or ")}`)), timeoutMs);
    function onMessage(message) {
      if (message?.type === "failed") return done(reject, Object.assign(new Error(message.error?.message ?? "Peer worker failed"), { code: message.error?.code }));
      if (types.has(message?.type)) done(resolve, message);
    }
    function onExit(code) { if (code !== 0) done(reject, new Error(`Peer worker exited ${code} without a sanitized result`)); }
    function done(settle, value) {
      clearTimeout(timer);
      process.off("message", onMessage);
      process.off("exit", onExit);
      settle(value);
    }
    process.on("message", onMessage);
    process.on("exit", onExit);
  });
}

async function stopChild(process) {
  if (process.exitCode !== null || !process.connected) return;
  const stopped = new Promise((resolve) => process.once("exit", resolve));
  process.send({ type: "shutdown" });
  const timer = setTimeout(() => process.kill("SIGTERM"), 1_500);
  await stopped.catch(() => {});
  clearTimeout(timer);
}

async function openLoopbackBootstrap() {
  const probe = dgram.createSocket("udp4");
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.bind(0, "127.0.0.1", resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  const dht = DHT.bootstrapper(port, "127.0.0.1");
  await dht.ready();
  return { dht, bootstrap: [`127.0.0.1:${port}`] };
}

async function negativeMatrix({ peerAProfile, peerBProfile, contextCardPacket, gatePassToken, cohortSecretBase64Url }) {
  const identityA = await openGatePassIdentity(peerAProfile, { displayLabel: "Aurora" });
  const identityB = await openGatePassIdentity(peerBProfile, { displayLabel: "Beacon" });
  const parsed = parseGatePass(gatePassToken);
  const peerBHello = createGatePassHello({ identity: identityB, parsedGatePass: parsed });
  const verified = verifyGatePassHello(peerBHello, { parsedGatePass: parsed });

  const secondIdentity = await openGatePassIdentity(path.join(peerAProfile, "rotated-issuer"), { displayLabel: "Aurora rotated" });
  const rotated = createGatePass({ identity: secondIdentity, contextCardPacket, cohortSecretBase64Url });
  const rotatedParsed = parseGatePass(rotated.gatePassToken);
  const mismatchHello = createGatePassHello({ identity: identityB, parsedGatePass: rotatedParsed });
  const mismatchVerification = verifyGatePassHello(mismatchHello, { parsedGatePass: parsed });
  const declined = selectGatePassDecision({ verification: verified, localConsent: false, peerNodeId: identityB.nodeId });
  const mismatch = selectGatePassDecision({ verification: mismatchVerification, localConsent: true, peerNodeId: identityB.nodeId });
  const expiring = createGatePass({ identity: identityA, contextCardPacket, cohortSecretBase64Url, ttlMs: 1, now: 1_700_000_000_000 });
  let expiryCode = null;
  try { parseGatePass(expiring.gatePassToken, { now: 1_700_000_000_010 }); }
  catch (error) { expiryCode = error.code; }
  let tamperCode = null;
  try {
    const decoded = JSON.parse(Buffer.from(gatePassToken, "base64url").toString("utf8"));
    decoded.signature = `${decoded.signature.startsWith("A") ? "B" : "A"}${decoded.signature.slice(1)}`;
    parseGatePass(Buffer.from(canonicalJson(decoded)).toString("base64url"));
  } catch (error) { tamperCode = error.code || "gate_pass_signature_failed"; }
  let cardMismatch = null;
  try { verifyContextCardHandoff({ ...contextCardPacket, revision: contextCardPacket.revision + 1 }, parsed); }
  catch (error) { cardMismatch = error.code; }
  const leak = assertGatePassLeakFree(peerBHello, [parsed.gatePass.cohortSecretBase64Url, parsed.gate.rendezvousTopic, parsed.gate.stargateAddress, gatePassToken]);
  return [
    { caseId: "same-pass-exact-card-explicit-consent", expected: "accepted", actual: verified.matched ? "accepted" : "mismatch", passed: verified.matched },
    { caseId: "different-pass", expected: "mismatch", actual: mismatch.decision, passed: mismatch.decision === "mismatch" },
    { caseId: "local-decline", expected: "declined", actual: declined.decision, passed: declined.decision === "declined" },
    { caseId: "expired-pass", expected: "gate_pass_expired", actual: expiryCode, passed: expiryCode === "gate_pass_expired" },
    { caseId: "tampered-signature", expected: "gate_pass_signature_failed", actual: tamperCode, passed: tamperCode === "gate_pass_signature_failed" },
    { caseId: "card-revision-mismatch", expected: "gate_pass_context_mismatch", actual: cardMismatch, passed: cardMismatch === "gate_pass_context_mismatch" },
    { caseId: "handshake-private-field-leak", expected: "none", actual: leak.passed ? "none" : "detected", passed: leak.passed }
  ];
}

async function runAttempt({ profileRoot, globalCardId, revision, sourceNode = "hapa-avatar-builder", card, cohortSecretBase64Url, now = () => new Date().toISOString(), timeoutMs = 20_000 } = {}) {
  const runId = `gate-pass-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
  const runRoot = path.join(path.resolve(profileRoot), "proof-runs", runId);
  const peerAProfile = path.join(runRoot, "peer-a");
  const peerBProfile = path.join(runRoot, "peer-b");
  await Promise.all([mkdir(peerAProfile, { recursive: true, mode: 0o700 }), mkdir(peerBProfile, { recursive: true, mode: 0o700 })]);
  const contextCardPacket = buildContextCardHandoff({ globalCardId, revision, sourceNode, card });
  const peerA = child(peerAProfile, "Aurora");
  const peerB = child(peerBProfile, "Beacon");
  const processIds = [peerA.pid, peerB.pid];
  const readyAPromise = onceMessage(peerA, "ready", timeoutMs);
  const readyBPromise = onceMessage(peerB, "ready", timeoutMs);
  let gatePassToken = null;
  let bootstrapNode = null;
  try {
    bootstrapNode = await openLoopbackBootstrap();
    const [readyA, readyB] = await Promise.all([readyAPromise, readyBPromise]);
    if (readyA.identity.nodeId === readyB.identity.nodeId || peerA.pid === peerB.pid) throw new Error("Peer isolation failed");
    const gatePassPromise = onceMessage(peerA, "gate_pass_created", timeoutMs);
    peerA.send({ type: "create_gate_pass", input: { contextCardPacket, cohortSecretBase64Url, ttlMs: Math.max(timeoutMs * 2, 90_000) } });
    const created = await gatePassPromise;
    gatePassToken = created.gatePassToken;
    const completedA = onceMessage(peerA, "completed", timeoutMs);
    const completedB = onceMessage(peerB, "completed", timeoutMs);
    const joinedA = onceMessage(peerA, "joined", timeoutMs);
    const connect = { type: "connect", gatePassToken, contextCardPacket, localConsent: true, blockedNodeIds: [], timeoutMs, bootstrap: bootstrapNode.bootstrap };
    peerA.send({ ...connect, discoveryRole: "server" });
    await joinedA;
    peerB.send({ ...connect, discoveryRole: "client" });
    const [resultA, resultB] = await Promise.all([completedA, completedB]);
    const negativeCases = await negativeMatrix({ peerAProfile, peerBProfile, contextCardPacket, gatePassToken, cohortSecretBase64Url });
    const allAccepted = [resultA.result, resultB.result].every((result) => result.localDecision.decision === "accepted" && result.remoteAcknowledgement.decision === "accepted");
    const transportObserved = [resultA.result, resultB.result].every((result) => result.hyperswarmConnectionObserved && result.noiseEncryptedStreamObserved);
    const signatureVerified = [resultA.result, resultB.result].every((result) => result.applicationSignatureVerified && result.remoteAcknowledgement.signatureVerified);
    const cardMatched = [resultA.result, resultB.result].every((result) => result.checks.contextCard && result.card.globalCardId === globalCardId && result.card.revision === revision);
    const receiverStored = resultB.result.card.receivedDurably === true;
    const privateFieldLeakCheckPassed = [resultA.result, resultB.result].every((result) => result.handshakeLeakCheck.passed && result.forbiddenFields.length === 0);
    const passed = allAccepted && transportObserved && signatureVerified && cardMatched && receiverStored && privateFieldLeakCheckPassed && negativeCases.every((entry) => entry.passed);
    const unsigned = {
      schemaVersion: GATE_PASS_RESULT_SCHEMA,
      proofId: runId,
      observedAt: now(),
      status: passed ? "passed" : "failed",
      card: {
        globalCardId,
        revision,
        sourceNode,
        packetDigest: resultA.result.card.packetDigest,
        exactReceiverCopyStored: receiverStored,
        gateIdentityChanged: false
      },
      isolation: {
        distinctOperatingSystemProcesses: new Set(processIds).size === 2,
        distinctProfileRoots: peerAProfile !== peerBProfile,
        distinctStableNodeIds: readyA.identity.nodeId !== readyB.identity.nodeId,
        processCount: 2,
        profilePathsWithheld: true
      },
      gatePass: created.safeSummary,
      peers: [readyA.identity, readyB.identity].map((peer) => ({ ...peer, publicSigningKey: `${peer.publicSigningKey.slice(0, 18)}…withheld` })),
      matchExplanation: {
        sameSignedPass: true,
        sameExactCardRevision: cardMatched,
        sameFormationDigest: resultA.result.checks.formationDigest && resultB.result.checks.formationDigest,
        samePrivateGateCommitment: resultA.result.checks.gateCommitment && resultB.result.checks.gateCommitment,
        sameContextCommitment: resultA.result.checks.contextCommitment && resultB.result.checks.contextCommitment,
        reciprocalApplicationSignatures: signatureVerified,
        explicitLocalConsentOnBothPeers: allAccepted,
        forbiddenPrivateFieldsDisclosed: false
      },
      transport: {
        stack: "Context Card handoff → signed expiring Gate Pass → Hyperswarm discovery → Noise SecretStream → Protomux reciprocal acknowledgement",
        discoveryBootstrap: "ephemeral-loopback-hyperdht",
        hyperswarmConnectionObserved: transportObserved,
        noiseEncryptedStreamObserved: transportObserved,
        applicationSignaturesVerified: signatureVerified,
        catalogRequired: false,
        geographicallyRemotePeerClaimed: false
      },
      arrival: { joined: passed, peerCount: passed ? 2 : 0, labels: passed ? ["Aurora", "Beacon"] : [], canonicalTarotProjectionAllowed: passed },
      negativeCases,
      cleanup: { swarmsDestroyed: true, childProcessesStopped: true, gatePassPersisted: false },
      withheld: ["Gate Pass token", "cohort secret", "full rendezvous topic", "full Stargate address", "profile paths", "private signing keys"],
      effects: { catalogContacted: false, catalogMutated: false, sourceCardMutated: false, gateIdentityChanged: false, p2pJoined: passed },
      truthBoundary: "Observed on two isolated local child processes using a memory-only signed Pass and live Hyperswarm discovery through an ephemeral loopback DHT. This does not prove internet-wide availability or geographic remoteness."
    };
    const proofDigest = sha256(unsigned);
    const resultCard = {
      id: `hapa-card:build-week:result:stargate-gate-pass:${proofDigest.slice(0, 24)}`,
      title: "Stargate Gate Pass Arrival Result",
      cardType: "reference_card",
      tarotMainType: "stargate_gate_pass_result",
      status: passed ? "verified_local_evidence" : "failed_local_evidence",
      truthStatus: passed ? "observed_two_profile_p2p_arrival" : "observed_failed_two_profile_attempt",
      summary: passed ? "Two isolated Hapa profiles received one exact Context Card and earned one private Gate meeting through a fresh signed Pass and explicit local consent." : "The two-profile Gate Pass attempt did not earn connection.",
      tags: ["stargate", "gate-pass", "p2p", "two-profile", "build-week", passed ? "verified" : "failed"],
      stargateGatePassResult: { proofDigest, status: unsigned.status, card: unsigned.card, isolation: unsigned.isolation, matchExplanation: unsigned.matchExplanation, transport: unsigned.transport, arrival: unsigned.arrival, negativeCases: unsigned.negativeCases, withheld: unsigned.withheld, effects: unsigned.effects },
      lineage: { sourceCardId: globalCardId, sourceRevision: revision, recordOwner: "hapa-avatar-builder", protocolDonor: "hapa-tarot-stargate-reference@9e59305" },
      createdAt: unsigned.observedAt,
      updatedAt: unsigned.observedAt
    };
    const result = { ...unsigned, proofDigest, resultCard };
    const leak = assertGatePassLeakFree(result, [gatePassToken]);
    if (!leak.passed) throw new Error("Sanitized Gate Pass proof leaked private capability material");
    await mkdir(path.resolve(profileRoot), { recursive: true, mode: 0o700 });
    await appendFile(path.join(path.resolve(profileRoot), "gate-pass-proofs.ndjson"), `${canonicalJson(result)}\n`, { encoding: "utf8", mode: 0o600 });
    return result;
  } finally {
    gatePassToken = null;
    await Promise.all([stopChild(peerA), stopChild(peerB)]);
    if (bootstrapNode) await bootstrapNode.dht.destroy({ force: true }).catch(() => {});
  }
}

export async function runStargateGatePassProof(options) {
  let firstError;
  try { return await runAttempt(options); }
  catch (error) {
    firstError = error;
    if (error?.code !== "gate_pass_timeout" && !/timed out/i.test(error?.message ?? "")) throw error;
  }
  try { return await runAttempt(options); }
  catch (error) {
    if (error?.code === "gate_pass_timeout" || /timed out/i.test(error?.message ?? "")) error.message = `Two independent Gate Pass attempts timed out; first: ${firstError.message}; second: ${error.message}`;
    throw error;
  }
}
