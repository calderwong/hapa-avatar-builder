import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  loadSavedMintPlanAudit,
  loadSavedVariantRows,
  parseEchoRenderReadinessArgs,
  safePathSegment,
  snapshotJsonCorpus,
  assertJsonCorpusSnapshotFresh,
  assertRequestedMintPlanIdentity,
  acquireEchoReadinessCertificationLock,
  assertFileSourceProofStatFresh,
  buildExecutionTelemetryEvidence,
  createScopedTelemetryAnalysisCache,
  executionVisualMediaPreflightInputs,
  stableJsonSourceProof,
  visualExecutionInputEvidence,
} from "../scripts/preflight-echo-render-readiness.mjs";
import { validateAudioInputDuration } from "../server/render-audio-input-preflight.mjs";
import { verifyEchoExecutionVisualInputEvidence } from "../server/echo-director-show-graph-loader.mjs";

test("album readiness refuses song IDs that can escape production artifact roots", () => {
  assert.equal(safePathSegment("song:fixture"), "song:fixture");
  assert.equal(safePathSegment("../../outside"), "");
  assert.equal(safePathSegment("nested/song"), "");
  assert.equal(safePathSegment(".."), "");
});

test("readiness selection grammar rejects ambiguous or empty-producing combinations", () => {
  assert.throws(() => parseEchoRenderReadinessArgs(["--plan=plan:abc", "--project=/tmp/project.json"]), /cannot be combined/u);
  assert.throws(() => parseEchoRenderReadinessArgs(["--plan=plan:abc", "--variant=cut-a"]), /cannot be combined/u);
  assert.throws(() => parseEchoRenderReadinessArgs(["--plan=plan:abc", "--skip-mint-plans=true"]), /cannot be combined/u);
  assert.throws(() => parseEchoRenderReadinessArgs(["--variant=cut-a"]), /requires one explicit --project/u);
  assert.throws(() => parseEchoRenderReadinessArgs(["--plan=plan:../../outside"]), /requires a safe plan identity/u);
  assert.throws(() => parseEchoRenderReadinessArgs(["--plan=plan:"]), /requires a safe plan identity/u);
  assert.deepEqual(parseEchoRenderReadinessArgs(["--project=/tmp/project.json", "--variant=cut-a"]), {
    project: "/tmp/project.json",
    variant: "cut-a",
  });
});

test("targeted saved-plan identity binds both declared IDs to the requested cut", () => {
  const planId = "plan:exact";
  assert.equal(assertRequestedMintPlanIdentity({ id: planId, planId }, planId), true);
  assert.equal(assertRequestedMintPlanIdentity({ planId }, planId), true);
  assert.throws(() => assertRequestedMintPlanIdentity({ id: "plan:other", planId }, planId), /identity does not match/u);
  assert.throws(() => assertRequestedMintPlanIdentity({ id: planId, planId: "plan:other" }, planId), /identity does not match/u);
});

test("media-only cuts emit the explicit no-telemetry publication proof", () => {
  const bundleSha256 = `sha256:${"a".repeat(64)}`;
  const proof = buildExecutionTelemetryEvidence({
    analysis: {
      noOp: true,
      cache: { identitySha256: bundleSha256, bundleSha256 },
      telemetry: null,
    },
    analyzerScriptSha256: `sha256:${"b".repeat(64)}`,
  });
  assert.equal(proof.schemaVersion, "hapa.echo.no-stem-telemetry-proof.v1");
  assert.equal(proof.analysisVersion, "not-required");
  assert.equal(proof.truthStatus, "not-required-no-audio-reactive-stem-bindings");
  assert.equal(proof.fps, 0);
  assert.equal(proof.sampleRate, 0);
});

test("stable JSON proofs reject symlinks and corpus snapshots detect membership or identity drift", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-snapshot-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source.json");
  fs.writeFileSync(source, JSON.stringify({ ok: true }));
  const link = path.join(root, "link.json");
  fs.symlinkSync(source, link);
  assert.throws(() => stableJsonSourceProof(link), /symbolic|loop|ELOOP/iu);
  fs.rmSync(link);
  const snapshot = snapshotJsonCorpus(root);
  assert.equal(assertJsonCorpusSnapshotFresh(snapshot), true);
  fs.writeFileSync(path.join(root, "added.json"), "{}\n");
  assert.throws(() => assertJsonCorpusSnapshotFresh(snapshot), /changed during/u);
});

test("per-cut source guards use no-follow stat identity and fail closed on same-size or symlink replacement", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-stat-proof-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source.json");
  fs.writeFileSync(source, JSON.stringify({ value: "a" }));
  const proof = stableJsonSourceProof(source);
  assert.equal(assertFileSourceProofStatFresh(proof), true);

  const originalStat = fs.statSync(source);
  fs.writeFileSync(source, JSON.stringify({ value: "b" }));
  fs.utimesSync(source, originalStat.atime, originalStat.mtime);
  assert.throws(() => assertFileSourceProofStatFresh(proof), /changed after it was selected/u);

  const target = path.join(root, "target.json");
  fs.writeFileSync(target, JSON.stringify({ value: "a" }));
  fs.rmSync(source);
  fs.symlinkSync(target, source);
  assert.throws(() => assertFileSourceProofStatFresh(proof), /symbolic|loop|ELOOP/iu);
});

test("telemetry analysis payloads are song-scoped while compact lifetime audit counters survive release", () => {
  const cache = createScopedTelemetryAnalysisCache();
  const analyzed = {
    ok: true,
    telemetry: { frames: [{ t: 0, rms: 0.1 }, { t: 1, rms: 0.2 }] },
    cache: { origin: "analyzed" },
  };
  cache.remember("song-a", analyzed);
  assert.equal(cache.has("song-a"), true);
  assert.strictEqual(cache.get("song-a"), analyzed);
  assert.deepEqual(cache.summary(), {
    uniqueAnalysisCount: 1,
    successfulAnalysisCount: 1,
    failedAnalysisCount: 0,
    persistentCacheHitCount: 0,
    livePayloadCount: 1,
  });

  cache.releasePayloads();
  assert.equal(cache.has("song-a"), false);
  cache.remember("song-a", {
    ok: true,
    telemetry: { frames: [{ t: 0, rms: 0.1 }] },
    cache: { origin: "persistent" },
  });
  cache.releasePayloads();
  cache.remember("song-b", {
    ok: false,
    telemetry: null,
    cache: { origin: "analysis-failed-after-retry" },
  }, { retainPayload: false });
  cache.remember("song-c", {
    ok: true,
    telemetry: { frames: [{ t: 0, rms: 0.2 }] },
    cache: { origin: "persistent" },
  }, { retainPayload: false });
  assert.deepEqual(cache.summary(), {
    uniqueAnalysisCount: 3,
    successfulAnalysisCount: 2,
    failedAnalysisCount: 1,
    persistentCacheHitCount: 1,
    livePayloadCount: 0,
  });
});

test("readiness certifications hold one cross-process lock and release it for the next run", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-lock-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const release = acquireEchoReadinessCertificationLock({ avatarRoot: root });
  assert.throws(() => acquireEchoReadinessCertificationLock({ avatarRoot: root }), /already running/u);
  release();
  const releaseNext = acquireEchoReadinessCertificationLock({ avatarRoot: root });
  releaseNext();
  const lockPath = path.join(root, "artifacts", "echo-render-readiness", ".certification.lock");
  fs.writeFileSync(lockPath, JSON.stringify({ pid: 999_999_999 }));
  const staleAt = new Date(Date.now() - (10 * 60 * 1000));
  fs.utimesSync(lockPath, staleAt, staleAt);
  const releaseAfterStale = acquireEchoReadinessCertificationLock({ avatarRoot: root });
  releaseAfterStale();
  const outside = path.join(root, "outside-lock.json");
  fs.writeFileSync(outside, JSON.stringify({ pid: process.pid }));
  fs.symlinkSync(outside, lockPath);
  assert.throws(() => acquireEchoReadinessCertificationLock({ avatarRoot: root }), /not a regular file/u);
});

test("album readiness rejects an otherwise valid audio stream that is far shorter than the show", () => {
  const result = validateAudioInputDuration({
    ok: true,
    path: "/tmp/short.wav",
    audio: { streamDurationSeconds: 1, startTimeSeconds: 0 },
  }, 240);
  assert.equal(result.ok, false);
  assert.equal(result.code, "audio-input-duration-mismatch");
  assert.equal(result.durationValidation.expectedDurationSeconds, 240);
});

test("saved-plan certification proves distinct offline source and runtime proxy files without cross-binding their paths", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-dual-visual-input-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, "high-quality-source.mp4");
  const runtimePath = path.join(root, "browser-runtime-proxy.mp4");
  fs.writeFileSync(sourcePath, "high-quality-source");
  fs.writeFileSync(runtimePath, "browser-runtime-proxy");
  const runtimeRouteContext = { root, mediaDir: root };
  const mediaEntries = [{
    cueId: "cue:1",
    type: "video",
    originalUri: sourcePath,
    runtimeUri: "/media/browser-runtime-proxy.mp4",
    resolvedPath: sourcePath,
    generated: false,
    ok: true,
  }];
  const preflightInputs = executionVisualMediaPreflightInputs({ entries: mediaEntries }, { runtimeRouteContext });
  assert.equal(preflightInputs.source.entries[0].resolvedPath, sourcePath);
  assert.equal(preflightInputs.runtime.entries[0].resolvedPath, runtimePath);
  assert.deepEqual(preflightInputs.runtime.failures, []);

  const probeEvidence = (filePath) => {
    const stat = fs.statSync(filePath);
    return {
      ok: true,
      kind: "video",
      path: filePath,
      evidence: {
        signatureKey: `video:${filePath}:fixture`,
        fileIdentity: {
          dev: String(stat.dev),
          ino: String(stat.ino),
          size: Number(stat.size),
          mtimeMs: Number(stat.mtimeMs),
          ctimeMs: Number(stat.ctimeMs),
          readable: true,
        },
      },
    };
  };
  const evidence = visualExecutionInputEvidence([
    probeEvidence(sourcePath),
    probeEvidence(runtimePath),
  ], "visual-media", mediaEntries, { runtimeRouteContext });
  assert.deepEqual(evidence.map((entry) => [entry.path, entry.inputClass, entry.routeBindings.length]), [
    [runtimePath, "visual-media", 1],
    [sourcePath, "visual-media-source", 0],
  ]);
  const verified = await verifyEchoExecutionVisualInputEvidence({ visualInputs: evidence, proxyInputs: [] }, { runtimeRouteContext });
  assert.equal(verified.ok, true);

  const otherRuntimeRoot = path.join(root, "other-runtime");
  fs.mkdirSync(otherRuntimeRoot);
  fs.writeFileSync(path.join(otherRuntimeRoot, "browser-runtime-proxy.mp4"), "different-proxy");
  const drifted = await verifyEchoExecutionVisualInputEvidence(
    { visualInputs: evidence, proxyInputs: [] },
    { runtimeRouteContext: { root, mediaDir: otherRuntimeRoot } },
  );
  assert.equal(drifted.ok, false);
  assert.equal(drifted.findings[0].code, "execution-visual-runtime-route-changed");

  const unresolved = executionVisualMediaPreflightInputs({
    entries: [{ ...mediaEntries[0], runtimeUri: "https://example.invalid/runtime.mp4" }],
  }, { runtimeRouteContext });
  assert.equal(unresolved.runtime.entries.length, 0);
  assert.equal(unresolved.runtime.failures[0].code, "visual-runtime-route-unverified");
});

test("album readiness uses production sidecar precedence, includes embedded-only cuts, and isolates malformed variants", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-inputs-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const songId = "song:fixture";
  const projectPath = path.join(root, "project.json");
  const variantsRoot = path.join(root, "variants");
  const directory = path.join(variantsRoot, songId);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "01-sidecar.json"), JSON.stringify({
    direction_script_variant: { id: "shared-cut", title: "Sidecar wins", timeline: [] },
  }));
  fs.writeFileSync(path.join(directory, "02-sidecar-only.json"), JSON.stringify({
    variant: { id: "sidecar-only", timeline: [] },
  }));
  fs.writeFileSync(path.join(directory, "02b-duplicate-sidecar.json"), JSON.stringify({
    variant: { id: "sidecar-only", title: "Ambiguous duplicate", timeline: [] },
  }));
  fs.writeFileSync(path.join(directory, "03-invalid.json"), "{not-json");
  fs.writeFileSync(path.join(directory, "04-missing-id.json"), JSON.stringify({ variant: { title: "No ID" } }));

  const result = loadSavedVariantRows({
    baseProject: {
      song_id: songId,
      song_title: "Fixture",
      direction_script_variants: [
        { id: "shared-cut", title: "Embedded loses", timeline: [] },
        { id: "embedded-only", timeline: [] },
        { title: "Embedded without ID" },
      ],
    },
    projectPath,
    variantsRoot,
    songId,
  });

  assert.deepEqual(result.rows.map((row) => row.id), ["shared-cut", "sidecar-only", "04-missing-id", "embedded-only"]);
  assert.equal(result.rows[0].sourceKind, "sidecar");
  assert.equal(result.rows[0].variant.title, "Sidecar wins");
  assert.equal(result.rows[2].sourceKind, "sidecar");
  assert.equal(result.rows[3].sourceKind, "embedded");
  assert.deepEqual(result.invalid.map((row) => row.blockers[0].code).sort(), [
    "duplicate-saved-cut-id",
    "invalid-saved-cut-json",
    "saved-cut-id-missing",
  ]);
});

function writePlan(plansRoot, id, payload = { status: "changed" }) {
  fs.writeFileSync(path.join(plansRoot, `${id}.json`), JSON.stringify({ id: `plan:${id}`, ...payload }));
}

test("saved mint-plan audit scopes the observed queue fixture to five current plans and eight archival plans", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-queue-scope-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plansRoot = path.join(root, "plans");
  const queuePath = path.join(root, "remint-queue.json");
  fs.mkdirSync(plansRoot, { recursive: true });

  const candidates = [
    ["active-a", "awaiting-approval"],
    ["active-b", "awaiting-approval"],
    ["active-c", "awaiting-approval"],
    ["review-a", "ready-for-mint-review"],
    ["review-b", "ready-for-mint-review"],
    ["old-a", "superseded"],
    ["old-b", "superseded"],
    ["old-c", "superseded"],
    ["canceled", "canceled"],
    ["minted", "minted"],
  ];
  for (const [id] of candidates) writePlan(plansRoot, id);
  for (const id of ["orphan-a", "orphan-b"]) writePlan(plansRoot, id);
  fs.writeFileSync(path.join(plansRoot, "orphan-invalid.json"), "{not-json");
  fs.writeFileSync(queuePath, JSON.stringify({
    schemaVersion: "hapa.song-card.remint-queue.v1",
    candidates: candidates.map(([id, status]) => ({ id: `candidate:${id}`, planId: `plan:${id}`, status })),
  }));

  const audit = loadSavedMintPlanAudit({ plansRoot, queuePath });
  assert.equal(audit.report.mode, "queue-aware");
  assert.equal(audit.report.planFileCount, 13);
  assert.equal(audit.report.activePlanCount, 5);
  assert.equal(audit.report.archivalPlanCount, 8);
  assert.equal(audit.report.missingActivePlanCount, 0);
  assert.equal(audit.report.queue.activeCandidateCount, 5);
  assert.equal(audit.report.queue.archivalCandidateCount, 5);
  assert.deepEqual(audit.report.queue.activeCandidateStatusCounts, {
    "awaiting-approval": 3,
    "ready-for-mint-review": 2,
  });
  assert.deepEqual(audit.report.queue.archivalCandidateStatusCounts, {
    canceled: 1,
    minted: 1,
    superseded: 3,
  });
  assert.deepEqual(audit.report.activeReasonCounts, { "active-candidate": 5 });
  assert.deepEqual(audit.report.archivalReasonCounts, {
    "terminal-candidate": 5,
    "unreferenced-plan": 3,
  });
  assert.equal(audit.activeEntries.some((entry) => entry.parseError), false);
  assert.equal(audit.archivalEntries.filter((entry) => entry.parseError).length, 0);
  assert.equal(audit.report.archivalPlans.find((row) => row.planId === "plan:orphan-invalid").parseStatus, "not-loaded");
});

test("saved mint-plan audit includes every in-flight and release-review state and fails closed on unknown states", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-queue-states-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plansRoot = path.join(root, "plans");
  const queuePath = path.join(root, "remint-queue.json");
  fs.mkdirSync(plansRoot, { recursive: true });
  const activeStatuses = [
    "awaiting-approval",
    "approved",
    "queued",
    "rendering",
    "failed",
    "render-ready",
    "ready-for-mint-review",
    "minting",
    "future-current-state",
  ];
  const terminalStatuses = ["rejected", "canceled", "superseded", "minted", "up-to-date"];
  for (const status of [...activeStatuses, ...terminalStatuses]) writePlan(plansRoot, status);
  fs.writeFileSync(queuePath, JSON.stringify({
    candidates: [...activeStatuses, ...terminalStatuses].map((status) => ({
      id: `candidate:${status}`,
      planId: `plan:${status}`,
      status,
    })).concat([
      { id: "candidate:missing-file", planId: "plan:missing-file", status: "failed" },
      { id: "candidate:unbound", status: "queued" },
    ]),
  }));

  const audit = loadSavedMintPlanAudit({ plansRoot, queuePath });
  assert.equal(audit.report.activePlanCount, activeStatuses.length);
  assert.equal(audit.report.archivalPlanCount, terminalStatuses.length);
  assert.equal(audit.report.missingActivePlanCount, 1);
  assert.equal(audit.report.unboundActiveCandidateCount, 1);
  assert.equal(audit.report.activePlans.find((row) => row.planId === "plan:future-current-state").reason, "unknown-candidate-status-fail-closed");
  assert.deepEqual(audit.report.missingActivePlans[0].candidateStatuses, ["failed"]);
});

test("saved mint-plan audit preserves the non-terminal plan scan when no queue exists", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-legacy-plans-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plansRoot = path.join(root, "plans");
  fs.mkdirSync(plansRoot, { recursive: true });
  writePlan(plansRoot, "current", { status: "changed" });
  writePlan(plansRoot, "complete", { status: "completed" });
  fs.writeFileSync(path.join(plansRoot, "invalid.json"), "{not-json");

  const audit = loadSavedMintPlanAudit({ plansRoot, queuePath: path.join(root, "missing-queue.json") });
  assert.equal(audit.report.mode, "legacy-runnable-plan-scan");
  assert.equal(audit.report.queue.status, "missing");
  assert.equal(audit.report.activePlanCount, 2);
  assert.equal(audit.report.archivalPlanCount, 1);
  assert.deepEqual(audit.report.activeReasonCounts, {
    "legacy-runnable-scan": 1,
    "legacy-runnable-scan:invalid-plan": 1,
  });
  assert.deepEqual(audit.report.archivalReasonCounts, { "terminal-plan-status:completed": 1 });
});

test("an existing malformed remint queue is fail-closed and does not parse large plan snapshots", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-invalid-queue-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plansRoot = path.join(root, "plans");
  const queuePath = path.join(root, "remint-queue.json");
  fs.mkdirSync(plansRoot, { recursive: true });
  fs.writeFileSync(path.join(plansRoot, "large-archive.json"), "not-json-and-must-not-be-loaded");
  fs.writeFileSync(queuePath, "{broken");
  const audit = loadSavedMintPlanAudit({ plansRoot, queuePath });
  assert.equal(audit.report.mode, "invalid-queue-fail-closed");
  assert.equal(audit.report.queue.status, "invalid-fallback");
  assert.equal(audit.planEntries[0].loaded, false);
  assert.equal(audit.planEntries[0].parseError, null);
});

test("queue-aware audit parses only active files and rejects active filename/content identity mismatch", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-readiness-active-identity-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const plansRoot = path.join(root, "plans");
  const queuePath = path.join(root, "remint-queue.json");
  fs.mkdirSync(plansRoot, { recursive: true });
  fs.writeFileSync(path.join(plansRoot, "active.json"), JSON.stringify({ id: "plan:different", status: "changed" }));
  fs.writeFileSync(path.join(plansRoot, "archive.json"), "{not-loaded");
  fs.writeFileSync(queuePath, JSON.stringify({ candidates: [{ id: "candidate:a", planId: "plan:active", status: "queued" }] }));
  const audit = loadSavedMintPlanAudit({ plansRoot, queuePath });
  assert.equal(audit.activeEntries.length, 1);
  assert.match(audit.activeEntries[0].parseError, /identity does not match/u);
  assert.equal(audit.archivalEntries[0].loaded, false);
  assert.equal(audit.archivalEntries[0].parseError, null);
});
