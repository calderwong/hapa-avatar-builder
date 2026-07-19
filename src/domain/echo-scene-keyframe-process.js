import { createHash } from "node:crypto";

export const ECHO_SCENE_KEYFRAME_PROCESS_SCHEMA = "hapa.echo.scene-keyframe-process.v1";
export const ECHO_SONG_VISUAL_SCREENPLAY_SCHEMA = "hapa.echo.full-song-visual-screenplay.v1";
export const ECHO_SONG_SCREENPLAY_AUTHORING_METHOD = "direct_llm_analysis";
export const ECHO_SONG_SCREENPLAY_PROMPT_AUTHORING_POLICY = "no-deterministic-scene-generation";
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

/**
 * Validate a whole-song prompt screenplay without changing process state.
 * A screenplay is intentionally a separate immutable planning artifact: it
 * stages approved prompt work in bulk, but is not an implicit authorization
 * to queue images or video.
 */
export function validateEchoSongVisualScreenplay(process, screenplay, { requireApproval = false } = {}) {
  assertProcess(process);
  if (!screenplay || screenplay.schemaVersion !== ECHO_SONG_VISUAL_SCREENPLAY_SCHEMA) {
    throw new Error(`Invalid screenplay schema; expected ${ECHO_SONG_VISUAL_SCREENPLAY_SCHEMA}.`);
  }
  const songId = requireString(screenplay.songId, "screenplay.songId");
  validateFullSongScreenplayHeader(screenplay, { requireApproval });
  const entries = flattenScreenplaySequences(screenplay);
  if (!entries?.length) throw new Error("screenplay.counts must be a non-empty array");

  const targetCounts = process.counts
    .filter((count) => count.songId === songId && count.timingStatus === "ready")
    .sort((left, right) => left.countOrdinal - right.countOrdinal);
  if (!targetCounts.length) throw new Error(`No timing-ready counts found for screenplay song: ${songId}`);
  if (entries.length !== targetCounts.length) {
    throw new Error(`Screenplay count coverage mismatch for ${songId}: expected ${targetCounts.length}, received ${entries.length}.`);
  }

  const seen = new Set();
  const results = [];
  for (let index = 0; index < targetCounts.length; index += 1) {
    const count = targetCounts[index];
    const entry = entries[index];
    if (!entry || typeof entry !== "object") throw new Error(`Invalid screenplay entry at index ${index}.`);
    const countId = requireString(entry.countId, `screenplay.counts[${index}].countId`);
    if (seen.has(countId)) throw new Error(`Duplicate screenplay countId: ${countId}`);
    seen.add(countId);
    if (countId !== count.id || Number(entry.ordinal) !== count.countOrdinal) {
      throw new Error(`Screenplay counts must exactly match source order; expected ${count.id} at index ${index}.`);
    }
    if (!sameScreenplayWindow(entry.window, count)) {
      throw new Error(`Stale screenplay timing window for ${countId}.`);
    }
    validateScreenplayPrompt(entry.prompt, countId);
    validateScreenplaySemanticAndSceneEntry(entry, countId);
    validateScreenplayCastAppearance(screenplay, entry, countId);
    if (hasActiveClaim(count)) throw new Error(`Cannot import screenplay over active claim: ${countId}`);
    const runtimePrompt = runtimePromptFromScreenplayCount(screenplay, entry, { previous: targetCounts[index - 1] || null, next: targetCounts[index + 1] || null });
    const promptHash = canonicalRuntimePromptHash(runtimePrompt);
    if (entry.prompt.promptHash && !hashMatches(entry.prompt.promptHash, promptHash)) {
      throw new Error(`Screenplay promptContentHash does not match prompt for ${countId}.`);
    }
    runtimePrompt.contentHash = promptHash;
    const currentPrompt = count.lanes.prompt.artifact;
    const preserveExistingMedia = entry.disposition === "preserve_existing_media";
    if (!["preserve_existing_media", "candidate_direction_only"].includes(entry.disposition)) {
      throw new Error(`Screenplay disposition is invalid for ${countId}.`);
    }
    const hasExistingMedia = currentPrompt.state === "ready"
      || count.lanes.image.artifact.state !== "missing"
      || count.lanes.video.artifact.state !== "missing"
      || count.lanes.video.quest.status === "held";
    if (preserveExistingMedia && !hasExistingMedia) {
      throw new Error(`Existing-media screenplay disposition requires existing prompt or media state: ${countId}`);
    }
    if (!preserveExistingMedia && currentPrompt.state === "ready" && currentPrompt.contentHash !== promptHash) {
      throw new Error(`Cannot replace existing prompt artifact through screenplay import: ${countId}`);
    }
    results.push({ count, entry, runtimePrompt, promptHash, preserveExistingMedia });
  }
  validateScreenplaySequenceQuality(entries, screenplay);
  const screenplayHash = validateEchoSongVisualScreenplayContentHash(screenplay);
  return {
    songId,
    counts: results,
    screenplayHash,
    stagedCountIds: results.filter((result) => !result.preserveExistingMedia).map((result) => result.count.id),
    preservedCountIds: results.filter((result) => result.preserveExistingMedia).map((result) => result.count.id),
  };
}

/**
 * Stage approved prompts from a validated full-song screenplay. This updates
 * prompt lane facts only; image/video lane objects intentionally remain
 * unchanged. An explicit activation step is required before image claims can
 * be opened.
 */
export function importApprovedEchoSongVisualScreenplay(process, screenplay, {
  runnerId = "codex",
  runId = "screenplay-import",
  approvalReceipt = null,
  at = EPOCH,
} = {}) {
  if (!approvalReceipt) throw new Error("Screenplay import requires an approval receipt.");
  const validation = validateEchoSongVisualScreenplay(process, screenplay, { requireApproval: true });
  validateScreenplayReviewReceipt(approvalReceipt, screenplay, validation.screenplayHash);
  const next = clone(process);
  const originalDownstream = new Map(next.counts.map((count) => [count.id, stableStringify({ image: count.lanes.image, video: count.lanes.video })]));
  const imported = [];
  const preserved = [];
  for (const { count: sourceCount, entry, runtimePrompt, promptHash, preserveExistingMedia } of validation.counts) {
    const count = next.counts.find((candidate) => candidate.id === sourceCount.id);
    if (preserveExistingMedia) {
      preserved.push(count.id);
      continue;
    }
    const existing = count.lanes.prompt.artifact;
    const screenplayRef = {
      songId: validation.songId,
      screenplayHash: validation.screenplayHash,
        promptInputHash: entry.prompt.promptHash || null,
      approvalReceipt: clone(approvalReceipt),
    };
    if (existing.state === "ready" && existing.contentHash === promptHash) {
      if (stableStringify(existing.screenplayRef || null) === stableStringify(screenplayRef)) continue;
      count.lanes.prompt.artifact = { ...existing, screenplayRef };
    } else {
      count.lanes.prompt.artifact = {
        state: "ready",
        result: clone(runtimePrompt),
        contentHash: promptHash,
        completedAt: at,
        screenplayRef,
      };
    }
    count.lanes.prompt.quest.status = "complete";
    count.lanes.prompt.quest.completedAt = at;
    clearLease(count.lanes.prompt.quest);
    imported.push(count.id);
  }
  for (const count of next.counts) {
    if (originalDownstream.get(count.id) !== stableStringify({ image: count.lanes.image, video: count.lanes.video })) {
      throw new Error(`Screenplay import attempted to mutate downstream lane state: ${count.id}`);
    }
  }
  if (imported.length || preserved.length) {
    next.events.push({
      type: "song-screenplay-prompts-imported",
      at,
      songId: validation.songId,
      screenplayHash: validation.screenplayHash,
      approvalReceipt: clone(approvalReceipt),
      runnerId,
      runId,
      countIds: imported,
      preservedCountIds: preserved,
    });
  }
  return settleProcess(next, at);
}

/**
 * Explicitly open content-addressed image quests for previously staged
 * screenplay prompts. This intentionally does not generate images and never
 * alters video lane state.
 */
export function activateEchoSongVisualScreenplayImages(process, {
  songId,
  screenplayHash,
  countIds = null,
  at = EPOCH,
} = {}) {
  const next = clone(process);
  assertProcess(next);
  requireString(songId, "songId");
  requireString(screenplayHash, "screenplayHash");
  const requestedIds = countIds === null ? null : new Set(countIds);
  if (requestedIds && requestedIds.size !== countIds.length) throw new Error("countIds contains duplicates.");
  const candidates = next.counts.filter((count) => count.songId === songId
    && count.lanes.prompt.artifact.state === "ready"
    && count.lanes.prompt.artifact.screenplayRef?.screenplayHash === screenplayHash);
  const selected = requestedIds
    ? candidates.filter((count) => requestedIds.has(count.id))
    : candidates;
  if (!selected.length) throw new Error(`No staged screenplay prompts found for ${songId}.`);
  if (requestedIds && selected.length !== requestedIds.size) throw new Error("Some requested countIds are not staged by this screenplay.");

  const originalVideo = new Map(next.counts.map((count) => [count.id, stableStringify(count.lanes.video)]));
  const activated = [];
  for (const count of selected) {
    if (count.timingStatus !== "ready" || hasActiveClaim(count)) throw new Error(`Cannot activate image quest with active/invalid state: ${count.id}`);
    const image = count.lanes.image;
    if (image.artifact.state !== "missing") {
      throw new Error(`Cannot activate image quest with existing image artifact: ${count.id}`);
    }
    const promptHash = count.lanes.prompt.artifact.contentHash;
    if (image.quest.status === "open" && image.quest.inputHash === promptHash) continue;
    if (image.quest.status !== "blocked_by_prompt") {
      throw new Error(`Cannot activate image quest from ${image.quest.status}: ${count.id}`);
    }
    openImageQuest(count, next.settings, at);
    activated.push(count.id);
  }
  for (const count of next.counts) {
    if (originalVideo.get(count.id) !== stableStringify(count.lanes.video)) {
      throw new Error(`Screenplay image activation attempted to mutate video lane state: ${count.id}`);
    }
  }
  if (activated.length) next.events.push({ type: "song-screenplay-images-activated", at, songId, screenplayHash, countIds: activated });
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

function validateFullSongScreenplayHeader(screenplay, { requireApproval }) {
  for (const key of ["sourceRevision", "semanticMining", "avatarContinuity", "sequencePlan", "generationPolicy", "authoringProvenance"]) {
    if (!screenplay[key]) throw new Error(`Screenplay ${key} is required.`);
  }
  for (const key of ["songContextHash", "lyricsHash", "timingHash", "seedSetHash", "promptPolicyHash"]) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(String(screenplay.sourceRevision[key] || ""))) throw new Error(`Screenplay sourceRevision.${key} requires a SHA-256 value.`);
  }
  if (!Array.isArray(screenplay.avatarContinuity.seedAssets) || !screenplay.avatarContinuity.seedAssets.length) throw new Error("Screenplay avatarContinuity.seedAssets is required.");
  const seedIds = new Set();
  for (const seed of screenplay.avatarContinuity.seedAssets) {
    for (const key of ["avatarId", "assetId", "contentHash", "retrievalHandle"]) requireString(seed?.[key], `screenplay.avatarContinuity.seedAssets.${key}`);
    if (seedIds.has(seed.assetId)) throw new Error(`Duplicate screenplay Avatar seed assetId: ${seed.assetId}`);
    seedIds.add(seed.assetId);
  }
  if (screenplay.avatarContinuity.castAttribution !== undefined) {
    if (!Array.isArray(screenplay.avatarContinuity.castAttribution)) throw new Error("Screenplay avatarContinuity.castAttribution must be an array.");
    const castIds = new Set();
    for (const member of screenplay.avatarContinuity.castAttribution) {
      for (const key of ["avatarId", "name", "castClass", "species", "baseCharacterId", "evidenceStatus", "appearanceRule"]) requireString(member?.[key], `screenplay.avatarContinuity.castAttribution.${key}`);
      if (castIds.has(member.avatarId)) throw new Error(`Duplicate screenplay cast attribution: ${member.avatarId}`);
      castIds.add(member.avatarId);
      if (!Array.isArray(member.seedAssetIds) || !member.seedAssetIds.length || member.seedAssetIds.some((assetId) => !seedIds.has(assetId))) {
        throw new Error(`Screenplay cast attribution requires registered seed assets for ${member.avatarId}.`);
      }
      if (member.castClass === "referenced-avatar" && !/(confirmed|verified|resolved|explicit|user)/u.test(String(member.evidenceStatus).toLowerCase())) {
        throw new Error(`Referenced Avatar ${member.avatarId} requires resolved attribution evidence.`);
      }
    }
  }
  if (screenplay.avatarContinuity.castPolicy) validateAuthoringMethodAudit(screenplay.authoringMethodAudit, screenplay.authoringProvenance?.agentTaskName);
  if (screenplay.generationPolicy.promptImportMode !== "stage_only" || screenplay.generationPolicy.imageActivationRequired !== true
    || screenplay.generationPolicy.providerPolicy !== "codex-built-in-gpt-image-only" || screenplay.generationPolicy.videoPolicy !== "held-until-separately-enabled") {
    throw new Error("Screenplay generationPolicy must preserve stage-only Codex image and held-video policy.");
  }
  if (requireApproval && !["staged", "approved-for-selective-activation"].includes(screenplay.review?.status)) {
    throw new Error("Screenplay import requires an immutable staged screenplay; approval authority is supplied by the separate review receipt.");
  }
  requireString(screenplay.provenance?.contentHash, "screenplay.provenance.contentHash");
  validateScreenplayAuthoringProvenance(screenplay.authoringProvenance);
}

function validateAuthoringMethodAudit(audit, agentTaskName) {
  if (!audit || typeof audit !== "object") throw new Error("Enhanced screenplay authoringMethodAudit is required.");
  if (requireString(audit.soleAuthorTaskName, "screenplay.authoringMethodAudit.soleAuthorTaskName") !== agentTaskName) {
    throw new Error("Screenplay authoringMethodAudit sole author must match authoringProvenance.agentTaskName.");
  }
  if (audit.subagentsSpawned !== 0) throw new Error("Screenplay authoringMethodAudit must report zero subagents spawned.");
  if (!Array.isArray(audit.rejectedOrSameSongCandidatesRead) || audit.rejectedOrSameSongCandidatesRead.length) {
    throw new Error("Screenplay authoringMethodAudit must report no rejected or same-song screenplay candidates read.");
  }
  if (!Array.isArray(audit.foreignQualityReferencesRead)) throw new Error("Screenplay authoringMethodAudit.foreignQualityReferencesRead must be an array.");
  if (!Array.isArray(audit.continuedOwnDraftPaths)) throw new Error("Screenplay authoringMethodAudit.continuedOwnDraftPaths must be an array.");
  if (audit.authoredFieldAutomationUsed !== false || !Array.isArray(audit.authoredFieldTools) || audit.authoredFieldTools.length) {
    throw new Error("Screenplay authoringMethodAudit must report no authored-field automation or tools.");
  }
  if (!Array.isArray(audit.sourceFilesRead) || audit.sourceFilesRead.length < 3 || audit.sourceFilesRead.some((file) => typeof file !== "string" || !file.trim())) {
    throw new Error("Screenplay authoringMethodAudit requires at least three explicit source files.");
  }
  if (!Number.isFinite(Date.parse(audit.attestedAt))) throw new Error("Screenplay authoringMethodAudit.attestedAt must be a valid date-time.");
}

/**
 * Provenance is intentionally part of the planning artifact rather than of a
 * process event.  This makes a candidate independently auditable before it is
 * ever staged, and prevents a deterministic or legacy artifact from gaining
 * import authority merely by being marked approved.
 */
function validateScreenplayAuthoringProvenance(provenance) {
  if (!provenance || typeof provenance !== "object") throw new Error("Screenplay authoringProvenance is required.");
  if (provenance.method === "legacy_heuristic" || provenance.method === "rejected") {
    throw new Error(`Screenplay authoringProvenance.method=${provenance.method} is permanently unimportable.`);
  }
  if (provenance.method !== ECHO_SONG_SCREENPLAY_AUTHORING_METHOD) {
    throw new Error(`Screenplay authoringProvenance.method must be ${ECHO_SONG_SCREENPLAY_AUTHORING_METHOD}.`);
  }
  for (const key of ["requestedModel", "agentTaskName", "sourcePacketHash", "instructionHash", "startedAt", "completedAt", "artifactHash"]) {
    requireString(provenance[key], `screenplay.authoringProvenance.${key}`);
  }
  if (provenance.promptAuthoringPolicy !== ECHO_SONG_SCREENPLAY_PROMPT_AUTHORING_POLICY) {
    throw new Error(`Screenplay authoringProvenance.promptAuthoringPolicy must be ${ECHO_SONG_SCREENPLAY_PROMPT_AUTHORING_POLICY}.`);
  }
  if (provenance.heuristicGeneratorUsed !== false) {
    throw new Error("Screenplay authoringProvenance.heuristicGeneratorUsed must be false.");
  }
  const startedAt = Date.parse(provenance.startedAt);
  const completedAt = Date.parse(provenance.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) {
    throw new Error("Screenplay authoringProvenance timestamps must be valid and completedAt must not precede startedAt.");
  }
  const expectedArtifactHash = deriveEchoSongVisualScreenplayAuthoringProvenanceHash(provenance);
  if (!hashMatches(provenance.artifactHash, expectedArtifactHash)) {
    throw new Error("Screenplay authoringProvenance.artifactHash does not match its attested authoring payload.");
  }
  const attestation = provenance.attestation;
  if (!attestation || typeof attestation !== "object") throw new Error("Screenplay authoringProvenance.attestation is required.");
  if (attestation.type !== "authoring-provenance-v1" || !hashMatches(attestation.artifactHash, expectedArtifactHash)) {
    throw new Error("Screenplay authoringProvenance.attestation must bind the authoring artifact hash.");
  }
  requireString(attestation.attestedBy, "screenplay.authoringProvenance.attestation.attestedBy");
  requireString(attestation.attestedAt, "screenplay.authoringProvenance.attestation.attestedAt");
  if (!Number.isFinite(Date.parse(attestation.attestedAt)) || Date.parse(attestation.attestedAt) < completedAt) {
    throw new Error("Screenplay authoringProvenance.attestation.attestedAt must be valid and no earlier than completedAt.");
  }
}

export function deriveEchoSongVisualScreenplayAuthoringProvenanceHash(provenance) {
  const payload = {
    method: provenance?.method,
    requestedModel: provenance?.requestedModel,
    agentTaskName: provenance?.agentTaskName,
    sourcePacketHash: provenance?.sourcePacketHash,
    instructionHash: provenance?.instructionHash,
    startedAt: provenance?.startedAt,
    completedAt: provenance?.completedAt,
    promptAuthoringPolicy: provenance?.promptAuthoringPolicy,
    heuristicGeneratorUsed: provenance?.heuristicGeneratorUsed,
  };
  return `sha256:${hashValue(payload)}`;
}

/**
 * Content identity for the complete screenplay artifact. The declared hash is
 * removed from the hash preimage to avoid a self-reference; all authoring
 * provenance, prompt hashes, review state, semantic analysis, and scene text
 * remain in the preimage.
 */
export function deriveEchoSongVisualScreenplayContentHash(screenplay) {
  const payload = clone(screenplay || {});
  if (payload.provenance && typeof payload.provenance === "object") delete payload.provenance.contentHash;
  return `sha256:${hashValue(payload)}`;
}

export function validateEchoSongVisualScreenplayContentHash(screenplay) {
  const declared = requireString(screenplay?.provenance?.contentHash, "screenplay.provenance.contentHash");
  const expected = deriveEchoSongVisualScreenplayContentHash(screenplay);
  if (!hashMatches(declared, expected)) {
    throw new Error("Screenplay provenance.contentHash does not match canonical screenplay content.");
  }
  return expected;
}

/**
 * Deterministic metadata-only finalization. It never invents scene direction:
 * prompt/semantic/shot text is copied byte-for-byte from the supplied JSON
 * value, while mechanically derived hashes and explicit orchestration metadata
 * are replaced with their canonical values.
 */
export function finalizeEchoSongVisualScreenplayMetadata(screenplay, {
  requestedModel,
  agentTaskName,
  sourcePacketHash,
  instructionHash,
  startedAt,
  completedAt,
  attestedBy,
  attestedAt,
  createdBy,
  createdAt,
} = {}) {
  if (!screenplay || screenplay.schemaVersion !== ECHO_SONG_VISUAL_SCREENPLAY_SCHEMA) {
    throw new Error(`Invalid screenplay schema; expected ${ECHO_SONG_VISUAL_SCREENPLAY_SCHEMA}.`);
  }
  for (const [label, value] of Object.entries({ requestedModel, agentTaskName, sourcePacketHash, instructionHash, startedAt, completedAt, attestedBy, attestedAt, createdBy, createdAt })) {
    requireString(value, `finalizer.${label}`);
  }
  for (const [label, value] of Object.entries({ sourcePacketHash, instructionHash })) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(value)) throw new Error(`finalizer.${label} must be a sha256:<64 lowercase hex> hash.`);
  }
  const started = Date.parse(startedAt);
  const completed = Date.parse(completedAt);
  const attested = Date.parse(attestedAt);
  const created = Date.parse(createdAt);
  if (![started, completed, attested, created].every(Number.isFinite)) throw new Error("Finalizer timestamps must be valid ISO date-time values.");
  if (completed < started) throw new Error("finalizer.completedAt must not precede startedAt.");
  if (attested < completed) throw new Error("finalizer.attestedAt must not precede completedAt.");

  const finalized = clone(screenplay);
  const counts = flattenScreenplaySequences(finalized);
  if (!counts.length) throw new Error("screenplay.counts must be a non-empty array");
  for (const [index, entry] of counts.entries()) {
    if (!entry?.prompt || typeof entry.prompt !== "object") throw new Error(`Screenplay prompt is missing for ${entry?.countId || `index ${index}`}.`);
    entry.prompt.promptHash = deriveEchoSongVisualScreenplayPromptHash(finalized, entry, {
      previous: index ? { id: counts[index - 1].countId } : null,
      next: index < counts.length - 1 ? { id: counts[index + 1].countId } : null,
    });
    delete entry.sequenceDiversityGate;
    delete entry.sequenceId;
  }

  finalized.authoringProvenance = {
    method: ECHO_SONG_SCREENPLAY_AUTHORING_METHOD,
    requestedModel,
    agentTaskName,
    sourcePacketHash,
    instructionHash,
    startedAt,
    completedAt,
    promptAuthoringPolicy: ECHO_SONG_SCREENPLAY_PROMPT_AUTHORING_POLICY,
    heuristicGeneratorUsed: false,
    artifactHash: "pending",
    attestation: {
      type: "authoring-provenance-v1",
      artifactHash: "pending",
      attestedBy,
      attestedAt,
    },
  };
  finalized.authoringProvenance.artifactHash = deriveEchoSongVisualScreenplayAuthoringProvenanceHash(finalized.authoringProvenance);
  finalized.authoringProvenance.attestation.artifactHash = finalized.authoringProvenance.artifactHash;
  finalized.provenance = {
    ...(finalized.provenance || {}),
    createdAt,
    createdBy,
    contentHash: "pending",
  };
  finalized.provenance.contentHash = deriveEchoSongVisualScreenplayContentHash(finalized);
  return finalized;
}

function validateScreenplayReviewReceipt(receipt, screenplay, screenplayHash) {
  if (!receipt || typeof receipt !== "object") throw new Error("Screenplay import requires a separate review receipt.");
  for (const key of ["id", "reviewedBy", "reviewedAt", "screenplayHash", "authoringArtifactHash"]) {
    requireString(receipt[key], `approvalReceipt.${key}`);
  }
  if (receipt.status !== "approved" || receipt.reviewType !== "independent_screenplay_review") {
    throw new Error("Screenplay import requires an approved independent_screenplay_review receipt.");
  }
  if (!Number.isFinite(Date.parse(receipt.reviewedAt))) throw new Error("approvalReceipt.reviewedAt must be a valid timestamp.");
  if (!hashMatches(receipt.screenplayHash, screenplayHash)) throw new Error("approvalReceipt.screenplayHash must match the validated screenplay.");
  if (!hashMatches(receipt.authoringArtifactHash, screenplay.authoringProvenance.artifactHash)) {
    throw new Error("approvalReceipt.authoringArtifactHash must match screenplay authoring provenance.");
  }
  const author = screenplay.authoringProvenance;
  if (receipt.reviewedBy === author.agentTaskName || receipt.reviewedBy === author.attestation.attestedBy) {
    throw new Error("approvalReceipt must be independent from the screenplay authoring attestation.");
  }
}

function flattenScreenplaySequences(screenplay) {
  if (!Array.isArray(screenplay.sequencePlan)) return [];
  const entries = [];
  for (const sequence of screenplay.sequencePlan) {
    if (!sequence || !Array.isArray(sequence.counts)) throw new Error("Each screenplay sequence requires counts.");
    const gate = sequence.diversityGate;
    if (!gate || gate.maxAdjacentDuplicateVisualTuples !== 2 || gate.requireActionOrStateChange !== true || gate.intentionalHoldRequiresReason !== true) {
      throw new Error(`Screenplay sequence diversity gate is incomplete: ${sequence?.id || "unknown"}.`);
    }
    for (const count of sequence.counts) entries.push({ ...count, sequenceDiversityGate: gate, sequenceId: sequence.id });
  }
  return entries;
}

function sameScreenplayWindow(window, count) {
  if (!window || window.timingTruthStatus !== "measured-source-audio") return false;
  return Number(window.beatStart) === count.beatStart
    && Number(window.beatEndExclusive) === count.beatEndExclusive
    && Number(window.startSeconds) === count.startSeconds
    && Number(window.endSeconds) === count.endSeconds;
}

function runtimePromptFromScreenplayCount(screenplay, entry, { previous, next }) {
  const castAppearances = clone(entry.castAppearances || []);
  const onScreenSeedIds = new Set(castAppearances
    .filter((appearance) => appearance.presence === "on_screen")
    .flatMap((appearance) => appearance.seedAssetIds || []));
  const seedUse = castAppearances.length
    ? screenplay.avatarContinuity.seedAssets.filter((seed) => onScreenSeedIds.has(seed.assetId))
    : screenplay.avatarContinuity.seedAssets;
  return {
    sceneText: entry.prompt.sceneText,
    gptImagePrompt: entry.prompt.gptImagePrompt,
    negativePrompt: entry.prompt.negativePrompt,
    justification: entry.prompt.justification,
    evidence: {
      verified: {
        lyricCitations: clone(entry.semanticExtraction.lyricCitations),
        referenceMechanics: clone(entry.semanticExtraction.referenceMechanics),
        explicitNoReferenceApplies: entry.semanticExtraction.explicitNoReferenceApplies === true,
      },
      interpretation: entry.shot.action,
      ...(entry.castAppearances !== undefined ? { castAppearances } : {}),
    },
    seedUse: clone(seedUse),
    continuity: {
      carriesFromPrevious: previous ? `Carry continuity from ${previous.id}.` : "Establish the opening continuity state.",
      preparesNext: next ? `Prepare continuity for ${next.id}.` : "Resolve into the song's final continuity state.",
    },
    confidenceAndGaps: {
      confidence: "screenplay-reviewed",
      gaps: entry.semanticExtraction.explicitNoLyricOverlap === true ? "No overlapping lyric is asserted for this count." : "Reference mechanics remain evidence-status bounded.",
    },
  };
}

function validateScreenplayCastAppearance(screenplay, entry, countId) {
  if (entry.castAppearances === undefined) return;
  if (!Array.isArray(entry.castAppearances) || !entry.castAppearances.length) throw new Error(`Screenplay castAppearances must be a non-empty array for ${countId}.`);
  const primaryAvatarId = screenplay.avatarContinuity.castPolicy?.primaryAvatarId
    || screenplay.avatarContinuity.seedAssets.find((seed) => seed.castRole === "primary")?.avatarId
    || screenplay.avatarContinuity.seedAssets[0]?.avatarId;
  const attributed = new Map((screenplay.avatarContinuity.castAttribution || []).map((member) => [member.avatarId, member]));
  const seeds = new Map(screenplay.avatarContinuity.seedAssets.map((seed) => [seed.assetId, seed]));
  const seen = new Set();
  let primaryOnScreen = false;
  let additionalOnScreen = 0;
  for (const appearance of entry.castAppearances) {
    for (const key of ["avatarId", "presence", "narrativeFunction", "evidenceBasis"]) requireString(appearance?.[key], `screenplay.castAppearances.${key}`);
    if (seen.has(appearance.avatarId)) throw new Error(`Duplicate castAppearance Avatar ${appearance.avatarId} for ${countId}.`);
    seen.add(appearance.avatarId);
    if (appearance.avatarId !== primaryAvatarId && !attributed.has(appearance.avatarId)) {
      throw new Error(`Unattributed additional Avatar ${appearance.avatarId} for ${countId}.`);
    }
    if (appearance.presence === "on_screen") {
      if (!Array.isArray(appearance.seedAssetIds) || !appearance.seedAssetIds.length) throw new Error(`On-screen Avatar ${appearance.avatarId} requires seedAssetIds for ${countId}.`);
      for (const assetId of appearance.seedAssetIds) {
        const seed = seeds.get(assetId);
        if (!seed || seed.avatarId !== appearance.avatarId) throw new Error(`On-screen Avatar ${appearance.avatarId} has invalid seed ${assetId} for ${countId}.`);
      }
      if (appearance.avatarId === primaryAvatarId) primaryOnScreen = true;
      else additionalOnScreen += 1;
    } else if (Array.isArray(appearance.seedAssetIds) && appearance.seedAssetIds.length) {
      throw new Error(`Non-visible Avatar ${appearance.avatarId} must not add image seeds for ${countId}.`);
    }
  }
  if (additionalOnScreen && !primaryOnScreen) throw new Error(`Additional cast must appear on top of the primary director Avatar for ${countId}.`);
  if (additionalOnScreen > 3) throw new Error(`At most three additional on-screen cast members are allowed for ${countId}.`);
}

export function deriveEchoSongVisualScreenplayPromptHash(screenplay, entry, { previous = null, next = null } = {}) {
  return canonicalRuntimePromptHash(runtimePromptFromScreenplayCount(screenplay, entry, { previous, next }));
}

function canonicalRuntimePromptHash(prompt) {
  const { contentHash: _declared, ...content } = prompt;
  return `sha256:${hashValue(content)}`;
}

function validateScreenplayPrompt(prompt, countId) {
  if (!prompt || typeof prompt !== "object") throw new Error(`Screenplay prompt is missing for ${countId}.`);
  if (!["staged", "approved"].includes(prompt.status) || prompt.executionMode !== "stage_only") {
    throw new Error(`Screenplay prompt must be staged/approved and stage_only for ${countId}.`);
  }
  for (const key of ["sceneText", "gptImagePrompt", "negativePrompt", "justification", "promptHash"]) {
    const value = prompt[key];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim())) {
      throw new Error(`Screenplay prompt is missing ${key} for ${countId}.`);
    }
  }
}

function validateScreenplaySemanticAndSceneEntry(entry, countId) {
  const extraction = entry.semanticExtraction;
  if (!extraction || typeof extraction !== "object") throw new Error(`Screenplay semanticExtraction is missing for ${countId}.`);
  for (const key of ["nouns", "verbs", "visibleActions", "concepts", "teachings", "symbols", "emotionalMovement", "metaphor", "teachingOrQuestion"]) {
    const value = extraction[key];
    if (value === undefined || value === null || (typeof value === "string" && !value.trim()) || (Array.isArray(value) && !value.length)) throw new Error(`Screenplay semanticExtraction.${key} is missing for ${countId}.`);
  }
  if (!["nouns", "verbs", "visibleActions", "concepts", "teachings", "symbols", "wordplayCues", "explicitReferences", "hiddenReferenceCandidates", "referenceMechanics"].every((key) => Array.isArray(extraction[key]))) {
    throw new Error(`Screenplay semanticExtraction lists are invalid for ${countId}.`);
  }
  if (!Array.isArray(extraction.lyricCitations)) throw new Error(`Screenplay lyric evidence is missing for ${countId}.`);
  if (!extraction.lyricCitations.length && extraction.explicitNoLyricOverlap !== true) {
    throw new Error(`Screenplay count without lyric citations requires explicitNoLyricOverlap for ${countId}.`);
  }
  if (!extraction.referenceMechanics.length && extraction.explicitNoReferenceApplies !== true) {
    throw new Error(`Screenplay reference decision needs mechanics or explicitNoReferenceApplies for ${countId}.`);
  }
  for (const mechanic of extraction.referenceMechanics) {
    for (const key of ["connectorId", "mechanic", "visualAffordance", "evidenceStatus", "nonLiteralTranslation"]) {
      if (typeof mechanic?.[key] !== "string" || !mechanic[key].trim()) throw new Error(`Screenplay reference mechanic lacks ${key} for ${countId}.`);
    }
  }
  const shot = entry.shot;
  if (!shot || typeof shot !== "object") throw new Error(`Screenplay shot is missing for ${countId}.`);
  for (const key of ["location", "action", "primaryMotif", "camera", "composition", "lighting", "energy"]) {
    if (typeof shot[key] !== "string" || !shot[key].trim()) throw new Error(`Screenplay shot.${key} is missing for ${countId}.`);
  }
  if (shot.intentionalHold === true && (typeof shot.holdReason !== "string" || !shot.holdReason.trim())) {
    throw new Error(`Screenplay intentional hold requires holdReason for ${countId}.`);
  }
  if (!entry.imageActivation || !["not_requested", "requested", "claimed", "complete", "failed", "stale"].includes(entry.imageActivation.status)) {
    throw new Error(`Screenplay imageActivation.status is invalid for ${countId}.`);
  }
}

function validateScreenplaySequenceQuality(entries, screenplay) {
  const fingerprints = entries.map((entry) => sceneFingerprint(entry));
  for (let start = 0; start < fingerprints.length;) {
    let end = start + 1;
    while (end < fingerprints.length && fingerprints[end] === fingerprints[start]) end += 1;
    if (end - start > 2 && entries.slice(start, end).some((entry) => entry.shot.intentionalHold !== true || typeof entry.shot.holdReason !== "string" || !entry.shot.holdReason.trim())) {
      throw new Error(`Repeated location+shot+pose+motif exceeds two adjacent counts without intentionalHold.reason: ${entries[start].countId}.`);
    }
    start = end;
  }
  for (let left = 0; left < entries.length; left += 1) {
    for (let right = left + 1; right < entries.length; right += 1) {
      const leftPrompt = entries[left].prompt;
      const rightPrompt = entries[right].prompt;
      if (nearDuplicate(leftPrompt.sceneText, rightPrompt.sceneText, 0.9)) {
        throw new Error(`Duplicate or near-duplicate sceneText: ${entries[left].countId} and ${entries[right].countId}.`);
      }
      if (nearDuplicate(leftPrompt.gptImagePrompt, rightPrompt.gptImagePrompt, 0.96)) {
        throw new Error(`Duplicate or near-duplicate gptImagePrompt: ${entries[left].countId} and ${entries[right].countId}.`);
      }
    }
  }
  validateGlobalSceneDiversity(entries);
  validateEnhancedPromptLeadDiversity(entries, screenplay);
  for (const entry of entries) validateReservoirInspiration(entry);
}

function validateEnhancedPromptLeadDiversity(entries, screenplay) {
  if (!screenplay.avatarContinuity?.castPolicy || entries.length < 6) return;
  const leads = new Map();
  for (const entry of entries) {
    const lead = String(entry.prompt.gptImagePrompt || "")
      .split(/[.!?]/u, 1)[0]
      .toLocaleLowerCase()
      .replace(/\b\d+(?:[.:]\d+)*\b/gu, "{number}")
      .replace(/[“”"']/gu, "")
      .replace(/\s+/gu, " ")
      .trim();
    const key = lead.split(" ").slice(0, 8).join(" ");
    const rows = leads.get(key) || [];
    rows.push(entry.countId);
    leads.set(key, rows);
  }
  const maximumReuse = Math.max(2, Math.ceil(entries.length / 12));
  for (const [lead, rows] of leads) {
    if (rows.length > maximumReuse) throw new Error(`Repeated enhanced prompt lead appears ${rows.length} times (maximum ${maximumReuse}): ${lead}.`);
  }
  validateEnhancedAuthoredSurfaceDiversity(entries);
}

function validateEnhancedAuthoredSurfaceDiversity(entries) {
  const surfaces = [
    ["sceneText", (entry) => entry.prompt.sceneText],
    ["justification", (entry) => entry.prompt.justification],
    ["metaphor", (entry) => entry.semanticExtraction.metaphor],
  ];
  const maximumReuse = Math.max(2, Math.ceil(entries.length / 12));
  for (const [label, read] of surfaces) {
    const skeletons = new Map();
    for (const entry of entries) {
      const skeleton = authoredSurfaceSkeleton(entry, read(entry));
      const rows = skeletons.get(skeleton) || [];
      rows.push(entry.countId);
      skeletons.set(skeleton, rows);
    }
    for (const [skeleton, rows] of skeletons) {
      if (rows.length > maximumReuse) {
        throw new Error(`Repeated authored ${label} scaffold appears ${rows.length} times (maximum ${maximumReuse}): ${skeleton.slice(0, 180)}.`);
      }
    }
  }
}

function validateGlobalSceneDiversity(entries) {
  const diversityEntries = entries.filter((entry) => entry.shot.intentionalHold !== true);
  const total = diversityEntries.length || 1;
  const policies = {
    composition: { field: "composition", minimum: scaledDistinctMinimum(total, 8, 3) },
    action: { field: "action", minimum: scaledDistinctMinimum(total, 6, 4) },
    location: { field: "location", minimum: scaledDistinctMinimum(total, 12, 3) },
    camera: { field: "camera", minimum: scaledDistinctMinimum(total, 10, 3) },
  };
  for (const [label, policy] of Object.entries(policies)) {
    const distinct = new Set(diversityEntries.map((entry) => normalizeVisualValue(entry.shot[policy.field]))).size || 1;
    if (distinct < policy.minimum) {
      throw new Error(`Global ${label} diversity is too low: ${distinct} distinct values; requires at least ${policy.minimum} across ${total} non-hold counts.`);
    }
  }
  const skeletons = new Map();
  for (const entry of entries) {
    const skeleton = promptSentenceSkeleton(entry);
    const rows = skeletons.get(skeleton) || [];
    rows.push(entry);
    skeletons.set(skeleton, rows);
  }
  const maximumSkeletonReuse = Math.max(2, Math.ceil(total / 18));
  for (const [skeleton, rows] of skeletons) {
    if (rows.length <= maximumSkeletonReuse) continue;
    const allIntentionalPhraseContinuity = rows.every((entry) => entry.shot.intentionalHold === true && typeof entry.shot.holdReason === "string" && entry.shot.holdReason.trim());
    if (!allIntentionalPhraseContinuity) {
      throw new Error(`Repeated prompt sentence skeleton appears ${rows.length} times (maximum ${maximumSkeletonReuse}) without intentional phrase continuity: ${rows.map((entry) => entry.countId).join(", ")}.`);
    }
  }
}

function scaledDistinctMinimum(total, divisor, floor) {
  if (total <= 1) return 1;
  // A short proof/phrase sequence should be judged by its local repetition
  // rules, rather than being forced to manufacture global variety.  Once a
  // sequence is long enough to establish a visual vocabulary, require at
  // least two distinct choices; album-sized screenplays use the scaled bar.
  if (total <= 3) return 1;
  if (total <= 8) return 2;
  return Math.min(total, Math.max(floor, Math.ceil(total / divisor)));
}

function normalizeVisualValue(value) {
  return String(value || "").trim().toLocaleLowerCase().replace(/\s+/gu, " ");
}

function promptSentenceSkeleton(entry) {
  return authoredSurfaceSkeleton(entry, entry.prompt.gptImagePrompt);
}

function authoredSurfaceSkeleton(entry, value) {
  let text = String(value || "").toLocaleLowerCase();
  const extraction = entry.semanticExtraction || {};
  const replacements = [
    ...Object.values(entry.shot || {}),
    ...["nouns", "verbs", "visibleActions", "concepts", "teachings", "symbols", "wordplayCues", "explicitReferences", "hiddenReferenceCandidates"]
      .flatMap((key) => Array.isArray(extraction[key]) ? extraction[key] : []),
    extraction.emotionalMovement,
    extraction.teachingOrQuestion,
    ...(extraction.lyricCitations || []).map((citation) => citation.excerpt),
    ...(entry.castAppearances || []).flatMap((appearance) => [appearance.narrativeFunction, appearance.evidenceBasis]),
  ].filter((replacement) => typeof replacement === "string" && replacement.trim())
    .sort((left, right) => String(right).length - String(left).length);
  for (const replacement of replacements) {
    const escaped = String(replacement).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (escaped) text = text.replace(new RegExp(escaped, "gu"), "{slot}");
  }
  return text.replace(/\b\d+(?:[.:]\d+)*\b/gu, "{number}").replace(/\s+/gu, " ").trim();
}

function validateReservoirInspiration(entry) {
  const inspirations = entry.semanticExtraction.nonInheritedReservoirInspiration;
  if (inspirations === undefined) return;
  if (!Array.isArray(inspirations)) throw new Error(`nonInheritedReservoirInspiration must be an array for ${entry.countId}.`);
  for (const inspiration of inspirations) {
    if (inspiration?.notEvidenceOfSongReference !== true) throw new Error(`Reservoir inspiration must declare notEvidenceOfSongReference=true for ${entry.countId}.`);
    const terms = functionalMechanicTerms(inspiration.mechanicOnly);
    if (terms.length < 3) throw new Error(`Reservoir mechanicOnly must be a concrete functional phrase for ${entry.countId}.`);
    const surfaces = [entry.shot.action, entry.prompt.sceneText, entry.prompt.gptImagePrompt, entry.prompt.justification]
      .map((value) => normalizeVisualValue(value));
    if (!surfaces.some((surface) => terms.filter((term) => surface.includes(term)).length >= 2)) {
      throw new Error(`Reservoir mechanicOnly is decorative rather than materially explained for ${entry.countId}.`);
    }
  }
}

function functionalMechanicTerms(value) {
  const stopWords = new Set(["the", "and", "with", "from", "into", "that", "this", "through", "where", "when", "only", "like", "real", "story"]);
  return [...new Set(String(value || "").toLocaleLowerCase().match(/[\p{L}]{4,}/gu) || [])].filter((term) => !stopWords.has(term));
}

function sceneFingerprint(entry) {
  const fields = entry.sequenceDiversityGate?.tupleFields || ["location", "camera", "composition", "primaryMotif", "action", "energy"];
  return fields.map((field) => entry.shot[field])
    .map((value) => String(value || ""))
    .map((value) => value.trim().toLocaleLowerCase())
    .join("::");
}

function nearDuplicate(left, right, threshold) {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return false;
  const intersection = [...a].filter((word) => b.has(word)).length;
  return intersection / new Set([...a, ...b]).size >= threshold;
}

function wordSet(value) {
  return new Set(String(value || "").toLocaleLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

function promptArtifactHash(prompt) {
  return prompt.contentHash || `sha256:${hashValue(prompt)}`;
}

function hashMatches(declared, actual) {
  return declared === actual || declared === actual.replace(/^sha256:/u, "") || `sha256:${declared}` === actual;
}

function hasActiveClaim(count) {
  return ["prompt", "image", "video"].some((lane) => count.lanes[lane].quest.status === "claimed");
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
