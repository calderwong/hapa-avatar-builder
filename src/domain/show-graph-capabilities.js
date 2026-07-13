import { contextHash } from "./song-context-packet.js";

export const SHOW_GRAPH_CAPABILITY_SCHEMA = "hapa.show-graph.capability-matrix.v1";
export const SHOW_GRAPH_VERSION = "hapa.music-viz.native-show-graph.v2";

const adapters = {
  "echo-avatar-builder": { versions: [SHOW_GRAPH_VERSION], capabilities: { media: "exact", lyrics: "exact", cameraROI: "exact", portableISF: "exact-browser-isf", stemTelemetry: "offline-samples", visualTime: "exact", accents: "exact", multipass: "approximate" }, fallbacks: { multipass: "flatten-pass-stack" } },
  "echo-tarot": { versions: [SHOW_GRAPH_VERSION], capabilities: { media: "exact", lyrics: "exact", cameraROI: "exact", portableISF: "exact-browser-isf", stemTelemetry: "offline-samples", visualTime: "exact", accents: "exact", multipass: "approximate" }, fallbacks: { multipass: "flatten-pass-stack" } },
  "music-viz-native": { versions: [SHOW_GRAPH_VERSION], capabilities: { media: "exact", lyrics: "exact", cameraROI: "approximate", portableISF: "supported-subset", stemTelemetry: "offline-samples", visualTime: "approximate", accents: "approximate", multipass: "supported-subset" }, fallbacks: { cameraROI: "safe-center-crop", portableISF: "visible-native-approximation-or-block", visualTime: "canonical-visual-clock", accents: "bounded-native-accent", multipass: "supported-pass-subset" } },
  "dear-papa-native": { versions: [SHOW_GRAPH_VERSION], capabilities: { media: "exact", lyrics: "exact", cameraROI: "exact", portableISF: "unsupported", stemTelemetry: "offline-samples", visualTime: "supported-subset", accents: "supported-subset", multipass: "unsupported" }, fallbacks: { portableISF: "truth-labeled-placeholder", visualTime: "canonical-visual-clock", accents: "bounded-native-accent", multipass: "foundation-only" } },
  hyperframes: { versions: [SHOW_GRAPH_VERSION], capabilities: { media: "exact", lyrics: "exact", cameraROI: "exact", portableISF: "precompiled-exact", stemTelemetry: "offline-samples", visualTime: "exact", accents: "exact", multipass: "exact" }, fallbacks: {} },
  palmier: { versions: [SHOW_GRAPH_VERSION], capabilities: { media: "editable-proxy", lyrics: "editable-captions", cameraROI: "markers", portableISF: "unsupported", stemTelemetry: "audio-tracks", visualTime: "markers", accents: "markers", multipass: "unsupported" }, fallbacks: { cameraROI: "locked-markers", portableISF: "proxy-video-plus-locked-metadata", visualTime: "locked-markers", accents: "locked-markers", multipass: "flattened-proxy" } },
};

export function getShowGraphCapability(adapterId) {
  const adapter = adapters[adapterId];
  if (!adapter) throw new Error(`Unknown show-graph adapter ${adapterId}`);
  return { schemaVersion: SHOW_GRAPH_CAPABILITY_SCHEMA, adapterId, graphVersions: adapter.versions, capabilities: adapter.capabilities, deterministicFallbacks: adapter.fallbacks, publishedAtRuntime: true };
}

export function showGraphCapabilityMatrix() { return { schemaVersion: SHOW_GRAPH_CAPABILITY_SCHEMA, graphVersion: SHOW_GRAPH_VERSION, adapters: Object.keys(adapters).map(getShowGraphCapability) }; }

export function migrateShowGraphForward(input) {
  if (input.schemaVersion === SHOW_GRAPH_VERSION) return { graph: structuredClone(input), receipt: { schemaVersion: "hapa.show-graph.migration-receipt.v1", from: SHOW_GRAPH_VERSION, to: SHOW_GRAPH_VERSION, changed: false, preserved: ["cueIds", "locks", "provenance", "decisionCacheLineage"], losses: [] } };
  if (input.schemaVersion !== "hapa.music-viz.native-show-graph.v1") throw new Error(`No migration path from ${input.schemaVersion}`);
  const sourceDirector = input.director || input.directorV2 || {};
  const graph = { ...structuredClone(input), schemaVersion: SHOW_GRAPH_VERSION, directorV2: { ...sourceDirector, cueGraph: { ...(sourceDirector.cueGraph || {}), cues: sourceDirector.cueGraph?.cues || input.cues || [] }, locks: sourceDirector.locks || input.locks || [], provenance: sourceDirector.provenance || input.provenance || {}, decisionCacheLineage: sourceDirector.decisionCacheLineage || input.decisionCacheLineage || {}, rendererSupport: sourceDirector.rendererSupport || {} } };
  delete graph.director;
  delete graph.cues;
  delete graph.locks;
  delete graph.provenance;
  delete graph.decisionCacheLineage;
  const receipt = { schemaVersion: "hapa.show-graph.migration-receipt.v1", from: input.schemaVersion, to: SHOW_GRAPH_VERSION, changed: true, preserved: ["cueIds", "locks", "provenance", "decisionCacheLineage"], sourceHash: contextHash(input), migratedHash: contextHash(graph), losses: [] };
  return { graph, receipt };
}

function requiredFeatures(graph) {
  const cards = (graph.tracks || []).flatMap((track) => track.cards || []);
  return [
    ["media", cards.some((card) => card.media)], ["lyrics", Boolean(graph.song?.lyricOverlay?.lines?.length)], ["cameraROI", Boolean(graph.directorV2?.cameraKeyframes?.some((row) => row.subjectROI))], ["portableISF", cards.some((card) => card.visualization)], ["stemTelemetry", Boolean(graph.stems?.telemetryBundle || graph.directorV2?.stemBuses?.length)], ["visualTime", Boolean(graph.directorV2?.visualTimeTrack?.events?.length)], ["accents", Boolean(graph.directorV2?.accentTrack?.events?.length)], ["multipass", cards.some((card) => (card.visualization?.card?.passes || []).length > 1)],
  ].filter(([, required]) => required).map(([id]) => id);
}

export function adaptShowGraphWithLossReport(graph, adapterId, { approvedFallbacks = [] } = {}) {
  const capability = getShowGraphCapability(adapterId);
  const required = requiredFeatures(graph);
  const losses = required.flatMap((feature) => {
    const support = capability.capabilities[feature] || "unsupported";
    if (["exact", "exact-browser-isf", "precompiled-exact", "manifest-native", "offline-samples", "editable-proxy", "editable-captions", "audio-tracks"].includes(support)) return [];
    const fallback = capability.deterministicFallbacks[feature] || null;
    const approval = approvedFallbacks.find((row) => row.feature === feature && row.fallback === fallback && row.approvedBy && row.approvedAt);
    return [{ feature, support, fallback, visible: true, approved: Boolean(approval), approval: approval || null }];
  });
  return { schemaVersion: "hapa.show-graph.adapter-loss-report.v1", adapterId, graphVersion: graph.schemaVersion, requiredFeatures: required, losses, silentDegradation: false, ok: losses.every((loss) => loss.fallback && loss.approved), fallbackGraphHash: contextHash({ graphHash: contextHash(graph), adapterId, appliedFallbacks: losses.map(({ feature, fallback }) => ({ feature, fallback })) }) };
}
