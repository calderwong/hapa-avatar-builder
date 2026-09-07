import { useEffect, useMemo, useRef, useState } from "react";
import {
  AtSign,
  BadgeCheck,
  Bot,
  CheckCircle2,
  Clapperboard,
  Eye,
  ExternalLink,
  FileVideo2,
  Link2,
  LayoutGrid,
  ListVideo,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Tags,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import {
  HUMAN_VIDEO_QUALITY_GRADES,
  HUMAN_VIDEO_REVIEW_FILTERS,
  matchesHumanVideoQuickSortSeenFilter,
  matchesHumanVideoReviewFilter,
  matchesHumanVideoSourceFilter,
} from "../domain/human-video-enrichment.js";
import HumanEnricherLikenessLane from "./HumanEnricherLikenessLane.jsx";

const EMPTY_REFERENCE = { type: "echo-song", id: "", label: "", uri: "", notes: "" };

export default function HumanEnricherView({ apiBase = "", onNotify = () => {} }) {
  const [dashboard, setDashboard] = useState(null);
  const [opticalCampaign, setOpticalCampaign] = useState(null);
  const [opticalCampaignError, setOpticalCampaignError] = useState("");
  const [opticalCampaignLoading, setOpticalCampaignLoading] = useState(true);
  const [opticalCampaignRefreshedAt, setOpticalCampaignRefreshedAt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState(initialReviewFilter);
  const [sort, setSort] = useState("quality-desc");
  const [layout, setLayout] = useState(initialLayout);
  const [quickSortSeenFilter, setQuickSortSeenFilter] = useState(initialQuickSortSeenFilter);
  const [quickSortSourceFilter, setQuickSortSourceFilter] = useState(initialQuickSortSourceFilter);
  const [decidingKeys, setDecidingKeys] = useState(() => new Set());
  const decidingKeysRef = useRef(new Set());
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [avatarChoice, setAvatarChoice] = useState("");
  const [referenceDraft, setReferenceDraft] = useState(EMPTY_REFERENCE);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const editSerialRef = useRef(0);

  async function load({ preserveSelection = true, append = false, offset = 0 } = {}) {
    if (layout === "likeness") {
      // The likeness lane owns its own fetch against the lane route; the
      // rest of the Enricher does not wait on it (browsable, non-blocking).
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: "120",
        quality: qualityFilter,
        review: reviewFilter,
        sort,
      });
      if (layout === "tiles") {
        params.set("limit", "240");
        params.set("review", "all");
        params.set("sort", "name");
        params.set("seen", quickSortSeenFilter);
        params.set("source", quickSortSourceFilter);
      }
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
  }, [apiBase, layout, query, qualityFilter, reviewFilter, sort, quickSortSeenFilter, quickSortSourceFilter]);

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function refreshOpticalCampaign() {
      if (inFlight) return;
      inFlight = true;
      try {
        const response = await fetch(`${apiBase}/api/human-enricher/optical-campaign`, { headers: { accept: "application/json" } });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || payload.error || `Agent telemetry failed to load (${response.status})`);
        if (!cancelled) {
          setOpticalCampaign(payload);
          setOpticalCampaignError("");
          setOpticalCampaignRefreshedAt(new Date());
        }
      } catch (campaignError) {
        if (!cancelled) setOpticalCampaignError(campaignError instanceof Error ? campaignError.message : String(campaignError));
      } finally {
        inFlight = false;
        if (!cancelled) setOpticalCampaignLoading(false);
      }
    }

    refreshOpticalCampaign();
    const timer = globalThis.setInterval(refreshOpticalCampaign, 4_000);
    return () => {
      cancelled = true;
      globalThis.clearInterval(timer);
    };
  }, [apiBase]);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (dashboard?.videos || []).filter((video) => {
      const grade = Number(video.humanEnrichment?.quality?.value ?? 0);
      if (!matchesHumanVideoReviewFilter(video, reviewFilter)) return false;
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
  }, [dashboard, qualityFilter, query, reviewFilter]);

  const selectedVideo = useMemo(
    () => (dashboard?.videos || []).find((video) => video.humanVideoKey === selectedKey) || filteredVideos[0] || null,
    [dashboard, filteredVideos, selectedKey],
  );

  const quickSortVideos = useMemo(() => (dashboard?.videos || []).filter((video) => {
    if (video.agentReview?.status === "blocked") return false;
    if (!matchesHumanVideoQuickSortSeenFilter(video, quickSortSeenFilter)) return false;
    if (!matchesHumanVideoSourceFilter(video, quickSortSourceFilter)) return false;
    if (qualityFilter === "enriched" && !video.humanEnrichment) return false;
    const grade = Number(video.humanEnrichment?.quality?.value ?? 0);
    if (qualityFilter === "ungraded" && grade > 0) return false;
    if (/^[1-5]$/.test(qualityFilter) && grade !== Number(qualityFilter)) return false;
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;
    return [video.name, video.id, video.ownerName, video.role, ...(video.relationships || []).map((relationship) => relationship.ownerName), video.agentReview?.proposal?.description].join(" ").toLowerCase().includes(normalizedQuery);
  }), [dashboard, qualityFilter, query, quickSortSeenFilter, quickSortSourceFilter]);

  useEffect(() => {
    if (!selectedVideo) return;
    if (selectedVideo.humanVideoKey !== selectedKey) setSelectedKey(selectedVideo.humanVideoKey);
    editSerialRef.current = 0;
    setDraft(draftForVideo(selectedVideo));
    setAvatarChoice("");
    setReferenceDraft(EMPTY_REFERENCE);
    setSaveState("idle");
  }, [selectedVideo?.humanVideoKey, selectedVideo?.humanEnrichment?.revision]);

  useEffect(() => {
    if (saveState !== "dirty" || saving || !selectedVideo) return undefined;
    const timer = globalThis.setTimeout(() => save(), 350);
    return () => globalThis.clearTimeout(timer);
  }, [draft, saveState, saving, selectedVideo?.humanVideoKey]);

  function editDraft(updater) {
    editSerialRef.current += 1;
    setDraft(updater);
    setSaveState("dirty");
  }

  async function selectVideo(nextKey) {
    if (!nextKey || nextKey === selectedVideo?.humanVideoKey || saving) return;
    if (saveState === "dirty" && !(await save())) return;
    setSelectedKey(nextKey);
  }

  function switchLayout(nextLayout) {
    setLayout(nextLayout);
    try {
      const url = new URL(globalThis.location.href);
      if (nextLayout === "tiles" || nextLayout === "likeness") url.searchParams.set("layout", nextLayout);
      else url.searchParams.delete("layout");
      globalThis.history?.replaceState({}, "", url);
    } catch {
      // Layout switching still works in test and embedded contexts without a complete URL.
    }
  }

  function addAvatarMention() {
    const avatar = dashboard?.avatarOptions?.find((item) => item.id === avatarChoice);
    if (!avatar || draft.avatarMentions.some((mention) => mention.avatarId === avatar.id)) return;
    editDraft((current) => ({
      ...current,
      avatarMentions: [...current.avatarMentions, { avatarId: avatar.id, avatarName: avatar.name, mention: avatar.mention }],
    }));
    setAvatarChoice("");
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
    editDraft((current) => ({ ...current, references: [...current.references, reference] }));
    setReferenceDraft(EMPTY_REFERENCE);
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

  function applyAgentProposal(mode = "replace") {
    const review = selectedVideo?.agentReview;
    if (!review?.proposal) return;
    const proposal = review.proposal;
    editDraft((current) => ({
      ...current,
      description: mode === "append" ? appendText(current.description, proposal.description) : proposal.description || current.description,
      sourceAgentReviewId: review.id,
    }));
  }

  async function rejectAgentReview() {
    const review = selectedVideo?.agentReview;
    if (!review || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/human-enricher/agent-reviews/${encodeURIComponent(review.id)}/decision`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "x-hapa-actor-id": "human-enricher-ui" },
        body: JSON.stringify({ action: "rejected", notes: "Rejected from the Human Enricher validation surface." }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || `Review decision failed (${response.status})`);
      setDashboard((current) => ({ ...current, videos: current.videos.map((video) => video.humanVideoKey === selectedVideo.humanVideoKey ? { ...video, agentReview: payload.review } : video) }));
      onNotify(`Agent proposal rejected for ${selectedVideo.name}`);
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : String(decisionError));
    } finally {
      setSaving(false);
    }
  }

  async function decideQuickSortVideo(video, action) {
    if (!video || video.quickSortDecision || decidingKeysRef.current.has(video.humanVideoKey)) return;
    decidingKeysRef.current.add(video.humanVideoKey);
    setDecidingKeys((current) => new Set(current).add(video.humanVideoKey));
    setError("");
    const optimisticDecision = { videoKey: video.humanVideoKey, state: action, pending: true };
    setDashboard((current) => ({
      ...current,
      summary: applyQuickDecisionSummary(current.summary, action),
      videos: current.videos.map((candidate) => candidate.humanVideoKey === video.humanVideoKey ? { ...candidate, quickSortDecision: optimisticDecision } : candidate),
      pagination: quickSortSeenFilter === "unseen" ? removeOneFromPagination(current.pagination) : current.pagination,
    }));
    try {
      const response = await fetch(`${apiBase}/api/human-enricher/quick-sort/decisions`, {
        method: "POST",
        headers: { accept: "application/json", "content-type": "application/json", "x-hapa-actor-id": "human-enricher-quick-sort" },
        body: JSON.stringify({
          videoKey: video.humanVideoKey,
          videoId: video.id,
          videoName: video.name,
          aliases: video.humanVideoAliases,
          action,
          notes: action === "accepted" ? "Accepted during the Human Enricher Quick Sort first pass." : "Rejected during the Human Enricher Quick Sort first pass.",
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || `Quick-sort decision failed (${response.status})`);
      setDashboard((current) => ({
        ...current,
        videos: current.videos.map((candidate) => candidate.humanVideoKey === video.humanVideoKey ? { ...candidate, quickSortDecision: payload.decision } : candidate),
      }));
      onNotify(`${action === "accepted" ? "Accepted" : "Rejected"} ${video.name || video.id}`);
    } catch (decisionError) {
      setDashboard((current) => ({
        ...current,
        summary: revertQuickDecisionSummary(current.summary, action),
        videos: current.videos.map((candidate) => candidate.humanVideoKey === video.humanVideoKey ? { ...candidate, quickSortDecision: null } : candidate),
        pagination: quickSortSeenFilter === "unseen" ? addOneToPagination(current.pagination) : current.pagination,
      }));
      setError(decisionError instanceof Error ? decisionError.message : String(decisionError));
    } finally {
      decidingKeysRef.current.delete(video.humanVideoKey);
      setDecidingKeys((current) => {
        const next = new Set(current);
        next.delete(video.humanVideoKey);
        return next;
      });
    }
  }

  async function save() {
    if (!selectedVideo || saving) return false;
    const snapshot = draft;
    const saveSerial = editSerialRef.current;
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
          expectedRevision: snapshot.expectedRevision,
          quality: snapshot.quality,
          description: snapshot.description,
          categories: snapshot.categories,
          tags: snapshot.tags,
          avatarMentions: snapshot.avatarMentions,
          directorNotes: snapshot.directorNotes,
          references: snapshot.references,
          sourceAgentReviewId: snapshot.sourceAgentReviewId || undefined,
          sourceReferenceReviewId: snapshot.sourceReferenceReviewId || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || `Save failed (${response.status})`);
      setDashboard((current) => ({
        ...current,
        summary: payload.summary || current.summary,
        videos: current.videos.map((video) => video.humanVideoKey === selectedVideo.humanVideoKey
          ? { ...video, humanEnrichment: payload.record, agentReview: payload.reviewDecision || video.agentReview }
          : video),
      }));
      setDraft((current) => ({ ...current, expectedRevision: payload.record.revision, sourceAgentReviewId: "", sourceReferenceReviewId: "" }));
      setSaveState(editSerialRef.current === saveSerial ? "saved" : "dirty");
      return true;
    } catch (saveError) {
      setSaveState("error");
      setError(saveError instanceof Error ? saveError.message : String(saveError));
      return false;
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
        <div className="human-enricher-hero-actions">
          <div className="human-enricher-layout-toggle" role="group" aria-label="Human Enricher layout">
            <button type="button" aria-pressed={layout === "detail"} onClick={() => switchLayout("detail")}><ListVideo size={15} /> Detail</button>
            <button type="button" aria-pressed={layout === "tiles"} onClick={() => switchLayout("tiles")}><LayoutGrid size={15} /> Quick Sort</button>
            <button type="button" aria-pressed={layout === "likeness"} onClick={() => switchLayout("likeness")}><BadgeCheck size={15} /> Likeness</button>
          </div>
          <a className="hapa-btn" href="?view=human-enricher&compare=optical-benchmark"><Eye size={15} /> Compare 40-video benchmark</a>
          <button className="hapa-btn" type="button" onClick={() => load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "spin" : ""} /> Refresh videos
          </button>
        </div>
      </header>

      {error && <div className="human-enricher-error hapa-panel" role="alert">{error}</div>}

      {layout === "likeness" ? (
        <HumanEnricherLikenessLane apiBase={apiBase} onNotify={onNotify} />
      ) : layout === "detail" ? <>
      <div className="human-enricher-stats" aria-label="Human enrichment status">
        <Metric label="Known videos" value={dashboard?.summary?.videos || 0} icon={<FileVideo2 size={16} />} />
        <Metric label="Human enriched" value={dashboard?.summary?.enriched || 0} icon={<Sparkles size={16} />} />
        <Metric label="Ungraded" value={dashboard?.summary?.ungraded || 0} icon={<Star size={16} />} />
        <Metric label="Director notes" value={dashboard?.summary?.withDirectorNotes || 0} icon={<Clapperboard size={16} />} />
        <Metric label="@Avatar links" value={dashboard?.summary?.withAvatarMentions || 0} icon={<AtSign size={16} />} />
        <Metric label="References" value={dashboard?.summary?.withReferences || 0} icon={<Link2 size={16} />} />
        <Metric label="Agent reviewed" value={dashboard?.summary?.agentReviewed || 0} icon={<Bot size={16} />} />
        <Metric label="Needs human" value={dashboard?.summary?.pendingHumanValidation || 0} icon={<Eye size={16} />} />
        <Metric label="Optical queue" value={dashboard?.summary?.remainingOpticalReviews || 0} icon={<RefreshCw size={16} />} />
      </div>

      <OpticalCampaignStatus
        campaign={opticalCampaign}
        dashboardSummary={dashboard?.summary}
        error={opticalCampaignError}
        loading={opticalCampaignLoading}
        refreshedAt={opticalCampaignRefreshedAt}
      />

      <nav className="human-review-view-tabs hapa-panel" aria-label="Choose video review set">
        {HUMAN_VIDEO_REVIEW_FILTERS.map((filter) => (
          <button
            type="button"
            key={filter.value}
            aria-pressed={reviewFilter === filter.value}
            onClick={() => setReviewFilter(filter.value)}
          >
            <span>{filter.label}</span>
            <strong>{reviewFilterCount(filter.value, dashboard?.summary)}</strong>
          </button>
        ))}
      </nav>

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
            <select value={reviewFilter} onChange={(event) => setReviewFilter(event.target.value)} aria-label="Filter by optical review status">
              {HUMAN_VIDEO_REVIEW_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label} · {reviewFilterCount(filter.value, dashboard?.summary)}</option>)}
            </select>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort videos">
              <option value="quality-desc">Best quality first</option>
              <option value="needs-human">Needs human first</option>
              <option value="name">Name A–Z</option>
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
                onClick={() => selectVideo(video.humanVideoKey)}
              >
                <VideoPoster video={video} apiBase={apiBase} />
                <span className="human-video-row-copy">
                  <strong>{video.name || video.id}</strong>
                  <small>{video.ownerName || "System Media Library"} · {video.role || "video"}</small>
                  <span className="human-video-row-meta">
                    <i data-quality={video.humanEnrichment?.quality?.value ?? 0}>Q{video.humanEnrichment?.quality?.value ?? "—"}</i>
                    <i>{video.relationships?.length || 0} links</i>
                    {video.humanEnrichment?.directorNotes && <i>notes</i>}
                    {video.agentReview?.status === "pending-human" && <i>agent → human</i>}
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

              {selectedVideo.agentReview && (
                <section className="human-agent-proposal" data-status={selectedVideo.agentReview.status}>
                  <div className="human-enrichment-section-head">
                    <div><p className="eyebrow"><Bot size={13} /> MINIMAL OPTICAL PASS</p><h4>Description + three palettes · {selectedVideo.agentReview.status}</h4></div>
                    <span>First · Middle · Last</span>
                  </div>
                  <div className="human-agent-receipt">
                    <strong>{selectedVideo.agentReview.reviewer?.agentId || "vision-subagent"}</strong>
                    <span>{selectedVideo.agentReview.reviewer?.model || "vision model"}</span>
                    <span>{selectedVideo.agentReview.reviewer?.taskId || "task not recorded"}</span>
                    <span>Optical inspection {selectedVideo.agentReview.reviewer?.opticalInspectionConfirmed ? "attested" : "not attested"}</span>
                    <span>{formatPassAccounting(selectedVideo.agentReview.reviewer?.schedulerReceipt?.accounting, "Optical")}</span>
                  </div>
                  <div className="human-agent-filmstrip">
                    {(selectedVideo.agentReview.evidence?.frames || []).map((frame) => (
                      <figure key={frame.sha256}>
                        {(frame.imageUri || frame.imagePath) && <img src={mediaUri(frame.imageUri || frame.imagePath, apiBase)} alt={`Inspected frame at ${frame.timestampSeconds}s`} />}
                        <figcaption>
                          <strong>{frame.timestampSeconds.toFixed?.(2) ?? frame.timestampSeconds}s · {(frame.role || "frame").toUpperCase()}</strong>
                          {(frame.palette?.colors || []).length > 0 && (
                            <div className="human-frame-palette">
                              {frame.palette.colors.map((color) => <i key={`${frame.sha256}:${color.hex}`} style={{ backgroundColor: color.hex }} title={color.hex} aria-label={color.hex} />)}
                              <small>{frame.palette.colors.map((color) => color.hex).join(" · ")}</small>
                            </div>
                          )}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  <div className="human-agent-diagnosis">
                    <div><span>Overall description</span><p>{selectedVideo.agentReview.proposal?.description}</p></div>
                  </div>
                  {selectedVideo.agentReview.status === "pending-human" && <div className="human-agent-actions">
                    <button className="hapa-btn" data-intent="primary" type="button" onClick={() => applyAgentProposal("replace")}><CheckCircle2 size={14} /> Use description</button>
                    <button className="hapa-btn" type="button" onClick={() => applyAgentProposal("append")}><Sparkles size={14} /> Append description</button>
                    <button className="hapa-btn" type="button" onClick={rejectAgentReview}><XCircle size={14} /> Reject proposal</button>
                  </div>}
                  <p className="human-editor-hint"><Eye size={13} /> The optical worker returned no score, tags, diagnosis, notes, signals, references, or Card matches.</p>
                </section>
              )}

              <section className="human-enrichment-editor">
                <div className="human-enrichment-section-head">
                  <div><p className="eyebrow">01 · HUMAN QUALITY</p><h4>Optional human-only grade</h4></div>
                  <span>{selectedVideo.humanEnrichment ? `Human revision ${draft.expectedRevision}` : "No human grade yet"}</span>
                </div>
                <div className="human-quality-scale" role="radiogroup" aria-label="Video quality">
                  {HUMAN_VIDEO_QUALITY_GRADES.map((grade) => (
                    <button key={grade.value} type="button" role="radio" aria-checked={draft.quality === grade.value} className={draft.quality === grade.value ? "active" : ""} data-grade={grade.value} onClick={() => editDraft((current) => ({ ...current, quality: grade.value }))}>
                      <span>{grade.shortLabel}</span><strong>{grade.label}</strong>
                    </button>
                  ))}
                </div>
              </section>

              <section className="human-enrichment-editor">
                <div className="human-enrichment-section-head"><div><p className="eyebrow">DESCRIPTION & CATEGORIES</p><h4>Human-readable media understanding</h4></div><span>{draft.description.length}/12000</span></div>
                <textarea value={draft.description} maxLength={12000} onChange={(event) => editDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Describe what is visibly happening, the setting, subjects, composition, and likely editorial use." />
                <div className="human-taxonomy-fields">
                  <label><Tags size={13} /> Categories<input value={draft.categories.join(", ")} onChange={(event) => editDraft((current) => ({ ...current, categories: parseTextList(event.target.value) }))} placeholder="performance, environment, transition…" /></label>
                  <label><Tags size={13} /> Tags<input value={draft.tags.join(", ")} onChange={(event) => editDraft((current) => ({ ...current, tags: parseTextList(event.target.value) }))} placeholder="close-up, neon, handheld…" /></label>
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
                  {draft.avatarMentions.map((mention) => <span key={mention.avatarId}>{mention.mention}<button type="button" aria-label={`Remove ${mention.mention}`} onClick={() => editDraft((current) => ({ ...current, avatarMentions: current.avatarMentions.filter((item) => item.avatarId !== mention.avatarId) }))}>×</button></span>)}
                  {!draft.avatarMentions.length && <em>No human Avatar tags yet.</em>}
                </div>
              </section>

              <section className="human-enrichment-editor">
                <div className="human-enrichment-section-head"><div><p className="eyebrow">03 · DIRECTOR NOTES</p><h4>What should Echo State understand?</h4></div><span>{draft.directorNotes.length}/12000</span></div>
                <textarea value={draft.directorNotes} maxLength={12000} onChange={(event) => editDraft((current) => ({ ...current, directorNotes: event.target.value }))} placeholder="Example: Hold on the eye contact. Use this after the second chorus, not as an opener. The handheld shake is emotionally right; preserve it." />
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
                      <button type="button" aria-label={`Remove ${reference.label || "reference"}`} onClick={() => editDraft((current) => ({ ...current, references: current.references.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 size={13} /></button>
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
                <div>{saving ? <Loader2 size={16} className="spin" /> : <BadgeCheck size={16} />}<span>{saveState === "saved" ? "Human direction saved and director-readable." : saveState === "error" ? "Autosave failed—review the message above." : saveState === "dirty" ? "Saving your change automatically…" : "Agent values are the starting point. Move only what needs human correction."}</span></div>
                <span className="human-autosave-badge">Autosave on</span>
              </footer>
            </>
          ) : <div className="human-video-empty">No known video is available for enrichment.</div>}
        </main>
      </div>
      </> : (
        <main className="human-quick-sort" aria-label="Quick-sort video tiles">
          <header className="human-quick-sort-toolbar hapa-panel">
            <div>
              <p className="eyebrow"><LayoutGrid size={13} /> FIRST-PASS VIDEO SORT</p>
              <h3>Hover to preview. Keep or reject in one click.</h3>
              <p>Thumbs up keeps the video for detailed enrichment. Thumbs down records a media-triage rejection. Optical review is tracked separately.</p>
            </div>
            <div className="human-quick-sort-filters">
              <label className="search-box hapa-field"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a video…" /></label>
              <select value={quickSortSeenFilter} onChange={(event) => setQuickSortSeenFilter(event.target.value)} aria-label="Filter Quick Sort by seen state">
                <option value="unseen">Not seen yet</option>
                <option value="seen">Seen</option>
                <option value="all">All eligible</option>
              </select>
              <select value={quickSortSourceFilter} onChange={(event) => setQuickSortSourceFilter(event.target.value)} aria-label="Filter Quick Sort by source">
                <option value="all">All sources</option>
                {(dashboard?.quickSortSourceOptions || []).map((source) => <option key={source.value} value={source.value}>{source.label} · {source.count}</option>)}
              </select>
            </div>
            <div className="human-quick-sort-counts" aria-label="Quick Sort telemetry" aria-live="polite">
              <span><strong>{dashboard?.summary?.quickSortKnown || 0}</strong> known</span>
              <span data-state="seen"><strong>{dashboard?.summary?.quickSortSeen || 0}</strong> seen</span>
              <span data-state="unseen"><strong>{dashboard?.summary?.quickSortNotSeen || 0}</strong> not seen</span>
              <span><strong>{dashboard?.summary?.remainingOpticalReviews || 0}</strong> awaiting optical</span>
              <span data-state="accepted"><strong>{dashboard?.summary?.quickSortAccepted || 0}</strong> accepted</span>
              <span data-state="rejected"><strong>{dashboard?.summary?.quickSortRejected || 0}</strong> rejected</span>
            </div>
          </header>

          <div className="human-video-tile-grid">
            {quickSortVideos.map((video) => (
              <QuickSortVideoTile
                key={video.humanVideoKey}
                video={video}
                apiBase={apiBase}
                deciding={decidingKeys.has(video.humanVideoKey)}
                onDecide={decideQuickSortVideo}
              />
            ))}
          </div>

          {dashboard?.pagination?.hasMore && (
            <button className="human-video-load-more hapa-btn" type="button" disabled={loading} onClick={() => load({ append: true, offset: dashboard.pagination.nextOffset })}>
              {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Load 240 more candidates
            </button>
          )}
          {!quickSortVideos.length && <div className="human-video-empty hapa-panel">{quickSortSeenFilter === "unseen"
            ? "No unseen videos match these filters."
            : "No Quick Sort videos match these filters."}</div>}
        </main>
      )}
    </section>
  );
}

function emptyDraft() { return { quality: 0, description: "", categories: [], tags: [], avatarMentions: [], directorNotes: "", references: [], expectedRevision: 0, sourceAgentReviewId: "", sourceReferenceReviewId: "" }; }

function initialReviewFilter() {
  const requested = new URLSearchParams(globalThis.location?.search || "").get("review") || "all";
  return HUMAN_VIDEO_REVIEW_FILTERS.some((filter) => filter.value === requested) ? requested : "all";
}

function initialLayout() {
  const requested = new URLSearchParams(globalThis.location?.search || "").get("layout");
  return requested === "tiles" || requested === "likeness" ? requested : "detail";
}

function initialQuickSortSeenFilter() {
  return new URLSearchParams(globalThis.location?.search || "").get("seen") === "all" ? "all" : "unseen";
}

function initialQuickSortSourceFilter() {
  return new URLSearchParams(globalThis.location?.search || "").get("source") || "all";
}

function applyQuickDecisionSummary(summary = {}, action) {
  return {
    ...summary,
    quickSortAccepted: Number(summary?.quickSortAccepted || 0) + Number(action === "accepted"),
    quickSortRejected: Number(summary?.quickSortRejected || 0) + Number(action === "rejected"),
    quickSortSeen: Number(summary?.quickSortSeen || 0) + 1,
    quickSortNotSeen: Math.max(0, Number(summary?.quickSortNotSeen || 0) - 1),
  };
}

function revertQuickDecisionSummary(summary = {}, action) {
  return {
    ...summary,
    quickSortAccepted: Math.max(0, Number(summary?.quickSortAccepted || 0) - Number(action === "accepted")),
    quickSortRejected: Math.max(0, Number(summary?.quickSortRejected || 0) - Number(action === "rejected")),
    quickSortSeen: Math.max(0, Number(summary?.quickSortSeen || 0) - 1),
    quickSortNotSeen: Number(summary?.quickSortNotSeen || 0) + 1,
  };
}

function addOneToPagination(pagination = null) {
  if (!pagination) return pagination;
  const total = Number(pagination.total || 0) + 1;
  const returned = Number(pagination.returned || 0) + 1;
  const nextOffset = Number(pagination.nextOffset || 0) + 1;
  return { ...pagination, total, returned, nextOffset, hasMore: nextOffset < total };
}

function removeOneFromPagination(pagination = null) {
  if (!pagination) return pagination;
  const total = Math.max(0, Number(pagination.total || 0) - 1);
  const returned = Math.max(0, Number(pagination.returned || 0) - 1);
  const nextOffset = Math.max(0, Number(pagination.nextOffset || 0) - 1);
  return { ...pagination, total, returned, nextOffset, hasMore: nextOffset < total };
}

function draftForVideo(video) {
  const enrichment = video.humanEnrichment;
  return enrichment ? {
    quality: Number(enrichment.quality?.value || 0),
    description: enrichment.description || "",
    categories: enrichment.categories || [],
    tags: enrichment.tags || [],
    avatarMentions: enrichment.avatarMentions || [],
    directorNotes: enrichment.directorNotes || "",
    references: enrichment.references || [],
    expectedRevision: Number(enrichment.revision || 0),
    sourceAgentReviewId: "",
    sourceReferenceReviewId: "",
  } : emptyDraft();
}
function mediaUri(uri, apiBase) {
  if (!uri) return "";
  if (/^(https?:|data:|blob:|file:)/i.test(uri)) return uri;
  if (/^\/(Users|private|tmp)\//.test(uri)) return `${apiBase}/api/local-file?path=${encodeURIComponent(uri)}`;
  return `${apiBase}${uri.startsWith("/") ? "" : "/"}${uri}`;
}
function parseTextList(value) { return uniqueText(String(value || "").split(/[,\n]+/)); }
function uniqueText(values) { return [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))]; }
function uniqueBy(values, keyFor) { return [...new Map((values || []).filter(Boolean).map((value) => [keyFor(value), value])).values()]; }
function appendText(current, addition) { return [String(current || "").trim(), String(addition || "").trim()].filter(Boolean).join("\n\n"); }
function reviewFilterCount(filter, summary = {}) {
  if (filter === "agent-reviewed") return Number(summary?.agentReviewed || 0);
  if (filter === "pending-human") return Number(summary?.pendingHumanValidation || 0);
  if (filter === "accepted") return Number(summary?.quickSortAccepted || 0);
  if (filter === "human-validated") return Number(summary?.humanValidatedAgentReviews || 0);
  if (filter === "not-reviewed") return Number(summary?.remainingOpticalReviews || 0);
  return Number(summary?.videos || 0);
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
function OpticalCampaignStatus({ campaign = null, dashboardSummary = {}, error = "", loading = false, refreshedAt = null }) {
  const summary = campaign?.summary || campaign?.progress || {};
  const planning = campaign?.planning || {};
  const workers = Array.isArray(campaign?.workers) ? campaign.workers.map(normalizeCampaignWorker) : [];
  const model = campaign?.model || campaign?.workerModel || "Model unavailable";
  const effort = campaign?.reasoningEffort || campaign?.effort || "effort unavailable";
  const queued = finiteMetric(summary.queued, summary.queueDepth) ?? 0;
  const active = finiteMetric(summary.active, summary.activeWorkers) ?? 0;
  const capacity = finiteMetric(summary.capacity, summary.maxWorkers);
  const submitted = finiteMetric(summary.submitted, summary.completed) ?? 0;
  const failed = finiteMetric(summary.failed) ?? 0;
  const completing = finiteMetric(summary.completing) ?? 0;
  const expired = finiteMetric(summary.expiredLeases) ?? 0;
  const frameReady = finiteMetric(summary.frameReadyPlanned, summary.frameReady, summary.planned, planning.frameReadyPlanned);
  const missingFrameDeferrals = finiteMetric(summary.deferredMissingFrames, summary.deferred, planning.deferredMissingFrames);
  const legacyPaletteRepairs = finiteMetric(
    summary.legacyPaletteRepairs,
    summary.legacyRepairsRequired,
    summary.legacyProposalsNeedingPalette,
    planning.legacyPaletteRepairs,
    planning.legacyRepairsRequired,
    dashboardSummary?.legacyPaletteRepairs,
  );
  const telemetry = finiteMetric(summary.tokenTelemetryCaptured, summary.tokenTelemetryCapturedCount, summary.telemetryCaptured) ?? 0;
  const known = finiteMetric(dashboardSummary?.videos, planning.knownVideos);
  const compliant = finiteMetric(
    summary.compliantOpticalReviews,
    summary.paletteComplete,
    campaign?.compliantOpticalReviews,
    campaign?.paletteComplete,
    planning.compliantOpticalReviews,
    planning.paletteComplete,
    dashboardSummary?.compliantOpticalReviews,
    dashboardSummary?.paletteComplete,
  );
  const terminalInvalidMedia = finiteMetric(summary.terminalInvalidMedia, campaign?.terminalInvalidMedia, planning.terminalInvalidMedia, dashboardSummary?.terminalInvalidMedia) ?? 0;
  const resolved = finiteMetric(summary.catalogResolved, campaign?.catalogResolved) ?? (compliant == null ? null : compliant + terminalInvalidMedia);
  const planned = finiteMetric(summary.total, summary.totalJobs, planning.frameReadyPlanned, frameReady);
  const catalogPercent = percentage(compliant, known);
  const resolvedPercent = percentage(resolved, known);
  const plannedPercent = percentage(planned, known);
  const campaignPercent = percentage(submitted, planned);

  return (
    <aside className="human-agent-telemetry hapa-panel" aria-label="Optical agent work telemetry">
      <header className="human-agent-telemetry-head">
        <div>
          <p className="eyebrow"><Bot size={14} /> AGENT WORK TELEMETRY</p>
          <h3>First · Mid · Last optical + palette campaign</h3>
          <p>{campaign?.campaignId || "Campaign identity unavailable"} · {model} · {effort}</p>
        </div>
        <span className="human-agent-telemetry-live" data-state={error ? "error" : loading && !campaign ? "loading" : active > 0 ? "active" : "idle"} aria-live="polite" aria-atomic="true">
          {loading && !campaign ? <Loader2 size={13} className="spin" /> : <i aria-hidden="true" />}
          {error ? "Telemetry unavailable" : active > 0 ? `${active} agent${active === 1 ? "" : "s"} active` : "No active agents"}
        </span>
      </header>

      <div className="human-agent-campaign-progress">
        <CampaignProgress label="Full catalog resolved" value={resolved} total={known} percent={resolvedPercent} unavailableLabel="Resolved catalog total unavailable" />
        <CampaignProgress label="Direct optical + palette complete" value={compliant} total={known} percent={catalogPercent} unavailableLabel="Compliant optical total unavailable" />
        <CampaignProgress label="Campaign planned" value={planned} total={known} percent={plannedPercent} unavailableLabel="Planning coverage unavailable" />
        <CampaignProgress label="Planned work submitted" value={submitted} total={planned} percent={campaignPercent} unavailableLabel="Campaign completion unavailable" />
      </div>

      <div className="human-agent-campaign-counts" aria-label="Campaign work states">
        <span data-state="queued"><strong>{queued}</strong> queued</span>
        <span data-state="inspecting"><strong>{active}</strong> leased</span>
        <span data-state="finalizing"><strong>{completing}</strong> finalizing</span>
        <span data-state="submitted"><strong>{submitted}</strong> submitted</span>
        <span data-state="failed"><strong>{failed}</strong> failed</span>
        <span data-state={expired ? "failed" : "idle"}><strong>{expired}</strong> expired</span>
        <span><strong>{legacyPaletteRepairs ?? "—"}</strong> legacy palette repairs</span>
        <span><strong>{missingFrameDeferrals ?? "—"}</strong> missing-frame deferrals</span>
        <span data-state={terminalInvalidMedia ? "failed" : "idle"}><strong>{terminalInvalidMedia}</strong> invalid-media terminals</span>
        <span><strong>{telemetry}</strong> telemetry receipts</span>
        <span><strong>{capacity ?? "—"}</strong> worker capacity</span>
      </div>

      {error && <p className="human-agent-telemetry-error" role="status">{error}. The last successfully received campaign state remains visible where available.</p>}

      <section className="human-agent-worker-section" aria-label="Active and recent optical agents">
        <div className="human-agent-worker-title">
          <div><strong>Active & recent agents</strong><span>Named scheduler work receipts</span></div>
          <small>{refreshedAt ? `Updated ${formatRelativeTime(refreshedAt)}` : "Update time unavailable"}</small>
        </div>
        {workers.length > 0 ? (
          <div className="human-agent-worker-grid">
            {workers.map((worker, index) => <CampaignWorker key={worker.key || `${worker.name}:${index}`} worker={worker} />)}
          </div>
        ) : (
          <div className="human-agent-worker-empty">
            <Bot size={18} />
            <span>{campaign ? "No per-agent work rows were reported by this campaign response." : "Waiting for the campaign telemetry response."}</span>
          </div>
        )}
      </section>
    </aside>
  );
}

function CampaignProgress({ label, value, total, percent, unavailableLabel }) {
  const available = value != null && total != null && total > 0 && percent != null;
  return (
    <div>
      <span><strong>{label}</strong><small>{available ? `${value.toLocaleString()} / ${total.toLocaleString()} · ${percent}%` : unavailableLabel}</small></span>
      <progress max="100" value={available ? percent : 0} aria-label={label} aria-valuetext={available ? `${value} of ${total}, ${percent} percent` : unavailableLabel} />
    </div>
  );
}

function CampaignWorker({ worker }) {
  const knownProgress = worker.progressPercent != null;
  return (
    <article className="human-agent-worker-card" data-state={worker.state}>
      <header>
        <span className="human-agent-worker-identity"><Bot size={14} /><strong>{worker.name}</strong></span>
        <i>{worker.stateLabel}</i>
      </header>
      <div className="human-agent-worker-assignment">
        <span>Current / recent assignment</span>
        <strong title={worker.assignment}>{worker.assignment}</strong>
        <small>{worker.assignmentId}</small>
      </div>
      <div className="human-agent-frame-progress" aria-label={`${worker.name} frame inspection progress`}>
        {worker.frames.map((frame) => (
          <span key={frame.role} data-state={frame.state} title={`${frame.label}: ${frame.labelState}`}>
            <i>{frame.label.slice(0, 1)}</i><strong>{frame.label}</strong><small>{frame.labelState}</small>
          </span>
        ))}
      </div>
      <div className="human-agent-worker-progress">
        <span>{knownProgress ? `${worker.progressLabel} · ${worker.progressPercent}%` : worker.progressLabel}</span>
        {knownProgress ? <progress max="100" value={worker.progressPercent} aria-label={`${worker.name} progress`} /> : <i aria-hidden="true" />}
      </div>
      <footer>
        <span>{worker.attemptLabel}</span>
        <span data-freshness={worker.leaseState}>{worker.leaseLabel}</span>
        <span>{worker.pathLabel}</span>
        <span>{worker.telemetryLabel}</span>
        <span>{worker.updatedLabel}</span>
      </footer>
    </article>
  );
}

function normalizeCampaignWorker(input = {}, index = 0) {
  const rawState = String(input.lifecycleState || input.workState || input.state || input.phase || input.status || "").trim().toLowerCase();
  const state = normalizeWorkerState(rawState);
  const assignment = input.assignment && typeof input.assignment === "object" ? input.assignment : {};
  const lease = input.lease && typeof input.lease === "object" ? input.lease : {};
  const name = String(input.agentName || input.agentId || input.workerId || input.name || input.agentPath || "").trim() || "Agent identity unavailable";
  const videoName = String(input.videoName || assignment.videoName || assignment.name || assignment.label || "").trim();
  const videoId = String(input.videoId || input.videoKey || assignment.videoId || assignment.videoKey || assignment.id || "").trim();
  const frames = ["first", "mid", "last"].map((role) => normalizeWorkerFrame(input, role, state));
  const explicitPercent = finiteMetric(input.progressPercent, input.frameProgress?.percent, input.progress?.percent, input.progress?.percentage);
  const explicitCompleted = finiteMetric(input.completedFrames, input.frameProgress?.completed, input.progress?.completedFrames, input.progress?.completed);
  const reportedFrames = frames.filter((frame) => frame.state === "inspected" || frame.state === "complete").length;
  const allFramesReported = frames.every((frame) => frame.state !== "unreported" && frame.state !== "unavailable");
  const progressPercent = explicitPercent != null
    ? Math.max(0, Math.min(100, Math.round(explicitPercent)))
    : allFramesReported ? Math.round((reportedFrames / frames.length) * 100) : null;
  const completedFrames = explicitCompleted ?? (allFramesReported ? reportedFrames : null);
  const attempt = finiteMetric(input.attempt, input.progress?.attempt);
  const expiresAt = input.leaseExpiresAt || input.expiresAt || lease.expiresAt || null;
  const updatedAt = input.updatedAt || input.lastUpdatedAt || input.observedAt || null;
  const leaseFreshness = formatLeaseFreshness(expiresAt, state, input.leaseHealth || input.leaseFreshness, input.leaseRemainingMs);
  const telemetryStatus = String(input.telemetry?.status || input.schedulerTelemetry?.status || "").trim();
  return {
    key: String(input.id || input.workerId || input.agentId || input.agentPath || `${name}:${index}`),
    name,
    state,
    stateLabel: workerStateLabel(state, rawState),
    assignment: videoName || "Assignment unavailable",
    assignmentId: videoId || "Video identity unavailable",
    frames,
    progressPercent,
    progressLabel: completedFrames != null ? `${completedFrames}/${frames.length} frames reported` : "Progress unavailable",
    attemptLabel: attempt != null ? (attempt === 0 ? "Not attempted" : `Attempt ${attempt}`) : "Attempt unavailable",
    leaseLabel: leaseFreshness.label,
    leaseState: leaseFreshness.state,
    pathLabel: input.agentPath ? `Path ${input.agentPath}` : "Agent path unavailable",
    telemetryLabel: telemetryStatus ? formatPassAccounting({ ...input.telemetry, ...input.schedulerTelemetry }, "Optical") : "Optical receipt status unavailable",
    updatedLabel: updatedAt && Number.isFinite(Date.parse(updatedAt)) ? `Updated ${formatRelativeTime(new Date(updatedAt))}` : "Update time unavailable",
  };
}

function normalizeWorkerFrame(worker, role, workerState) {
  const label = role === "mid" ? "Mid" : role[0].toUpperCase() + role.slice(1);
  const frameProgress = worker.frameProgress;
  let raw = frameProgress && !Array.isArray(frameProgress) ? frameProgress[role] : null;
  if (Array.isArray(frameProgress)) raw = frameProgress.find((frame) => String(frame?.role || "").toLowerCase() === role);
  if (raw == null && Array.isArray(frameProgress?.frames)) raw = frameProgress.frames.find((frame) => String(frame?.role || "").toLowerCase() === role);
  if (raw == null && Array.isArray(worker.frames)) raw = worker.frames.find((frame) => String(frame?.role || "").toLowerCase() === role);
  const rawState = typeof raw === "string" ? raw : raw?.state || raw?.status || raw?.inspectionStatus || (raw?.inspected === true ? "inspected" : "");
  const normalized = String(rawState || "").trim().toLowerCase();
  const inspected = ["inspected", "viewed", "complete", "completed", "done", "submitted", "receipt-confirmed"].includes(normalized);
  const queued = ["queued", "pending", "waiting", "not-started"].includes(normalized);
  const inspecting = ["inspecting", "in-progress", "current", "active", "viewing"].includes(normalized);
  const failed = ["failed", "error"].includes(normalized);
  const unavailable = ["unavailable", "missing"].includes(normalized);
  const state = inspected ? "inspected" : queued ? "queued" : inspecting ? "inspecting" : failed ? "failed" : unavailable ? "unavailable" : normalized ? "unreported" : workerState === "queued" ? "queued" : "unreported";
  return { role, label, state, labelState: state === "inspected" ? "inspected" : state === "inspecting" ? "in progress" : state === "queued" ? "waiting" : state === "failed" ? "failed" : state === "unavailable" ? "unavailable" : "unreported" };
}

function normalizeWorkerState(value) {
  if (["claimed", "inspecting-frames"].includes(value)) return "inspecting";
  if (["drafting", "submitting", "completing"].includes(value)) return "finalizing";
  if (value === "completed") return "submitted";
  if (["retryable-failed", "lease-expired"].includes(value)) return "failed";
  if (value === "requeued") return "queued";
  if (["queued", "claiming", "inspecting", "finalizing", "submitted", "failed", "idle"].includes(value)) return value;
  return "unknown";
}

function workerStateLabel(state, rawState) {
  if (state === "unknown") return rawState ? `Unknown · ${rawState}` : "State unavailable";
  if (rawState === "retryable-failed") return "Failed · retryable";
  if (rawState === "lease-expired") return "Lease expired";
  if (rawState === "requeued") return "Queued · retry";
  return state[0].toUpperCase() + state.slice(1);
}

function formatLeaseFreshness(expiresAt, state, supplied, suppliedRemainingMs) {
  if (supplied && typeof supplied === "string") {
    const suppliedState = String(supplied).trim().toLowerCase();
    const remaining = finiteMetric(suppliedRemainingMs);
    const suffix = remaining != null && suppliedState !== "expired" ? ` · ${formatRelativeDuration(remaining)} left` : "";
    return { state: suppliedState || "reported", label: `Lease ${suppliedState || "reported"}${suffix}` };
  }
  if (expiresAt && Number.isFinite(Date.parse(expiresAt))) {
    const remainingMs = Date.parse(expiresAt) - Date.now();
    if (remainingMs <= 0) return { state: "expired", label: `Lease expired ${formatRelativeDuration(Math.abs(remainingMs))} ago` };
    return { state: "fresh", label: `Lease fresh · ${formatRelativeDuration(remainingMs)} left` };
  }
  if (["queued", "submitted", "failed", "idle"].includes(state)) return { state: "inactive", label: "No active lease" };
  return { state: "unknown", label: "Lease freshness unavailable" };
}

function finiteMetric(...values) {
  for (const value of values) {
    if (value == null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.max(0, parsed);
  }
  return null;
}

function percentage(value, total) {
  if (value == null || total == null || total <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((value / total) * 1_000) / 10));
}

function formatRelativeTime(value) {
  const timestamp = value instanceof Date ? value.getTime() : Date.parse(value);
  if (!Number.isFinite(timestamp)) return "at an unknown time";
  const elapsed = Math.max(0, Date.now() - timestamp);
  return elapsed < 5_000 ? "just now" : `${formatRelativeDuration(elapsed)} ago`;
}

function formatRelativeDuration(milliseconds) {
  const seconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}
function formatPassAccounting(accounting = {}, label = "Pass") {
  if (accounting?.status !== "captured") return `${label} accounting unavailable${accounting?.source ? ` · ${accounting.source}` : ""}`;
  const input = finiteMetric(accounting.inputTokens) ?? 0;
  const output = finiteMetric(accounting.outputTokens) ?? 0;
  const total = finiteMetric(accounting.totalTokens) ?? input + output;
  const elapsed = finiteMetric(accounting.wallClockMs, accounting.elapsedMs);
  const packet = finiteMetric(accounting.packetRecords);
  const stopped = accounting.stopReason ? ` · ${accounting.stopReason}` : "";
  const budget = accounting.budgetExceeded ? " · budget stopped" : "";
  return `${label}: ${input.toLocaleString()} in + ${output.toLocaleString()} out = ${total.toLocaleString()} total${elapsed != null ? ` · ${formatRelativeDuration(elapsed)}` : ""}${packet != null ? ` · packet ${packet}` : ""}${stopped}${budget}`;
}
function Meta({ label, value }) { return <div><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>; }
function QuickSortVideoTile({ video, apiBase, deciding = false, onDecide }) {
  const previewRef = useRef(null);
  const decisionState = video.quickSortDecision?.state || "unseen";
  const accepted = decisionState === "accepted";
  const rejected = decisionState === "rejected";
  const unseen = decisionState === "unseen";
  const title = video.name || video.id || "Untitled video";
  const previewUri = mediaUri(video.uri, apiBase);
  const posterUri = mediaUri(video.thumbnailUri, apiBase);

  function startPreview() {
    const preview = previewRef.current;
    if (!preview || !previewUri) return;
    const playback = preview.play();
    if (playback?.catch) playback.catch(() => {});
  }

  function stopPreview() {
    const preview = previewRef.current;
    if (!preview) return;
    preview.pause();
    try { preview.currentTime = 0; } catch { /* Some streams are not seekable before metadata loads. */ }
  }

  return (
    <article
      className="human-video-tile hapa-card"
      data-card-type="media"
      data-state={accepted ? "accepted" : rejected ? "rejected" : "pending"}
      onMouseEnter={startPreview}
      onMouseLeave={stopPreview}
    >
      <div className="human-video-tile-preview">
        {previewUri ? (
          <video
            ref={previewRef}
            src={previewUri}
            poster={posterUri}
            muted
            loop
            playsInline
            preload="none"
            tabIndex={0}
            aria-label={`Preview ${title}`}
            onFocus={startPreview}
            onBlur={stopPreview}
          />
        ) : posterUri ? <img src={posterUri} alt="" loading="lazy" /> : <FileVideo2 size={36} />}
        <span className="human-video-tile-status" data-state={accepted ? "accepted" : rejected ? "rejected" : "pending"}>
          {accepted ? <><BadgeCheck size={14} /> Accepted</> : rejected ? <><ThumbsDown size={14} /> Rejected</> : <><Eye size={14} /> Not seen</>}
        </span>
        {deciding && <span className="human-video-tile-busy"><Loader2 size={22} className="spin" /> Saving decision…</span>}
      </div>
      <div className="human-video-tile-copy">
        <strong title={title}>{title}</strong>
        <small>{video.ownerName || "System Media Library"} · {formatDuration(video.duration)}</small>
      </div>
      <div className="human-video-tile-actions">
        <button type="button" data-action="reject" aria-label={`Reject ${title}`} aria-pressed={rejected} disabled={!unseen || deciding} onClick={() => onDecide(video, "rejected")}>
          <ThumbsDown size={19} /><span>Reject</span>
        </button>
        <button type="button" data-action="accept" aria-label={`Accept ${title}`} aria-pressed={accepted} disabled={!unseen || deciding} onClick={() => onDecide(video, "accepted")}>
          <ThumbsUp size={19} /><span>{accepted ? "Accepted" : "Accept"}</span>
        </button>
      </div>
    </article>
  );
}
function VideoPoster({ video, apiBase }) {
  const poster = mediaUri(video.thumbnailUri, apiBase);
  return <span className="human-video-poster">{poster ? <img src={poster} alt="" loading="lazy" /> : <FileVideo2 size={24} />}</span>;
}
