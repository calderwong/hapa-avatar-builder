import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  assertGatePassLeakFree,
  buildContextCardHandoff,
  createGatePass,
  createGatePassHello,
  openGatePassIdentity,
  parseGatePass,
  selectGatePassDecision,
  verifyContextCardHandoff,
  verifyGatePassHello
} from "../server/stargate-gate-pass-protocol.mjs";
import { canonicalJson } from "../server/stargate-p2p-canonical.mjs";
import { gatePassFixture } from "./stargate-gate-pass-fixture.mjs";

test("a fresh signed Pass binds one exact Context Card revision and unchanged committed Gate", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hapa-pass-protocol-"));
  try {
    const fixture = gatePassFixture();
    const issuer = await openGatePassIdentity(path.join(root, "issuer"), { displayLabel: "Aurora" });
    const receiver = await openGatePassIdentity(path.join(root, "receiver"), { displayLabel: "Beacon" });
    const packet = buildContextCardHandoff(fixture);
    const created = createGatePass({ identity: issuer, contextCardPacket: packet, cohortSecretBase64Url: fixture.cohortSecretBase64Url });
    const parsed = parseGatePass(created.gatePassToken);
    const received = verifyContextCardHandoff(packet, parsed);
    assert.equal(received.checks.gateCommitment, true);
    assert.equal(parsed.safeSummary.gateCommitment, fixture.card.stargateContext.gate.gateCommitment);
    assert.equal(parsed.safeSummary.sourceCardId, fixture.globalCardId);
    assert.equal(parsed.safeSummary.sourceRevision, 1);
    const hello = createGatePassHello({ identity: receiver, parsedGatePass: parsed });
    const verified = verifyGatePassHello(hello, { parsedGatePass: parsed });
    assert.equal(verified.matched, true);
    assert.equal(selectGatePassDecision({ verification: verified, localConsent: true, peerNodeId: receiver.nodeId }).decision, "accepted");
    assert.equal(selectGatePassDecision({ verification: verified, localConsent: false, peerNodeId: receiver.nodeId }).decision, "declined");
    assert.deepEqual(assertGatePassLeakFree({ hello, safe: created.safeSummary }, [fixture.cohortSecretBase64Url, parsed.gate.rendezvousTopic, parsed.gate.stargateAddress, created.gatePassToken]), {
      passed: true,
      forbiddenFields: [],
      leakedSecretCount: 0
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("wrong issuer capability, expiry, tampering, and revision drift fail closed", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hapa-pass-negative-"));
  try {
    const fixture = gatePassFixture();
    const identity = await openGatePassIdentity(root, { displayLabel: "Aurora" });
    const packet = buildContextCardHandoff(fixture);
    assert.throws(() => createGatePass({ identity, contextCardPacket: packet }), (error) => error.code === "gate_pass_live_issuer_required");
    assert.throws(() => createGatePass({ identity, contextCardPacket: packet, cohortSecretBase64Url: Buffer.alloc(32, 77).toString("base64url") }), (error) => error.code === "gate_pass_issuer_gate_mismatch");
    const created = createGatePass({ identity, contextCardPacket: packet, cohortSecretBase64Url: fixture.cohortSecretBase64Url, now: 1_700_000_000_000, ttlMs: 50 });
    assert.throws(() => parseGatePass(created.gatePassToken, { now: 1_700_000_000_100 }), (error) => error.code === "gate_pass_expired");
    const envelope = JSON.parse(Buffer.from(created.gatePassToken, "base64url").toString("utf8"));
    envelope.signature = `${envelope.signature.startsWith("A") ? "B" : "A"}${envelope.signature.slice(1)}`;
    assert.throws(() => parseGatePass(Buffer.from(canonicalJson(envelope)).toString("base64url"), { now: 1_700_000_000_010 }), (error) => error.code === "gate_pass_signature_failed");
    const parsed = parseGatePass(created.gatePassToken, { now: 1_700_000_000_010 });
    assert.throws(() => verifyContextCardHandoff({ ...packet, revision: 2 }, parsed), (error) => error.code === "gate_pass_context_mismatch");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
