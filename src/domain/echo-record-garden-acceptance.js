import {
  ECHO_RECORD_GARDEN_ACCEPTANCE_RUN_SCHEMA,
  createEchoRecordGardenAcceptanceRun,
} from "./echo-record-garden-acceptance-run.js";

export const ECHO_RECORD_GARDEN_ACCEPTANCE_SCHEMA = "hapa.echo-record-garden.operator-acceptance.v1";
export {
  ECHO_RECORD_GARDEN_ACCEPTANCE_RUN_SCHEMA,
  createEchoRecordGardenAcceptanceRun,
};

export const ECHO_RECORD_GARDEN_ACCEPTANCE_CHECKS = Object.freeze([
  Object.freeze({ id: "desktop-layout", label: "Desktop garden, controls, and record manipulation" }),
  Object.freeze({ id: "director-cue-parity", label: "Recent Director cut and two-minute cue parity" }),
  Object.freeze({ id: "boundary-seek-stability", label: "Director-boundary seeks without black, stale, or twitching media" }),
  Object.freeze({ id: "source-family-truth", label: "Director, Reference, character, and scene source truth" }),
  Object.freeze({ id: "card-source-identity", label: "Attached Card identity and LOCAL · UNMINTED fallback truth" }),
  Object.freeze({ id: "lifecycle-recovery", label: "Pause, refocus, repeated-record, reset, and retry recovery" }),
  Object.freeze({ id: "keyboard-reduced-motion", label: "Keyboard and reduced-motion journey" }),
  Object.freeze({ id: "compact-touch", label: "Compact-width and touch journey" }),
]);

const REQUIRED_CHECK_IDS = new Set(ECHO_RECORD_GARDEN_ACCEPTANCE_CHECKS.map(({ id }) => id));
const CHECK_RESULTS = new Set(["pending", "pass", "fail"]);
const BUILD_SIGNATURE = /^[a-f0-9]{16}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const REVISION = /^[a-f0-9]{40}$/;
const REVIEW_CLOCK_SKEW_MS = 30_000;
const MAX_REVIEW_DURATION_MS = 12 * 60 * 60 * 1_000;
const MIN_CHECKPOINT_SEPARATION_MS = 10_000;
const MIN_CHECKPOINT_AUDIO_SPAN_SECONDS = 60;
const REQUIRED_SURFACE_SLOTS = Object.freeze(["screen-1", "record-face"]);
const MAX_MEDIA_POOL_SIZE = 14;
const CARD_RESOLUTION_MODES = new Set([
  "authoritative-edition-print",
  "embedded-source-card",
  "attached-source-card",
  "local-unminted-projection",
]);

export const ECHO_RECORD_GARDEN_ACCEPTANCE_BUDGETS = Object.freeze({
  maxMediaFailures: 0,
  maxBufferingTransitions: 24,
  maxContextLosses: 0,
  minFrameSamples: 120,
  maxP95FrameMs: 50,
  maxP99FrameMs: 100,
  maxFrameMs: 1_000,
  maxLongFrameRatio: 0.1,
  maxRendererGeometries: 256,
  maxRendererTextures: 64,
  maxClockLockedDriftSeconds: 0.2,
});

function redactSensitiveText(value) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .replace(/\/Users\/[^/\s]+/giu, "/Users/[redacted]")
    .replace(/\/home\/[^/\s]+/giu, "/home/[redacted]")
    .replace(/[a-z]:\\Users\\[^\\\s]+/giu, "C:\\Users\\[redacted]")
    .replace(/\bBearer\s+[a-z0-9._~+/=-]+/giu, "Bearer [redacted]")
    .replace(/((?:api[_-]?key|access[_-]?token|authorization|cookie|password|secret|signature)\s*[:=]\s*)(?:"[^"]*"|'[^']*'|[^\s,;&]+)/giu, "$1[redacted]")
    .replace(/([?&](?:api[_-]?key|access[_-]?token|auth|authorization|code|key|secret|signature|token)=)[^&#\s]+/giu, "$1[redacted]");
}

function text(value, maxLength = 2_000) {
  return redactSensitiveText(value).trim().slice(0, maxLength);
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nonNegativeInteger(value) {
  return Math.max(0, Math.floor(finite(value)));
}

function isoMilliseconds(value) {
  const parsed = Date.parse(text(value, 100));
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function normalizeFrameTiming(value = {}) {
  return {
    samples: nonNegativeInteger(value.samples),
    p50Ms: Math.max(0, finite(value.p50Ms)),
    p95Ms: Math.max(0, finite(value.p95Ms)),
    p99Ms: Math.max(0, finite(value.p99Ms)),
    maxMs: Math.max(0, finite(value.maxMs)),
    longFrames: nonNegativeInteger(value.longFrames),
  };
}

function stringList(value, { maxItems = 30, maxLength = 500 } = {}) {
  const list = Array.isArray(value) ? value : String(value || "").split(/[\n,]/);
  return [...new Set(list.map((item) => text(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function cleanCheckResults(value = {}) {
  const checks = {};
  for (const { id } of ECHO_RECORD_GARDEN_ACCEPTANCE_CHECKS) {
    const result = text(value?.[id], 20).toLowerCase();
    checks[id] = CHECK_RESULTS.has(result) ? result : "pending";
  }
  return checks;
}

export function normalizeEchoRecordGardenAcceptanceRun(value = {}) {
  const normalized = createEchoRecordGardenAcceptanceRun(value.startedAt === undefined ? "" : value.startedAt);
  return {
    ...normalized,
    running: value.running === true,
    playbackSeconds: Math.max(0, finite(value.playbackSeconds)),
    maxUninterruptedPlaybackSeconds: Math.max(0, finite(value.maxUninterruptedPlaybackSeconds)),
    uninterruptedPlaybackSongId: text(value.uninterruptedPlaybackSongId, 240),
    uninterruptedPlaybackCutId: text(value.uninterruptedPlaybackCutId, 500),
    recordPlacements: nonNegativeInteger(value.recordPlacements),
    recordChanges: nonNegativeInteger(value.recordChanges),
    seekGestures: nonNegativeInteger(value.seekGestures),
    seekTransitions: (Array.isArray(value.seekTransitions) ? value.seekTransitions : []).slice(0, 20).map((item) => ({
      fromCueId: text(item?.fromCueId, 500),
      toCueId: text(item?.toCueId, 500),
      fromSeconds: Math.max(0, finite(item?.fromSeconds)),
      toSeconds: Math.max(0, finite(item?.toSeconds)),
      capturedAt: text(item?.capturedAt, 100),
    })),
    surfacePageChanges: nonNegativeInteger(value.surfacePageChanges),
    cardResults: nonNegativeInteger(value.cardResults),
    keyboardActions: nonNegativeInteger(value.keyboardActions),
    compactActions: nonNegativeInteger(value.compactActions),
    reducedMotionObserved: value.reducedMotionObserved === true,
    mediaFailures: nonNegativeInteger(value.mediaFailures),
    bufferingTransitions: nonNegativeInteger(value.bufferingTransitions),
    contextLosses: nonNegativeInteger(value.contextLosses),
    maxRendererGeometries: nonNegativeInteger(value.maxRendererGeometries),
    maxRendererTextures: nonNegativeInteger(value.maxRendererTextures),
    frameTiming: normalizeFrameTiming(value.frameTiming),
    songsObserved: stringList(value.songsObserved, { maxItems: 40, maxLength: 240 }),
    cardEvidence: (Array.isArray(value.cardEvidence) ? value.cardEvidence : []).slice(0, 10).map((item) => ({
      cardId: text(item?.cardId, 500),
      visualId: text(item?.visualId, 500),
      sourceSongId: text(item?.sourceSongId, 500),
      sourceCardId: text(item?.sourceCardId, 500),
      sourceRevisionId: text(item?.sourceRevisionId, 500),
      cardRevisionId: text(item?.cardRevisionId, 500),
      cardSchemaVersion: text(item?.cardSchemaVersion, 200),
      truthStatus: text(item?.truthStatus, 200),
      mode: text(item?.mode, 200),
      requestKey: text(item?.requestKey, 1_000),
      receiptEdition: nonNegativeInteger(item?.receiptEdition),
      receiptAppearanceId: text(item?.receiptAppearanceId, 500),
      receiptSongId: text(item?.receiptSongId, 500),
      receiptTimestampMs: nonNegativeInteger(item?.receiptTimestampMs),
      capturedAt: text(item?.capturedAt, 100),
    })),
    lastPlacedSongId: text(value.lastPlacedSongId, 240),
    lastSeekAtMs: Math.max(0, finite(value.lastSeekAtMs)),
    lastSeekSeconds: Math.max(0, finite(value.lastSeekSeconds)),
  };
}

export function normalizeEchoRecordGardenAcceptanceDraft(value = {}) {
  return {
    operator: text(value.operator, 200),
    observedAt: text(value.observedAt, 100),
    browserDevice: text(value.browserDevice, 500),
    viewport: text(value.viewport, 100),
    songsTested: stringList(value.songsTested, { maxItems: 40, maxLength: 240 }),
    directorTimecodes: stringList(value.directorTimecodes, { maxItems: 40, maxLength: 100 }),
    evidencePaths: stringList(value.evidencePaths, { maxItems: 40, maxLength: 1_000 }),
    consoleErrors: text(value.consoleErrors, 5_000),
    notes: text(value.notes, 10_000),
    checks: cleanCheckResults(value.checks),
  };
}

export function snapshotEchoRecordGardenDiagnostics(value = {}) {
  const run = normalizeEchoRecordGardenAcceptanceRun(value.acceptanceRun || {});
  return {
    schemaVersion: text(value.schemaVersion, 100),
    capturedAt: text(value.capturedAt, 100),
    createdGames: nonNegativeInteger(value.createdGames),
    disposedGames: nonNegativeInteger(value.disposedGames),
    liveGames: nonNegativeInteger(value.liveGames),
    liveRenderers: nonNegativeInteger(value.liveRenderers),
    selectedSongId: text(value.selectedSongId, 240),
    placedSongId: text(value.placedSongId, 240),
    directorCutId: text(value.directorCutId, 500),
    directorCutTitle: text(value.directorCutTitle, 500),
    directorCutLegacy: value.directorCutLegacy === true,
    audioTime: Math.max(0, finite(value.audioTime)),
    audioState: text(value.audioState, 50),
    recordAngle: finite(value.recordAngle),
    visualSurfaceCount: nonNegativeInteger(value.visualSurfaceCount),
    activeVideos: nonNegativeInteger(value.activeVideos),
    bufferedVideos: nonNegativeInteger(value.bufferedVideos),
    presentedVideos: nonNegativeInteger(value.presentedVideos),
    warmingVideos: nonNegativeInteger(value.warmingVideos),
    warmReadyVideos: nonNegativeInteger(value.warmReadyVideos),
    waitingVideos: nonNegativeInteger(value.waitingVideos),
    mediaPoolSize: nonNegativeInteger(value.mediaPoolSize),
    mediaFailures: nonNegativeInteger(value.mediaFailures),
    mediaHardSeeks: nonNegativeInteger(value.mediaHardSeeks),
    mediaBufferingTransitions: nonNegativeInteger(value.mediaBufferingTransitions),
    projectCacheEntries: nonNegativeInteger(value.projectCacheEntries),
    projectCacheEvictions: nonNegativeInteger(value.projectCacheEvictions),
    contextState: text(value.contextState, 50),
    visibilityState: text(value.visibilityState, 50),
    powerProfile: text(value.powerProfile, 50),
    renderPixelRatio: Math.max(0, finite(value.renderPixelRatio)),
    rendererMemory: {
      geometries: nonNegativeInteger(value.rendererMemory?.geometries),
      textures: nonNegativeInteger(value.rendererMemory?.textures),
    },
    inputCounts: {
      keyboard: nonNegativeInteger(value.inputCounts?.keyboard),
      mouse: nonNegativeInteger(value.inputCounts?.mouse),
      pen: nonNegativeInteger(value.inputCounts?.pen),
      touch: nonNegativeInteger(value.inputCounts?.touch),
    },
    frameTiming: normalizeFrameTiming(value.frameTiming),
    lastError: text(value.lastError, 2_000),
    acceptanceRun: run,
  };
}

export function normalizeEchoRecordGardenAcceptanceContext(value = {}) {
  const runtime = value?.runtime || value;
  const delivery = value?.delivery || value?.buildReceipt || {};
  const component = value?.component || {};
  return {
    schemaVersion: text(value?.schemaVersion, 100),
    capturedAt: text(value?.capturedAt, 100),
    service: text(value?.service || "hapa-avatar-builder", 100),
    processOwner: text(runtime?.processOwner, 100),
    buildSignature: text(runtime?.buildSignature, 100),
    deliveryFresh: value?.deliveryFresh === true || runtime?.echoDeliveryFreshness?.ok === true,
    deliveryFreshnessReason: text(value?.deliveryFreshnessReason || runtime?.echoDeliveryFreshness?.reason, 500),
    sourceSha256: text(delivery?.sourceSha256 || value?.sourceSha256, 100),
    servedBundleSha256: text(delivery?.servedBundleSha256 || value?.servedBundleSha256, 100),
    semanticSha256: text(delivery?.semanticSha256 || value?.semanticSha256, 100),
    componentChunkPath: text(component?.path || value?.componentChunkPath, 500),
    componentChunkSha256: text(component?.sha256 || value?.componentChunkSha256, 100),
    bootSourceStatSignature: text(value?.bootSourceStatSignature || runtime?.echoDeliveryFreshness?.bootSourceStatSignature, 100),
    currentSourceStatSignature: text(value?.currentSourceStatSignature || runtime?.echoDeliveryFreshness?.currentSourceStatSignature, 100),
    implementationRevision: text(value?.implementationRevision, 100),
    verificationLedgerSha256: text(value?.verificationLedgerSha256, 100),
    serverDeliveryBuildSha256: text(value?.serverDeliveryBuildSha256, 100),
    deliveryReceiptFileSha256: text(value?.deliveryReceiptFileSha256, 100),
    bootSha256: text(value?.bootSha256 || runtime?.echoDeliveryFreshness?.bootSha256, 100),
    startedAt: text(runtime?.startedAt, 100),
    port: nonNegativeInteger(runtime?.port),
  };
}

export const normalizeEchoRecordGardenServiceIdentity = normalizeEchoRecordGardenAcceptanceContext;

export function echoRecordGardenAcceptanceContextsMatch(left = {}, right = {}) {
  const a = normalizeEchoRecordGardenAcceptanceContext(left);
  const b = normalizeEchoRecordGardenAcceptanceContext(right);
  return [
    "buildSignature",
    "sourceSha256",
    "servedBundleSha256",
    "semanticSha256",
    "componentChunkPath",
    "componentChunkSha256",
    "bootSourceStatSignature",
    "currentSourceStatSignature",
    "implementationRevision",
    "verificationLedgerSha256",
    "serverDeliveryBuildSha256",
    "deliveryReceiptFileSha256",
    "bootSha256",
  ].every((field) => a[field] && a[field] === b[field]);
}

function canonicalComponentChunkPath(value = "") {
  let candidate = text(value, 1_000);
  try {
    candidate = new URL(candidate).pathname;
  } catch {
    candidate = candidate.split(/[?#]/u)[0];
  }
  candidate = candidate.replace(/\\/gu, "/").replace(/^\/+/, "");
  if (candidate.startsWith("assets/")) candidate = `dist/${candidate}`;
  return candidate.includes("..") ? "" : candidate;
}

function normalizeBrowserDelivery(value = {}) {
  const rawUrl = text(value.url, 2_000);
  let urlOrigin = "";
  if (rawUrl) {
    try { urlOrigin = new URL(rawUrl).origin; } catch {}
  }
  return {
    path: canonicalComponentChunkPath(value.path || rawUrl),
    origin: text(value.origin || urlOrigin, 300),
    sha256: text(value.sha256 || value.componentChunkSha256, 100).toLowerCase(),
    capturedAt: text(value.capturedAt, 100),
  };
}

function normalizeEnvironmentSession(value = {}) {
  return {
    id: text(value.id, 200),
    kind: ["desktop", "compact"].includes(text(value.kind, 30)) ? text(value.kind, 30) : "unknown",
    capturedAt: text(value.capturedAt, 100),
    viewport: {
      width: nonNegativeInteger(value.viewport?.width),
      height: nonNegativeInteger(value.viewport?.height),
      drawingBufferWidth: nonNegativeInteger(value.viewport?.drawingBufferWidth),
      drawingBufferHeight: nonNegativeInteger(value.viewport?.drawingBufferHeight),
      devicePixelRatio: Math.max(0, finite(value.viewport?.devicePixelRatio)),
    },
    prefersReducedMotion: value.prefersReducedMotion === true,
    maxTouchPoints: nonNegativeInteger(value.maxTouchPoints),
    coarsePointer: value.coarsePointer === true,
    pointerTypes: stringList(value.pointerTypes, { maxItems: 10, maxLength: 30 }),
    webgl: {
      version: text(value.webgl?.version, 500),
    },
  };
}

function normalizePixelSample(value = {}) {
  return {
    capturedAt: text(value.capturedAt, 100),
    width: nonNegativeInteger(value.width),
    height: nonNegativeInteger(value.height),
    sampledPixels: nonNegativeInteger(value.sampledPixels),
    nonBlackRatio: Math.max(0, Math.min(1, finite(value.nonBlackRatio))),
    uniqueBuckets: nonNegativeInteger(value.uniqueBuckets),
    luminanceVariance: Math.max(0, finite(value.luminanceVariance)),
  };
}

function normalizeCheckpoint(value = {}) {
  return {
    id: text(value.id, 200),
    capturedAt: text(value.capturedAt, 100),
    songId: text(value.songId, 240),
    songTitle: text(value.songTitle, 500),
    directorCutId: text(value.directorCutId, 500),
    directorCutTitle: text(value.directorCutTitle, 500),
    cueId: text(value.cueId, 500),
    audioTime: Math.max(0, finite(value.audioTime)),
    recordAngle: finite(value.recordAngle),
    expectedRecordAngle: finite(value.expectedRecordAngle),
    surfaces: (Array.isArray(value.surfaces) ? value.surfaces : []).slice(0, 4).map((surface) => ({
      slot: text(surface?.slot, 100),
      visualId: text(surface?.visualId, 500),
      sourceId: text(surface?.sourceId, 500),
      sourceRevisionId: text(surface?.sourceRevisionId, 500),
      songId: text(surface?.songId, 240),
      role: text(surface?.role, 100),
      kind: text(surface?.kind, 100),
      title: text(surface?.title, 500),
      resourceKey: text(surface?.resourceKey, 1_000),
      clockLocked: surface?.clockLocked === true,
      generatedVisualizer: surface?.generatedVisualizer === true,
      imageBacked: surface?.imageBacked === true,
      mediaState: text(surface?.mediaState, 100),
      readyState: nonNegativeInteger(surface?.readyState),
      hasPresentedFrame: surface?.hasPresentedFrame === true,
      currentMediaTime: Math.max(0, finite(surface?.currentMediaTime)),
      expectedMediaTime: Math.max(0, finite(surface?.expectedMediaTime)),
      driftSeconds: Math.abs(finite(surface?.driftSeconds)),
    })),
    pixelSample: normalizePixelSample(value.pixelSample),
    renderer: {
      calls: nonNegativeInteger(value.renderer?.calls),
      triangles: nonNegativeInteger(value.renderer?.triangles),
      geometries: nonNegativeInteger(value.renderer?.geometries),
      textures: nonNegativeInteger(value.renderer?.textures),
    },
    frameTiming: normalizeFrameTiming(value.frameTiming),
  };
}

function timestampWithinReview(value, startAtMs, endAtMs) {
  const observed = isoMilliseconds(value);
  return Number.isFinite(observed)
    && observed >= startAtMs - REVIEW_CLOCK_SKEW_MS
    && observed <= endAtMs + REVIEW_CLOCK_SKEW_MS;
}

function browserDeliveryMatchesContext(delivery, context) {
  return Boolean(
    delivery.path
    && delivery.path === canonicalComponentChunkPath(context.componentChunkPath)
    && SHA256.test(delivery.sha256)
    && delivery.sha256 === context.componentChunkSha256
  );
}

function cardEvidenceIsExact(item, startAtMs, endAtMs) {
  if (
    !CARD_RESOLUTION_MODES.has(item.mode)
    || item.truthStatus !== item.mode
    || !item.cardId
    || !item.visualId
    || !item.sourceSongId
    || !item.requestKey
    || !timestampWithinReview(item.capturedAt, startAtMs, endAtMs)
  ) return false;
  if (item.mode === "local-unminted-projection") {
    return item.cardSchemaVersion === "hapa.echo-record-garden.local-card-projection.v1"
      && item.cardId.startsWith("echo-record-local-card:")
      && item.receiptEdition === 0
      && !item.receiptAppearanceId
      && !item.receiptSongId;
  }
  if (
    !item.sourceCardId
    || !item.sourceRevisionId
    || !item.cardRevisionId
    || item.sourceRevisionId !== item.cardRevisionId
    || !item.cardSchemaVersion
    || item.cardSchemaVersion === "hapa.echo-record-garden.local-card-projection.v1"
  ) return false;
  if (["embedded-source-card", "attached-source-card"].includes(item.mode)) {
    return item.cardId === item.sourceCardId && item.receiptEdition === 0;
  }
  return item.receiptEdition > 0
    && Boolean(item.receiptAppearanceId)
    && item.receiptSongId === item.sourceSongId;
}

function surfaceMediaIsReady(surface, checkpointSongId) {
  if (
    !surface.visualId
    || !surface.sourceId
    || !surface.songId
    || surface.songId !== checkpointSongId
    || !surface.role
    || !surface.kind
    || !surface.resourceKey
    || !surface.hasPresentedFrame
  ) return false;
  if (surface.generatedVisualizer) return surface.mediaState === "ready";
  if (surface.imageBacked) return surface.mediaState === "ready";
  return ["ready", "buffering"].includes(surface.mediaState)
    && surface.readyState >= 2
    && (!surface.clockLocked || surface.driftSeconds <= ECHO_RECORD_GARDEN_ACCEPTANCE_BUDGETS.maxClockLockedDriftSeconds);
}

function checkpointHasCompleteSurfaceProof(checkpoint) {
  if (checkpoint.surfaces.length !== REQUIRED_SURFACE_SLOTS.length) return false;
  const bySlot = new Map(checkpoint.surfaces.map((surface) => [surface.slot, surface]));
  return bySlot.size === REQUIRED_SURFACE_SLOTS.length
    && REQUIRED_SURFACE_SLOTS.every((slot) => bySlot.has(slot))
    && checkpoint.surfaces.every((surface) => surfaceMediaIsReady(surface, checkpoint.songId));
}

function distinctDirectorCheckpointGroup(samples, startAtMs, endAtMs) {
  const groups = new Map();
  for (const sample of samples) {
    if (
      !sample.id
      || !sample.songId
      || !sample.directorCutId
      || !sample.cueId
      || !timestampWithinReview(sample.capturedAt, startAtMs, endAtMs)
    ) continue;
    const key = `${sample.songId}\u0000${sample.directorCutId}`;
    groups.set(key, [...(groups.get(key) || []), sample]);
  }
  for (const candidates of groups.values()) {
    const ordered = [...candidates].sort((left, right) => isoMilliseconds(left.capturedAt) - isoMilliseconds(right.capturedAt));
    if (ordered.length < 3) continue;
    const ids = new Set(ordered.map(({ id }) => id));
    const cues = new Set(ordered.map(({ cueId }) => cueId));
    const separated = ordered.slice(1).every((sample, index) => (
      isoMilliseconds(sample.capturedAt) - isoMilliseconds(ordered[index].capturedAt) >= MIN_CHECKPOINT_SEPARATION_MS
    ));
    const clocksIncrease = ordered.slice(1).every((sample, index) => sample.audioTime > ordered[index].audioTime);
    const audioSpan = ordered.at(-1).audioTime - ordered[0].audioTime;
    if (
      ids.size === ordered.length
      && cues.size >= 3
      && separated
      && clocksIncrease
      && audioSpan >= MIN_CHECKPOINT_AUDIO_SPAN_SECONDS
    ) return ordered;
  }
  return [];
}

function frameTimingWithinBudget(frameTiming) {
  const budgets = ECHO_RECORD_GARDEN_ACCEPTANCE_BUDGETS;
  return frameTiming.samples >= budgets.minFrameSamples
    && frameTiming.p95Ms > 0
    && frameTiming.p95Ms <= budgets.maxP95FrameMs
    && frameTiming.p99Ms > 0
    && frameTiming.p99Ms <= budgets.maxP99FrameMs
    && frameTiming.maxMs >= frameTiming.p99Ms
    && frameTiming.maxMs <= budgets.maxFrameMs
    && frameTiming.longFrames / frameTiming.samples <= budgets.maxLongFrameRatio;
}

function runBudgetsPass(run) {
  const budgets = ECHO_RECORD_GARDEN_ACCEPTANCE_BUDGETS;
  return run.mediaFailures <= budgets.maxMediaFailures
    && run.bufferingTransitions <= budgets.maxBufferingTransitions
    && run.contextLosses <= budgets.maxContextLosses
    && run.maxRendererGeometries > 0
    && run.maxRendererGeometries <= budgets.maxRendererGeometries
    && run.maxRendererTextures > 0
    && run.maxRendererTextures <= budgets.maxRendererTextures
    && frameTimingWithinBudget(run.frameTiming);
}

function environmentProofPass(sessions, runtime, run) {
  const viewportIsLive = ({ viewport }) => viewport.width > 0
    && viewport.height > 0
    && viewport.drawingBufferWidth > 0
    && viewport.drawingBufferHeight > 0
    && viewport.devicePixelRatio >= 0.5
    && viewport.devicePixelRatio <= 4;
  const desktop = sessions.find((session) => session.kind === "desktop"
    && viewportIsLive(session)
    && session.viewport.width >= 1024
    && session.viewport.height >= 600
    && session.pointerTypes.some((type) => ["mouse", "pen"].includes(type)));
  const compact = sessions.find((session) => session.kind === "compact"
    && viewportIsLive(session)
    && session.viewport.width >= 320
    && session.viewport.width <= 760
    && session.viewport.height >= 568
    && session.prefersReducedMotion
    && session.maxTouchPoints >= 1
    && session.coarsePointer
    && session.pointerTypes.includes("touch"));
  return Boolean(
    desktop
    && compact
    && run.keyboardActions > 0
    && run.compactActions > 0
    && run.reducedMotionObserved
    && runtime.inputCounts.keyboard > 0
    && runtime.inputCounts.mouse + runtime.inputCounts.pen > 0
    && runtime.inputCounts.touch > 0
  );
}

export function evaluateEchoRecordGardenAcceptance({
  draft = {},
  diagnostics = {},
  service = {},
  contextStart = service,
  contextEnd = service,
  browserDeliveryStart = {},
  browserDeliveryEnd = {},
  browserLoadedChunkStart = browserDeliveryStart,
  browserLoadedChunkEnd = browserDeliveryEnd,
  environmentSessions = [],
  checkpoints = [],
} = {}) {
  const normalizedDraft = normalizeEchoRecordGardenAcceptanceDraft(draft);
  const runtime = snapshotEchoRecordGardenDiagnostics(diagnostics);
  const serviceIdentity = normalizeEchoRecordGardenAcceptanceContext(service);
  const startIdentity = normalizeEchoRecordGardenAcceptanceContext(contextStart);
  const endIdentity = normalizeEchoRecordGardenAcceptanceContext(contextEnd);
  const deliveryStart = normalizeBrowserDelivery(browserDeliveryStart?.path || browserDeliveryStart?.url
    ? browserDeliveryStart
    : browserLoadedChunkStart);
  const deliveryEnd = normalizeBrowserDelivery(browserDeliveryEnd?.path || browserDeliveryEnd?.url
    ? browserDeliveryEnd
    : browserLoadedChunkEnd);
  const sessions = (Array.isArray(environmentSessions) ? environmentSessions : []).slice(0, 8).map(normalizeEnvironmentSession);
  const samples = (Array.isArray(checkpoints) ? checkpoints : []).slice(0, 60).map(normalizeCheckpoint);
  const run = runtime.acceptanceRun;
  const revisionIdentityComplete = [
    serviceIdentity.buildSignature,
    serviceIdentity.sourceSha256,
    serviceIdentity.servedBundleSha256,
    serviceIdentity.semanticSha256,
    serviceIdentity.componentChunkSha256,
    serviceIdentity.verificationLedgerSha256,
    serviceIdentity.serverDeliveryBuildSha256,
    serviceIdentity.deliveryReceiptFileSha256,
    serviceIdentity.bootSha256,
  ].every((value, index) => index === 0 ? BUILD_SIGNATURE.test(value) : SHA256.test(value))
    && REVISION.test(serviceIdentity.implementationRevision)
    && /^dist\/assets\/EchoRecordGarden3DView-[^/]+\.js$/u.test(canonicalComponentChunkPath(serviceIdentity.componentChunkPath));
  const startAtMs = isoMilliseconds(startIdentity.capturedAt);
  const endAtMs = isoMilliseconds(endIdentity.capturedAt);
  const observedAtMs = isoMilliseconds(normalizedDraft.observedAt);
  const reviewDurationMs = endAtMs - startAtMs;
  const reviewBoundsValid = Number.isFinite(startAtMs)
    && Number.isFinite(endAtMs)
    && endAtMs >= startAtMs
    && reviewDurationMs <= MAX_REVIEW_DURATION_MS;
  const evidenceTimestamps = [
    normalizedDraft.observedAt,
    runtime.capturedAt,
    run.startedAt,
    deliveryStart.capturedAt,
    deliveryEnd.capturedAt,
    ...sessions.map(({ capturedAt }) => capturedAt),
    ...samples.map(({ capturedAt }) => capturedAt),
    ...run.cardEvidence.map(({ capturedAt }) => capturedAt),
    ...run.seekTransitions.map(({ capturedAt }) => capturedAt),
  ];
  const evidenceTimeOrderValid = reviewBoundsValid
    && evidenceTimestamps.every((value) => timestampWithinReview(value, startAtMs, endAtMs))
    && isoMilliseconds(deliveryStart.capturedAt) <= isoMilliseconds(deliveryEnd.capturedAt);
  const browserDeliveryExact = Boolean(
    deliveryStart.origin
    && deliveryStart.origin === deliveryEnd.origin
    && browserDeliveryMatchesContext(deliveryStart, startIdentity)
    && browserDeliveryMatchesContext(deliveryEnd, endIdentity)
    && browserDeliveryMatchesContext(deliveryEnd, serviceIdentity)
  );
  const directorSamples = reviewBoundsValid
    ? distinctDirectorCheckpointGroup(samples, startAtMs, endAtMs)
    : [];
  const pixelsProveVisibleCanvas = directorSamples.slice(0, 3).length === 3
    && directorSamples.slice(0, 3).every(({ pixelSample }) => (
    pixelSample.sampledPixels >= 64
    && pixelSample.nonBlackRatio >= 0.02
    && pixelSample.uniqueBuckets >= 8
    && pixelSample.luminanceVariance > 1
    ));
  const surfacesProveCurrentMedia = directorSamples.length >= 3
    && directorSamples.every(checkpointHasCompleteSurfaceProof);
  const rendererCheckpointsWithinBudget = directorSamples.length >= 3
    && directorSamples.every(({ renderer, frameTiming }) => (
      renderer.calls > 0
      && renderer.triangles > 0
      && renderer.geometries > 0
      && renderer.geometries <= ECHO_RECORD_GARDEN_ACCEPTANCE_BUDGETS.maxRendererGeometries
      && renderer.textures > 0
      && renderer.textures <= ECHO_RECORD_GARDEN_ACCEPTANCE_BUDGETS.maxRendererTextures
      && frameTimingWithinBudget(frameTiming)
    ));
  const uninterruptedPlayback = run.maxUninterruptedPlaybackSeconds >= 120
    && run.uninterruptedPlaybackSongId
    && run.uninterruptedPlaybackSongId === runtime.placedSongId
    && run.uninterruptedPlaybackCutId
    && run.uninterruptedPlaybackCutId === runtime.directorCutId
    && directorSamples.length >= 3
    && directorSamples.every(({ songId, directorCutId }) => (
      songId === run.uninterruptedPlaybackSongId && directorCutId === run.uninterruptedPlaybackCutId
    ));
  const committedSeekTransitions = run.seekTransitions.length >= 4
    && run.seekGestures === run.seekTransitions.length
    && new Set(run.seekTransitions.map(({ fromCueId, toCueId }) => `${fromCueId}\u0000${toCueId}`)).size === run.seekTransitions.length
    && run.seekTransitions.every((transition) => (
      transition.fromCueId
      && transition.toCueId
      && transition.fromCueId !== transition.toCueId
      && Math.abs(transition.toSeconds - transition.fromSeconds) >= 0.25
      && timestampWithinReview(transition.capturedAt, startAtMs, endAtMs)
    ));
  const exactCardEvidence = reviewBoundsValid
    && run.cardResults >= 1
    && run.cardEvidence.some((item) => cardEvidenceIsExact(item, startAtMs, endAtMs));
  const explicitNoErrors = /^(?:0|none(?:\s+observed)?|no\s+(?:console\s+|page\s+|network\s+)?errors?(?:\s+observed)?)\.?$/iu
    .test(normalizedDraft.consoleErrors);
  const automatedSignals = [
    { id: "current-build", label: "Browser-reported current production bundle identity", pass: serviceIdentity.deliveryFresh && revisionIdentityComplete },
    { id: "same-build", label: "Same fresh build at review start and finish", pass: echoRecordGardenAcceptanceContextsMatch(startIdentity, endIdentity) && echoRecordGardenAcceptanceContextsMatch(endIdentity, serviceIdentity) },
    { id: "browser-chunk", label: "Browser-loaded Record Garden chunk matches start and finish contexts", pass: browserDeliveryExact },
    { id: "review-timeline", label: "Review evidence is ordered inside one bounded run", pass: evidenceTimeOrderValid },
    { id: "live-webgl", label: "One live WebGL garden", pass: runtime.contextState === "available" && runtime.liveGames === 1 && runtime.liveRenderers === 1 },
    { id: "exact-director", label: "Recent non-Legacy Director cut", pass: Boolean(runtime.directorCutId || runtime.directorCutTitle) && runtime.directorCutLegacy !== true },
    { id: "bounded-media", label: "Bounded fourteen-resource living-media pool", pass: runtime.mediaPoolSize > 0 && runtime.mediaPoolSize <= MAX_MEDIA_POOL_SIZE },
    { id: "visible-surfaces", label: "Cinematic Preview and Record face are ready and source-bound", pass: runtime.visualSurfaceCount >= 1 && runtime.presentedVideos > 0 && surfacesProveCurrentMedia },
    { id: "two-minute-playback", label: "Uninterrupted two-minute playback on one song and cut", pass: uninterruptedPlayback && runtime.audioTime > 0 },
    { id: "record-change-soak", label: "Ten record changes", pass: run.recordChanges >= 10 },
    { id: "boundary-seeks", label: "Four committed cross-cue seek transitions", pass: committedSeekTransitions },
    { id: "surface-paging", label: "Surface pages exercised", pass: run.surfacePageChanges >= 1 },
    { id: "card-result", label: "Exact Card source/revision or truthful local-unminted fallback", pass: exactCardEvidence },
    { id: "desktop-and-compact", label: "Desktop input plus compact touch, coarse-pointer, and reduced-motion proof", pass: environmentProofPass(sessions, runtime, run) },
    { id: "canvas-pixels", label: "Browser-reported canvas sample is nonblank and varied", pass: pixelsProveVisibleCanvas },
    { id: "director-checkpoints", label: "Three distinct, separated checkpoints on one Director cut", pass: directorSamples.length >= 3 },
    { id: "runtime-budgets", label: "Run-scoped media, context, frame, and renderer budgets", pass: runBudgetsPass(run) && rendererCheckpointsWithinBudget },
    { id: "no-current-error", label: "No current or operator-observed browser error", pass: !runtime.lastError && explicitNoErrors },
  ];
  const missingFields = [];
  if (!normalizedDraft.operator) missingFields.push("operator");
  if (!normalizedDraft.observedAt) missingFields.push("observedAt");
  if (!normalizedDraft.browserDevice) missingFields.push("browserDevice");
  if (!normalizedDraft.viewport) missingFields.push("viewport");
  if (!normalizedDraft.songsTested.length) missingFields.push("songsTested");
  if (normalizedDraft.directorTimecodes.length < 3) missingFields.push("directorTimecodes");
  if (!normalizedDraft.evidencePaths.length) missingFields.push("evidencePaths");
  if (!normalizedDraft.consoleErrors) missingFields.push("consoleErrors");
  if (!Number.isFinite(observedAtMs)) missingFields.push("observedAtIso");
  if (!Number.isFinite(startAtMs)) missingFields.push("reviewStartIso");
  if (!Number.isFinite(endAtMs)) missingFields.push("reviewEndIso");
  if (Number.isFinite(startAtMs) && Number.isFinite(endAtMs) && endAtMs < startAtMs) missingFields.push("reviewTimeOrder");
  if (Number.isFinite(reviewDurationMs) && reviewDurationMs > MAX_REVIEW_DURATION_MS) missingFields.push("reviewDurationBound");
  if (reviewBoundsValid && !timestampWithinReview(normalizedDraft.observedAt, startAtMs, endAtMs)) missingFields.push("observedAtReviewBounds");
  const pendingChecks = [...REQUIRED_CHECK_IDS].filter((id) => normalizedDraft.checks[id] === "pending");
  const failedChecks = [...REQUIRED_CHECK_IDS].filter((id) => normalizedDraft.checks[id] === "fail");
  const failedSignals = automatedSignals.filter(({ pass }) => !pass).map(({ id }) => id);
  return {
    draft: normalizedDraft,
    diagnostics: runtime,
    service: serviceIdentity,
    revision: { start: startIdentity, end: endIdentity },
    browserDelivery: { start: deliveryStart, end: deliveryEnd },
    environmentSessions: sessions,
    checkpoints: samples,
    automatedSignals,
    missingFields,
    pendingChecks,
    failedChecks,
    failedSignals,
    canRecordPass: !missingFields.length && !pendingChecks.length && !failedChecks.length && !failedSignals.length,
    canRecordFailure: Boolean(normalizedDraft.operator && normalizedDraft.observedAt && normalizedDraft.notes && failedChecks.length),
  };
}

export function buildEchoRecordGardenAcceptanceReceipt({
  draft,
  diagnostics,
  service,
  contextStart = service,
  contextEnd = service,
  browserDeliveryStart = {},
  browserDeliveryEnd = {},
  browserLoadedChunkStart = browserDeliveryStart,
  browserLoadedChunkEnd = browserDeliveryEnd,
  environmentSessions = [],
  checkpoints = [],
  result = "pass",
  receivedAt = new Date().toISOString(),
} = {}) {
  const outcome = text(result, 20).toLowerCase();
  if (!new Set(["pass", "fail"]).has(outcome)) {
    throw Object.assign(new Error("Acceptance result must be pass or fail."), { code: "acceptance_result_invalid", statusCode: 422 });
  }
  const evaluation = evaluateEchoRecordGardenAcceptance({
    draft,
    diagnostics,
    service,
    contextStart,
    contextEnd,
    browserDeliveryStart,
    browserDeliveryEnd,
    browserLoadedChunkStart,
    browserLoadedChunkEnd,
    environmentSessions,
    checkpoints,
  });
  if (outcome === "pass" && !evaluation.canRecordPass) {
    throw Object.assign(new Error("Passing acceptance evidence is incomplete."), {
      code: "acceptance_incomplete",
      statusCode: 422,
      details: {
        missingFields: evaluation.missingFields,
        pendingChecks: evaluation.pendingChecks,
        failedChecks: evaluation.failedChecks,
        failedSignals: evaluation.failedSignals,
      },
    });
  }
  if (outcome === "fail" && !evaluation.canRecordFailure) {
    throw Object.assign(new Error("A failure receipt needs an operator, observation time, failed check, and reproduction notes."), {
      code: "acceptance_failure_incomplete",
      statusCode: 422,
    });
  }
  return {
    schemaVersion: ECHO_RECORD_GARDEN_ACCEPTANCE_SCHEMA,
    truthStatus: outcome === "pass"
      ? "human-operator-attestation-with-runtime-telemetry"
      : "human-operator-observed-failure-with-unverified-runtime-telemetry",
    result: outcome,
    receivedAt: text(receivedAt, 100),
    operatorAttestation: evaluation.draft,
    automatedSignals: evaluation.automatedSignals,
    runtime: evaluation.diagnostics,
    service: evaluation.service,
    revision: evaluation.revision,
    browserDelivery: evaluation.browserDelivery,
    environmentSessions: evaluation.environmentSessions,
    checkpoints: evaluation.checkpoints,
    authorityBoundaries: {
      browserObservationRequired: true,
      publicReleaseClaimed: false,
      mintClaimed: false,
      canonClaimed: false,
      rightsOwnershipTransferred: false,
    },
  };
}
