import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createEchoRecordGardenVerificationLedger } from "../scripts/refresh-echo-record-garden-verification.mjs";

const REVISION = "a".repeat(40);

function sha(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

function fixture({ offlineHead = "b".repeat(40) } = {}) {
  const componentBytes = Buffer.from("current-record-garden-component");
  const componentSha = sha(componentBytes);
  const deliveryReceipt = {
    schemaVersion: "hapa.echo.delivery-build-receipt.v1",
    contractVersion: "echo-delivery-static-import-graph-v3",
    sourceSha256: `sha256:${"1".repeat(64)}`,
    servedBundleSha256: `sha256:${"2".repeat(64)}`,
    buildToolSha256: `sha256:${"3".repeat(64)}`,
    semanticSha256: `sha256:${"4".repeat(64)}`,
    generatedAt: "2026-08-01T22:44:21.792Z",
  };
  const offlineReceipt = {
    ok: true,
    generatedAt: "2026-08-01T22:45:00.000Z",
    scope: "pure-node-static-and-domain-runtime-contract",
    truthBoundary: "Offline checks are not browser evidence.",
    source: { head: offlineHead },
    checks: [{
      id: "fixture-media.generated-offline",
      required: true,
      status: "passed",
      evidence: { manifestDigest: "5".repeat(64) },
    }],
  };
  return {
    componentBytes,
    component: { path: "dist/assets/EchoRecordGarden3DView-current.js", sha256: componentSha },
    deliveryReceipt,
    deliveryReceiptBytes: Buffer.from(`${JSON.stringify(deliveryReceipt)}\n`),
    offlineReceipt,
    offlineReceiptBytes: Buffer.from(`${JSON.stringify(offlineReceipt)}\n`),
    identity: { buildReceipt: { ...deliveryReceipt } },
  };
}

test("refresh binds one cinematic screen and the record face to the exact delivery without carrying stale claims", () => {
  const inputs = fixture();
  const ledger = createEchoRecordGardenVerificationLedger({
    previous: {
      playback: { physicalScreens: 3, warmMediaPoolLimit: 7 },
      focusedTests: { status: "passed", tests: 139, passed: 139 },
      broadRepositorySuite: { status: "passed", blanketCurrentRevisionGreenClaimed: true },
      liveService: { status: "healthy-current-source", pid: 35888, acceptanceContextStatus: 200 },
      mediaStabilization: { repairs: [
        "Project the current cue across the default display triptych.",
        "Project the exact current Director composite onto one large horizontal screen and the same physical record face.",
        "Project the exact current Director composite onto one large horizontal screen and the same physical record face.",
      ] },
    },
    root: "/fixture/hapa-avatar-builder",
    implementationRevision: REVISION,
    workingTreeChangeCount: 4,
    ...inputs,
    generatedAt: "2026-08-01T23:00:00.000Z",
  });

  assert.equal(ledger.schemaVersion, "hapa.echo-record-garden.verification.v6");
  assert.equal(ledger.source.canonicalImplementationRevision, REVISION);
  assert.equal(ledger.source.workingTreeClean, false);
  assert.equal(ledger.playback.physicalScreens, 1);
  assert.equal(ledger.playback.visibleMediaSlots, 1);
  assert.equal(ledger.playback.dedicatedRecordFaceMediaSlots, 1);
  assert.equal(ledger.playback.warmMediaPoolLimit, 14);
  assert.deepEqual(ledger.playback.presentationSurfaces, ["screen-1", "record-face"]);
  assert.equal(ledger.productionBuild.recordGardenChunk.file, inputs.component.path);
  assert.equal(ledger.productionBuild.recordGardenChunk.sha256, inputs.component.sha256.slice(7));
  assert.equal(ledger.productionBuild.deliveryReceipt.semanticSha256, inputs.deliveryReceipt.semanticSha256);
  assert.equal(ledger.runtimeEvidence.manualAcceptance, "pending");
  assert.equal(ledger.focusedTests.status, "current-implementation-revision-run-not-recorded");
  assert.equal("tests" in ledger.focusedTests, false);
  assert.equal(ledger.broadRepositorySuite.blanketCurrentRevisionGreenClaimed, false);
  assert.equal("currentRevisionRun" in ledger.broadRepositorySuite, false);
  assert.equal(ledger.liveService.status, "not-observed-by-verification-refresh");
  assert.equal(ledger.liveService.pid, null);
  assert.equal(ledger.liveService.acceptanceContextStatus, null);
  assert.equal(ledger.offlineAcceptance.status, "current-implementation-revision-run-not-recorded");
  assert.equal(ledger.board.fullyDrained, false);
  assert.ok(ledger.mediaStabilization.repairs.every((entry) => !/triptych/iu.test(entry)));
  assert.equal(
    ledger.mediaStabilization.repairs.filter((entry) => /exact current Director composite/iu.test(entry)).length,
    1,
  );
});

test("refresh accepts an offline receipt only when it is bound to the exact implementation revision", () => {
  const inputs = fixture({ offlineHead: REVISION });
  const ledger = createEchoRecordGardenVerificationLedger({
    previous: {},
    root: "/fixture/hapa-avatar-builder",
    implementationRevision: REVISION,
    workingTreeChangeCount: 0,
    ...inputs,
  });
  assert.equal(ledger.offlineAcceptance.status, "passed-current-implementation-revision");
  assert.equal(ledger.offlineAcceptance.boundHead, REVISION);
  assert.equal(ledger.offlineAcceptance.passed, 1);
  assert.match(ledger.offlineAcceptance.receiptSha256, /^[a-f0-9]{64}$/u);
});

test("refresh script inspects the strict current build identity and never probes live service health", async () => {
  const source = await readFile(new URL("../scripts/refresh-echo-record-garden-verification.mjs", import.meta.url), "utf8");
  assert.match(source, /inspectEchoDeliveryRuntimeBuildIdentity\(\{ root: resolvedRoot, strict: true, refresh: true \}\)/u);
  assert.match(source, /git[\s\S]*rev-parse[\s\S]*HEAD\^\{commit\}/u);
  assert.match(source, /status: "not-observed-by-verification-refresh"/u);
  assert.doesNotMatch(source, /fetch\(|http\.request|https\.request/u);
});
