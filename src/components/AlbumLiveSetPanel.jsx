import React, { useMemo, useState } from "react";
import { advanceLiveSet, liveSetState, recoverLiveSet } from "../domain/album-live-set.js";
export default function AlbumLiveSetPanel({ liveSet }) {
  const set = liveSet || { entries: [], setHash: "missing", modes: {} }; const initial = useMemo(() => liveSetState(set), [set.setHash]); const [state, setState] = useState(initial);
  return <div data-testid="album-live-set" style={{ padding: 12, height: 300, background: "#02050b", border: "1px solid #50e3ff55", fontFamily: "monospace" }}>
    <div style={{ display: "flex", justifyContent: "space-between" }}><strong style={{ color: "#50e3ff" }}>ALBUM LIVE SET</strong><span>{state.mode} · {state.health}</span></div>
    <h3>{state.current?.songId || "No set loaded"}</h3><p>variant {state.current?.variantId || "—"} · next prewarm {state.prewarmed?.songId || "none"} · resident {state.residentPayloadIds.length}/2</p>
    <button type="button" onClick={() => setState({ ...state, playing: !state.playing })}>{state.playing ? "Pause" : "Play"}</button> <button type="button" onClick={() => setState(advanceLiveSet(set, state, -1))}>Previous</button> <button type="button" onClick={() => setState(advanceLiveSet(set, state, 1))}>Next</button> <button type="button" onClick={() => setState({ ...state, mode: state.mode === "operator" ? "audience" : "operator" })}>{state.mode === "operator" ? "Audience" : "Operator"}</button> <button type="button" onClick={() => setState(recoverLiveSet(set, state))}>Recover</button>
    {state.mode === "operator" && <pre style={{ color: "#9fb4c8" }}>cue: {state.cueState || "ready"}\nfallback: {state.fallbackState || "none"}\ntransition black frames: {state.transitionReceipt?.blackFrames ?? 0}</pre>}
  </div>;
}
