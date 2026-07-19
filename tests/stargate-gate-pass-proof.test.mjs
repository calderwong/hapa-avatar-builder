import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { runStargateGatePassProof } from "../server/stargate-gate-pass-proof.mjs";
import { gatePassFixture } from "./stargate-gate-pass-fixture.mjs";

test("two isolated profiles exchange one exact Card over a signed consented Gate Pass", { timeout: 45_000 }, async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "hapa-pass-proof-"));
  try {
    const fixture = gatePassFixture();
    const result = await runStargateGatePassProof({ profileRoot: root, ...fixture, timeoutMs: 18_000 });
    assert.equal(result.status, "passed");
    assert.equal(result.arrival.joined, true);
    assert.equal(result.arrival.peerCount, 2);
    assert.equal(result.isolation.distinctOperatingSystemProcesses, true);
    assert.equal(result.isolation.distinctProfileRoots, true);
    assert.equal(result.isolation.distinctStableNodeIds, true);
    assert.equal(result.card.globalCardId, fixture.globalCardId);
    assert.equal(result.card.revision, 1);
    assert.equal(result.card.exactReceiverCopyStored, true);
    assert.equal(result.card.gateIdentityChanged, false);
    assert.equal(result.matchExplanation.explicitLocalConsentOnBothPeers, true);
    assert.equal(result.transport.hyperswarmConnectionObserved, true);
    assert.equal(result.transport.noiseEncryptedStreamObserved, true);
    assert.equal(result.transport.catalogRequired, false);
    assert.equal(result.negativeCases.length, 7);
    assert.equal(result.negativeCases.every((entry) => entry.passed), true);
    assert.equal(result.effects.catalogContacted, false);
    assert.equal(result.effects.gateIdentityChanged, false);
    assert.equal(result.resultCard.stargateGatePassResult.arrival.peerCount, 2);
    assert.equal(existsSync(path.join(root, "gate-pass-proofs.ndjson")), true);
    const persisted = readFileSync(path.join(root, "gate-pass-proofs.ndjson"), "utf8");
    assert.equal(persisted.includes(fixture.cohortSecretBase64Url), false);
    assert.equal(persisted.includes(fixture.stargate.rendezvousTopic), false);
    assert.equal(persisted.includes(fixture.stargate.stargateAddress), false);
    assert.equal(persisted.includes(root), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
