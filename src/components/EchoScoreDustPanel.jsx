import { useState } from "react";
import { DUST_FORMATION_FAMILIES } from "../domain/echo-dust-swarm.js";
import { ECHO_VISUAL_SCORE_EVENT_RESPONSES, ECHO_VISUAL_SCORE_PULSES } from "../domain/echo-visual-score.js";
import "./EchoScoreDustPanel.css";

const EVENT_KINDS = ["lift", "fall", "build", "break", "change"];
const EVENT_LABELS = { lift: "Energy lift", fall: "Energy fall", build: "Gradual build", break: "Quiet break", change: "Spectral change" };
const time = (seconds) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
const hsl = (c, alpha = 1) => `hsl(${c.h} ${Math.round(c.s * 100)}% ${Math.round(c.l * 100)}% / ${alpha})`;

function sourceSummary(dust) {
  if (dust.status === "loading") return "Loading the Song's Audio Atlas timeline…";
  if (dust.kind === "atlas") return `Audio Atlas run ${dust.runId} · ${dust.saved ? `saved direction r${dust.saved.revision}${dust.savedInvalid ? " is invalid and was skipped; using the default" : dust.saved.timelineFingerprint !== dust.timeline?.fingerprint ? " (saved for a different analysis; check motif groups)" : ""}` : "default direction"}${dust.dirty ? " · unsaved edits" : ""}`;
  if (dust.kind === "prepared") return "Prepared performance timing (no repeat or lift evidence). Analyze this Song in Audio Atlas with Detect beats for full structure.";
  return `Live reflex only. ${dust.message || "No song structure available."} Analyze this Song in Audio Atlas with Detect beats to direct it.`;
}

/** Score timeline: motif per section, lifts, phrases and the playhead. Click to seek. */
function ScoreStrip({ dust, currentTime, onSeek }) {
  const { score, timeline } = dust;
  if (!score) return null;
  const duration = score.durationSeconds || 1, x = (t) => (t / duration) * 1000;
  const motifs = new Map(score.motifs.map((m) => [m.id, m]));
  const seek = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    onSeek?.(Math.max(0, Math.min(duration, ((event.clientX - box.left) / box.width) * duration)));
  };
  return (
    <svg className="score-dust-strip" viewBox="0 0 1000 78" preserveAspectRatio="none" role="img" onClick={seek}
      aria-label={`Visual score: ${score.cues.length} cues, ${score.events.length} events, ${score.phrases.length} phrases. Click to seek.`}>
      {score.cues.map((cue) => {
        const motif = motifs.get(cue.motifId), palette = score.palettes[motif.paletteId];
        return (
          <g key={cue.id}>
            <title>{`${time(cue.start)}–${time(cue.end)} · ${motif.family} (${motif.repeatGroup}) · ${cue.reason}`}</title>
            <rect x={x(cue.start)} y={6} width={Math.max(1, x(cue.end) - x(cue.start) - 1)} height={40} fill={hsl(palette[0], 0.32 + 0.5 * cue.busy[1])} />
            <rect x={x(cue.start)} y={42} width={Math.max(1, x(cue.end) - x(cue.start) - 1)} height={4} fill={hsl(palette[1] || palette[0])} />
            {x(cue.end) - x(cue.start) > 60 && <text x={x(cue.start) + 5} y={22} className="score-dust-strip-label">{motif.family}</text>}
            {x(cue.end) - x(cue.start) > 60 && <text x={x(cue.start) + 5} y={36} className="score-dust-strip-sub">{motif.repeatGroup.replace("group-", "")}</text>}
          </g>
        );
      })}
      {(timeline?.downbeats || []).filter((_, i) => i % 4 === 0).map((t) => <line key={`d${t}`} x1={x(t)} x2={x(t)} y1={46} y2={50} className="score-dust-strip-bar" />)}
      {score.events.map((event) => (
        <g key={event.id}>
          <title>{`${EVENT_LABELS[event.kind] || event.kind} at ${time(event.at)} → ${event.response}`}</title>
          <path d={`M${x(event.at)} 4 l5 -4 h-10 z`} className={`score-dust-strip-event is-${event.response}`} transform={`translate(0 ${event.kind === "lift" ? 6 : 2})`} />
          <line x1={x(event.at)} x2={x(event.at)} y1={6} y2={46} className={`score-dust-strip-event-line is-${event.response}`} />
        </g>
      ))}
      {score.phrases.map((phrase) => (
        <g key={phrase.id}>
          <title>{`“${phrase.text}” ${time(phrase.start)}–${time(phrase.end)}${phrase.burst ? " · burst" : ""}`}</title>
          <rect x={x(phrase.start)} y={56} width={Math.max(2, x(phrase.end) - x(phrase.start))} height={10} className={phrase.burst ? "score-dust-strip-phrase is-burst" : "score-dust-strip-phrase"} />
        </g>
      ))}
      <line x1={x(currentTime)} x2={x(currentTime)} y1={0} y2={78} className="score-dust-strip-playhead" />
    </svg>
  );
}

export default function EchoScoreDustPanel({ dust, currentTime = 0, onSeek }) {
  const [note, setNote] = useState("");
  if (!dust?.enabled) return null;
  const { score, validation, settings, direction } = dust;
  const groups = score ? score.motifs.map((motif) => ({ motif, returns: score.cues.filter((c) => c.motifId === motif.id).length, palette: score.palettes[motif.paletteId] })) : [];
  const update = (patch) => dust.setDraft((current) => ({ ...current, ...patch(current) }));
  const lyricStatus = score?.phraseSource?.kind === "lyrics" ? score.phraseSource : null;
  return (
    <section className="score-dust-panel" data-testid="echo-score-dust-panel" aria-label="Score Dust direction">
      <header>
        <strong>Score Dust</strong>
        <span className={`score-dust-source is-${dust.kind}`}>{sourceSummary(dust)}</span>
      </header>
      <ScoreStrip dust={dust} currentTime={currentTime} onSeek={onSeek} />
      {validation && !validation.ok && (
        <ul className="score-dust-errors" role="alert">{validation.errors.map((e, i) => <li key={i}><code>{e.code}</code> {e.message}</li>)}</ul>
      )}
      {validation?.warnings?.length > 0 && (
        <details className="score-dust-warnings"><summary>{validation.warnings.length} note{validation.warnings.length === 1 ? "" : "s"}</summary>
          <ul>{validation.warnings.map((w, i) => <li key={i}>{w.message}</li>)}</ul></details>
      )}
      {score && (
        <div className="score-dust-controls">
          <fieldset>
            <legend>Motifs <span>one shape and palette per repeating section</span></legend>
            {groups.map(({ motif, returns, palette }) => (
              <label key={motif.id} className="score-dust-motif" title={motif.reason}>
                <span className="score-dust-swatches">{palette.map((c, i) => <i key={i} style={{ background: hsl(c) }} />)}</span>
                <span>{motif.repeatGroup.replace("group-", "Group ")} · {returns}×</span>
                <select aria-label={`Formation for ${motif.repeatGroup}`} value={direction.families?.[motif.repeatGroup] || ""}
                  onChange={(event) => update((current) => {
                    const families = { ...(current.families || {}) };
                    if (event.target.value) families[motif.repeatGroup] = event.target.value; else delete families[motif.repeatGroup];
                    return { families };
                  })}>
                  <option value="">Auto ({motif.family})</option>
                  {DUST_FORMATION_FAMILIES.map((family) => <option key={family} value={family}>{family}</option>)}
                </select>
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Look and timing</legend>
            <label>Base hue <input type="range" min="0" max="359" step="1" aria-label="Base hue"
              value={Number.isFinite(direction.baseHue) ? direction.baseHue : Math.round(groups[0]?.palette[0]?.h ?? 180)}
              onChange={(event) => update(() => ({ baseHue: Number(event.target.value) }))} /></label>
            <label>Pulse <select aria-label="Beat pulse" value={settings?.pulse || "normal"}
              onChange={(event) => update((current) => ({ playSettings: { ...(current.playSettings || {}), pulse: event.target.value } }))}>
              {ECHO_VISUAL_SCORE_PULSES.map((pulse) => <option key={pulse} value={pulse}>{pulse}{dust.timeline?.tempo?.alternativesBpm ? ` · ${dust.timeline.tempo.alternativesBpm[pulse].toFixed(1)} BPM` : ""}</option>)}
            </select></label>
            {dust.timeline?.tempo?.ambiguous && <span className="score-dust-hint">Tempo is ambiguous; half time may feel truer.</span>}
            <label>Seed <input type="number" min="0" step="1" aria-label="Performance seed" value={settings?.seed ?? 0}
              onChange={(event) => update((current) => ({ playSettings: { ...(current.playSettings || {}), seed: Math.max(0, Math.floor(Number(event.target.value) || 0)) } }))} /></label>
            <button type="button" className="hapa-btn" onClick={() => update((current) => ({ playSettings: { ...(current.playSettings || {}), seed: Math.floor(Math.random() * 2 ** 31) } }))}>Vary</button>
          </fieldset>
          <fieldset>
            <legend>Moments</legend>
            {EVENT_KINDS.filter((kind) => score.events.some((e) => e.kind === kind)).map((kind) => (
              <label key={kind}>{EVENT_LABELS[kind]} ({score.events.filter((e) => e.kind === kind).length})
                <select aria-label={`Response to ${EVENT_LABELS[kind]}`} value={direction.eventResponses?.[kind] || ""}
                  onChange={(event) => update((current) => {
                    const eventResponses = { ...(current.eventResponses || {}) };
                    if (event.target.value) eventResponses[kind] = event.target.value; else delete eventResponses[kind];
                    return { eventResponses };
                  })}>
                  <option value="">Auto ({score.events.find((e) => e.kind === kind)?.response})</option>
                  {ECHO_VISUAL_SCORE_EVENT_RESPONSES.map((response) => <option key={response} value={response}>{response}</option>)}
                </select></label>
            ))}
            {!score.events.length && <span className="score-dust-hint">No lifts or breaks in the evidence.</span>}
            <label><input type="checkbox" checked={direction.lyricPhrases !== "off"} disabled={Boolean(direction.phrases)}
              onChange={(event) => update(() => ({ lyricPhrases: event.target.checked ? "auto" : "off" }))} /> Lyric hooks in dust</label>
            <span className="score-dust-hint">
              {direction.phrases ? `${score.phrases.length} phrases set by direction.`
                : lyricStatus ? `${lyricStatus.status === "audio-mismatch" ? "Lyric timing belongs to different audio; no words shown." : `${score.phrases.length} hook${score.phrases.length === 1 ? "" : "s"} from measured lyrics.`}`
                  : direction.lyricPhrases === "off" ? "Words off." : "No timed lyrics for this Song."}
            </span>
            {score.phrases.length > 0 && <ul className="score-dust-phrases">{score.phrases.map((p) => <li key={p.id}><button type="button" onClick={() => onSeek?.(p.start)}>{time(p.start)}</button> “{p.text}”{p.burst ? " · burst" : ""}</li>)}</ul>}
          </fieldset>
        </div>
      )}
      <footer>
        {dust.kind === "atlas" ? (
          <>
            <input type="text" aria-label="Direction note" placeholder="What changed and why" value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} />
            <button type="button" className="hapa-btn" disabled={!dust.dirty || !validation?.ok || dust.saveState.state === "saving"} onClick={() => dust.save(note).then(() => setNote(""))}>
              {dust.saveState.state === "saving" ? "Saving…" : `Save direction r${(dust.saved?.revision || 0) + 1}`}
            </button>
            <button type="button" className="hapa-btn" disabled={!dust.dirty} onClick={dust.discard}>Discard edits</button>
          </>
        ) : <span className="score-dust-hint">Edits preview locally; saving needs an Audio Atlas run.</span>}
        {dust.saveState.message && <span role={dust.saveState.state === "error" ? "alert" : "status"}>{dust.saveState.message}</span>}
        {dust.ledger.length > 0 && <span className="score-dust-hint">{dust.ledger.length} saved revision{dust.ledger.length === 1 ? "" : "s"}; earlier ones are kept.</span>}
      </footer>
    </section>
  );
}
