import test from "node:test";
import assert from "node:assert/strict";
import {
  claimEchoSceneKeyframeQuests,
  completeEchoSceneKeyframeQuest,
  configureEchoSceneKeyframeProcess,
  createEchoSceneKeyframeProcess,
  deriveEchoSongVisualScreenplayAuthoringProvenanceHash,
  deriveEchoSongVisualScreenplayContentHash,
  echoSceneKeyframeCountStatus,
  echoSceneKeyframeProcessSummary,
  failEchoSceneKeyframeQuest,
  importEchoSceneKeyframeArtifacts,
  importApprovedEchoSongVisualScreenplay,
  pauseEchoSceneKeyframeProcess,
  planEchoSceneKeyframeCounts,
  releaseExpiredEchoSceneKeyframeLeases,
  requestEchoSceneKeyframeStopAfterCurrent,
  resumeEchoSceneKeyframeProcess,
  startEchoSceneKeyframeProcess,
  activateEchoSongVisualScreenplayImages,
  deriveEchoSongVisualScreenplayPromptHash,
  validateEchoSongVisualScreenplay,
  validateEchoScreenplayAuthoredCountTranche,
} from "../src/domain/echo-scene-keyframe-process.js";

const at = "2026-07-18T12:00:00.000Z";
const nextMinute = "2026-07-18T12:01:00.000Z";
const sourceCount = (countOrdinal = 0, overrides = {}) => ({
  songId: "echo-song",
  countOrdinal,
  beatStart: countOrdinal * 4,
  beatEndExclusive: countOrdinal * 4 + 4,
  startSeconds: countOrdinal * 2,
  endSeconds: countOrdinal * 2 + 2,
  timingStatus: "ready",
  inputHash: `source:${countOrdinal}`,
  ...overrides,
});

function screenplayFor(process, { songId = "echo-song", approval = true, mutate = null } = {}) {
  const counts = process.counts.filter((count) => count.songId === songId && count.timingStatus === "ready")
    .sort((left, right) => left.countOrdinal - right.countOrdinal)
    .map((count) => ({
      countId: count.id,
      ordinal: count.countOrdinal,
      window: {
        beatStart: count.beatStart,
        beatEndExclusive: count.beatEndExclusive,
        startSeconds: count.startSeconds,
        endSeconds: count.endSeconds,
        timingTruthStatus: "measured-source-audio",
      },
      semanticExtraction: {
        nouns: [`anchor-${count.countOrdinal}`],
        verbs: ["observe"],
        visibleActions: ["leans toward the signal"],
        concepts: ["continuity"],
        teachings: ["attention can remain unresolved"],
        symbols: [`motif-${count.countOrdinal}`],
        emotionalMovement: "curious to settled",
        wordplayCues: [],
        explicitReferences: [],
        hiddenReferenceCandidates: [],
        metaphor: `motif-${count.countOrdinal}`,
        teachingOrQuestion: "continuity",
        lyricCitations: [{ lineId: `line-${count.countOrdinal}`, excerpt: "test lyric", startSeconds: count.startSeconds, endSeconds: count.endSeconds, role: "overlap" }],
        referenceMechanics: [],
        explicitNoReferenceApplies: true,
      },
      shot: {
        location: `corridor-${count.countOrdinal}`,
        action: `observe the signal-${count.countOrdinal}`,
        primaryMotif: `motif-${count.countOrdinal}`,
        camera: `medium-profile-${count.countOrdinal}`,
        composition: `left-third-observer-${count.countOrdinal}`,
        lighting: "soft blue rim",
        energy: `shift-${count.countOrdinal}`,
        intentionalHold: false,
        holdReason: null,
      },
      prompt: {
        status: "approved",
        executionMode: "stage_only",
        sceneText: `frame ${count.countOrdinal}`,
        gptImagePrompt: `cinematic ${["listening", "crossing", "opening", "returning"][count.countOrdinal % 4]} frame ${count.countOrdinal}`,
        negativePrompt: "no text",
        justification: "timing grounded",
        promptHash: "pending",
      },
      imageActivation: { status: "not_requested" },
      disposition: "candidate_direction_only",
    }));
  const screenplay = {
    schemaVersion: "hapa.echo.full-song-visual-screenplay.v1",
    songId,
    sourceRevision: { songContextHash: `sha256:${"1".repeat(64)}`, lyricsHash: `sha256:${"2".repeat(64)}`, timingHash: `sha256:${"3".repeat(64)}`, referenceGraphHash: `sha256:${"4".repeat(64)}`, seedSetHash: `sha256:${"5".repeat(64)}`, directorTreatmentHash: `sha256:${"6".repeat(64)}`, promptPolicyHash: `sha256:${"7".repeat(64)}` },
    semanticMining: { songThesis: "test thesis", emotionalArc: [{ id: "arc-1", label: "opening", emotionalState: "curious", visualConsequence: "hold" }], teachingOrQuestion: "what persists", motifLexicon: [{ term: "signal", meaning: "connection", visualAffordances: ["light"], avoidLiteralization: ["text"] }], referencePolicy: { rule: "reference-as-mechanic-not-copy", literalDepictionAllowed: false, notes: null } },
    avatarContinuity: { seedAssets: [{ avatarId: "avatar-2", colorRole: "blue", assetId: "blue-seed", contentHash: "sha256:seed", retrievalHandle: "/seed.png", identityInvariants: ["face"], visualContribution: "Blue" }], globalInvariants: ["face"], allowedVariation: ["camera"], cleanReferenceRequired: false },
    sequencePlan: [{ id: "sequence-1", label: "test", purpose: "test sequence", counts, diversityGate: { maxAdjacentDuplicateVisualTuples: 2, tupleFields: ["location", "camera", "composition", "primaryMotif", "action", "energy"], requireActionOrStateChange: true, intentionalHoldRequiresReason: true, repetitionReviewRequired: true } }],
    generationPolicy: { promptImportMode: "stage_only", imageActivationRequired: true, providerPolicy: "codex-built-in-gpt-image-only", videoPolicy: "held-until-separately-enabled", allowedPromptStatesForActivation: ["staged", "approved"] },
    review: { status: approval ? "approved-for-selective-activation" : "staged", reviewNotes: [] },
    authoringProvenance: {
      method: "direct_llm_analysis",
      requestedModel: "gpt-5.6-terra",
      agentTaskName: "echo-screenplay-test-author",
      sourcePacketHash: "sha256:source-packet",
      instructionHash: "sha256:instructions",
      startedAt: "2026-07-18T11:00:00.000Z",
      completedAt: at,
      promptAuthoringPolicy: "no-deterministic-scene-generation",
      heuristicGeneratorUsed: false,
      artifactHash: "pending",
      attestation: { type: "authoring-provenance-v1", artifactHash: "pending", attestedBy: "echo-screenplay-test-author", attestedAt: at },
    },
    authoringMethodAudit: {
      soleAuthorTaskName: "echo-screenplay-test-author",
      subagentsSpawned: 0,
      rejectedOrSameSongCandidatesRead: [],
      foreignQualityReferencesRead: [],
      continuedOwnDraftPaths: [],
      authoredFieldAutomationUsed: false,
      authoredFieldTools: [],
      mechanicalValidationTools: ["node --test"],
      sourceFilesRead: ["packet.json", "authoring.md", "contract.md"],
      attestedAt: at,
    },
    provenance: { createdAt: at, createdBy: "test", contentHash: "sha256:screenplay-test" },
  };
  screenplay.authoringProvenance.artifactHash = deriveEchoSongVisualScreenplayAuthoringProvenanceHash(screenplay.authoringProvenance);
  screenplay.authoringProvenance.attestation.artifactHash = screenplay.authoringProvenance.artifactHash;
  if (mutate) mutate(screenplay);
  for (const [index, entry] of screenplay.sequencePlan[0].counts.entries()) {
    entry.prompt.promptHash = deriveEchoSongVisualScreenplayPromptHash(screenplay, entry, {
      previous: process.counts[index - 1] || null,
      next: process.counts[index + 1] || null,
    });
  }
  screenplay.provenance.contentHash = deriveEchoSongVisualScreenplayContentHash(screenplay);
  return screenplay;
}

function approvalReceipt(screenplay, id = "review-1") {
  return {
    id,
    status: "approved",
    reviewType: "independent_screenplay_review",
    reviewedBy: "independent-reviewer",
    reviewedAt: "2026-07-18T12:30:00.000Z",
    screenplayHash: screenplay.provenance.contentHash,
    authoringArtifactHash: screenplay.authoringProvenance.artifactHash,
  };
}

test("replanning an unchanged four-count is idempotent and input changes retain stale lineage", () => {
  let process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const firstQuestId = process.counts[0].lanes.prompt.quest.id;
  process = planEchoSceneKeyframeCounts(process, { counts: [sourceCount()], at });
  assert.equal(process.counts.length, 1);
  assert.equal(process.counts[0].lanes.prompt.quest.id, firstQuestId);
  process = planEchoSceneKeyframeCounts(process, { counts: [sourceCount(0, { inputHash: "source:changed" })], at });
  assert.notEqual(process.counts[0].lanes.prompt.quest.id, firstQuestId);
  assert.equal(process.counts[0].history.length, 1);
  assert.equal(process.counts[0].history[0].lanes.prompt.quest.id, firstQuestId);
});

test("prompt completion opens a content-addressed image quest and keyframe completion holds video", () => {
  let process = startEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ counts: [sourceCount()] }), { at });
  let claimed = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "run-a", at });
  process = claimed.process;
  assert.equal(claimed.claims[0].lane, "prompt");
  process = completeEchoSceneKeyframeQuest(process, claimed.claims[0].questId, { runnerId: "terra", at, result: { sceneText: "red at the waterline", gptImagePrompt: "cinematic", contentHash: "prompt-output-a" } });
  assert.equal(process.counts[0].lanes.image.quest.status, "open");
  assert.equal(process.counts[0].lanes.image.quest.inputHash, "prompt-output-a");
  claimed = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "run-b", at });
  process = completeEchoSceneKeyframeQuest(claimed.process, claimed.claims[0].questId, { runnerId: "terra", at, result: { localPath: "/generated.png", contentHash: "image-output-a" } });
  assert.equal(process.counts[0].lanes.image.artifact.state, "keyframe_exists");
  assert.equal(process.counts[0].lanes.video.quest.status, "held");
  assert.equal(process.counts[0].lanes.video.quest.executionPolicy, "hold-video-generation-v1");
  assert.equal(echoSceneKeyframeCountStatus(process.counts[0]), "video_quest_held");
});

test("claims respect process state, concurrency, run limits, and categorically refuse video", () => {
  let process = createEchoSceneKeyframeProcess({ settings: { concurrency: 2, perRunClaimLimit: 1 }, counts: [sourceCount(0), sourceCount(1)] });
  assert.equal(claimEchoSceneKeyframeQuests(process, { at }).claims.length, 0);
  process = startEchoSceneKeyframeProcess(process, { at });
  let first = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "same-run", limit: 9, at });
  assert.equal(first.claims.length, 1);
  let second = claimEchoSceneKeyframeQuests(first.process, { runnerId: "terra", runId: "same-run", limit: 9, at });
  assert.equal(second.claims.length, 0);
  second = claimEchoSceneKeyframeQuests(first.process, { runnerId: "luna", runId: "new-run", limit: 9, at });
  assert.equal(second.claims.length, 1);
  assert.ok([...first.claims, ...second.claims].every((claim) => claim.lane !== "video"));
  assert.throws(() => claimEchoSceneKeyframeQuests(first.process, { lane: "video", at }), /Unsupported claim lane/u);
  const videoId = first.process.counts[0].lanes.video.quest.id;
  assert.throws(() => completeEchoSceneKeyframeQuest(first.process, videoId, { at }), /Video generation is held/u);
});

test("throughput can be raised without invalidating work and cannot contradict live leases", () => {
  let process = startEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ settings: { concurrency: 2, perRunClaimLimit: 2 }, counts: [sourceCount(0), sourceCount(1), sourceCount(2)] }), { at });
  let claimed = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "batch-a", limit: 2, at });
  process = configureEchoSceneKeyframeProcess(claimed.process, { settings: { concurrency: 3, perRunClaimLimit: 3 }, at: nextMinute });
  assert.equal(process.settings.concurrency, 3);
  assert.equal(process.settings.perRunClaimLimit, 3);
  assert.equal(process.events.at(-1).type, "process-settings-configured");
  const extra = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "batch-b", limit: 3, at: nextMinute });
  assert.equal(extra.claims.length, 1);
  assert.throws(() => configureEchoSceneKeyframeProcess(extra.process, { settings: { concurrency: 2 }, at: nextMinute }), /below 3 active claims/u);
});

test("accepted pilot artifacts import without replaying provider work", () => {
  let process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  process = importEchoSceneKeyframeArtifacts(process, process.counts[0].id, {
    at,
    promptResult: { sceneText: "existing pilot", contentHash: "prompt-pilot" },
    imageResult: { localPath: "/pilot.png", contentHash: "image-pilot" },
  });
  assert.equal(process.counts[0].lanes.prompt.quest.status, "complete");
  assert.equal(process.counts[0].lanes.image.artifact.state, "keyframe_exists");
  assert.equal(process.counts[0].lanes.video.quest.status, "held");
  assert.ok(process.events.some((event) => event.type === "artifacts-imported"));
});

test("pause, resume, stop-after-current, failures, and expired leases are restart-safe", () => {
  let process = startEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ settings: { leaseMs: 1000, maxAttempts: 2 }, counts: [sourceCount()] }), { at });
  let claim = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "run", at });
  process = requestEchoSceneKeyframeStopAfterCurrent(claim.process, { at });
  assert.equal(process.status, "stop_after_current");
  assert.equal(claimEchoSceneKeyframeQuests(process, { at }).claims.length, 0);
  process = failEchoSceneKeyframeQuest(process, claim.claims[0].questId, { runnerId: "terra", error: "temporary", at: nextMinute });
  assert.equal(process.status, "paused");
  assert.equal(process.counts[0].lanes.prompt.quest.status, "open");
  process = resumeEchoSceneKeyframeProcess(process, { at: nextMinute });
  claim = claimEchoSceneKeyframeQuests(process, { runnerId: "luna", runId: "retry", at: nextMinute });
  process = releaseExpiredEchoSceneKeyframeLeases(claim.process, { at: "2026-07-18T12:02:00.000Z" });
  assert.equal(process.counts[0].lanes.prompt.quest.status, "failed");
  process = pauseEchoSceneKeyframeProcess(process, { at: nextMinute });
  assert.equal(process.status, "paused");
});

test("summary keeps independent lane facts and treats missing timing as incomplete", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1, { timingStatus: "needs_timing_truth" })] });
  const summary = echoSceneKeyframeProcessSummary(process);
  assert.equal(summary.status, "planned");
  assert.equal(summary.timingReady, 1);
  assert.equal(summary.needsTimingTruth, 1);
  assert.equal(summary.lanes.prompt.quests.open, 1);
  assert.equal(summary.lanes.prompt.quests.not_open, 1);
  assert.equal(summary.complete, false);
  assert.equal(echoSceneKeyframeCountStatus(process.counts[1]), "needs_timing_truth");
});

test("whole-song screenplay validator requires exact source order and fresh count inputs", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1)] });
  const screenplay = screenplayFor(process);
  const valid = validateEchoSongVisualScreenplay(process, screenplay, { requireApproval: true });
  assert.equal(valid.songId, "echo-song");
  assert.equal(valid.counts.length, 2);
  const reversed = screenplayFor(process, { mutate: (value) => value.sequencePlan[0].counts.reverse() });
  assert.throws(() => validateEchoSongVisualScreenplay(process, reversed), /exactly match source order/u);
  const stale = screenplayFor(process, { mutate: (value) => { value.sequencePlan[0].counts[0].window.startSeconds = 99; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, stale), /Stale screenplay timing window/u);
});

test("enhanced screenplay keeps primary Avatar and forwards only count-selected additional cast seeds", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const addCast = (value) => {
    const primary = value.avatarContinuity.seedAssets[0];
    Object.assign(primary, { castRole: "primary", species: "human", baseCharacterId: "rgb-shared-human-base" });
    value.avatarContinuity.seedAssets.push({ avatarId: "pinokio-bella", colorRole: null, castRole: "referenced", species: "human", baseCharacterId: "pinokio-bella", assetId: "bella-seed", contentHash: "sha256:bella", retrievalHandle: "/bella.png", identityInvariants: ["Bella face"], visualContribution: "Bella" });
    value.avatarContinuity.castPolicy = { primaryAvatarId: "avatar-2", selectionRule: "smallest useful cast", referencedAvatarRule: "explicit binding only", evergreenRule: "optional action-backed cast" };
    value.avatarContinuity.castAttribution = [{ avatarId: "pinokio-bella", name: "Bella", aliases: ["lil'"], castClass: "referenced-avatar", species: "human", baseCharacterId: "pinokio-bella", evidenceStatus: "user-confirmed-song-avatar-binding", appearanceRule: "lyric-supported counts only", relationshipBounds: ["no invented relationship"], connectorIds: [], seedAssetIds: ["bella-seed"] }];
    value.sequencePlan[0].counts[0].castAppearances = [
      { avatarId: "avatar-2", presence: "on_screen", narrativeFunction: "primary director witness", evidenceBasis: "song perspective", seedAssetIds: ["blue-seed"], interactionBounds: [] },
      { avatarId: "pinokio-bella", presence: "on_screen", narrativeFunction: "performs the addressed response", evidenceBasis: "explicit operator Avatar binding plus lyric address", seedAssetIds: ["bella-seed"], interactionBounds: ["no invented romance"] },
    ];
  };
  const screenplay = screenplayFor(process, { mutate: addCast });
  const validation = validateEchoSongVisualScreenplay(process, screenplay);
  assert.deepEqual(validation.counts[0].runtimePrompt.seedUse.map((seed) => seed.assetId), ["blue-seed", "bella-seed"]);
  assert.deepEqual(validation.counts[0].runtimePrompt.evidence.castAppearances.map((appearance) => appearance.avatarId), ["avatar-2", "pinokio-bella"]);

  const noPrimary = screenplayFor(process, { mutate: (value) => { addCast(value); value.sequencePlan[0].counts[0].castAppearances.shift(); } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, noPrimary), /on top of the primary director Avatar/u);
  const wrongSeed = screenplayFor(process, { mutate: (value) => { addCast(value); value.sequencePlan[0].counts[0].castAppearances[1].seedAssetIds = ["blue-seed"]; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, wrongSeed), /invalid seed/u);
  const unresolved = screenplayFor(process, { mutate: (value) => { addCast(value); value.avatarContinuity.castAttribution[0].evidenceStatus = "name-match-only"; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, unresolved), /resolved attribution evidence/u);
});

test("screenplay declared prompt hash is verified against canonical runtime prompt content", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const screenplay = screenplayFor(process);
  screenplay.sequencePlan[0].counts[0].prompt.gptImagePrompt = "tampered after hash";
  assert.throws(() => validateEchoSongVisualScreenplay(process, screenplay), /promptContentHash does not match prompt/u);
});

test("screenplay declared content hash is recomputed instead of trusted", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const screenplay = screenplayFor(process);
  screenplay.semanticMining.songThesis = "tampered after finalization";
  assert.throws(() => validateEchoSongVisualScreenplay(process, screenplay), /contentHash does not match canonical screenplay content/u);
});

test("screenplay provenance requires direct LLM authoring, a consistent attestation, and independent review", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const missing = screenplayFor(process, { mutate: (value) => { delete value.authoringProvenance; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, missing), /authoringProvenance is required/u);
  const legacy = screenplayFor(process, { mutate: (value) => { value.authoringProvenance.method = "legacy_heuristic"; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, legacy), /permanently unimportable/u);
  const inconsistent = screenplayFor(process, { mutate: (value) => { value.authoringProvenance.attestation.artifactHash = "sha256:wrong"; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, inconsistent), /attestation must bind/u);
  const approved = screenplayFor(process);
  const selfReview = approvalReceipt(approved, "self-review");
  selfReview.reviewedBy = approved.authoringProvenance.agentTaskName;
  assert.throws(() => importApprovedEchoSongVisualScreenplay(process, approved, { approvalReceipt: selfReview, at }), /must be independent/u);
});

test("a separate independent receipt approves an immutable staged screenplay without changing its reviewed hash", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const screenplay = screenplayFor(process, { approval: false });
  const receipt = approvalReceipt(screenplay);
  assert.doesNotThrow(() => importApprovedEchoSongVisualScreenplay(process, screenplay, { approvalReceipt: receipt }));
});

test("approved screenplay stages prompt lane only and preserves image/video facts", () => {
  let process = createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1)] });
  const screenplay = screenplayFor(process);
  const before = process.counts.map((count) => structuredClone({ image: count.lanes.image, video: count.lanes.video }));
  process = importApprovedEchoSongVisualScreenplay(process, screenplay, {
    approvalReceipt: approvalReceipt(screenplay, "review-1"), runnerId: "terra", runId: "screenplay-a", at,
  });
  for (const [index, count] of process.counts.entries()) {
    assert.equal(count.lanes.prompt.artifact.state, "ready");
    assert.equal(count.lanes.prompt.quest.status, "complete");
    assert.deepEqual({ image: count.lanes.image, video: count.lanes.video }, before[index]);
    assert.equal(count.lanes.image.quest.status, "blocked_by_prompt");
    assert.equal(count.lanes.video.quest.status, "blocked_by_keyframe");
  }
  assert.equal(process.events.at(-1).type, "song-screenplay-prompts-imported");
  const replay = importApprovedEchoSongVisualScreenplay(process, screenplay, { approvalReceipt: approvalReceipt(screenplay, "review-1"), at });
  assert.equal(replay.events.length, process.events.length);
});

test("screenplay image activation is explicit, content-addressed, and leaves video held policy untouched", () => {
  let process = createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1)] });
  const screenplay = screenplayFor(process);
  process = importApprovedEchoSongVisualScreenplay(process, screenplay, { approvalReceipt: approvalReceipt(screenplay, "review-2"), at });
  const beforeVideo = process.counts.map((count) => structuredClone(count.lanes.video));
  assert.throws(() => activateEchoSongVisualScreenplayImages(process, {
    songId: "echo-song", screenplayHash: screenplay.provenance.contentHash, at: nextMinute,
  }), /non-empty countIds/u);
  process = activateEchoSongVisualScreenplayImages(process, {
    songId: "echo-song", screenplayHash: screenplay.provenance.contentHash, countIds: [process.counts[0].id], at: nextMinute,
  });
  assert.equal(process.counts[0].lanes.image.quest.status, "open");
  assert.equal(process.counts[0].lanes.image.quest.inputHash, process.counts[0].lanes.prompt.artifact.contentHash);
  assert.equal(process.counts[1].lanes.image.quest.status, "blocked_by_prompt");
  assert.deepEqual(process.counts.map((count) => count.lanes.video), beforeVideo);
  assert.equal(process.events.at(-1).type, "song-screenplay-images-activated");
});

test("screenplay import fails closed over active claims and does not replace downstream work", () => {
  let process = startEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ counts: [sourceCount()] }), { at });
  const claimed = claimEchoSceneKeyframeQuests(process, { runnerId: "terra", runId: "active", at });
  const screenplay = screenplayFor(claimed.process);
  assert.throws(() => importApprovedEchoSongVisualScreenplay(claimed.process, screenplay, { approvalReceipt: approvalReceipt(screenplay, "review-3"), at }), /active claim/u);
});

test("screenplay can validate and preserve existing media while staging missing counts", () => {
  let process = createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1)] });
  process = importEchoSceneKeyframeArtifacts(process, process.counts[0].id, {
    at,
    promptResult: { sceneText: "legacy prompt", contentHash: "legacy-prompt" },
    imageResult: { localPath: "/legacy.png", contentHash: "legacy-image" },
  });
  const before = structuredClone(process.counts[0].lanes);
  const screenplay = screenplayFor(process, { mutate: (value) => { value.sequencePlan[0].counts[0].disposition = "preserve_existing_media"; value.sequencePlan[0].counts[0].imageActivation = { status: "complete", imageQuestId: "legacy" }; } });
  const validation = validateEchoSongVisualScreenplay(process, screenplay, { requireApproval: true });
  assert.deepEqual(validation.preservedCountIds, [process.counts[0].id]);
  assert.deepEqual(validation.stagedCountIds, [process.counts[1].id]);
  process = importApprovedEchoSongVisualScreenplay(process, screenplay, { approvalReceipt: approvalReceipt(screenplay, "review-preserve"), at });
  assert.deepEqual(process.counts[0].lanes, before);
  assert.equal(process.counts[1].lanes.prompt.artifact.state, "ready");
  assert.deepEqual(process.events.at(-1).preservedCountIds, [process.counts[0].id]);
});

test("preserve_existing_media is rejected without an existing prompt or media artifact", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const screenplay = screenplayFor(process, { mutate: (value) => { value.sequencePlan[0].counts[0].disposition = "preserve_existing_media"; value.sequencePlan[0].counts[0].imageActivation = { status: "complete", imageQuestId: "missing" }; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, screenplay), /requires existing prompt or media state/u);
});

test("screenplay quality gates require semantic, scene, lyric, and reference decisions", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const missingMining = screenplayFor(process, { mutate: (value) => { delete value.sequencePlan[0].counts[0].semanticExtraction.metaphor; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, missingMining), /semanticExtraction.metaphor/u);
  const missingConcept = screenplayFor(process, { mutate: (value) => { value.sequencePlan[0].counts[0].semanticExtraction.concepts = []; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, missingConcept), /semanticExtraction.concepts/u);
  const missingScene = screenplayFor(process, { mutate: (value) => { delete value.sequencePlan[0].counts[0].shot.energy; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, missingScene), /shot.energy/u);
  const missingReference = screenplayFor(process, { mutate: (value) => { value.sequencePlan[0].counts[0].semanticExtraction = { ...value.sequencePlan[0].counts[0].semanticExtraction, explicitNoReferenceApplies: false }; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, missingReference), /reference decision needs/u);
  const missingLyric = screenplayFor(process, { mutate: (value) => { value.sequencePlan[0].counts[0].semanticExtraction.lyricCitations = []; } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, missingLyric), /without lyric citations/u);
});

test("screenplay quality gates reject unannotated adjacent holds and near duplicate scene language", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1), sourceCount(2)] });
  const repeated = screenplayFor(process, { mutate: (value) => {
    for (const entry of value.sequencePlan[0].counts) {
      entry.shot.location = "same corridor";
      entry.shot.camera = "same shot";
      entry.shot.composition = "same composition";
      entry.shot.primaryMotif = "same motif";
      entry.shot.action = "same action";
      entry.shot.energy = "same energy";
    }
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, repeated), /Repeated location\+shot\+pose\+motif/u);
  const held = screenplayFor(process, { mutate: (value) => {
    for (const entry of value.sequencePlan[0].counts) {
      entry.shot.location = "same corridor";
      entry.shot.camera = "same shot";
      entry.shot.composition = "same composition";
      entry.shot.primaryMotif = "same motif";
      entry.shot.action = "same action";
      entry.shot.energy = "same energy";
      entry.shot.intentionalHold = true;
      entry.shot.holdReason = "Deliberate three-count listening hold.";
    }
  } });
  assert.doesNotThrow(() => validateEchoSongVisualScreenplay(process, held));
  const duplicateText = screenplayFor(process, { mutate: (value) => {
    value.sequencePlan[0].counts[1].prompt.sceneText = value.sequencePlan[0].counts[0].prompt.sceneText;
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, duplicateText), /near-duplicate sceneText/u);
});

test("whole-song diversity gate scales across long sequences and catches templated prompt skeletons", () => {
  const process = createEchoSceneKeyframeProcess({ counts: Array.from({ length: 24 }, (_, index) => sourceCount(index)) });
  const lowComposition = screenplayFor(process, { mutate: (value) => {
    for (const entry of value.sequencePlan[0].counts) entry.shot.composition = "one repeated composition";
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, lowComposition), /Global composition diversity is too low/u);
  const templated = screenplayFor(process, { mutate: (value) => {
    for (const entry of value.sequencePlan[0].counts) {
      entry.prompt.gptImagePrompt = `Study ${entry.shot.location} while ${entry.shot.action}; lyric ${entry.ordinal}.`;
    }
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, templated), /Repeated prompt sentence skeleton/u);
});

test("partial direct-author tranche uses the complete screenplay quality gates without mutation", () => {
  const process = pauseEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ counts: Array.from({ length: 8 }, (_, index) => sourceCount(index)) }), { at });
  const screenplay = screenplayFor(process);
  const entries = screenplay.sequencePlan[0].counts;
  const sceneTexts = [
    "A blue signal bends across the wet floor.", "The observer parts a curtain of static.",
    "Glass birds rise when the corridor opens.", "Under a copper lamp, the map folds itself.",
    "Rain erases the lock but leaves the doorway.", "A low camera finds the returned compass.",
    "Two shadows exchange places beside the river.", "Dawn enters through the repaired antenna.",
  ];
  const prompts = [
    "Ground-level blue light bends through rain on tile; macro lens, empty hall.", "Frame an observer parting silver static with both hands, overhead view.",
    "Glass birds lift from an opening corridor in hard side light, wide crane shot.", "A copper lamp watches an unmarked map fold itself on a stone table.",
    "Backlit rain removes a rusted lock while the doorway remains in sharp focus.", "Use a low tracking camera as a brass compass rolls back into an open palm.",
    "At river dusk, two long shadows exchange banks without their owners moving.", "Dawn floods a repaired antenna array from behind, telephoto compression.",
  ];
  const justifications = [
    "The opening signal becomes a physical refraction.", "Static turns observation into an active clearing gesture.",
    "The lyric's release is carried by fragile upward motion.", "Folding converts uncertainty into a visible choice.",
    "The erased lock distinguishes access from possession.", "The returning compass resolves the prior directional doubt.",
    "Exchanged shadows make reciprocity spatially legible.", "The repaired antenna closes the tranche with received light.",
  ];
  const metaphors = ["signal as river", "static as curtain", "birds as released questions", "map as closing hand", "rain as locksmith", "compass as apology", "shadows as ferrymen", "antenna as dawn root"];
  entries.forEach((entry, index) => {
    entry.prompt.sceneText = sceneTexts[index];
    entry.prompt.gptImagePrompt = prompts[index];
    entry.prompt.justification = justifications[index];
    entry.semanticExtraction.metaphor = metaphors[index];
  });
  const before = JSON.stringify(entries);
  assert.deepEqual(validateEchoScreenplayAuthoredCountTranche(entries), { ok: true, authoredCountRecords: 8, enhanced: true });
  assert.equal(JSON.stringify(entries), before);
  const templated = structuredClone(entries);
  templated.forEach((entry) => { entry.prompt.sceneText = "The Avatar holds the changing object beneath the changing light."; });
  assert.throws(() => validateEchoScreenplayAuthoredCountTranche(templated), /Duplicate or near-duplicate sceneText|Repeated authored sceneText scaffold/u);
});

test("enhanced cast-aware screenplays reject a repeated production-label prompt lead", () => {
  const process = createEchoSceneKeyframeProcess({ counts: Array.from({ length: 12 }, (_, index) => sourceCount(index)) });
  const screenplay = screenplayFor(process, { mutate: (value) => {
    value.avatarContinuity.castPolicy = { primaryAvatarId: "avatar-2", selectionRule: "smallest useful cast", referencedAvatarRule: "explicit binding only", evergreenRule: "optional action-backed cast" };
    const bodies = ["Rain cleaves the copper arch.", "A white kite drags sparks upstream.", "Three mirrors refuse the sunrise.", "The rope bridge blooms underfoot.", "Cold glass gathers a warm fingerprint.", "A paper bird crosses the engine room.", "Blue reeds bend around a lantern.", "The empty chair tips toward thunder.", "Salt crystals map an open palm.", "A cedar door floats above the tide.", "The compass needle stitches torn cloth.", "Green smoke clears around a seedling."];
    for (const entry of value.sequencePlan[0].counts) entry.prompt.gptImagePrompt = `Cinematic 16:9 key frame for exact four-count ${entry.ordinal}. ${bodies[entry.ordinal]}`;
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, screenplay), /Repeated enhanced prompt lead/u);
});

test("enhanced cast-aware screenplays reject slot-filled scene, justification, and metaphor scaffolds", () => {
  const process = createEchoSceneKeyframeProcess({ counts: Array.from({ length: 12 }, (_, index) => sourceCount(index)) });
  const screenplay = screenplayFor(process, { mutate: (value) => {
    value.avatarContinuity.castPolicy = { primaryAvatarId: "avatar-2", selectionRule: "smallest useful cast", referencedAvatarRule: "explicit binding only", evergreenRule: "optional action-backed cast" };
    const authoredPrompts = [
      "Rain cleaves a copper arch while Blue catches the falling hinge.",
      "A white kite drags sparks upstream above an empty ferry.",
      "Three mirrors refuse the sunrise and turn toward a seed.",
      "The rope bridge blooms underfoot as fog drains from the valley.",
      "Cold glass gathers a warm fingerprint beside a sleeping engine.",
      "A paper bird crosses the engine room carrying one blue thread.",
      "Blue reeds bend around a lantern that has just gone dark.",
      "The empty chair tips toward thunder across a flooded kitchen.",
      "Salt crystals map an open palm beneath a rotating skylight.",
      "A cedar door floats above the tide with its key still turning.",
      "The compass needle stitches torn cloth across a field table.",
      "Green smoke clears around a seedling breaking black concrete.",
    ];
    for (const entry of value.sequencePlan[0].counts) {
      entry.prompt.gptImagePrompt = authoredPrompts[entry.ordinal];
      entry.prompt.sceneText = `${entry.shot.action} at ${entry.shot.location}; ${entry.shot.primaryMotif} holds ${entry.shot.composition} under ${entry.shot.lighting}.`;
      entry.prompt.justification = `${entry.shot.action} at ${entry.shot.location}; ${entry.shot.primaryMotif} makes ${entry.semanticExtraction.teachingOrQuestion} visible.`;
      entry.semanticExtraction.metaphor = `${entry.shot.primaryMotif} turns ${entry.semanticExtraction.concepts[0]} into physical action.`;
    }
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, screenplay), /Repeated authored sceneText scaffold/u);
});

test("enhanced cast-aware screenplays require a flat direct-author method audit", () => {
  const process = createEchoSceneKeyframeProcess({ counts: Array.from({ length: 6 }, (_, index) => sourceCount(index)) });
  const delegated = screenplayFor(process, { mutate: (value) => {
    value.avatarContinuity.castPolicy = { primaryAvatarId: "avatar-2", selectionRule: "smallest useful cast", referencedAvatarRule: "explicit binding only", evergreenRule: "optional action-backed cast" };
    value.authoringMethodAudit.subagentsSpawned = 1;
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, delegated), /zero subagents/u);
  const templated = screenplayFor(process, { mutate: (value) => {
    value.avatarContinuity.castPolicy = { primaryAvatarId: "avatar-2", selectionRule: "smallest useful cast", referencedAvatarRule: "explicit binding only", evergreenRule: "optional action-backed cast" };
    value.authoringMethodAudit.authoredFieldAutomationUsed = true;
    value.authoringMethodAudit.authoredFieldTools = ["slot renderer"];
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, templated), /no authored-field automation/u);
});

test("reservoir inspiration is optional but must materially affect its count when present", () => {
  const process = createEchoSceneKeyframeProcess({ counts: [sourceCount()] });
  const decorative = screenplayFor(process, { mutate: (value) => {
    value.sequencePlan[0].counts[0].semanticExtraction.nonInheritedReservoirInspiration = [{
      referenceId: "reservoir-1",
      mechanicOnly: "shared responsibility passes through a quiet handoff",
      notEvidenceOfSongReference: true,
    }];
  } });
  assert.throws(() => validateEchoSongVisualScreenplay(process, decorative), /decorative rather than materially explained/u);
  const functional = screenplayFor(process, { mutate: (value) => {
    const entry = value.sequencePlan[0].counts[0];
    entry.semanticExtraction.nonInheritedReservoirInspiration = [{
      referenceId: "reservoir-1",
      mechanicOnly: "shared responsibility passes through a quiet handoff",
      notEvidenceOfSongReference: true,
    }];
    entry.shot.action = "Blue stages a shared responsibility handoff in the light.";
  } });
  assert.doesNotThrow(() => validateEchoSongVisualScreenplay(process, functional));
});
