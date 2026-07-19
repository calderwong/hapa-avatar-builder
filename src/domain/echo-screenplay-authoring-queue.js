import {
  ECHO_SONG_VISUAL_SCREENPLAY_SCHEMA,
  validateEchoSongVisualScreenplay,
} from "./echo-scene-keyframe-process.js";
import { validateEchoScreenplaySourcePacket } from "./echo-screenplay-source-packet.js";

export const ECHO_SCREENPLAY_AUTHORING_QUEUE_REPORT_SCHEMA = "hapa.echo.full-song-screenplay-authoring-queue-report.v1";

const ADVANCEMENT_ORDER = Object.freeze([
  "packet_missing",
  "packet_ready",
  "authoring_partial",
  "awaiting_finalization",
  "awaiting_review",
  "approved",
  "staged_imported",
  "image_activation_partial",
  "complete",
]);

const unique = (values) => [...new Set((values || []).filter(Boolean))];
const normalizeHash = (value) => String(value || "").replace(/^sha256:/u, "");
const sameHash = (left, right) => Boolean(left && right && normalizeHash(left) === normalizeHash(right));
const countIdsFromScreenplay = (screenplay) => unique((screenplay?.sequencePlan || [])
  .flatMap((sequence) => sequence?.counts || [])
  .map((count) => count?.countId));
const countIdsFromPacket = (packet) => unique((packet?.fourCounts || []).map((count) => count?.id));

function coverage(expectedIds, observedIds) {
  const expected = new Set(expectedIds);
  const observed = unique(observedIds);
  const matchedIds = observed.filter((id) => expected.has(id));
  const unexpectedIds = observed.filter((id) => !expected.has(id));
  const missingIds = expectedIds.filter((id) => !observed.includes(id));
  return {
    expected: expectedIds.length,
    observed: observed.length,
    matched: matchedIds.length,
    missing: missingIds.length,
    unexpected: unexpectedIds.length,
    exact: missingIds.length === 0 && unexpectedIds.length === 0 && observed.length === expectedIds.length,
    matchedIds,
    missingIds,
    unexpectedIds,
  };
}

function artifactSummary(artifact) {
  return {
    file: artifact.file,
    readable: artifact.readable !== false,
    valid: artifact.valid !== false,
    modifiedAt: artifact.modifiedAt || null,
    countCoverage: artifact.countCoverage,
    rejected: Boolean(artifact.rejected),
    finalized: Boolean(artifact.finalized),
    validationError: artifact.validationError || null,
  };
}

function bestByCoverage(artifacts) {
  return [...artifacts].sort((left, right) => {
    if (Boolean(left.rejected) !== Boolean(right.rejected)) return left.rejected ? 1 : -1;
    if ((left.valid !== false) !== (right.valid !== false)) return left.valid === false ? 1 : -1;
    if ((left.readable !== false) !== (right.readable !== false)) return left.readable === false ? 1 : -1;
    if (Boolean(left.finalized) !== Boolean(right.finalized)) return left.finalized ? -1 : 1;
    if (left.countCoverage.matched !== right.countCoverage.matched) return right.countCoverage.matched - left.countCoverage.matched;
    return String(right.modifiedAt || "").localeCompare(String(left.modifiedAt || ""));
  })[0] || null;
}

function receiptMatches(receipt, screenplay) {
  if (!receipt?.payload || !screenplay?.payload) return false;
  const payload = receipt.payload;
  const authored = screenplay.payload.authoringProvenance;
  return payload.status === "approved"
    && payload.reviewType === "independent_screenplay_review"
    && sameHash(payload.screenplayHash, screenplay.screenplayHash)
    && sameHash(payload.authoringArtifactHash, authored?.artifactHash)
    && payload.reviewedBy !== authored?.agentTaskName
    && payload.reviewedBy !== authored?.attestation?.attestedBy;
}

function processCoverage(counts) {
  const promptReady = counts.filter((count) => count.lanes?.prompt?.artifact?.state === "ready");
  const staged = promptReady.filter((count) => count.lanes?.prompt?.artifact?.screenplayRef?.screenplayHash);
  const activated = staged.filter((count) => {
    const quest = count.lanes?.image?.quest;
    return ["open", "claimed", "complete"].includes(quest?.status)
      && sameHash(quest?.inputHash, count.lanes?.prompt?.artifact?.contentHash);
  });
  const keyframes = counts.filter((count) => count.lanes?.image?.artifact?.state === "keyframe_exists");
  const stagedKeyframes = staged.filter((count) => count.lanes?.image?.artifact?.state === "keyframe_exists");
  const heldVideos = counts.filter((count) => count.lanes?.video?.quest?.status === "held");
  return {
    promptReady: promptReady.length,
    stagedImported: staged.length,
    imageActivated: activated.length,
    keyframes: keyframes.length,
    stagedKeyframes: stagedKeyframes.length,
    heldVideos: heldVideos.length,
  };
}

function chooseState({ total, packet, screenplay, approved, processFacts }) {
  if (total > 0 && processFacts.keyframes === total) return "complete";
  if (processFacts.stagedImported > 0) {
    if (processFacts.imageActivated > 0 || processFacts.stagedKeyframes > 0) return "image_activation_partial";
    return "staged_imported";
  }
  if (approved) return "approved";
  if (screenplay?.finalized && screenplay.countCoverage.exact && !screenplay.rejected) return "awaiting_review";
  if (screenplay) {
    if (screenplay.readable !== false && screenplay.countCoverage.exact && !screenplay.rejected) return "awaiting_finalization";
    return "authoring_partial";
  }
  if (packet?.countCoverage.exact && packet.valid !== false && packet.readable !== false) return "packet_ready";
  return "packet_missing";
}

/**
 * Produce a read-only one-row-per-timing-ready-song lifecycle projection.
 * `artifacts` are filesystem observations prepared by the CLI; this function
 * is pure and cannot claim, generate, activate, resume, or mutate process data.
 */
export function projectEchoScreenplayAuthoringQueue({ process, artifacts = [], generatedAt = new Date().toISOString() }) {
  const timingReady = (process?.counts || []).filter((count) => count.timingStatus === "ready");
  const grouped = new Map();
  for (const count of timingReady) {
    if (!grouped.has(count.songId)) grouped.set(count.songId, []);
    grouped.get(count.songId).push(count);
  }
  const rejectionPaths = new Set(artifacts.filter((artifact) => artifact.kind === "review" && artifact.payload?.candidatePath && artifact.payload?.verdict && artifact.payload.verdict !== "APPROVED")
    .map((artifact) => artifact.payload.candidatePath));

  const rows = [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([songId, counts]) => {
    counts.sort((left, right) => (left.countOrdinal || 0) - (right.countOrdinal || 0));
    const expectedIds = counts.map((count) => count.id);
    const songArtifacts = artifacts.filter((artifact) => artifact.songId === songId);
    const packets = songArtifacts.filter((artifact) => artifact.kind === "packet").map((artifact) => ({
      ...artifact,
      countCoverage: coverage(expectedIds, artifact.countIds || countIdsFromPacket(artifact.payload)),
    }));
    const screenplays = songArtifacts.filter((artifact) => artifact.kind === "screenplay").map((artifact) => {
      const rejected = artifact.rejected || rejectionPaths.has(artifact.file) || rejectionPaths.has(artifact.relativeFile);
      return {
        ...artifact,
        rejected,
        countCoverage: coverage(expectedIds, artifact.countIds || countIdsFromScreenplay(artifact.payload)),
      };
    });
    const packet = bestByCoverage(packets);
    const screenplay = bestByCoverage(screenplays);
    const reviews = artifacts.filter((artifact) => artifact.kind === "approval");
    const approval = screenplay?.finalized ? reviews.find((receipt) => receiptMatches(receipt, screenplay)) || null : null;
    const processFacts = processCoverage(counts);
    const state = chooseState({ total: counts.length, packet, screenplay, approved: Boolean(approval), processFacts });
    const blockers = [];
    if (!packet) blockers.push("source_packet_missing");
    else if (packet.readable === false || packet.valid === false) blockers.push("source_packet_invalid");
    else if (!packet.countCoverage.exact) blockers.push("source_packet_count_coverage_inexact");
    if (screenplay?.readable === false) blockers.push("screenplay_json_incomplete_or_unreadable");
    if (screenplay?.rejected) blockers.push("best_coverage_screenplay_rejected");
    if (screenplay?.validationError) blockers.push("screenplay_validation_failed");
    if (screenplay?.countCoverage && !screenplay.countCoverage.exact) blockers.push("screenplay_count_coverage_incomplete");
    if (screenplay?.finalized && !approval) blockers.push("independent_approval_receipt_missing_or_mismatched");

    return {
      songId,
      state,
      stateRank: ADVANCEMENT_ORDER.indexOf(state),
      exactCountCoverage: {
        sourceBacked: counts.length,
        packet: packet?.countCoverage || coverage(expectedIds, []),
        screenplay: screenplay?.countCoverage || coverage(expectedIds, []),
        promptReady: processFacts.promptReady,
        stagedImported: processFacts.stagedImported,
        imageActivated: processFacts.imageActivated,
        keyframes: processFacts.keyframes,
        heldVideos: processFacts.heldVideos,
      },
      selectedArtifacts: {
        packet: packet ? artifactSummary(packet) : null,
        screenplay: screenplay ? { ...artifactSummary(screenplay), screenplayHash: screenplay.screenplayHash || null } : null,
        approval: approval ? { file: approval.file, reviewedBy: approval.payload.reviewedBy, reviewedAt: approval.payload.reviewedAt, screenplayHash: approval.payload.screenplayHash } : null,
      },
      artifactInventory: {
        packets: packets.map(artifactSummary),
        screenplays: screenplays.map(artifactSummary),
      },
      blockers: unique(blockers),
    };
  });

  const byState = Object.fromEntries(ADVANCEMENT_ORDER.map((state) => [state, rows.filter((row) => row.state === state).length]));
  return {
    schemaVersion: ECHO_SCREENPLAY_AUTHORING_QUEUE_REPORT_SCHEMA,
    generatedAt,
    mode: "read-only-status-projection",
    process: {
      processId: process?.processId || null,
      status: process?.status || "missing",
      timingReadySongs: rows.length,
      timingReadyCounts: timingReady.length,
    },
    safeguards: {
      providerCalls: 0,
      sceneAuthoring: false,
      questClaims: false,
      processResume: false,
      imageActivation: false,
      videoMutation: false,
    },
    summary: { songs: rows.length, counts: timingReady.length, byState },
    rows,
  };
}

/** Inspect a parsed screenplay against current process truth. */
export function inspectEchoScreenplayArtifact(process, artifact) {
  if (artifact.kind !== "screenplay" || artifact.payload?.schemaVersion !== ECHO_SONG_VISUAL_SCREENPLAY_SCHEMA) return artifact;
  let validationError = null;
  let screenplayHash = artifact.payload?.provenance?.contentHash || null;
  let finalized = false;
  try {
    const validation = validateEchoSongVisualScreenplay(process, artifact.payload);
    screenplayHash = validation.screenplayHash;
    finalized = true;
  } catch (error) {
    validationError = error.message;
  }
  return { ...artifact, finalized, screenplayHash, validationError };
}

export function inspectEchoScreenplaySourcePacketArtifact(artifact) {
  if (artifact.kind !== "packet") return artifact;
  const validation = validateEchoScreenplaySourcePacket(artifact.payload);
  return {
    ...artifact,
    valid: validation.ok,
    validationError: validation.ok ? null : `Source packet validation failed: ${validation.errors.join(", ")}`,
  };
}
