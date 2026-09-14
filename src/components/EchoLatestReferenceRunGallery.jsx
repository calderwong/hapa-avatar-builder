import { useCallback, useEffect, useMemo, useState } from "react";
import { Images, RefreshCw, Search, X } from "lucide-react";
import { createPortal } from "react-dom";
import "../echo-latest-reference-run.css";
import EchoHoverLoopMedia from "./EchoHoverLoopMedia.jsx";

export default function EchoLatestReferenceRunGallery({ apiBase = "" }) {
  const [run, setRun] = useState(null);
  const [loopRun, setLoopRun] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [songId, setSongId] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [imageResponse, loopResponse] = await Promise.all([
        fetch(`${apiBase}/api/echos/reference-image-generation`, { cache: "no-store" }),
        fetch(`${apiBase}/api/echos/reference-loop-generation`, { cache: "no-store" }),
      ]);
      const payload = await imageResponse.json();
      if (!imageResponse.ok || payload.ok === false) throw new Error(payload.message || payload.error || `Latest image run failed to load (${imageResponse.status}).`);
      setRun(payload);
      setLoopRun(loopResponse.ok ? await loopResponse.json() : null);
    } catch (caught) {
      setError(caught?.message || String(caught));
    } finally {
      setLoading(false);
    }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => event.key === "Escape" && setOpen(false);
    globalThis.addEventListener?.("keydown", onKeyDown);
    return () => globalThis.removeEventListener?.("keydown", onKeyDown);
  }, [open]);

  const completed = useMemo(() => (run?.jobs || []).filter((job) => job.hasOutput), [run?.jobs]);
  const loopsBySourceJob = useMemo(() => new Map((loopRun?.jobs || []).filter((job) => job.hasOutput).map((job) => [job.sourceJobId, job])), [loopRun?.jobs]);
  const songs = useMemo(() => {
    const byId = new Map();
    for (const job of completed) if (!byId.has(job.songId)) byId.set(job.songId, { id: job.songId, title: job.songTitle, trackNumber: job.trackNumber });
    return [...byId.values()].sort((left, right) => Number(left.trackNumber || 0) - Number(right.trackNumber || 0));
  }, [completed]);
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return completed.filter((job) => songId === "all" || job.songId === songId).filter((job) => !needle || [job.songTitle, job.referenceTitle, job.referenceId].filter(Boolean).join(" ").toLowerCase().includes(needle));
  }, [completed, query, songId]);

  return <>
    <section className="echo-latest-run-ingress" aria-label="Latest GPT Image generation run">
      <div>
        <span><Images size={15} /> Latest GPT Image run</span>
        <strong>{loading ? "Loading…" : `${completed.length.toLocaleString()} generated images`}</strong>
        <small>{run?.model || "OpenAI image run"} · {run?.state || "not started"} · ${Number(run?.usage?.estimatedCostUsd || 0).toFixed(2)} · {loopRun?.counts?.completed || 0} FAL loops</small>
      </div>
      <button type="button" onClick={() => setOpen(true)} disabled={!completed.length}>Open latest run gallery</button>
      <button type="button" className="icon" onClick={() => void load()} disabled={loading} aria-label="Refresh latest GPT Image run"><RefreshCw size={14} /></button>
      {error && <em role="alert">{error}</em>}
    </section>

    {open && createPortal(<div className="echo-latest-run-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="echo-latest-run-gallery" role="dialog" aria-modal="true" aria-labelledby="echo-latest-run-title">
        <header>
          <div><small>Echo Album · most recent API generation</small><h2 id="echo-latest-run-title">Latest GPT Image Run</h2><p>{completed.length.toLocaleString()} completed · {run?.counts?.held?.toLocaleString() || 0} held · {run?.counts?.failed || 0} rejected · ${Number(run?.usage?.estimatedCostUsd || 0).toFixed(5)}</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close latest run gallery"><X size={19} /></button>
        </header>
        <div className="echo-latest-run-tools">
          <label><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search songs and references…" /></label>
          <select value={songId} onChange={(event) => setSongId(event.target.value)} aria-label="Filter latest run by song"><option value="all">All {songs.length} songs</option>{songs.map((song) => <option key={song.id} value={song.id}>{song.trackNumber}. {song.title}</option>)}</select>
          <strong>Showing {visible.length.toLocaleString()}</strong>
        </div>
        <main data-testid="echo-latest-reference-run-grid">
          {visible.map((job) => <article key={job.id}>
            <button type="button" onClick={() => window.open(`${apiBase}${job.outputHref}`, "_blank", "noopener,noreferrer")} aria-label={`Open large image for ${job.songTitle}`}>
              <EchoHoverLoopMedia
                imageUri={`${apiBase}${job.outputHref}`}
                loopUri={loopsBySourceJob.get(job.id)?.outputHref ? `${apiBase}${loopsBySourceJob.get(job.id).outputHref}` : ""}
                alt={`${job.songTitle} — ${job.referenceTitle}`}
                loopAriaLabel={`Play generated reference loop for ${job.songTitle}`}
              />
            </button>
            <span>#{job.trackNumber} · {job.referenceId || "lyric-only"}</span>
            <strong>{job.songTitle}</strong>
            <p>{job.referenceTitle}</p>
          </article>)}
        </main>
      </section>
    </div>, document.body)}
  </>;
}
