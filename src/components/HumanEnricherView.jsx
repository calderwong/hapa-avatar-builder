import { useEffect, useMemo, useState } from "react";
import {
  AtSign,
  BadgeCheck,
  Clapperboard,
  ExternalLink,
  FileVideo2,
  Link2,
  Loader2,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  UserRoundCheck,
} from "lucide-react";
import { HUMAN_VIDEO_QUALITY_GRADES } from "../domain/human-video-enrichment.js";

const EMPTY_REFERENCE = { type: "echo-song", id: "", label: "", uri: "", notes: "" };

export default function HumanEnricherView({ apiBase = "", onNotify = () => {} }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [avatarChoice, setAvatarChoice] = useState("");
  const [referenceDraft, setReferenceDraft] = useState(EMPTY_REFERENCE);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState("idle");

  async function load({ preserveSelection = true, append = false, offset = 0 } = {}) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: "120", quality: qualityFilter });
      if (query.trim()) params.set("q", query.trim());
      const response = await fetch(`${apiBase}/api/human-enricher/videos?${params}`, { headers: { accept: "application/json" } });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || `Human Enricher failed to load (${response.status})`);
      const nextPayload = append && dashboard
        ? { ...payload, videos: [...dashboard.videos, ...(payload.videos || [])] }
        : payload;
      setDashboard(nextPayload);
      const currentStillExists = preserveSelection && nextPayload.videos?.some((video) => video.humanVideoKey === selectedKey);
      setSelectedKey(currentStillExists ? selectedKey : payload.videos?.[0]?.humanVideoKey || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = globalThis.setTimeout(() => load({ preserveSelection: false }), query.trim() ? 240 : 0);
    return () => globalThis.clearTimeout(timer);
  }, [apiBase, query, qualityFilter]);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (dashboard?.videos || []).filter((video) => {
      const grade = Number(video.humanEnrichment?.quality?.value || 0);
      if (qualityFilter === "enriched" && !video.humanEnrichment) return false;
      if (qualityFilter === "ungraded" && grade > 0) return false;
      if (/^[1-5]$/.test(qualityFilter) && grade !== Number(qualityFilter)) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        video.name,
        video.id,
        video.sourcePath,
        video.ownerName,
        video.role,
        video.documentKind,
        ...(video.tags || []),
        ...(video.relationships || []).flatMap((relationship) => [relationship.ownerName, relationship.ownerType, relationship.role]),
        ...(video.humanEnrichment?.avatarMentions || []).map((mention) => mention.mention),
        video.humanEnrichment?.directorNotes,
        ...(video.humanEnrichment?.references || []).flatMap((reference) => [reference.label, reference.id, reference.notes]),
      ].join(" ").toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [dashboard, qualityFilter, query]);

  const selectedVideo = useMemo(
    () => (dashboard?.videos || []).find((video) => video.humanVideoKey === selectedKey) || filteredVideos[0] || null,
    [dashboard, filteredVideos, selectedKey],
  );

  useEffect(() => {
    if (!selectedVideo) return;
    if (selectedVideo.humanVideoKey !== selectedKey) setSelectedKey(selectedVideo.humanVideoKey);
    setDraft(draftForVideo(selectedVideo));
    setAvatarChoice("");
    setReferenceDraft(EMPTY_REFERENCE);
    setSaveState("idle");
  }, [selectedVideo?.humanVideoKey, selectedVideo?.humanEnrichment?.revision]);

  function addAvatarMention() {
    const avatar = dashboard?.avatarOptions?.find((item) => item.id === avatarChoice);
    if (!avatar || draft.avatarMentions.some((mention) => mention.avatarId === avatar.id)) return;
    setDraft((current) => ({
      ...current,
      avatarMentions: [...current.avatarMentions, { avatarId: avatar.id, avatarName: avatar.name, mention: avatar.mention }],
    }));
    setAvatarChoice("");
    setSaveState("dirty");
  }

  function addReference() {
    const reference = {
      ...referenceDraft,
      id: referenceDraft.id.trim(),
      label: referenceDraft.label.trim(),
      uri: referenceDraft.uri.trim(),
      notes: referenceDraft.notes.trim(),
    };
    if (!reference.id && !reference.label && !reference.uri) return;
    setDraft((current) => ({ ...current, references: [...current.references, reference] }));
    setReferenceDraft(EMPTY_REFERENCE);
    setSaveState("dirty");
  }

  function chooseEchoSong(songId) {
    const song = dashboard?.songOptions?.find((item) => item.id === songId);
    setReferenceDraft((current) => ({
      ...current,
      type: "echo-song",
      id: song?.id || "",
      label: song?.title || "",
    }));
  }

  async function save() {
    if (!selectedVideo || saving) return;
    setSaving(true);
    setSaveState("saving");
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/human-enricher/records`, {
        method: "PUT",
        headers: { accept: "application/json", "content-type": "application/json", "x-hapa-actor-id": "human-enricher-ui" },
        body: JSON.stringify({
          key: selectedVideo.humanVideoKey,
          videoId: selectedVideo.id,
          expectedRevision: draft.expectedRevision,
          quality: draft.quality,
          avatarMentions: draft.avatarMentions,
          directorNotes: draft.directorNotes,
          references: draft.references,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || `Save failed (${response.status})`);
      setDashboard((current) => ({
        ...current,
        summary: payload.summary || current.summary,
        videos: current.videos.map((video) => video.humanVideoKey === selectedVideo.humanVideoKey
          ? { ...video, humanEnrichment: payload.record }
          : video),
      }));
      setDraft((current) => ({ ...current, expectedRevision: payload.record.revision }));
      setSaveState("saved");
      onNotify(`Human direction saved for ${selectedVideo.name}`);
    } catch (saveError) {
      setSaveState("error");
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading && !dashboard) {
    return <section className="human-enricher-view"><div className="human-enricher-loading hapa-panel"><Loader2 size={24} className="spin" /><span>Gathering every known Builder video…</span></div></section>;
  }

  return (
    <section className="human-enricher-view" aria-label="Human Enricher">
      <header className="human-enricher-hero hapa-panel" data-variant="hot">
        <div>
          <p className="eyebrow"><UserRoundCheck size={14} /> HUMAN ENRICHER · ECHO STATE INPUT</p>
          <h2>Put human taste back in the loop.</h2>
          <p>Grade known video files, name the Avatars on screen, and leave direction that Echo State can read without changing source media or canon.</p>
        </div>
        <button className="hapa-btn" type="button" onClick={() => load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh videos
        </button>
      </header>

      {error && <div className="human-enricher-error hapa-panel" role="alert">{error}</div>}

      <div className="human-enricher-stats" aria-label="Human enrichment status">
        <Metric label="Known videos" value={dashboard?.summary?.videos || 0} icon={<FileVideo2 size={16} />} />
        <Metric label="Human enriched" value={dashboard?.summary?.enriched || 0} icon={<Sparkles size={16} />} />
        <Metric label="Ungraded" value={dashboard?.summary?.ungraded || 0} icon={<Star size={16} />} />
        <Metric label="Director notes" value={dashboard?.summary?.withDirectorNotes || 0} icon={<Clapperboard size={16} />} />
        <Metric label="@Avatar links" value={dashboard?.summary?.withAvatarMentions || 0} icon={<AtSign size={16} />} />
        <Metric label="References" value={dashboard?.summary?.withReferences || 0} icon={<Link2 size={16} />} />
      </div>

      <div className="human-enricher-layout">
        <aside className="human-video-library hapa-panel" data-variant="notch">
          <div className="human-video-toolbar">
            <label className="search-box hapa-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="video, @avatar, relation…" /></label>
            <select value={qualityFilter} onChange={(event) => setQualityFilter(event.target.value)} aria-label="Filter by quality">
              <option value="all">All quality</option>
              <option value="enriched">Human enriched</option>
              <option value="ungraded">Ungraded</option>
              {HUMAN_VIDEO_QUALITY_GRADES.filter((grade) => grade.value).map((grade) => <option key={grade.value} value={grade.value}>Quality {grade.value} · {grade.label}</option>)}
            </select>
          </div>
          <div className="human-video-library-count"><strong>{dashboard?.pagination?.total ?? filteredVideos.length}</strong><span>matching videos · {filteredVideos.length} loaded</span></div>
          <div className="human-video-list">
            {filteredVideos.map((video) => (
              <button
                className={`human-video-row hapa-card${video.humanVideoKey === selectedVideo?.humanVideoKey ? " selected" : ""}`}
                data-card-type="media"
                type="button"
                key={video.humanVideoKey}
                onClick={() => setSelectedKey(video.humanVideoKey)}
              >
                <VideoPoster video={video} apiBase={apiBase} />
                <span className="human-video-row-copy">
                  <strong>{video.name || video.id}</strong>
                  <small>{video.ownerName || "System Media Library"} · {video.role || "video"}</small>
                  <span className="human-video-row-meta">
                    <i data-quality={video.humanEnrichment?.quality?.value || 0}>Q{video.humanEnrichment?.quality?.value || "—"}</i>
                    <i>{video.relationships?.length || 0} links</i>
                    {video.humanEnrichment?.directorNotes && <i>notes</i>}
                  </span>
                </span>
              </button>
            ))}
            {dashboard?.pagination?.hasMore && (
              <button className="human-video-load-more hapa-btn" type="button" disabled={loading} onClick={() => load({ append: true, offset: dashboard.pagination.nextOffset })}>
                {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Load 120 more
              </button>
            )}
            {!filteredVideos.length && <div className="human-video-empty">No videos match this filter.</div>}
          </div>
        </aside>

        <main className="human-enricher-inspector hapa-panel" data-variant="notch">
          {selectedVideo ? (
            <>
              <div className="human-video-stage">
                <video src={mediaUri(selectedVideo.uri, apiBase)} poster={mediaUri(selectedVideo.thumbnailUri, apiBase)} controls preload="metadata" />
                <div className="human-video-stage-copy">
                  <p className="eyebrow">KNOWN VIDEO · {selectedVideo.ownerType || "library"}</p>
                  <h3>{selectedVideo.name || selectedVideo.id}</h3>
                  <p>{selectedVideo.sourcePath || selectedVideo.uri || "No source path recorded"}</p>
                  <div className="human-video-source-actions">
                    {selectedVideo.uri && <a href={mediaUri(selectedVideo.uri, apiBase)} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Open media</a>}
                    <span>{formatDuration(selectedVideo.duration)}</span>
                    <span>{formatBytes(selectedVideo.sizeBytes)}</span>
                    <span>{formatDimensions(selectedVideo)}</span>
                  </div>
                </div>
              </div>

              <section className="human-enrichment-editor">
                <div className="human-enrichment-section-head">
                  <div><p className="eyebrow">01 · HUMAN QUALITY</p><h4>Grade this file</h4></div>
                  <span>Revision {draft.expectedRevision || "new"}</span>
                </div>
                <div className="human-quality-scale" role="radiogroup" aria-label="Video quality">
                  {HUMAN_VIDEO_QUALITY_GRADES.map((grade) => (
                    <button key={grade.value} type="button" role="radio" aria-checked={draft.quality === grade.value} className={draft.quality === grade.value ? "active" : ""} data-grade={grade.value} onClick={() => { setDraft((current) => ({ ...current, quality: grade.value })); setSaveState("dirty"); }}>
                      <span>{grade.shortLabel}</span><strong>{grade.label}</strong>
                    </button>
                  ))}
                </div>
              </section>

              <section className="human-enrichment-editor">
                <div className="human-enrichment-section-head"><div><p className="eyebrow">02 · @AVATARS</p><h4>Who appears or belongs here?</h4></div><span>{draft.avatarMentions.length} tagged</span></div>
                <div className="human-avatar-picker">
                  <select value={avatarChoice} onChange={(event) => setAvatarChoice(event.target.value)} aria-label="Choose an Avatar to tag">
                    <option value="">Choose @Avatar…</option>
                    {(dashboard?.avatarOptions || []).map((avatar) => <option key={avatar.id} value={avatar.id}>{avatar.mention}</option>)}
                  </select>
                  <button className="hapa-btn" type="button" onClick={addAvatarMention} disabled={!avatarChoice}><AtSign size={14} /> Tag Avatar</button>
                </div>
                <div className="human-mention-chips">
                  {draft.avatarMentions.map((mention) => <span key={mention.avatarId}>{mention.mention}<button type="button" aria-label={`Remove ${mention.mention}`} onClick={() => { setDraft((current) => ({ ...current, avatarMentions: current.avatarMentions.filter((item) => item.avatarId !== mention.avatarId) })); setSaveState("dirty"); }}>×</button></span>)}
                  {!draft.avatarMentions.length && <em>No human Avatar tags yet.</em>}
                </div>
              </section>

              <section className="human-enrichment-editor">
                <div className="human-enrichment-section-head"><div><p className="eyebrow">03 · DIRECTOR NOTES</p><h4>What should Echo State understand?</h4></div><span>{draft.directorNotes.length}/12000</span></div>
                <textarea value={draft.directorNotes} maxLength={12000} onChange={(event) => { setDraft((current) => ({ ...current, directorNotes: event.target.value })); setSaveState("dirty"); }} placeholder="Example: Hold on the eye contact. Use this after the second chorus, not as an opener. The handheld shake is emotionally right; preserve it." />
                <p className="human-editor-hint"><Clapperboard size={13} /> Delivered to matching Echo State timeline shots as <code>human_enrichment.directorNotes</code>.</p>
              </section>

              <section className="human-enrichment-editor">
                <div className="human-enrichment-section-head"><div><p className="eyebrow">04 · REFERENCES</p><h4>Link songs, Cards, URLs, or other anchors</h4></div><span>{draft.references.length} linked</span></div>
                <div className="human-reference-compose">
                  <select value={referenceDraft.type} onChange={(event) => setReferenceDraft((current) => ({ ...current, type: event.target.value }))} aria-label="Reference type">
                    <option value="echo-song">Echo State song</option><option value="song">Other song</option><option value="card">Hapa Card</option><option value="url">Web / file URL</option><option value="other">Other reference</option>
                  </select>
                  {referenceDraft.type === "echo-song" && (
                    <select value={referenceDraft.id} onChange={(event) => chooseEchoSong(event.target.value)} aria-label="Choose an Echo State song"><option value="">Choose Echo State song…</option>{(dashboard?.songOptions || []).map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}</select>
                  )}
                  <input value={referenceDraft.label} onChange={(event) => setReferenceDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Reference label" />
                  <input value={referenceDraft.uri} onChange={(event) => setReferenceDraft((current) => ({ ...current, uri: event.target.value }))} placeholder="Optional URL or local URI" />
                  <textarea value={referenceDraft.notes} onChange={(event) => setReferenceDraft((current) => ({ ...current, notes: event.target.value }))} placeholder="Why does this reference matter?" />
                  <button className="hapa-btn" type="button" onClick={addReference}><Link2 size={14} /> Add reference</button>
                </div>
                <div className="human-reference-list">
                  {draft.references.map((reference, index) => (
                    <article key={`${reference.type}:${reference.id || reference.uri || reference.label}:${index}`}>
                      <span>{reference.type}</span><strong>{reference.label || reference.id || reference.uri}</strong>{reference.notes && <p>{reference.notes}</p>}
                      <button type="button" aria-label={`Remove ${reference.label || "reference"}`} onClick={() => { setDraft((current) => ({ ...current, references: current.references.filter((_, itemIndex) => itemIndex !== index) })); setSaveState("dirty"); }}><Trash2 size={13} /></button>
                    </article>
                  ))}
                </div>
              </section>

              <section className="human-video-evidence">
                <div className="human-enrichment-section-head"><div><p className="eyebrow">SOURCE EVIDENCE</p><h4>Metadata & relationships</h4></div><span>read only</span></div>
                <dl className="human-video-meta-grid">
                  <Meta label="Record ID" value={selectedVideo.id} />
                  <Meta label="Asset ID" value={selectedVideo.assetId || selectedVideo.asset?.id} />
                  <Meta label="Owner" value={`${selectedVideo.ownerType || "library"} · ${selectedVideo.ownerName || "System Media Library"}`} />
                  <Meta label="Role" value={selectedVideo.role} />
                  <Meta label="Document kind" value={selectedVideo.documentKind} />
                  <Meta label="Review" value={`${selectedVideo.reviewStatus || "new"} · ${selectedVideo.reviewPriority || "none"} priority`} />
                  <Meta label="Fingerprint" value={selectedVideo.contentFingerprint} />
                  <Meta label="Updated" value={selectedVideo.updatedAt || selectedVideo.createdAt} />
                </dl>
                <div className="human-relationship-list">
                  {(selectedVideo.relationships || []).map((relationship, index) => <span key={`${relationship.ownerType}:${relationship.ownerId}:${relationship.role}:${index}`}><strong>{relationship.ownerName || relationship.ownerId}</strong><small>{relationship.ownerType} · {relationship.role}</small></span>)}
                  {!selectedVideo.relationships?.length && <em>No explicit relationships recorded.</em>}
                </div>
                <div className="human-source-tags">{(selectedVideo.tags || []).map((tag) => <span key={tag}>{tag}</span>)}</div>
                <details className="human-raw-meta"><summary>Full known record metadata</summary><pre>{JSON.stringify(selectedVideo, null, 2)}</pre></details>
              </section>

              <footer className="human-enricher-savebar hapa-panel" data-state={saveState}>
                <div><BadgeCheck size={16} /><span>{saveState === "saved" ? "Human direction saved and director-readable." : saveState === "error" ? "Save failed—review the message above." : saveState === "dirty" ? "Unsaved human direction." : "Source remains unchanged until you save this overlay."}</span></div>
                <button className="hapa-btn" data-intent="primary" type="button" onClick={save} disabled={saving || saveState === "saved"}>
                  {saving ? <Loader2 size={15} className="spin" /> : <Save size={15} />} Save human enrichment
                </button>
              </footer>
            </>
          ) : <div className="human-video-empty">No known video is available for enrichment.</div>}
        </main>
      </div>
    </section>
  );
}

function emptyDraft() { return { quality: 0, avatarMentions: [], directorNotes: "", references: [], expectedRevision: 0 }; }
function draftForVideo(video) {
  const enrichment = video.humanEnrichment;
  return enrichment ? {
    quality: Number(enrichment.quality?.value || 0),
    avatarMentions: enrichment.avatarMentions || [],
    directorNotes: enrichment.directorNotes || "",
    references: enrichment.references || [],
    expectedRevision: Number(enrichment.revision || 0),
  } : emptyDraft();
}
function mediaUri(uri, apiBase) {
  if (!uri) return "";
  if (/^(https?:|data:|blob:|file:)/i.test(uri)) return uri;
  return `${apiBase}${uri.startsWith("/") ? "" : "/"}${uri}`;
}
function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return "size unknown";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
function formatDuration(value) {
  const seconds = Number(value || 0);
  if (!seconds) return "duration unknown";
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.round(seconds % 60)).padStart(2, "0")}`;
}
function formatDimensions(video) { return video.width && video.height ? `${video.width} × ${video.height}` : "dimensions unknown"; }
function Metric({ label, value, icon }) { return <div className="human-enricher-metric hapa-panel"><span>{icon}{label}</span><strong>{value}</strong></div>; }
function Meta({ label, value }) { return <div><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>; }
function VideoPoster({ video, apiBase }) {
  const poster = mediaUri(video.thumbnailUri, apiBase);
  return <span className="human-video-poster">{poster ? <img src={poster} alt="" loading="lazy" /> : <FileVideo2 size={24} />}</span>;
}
