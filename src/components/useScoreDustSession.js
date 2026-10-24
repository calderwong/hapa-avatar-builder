// Shared Score Dust listening from the Echo preview: host a session, join one
// by id or link, keep a room clock, and correct playback drift.
import { useCallback, useEffect, useRef, useState } from "react";
import { createRoomClock, sharedPlayCorrection, SHARED_PLAY_CHECK_INTERVAL_MS } from "../domain/echo-score-dust-shared-play.js";
import { ensureEchoPreviewRecordingLocalSession } from "../domain/echo-preview-recording.js";

const POLL_MS = 1000;

export function useScoreDustSession({ apiBase = "", songId, dust, playing, getActual, playPause, seek, outputLatencySeconds = 0 }) {
  const [state, setState] = useState({ role: "none", session: null, message: "", corrections: 0, lastCorrection: null });
  const clock = useRef(createRoomClock()), latest = useRef(null), role = useRef("none"), lastHostSync = useRef(null);
  const controls = useRef({});
  controls.current = { playing, getActual, playPause, seek, dust };

  const request = useCallback(async (path, options = {}) => {
    await ensureEchoPreviewRecordingLocalSession(apiBase).catch(() => {});
    const clientSendMs = Date.now();
    const response = await fetch(`${apiBase}/api/echos/score-dust/sessions${path}`, { credentials: "same-origin", ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
    const clientReceiveMs = Date.now(), body = await response.json().catch(() => ({}));
    if (body.clock) clock.current.add({ clientSendMs, clientReceiveMs, ...body.clock });
    if (!response.ok) throw Object.assign(new Error(body.message || `Session request failed (${response.status})`), { status: response.status });
    return body.session;
  }, [apiBase]);

  const accept = useCallback((session) => {
    if (!session || (latest.current && latest.current.id === session.id && session.revision < latest.current.revision)) return;
    latest.current = session;
    setState((s) => ({ ...s, session }));
  }, []);

  const snapshot = () => {
    const { dust: d, playing: p, getActual: actual } = controls.current;
    return { songId, runId: d.runId || null, audioIdentity: d.timeline?.source?.sourceSha256 || null, scoreFingerprint: d.score?.fingerprint || null,
      direction: d.direction || {}, playSettings: { seed: d.settings?.seed, pulse: d.settings?.pulse }, durationSeconds: d.score?.durationSeconds || null,
      state: p ? "playing" : "paused", positionSeconds: Math.max(0, Number(actual?.()) || 0), title: d.timeline?.source?.songId || songId };
  };

  const host = useCallback(async () => {
    try {
      const session = await request("", { method: "POST", body: JSON.stringify(snapshot()) });
      role.current = "host"; lastHostSync.current = { playing: controls.current.playing, at: Date.now(), position: session.positionSeconds, fingerprint: session.scoreFingerprint };
      accept(session);
      setState((s) => ({ ...s, role: "host", message: "Hosting. Share the link; listeners follow your play, pause, seek and direction." }));
    } catch (error) { setState((s) => ({ ...s, message: error.message })); }
  }, [request, accept]); // eslint-disable-line react-hooks/exhaustive-deps

  const join = useCallback(async (id) => {
    try {
      const session = await request(`/${encodeURIComponent(String(id).trim())}`);
      if (session.songId !== songId) { setState((s) => ({ ...s, message: `That session plays a different Song (${session.songId}). Open it first, then join.` })); return; }
      role.current = "peer"; latest.current = null; accept(session);
      // Peers rebuild the identical score from the shared direction and seed;
      // a draft is adopted only when the local score or seed/pulse differ.
      const local = controls.current.dust;
      const differs = session.scoreFingerprint !== local.score?.fingerprint || (session.playSettings?.seed !== undefined && session.playSettings.seed !== local.settings?.seed) || (session.playSettings?.pulse && session.playSettings.pulse !== local.settings?.pulse);
      if (differs) local.setDraft({ ...(session.direction || {}), playSettings: { ...(session.direction?.playSettings || {}), ...session.playSettings } });
      const mine = controls.current.dust.timeline?.source?.sourceSha256;
      setState((s) => ({ ...s, role: "peer", message: session.audioIdentity && mine && session.audioIdentity !== mine ? "Joined, but this Song's audio bytes differ from the host's; timing may not match." : "Joined. Press Play once if your browser blocks audio." }));
    } catch (error) { setState((s) => ({ ...s, message: error.message })); }
  }, [request, accept, songId]);

  const leave = useCallback(() => { role.current = "none"; latest.current = null; setState({ role: "none", session: null, message: "Left the shared session.", corrections: 0, lastCorrection: null }); }, []);

  // Poll the room: refresh session state and clock samples.
  useEffect(() => {
    if (state.role === "none" || !state.session?.id) return undefined;
    const id = state.session.id;
    const timer = setInterval(() => { request(`/${id}`).then(accept).catch((error) => setState((s) => ({ ...s, message: error.message }))); }, POLL_MS);
    return () => clearInterval(timer);
  }, [state.role, state.session?.id, request, accept]);

  // Peers: drift check every two seconds.
  useEffect(() => {
    if (state.role !== "peer") return undefined;
    const timer = setInterval(() => {
      const session = latest.current, roomNowMs = clock.current.roomNowMs(Date.now());
      if (!session || roomNowMs === null) return;
      const { playing: p, getActual: actual, playPause: toggle, seek: jump } = controls.current;
      const decision = sharedPlayCorrection({ session, roomNowMs, actualSeconds: Number(actual?.()) || 0, playing: p, outputLatencySeconds });
      if (decision.action === "seek") jump?.(decision.to);
      if (decision.action === "play" || decision.action === "pause") { jump?.(decision.to); toggle?.(); }
      if (decision.action !== "none") setState((s) => ({ ...s, corrections: s.corrections + 1, lastCorrection: { ...decision, at: Date.now() } }));
    }, SHARED_PLAY_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [state.role, outputLatencySeconds]);

  // Host: publish play/pause, seeks and direction changes.
  useEffect(() => {
    if (state.role !== "host") return undefined;
    const timer = setInterval(() => {
      const session = latest.current, last = lastHostSync.current;
      if (!session || !last) return;
      const { playing: p, getActual: actual, dust: d } = controls.current, position = Number(actual?.()) || 0;
      const expected = last.playing ? last.position + (Date.now() - last.at) / 1000 : last.position;
      const changed = p !== last.playing || Math.abs(position - expected) > 1 || (d.score?.fingerprint && d.score.fingerprint !== last.fingerprint);
      if (!changed) return;
      const body = { ...snapshot(), baseRevision: session.revision };
      delete body.songId;
      lastHostSync.current = { playing: p, at: Date.now(), position, fingerprint: d.score?.fingerprint };
      request(`/${session.id}`, { method: "PUT", body: JSON.stringify(body) }).then(accept).catch((error) => {
        if (error.status === 409) request(`/${session.id}`).then(accept);
        else setState((s) => ({ ...s, message: error.message }));
      });
    }, 500);
    return () => clearInterval(timer);
  }, [state.role, request, accept]); // eslint-disable-line react-hooks/exhaustive-deps

  // Join from a link (?scoreDustSession=<id>) once the Song is open.
  useEffect(() => {
    const id = typeof location !== "undefined" ? new URLSearchParams(location.search).get("scoreDustSession") : null;
    if (id && state.role === "none" && dust?.score && songId) join(id);
  }, [Boolean(dust?.score), songId]); // eslint-disable-line react-hooks/exhaustive-deps

  return { ...state, host, join, leave, offsetMs: clock.current.offsetMs, delayMs: clock.current.delayMs,
    joinLink: state.session ? `${typeof location !== "undefined" ? `${location.origin}${location.pathname}` : ""}?scoreDustSession=${state.session.id}` : "" };
}
