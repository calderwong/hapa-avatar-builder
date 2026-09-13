import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, CirclePause, Expand, Image as ImageIcon, Layers3, LoaderCircle, MessageSquareText, Play, RefreshCw, Search, ShieldCheck, Sparkles, X } from "lucide-react";

const ALBUM_PAGE_SIZE = 24;

function AssetImage({ kind, id, alt, className = "" }) {
  const [src, setSrc] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setSrc("");
    setError("");
    const bridge = globalThis.hapaEchoTarotImages;
    if (!bridge?.asset || !id) return () => { active = false; };
    bridge.asset({ kind, id }).then((result) => {
      if (!active) return;
      if (!result?.ok || !result.dataUrl) throw new Error(result?.message || "Image unavailable.");
      setSrc(result.dataUrl);
    }).catch((assetError) => {
      if (active) setError(assetError?.message || String(assetError));
    });
    return () => { active = false; };
  }, [id, kind]);

  if (src) return <img className={className} src={src} alt={alt} loading="lazy" />;
  return <div className="echo-tarot-asset-placeholder">{error ? "Unavailable" : <LoaderCircle size={18} className="spin" />}</div>;
}

function RunAction({ busy, disabled = false, icon, children, ...props }) {
  return <button type="button" disabled={busy || disabled} {...props}>{busy ? <LoaderCircle size={13} className="spin" /> : icon}{children}</button>;
}

function ReviewActions({ job, busyAction, onReview }) {
  return <div className="echo-tarot-feedback-actions">
    <button type="button" disabled={busyAction.startsWith(`review:${job.id}:`)} className={job.feedback?.decision === "approved" ? "active" : ""} onClick={() => void onReview(job, "approved")}><Check size={12} /> Approve</button>
    <button type="button" disabled={busyAction.startsWith(`review:${job.id}:`)} className={job.feedback?.decision === "revise" ? "active" : ""} onClick={() => void onReview(job, "revise")}><MessageSquareText size={12} /> Revise</button>
    <button type="button" disabled={busyAction.startsWith(`review:${job.id}:`)} className={job.feedback?.decision === "rejected" ? "active" : ""} onClick={() => void onReview(job, "rejected")}><X size={12} /> Reject</button>
  </div>;
}

function GeneratedCardTile({ job, compact, note, busyAction, onNoteChange, onOpen, onReview }) {
  const imageAlt = `${job.cardTitle} for ${job.songTitle}, featuring Hapa Main Woman`;
  return <article className="hapa-card echo-tarot-output-card" data-card-type="media" data-granularity="standard" data-state={job.feedback?.decision || "generated"}>
    <button type="button" className="echo-tarot-card-preview-trigger" onClick={() => onOpen(job.id)} aria-label={`Open large preview of ${job.cardTitle} for ${job.songTitle}`}>
      <AssetImage kind="output" id={job.id} alt={imageAlt} />
      <span><Expand size={14} /> Large preview</span>
    </button>
    <div className="echo-tarot-output-card-meta">
      <strong>{job.cardTitle}</strong>
      <small>{job.trackNumber ? `Track ${job.trackNumber} · ` : ""}{job.songTitle}</small>
      <small>{job.status}{job.usage ? ` · $${Number(job.usage.estimatedCostUsd || 0).toFixed(3)} estimated` : ""}</small>
      {compact && job.feedback?.decision && <span className="echo-tarot-review-badge"><Check size={10} /> {job.feedback.decision}</span>}
    </div>
    {!compact && <>
      <textarea rows="2" value={note} onChange={(event) => onNoteChange(job.id, event.target.value)} placeholder="Character consistency, Tarot symbols, song meaning, composition…" aria-label={`Review notes for ${job.cardTitle} and ${job.songTitle}`} />
      <ReviewActions job={job} busyAction={busyAction} onReview={onReview} />
    </>}
  </article>;
}

function TarotCardPreview({ job, jobs, notes, busyAction, model, quality, size, onClose, onSelect, onNoteChange, onReview }) {
  const dialogRef = useRef(null);
  const index = jobs.findIndex((candidate) => candidate.id === job.id);
  const hasPrevious = index > 0;
  const hasNext = index >= 0 && index < jobs.length - 1;
  const titleId = `echo-tarot-preview-title-${job.id.replace(/[^a-z0-9_-]/gi, "-")}`;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return <dialog ref={dialogRef} className="hapa-modal echo-tarot-preview-modal" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === dialogRef.current) onClose(); }}>
    <header className="hm-head">
      <div><small>Echo Album Tarot · Hapa Main Woman</small><h3 id={titleId}>{job.cardTitle}</h3></div>
      <span className="echo-tarot-preview-position">{index + 1} / {jobs.length}</span>
      <button type="button" className="hm-close" onClick={onClose} aria-label="Close large Tarot card preview"><X size={18} /></button>
    </header>
    <div className="hm-body echo-tarot-preview-body">
      <div className="echo-tarot-preview-stage">
        <AssetImage kind="output" id={job.id} alt={`${job.cardTitle} for ${job.songTitle}, featuring Hapa Main Woman`} />
        <div className="echo-tarot-preview-navigation" aria-label="Tarot card preview navigation">
          <button type="button" disabled={!hasPrevious} onClick={() => onSelect(jobs[index - 1].id)}><ChevronLeft size={16} /> Previous</button>
          <button type="button" disabled={!hasNext} onClick={() => onSelect(jobs[index + 1].id)}>Next <ChevronRight size={16} /></button>
        </div>
      </div>
      <aside className="echo-tarot-preview-dossier">
        <p className="echo-tarot-preview-kicker">Card × Song dossier</p>
        <h4>{job.songTitle}</h4>
        <div className="echo-tarot-preview-readouts">
          <span><small>Track</small><b>{job.trackNumber || "—"}</b></span>
          <span><small>Status</small><b>{job.status}</b></span>
          <span><small>Review</small><b>{job.feedback?.decision || "pending"}</b></span>
          <span><small>Attempts</small><b>{job.attemptCount || 1}</b></span>
        </div>
        <dl>
          <div><dt>Model</dt><dd>{model || "OpenAI GPT Image"}</dd></div>
          <div><dt>Render</dt><dd>{quality || "—"} · {size || "—"}</dd></div>
          {job.usage && <>
            <div><dt>Estimated cost</dt><dd>${Number(job.usage.estimatedCostUsd || 0).toFixed(3)}</dd></div>
            <div><dt>Output tokens</dt><dd>{Number(job.usage.imageOutputTokens || 0).toLocaleString()}</dd></div>
          </>}
        </dl>
        <label htmlFor={`echo-tarot-preview-note-${job.id}`}>Human review notes</label>
        <textarea id={`echo-tarot-preview-note-${job.id}`} rows="6" value={notes[job.id] ?? job.feedback?.note ?? ""} onChange={(event) => onNoteChange(job.id, event.target.value)} placeholder="Character consistency, Tarot symbols, song meaning, composition…" />
        <ReviewActions job={job} busyAction={busyAction} onReview={onReview} />
      </aside>
    </div>
  </dialog>;
}

export default function EchoTarotGenerationMonitor({ songId = "", onNotice = () => {} }) {
  const bridge = globalThis.hapaEchoTarotImages;
  const [status, setStatus] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState({});
  const [viewMode, setViewMode] = useState(songId ? "song" : "album");
  const [albumQuery, setAlbumQuery] = useState("");
  const [albumLimit, setAlbumLimit] = useState(ALBUM_PAGE_SIZE);
  const [previewJobId, setPreviewJobId] = useState("");

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!bridge?.status) return;
    if (!quiet) setError("");
    try {
      const next = await bridge.status();
      if (!next?.ok) throw new Error(next?.message || "Tarot image run status is unavailable.");
      setStatus(next);
    } catch (refreshError) {
      if (!quiet) setError(refreshError?.message || String(refreshError));
    }
  }, [bridge]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (!bridge?.status) return undefined;
    const interval = window.setInterval(() => { void refresh({ quiet: true }); }, status?.state === "running" || status?.state === "queued" ? 3500 : 12000);
    return () => window.clearInterval(interval);
  }, [bridge, refresh, status?.state]);

  useEffect(() => {
    setViewMode(songId ? "song" : "album");
    setAlbumQuery("");
    setAlbumLimit(ALBUM_PAGE_SIZE);
    setPreviewJobId("");
  }, [songId]);

  const currentJobs = useMemo(
    () => (status?.jobs || []).filter((job) => !songId || job.songId === songId),
    [songId, status?.jobs]
  );
  const allOutputs = useMemo(
    () => (status?.jobs || []).filter((job) => job.hasOutput).sort((left, right) => Number(left.trackNumber || 0) - Number(right.trackNumber || 0) || left.cardTitle.localeCompare(right.cardTitle)),
    [status?.jobs]
  );
  const currentOutputs = useMemo(() => currentJobs.filter((job) => job.hasOutput), [currentJobs]);
  const filteredAlbumOutputs = useMemo(() => {
    const query = albumQuery.trim().toLocaleLowerCase();
    if (!query) return allOutputs;
    return allOutputs.filter((job) => [job.cardTitle, job.songTitle, job.feedback?.decision, job.status].some((value) => String(value || "").toLocaleLowerCase().includes(query)));
  }, [albumQuery, allOutputs]);
  const displayedOutputs = viewMode === "album" ? filteredAlbumOutputs.slice(0, albumLimit) : currentOutputs;
  const previewJobs = viewMode === "album" ? filteredAlbumOutputs : currentOutputs;
  const previewJob = allOutputs.find((job) => job.id === previewJobId) || null;
  const currentFailures = currentJobs.filter((job) => job.status === "failed");
  const remaining = Number(status?.counts?.queued || 0) + Number(status?.counts?.held || 0) + Number(status?.counts?.failed || 0);
  const running = status?.state === "running" || status?.state === "queued";

  async function runAction(name, operation, notice) {
    setBusyAction(name);
    setError("");
    try {
      const result = await operation();
      if (!result?.ok) throw new Error(result?.message || "The Tarot image action failed.");
      setStatus(result);
      if (notice) onNotice(notice);
    } catch (actionError) {
      setError(actionError?.message || String(actionError));
    } finally {
      setBusyAction("");
    }
  }

  async function submitReview(job, decision) {
    await runAction(`review:${job.id}:${decision}`, async () => {
      const result = await bridge.review({ jobId: job.id, decision, note: notes[job.id] ?? job.feedback?.note ?? "", reviewer: "Hapa operator" });
      if (!result?.ok) return result;
      return bridge.status();
    }, `${job.cardTitle} marked ${decision}.`);
  }

  function updateNote(jobId, value) {
    setNotes((current) => ({ ...current, [jobId]: value }));
  }

  function selectView(nextView) {
    setViewMode(nextView);
    setAlbumLimit(ALBUM_PAGE_SIZE);
    setPreviewJobId("");
  }

  if (!bridge) {
    return <aside className="echo-tarot-generation-monitor is-unavailable"><ShieldCheck size={15} /><p>Open the canonical Electron app to use encrypted local API keys and monitor generated Tarot images.</p></aside>;
  }

  return (
    <aside className="echo-tarot-generation-monitor" aria-label="Hapa Main Woman Tarot image generation monitor">
      <header>
        <div><Sparkles size={16} /><span><small>OpenAI · encrypted local key</small><strong>Hapa Main Woman deck run</strong></span></div>
        <button type="button" className="echo-tarot-icon-button" onClick={() => void refresh()} aria-label="Refresh generation status"><RefreshCw size={13} /></button>
      </header>
      <p className="echo-tarot-generation-boundary">The full six-image identity pack stays visible in local app data. Each Card × Song request currently submits the canonical face identity / feature map as one high-fidelity API reference; this avoids the snapshot’s multi-sheet rejection and body-reference moderation boundary. The saved key never enters the page, manifest, logs, or repository.</p>
      {error && <p className="echo-ref-feedback error" role="alert">{error}</p>}
      {status && <>
        <div className="echo-tarot-run-stats">
          <span><b>{status.counts?.completed || 0}</b> complete</span>
          <span><b>{status.counts?.running || 0}</b> running</span>
          <span><b>{remaining}</b> remaining</span>
          <span><b>${Number(status.usage?.estimatedCostUsd || 0).toFixed(2)}</b> observed estimate</span>
          <span><b>{status.model}</b> {status.quality} · {status.size}</span>
        </div>
        <div className="echo-tarot-run-actions">
          {status.state === "not-started" && <RunAction busy={busyAction === "pilot"} icon={<Play size={13} />} disabled={!status.credentialConfigured || !status.referencePackAvailable} onClick={() => void runAction("pilot", () => bridge.startPilot(), "Four-card quality pilot started.")}>Generate 4-card quality pilot</RunAction>}
          {status.state === "pilot-complete" && <RunAction busy={busyAction === "full"} icon={<Play size={13} />} onClick={() => void runAction("full", () => bridge.continueFull(), `Full ${status.counts?.total || 167}-pairing Hapa Main Woman queue started.`)}>Continue all {status.counts?.total || 167} pairings</RunAction>}
          {running && <RunAction busy={busyAction === "pause"} icon={<CirclePause size={13} />} onClick={() => void runAction("pause", () => bridge.pause(), "The queue will pause after the current image.")}>Pause after current</RunAction>}
          {status.state === "paused" && <RunAction busy={busyAction === "resume"} icon={<Play size={13} />} onClick={() => void runAction("resume", () => bridge.resume(), "Tarot image queue resumed.")}>Resume queue</RunAction>}
          {["blocked", "pilot-complete-with-errors", "complete-with-errors"].includes(status.state) && <RunAction busy={busyAction === "retry"} icon={<RefreshCw size={13} />} onClick={() => void runAction("retry", () => bridge.resume(), "Failed Tarot images re-queued.")}>{status.state === "blocked" ? "Recheck model access" : "Retry failed"}</RunAction>}
          {status.state === "complete" && <span className="echo-tarot-run-complete"><Check size={13} /> Full local run complete</span>}
        </div>
        {!status.credentialConfigured && <p className="echo-ref-warning">OpenAI is not configured. Add its key through the app’s Provider API keys panel.</p>}
        {!status.referencePackAvailable && <p className="echo-ref-warning">Expected local reference folder: raw-models/hapa-main-woman-reference-pack.</p>}
        {status.blocker && <div className="echo-tarot-run-blocker" role="alert"><ShieldCheck size={14} /><span><strong>Generation blocked before the full-deck spend</strong><p>{status.blocker.message}</p></span></div>}
        {!!currentFailures.length && <details className="echo-tarot-run-failures"><summary>{currentFailures.length} failed pilot request{currentFailures.length === 1 ? "" : "s"}</summary>{currentFailures.map((job) => <p key={job.id}><b>{job.cardTitle}</b> × {job.songTitle}: {job.error}</p>)}</details>}
        {!!status.references?.length && <details className="echo-tarot-reference-pack">
          <summary><ImageIcon size={13} /> Identity reference pack <span>{status.references.length} images</span></summary>
          <div className="echo-tarot-reference-grid">
            {status.references.map((reference) => <figure key={reference.id}><AssetImage kind="reference" id={reference.id} alt={reference.role} /><figcaption><b>{reference.role}</b><small>{reference.submittedToApi ? "Sent to GPT Image · " : "Local review only · "}{reference.filename}</small></figcaption></figure>)}
          </div>
        </details>}
        {!!allOutputs.length && <section className="echo-tarot-song-outputs hapa-panel" data-variant="notch">
          <div className="echo-tarot-output-heading">
            <div><small>Generated image library</small><h6>{viewMode === "album" ? "All Tarot cards for the album" : "Generated cards for this song"} <span>{viewMode === "album" ? filteredAlbumOutputs.length : currentOutputs.length}</span></h6></div>
            <div className="echo-tarot-output-tabs hapa-tabs" role="tablist" aria-label="Generated Tarot card view">
              <button type="button" role="tab" aria-selected={viewMode === "song"} className={viewMode === "song" ? "active" : ""} onClick={() => selectView("song")}>This song <span>{currentOutputs.length}</span></button>
              <button type="button" role="tab" aria-selected={viewMode === "album"} className={viewMode === "album" ? "active" : ""} onClick={() => selectView("album")}><Layers3 size={13} /> Full album <span>{allOutputs.length}</span></button>
            </div>
          </div>
          {viewMode === "album" && <div className="echo-tarot-album-toolbar">
            <label><Search size={14} /><input className="hapa-input" type="search" aria-label="Search album Tarot cards" value={albumQuery} onChange={(event) => { setAlbumQuery(event.target.value); setAlbumLimit(ALBUM_PAGE_SIZE); }} placeholder="Search card, song, or review status…" /></label>
            <small>Showing {Math.min(displayedOutputs.length, filteredAlbumOutputs.length)} of {filteredAlbumOutputs.length}</small>
          </div>}
          {!!displayedOutputs.length && <div className={`echo-tarot-output-grid${viewMode === "album" ? " is-album" : ""}`}>
            {displayedOutputs.map((job) => <GeneratedCardTile key={job.id} job={job} compact={viewMode === "album"} note={notes[job.id] ?? job.feedback?.note ?? ""} busyAction={busyAction} onNoteChange={updateNote} onOpen={setPreviewJobId} onReview={submitReview} />)}
          </div>}
          {viewMode === "album" && !displayedOutputs.length && <div className="echo-tarot-album-empty"><Search size={18} /><p>No generated Tarot cards match “{albumQuery}”.</p></div>}
          {viewMode === "album" && displayedOutputs.length < filteredAlbumOutputs.length && <button type="button" className="echo-tarot-load-more hapa-btn" onClick={() => setAlbumLimit((current) => current + ALBUM_PAGE_SIZE)}>Show next {Math.min(ALBUM_PAGE_SIZE, filteredAlbumOutputs.length - displayedOutputs.length)} cards</button>}
        </section>}
        {!currentOutputs.length && status.state !== "not-started" && viewMode === "song" && <p className="echo-ref-empty">No completed image for this song yet. Open <b>Full album</b> to review every generated Tarot card.</p>}
        {previewJob && <TarotCardPreview job={previewJob} jobs={previewJobs} notes={notes} busyAction={busyAction} model={status.modelSnapshot || status.model} quality={status.quality} size={status.size} onClose={() => setPreviewJobId("")} onSelect={setPreviewJobId} onNoteChange={updateNote} onReview={submitReview} />}
      </>}
    </aside>
  );
}
