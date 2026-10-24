// Score Dust guest page (P2 item 17): a phone or another computer opens the
// host's invite link, signs in with a name, and renders the host's exact
// score locally, timed by the room clock. Visuals run without audio; audio on
// this device is optional and drift-corrected. Guests can react, and can
// drive play only when the host hands them control.
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoomClock, sessionPositionAt, sharedPlayCorrection } from "../domain/echo-score-dust-shared-play.js";
import { normalizeDustPlaySettings, prepareEchoScorePlayback } from "../domain/echo-visual-score.js";
import { createEchoScoreDustRenderer } from "./echo-score-dust-renderer.js";
import { createEchoScoreDustAutoRenderer } from "./echo-score-dust-gpu.js";
import "./ScoreDustGuestView.css";

const REACTIONS = [["spark", "✦"], ["heart", "♥"], ["wave", "〜"], ["fire", "🔥"], ["clap", "👏"]];
const store = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch { /* private mode */ } }, drop: (k) => { try { sessionStorage.removeItem(k); } catch { /* private mode */ } } };

export default function ScoreDustGuestView({ apiBase = "" }) {
  const params = useMemo(() => new URLSearchParams(location.search), []);
  const sessionId = params.get("session") || "";
  const [invite] = useState(() => new URLSearchParams(location.hash.replace(/^#/, "")).get("invite") || "");
  const tokenKey = `score-dust-guest:${sessionId}`;
  const [token, setToken] = useState(() => store.get(tokenKey));
  const [name, setName] = useState(""), [session, setSession] = useState(null), [message, setMessage] = useState(""), [audioOn, setAudioOn] = useState(false);
  const clock = useRef(createRoomClock()), canvas = useRef(null), audio = useRef(null), latest = useRef(null);

  // Never keep the invite code in the address bar once the page has it.
  useEffect(() => { if (location.hash) history.replaceState(null, "", `${location.pathname}${location.search}`); }, []);

  const call = async (path, options = {}) => {
    const clientSendMs = Date.now();
    const response = await fetch(`${apiBase}/api/echos/score-dust/guest${path}`, { ...options, headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.headers || {}) } });
    const clientReceiveMs = Date.now(), body = await response.json().catch(() => ({}));
    if (body.clock) clock.current.add({ clientSendMs, clientReceiveMs, ...body.clock });
    if (!response.ok) throw Object.assign(new Error(body.message || `Request failed (${response.status})`), { status: response.status });
    return body;
  };

  const join = async (event) => {
    event.preventDefault();
    try {
      const body = await call("/join", { method: "POST", body: JSON.stringify({ sessionId, invite, name }) });
      store.set(tokenKey, body.guestToken); setToken(body.guestToken); setSession(body.session); setMessage("");
    } catch (error) { setMessage(error.message); }
  };

  // Poll the room once a second (state, reactions, control) and sample the clock.
  useEffect(() => {
    if (!token) return undefined;
    let stop = false;
    const tick = () => call("/session").then((body) => { if (!stop) { latest.current = body.session; setSession(body.session); } }).catch((error) => {
      if (error.status === 401) { store.drop(tokenKey); setToken(null); setSession(null); }
      setMessage(error.message);
    });
    tick();
    const timer = setInterval(tick, 1000);
    return () => { stop = true; clearInterval(timer); };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Render the host's exact score; time comes from the room clock.
  const playback = useMemo(() => {
    if (!session?.score || !session?.timeline) return null;
    try { return prepareEchoScorePlayback(session.score, session.timeline, { pulse: session.playSettings?.pulse }); } catch { return null; }
  }, [session?.scoreFingerprint, Boolean(session?.score)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!playback || !canvas.current) return undefined;
    const renderer = createEchoScoreDustAutoRenderer({ createCpu: createEchoScoreDustRenderer });
    const reduced = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    renderer.setPlayback(playback, normalizeDustPlaySettings({ ...(reduced ? { reducedMotion: true } : {}), ...(latest.current?.playSettings || {}) }, session.timeline), "guest");
    let frame = 0;
    const draw = () => {
      const c = canvas.current, ctx = c?.getContext("2d");
      if (ctx) {
        const width = c.clientWidth * (devicePixelRatio || 1), height = c.clientHeight * (devicePixelRatio || 1);
        if (c.width !== Math.round(width) || c.height !== Math.round(height)) { c.width = Math.round(width); c.height = Math.round(height); }
        const roomNow = clock.current.roomNowMs(Date.now()), s = latest.current;
        const t = s && roomNow !== null ? sessionPositionAt(s, roomNow) : 0;
        ctx.fillStyle = "#020409"; ctx.fillRect(0, 0, c.width, c.height);
        renderer.draw(ctx, { width: c.width, height: c.height, t: Math.max(0, Math.min(t, playback.score.durationSeconds - 0.01)), fft: null });
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(frame); renderer.dispose(); };
  }, [playback]); // eslint-disable-line react-hooks/exhaustive-deps

  // Optional audio on this device, kept within the drift tolerance.
  useEffect(() => {
    if (!audioOn || !audio.current) return undefined;
    const timer = setInterval(() => {
      const s = latest.current, roomNow = clock.current.roomNowMs(Date.now()), el = audio.current;
      if (!s || roomNow === null || !el) return;
      const decision = sharedPlayCorrection({ session: s, roomNowMs: roomNow, actualSeconds: el.currentTime, playing: !el.paused });
      if (decision.action === "seek" || decision.action === "play" || decision.action === "pause") el.currentTime = decision.to;
      if (decision.action === "play") el.play().catch(() => setMessage("Tap Play audio again; this browser blocked playback."));
      if (decision.action === "pause") el.pause();
    }, 1000);
    return () => clearInterval(timer);
  }, [audioOn]);

  const react = (kind) => call("/reactions", { method: "POST", body: JSON.stringify({ kind }) }).then((b) => setSession(b.session)).catch((error) => setMessage(error.message));
  const control = (patch) => call("/control", { method: "PUT", body: JSON.stringify({ baseRevision: latest.current?.revision, ...patch }) }).then((b) => { latest.current = b.session; setSession(b.session); }).catch((error) => setMessage(error.message));
  const position = () => { const roomNow = clock.current.roomNowMs(Date.now()); return latest.current && roomNow !== null ? sessionPositionAt(latest.current, roomNow) : 0; };

  if (!sessionId) return <main className="score-dust-guest"><p>This link has no session. Ask the host for a new invite.</p></main>;
  if (!token) {
    return (
      <main className="score-dust-guest" data-testid="score-dust-guest-signin">
        <h1>Score Dust · Listen together</h1>
        <form onSubmit={join}>
          <label>Your name <input aria-label="Your name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus /></label>
          <button type="submit" className="hapa-btn" disabled={!name.trim() || !invite}>Join</button>
        </form>
        {!invite && <p>This link has no invite code. Ask the host for a new link.</p>}
        {message && <p role="alert">{message}</p>}
      </main>
    );
  }
  const you = session?.you, recent = (session?.reactions || []).slice(-6);
  return (
    <main className="score-dust-guest is-live" data-testid="score-dust-guest-live">
      <canvas ref={canvas} className="score-dust-guest-canvas" aria-label="Score Dust visuals" />
      <header>
        <strong>{session?.title || "Score Dust"}</strong>
        <span data-testid="score-dust-guest-status">{session ? `${you?.name || "Guest"} · ${session.state}${you?.hasControl ? " · you have control" : ""}` : "Connecting…"}</span>
      </header>
      {!playback && session && <p className="score-dust-guest-note">Waiting for the host to share the score…</p>}
      <footer>
        <span className="score-dust-guest-reactions">{REACTIONS.map(([kind, label]) => <button key={kind} type="button" aria-label={`React ${kind}`} onClick={() => react(kind)}>{label}</button>)}</span>
        {session?.audioUri && <button type="button" className="hapa-btn" onClick={() => { setAudioOn(true); audio.current?.play().catch(() => {}); }}>{audioOn ? "Audio on" : "Play audio here"}</button>}
        {you?.hasControl && <>
          <button type="button" className="hapa-btn" data-testid="score-dust-guest-playpause" onClick={() => control({ state: session.state === "playing" ? "paused" : "playing", positionSeconds: position() })}>{session.state === "playing" ? "Pause" : "Play"}</button>
          <input type="range" min="0" max={Math.floor(session.durationSeconds || 0)} step="1" aria-label="Seek" onChange={(e) => control({ positionSeconds: Number(e.target.value) })} />
        </>}
        <span className="score-dust-guest-feed" data-testid="score-dust-guest-feed">{recent.map((r) => `${REACTIONS.find(([k]) => k === r.kind)?.[1] || r.kind} ${r.name}`).join("  ")}</span>
      </footer>
      {session?.audioUri && <audio ref={audio} src={`${apiBase}${session.audioUri}`} preload="none" />}
      {message && <p role="alert" className="score-dust-guest-note">{message}</p>}
    </main>
  );
}
