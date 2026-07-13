export const DIRTY_RANGE_SCHEMA = "hapa.show-graph.dirty-range.v1";
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const hash = (value) => {
  const input = JSON.stringify(stable(value));
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    a = Math.imul(a ^ input.charCodeAt(index), 0x01000193) >>> 0;
    b = Math.imul(b ^ (input.charCodeAt(index) + index), 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`.repeat(4);
};
const overlaps = (card, start, end) => Number(card.startSeconds) < end && Number(card.endSeconds) > start;

export function planDirtyRange(graph, edit = {}) {
  const allCards = (graph.tracks || []).flatMap((track) => (track.cards || []).map((card) => ({ track, card })));
  let matched = [];
  const reasons = new Set([edit.reason || edit.kind || "explicit-edit"]);
  if (edit.cardId) matched = allCards.filter(({ card }) => card.id === edit.cardId);
  else if (edit.mediaId) matched = allCards.filter(({ card }) => card.media?.id === edit.mediaId);
  else if (edit.trackIds?.length) matched = allCards.filter(({ track }) => edit.trackIds.includes(track.id));
  else matched = allCards.filter(({ card }) => overlaps(card, Number(edit.atSeconds || 0), Number(edit.endSeconds ?? edit.atSeconds ?? 0) + 0.001));
  if (edit.kind === "stem-map-change") {
    matched = allCards.filter(({ card }) => card.visualization || card.parameters?.motion === "stem-modulated");
    reasons.add("visualizer-and-modulation-dependency");
  }
  if (edit.kind === "timing-edit") {
    const start = Number(edit.atSeconds || 0);
    const end = Number(edit.endSeconds ?? start);
    matched = allCards.filter(({ card }) => overlaps(card, start - 0.5, end + 0.5));
    reasons.add("adjacent-transition-handle");
  }
  const start = matched.length ? Math.max(0, Math.min(...matched.map(({ card }) => Number(card.startSeconds))) - 0.5) : Math.max(0, Number(edit.atSeconds || 0) - 0.5);
  const end = matched.length ? Math.max(...matched.map(({ card }) => Number(card.endSeconds))) + 0.5 : Number(edit.endSeconds ?? edit.atSeconds ?? start) + 0.5;
  const affectedTrackIds = [...new Set(matched.map(({ track }) => track.id).concat(edit.trackIds || []))].sort();
  return {
    schemaVersion: DIRTY_RANGE_SCHEMA,
    editId: edit.id || `edit:${hash(edit).slice(0, 16)}`,
    editKind: edit.kind || "explicit-edit",
    earliestDirtySeconds: start,
    endDirtySeconds: end,
    affectedTrackIds,
    dependencyReasons: [...reasons].sort(),
    sourceArtifactHashes: Object.fromEntries((graph.tracks || []).map((track) => [track.id, hash(track)])),
    rebuiltArtifactHashes: {},
  };
}

export function applyDirtyRangePatch(graph, edit, patchCard) {
  const plan = planDirtyRange(graph, edit);
  const next = structuredClone(graph);
  next.tracks = next.tracks.map((track) => {
    if (!plan.affectedTrackIds.includes(track.id)) return track;
    return {
      ...track,
      cards: track.cards.map((card) => overlaps(card, plan.earliestDirtySeconds, plan.endDirtySeconds) ? patchCard(card, { trackId: track.id, plan }) : card),
    };
  });
  plan.rebuiltArtifactHashes = Object.fromEntries(next.tracks.filter((track) => plan.affectedTrackIds.includes(track.id)).map((track) => [track.id, hash(track)]));
  plan.unchangedArtifactHashes = Object.fromEntries(next.tracks.filter((track) => !plan.affectedTrackIds.includes(track.id)).map((track) => [track.id, hash(track)]));
  plan.unchangedTracksByteIdentical = next.tracks.filter((track) => !plan.affectedTrackIds.includes(track.id)).every((track) => JSON.stringify(track) === JSON.stringify(graph.tracks.find((source) => source.id === track.id)));
  next.directorV2 = {
    ...next.directorV2,
    patchLineage: {
      ...(next.directorV2?.patchLineage || {}),
      dirtyRanges: [...(next.directorV2?.patchLineage?.dirtyRanges || []), plan],
    },
  };
  return { graph: next, receipt: plan };
}

export function dirtyRangeBufferInvalidations(plan) {
  return plan.affectedTrackIds.map((trackId) => ({ schemaVersion: DIRTY_RANGE_SCHEMA, trackId, startSeconds: plan.earliestDirtySeconds, endSeconds: plan.endDirtySeconds, reason: plan.dependencyReasons.join(" + "), editId: plan.editId }));
}
