import { applyMultitrackOperation } from "./multitrack-editor.js";
import { contextHash } from "./song-context-packet.js";
import { getShowGraphCapability } from "./show-graph-capabilities.js";

export const PALMIER_ROUNDTRIP_SCHEMA = "hapa.video-collab.palmier.director-roundtrip.v1";

function cardSnapshot(card) {
  return { id: card.id, trackId: card.trackId, startSeconds: card.startSeconds, endSeconds: card.endSeconds, mediaId: card.media?.id || null, contentHash: contextHash({ id: card.id, trackId: card.trackId, startSeconds: card.startSeconds, endSeconds: card.endSeconds, media: card.media, visualization: card.visualization }) };
}

export function exportPalmierRoundTripPacket(graph, { unifiedCatalog = { assets: [] }, title = graph.song?.title || "Hapa Director Export", handlesSeconds = 1 } = {}) {
  const cues = graph.directorV2?.cueGraph?.cues || [];
  const catalogByPath = new Map();
  for (const asset of unifiedCatalog.assets || []) {
    const sourcePath = asset.original?.sourcePath;
    if (!sourcePath) continue;
    catalogByPath.set(sourcePath, asset);
    const mediaSuffix = sourcePath.includes("/data/media/") ? sourcePath.slice(sourcePath.indexOf("/data/media/")) : null;
    if (mediaSuffix) catalogByPath.set(mediaSuffix, asset);
  }
  const clips = (graph.tracks || []).flatMap((track) => (track.cards || []).map((card) => {
    const localPath = card.media?.localPath || "";
    const mediaSuffix = localPath.includes("/data/media/") ? localPath.slice(localPath.indexOf("/data/media/")) : null;
    const asset = catalogByPath.get(localPath) || (mediaSuffix ? catalogByPath.get(mediaSuffix) : null);
    const lockedCueIds = cues.filter((cue) => Number(cue.atSeconds) >= Number(card.startSeconds) - .001 && Number(cue.atSeconds) <= Number(card.endSeconds) + .001).map((cue) => cue.id);
    return { clip_id: card.id, track_id: track.id, source_in_seconds: card.startSeconds, source_out_seconds: card.endSeconds, handles: { before_seconds: Math.min(handlesSeconds, card.startSeconds), after_seconds: handlesSeconds }, locked_cue_ids: lockedCueIds, media: { source_asset_id: card.media?.id || null, unified_asset_id: asset?.id || null, archival_original: asset?.original || { sourcePath: card.media?.localPath || null }, proxy: asset?.renditions?.find((row) => row.role === "playback-proxy") || null }, snapshot: cardSnapshot(card) };
  }));
  const packet = { schema_version: PALMIER_ROUNDTRIP_SCHEMA, protocol_id: "hapa.video-collab.palmier.v0", node_id: "hapa-palmier-pro", board_project_id: "hapa-echo-music-video-direction", adapter_capability: getShowGraphCapability("palmier"), project: { title, timeline_fps: 30, track_count: graph.tracks?.length || 0, clip_count: clips.length, media_count: new Set(clips.map((row) => row.media.unified_asset_id || row.media.source_asset_id)).size }, immutable_parent: { treatment_id: graph.directorV2?.treatmentId || null, cue_graph_id: graph.directorV2?.cueGraphId || null, variant_id: graph.directorV2?.variantId || null, variant_hash: graph.directorV2?.variantHash || null }, timeline: { clips, locked_cues: cues.map((cue) => ({ id: cue.id, at_seconds: cue.atSeconds, kind: cue.kind, tolerance_seconds: cue.toleranceSeconds })) }, stems: (graph.stems?.items || graph.directorV2?.stemBuses || []).map((stem) => ({ id: stem.id, stem_type: stem.stemType, audio_path: stem.audioPath || null, truth_status: stem.truthStatus || graph.stems?.nativeStatus || "declared" })), captions: (graph.song?.lyricOverlay?.lines || []).map((line, index) => ({ id: `caption:${index}`, start_seconds: line.start, end_seconds: line.end, text: line.text })), unsupported_native_layers: Object.entries(graph.directorV2?.rendererSupport || {}).filter(([renderer]) => renderer !== "hyperframes").map(([renderer, support]) => ({ renderer, route: support.route, status: support.status, unsupported: support.unsupported || [] })), provenance: { record_owner: "hapa-overwatch-kanban", source_truth: ["Native Show Graph", "Unified Hapa media catalog", "Palmier .palmier project package"], created_by: "hapa-avatar-builder", mutation_policy: "export-copy-only-canonical-treatment-immutable", packet_hash: null } };
  packet.provenance.packet_hash = contextHash(packet);
  return packet;
}

export function importPalmierRoundTripEdits({ packet, currentGraph, edits = [], operator = "human", importedAt = new Date().toISOString() } = {}) {
  const sourceGraph = structuredClone(currentGraph);
  let patchedGraph = structuredClone(currentGraph);
  const conflicts = [];
  const accepted = [];
  const annotations = [];
  const branchCandidates = [];
  const snapshots = new Map((packet.timeline?.clips || []).map((clip) => [clip.clip_id, clip.snapshot]));
  for (const edit of edits) {
    const sourceCard = currentGraph.tracks.flatMap((track) => track.cards).find((row) => row.id === edit.clipId);
    const card = patchedGraph.tracks.flatMap((track) => track.cards).find((row) => row.id === edit.clipId);
    const snapshot = snapshots.get(edit.clipId);
    if (!snapshot || !sourceCard || !card) { conflicts.push({ editId: edit.id, clipId: edit.clipId, reason: "source-clip-missing" }); continue; }
    const currentSnapshot = cardSnapshot(sourceCard);
    if (currentSnapshot.contentHash !== snapshot.contentHash) { conflicts.push({ editId: edit.id, clipId: edit.clipId, reason: "source-changed-since-export", exportedSnapshotHash: snapshot.contentHash, currentSnapshotHash: currentSnapshot.contentHash }); continue; }
    if (edit.kind === "annotation") { const note = { id: edit.id, clipId: edit.clipId, atSeconds: Number(edit.atSeconds), note: String(edit.note || ""), operator, importedAt }; annotations.push(note); accepted.push(edit.id); continue; }
    if (edit.kind === "branch-candidate") { const candidate = { schemaVersion: "hapa.avatar.video-branch-candidate.v1", id: `palmier-branch:${contextHash(edit).slice(0, 16)}`, parentVariantId: packet.immutable_parent.variant_id, parentTreatmentId: packet.immutable_parent.treatment_id, sourceClipId: edit.clipId, outputPath: edit.outputPath, contentHash: edit.contentHash || null, approvalStatus: "pending-human-review", provenance: { packetHash: packet.provenance.packet_hash, operator, importedAt, palmierProjectId: edit.palmierProjectId || null } }; branchCandidates.push(candidate); accepted.push(edit.id); continue; }
    const operation = edit.kind === "trim" ? { id: edit.id, kind: "trim-card", cardId: edit.clipId, startSeconds: edit.startSeconds, endSeconds: edit.endSeconds } : edit.kind === "replacement" ? { id: edit.id, kind: "replace-card", cardId: edit.clipId, media: edit.media } : null;
    if (!operation) { conflicts.push({ editId: edit.id, clipId: edit.clipId, reason: "unsupported-edit-kind" }); continue; }
    const result = applyMultitrackOperation(patchedGraph, operation);
    patchedGraph = result.graph;
    accepted.push(edit.id);
  }
  patchedGraph.directorV2 = { ...(patchedGraph.directorV2 || {}), humanNotes: [...(patchedGraph.directorV2?.humanNotes || []), ...annotations], patchLineage: { ...(patchedGraph.directorV2?.patchLineage || {}), parentVariantId: packet.immutable_parent.variant_id, palmierPacketHash: packet.provenance.packet_hash } };
  const variantSeed = { parent: packet.immutable_parent.variant_id, accepted, branchCandidates, graph: patchedGraph };
  const newVariantId = `variant:palmier:${contextHash(variantSeed).slice(0, 20)}`;
  patchedGraph.directorV2.variantId = newVariantId;
  patchedGraph.directorV2.variantHash = contextHash(variantSeed);
  return { schemaVersion: "hapa.video-collab.palmier.import-result.v1", nonDestructive: true, canonicalSourceUnchanged: contextHash(sourceGraph) === contextHash(currentGraph), parentVariantId: packet.immutable_parent.variant_id, newVariantId, acceptedEditIds: accepted, conflicts, annotations, branchCandidates, patchedGraph, reviewStatus: conflicts.length ? "review-conflicts" : "ready-for-human-review" };
}
