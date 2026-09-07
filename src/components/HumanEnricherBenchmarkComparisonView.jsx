import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, FileVideo2, FlaskConical, ShieldCheck } from "lucide-react";

export default function HumanEnricherBenchmarkComparisonView({ apiBase = "" }) {
  const [comparison, setComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedOrdinal, setSelectedOrdinal] = useState(initialOrdinal);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(`${apiBase}/api/human-enricher/benchmark-comparison`, { headers: { accept: "application/json" } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || `Comparison failed to load (${response.status})`);
        if (!cancelled) setComparison(payload);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [apiBase]);

  const videos = comparison?.videos || [];
  const selectedIndex = useMemo(() => {
    const index = videos.findIndex((row) => row.ordinal === selectedOrdinal);
    return index >= 0 ? index : 0;
  }, [selectedOrdinal, videos]);
  const selected = videos[selectedIndex] || null;

  function selectOrdinal(nextOrdinal) {
    const ordinal = Math.max(1, Math.min(videos.length || 1, Number(nextOrdinal || 1)));
    setSelectedOrdinal(ordinal);
    const url = new URL(globalThis.location.href);
    url.searchParams.set("benchmarkVideo", String(ordinal));
    globalThis.history?.replaceState?.(null, "", url);
  }

  return (
    <section className="human-benchmark-compare-view">
      <header className="human-benchmark-compare-hero hapa-panel" data-variant="notch">
        <div>
          <p className="eyebrow"><FlaskConical size={14} /> READ-ONLY HUMAN ENRICHER COMPARISON</p>
          <h2>Production review vs. benchmark optical output</h2>
          <p>Compare the saved production review with the already-completed optical benchmark. Nothing on this page imports, approves, edits, or reruns a video.</p>
        </div>
        <a className="hapa-btn" href="?view=human-enricher&review=pending-human"><ArrowLeft size={14} /> Human Enricher</a>
      </header>

      {loading && <div className="human-enricher-loading hapa-panel"><Eye size={17} /> Loading accepted receipts…</div>}
      {error && <div className="human-enricher-error hapa-panel" role="alert">{error}</div>}

      {comparison && (
        <>
          <div className="human-benchmark-run-strip hapa-panel" aria-label="Benchmark run boundary">
            <span><strong>{comparison.run.id}</strong><small>{formatDate(comparison.run.startedAt)} · {comparison.run.accepted}/40 accepted</small></span>
            <i><ShieldCheck size={13} /> Benchmark pending human</i>
            <i><FileVideo2 size={13} /> {comparison.run.opticalFramesInspected} frames inspected</i>
            <i data-state="not-run">Reference pass not run</i>
            <i data-state="readonly">Production stores unchanged</i>
          </div>

          <div className="human-benchmark-navigation hapa-panel">
            <button type="button" className="hapa-btn" onClick={() => selectOrdinal(selectedIndex)} disabled={selectedIndex <= 0} aria-label="Previous benchmark video"><ChevronLeft size={15} /> Previous</button>
            <label>
              <span>Benchmark video</span>
              <select value={selected?.ordinal || 1} onChange={(event) => selectOrdinal(event.target.value)}>
                {videos.map((row) => <option key={row.ordinal} value={row.ordinal}>{row.ordinal}. {row.video.name}</option>)}
              </select>
            </label>
            <strong>{selectedIndex + 1} / {videos.length}</strong>
            <button type="button" className="hapa-btn" onClick={() => selectOrdinal(selectedIndex + 2)} disabled={selectedIndex >= videos.length - 1} aria-label="Next benchmark video">Next <ChevronRight size={15} /></button>
          </div>

          {selected && (
            <>
              <div className="human-benchmark-video-head hapa-panel">
                {selected.video.thumbnailUri ? <img src={mediaUri(selected.video.thumbnailUri, apiBase)} alt="" /> : <FileVideo2 size={28} />}
                <div>
                  <p className="eyebrow">VIDEO {selected.ordinal} OF {videos.length}</p>
                  <h3>{selected.video.name}</h3>
                  <span>{selected.video.ownerName} · {formatDuration(selected.video.duration)} · benchmark receipt accepted</span>
                </div>
              </div>

              <main className="human-benchmark-columns">
                <ReviewColumn title="Existing production review" subtitle={productionSubtitle(selected.existingProductionReview)} tone="production" review={selected.existingProductionReview} />
                <ReviewColumn title="Benchmark optical output" subtitle="Pending human · optical only · reference pass not run" tone="benchmark" review={selected.benchmarkOpticalOutput} />
              </main>
            </>
          )}
        </>
      )}
    </section>
  );
}

function ReviewColumn({ title, subtitle, tone, review }) {
  if (!review) return <article className="human-benchmark-review-column hapa-panel" data-tone={tone}><ColumnHead title={title} subtitle="No production review is available." /><p className="human-benchmark-empty">Nothing to compare.</p></article>;
  return (
    <article className="human-benchmark-review-column hapa-panel" data-tone={tone}>
      <ColumnHead title={title} subtitle={subtitle} />
      <div className="human-benchmark-quality"><strong>Q{review.quality?.value ?? "—"}</strong><span>{review.quality?.explanation || "No quality explanation recorded."}</span></div>
      <section><h4>Description</h4><p>{review.description || "No description recorded."}</p></section>
      {review.signalOutcome && <section><h4>Signal outcome</h4><p>{review.signalOutcome}</p></section>}
      <TextChips label="Visible signals" values={review.visibleSignals} />
      <TextChips label="Strengths" values={review.strengths} />
      <TextChips label="Issues" values={review.issues} />
      {review.uncertainty && <section><h4>Uncertainty</h4><p>{review.uncertainty}</p></section>}
      <section>
        <h4>First · Mid · Last evidence</h4>
        <div className="human-benchmark-frame-list">
          {(review.frames || []).map((frame, index) => <FrameEvidence key={`${frame.role}-${index}`} frame={frame} />)}
        </div>
      </section>
    </article>
  );
}

function ColumnHead({ title, subtitle }) {
  return <header className="human-benchmark-column-head"><div><p className="eyebrow">READ-ONLY SOURCE</p><h3>{title}</h3></div><span>{subtitle}</span></header>;
}

function FrameEvidence({ frame }) {
  return (
    <article className="human-benchmark-frame">
      <strong>{roleLabel(frame.role)}</strong>
      <p>{frame.observation || "No observation recorded."}</p>
      <div className="human-benchmark-palette">
        {(frame.palette?.colors || []).map((color, index) => (
          <span key={`${color.hex}-${index}`} title={color.explanation || color.label}>
            <i style={{ background: color.hex }} aria-hidden="true" />
            <code>{color.hex}</code>
            <small>{color.label}</small>
          </span>
        ))}
      </div>
      {frame.palette?.uncertainty && <small className="human-benchmark-palette-note">{frame.palette.uncertainty}</small>}
    </article>
  );
}

function TextChips({ label, values = [] }) {
  if (!values.length) return null;
  return <section><h4>{label}</h4><div className="human-benchmark-chips">{values.map((value) => <span key={value}>{value}</span>)}</div></section>;
}

function initialOrdinal() {
  try { return Math.max(1, Math.min(40, Number(new URLSearchParams(globalThis.location?.search || "").get("benchmarkVideo") || 1))); }
  catch { return 1; }
}
function productionSubtitle(review) {
  if (!review) return "No production review";
  return `${review.status || "unknown"}${review.campaignId ? ` · ${review.campaignId}` : ""}${review.submittedAt ? ` · ${formatDate(review.submittedAt)}` : ""}`;
}
function roleLabel(value) { const role = String(value || "").toLowerCase(); return role === "mid" || role === "middle" ? "Mid" : role === "last" ? "Last" : "First"; }
function mediaUri(uri, apiBase) { return uri ? `${apiBase}${uri.startsWith("/") ? "" : "/"}${uri}` : ""; }
function formatDate(value) { const date = new Date(value || ""); return Number.isNaN(date.getTime()) ? "time unavailable" : date.toLocaleString(); }
function formatDuration(value) { const seconds = Number(value || 0); return seconds > 0 ? `${seconds.toFixed(seconds < 10 ? 1 : 0)}s` : "duration unknown"; }
