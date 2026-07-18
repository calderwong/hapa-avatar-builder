import { createHash } from "node:crypto";

export const ECHO_SCENE_KEYFRAME_PROCESS_SCHEMA = "hapa.echo.scene-keyframe-process.v1";
export const PROCESS_STATUSES = new Set(["planned", "running", "paused", "stop_after_current", "completed"]);
export const CLAIMABLE_LANES = new Set(["prompt", "image"]);
export const VIDEO_EXECUTION_POLICY = "hold-video-generation-v1";

const DEFAULT_SETTINGS = {
  concurrency: 1,
  perRunClaimLimit: 1,
  leaseMs: 10 * 60 * 1000,
  maxAttempts: 3,
};

const EPOCH = "1970-01-01T00:00:00.000Z";

/**
 * Create a serializable, storage-agnostic projection.  Persistence and event
 * append are intentionally outside this module so a caller can choose the
 * Builder outbox or a local journal without changing state behavior.
 */
export function createEchoSceneKeyframeProcess({ processId = "echo-scene-keyframes", settings = {}, counts = [] } = {}) {
  const process = {
    schemaVersion: ECHO_SCENE_KEYFRAME_PROCESS_SCHEMA,
    processId,
    status: "planned",
    settings: normalizeSettings(settings),
    counts: [],
    events: [],
  };
  return planEchoSceneKeyframeCounts(process, { counts, at: EPOCH });
}

/**
 * Change bounded worker throughput without rebuilding or invalidating any
 * count. Lowering concurrency below the number of live leases is refused so
 * an operator cannot create a projection that contradicts work in flight.
 */
export function configureEchoSceneKeyframeProcess(process, { settings = {}, at = EPOCH } = {}) {
  const next = clone(process);
  assertProcess(next);
  const configured = normalizeSettings({ ...next.settings, ...settings });
  const claimed = activeClaims(next).length;
  if (configured.concurrency < claimed) {
    throw new Error(`Concurrency ${configured.concurrency} is below ${claimed} active claims.`);
  }
  if (stableStringify(configured) === stableStringify(next.settings)) return next;
  const prior = next.settings;
  next.settings = configured;
  next.events.push({ type: "process-settings-configured", at, prior, settings: configured, activeClaims: claimed });
  return next;
}

/**
 * Add or reconcile four-count windows.  Replaying identical source-backed
 * windows is a no-op; changed input hashes preserve their old facts in history
 * and open a fresh content-addressed prompt quest.
 */
export function planEchoSceneKeyframeCounts(process, { counts = [], at = EPOCH } = {}) {
  let next = clone(process);
  assertProcess(next);
  const index = new Map(next.counts.map((count) => [count.id, count]));
  let created = 0;
  let invalidated = 0;

  for (const raw of counts) {
    const source = normalizeCountInput(raw);
    const current = index.get(source.id);
    if (!current) {
      const count = makeCount(source, next.settings, at);
      next.counts.push(count);
      index.set(count.id, count);
      created += 1;
      continue;
    }
    if (current.inputHash === source.inputHash && current.timingStatus === source.timingStatus) continue;
    const replacement = makeCount(source, next.settings, at, current);
    const position = next.counts.findIndex((count) => count.id === source.id);
    next.counts[position] = replacement;
    index.set(replacement.id, replacement);
    invalidated += 1;
  }

  if (created || invalidated) next.events.push({ type: "counts-planned", at, created, invalidated, countTotal: next.counts.length });
  return settleProcess(next, at);
}

export function startEchoSceneKeyframeProcess(process, { at = EPOCH } = {}) {
  const next = clone(process);
  assertProcess(next);
  if (next.status === "completed") return next;
  if (next.status !== "running") next.events.push({ type: "process-started", at, from: next.status });
  next.status = "running";
  return next;
}

export function pauseEchoSceneKeyframeProcess(process, { at = EPOCH } = {}) {
  const next = clone(process);
  assertProcess(next);
  if (next.status !== "completed") {
    next.status = "paused";
    next.events.push({ type: "process-paused", at, activeClaims: activeClaims(next).length });
  }
  return next;
}

export function requestEchoSceneKeyframeStopAfterCurrent(process, { at = EPOCH } = {}) {
  const next = clone(process);
  assertProcess(next);
  if (next.status === "completed") return next;
  next.status = "stop_after_current";
  next.events.push({ type: "stop-after-current-requested", at, activeClaims: activeClaims(next).length });
  return settleProcess(next, at);
}

export function resumeEchoSceneKeyframeProcess(process, { at = EPOCH } = {}) {
  return startEchoSceneKeyframeProcess(process, { at });
}

/**
 * Atomically select open work for one run.  Prompt work must precede image
 * work, image work must use the prompt output hash, and video is structurally
 * excluded even if a malformed persisted projection says it is open.
 */
export function claimEchoSceneKeyframeQuests(process, {
  runnerId = "codex",
  runId = "default-run",
  limit,
  lane = null,
  at = EPOCH,
} = {}) {
  const next = clone(process);
  assertProcess(next);
  if (next.status !== "running") return { process: next, claims: [] };

  const runLimit = Math.max(0, Math.min(
    finitePositive(limit, next.settings.perRunClaimLimit),
    next.settings.perRunClaimLimit,
  ));
  const active = activeClaims(next);
  const capacity = Math.max(0, next.settings.concurrency - active.length);
  const alreadyClaimedByRun = active.filter((row) => row.quest.runId === runId).length;
  const availableForRun = Math.max(0, runLimit - alreadyClaimedByRun);
  const requested = Math.min(capacity, availableForRun);
  if (!requested) return { process: next, claims: [] };

  if (lane !== null && !CLAIMABLE_LANES.has(lane)) throw new Error(`Unsupported claim lane: ${lane}`);
  const candidateLanes = lane ? [lane] : ["prompt", "image"];
  const candidates = next.counts
    .flatMap((count) => candidateLanes.map((candidateLane) => ({ count, lane: candidateLane, quest: count.lanes[candidateLane].quest })))
    .filter(({ count, lane, quest }) => canClaim(count, lane, quest));

  const claims = [];
  for (const candidate of candidates.slice(0, requested)) {
    const quest = candidate.quest;
    quest.status = "claimed";
    quest.attempts += 1;
    quest.claimedAt = at;
    quest.leaseExpiresAt = toIso(addMs(at, next.settings.leaseMs));
    quest.runnerId = runnerId;
    quest.runId = runId;
    claims.push(claimReceipt(candidate.count, candidate.lane, quest));
  }
  if (claims.length) next.events.push({ type: "quests-claimed", at, runnerId, runId, questIds: claims.map((claim) => claim.questId) });
  return { process: next, claims };
}

/**
 * Import an already verified artifact (for example, the accepted three-song
 * pilot) without replaying provider work. This is a bounded migration seam,
 * not a claim bypass: the caller must provide the existing artifact receipts.
 */
export function importEchoSceneKeyframeArtifacts(process, countId, {
  promptResult = null,
  imageResult = null,
  at = EPOCH,
} = {}) {
  const next = clone(process);
  assertProcess(next);
  const count = next.counts.find((candidate) => candidate.id === countId);
  if (!count) throw new Error(`Unknown Echo scene keyframe count: ${countId}`);
  if (count.timingStatus !== "ready") throw new Error(`Cannot import artifacts for count without timing truth: ${countId}`);

  const imported = [];
  if (promptResult) {
    const resultHash = promptResult.contentHash || hashValue(promptResult);
    count.lanes.prompt.artifact = { state: "ready", result: clone(promptResult), contentHash: resultHash, completedAt: at };
    count.lanes.prompt.quest.status = "complete";
    count.lanes.prompt.quest.completedAt = at;
    clearLease(count.lanes.prompt.quest);
    openImageQuest(count, next.settings, at);
    imported.push("prompt");
  }
  if (imageResult) {
    if (!promptResult && count.lanes.prompt.artifact.state !== "ready") throw new Error(`Image import requires a prompt artifact: ${countId}`);
    const resultHash = imageResult.contentHash || hashValue(imageResult);
    count.lanes.image.artifact = {
      state: imageResult.keyframeExists === false ? "candidate" : "keyframe_exists",
      result: clone(imageResult),
      contentHash: resultHash,
      completedAt: at,
    };
    count.lanes.image.quest.status = "complete";
    count.lanes.image.quest.completedAt = at;
    clearLease(count.lanes.image.quest);
    holdVideoQuest(count, next.settings, at);
    imported.push("image", "video-held");
  }
  if (imported.length) next.events.push({ type: "artifacts-imported", at, countId, lanes: imported });
  return settleProcess(next, at);
}

export function completeEchoSceneKeyframeQuest(process, questId, { result = {}, runnerId, at = EPOCH } = {}) {
  const next = clone(process);
  assertProcess(next);
  const found = findQuest(next, questId);
  if (!found) throw new Error(`Unknown Echo scene keyframe quest: ${questId}`);
  const { count, lane, laneState, quest } = found;
  if (lane === "video") throw new Error("Video generation is held by policy and cannot complete through this process.");
  assertClaimOwnership(quest, runnerId);

  quest.status = "complete";
  quest.completedAt = at;
  clearLease(quest);
  const resultHash = hashValue(result);
  if (lane === "prompt") {
    laneState.artifact = { state: "ready", result: clone(result), contentHash: result.contentHash || resultHash, completedAt: at };
    openImageQuest(count, next.settings, at);
  } else {
    laneState.artifact = {
      state: result.keyframeExists === false ? "candidate" : "keyframe_exists",
      result: clone(result),
      contentHash: result.contentHash || resultHash,
      completedAt: at,
    };
    holdVideoQuest(count, next.settings, at);
  }
  next.events.push({ type: "quest-completed", at, questId, countId: count.id, lane, resultHash });
  return settleProcess(next, at);
}

export function failEchoSceneKeyframeQuest(process, questId, { error = "unknown failure", runnerId, retry = true, at = EPOCH } = {}) {
  const next = clone(process);
  assertProcess(next);
  const found = findQuest(next, questId);
  if (!found) throw new Error(`Unknown Echo scene keyframe quest: ${questId}`);
  const { count, lane, laneState, quest } = found;
  if (lane === "video") throw new Error("Video generation is held by policy and cannot fail as a claim.");
  assertClaimOwnership(quest, runnerId);
  clearLease(quest);
  quest.lastError = String(error);
  quest.failedAt = at;
  quest.status = retry && quest.attempts < next.settings.maxAttempts ? "open" : "failed";
  laneState.artifact = { ...laneState.artifact, state: quest.status === "failed" ? "failed" : laneState.artifact.state, lastError: String(error) };
  next.events.push({ type: "quest-failed", at, questId, countId: count.id, lane, retrying: quest.status === "open" });
  return settleProcess(next, at);
}

export function releaseExpiredEchoSceneKeyframeLeases(process, { at = EPOCH } = {}) {
  const next = clone(process);
  assertProcess(next);
  const released = [];
  forEachQuest(next, (count, lane, _laneState, quest) => {
    if (!CLAIMABLE_LANES.has(lane) || quest.status !== "claimed" || !quest.leaseExpiresAt) return;
    if (Date.parse(quest.leaseExpiresAt) > Date.parse(at)) return;
    const expiredClaim = { questId: quest.id, runnerId: quest.runnerId, runId: quest.runId, leaseExpiresAt: quest.leaseExpiresAt };
    clearLease(quest);
    quest.status = quest.attempts >= next.settings.maxAttempts ? "failed" : "open";
    quest.lastError = "lease_expired";
    released.push(expiredClaim);
  });
  if (released.length) next.events.push({ type: "expired-leases-released", at, released });
  return settleProcess(next, at);
}

export function echoSceneKeyframeProcessSummary(process) {
  assertProcess(process);
  const summary = {
    status: process.status,
    countTotal: process.counts.length,
    timingReady: 0,
    needsTimingTruth: 0,
    lanes: {
      prompt: emptyLaneSummary(),
      image: emptyLaneSummary(),
      video: emptyLaneSummary(),
    },
    keyframes: { candidates: 0, exists: 0 },
    activeClaims: activeClaims(process).length,
    claimableNow: 0,
    complete: process.status === "completed",
  };
  for (const count of process.counts) {
    if (count.timingStatus === "ready") summary.timingReady += 1;
    else summary.needsTimingTruth += 1;
    for (const lane of ["prompt", "image", "video"]) {
      const laneState = count.lanes[lane];
      summary.lanes[lane].artifacts[laneState.artifact.state] = (summary.lanes[lane].artifacts[laneState.artifact.state] || 0) + 1;
      summary.lanes[lane].quests[laneState.quest.status] = (summary.lanes[lane].quests[laneState.quest.status] || 0) + 1;
    }
    if (count.lanes.image.artifact.state === "candidate") summary.keyframes.candidates += 1;
    if (count.lanes.image.artifact.state === "keyframe_exists") summary.keyframes.exists += 1;
    for (const lane of ["prompt", "image"]) if (canClaim(count, lane, count.lanes[lane].quest)) summary.claimableNow += 1;
  }
  return summary;
}

export function echoSceneKeyframeCountStatus(count) {
  if (count.timingStatus !== "ready") return "needs_timing_truth";
  const { prompt, image, video } = count.lanes;
  if ([prompt, image, video].some((lane) => lane.artifact.state === "stale")) return "stale";
  if (image.artifact.state === "keyframe_exists" && video.quest.status === "held") return "video_quest_held";
  if (image.artifact.state === "keyframe_exists") return "keyframe_exists";
  if (image.artifact.state === "candidate") return "keyframe_candidate";
  if (image.quest.status === "open") return "image_quest_open";
  if (prompt.artifact.state === "ready") return "prompt_ready";
  if (prompt.quest.status === "open") return "prompt_quest_open";
  return "missing_prompt";
}

function makeCount(source, settings, at, prior = null) {
  const history = prior ? [...prior.history, snapshotForHistory(prior, at, "input_changed")] : [];
  const count = {
    id: source.id,
    songId: source.songId,
    countOrdinal: source.countOrdinal,
    beatStart: source.beatStart,
    beatEndExclusive: source.beatEndExclusive,
    startSeconds: source.startSeconds,
    endSeconds: source.endSeconds,
    inputHash: source.inputHash,
    timingStatus: source.timingStatus,
    history,
    lanes: {
      prompt: makeLane("prompt", source, settings, at),
      image: makeLane("image", source, settings, at),
      video: makeLane("video", source, settings, at),
    },
  };
  return count;
}

function makeLane(lane, source, settings, at) {
  if (source.timingStatus !== "ready") {
    return {
      artifact: { state: "missing" },
      quest: makeQuest(lane, source, source.inputHash, lane === "video" ? "blocked_by_keyframe" : "not_open", settings, at),
    };
  }
  if (lane === "prompt") return { artifact: { state: "missing" }, quest: makeQuest(lane, source, source.inputHash, "open", settings, at) };
  if (lane === "image") return { artifact: { state: "missing" }, quest: makeQuest(lane, source, source.inputHash, "blocked_by_prompt", settings, at) };
  return { artifact: { state: "missing" }, quest: makeQuest(lane, source, source.inputHash, "blocked_by_keyframe", settings, at) };
}

function openImageQuest(count, settings, at) {
  const promptHash = count.lanes.prompt.artifact.contentHash;
  const existing = count.lanes.image.quest;
  if (existing.status === "complete" && existing.inputHash === promptHash) return;
  const source = sourceFromCount(count);
  count.lanes.image.quest = makeQuest("image", source, promptHash, "open", settings, at);
}

function holdVideoQuest(count, settings, at) {
  const imageHash = count.lanes.image.artifact.contentHash;
  const source = sourceFromCount(count);
  count.lanes.video.quest = makeQuest("video", source, imageHash, "held", settings, at);
  count.lanes.video.quest.executionPolicy = VIDEO_EXECUTION_POLICY;
}

function makeQuest(lane, source, inputHash, status, settings, at) {
  const stableInputs = { schema: ECHO_SCENE_KEYFRAME_PROCESS_SCHEMA, lane, countId: source.id, songId: source.songId, countOrdinal: source.countOrdinal, inputHash };
  const contentHash = hashValue(stableInputs);
  return {
    id: `echo-scene-quest:${contentHash}`,
    lane,
    contentHash,
    inputHash,
    status,
    attempts: 0,
    maxAttempts: settings.maxAttempts,
    createdAt: at,
    executionPolicy: lane === "video" ? VIDEO_EXECUTION_POLICY : "codex-gpt-image-v1",
  };
}

function canClaim(count, lane, quest) {
  return count.timingStatus === "ready" && CLAIMABLE_LANES.has(lane) && quest.status === "open";
}

function findQuest(process, questId) {
  for (const count of process.counts) {
    for (const lane of ["prompt", "image", "video"]) {
      const laneState = count.lanes[lane];
      if (laneState.quest.id === questId) return { count, lane, laneState, quest: laneState.quest };
    }
  }
  return null;
}

function activeClaims(process) {
  const claims = [];
  forEachQuest(process, (count, lane, _laneState, quest) => {
    if (quest.status === "claimed") claims.push({ count, lane, quest });
  });
  return claims;
}

function forEachQuest(process, callback) {
  for (const count of process.counts) for (const lane of ["prompt", "image", "video"]) callback(count, lane, count.lanes[lane], count.lanes[lane].quest);
}

function claimReceipt(count, lane, quest) {
  return {
    questId: quest.id,
    lane,
    countId: count.id,
    songId: count.songId,
    countOrdinal: count.countOrdinal,
    contentHash: quest.contentHash,
    inputHash: quest.inputHash,
    leaseExpiresAt: quest.leaseExpiresAt,
  };
}

function settleProcess(process, at) {
  const active = activeClaims(process).length;
  if (allCountsHaveKeyframes(process)) {
    if (process.status !== "completed") process.events.push({ type: "process-completed", at });
    process.status = "completed";
    return process;
  }
  if (process.status === "stop_after_current" && active === 0) {
    process.status = "paused";
    process.events.push({ type: "stopped-after-current", at });
  }
  return process;
}

function allCountsHaveKeyframes(process) {
  return process.counts.length > 0 && process.counts.every((count) => count.timingStatus === "ready" && count.lanes.image.artifact.state === "keyframe_exists");
}

function normalizeCountInput(raw = {}) {
  const songId = requireString(raw.songId, "count.songId");
  const countOrdinal = Number(raw.countOrdinal);
  if (!Number.isInteger(countOrdinal) || countOrdinal < 0) throw new Error("count.countOrdinal must be a non-negative integer");
  const id = raw.id || `echo-scene-count:${songId}:${String(countOrdinal).padStart(6, "0")}`;
  const timingStatus = raw.timingStatus === "ready" || raw.timingStatus === "verified" ? "ready" : "needs_timing_truth";
  const inputHash = raw.inputHash || hashValue({ songId, countOrdinal, beatStart: raw.beatStart, beatEndExclusive: raw.beatEndExclusive, startSeconds: raw.startSeconds, endSeconds: raw.endSeconds, timingStatus, sourceRevision: raw.sourceRevision || null });
  return { id, songId, countOrdinal, inputHash, timingStatus, beatStart: raw.beatStart ?? null, beatEndExclusive: raw.beatEndExclusive ?? null, startSeconds: raw.startSeconds ?? null, endSeconds: raw.endSeconds ?? null };
}

function sourceFromCount(count) {
  return { id: count.id, songId: count.songId, countOrdinal: count.countOrdinal, inputHash: count.inputHash };
}

function snapshotForHistory(count, at, reason) {
  return { inputHash: count.inputHash, timingStatus: count.timingStatus, lanes: clone(count.lanes), invalidatedAt: at, reason };
}

function clearLease(quest) {
  delete quest.claimedAt;
  delete quest.leaseExpiresAt;
  delete quest.runnerId;
  delete quest.runId;
}

function assertClaimOwnership(quest, runnerId) {
  if (quest.status !== "claimed") throw new Error(`Quest ${quest.id} is not claimed.`);
  if (runnerId && quest.runnerId !== runnerId) throw new Error(`Quest ${quest.id} is claimed by ${quest.runnerId}, not ${runnerId}.`);
}

function normalizeSettings(settings) {
  return {
    concurrency: finitePositive(settings.concurrency, DEFAULT_SETTINGS.concurrency),
    perRunClaimLimit: finitePositive(settings.perRunClaimLimit, DEFAULT_SETTINGS.perRunClaimLimit),
    leaseMs: finitePositive(settings.leaseMs, DEFAULT_SETTINGS.leaseMs),
    maxAttempts: finitePositive(settings.maxAttempts, DEFAULT_SETTINGS.maxAttempts),
  };
}

function emptyLaneSummary() { return { artifacts: {}, quests: {} }; }
function finitePositive(value, fallback) { return Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : fallback; }
function requireString(value, label) { if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty string`); return value; }
function addMs(at, ms) { return Date.parse(at) + ms; }
function toIso(value) { return new Date(value).toISOString(); }
function clone(value) { return structuredClone(value); }
function assertProcess(process) { if (!process || process.schemaVersion !== ECHO_SCENE_KEYFRAME_PROCESS_SCHEMA || !PROCESS_STATUSES.has(process.status)) throw new Error("Invalid Echo scene keyframe process projection"); }
function hashValue(value) { return createHash("sha256").update(stableStringify(value)).digest("hex"); }
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
