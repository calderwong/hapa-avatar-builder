import { hyperFramesMediaOpacityState } from "./echo-media-presentation.js";
import {
  deriveEchoDirectionVariantProject,
  echoDirectionVariantFingerprint,
  echoDirectionVariantId,
  echoDirectionVariantTitle,
} from "./echo-direction-variants.js";
import {
  isLegacyEchoRecordDirectionVariant,
  selectLatestEchoDirectionScriptVariant,
  unwrapEchoDirectorProject,
} from "./echo-record-garden.js";
import { projectToEditorGraph } from "./multitrack-editor.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";
import {
  echoCameraCoverSourceRect,
  echoCameraCropPresentation,
  echoCameraKeyframeAt,
  echoCameraMotionPresentation,
} from "./echo-camera-framing.js";
import { normalizeEchoTransitionTimeMapping } from "./echo-playback-sync.js";
import { visualizerCardsAtTime } from "./echo-isf-browser-runtime.js";
import { admitEchoSectionVisualLayers } from './hyperframes-visualizer-runtime.js';
import { planEchoIsfLayerComposite } from "./echo-isf-frame-intent.js";
import {
  normalizeEchoLyricContract,
} from "./echo-lyric-contract.js";
import { resolveEchoLyricTemplateFrame } from "./echo-lyric-template-runtime.js";

export const ECHO_DIRECTOR_PREVIEW_SOURCE_SCHEMA = "hapa.echo.director-preview-source.v1";
export const ECHO_DIRECTOR_PREVIEW_FRAME_SCHEMA = "hapa.echo.director-preview-frame.v1";
export const ECHO_DIRECTOR_PREVIEW_RUNTIME_SCHEMA = "hapa.echo.director-preview-runtime.v1";
export const ECHO_DIRECTOR_PREVIEW_CARD_PRINT_INTENT_SCHEMA = "hapa.echo.director-preview-card-print-intent.v1";
export const ECHO_DIRECTOR_PREVIEW_CARD_PRINT_RECEIPT_SCHEMA = "hapa.echo.director-preview-card-print-receipt.v1";
export const ECHO_DIRECTOR_PREVIEW_RENDER_ORDER = Object.freeze([
  "media",
  "visualizers",
  "transition",
  "automation",
  "lyrics",
]);

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function optionalFinite(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, finite(value)));
}

function round(value, digits = 6) {
  const factor = 10 ** digits;
  const result = Math.round(finite(value) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
}

function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function previewError(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  return error;
}

function stableHash(value = "") {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function songId(project = {}, graph = {}) {
  return text(project.song_id || project.songId || project.id || graph.song?.id);
}

function songTitle(project = {}, graph = {}) {
  return text(project.song_title || project.songTitle || project.title || graph.song?.title, "Untitled Echo song");
}

function projectDuration(project = {}, graph = {}) {
  const declared = finite(
    project.duration
      ?? project.durationSeconds
      ?? graph.song?.durationSeconds,
    0,
  );
  if (declared > 0) return declared;
  return list(project.timeline).reduce((maximum, row) => (
    Math.max(maximum, finite(row?.end_sec ?? row?.endSeconds ?? row?.end, 0))
  ), 0);
}

function directionVariants(project = {}) {
  return [
    ...list(project.direction_script_variants || project.directionScriptVariants),
    ...list(project.direction_script_variant_summaries || project.directionScriptVariantSummaries),
  ];
}

function exactVariant(project = {}, variantId = "") {
  const id = text(variantId);
  if (!id) return null;
  const rows = directionVariants(project).filter((row) => echoDirectionVariantId(row) === id);
  return rows.find((row) => Array.isArray(row?.timeline) && row.timeline.length)
    || rows[0]
    || null;
}

function activeCut(project = {}) {
  const active = object(project.active_direction_script_variant || project.activeDirectionScriptVariant);
  const id = text(active.id || project.selected_direction_script_variant_id || project.selectedDirectionScriptVariantId);
  if (!id) return null;
  return {
    id,
    title: text(active.title, id),
    fingerprint: text(active.fingerprint || project.director_show_graph?.directorV2?.variantHash) || null,
    selectionBasis: "active-projected-non-legacy",
    strategy: "active-projected-non-legacy",
    legacy: false,
    projectionValidation: clone(active.projectionValidation || null),
    durationProjection: clone(active.durationProjection || null),
  };
}

function sourceFromProjectedProject(project, cut) {
  const showGraph = projectToEditorGraph(project);
  const durationSeconds = projectDuration(project, showGraph);
  return {
    schemaVersion: ECHO_DIRECTOR_PREVIEW_SOURCE_SCHEMA,
    project,
    showGraph,
    song: {
      id: songId(project, showGraph),
      title: songTitle(project, showGraph),
      durationSeconds,
    },
    cut: clone(cut),
    outputProfile: clone(resolveEchoOutputProfile(project.output_profile || project.outputProfile || showGraph.outputProfile)),
    truth: {
      selection: cut.selectionBasis,
      nonLegacy: cut.legacy !== true,
      graphSchemaVersion: text(showGraph.schemaVersion) || null,
      graphVariantId: text(showGraph.directorV2?.variantId) || null,
      graphVariantHash: text(showGraph.directorV2?.variantHash) || null,
      projectionValidation: clone(cut.projectionValidation || null),
    },
  };
}

/**
 * Selects and projects the newest eligible non-legacy Director cut. This is
 * intentionally fail-closed: a missing modern cut cannot silently present the
 * Legacy Baseline while claiming to be current.
 */
export function selectEchoDirectorPreviewSource(projectPayload = null, options = {}) {
  if (projectPayload?.schemaVersion === ECHO_DIRECTOR_PREVIEW_SOURCE_SCHEMA) {
    return projectPayload;
  }
  const project = unwrapEchoDirectorProject(projectPayload);
  if (!project) {
    throw previewError(
      "echo_director_preview_project_missing",
      "Echo Director Preview requires a hydrated song project.",
    );
  }

  const requestedId = text(options.variantId || options.cutId);
  const latest = requestedId
    ? null
    : selectLatestEchoDirectionScriptVariant(project);
  const selectedId = requestedId || text(latest?.id);
  const selectedVariant = exactVariant(project, selectedId);
  const projectedActive = activeCut(project);
  const activeGraphReady = Boolean(project.director_show_graph?.tracks);
  const activeMatches = Boolean(
    projectedActive
      && activeGraphReady
      && (!selectedId || projectedActive.id === selectedId),
  );

  if (selectedVariant && !isLegacyEchoRecordDirectionVariant(selectedVariant)) {
    if (!Array.isArray(selectedVariant.timeline) || !selectedVariant.timeline.length) {
      if (!activeMatches) {
        throw previewError(
          "echo_director_preview_cut_not_hydrated",
          `Director cut ${selectedId} is selected but its full timeline is not hydrated.`,
          { cutId: selectedId },
        );
      }
    } else {
      const projected = deriveEchoDirectionVariantProject(project, selectedVariant);
      const projectedCut = object(projected.active_direction_script_variant);
      return sourceFromProjectedProject(projected, {
        id: selectedId,
        title: text(projectedCut.title || latest?.title || echoDirectionVariantTitle(selectedVariant), selectedId),
        fingerprint: text(projectedCut.fingerprint || latest?.fingerprint || echoDirectionVariantFingerprint(selectedVariant)) || null,
        selectionBasis: requestedId ? "exact-non-legacy-cut" : text(latest?.selectionBasis, "latest-non-legacy-cut"),
        strategy: requestedId ? "exact-non-legacy-cut" : "most-recent-non-legacy",
        legacy: false,
        updatedAt: latest?.updatedAt || null,
        projectionValidation: clone(projectedCut.projectionValidation || null),
        durationProjection: clone(projectedCut.durationProjection || null),
      });
    }
  }

  if (activeMatches && !isLegacyEchoRecordDirectionVariant(projectedActive)) {
    return sourceFromProjectedProject(project, projectedActive);
  }

  if (options.allowLegacyFallback === true) {
    return sourceFromProjectedProject(project, {
      id: "legacy-baseline",
      title: "Legacy Baseline",
      fingerprint: null,
      selectionBasis: "explicit-legacy-fallback",
      strategy: "explicit-legacy-fallback",
      legacy: true,
    });
  }

  throw previewError(
    "echo_director_preview_modern_cut_missing",
    requestedId
      ? `Director cut ${requestedId} is unavailable or is a Legacy Baseline.`
      : "No hydrated, non-legacy Director cut is available for Preview.",
    { cutId: requestedId || null },
  );
}

function clockReading(clock) {
  if (typeof clock === "function") return clockReading(clock());
  if (Number.isFinite(Number(clock))) {
    return { currentTime: Number(clock), source: "external-number" };
  }
  const source = object(clock);
  return {
    currentTime: finite(source.currentTime ?? source.seconds ?? source.timeSeconds, 0),
    duration: finite(source.duration ?? source.durationSeconds, 0),
    playing: source.playing === undefined
      ? !(source.paused === true || source.ended === true)
      : source.playing === true,
    source: text(source.source || source.kind, "external-clock"),
  };
}

/** Reads, clamps and frame-quantizes one external audio clock. */
export function readEchoDirectorPreviewClock({
  clock = 0,
  timeSeconds,
  durationSeconds = 0,
  fps = 30,
  playing,
} = {}) {
  const reading = clockReading(timeSeconds === undefined ? clock : timeSeconds);
  const rate = Math.max(1, Math.round(finite(fps, 30)));
  const duration = Math.max(0, finite(reading.duration, finite(durationSeconds, 0)) || finite(durationSeconds, 0));
  const rawSeconds = Math.max(0, finite(reading.currentTime, 0));
  const boundedSeconds = duration > 0 ? Math.min(rawSeconds, duration) : rawSeconds;
  const frame = Math.max(0, Math.floor(boundedSeconds * rate + 1e-9));
  const frameSeconds = duration > 0
    ? Math.min(frame / rate, duration)
    : frame / rate;
  const selectionSeconds = duration > 0 && frameSeconds >= duration
    ? Math.max(0, duration - Math.min(0.000001, 1 / (rate * 1000)))
    : frameSeconds;
  return {
    source: timeSeconds === undefined ? reading.source : "explicit-time",
    rawSeconds: round(rawSeconds),
    seconds: round(frameSeconds),
    selectionSeconds: round(selectionSeconds),
    // Keep display rounding out of curve evaluation. Export samples the exact
    // frame/fps rational, including frames that repeat in decimal notation.
    evaluationSeconds: selectionSeconds,
    durationSeconds: round(duration),
    frame,
    fps: rate,
    playing: playing === undefined ? reading.playing !== false : playing === true,
    ended: duration > 0 && boundedSeconds >= duration,
  };
}

function intervalStart(row = {}) {
  return finite(row.startSeconds ?? row.start_sec ?? row.start ?? row.atSeconds, Number.NaN);
}

function intervalEnd(row = {}, fps = 30) {
  const start = intervalStart(row);
  const declared = finite(row.endSeconds ?? row.end_sec ?? row.end, Number.NaN);
  if (Number.isFinite(declared)) return declared;
  const duration = finite(row.durationSeconds ?? row.duration, Number.NaN);
  return Number.isFinite(duration) ? start + duration : start + (1 / Math.max(1, fps));
}

function activeIntervalRows(rows = [], timeSeconds = 0, fps = 30) {
  return list(rows).map((row, index) => ({ row, index }))
    .filter(({ row }) => {
      const start = intervalStart(row);
      const end = intervalEnd(row, fps);
      return Number.isFinite(start) && Number.isFinite(end) && start <= timeSeconds && end > timeSeconds;
    });
}

function mediaTracks(graph = {}) {
  return list(graph.tracks).filter((track) => (
    ["media", "foundation"].includes(text(track?.role).toLowerCase())
      || ["track-a", "media-a"].includes(text(track?.id).toLowerCase())
  ));
}

function activeMediaCards(graph = {}, timeSeconds = 0) {
  return mediaTracks(graph).flatMap((track, trackIndex) => (
    list(track.cards).map((card, cardIndex) => ({ card, track, trackIndex, cardIndex }))
  )).filter(({ card }) => (
    card?.knockedOut !== true
      && card?.knocked_out !== true
      && intervalStart(card) <= timeSeconds
      && intervalEnd(card) > timeSeconds
  )).sort((left, right) => (
    finite(left.card?.parameters?.layerIndex, left.trackIndex) - finite(right.card?.parameters?.layerIndex, right.trackIndex)
      || left.trackIndex - right.trackIndex
      || left.cardIndex - right.cardIndex
  ));
}

function mediaUri(card = {}, timelineRow = {}) {
  const media = object(card.media);
  const contract = object(timelineRow.media_contract || timelineRow.mediaContract);
  return text(
    media.runtimeUri
      || media.uri
      || media.localPath
      || media.url
      || contract.runtimeUri
      || contract.originalUri
      || timelineRow.runtime_media_uri
      || timelineRow.media_uri,
  );
}

function mediaKind(card = {}, timelineRow = {}) {
  const declared = text(
    card.media?.kind
      || card.media?.type
      || timelineRow.media_contract?.type
      || timelineRow.mediaContract?.type,
  ).toLowerCase();
  if (declared) return declared;
  const uri = mediaUri(card, timelineRow).split(/[?#]/)[0].toLowerCase();
  if (/\.(?:mp4|mov|m4v|webm|mkv)$/.test(uri)) return "video";
  if (/\.(?:png|jpe?g|webp|gif|avif|svg)$/.test(uri)) return "image";
  return "unknown";
}

function mediaCardIdentity(card = {}, timelineRow = {}) {
  const media = object(card.media);
  const sourceCard = object(
    media.card
      || timelineRow.decision_evidence?.sourceEvidence?.card
      || timelineRow.decisionEvidence?.sourceEvidence?.card,
  );
  const id = text(
    media.cardId
      || media.card_id
      || timelineRow.media_card_id
      || timelineRow.mediaCardId
      || sourceCard.id,
  );
  return {
    id: id || null,
    kind: text(media.cardKind || media.card_kind || timelineRow.media_card_kind || timelineRow.mediaCardKind || sourceCard.kind) || null,
    ref: text(media.cardRef || media.card_ref || timelineRow.media_card_ref || timelineRow.mediaCardRef || sourceCard.ref) || null,
    title: text(media.cardTitle || media.card_title || timelineRow.media_card_title || timelineRow.mediaCardTitle || sourceCard.title || media.title) || null,
    embedded: id && text(sourceCard.id) === id ? clone(sourceCard) : null,
    attachmentStatus: id ? "attached-exact-id" : "missing",
  };
}

function positiveFinite(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function normalizedDimensions(...candidates) {
  for (const candidate of candidates) {
    const source = object(candidate);
    const width = positiveFinite(source.width ?? source.videoWidth ?? source.naturalWidth);
    const height = positiveFinite(source.height ?? source.videoHeight ?? source.naturalHeight);
    if (width === null || height === null) continue;
    return {
      width: round(width),
      height: round(height),
      maxDimension: round(positiveFinite(source.maxDimension) ?? Math.max(width, height)),
    };
  }
  return null;
}

function normalizedSourceOrientation(value = "") {
  const orientation = text(value).toLowerCase();
  if (["portrait", "landscape", "square"].includes(orientation)) return orientation;
  return "unknown";
}

function sourceOrientationForDimensions(dimensions = null, fallback = "") {
  if (dimensions?.width > 0 && dimensions?.height > 0) {
    if (dimensions.height > dimensions.width) return "portrait";
    if (dimensions.width > dimensions.height) return "landscape";
    return "square";
  }
  return normalizedSourceOrientation(fallback);
}

function mediaGeometry(card = {}, timelineRow = {}) {
  const media = object(card.media);
  const contract = object(timelineRow.media_contract || timelineRow.mediaContract);
  const dimensions = normalizedDimensions(
    media.dimensions,
    media.technical,
    media,
    contract.dimensions,
    contract.proxy,
    contract.technical,
    timelineRow.media_dimensions,
    timelineRow.mediaDimensions,
    timelineRow.dimensions,
    timelineRow.technical,
    timelineRow,
  );
  const sourceOrientation = sourceOrientationForDimensions(
    dimensions,
    media.sourceOrientation
      || media.source_orientation
      || contract.sourceOrientation
      || contract.source_orientation
      || timelineRow.source_orientation
      || timelineRow.sourceOrientation,
  );
  const aspectRatio = dimensions
    ? round(dimensions.width / dimensions.height)
    : null;
  return {
    dimensions,
    aspectRatio,
    sourceAspectRatio: aspectRatio,
    sourceOrientation,
  };
}

function mediaIdentityTokens(card = {}, timelineRow = {}) {
  const media = object(card.media);
  const contract = object(timelineRow.media_contract || timelineRow.mediaContract);
  const uri = mediaUri(card, timelineRow);
  return new Set([
    media.id,
    media.mediaId,
    media.media_id,
    media.cardId,
    media.card_id,
    media.sourceHash,
    media.source_hash,
    media.contentHash,
    media.hash,
    timelineRow.media_id,
    timelineRow.mediaId,
    timelineRow.media_card_id,
    timelineRow.mediaCardId,
    contract.contentHash,
    contract.sourceHash,
    uri,
    uri ? uri.split(/[?#]/)[0] : "",
  ].map((value) => text(value)).filter(Boolean));
}

function mediaIdentityMatches(card, timelineRow) {
  const cardTokens = mediaIdentityTokens(card, {});
  const rowTokens = mediaIdentityTokens({}, timelineRow);
  if (!cardTokens.size || !rowTokens.size) return false;
  return [...cardTokens].some((token) => rowTokens.has(token));
}

function resolveMediaTimelineMatch(card, timelineRows, timeSeconds, fps, cardIndex) {
  const rows = list(timelineRows);
  const explicitIndex = Number.isInteger(card.sourceCueIndex) ? card.sourceCueIndex : null;
  const explicitRow = explicitIndex === null ? null : rows[explicitIndex];
  const cardTokens = mediaIdentityTokens(card, {});
  const explicitHasComparableIdentity = explicitRow
    ? cardTokens.size > 0 && mediaIdentityTokens({}, explicitRow).size > 0
    : false;
  if (explicitRow && (!explicitHasComparableIdentity || mediaIdentityMatches(card, explicitRow))) {
    return { row: explicitRow, index: explicitIndex, basis: "explicit-source-cue-index" };
  }

  const active = activeIntervalRows(rows, timeSeconds, fps);
  const activeIdentityMatch = active.find(({ row }) => mediaIdentityMatches(card, row));
  if (activeIdentityMatch) return { ...activeIdentityMatch, basis: "active-media-identity" };

  const intervalStartSeconds = intervalStart(card);
  const intervalEndSeconds = intervalEnd(card, fps);
  const intervalIdentityMatch = rows.map((row, index) => ({ row, index })).find(({ row }) => (
    mediaIdentityMatches(card, row)
      && Math.abs(intervalStart(row) - intervalStartSeconds) < 0.000001
      && Math.abs(intervalEnd(row, fps) - intervalEndSeconds) < 0.000001
  ));
  if (intervalIdentityMatch) return { ...intervalIdentityMatch, basis: "interval-media-identity" };

  if (explicitRow) return { row: explicitRow, index: explicitIndex, basis: "explicit-overlay-fallback" };
  if (active.length) return { ...active.at(-1), basis: "active-interval-fallback" };
  if (rows[cardIndex]) return { row: rows[cardIndex], index: cardIndex, basis: "card-index-fallback" };
  return { row: {}, index: -1, basis: "missing" };
}

export function echoDirectorPreviewMediaTransitionState(cue = {}, timeSeconds = 0, fps = 30) {
  const start = intervalStart(cue);
  const end = intervalEnd(cue, fps);
  const transition = text(
    cue.transition
      || cue.parameters?.transition
      || cue.sourceTimelineRow?.transition,
    "cut",
  ).toLowerCase();
  const windowSeconds = Math.min(0.5, Math.max(0, end - start));
  const entrance = windowSeconds ? clamp((timeSeconds - start) / windowSeconds) : 0;
  const exit = windowSeconds ? clamp((end - timeSeconds) / windowSeconds) : 0;
  const presentation = hyperFramesMediaOpacityState([{ start, end, transition }], 0, timeSeconds);
  const opacity = presentation.alpha;
  const phase = presentation.phase === "active" ? "steady" : presentation.phase;
  return {
    kind: transition,
    opacity: round(opacity),
    entrance: round(entrance),
    exit: round(exit),
    phase,
    windowSeconds: round(windowSeconds),
    deterministicSeed: stableHash(`${text(cue.id || cue.cueId)}:${Math.floor(timeSeconds * Math.max(1, fps))}`),
  };
}

function normalizeMediaCue(entry, timelineRows, timeSeconds, fps) {
  const { card, track, trackIndex, cardIndex } = entry;
  const timelineMatch = resolveMediaTimelineMatch(card, timelineRows, timeSeconds, fps, cardIndex);
  const sourceCueIndex = timelineMatch.index >= 0
    ? timelineMatch.index
    : Number.isInteger(card.sourceCueIndex) ? card.sourceCueIndex : cardIndex;
  const matchingTimeline = timelineMatch.row;
  const startSeconds = intervalStart(card);
  const endSeconds = intervalEnd(card, fps);
  const media = object(card.media);
  const mediaContract = object(matchingTimeline.media_contract || matchingTimeline.mediaContract);
  const geometry = mediaGeometry(card, matchingTimeline);
  const parameters = clone(object(card.parameters));
  const timelineCamera = object(matchingTimeline.camera);
  const cardCamera = echoCameraKeyframeAt(card.cameraKeyframes, timeSeconds);
  const cameraCrop = matchingTimeline.camera_crop
    || matchingTimeline.cameraCrop
    || timelineCamera.crop
    || cardCamera?.crop
    || null;
  const camera = {
    motion: text(
      matchingTimeline.camera_motion
        || matchingTimeline.cameraMotion
        || timelineCamera.motion
        || parameters.motion
        || parameters.cameraMotion
        || cardCamera?.motion,
    ) || null,
    intensity: optionalFinite(
      matchingTimeline.camera_intensity,
      matchingTimeline.cameraIntensity,
      timelineCamera.intensity,
      parameters.cameraIntensity,
      parameters.camera_intensity,
      cardCamera?.intensity,
    ),
    speed: optionalFinite(
      matchingTimeline.camera_speed,
      matchingTimeline.cameraSpeed,
      timelineCamera.speed,
      parameters.cameraSpeed,
      parameters.camera_speed,
      cardCamera?.speed,
    ),
    ...(cameraCrop ? { crop: clone(cameraCrop) } : {}),
  };
  const sourceInSeconds = Math.max(0, optionalFinite(
    media.sourceInSeconds,
    media.source_in_seconds,
    mediaContract.sourceInSeconds,
    mediaContract.source_in_seconds,
    matchingTimeline.source_in_seconds,
    matchingTimeline.sourceInSeconds,
  ) ?? 0);
  const declaredSourceOutSeconds = optionalFinite(
    media.sourceOutSeconds,
    media.source_out_seconds,
    mediaContract.sourceOutSeconds,
    mediaContract.source_out_seconds,
    matchingTimeline.source_out_seconds,
    matchingTimeline.sourceOutSeconds,
  );
  const sourceOutSeconds = declaredSourceOutSeconds !== null && declaredSourceOutSeconds > sourceInSeconds
    ? declaredSourceOutSeconds
    : null;
  const playbackMode = text(
    media.playbackMode
      || media.playback_mode
      || mediaContract.playbackMode
      || mediaContract.playback_mode
      || matchingTimeline.playback_mode
      || matchingTimeline.playbackMode,
    "once",
  ).toLowerCase();
  const durationSeconds = round(endSeconds - startSeconds);
  const timeMapping = normalizeEchoTransitionTimeMapping(
    media.timeMapping
      || media.time_mapping
      || mediaContract.timeMapping
      || mediaContract.time_mapping
      || matchingTimeline.time_mapping
      || matchingTimeline.timeMapping,
    {
      sourceInSeconds,
      sourceOutSeconds,
      cueDurationSeconds: durationSeconds,
    },
  );
  const cue = {
    id: text(card.id, `media:${trackIndex}:${cardIndex}`),
    cueId: text(card.id, `media:${trackIndex}:${cardIndex}`),
    trackId: text(card.trackId || track.id),
    trackRole: text(track.role, "media"),
    sourceCueIndex,
    timelineMatchBasis: timelineMatch.basis,
    cameraSeedId: text(
      matchingTimeline.section_id
        || matchingTimeline.sectionId
        || matchingTimeline.media_id
        || matchingTimeline.mediaId,
    ),
    startSeconds: round(startSeconds),
    endSeconds: round(endSeconds),
    durationSeconds,
    media: {
      id: text(media.id || matchingTimeline.media_id || matchingTimeline.mediaId) || null,
      title: text(media.title || matchingTimeline.media_title || matchingTimeline.mediaTitle) || null,
      uri: mediaUri(card, matchingTimeline) || null,
      kind: mediaKind(card, matchingTimeline),
      sourceHash: text(
        media.sourceHash
          || media.source_hash
          || media.hash
          || mediaContract.sourceHash
          || mediaContract.source_hash
          || card.provenance?.sourceHash,
      ) || null,
      sourceInSeconds: round(sourceInSeconds),
      sourceOutSeconds: sourceOutSeconds === null ? null : round(sourceOutSeconds),
      sourceDurationSeconds: sourceOutSeconds === null ? null : round(sourceOutSeconds - sourceInSeconds),
      playbackMode,
      ...(timeMapping ? { timeMapping } : {}),
      ...geometry,
    },
    card: mediaCardIdentity(card, matchingTimeline),
    parameters,
    camera,
    transition: text(card.transition || matchingTimeline.transition, "cut").toLowerCase(),
    provenance: clone(object(card.provenance)),
    sourceTimelineRow: matchingTimeline,
  };
  const transitionState = echoDirectorPreviewMediaTransitionState(cue, timeSeconds, fps);
  delete cue.sourceTimelineRow;
  return { ...cue, transitionState };
}

export function echoDirectorPreviewVisualizerComposition(card = null, timeSeconds = 0, fps = 30, shader = null) {
  const layer = object(card?.visualization?.card?.layer);
  const parameters = object(card?.parameters);
  const start = intervalStart(card);
  const end = intervalEnd(card, fps);
  const duration = Math.max(0.001, end - start);
  const transition = text(card?.transition || parameters.transition || layer.transition, "cut").toLowerCase();
  const transitionSeconds = Math.min(
    duration / 4,
    Math.max(0.04, finite(parameters.transitionDurationSeconds ?? layer.transitionDurationSeconds, 0.35)),
  );
  const transitionAlpha = /(fade|cross|dissolve)/.test(transition)
    ? clamp(Math.min((timeSeconds - start) / transitionSeconds, (end - timeSeconds) / transitionSeconds))
    : 1;
  // Generators paint their own content, so a layer without opacity or blend
  // becomes a semi-transparent screen veil that keeps the media underneath
  // visible. Filters transform the current frame, so they stay fully opaque
  // with a normal composite. Explicit parameters/layer values always win.
  const isFilter = String(shader?.shaderType || "").toLowerCase() === "filter";
  const defaultOpacity = isFilter ? 1 : 0.42;
  const defaultBlend = isFilter ? "normal" : "screen";
  const opacity = round(finite(parameters.opacity ?? layer.opacity, defaultOpacity));
  const mix = round(finite(parameters.mix ?? layer.mix, 1));
  const blend = text(parameters.blendMode || layer.blend, defaultBlend);
  const layerOpacity = round(finite(parameters.layerOpacity ?? parameters.layer_opacity ?? layer.layerOpacity ?? layer.layer_opacity, 1));
  const persistent = card?.alwaysOn === true || Boolean(card?.persistentSlotId);
  const knockoutRequested = parameters.knockoutBlacks ?? parameters.knockout_blacks ?? layer.knockoutBlacks ?? layer.knockout_blacks ?? persistent;
  const plan = planEchoIsfLayerComposite({
    opacity,
    shaderVisibility: opacity,
    mix,
    blend,
    layerOpacity,
    knockoutBlacks: knockoutRequested,
    transitionAlpha,
  }, { persistent, shaderType: shader?.shaderType });
  return {
    opacity,
    mix,
    blend,
    ...plan,
    target: text(parameters.target || layer.target, "program"),
    transition,
    transitionAlpha: round(transitionAlpha),
    transitionSeconds: round(transitionSeconds),
  };
}

function normalizeVisualizer(card, graph = {}, timeSeconds = 0, fps = 30, shaderTypeResolver = null) {
  const track = list(graph.tracks).find((candidate) => list(candidate.cards).some((row) => row === card || row.id === card.id));
  const visualization = object(card.visualization);
  const portable = object(visualization.card);
  const sourceId = text(visualization.requestedSourceId || visualization.sourceId || portable.id || card.media?.id) || null;
  const resolvedShaderType = typeof shaderTypeResolver === "function" ? shaderTypeResolver(sourceId || "") : null;
  return {
    id: text(card.id),
    trackId: text(card.trackId || track?.id),
    trackLabel: text(track?.label),
    startSeconds: round(intervalStart(card)),
    endSeconds: round(intervalEnd(card, fps)),
    sourceId,
    title: text(visualization.nativeKey || portable.title || card.media?.title) || null,
    status: text(visualization.status || card.provenance?.rendererRoute, "unknown"),
    sourceHash: text(visualization.sourceHash || portable.source?.hash) || null,
    persistent: card.alwaysOn === true || track?.alwaysOn === true || track?.persistent === true,
    persistentSlotId: text(card.persistentSlotId || track?.slotId || card.provenance?.persistentSlotId) || null,
    locked: card.locked === true || (card.locks || []).includes('shader') || (graph.directorV2?.locks || []).some(lock => (lock.targetId || lock.target) === card.id),
    stemMap: clone(list(card.parameters?.stemMap)),
    portableCard: Object.keys(portable).length ? clone(portable) : null,
    composition: echoDirectorPreviewVisualizerComposition(card, timeSeconds, fps, { shaderType: resolvedShaderType || null }),
  };
}

function normalizeLyricLine(line = {}, index = -1) {
  const start = finite(line.start ?? line.startSeconds ?? line.start_sec, 0);
  const end = Math.max(start + 0.001, finite(line.end ?? line.endSeconds ?? line.end_sec, start + 0.001));
  return {
    ...clone(line),
    id: text(line.id, index >= 0 ? `lyric:${index}` : "lyric"),
    start,
    end,
    text: text(line.text || line.lyric || line.words?.map((word) => word.word || word.text).join(" ")),
    words: list(line.words).map((word) => ({
      ...clone(word),
      start: finite(word.start ?? word.startSeconds, start),
      end: Math.max(
        finite(word.start ?? word.startSeconds, start) + 0.001,
        finite(word.end ?? word.endSeconds, end),
      ),
    })),
  };
}

function normalizedEvent(entry, kind, timeSeconds, fps) {
  const { row, index } = entry;
  const startSeconds = intervalStart(row);
  const endSeconds = intervalEnd(row, fps);
  return {
    ...clone(row),
    id: text(row.id, `${kind}:${index}`),
    kind: text(row.kind || row.type, kind),
    startSeconds: round(startSeconds),
    endSeconds: round(endSeconds),
    progress: round(clamp((timeSeconds - startSeconds) / Math.max(0.001, endSeconds - startSeconds))),
  };
}

function automationState(graph = {}, timeSeconds = 0, fps = 30) {
  const director = object(graph.directorV2);
  const visualTime = activeIntervalRows(director.visualTimeTrack?.events, timeSeconds, fps)
    .map((entry) => normalizedEvent(entry, "visual-time", timeSeconds, fps));
  const accents = activeIntervalRows(director.accentTrack?.events, timeSeconds, fps)
    .map((entry) => normalizedEvent(entry, "accent", timeSeconds, fps));
  const effects = activeIntervalRows(director.effects, timeSeconds, fps)
    .map((entry) => normalizedEvent(entry, "effect", timeSeconds, fps));
  return { visualTime, accents, effects };
}

function normalizePreviewSource(value, options = {}) {
  return value?.schemaVersion === ECHO_DIRECTOR_PREVIEW_SOURCE_SCHEMA
    ? value
    : selectEchoDirectorPreviewSource(value, options);
}

/**
 * Resolves source-media geometry independently from the Director output size.
 * The immutable Preview contract wins; decoded element dimensions are a
 * defensive fallback for older projects whose media contract is incomplete.
 */
export function resolveEchoDirectorPreviewSourceGeometry({
  frame = null,
  sourceWidth,
  sourceHeight,
} = {}) {
  const cue = object(frame?.primaryMediaCue || frame?.media?.primary);
  const media = object(cue.media);
  const contractDimensions = normalizedDimensions(media.dimensions, media);
  const decodedDimensions = normalizedDimensions({ width: sourceWidth, height: sourceHeight });
  const dimensions = contractDimensions || decodedDimensions;
  const sourceOrientation = sourceOrientationForDimensions(dimensions, media.sourceOrientation);
  const aspectRatio = dimensions
    ? round(dimensions.width / dimensions.height)
    : positiveFinite(media.sourceAspectRatio ?? media.aspectRatio);
  return {
    dimensions,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
    aspectRatio: aspectRatio === null ? null : round(aspectRatio),
    sourceAspectRatio: aspectRatio === null ? null : round(aspectRatio),
    sourceOrientation,
    source: contractDimensions
      ? "preview-contract"
      : decodedDimensions ? "decoded-media" : sourceOrientation !== "unknown" ? "preview-orientation" : "unavailable",
  };
}

/**
 * Projects one fixed Preview frame into renderer-neutral camera numbers. Both
 * DOM/CSS and Canvas consumers can use this presentation without conflating a
 * portrait source with a portrait output canvas.
 */
export function resolveEchoDirectorPreviewCameraPresentation({
  frame = null,
  sourceWidth,
  sourceHeight,
  outputWidth,
  outputHeight,
} = {}) {
  const cue = object(frame?.primaryMediaCue || frame?.media?.primary);
  const cueCamera = object(cue.camera);
  const camera = object(frame?.camera);
  const outputProfile = object(frame?.outputProfile);
  const sourceGeometry = resolveEchoDirectorPreviewSourceGeometry({ frame, sourceWidth, sourceHeight });
  const outputDimensions = normalizedDimensions({
    width: positiveFinite(outputWidth) ?? outputProfile.width,
    height: positiveFinite(outputHeight) ?? outputProfile.height,
  }) || { width: 1, height: 1, maxDimension: 1 };
  const speed = optionalFinite(cueCamera.speed, camera.speed, camera.keyframe?.speed);
  const crop = cueCamera.crop
    || camera.keyframe?.crop
    || camera.presentation?.crop
    || null;
  const presentation = echoCameraMotionPresentation({
    startSeconds: cue.startSeconds,
    endSeconds: cue.endSeconds,
    timeSeconds: frame?.clock?.evaluationSeconds ?? frame?.clock?.selectionSeconds ?? frame?.clock?.seconds,
    motion: text(cueCamera.motion || camera.motion || camera.keyframe?.motion || camera.keyframe?.shotRole, "auto"),
    intensity: optionalFinite(cueCamera.intensity, camera.intensity, camera.keyframe?.intensity) ?? 1,
    ...(speed === null ? {} : { speed }),
    shotIndex: camera.sourceCueIndex ?? cue.sourceCueIndex ?? 0,
    sourceId: cue.cameraSeedId || cue.media?.id || "",
    isPortrait: sourceGeometry.sourceOrientation === "portrait",
    crop,
  });
  return {
    presentation,
    sourceGeometry,
    outputDimensions,
  };
}

/** Returns the exact Canvas2D source rectangle for a fixed Preview frame. */
export function resolveEchoDirectorPreviewSourceRect(options = {}) {
  const framing = resolveEchoDirectorPreviewCameraPresentation(options);
  const decodedDimensions = normalizedDimensions({
    width: options.sourceWidth,
    height: options.sourceHeight,
  });
  const samplingDimensions = decodedDimensions
    || framing.sourceGeometry.dimensions
    || { width: 1, height: 1, maxDimension: 1 };
  return {
    ...echoCameraCoverSourceRect({
      sourceWidth: samplingDimensions.width,
      sourceHeight: samplingDimensions.height,
      outputWidth: framing.outputDimensions.width,
      outputHeight: framing.outputDimensions.height,
      presentation: framing.presentation,
    }),
    presentation: framing.presentation,
    sourceGeometry: framing.sourceGeometry,
    samplingDimensions,
    samplingSource: decodedDimensions ? "decoded-media" : framing.sourceGeometry.source,
    outputDimensions: framing.outputDimensions,
  };
}

/**
 * Pure projection from a single clock sample to one serializable Preview frame.
 * The same source and clock sample always produce the same state.
 */
export function projectEchoDirectorPreviewMediaFrame({
  source: sourceInput,
  project: projectInput,
  clock = 0,
  timeSeconds,
  playing,
  fps,
  selectionOptions = {},
  shaderTypeResolver = null,
} = {}) {
  const source = normalizePreviewSource(sourceInput || projectInput, selectionOptions);
  const project = source.project;
  const graph = source.showGraph;
  const outputProfile = resolveEchoOutputProfile(source.outputProfile || graph.outputProfile || project);
  const clockState = readEchoDirectorPreviewClock({
    clock,
    timeSeconds,
    durationSeconds: source.song.durationSeconds,
    fps: fps ?? outputProfile.fps,
    playing,
  });
  const time = clockState.evaluationSeconds;
  const mediaEntries = activeMediaCards(graph, time);
  const mediaLayers = mediaEntries.map((entry) => normalizeMediaCue(
    entry,
    project.timeline,
    time,
    clockState.fps,
  ));
  const primaryMediaCue = mediaLayers.at(-1) || null;
  const globalCamera = echoCameraKeyframeAt(graph.directorV2?.cameraKeyframes, time);
  const sourceCueIndex = Number.isInteger(primaryMediaCue?.sourceCueIndex)
    ? primaryMediaCue.sourceCueIndex
    : null;
  const cameraSpeed = primaryMediaCue?.camera?.speed ?? globalCamera?.speed;
  const camera = globalCamera ? {
    keyframe: clone(globalCamera),
    presentation: echoCameraCropPresentation(globalCamera.crop),
    motion: text(primaryMediaCue?.camera?.motion || globalCamera.motion || globalCamera.shotRole, "auto"),
    intensity: round(finite(primaryMediaCue?.camera?.intensity ?? globalCamera.intensity, 1)),
    speed: cameraSpeed == null ? null : round(finite(cameraSpeed, 1)),
    sourceCueIndex,
  } : {
    keyframe: null,
    presentation: null,
    motion: text(primaryMediaCue?.camera?.motion, "auto"),
    intensity: round(finite(primaryMediaCue?.camera?.intensity, 1)),
    speed: cameraSpeed == null ? null : round(finite(cameraSpeed, 1)),
    sourceCueIndex,
  };
  const cameraFraming = resolveEchoDirectorPreviewCameraPresentation({
    frame: {
      primaryMediaCue,
      camera,
      clock: clockState,
      outputProfile,
    },
  });
  camera.motionPresentation = cameraFraming.presentation;
  camera.sourceGeometry = cameraFraming.sourceGeometry;

  return { source, clock: clockState, outputProfile, media: { layers: mediaLayers, primary: primaryMediaCue, layerCount: mediaLayers.length }, primaryMediaCue, camera };
}

export function projectEchoDirectorPreviewFrame(options = {}) {
  const mediaFrame = projectEchoDirectorPreviewMediaFrame(options);
  const { source, clock: clockState, outputProfile, primaryMediaCue, camera } = mediaFrame;
  const { project, showGraph: graph } = source;
  const time = clockState.evaluationSeconds;
  const mediaLayers = mediaFrame.media.layers;
  let visualizers = visualizerCardsAtTime(graph, time)
    .map((card) => normalizeVisualizer(card, graph, time, clockState.fps, options.shaderTypeResolver));
  const graphLyrics = list(graph.song?.lyricOverlay?.lines);
  const lyricLines = (graphLyrics.length ? graphLyrics : list(project.timed_lyrics))
    .map((line, index) => normalizeLyricLine(line, index));
  const lyricContract = normalizeEchoLyricContract({
    ...project,
    lyrics: graph.song?.lyricOverlay || project.lyrics,
    timed_lyrics: lyricLines,
  });
  const lyricEntry = lyricContract.enabled
    ? activeIntervalRows(lyricLines, time, clockState.fps).at(-1)
    : null;
  const lyricLine = lyricEntry ? lyricLines[lyricEntry.index] : null;
  const lyricTemplateFrame = lyricLine
    ? resolveEchoLyricTemplateFrame({
      project,
      contract: lyricContract,
      line: lyricLine,
      // Do not quantize the rounded diagnostic seconds again: that can lose a frame.
      timeSeconds: clockState.frame / clockState.fps,
      fps: clockState.fps,
    })
    : null;
  const automation = automationState(graph, time, clockState.fps);
  const visualAdmission = admitEchoSectionVisualLayers(visualizers, graph.directorV2?.visualBudgetPolicy, time, {
    mediaLayers: mediaLayers.length, lyricLayers: lyricTemplateFrame?.visible ? 1 : 0,
    accentLayers: Math.min(lyricContract.reducedMotion ? 1 : 3, automation.accents.length),
  });
  visualizers = visualAdmission.layers;
  const frameKey = [
    source.song.id,
    source.cut.id,
    source.cut.fingerprint || graph.directorV2?.variantHash || "unfingerprinted-cut",
    clockState.frame,
    primaryMediaCue?.id || "no-media",
    primaryMediaCue?.media?.sourceHash || primaryMediaCue?.media?.uri || "no-media-source",
    ...visualizers.map((visualizer) => visualizer.id || visualizer.sourceId),
    lyricLine?.id || "no-lyric",
  ].join("|");

  return {
    schemaVersion: ECHO_DIRECTOR_PREVIEW_FRAME_SCHEMA,
    frameKey,
    song: clone(source.song),
    cut: clone(source.cut),
    clock: clockState,
    outputProfile: clone(outputProfile),
    media: {
      layers: mediaLayers,
      primary: primaryMediaCue,
      layerCount: mediaLayers.length,
    },
    primaryMediaCue,
    currentCard: primaryMediaCue?.card || null,
    visualizers,
    shaders: visualizers,
    visualBudget: visualAdmission.receipt,
    camera,
    transition: primaryMediaCue?.transitionState || null,
    lyrics: {
      contract: lyricContract,
      line: lyricLine,
      lineIndex: lyricEntry?.index ?? -1,
      templateFrame: lyricTemplateFrame,
      visible: lyricTemplateFrame?.visible === true,
    },
    automation,
    truth: clone(source.truth),
  };
}

export function createEchoDirectorPreviewCardPrintIntent(frame = {}, options = {}) {
  if (frame?.schemaVersion !== ECHO_DIRECTOR_PREVIEW_FRAME_SCHEMA) {
    throw previewError(
      "echo_director_preview_frame_invalid",
      "Exact Card printing requires an Echo Director Preview frame.",
    );
  }
  const cue = frame.primaryMediaCue;
  const card = cue?.card;
  if (!text(card?.id)) {
    throw previewError(
      "echo_director_preview_card_attachment_missing",
      "The current Director cue has no exact Hapa Card attachment to print.",
      { cueId: cue?.id || null, frame: frame.clock?.frame ?? null },
    );
  }
  const requestKey = [
    frame.song?.id,
    frame.cut?.id,
    frame.cut?.fingerprint || "unfingerprinted-cut",
    cue.id,
    card.id,
    frame.clock?.frame,
  ].join("|");
  return {
    schemaVersion: ECHO_DIRECTOR_PREVIEW_CARD_PRINT_INTENT_SCHEMA,
    intent: "print-exact-attached-hapa-card",
    resolutionPolicy: "exact-id-or-fail",
    requestKey,
    surface: text(options.surface, "echo-director-preview"),
    song: {
      id: text(frame.song?.id),
      title: text(frame.song?.title),
    },
    cut: {
      id: text(frame.cut?.id),
      title: text(frame.cut?.title),
      fingerprint: text(frame.cut?.fingerprint) || null,
    },
    cue: {
      id: text(cue.id),
      trackId: text(cue.trackId),
      startSeconds: finite(cue.startSeconds),
      endSeconds: finite(cue.endSeconds),
      frame: frame.clock.frame,
      timeSeconds: frame.clock.seconds,
    },
    card: clone(card),
    media: clone(cue.media),
  };
}

/** Resolves an intent through an injected exact-ID Card lookup and validates identity. */
export async function resolveEchoDirectorPreviewCardPrintIntent(intent = {}, { resolveExactCard } = {}) {
  if (intent?.schemaVersion !== ECHO_DIRECTOR_PREVIEW_CARD_PRINT_INTENT_SCHEMA || !text(intent.card?.id)) {
    throw previewError(
      "echo_director_preview_card_print_intent_invalid",
      "The exact Card print intent is invalid.",
    );
  }
  if (typeof resolveExactCard !== "function") {
    throw previewError(
      "echo_director_preview_card_resolver_missing",
      "Exact Card printing requires an exact-ID Card resolver.",
    );
  }
  const result = await resolveExactCard({
    cardId: intent.card.id,
    intent: clone(intent),
  });
  const card = object(result?.card || result);
  if (!text(card.id)) {
    throw previewError(
      "echo_director_preview_card_not_found",
      `Attached Hapa Card ${intent.card.id} was not found.`,
      { cardId: intent.card.id },
    );
  }
  if (text(card.id) !== text(intent.card.id)) {
    throw previewError(
      "echo_director_preview_card_identity_mismatch",
      `Exact Card resolution returned ${card.id} instead of ${intent.card.id}.`,
      { expectedCardId: intent.card.id, actualCardId: card.id },
    );
  }
  return {
    schemaVersion: ECHO_DIRECTOR_PREVIEW_CARD_PRINT_RECEIPT_SCHEMA,
    status: "resolved-exact-attached-card",
    requestKey: intent.requestKey,
    card: clone(card),
    source: {
      songId: intent.song.id,
      cutId: intent.cut.id,
      cueId: intent.cue.id,
      cardId: intent.card.id,
      surface: intent.surface,
    },
    resolverReceipt: result?.card ? clone(result.receipt || null) : null,
  };
}

function defaultRequestFrame(callback) {
  if (typeof globalThis.requestAnimationFrame === "function") {
    return globalThis.requestAnimationFrame(callback);
  }
  return globalThis.setTimeout(() => callback(Date.now()), 16);
}

function defaultCancelFrame(handle) {
  if (typeof globalThis.cancelAnimationFrame === "function") {
    globalThis.cancelAnimationFrame(handle);
  } else {
    globalThis.clearTimeout(handle);
  }
}

function defaultCreateStagingCanvas(width, height, outputCanvas) {
  if (typeof globalThis.OffscreenCanvas === "function") {
    return new globalThis.OffscreenCanvas(width, height);
  }
  const documentRef = outputCanvas?.ownerDocument || globalThis.document;
  if (typeof documentRef?.createElement === "function") {
    const staging = documentRef.createElement("canvas");
    staging.width = width;
    staging.height = height;
    return staging;
  }
  if (typeof outputCanvas?.cloneNode === "function") {
    const staging = outputCanvas.cloneNode(false);
    staging.width = width;
    staging.height = height;
    return staging;
  }
  return null;
}

function rendererFunction(adapters = {}, layer = "") {
  if (layer === "visualizers") return adapters.visualizers || adapters.shaders;
  return adapters[layer];
}

function requiredRendererLayers(frame = {}) {
  const layers = [];
  if (frame.primaryMediaCue) layers.push("media");
  if (frame.visualizers?.length) layers.push("visualizers");
  if (frame.transition && frame.transition.kind !== "cut") layers.push("transition");
  if (
    frame.automation?.visualTime?.length
      || frame.automation?.accents?.length
      || frame.automation?.effects?.length
  ) layers.push("automation");
  if (frame.lyrics?.visible) layers.push("lyrics");
  return layers;
}

/**
 * Creates one renderer-only compositor. It owns no audio and no extra output
 * surfaces: every layer is projected from one external clock into one canvas.
 */
export function createEchoDirectorPreviewRuntime({
  canvas,
  source: sourceInput,
  project,
  selectionOptions = {},
  clock = 0,
  adapters = {},
  requestFrame = defaultRequestFrame,
  cancelFrame = defaultCancelFrame,
  createStagingCanvas = defaultCreateStagingCanvas,
  onError = null,
  strictParity = true,
  manageCanvasSize = true,
  shaderTypeResolver = null,
} = {}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw previewError(
      "echo_director_preview_canvas_missing",
      "Echo Director Preview requires exactly one output canvas.",
    );
  }
  const context = canvas.getContext("2d");
  if (!context) {
    throw previewError(
      "echo_director_preview_canvas_context_missing",
      "Echo Director Preview could not acquire the output canvas 2D context.",
    );
  }
  let source = normalizePreviewSource(sourceInput || project, selectionOptions);
  let externalClock = clock;
  let renderAdapters = { ...adapters };
  let running = false;
  let disposed = false;
  let scheduledFrame = null;
  let renderInFlight = false;
  let lastSnapshot = null;
  let lastError = null;
  let stagingCanvas = null;
  let stagingContext = null;

  const ensureStagingSurface = (width, height) => {
    if (!stagingCanvas) {
      stagingCanvas = createStagingCanvas(width, height, canvas);
      stagingContext = stagingCanvas?.getContext?.("2d") || null;
    }
    if (!stagingCanvas || !stagingContext || stagingCanvas === canvas) {
      throw previewError(
        "echo_director_preview_staging_canvas_missing",
        "Preview parity requires an internal staging canvas so failed frames cannot erase the last good output.",
      );
    }
    if (stagingCanvas.width !== width) stagingCanvas.width = width;
    if (stagingCanvas.height !== height) stagingCanvas.height = height;
    return { canvas: stagingCanvas, context: stagingContext };
  };

  const renderAt = async (timeSeconds, overrides = {}) => {
    if (disposed) {
      throw previewError("echo_director_preview_disposed", "Echo Director Preview has been disposed.");
    }
    const frame = projectEchoDirectorPreviewFrame({
      source,
      clock: externalClock,
      ...(timeSeconds === undefined ? {} : { timeSeconds }),
      playing: overrides.playing,
      fps: overrides.fps,
      shaderTypeResolver,
    });
    const requiredLayers = requiredRendererLayers(frame);
    const missingLayers = requiredLayers.filter((layer) => typeof rendererFunction(renderAdapters, layer) !== "function");
    if (strictParity && missingLayers.length) {
      throw previewError(
        "echo_director_preview_renderer_incomplete",
        `Preview parity renderer is missing: ${missingLayers.join(", ")}.`,
        { missingLayers, frameKey: frame.frameKey },
      );
    }

    const targetWidth = manageCanvasSize ? frame.outputProfile.width : canvas.width;
    const targetHeight = manageCanvasSize ? frame.outputProfile.height : canvas.height;
    const staging = ensureStagingSurface(targetWidth, targetHeight);
    if (typeof staging.context.setTransform === "function") staging.context.setTransform(1, 0, 0, 1, 0, 0);
    if (typeof staging.context.clearRect === "function") {
      staging.context.clearRect(0, 0, targetWidth, targetHeight);
    }

    const receipts = {};
    for (const layer of ECHO_DIRECTOR_PREVIEW_RENDER_ORDER) {
      if (!requiredLayers.includes(layer)) continue;
      const renderer = rendererFunction(renderAdapters, layer);
      if (typeof renderer !== "function") continue;
      if (typeof staging.context.save === "function") staging.context.save();
      try {
        receipts[layer] = await renderer({
          schemaVersion: ECHO_DIRECTOR_PREVIEW_RUNTIME_SCHEMA,
          canvas: staging.canvas,
          context: staging.context,
          outputCanvas: canvas,
          frame,
          layer,
        }) ?? null;
      } finally {
        if (typeof staging.context.restore === "function") staging.context.restore();
      }
    }
    // Publish only after every adapter succeeds. Resizing and clearing the
    // visible output earlier would turn any decode/shader error into a blank
    // or partially composed screen.
    if (typeof context.drawImage !== "function") {
      throw previewError(
        "echo_director_preview_canvas_publish_unavailable",
        "Preview parity cannot publish the completed staging frame to the output canvas.",
      );
    }
    if (manageCanvasSize) {
      if (canvas.width !== targetWidth) canvas.width = targetWidth;
      if (canvas.height !== targetHeight) canvas.height = targetHeight;
    }
    if (typeof context.save === "function") context.save();
    if (typeof context.setTransform === "function") context.setTransform(1, 0, 0, 1, 0, 0);
    try {
      context.globalAlpha = 1;
      context.globalCompositeOperation = "copy";
      context.drawImage(staging.canvas, 0, 0, canvas.width, canvas.height);
    } finally {
      if (typeof context.restore === "function") context.restore();
    }
    lastSnapshot = {
      schemaVersion: ECHO_DIRECTOR_PREVIEW_RUNTIME_SCHEMA,
      status: missingLayers.length ? "rendered-partial-explicit" : "rendered-parity-contract",
      frame,
      renderedLayers: ECHO_DIRECTOR_PREVIEW_RENDER_ORDER.filter((layer) => typeof rendererFunction(renderAdapters, layer) === "function"),
      missingLayers,
      receipts: clone(receipts),
    };
    lastError = null;
    return lastSnapshot;
  };

  const schedule = () => {
    if (!running || disposed || scheduledFrame !== null) return;
    scheduledFrame = requestFrame(async () => {
      scheduledFrame = null;
      if (!running || disposed) return;
      if (!renderInFlight) {
        renderInFlight = true;
        try {
          await renderAt();
        } catch (error) {
          lastError = {
            code: text(error?.code, "echo_director_preview_render_failed"),
            message: text(error?.message, "Echo Director Preview render failed."),
          };
          running = false;
          if (typeof onError === "function") onError(error, clone(lastError));
          return;
        } finally {
          renderInFlight = false;
        }
      }
      schedule();
    });
  };

  const stop = () => {
    if (!running && scheduledFrame === null) return false;
    running = false;
    if (scheduledFrame !== null) cancelFrame(scheduledFrame);
    scheduledFrame = null;
    return true;
  };

  const runtime = {
    schemaVersion: ECHO_DIRECTOR_PREVIEW_RUNTIME_SCHEMA,
    canvas,
    renderAt,
    render() {
      return renderAt();
    },
    start() {
      if (disposed) throw previewError("echo_director_preview_disposed", "Echo Director Preview has been disposed.");
      if (running) return false;
      running = true;
      schedule();
      return true;
    },
    stop() {
      return stop();
    },
    dispose() {
      if (disposed) return false;
      stop();
      disposed = true;
      renderAdapters = {};
      lastSnapshot = null;
      if (stagingCanvas) {
        stagingCanvas.width = 0;
        stagingCanvas.height = 0;
      }
      stagingCanvas = null;
      stagingContext = null;
      return true;
    },
    setClock(nextClock) {
      externalClock = nextClock;
      return runtime;
    },
    setSource(nextSource, nextSelectionOptions = selectionOptions) {
      source = normalizePreviewSource(nextSource, nextSelectionOptions);
      return runtime;
    },
    setAdapters(nextAdapters = {}) {
      renderAdapters = { ...nextAdapters };
      return runtime;
    },
    snapshot() {
      return clone(lastSnapshot);
    },
    frame() {
      return projectEchoDirectorPreviewFrame({ source, clock: externalClock });
    },
    createCardPrintIntent(options = {}) {
      const frame = lastSnapshot?.frame || projectEchoDirectorPreviewFrame({ source, clock: externalClock });
      return createEchoDirectorPreviewCardPrintIntent(frame, options);
    },
    inspect() {
      return {
        schemaVersion: ECHO_DIRECTOR_PREVIEW_RUNTIME_SCHEMA,
        running,
        disposed,
        renderInFlight,
        hasScheduledFrame: scheduledFrame !== null,
        outputCanvasCount: 1,
        stagingCanvasCount: stagingCanvas ? 1 : 0,
        songId: source.song.id,
        cutId: source.cut.id,
        cutLegacy: source.cut.legacy === true,
        frameKey: lastSnapshot?.frame?.frameKey || null,
        currentCardId: lastSnapshot?.frame?.currentCard?.id || null,
        lastError: clone(lastError),
      };
    },
  };
  return runtime;
}
