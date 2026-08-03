#!/usr/bin/env node

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  selectLatestEchoDirectionScriptVariant,
} from "../src/domain/echo-record-garden.js";
import {
  stableEchoEnrichmentStringify,
} from "../src/domain/echo-enrichment-director-variant.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const DEFAULT_ARTIFACT_ROOT = path.join(ROOT, "artifacts/echo-video-enrichment-v1");
const DEFAULT_APPEND_REPORT = path.join(ROOT, "artifacts/echo-enrichment-director-variants/report.json");
const DEFAULT_INDEX = path.join(ROOT, "data/music-video-project-variants/index.json");
const DEFAULT_VARIANTS = path.join(ROOT, "data/music-video-project-variants");
const DEFAULT_PHYSICAL_VALIDATION = path.join(DEFAULT_ARTIFACT_ROOT, "transition-endpoint-visual-validation.json");
const DEFAULT_CHAIN_GRAPH = path.join(DEFAULT_ARTIFACT_ROOT, "chain-graph.json");

export const REF_CARDS_CERTIFIED_DIRECTOR_AUDIT_SCHEMA = "hapa.echo.ref-cards-certified-director-family-audit.v1";
export const REF_CARDS_PHYSICAL_SAMPLE_CONTRACT = "physical-terminal-frame-presentation-pts-v1";
export const REF_CARDS_TRANSITION_TIME_MAP_SCHEMA = "hapa.echo.transition-time-map.v1";

export const DEFAULT_REF_CARDS_CERTIFIED_DIRECTOR_EXPECTATIONS = Object.freeze({
  songs: 157,
  transitionsPerSong: 2,
  certifiedJobs: 113,
  // The append boundary consumes the finalized certified-only graph. The 19
  // upstream candidate quarantines remain recorded by the finalization receipt,
  // but must not appear in this graph or its second-pass physical receipt.
  quarantinedJobs: 0,
  // The chain graph's transitionLink.sourceRelativePath is authoritative for
  // this subset. Callers may pin a number, but the production default derives
  // it from certified declarations rooted at run2/run3/.
  run3CertifiedJobs: null,
  minimumJobReuse: 2,
  maximumJobReuse: 3,
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => entry !== null && entry !== undefined) : [];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finite(value, fallback = Number.NaN) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function integer(value, fallback = Number.NaN) {
  const number = finite(value, fallback);
  return Number.isSafeInteger(number) ? number : fallback;
}

function close(left, right, epsilon = 0.000001) {
  return Number.isFinite(Number(left))
    && Number.isFinite(Number(right))
    && Math.abs(Number(left) - Number(right)) <= epsilon;
}

function uniqueSorted(values = []) {
  return [...new Set(list(values).map(String).filter(Boolean))].sort();
}

function stableEqual(left, right) {
  return stableEchoEnrichmentStringify(left) === stableEchoEnrichmentStringify(right);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function physicalValidationDigest(report = {}) {
  const core = structuredClone(report);
  delete core.resultDigestSha256;
  delete core.result_digest_sha256;
  return sha256(stableEchoEnrichmentStringify(core));
}

function failure(failures, code, message, detail = null) {
  failures.push({ code, message, ...(detail ? { detail } : {}) });
}

function normalizedSourceRelativePath(value) {
  return text(value).replaceAll("\\", "/").replace(/^\.\/+/, "");
}

function jobIdFromDeclaration(declaration = {}) {
  return text(
    declaration.transitionLink?.id
    || declaration.transition_link?.id
    || declaration.jobId
    || declaration.job_id,
  );
}

function mediaIdFromDeclaration(declaration = {}) {
  return text(
    declaration.transitionMediaId
    || declaration.transition_media_id
    || declaration.mediaId
    || declaration.media_id
    || declaration.transitionLink?.mediaId
    || declaration.transition_link?.media_id,
  );
}

function physicalEndpoint(endpoint = {}) {
  const decodedFrame = object(endpoint.decodedFrame || endpoint.decoded_frame);
  const sourceTiming = object(endpoint.sourceTiming || endpoint.source_timing);
  const declaredReference = object(endpoint.declaredReference || endpoint.declared_reference);
  return {
    decision: text(endpoint.decision).toLowerCase(),
    frameIndex: integer(decodedFrame.frameIndex ?? decodedFrame.frame_index ?? endpoint.frameIndex ?? endpoint.frame_index),
    nominalAtSeconds: finite(decodedFrame.nominalAtSeconds ?? decodedFrame.nominal_at_seconds),
    sourceTimeSeconds: finite(
      sourceTiming.authoredSourceSeconds
      ?? sourceTiming.authored_source_seconds
      ?? endpoint.sourceTimeSeconds
      ?? endpoint.source_time_seconds,
    ),
    contractId: text(
      sourceTiming.contractId
      || sourceTiming.contract_id
      || endpoint.sourceContractId
      || endpoint.source_contract_id,
    ),
    referenceCardId: text(
      declaredReference.cardId
      || declaredReference.card_id
      || endpoint.declaredReferenceCardId
      || endpoint.declared_reference_card_id,
    ),
    referenceSha256: text(
      declaredReference.declaredSha256
      || declaredReference.declared_sha256
      || endpoint.declaredReferenceSha256
      || endpoint.declared_reference_sha256,
    ).replace(/^sha256:/iu, "").toLowerCase(),
    referenceUri: text(
      declaredReference.uri
      || endpoint.declaredReferenceUri
      || endpoint.declared_reference_uri,
    ),
  };
}

function normalizePhysicalJob(job = {}) {
  const video = object(job.video);
  return {
    jobId: text(job.jobId || job.job_id),
    mediaId: text(job.mediaId || job.media_id || job.transitionMediaId || job.transition_media_id),
    runtimeUri: text(job.runtimeUri || job.runtime_uri),
    decision: text(job.decision || (job.certified === true ? "certified" : "")).toLowerCase(),
    frameCount: integer(video.frameCount ?? video.frame_count ?? job.frameCount ?? job.frame_count),
    durationSeconds: finite(video.durationSeconds ?? video.duration_seconds ?? job.durationSeconds ?? job.duration_seconds),
    fps: finite(video.fps ?? job.fps),
    first: physicalEndpoint(job.endpoints?.first),
    last: physicalEndpoint(job.endpoints?.last),
  };
}

function shotAtomicEvidence(shot = {}) {
  return object(
    shot.decision_evidence?.atomicTransition
    || shot.decisionEvidence?.atomicTransition
    || shot.atomicTransition,
  );
}

function shotMediaId(shot = {}) {
  return text(shot.media_id || shot.mediaId);
}

function shotMediaUri(shot = {}) {
  return text(shot.runtime_media_uri || shot.media_uri || shot.runtimeMediaUri || shot.mediaUri);
}

function shotMediaContract(shot = {}) {
  return object(shot.media_contract || shot.mediaContract);
}

function variantSongId(variant = {}, fallback = "") {
  return text(variant.parent?.songId || variant.parent?.song_id || variant.songId || variant.song_id, fallback);
}

function normalizeVariantRows(variants = []) {
  return list(variants).map((entry) => {
    const variant = object(entry.variant || entry);
    const songId = text(entry.songId || entry.song_id, variantSongId(variant));
    return {
      songId,
      relativePath: text(entry.relativePath || entry.relative_path),
      filePath: text(entry.filePath || entry.file_path),
      variant,
    };
  }).filter((row) => row.songId && text(row.variant.id));
}

function indexRows(index = {}) {
  return list(index.variants || index.rows);
}

function reportCuts(report = {}) {
  return list(report.variants?.cuts);
}

function transitionPlan(variant = {}) {
  return list(variant.telemetry?.transitionPlan || variant.telemetry?.transition_plan);
}

function selectedTransitionJobIds(variant = {}) {
  return uniqueSorted(
    variant.telemetry?.selectedUniqueTransitionJobs
    || variant.telemetry?.selected_unique_transition_jobs,
  );
}

function timeMapFailure(failures, label, timeMap, physicalJob) {
  const firstSeconds = physicalJob.first.sourceTimeSeconds;
  const lastSeconds = physicalJob.last.sourceTimeSeconds;
  const endpointSampling = object(timeMap.endpointFrameSampling || timeMap.endpoint_frame_sampling);
  const checks = [
    [timeMap.schemaVersion === REF_CARDS_TRANSITION_TIME_MAP_SCHEMA, "schema"],
    [timeMap.valid === true, "valid"],
    [text(timeMap.mode) === "fit-source-once-to-cue", "mode"],
    [text(timeMap.playbackMode || timeMap.playback_mode) === "once", "playback-mode"],
    [timeMap.reachesDeclaredLastFrame === true || timeMap.reaches_declared_last_frame === true, "last-frame"],
    [text(endpointSampling.policy) === REF_CARDS_PHYSICAL_SAMPLE_CONTRACT, "sample-contract"],
    [close(timeMap.sourceInSeconds ?? timeMap.source_in_seconds, firstSeconds), "source-in"],
    [close(timeMap.sourceOutSeconds ?? timeMap.source_out_seconds, lastSeconds), "source-out"],
    [close(endpointSampling.firstSeconds ?? endpointSampling.first_seconds, firstSeconds), "sample-first"],
    [close(endpointSampling.lastSeconds ?? endpointSampling.last_seconds, lastSeconds), "sample-last"],
    [text(timeMap.preRoll || timeMap.pre_roll) === "hold-first-frame", "pre-roll"],
    [text(timeMap.postRoll || timeMap.post_roll) === "hold-last-frame", "post-roll"],
  ];
  const failed = checks.filter(([ok]) => !ok).map(([, name]) => name);
  const playbackRate = finite(timeMap.playbackRate ?? timeMap.playback_rate);
  const maximumPlaybackRate = finite(timeMap.maximumPlaybackRate ?? timeMap.maximum_playback_rate);
  if (!(playbackRate > 0) || !(maximumPlaybackRate > 0) || playbackRate > maximumPlaybackRate) {
    failed.push("bounded-playback-rate");
  }
  if (failed.length) {
    failure(failures, "invalid-physical-time-map", `${label} does not preserve the certified physical terminal-frame contract.`, { failed });
  }
}

function auditVariantTriplets({
  failures,
  row,
  physicalByJobId,
  certifiedJobIds,
  quarantinedJobIds,
  declarationsByJobId,
  expectations,
  selectedUsage,
  selectedMediaIds,
}) {
  const { songId, variant } = row;
  const timeline = list(variant.timeline);
  const plan = transitionPlan(variant);
  const atomic = timeline.map((shot, index) => ({ shot, index, evidence: shotAtomicEvidence(shot) }))
    .filter((entry) => text(entry.evidence.role));
  const authored = atomic.filter((entry) => text(entry.evidence.role) === "authored-transition");
  const entries = atomic.filter((entry) => text(entry.evidence.role) === "entry-reference-still");
  const exits = atomic.filter((entry) => text(entry.evidence.role) === "exit-reference-still");
  const planJobIds = plan.map((placement) => text(placement.jobId || placement.job_id)).filter(Boolean);
  const authoredJobIds = authored.map((entry) => text(entry.evidence.transitionJobId || entry.evidence.transition_job_id)).filter(Boolean);
  const telemetryJobIds = selectedTransitionJobIds(variant);

  const exactCounts = [
    [plan.length, expectations.transitionsPerSong, "transition plan"],
    [authored.length, expectations.transitionsPerSong, "authored transition shots"],
    [entries.length, expectations.transitionsPerSong, "entry Reference holds"],
    [exits.length, expectations.transitionsPerSong, "exit Reference holds"],
    [integer(variant.telemetry?.placedTransitions ?? variant.telemetry?.placed_transitions), expectations.transitionsPerSong, "telemetry placed transitions"],
    [integer(variant.telemetry?.selectedTransitionShots ?? variant.telemetry?.selected_transition_shots), expectations.transitionsPerSong, "telemetry authored transition shots"],
    [integer(variant.telemetry?.referenceStillHoldShots ?? variant.telemetry?.reference_still_hold_shots), expectations.transitionsPerSong * 2, "telemetry Reference holds"],
  ];
  for (const [actual, expected, label] of exactCounts) {
    if (actual !== expected) failure(failures, "song-transition-count", `${songId} has ${actual} ${label}; expected ${expected}.`);
  }
  if (new Set(planJobIds).size !== expectations.transitionsPerSong
    || !stableEqual(uniqueSorted(planJobIds), uniqueSorted(authoredJobIds))
    || !stableEqual(uniqueSorted(planJobIds), telemetryJobIds)) {
    failure(failures, "song-transition-job-set", `${songId} does not expose one consistent set of distinct planned, authored, and telemetry transition jobs.`);
  }

  for (const placement of plan) {
    const jobId = text(placement.jobId || placement.job_id);
    const physicalJob = physicalByJobId.get(jobId);
    const declaration = declarationsByJobId.get(jobId);
    if (!jobId || !physicalJob || !declaration) {
      failure(failures, "unresolved-transition-job", `${songId} has an unresolved transition placement ${jobId || "<missing>"}.`);
      continue;
    }
    if (!certifiedJobIds.has(jobId) || physicalJob.decision !== "certified") {
      failure(failures, "uncertified-transition-selected", `${songId} selected non-certified transition ${jobId}.`);
    }
    if (quarantinedJobIds.has(jobId)) {
      failure(failures, "quarantined-transition-selected", `${songId} selected quarantined transition ${jobId}.`);
    }
    if (/^vibes-transition:/iu.test(jobId)) {
      failure(failures, "legacy-vibes-transition-selected", `${songId} selected prior Vibes transition ${jobId}.`);
    }
    if (text(placement.selection?.kind) !== "explicit-assignment") {
      failure(failures, "non-explicit-transition-selected", `${songId} transition ${jobId} is not an explicit certified assignment.`);
    }
    const placementMediaId = text(placement.mediaId || placement.media_id);
    if (placementMediaId !== physicalJob.mediaId || placementMediaId !== mediaIdFromDeclaration(declaration)) {
      failure(failures, "transition-media-identity", `${songId} transition ${jobId} does not match its physical/declaration media ID.`);
    }
    const authoredMatches = authored.filter((entry) => text(
      entry.evidence.transitionJobId || entry.evidence.transition_job_id,
    ) === jobId);
    if (authoredMatches.length !== 1) {
      failure(failures, "transition-shot-resolution", `${songId} transition ${jobId} resolves to ${authoredMatches.length} authored shots; expected one.`);
      continue;
    }
    const authoredEntry = authoredMatches[0];
    const entry = timeline[authoredEntry.index - 1];
    const exit = timeline[authoredEntry.index + 1];
    const entryEvidence = shotAtomicEvidence(entry);
    const exitEvidence = shotAtomicEvidence(exit);
    const sameJob = (evidence) => text(
      evidence.transitionJobId || evidence.transition_job_id,
    ) === jobId;
    if (text(entryEvidence.role) !== "entry-reference-still" || !sameJob(entryEvidence)
      || text(exitEvidence.role) !== "exit-reference-still" || !sameJob(exitEvidence)) {
      failure(failures, "non-atomic-transition-triplet", `${songId} transition ${jobId} is not surrounded by its exact entry and exit Reference holds.`);
      continue;
    }

    const authoredShot = authoredEntry.shot;
    const authoredMediaId = shotMediaId(authoredShot);
    const authoredUri = shotMediaUri(authoredShot);
    const authoredContract = shotMediaContract(authoredShot);
    if (!authoredMediaId || !authoredUri || authoredMediaId !== physicalJob.mediaId || authoredUri !== physicalJob.runtimeUri) {
      failure(failures, "unresolved-transition-media", `${songId} transition ${jobId} has unresolved or mismatched runtime media.`);
    }
    if (text(authoredContract.playbackMode || authoredContract.playback_mode) !== "once"
      || !close(authoredContract.sourceInSeconds ?? authoredContract.source_in_seconds, physicalJob.first.sourceTimeSeconds)
      || !close(authoredContract.sourceOutSeconds ?? authoredContract.source_out_seconds, physicalJob.last.sourceTimeSeconds)) {
      failure(failures, "transition-playback-contract", `${songId} transition ${jobId} is not bound once to its physical first/last frame times.`);
    }
    timeMapFailure(failures, `${songId}/${jobId} plan`, object(placement.transitionTimeMap || placement.transition_time_map), physicalJob);
    timeMapFailure(failures, `${songId}/${jobId} shot`, object(authoredEntry.evidence.timeMapping || authoredEntry.evidence.time_mapping), physicalJob);
    timeMapFailure(failures, `${songId}/${jobId} media`, object(authoredContract.timeMapping || authoredContract.time_mapping), physicalJob);

    const visual = object(authoredEntry.evidence.visualValidation || authoredEntry.evidence.visual_validation);
    const visualEndpoints = object(visual.endpoints);
    if (text(visual.decision).toLowerCase() !== "certified"
      || text(visual.jobId || visual.job_id) !== jobId
      || text(visual.mediaId || visual.media_id) !== physicalJob.mediaId
      || integer(visualEndpoints.first?.frameIndex ?? visualEndpoints.first?.frame_index) !== physicalJob.first.frameIndex
      || integer(visualEndpoints.last?.frameIndex ?? visualEndpoints.last?.frame_index) !== physicalJob.last.frameIndex
      || !close(visualEndpoints.first?.sourceTimeSeconds ?? visualEndpoints.first?.source_time_seconds, physicalJob.first.sourceTimeSeconds)
      || !close(visualEndpoints.last?.sourceTimeSeconds ?? visualEndpoints.last?.source_time_seconds, physicalJob.last.sourceTimeSeconds)) {
      failure(failures, "transition-visual-lineage", `${songId} transition ${jobId} does not carry its exact certified physical endpoint lineage.`);
    }

    const expectedEntryMediaId = physicalJob.first.referenceSha256
      ? `hapa-media:sha256:${physicalJob.first.referenceSha256}`
      : "";
    const expectedExitMediaId = physicalJob.last.referenceSha256
      ? `hapa-media:sha256:${physicalJob.last.referenceSha256}`
      : "";
    for (const [role, shot, expectedMediaId, expectedUri] of [
      ["entry", entry, expectedEntryMediaId, physicalJob.first.referenceUri],
      ["exit", exit, expectedExitMediaId, physicalJob.last.referenceUri],
    ]) {
      const mediaId = shotMediaId(shot);
      const uri = shotMediaUri(shot);
      const contract = shotMediaContract(shot);
      if (!mediaId || !uri || (expectedMediaId && mediaId !== expectedMediaId)
        || (expectedUri && uri !== expectedUri)
        || text(contract.playbackMode || contract.playback_mode) !== "hold"
        || text(contract.provenance) !== "certified-transition-reference-still") {
        failure(failures, "unresolved-reference-hold", `${songId} transition ${jobId} ${role} Reference hold is unresolved or not the certified still.`);
      }
    }
    if (text(placement.firstReferenceId || placement.first_reference_id) !== physicalJob.first.referenceCardId
      || text(placement.lastReferenceId || placement.last_reference_id) !== physicalJob.last.referenceCardId) {
      failure(failures, "transition-reference-identity", `${songId} transition ${jobId} does not retain its declared Reference Card endpoints.`);
    }

    selectedUsage.set(jobId, (selectedUsage.get(jobId) || 0) + 1);
    selectedMediaIds.add(physicalJob.mediaId);
  }
}

export function auditRefCardsCertifiedDirectorFamily({
  appendReport = {},
  variantIndex = {},
  variants = [],
  physicalValidation = {},
  chainGraph = {},
  expectations: requestedExpectations = {},
} = {}) {
  const expectations = {
    ...DEFAULT_REF_CARDS_CERTIFIED_DIRECTOR_EXPECTATIONS,
    ...object(requestedExpectations),
  };
  const expectedPlacedTransitions = expectations.songs * expectations.transitionsPerSong;
  const expectedReferenceHolds = expectedPlacedTransitions * 2;
  const failures = [];
  const cuts = reportCuts(appendReport);
  const rows = normalizeVariantRows(variants);
  const allVariantsBySong = new Map();
  for (const row of rows) {
    const matches = allVariantsBySong.get(row.songId) || [];
    matches.push(row);
    allVariantsBySong.set(row.songId, matches);
  }

  if (appendReport.schemaVersion !== "hapa.echo.enrichment-director-variant-report.v1"
    || appendReport.mode !== "apply" || appendReport.dryRun !== false) {
    failure(failures, "append-report-not-production", "The append report is not a persisted production enrichment Director report.");
  }
  if (cuts.length !== expectations.songs || integer(appendReport.variants?.songs) !== expectations.songs) {
    failure(failures, "song-count", `The append report covers ${cuts.length} cuts; expected ${expectations.songs}.`);
  }
  const cutSongIds = cuts.map((cut) => text(cut.songId || cut.song_id)).filter(Boolean);
  if (new Set(cutSongIds).size !== expectations.songs) {
    failure(failures, "song-identity", "The append report does not contain exactly one cut per canonical song.");
  }

  const batchFingerprint = text(appendReport.batch?.batchFingerprint || appendReport.batch?.batch_fingerprint);
  const indexBatch = object(variantIndex.enrichmentDirectorBatch || variantIndex.enrichment_director_batch);
  if (!batchFingerprint || text(indexBatch.batchFingerprint || indexBatch.batch_fingerprint) !== batchFingerprint
    || integer(indexBatch.songCount ?? indexBatch.song_count) !== expectations.songs
    || integer(indexBatch.cutCount ?? indexBatch.cut_count) !== expectations.songs
    || indexBatch.appendOnly !== true) {
    failure(failures, "index-batch-parity", "The Direction Variant index does not identify the same complete append-only batch as the report.");
  }

  const declaredTransitions = list(chainGraph.declaredTransitions || chainGraph.declared_transitions);
  const declarationsByJobId = new Map();
  for (const declaration of declaredTransitions) {
    const jobId = jobIdFromDeclaration(declaration);
    const sourceRelativePath = normalizedSourceRelativePath(
      declaration.transitionLink?.sourceRelativePath
      || declaration.transition_link?.source_relative_path,
    );
    if (!jobId || declarationsByJobId.has(jobId)) {
      failure(failures, "declared-job-identity", `The chain graph has a missing or duplicate transition job ${jobId || "<missing>"}.`);
      continue;
    }
    if (!sourceRelativePath) {
      failure(failures, "missing-source-relative-path", `Declared transition ${jobId} has no transitionLink.sourceRelativePath.`);
    }
    if (/^vibes-transition:/iu.test(jobId)) {
      failure(failures, "legacy-vibes-declaration", `The final chain graph still declares prior Vibes job ${jobId}.`);
    }
    declarationsByJobId.set(jobId, declaration);
  }

  if (physicalValidation.schemaVersion !== "hapa.echo.transition-endpoint-visual-validation.v1"
    || physicalValidation.algorithm?.sourceSampleContract?.id !== REF_CARDS_PHYSICAL_SAMPLE_CONTRACT) {
    failure(failures, "physical-validation-contract", "The physical validation receipt does not use the supported terminal-frame sample contract.");
  }
  const declaredResultDigest = text(
    physicalValidation.resultDigestSha256 || physicalValidation.result_digest_sha256,
  ).replace(/^sha256:/iu, "").toLowerCase();
  if (!declaredResultDigest || declaredResultDigest !== physicalValidationDigest(physicalValidation)) {
    failure(failures, "physical-validation-digest", "The physical validation result digest is missing or stale.");
  }
  const physicalJobs = list(physicalValidation.jobs || physicalValidation.results).map(normalizePhysicalJob);
  const physicalByJobId = new Map();
  for (const job of physicalJobs) {
    if (!job.jobId || physicalByJobId.has(job.jobId)) {
      failure(failures, "physical-job-identity", `The physical receipt has a missing or duplicate job ${job.jobId || "<missing>"}.`);
      continue;
    }
    physicalByJobId.set(job.jobId, job);
    const firstTerminal = job.first.frameIndex === 0
      && close(job.first.sourceTimeSeconds, 0)
      && job.first.contractId === REF_CARDS_PHYSICAL_SAMPLE_CONTRACT;
    const lastTerminal = job.last.frameIndex === job.frameCount - 1
      && job.last.contractId === REF_CARDS_PHYSICAL_SAMPLE_CONTRACT
      && close(job.last.nominalAtSeconds, (job.frameCount - 1) / job.fps)
      && close(job.last.sourceTimeSeconds, job.last.nominalAtSeconds)
      && job.last.sourceTimeSeconds < job.durationSeconds;
    if (!firstTerminal || !lastTerminal) {
      failure(failures, "non-terminal-physical-job", `Physical job ${job.jobId} does not certify n=0 and n=frameCount-1.`);
    }
    if (!declarationsByJobId.has(job.jobId)
      || mediaIdFromDeclaration(declarationsByJobId.get(job.jobId)) !== job.mediaId
      || !job.runtimeUri) {
      failure(failures, "physical-declaration-parity", `Physical job ${job.jobId} does not resolve exactly to its chain declaration and runtime media.`);
    }
    if (/^vibes-transition:/iu.test(job.jobId)) {
      failure(failures, "legacy-vibes-physical-job", `The final physical receipt still contains prior Vibes job ${job.jobId}.`);
    }
  }
  if (physicalByJobId.size !== declarationsByJobId.size) {
    failure(failures, "physical-declaration-count", `Physical jobs (${physicalByJobId.size}) and chain declarations (${declarationsByJobId.size}) differ.`);
  }

  const certifiedJobs = physicalJobs.filter((job) => job.decision === "certified");
  const quarantinedJobs = physicalJobs.filter((job) => job.decision === "quarantined");
  const certifiedJobIds = new Set(certifiedJobs.map((job) => job.jobId));
  const quarantinedJobIds = new Set(quarantinedJobs.map((job) => job.jobId));
  if (certifiedJobs.length !== expectations.certifiedJobs || quarantinedJobs.length !== expectations.quarantinedJobs) {
    failure(failures, "physical-decision-counts", `Physical validation has ${certifiedJobs.length} certified and ${quarantinedJobs.length} quarantined jobs; expected ${expectations.certifiedJobs}/${expectations.quarantinedJobs}.`);
  }
  const physicalAggregate = object(physicalValidation.aggregate);
  if (integer(physicalAggregate.certifiedJobs ?? physicalAggregate.certified_jobs) !== certifiedJobs.length
    || integer(physicalAggregate.quarantinedJobs ?? physicalAggregate.quarantined_jobs) !== quarantinedJobs.length
    || integer(physicalAggregate.declaredTransitionCount ?? physicalAggregate.declared_transition_count) !== physicalJobs.length) {
    failure(failures, "physical-aggregate-counts", "The physical receipt aggregate does not match its per-job decisions.");
  }
  const wrongReferenceControls = object(
    physicalAggregate.wrongReferenceControls || physicalAggregate.wrong_reference_controls,
  );
  if (integer(
    wrongReferenceControls.fullCertificationRulePass
    ?? wrongReferenceControls.full_certification_rule_pass,
  ) !== 0) {
    failure(failures, "wrong-reference-control-pass", "At least one wrong-reference control passed the physical certification rule.");
  }
  for (const job of certifiedJobs) {
    if (job.first.decision !== "certified" || job.last.decision !== "certified") {
      failure(failures, "contradictory-certified-job", `Certified physical job ${job.jobId} does not have two certified endpoints.`);
    }
  }

  const embeddedPhysical = object(appendReport.enrichment?.transitionEndpoints?.visualValidation);
  if (embeddedPhysical.verified !== true
    || text(embeddedPhysical.resultDigestSha256 || embeddedPhysical.result_digest_sha256) !== declaredResultDigest
    || integer(embeddedPhysical.certifiedJobs ?? embeddedPhysical.certified_jobs) !== expectations.certifiedJobs
    || integer(embeddedPhysical.quarantinedJobs ?? embeddedPhysical.quarantined_jobs) !== expectations.quarantinedJobs
    || !stableEqual(uniqueSorted(embeddedPhysical.certifiedJobIds || embeddedPhysical.certified_job_ids), [...certifiedJobIds].sort())
    || !stableEqual(uniqueSorted(embeddedPhysical.quarantinedJobIds || embeddedPhysical.quarantined_job_ids), [...quarantinedJobIds].sort())) {
    failure(failures, "append-physical-parity", "The append report does not embed the same certified/quarantined physical-validation family.");
  }

  const assignment = object(appendReport.enrichment?.transitionAssignments);
  if (integer(assignment.declaredJobs ?? assignment.declared_jobs) !== physicalJobs.length
    || integer(assignment.certifiedJobs ?? assignment.certified_jobs) !== expectations.certifiedJobs
    || integer(assignment.songs) !== expectations.songs
    || integer(assignment.enrichmentRows ?? assignment.enrichment_rows) !== expectations.certifiedJobs
    || integer(assignment.quarantinedRows ?? assignment.quarantined_rows) !== expectations.quarantinedJobs
    || list(assignment.songsWithoutCertifiedTransitions || assignment.songs_without_certified_transitions).length !== 0) {
    failure(failures, "append-assignment-counts", "The append report does not show a complete certified assignment with quarantines excluded from playback.");
  }

  const selectedUsage = new Map();
  const selectedMediaIds = new Set();
  let newestSelectorCoverage = 0;
  const currentVariantRows = [];
  for (const cut of cuts) {
    const songId = text(cut.songId || cut.song_id);
    const variantId = text(cut.variantId || cut.variant_id);
    const currentMatches = list(allVariantsBySong.get(songId)).filter((row) => text(row.variant.id) === variantId);
    if (currentMatches.length !== 1) {
      failure(failures, "variant-resolution", `${songId}/${variantId} resolves to ${currentMatches.length} variant files; expected one.`);
      continue;
    }
    const row = currentMatches[0];
    currentVariantRows.push(row);
    const variant = row.variant;
    if (variant.schemaVersion !== "hapa.echo.direction-script-variant.v1"
      || text(variant.status).toLowerCase() !== "ready"
      || variant.validation?.ok !== true
      || text(variant.variationSet?.batchFingerprint || variant.variation_set?.batch_fingerprint) !== batchFingerprint) {
      failure(failures, "variant-readiness", `${songId}/${variantId} is not a ready, validated member of the reported batch.`);
    }
    const indexMatches = indexRows(variantIndex).filter((indexRow) => (
      text(indexRow.songId || indexRow.song_id) === songId
      && text(indexRow.variantId || indexRow.variant_id) === variantId
    ));
    const expectedRelativePath = text(row.relativePath, `${songId}/${variantId}.json`);
    if (indexMatches.length !== 1 || text(indexMatches[0]?.relativePath || indexMatches[0]?.relative_path) !== expectedRelativePath) {
      failure(failures, "variant-index-resolution", `${songId}/${variantId} does not resolve exactly once through the persisted index.`);
    }
    const newest = selectLatestEchoDirectionScriptVariant({
      song_id: songId,
      direction_script_variants: list(allVariantsBySong.get(songId)).map((candidate) => candidate.variant),
    });
    if (newest?.id === variantId && newest.selectionBasis === "latest-ready-non-legacy") {
      newestSelectorCoverage += 1;
    } else {
      failure(failures, "newest-selector", `${songId}/${variantId} is not the newest ready non-legacy cut selected by the production selector.`, { selected: newest?.id || null });
    }
    auditVariantTriplets({
      failures,
      row,
      physicalByJobId,
      certifiedJobIds,
      quarantinedJobIds,
      declarationsByJobId,
      expectations,
      selectedUsage,
      selectedMediaIds,
    });
  }

  const selectedJobIds = [...selectedUsage.keys()].sort();
  const expectedCertifiedJobIds = [...certifiedJobIds].sort();
  if (!stableEqual(selectedJobIds, expectedCertifiedJobIds)) {
    failure(failures, "certified-job-coverage", `Selected cuts use ${selectedJobIds.length}/${expectedCertifiedJobIds.length} certified jobs.`);
  }
  const selectedQuarantines = selectedJobIds.filter((jobId) => quarantinedJobIds.has(jobId));
  if (selectedQuarantines.length) {
    failure(failures, "quarantined-job-coverage", `${selectedQuarantines.length} quarantined jobs appear in selected cuts.`, { jobIds: selectedQuarantines });
  }
  const reuse = Object.fromEntries([...selectedUsage.entries()].sort(([left], [right]) => left.localeCompare(right)));
  const reuseCounts = [...selectedUsage.values()];
  const minimumReuse = reuseCounts.length ? Math.min(...reuseCounts) : 0;
  const maximumReuse = reuseCounts.length ? Math.max(...reuseCounts) : 0;
  const reuseDistribution = Object.fromEntries(
    [...new Set(reuseCounts)].sort((left, right) => left - right).map((count) => [String(count), reuseCounts.filter((value) => value === count).length]),
  );
  if (reuseCounts.some((count) => count < expectations.minimumJobReuse || count > expectations.maximumJobReuse)
    || minimumReuse !== expectations.minimumJobReuse
    || maximumReuse !== expectations.maximumJobReuse) {
    failure(failures, "transition-job-reuse", `Certified job reuse spans ${minimumReuse}-${maximumReuse}; expected ${expectations.minimumJobReuse}-${expectations.maximumJobReuse}.`);
  }
  if (expectations.maximumJobReuse === expectations.minimumJobReuse + 1) {
    const expectedAtMaximum = expectedPlacedTransitions - (expectations.certifiedJobs * expectations.minimumJobReuse);
    const expectedAtMinimum = expectations.certifiedJobs - expectedAtMaximum;
    if (expectedAtMaximum < 0 || expectedAtMinimum < 0
      || integer(reuseDistribution[String(expectations.minimumJobReuse)], 0) !== expectedAtMinimum
      || integer(reuseDistribution[String(expectations.maximumJobReuse)], 0) !== expectedAtMaximum) {
      failure(
        failures,
        "transition-job-reuse-distribution",
        `Certified reuse distribution is ${JSON.stringify(reuseDistribution)}; expected ${expectedAtMinimum} jobs×${expectations.minimumJobReuse} and ${expectedAtMaximum} jobs×${expectations.maximumJobReuse}.`,
      );
    }
  }

  const run3Certified = [...declarationsByJobId.entries()].filter(([jobId, declaration]) => (
    certifiedJobIds.has(jobId)
    && normalizedSourceRelativePath(
      declaration.transitionLink?.sourceRelativePath
      || declaration.transition_link?.source_relative_path,
    ).startsWith("run2/run3/")
  ));
  const run3Missing = run3Certified.filter(([jobId, declaration]) => (
    !selectedUsage.has(jobId) || !selectedMediaIds.has(mediaIdFromDeclaration(declaration))
  )).map(([jobId]) => jobId);
  const expectedRun3CertifiedJobs = Number.isSafeInteger(expectations.run3CertifiedJobs)
    ? expectations.run3CertifiedJobs
    : run3Certified.length;
  if (run3Certified.length !== expectedRun3CertifiedJobs || run3Missing.length) {
    failure(failures, "run3-certified-coverage", `Selected cuts use ${run3Certified.length - run3Missing.length}/${run3Certified.length} certified run3 jobs; expected ${expectedRun3CertifiedJobs} total.`, { missingJobIds: run3Missing });
  }

  const motion = object(appendReport.variants?.motion);
  const reportReuse = object(motion.transitionJobReuse || motion.transition_job_reuse);
  const reportSongsByCount = object(motion.songsByTransitionCount || motion.songs_by_transition_count);
  const reportUniqueJobs = uniqueSorted(motion.uniqueAuthoredTransitionJobs || motion.unique_authored_transition_jobs);
  const motionChecks = [
    [integer(motion.placedTransitions ?? motion.placed_transitions), expectedPlacedTransitions, "placed transitions"],
    [integer(motion.authoredTransitionShots ?? motion.authored_transition_shots), expectedPlacedTransitions, "authored transition shots"],
    [integer(motion.referenceStillHoldShots ?? motion.reference_still_hold_shots), expectedReferenceHolds, "Reference holds"],
    [integer(motion.explicitTransitionPlacements ?? motion.explicit_transition_placements), expectedPlacedTransitions, "explicit placements"],
    [integer(motion.inferredTransitionPlacements ?? motion.inferred_transition_placements), 0, "inferred placements"],
    [integer(motion.maximumTransitionJobReuse ?? motion.maximum_transition_job_reuse), expectations.maximumJobReuse, "maximum job reuse"],
  ];
  for (const [actual, expected, label] of motionChecks) {
    if (actual !== expected) failure(failures, "append-motion-count", `Append report has ${actual} ${label}; expected ${expected}.`);
  }
  if (!stableEqual(reportUniqueJobs, expectedCertifiedJobIds)
    || !stableEqual(reportReuse, reuse)
    || integer(reportSongsByCount[String(expectations.transitionsPerSong)]) !== expectations.songs
    || list(motion.songsWithoutTransitions || motion.songs_without_transitions).length !== 0) {
    failure(failures, "append-motion-ledger", "The append report motion ledger does not match exact per-song and per-job variant evidence.");
  }

  if (appendReport.validation?.exactSongCoverage !== true
    || appendReport.validation?.oneCutPerSong !== true
    || appendReport.validation?.allCutsReady !== true
    || appendReport.validation?.baseProjectsMutated !== 0
    || appendReport.validation?.existingVariantsMutated !== 0
    || appendReport.validation?.indexMatchesDiskAfterApply !== true) {
    failure(failures, "append-validation", "The append report production validation is incomplete or records a mutation/parity failure.");
  }

  const totals = {
    songs: currentVariantRows.length,
    newestSelectorCoverage,
    placedTransitions: [...selectedUsage.values()].reduce((sum, count) => sum + count, 0),
    authoredTransitionShots: currentVariantRows.reduce((sum, row) => sum + list(row.variant.timeline).filter((shot) => (
      text(shotAtomicEvidence(shot).role) === "authored-transition"
    )).length, 0),
    referenceHolds: currentVariantRows.reduce((sum, row) => sum + list(row.variant.timeline).filter((shot) => (
      ["entry-reference-still", "exit-reference-still"].includes(text(shotAtomicEvidence(shot).role))
    )).length, 0),
    certifiedJobs: certifiedJobs.length,
    quarantinedJobs: quarantinedJobs.length,
    selectedCertifiedJobs: selectedJobIds.filter((jobId) => certifiedJobIds.has(jobId)).length,
    selectedQuarantinedJobs: selectedQuarantines.length,
    run3CertifiedJobs: run3Certified.length,
    run3CertifiedJobsSelected: run3Certified.length - run3Missing.length,
    minimumJobReuse: minimumReuse,
    maximumJobReuse: maximumReuse,
    reuseDistribution,
    unresolvedMedia: failures.filter((entry) => /unresolved|media-identity|reference-hold/iu.test(entry.code)).length,
    priorVibesJobIds: failures.filter((entry) => entry.code.includes("vibes")).length,
  };
  if (totals.placedTransitions !== expectedPlacedTransitions
    || totals.authoredTransitionShots !== expectedPlacedTransitions
    || totals.referenceHolds !== expectedReferenceHolds
    || totals.newestSelectorCoverage !== expectations.songs
    || totals.unresolvedMedia !== 0) {
    failure(failures, "aggregate-evidence", "Persisted variant evidence does not meet the required production totals.", totals);
  }

  return {
    schemaVersion: REF_CARDS_CERTIFIED_DIRECTOR_AUDIT_SCHEMA,
    ok: failures.length === 0,
    batchFingerprint: batchFingerprint || null,
    expectations: {
      ...expectations,
      run3CertifiedJobs: expectedRun3CertifiedJobs,
      placedTransitions: expectedPlacedTransitions,
      authoredTransitionShots: expectedPlacedTransitions,
      referenceHolds: expectedReferenceHolds,
      newestSelectorCoverage: expectations.songs,
    },
    totals,
    jobReuse: reuse,
    run3CertifiedJobIds: run3Certified.map(([jobId]) => jobId).sort(),
    failures,
  };
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read ${label} ${filePath}: ${error.message}`, { cause: error });
  }
}

export function readDirectionVariants(variantsRoot) {
  const root = path.resolve(variantsRoot);
  const rows = [];
  for (const directory of fs.readdirSync(root, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))) {
    if (directory.isSymbolicLink()) throw new Error(`Direction Variant root contains a symbolic link: ${directory.name}`);
    if (!directory.isDirectory()) continue;
    const directoryPath = path.join(root, directory.name);
    for (const entry of fs.readdirSync(directoryPath, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.name.endsWith(".json")) continue;
      const relativePath = path.posix.join(directory.name, entry.name);
      if (entry.isSymbolicLink() || !entry.isFile()) throw new Error(`Direction Variant is not a regular file: ${relativePath}`);
      const filePath = path.join(directoryPath, entry.name);
      const variant = readJson(filePath, "Direction Variant");
      rows.push({ songId: directory.name, relativePath, filePath, variant });
    }
  }
  return rows;
}

function option(argv, name, fallback) {
  const exactIndex = argv.indexOf(name);
  if (exactIndex >= 0) {
    const value = argv[exactIndex + 1];
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
    return value;
  }
  const prefixed = argv.find((argument) => argument.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

function positiveIntegerOption(argv, name, fallback, { allowZero = false } = {}) {
  const value = Number(option(argv, name, String(fallback)));
  if (!Number.isSafeInteger(value) || value < (allowZero ? 0 : 1)) throw new Error(`${name} must be ${allowZero ? "a non-negative" : "a positive"} integer.`);
  return value;
}

function optionalPositiveIntegerOption(argv, name, { allowZero = false } = {}) {
  const supplied = argv.includes(name) || argv.some((argument) => argument.startsWith(`${name}=`));
  return supplied ? positiveIntegerOption(argv, name, 0, { allowZero }) : null;
}

function parseArguments(argv = process.argv.slice(2)) {
  const valueOptions = new Set([
    "--append-report", "--index", "--variants", "--physical-validation", "--chain-graph",
    "--expected-songs", "--transitions-per-song", "--expected-certified-jobs",
    "--expected-quarantined-jobs", "--expected-run3-certified-jobs",
    "--minimum-job-reuse", "--maximum-job-reuse",
  ]);
  const flags = new Set(["--json", "--help", "-h"]);
  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    const name = raw.includes("=") ? raw.slice(0, raw.indexOf("=")) : raw;
    if (!valueOptions.has(name) && !flags.has(name)) throw new Error(`Unknown argument: ${raw}`);
    if (valueOptions.has(name) && !raw.includes("=")) index += 1;
  }
  return {
    help: argv.includes("--help") || argv.includes("-h"),
    json: argv.includes("--json"),
    appendReportPath: path.resolve(option(argv, "--append-report", DEFAULT_APPEND_REPORT)),
    indexPath: path.resolve(option(argv, "--index", DEFAULT_INDEX)),
    variantsRoot: path.resolve(option(argv, "--variants", DEFAULT_VARIANTS)),
    physicalValidationPath: path.resolve(option(argv, "--physical-validation", DEFAULT_PHYSICAL_VALIDATION)),
    chainGraphPath: path.resolve(option(argv, "--chain-graph", DEFAULT_CHAIN_GRAPH)),
    expectations: {
      songs: positiveIntegerOption(argv, "--expected-songs", DEFAULT_REF_CARDS_CERTIFIED_DIRECTOR_EXPECTATIONS.songs),
      transitionsPerSong: positiveIntegerOption(argv, "--transitions-per-song", DEFAULT_REF_CARDS_CERTIFIED_DIRECTOR_EXPECTATIONS.transitionsPerSong),
      certifiedJobs: positiveIntegerOption(argv, "--expected-certified-jobs", DEFAULT_REF_CARDS_CERTIFIED_DIRECTOR_EXPECTATIONS.certifiedJobs),
      quarantinedJobs: positiveIntegerOption(argv, "--expected-quarantined-jobs", DEFAULT_REF_CARDS_CERTIFIED_DIRECTOR_EXPECTATIONS.quarantinedJobs, { allowZero: true }),
      run3CertifiedJobs: optionalPositiveIntegerOption(argv, "--expected-run3-certified-jobs", { allowZero: true }),
      minimumJobReuse: positiveIntegerOption(argv, "--minimum-job-reuse", DEFAULT_REF_CARDS_CERTIFIED_DIRECTOR_EXPECTATIONS.minimumJobReuse),
      maximumJobReuse: positiveIntegerOption(argv, "--maximum-job-reuse", DEFAULT_REF_CARDS_CERTIFIED_DIRECTOR_EXPECTATIONS.maximumJobReuse),
    },
  };
}

function usage() {
  return [
    "Usage: node scripts/audit-ref-cards-certified-director-family.mjs [options]",
    "",
    "Read-only production acceptance gate for the final Ref Cards certified Director family.",
    "",
    "  --append-report PATH",
    "  --index PATH",
    "  --variants PATH",
    "  --physical-validation PATH",
    "  --chain-graph PATH",
    "  --expected-songs N",
    "  --transitions-per-song N",
    "  --expected-certified-jobs N",
    "  --expected-quarantined-jobs N",
    "  --expected-run3-certified-jobs N",
    "  --minimum-job-reuse N",
    "  --maximum-job-reuse N",
    "  --json",
  ].join("\n");
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  if (options.help) {
    process.stdout.write(`${usage()}\n`);
    return null;
  }
  const result = auditRefCardsCertifiedDirectorFamily({
    appendReport: readJson(options.appendReportPath, "append report"),
    variantIndex: readJson(options.indexPath, "Direction Variant index"),
    variants: readDirectionVariants(options.variantsRoot),
    physicalValidation: readJson(options.physicalValidationPath, "physical endpoint validation"),
    chainGraph: readJson(options.chainGraphPath, "transition chain graph"),
    expectations: options.expectations,
  });
  process.stdout.write(`${JSON.stringify(options.json ? result : {
    schemaVersion: result.schemaVersion,
    ok: result.ok,
    batchFingerprint: result.batchFingerprint,
    expectations: result.expectations,
    totals: result.totals,
    run3CertifiedJobIds: result.run3CertifiedJobIds,
    failures: result.failures.slice(0, 50),
  }, null, 2)}\n`);
  if (!result.ok) process.exitCode = 1;
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error?.stack || error}\n`);
    process.exitCode = 1;
  }
}
