import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Images, Maximize2, Search, ShieldCheck, X } from "lucide-react";
import EchoHoverLoopMedia from "./EchoHoverLoopMedia.jsx";

function cohortLabel(value) {
  return value === "explicit-codex-gpt-image"
    ? "Codex GPT Image expansion"
    : "Earlier GPT Image source pass";
}

function songLabel(item = {}) {
  if (!item.songs?.length) return "Album-wide reference";
  if (item.songs.length === 1) return item.songs[0].title;
  return `${item.songs[0].title} +${item.songs.length - 1}`;
}

export default function EchoReferenceGptImageLibrary({
  apiBase = "",
  open = false,
  onClose = () => {},
  onOpenCard = () => {},
}) {
  const [library, setLibrary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [songId, setSongId] = useState("all");
  const [cohort, setCohort] = useState("all");
  const [sort, setSort] = useState("song");
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    if (!open || library || loading) return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`${apiBase}/api/echos/references/gpt-image-library`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || `Reference image library failed to load (${response.status}).`);
        return payload;
      })
      .then(setLibrary)
      .catch((caught) => {
        if (caught?.name !== "AbortError") setError(caught?.message || String(caught));
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [apiBase, library, open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (selected) setSelected(null);
      else onClose();
    };
    globalThis.addEventListener?.("keydown", onKeyDown);
    return () => globalThis.removeEventListener?.("keydown", onKeyDown);
  }, [onClose, open, selected]);

  const songs = useMemo(() => {
    const byId = new Map();
    for (const item of library?.items || []) {
      for (const song of item.songs || []) if (!byId.has(song.id)) byId.set(song.id, song);
    }
    return [...byId.values()].sort((left, right) => (
      Number(left.trackNumber || Number.MAX_SAFE_INTEGER) - Number(right.trackNumber || Number.MAX_SAFE_INTEGER)
      || left.title.localeCompare(right.title)
    ));
  }, [library?.items]);

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return [...(library?.items || [])]
      .filter((item) => songId === "all" || item.songs?.some((song) => song.id === songId))
      .filter((item) => cohort === "all" || item.source?.cohort === cohort)
      .filter((item) => !needle || [
        item.title,
        item.summary,
        item.referenceType,
        ...(item.songs || []).map((song) => song.title),
      ].filter(Boolean).join(" ").toLowerCase().includes(needle))
      .sort((left, right) => {
        if (sort === "title") return left.title.localeCompare(right.title) || left.id.localeCompare(right.id);
        if (sort === "newest") return String(right.source?.createdAt || "").localeCompare(String(left.source?.createdAt || "")) || left.title.localeCompare(right.title);
        return (left.songs?.[0]?.title || "").localeCompare(right.songs?.[0]?.title || "") || left.title.localeCompare(right.title);
      });
  }, [cohort, library?.items, query, songId, sort]);

  if (!open) return null;
  const counts = library?.counts || {};

  return createPortal((
    <div className="echo-gpt-reference-library-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="echo-gpt-reference-library" role="dialog" aria-modal="true" aria-labelledby="echo-gpt-reference-library-title">
        <header className="echo-gpt-reference-library-head">
          <div>
            <span className="echo-gpt-reference-library-kicker"><Images size={15} /> Echo Album visual corpus</span>
            <h2 id="echo-gpt-reference-library-title">Codex / GPT Image References</h2>
            <p>Every still from the original Reference Atlas GPT Image passes. Later Flux and Krea generations are excluded by provenance.</p>
          </div>
          <button type="button" className="echo-gpt-reference-library-close" onClick={onClose} aria-label="Close GPT Image reference library"><X size={19} /></button>
        </header>

        <div className="echo-gpt-reference-library-counts" aria-label="Reference image counts">
          <span><b>{counts.total?.toLocaleString() || "—"}</b><small>GPT Image stills</small></span>
          <span><b>{counts.explicitCodex?.toLocaleString() || "0"}</b><small>Codex-labeled expansion</small></span>
          <span><b>{counts.earlierGpt?.toLocaleString() || "0"}</b><small>Earlier GPT source pass</small></span>
          <span><b>{counts.loopReady?.toLocaleString() || "0"}</b><small>Hover loops ready</small></span>
          <span className="excluded"><b>{counts.excludedFluxKrea?.toLocaleString() || "0"}</b><small>Flux / Krea excluded</small></span>
        </div>

        <div className="echo-gpt-reference-library-tools">
          <label className="echo-gpt-reference-library-search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, songs, meanings…" aria-label="Search GPT Image references" />
          </label>
          <label>
            <span>Song</span>
            <select value={songId} onChange={(event) => setSongId(event.target.value)} aria-label="Filter reference images by song">
              <option value="all">All album songs</option>
              {songs.map((song) => <option key={song.id} value={song.id}>{song.trackNumber ? `${song.trackNumber}. ` : ""}{song.title}</option>)}
            </select>
          </label>
          <label>
            <span>Source pass</span>
            <select value={cohort} onChange={(event) => setCohort(event.target.value)} aria-label="Filter reference images by GPT source pass">
              <option value="all">Both GPT Image passes</option>
              <option value="explicit-codex-gpt-image">Codex-labeled expansion</option>
              <option value="earlier-gpt-image-source-pass">Earlier GPT source pass</option>
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort GPT Image references">
              <option value="song">Song, then title</option>
              <option value="title">Reference title</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
        </div>

        <div className="echo-gpt-reference-library-status" role="status">
          <span><ShieldCheck size={13} /> Provenance filter: Codex/GPT Image only</span>
          <b>Showing {visibleItems.length.toLocaleString()} of {(counts.total || 0).toLocaleString()}</b>
        </div>

        {loading && <div className="echo-gpt-reference-library-message">Loading the complete GPT Image corpus…</div>}
        {error && <div className="echo-gpt-reference-library-message error" role="alert">{error}</div>}
        {!loading && !error && !visibleItems.length && <div className="echo-gpt-reference-library-message">No GPT Image references match these filters.</div>}

        {!loading && !error && visibleItems.length > 0 && (
          <div className="echo-gpt-reference-library-grid" data-testid="echo-gpt-reference-library-grid">
            {visibleItems.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelected(item)} aria-label={`Open large preview for ${item.title}`}>
                <EchoHoverLoopMedia
                  imageUri={item.image.uri}
                  loopUri={item.loopVideo?.uri}
                  alt=""
                />
                <span className="echo-gpt-reference-library-card-copy">
                  <b>{item.title}</b>
                  <small>{songLabel(item)}</small>
                  <p>{item.connection?.why || item.summary || "Open to inspect why this reference connects."}</p>
                  <em>{cohortLabel(item.source?.cohort)}</em>
                </span>
                <Maximize2 className="echo-gpt-reference-library-expand" size={15} aria-hidden="true" />
              </button>
            ))}
          </div>
        )}

        {selected && (
          <aside className="echo-gpt-reference-library-inspector" aria-label={`Large preview of ${selected.title}`}>
            <button type="button" className="echo-gpt-reference-library-inspector-close" onClick={() => setSelected(null)} aria-label="Close large reference preview"><X size={18} /></button>
            <div className="echo-gpt-reference-library-hero">
              <EchoHoverLoopMedia
                imageUri={selected.image.uri}
                loopUri={selected.loopVideo?.uri}
                alt={`${selected.title} GPT Image reference`}
                loading="eager"
              />
            </div>
            <div className="echo-gpt-reference-library-inspector-copy">
              <span>{cohortLabel(selected.source?.cohort)}</span>
              <h3>{selected.title}</h3>
              <section>
                <h4>Why it connects</h4>
                <p>{selected.connection?.why || selected.summary || "No compact reference summary is stored."}</p>
              </section>
              {!!selected.connection?.lyricMoments?.length && <section>
                <h4>Where the reference appears</h4>
                {selected.connection.lyricMoments.map((moment) => <blockquote key={moment.id || `${moment.songId}:${moment.line}`}>
                  {moment.excerpt || "Lyric position recorded without quoted text."}
                  <small>{moment.songTitle}{moment.line ? ` · line ${moment.line}` : ""} · {Math.round((moment.confidence || 0) * 100)}% confidence</small>
                </blockquote>)}
              </section>}
              {!!selected.connection?.claims?.length && <section>
                <h4>What the Atlas understands</h4>
                {selected.connection.claims.map((claim) => <article key={claim.id}>
                  <strong>{claim.kind || "Reference claim"}</strong>
                  <p>{claim.text}</p>
                  {claim.caveat && <small>{claim.caveat}</small>}
                </article>)}
              </section>}
              {!!selected.connection?.citations?.length && <section>
                <h4>Sources</h4>
                {selected.connection.citations.map((citation) => <a key={citation.id || citation.url} href={citation.url} target="_blank" rel="noreferrer">{citation.label || citation.url}</a>)}
              </section>}
              {!![...(selected.connection?.themes || []), ...(selected.connection?.mechanics || []), ...(selected.connection?.emotions || [])].length && <div className="echo-gpt-reference-library-tags">
                {[...(selected.connection?.themes || []), ...(selected.connection?.mechanics || []), ...(selected.connection?.emotions || [])].map((value) => <span key={value}>{value}</span>)}
              </div>}
              <dl>
                <div><dt>Connected songs</dt><dd>{selected.songs?.map((song) => song.title).join(" · ") || "Album-wide"}</dd></div>
                <div><dt>Lyric connections</dt><dd>{selected.occurrenceCount?.toLocaleString() || 0}</dd></div>
                <div><dt>Review state</dt><dd>{selected.authority?.reviewStatus || "pending review"}</dd></div>
                <div><dt>Generator</dt><dd>{selected.source?.generator}</dd></div>
              </dl>
              <button type="button" onClick={() => {
                onOpenCard(selected);
                setSelected(null);
                onClose();
              }}>Open reference logic in Atlas</button>
            </div>
          </aside>
        )}
      </section>
    </div>
  ), document.body);
}
