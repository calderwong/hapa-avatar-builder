import { applyDirtyRangePatch, dirtyRangeArtifactHash } from "./dirty-range-rebuild.js";
import { contextHash } from "./song-context-packet.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";
import {
  buildSafeCameraPath,
  classifyMediaRole,
  validateSafeCameraPath,
} from "./media-role-camera.js";
import { isPortableVisualizerAttachment } from "./portable-visualizer-card.js";
import { normalizeEchoPersistentShaderSlots } from "./echo-persistent-shader-slots.js";
import {
  echoLyricOverlayLines,
  normalizeEchoLyricContract,
} from "./echo-lyric-contract.js";

export const MULTITRACK_EDITOR_SCHEMA = "hapa.director.multitrack-editor.v1";

const positiveFinite = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

function projectedMediaDimensions(value = {}) {
  const contract = value.media_contract || value.mediaContract || {};
  const dimensions = contract.dimensions || value.media_dimensions || value.dimensions || {};
  const width = positiveFinite(dimensions.width ?? value.media_width ?? value.video_width ?? value.width);
  const height = positiveFinite(dimensions.height ?? value.media_height ?? value.video_height ?? value.height);
  return width && height ? { width, height, maxDimension: Math.max(width, height) } : null;
}

function projectedMediaOrientation(dimensions) {
  if (!dimensions) return "unknown";
  const aspect = dimensions.width / dimensions.height;
  if (Math.abs(aspect - 1) <= 0.02) return "square";
  return aspect > 1 ? "landscape" : "portrait";
}

export function editorGraphMintProjection(graph = {}, renderSpec = {}) {
  const outputProfile = resolveEchoOutputProfile(
    Object.keys(renderSpec || {}).length ? renderSpec : graph.outputProfile || graph.output_profile,
  );
  return {
    song: graph.song || null,
    stems: graph.stems || null,
    tracks: (graph.tracks || []).map((track) => ({
      id: track.id,
      role: track.role,
      cards: (track.cards || []).map((card) => ({
        id: card.id,
        trackId: card.trackId || track.id,
        startSeconds: Number(card.startSeconds || 0),
        endSeconds: Number(card.endSeconds || 0),
        knockedOut: Boolean(card.knockedOut),
        media: card.media || null,
        visualization: card.visualization || null,
        parameters: card.parameters || null,
        transition: card.transition || null,
        cameraKeyframes: card.cameraKeyframes || null,
        provenance: card.provenance || null,
      })),
    })),
    director: {
      stemBuses: graph.directorV2?.stemBuses || [],
      cameraKeyframes: graph.directorV2?.cameraKeyframes || [],
      visualTimeTrack: graph.directorV2?.visualTimeTrack || null,
      accentTrack: graph.directorV2?.accentTrack || null,
      effects: graph.directorV2?.effects || [],
      rendererSupport: graph.directorV2?.rendererSupport || null,
    },
    renderSpec: outputProfile,
  };
}

export function editorGraphMintFingerprint(graph = {}, renderSpec = {}) {
  return contextHash(editorGraphMintProjection(graph, renderSpec));
}

function projectedShotMedia(shot = {}) {
  const sourceCard = shot.decision_evidence?.sourceEvidence?.card
    || shot.decisionEvidence?.sourceEvidence?.card
    || {};
  const cardId = shot.media_card_id || shot.mediaCardId || sourceCard.id || "";
  const mediaContract = clone(shot.media_contract || shot.mediaContract || null);
  const dimensions = projectedMediaDimensions(shot);
  const sourceOrientation = projectedMediaOrientation(dimensions);
  const media = {
    id: shot.media_id,
    title: shot.media_title,
    localPath: shot.media_contract?.runtimeUri
      || shot.runtime_media_uri
      || shot.media_contract?.originalUri
      || shot.media_uri
      || "",
    ...(mediaContract ? { mediaContract } : {}),
    ...(dimensions ? {
      dimensions,
      width: dimensions.width,
      height: dimensions.height,
      aspectRatio: dimensions.width / dimensions.height,
      orientation: sourceOrientation,
      sourceOrientation,
    } : {}),
  };
  if (!cardId) return media;
  return {
    ...media,
    cardId,
    cardKind: shot.media_card_kind || shot.mediaCardKind || sourceCard.kind || "",
    cardRef: shot.media_card_ref || shot.mediaCardRef || sourceCard.ref || "",
    cardTitle: shot.media_card_title || shot.mediaCardTitle || sourceCard.title || shot.media_title || "",
  };
}

function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

const aspectMatches = (left, right) => Math.abs(Number(left) - Number(right)) <= 0.000001;

export function reframeEchoShowGraphOutputProfile(graphInput = {}, profileValue) {
  const graph = clone(graphInput) || {};
  const outputProfile = resolveEchoOutputProfile(profileValue ?? graph.outputProfile ?? graph.output_profile);
  const targetAspect = outputProfile.width / outputProfile.height;
  const director = clone(graph.directorV2) || {};
  const cameraById = new Map();

  director.mediaRoleCamera = (director.mediaRoleCamera || []).map((path) => {
    const corridors = Array.isArray(path?.corridors) ? path.corridors.map((corridor) => clone(corridor)) : [];
    const selectedIndex = corridors.findIndex((corridor) => aspectMatches(corridor?.targetAspect, targetAspect));
    const selected = selectedIndex >= 0 ? corridors[selectedIndex] : null;
    const orderedCorridors = selected
      ? [selected, ...corridors.filter((_, index) => index !== selectedIndex)]
      : corridors;
    const reframed = {
      ...path,
      corridors: orderedCorridors,
      activeTargetAspect: targetAspect,
      activeOutputProfileId: outputProfile.id,
      ...(selected ? {
        keyframes: [
          { ...(path.keyframes?.[0] || {}), offset: 0, crop: clone(selected.startCrop) },
          { ...(path.keyframes?.[1] || {}), offset: 1, crop: clone(selected.endCrop) },
        ],
      } : {}),
    };
    if (reframed.id) cameraById.set(reframed.id, { path: reframed, selected });
    return reframed;
  });

  const cameraOccurrence = new Map();
  director.cameraKeyframes = (director.cameraKeyframes || []).map((row) => {
    const camera = cameraById.get(row?.cameraPathId);
    if (!camera?.selected) return clone(row);
    const occurrence = cameraOccurrence.get(row.cameraPathId) || 0;
    cameraOccurrence.set(row.cameraPathId, occurrence + 1);
    return {
      ...row,
      crop: clone(occurrence % 2 === 0 ? camera.selected.startCrop : camera.selected.endCrop),
      outputProfileId: outputProfile.id,
      targetAspect,
    };
  });

  graph.outputProfile = outputProfile;
  delete graph.output_profile;
  graph.directorV2 = { ...director, outputProfile };
  return graph;
}

function visualizerSourceId(value = {}) {
  const visualization = value.visualization || value;
  return String(
    visualization.requestedSourceId
      || visualization.sourceId
      || visualization.card?.id
      || value.visualizer_id
      || value.visualizerId
      || value.media?.id
      || "",
  ).trim();
}

function visualizerTitle(value = {}) {
  const visualization = value.visualization || value;
  return String(
    value.visualizer_title
      || value.visualizerTitle
      || visualization.card?.title
      || visualization.nativeKey
      || value.media?.title
      || "",
  ).trim();
}

function normalizedLookupKey(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function trackByRole(graph, ids, roles) {
  const tracks = Array.isArray(graph?.tracks) ? graph.tracks : [];
  return tracks.find((track) => ids.includes(track.id))
    || tracks.find((track) => roles.includes(track.role));
}

function legacyEditorGraph(project = {}) {
  const duration = Number(project.duration || 60);
  const outputProfile = resolveEchoOutputProfile(project);
  const persistentShaderSlots = Array.isArray(project.persistent_shader_slots)
    ? normalizeEchoPersistentShaderSlots(project)
    : [];
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    outputProfile,
    song: { id: project.song_id, title: project.song_title, durationSeconds: duration, lyricOverlay: { ...normalizeEchoLyricContract(project), lines: echoLyricOverlayLines(project) } },
    stems: { items: (project.stems_available || []).map((title, index) => ({ id: `stem:${index}`, stemType: title, title })) },
    tracks: [
      { id: "media-a", label: "Media A", role: "media", cards: (project.timeline || []).map((shot, index) => ({ id: `legacy:media:${index}`, trackId: "media-a", startSeconds: Number(shot.start_sec), endSeconds: Number(shot.end_sec), media: projectedShotMedia(shot), parameters: { opacity: 1, blendMode: "normal", motion: shot.camera_motion, stemMap: shot.active_stems || [] }, buffer: { state: shot.media_contract?.proxy?.status === "ready" ? "ready" : "pending", readySeconds: shot.media_contract?.proxy?.status === "ready" ? Number(shot.end_sec) - Number(shot.start_sec) : 0 }, provenance: { rendererRoute: shot.media_contract?.type || "unknown" }, knockedOut: false })) },
      { id: "ivf-stack", label: "IVF / ISF", role: "visualizer", cards: (project.visualizer_timeline || []).map((row, index) => ({ id: `legacy:ivf:${index}`, trackId: "ivf-stack", startSeconds: Number(row.start_sec), endSeconds: Number(row.end_sec), media: { id: row.visualizer_id, title: row.visualizer_title }, visualization: { sourceId: row.visualizer_id, nativeKey: row.visualizer_title, status: row.native_status || "browser-proxy" }, parameters: { opacity: Number(row.opacity ?? 0.5), blendMode: row.blend_mode || "screen", stemMap: row.active_stems || [] }, buffer: { state: "ready", readySeconds: Number(row.end_sec) - Number(row.start_sec) }, provenance: { rendererRoute: row.native_status || "browser-proxy" }, knockedOut: false })) },
      ...persistentShaderSlots.map((slot) => ({
        id: slot.track_id,
        label: slot.label,
        role: "visualizer",
        persistent: true,
        alwaysOn: true,
        slotId: slot.id,
        enabled: slot.enabled,
        cards: slot.enabled ? [{
          id: `legacy:persistent:${slot.id}`,
          trackId: slot.track_id,
          startSeconds: 0,
          endSeconds: duration,
          media: { id: slot.shader_id, title: slot.shader_title },
          visualization: { sourceId: slot.shader_id, requestedSourceId: slot.shader_id, nativeKey: slot.shader_title, status: "portable-card-missing" },
          parameters: { opacity: slot.opacity, blendMode: slot.blend_mode, stemFocus: slot.stem_focus, stemMap: [slot.stem_focus] },
          buffer: { state: "pending", readySeconds: 0 },
          provenance: { rendererRoute: "portable-card-missing", persistentSlotId: slot.id },
          persistentSlotId: slot.id,
          alwaysOn: true,
          knockedOut: false,
        }] : [],
      })),
    ],
    directorV2: { persistentShaderSlots, stemBuses: [], cameraKeyframes: [], visualTimeTrack: { events: [] }, accentTrack: { events: [] }, patchLineage: { patches: [], dirtyRanges: [] }, rendererSupport: {} },
  };
}

function explicitSubjectROI(value = {}) {
  const input = value && typeof value === "object" ? value : {};
  const source = input.subjectROI || input.subjectRoi || input.subject_roi || input;
  const x = Number(source?.x);
  const y = Number(source?.y);
  const width = Number(source?.width);
  const height = Number(source?.height);
  if ([x, y, width, height].every(Number.isFinite)
    && x >= 0 && y >= 0 && width > 0 && height > 0
    && x + width <= 1.000001 && y + height <= 1.000001) {
    return { x, y, width, height };
  }
  return null;
}

function normalizedSubjectROI(value = {}) {
  return explicitSubjectROI(value) || { x: 0.25, y: 0.2, width: 0.5, height: 0.6 };
}

function cameraTemplateForShot(templates, shot, index, claimed) {
  const shotIndex = Number.isFinite(Number(shot.shot_index)) ? Number(shot.shot_index) : index;
  const slotId = `slot:${shotIndex}`;
  const available = templates.map((card, templateIndex) => ({ card, templateIndex }))
    .filter(({ templateIndex }) => !claimed.has(templateIndex));
  const exactSlot = available.find(({ card }) => card?.provenance?.sourceSlotId === slotId);
  const exactId = available.find(({ card }) => new RegExp(`(?:^|:)${shotIndex}$`, "u").test(String(card?.id || "")));
  const start = Number(shot.start_sec ?? shot.startSeconds ?? 0);
  const end = Number(shot.end_sec ?? shot.endSeconds ?? start);
  const exactTime = available.find(({ card }) => (
    Math.abs(Number(card?.startSeconds) - start) <= 0.000001
    && Math.abs(Number(card?.endSeconds) - end) <= 0.000001
  ));
  const indexed = !claimed.has(index) && templates[index] ? { card: templates[index], templateIndex: index } : null;
  const selected = exactSlot || exactId || exactTime || indexed || available[0] || { card: {}, templateIndex: -1 };
  if (selected.templateIndex >= 0) claimed.add(selected.templateIndex);
  return { template: selected.card || {}, slotId };
}

function cropIsAspectSafe(crop, sourceAspect, targetAspect) {
  const x = Number(crop?.x);
  const y = Number(crop?.y);
  const width = Number(crop?.width);
  const height = Number(crop?.height);
  if (![x, y, width, height].every(Number.isFinite)
    || x < 0 || y < 0 || width <= 0 || height <= 0
    || x + width > 1.000001 || y + height > 1.000001) return false;
  return Math.abs((sourceAspect * width / height) - targetAspect) <= 0.00001;
}

export function validateEditorGraphCameraBindings(graph = {}) {
  const errors = [];
  const track = trackByRole(graph, ["track-a", "media-a"], ["foundation", "media"]);
  const cards = Array.isArray(track?.cards) ? track.cards : [];
  const paths = Array.isArray(graph.directorV2?.mediaRoleCamera) ? graph.directorV2.mediaRoleCamera : [];
  const keyframes = Array.isArray(graph.directorV2?.cameraKeyframes) ? graph.directorV2.cameraKeyframes : [];
  const cardById = new Map(cards.map((card) => [String(card.id || ""), card]));
  const pathById = new Map(paths.map((path) => [String(path.id || ""), path]));
  if (cards.length && paths.length !== cards.length) errors.push("camera-path-card-count");
  for (const path of paths) {
    const card = cardById.get(String(path.mediaCardId || ""));
    if (!card) {
      errors.push(`camera-path-card-missing:${path.id || "unknown"}`);
      continue;
    }
    if (String(path.mediaId || "") !== String(card.media?.id || "")) {
      errors.push(`camera-path-media-mismatch:${path.id || "unknown"}`);
    }
    const dimensions = projectedMediaDimensions(card.media || path.sourceDimensions || {});
    const sourceAspect = dimensions ? dimensions.width / dimensions.height : positiveFinite(path.sourceAspect);
    if (!sourceAspect) errors.push(`camera-path-source-dimensions:${path.id || "unknown"}`);
    for (const reason of validateSafeCameraPath(path).errors) {
      errors.push(`camera-path-${reason}:${path.id || "unknown"}`);
    }
    for (const corridor of path.corridors || []) {
      const targetAspect = positiveFinite(corridor.targetAspect);
      if (!targetAspect) errors.push(`camera-corridor-target-aspect:${path.id || "unknown"}`);
      for (const crop of [corridor.startCrop, corridor.endCrop]) {
        if (!sourceAspect || !targetAspect || !cropIsAspectSafe(crop, sourceAspect, targetAspect)) {
          errors.push(`camera-corridor-aspect-unsafe:${path.id || "unknown"}`);
        }
      }
    }
  }
  for (const row of keyframes) {
    const path = pathById.get(String(row.cameraPathId || ""));
    if (!path) {
      errors.push(`camera-keyframe-path-missing:${row.cameraPathId || "unknown"}`);
      continue;
    }
    if (String(row.mediaId || "") !== String(path.mediaId || "")
      || String(row.mediaCardId || "") !== String(path.mediaCardId || "")) {
      errors.push(`camera-keyframe-media-mismatch:${row.cameraPathId || "unknown"}`);
    }
    const dimensions = projectedMediaDimensions(path.sourceDimensions || {});
    const sourceAspect = dimensions ? dimensions.width / dimensions.height : positiveFinite(path.sourceAspect);
    const targetAspect = positiveFinite(path.activeTargetAspect || path.corridors?.[0]?.targetAspect);
    if (!sourceAspect || !targetAspect || !cropIsAspectSafe(row.crop, sourceAspect, targetAspect)) {
      errors.push(`camera-keyframe-aspect-unsafe:${row.cameraPathId || "unknown"}`);
    }
  }
  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    mediaCards: cards.length,
    cameraPaths: paths.length,
    cameraKeyframes: keyframes.length,
  };
}

function rebuildMediaCameraBindings(graph, timeline, outputProfile, track) {
  if (!track || !Array.isArray(timeline)) return;
  const targetAspect = outputProfile.width / outputProfile.height;
  const targetAspects = [...new Set([targetAspect, 16 / 9, 9 / 16, 1])];
  const paths = [];
  const keyframes = [];
  track.cards = track.cards.map((card, index) => {
    const shot = timeline[index] || {};
    const framing = shot.camera_framing_contract || shot.cameraFramingContract || {};
    const dimensions = projectedMediaDimensions(card.media || shot) || {
      width: outputProfile.width,
      height: outputProfile.height,
      maxDimension: Math.max(outputProfile.width, outputProfile.height),
    };
    const sourceAspect = dimensions.width / dimensions.height;
    const sourceOrientation = projectedMediaOrientation(dimensions);
    const startSeconds = Number(card.startSeconds || 0);
    const endSeconds = Number(card.endSeconds || startSeconds);
    const slotId = card.provenance?.sourceSlotId || `slot:${Number.isFinite(Number(shot.shot_index)) ? Number(shot.shot_index) : index}`;
    const analysis = {
      subjectROI: normalizedSubjectROI(framing.subjectROI || framing.path?.subjectROI),
      status: framing.path?.subjectROI?.status || (framing.derived ? "asset-aware-reframe" : "center-safe-fallback"),
      evidence: framing.path?.subjectROI?.evidence || framing.reason || "selected-media-dimensions-with-center-safe-fallback",
      faceCount: Number(framing.path?.subjectROI?.faceCount || 0),
    };
    const technical = {
      ...dimensions,
      durationSec: Math.max(0, endSeconds - startSeconds),
      fps: positiveFinite(card.media?.mediaContract?.fps) || 24,
      codec: card.media?.mediaContract?.type === "image" ? "image" : "video",
    };
    const atSectionStart = index === 0
      || String(timeline[index - 1]?.section_id || "") !== String(shot.section_id || "");
    const role = framing.shotRole || classifyMediaRole({
      technical,
      subjectROI: analysis.subjectROI,
      atSectionStart,
      isFinal: index === track.cards.length - 1,
    });
    const phraseCue = framing.path?.phraseCue || {
      id: shot.section_id || slotId,
      atSeconds: startSeconds,
      source: "multitrack-selected-media-rebind",
    };
    const camera = {
      motion: card.parameters?.motion || shot.camera_motion || framing.motion || "auto",
      intensity: Number(card.parameters?.cameraIntensity ?? shot.camera_intensity ?? framing.intensity ?? 1),
      speed: Number(card.parameters?.cameraSpeed ?? shot.camera_speed ?? framing.speed ?? 1),
      focus: card.parameters?.cameraFocus || shot.camera_focus || framing.focus || "center",
    };
    const atomicTransition = shot.decision_evidence?.atomicTransition
      || shot.decisionEvidence?.atomicTransition
      || null;
    const atomicRole = atomicTransition?.role || "";
    const certifiedAtomicRole = [
      "entry-reference-still",
      "authored-transition",
      "exit-reference-still",
    ].includes(atomicRole);
    // Historical V4/V5 bridges also used `authored-transition`, but did not
    // claim the V6 physical-terminal/still-seam certificate. Treat a shot as
    // certified only when either side of the V6 contract is present; once it
    // is claimed, the complete receipt and framing contract must validate.
    const certifiedAtomic = certifiedAtomicRole && Boolean(
      framing.cropPolicy === "certified-centered-cover-no-motion"
      || atomicTransition?.visualValidation,
    );
    let plannedPath;
    if (certifiedAtomic) {
      const declaredPath = clone(framing.path) || {};
      const declaredValidation = declaredPath.zoomLimits && Array.isArray(declaredPath.corridors)
        ? validateSafeCameraPath(declaredPath)
        : { ok: false, errors: ["path-missing"] };
      const selectedCorridorIndex = (declaredPath.corridors || []).findIndex((corridor) => (
        aspectMatches(corridor?.targetAspect, targetAspect)
      ));
      const selectedCorridor = selectedCorridorIndex >= 0
        ? declaredPath.corridors[selectedCorridorIndex]
        : null;
      const cropIsStatic = selectedCorridor
        && JSON.stringify(selectedCorridor.startCrop) === JSON.stringify(selectedCorridor.endCrop);
      const declaredDimensions = projectedMediaDimensions({
        media_contract: { dimensions: declaredPath.sourceDimensions },
      });
      const errors = [
        atomicTransition?.visualValidation?.schemaVersion
          === "hapa.echo.transition-shot-visual-certification.v1" ? null : "visual-certification-schema",
        atomicTransition?.visualValidation?.decision === "certified" ? null : "visual-certification-decision",
        framing.schemaVersion === "hapa.echo.asset-camera-framing.v2" ? null : "schema",
        framing.cropPolicy === "certified-centered-cover-no-motion" ? null : "crop-policy",
        String(framing.mediaId || "") === String(card.media?.id || "") ? null : "framing-media",
        String(declaredPath.mediaId || "") === String(card.media?.id || "") ? null : "path-media",
        declaredDimensions
          && declaredDimensions.width === dimensions.width
          && declaredDimensions.height === dimensions.height ? null : "source-dimensions",
        declaredValidation.ok ? null : `path:${declaredValidation.errors.join("+")}`,
        selectedCorridor ? null : "active-output-corridor",
        cropIsStatic ? null : "moving-certified-crop",
        camera.motion === "static" ? null : "motion",
        camera.intensity === 0 ? null : "intensity",
        camera.speed === 1 ? null : "speed",
        camera.focus === "center" ? null : "focus",
      ].filter(Boolean);
      if (errors.length) {
        throw new Error(`Certified atomic camera contract is unsafe for ${card.id}: ${errors.join(", ")}`);
      }
      plannedPath = {
        ...declaredPath,
        corridors: [
          clone(selectedCorridor),
          ...(declaredPath.corridors || [])
            .filter((_, corridorIndex) => corridorIndex !== selectedCorridorIndex)
            .map((corridor) => clone(corridor)),
        ],
        keyframes: [
          { ...(declaredPath.keyframes?.[0] || {}), offset: 0, crop: clone(selectedCorridor.startCrop), zoom: 1 },
          { ...(declaredPath.keyframes?.[1] || {}), offset: 1, crop: clone(selectedCorridor.endCrop), zoom: 1 },
        ],
      };
    } else {
      const declaredPath = clone(framing.path) || {};
      const declaredValidation = declaredPath.zoomLimits && Array.isArray(declaredPath.corridors)
        ? validateSafeCameraPath(declaredPath)
        : { ok: false, errors: ["path-missing"] };
      const selectedCorridorIndex = (declaredPath.corridors || []).findIndex((corridor) => (
        aspectMatches(corridor?.targetAspect, targetAspect)
      ));
      const selectedCorridor = selectedCorridorIndex >= 0
        ? declaredPath.corridors[selectedCorridorIndex]
        : null;
      const declaredDimensions = projectedMediaDimensions({
        media_contract: { dimensions: declaredPath.sourceDimensions },
      });
      const declaredPathMatchesSelectedMedia = Boolean(
        framing.schemaVersion === "hapa.echo.asset-camera-framing.v2"
        && framing.derived === true
        && framing.cropPolicy
        && String(framing.mediaId || "") === String(card.media?.id || "")
        && String(declaredPath.mediaId || "") === String(card.media?.id || "")
        && declaredDimensions
        && declaredDimensions.width === dimensions.width
        && declaredDimensions.height === dimensions.height
        && selectedCorridor
        && declaredValidation.ok
      );
      if (declaredPathMatchesSelectedMedia) {
        plannedPath = {
          ...declaredPath,
          corridors: [
            clone(selectedCorridor),
            ...(declaredPath.corridors || [])
              .filter((_, corridorIndex) => corridorIndex !== selectedCorridorIndex)
              .map((corridor) => clone(corridor)),
          ],
          keyframes: [
            { ...(declaredPath.keyframes?.[0] || {}), offset: 0, crop: clone(selectedCorridor.startCrop) },
            { ...(declaredPath.keyframes?.[1] || {}), offset: 1, crop: clone(selectedCorridor.endCrop) },
          ],
        };
      } else {
        plannedPath = buildSafeCameraPath({
          mediaId: card.media?.id,
          technical,
          analysis,
          role,
          phraseCue,
          targetAspects,
        });
      }
    }
    const path = {
      ...plannedPath,
      id: `${plannedPath.id}:${contextHash({
        cardId: card.id,
        slotId,
        startSeconds,
        endSeconds,
      }).slice(0, 12)}`,
      plannerPathId: plannedPath.id,
      mediaCardId: card.id,
      slotId,
      sourceDimensions: clone(dimensions),
      sourceAspect,
      sourceOrientation,
      activeTargetAspect: targetAspect,
      activeOutputProfileId: outputProfile.id,
      framingContractSchema: framing.schemaVersion || null,
    };
    const startFrame = {
      atSeconds: startSeconds,
      slotId,
      mediaCardId: card.id,
      mediaId: card.media?.id,
      cameraPathId: path.id,
      subjectROI: clone(path.subjectROI),
      shotRole: path.shotRole,
      phraseCue: clone(path.phraseCue),
      easing: path.easing,
      safeZoomLimits: clone(path.zoomLimits),
      crop: clone(path.corridors[0].startCrop),
      ...camera,
    };
    const endFrame = {
      ...clone(startFrame),
      atSeconds: endSeconds,
      crop: clone(path.corridors[0].endCrop),
    };
    paths.push(path);
    keyframes.push(startFrame, endFrame);
    return {
      ...card,
      cameraKeyframes: [clone(startFrame), clone(endFrame)],
      parameters: {
        ...(card.parameters || {}),
        motion: camera.motion,
        cameraIntensity: camera.intensity,
        cameraSpeed: camera.speed,
        cameraFocus: camera.focus,
      },
      provenance: {
        ...(card.provenance || {}),
        sourceSlotId: slotId,
        cameraBinding: certifiedAtomic
          ? "certified-atomic-contract-preserved"
          : framing.derived ? "asset-aware-rederived" : "selected-media-rebound",
        ...(certifiedAtomic ? {
          cameraFramingContract: clone(framing),
          atomicTransition: clone(
            shot.decision_evidence?.atomicTransition
              || shot.decisionEvidence?.atomicTransition,
          ),
        } : {}),
      },
    };
  });
  graph.directorV2 = {
    ...(graph.directorV2 || {}),
    mediaRoleCamera: paths,
    cameraKeyframes: keyframes,
  };
  const validation = validateEditorGraphCameraBindings(graph);
  if (!validation.ok) throw new Error(`Selected-media camera graph is unsafe: ${validation.errors.join(", ")}`);
}

function mergeMediaTimeline(graph, timeline, outputProfile) {
  if (!Array.isArray(timeline)) return;
  const track = trackByRole(graph, ["track-a", "media-a"], ["foundation", "media"]);
  if (!track) return;
  const templates = Array.isArray(track.cards) ? track.cards : [];
  const claimedTemplates = new Set();
  track.cards = timeline.map((shot, index) => {
    const { template, slotId } = cameraTemplateForShot(templates, shot, index, claimedTemplates);
    const startSeconds = Number(shot.start_sec ?? shot.startSeconds ?? template.startSeconds ?? 0);
    const endSeconds = Number(shot.end_sec ?? shot.endSeconds ?? template.endSeconds ?? startSeconds);
    const proxyReady = shot.media_contract?.proxy?.status === "ready";
    return {
      ...clone(template),
      id: template.id || `projected:${track.id}:${index}`,
      trackId: track.id,
      startSeconds,
      endSeconds,
      media: projectedShotMedia(shot),
      parameters: {
        ...(clone(template.parameters) || {}),
        ...(shot.camera_motion ? { motion: shot.camera_motion } : {}),
        ...(Number.isFinite(Number(shot.camera_intensity)) ? { cameraIntensity: Number(shot.camera_intensity) } : {}),
        ...(Number.isFinite(Number(shot.camera_speed)) ? { cameraSpeed: Number(shot.camera_speed) } : {}),
        ...(shot.camera_focus ? { cameraFocus: shot.camera_focus } : {}),
        ...(Array.isArray(shot.active_stems) ? { stemMap: clone(shot.active_stems) } : {}),
      },
      buffer: shot.media_contract?.proxy
        ? { state: proxyReady ? "ready" : "pending", readySeconds: proxyReady ? endSeconds - startSeconds : 0 }
        : clone(template.buffer),
      provenance: {
        ...(clone(template.provenance) || {}),
        sourceSlotId: template.provenance?.sourceSlotId || slotId,
        ...(shot.media_contract?.type ? { rendererRoute: shot.media_contract.type } : {}),
      },
      knockedOut: false,
    };
  });
  rebuildMediaCameraBindings(graph, timeline, outputProfile || resolveEchoOutputProfile(graph.outputProfile), track);
}

function cameraTimelineFromGraph(graph, track) {
  const paths = Array.isArray(graph.directorV2?.mediaRoleCamera) ? graph.directorV2.mediaRoleCamera : [];
  const pathByCardId = new Map(paths.map((path) => [String(path.mediaCardId || ""), path]));
  return (track.cards || []).map((card, index) => {
    const path = pathByCardId.get(String(card.id || "")) || {};
    const mediaIdChanged = Boolean(path.mediaId)
      && String(path.mediaId) !== String(card.media?.id || "");
    const preservedCertifiedFraming = card.provenance?.cameraBinding === "certified-atomic-contract-preserved"
      ? card.provenance?.cameraFramingContract
      : null;
    const preservedAtomicTransition = card.provenance?.atomicTransition || null;
    if (preservedCertifiedFraming && preservedAtomicTransition && !mediaIdChanged) {
      return {
        shot_index: index,
        section_id: preservedCertifiedFraming.path?.phraseCue?.id
          || path.phraseCue?.id
          || card.provenance?.sourceSlotId
          || `slot:${index}`,
        start_sec: Number(card.startSeconds || 0),
        end_sec: Number(card.endSeconds || card.startSeconds || 0),
        camera_motion: card.parameters?.motion || preservedCertifiedFraming.motion || "static",
        camera_intensity: Number(card.parameters?.cameraIntensity ?? preservedCertifiedFraming.intensity ?? 0),
        camera_speed: Number(card.parameters?.cameraSpeed ?? preservedCertifiedFraming.speed ?? 1),
        camera_focus: card.parameters?.cameraFocus || preservedCertifiedFraming.focus || "center",
        decision_evidence: { atomicTransition: clone(preservedAtomicTransition) },
        camera_framing_contract: clone(preservedCertifiedFraming),
      };
    }
    const replacementFraming = card.media?.cameraFramingContract
      || card.media?.camera_framing_contract
      || card.media?.framingAnalysis
      || card.media?.framing_analysis
      || {};
    const replacementROI = explicitSubjectROI(
      replacementFraming.subjectROI
      || replacementFraming.subject_roi
      || replacementFraming.path?.subjectROI
      || replacementFraming.path?.subject_roi
      || card.media?.subjectROI
      || card.media?.subject_roi,
    );
    const reusablePriorROI = mediaIdChanged ? null : explicitSubjectROI(path.subjectROI);
    const subjectROI = replacementROI
      ? {
          ...replacementROI,
          status: replacementFraming.status
            || replacementFraming.path?.subjectROI?.status
            || "replacement-media-subject-roi",
          evidence: replacementFraming.evidence
            || replacementFraming.path?.subjectROI?.evidence
            || "replacement-media-framing-analysis",
          faceCount: Number(
            replacementFraming.faceCount
            ?? replacementFraming.path?.subjectROI?.faceCount
            ?? 0,
          ),
        }
      : reusablePriorROI
        ? clone(path.subjectROI)
        : null;
    const derived = Boolean(replacementROI)
      || (!mediaIdChanged && card.provenance?.cameraBinding === "asset-aware-rederived");
    return {
      shot_index: index,
      section_id: path.phraseCue?.id || card.provenance?.sourceSlotId || `slot:${index}`,
      start_sec: Number(card.startSeconds || 0),
      end_sec: Number(card.endSeconds || card.startSeconds || 0),
      camera_motion: card.parameters?.motion || "auto",
      camera_intensity: Number(card.parameters?.cameraIntensity ?? 1),
      camera_speed: Number(card.parameters?.cameraSpeed ?? 1),
      camera_focus: card.parameters?.cameraFocus || "center",
      camera_framing_contract: {
        schemaVersion: replacementROI
          ? replacementFraming.schemaVersion || null
          : mediaIdChanged ? null : path.framingContractSchema || null,
        derived,
        reason: mediaIdChanged && !replacementROI
          ? "replacement-media-center-safe-fallback"
          : replacementFraming.reason || null,
        shotRole: replacementFraming.shotRole || (mediaIdChanged ? null : path.shotRole) || null,
        subjectROI: clone(subjectROI),
        path: {
          subjectROI: clone(subjectROI),
          phraseCue: clone(path.phraseCue),
        },
      },
    };
  });
}

function rebuildGraphCameraBindings(graph, cardId) {
  const track = trackByRole(graph, ["track-a", "media-a"], ["foundation", "media"]);
  if (!track || !Array.isArray(track.cards) || !track.cards.some((card) => card.id === cardId)) return null;
  const outputProfile = resolveEchoOutputProfile(graph.directorV2?.outputProfile || graph.outputProfile);
  rebuildMediaCameraBindings(graph, cameraTimelineFromGraph(graph, track), outputProfile, track);
  return track;
}

function mergeVisualizerTimeline(graph, timeline = [], options = {}) {
  if (!Array.isArray(timeline)) return;
  const track = options.trackId
    ? (graph.tracks || []).find((candidate) => candidate.id === options.trackId)
    : trackByRole(graph, ["track-b", "ivf-stack"], ["visualizer"]);
  if (!track) return;
  const templates = Array.isArray(track.cards) ? track.cards : [];
  const bySourceId = new Map();
  const byTitle = new Map();
  for (const card of templates) {
    const sourceId = visualizerSourceId(card);
    const title = normalizedLookupKey(visualizerTitle(card));
    if (sourceId && !bySourceId.has(sourceId)) bySourceId.set(sourceId, card);
    if (title && !byTitle.has(title)) byTitle.set(title, card);
  }
  track.cards = timeline.map((row, index) => {
    const requestedSourceId = visualizerSourceId(row);
    const requestedTitle = visualizerTitle(row);
    const rowPortableCandidate = row.portable_visualizer_card
      || row.portableVisualizerCard
      || row.visualization?.card
      || null;
    const rowPortableCard = isPortableVisualizerAttachment({
      sourceId: requestedSourceId,
      card: rowPortableCandidate,
    })
      ? rowPortableCandidate
      : null;
    const indexed = templates[index];
    const indexedMatches = indexed && (
      (requestedSourceId && visualizerSourceId(indexed) === requestedSourceId)
      || (!requestedSourceId && normalizedLookupKey(visualizerTitle(indexed)) === normalizedLookupKey(requestedTitle))
    );
    const template = indexedMatches
      ? indexed
      : bySourceId.get(requestedSourceId)
        || byTitle.get(normalizedLookupKey(requestedTitle))
        || {};
    const templatePortableCard = isPortableVisualizerAttachment({
      sourceId: requestedSourceId,
      card: template.visualization?.card,
    })
      ? template.visualization.card
      : null;
    const portableCard = rowPortableCard || templatePortableCard;
    const hasPortableCard = Boolean(portableCard);
    const passThrough = requestedSourceId.toLowerCase() === "none"
      || row.disabled === true
      || row.knocked_out === true
      || row.knockedOut === true;
    const startSeconds = Number(row.start_sec ?? row.startSeconds ?? template.startSeconds ?? 0);
    const endSeconds = Number(row.end_sec ?? row.endSeconds ?? template.endSeconds ?? startSeconds);
    let visualization = null;
    if (!passThrough) {
      visualization = hasPortableCard ? {
        ...clone(template.visualization),
        sourceId: requestedSourceId || visualizerSourceId(template),
        requestedSourceId: requestedSourceId || template.visualization?.requestedSourceId,
        nativeKey: requestedTitle || template.visualization?.nativeKey,
        status: row.native_status || template.visualization?.status || "exact",
        sourceHash: portableCard.source?.hash || template.visualization?.sourceHash,
        nativeRoute: clone(portableCard.nativeRoute) || clone(template.visualization?.nativeRoute),
        card: clone(portableCard),
      }
      : {
        sourceId: requestedSourceId,
        requestedSourceId,
        nativeKey: requestedTitle,
        status: row.native_status || "portable-card-missing",
      };
    }
    const portableCardStatus = passThrough
      ? "pass-through-no-visualizer"
      : rowPortableCard
        ? "attached-from-editor-selection"
        : hasPortableCard
          ? "preserved"
          : "missing-for-requested-source";
    return {
      ...clone(template),
      id: indexedMatches && template.id ? template.id : `projected:${track.id}:${index}`,
      trackId: track.id,
      startSeconds,
      endSeconds,
      media: {
        ...(clone(template.media) || {}),
        id: requestedSourceId || template.media?.id,
        title: requestedTitle || template.media?.title,
      },
      visualization,
      parameters: {
        ...(clone(template.parameters) || {}),
        opacity: passThrough ? 0 : Number(row.opacity ?? template.parameters?.opacity ?? 0.5),
        blendMode: row.blend_mode || row.blendMode || template.parameters?.blendMode || "screen",
        ...(Array.isArray(row.active_stems) ? { stemMap: clone(row.active_stems) } : {}),
      },
      buffer: clone(template.buffer) || { state: "ready", readySeconds: endSeconds - startSeconds },
      provenance: {
        ...(clone(template.provenance) || {}),
        rendererRoute: passThrough
          ? "pass-through"
          : row.native_status || template.provenance?.rendererRoute || (hasPortableCard ? "exact-browser-isf" : "portable-card-missing"),
        portableCardStatus,
      },
      disabled: passThrough,
      knockedOut: passThrough,
      knocked_out: passThrough,
    };
  });
}

function mergePersistentShaderSlots(graph, project = {}) {
  if (!Array.isArray(project.persistent_shader_slots)) return;
  const slots = normalizeEchoPersistentShaderSlots(project);
  for (const slot of slots) {
    let track = (graph.tracks || []).find((candidate) => candidate.id === slot.track_id);
    if (!track) {
      track = { id: slot.track_id, label: slot.label, role: "visualizer", cards: [] };
      graph.tracks = [...(graph.tracks || []), track];
    }
    Object.assign(track, {
      label: slot.label,
      role: "visualizer",
      persistent: true,
      alwaysOn: true,
      slotId: slot.id,
      enabled: slot.enabled,
    });
    if (!slot.enabled) {
      track.cards = [];
      continue;
    }
    mergeVisualizerTimeline(graph, [{
      start_sec: 0,
      end_sec: Number(project.duration ?? graph.song?.durationSeconds ?? slot.end_sec),
      visualizer_id: slot.shader_id,
      visualizer_title: slot.shader_title,
      stem_focus: slot.stem_focus,
      opacity: slot.opacity,
      blend_mode: slot.blend_mode,
      native_status: slot.native_status,
      portable_visualizer_card: slot.portable_visualizer_card || slot.portableVisualizerCard || null,
    }], { trackId: slot.track_id });
    track.cards = (track.cards || []).map((card) => ({
      ...card,
      persistentSlotId: slot.id,
      alwaysOn: true,
      parameters: {
        ...(card.parameters || {}),
        stemFocus: slot.stem_focus,
        stemMap: [slot.stem_focus],
      },
      provenance: {
        ...(card.provenance || {}),
        persistentSlotId: slot.id,
      },
    }));
  }
  graph.directorV2 = {
    ...(graph.directorV2 || {}),
    persistentShaderSlots: slots,
  };
}

export function projectToEditorGraph(project = {}) {
  const declared = project.director_show_graph?.tracks ? clone(project.director_show_graph) : null;
  let graph = declared || legacyEditorGraph(project);
  const duration = Number(project.duration ?? graph.song?.durationSeconds ?? 60);
  const outputProfile = resolveEchoOutputProfile(project.output_profile || project.outputProfile || graph.outputProfile);
  graph = reframeEchoShowGraphOutputProfile(graph, outputProfile);
  graph.song = {
    ...(graph.song || {}),
    id: project.song_id || graph.song?.id,
    title: project.song_title || graph.song?.title,
    durationSeconds: duration,
    lyricOverlay: {
      ...(graph.song?.lyricOverlay || {}),
      ...normalizeEchoLyricContract(project),
      lines: echoLyricOverlayLines(project).length || normalizeEchoLyricContract(project).enabled === false
        ? clone(echoLyricOverlayLines(project))
        : graph.song?.lyricOverlay?.lines || [],
    },
  };
  if (declared) {
    mergeMediaTimeline(graph, project.timeline, outputProfile);
    mergeVisualizerTimeline(graph, project.visualizer_timeline || project.visualizerTimeline);
    mergePersistentShaderSlots(graph, project);
  } else if (Array.isArray(project.timeline)) {
    const mediaTrack = trackByRole(graph, ["track-a", "media-a"], ["foundation", "media"]);
    rebuildMediaCameraBindings(graph, project.timeline, outputProfile, mediaTrack);
  }
  graph.directorV2 = {
    ...(graph.directorV2 || {}),
    outputProfile,
    patchLineage: graph.directorV2?.patchLineage || { patches: [], dirtyRanges: [] },
  };
  return replayMultitrackPatches(graph, project.director_show_graph_patches || []);
}

export function replayMultitrackPatches(graph, patches = []) {
  return patches.reduce((current, patch) => {
    const operation = patch?.operation;
    if (!operation?.kind || !operation?.cardId) return current;
    return applyMultitrackOperation(current, operation).graph;
  }, graph);
}

export function buildMultitrackProjection(graph) {
  const duration = Number(graph.song?.durationSeconds || 60);
  const lanes = [
    { id: "audio", label: "Audio / stems", kind: "audio", items: (graph.stems?.items || graph.directorV2?.stemBuses || []).map((stem) => ({ id: stem.id, startSeconds: 0, endSeconds: duration, label: stem.title || stem.stemType || stem.id, readiness: stem.audioPath ? "ready" : "declared", rendererSupport: "all" })) },
    ...(graph.tracks || []).map((track) => ({ id: track.id, label: track.label || track.id, kind: track.role || (track.cards.some((card) => card.visualization) ? "visualizer" : "media"), items: track.cards.map((card) => ({ id: card.id, startSeconds: card.startSeconds, endSeconds: card.endSeconds, label: card.visualization?.nativeKey || card.media?.title || card.media?.id, knockedOut: Boolean(card.knockedOut), readiness: card.buffer?.state || (card.media?.localPath ? "source-declared" : "generated"), readySeconds: card.buffer?.readySeconds ?? null, rendererSupport: card.visualization?.card?.rendererSupport || card.provenance?.rendererRoute || graph.directorV2?.rendererSupport || {}, opacity: card.parameters?.opacity ?? 1, blendMode: card.parameters?.blendMode || "normal", stemMap: card.parameters?.stemMap || card.parameters?.visualizerMappings || [] })) })),
    { id: "lyrics", label: "Lyrics", kind: "lyrics", items: (graph.song?.lyricOverlay?.lines || []).map((line, index) => ({ id: `lyric:${index}`, startSeconds: line.start, endSeconds: line.end, label: line.text, readiness: "timed", rendererSupport: "all" })) },
    { id: "camera", label: "Camera", kind: "camera", items: (graph.directorV2?.cameraKeyframes || []).map((row, index) => ({ id: `camera:${index}`, startSeconds: row.atSeconds, endSeconds: row.atSeconds + 0.1, label: row.motion || row.shotRole || "keyframe", readiness: row.subjectROI?.status || "declared", rendererSupport: graph.directorV2?.rendererSupport || {} })) },
    { id: "visual-time", label: "Visual time", kind: "visual-time", items: (graph.directorV2?.visualTimeTrack?.events || []).map((row) => ({ id: row.id, startSeconds: row.startSeconds, endSeconds: row.endSeconds, label: row.kind, readiness: "keyframed", rendererSupport: row.rendererSupport })) },
    { id: "accents", label: "Accents / effects", kind: "effects", items: (graph.directorV2?.accentTrack?.events || graph.directorV2?.effects || []).map((row) => ({ id: row.id, startSeconds: row.atSeconds ?? row.startSeconds, endSeconds: row.endSeconds, label: row.kind, readiness: row.safety?.mode || "bounded", rendererSupport: graph.directorV2?.rendererSupport || {} })) },
    { id: "agent-notes", label: "Agent notes", kind: "notes", items: graph.directorV2?.agentNotes || [] },
    { id: "human-notes", label: "Human notes", kind: "notes", items: graph.directorV2?.humanNotes || [] },
  ];
  return { schemaVersion: MULTITRACK_EDITOR_SCHEMA, durationSeconds: duration, lanes };
}

export function applyMultitrackOperation(graph, operation) {
  const cardOperations = new Set(["replace-card", "knock-card", "trim-card", "set-blend", "set-opacity", "set-stem-map", "set-camera"]);
  if (!cardOperations.has(operation.kind)) throw new Error(`Unsupported multitrack operation ${operation.kind}`);
  const targetCard = (graph.tracks || []).flatMap((track) => track.cards || [])
    .find((card) => card.id === operation.cardId);
  const changesCertifiedAtomicVisual = new Set([
    "replace-card",
    "knock-card",
    "trim-card",
    "set-blend",
    "set-opacity",
    "set-camera",
  ]);
  if (changesCertifiedAtomicVisual.has(operation.kind)
    && targetCard?.provenance?.cameraBinding === "certified-atomic-contract-preserved"
    && targetCard?.provenance?.atomicTransition?.role) {
    throw new Error("A certified Reference A/transition/Reference B member cannot be visually or temporally changed without recompiling the complete atomic bridge.");
  }
  const edit = { id: operation.id, kind: operation.kind === "trim-card" ? "timing-edit" : operation.kind === "set-stem-map" ? "stem-map-change" : "card-replacement", cardId: operation.cardId, atSeconds: operation.startSeconds, endSeconds: operation.endSeconds, reason: operation.kind };
  const operatorOverrideProvenance = (card) => {
    if (card.provenance?.cameraBinding !== "certified-atomic-contract-preserved") return card.provenance;
    const provenance = clone(card.provenance) || {};
    delete provenance.cameraFramingContract;
    delete provenance.atomicTransition;
    provenance.cameraBinding = "operator-overrode-certified-atomic-contract";
    return provenance;
  };
  const result = applyDirtyRangePatch(graph, edit, (card) => {
    if (card.id !== operation.cardId && operation.kind !== "set-stem-map") return card;
    if (operation.kind === "replace-card") return {
      ...card,
      media: { ...card.media, ...operation.media },
      provenance: operatorOverrideProvenance(card),
    };
    if (operation.kind === "knock-card") return { ...card, knockedOut: operation.knockedOut !== false };
    if (operation.kind === "trim-card") return { ...card, startSeconds: Number(operation.startSeconds ?? card.startSeconds), endSeconds: Number(operation.endSeconds ?? card.endSeconds) };
    if (operation.kind === "set-blend") return { ...card, parameters: { ...(card.parameters || {}), blendMode: operation.blendMode } };
    if (operation.kind === "set-opacity") return { ...card, parameters: { ...(card.parameters || {}), opacity: Number(operation.opacity) } };
    if (operation.kind === "set-stem-map") return { ...card, parameters: { ...(card.parameters || {}), stemMap: operation.stemMap } };
    if (operation.kind === "set-camera") return {
      ...card,
      parameters: { ...(card.parameters || {}), motion: operation.motion, cameraIntensity: Number(operation.intensity) },
      provenance: operatorOverrideProvenance(card),
    };
    return card;
  });
  if (["replace-card", "trim-card", "set-camera"].includes(operation.kind)) {
    const rebuiltTrack = rebuildGraphCameraBindings(result.graph, operation.cardId);
    if (rebuiltTrack && result.receipt.affectedTrackIds.includes(rebuiltTrack.id)) {
      result.receipt.rebuiltArtifactHashes[rebuiltTrack.id] = dirtyRangeArtifactHash(rebuiltTrack);
    }
  }
  const graphVariantHashBefore = graph.directorV2?.variantHash || editorGraphMintFingerprint(graph);
  const graphVariantHashAfter = editorGraphMintFingerprint(result.graph);
  result.graph.directorV2 = {
    ...(result.graph.directorV2 || {}),
    parentVariantHash: graphVariantHashBefore,
    variantHash: graphVariantHashAfter,
  };
  const patch = { schemaVersion: "hapa.director.multitrack-patch.v1", operation, dirtyRange: result.receipt, graphVariantHashBefore, graphVariantHashAfter };
  result.graph.directorV2.patchLineage.patches = [...(result.graph.directorV2.patchLineage.patches || []), patch];
  return { ...result, patch };
}
