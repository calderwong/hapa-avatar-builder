import { useCallback, useEffect, useMemo, useState } from "react";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const STATUS_LABELS = {
  complete: "Complete",
  ready: "Ready",
  queued: "Queued",
  running: "Running",
  waiting: "Waiting",
  failed: "Needs attention",
};

function StageCard({ stage }) {
  const status = stage?.status || "waiting";
  return (
    <li className="echo-song-ingest-stage" data-status={status}>
      <span className="echo-song-ingest-stage-index">{String(stage.ordinal || 0).padStart(2, "0")}</span>
      <div>
        <div className="echo-song-ingest-stage-title">
          <strong>{stage.label}</strong>
          <span>{STATUS_LABELS[status] || status}</span>
        </div>
        <p>{stage.summary || stage.description}</p>
        {stage.summary && stage.description && <small>{stage.description}</small>}
        {stage.samples?.length > 0 && (
          <div className="echo-song-ingest-samples" aria-label={`${stage.label} samples`}>
            {stage.samples.slice(0, 4).map((sample) => <code key={sample}>{sample}</code>)}
          </div>
        )}
      </div>
    </li>
  );
}

export default function EchoSongIngestPipeline() {
  const [run, setRun] = useState(null);
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ sourceDir: "", songUrl: "", title: "", style: "", lyrics: "" });

  const request = useCallback(async (url, options) => {
    const response = await fetch(`${API_BASE}${url}`, { credentials: "same-origin", ...options });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || `Request failed (${response.status}).`);
    return payload;
  }, []);

  const refresh = useCallback(async () => {
    try {
      const payload = await request("/api/echos/song-ingest");
      setRun(payload.current || null);
      setRuns(payload.runs || []);
    } catch (error) {
      setNotice(`Song ingest status is unavailable: ${error.message || String(error)}`);
    }
  }, [request]);

  useEffect(() => { refresh(); }, [refresh]);

  const progress = useMemo(() => {
    const stages = run?.stages || [];
    if (!stages.length) return 0;
    const weights = { complete: 1, ready: 0.65, running: 0.5, queued: 0.35, waiting: 0, failed: 0 };
    return Math.round(stages.reduce((sum, stage) => sum + (weights[stage.status] || 0), 0) / stages.length * 100);
  }, [run]);

  const inspect = async () => {
    setBusy("inspect");
    setNotice("Inspecting local masters, lyrics, and stems…");
    try {
      const payload = await request("/api/echos/song-ingest/inspect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, styles: form.style.split(",").map((value) => value.trim()).filter(Boolean) }),
      });
      setRun(payload.run);
      setNotice(`${payload.run.song.title} passed source inspection. Review the stages before registration.`);
    } catch (error) { setNotice(`Inspection stopped: ${error.message || String(error)}`); }
    finally { setBusy(""); }
  };

  const register = async () => {
    if (!run?.runId) return;
    setBusy("register");
    setNotice("Copying source custody, extracting stems, and updating the album stores with backups…");
    try {
      const payload = await request("/api/echos/song-ingest/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: run.runId }),
      });
      setRun(payload.run);
      setNotice(`${payload.run.song.title} is registered. Card generation is the next ready stage.`);
    } catch (error) { setNotice(`Registration stopped: ${error.message || String(error)}`); }
    finally { setBusy(""); }
  };

  const selectRun = async (runId) => {
    setBusy("load");
    try {
      const payload = await request(`/api/echos/song-ingest?runId=${encodeURIComponent(runId)}`);
      setRun(payload.current || null);
    } catch (error) { setNotice(`Could not load that ingest run: ${error.message || String(error)}`); }
    finally { setBusy(""); }
  };

  return (
    <section className="hapa-panel echo-song-ingest" aria-labelledby="echo-song-ingest-title">
      <header className="echo-song-ingest-head">
        <div>
          <p className="eyebrow">Incremental album pipeline</p>
          <h3 id="echo-song-ingest-title">Add a song · catch it up to Echo</h3>
          <p>One durable run carries source custody, analysis, references, prompts, generated cards, local H3 loops, and Director readiness.</p>
        </div>
        <div className="echo-song-ingest-progress" aria-label={`${progress}% pipeline readiness`}>
          <strong>{progress}%</strong><span>ready</span>
        </div>
      </header>

      <details className="echo-song-ingest-form" open={!run}>
        <summary>New song source</summary>
        <div className="echo-song-ingest-fields">
          <label>Local folder<input value={form.sourceDir} onChange={(event) => setForm((current) => ({ ...current, sourceDir: event.target.value }))} placeholder="/absolute/path/with WAV, MP3, stems ZIP" /></label>
          <label>Suno song URL<input value={form.songUrl} onChange={(event) => setForm((current) => ({ ...current, songUrl: event.target.value }))} placeholder="https://suno.com/song/…" /></label>
          <label>Title<input value={form.title} onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))} placeholder="Read from MP3 when blank" /></label>
          <label>Styles<input value={form.style} onChange={(event) => setForm((current) => ({ ...current, style: event.target.value }))} placeholder="comma-separated; include BPM" /></label>
          <label className="echo-song-ingest-lyrics">Displayed lyrics<textarea value={form.lyrics} onChange={(event) => setForm((current) => ({ ...current, lyrics: event.target.value }))} placeholder="Optional when embedded in the MP3" rows={6} /></label>
        </div>
        <button className="hapa-btn" data-intent="primary" type="button" disabled={busy || !form.sourceDir} onClick={inspect}>{busy === "inspect" ? "Inspecting…" : "Inspect source folder"}</button>
      </details>

      {run && (
        <>
          <div className="echo-song-ingest-runbar">
            <div><small>Track {run.song?.trackNumber || "—"} · {run.source?.registryTrackId?.slice(0, 8) || "unresolved"}</small><h4>{run.song?.title || run.runId}</h4></div>
            <div className="echo-song-ingest-actions">
              <span data-state={run.state}>{run.state}</span>
              {!run.custody?.storeRegistered && <button className="hapa-btn" data-intent="success" type="button" disabled={busy} onClick={register}>{busy === "register" ? "Registering…" : "Register source + analysis"}</button>}
            </div>
          </div>
          <ol className="echo-song-ingest-stages">{(run.stages || []).map((stage) => <StageCard key={stage.id} stage={stage} />)}</ol>
        </>
      )}

      {runs.length > 1 && (
        <div className="echo-song-ingest-history"><span>Recent runs</span>{runs.slice(0, 6).map((item) => <button type="button" key={item.runId} disabled={busy} onClick={() => selectRun(item.runId)}>{item.title} · {item.state}</button>)}</div>
      )}
      {notice && <p className="echo-song-ingest-notice" role="status" aria-live="polite">{notice}</p>}
      <footer>Provisional lyric timing is usable for scripts but is never presented as forced alignment. Generated cards and loops remain review candidates until a human accepts them.</footer>
    </section>
  );
}
