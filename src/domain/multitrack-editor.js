import { applyDirtyRangePatch } from "./dirty-range-rebuild.js";
import { contextHash } from "./song-context-packet.js";

export const MULTITRACK_EDITOR_SCHEMA = "hapa.director.multitrack-editor.v1";

export function editorGraphMintProjection(graph = {}, renderSpec = {}) {
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
    renderSpec,
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

export function projectToEditorGraph(project = {}) {
  const duration = Number(project.duration || 60);
  const graph = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: project.song_id, title: project.song_title, durationSeconds: duration, lyricOverlay: { lines: project.timed_lyrics || [] } },
    stems: { items: (project.stems_available || []).map((title, index) => ({ id: `stem:${index}`, stemType: title, title })) },
    tracks: [
      { id: "media-a", label: "Media A", role: "media", cards: (project.timeline || []).map((shot, index) => ({ id: `legacy:media:${index}`, trackId: "media-a", startSeconds: Number(shot.start_sec), endSeconds: Number(shot.end_sec), media: projectedShotMedia(shot), parameters: { opacity: 1, blendMode: "normal", motion: shot.camera_motion, stemMap: shot.active_stems || [] }, buffer: { state: shot.media_contract?.proxy?.status === "ready" ? "ready" : "pending", readySeconds: shot.media_contract?.proxy?.status === "ready" ? Number(shot.end_sec) - Number(shot.start_sec) : 0 }, provenance: { rendererRoute: shot.media_contract?.type || "unknown" }, knockedOut: false })) },
      { id: "ivf-stack", label: "IVF / ISF", role: "visualizer", cards: (project.visualizer_timeline || []).map((row, index) => ({ id: `legacy:ivf:${index}`, trackId: "ivf-stack", startSeconds: Number(row.start_sec), endSeconds: Number(row.end_sec), media: { id: row.visualizer_id, title: row.visualizer_title }, visualization: { sourceId: row.visualizer_id, nativeKey: row.visualizer_title, status: row.native_status || "browser-proxy" }, parameters: { opacity: Number(row.opacity ?? 0.5), blendMode: row.blend_mode || "screen", stemMap: row.active_stems || [] }, buffer: { state: "ready", readySeconds: Number(row.end_sec) - Number(row.start_sec) }, provenance: { rendererRoute: row.native_status || "browser-proxy" }, knockedOut: false })) },
    ],
    directorV2: { stemBuses: [], cameraKeyframes: [], visualTimeTrack: { events: [] }, accentTrack: { events: [] }, patchLineage: { patches: [], dirtyRanges: [] }, rendererSupport: {} },
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
