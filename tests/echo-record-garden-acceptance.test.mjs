import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  ECHO_RECORD_GARDEN_ACCEPTANCE_CHECKS,
  buildEchoRecordGardenAcceptanceReceipt,
  createEchoRecordGardenAcceptanceRun,
  echoRecordGardenAcceptanceContextsMatch,
  evaluateEchoRecordGardenAcceptance,
} from "../src/domain/echo-record-garden-acceptance.js";
import { saveEchoRecordGardenAcceptanceReceipt } from "../server/echo-record-garden-acceptance-store.mjs";

const SHA_A = `sha256:${"a".repeat(64)}`;
const SHA_B = `sha256:${"b".repeat(64)}`;
const SHA_C = `sha256:${"c".repeat(64)}`;
const SHA_D = `sha256:${"d".repeat(64)}`;
const SHA_E = `sha256:${"e".repeat(64)}`;
const SHA_F = `sha256:${"f".repeat(64)}`;
const SHA_0 = `sha256:${"0".repeat(64)}`;

function context(overrides = {}) {
  return {
    schemaVersion: "hapa.echo-record-garden.acceptance-context.v1",
    capturedAt: "2026-08-01T12:00:00.000Z",
    service: "hapa-avatar-builder",
    runtime: {
      processOwner: "test",
      buildSignature: "0123456789abcdef",
      startedAt: "2026-08-01T11:00:00.000Z",
      port: 8797,
    },
    deliveryFresh: true,
    implementationRevision: "1".repeat(40),
    verificationLedgerSha256: SHA_D,
    serverDeliveryBuildSha256: SHA_E,
    deliveryReceiptFileSha256: SHA_0,
    bootSha256: SHA_F,
    bootSourceStatSignature: SHA_A,
    currentSourceStatSignature: SHA_A,
    delivery: {
      sourceSha256: SHA_A,
      servedBundleSha256: SHA_B,
      semanticSha256: SHA_C,
    },
    component: {
      path: "dist/assets/EchoRecordGarden3DView-test.js",
      sha256: SHA_D,
    },
    ...overrides,
  };
}

function browserDelivery(capturedAt, overrides = {}) {
  return {
    url: "http://127.0.0.1:8797/assets/EchoRecordGarden3DView-test.js",
    origin: "http://127.0.0.1:8797",
    sha256: SHA_D,
    capturedAt,
    ...overrides,
  };
}

function draft(overrides = {}) {
  return {
    operator: "Record Garden operator",
    observedAt: "2026-08-01T12:05:00.000Z",
    browserDevice: "Codex in-app browser on macOS",
    viewport: "1440 × 900 and 390 × 844",
    songsTested: ["A Name on the Horizon", "You Know How It Goes"],
    directorTimecodes: ["0:15 cue-a", "1:05 cue-b", "2:04 cue-c"],
    evidencePaths: ["artifacts/record-garden/desktop.png", "artifacts/record-garden/compact.png"],
    consoleErrors: "none observed",
    notes: "All required journeys were observed manually.",
    checks: Object.fromEntries(ECHO_RECORD_GARDEN_ACCEPTANCE_CHECKS.map(({ id }) => [id, "pass"])),
    ...overrides,
  };
}

function diagnostics(overrides = {}) {
  return {
    schemaVersion: "hapa.echo-record-garden.diagnostics.v2",
    capturedAt: "2026-08-01T12:05:00.000Z",
    createdGames: 1,
    disposedGames: 0,
    liveGames: 1,
    liveRenderers: 1,
    selectedSongId: "song-a",
    placedSongId: "song-a",
    directorCutId: "cut-recent",
    directorCutTitle: "Recent Cut",
    directorCutLegacy: false,
    audioTime: 124,
    audioState: "playing",
    recordAngle: 1.2,
    visualSurfaceCount: 12,
    activeVideos: 3,
    bufferedVideos: 3,
    presentedVideos: 3,
    warmingVideos: 3,
    warmReadyVideos: 3,
    waitingVideos: 0,
    mediaPoolSize: 7,
    mediaFailures: 0,
    mediaHardSeeks: 4,
    contextState: "available",
    visibilityState: "visible",
    rendererMemory: { geometries: 42, textures: 16 },
    inputCounts: { keyboard: 5, mouse: 4, pen: 0, touch: 6 },
    frameTiming: { samples: 600, p50Ms: 16.6, p95Ms: 28, p99Ms: 44, maxMs: 80, longFrames: 8 },
    lastError: "",
    acceptanceRun: {
      ...createEchoRecordGardenAcceptanceRun("2026-08-01T12:00:00.000Z"),
      playbackSeconds: 121,
      maxUninterruptedPlaybackSeconds: 121,
      uninterruptedPlaybackSongId: "song-a",
      uninterruptedPlaybackCutId: "cut-recent",
      recordPlacements: 11,
      recordChanges: 10,
      seekGestures: 4,
      seekTransitions: [
        { fromCueId: "cue-a", toCueId: "cue-b", fromSeconds: 10, toSeconds: 31, capturedAt: "2026-08-01T12:01:10.000Z" },
        { fromCueId: "cue-b", toCueId: "cue-c", fromSeconds: 31, toSeconds: 61, capturedAt: "2026-08-01T12:02:10.000Z" },
        { fromCueId: "cue-c", toCueId: "cue-d", fromSeconds: 61, toSeconds: 91, capturedAt: "2026-08-01T12:03:10.000Z" },
        { fromCueId: "cue-d", toCueId: "cue-e", fromSeconds: 91, toSeconds: 121, capturedAt: "2026-08-01T12:04:10.000Z" },
      ],
      surfacePageChanges: 3,
      cardResults: 1,
      keyboardActions: 5,
      compactActions: 5,
      reducedMotionObserved: true,
      songsObserved: ["song-a", "song-b"],
      cardEvidence: [{
        cardId: "echo-record-local-card:card-a",
        visualId: "visual-a",
        sourceSongId: "song-a",
        sourceCardId: "source-visual-a",
        sourceRevisionId: "",
        cardRevisionId: "",
        cardSchemaVersion: "hapa.echo-record-garden.local-card-projection.v1",
        truthStatus: "local-unminted-projection",
        mode: "local-unminted-projection",
        requestKey: "song-a|visual-a|now-playing|source-visual-a|64000",
        receiptEdition: 0,
        receiptAppearanceId: "",
        receiptSongId: "",
        receiptTimestampMs: 0,
        capturedAt: "2026-08-01T12:04:00.000Z",
      }],
      mediaFailures: 0,
      bufferingTransitions: 6,
      contextLosses: 0,
      maxRendererGeometries: 42,
      maxRendererTextures: 16,
      frameTiming: { samples: 600, p50Ms: 16.6, p95Ms: 28, p99Ms: 44, maxMs: 80, longFrames: 8 },
    },
    ...overrides,
  };
}

function checkpoint(index, kind = "desktop") {
  return {
    id: `checkpoint-${index}`,
    capturedAt: `2026-08-01T12:0${index}:00.000Z`,
    songId: "song-a",
    songTitle: "A Name on the Horizon",
    directorCutId: "cut-recent",
    directorCutTitle: "Recent Cut",
    cueId: `cue-${index}`,
    audioTime: index * 40,
    recordAngle: index,
    expectedRecordAngle: index,
    surfaces: ["screen-1", "screen-2", "screen-3", "record-face"].map((slot, slotIndex) => ({
      slot,
      visualId: `visual-${index}-${slotIndex}`,
      sourceId: `cue-${index}`,
      sourceRevisionId: `revision-${index}`,
      songId: "song-a",
      role: "now-playing",
      kind: slotIndex === 1 ? "generated-visualizer" : slotIndex === 2 ? "image" : "video",
      title: "Director cue",
      resourceKey: `resource-${index}-${slotIndex}`,
      clockLocked: slotIndex !== 2,
      generatedVisualizer: slotIndex === 1,
      imageBacked: slotIndex === 1 || slotIndex === 2,
      mediaState: "ready",
      readyState: slotIndex === 0 || slotIndex === 3 ? 4 : 0,
      hasPresentedFrame: true,
      currentMediaTime: index * 40,
      expectedMediaTime: index * 40,
      driftSeconds: 0,
    })),
    pixelSample: {
      capturedAt: `2026-08-01T12:0${index}:00.000Z`,
      width: 1440,
      height: 900,
      sampledPixels: 5120,
      nonBlackRatio: 0.92,
      uniqueBuckets: 128,
      luminanceVariance: 240,
    },
    renderer: { calls: 48, triangles: 120000, geometries: 42, textures: 16 },
    frameTiming: { samples: 600, p50Ms: 16.6, p95Ms: 28, p99Ms: 44, maxMs: 80, longFrames: 8 },
    kind,
  };
}

function sessions() {
  return [
    {
      id: "desktop-session",
      kind: "desktop",
      capturedAt: "2026-08-01T12:01:00.000Z",
      viewport: { width: 1440, height: 900, drawingBufferWidth: 1920, drawingBufferHeight: 1200, devicePixelRatio: 1.5 },
      userAgent: "test browser",
      platform: "test",
      pointerTypes: ["mouse"],
      webgl: { version: "WebGL 2", vendor: "private vendor", renderer: "private renderer" },
    },
    {
      id: "compact-session",
      kind: "compact",
      capturedAt: "2026-08-01T12:04:00.000Z",
      viewport: { width: 390, height: 844, drawingBufferWidth: 780, drawingBufferHeight: 1688, devicePixelRatio: 2 },
      userAgent: "test browser",
      platform: "test",
      prefersReducedMotion: true,
      maxTouchPoints: 5,
      coarsePointer: true,
      pointerTypes: ["touch"],
      webgl: { version: "WebGL 2", vendor: "private vendor", renderer: "private renderer" },
    },
  ];
}

function completeInput(overrides = {}) {
  const start = context();
  const end = context({ capturedAt: "2026-08-01T12:06:00.000Z" });
  return {
    result: "pass",
    draft: draft(),
    diagnostics: diagnostics(),
    contextStart: start,
    contextEnd: end,
    browserDeliveryStart: browserDelivery("2026-08-01T12:00:01.000Z"),
    browserDeliveryEnd: browserDelivery("2026-08-01T12:05:59.000Z"),
    environmentSessions: sessions(),
    checkpoints: [checkpoint(1), checkpoint(2), checkpoint(3, "compact")],
    ...overrides,
  };
}

function signal(evaluation, id) {
  return evaluation.automatedSignals.find((item) => item.id === id);
}

test("passing acceptance requires every human assertion, exact build identity, and complete runtime support", () => {
  const input = completeInput();
  const evaluation = evaluateEchoRecordGardenAcceptance({ ...input, service: input.contextEnd });
  assert.equal(evaluation.canRecordPass, true);
  assert.deepEqual(evaluation.missingFields, []);
  assert.deepEqual(evaluation.pendingChecks, []);
  assert.deepEqual(evaluation.failedSignals, []);
  assert.equal(evaluation.browserDelivery.start.path, "dist/assets/EchoRecordGarden3DView-test.js");
  const receipt = buildEchoRecordGardenAcceptanceReceipt({ ...input, service: input.contextEnd });
  assert.equal(receipt.result, "pass");
  assert.equal(receipt.truthStatus, "human-operator-attestation-with-runtime-telemetry");
  assert.equal(receipt.authorityBoundaries.publicReleaseClaimed, false);
  assert.equal(receipt.environmentSessions[0].webgl.vendor, undefined);
  assert.equal(receipt.environmentSessions[0].webgl.renderer, undefined);
  assert.equal(receipt.environmentSessions[0].userAgent, undefined);
});

test("a missing human row, stale build, missing Card identity, or nine record changes fails closed", () => {
  const base = completeInput();
  const pending = draft({ checks: { ...base.draft.checks, "compact-touch": "pending" } });
  assert.equal(evaluateEchoRecordGardenAcceptance({ ...base, draft: pending, service: base.contextEnd }).canRecordPass, false);
  const staleEnd = context({
    capturedAt: "2026-08-01T12:06:00.000Z",
    delivery: { sourceSha256: SHA_A, servedBundleSha256: SHA_E, semanticSha256: SHA_C },
  });
  assert.equal(echoRecordGardenAcceptanceContextsMatch(base.contextStart, staleEnd), false);
  assert.equal(evaluateEchoRecordGardenAcceptance({ ...base, contextEnd: staleEnd, service: staleEnd }).canRecordPass, false);
  const noCard = diagnostics({ acceptanceRun: { ...diagnostics().acceptanceRun, cardEvidence: [] } });
  assert.equal(evaluateEchoRecordGardenAcceptance({ ...base, diagnostics: noCard, service: base.contextEnd }).canRecordPass, false);
  const nineChanges = diagnostics({ acceptanceRun: { ...diagnostics().acceptanceRun, recordChanges: 9 } });
  assert.equal(evaluateEchoRecordGardenAcceptance({ ...base, diagnostics: nineChanges, service: base.contextEnd }).canRecordPass, false);
});

test("failure receipts preserve problems without pretending the automated gate passed", () => {
  const failedDraft = draft({
    checks: { ...draft().checks, "director-cue-parity": "fail" },
    notes: "At 1:04 the three screens went black while audio continued.",
  });
  const receipt = buildEchoRecordGardenAcceptanceReceipt({
    result: "fail",
    draft: failedDraft,
    diagnostics: diagnostics({ contextState: "lost", lastError: "WebGL context lost" }),
    service: context(),
    contextStart: context(),
    contextEnd: context({ capturedAt: "2026-08-01T12:06:00.000Z" }),
  });
  assert.equal(receipt.result, "fail");
  assert.equal(receipt.truthStatus, "human-operator-observed-failure-with-unverified-runtime-telemetry");
  assert.equal(receipt.operatorAttestation.checks["director-cue-parity"], "fail");
  assert.equal(receipt.authorityBoundaries.browserObservationRequired, true);
});

test("timestamps must be ISO and review finish cannot precede review start", () => {
  const input = completeInput({
    draft: draft({ observedAt: "sometime" }),
    contextEnd: context({ capturedAt: "2026-08-01T11:59:00.000Z" }),
  });
  const evaluation = evaluateEchoRecordGardenAcceptance({ ...input, service: input.contextEnd });
  assert.equal(evaluation.canRecordPass, false);
  assert.ok(evaluation.missingFields.includes("observedAtIso"));
  assert.ok(evaluation.missingFields.includes("reviewTimeOrder"));
});

test("browser chunk proofs must match the exact start/end contexts and the review duration is capped", () => {
  const base = completeInput();
  const wrongChunk = {
    ...base,
    browserDeliveryEnd: browserDelivery("2026-08-01T12:05:59.000Z", { sha256: SHA_E }),
  };
  const wrongChunkEvaluation = evaluateEchoRecordGardenAcceptance({ ...wrongChunk, service: wrongChunk.contextEnd });
  assert.equal(signal(wrongChunkEvaluation, "browser-chunk").pass, false);

  const lateEnd = context({ capturedAt: "2026-08-02T01:00:01.000Z" });
  const tooLong = {
    ...base,
    draft: draft({ observedAt: "2026-08-02T01:00:00.000Z" }),
    contextEnd: lateEnd,
    browserDeliveryEnd: browserDelivery("2026-08-02T01:00:00.000Z"),
  };
  const tooLongEvaluation = evaluateEchoRecordGardenAcceptance({ ...tooLong, service: lateEnd });
  assert.equal(tooLongEvaluation.canRecordPass, false);
  assert.ok(tooLongEvaluation.missingFields.includes("reviewDurationBound"));
  assert.equal(signal(tooLongEvaluation, "review-timeline").pass, false);
});

test("Card evidence accepts only exact resolver modes and revision truth or the explicit local-unminted schema", () => {
  const base = completeInput();
  const baseRun = diagnostics().acceptanceRun;
  const local = baseRun.cardEvidence[0];
  const exactModes = [
    local,
    {
      ...local,
      cardId: "source-card-a",
      sourceCardId: "source-card-a",
      sourceRevisionId: "revision-a",
      cardRevisionId: "revision-a",
      cardSchemaVersion: "hapa.card.v1",
      truthStatus: "embedded-source-card",
      mode: "embedded-source-card",
    },
    {
      ...local,
      cardId: "source-card-a",
      sourceCardId: "source-card-a",
      sourceRevisionId: "revision-a",
      cardRevisionId: "revision-a",
      cardSchemaVersion: "hapa.card.v1",
      truthStatus: "attached-source-card",
      mode: "attached-source-card",
    },
    {
      ...local,
      cardId: "printed-card-a",
      sourceCardId: "appearance-a",
      sourceRevisionId: "revision-a",
      cardRevisionId: "revision-a",
      cardSchemaVersion: "hapa.card.v1",
      truthStatus: "authoritative-edition-print",
      mode: "authoritative-edition-print",
      receiptEdition: 2,
      receiptAppearanceId: "appearance-a",
      receiptSongId: "song-a",
      receiptTimestampMs: 64_000,
    },
  ];
  for (const evidence of exactModes) {
    const run = { ...baseRun, cardEvidence: [evidence] };
    const candidate = { ...base, diagnostics: diagnostics({ acceptanceRun: run }) };
    assert.equal(signal(evaluateEchoRecordGardenAcceptance({ ...candidate, service: candidate.contextEnd }), "card-result").pass, true, evidence.mode);
  }

  for (const evidence of [
    { ...local, truthStatus: "attached-source-card" },
    { ...local, mode: "invented-mode", truthStatus: "invented-mode" },
    { ...local, cardSchemaVersion: "hapa.card.v1" },
    {
      ...exactModes[2],
      cardRevisionId: "different-revision",
    },
  ]) {
    const run = { ...baseRun, cardEvidence: [evidence] };
    const candidate = { ...base, diagnostics: diagnostics({ acceptanceRun: run }) };
    assert.equal(signal(evaluateEchoRecordGardenAcceptance({ ...candidate, service: candidate.contextEnd }), "card-result").pass, false);
  }
});

test("every checkpoint requires all four source-bound surfaces with media-aware readiness and clock drift", () => {
  const base = completeInput();
  const mutations = [
    (samples) => samples[0].surfaces.pop(),
    (samples) => { samples[0].surfaces[0].songId = "wrong-song"; },
    (samples) => { samples[0].surfaces[0].readyState = 1; },
    (samples) => { samples[0].surfaces[0].driftSeconds = 0.201; },
    (samples) => { samples[0].surfaces[2].mediaState = "fallback"; },
  ];
  for (const mutate of mutations) {
    const checkpoints = structuredClone(base.checkpoints);
    mutate(checkpoints);
    const candidate = { ...base, checkpoints };
    const evaluation = evaluateEchoRecordGardenAcceptance({ ...candidate, service: candidate.contextEnd });
    assert.equal(signal(evaluation, "visible-surfaces").pass, false);
  }
});

test("playback, checkpoints, and seeks must prove one uninterrupted cut with distinct committed transitions", () => {
  const base = completeInput();
  const baseRun = diagnostics().acceptanceRun;
  for (const run of [
    { ...baseRun, maxUninterruptedPlaybackSeconds: 119.99 },
    { ...baseRun, uninterruptedPlaybackCutId: "another-cut" },
  ]) {
    const candidate = { ...base, diagnostics: diagnostics({ acceptanceRun: run }) };
    assert.equal(signal(evaluateEchoRecordGardenAcceptance({ ...candidate, service: candidate.contextEnd }), "two-minute-playback").pass, false);
  }

  const duplicateCue = structuredClone(base.checkpoints);
  duplicateCue[2].cueId = duplicateCue[1].cueId;
  let candidate = { ...base, checkpoints: duplicateCue };
  assert.equal(signal(evaluateEchoRecordGardenAcceptance({ ...candidate, service: candidate.contextEnd }), "director-checkpoints").pass, false);

  const uncommitted = structuredClone(baseRun);
  uncommitted.seekTransitions[3].toCueId = "";
  candidate = { ...base, diagnostics: diagnostics({ acceptanceRun: uncommitted }) };
  assert.equal(signal(evaluateEchoRecordGardenAcceptance({ ...candidate, service: candidate.contextEnd }), "boundary-seeks").pass, false);
});

test("desktop and compact proof requires dimensions, real inputs, reduced motion, touch, and a coarse pointer", () => {
  const base = completeInput();
  const sessionMutations = [
    (items) => { items[0].viewport.width = 900; },
    (items) => { items[1].viewport.width = 900; },
    (items) => { items[1].coarsePointer = false; },
    (items) => { items[1].prefersReducedMotion = false; },
    (items) => { items[1].pointerTypes = ["mouse"]; },
  ];
  for (const mutate of sessionMutations) {
    const environmentSessions = structuredClone(base.environmentSessions);
    mutate(environmentSessions);
    const candidate = { ...base, environmentSessions };
    assert.equal(signal(evaluateEchoRecordGardenAcceptance({ ...candidate, service: candidate.contextEnd }), "desktop-and-compact").pass, false);
  }
  const noTouch = { ...base, diagnostics: diagnostics({ inputCounts: { keyboard: 5, mouse: 4, pen: 0, touch: 0 } }) };
  assert.equal(signal(evaluateEchoRecordGardenAcceptance({ ...noTouch, service: noTouch.contextEnd }), "desktop-and-compact").pass, false);
});

test("run-scoped media, WebGL, frame, and renderer budgets fail independently", () => {
  const base = completeInput();
  const baseRun = diagnostics().acceptanceRun;
  const badRuns = [
    { ...baseRun, mediaFailures: 1 },
    { ...baseRun, bufferingTransitions: 25 },
    { ...baseRun, contextLosses: 1 },
    { ...baseRun, maxRendererGeometries: 257 },
    { ...baseRun, maxRendererTextures: 65 },
    { ...baseRun, frameTiming: { ...baseRun.frameTiming, p95Ms: 51 } },
    { ...baseRun, frameTiming: { ...baseRun.frameTiming, longFrames: 61 } },
  ];
  for (const run of badRuns) {
    const candidate = { ...base, diagnostics: diagnostics({ acceptanceRun: run }) };
    assert.equal(signal(evaluateEchoRecordGardenAcceptance({ ...candidate, service: candidate.contextEnd }), "runtime-budgets").pass, false);
  }
});

test("receipts redact local secrets and omit browser and WebGL fingerprint fields", () => {
  const base = completeInput();
  const failedDraft = draft({
    browserDevice: "Browser on /Users/private-name/Mac",
    evidencePaths: ["/Users/private-name/Desktop/private.png?token=top-secret"],
    consoleErrors: "Authorization: Bearer extremely-secret-token",
    notes: "Repro in /home/private-name/project with api_key=private-key",
    checks: { ...draft().checks, "desktop-layout": "fail" },
  });
  const receipt = buildEchoRecordGardenAcceptanceReceipt({
    ...base,
    result: "fail",
    draft: failedDraft,
    service: base.contextEnd,
    browserDeliveryStart: browserDelivery("2026-08-01T12:00:01.000Z", { url: "http://127.0.0.1:8797/assets/EchoRecordGarden3DView-test.js?token=private-query" }),
  });
  const serialized = JSON.stringify(receipt);
  for (const secret of ["private-name", "top-secret", "extremely-secret-token", "private-key", "private-query", "private vendor", "private renderer", "userAgent", "platform"]) {
    assert.doesNotMatch(serialized, new RegExp(secret, "u"));
  }
  assert.equal(receipt.environmentSessions[0].webgl.version, "WebGL 2");
});

test("the receipt store is append-only, durable, idempotent, privacy-safe, and tamper-sensitive", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "record-garden-acceptance-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = completeInput();
  const [first, replay] = await Promise.all([
    saveEchoRecordGardenAcceptanceReceipt({ root, input, service: input.contextEnd, receivedAt: "2026-08-01T12:07:00.000Z" }),
    saveEchoRecordGardenAcceptanceReceipt({ root, input, service: input.contextEnd, receivedAt: "2026-08-01T12:08:00.000Z" }),
  ]);
  assert.equal([first.idempotentReplay, replay.idempotentReplay].filter(Boolean).length, 1);
  assert.equal(first.receiptPath, replay.receiptPath);
  assert.equal(first.relativePath.startsWith("artifacts/echo-record-garden/operator-acceptance/"), true);
  assert.equal((await stat(first.receiptPath)).mode & 0o777, 0o600);
  const stored = JSON.parse(await readFile(first.receiptPath, "utf8"));
  assert.equal(stored.result, "pass");
  assert.equal(stored.authorityBoundaries.boardMutated, undefined);

  stored.operatorAttestation.notes = "tampered";
  await writeFile(first.receiptPath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  await assert.rejects(
    saveEchoRecordGardenAcceptanceReceipt({ root, input, service: input.contextEnd }),
    (error) => error?.code === "acceptance_receipt_conflict",
  );
});
