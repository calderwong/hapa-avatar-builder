import { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CirclePause, Image as ImageIcon, LoaderCircle, MessageSquareText, Play, RefreshCw, ShieldCheck, Sparkles, X } from "lucide-react";

function AssetImage({ kind, id, alt }) {
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

  if (src) return <img src={src} alt={alt} loading="lazy" />;
  return <div className="echo-tarot-asset-placeholder">{error ? "Unavailable" : <LoaderCircle size={18} className="spin" />}</div>;
}

function RunAction({ busy, disabled = false, icon, children, ...props }) {
  return <button type="button" disabled={busy || disabled} {...props}>{busy ? <LoaderCircle size={13} className="spin" /> : icon}{children}</button>;
}

export default function EchoTarotGenerationMonitor({ songId = "", onNotice = () => {} }) {
  const bridge = globalThis.hapaEchoTarotImages;
  const [status, setStatus] = useState(null);
  const [busyAction, setBusyAction] = useState("");
  const [error, setError] = useState("");
  const [notes, setNotes] = useState({});

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

  const currentJobs = useMemo(
    () => (status?.jobs || []).filter((job) => !songId || job.songId === songId),
    [songId, status?.jobs]
  );
  const currentOutputs = currentJobs.filter((job) => job.hasOutput);
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
      const result = await bridge.review({ jobId: job.id, decision, note: notes[job.id] || "", reviewer: "Hapa operator" });
      if (!result?.ok) return result;
      return bridge.status();
    }, `${job.cardTitle} marked ${decision}.`);
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
        {!!currentOutputs.length && <section className="echo-tarot-song-outputs">
          <h6>Generated cards for this song <span>{currentOutputs.length}</span></h6>
          <div className="echo-tarot-output-grid">
            {currentOutputs.map((job) => <article key={job.id}>
              <AssetImage kind="output" id={job.id} alt={`${job.cardTitle} for ${job.songTitle}, featuring Hapa Main Woman`} />
              <div><strong>{job.cardTitle}</strong><small>{job.songTitle} · {job.status}</small>{job.usage && <small>${Number(job.usage.estimatedCostUsd || 0).toFixed(3)} estimated · {job.usage.imageOutputTokens || 0} output tokens</small>}</div>
              <textarea rows="2" value={notes[job.id] || job.feedback?.note || ""} onChange={(event) => setNotes((current) => ({ ...current, [job.id]: event.target.value }))} placeholder="Character consistency, Tarot symbols, song meaning, composition…" />
              <div className="echo-tarot-feedback-actions">
                <button type="button" className={job.feedback?.decision === "approved" ? "active" : ""} onClick={() => void submitReview(job, "approved")}><Check size={12} /> Approve</button>
                <button type="button" className={job.feedback?.decision === "revise" ? "active" : ""} onClick={() => void submitReview(job, "revise")}><MessageSquareText size={12} /> Revise</button>
                <button type="button" className={job.feedback?.decision === "rejected" ? "active" : ""} onClick={() => void submitReview(job, "rejected")}><X size={12} /> Reject</button>
              </div>
            </article>)}
          </div>
        </section>}
        {!currentOutputs.length && status.state !== "not-started" && <p className="echo-ref-empty">No completed image for this song yet. The global queue continues across the album.</p>}
      </>}
    </aside>
  );
}
