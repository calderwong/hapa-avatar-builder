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
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  Star,
  Tags,
  Trash2,
  UserRoundCheck,
  XCircle,
} from "lucide-react";
import {
  HUMAN_VIDEO_QUALITY_GRADES,
  HUMAN_VIDEO_REVIEW_FILTERS,
  matchesHumanVideoReviewFilter,
} from "../domain/human-video-enrichment.js";

const EMPTY_REFERENCE = { type: "echo-song", id: "", label: "", uri: "", notes: "" };

export default function HumanEnricherView({ apiBase = "", onNotify = () => {} }) {
  const [dashboard, setDashboard] = useState(null);
  const [opticalCampaign, setOpticalCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [qualityFilter, setQualityFilter] = useState("all");
  const [reviewFilter, setReviewFilter] = useState(initialReviewFilter);
  const [sort, setSort] = useState("quality-desc");
  const [selectedKey, setSelectedKey] = useState("");
  const [draft, setDraft] = useState(emptyDraft());
  const [avatarChoice, setAvatarChoice] = useState("");
  const [referenceDraft, setReferenceDraft] = useState(EMPTY_REFERENCE);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState("idle");
  const editSerialRef = useRef(0);

  async function load({ preserveSelection = true, append = false, offset = 0 } = {}) {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ offset: String(offset), limit: "120", quality: qualityFilter, review: reviewFilter, sort });
      if (query.trim()) params.set("q", query.trim());
      const [response, campaignResult] = await Promise.all([
        fetch(`${apiBase}/api/human-enricher/videos?${params}`, { headers: { accept: "application/json" } }),
        fetch(`${apiBase}/api/human-enricher/optical-campaign`, { headers: { accept: "application/json" } })
          .then(async (campaignResponse) => campaignResponse.ok ? await campaignResponse.json() : null)
          .catch(() => null),
      ]);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || payload.error || `Human Enricher failed to load (${response.status})`);
      setOpticalCampaign(campaignResult);
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
  }, [apiBase, query, qualityFilter, reviewFilter, sort]);

  const filteredVideos = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (dashboard?.videos || []).filter((video) => {
      const grade = Number(video.humanEnrichment?.quality?.value ?? video.agentReview?.proposal?.quality?.value ?? 0);
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
    const referenceProposal = selectedVideo?.referenceReview?.proposal || {};
    const proposedMentions = (referenceProposal.avatarRelationships || []).map((relationship) => {
      const relationshipLabel = String(relationship.cardTitle || "").replace(/^@+/, "");
      const avatar = dashboard?.avatarOptions?.find((option) => option.id === relationship.cardId || option.name === relationshipLabel);
      return avatar ? { avatarId: avatar.id, avatarName: avatar.name, mention: avatar.mention } : null;
    }).filter(Boolean);
    const proposedReferences = (referenceProposal.matches || []).map((reference) => ({
      id: reference.cardId || "",
      type: "card",
      label: reference.cardTitle || reference.cardId || "",
      uri: "",
      notes: reference.explanation || "",
    }));
    editDraft((current) => ({
      ...current,
      quality: Number(proposal.quality?.value || current.quality),
      description: mode === "append" ? appendText(current.description, proposal.description) : proposal.description || current.description,
      categories: uniqueText([...(mode === "append" ? current.categories : []), ...(proposal.categories || [])]),
      tags: uniqueText([...(mode === "append" ? current.tags : []), ...(proposal.tags || [])]),
      avatarMentions: uniqueBy([...(mode === "append" ? current.avatarMentions : []), ...proposedMentions], (item) => item.avatarId),
      directorNotes: mode === "append"
        ? appendText(appendText(current.directorNotes, proposal.directorNotes), referenceProposal.directorNotes)
        : appendText(proposal.directorNotes, referenceProposal.directorNotes) || current.directorNotes,
      references: uniqueBy([...(mode === "append" ? current.references : []), ...proposedReferences], (item) => `${item.type}:${item.id || item.uri || item.label}`),
      sourceAgentReviewId: review.id,
      sourceReferenceReviewId: selectedVideo?.referenceReview?.id || "",
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
        <Metric label="Agent reviewed" value={dashboard?.summary?.agentReviewed || 0} icon={<Bot size={16} />} />
        <Metric label="Needs human" value={dashboard?.summary?.pendingHumanValidation || 0} icon={<Eye size={16} />} />
        <Metric label="Optical queue" value={dashboard?.summary?.remainingOpticalReviews || 0} icon={<RefreshCw size={16} />} />
        <Metric label="Calibration pairs" value={dashboard?.summary?.calibrationPairs || 0} icon={<BadgeCheck size={16} />} />
      </div>

      {opticalCampaign && <OpticalCampaignStatus campaign={opticalCampaign} />}

      {dashboard?.qualityCalibration?.sampleSize > 0 && (
        <aside className="human-calibration-strip hapa-panel" aria-label="Agent quality calibration">
          <strong>Human-calibrated agent prior</strong>
          <span>{Math.round(dashboard.qualityCalibration.exactMatchRate * 100)}% exact · {dashboard.qualityCalibration.meanAbsoluteError} mean absolute error · {dashboard.qualityCalibration.sampleSize} paired grades</span>
          <span>{dashboard.qualityCalibration.gradeBands.filter((band) => band.sampleSize).map((band) => `Q${band.agentQuality} → human ${band.humanAverage} (n${band.sampleSize})`).join(" · ")}</span>
        </aside>
      )}

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
                    <i data-quality={video.humanEnrichment?.quality?.value ?? video.agentReview?.proposal?.quality?.value ?? 0}>Q{video.humanEnrichment?.quality?.value ?? video.agentReview?.proposal?.quality?.value ?? "—"}</i>
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
                    <div><p className="eyebrow"><Bot size={13} /> OPTICAL PASS · NO KNOWLEDGE SEARCH</p><h4>Frame diagnosis · {selectedVideo.agentReview.status}</h4></div>
                    <span>{selectedVideo.agentReview.evidence?.inspectedFrameCount || 0} frames addressed</span>
                  </div>
                  <div className="human-agent-receipt">
                    <strong>{selectedVideo.agentReview.reviewer?.agentId || "vision-subagent"}</strong>
                    <span>{selectedVideo.agentReview.reviewer?.model || "vision model"}</span>
                    <span>{selectedVideo.agentReview.reviewer?.taskId || "task not recorded"}</span>
                    <span>Optical inspection {selectedVideo.agentReview.reviewer?.opticalInspectionConfirmed ? "attested" : "not attested"}</span>
                  </div>
                  <div className="human-agent-filmstrip">
                    {(selectedVideo.agentReview.evidence?.frames || []).map((frame) => (
                      <figure key={frame.sha256}>
                        {(frame.imageUri || frame.imagePath) && <img src={mediaUri(frame.imageUri || frame.imagePath, apiBase)} alt={`Inspected frame at ${frame.timestampSeconds}s`} />}
                        <figcaption>
                          <strong>{frame.timestampSeconds.toFixed?.(2) ?? frame.timestampSeconds}s · {(frame.role || "frame").toUpperCase()}</strong>
                          <span>{frame.observation}</span>
                          {(frame.palette?.colors || []).length > 0 && (
                            <div className="human-frame-palette">
                              {frame.palette.colors.map((color) => <i key={`${frame.sha256}:${color.hex}`} style={{ backgroundColor: color.hex }} title={`${color.hex} · ${color.label} · ${color.prevalence}`} aria-label={`${color.hex} ${color.label}`} />)}
                              <small>{frame.palette.colors.map((color) => color.hex).join(" · ")}</small>
                            </div>
                          )}
                          {frame.palette?.uncertainty && <small>{frame.palette.uncertainty}</small>}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                  <div className="human-agent-diagnosis">
                    <div><span>Proposed quality</span><strong>{selectedVideo.agentReview.proposal?.quality?.value ?? "—"}/5</strong><p>{selectedVideo.agentReview.proposal?.quality?.explanation}</p></div>
                    <div><span>Description</span><p>{selectedVideo.agentReview.proposal?.description}</p></div>
                    <div><span>Categories</span><p>{(selectedVideo.agentReview.proposal?.categories || []).join(" · ") || "None proposed"}</p></div>
                    <div><span>Uncertainty</span><p>{selectedVideo.agentReview.proposal?.uncertainty || "No uncertainty statement."}</p></div>
                  </div>
                  <section className="human-visual-reference-analysis" data-status="signals-only">
                    <div className="human-enrichment-section-head">
                      <div><p className="eyebrow"><Eye size={13} /> OPTICAL SIGNAL HANDOFF</p><h4>Visible clues for a later reference worker</h4></div>
                      <span>no Cards assigned here</span>
                    </div>
                    <p>{(selectedVideo.agentReview.proposal?.referenceSignals || selectedVideo.agentReview.proposal?.visualReferenceAnalysis?.observedSignals || []).join(" · ") || "No distinctive symbols, markings, text, palette, geometry, costume, objects, composition, or motifs were recorded."}</p>
                  </section>
                  {selectedVideo.agentReview.status === "pending-human" && <div className="human-agent-actions">
                    <button className="hapa-btn" data-intent="primary" type="button" onClick={() => applyAgentProposal("replace")}><CheckCircle2 size={14} /> Use as editable draft</button>
                    <button className="hapa-btn" type="button" onClick={() => applyAgentProposal("append")}><Sparkles size={14} /> Append suggestions</button>
                    <button className="hapa-btn" type="button" onClick={rejectAgentReview}><XCircle size={14} /> Reject proposal</button>
                  </div>}
                  <p className="human-editor-hint"><Eye size={13} /> Frames were delivered and addressed; this is not proof of identity or canon. Playback and human judgment remain required.</p>
                </section>
              )}

              {selectedVideo.referenceReview ? (
                <section className="human-agent-proposal" data-status={selectedVideo.referenceReview.status}>
                  <div className="human-enrichment-section-head">
                    <div><p className="eyebrow"><Link2 size={13} /> REFERENCE PASS · BOUNDED HAPA CARDS</p><h4>Card comparison · {selectedVideo.referenceReview.status}</h4></div>
                    <span>{selectedVideo.referenceReview.packet?.cardCount || 0} supplied Cards</span>
                  </div>
                  <div className="human-agent-receipt">
                    <strong>{selectedVideo.referenceReview.reviewer?.agentId || "reference-worker"}</strong>
                    <span>{selectedVideo.referenceReview.reviewer?.model || "model not recorded"}</span>
                    <span>{selectedVideo.referenceReview.reviewer?.reasoningEffort || "reasoning not recorded"}</span>
                    <span>{selectedVideo.referenceReview.packet?.profile}</span>
                    <span>{selectedVideo.referenceReview.packet?.referenceAtlas?.source || "Reference Atlas source not recorded"}</span>
                    <span>{selectedVideo.referenceReview.packet?.referenceAtlas?.runHash || "Atlas run not recorded"}</span>
                    <span>{Object.entries(selectedVideo.referenceReview.packet?.authorityCounts || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "Authority mix not recorded"}</span>
                    <span>{Object.entries(selectedVideo.referenceReview.packet?.reviewStatusCounts || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "Review status mix not recorded"}</span>
                    <span>{Object.entries(selectedVideo.referenceReview.packet?.canonStatusCounts || {}).map(([key, value]) => `${key} ${value}`).join(" · ") || "Canon status mix not recorded"}</span>
                    <span>{selectedVideo.referenceReview.packet?.digest}</span>
                  </div>
                  <p>{(selectedVideo.referenceReview.proposal?.observedSignals || []).join(" · ") || "No reference signals repeated."}</p>
                  <div className="human-relationship-list">
                    {(selectedVideo.referenceReview.proposal?.matches || []).map((match, index) => <span key={`${match.cardId}:${index}`}><strong>{match.cardTitle || match.cardId}</strong><small>{match.matchType} · {Math.round((match.confidence || 0) * 100)}%</small><small>Seen: {match.observedEvidence}</small><small>{match.explanation}</small><small>Packet Card: {match.cardId}</small></span>)}
                    {(selectedVideo.referenceReview.proposal?.avatarRelationships || []).map((match, index) => <span key={`avatar:${match.cardId}:${index}`}><strong>{avatarMentionLabel(match.cardTitle || match.cardId)}</strong><small>{match.relationship || "visible-subject"} · {Math.round((match.confidence || 0) * 100)}%</small><small>Seen: {match.observedEvidence}</small><small>{match.explanation}</small></span>)}
                  </div>
                  {(selectedVideo.referenceReview.proposal?.negativeFindings || []).length > 0 && <p className="human-reference-negative">No-match notes: {selectedVideo.referenceReview.proposal.negativeFindings.join(" · ")}</p>}
                  <p className="human-editor-hint">The worker could rank or reject supplied Cards only. The packet records the exact Reference Atlas run and authority mix; different models and parameters can rerun this pass without repeating optical inspection.</p>
                </section>
              ) : selectedVideo.agentReview ? (
                <section className="human-agent-proposal" data-status="needs-reference">
                  <div className="human-enrichment-section-head"><div><p className="eyebrow"><Link2 size={13} /> REFERENCE PASS</p><h4>Waiting for a bounded Hapa Card worker</h4></div><span>not run</span></div>
                  <p>No reference proposal exists yet. Historical reference guesses embedded in earlier optical records are not treated as this pass.</p>
                </section>
              ) : null}

              <section className="human-enrichment-editor">
                <div className="human-enrichment-section-head">
                  <div><p className="eyebrow">01 · HUMAN QUALITY</p><h4>Move the agent’s starting grade only when needed</h4></div>
                  <span>{selectedVideo.humanEnrichment ? `Human revision ${draft.expectedRevision}` : selectedVideo.agentReview?.proposal?.quality?.value ? `Agent start · Q${selectedVideo.agentReview.proposal.quality.value}` : "No agent grade yet"}</span>
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
    </section>
  );
}

function emptyDraft() { return { quality: 0, description: "", categories: [], tags: [], avatarMentions: [], directorNotes: "", references: [], expectedRevision: 0, sourceAgentReviewId: "", sourceReferenceReviewId: "" }; }

function initialReviewFilter() {
  const requested = new URLSearchParams(globalThis.location?.search || "").get("review") || "all";
  return HUMAN_VIDEO_REVIEW_FILTERS.some((filter) => filter.value === requested) ? requested : "all";
}

function avatarMentionLabel(value) {
  const label = String(value || "unknown").replace(/^@+/, "");
  return `@${label}`;
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
  } : { ...emptyDraft(), quality: Number(video.agentReview?.proposal?.quality?.value || 0) };
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
function OpticalCampaignStatus({ campaign = {} }) {
  const summary = campaign.summary || campaign.progress || campaign;
  const workers = campaign.workers || campaign.workerPool || {};
  const model = campaign.model || campaign.workerModel || workers.model || "Vision workers";
  const effort = campaign.reasoningEffort || campaign.effort || workers.reasoningEffort || workers.effort || "";
  const queued = Number(summary.queued ?? summary.queueDepth ?? 0);
  const active = Number(summary.active ?? summary.activeWorkers ?? workers.active ?? 0);
  const capacity = Number(summary.capacity ?? summary.maxWorkers ?? workers.capacity ?? 3) || 3;
  const submitted = Number(summary.submitted ?? summary.completed ?? 0);
  const failed = Number(summary.failed ?? 0);
  const completing = Number(summary.completing ?? 0);
  const expired = Number(summary.expiredLeases ?? 0);
  const frameReady = Number(summary.frameReadyPlanned ?? summary.frameReady ?? summary.planned ?? 0);
  const deferred = Number(summary.deferredMissingFrames ?? summary.deferred ?? 0);
  const telemetry = Number(summary.tokenTelemetryCaptured ?? summary.tokenTelemetryCapturedCount ?? summary.telemetryCaptured ?? 0);
  const boundTelemetry = Number(summary.tokenTelemetryBound ?? 0);
  const legacyTelemetry = Number(summary.legacyUnboundTelemetryCaptured ?? 0);
  return (
    <aside className="human-calibration-strip hapa-panel" aria-label="Optical review campaign status">
      <strong>Optical review campaign</strong>
      <span>{model}{effort ? ` · ${effort}` : ""}</span>
      <span>{queued} queued · {active} active of {capacity} · {completing} finalizing · {submitted} submitted · {failed} failed{expired ? ` · ${expired} expired` : ""}</span>
      <span>{frameReady} frame-ready planned · {deferred} deferred for missing frames · {telemetry} token telemetry receipts{telemetry ? ` (${boundTelemetry} bound${legacyTelemetry ? ` · ${legacyTelemetry} legacy-unbound` : ""})` : ""}</span>
    </aside>
  );
}
function Meta({ label, value }) { return <div><dt>{label}</dt><dd>{value || "Not recorded"}</dd></div>; }
function VideoPoster({ video, apiBase }) {
  const poster = mediaUri(video.thumbnailUri, apiBase);
  return <span className="human-video-poster">{poster ? <img src={poster} alt="" loading="lazy" /> : <FileVideo2 size={24} />}</span>;
}
