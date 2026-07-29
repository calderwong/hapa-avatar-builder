import { createHash } from "node:crypto";
import { generateEchoHyperframeScript } from "./echo-hyperframe-script.js";

const VARIANT_SCHEMA = "hapa.echo.direction-script-variant.v1";
const READY_STATUS = "ready";
const DEFAULT_SHOWCASE_SONG_ID = "dear-papa-song-wish-her-well";

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function finite(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function text(value) {
  return String(value || "").trim();
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function shotDuration(shot = {}) {
  const start = finite(shot.start_sec, 0);
  return Math.max(0, finite(shot.end_sec, start) - start);
}

function shotHasMedia(shot = {}) {
  return Boolean(
    shot.media_uri
    || shot.runtime_media_uri
    || shot.media_contract?.originalUri
    || shot.media_contract?.runtimeUri
    || (shot.media_id && shot.media_id !== "none")
  ) && shot.media_id !== "none";
}

function endpointSongId(endpoint = {}) {
  const match = text(endpoint.cardId).match(/^reference-card:echo-candidate:(dear-papa-song-[^:]+):/);
  return match?.[1] || "";
}

function cueSongMap(directorScriptAlbums = []) {
  const byCardId = new Map();
  for (const album of list(directorScriptAlbums)) {
    for (const script of list(album?.scripts)) {
      if (!script?.songId) continue;
      for (const cue of list(script.cues)) {
        const cardId = text(cue.cardId);
        if (!cardId) continue;
        if (!byCardId.has(cardId)) byCardId.set(cardId, new Set());
        byCardId.get(cardId).add(script.songId);
      }
    }
  }
  return byCardId;
}

export function readyVibesTransitionJobs(queue = {}) {
  return list(queue.jobs)
    .filter((job) => job.status === READY_STATUS && job.output?.uri && job.output?.sha256)
    .sort((a, b) => text(a.completedAt).localeCompare(text(b.completedAt)) || text(a.id).localeCompare(text(b.id)));
}

export function vibesTransitionBatchIdentity(jobs = []) {
  const rows = readyVibesTransitionJobs({ jobs }).map((job) => ({
    id: job.id,
    sha256: job.output.sha256,
    from: job.from?.cardId || "",
    to: job.to?.cardId || "",
  }));
  const fingerprint = sha256(rows);
  return {
    fingerprint,
    variantId: `vibes-reference-transitions-${fingerprint.slice(0, 12)}`,
  };
}

export function assignVibesTransitionJobsToSongs(queue = {}, options = {}) {
  const jobs = readyVibesTransitionJobs(queue);
  const projectSongIds = new Set(list(options.projectSongIds));
  const fallbackSongId = text(options.fallbackSongId) || DEFAULT_SHOWCASE_SONG_ID;
  const byCueCardId = cueSongMap(options.directorScriptAlbums);
  const assignments = new Map();
  const fallbackJobIds = [];
  const unassignedJobIds = [];

  for (const job of jobs) {
    const songIds = new Set([
      endpointSongId(job.from),
      endpointSongId(job.to),
      ...(byCueCardId.get(text(job.from?.cardId)) || []),
      ...(byCueCardId.get(text(job.to?.cardId)) || []),
    ].filter(Boolean));
    const validSongIds = [...songIds].filter((songId) => !projectSongIds.size || projectSongIds.has(songId));
    if (!validSongIds.length && (!projectSongIds.size || projectSongIds.has(fallbackSongId))) {
      validSongIds.push(fallbackSongId);
      fallbackJobIds.push(job.id);
    }
    if (!validSongIds.length) {
      unassignedJobIds.push(job.id);
      continue;
    }
    for (const songId of validSongIds.sort()) {
      if (!assignments.has(songId)) assignments.set(songId, []);
      assignments.get(songId).push(job);
    }
  }

  return {
    assignments,
    jobs,
    fallbackSongId,
    fallbackJobIds,
    unassignedJobIds,
  };
}

function evenlySpacedShotIndices(timeline = [], count = 0) {
  const mediaIndices = list(timeline).map((shot, index) => ({ shot, index })).filter(({ shot }) => shotHasMedia(shot));
  const candidates = mediaIndices.length ? mediaIndices : list(timeline).map((shot, index) => ({ shot, index }));
  if (count > candidates.length) {
    throw new Error(`The source Director Script has only ${candidates.length} usable shot windows for ${count} Vibes transition links.`);
  }
  const selected = [];
  const used = new Set();
  for (let ordinal = 0; ordinal < count; ordinal += 1) {
    const target = ((ordinal + 1) / (count + 1)) * Math.max(0, candidates.length - 1);
    const available = candidates
      .map((row, position) => ({ ...row, position }))
      .filter(({ index }) => !used.has(index))
      .sort((a, b) => Math.abs(a.position - target) - Math.abs(b.position - target)
        || a.index - b.index);
    const chosen = available[0];
    used.add(chosen.index);
    selected.push(chosen.index);
  }
  return selected.sort((a, b) => a - b);
}

function transitionLinkShot(shot = {}, job = {}) {
  const output = job.output || {};
  const duration = finite(output.durationSeconds, shotDuration(shot));
  const cueSeconds = shotDuration(shot);
  const width = finite(output.width, 0) || null;
  const height = finite(output.height, 0) || null;
  const preserved = { ...shot };
  for (const key of [
    "media_id", "media_card_id", "media_card_kind", "media_card_ref", "media_card_title",
    "media_title", "media_uri", "media_thumbnail", "runtime_media_uri", "media_contract",
    "media_source_group", "media_technical_identity", "semantic_casting", "decision_evidence",
    "edit_reason", "transition_link",
  ]) delete preserved[key];
  return {
    ...preserved,
    media_id: output.mediaRecordId,
    media_card_id: job.linkId || job.id,
    media_card_kind: "transition-link",
    media_card_ref: `data/vibes-transition-links/queue.json#${job.id}`,
    media_card_title: job.title,
    media_title: job.title,
    media_uri: output.uri,
    media_thumbnail: job.from?.uri || "",
    runtime_media_uri: output.uri,
    media_source_group: "vibes-transition-link",
    media_technical_identity: `sha256:${output.sha256}`,
    media_contract: {
      schemaVersion: "hapa.echo.playback-media.v2",
      type: "video",
      originalUri: output.uri,
      runtimeUri: output.uri,
      sourceInSeconds: 0,
      sourceOutSeconds: duration,
      actualDurationSeconds: duration,
      playbackMode: duration + 0.08 >= cueSeconds ? "once" : "loop",
      mimeType: output.mimeType || "video/mp4",
      dimensions: {
        width,
        height,
        maxDimension: Math.max(width || 0, height || 0) || null,
      },
      contentHash: output.sha256,
      proxy: { status: "source-direct" },
      fallback: { status: "standby", mode: "ivf" },
      posterUri: job.from?.uri || "",
      preloadPriority: "current",
      durationCoverage: {
        status: "measured",
        cueSeconds,
        sourceSeconds: duration,
      },
    },
    edit_reason: `Vibes transition-link insertion ${job.from?.cardTitle || "first frame"} → ${job.to?.cardTitle || "last frame"}; inherited timing, stems, camera, and transition remain unchanged.`,
    transition_link: {
      schemaVersion: "hapa.echo.vibes-transition-link-cue.v1",
      id: job.linkId || job.id,
      provider: job.provider?.id || "vibes.ai",
      providerOutputUrl: output.providerOutputUrl || job.provider?.outputUrl || "",
      from: {
        cardId: job.from?.cardId || "",
        assetId: job.from?.assetId || "",
        frameUri: job.from?.uri || "",
      },
      to: {
        cardId: job.to?.cardId || "",
        assetId: job.to?.assetId || "",
        frameUri: job.to?.uri || "",
      },
    },
    decision_evidence: {
      schemaVersion: "hapa.echo.shot-decision-evidence.v3",
      truthStatus: "verified-vibes-transition-link",
      candidateId: job.id,
      cardId: job.linkId || job.id,
      contentHash: output.sha256,
      cohort: "vibes-transition-links",
      analyzerRole: "transition",
      analyzerConfidence: "verified-provider-output",
      authoredUse: "connector",
      authoredRoles: ["first-frame-to-last-frame-transition"],
      selectionStrategy: "reference-lineage-song-assignment-evenly-spaced-shot-window",
      sourceGroup: "vibes-transition-link",
      technicalIdentity: `sha256:${output.sha256}`,
      semanticMusicMatch: {
        value: null,
        basis: "not-claimed; the Reference lineage chooses the song while inherited timing chooses the cue window",
      },
      preservedDirection: {
        timing: true,
        stems: true,
        audioBindings: true,
        camera: true,
        transition: true,
      },
    },
  };
}

export function buildVibesTransitionDirectorVariant(project = {}, jobs = [], options = {}) {
  const readyJobs = readyVibesTransitionJobs({ jobs });
  if (!project.song_id) throw new Error("A source Echo Album project with song_id is required.");
  if (!list(project.timeline).length) throw new Error(`Echo Album project ${project.song_id} has no timeline.`);
  if (!readyJobs.length) throw new Error(`No ready Vibes transition videos were assigned to ${project.song_id}.`);

  const batch = options.batchIdentity || vibesTransitionBatchIdentity(options.albumJobs || readyJobs);
  const variantId = text(options.variantId) || batch.variantId;
  const createdAt = text(options.createdAt) || new Date().toISOString();
  const shotIndices = evenlySpacedShotIndices(project.timeline, readyJobs.length);
  const jobByShotIndex = new Map(shotIndices.map((shotIndex, index) => [shotIndex, readyJobs[index]]));
  const timeline = list(project.timeline).map((shot, shotIndex) => (
    jobByShotIndex.has(shotIndex) ? transitionLinkShot(shot, jobByShotIndex.get(shotIndex)) : structuredClone(shot)
  ));
  const scriptProject = { ...project, timeline };
  const selectionEvidence = shotIndices.map((shotIndex, index) => {
    const job = readyJobs[index];
    const shot = timeline[shotIndex];
    return {
      shotIndex,
      startSeconds: finite(shot.start_sec, 0),
      endSeconds: finite(shot.end_sec, finite(shot.start_sec, 0)),
      jobId: job.id,
      linkId: job.linkId || job.id,
      mediaId: job.output.mediaRecordId,
      technicalIdentity: `sha256:${job.output.sha256}`,
      fromCardId: job.from?.cardId || "",
      toCardId: job.to?.cardId || "",
      providerOutputUrl: job.output.providerOutputUrl || job.provider?.outputUrl || "",
    };
  });

  return {
    schemaVersion: VARIANT_SCHEMA,
    id: variantId,
    title: options.title || `Vibes Reference Transitions · ${readyJobs.length} Link${readyJobs.length === 1 ? "" : "s"}`,
    status: READY_STATUS,
    createdAt,
    updatedAt: createdAt,
    parent: {
      songId: project.song_id,
      projectSha256: text(options.parentProjectHash),
      immutableLegacyProject: true,
    },
    seed: `${project.song_id}:${variantId}`,
    sourcePolicy: {
      mode: "append-only-verified-vibes-transition-links",
      allowedSourceGroups: ["vibes-transition-link"],
      readyOutputsOnly: true,
      exactReferenceLineage: true,
      fallbackShowcaseSongId: text(options.fallbackSongId) || DEFAULT_SHOWCASE_SONG_ID,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
    },
    timeline,
    hyperframe_script: generateEchoHyperframeScript(scriptProject),
    selectionEvidence,
    transitionLinks: readyJobs.map((job) => ({
      jobId: job.id,
      linkId: job.linkId || job.id,
      title: job.title,
      mediaRecordId: job.output.mediaRecordId,
      uri: job.output.uri,
      sha256: job.output.sha256,
      fromCardId: job.from?.cardId || "",
      toCardId: job.to?.cardId || "",
      providerOutputUrl: job.output.providerOutputUrl || job.provider?.outputUrl || "",
    })),
    preservation: {
      shotTiming: "preserved",
      lyricTiming: "inherited-unchanged",
      stems: "preserved",
      audioBindings: "preserved",
      cameraMovement: "preserved",
      transitions: "preserved",
      visualizerTimeline: "inherited-unchanged",
      legacyTimeline: "untouched",
      existingDirectionScripts: "untouched",
    },
    telemetry: {
      assignedReadyVideos: readyJobs.length,
      replacementShots: readyJobs.length,
      uniqueMedia: new Set(readyJobs.map((job) => job.output.sha256)).size,
      sourceGroup: "vibes-transition-link",
      batchFingerprint: batch.fingerprint,
      shotIndices,
    },
  };
}

export function vibesTransitionVariantFingerprint(variant = {}) {
  return sha256({
    id: variant.id,
    parent: variant.parent,
    sourcePolicy: variant.sourcePolicy,
    timeline: variant.timeline,
    transitionLinks: variant.transitionLinks,
    preservation: variant.preservation,
  });
}
