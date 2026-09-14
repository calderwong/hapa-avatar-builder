import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CirclePlay, Images, Maximize2, RefreshCw, Search, ShieldCheck, X } from "lucide-react";
import EchoHoverLoopMedia from "./EchoHoverLoopMedia.jsx";
import "../echo-reference-media-library.css";

const MEDIA_PAGE_SIZE = 60;

function sourceLabel(source = {}) {
  if (source.kind === "catalog") return source.cohort === "explicit-codex-gpt-image" ? "Codex GPT Image catalog" : "Earlier GPT Image catalog";
  return source.generator || "Generated image run";
}

function songLabel(item = {}) {
  if (!item.songs?.length) return "Album-wide reference";
  if (item.songs.length === 1) return item.songs[0].title;
  return `${item.songs[0].title} +${item.songs.length - 1}`;
}

function dateLabel(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toLocaleString() : "date unavailable";
}

export default function EchoReferenceMediaLibrary({ apiBase = "", onOpenCard = () => {} }) {
  const [library, setLibrary] = useState(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const [query, setQuery] = useState("");
  const [songId, setSongId] = useState("all");
  const [runId, setRunId] = useState("all");
  const [motion, setMotion] = useState("all");
  const [sort, setSort] = useState("newest");
  const [selectedId, setSelectedId] = useState("");
  const [visibleCount, setVisibleCount] = useState(MEDIA_PAGE_SIZE);
  const etagRef = useRef("");
  const inFlightRef = useRef(false);
  const gridRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const response = await fetch(`${apiBase}/api/echos/references/media-library`, {
        cache: "no-store",
        headers: etagRef.current ? { "If-None-Match": etagRef.current } : {},
      });
      if (response.status !== 304) {
        const payload = await response.json();
        if (!response.ok || payload.ok === false) throw new Error(payload.message || payload.error || `Reference media library failed to load (${response.status}).`);
        etagRef.current = response.headers.get("etag") || "";
        setLibrary(payload);
      }
      setLastCheckedAt(new Date().toISOString());
      setError("");
    } catch (caught) {
      setError(caught?.message || String(caught));
    } finally {
      inFlightRef.current = false;
      setLoading(false);
      setRefreshing(false);
    }
  }, [apiBase]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const timer = globalThis.setInterval?.(() => void load({ silent: true }), open ? 5_000 : 20_000);
    return () => globalThis.clearInterval?.(timer);
  }, [load, open]);
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (selectedId) setSelectedId("");
      else setOpen(false);
    };
    globalThis.addEventListener?.("keydown", onKeyDown);
    return () => globalThis.removeEventListener?.("keydown", onKeyDown);
  }, [open, selectedId]);

  const songs = useMemo(() => {
    const byId = new Map();
    for (const item of library?.items || []) for (const song of item.songs || []) if (song.id && !byId.has(song.id)) byId.set(song.id, song);
    return [...byId.values()].sort((left, right) => Number(left.trackNumber || Number.MAX_SAFE_INTEGER) - Number(right.trackNumber || Number.MAX_SAFE_INTEGER) || left.title.localeCompare(right.title));
  }, [library?.items]);
  const runs = useMemo(() => [...(library?.runs || [])].sort((left, right) => String(right.createdAt || "").localeCompare(String(left.createdAt || ""))), [library?.runs]);
  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(library?.items || [])]
      .filter((item) => songId === "all" || item.songs?.some((song) => song.id === songId))
      .filter((item) => runId === "all" || item.source?.runId === runId || (runId === "reference-atlas-media-catalog" && item.source?.kind === "catalog"))
      .filter((item) => motion === "all" || (motion === "loops" ? item.loopVideo?.uri : !item.loopVideo?.uri))
      .filter((item) => !needle || [
        item.title, item.referenceTitle, item.summary, item.memoryHook, item.prompt, item.source?.generator,
        ...(item.retrievalTags || []), ...(item.songs || []).map((song) => song.title),
      ].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .sort((left, right) => {
        if (sort === "reference") return left.referenceTitle.localeCompare(right.referenceTitle) || left.title.localeCompare(right.title);
        if (sort === "song") return (left.songs?.[0]?.title || "").localeCompare(right.songs?.[0]?.title || "") || left.title.localeCompare(right.title);
        return String(right.source?.createdAt || "").localeCompare(String(left.source?.createdAt || "")) || left.title.localeCompare(right.title);
      });
  }, [library?.items, motion, query, runId, songId, sort]);
  const renderedItems = useMemo(() => visibleItems.slice(0, visibleCount), [visibleCount, visibleItems]);
  const selected = useMemo(() => (library?.items || []).find((item) => item.id === selectedId) || null, [library?.items, selectedId]);
  const counts = library?.counts || {};

  useEffect(() => {
    setVisibleCount(MEDIA_PAGE_SIZE);
    if (gridRef.current) gridRef.current.scrollTop = 0;
  }, [motion, open, query, runId, songId, sort]);

  const loadNextPage = useCallback(() => {
    setVisibleCount((current) => Math.min(current + MEDIA_PAGE_SIZE, visibleItems.length));
  }, [visibleItems.length]);

  const handleGridScroll = useCallback((event) => {
    const target = event.currentTarget;
    if (target.scrollHeight - target.scrollTop - target.clientHeight < 600) loadNextPage();
  }, [loadNextPage]);

  return <>
    <section className="echo-reference-media-ingress" aria-label="Consolidated Echo Reference media library">
      <div className="echo-reference-media-ingress-icon"><Images size={20} /></div>
      <div>
        <span>Consolidated Reference Media · auto-updating</span>
        <strong>{loading ? "Indexing every retained run…" : `${(counts.visuals || 0).toLocaleString()} visuals across ${(counts.uniqueReferences || 0).toLocaleString()} references`}</strong>
        <small>{(counts.loopReady || 0).toLocaleString()} hover loops · {counts.imageRuns || 0} API image runs · {counts.catalogVisuals || 0} catalog visuals</small>
      </div>
      <button type="button" onClick={() => setOpen(true)} disabled={!counts.visuals}>Open all reference media</button>
      <button type="button" className="icon" onClick={() => void load({ silent: true })} disabled={refreshing} aria-label="Refresh consolidated reference media"><RefreshCw size={15} /></button>
      {error && <em role="alert">{error}</em>}
    </section>

    {open && createPortal(<div className="echo-reference-media-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
      <section className="echo-reference-media-library" role="dialog" aria-modal="true" aria-labelledby="echo-reference-media-title">
        <header>
          <div><span><Images size={15} /> Echo Album · every retained visual pass</span><h2 id="echo-reference-media-title">All Reference Media</h2><p>Catalog art and every local API run, connected to songs, reference logic, generation provenance, and available motion.</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Close all reference media"><X size={20} /></button>
        </header>
        <div className="echo-reference-media-counts">
          <span><b>{(counts.visuals || 0).toLocaleString()}</b><small>visual versions</small></span>
          <span><b>{(counts.uniqueReferences || 0).toLocaleString()}</b><small>reference connections</small></span>
          <span><b>{(counts.loopReady || 0).toLocaleString()}</b><small>hover loops</small></span>
          <span><b>{(counts.imageRuns || 0).toLocaleString()}</b><small>API image runs</small></span>
          <span><b>{(counts.songs || 0).toLocaleString()}</b><small>songs represented</small></span>
        </div>
        <div className="echo-reference-media-tools">
          <label className="search"><Search size={14} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search reference, song, prompt, memory hook, or tag…" /></label>
          <select value={songId} onChange={(event) => setSongId(event.target.value)} aria-label="Filter all reference media by song"><option value="all">All songs</option>{songs.map((song) => <option key={song.id} value={song.id}>{song.trackNumber ? `${song.trackNumber}. ` : ""}{song.title}</option>)}</select>
          <select value={runId} onChange={(event) => setRunId(event.target.value)} aria-label="Filter all reference media by source run"><option value="all">All source runs</option>{runs.map((run) => <option key={run.id} value={run.id}>{run.kind === "catalog" ? "Catalog · " : ""}{run.generator || run.id} · {run.visuals}</option>)}</select>
          <select value={motion} onChange={(event) => setMotion(event.target.value)} aria-label="Filter all reference media by motion availability"><option value="all">Stills + loops</option><option value="loops">Has hover loop</option><option value="stills">Still only</option></select>
          <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort all reference media"><option value="newest">Newest media first</option><option value="song">Song</option><option value="reference">Reference</option></select>
        </div>
        <div className="echo-reference-media-live" role="status"><span><ShieldCheck size={13} /> Local manifests rescanned every 5 seconds while open</span><b>{refreshing ? "Checking…" : `Showing ${renderedItems.length.toLocaleString()} of ${visibleItems.length.toLocaleString()} matches · checked ${dateLabel(lastCheckedAt)}`}</b></div>
        {error && <div className="echo-reference-media-message error">{error}</div>}
        {!loading && !error && !visibleItems.length && <div className="echo-reference-media-message">No reference media matches these filters.</div>}
        <main ref={gridRef} onScroll={handleGridScroll} data-testid="echo-reference-media-library-grid" aria-label="Infinite scrolling reference thumbnail gallery">
          {renderedItems.map((item) => <button key={item.id} type="button" onClick={() => setSelectedId(item.id)} aria-label={`Expand ${item.title}`}>
            <EchoHoverLoopMedia imageUri={`${apiBase}${item.image.uri}`} loopUri={item.loopVideo?.uri ? `${apiBase}${item.loopVideo.uri}` : ""} alt={item.title} loopAriaLabel={`Play loop for ${item.title}`} />
            <span className="run">{item.source.kind === "catalog" ? "Catalog" : "API run"}{item.loopVideo?.uri ? <><CirclePlay size={10} /> Loop</> : null}</span>
            <strong>{item.title}</strong><small>{songLabel(item)}</small><p>{item.summary || "Open for reference logic and generation details."}</p><em>{sourceLabel(item.source)}</em>
            <Maximize2 size={15} className="expand" />
          </button>)}
          {renderedItems.length < visibleItems.length && <div className="echo-reference-media-load-more" role="status"><span>{(visibleItems.length - renderedItems.length).toLocaleString()} more thumbnails</span><button type="button" onClick={loadNextPage}>Load next {Math.min(MEDIA_PAGE_SIZE, visibleItems.length - renderedItems.length)}</button></div>}
        </main>

        {selected && <aside className="echo-reference-media-inspector" aria-label={`Detail for ${selected.title}`}>
          <button type="button" className="close" onClick={() => setSelectedId("")} aria-label="Close media detail"><X size={18} /></button>
          <div className="hero"><EchoHoverLoopMedia imageUri={`${apiBase}${selected.image.uri}`} loopUri={selected.loopVideo?.uri ? `${apiBase}${selected.loopVideo.uri}` : ""} alt={selected.title} loopAriaLabel={`Play large loop for ${selected.title}`} loading="eager" /></div>
          <div className="copy">
            <span>{sourceLabel(selected.source)} · {selected.loopVideo?.uri ? "loop available" : "still image"}</span>
            <h3>{selected.title}</h3>
            {selected.referenceTitle !== selected.title && <p className="reference-title">Reference: {selected.referenceTitle}</p>}
            <section><h4>Why it connects</h4><p>{selected.connection?.why || selected.reviewPrompt || selected.summary || "No compact rationale is stored for this visual."}</p></section>
            {selected.memoryHook && <section><h4>Memory hook</h4><p>{selected.memoryHook}</p></section>}
            {!!selected.qualityAssessment && <section><h4>Quality assessment</h4><div className="quality"><b>{Number(selected.qualityAssessment.average || 0).toFixed(2)}</b><span>{selected.qualityAssessment.status || (selected.qualityAssessment.ready ? "ready" : "review")}</span></div>{selected.qualityAssessment.evidenceSummary && <p>{selected.qualityAssessment.evidenceSummary}</p>}{(selected.qualityAssessment.strengths || []).map((value) => <small key={value}>+ {value}</small>)}{(selected.qualityAssessment.risks || []).map((value) => <small key={value}>△ {value}</small>)}</section>}
            {!!selected.connection?.lyricMoments?.length && <section><h4>Lyric connections</h4>{selected.connection.lyricMoments.map((moment) => <blockquote key={moment.id || `${moment.songId}:${moment.line}`}>{moment.excerpt || "Lyric position recorded"}<small>{moment.songTitle}{moment.line ? ` · line ${moment.line}` : ""}</small></blockquote>)}</section>}
            {!!selected.connection?.claims?.length && <section><h4>Atlas understanding</h4>{selected.connection.claims.map((claim) => <article key={claim.id}><strong>{claim.kind || "Claim"}</strong><p>{claim.text}</p>{claim.caveat && <small>{claim.caveat}</small>}</article>)}</section>}
            {!!selected.connection?.interpretations?.length && <section><h4>Interpretations</h4>{selected.connection.interpretations.map((interpretation) => <article key={interpretation.id}><strong>{interpretation.title}</strong><p>{interpretation.summary}</p></article>)}</section>}
            {!!selected.connection?.citations?.length && <section><h4>Sources</h4>{selected.connection.citations.map((citation) => <a key={citation.id || citation.url} href={citation.url} target="_blank" rel="noreferrer">{citation.label || citation.url}</a>)}</section>}
            {!!selected.retrievalTags?.length && <div className="tags">{selected.retrievalTags.map((tag) => <span key={tag}>{tag}</span>)}</div>}
            {selected.prompt && <details><summary>View exact image prompt</summary><pre>{selected.prompt}</pre></details>}
            <dl><div><dt>Song</dt><dd>{songLabel(selected)}</dd></div><div><dt>Source run</dt><dd>{selected.source.runId || "catalog"}</dd></div><div><dt>Generator</dt><dd>{selected.source.generator}</dd></div><div><dt>Generated</dt><dd>{dateLabel(selected.source.createdAt)}</dd></div><div><dt>Review state</dt><dd>{selected.authority?.reviewStatus || "pending"}</dd></div><div><dt>Image hash</dt><dd>{selected.image.hash || "not recorded"}</dd></div></dl>
            <button type="button" className="open-workbench" onClick={() => { onOpenCard(selected); setSelectedId(""); setOpen(false); }}>Open song/reference workbench</button>
          </div>
        </aside>}
      </section>
    </div>, document.body)}
  </>;
}
