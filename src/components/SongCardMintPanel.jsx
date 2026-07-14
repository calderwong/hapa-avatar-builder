import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collectEmbeddedSongCardSnapshots } from "../domain/song-card-constituents.js";

export const SONG_CARD_MINT_UI_STATES = Object.freeze([
  "Up to date",
  "Changed",
  "Rendering",
  "Ready",
  "Minting",
  "Failed",
]);

export const SONG_CARD_MINT_GATES = Object.freeze([
  { id: "private-demo", label: "Private demo" },
  { id: "public-gate", label: "Public gate" },
]);

export const SONG_CARD_PRINT_EVENT = "hapa:song-card-print-request";

let localUiSessionBootstrap = null;

export function ensureSongCardLocalSession() {
  if (localUiSessionBootstrap) return localUiSessionBootstrap;
  const pending = fetch("/api/local-ui-session", {
    method: "POST",
    headers: { Accept: "application/json" },
    credentials: "same-origin",
  }).then(async (response) => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `Local Builder session failed (${response.status}).`);
    return payload;
  });
  const wrapped = pending.finally(() => {
    if (localUiSessionBootstrap === wrapped) localUiSessionBootstrap = null;
  });
  localUiSessionBootstrap = wrapped;
  return wrapped;
}

export async function songCardAdminFetch(input, init = {}) {
  const options = { ...init, credentials: init.credentials || "same-origin" };
  let response = await fetch(input, options);
  if (![401, 503].includes(response.status)) return response;
  const failure = await response.clone().json().catch(() => ({}));
  if (response.status === 503 && failure.error !== "admin_auth_not_configured") return response;
  try {
    await ensureSongCardLocalSession();
  } catch {
    return response;
  }
  response = await fetch(input, options);
  return response;
}

function array(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function editionNumber(value, fallback = 0) {
  const source = typeof value === "object" && value
    ? value.edition ?? value.editionNumber ?? value.number
    : value;
  const number = Number(source);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : fallback;
}

function displayValue(value) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (!value) return "";
  return value.label || value.title || value.name || value.family || value.reason || value.code || JSON.stringify(value);
}

function savedRevisionRows(project = {}, showGraph = {}) {
  const directionRevision = project.active_direction_script_variant?.fingerprint
    || project.active_direction_script_variant?.id
    || project.selected_direction_script_variant_id
    || showGraph?.directorV2?.variantHash
    || showGraph?.directorV2?.variantId;
  const currentId = String(directionRevision || project.revision || project.editorRevision || project.updated_at || "current");
  const current = { id: currentId, label: `Current · ${currentId}`, project, showGraph };
  const saved = array(project.savedRevisions || project.saved_revisions || project.revisions)
    .filter((row) => row && typeof row === "object")
    .map((row, index) => ({
      id: String(row.id || row.revision || row.editorRevision || `saved-${index + 1}`),
      label: String(row.label || row.title || row.name || row.revision || `Saved revision ${index + 1}`),
      project: row.project || row.snapshot?.project || row.snapshot || project,
      showGraph: row.showGraph || row.show_graph || row.snapshot?.showGraph || showGraph,
    }));
  return [current, ...saved.filter((row) => row.id !== current.id)];
}

function editionRows(payload = {}, card = {}) {
  const direct = array(payload.editions).length
    ? payload.editions
    : array(card.editions).length
      ? card.editions
      : array(card.musicVideoMints).length
        ? card.musicVideoMints
        : array(card.music_video_mints);
  return direct
    .map((edition, index) => normalizeSongCardEdition(edition, direct.length - index))
    .filter((edition) => edition.edition > 0)
    .sort((left, right) => right.edition - left.edition);
}

export function normalizeSongCardEdition(input = {}, fallbackEdition = 0) {
  const edition = editionNumber(input, fallbackEdition);
  const artifact = input.artifact || input.renderedArtifact || input.rendered || input.master || {};
  return {
    ...input,
    edition,
    id: input.id || input.mintId || input.mint_id || (edition ? `edition-${edition}` : ""),
    mintId: input.mintId || input.mint_id || input.id || "",
    mintedAt: input.mintedAt || input.minted_at || input.createdAt || "",
    gate: input.gate || input.releaseGate || input.release_gate || "private-demo",
    status: input.status || input.mintStatus || "ready",
    artifact,
  };
}

export function normalizeSongCardMintPayload(payload = {}) {
  const card = payload.songCard || payload.song_card || payload.card || payload;
  const editions = editionRows(payload, card);
  const latestEdition = editionNumber(
    payload.latestEdition
      ?? payload.latest_edition
      ?? card.latestEdition
      ?? card.latest_edition
      ?? card.latestMusicVideoMint
      ?? card.latest_music_video_mint,
    editions[0]?.edition || 0,
  );
  return {
    card,
    editions,
    latestEdition,
    latest: editions.find((edition) => edition.edition === latestEdition) || editions[0] || null,
  };
}

export function normalizeSongCardMintPlan(payload = {}) {
  const plan = payload.plan || payload.mintPlan || payload.mint_plan || payload;
  const semanticDiff = plan.semanticDiff || plan.semantic_diff || plan.diff || {};
  const dirtyRanges = array(plan.dirtyRanges).length
    ? plan.dirtyRanges
    : array(plan.dirty_ranges).length
      ? plan.dirty_ranges
      : array(semanticDiff.dirtyRanges || semanticDiff.dirty_ranges);
  const changedFamilies = array(plan.changedFamilies).length
    ? plan.changedFamilies
    : array(plan.changed_families).length
      ? plan.changed_families
      : array(semanticDiff.changedFamilies || semanticDiff.changed_families);
  const blockers = array(plan.blockers).length ? plan.blockers : array(plan.publicBlockers || plan.public_blockers);
  const reusableWork = array(plan.reusableWork).length ? plan.reusableWork : array(plan.reusable_work || plan.reuse);
  const changed = typeof plan.changed === "boolean"
    ? plan.changed
    : Boolean(dirtyRanges.length || changedFamilies.length || semanticDiff.changed || semanticDiff.summary);
  return {
    ...plan,
    id: plan.id || plan.planId || plan.plan_id || "",
    status: plan.status || plan.renderStatus || plan.render_status || (changed ? "changed" : "up-to-date"),
    changed,
    latestEdition: editionNumber(plan.latestEdition ?? plan.latest_edition),
    predictedEdition: editionNumber(plan.predictedEdition ?? plan.predicted_edition ?? plan.nextEdition ?? plan.next_edition),
    semanticDiff,
    dirtyRanges,
    changedFamilies,
    blockers,
    reusableWork,
    renderMasterPath: plan.renderMasterPath || plan.render_master_path || plan.artifact?.masterPath || plan.artifact?.path || "",
    posterPath: plan.posterPath || plan.poster_path || "",
  };
}

export function normalizeSongCardRenderExecutor(payload = {}) {
  const source = payload.renderExecutor
    || payload.render_executor
    || payload.plan?.renderExecutor
    || payload.plan?.render_executor
    || payload.remintCandidate?.renderExecutor
    || payload.remintCandidate?.render_executor
    || (Object.prototype.hasOwnProperty.call(payload, "available") ? payload : null)
    || {};
  return {
    available: source.available === true,
    configured: source.configured === true,
    status: String(source.status || (source.available === true ? "ready" : "unavailable")),
    reason: String(source.reason || (source.available === true ? "Renderer ready." : "No local render worker is connected.")),
    executionModel: String(source.executionModel || source.execution_model || ""),
    builtIn: source.builtIn === true || source.built_in === true || source.executionModel === "built-in-local",
  };
}

export function normalizeSongCardLocalRenderJob(payload = {}, candidateId = "") {
  const candidates = [
    payload.job,
    payload.localRenderJob,
    payload.local_render_job,
    payload.localRender,
    payload.local_render,
    ...array(payload.localRenderJobs || payload.local_render_jobs || payload.renderJobs || payload.render_jobs),
  ].filter((row) => row && typeof row === "object");
  const source = candidates.find((row) => !candidateId || String(row.candidateId || row.candidate_id || row.id || "") === String(candidateId)) || null;
  if (!source) return null;
  const progress = source.progress && typeof source.progress === "object" ? source.progress : {};
  const completed = Number(progress.completed ?? source.completed ?? 0);
  const total = Number(progress.total ?? source.total ?? 0);
  const percent = Number(progress.percent ?? source.percent ?? (total > 0 ? (completed / total) * 100 : 0));
  return {
    ...source,
    candidateId: String(source.candidateId || source.candidate_id || candidateId || ""),
    status: String(source.status || "queued"),
    stage: String(progress.stage || source.stage || source.status || "queued"),
    message: String(progress.message || source.message || ""),
    progress: {
      ...progress,
      completed: Number.isFinite(completed) ? completed : 0,
      total: Number.isFinite(total) ? total : 0,
      percent: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
    },
  };
}

export function songCardEditionArtifactUrl(songId, edition, ticket = "") {
  if (!songId || !editionNumber(edition)) return "";
  const base = `/api/song-cards/${encodeURIComponent(songId)}/editions/${editionNumber(edition)}/artifact/master`;
  return ticket ? `${base}?ticket=${encodeURIComponent(ticket)}` : base;
}

export function songCardEditionExportUrl(songId, edition) {
  if (!songId || !editionNumber(edition)) return "";
  return `/api/song-cards/${encodeURIComponent(songId)}/editions/${editionNumber(edition)}/export`;
}

function timelineRows(edition = {}) {
  const ledger = edition.temporalCardLedger || edition.temporal_card_ledger || edition.cardTimeline || edition.card_timeline || edition.cardLedger || edition.card_ledger || {};
  if (Array.isArray(ledger)) return ledger;
  const direct = array(ledger.cards).length ? ledger.cards : array(ledger.entries).length ? ledger.entries : array(edition.cards);
  if (direct.length) return direct;
  const graph = edition.showGraph || edition.show_graph || edition.directorShowGraph || edition.director_show_graph || null;
  return array(graph?.tracks).flatMap((track) => array(track.cards).map((card) => ({
    ...card,
    trackId: card.trackId || track.id,
    trackRole: card.trackRole || track.role,
  })));
}

function activeCardPriority(card = {}) {
  if (card.presented === true || card.primary === true || card.isPrimary === true) return 10000;
  const role = String(card.trackRole || card.role || card.track?.role || "").toLowerCase();
  const roleScore = role === "accent" || role === "effects" ? 300 : role === "visualizer" ? 200 : role === "foundation" || role === "media" ? 100 : 0;
  return roleScore + Number(card.layerIndex ?? card.visualization?.layerIndex ?? card.layer ?? 0);
}

export function cardsAtSongCardMintTime(edition = {}, timestampSeconds = 0) {
  const time = Math.max(0, Number(timestampSeconds) || 0);
  const active = timelineRows(edition)
    .map((card, index) => {
      const startSeconds = Number(card.startSeconds ?? card.start_sec ?? card.start ?? (card.startMs !== undefined ? Number(card.startMs) / 1000 : 0));
      const endValue = card.endSeconds ?? card.end_sec ?? card.end ?? (card.endMs !== undefined ? Number(card.endMs) / 1000 : undefined);
      const endSeconds = endValue === undefined || endValue === null ? Infinity : Number(endValue);
      return {
        ...card,
        cueInstanceId: card.cueInstanceId || card.cue_instance_id || card.id || `cue-${index}`,
        cardId: card.cardId || card.card_id || card.sourceCardId || card.source_card_id || card.media?.id || card.visualization?.sourceId || card.id || "",
        title: card.title || card.cardTitle || card.card_title || card.snapshot?.title || card.sourceSnapshot?.title || card.media?.title || card.visualization?.nativeKey || card.visualization?.sourceId || "Untitled card",
        startSeconds,
        endSeconds,
        _index: index,
        _priority: activeCardPriority(card),
      };
    })
    .filter((card) => card.knockedOut !== true && card.printable !== false && card.startSeconds <= time && card.endSeconds > time)
    .sort((left, right) => left._priority - right._priority || left._index - right._index)
    .map(({ _index, _priority, ...card }) => card);
  return {
    timestampSeconds: time,
    primary: active[active.length - 1] || null,
    active,
  };
}

export function deriveSongCardMintUiState({ plan = null, phase = "idle", error = "", gate = "private-demo", renderMasterPath = "" } = {}) {
  if (error || phase === "failed") return "Failed";
  if (phase === "minting") return "Minting";
  const status = String(plan?.status || "").toLowerCase();
  if (phase === "rendering" || status.includes("rendering") || status.includes("queued")) return "Rendering";
  if (!plan || !plan.changed) return plan ? "Up to date" : "Changed";
  const publicBlocked = gate === "public-gate" && array(plan.blockers).length > 0;
  if (!publicBlocked && String(renderMasterPath || plan.renderMasterPath || "").trim()) return "Ready";
  return "Changed";
}

export function explainSongCardMintReadiness({
  localSessionReady = false,
  plan = null,
  phase = "idle",
  gate = "private-demo",
  renderMasterPath = "",
  posterPath = "",
  selectedArtifactsReviewed = false,
  remintCandidate = null,
  renderAvailable = false,
  localRenderFailed = false,
  latestEdition = 0,
} = {}) {
  if (!localSessionReady) return "The Builder is establishing its secure local session. Minting will unlock automatically.";
  if (phase === "minting") return "The Builder is sealing the final video, Card timeline, telemetry, and lineage into the new immutable edition.";
  if (phase === "planning") return "The Builder is checking the saved edit and its mint plan. This usually takes only a moment.";
  if (localRenderFailed || remintCandidate?.status === "failed") {
    return "The final-video render stopped before completion. Choose Retry render to rebuild it from the same approved edit; no edition has been minted.";
  }
  if (["approved", "queued", "rendering"].includes(remintCandidate?.status) || phase === "rendering") {
    return "The final video is still rendering. Minting will unlock after the Builder verifies and binds the finished master and poster.";
  }
  if (remintCandidate?.status === "render-ready") {
    return "The final video is finished. The Builder is verifying and binding it to this exact mint plan now.";
  }
  if (!plan?.id) return "A mint plan is not ready yet. Choose Retry plan to check this saved edit again.";
  if (!plan.changed) {
    return latestEdition > 0
      ? `This saved edit already matches immutable Edition ${latestEdition}. Choose View Edition ${latestEdition} to watch it.`
      : "This saved edit has no mintable changes yet.";
  }
  if (gate === "public-gate" && array(plan.blockers).length > 0) {
    return "The Public gate still has unresolved release checks. Resolve them or choose Private demo in Advanced and recovery controls.";
  }
  if (!String(renderMasterPath || "").trim() || !String(posterPath || "").trim()) {
    if (remintCandidate?.status === "awaiting-approval" && renderAvailable) {
      return "A finished video has not been created yet. Choose Render next edition; minting unlocks automatically when that render is verified.";
    }
    if (!renderAvailable) {
      return "A verified final video is required, but the finishing renderer is not connected. Finished editions can still be viewed and exported below.";
    }
    return "A verified final video and poster are not bound yet. Render the next edition, or use recovery artifacts only if a completed render already exists.";
  }
  if (!selectedArtifactsReviewed) {
    return "The selected final video, poster, release choice, or editor revision changed after review. Choose Use recovery artifacts or Retry plan to verify them together.";
  }
  return "";
}

const styles = {
  panel: { border: "1px solid rgba(0,243,255,.28)", background: "#030711", color: "#e5edf8", padding: 10, fontFamily: "monospace", fontSize: 11 },
  row: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  block: { border: "1px solid rgba(148,163,184,.2)", background: "rgba(15,23,42,.72)", padding: 8, marginTop: 8 },
  label: { color: "#94a3b8", fontSize: 9, textTransform: "uppercase", letterSpacing: ".08em" },
  button: { background: "#111c31", border: "1px solid #4b6385", color: "#e5edf8", padding: "5px 8px", cursor: "pointer" },
  primary: { background: "#08364a", border: "1px solid #00f3ff", color: "#bdfbff", padding: "6px 9px", cursor: "pointer" },
  input: { minWidth: 240, flex: 1, background: "#02040a", border: "1px solid #41516c", color: "#f8fafc", padding: 6 },
};

export default function SongCardMintPanel({ songId, project, showGraph, compact = false, viewerOnly = false, onEditionChange, planningRevision = "" }) {
  const [songCard, setSongCard] = useState({ card: null, editions: [], latestEdition: 0, latest: null });
  const [plan, setPlan] = useState(null);
  const [remintCandidate, setRemintCandidate] = useState(null);
  const [renderExecutor, setRenderExecutor] = useState(null);
  const [localRenderJob, setLocalRenderJob] = useState(null);
  const [phase, setPhase] = useState("idle");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [planningError, setPlanningError] = useState("");
  const [planningStartedAt, setPlanningStartedAt] = useState(0);
  const [planningElapsedSeconds, setPlanningElapsedSeconds] = useState(0);
  const [gate, setGate] = useState("private-demo");
  const [renderMasterPath, setRenderMasterPath] = useState("");
  const [posterPath, setPosterPath] = useState("");
  const [localSessionReady, setLocalSessionReady] = useState(false);
  const revisionOptions = useMemo(() => savedRevisionRows(project, showGraph), [project, showGraph]);
  const [selectedRevisionId, setSelectedRevisionId] = useState("");
  const selectedRevision = revisionOptions.find((row) => row.id === selectedRevisionId) || revisionOptions[0];
  const selectedProject = selectedRevision?.project || project;
  const selectedShowGraph = selectedRevision?.showGraph || showGraph;
  const selectedCardSnapshots = useMemo(
    () => collectEmbeddedSongCardSnapshots({ project: selectedProject, showGraph: selectedShowGraph }),
    [selectedProject, selectedShowGraph],
  );
  const [selectedEdition, setSelectedEdition] = useState(0);
  const [editionDetails, setEditionDetails] = useState({});
  const [artifactTicket, setArtifactTicket] = useState("");
  const [exportingFormat, setExportingFormat] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const requestRef = useRef(null);
  const planningRequestRef = useRef(null);
  const planningSequenceRef = useRef(0);
  const activeAutoPlanKeyRef = useRef("");
  const completedAutoPlanKeysRef = useRef(new Set());
  const failedAutoPlanKeysRef = useRef(new Set());
  const planningInputRef = useRef(null);
  const playbackHeartbeatRef = useRef(null);
  const autoBoundCandidateRef = useRef("");
  const localRenderStartedRef = useRef("");
  const remintRefreshErrorRef = useRef("");
  const editionHistoryRef = useRef(null);
  const playbackSessionRef = useRef(`song-card-ui:${Date.now()}:${Math.random().toString(36).slice(2)}`);
  planningInputRef.current = {
    selectedProject,
    selectedShowGraph,
    selectedCardSnapshots,
  };

  const loadFlow = useCallback(async ({ source = "manual", autoKey = "", planningInput = null } = {}) => {
    if (source === "auto" && autoKey && activeAutoPlanKeyRef.current === autoKey && planningRequestRef.current) return false;
    planningRequestRef.current?.abort?.();
    if (!songId) {
      setError("Choose a Song Card before planning a mint.");
      setPlanningError("Choose a Song Card before planning a mint.");
      setPhase("failed");
      return false;
    }
    const controller = new AbortController();
    const sequence = planningSequenceRef.current + 1;
    planningSequenceRef.current = sequence;
    planningRequestRef.current = controller;
    activeAutoPlanKeyRef.current = autoKey;
    setPhase("planning");
    setPlanningStartedAt(Date.now());
    setPlanningElapsedSeconds(0);
    setPlanningError("");
    setError("");
    setNotice(viewerOnly ? "" : source === "auto"
      ? "Preparing Song Card options in the background. The saved edit is already safe and the editor remains available."
      : "Checking this saved edit now. This request will run once unless you choose Retry plan again.");
    const isCurrentRequest = () => planningSequenceRef.current === sequence && !controller.signal.aborted;
    try {
      const { selectedProject, selectedShowGraph, selectedCardSnapshots } = planningInput || planningInputRef.current || {};
      const base = `/api/song-cards/${encodeURIComponent(songId)}`;
      if (viewerOnly) {
        const cardResponse = await fetch(base, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal });
        const cardPayload = await cardResponse.json().catch(() => ({}));
        if (!cardResponse.ok) throw new Error(cardPayload.error || cardPayload.message || `Song Card request failed (${cardResponse.status}).`);
        if (!isCurrentRequest()) return false;
        const normalizedCard = normalizeSongCardMintPayload(cardPayload);
        setSongCard(normalizedCard);
        setSelectedEdition((current) => current || normalizedCard.latestEdition || normalizedCard.editions[0]?.edition || 0);
        setPlan(null);
        setPhase("idle");
        if (autoKey) completedAutoPlanKeysRef.current.add(autoKey);
        return true;
      }
      const [cardResponse, planResponse] = await Promise.all([
        fetch(base, { method: "GET", headers: { Accept: "application/json" }, signal: controller.signal }),
        songCardAdminFetch(`${base}/plan`, {
          method: "POST",
          headers: { Accept: "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({ project: selectedProject, showGraph: selectedShowGraph, cardSnapshots: selectedCardSnapshots }),
          signal: controller.signal,
        }),
      ]);
      const cardPayload = await cardResponse.json().catch(() => ({}));
      const planPayload = await planResponse.json().catch(() => ({}));
      if (!cardResponse.ok) throw new Error(cardPayload.error || cardPayload.message || `Song Card request failed (${cardResponse.status}).`);
      if (!planResponse.ok) throw new Error(planPayload.error || planPayload.message || `Mint plan failed (${planResponse.status}).`);
      if (!isCurrentRequest()) return false;
      const normalizedCard = normalizeSongCardMintPayload(cardPayload);
      const normalizedPlan = normalizeSongCardMintPlan(planPayload);
      setSongCard(normalizedCard);
      setPlan(normalizedPlan);
      setRemintCandidate(planPayload.remintCandidate || null);
      setRenderExecutor(normalizeSongCardRenderExecutor(planPayload));
      setLocalRenderJob(normalizeSongCardLocalRenderJob(planPayload, planPayload.remintCandidate?.id || ""));
      setRenderMasterPath(normalizedPlan.renderMasterPath || "");
      setPosterPath(normalizedPlan.posterPath || "");
      setSelectedEdition((current) => current || normalizedCard.latestEdition || normalizedCard.editions[0]?.edition || 0);
      setPhase(normalizedPlan.status.toLowerCase().includes("render") ? "rendering" : "idle");
      setNotice(source === "auto"
        ? "Song Card plan ready for the last saved edit. No extra planning request will run until another save or an explicit retry."
        : "Song Card plan ready for the selected saved edit.");
      if (autoKey) completedAutoPlanKeysRef.current.add(autoKey);
      return true;
    } catch (caught) {
      if (caught?.name === "AbortError" || !isCurrentRequest()) return false;
      const message = caught?.message || "Song Card mint planning failed.";
      if (autoKey) failedAutoPlanKeysRef.current.add(autoKey);
      setPlanningError(message);
      setError(message);
      setPhase("failed");
      setNotice("");
      return false;
    } finally {
      if (planningSequenceRef.current === sequence) {
        planningRequestRef.current = null;
        activeAutoPlanKeyRef.current = "";
        setPlanningStartedAt(0);
      }
    }
  }, [songId, viewerOnly]);

  const automaticPlanKey = [
    String(songId || "no-song"),
    String(selectedRevision?.id || "initial-revision"),
    String(planningRevision || "initial-load"),
    viewerOnly ? "viewer" : "editor",
  ].join(":");

  const reportPlaybackActivity = useCallback((active) => {
    songCardAdminFetch("/api/song-card-playback/activity", {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId: playbackSessionRef.current, songId, active }),
      keepalive: !active,
    }).catch(() => {});
  }, [songId]);

  const startPlaybackActivity = useCallback(() => {
    if (playbackHeartbeatRef.current) clearInterval(playbackHeartbeatRef.current);
    reportPlaybackActivity(true);
    playbackHeartbeatRef.current = setInterval(() => reportPlaybackActivity(true), 5000);
  }, [reportPlaybackActivity]);

  const stopPlaybackActivity = useCallback(() => {
    if (playbackHeartbeatRef.current) clearInterval(playbackHeartbeatRef.current);
    playbackHeartbeatRef.current = null;
    reportPlaybackActivity(false);
  }, [reportPlaybackActivity]);

  useEffect(() => () => stopPlaybackActivity(), [stopPlaybackActivity]);

  useEffect(() => {
    let canceled = false;
    ensureSongCardLocalSession().then(() => {
      if (canceled) return;
      setLocalSessionReady(true);
    }).catch((caught) => {
      if (canceled) return;
      setError(caught?.message || "The Builder could not establish a local session.");
      setPhase("failed");
    });
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    planningSequenceRef.current += 1;
    planningRequestRef.current?.abort?.();
    planningRequestRef.current = null;
    activeAutoPlanKeyRef.current = "";
    completedAutoPlanKeysRef.current = new Set();
    failedAutoPlanKeysRef.current = new Set();
    setSelectedRevisionId(revisionOptions[0]?.id || "");
    setPlanningError("");
    setPlanningStartedAt(0);
    setPlanningElapsedSeconds(0);
  }, [songId, viewerOnly]);

  useEffect(() => {
    if (revisionOptions[0]?.id && !revisionOptions.some((row) => row.id === selectedRevisionId)) {
      setSelectedRevisionId(revisionOptions[0].id);
    }
  }, [revisionOptions, selectedRevisionId]);

  useEffect(() => {
    if (phase !== "planning" || !planningStartedAt) return undefined;
    const updateElapsed = () => setPlanningElapsedSeconds(Math.max(0, Math.floor((Date.now() - planningStartedAt) / 1000)));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 250);
    return () => window.clearInterval(interval);
  }, [phase, planningStartedAt]);

  useEffect(() => {
    if (!localSessionReady || !songId || (!viewerOnly && !selectedRevision?.id)) return undefined;
    if (completedAutoPlanKeysRef.current.has(automaticPlanKey) || failedAutoPlanKeysRef.current.has(automaticPlanKey)) return undefined;
    if (planningRequestRef.current && activeAutoPlanKeyRef.current !== automaticPlanKey) {
      planningSequenceRef.current += 1;
      planningRequestRef.current.abort();
      planningRequestRef.current = null;
      activeAutoPlanKeyRef.current = "";
      setPhase("idle");
      setPlanningStartedAt(0);
      setNotice("A newer saved edit replaced the previous background check. Preparing only the latest revision.");
    }
    const scheduledPlanningInput = planningInputRef.current;
    const timeout = window.setTimeout(() => {
      if (completedAutoPlanKeysRef.current.has(automaticPlanKey) || failedAutoPlanKeysRef.current.has(automaticPlanKey)) return;
      loadFlow({ source: "auto", autoKey: automaticPlanKey, planningInput: scheduledPlanningInput });
    }, viewerOnly ? 0 : 600);
    return () => window.clearTimeout(timeout);
  }, [automaticPlanKey, loadFlow, localSessionReady, selectedRevision?.id, songId, viewerOnly]);

  useEffect(() => () => {
    planningSequenceRef.current += 1;
    planningRequestRef.current?.abort?.();
    requestRef.current?.abort?.();
  }, []);

  useEffect(() => {
    if (!localSessionReady || !remintCandidate?.id || !["awaiting-approval", "approved", "queued", "rendering", "failed"].includes(remintCandidate.status)) return undefined;
    let canceled = false;
    const refresh = () => songCardAdminFetch("/api/song-card-remints", { headers: { Accept: "application/json" } })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || payload.message || `Remint queue refresh failed (${response.status}).`);
        const next = array(payload.candidates).find((row) => row.id === remintCandidate.id);
        if (!canceled && next) setRemintCandidate(next);
        if (!canceled) {
          const localJob = normalizeSongCardLocalRenderJob(payload, remintCandidate.id);
          setRenderExecutor(normalizeSongCardRenderExecutor(payload));
          setLocalRenderJob(localJob);
          setError((current) => current === remintRefreshErrorRef.current ? "" : current);
          remintRefreshErrorRef.current = "";
          if (["approved", "queued", "rendering"].includes(next?.status)
            || ["queued", "rendering"].includes(String(localJob?.status || "").toLowerCase())) {
            setPhase("rendering");
          }
        }
      })
      .catch((caught) => {
        if (canceled) return;
        const message = caught?.message || "Remint queue refresh failed.";
        remintRefreshErrorRef.current = message;
        setError(message);
      });
    refresh();
    const interval = setInterval(refresh, 2000);
    return () => { canceled = true; clearInterval(interval); };
  }, [localSessionReady, remintCandidate?.id, remintCandidate?.status]);

  useEffect(() => {
    const candidateId = remintCandidate?.id || "";
    if (!localSessionReady || renderExecutor?.available !== true || !candidateId || !["queued", "rendering"].includes(remintCandidate.status)) return;
    if (localRenderStartedRef.current === candidateId) return;
    startLocalRender(candidateId, { announce: false }).catch((caught) => {
      setError(caught?.message || "The local finishing render could not be resumed.");
      setPhase("failed");
    });
  }, [localSessionReady, remintCandidate?.id, remintCandidate?.status, renderExecutor?.available]);

  const predictedEdition = plan?.predictedEdition || Math.max(songCard.latestEdition + (plan?.changed ? 1 : 0), 1);
  const localRenderFailed = Boolean(localRenderJob
    && localRenderJob.candidateId === remintCandidate?.id
    && String(localRenderJob.status).toLowerCase() === "failed");
  const renderFailed = localRenderFailed || remintCandidate?.status === "failed";
  const effectivePhase = renderFailed ? "failed" : ["approved", "queued", "rendering"].includes(remintCandidate?.status) ? "rendering" : phase;
  const renderAvailable = renderExecutor?.available === true;
  const localRenderPercent = Math.round(Number(localRenderJob?.progress?.percent || 0));
  const localRenderProgressLabel = localRenderJob
    ? `${String(localRenderJob.stage || localRenderJob.status || "rendering").replace(/[-_]+/g, " ")} · ${localRenderPercent}%`
    : "";
  const planningSlow = phase === "planning" && planningElapsedSeconds >= 10;
  const planStatusLabel = phase === "planning"
    ? `Preparing in background · ${planningElapsedSeconds}s`
    : planningError
      ? "Planning stopped · manual retry only"
      : plan?.id
        ? "Plan ready"
        : "Plan not prepared";
  const uiState = viewerOnly && !error ? (songCard.latestEdition ? "Up to date" : "Changed") : deriveSongCardMintUiState({ plan, phase: effectivePhase, error, gate, renderMasterPath });
  const publicBlocked = gate === "public-gate" && array(plan?.blockers).length > 0;
  const selectedArtifactsReviewed = Boolean(plan?.id
    && String(plan.renderMasterPath || "").trim() === renderMasterPath.trim()
    && String(plan.posterPath || "").trim() === posterPath.trim()
    && String(plan.gate || "private-demo") === gate);
  const confirmDisabled = effectivePhase === "minting" || effectivePhase === "planning" || effectivePhase === "rendering" || !plan?.changed || !renderMasterPath.trim() || !posterPath.trim() || !selectedArtifactsReviewed || publicBlocked;
  const confirmUnavailableReason = explainSongCardMintReadiness({
    localSessionReady,
    plan,
    phase: effectivePhase,
    gate,
    renderMasterPath,
    posterPath,
    selectedArtifactsReviewed,
    remintCandidate,
    renderAvailable,
    localRenderFailed,
    latestEdition: songCard.latestEdition,
  });
  const selectedEditionRecord = songCard.editions.find((edition) => edition.edition === selectedEdition) || songCard.latest;
  const selectedEditionDetail = editionDetails[selectedEditionRecord?.edition] || selectedEditionRecord || null;
  const activeCards = useMemo(
    () => cardsAtSongCardMintTime(selectedEditionRecord || {}, currentTime),
    [currentTime, selectedEditionRecord],
  );
  const artifactUrl = artifactTicket ? songCardEditionArtifactUrl(songId, selectedEditionRecord?.edition || selectedEdition, artifactTicket) : "";

  useEffect(() => {
    const edition = editionNumber(selectedEditionRecord);
    setArtifactTicket("");
    if (!localSessionReady || !songId || !edition) return undefined;
    const controller = new AbortController();
    songCardAdminFetch(`/api/song-cards/${encodeURIComponent(songId)}/editions/${edition}/artifact-ticket`, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ role: "master" }),
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || `Artifact authorization failed (${response.status}).`);
      setArtifactTicket(payload.ticket || "");
    }).catch((caught) => { if (caught?.name !== "AbortError") setError(caught?.message || "Artifact authorization failed."); });
    return () => controller.abort();
  }, [localSessionReady, selectedEditionRecord, songId]);

  useEffect(() => {
    const edition = editionNumber(selectedEditionRecord);
    if (!songId || !edition || editionDetails[edition]) return undefined;
    const controller = new AbortController();
    fetch(`/api/song-cards/${encodeURIComponent(songId)}/editions/${edition}`, { headers: { Accept: "application/json" }, signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || payload.message || `Edition detail failed (${response.status}).`);
        setEditionDetails((current) => ({ ...current, [edition]: payload }));
      })
      .catch((caught) => { if (caught?.name !== "AbortError") setError(caught?.message || "Edition detail failed."); });
    return () => controller.abort();
  }, [editionDetails, selectedEditionRecord, songId]);

  useEffect(() => {
    if (viewerOnly || remintCandidate?.status !== "render-ready" || !remintCandidate?.id) return;
    if (phase === "planning") return;
    if (autoBoundCandidateRef.current === remintCandidate.id) return;
    autoBoundCandidateRef.current = remintCandidate.id;
    bindRemintRenderForReview();
  }, [phase, remintCandidate?.id, remintCandidate?.status, viewerOnly]);

  function chooseEdition(edition) {
    const number = editionNumber(edition);
    const record = songCard.editions.find((candidate) => candidate.edition === number) || null;
    setSelectedEdition(number);
    setCurrentTime(0);
    onEditionChange?.(number, record);
  }

  function revealEdition(edition, announce = true) {
    const number = editionNumber(edition);
    if (!number) return;
    chooseEdition(number);
    if (announce) {
      setError("");
      setNotice(`Edition ${number} is selected below. Press Play to view the immutable final video.`);
    }
    setTimeout(() => editionHistoryRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
  }

  function stopBackgroundPlanning() {
    planningSequenceRef.current += 1;
    planningRequestRef.current?.abort?.();
    planningRequestRef.current = null;
    activeAutoPlanKeyRef.current = "";
    setPlanningStartedAt(0);
  }

  function beginExplicitPlanning(message) {
    stopBackgroundPlanning();
    const controller = new AbortController();
    const sequence = planningSequenceRef.current + 1;
    planningSequenceRef.current = sequence;
    planningRequestRef.current = controller;
    setPhase("planning");
    setPlanningStartedAt(Date.now());
    setPlanningElapsedSeconds(0);
    setPlanningError("");
    setError("");
    setNotice(message);
    return { controller, sequence };
  }

  async function cancelFlow() {
    stopBackgroundPlanning();
    requestRef.current?.abort?.();
    requestRef.current = null;
    try {
      if (plan?.id) {
        const response = await songCardAdminFetch(`/api/song-card-mint-jobs/${plan.id}`, {
          method: "DELETE",
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error(`Server cancellation failed (${response.status}).`);
      }
      setPhase("idle");
      setNotice("Mint plan canceled by the local service; immutable editions were not changed.");
    } catch (caught) {
      setError(caught?.message || "Mint cancellation failed.");
      setPhase("failed");
    }
  }

  async function reviewSelectedArtifacts() {
    if (!songId || phase === "planning") return;
    const planningRequest = beginExplicitPlanning("Checking the selected recovery artifacts once. The saved edit remains available while this runs.");
    try {
      const response = await songCardAdminFetch(`/api/song-cards/${encodeURIComponent(songId)}/plan`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ project: selectedProject, showGraph: selectedShowGraph, cardSnapshots: selectedCardSnapshots, renderMasterPath: renderMasterPath.trim(), posterPath: posterPath.trim(), gate }),
        signal: planningRequest.controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || `Mint plan failed (${response.status}).`);
      if (planningSequenceRef.current !== planningRequest.sequence || planningRequest.controller.signal.aborted) return;
      setPlan(normalizeSongCardMintPlan(payload));
      setRemintCandidate(payload.remintCandidate || null);
      setPhase("idle");
      setPlanningStartedAt(0);
      setNotice("Selected revision, master, poster, and release gate are bound to this mint plan.");
    } catch (caught) {
      if (caught?.name === "AbortError" || planningSequenceRef.current !== planningRequest.sequence) return;
      const message = caught?.message || "Mint plan review failed.";
      setPlanningError(message);
      setError(message);
      setPhase("failed");
      setPlanningStartedAt(0);
    } finally {
      if (planningSequenceRef.current === planningRequest.sequence) {
        planningRequestRef.current = null;
        setPlanningStartedAt(0);
      }
    }
  }

  function retryFlow() {
    if (phase === "planning") return;
    failedAutoPlanKeysRef.current.delete(automaticPlanKey);
    completedAutoPlanKeysRef.current.delete(automaticPlanKey);
    setPlanningError("");
    if (renderMasterPath.trim() || posterPath.trim()) reviewSelectedArtifacts();
    else loadFlow({ source: "manual", autoKey: automaticPlanKey });
  }

  async function startLocalRender(candidateId, { announce = true } = {}) {
    if (!candidateId) return null;
    localRenderStartedRef.current = candidateId;
    try {
      const response = await songCardAdminFetch(`/api/song-card-remints/${encodeURIComponent(candidateId)}/render-local`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || `Local render failed to start (${response.status}).`);
      setRenderExecutor(normalizeSongCardRenderExecutor(payload));
      setLocalRenderJob(normalizeSongCardLocalRenderJob(payload, candidateId));
      const nextCandidate = array(payload.candidates).find((row) => row.id === candidateId)
        || payload.remintCandidate
        || payload.remint_candidate;
      if (nextCandidate) setRemintCandidate(nextCandidate);
      if (announce) {
        setNotice(payload.started === false
          ? "The Builder found the existing local render job and resumed monitoring it."
          : "The Builder started the final HyperFrames render from this exact saved edit.");
      }
      return payload;
    } catch (caught) {
      localRenderStartedRef.current = "";
      throw caught;
    }
  }

  async function approveAndQueueRemint() {
    if (!remintCandidate?.id || !renderAvailable) return;
    setPhase("rendering");
    setError("");
    setNotice("");
    try {
      const headers = { Accept: "application/json", "Content-Type": "application/json" };
      const approveResponse = await songCardAdminFetch(`/api/song-card-remints/${encodeURIComponent(remintCandidate.id)}/approve`, {
        method: "POST",
        headers,
        body: JSON.stringify({ approvedBy: "operator:song-card-editor", reason: "operator-approved-next-mint-render" }),
      });
      const approved = await approveResponse.json().catch(() => ({}));
      if (!approveResponse.ok) throw new Error(approved.error || approved.message || `Remint approval failed (${approveResponse.status}).`);
      setRenderExecutor(normalizeSongCardRenderExecutor(approved));
      const enqueueResponse = await songCardAdminFetch("/api/song-card-remints/enqueue", { method: "POST", headers, body: "{}" });
      const queued = await enqueueResponse.json().catch(() => ({}));
      if (!enqueueResponse.ok) throw new Error(queued.error || queued.message || `Remint queue failed (${enqueueResponse.status}).`);
      setRenderExecutor(normalizeSongCardRenderExecutor(queued));
      const candidate = array(queued.candidates).find((row) => row.id === remintCandidate.id) || remintCandidate;
      setRemintCandidate(candidate);
      const localRender = await startLocalRender(remintCandidate.id, { announce: false });
      setPhase("idle");
      setNotice(localRender?.started === false
        ? `Next Mint Edition ${candidate.predictedEdition || predictedEdition} is already rendering locally; monitoring resumed.`
        : `Next Mint Edition ${candidate.predictedEdition || predictedEdition} is approved and rendering locally with one low-memory worker.`);
    } catch (caught) {
      setError(caught?.message || "Remint queue approval failed.");
      setPhase("failed");
    }
  }

  async function retryLocalRender() {
    const candidateId = remintCandidate?.id || "";
    if (!candidateId || !renderAvailable) return;
    localRenderStartedRef.current = "";
    setPhase("rendering");
    setError("");
    setNotice("");
    setLocalRenderJob((current) => current?.candidateId === candidateId ? {
      ...current,
      status: "queued",
      stage: "queued",
      message: "Restarting the Builder-managed final render…",
      error: null,
    } : current);
    try {
      const payload = await startLocalRender(candidateId, { announce: false });
      setPhase("idle");
      setNotice(payload?.started === false
        ? "The render retry is already running; monitoring has resumed."
        : `Retry started for Edition ${remintCandidate.predictedEdition || predictedEdition} from the same approved edit.`);
    } catch (caught) {
      setError(caught?.message || "The final-video render could not be retried.");
      setPhase("failed");
    }
  }

  async function cancelRemintCandidate() {
    if (!remintCandidate?.id) return;
    setError("");
    try {
      const response = await songCardAdminFetch(`/api/song-card-remints/${encodeURIComponent(remintCandidate.id)}/cancel`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ canceledBy: "operator:song-card-editor", reason: "operator-canceled-next-mint-render" }),
      });
      const queue = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(queue.error || queue.message || `Remint cancellation failed (${response.status}).`);
      setRemintCandidate(array(queue.candidates).find((row) => row.id === remintCandidate.id) || null);
      setLocalRenderJob(null);
      localRenderStartedRef.current = "";
      setPhase("idle");
      setNotice("Next Mint render candidate canceled; immutable editions were not changed.");
    } catch (caught) {
      setError(caught?.message || "Remint candidate cancellation failed.");
      setPhase("failed");
    }
  }

  async function bindRemintRenderForReview() {
    if (!remintCandidate?.id || phase === "planning") return;
    const planningRequest = beginExplicitPlanning("The final render is complete. Verifying its hashes and binding it to this exact saved edit once.");
    try {
      const response = await songCardAdminFetch(`/api/song-card-remints/${encodeURIComponent(remintCandidate.id)}/bind-render-plan`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ project: selectedProject, showGraph: selectedShowGraph, cardSnapshots: selectedCardSnapshots, gate }),
        signal: planningRequest.controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || `Rendered artifact review failed (${response.status}).`);
      if (planningSequenceRef.current !== planningRequest.sequence || planningRequest.controller.signal.aborted) return;
      const reviewedPlan = normalizeSongCardMintPlan(payload);
      setPlan(reviewedPlan);
      setRemintCandidate(payload.remintCandidate || remintCandidate);
      setRenderMasterPath(reviewedPlan.renderMasterPath || "");
      setPosterPath(reviewedPlan.posterPath || "");
      setPhase("idle");
      setPlanningStartedAt(0);
      setNotice("The queue's hashed master and poster are now bound to an exact mint plan. Review them, then confirm the edition separately.");
    } catch (caught) {
      if (caught?.name === "AbortError" || planningSequenceRef.current !== planningRequest.sequence) return;
      autoBoundCandidateRef.current = "";
      const message = caught?.message || "Rendered artifact review failed.";
      setPlanningError(message);
      setError(message);
      setPhase("failed");
      setPlanningStartedAt(0);
    } finally {
      if (planningSequenceRef.current === planningRequest.sequence) {
        planningRequestRef.current = null;
        setPlanningStartedAt(0);
      }
    }
  }

  async function confirmMint() {
    if (confirmDisabled) {
      setError("");
      setNotice(confirmUnavailableReason || "This edition is not ready to mint yet.");
      return;
    }
    const controller = new AbortController();
    requestRef.current = controller;
    setPhase("minting");
    setError("");
    setNotice("");
    try {
      const response = await songCardAdminFetch(`/api/song-cards/${encodeURIComponent(songId)}/mint`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(plan.id ? { "Idempotency-Key": plan.id } : {}),
          ...(plan.expectedHeadGeneration !== undefined ? { "If-Match": String(plan.expectedHeadGeneration) } : {}),
        },
        body: JSON.stringify({
          planId: plan.id,
          expectedEdition: predictedEdition,
          expectedHeadGeneration: plan.expectedHeadGeneration,
          gate,
          renderMasterPath: renderMasterPath.trim(),
          posterPath: posterPath.trim(),
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || payload.message || `Mint failed (${response.status}).`);
      const returned = normalizeSongCardMintPayload(payload);
      const minted = normalizeSongCardEdition(payload.edition || payload.mint || returned.latest || {}, predictedEdition);
      const editions = returned.editions.length
        ? returned.editions
        : [minted, ...songCard.editions.filter((edition) => edition.edition !== minted.edition)].sort((a, b) => b.edition - a.edition);
      const latestEdition = returned.latestEdition || minted.edition;
      setSongCard({
        card: returned.card || songCard.card,
        editions,
        latestEdition,
        latest: editions.find((edition) => edition.edition === latestEdition) || editions[0] || minted,
      });
      setPlan((current) => current ? { ...current, changed: false, latestEdition, predictedEdition: latestEdition, status: "up-to-date" } : current);
      setRemintCandidate((current) => current ? { ...current, status: "minted", mintedEdition: minted.edition, nextAction: "none" } : current);
      setSelectedEdition(minted.edition);
      setCurrentTime(0);
      setPhase("idle");
      setNotice(`Edition ${minted.edition} minted and opened below. Press Play to view the immutable final video. Earlier editions remain immutable.`);
      onEditionChange?.(minted.edition, minted);
      setTimeout(() => editionHistoryRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
    } catch (caught) {
      if (caught?.name === "AbortError") return;
      setError(caught?.message || "Song Card mint failed.");
      setPhase("failed");
    }
  }

  async function exportSelectedEdition(format) {
    if (!selectedEditionRecord || !["video", "bundle"].includes(format)) return;
    setExportingFormat(format);
    setError("");
    setNotice("");
    try {
      const response = await songCardAdminFetch(songCardEditionExportUrl(songId, selectedEditionRecord.edition), {
        method: "POST",
        headers: { Accept: "application/json, application/octet-stream, video/mp4", "Content-Type": "application/json" },
        body: JSON.stringify({ format }),
      });
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (contentType.includes("application/json")) {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || payload.message || `Export failed (${response.status}).`);
        if (payload.downloadUrl && typeof document !== "undefined") {
          const link = document.createElement("a");
          link.href = payload.downloadUrl;
          link.download = payload.fileName || "";
          document.body.appendChild(link);
          link.click();
          link.remove();
        }
        const label = format === "video" ? "MP4" : "Song Card bundle";
        setNotice(payload.downloadUrl
          ? `${label} export is ready and downloading.`
          : payload.fallbackUsed
            ? `${label} exported to the Builder's private fallback because Downloads was unavailable: ${payload.destination}.`
            : `${label} exported to ${payload.destination || "Downloads/Hapa Song Cards"}.`);
      } else {
        if (!response.ok) throw new Error(`Export failed (${response.status}).`);
        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const disposition = response.headers.get("content-disposition") || "";
        const matchedName = disposition.match(/filename\*?=(?:UTF-8''|\")?([^\";]+)/i)?.[1];
        link.href = objectUrl;
        link.download = matchedName ? decodeURIComponent(matchedName) : format === "video" ? `song-card-edition-${selectedEditionRecord.edition}.mp4` : `song-card-edition-${selectedEditionRecord.edition}.zip`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objectUrl);
        setNotice(`${format === "video" ? "MP4" : "Song Card bundle"} export is ready and downloading.`);
      }
    } catch (caught) {
      setError(caught?.message || "Song Card export failed.");
    } finally {
      setExportingFormat("");
    }
  }

  async function requestPrint(card) {
    if (!card || !selectedEditionRecord) return;
    try {
      const timestampSeconds = Number(currentTime.toFixed(3));
      const response = await songCardAdminFetch(`/api/song-cards/${encodeURIComponent(songId)}/editions/${selectedEditionRecord.edition}/print`, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({ timeMs: Math.round(timestampSeconds * 1000), appearanceId: card.appearanceId || card.cueInstanceId || "", surface: "song-card-viewer" }),
      });
      const printed = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(printed.error || printed.message || `Card print failed (${response.status}).`);
      const detail = {
        schemaVersion: "hapa.song-card.print-request.v1",
        songId,
        mintId: selectedEditionRecord.mintId || selectedEditionRecord.id || "",
        edition: selectedEditionRecord.edition,
        timestampSeconds,
        cueInstanceId: card.cueInstanceId || card.cueId || "",
        cardId: card.cardId || card.sourceCardId || card.id || "",
        primaryCardId: activeCards.primary?.cardId || activeCards.primary?.sourceCardId || activeCards.primary?.id || "",
        card: printed.card,
        printReceipt: printed.telemetry || null,
        activeCards: printed.active || activeCards.active,
      };
      if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent(SONG_CARD_PRINT_EVENT, { detail, cancelable: true }));
      }
      setNotice(`Printed ${printed.card?.title || card.title || card.cardId || "active card"} from Edition ${selectedEditionRecord.edition} at ${timestampSeconds.toFixed(3)}s.`);
    } catch (caught) {
      setError(caught?.message || "Song Card print failed.");
    }
  }

  return (
    <section data-testid="song-card-mint-panel" data-state={uiState} data-compact={compact ? "true" : "false"} style={{ ...styles.panel, maxHeight: compact ? 520 : 760, overflow: "auto" }}>
      <header style={{ ...styles.row, justifyContent: "space-between" }}>
        <div>
          <div style={styles.label}>Song Card Minting</div>
          <strong>{songCard.card?.title || project?.song_title || songId || "No Song Card"}</strong>
        </div>
        <div style={{ textAlign: "right" }}>
          <strong data-testid="song-card-mint-state" style={{ color: uiState === "Failed" ? "#fb7185" : uiState === "Ready" ? "#67e8f9" : "#f6c96d" }}>{uiState}</strong>
          <div style={styles.label}>Latest {songCard.latestEdition || "—"} · Next {predictedEdition || "—"}</div>
        </div>
      </header>

      {!viewerOnly && <div data-testid="song-card-guided-defaults" style={styles.block}>
        <div style={{ ...styles.row, justifyContent: "space-between" }}>
          <strong>Finish this music video</strong>
          <span style={styles.label}>{!localSessionReady ? "Connecting locally…" : renderAvailable ? "Renderer ready" : renderExecutor ? "Finishing renderer unavailable" : "Checking renderer…"}</span>
        </div>
        <p style={{ marginBottom: 5 }}>{renderAvailable
          ? "The Builder uses the current saved edit, renders into its managed workspace, creates the poster, and preserves the Card timeline automatically."
          : "The Builder has chosen the current saved edit and managed file locations. New-cut finishing is currently unavailable; finished editions can still be exported below."}</p>
        <div style={styles.label}>
          {selectedRevision?.label || "Current saved edit"} · {gate === "public-gate" ? "Public gate" : "Private demo"} · Builder-managed files
        </div>
        <div data-testid="song-card-mint-steps" style={{ ...styles.row, marginTop: 8, color: "#bdfbff" }}>
          <span>1 · Render final video</span>
          <span aria-hidden="true">→</span>
          <span>2 · Confirm mint</span>
          <span aria-hidden="true">→</span>
          <span>3 · View or export Edition</span>
        </div>
        {localSessionReady && renderExecutor && !renderAvailable && (
          <p data-testid="song-card-renderer-unavailable" role="status" style={{ color: "#f6c96d", margin: "8px 0 0" }}>
            <strong>Finishing renderer unavailable.</strong> {renderExecutor.reason}
          </p>
        )}
        <details data-testid="song-card-advanced-recovery" style={{ ...styles.block, marginTop: 9 }}>
          <summary style={{ cursor: "pointer" }}>Advanced and recovery controls</summary>
          <div style={{ ...styles.label, marginTop: 8 }}>Release choice</div>
          <div style={styles.row}>
            {SONG_CARD_MINT_GATES.map((choice) => (
              <label key={choice.id} style={{ ...styles.row, cursor: "pointer" }}>
                <input type="radio" name={`song-card-mint-gate-${songId}`} value={choice.id} checked={gate === choice.id} onChange={() => setGate(choice.id)} />
                {choice.label}
              </label>
            ))}
          </div>
          <label style={{ display: "block", marginTop: 8 }}>
            <span style={styles.label}>Saved editor revision</span>
            <select data-testid="song-card-saved-revision" style={styles.input} value={selectedRevision?.id || ""} onChange={(event) => setSelectedRevisionId(event.target.value)}>
              {revisionOptions.map((revision) => <option key={revision.id} value={revision.id}>{revision.label}</option>)}
            </select>
          </label>
          <p style={styles.label}>The fields below are only for recovering an existing render. Normal finishing never requires a file path.</p>
          <label style={{ display: "block", marginTop: 8 }}>
            <span style={styles.label}>Existing poster path</span>
            <input data-testid="song-card-poster-path" style={styles.input} value={posterPath} onChange={(event) => setPosterPath(event.target.value)} placeholder="Optional recovery path" />
          </label>
          <label style={{ display: "block", marginTop: 8 }}>
            <span style={styles.label}>Existing rendered master path</span>
            <input data-testid="song-card-render-master-path" style={styles.input} value={renderMasterPath} onChange={(event) => setRenderMasterPath(event.target.value)} placeholder="Optional recovery path" />
          </label>
          <div style={{ ...styles.row, marginTop: 8 }}>
            <button type="button" style={styles.button} disabled={!renderMasterPath.trim() || !posterPath.trim() || phase === "planning"} onClick={reviewSelectedArtifacts}>Use recovery artifacts</button>
            <button type="button" style={styles.button} onClick={cancelFlow}>Cancel current plan</button>
          </div>
        </details>
      </div>}

      {!viewerOnly && <div style={styles.block}>
        <div style={{ ...styles.row, justifyContent: "space-between" }}>
          <strong>Mint plan</strong>
          <div style={{ textAlign: "right" }}>
            <span
              data-testid="song-card-plan-status"
              role={planningError ? "alert" : "status"}
              aria-live="polite"
              style={{ ...styles.label, color: planningError ? "#fb7185" : phase === "planning" ? "#f6c96d" : "#94a3b8" }}
            >
              {planStatusLabel}
            </span>
            <div style={styles.label}>{plan?.id || "plan pending"}</div>
          </div>
        </div>
        {phase === "planning" && (
          <p data-testid="song-card-plan-wait" role="status" aria-live="polite" style={{ color: planningSlow ? "#f6c96d" : "#9cecff" }}>
            {planningSlow
              ? `Still preparing after ${planningElapsedSeconds}s. The saved edit is safe, this is running separately, and no duplicate request will be started.`
              : `Preparing the last saved edit once in the background · ${planningElapsedSeconds}s elapsed. You can keep using the editor.`}
          </p>
        )}
        {planningError && phase !== "planning" && (
          <p data-testid="song-card-plan-failure" role="alert" style={{ color: "#fb7185" }}>
            Planning stopped. The saved edit is safe and this failed request will not retry automatically. Choose Retry plan only when you want another attempt. {planningError}
          </p>
        )}
        <p>{displayValue(plan?.semanticDiff?.summary || plan?.semanticDiff?.reason) || (plan?.changed ? "The editor differs from the latest immutable edition." : "The editor matches the latest immutable edition.")}</p>
        <PlanList label="Dirty ranges" rows={plan?.dirtyRanges} />
        <PlanList label="Changed families" rows={plan?.changedFamilies} />
        <PlanList label="Reusable work" rows={plan?.reusableWork} />
        <PlanList label="Public blockers" rows={plan?.blockers} danger />
        {remintCandidate && <div data-testid="song-card-remint-candidate" style={{ ...styles.block, borderColor: "rgba(246,201,109,.45)" }}>
          <div style={{ ...styles.row, justifyContent: "space-between" }}>
            <strong>Next Mint render candidate · Edition {remintCandidate.predictedEdition || predictedEdition}</strong>
            <span style={styles.label}>{remintCandidate.status || "awaiting-approval"}</span>
          </div>
          <PlanList label="Change reasons" rows={remintCandidate.reasons} />
          <PlanList label="Bounded render ranges" rows={remintCandidate.dirtyRanges} />
          <PlanList label="Reusable decisions" rows={remintCandidate.reusableWork} />
          <PlanList label="Rendered artifacts" rows={remintCandidate.renderArtifacts} />
          {localRenderJob && localRenderJob.candidateId === remintCandidate.id && (
            <div data-testid="song-card-local-render-progress" role={localRenderFailed ? "alert" : "status"} aria-live="polite" style={{ marginTop: 8 }}>
              <div style={{ ...styles.row, justifyContent: "space-between" }}>
                <strong>Local HyperFrames finishing</strong>
                <span style={styles.label}>{localRenderProgressLabel}</span>
              </div>
              <div aria-hidden="true" style={{ height: 5, marginTop: 5, background: "#111827", overflow: "hidden" }}>
                <div style={{ width: `${localRenderPercent}%`, height: "100%", background: localRenderFailed ? "#fb7185" : "#00f3ff", transition: "width .25s ease" }} />
              </div>
              {localRenderJob.message && <p style={{ ...styles.label, margin: "6px 0 0" }}>{localRenderJob.message}</p>}
            </div>
          )}
          <p style={styles.label}>The Builder chooses the render and poster locations, then binds them automatically. Minting remains a separate confirmation.</p>
          <div style={styles.row}>
            {remintCandidate.status === "awaiting-approval" && <button type="button" data-testid="song-card-remint-approve" style={styles.primary} disabled={!localSessionReady || !renderAvailable} title={!renderAvailable ? renderExecutor?.reason || "Finishing renderer unavailable" : "Render with Builder-managed files"} onClick={approveAndQueueRemint}>Render next edition</button>}
            {renderFailed && <button type="button" data-testid="song-card-remint-retry" style={styles.primary} disabled={!localSessionReady || !renderAvailable || phase === "rendering"} title={!renderAvailable ? renderExecutor?.reason || "Finishing renderer unavailable" : "Retry this exact approved render"} onClick={retryLocalRender}>Retry render</button>}
            {remintCandidate.status === "render-ready" && <span data-testid="song-card-remint-auto-bind" style={styles.label}>Binding Builder-managed render…</span>}
            {remintCandidate.status === "render-ready" && error && <button type="button" data-testid="song-card-remint-bind" style={styles.button} onClick={bindRemintRenderForReview}>Retry automatic binding</button>}
            {["awaiting-approval", "approved", "queued", "rendering", "failed"].includes(remintCandidate.status) && <button type="button" data-testid="song-card-remint-cancel" style={styles.button} onClick={cancelRemintCandidate}>Cancel candidate</button>}
          </div>
        </div>}
        {publicBlocked && <p role="alert" style={{ color: "#fb7185" }}>Public gate is blocked. Resolve every blocker or choose Private demo explicitly.</p>}
        <p
          id={`song-card-mint-readiness-${songId}`}
          data-testid="song-card-mint-readiness"
          role="status"
          aria-live="polite"
          style={{ color: confirmDisabled ? "#f6c96d" : "#9cecff", margin: "8px 0" }}
        >
          <strong>{confirmDisabled ? "Not ready to mint. " : "Ready to mint. "}</strong>
          {confirmDisabled ? confirmUnavailableReason : `The verified final video and Card timeline will become immutable Edition ${predictedEdition}.`}
        </p>
        <div style={styles.row}>
          <button
            type="button"
            data-testid="song-card-confirm-mint"
            style={{ ...styles.primary, opacity: confirmDisabled ? 0.62 : 1, cursor: confirmDisabled ? "help" : "pointer" }}
            disabled={effectivePhase === "minting"}
            aria-disabled={confirmDisabled}
            aria-describedby={`song-card-mint-readiness-${songId}`}
            title={confirmDisabled ? confirmUnavailableReason : `Seal immutable Edition ${predictedEdition}`}
            onClick={confirmMint}
          >
            {effectivePhase === "minting" ? `Minting Edition ${predictedEdition}…` : `Confirm mint Edition ${predictedEdition}`}
          </button>
          {songCard.latestEdition > 0 && (
            <button type="button" data-testid="song-card-view-latest" style={styles.button} onClick={() => revealEdition(songCard.latestEdition)}>
              View Edition {songCard.latestEdition}
            </button>
          )}
          <button type="button" data-testid="song-card-plan-retry" style={styles.button} disabled={phase === "planning"} onClick={retryFlow}>
            {phase === "planning" ? `Planning… ${planningElapsedSeconds}s` : "Retry plan"}
          </button>
        </div>
      </div>}

      {(error || notice) && <p role={error ? "alert" : "status"} style={{ color: error ? "#fb7185" : "#9cecff" }}>{error || notice}</p>}

      <div ref={editionHistoryRef} data-testid="song-card-edition-history" style={styles.block}>
        <div style={{ ...styles.row, justifyContent: "space-between" }}>
          <strong>Immutable edition history</strong>
          <span style={styles.label}>{songCard.editions.length} editions</span>
        </div>
        <div style={{ ...styles.row, marginTop: 6 }}>
          {songCard.editions.map((edition) => (
            <button key={edition.id || edition.edition} type="button" style={edition.edition === selectedEdition ? styles.primary : styles.button} onClick={() => chooseEdition(edition.edition)}>
              Edition {edition.edition} · {edition.gate === "public-gate" ? "Public" : "Private"}
            </button>
          ))}
          {!songCard.editions.length && <span style={styles.label}>No minted editions yet.</span>}
        </div>
        {selectedEditionRecord && (
          <div style={{ marginTop: 8 }}>
            <div data-testid="song-card-export-actions" style={{ ...styles.row, marginBottom: 8 }}>
              <button
                type="button"
                data-testid="song-card-export-video"
                style={styles.primary}
                disabled={Boolean(exportingFormat) || !localSessionReady}
                onClick={() => exportSelectedEdition("video")}
              >
                {exportingFormat === "video" ? "Exporting MP4…" : "Export MP4"}
              </button>
              <button
                type="button"
                data-testid="song-card-export-bundle"
                style={styles.button}
                disabled={Boolean(exportingFormat) || !localSessionReady}
                onClick={() => exportSelectedEdition("bundle")}
              >
                {exportingFormat === "bundle" ? "Exporting Song Card…" : "Export Song Card"}
              </button>
              <span style={styles.label}>Saved automatically · Downloads preferred · private fallback</span>
            </div>
            <video
              key={`${songId}:${selectedEditionRecord.edition}`}
              data-testid="song-card-edition-video"
              controls
              preload="metadata"
              src={artifactUrl || undefined}
              style={{ display: "block", width: "100%", maxHeight: compact ? 220 : 360, background: "#000" }}
              onTimeUpdate={(event) => setCurrentTime(Number(event.currentTarget.currentTime || 0))}
              onSeeked={(event) => setCurrentTime(Number(event.currentTarget.currentTime || 0))}
              onPlay={startPlaybackActivity}
              onPause={stopPlaybackActivity}
              onEnded={stopPlaybackActivity}
              onError={stopPlaybackActivity}
            />
            <div style={{ ...styles.row, marginTop: 7, justifyContent: "space-between" }}>
              <span>Edition {selectedEditionRecord.edition} · {currentTime.toFixed(3)}s</span>
              <span style={styles.label}>{activeCards.active.length} active cards</span>
            </div>
            <div data-testid="song-card-active-cards" style={{ marginTop: 6 }}>
              {activeCards.primary ? (
                <button type="button" data-appearance-id={activeCards.primary.appearanceId || ""} style={styles.primary} onClick={() => requestPrint(activeCards.primary)}>
                  Print primary · {activeCards.primary.title}
                </button>
              ) : <span style={styles.label}>No printable card at this timestamp.</span>}
              {activeCards.active.length > 1 && (
                <div style={{ ...styles.row, marginTop: 6 }}>
                  {activeCards.active.map((card) => (
                    <button key={card.cueInstanceId || card.cardId} type="button" data-appearance-id={card.appearanceId || ""} style={styles.button} onClick={() => requestPrint(card)}>
                      Print {card.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <details data-testid="song-card-edition-custody" style={{ ...styles.block, marginTop: 8 }}>
              <summary style={{ cursor: "pointer" }}>Edition manifest, lineage, telemetry, and semantic diff</summary>
              <EditionTruth label="Public manifest" value={selectedEditionDetail?.manifest || selectedEditionDetail?.publicManifest || selectedEditionDetail} />
              <EditionTruth label="Lineage" value={selectedEditionDetail?.lineage || selectedEditionRecord?.lineage} />
              <EditionTruth label="Telemetry" value={selectedEditionDetail?.telemetry || selectedEditionDetail?.manifest?.telemetry || selectedEditionRecord?.telemetry} />
              <EditionTruth label="Semantic diff" value={selectedEditionDetail?.semanticDiff || selectedEditionRecord?.semanticDiff || { semanticFingerprint: selectedEditionRecord?.semanticFingerprint, sourceRevision: selectedEditionRecord?.sourceRevision }} />
            </details>
          </div>
        )}
      </div>
    </section>
  );
}

function EditionTruth({ label, value }) {
  if (!value) return null;
  return (
    <div style={{ marginTop: 7 }}>
      <div style={styles.label}>{label}</div>
      <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", maxHeight: 180, overflow: "auto", margin: "3px 0 0", color: "#cbd5e1" }}>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

function PlanList({ label, rows = [], danger = false }) {
  const values = array(rows);
  if (!values.length) return null;
  return (
    <div style={{ margin: "6px 0" }}>
      <div style={{ ...styles.label, color: danger ? "#fb7185" : styles.label.color }}>{label}</div>
      <ul style={{ margin: "3px 0 0", paddingLeft: 18 }}>
        {values.map((row, index) => <li key={`${label}-${index}`}>{displayValue(row)}</li>)}
      </ul>
    </div>
  );
}
