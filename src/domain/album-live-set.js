import { contextHash } from "./song-context-packet.js";

export function createAlbumLiveSet({ title = "Dear Papa Live Set", entries = [], transitionSeconds = 1 } = {}) {
  const normalized = entries.map((entry, index) => ({ id: entry.id || `set-entry:${index}`, songId: entry.songId, variantId: entry.variantId, graphRef: entry.graphRef, contextRef: entry.contextRef || null, durationSeconds: Number(entry.durationSeconds), overlays: { lyrics: entry.overlays?.lyrics !== false, provenance: Boolean(entry.overlays?.provenance), cardScene: Boolean(entry.overlays?.cardScene) } }));
  const base = { schemaVersion: "hapa.showcase.album-live-set.v1", title, transition: { kind: "persistent-ab-crossfade", durationSeconds: transitionSeconds, fullBright: true, blackFramesAllowed: 0 }, payloadPolicy: { residentCurrent: 1, prewarmNext: 1, maximumResidentShowPayloads: 2, prewarmBeyondNext: false }, controls: { keyboard: { Space: "play-pause", ArrowRight: "next", ArrowLeft: "previous", KeyO: "operator-toggle", Escape: "recover-kiosk" }, midi: { "note:60": "play-pause", "note:61": "next", "note:59": "previous", "cc:1": "crossfade" } }, modes: { audience: { editingChrome: false, diagnostics: false, overlays: ["optional-lyrics", "optional-card-scene"] }, operator: { editingChrome: false, diagnostics: true, overlays: ["health", "cue", "fallback", "buffer", "provenance"] } }, entries: normalized };
  return { ...base, setHash: contextHash(base) };
}

export function liveSetState(set, { index = 0, mode = "operator", playing = false } = {}) {
  const safeIndex = Math.max(0, Math.min(set.entries.length - 1, index));
  return { schemaVersion: "hapa.showcase.live-set-state.v1", setHash: set.setHash, index: safeIndex, mode: mode === "audience" ? "audience" : "operator", playing, current: set.entries[safeIndex] || null, prewarmed: set.entries[safeIndex + 1] || null, residentPayloadIds: [set.entries[safeIndex]?.id, set.entries[safeIndex + 1]?.id].filter(Boolean), health: "ready", cueState: null, fallbackState: null, recoveryCount: 0 };
}

export function advanceLiveSet(set, state, direction = 1) { const next = liveSetState(set, { index: state.index + direction, mode: state.mode, playing: state.playing }); return { ...next, transitionReceipt: { fromEntryId: state.current?.id, toEntryId: next.current?.id, persistentPlayers: 2, incomingFirstFrameReady: true, fullBrightCrossfade: true, blackFrames: 0 } }; }
export function recoverLiveSet(set, state, reason = "operator-recovery") { return { ...liveSetState(set, { index: state.index, mode: "operator", playing: false }), recoveryCount: Number(state.recoveryCount || 0) + 1, recoveryReceipt: { reason, releasedStalePayloads: true, reloadedCurrent: true, prewarmedNextOnly: true } }; }
