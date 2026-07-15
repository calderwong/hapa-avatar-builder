import { applyDirtyRangePatch } from "./dirty-range-rebuild.js";
import { contextHash } from "./song-context-packet.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";

export const MULTITRACK_EDITOR_SCHEMA = "hapa.director.multitrack-editor.v1";

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
  const media = {
    id: shot.media_id,
    title: shot.media_title,
    localPath: shot.media_contract?.runtimeUri
      || shot.runtime_media_uri
      || shot.media_contract?.originalUri
      || shot.media_uri
      || "",
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
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    outputProfile,
    song: { id: project.song_id, title: project.song_title, durationSeconds: duration, lyricOverlay: { lines: project.timed_lyrics || [] } },
    stems: { items: (project.stems_available || []).map((title, index) => ({ id: `stem:${index}`, stemType: title, title })) },
    tracks: [
      { id: "media-a", label: "Media A", role: "media", cards: (project.timeline || []).map((shot, index) => ({ id: `legacy:media:${index}`, trackId: "media-a", startSeconds: Number(shot.start_sec), endSeconds: Number(shot.end_sec), media: projectedShotMedia(shot), parameters: { opacity: 1, blendMode: "normal", motion: shot.camera_motion, stemMap: shot.active_stems || [] }, buffer: { state: shot.media_contract?.proxy?.status === "ready" ? "ready" : "pending", readySeconds: shot.media_contract?.proxy?.status === "ready" ? Number(shot.end_sec) - Number(shot.start_sec) : 0 }, provenance: { rendererRoute: shot.media_contract?.type || "unknown" }, knockedOut: false })) },
      { id: "ivf-stack", label: "IVF / ISF", role: "visualizer", cards: (project.visualizer_timeline || []).map((row, index) => ({ id: `legacy:ivf:${index}`, trackId: "ivf-stack", startSeconds: Number(row.start_sec), endSeconds: Number(row.end_sec), media: { id: row.visualizer_id, title: row.visualizer_title }, visualization: { sourceId: row.visualizer_id, nativeKey: row.visualizer_title, status: row.native_status || "browser-proxy" }, parameters: { opacity: Number(row.opacity ?? 0.5), blendMode: row.blend_mode || "screen", stemMap: row.active_stems || [] }, buffer: { state: "ready", readySeconds: Number(row.end_sec) - Number(row.start_sec) }, provenance: { rendererRoute: row.native_status || "browser-proxy" }, knockedOut: false })) },
    ],
    directorV2: { stemBuses: [], cameraKeyframes: [], visualTimeTrack: { events: [] }, accentTrack: { events: [] }, patchLineage: { patches: [], dirtyRanges: [] }, rendererSupport: {} },
  };
}

function mergeMediaTimeline(graph, timeline = []) {
  if (!Array.isArray(timeline)) return;
  const track = trackByRole(graph, ["track-a", "media-a"], ["foundation", "media"]);
  if (!track) return;
  const templates = Array.isArray(track.cards) ? track.cards : [];
  track.cards = timeline.map((shot, index) => {
    const template = templates[index] || {};
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
        ...(Array.isArray(shot.active_stems) ? { stemMap: clone(shot.active_stems) } : {}),
      },
      buffer: shot.media_contract?.proxy
        ? { state: proxyReady ? "ready" : "pending", readySeconds: proxyReady ? endSeconds - startSeconds : 0 }
        : clone(template.buffer),
      provenance: {
        ...(clone(template.provenance) || {}),
        ...(shot.media_contract?.type ? { rendererRoute: shot.media_contract.type } : {}),
      },
      knockedOut: false,
    };
  });
}

function mergeVisualizerTimeline(graph, timeline = []) {
  if (!Array.isArray(timeline)) return;
  const track = trackByRole(graph, ["track-b", "ivf-stack"], ["visualizer"]);
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
    const hasPortableCard = template.visualization?.card?.schemaVersion === "hapa.visualizer-card.v2";
    const startSeconds = Number(row.start_sec ?? row.startSeconds ?? template.startSeconds ?? 0);
    const endSeconds = Number(row.end_sec ?? row.endSeconds ?? template.endSeconds ?? startSeconds);
    const visualization = hasPortableCard
      ? {
        ...clone(template.visualization),
        sourceId: requestedSourceId || visualizerSourceId(template),
        requestedSourceId: requestedSourceId || template.visualization?.requestedSourceId,
        nativeKey: requestedTitle || template.visualization?.nativeKey,
        status: row.native_status || template.visualization?.status || "exact",
      }
      : {
        sourceId: requestedSourceId,
        requestedSourceId,
        nativeKey: requestedTitle,
        status: row.native_status || "portable-card-missing",
      };
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
        opacity: Number(row.opacity ?? template.parameters?.opacity ?? 0.5),
        blendMode: row.blend_mode || row.blendMode || template.parameters?.blendMode || "screen",
        ...(Array.isArray(row.active_stems) ? { stemMap: clone(row.active_stems) } : {}),
      },
      buffer: clone(template.buffer) || { state: "ready", readySeconds: endSeconds - startSeconds },
      provenance: {
        ...(clone(template.provenance) || {}),
        rendererRoute: row.native_status || template.provenance?.rendererRoute || (hasPortableCard ? "exact-browser-isf" : "portable-card-missing"),
        portableCardStatus: hasPortableCard ? "preserved" : "missing-for-requested-source",
      },
      knockedOut: false,
    };
  });
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
      lines: Array.isArray(project.timed_lyrics) ? clone(project.timed_lyrics) : graph.song?.lyricOverlay?.lines || [],
    },
  };
  if (declared) {
    mergeMediaTimeline(graph, project.timeline);
    mergeVisualizerTimeline(graph, project.visualizer_timeline || project.visualizerTimeline);
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
  const edit = { id: operation.id, kind: operation.kind === "trim-card" ? "timing-edit" : operation.kind === "set-stem-map" ? "stem-map-change" : "card-replacement", cardId: operation.cardId, atSeconds: operation.startSeconds, endSeconds: operation.endSeconds, reason: operation.kind };
  const result = applyDirtyRangePatch(graph, edit, (card) => {
    if (card.id !== operation.cardId && operation.kind !== "set-stem-map") return card;
    if (operation.kind === "replace-card") return { ...card, media: { ...card.media, ...operation.media } };
    if (operation.kind === "knock-card") return { ...card, knockedOut: operation.knockedOut !== false };
    if (operation.kind === "trim-card") return { ...card, startSeconds: Number(operation.startSeconds ?? card.startSeconds), endSeconds: Number(operation.endSeconds ?? card.endSeconds) };
    if (operation.kind === "set-blend") return { ...card, parameters: { ...(card.parameters || {}), blendMode: operation.blendMode } };
    if (operation.kind === "set-opacity") return { ...card, parameters: { ...(card.parameters || {}), opacity: Number(operation.opacity) } };
    if (operation.kind === "set-stem-map") return { ...card, parameters: { ...(card.parameters || {}), stemMap: operation.stemMap } };
    if (operation.kind === "set-camera") return { ...card, parameters: { ...(card.parameters || {}), motion: operation.motion, cameraIntensity: Number(operation.intensity) } };
    return card;
  });
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
