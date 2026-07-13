import {
  claimAlbumJobs,
  createAlbumBatch,
  recordAlbumJobResult,
  resumeAlbumBatch,
} from "./album-batch-orchestrator.js";
import {
  diffSongCardMintSnapshots,
  fingerprintSongCardMintSnapshot,
} from "./song-card-mint.js";
import { contextHash } from "./song-context-packet.js";

export const SONG_CARD_REMINT_QUEUE_SCHEMA = "hapa.song-card.remint-queue.v1";
export const SONG_CARD_REMINT_CANDIDATE_SCHEMA = "hapa.song-card.remint-candidate.v1";
export const SONG_CARD_REMINT_RELEASE_RECEIPT_SCHEMA = "hapa.song-card.remint-release-export-receipt.v1";

const REVISION_KINDS = ["source", "capability", "renderer", "editor"];
const TERMINAL_CANDIDATE_STATES = new Set(["rejected", "canceled", "superseded"]);

function at(value) {
  return String(value || new Date().toISOString());
}

function clone(value) {
  return structuredClone(value);
}

function text(value) {
  return value === undefined || value === null ? "" : String(value);
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableValue(value[key])]));
}

function stableHash(value) {
  return contextHash(stableValue(value));
}

function safeId(value, fallback = "next-mint") {
  const normalized = text(value).trim().replace(/[^A-Za-z0-9._:-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized || fallback;
}

function durationMs(snapshot = {}) {
  return Math.max(0, Math.round(Number(
    snapshot?.showGraph?.song?.durationSeconds
      ?? snapshot?.editor?.duration
      ?? snapshot?.editor?.durationSeconds
      ?? 0,
  ) * 1000));
}

function revisionReasons(minted = {}, current = {}) {
  return REVISION_KINDS.flatMap((kind) => {
    const before = text(minted[kind]);
    const after = text(current[kind]);
    if (before === after) return [];
    return [{
      kind: `${kind}-revision-change`,
      family: kind,
      before: before || null,
      after: after || null,
      reason: `${kind} revision changed from ${before || "unminted"} to ${after || "unknown"}`,
    }];
  });
}

function fullRangeFor(snapshot, reason) {
  const endMs = durationMs(snapshot);
  return endMs > 0 ? [{ startMs: 0, endMs, reason, reasons: [reason] }] : [];
}

function remintReuse(semanticDiff, reasons, latestEdition) {
  const revisionFamilies = new Set(reasons.filter((row) => row.kind.endsWith("-revision-change")).map((row) => row.family));
  const semanticFamilies = new Set(semanticDiff.changedFamilies || []);
  const rendererOnly = (revisionFamilies.size > 0 || semanticFamilies.size > 0)
    && [...revisionFamilies].every((family) => family === "renderer" || family === "capability")
    && [...semanticFamilies].every((family) => family === "renderer");
  const reuse = new Set(semanticDiff.reusableWork || []);
  if (rendererOnly) {
    reuse.add("editorial-treatment");
    reuse.add("cue-graph");
    reuse.add("semantic-ranking");
    reuse.add("director-decision-envelope");
  }
  const reuseDecisionEnvelope = Number(latestEdition || 0) > 0
    && (rendererOnly || reuse.has("director-decision-envelope"));
  return {
    rendererOnly,
    reuseDecisionEnvelope,
    reusableWork: [...reuse].sort(),
  };
}

export function planSongCardRemintCandidate({
  songId,
  title = "",
  latestEdition = 0,
  headGeneration = latestEdition,
  mintedSnapshot = null,
  currentSnapshot = null,
  mintedRevisions = {},
  currentRevisions = {},
  variantId = "next-mint",
} = {}) {
  const normalizedSongId = safeId(songId, "");
  if (!normalizedSongId) throw new Error("songId is required for a Song Card remint candidate");
  const semanticDiff = currentSnapshot
    ? diffSongCardMintSnapshots(mintedSnapshot, currentSnapshot)
    : { changed: false, changedFamilies: [], dirtyRanges: [], renderWork: [], reusableWork: [], summary: "No semantic snapshot supplied." };
  const revisions = revisionReasons(mintedRevisions, currentRevisions);
  const reasons = [...revisions];
  if (semanticDiff.changed) {
    reasons.push({
      kind: mintedSnapshot ? "editor-material-change" : "initial-mint-material",
      family: "editor",
      before: mintedSnapshot ? fingerprintSongCardMintSnapshot(mintedSnapshot) : null,
      after: fingerprintSongCardMintSnapshot(currentSnapshot),
      reason: semanticDiff.summary,
      changedFamilies: clone(semanticDiff.changedFamilies || []),
    });
  }
  const changed = reasons.length > 0;
  const reuse = remintReuse(semanticDiff, reasons, latestEdition);
  const rendererRevisionOnly = reuse.rendererOnly;
  const renderWork = (semanticDiff.renderWork || semanticDiff.dirtyRanges || []).length
    ? clone(semanticDiff.renderWork || semanticDiff.dirtyRanges)
    : changed
      ? fullRangeFor(currentSnapshot, rendererRevisionOnly ? "renderer-capability-change" : "revision-change")
      : [];
  const currentSemanticFingerprint = currentSnapshot ? fingerprintSongCardMintSnapshot(currentSnapshot) : "";
  const fingerprint = stableHash({
    songId: normalizedSongId,
    latestEdition: Number(latestEdition || 0),
    headGeneration: Number(headGeneration || 0),
    currentSemanticFingerprint,
    currentRevisions,
    reasons,
    renderWork,
  });
  return {
    schemaVersion: SONG_CARD_REMINT_CANDIDATE_SCHEMA,
    id: `song-card-remint:${normalizedSongId}:${fingerprint.slice(0, 24)}`,
    fingerprint: `hapa-hash:${fingerprint}`,
    songId: normalizedSongId,
    title: title || normalizedSongId,
    variantId: safeId(variantId),
    changed,
    status: changed ? "awaiting-approval" : "up-to-date",
    expectedLatestEdition: Number(latestEdition || 0),
    expectedHeadGeneration: Number(headGeneration || 0),
    predictedEdition: Number(latestEdition || 0) + (changed ? 1 : 0),
    semanticFingerprint: currentSemanticFingerprint,
    semanticDiff: clone(semanticDiff),
    reasons,
    dirtyRanges: clone(semanticDiff.dirtyRanges || renderWork),
    renderWork,
    reusableWork: reuse.reusableWork,
    reuseDecisionEnvelope: reuse.reuseDecisionEnvelope,
    rendererOnly: reuse.rendererOnly || rendererRevisionOnly,
    sourceRevisions: {
      minted: clone(mintedRevisions),
      current: clone(currentRevisions),
    },
    requiresExplicitApproval: true,
    approval: null,
    renderWorkAuthorized: false,
    mintAuthorized: false,
    autoMint: false,
    nextAction: changed ? "operator-review-and-approve-remint-render" : "none",
  };
}

export function createSongCardRemintQueue({ candidates = [], budgets = {}, createdAt = null } = {}) {
  let queue = {
    schemaVersion: SONG_CARD_REMINT_QUEUE_SCHEMA,
    status: "planned",
    budgets: {
      cpu: 6,
      gpu: 1,
      disk: 5,
      decoders: 3,
      cacheGB: 8,
      activeSessionScale: Number(budgets.activePlaybackScale ?? budgets.activeSessionScale ?? 0.34),
      ...budgets,
    },
    policy: {
      requiresExplicitApproval: true,
      autoMintAllowed: false,
      candidateDeduplication: "fingerprint",
      activePlaybackUsesScaledAlbumBudget: true,
      completedRenderRequiresSeparateMintConfirmation: true,
    },
    candidates: [],
    batches: {},
    events: [],
    createdAt: at(createdAt),
  };
  for (const candidate of candidates) queue = upsertSongCardRemintCandidate(queue, candidate, { eventAt: createdAt });
  return queue;
}

export function upsertSongCardRemintCandidate(queue, input, { eventAt = null } = {}) {
  const candidate = input?.schemaVersion === SONG_CARD_REMINT_CANDIDATE_SCHEMA
    ? clone(input)
    : planSongCardRemintCandidate(input);
  if (!candidate.changed) return clone(queue);
  if ((queue.candidates || []).some((row) => row.fingerprint === candidate.fingerprint)) return clone(queue);
  const supersededIds = [];
  const candidates = (queue.candidates || []).map((row) => {
    if (row.songId !== candidate.songId || TERMINAL_CANDIDATE_STATES.has(row.status) || ["render-ready", "minted"].includes(row.status)) return row;
    supersededIds.push(row.id);
    return { ...row, status: "superseded", supersededBy: candidate.id, renderWorkAuthorized: false, mintAuthorized: false };
  });
  candidates.push(candidate);
  return {
    ...clone(queue),
    candidates,
    events: [...(queue.events || []), {
      type: "remint-candidate-created",
      at: at(eventAt),
      candidateId: candidate.id,
      songId: candidate.songId,
      reasons: candidate.reasons.map((row) => row.kind),
      supersededIds,
      autoMint: false,
    }],
  };
}

export function approveSongCardRemintCandidate(queue, candidateId, { approvedBy, reason = "operator-approved-remint-render", approvedAt = null } = {}) {
  if (!text(approvedBy).trim()) throw new Error("approvedBy is required to approve remint work");
  let found = false;
  const candidates = queue.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate;
    found = true;
    if (candidate.status !== "awaiting-approval") throw new Error(`Remint candidate ${candidateId} is not awaiting approval`);
    return {
      ...candidate,
      status: "approved",
      approval: { approvedBy: text(approvedBy), reason: text(reason), approvedAt: at(approvedAt), fingerprint: candidate.fingerprint },
      renderWorkAuthorized: true,
      mintAuthorized: false,
      nextAction: "enqueue-approved-remint-render",
    };
  });
  if (!found) throw new Error(`Unknown remint candidate: ${candidateId}`);
  return {
    ...clone(queue),
    candidates,
    events: [...queue.events, { type: "remint-candidate-approved", at: at(approvedAt), candidateId, approvedBy: text(approvedBy), autoMint: false }],
  };
}

export function cancelSongCardRemintCandidate(queue, candidateId, { canceledBy, reason = "operator-canceled", canceledAt = null } = {}) {
  if (!text(canceledBy).trim()) throw new Error("canceledBy is required to cancel remint work");
  let found = false;
  const candidates = queue.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate;
    found = true;
    if (["render-ready", "minted"].includes(candidate.status)) throw new Error(`Completed remint candidate ${candidateId} cannot be canceled`);
    return { ...candidate, status: "canceled", renderWorkAuthorized: false, mintAuthorized: false, canceledBy: text(canceledBy), cancelReason: text(reason), canceledAt: at(canceledAt), nextAction: "none" };
  });
  if (!found) throw new Error(`Unknown remint candidate: ${candidateId}`);
  return { ...clone(queue), candidates, events: [...queue.events, { type: "remint-candidate-canceled", at: at(canceledAt), candidateId, canceledBy: text(canceledBy), reason: text(reason) }] };
}

function albumBudget(queue) {
  const { activePlaybackScale: _activePlaybackScale, ...budgets } = queue.budgets || {};
  return budgets;
}

export function enqueueApprovedSongCardRemints(queue, { enqueuedAt = null } = {}) {
  const batches = clone(queue.batches || {});
  const enqueued = [];
  const candidates = queue.candidates.map((candidate) => {
    if (candidate.status !== "approved" || batches[candidate.id]) return candidate;
    let batch = createAlbumBatch({
      songs: [{ id: candidate.songId, sourceHash: candidate.semanticFingerprint || candidate.fingerprint }],
      variants: [candidate.variantId],
      budgets: albumBudget(queue),
    });
    if (candidate.reuseDecisionEnvelope) {
      batch = {
        ...batch,
        jobs: batch.jobs.map((job) => job.expensiveDecision ? {
          ...job,
          status: "cached",
          receipt: { kind: "song-card-remint-reuse", candidateId: candidate.id, reason: "existing-director-decision-envelope" },
          producedArtifacts: ["director-decision-envelope"],
          logs: [...job.logs, "song-card-remint:reused-existing-decision-envelope"],
        } : job),
      };
    }
    batches[candidate.id] = {
      ...batch,
      remint: {
        candidateId: candidate.id,
        expectedLatestEdition: candidate.expectedLatestEdition,
        predictedEdition: candidate.predictedEdition,
        dirtyRanges: clone(candidate.renderWork),
        reusableWork: clone(candidate.reusableWork),
        autoMint: false,
      },
    };
    enqueued.push(candidate.id);
    return { ...candidate, status: "queued", nextAction: "run-approved-remint-render", mintAuthorized: false };
  });
  return {
    ...clone(queue),
    status: enqueued.length ? "ready" : queue.status,
    candidates,
    batches,
    events: [...queue.events, ...enqueued.map((candidateId) => ({ type: "remint-render-enqueued", at: at(enqueuedAt), candidateId, autoMint: false }))],
  };
}

function candidateStatusFromBatch(candidate, batch) {
  if (["minted", "ready-for-mint-review", "canceled", "superseded", "rejected"].includes(candidate.status)) return candidate.status;
  const statuses = new Set(batch.jobs.map((job) => job.status));
  if ([...statuses].some((status) => status === "failed")) return "failed";
  if ([...statuses].some((status) => status === "running")) return "rendering";
  if (batch.jobs.every((job) => ["done", "cached"].includes(job.status))) return "render-ready";
  return candidate.status === "approved" ? "queued" : candidate.status;
}

export function resumeSongCardRemintQueue(queue, { artifactIndexByCandidate = {}, resumedAt = null } = {}) {
  const batches = Object.fromEntries(Object.entries(queue.batches || {}).map(([candidateId, batch]) => [
    candidateId,
    resumeAlbumBatch(batch, artifactIndexByCandidate[candidateId] || {}),
  ]));
  const candidates = queue.candidates.map((candidate) => {
    const batch = batches[candidate.id];
    if (!batch) return candidate;
    const status = candidateStatusFromBatch(candidate, batch);
    return { ...candidate, status, mintAuthorized: false, nextAction: status === "render-ready" ? "operator-confirm-song-card-mint" : candidate.nextAction };
  });
  return {
    ...clone(queue),
    status: Object.keys(batches).length ? "ready" : queue.status,
    batches,
    candidates,
    events: [...queue.events, { type: "remint-queue-resumed", at: at(resumedAt), batchCount: Object.keys(batches).length, autoMint: false }],
  };
}

export function claimSongCardRemintWork(queue, { activePlayback = false, claimedAt = null, candidateId = "" } = {}) {
  const batches = clone(queue.batches || {});
  const claimed = [];
  for (const candidate of queue.candidates) {
    if (candidateId && candidate.id !== candidateId) continue;
    if (!["queued", "rendering"].includes(candidate.status) || !candidate.approval || !batches[candidate.id]) continue;
    const releaseApprovals = Object.fromEntries(batches[candidate.id].jobs
      .filter((job) => job.requiresHumanApproval)
      .map((job) => [job.id, candidate.approval]));
    const result = claimAlbumJobs(batches[candidate.id], {
      activeInteractiveSession: Boolean(activePlayback),
      approvals: releaseApprovals,
    });
    batches[candidate.id] = result.batch;
    claimed.push(...result.claimedJobIds.map((jobId) => {
      const job = result.batch.jobs.find((row) => row.id === jobId);
      return {
        candidateId: candidate.id,
        jobId,
        stage: job?.stage || null,
        variant: job?.variant || null,
        ...(job?.stage === "release-export" ? {
          releaseReceiptContract: {
            schemaVersion: SONG_CARD_REMINT_RELEASE_RECEIPT_SCHEMA,
            candidateId: candidate.id,
            planId: candidate.planId || null,
            sourceRevision: candidate.sourceRevisions?.current?.source || null,
          },
        } : {}),
      };
    }));
  }
  const claimedIds = new Set(claimed.map((row) => row.candidateId));
  return {
    queue: {
      ...clone(queue),
      status: claimed.length ? "running" : queue.status,
      batches,
      candidates: queue.candidates.map((candidate) => claimedIds.has(candidate.id) ? { ...candidate, status: "rendering", mintAuthorized: false } : candidate),
      events: [...queue.events, { type: "remint-work-claimed", at: at(claimedAt), activePlayback: Boolean(activePlayback), claimed, autoMint: false }],
    },
    claimed,
  };
}

export function recordSongCardRemintJobResult(queue, candidateId, jobId, result, { recordedAt = null } = {}) {
  const batch = queue.batches?.[candidateId];
  if (!batch) throw new Error(`Unknown remint batch: ${candidateId}`);
  if (!batch.jobs.some((job) => job.id === jobId)) throw new Error(`Unknown remint job: ${jobId}`);
  const nextBatch = recordAlbumJobResult(batch, jobId, result);
  const releaseJob = nextBatch.jobs.find((job) => job.stage === "release-export");
  const releaseArtifacts = clone(releaseJob?.producedArtifacts || []);
  const releaseReceipt = clone(releaseJob?.receipt || null);
  const candidates = queue.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate;
    const status = candidateStatusFromBatch(candidate, nextBatch);
    return {
      ...candidate,
      status,
      ...(status === "render-ready" ? { renderArtifacts: releaseArtifacts, releaseReceipt } : {}),
      mintAuthorized: false,
      nextAction: status === "render-ready" ? "operator-confirm-song-card-mint" : candidate.nextAction,
    };
  });
  return {
    ...clone(queue),
    batches: { ...clone(queue.batches), [candidateId]: nextBatch },
    candidates,
    events: [...queue.events, { type: result.ok ? "remint-job-completed" : result.cancelled ? "remint-job-canceled" : "remint-job-failed", at: at(recordedAt), candidateId, jobId, autoMint: false }],
  };
}

function downstreamJobIds(jobs, rootIds) {
  const selected = new Set(rootIds);
  let changed = true;
  while (changed) {
    changed = false;
    for (const job of jobs) {
      if (selected.has(job.id) || !job.dependencies.some((dependencyId) => selected.has(dependencyId))) continue;
      selected.add(job.id);
      changed = true;
    }
  }
  return selected;
}

function retryRootsForFailedJobs(jobs, failedJobs) {
  const byId = new Map(jobs.map((job) => [job.id, job]));
  const roots = new Set();
  for (const failedJob of failedJobs) {
    let cursor = failedJob;
    let hyperframesAncestor = cursor.stage === "hyperframes" ? cursor : null;
    const visited = new Set();
    while (cursor && !visited.has(cursor.id)) {
      visited.add(cursor.id);
      const parent = cursor.dependencies.map((id) => byId.get(id)).find(Boolean) || null;
      if (!parent) break;
      if (parent.stage === "hyperframes") hyperframesAncestor = parent;
      cursor = parent;
    }
    // QA and release retries must rebuild the in-memory HyperFrames result they
    // consume. Earlier content-addressed preparation remains reusable.
    roots.add((hyperframesAncestor || failedJob).id);
  }
  return roots;
}

export function retrySongCardRemintRender(queue, candidateId, { retriedAt = null } = {}) {
  const candidate = queue.candidates.find((row) => row.id === candidateId);
  if (!candidate) throw new Error(`Unknown remint candidate: ${candidateId}`);
  if (!candidate.approval?.approvedBy || candidate.renderWorkAuthorized !== true) {
    throw new Error(`Remint candidate ${candidateId} does not retain approved render authority`);
  }
  if (TERMINAL_CANDIDATE_STATES.has(candidate.status) || ["render-ready", "ready-for-mint-review", "minting", "minted"].includes(candidate.status)) {
    throw new Error(`Remint candidate ${candidateId} is ${candidate.status} and cannot retry rendering`);
  }
  const batch = queue.batches?.[candidateId];
  if (!batch) throw new Error(`Unknown remint batch: ${candidateId}`);
  const failedJobs = batch.jobs.filter((job) => job.status === "failed");
  if (!failedJobs.length) throw new Error(`Remint candidate ${candidateId} has no failed render work to retry`);

  const retryIds = downstreamJobIds(batch.jobs, retryRootsForFailedJobs(batch.jobs, failedJobs));
  const resetJobIds = [];
  const preservedExpensiveDecisionJobIds = [];
  const jobs = batch.jobs.map((job) => {
    if (!retryIds.has(job.id)) return job;
    if (job.expensiveDecision && ["done", "cached"].includes(job.status)) {
      preservedExpensiveDecisionJobIds.push(job.id);
      return job;
    }
    resetJobIds.push(job.id);
    return {
      ...job,
      status: "queued",
      attempts: 0,
      approval: null,
      receipt: null,
      producedArtifacts: [],
      cost: { ...job.cost, measuredSeconds: null },
      logs: [...(job.logs || []), `explicit-render-retry:${at(retriedAt)}`],
    };
  });
  const batches = {
    ...clone(queue.batches),
    [candidateId]: {
      ...batch,
      status: "ready",
      jobs,
      events: [...(batch.events || []), {
        type: "explicit-render-retry",
        at: at(retriedAt),
        candidateId,
        failedJobIds: failedJobs.map((job) => job.id),
        resetJobIds,
        preservedExpensiveDecisionJobIds,
      }],
    },
  };
  return {
    ...clone(queue),
    status: "ready",
    batches,
    candidates: queue.candidates.map((row) => row.id === candidateId ? {
      ...row,
      status: "queued",
      renderArtifacts: [],
      releaseReceipt: null,
      releaseReceiptVerification: null,
      reviewedRender: null,
      mintPlanId: null,
      mintReservation: null,
      mintAuthorized: false,
      nextAction: "run-approved-remint-render",
    } : row),
    events: [...(queue.events || []), {
      type: "remint-render-retry-requested",
      at: at(retriedAt),
      candidateId,
      failedJobIds: failedJobs.map((job) => job.id),
      resetJobIds,
      preservedExpensiveDecisionJobIds,
      approvedBy: candidate.approval.approvedBy,
      autoMint: false,
    }],
  };
}

export function bindSongCardRemintMintPlan(queue, candidateId, {
  planId,
  predictedEdition,
  expectedHeadGeneration,
  renderMasterPath,
  renderMasterSha256,
  posterPath,
  posterSha256,
  boundAt = null,
} = {}) {
  if (!text(planId).trim()) throw new Error("A reviewed mint plan is required for render binding");
  let found = false;
  const candidates = queue.candidates.map((candidate) => {
    if (candidate.id !== candidateId) return candidate;
    found = true;
    if (candidate.status !== "render-ready") throw new Error(`Remint candidate ${candidateId} is not render-ready`);
    if (Number(predictedEdition) !== Number(candidate.predictedEdition)) throw new Error("Reviewed mint plan predicts a different edition");
    if (Number(expectedHeadGeneration) !== Number(candidate.expectedHeadGeneration)) throw new Error("Reviewed mint plan was created against a different Song Card head");
    const artifacts = Array.isArray(candidate.renderArtifacts) ? candidate.renderArtifacts : [];
    const master = artifacts.find((artifact) => artifact && typeof artifact === "object" && artifact.role === "master");
    const poster = artifacts.find((artifact) => artifact && typeof artifact === "object" && artifact.role === "poster");
    if (!master?.path || !poster?.path) throw new Error("Render-ready work must report explicit master and poster artifacts");
    if (text(master.path) !== text(renderMasterPath) || text(poster.path) !== text(posterPath)) throw new Error("Reviewed mint plan paths do not match the render result");
    if (master.sha256 && text(master.sha256).replace(/^sha256:/u, "") !== text(renderMasterSha256).replace(/^sha256:/u, "")) throw new Error("Reviewed master hash does not match the render result");
    if (poster.sha256 && text(poster.sha256).replace(/^sha256:/u, "") !== text(posterSha256).replace(/^sha256:/u, "")) throw new Error("Reviewed poster hash does not match the render result");
    return {
      ...candidate,
      status: "ready-for-mint-review",
      mintPlanId: text(planId),
      reviewedRender: {
        master: { path: text(renderMasterPath), sha256: text(renderMasterSha256) },
        poster: { path: text(posterPath), sha256: text(posterSha256) },
        boundAt: at(boundAt),
      },
      renderWorkAuthorized: false,
      mintAuthorized: false,
      nextAction: "operator-review-and-confirm-song-card-mint",
    };
  });
  if (!found) throw new Error(`Unknown remint candidate: ${candidateId}`);
  return {
    ...clone(queue),
    candidates,
    events: [...queue.events, { type: "remint-render-bound-to-mint-plan", at: at(boundAt), candidateId, planId: text(planId), autoMint: false }],
  };
}

export function recordSongCardRemintMint(queue, {
  songId,
  planId = "",
  edition,
  mintId = "",
  mintedAt = null,
} = {}) {
  const normalizedSongId = safeId(songId, "");
  const editionNumber = Number(edition || 0);
  if (!normalizedSongId || !Number.isInteger(editionNumber) || editionNumber < 1) {
    throw new Error("songId and a positive edition are required to record a remint");
  }
  const matched = [];
  const candidates = queue.candidates.map((candidate) => {
    const boundPlanIds = [candidate.mintPlanId, candidate.planId].map(text).filter(Boolean);
    const samePlan = text(planId) && boundPlanIds.includes(text(planId));
    const sameTransition = candidate.songId === normalizedSongId
      && Number(candidate.predictedEdition || 0) === editionNumber;
    const legacyTransition = boundPlanIds.length === 0 && sameTransition;
    if (!samePlan && !legacyTransition) return candidate;
    if (["superseded", "rejected", "canceled"].includes(candidate.status)) return candidate;
    if (candidate.status === "minted") return candidate;
    matched.push(candidate.id);
    return {
      ...candidate,
      status: "minted",
      mintedEdition: editionNumber,
      mintId: text(mintId) || candidate.mintId || null,
      mintedAt: at(mintedAt),
      mintReservation: null,
      renderWorkAuthorized: false,
      mintAuthorized: false,
      nextAction: "none",
    };
  });
  return {
    ...clone(queue),
    candidates,
    events: matched.length
      ? [...queue.events, { type: "remint-explicit-mint-recorded", at: at(mintedAt), songId: normalizedSongId, planId: text(planId) || null, edition: editionNumber, candidateIds: matched, autoMint: false }]
      : clone(queue.events),
  };
}

export function songCardRemintQueueView(queue) {
  return {
    schemaVersion: "hapa.song-card.remint-queue-view.v1",
    status: queue.status,
    policy: clone(queue.policy),
    candidates: queue.candidates.map((candidate) => ({
      id: candidate.id,
      planId: candidate.planId || null,
      mintPlanId: candidate.mintPlanId || null,
      songId: candidate.songId,
      status: candidate.status,
      expectedLatestEdition: candidate.expectedLatestEdition,
      predictedEdition: candidate.predictedEdition,
      reasons: clone(candidate.reasons),
      dirtyRanges: clone(candidate.renderWork),
      reusableWork: clone(candidate.reusableWork),
      requiresExplicitApproval: candidate.requiresExplicitApproval,
      approvedBy: candidate.approval?.approvedBy || null,
      renderWorkAuthorized: candidate.renderWorkAuthorized,
      mintAuthorized: false,
      autoMint: false,
      nextAction: candidate.nextAction,
      mintedEdition: candidate.mintedEdition || null,
      mintId: candidate.mintId || null,
      renderArtifacts: clone(candidate.renderArtifacts || []),
      releaseReceipt: clone(candidate.releaseReceipt || null),
      releaseReceiptVerification: clone(candidate.releaseReceiptVerification || null),
      reviewedRender: clone(candidate.reviewedRender || null),
      jobs: (queue.batches?.[candidate.id]?.jobs || []).map((job) => ({ id: job.id, stage: job.stage, status: job.status, artifactHash: job.artifactHash })),
    })),
  };
}
