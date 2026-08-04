import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";

export const HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE_SCHEMA = "hapa.human-video-optical-campaign-store.v1";
export const HUMAN_VIDEO_OPTICAL_CAMPAIGN_JOB_SCHEMA = "hapa.human-video-optical-campaign-job.v1";
export const HUMAN_VIDEO_OPTICAL_CAMPAIGN_EVENT_SCHEMA = "hapa.human-video-optical-campaign-event.v1";

const JOB_STATUSES = new Set(["queued", "claimed", "completing", "submitted", "failed"]);
const TELEMETRY_STATUSES = new Set(["captured", "unavailable"]);
const WORK_PHASES = new Set(["claimed", "inspecting", "drafting", "submitting"]);
const WORK_PHASE_ORDER = new Map([["", -1], ["claimed", 0], ["inspecting", 1], ["drafting", 2], ["submitting", 3]]);

export function createHumanVideoOpticalCampaignStore(input = {}) {
  return normalizeHumanVideoOpticalCampaignStore({
    schemaVersion: HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE_SCHEMA,
    configuration: input.configuration || {},
    planning: input.planning || {},
    jobs: Object.prototype.hasOwnProperty.call(input, "jobs") ? input.jobs : [],
    updatedAt: input.updatedAt || null,
  });
}

export function normalizeHumanVideoOpticalCampaignStore(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw campaignError("optical_campaign_store_root_invalid", "The optical campaign store root must be its schema-bound object; refusing to reinterpret another JSON shape as empty scheduler state.", 500);
  }
  if (input.schemaVersion !== HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE_SCHEMA) {
    throw campaignError("optical_campaign_store_schema_invalid", `The optical campaign store must declare ${HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE_SCHEMA}; refusing an unknown custody schema.`, 500);
  }
  if (!Object.prototype.hasOwnProperty.call(input, "jobs")) {
    throw campaignError("optical_campaign_store_jobs_missing", "The optical campaign store is missing its jobs ledger; refusing to reinterpret incomplete persisted custody as empty.", 500);
  }
  if (!Array.isArray(input.jobs)) {
    throw campaignError("optical_campaign_store_jobs_invalid", "The optical campaign store's jobs collection must be an array; refusing to discard malformed persisted scheduler state.", 500);
  }
  const configuration = normalizeConfiguration(input.configuration);
  const planning = normalizePlanning(input.planning);
  const byId = new Map();
  const byVideo = new Map();
  for (const [index, candidate] of input.jobs.entries()) {
    let job;
    try {
      if (!candidate || typeof candidate !== "object" || Array.isArray(candidate) || candidate.schemaVersion !== HUMAN_VIDEO_OPTICAL_CAMPAIGN_JOB_SCHEMA) {
        throw campaignError("optical_campaign_job_schema_invalid", `Persisted optical campaign entries must declare ${HUMAN_VIDEO_OPTICAL_CAMPAIGN_JOB_SCHEMA}.`);
      }
      if (!Object.prototype.hasOwnProperty.call(candidate, "status")) {
        throw campaignError("optical_campaign_job_status_missing", "A persisted optical campaign entry must explicitly retain its custody status.");
      }
      job = normalizeHumanVideoOpticalCampaignJob({ ...candidate, workerConfiguration: candidate.workerConfiguration || configuration });
    } catch (error) {
      throw campaignError("optical_campaign_store_entry_invalid", `Optical campaign entry ${index + 1} is invalid; refusing to rewrite a ledger that could contain active worker custody.`, 500, {
        index,
        cause: error?.code || error?.message || String(error),
      });
    }
    const currentId = byId.get(job.id);
    if (currentId) {
      throw campaignError("optical_campaign_store_duplicate_job_id", `Optical campaign entries ${index} and ${index + 1} both use job id ${job.id}; refusing to choose one custody record.`, 500, {
        jobId: job.id,
        firstVideoKey: currentId.videoKey,
        duplicateVideoKey: job.videoKey,
      });
    }
    const currentVideo = byVideo.get(job.videoKey);
    if (currentVideo) {
      throw campaignError("optical_campaign_store_duplicate_video_key", `Optical campaign entries ${index} and ${index + 1} both claim video ${job.videoKey}; refusing to choose one custody record.`, 500, {
        videoKey: job.videoKey,
        firstJobId: currentVideo.id,
        duplicateJobId: job.id,
      });
    }
    byId.set(job.id, job);
    byVideo.set(job.videoKey, job);
  }
  const jobs = [...byId.values()].sort((a, b) => a.videoKey.localeCompare(b.videoKey) || a.id.localeCompare(b.id));
  return {
    schemaVersion: HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE_SCHEMA,
    configuration,
    planning,
    jobs,
    updatedAt: clean(input.updatedAt, 80) || jobs.map((job) => job.updatedAt).filter(Boolean).sort().at(-1) || null,
    truthBoundary: "This scheduler ledger only claims optical work and records scheduler receipts. It never evaluates frames, media quality, descriptions, references, or Hapa relationships.",
  };
}

export function normalizeHumanVideoOpticalCampaignJob(input = {}) {
  const videoKey = clean(input.videoKey, 4_500);
  if (!videoKey) throw campaignError("optical_campaign_video_key_required", "An optical campaign job requires a stable video key.");
  const frames = normalizeFrames(input.frames);
  if (frames.length < 3) throw campaignError("optical_campaign_frames_required", "An optical campaign job requires at least three registered frame receipts.");
  const suppliedFrameDigest = clean(input.frameDigest, 240);
  if (suppliedFrameDigest && !frameManifestDigestMatches(suppliedFrameDigest, frames)) throw campaignError("optical_campaign_frame_digest_mismatch", "The supplied frame digest does not match the registered frame manifest.");
  const frameDigest = suppliedFrameDigest || frameManifestDigest(frames);
  if (Object.prototype.hasOwnProperty.call(input, "status") && !JOB_STATUSES.has(input.status)) {
    throw campaignError("optical_campaign_job_status_invalid", `Unknown optical campaign job status: ${clean(input.status, 120) || "empty"}.`);
  }
  const status = input.status || "queued";
  const attempt = Math.max(0, Math.trunc(number(input.attempt, 0)));
  const lease = normalizeLease(input.lease);
  const leased = status === "claimed" || status === "completing";
  if (leased && (!lease.workerId || !lease.leaseId || !lease.claimedAt || !lease.expiresAt)) throw campaignError("optical_campaign_lease_required", "A claimed or completing optical job requires a worker and complete lease timestamps.");
  if (leased && (
    !Number.isFinite(Date.parse(lease.claimedAt))
    || !Number.isFinite(Date.parse(lease.expiresAt))
    || Date.parse(lease.expiresAt) <= Date.parse(lease.claimedAt)
  )) throw campaignError("optical_campaign_lease_timestamps_invalid", "A claimed or completing optical job requires finite lease timestamps with expiry after claim time.");
  if (!leased && lease.leaseId) throw campaignError("optical_campaign_unexpected_lease", "Only claimed or completing optical jobs may hold a lease.");
  const telemetry = normalizeSchedulerTelemetry(input.schedulerTelemetry);
  if ((status === "completing" || status === "submitted") && !telemetry.status) throw campaignError("optical_campaign_telemetry_required", "A completing or submitted optical job requires a scheduler telemetry receipt.");
  const completion = normalizeCompletion(input.completion);
  if (status === "completing" && (!completion.token || !completion.resultDigest)) throw campaignError("optical_campaign_completion_receipt_required", "A completing optical job requires its server-generated completion token and normalized result digest.");
  if (status !== "completing" && completion.token) throw campaignError("optical_campaign_unexpected_completion_token", "Only a completing optical job may retain an active completion token.");
  const id = clean(input.id, 600) || `optical:${sha256Hex(`${videoKey}\n${frameDigest}`).slice(0, 24)}`;
  return {
    schemaVersion: HUMAN_VIDEO_OPTICAL_CAMPAIGN_JOB_SCHEMA,
    id,
    videoKey,
    videoId: clean(input.videoId, 360),
    videoName: clean(input.videoName, 800),
    videoIdentity: normalizeVideoIdentity(input.videoIdentity),
    repair: normalizeRepair(input.repair),
    qualityCalibration: normalizeQualityCalibration(input.qualityCalibration),
    workerConfiguration: normalizeWorkerConfiguration(input.workerConfiguration),
    frameDigest,
    frames,
    status,
    attempt,
    lease,
    schedulerTelemetry: telemetry,
    schedulerTiming: normalizeSchedulerTiming(input.schedulerTiming),
    workerProgress: normalizeWorkerProgress(input.workerProgress, { frames, attempt }),
    completion,
    lastWorkerId: clean(input.lastWorkerId, 240),
    reviewId: clean(input.reviewId, 5_000),
    failure: normalizeFailure(input.failure),
    recoveryCount: Math.max(0, Math.trunc(number(input.recoveryCount, 0))),
    createdAt: clean(input.createdAt, 80) || null,
    updatedAt: clean(input.updatedAt, 80) || null,
  };
}

export function enqueueHumanVideoOpticalCampaignJob(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = options.now || new Date().toISOString();
  const normalized = normalizeHumanVideoOpticalCampaignJob({ ...input, workerConfiguration: input.workerConfiguration || store.configuration, status: "queued", attempt: 0, lease: null, schedulerTelemetry: null, completion: null, failure: null, createdAt: now, updatedAt: now });
  const existing = store.jobs.find((job) => job.id === normalized.id || job.videoKey === normalized.videoKey);
  if (existing) {
    if (!frameManifestsEqual(existing.frames, normalized.frames)) throw campaignError("optical_campaign_video_manifest_changed", "This video is already queued with a different registered frame manifest.", 409);
    return { store, job: existing, created: false };
  }
  const job = normalized;
  return { store: replaceJob(store, job, now), job, created: true };
}

export function updateHumanVideoOpticalCampaignPlanning(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = options.now || new Date().toISOString();
  return normalizeHumanVideoOpticalCampaignStore({
    ...store,
    configuration: { ...store.configuration, ...(input.configuration || {}) },
    planning: { ...store.planning, ...(input.planning || input), lastPlannedAt: now },
    updatedAt: now,
  });
}

export function recoverStaleHumanVideoOpticalCampaignLeases(storeInput = {}, options = {}) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = options.now || new Date().toISOString();
  const jobs = store.jobs.map((job) => job.status === "claimed" && Date.parse(job.lease.expiresAt) <= Date.parse(now)
    ? {
        ...job,
        status: "queued",
        lease: emptyLease(),
        completion: emptyCompletion(),
        lastWorkerId: job.lease.workerId,
        schedulerTiming: {
          startedAt: job.schedulerTiming.startedAt || job.lease.claimedAt,
          completedAt: now,
          wallClockMs: Math.max(0, Date.parse(now) - Date.parse(job.schedulerTiming.startedAt || job.lease.claimedAt || now)),
        },
        recoveryCount: job.recoveryCount + 1,
        updatedAt: now,
      }
    : job);
  return { store: normalizeHumanVideoOpticalCampaignStore({ ...store, jobs, updatedAt: now }), recovered: jobs.filter((job, index) => job !== store.jobs[index]).map((job) => job.id) };
}

export function claimHumanVideoOpticalCampaignJob(storeInput = {}, workerInput = {}, options = {}) {
  const now = options.now || new Date().toISOString();
  const recovered = recoverStaleHumanVideoOpticalCampaignLeases(storeInput, { now });
  const store = recovered.store;
  const workerId = clean(workerInput.workerId || workerInput.agentId, 240);
  if (!workerId) throw campaignError("optical_campaign_worker_required", "Claiming optical work requires a scheduler worker ID.");
  const active = store.jobs.filter((job) => (
    (job.status === "claimed" || job.status === "completing")
    && Date.parse(job.lease.expiresAt) > Date.parse(now)
  )).length;
  if (active >= store.configuration.maxActiveWorkers) return { store, job: null, recovered: recovered.recovered, reason: "max-active-workers" };
  const requestedJobId = clean(options.jobId, 600);
  const claimable = (job) => job.status === "queued" || (job.status === "failed" && job.failure?.retryable === true);
  const candidate = requestedJobId ? store.jobs.find((job) => job.id === requestedJobId && claimable(job)) : store.jobs.find(claimable);
  if (!candidate) return { store, job: null, recovered: recovered.recovered, reason: "no-queued-work" };
  const leaseMs = Math.max(1_000, Math.min(3_600_000, Math.trunc(number(options.leaseMs, store.configuration.leaseMs))));
  const leaseId = clean(options.leaseId, 360) || randomLeaseId(`${candidate.id}\n${candidate.attempt + 1}\n${workerId}\n${now}`);
  const job = {
    ...candidate,
    status: "claimed",
    attempt: candidate.attempt + 1,
    lease: { workerId, leaseId, claimedAt: now, expiresAt: new Date(Date.parse(now) + leaseMs).toISOString() },
    schedulerTelemetry: emptySchedulerTelemetry(),
    completion: emptyCompletion(),
    workerProgress: createWorkerProgress(candidate.frames, candidate.attempt + 1, now),
    workerConfiguration: normalizeWorkerConfiguration(store.configuration),
    schedulerTiming: { startedAt: now, completedAt: null, wallClockMs: null },
    lastWorkerId: workerId,
    failure: null,
    updatedAt: now,
  };
  return { store: replaceJob(store, job, now), job, recovered: recovered.recovered, reason: null };
}

export function submitHumanVideoOpticalCampaignJob(storeInput = {}, input = {}, options = {}) {
  return settleLeasedJob(storeInput, input, options, "submitted", ["completing"]);
}

export function failHumanVideoOpticalCampaignJob(storeInput = {}, input = {}, options = {}) {
  return settleLeasedJob(storeInput, input, options, "failed", ["claimed"]);
}

export function beginHumanVideoOpticalCampaignCompletion(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = options.now || new Date().toISOString();
  const id = clean(input.jobId || input.id, 600);
  const current = store.jobs.find((job) => job.id === id);
  if (!current) throw campaignError("optical_campaign_job_not_found", "The optical campaign job no longer exists.", 404);
  const resultDigest = clean(input.resultDigest, 240);
  if (!/^sha256:[a-f0-9]{64}$/.test(resultDigest)) throw campaignError("optical_campaign_result_digest_required", "Preparing completion requires the SHA-256 digest of the normalized optical proposal.");
  if (current.status === "completing") {
    assertLeaseIdentity(current, input, ["completing"]);
    if (current.completion.resultDigest !== resultDigest) throw campaignError("optical_campaign_completion_digest_mismatch", "This lease already prepared a different normalized optical result.", 409);
    return { store, job: current };
  }
  assertLease(current, input, now, ["claimed"]);
  if (!current.schedulerTelemetry.status) throw campaignError("optical_campaign_telemetry_required", "Record immutable scheduler telemetry before preparing completion.");
  const job = {
    ...current,
    status: "completing",
    completion: {
      token: randomCompletionToken(`${current.id}\n${current.attempt}\n${resultDigest}\n${now}`),
      resultDigest,
      preparedAt: now,
    },
    updatedAt: now,
  };
  return { store: replaceJob(store, job, now), job };
}

export function abortHumanVideoOpticalCampaignCompletion(storeInput = {}, input = {}, options = {}) {
  return settleLeasedJob(storeInput, input, options, "failed", ["completing"]);
}

export function requeueExpiredHumanVideoOpticalCampaignCompletion(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = options.now || new Date().toISOString();
  const id = clean(input.jobId || input.id, 600);
  const current = store.jobs.find((job) => job.id === id);
  if (!current) throw campaignError("optical_campaign_job_not_found", "The optical campaign job no longer exists.", 404);
  assertLeaseIdentity(current, input, ["completing"]);
  if (Date.parse(current.lease.expiresAt) > Date.parse(now)) {
    throw campaignError("optical_campaign_completion_still_active", "This prepared completion still has an active lease and cannot be requeued.", 409);
  }
  const job = {
    ...current,
    status: "failed",
    lease: emptyLease(),
    completion: emptyCompletion(),
    failure: {
      code: "optical_completion_expired_without_review",
      message: "The prepared completion expired without a matching persisted review and was safely returned for a new attempt.",
      retryable: true,
    },
    lastWorkerId: current.lease.workerId,
    schedulerTiming: {
      startedAt: current.schedulerTiming.startedAt || current.lease.claimedAt,
      completedAt: now,
      wallClockMs: Math.max(0, Date.parse(now) - Date.parse(current.schedulerTiming.startedAt || current.lease.claimedAt)),
    },
    updatedAt: now,
  };
  return { store: replaceJob(store, job, now), job, requeued: true };
}

export function recordHumanVideoOpticalCampaignTelemetry(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = options.now || new Date().toISOString();
  const id = clean(input.jobId || input.id, 600);
  const current = store.jobs.find((job) => job.id === id);
  if (!current) throw campaignError("optical_campaign_job_not_found", "The optical campaign job no longer exists.", 404);
  if (current.status !== "claimed") throw campaignError("optical_campaign_telemetry_state_invalid", "Scheduler telemetry may be attached only to an active claimed attempt.", 409);
  assertLease(current, input, now, ["claimed"]);
  if (current.schedulerTelemetry.status) throw campaignError("optical_campaign_telemetry_immutable", "This optical attempt already has a scheduler telemetry receipt.", 409);
  const schedulerTelemetry = normalizeSchedulerTelemetry(input.schedulerTelemetry || input.telemetry);
  if (!schedulerTelemetry.status) throw campaignError("optical_campaign_telemetry_required", "A scheduler telemetry receipt must be captured or explicitly unavailable.");
  if (schedulerTelemetry.status === "captured") {
    if (schedulerTelemetry.model !== current.workerConfiguration.model || schedulerTelemetry.reasoningEffort !== current.workerConfiguration.reasoningEffort) {
      throw campaignError("optical_campaign_telemetry_configuration_mismatch", "Scheduler telemetry model and reasoning effort must match the immutable claim configuration.", 409);
    }
    if (schedulerTelemetry.directImageViewCalls !== current.frames.length) {
      throw campaignError("optical_campaign_telemetry_image_views_mismatch", "Captured scheduler telemetry must report exactly one direct image view for every claimed frame.", 409);
    }
  }
  if (!schedulerTelemetry.receiptId
    || schedulerTelemetry.jobId !== current.id
    || schedulerTelemetry.attempt !== current.attempt
    || schedulerTelemetry.frameDigest !== current.frameDigest
    || schedulerTelemetry.leaseIdDigest !== sha256Digest(current.lease.leaseId)) {
    throw campaignError("optical_campaign_telemetry_binding_mismatch", "Scheduler telemetry must carry the server-issued receipt binding for this exact job, attempt, frame manifest, and lease.", 409);
  }
  const receiptConfirmsEveryFrame = schedulerTelemetry.status === "captured"
    && schedulerTelemetry.directImageViewCalls === current.frames.length;
  const job = {
    ...current,
    schedulerTelemetry,
    workerProgress: receiptConfirmsEveryFrame
      ? {
          ...current.workerProgress,
          attempt: current.attempt,
          phase: "submitting",
          currentFrameOrdinal: null,
          completedFrameOrdinals: current.frames.map((frame) => frame.ordinal),
          completionSource: "scheduler-receipt",
          startedAt: current.workerProgress.startedAt || current.lease.claimedAt,
          updatedAt: now,
        }
      : current.workerProgress,
    updatedAt: now,
  };
  return { store: replaceJob(store, job, now), job };
}

export function recordHumanVideoOpticalCampaignProgress(storeInput = {}, input = {}, options = {}) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = options.now || new Date().toISOString();
  const id = clean(input.jobId || input.id, 600);
  const current = store.jobs.find((job) => job.id === id);
  if (!current) throw campaignError("optical_campaign_job_not_found", "The optical campaign job no longer exists.", 404);
  assertLease(current, input, now, ["claimed"]);

  const prior = current.workerProgress;
  const phase = clean(input.phase || prior.phase || "claimed", 80).toLowerCase();
  if (!WORK_PHASES.has(phase)) throw campaignError("optical_campaign_progress_phase_invalid", `Unknown optical worker phase: ${phase || "empty"}.`);
  if ((WORK_PHASE_ORDER.get(phase) ?? -1) < (WORK_PHASE_ORDER.get(prior.phase) ?? -1)) {
    throw campaignError("optical_campaign_progress_phase_regressed", "Optical worker phase updates must move forward within one leased attempt.", 409);
  }

  const manifestOrdinals = new Set(current.frames.map((frame) => frame.ordinal));
  const suppliedCompleted = Object.prototype.hasOwnProperty.call(input, "completedFrameOrdinals")
    ? input.completedFrameOrdinals
    : Object.prototype.hasOwnProperty.call(input, "completedFrames")
      ? input.completedFrames
      : prior.completedFrameOrdinals;
  if (!Array.isArray(suppliedCompleted)) throw campaignError("optical_campaign_progress_frames_invalid", "Completed frame ordinals must be an array bound to the registered frame manifest.");
  const completedFrameOrdinals = [...new Set(suppliedCompleted.map((value) => Math.trunc(number(value?.ordinal ?? value, -1))))].sort((a, b) => a - b);
  if (completedFrameOrdinals.some((ordinal) => !manifestOrdinals.has(ordinal))) {
    throw campaignError("optical_campaign_progress_frame_not_registered", "Optical progress may only complete ordinals from this job's registered frame manifest.", 409);
  }
  if (prior.completedFrameOrdinals.some((ordinal) => !completedFrameOrdinals.includes(ordinal))) {
    throw campaignError("optical_campaign_progress_frames_regressed", "Completed First/Mid/Last frame progress is append-only within one leased attempt.", 409);
  }

  let currentFrameOrdinal = prior.currentFrameOrdinal;
  if (Object.prototype.hasOwnProperty.call(input, "currentFrameOrdinal")) {
    currentFrameOrdinal = input.currentFrameOrdinal == null ? null : Math.trunc(number(input.currentFrameOrdinal, -1));
  }
  if (currentFrameOrdinal != null && !manifestOrdinals.has(currentFrameOrdinal)) {
    throw campaignError("optical_campaign_progress_current_frame_not_registered", "The current optical frame must belong to this job's registered frame manifest.", 409);
  }
  if (phase !== "inspecting") currentFrameOrdinal = null;

  const workerProgress = {
    attempt: current.attempt,
    phase,
    currentFrameOrdinal,
    completedFrameOrdinals,
    completionSource: "worker-progress",
    startedAt: prior.startedAt || current.lease.claimedAt || now,
    updatedAt: now,
  };
  const job = { ...current, workerProgress, updatedAt: now };
  return { store: replaceJob(store, job, now), job };
}

function settleLeasedJob(storeInput, input, options, status, allowedStatuses) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = options.now || new Date().toISOString();
  const id = clean(input.jobId || input.id, 600);
  const current = store.jobs.find((job) => job.id === id);
  if (!current) throw campaignError("optical_campaign_job_not_found", "The optical campaign job no longer exists.", 404);
  const preparedCompletion = current.status === "completing" && (status === "submitted" || status === "failed");
  if (preparedCompletion) {
    assertLeaseIdentity(current, input, allowedStatuses);
    assertCompletion(current, input);
  } else {
    assertLease(current, input, now, allowedStatuses);
  }
  const telemetry = status === "submitted" ? normalizeSchedulerTelemetry(input.schedulerTelemetry) : current.schedulerTelemetry;
  if (status === "submitted" && !telemetry.status) throw campaignError("optical_campaign_telemetry_required", "Only the scheduler may submit a complete telemetry receipt.");
  if (status === "submitted" && JSON.stringify(telemetry) !== JSON.stringify(current.schedulerTelemetry)) throw campaignError("optical_campaign_telemetry_immutable", "Completion must retain the exact scheduler telemetry receipt recorded for this attempt.", 409);
  const job = {
    ...current,
    status,
    lease: emptyLease(),
    completion: status === "submitted"
      ? { ...current.completion, token: "" }
      : emptyCompletion(),
    schedulerTelemetry: telemetry,
    failure: status === "failed" ? normalizeFailure(input.failure || { code: "scheduler_worker_failed" }) : null,
    reviewId: status === "submitted" ? clean(input.reviewId, 5_000) : current.reviewId,
    lastWorkerId: current.lease.workerId,
    schedulerTiming: {
      startedAt: current.schedulerTiming.startedAt || current.lease.claimedAt,
      completedAt: now,
      wallClockMs: Math.max(0, Date.parse(now) - Date.parse(current.schedulerTiming.startedAt || current.lease.claimedAt || now)),
    },
    updatedAt: now,
  };
  return { store: replaceJob(store, job, now), job };
}

export function frameManifestDigest(framesInput = []) {
  const frames = normalizeFrames(framesInput);
  return `sha256:${sha256Hex(frameManifestCanonical(frames))}`;
}

export function frameManifestDigestMatches(expectedDigest, framesInput = []) {
  const expected = clean(expectedDigest, 240);
  const frames = normalizeFrames(framesInput);
  return expected === frameManifestDigest(frames) || expected === legacyFrameManifestDigest(frames);
}

export function frameManifestsEqual(leftInput = [], rightInput = []) {
  return frameManifestCanonical(normalizeFrames(leftInput)) === frameManifestCanonical(normalizeFrames(rightInput));
}

function normalizeConfiguration(input = {}) {
  return {
    ...normalizeWorkerConfiguration(input),
    maxActiveWorkers: Math.max(1, Math.min(3, Math.trunc(number(input.maxActiveWorkers, 3)))),
    leaseMs: Math.max(1_000, Math.min(3_600_000, Math.trunc(number(input.leaseMs, 900_000)))),
  };
}

function normalizeWorkerConfiguration(input = {}) {
  return {
    campaignId: clean(input.campaignId, 500) || "human-enricher-optical-terra-medium",
    model: clean(input.model, 240) || "gpt-5.6-terra",
    reasoningEffort: clean(input.reasoningEffort || input.effort, 80) || "medium",
    promptVersion: clean(input.promptVersion, 180) || "human-enricher-optical-v2",
    pass: "vision-only",
  };
}

function normalizePlanning(input = {}) {
  return {
    knownVideos: nonNegative(input.knownVideos),
    remainingOpticalReviews: nonNegative(input.remainingOpticalReviews),
    scanned: nonNegative(input.scanned),
    lastBatchScanned: nonNegative(input.lastBatchScanned),
    scanGeneration: nonNegative(input.scanGeneration),
    lastScannedVideoKey: clean(input.lastScannedVideoKey, 4_500),
    scanExhausted: input.scanExhausted === true,
    eligibleCandidates: nonNegative(input.eligibleCandidates),
    frameReadyPlanned: nonNegative(input.frameReadyPlanned),
    deferredMissingFrames: nonNegative(input.deferredMissingFrames),
    deferredMissingFiles: nonNegative(input.deferredMissingFiles),
    lastPlannedAt: clean(input.lastPlannedAt, 80) || null,
  };
}

function normalizeFrames(input = []) {
  const source = Array.isArray(input) ? input : [];
  const frames = source.slice(0, 24).map((frame, index) => {
    const sha256 = clean(frame?.sha256 || frame?.imageSha256, 80).toLowerCase().replace(/^sha256:/, "");
    if (!/^[a-f0-9]{64}$/.test(sha256)) throw campaignError("optical_campaign_frame_hash_required", `Registered frame ${index + 1} is missing a SHA-256 digest.`);
    return {
      ordinal: index + 1,
      role: normalizeFrameRole(frame?.role || frame?.marker, index, source.length),
      timestampSeconds: Math.max(0, number(frame?.timestampSeconds ?? frame?.timestamp, 0)),
      normalizedPosition: Math.max(0, Math.min(1, number(frame?.normalizedPosition, index / Math.max(1, source.length - 1)))),
      imagePath: clean(frame?.imagePath || frame?.path, 4_500),
      imageUri: clean(frame?.imageUri || frame?.uri, 4_500),
      sha256: `sha256:${sha256}`,
    };
  });
  if (new Set(frames.map((frame) => frame.sha256)).size !== frames.length) throw campaignError("optical_campaign_frame_hashes_not_distinct", "Registered frame hashes must be distinct.");
  return frames;
}

function normalizeFrameRole(value, index, length) {
  const role = clean(value, 80).toLowerCase();
  if (role.includes("first") || role.includes("start")) return "first";
  if (role.includes("last") || role.includes("end")) return "last";
  if (role.includes("mid") || role.includes("middle")) return "mid";
  return index === 0 ? "first" : index === length - 1 ? "last" : "mid";
}

function normalizeVideoIdentity(input = {}) {
  return {
    recordId: clean(input.recordId, 360),
    assetId: clean(input.assetId, 360),
    contentFingerprint: clean(input.contentFingerprint, 360),
    uri: clean(input.uri, 2_000),
    sourcePath: clean(input.sourcePath, 4_500),
  };
}

function normalizeRepair(input = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { priorReviewId: "", priorRevision: 0, reason: "" };
  const repair = {
    priorReviewId: clean(input.priorReviewId, 5_000),
    priorRevision: nonNegative(input.priorRevision),
    reason: clean(input.reason, 240),
  };
  if (!repair.priorReviewId && !repair.priorRevision && !repair.reason) return repair;
  if (!repair.priorReviewId || repair.priorRevision < 1) {
    throw campaignError("optical_campaign_repair_target_invalid", "A repair job requires one prior optical review ID and positive revision.");
  }
  return repair;
}

function normalizeQualityCalibration(input = {}) {
  return {
    sampleSize: nonNegative(input.sampleSize),
    exactMatchRate: nullableNumber(input.exactMatchRate),
    withinOneRate: nullableNumber(input.withinOneRate),
    meanError: nullableNumber(input.meanError),
    meanAbsoluteError: nullableNumber(input.meanAbsoluteError),
    gradeBands: (Array.isArray(input.gradeBands) ? input.gradeBands : []).slice(0, 5).map((band) => ({
      agentQuality: Math.max(1, Math.min(5, Math.trunc(number(band.agentQuality, 1)))),
      sampleSize: nonNegative(band.sampleSize),
      humanAverage: nullableNumber(band.humanAverage),
      meanDelta: nullableNumber(band.meanDelta),
    })),
    guidance: clean(input.guidance, 2_000),
  };
}

export function summarizeHumanVideoOpticalCampaign(storeInput = {}, options = {}) {
  const store = normalizeHumanVideoOpticalCampaignStore(storeInput);
  const now = clean(options.now, 80) || new Date().toISOString();
  const nowMs = Number.isFinite(Date.parse(now)) ? Date.parse(now) : Date.now();
  const count = (status) => store.jobs.filter((job) => job.status === status).length;
  const liveLeased = store.jobs.filter((job) => (job.status === "claimed" || job.status === "completing") && Date.parse(job.lease.expiresAt) > nowMs).length;
  const expiredLeases = store.jobs.filter((job) => (job.status === "claimed" || job.status === "completing") && Date.parse(job.lease.expiresAt) <= nowMs).length;
  const capturedTelemetry = store.jobs.filter((job) => job.schedulerTelemetry.status === "captured");
  const boundTelemetry = capturedTelemetry.filter((job) => {
    const receipt = job.schedulerTelemetry;
    return Boolean(receipt.receiptId
      && receipt.jobId === job.id
      && receipt.attempt === job.attempt
      && receipt.frameDigest === job.frameDigest
      && /^sha256:[a-f0-9]{64}$/.test(receipt.leaseIdDigest));
  });
  const frameProgressByJobId = new Map(store.jobs.map((job) => [job.id, projectHumanVideoOpticalFrameProgress(job)]));
  const totalFrames = [...frameProgressByJobId.values()].reduce((total, progress) => total + progress.total, 0);
  const inspectedFrames = [...frameProgressByJobId.values()].reduce((total, progress) => total + progress.completed, 0);
  const reviewCoverage = normalizeOpticalReviewCoverage(options.reviewCoverage, store.planning.knownVideos);
  const workerRows = store.jobs
    .map((job) => projectHumanVideoOpticalWorker(job, frameProgressByJobId.get(job.id), nowMs))
    .filter((worker) => worker.workerId)
    .sort(compareHumanVideoOpticalWorkers);
  const activeWorkers = workerRows.filter((worker) => worker.status === "claimed" || worker.status === "completing");
  const activeWorkerIds = new Set(activeWorkers.map((worker) => worker.workerId));
  const recentWorkerLimit = Math.max(0, Math.min(50, Math.trunc(number(options.recentWorkerLimit, 12))));
  const recentWorkers = [];
  const recentWorkerIds = new Set(activeWorkerIds);
  for (const worker of workerRows) {
    if (worker.status === "claimed" || worker.status === "completing" || recentWorkerIds.has(worker.workerId)) continue;
    recentWorkers.push(worker);
    recentWorkerIds.add(worker.workerId);
    if (recentWorkers.length >= recentWorkerLimit) break;
  }
  const recentActivity = projectHumanVideoOpticalActivity(store, options.recentEvents, { limit: options.activityLimit });
  return {
    schemaVersion: "hapa.human-video-optical-campaign-summary.v1",
    campaignId: store.configuration.campaignId,
    model: store.configuration.model,
    reasoningEffort: store.configuration.reasoningEffort,
    summary: {
      total: store.jobs.length,
      queued: count("queued"),
      active: liveLeased,
      completing: count("completing"),
      expiredLeases,
      capacity: store.configuration.maxActiveWorkers,
      submitted: count("submitted"),
      failed: count("failed"),
      attempts: store.jobs.reduce((total, job) => total + job.attempt, 0),
      recoveries: store.jobs.reduce((total, job) => total + job.recoveryCount, 0),
      totalFrames,
      inspectedFrames,
      frameInspectionPercent: totalFrames ? Math.round((inspectedFrames / totalFrames) * 100) : 0,
      opticalComplete: reviewCoverage.opticalComplete,
      compliantOpticalReviews: reviewCoverage.opticalComplete,
      paletteComplete: reviewCoverage.opticalComplete,
      legacyIncompleteOptical: reviewCoverage.legacyIncomplete,
      legacyPaletteRepairs: reviewCoverage.legacyIncomplete,
      remainingOpticalReviews: reviewCoverage.remaining,
      frameReadyPlanned: store.planning.frameReadyPlanned,
      deferredMissingFrames: store.planning.deferredMissingFrames + store.planning.deferredMissingFiles,
      tokenTelemetryCaptured: capturedTelemetry.length,
      tokenTelemetryBound: boundTelemetry.length,
      legacyUnboundTelemetryCaptured: capturedTelemetry.length - boundTelemetry.length,
    },
    planning: {
      ...store.planning,
      plannerSnapshotRemainingOpticalReviews: store.planning.remainingOpticalReviews,
      remainingOpticalReviews: reviewCoverage.remaining,
    },
    reviewCoverage,
    workers: [...activeWorkers, ...recentWorkers],
    recentActivity,
    updatedAt: store.updatedAt,
    generatedAt: now,
    truthBoundary: "Worker rows and activity are read projections of the durable optical campaign ledger and its append-only event log. A frame is marked inspected only by monotonic lease-bound progress or a captured scheduler receipt attesting one direct image view per registered frame; missing progress remains visibly unknown or pending.",
  };
}

export function projectHumanVideoOpticalFrameProgress(jobInput = {}) {
  const job = normalizeHumanVideoOpticalCampaignJob(jobInput);
  const receiptComplete = job.schedulerTelemetry.status === "captured"
    && job.schedulerTelemetry.directImageViewCalls === job.frames.length;
  const completed = new Set(receiptComplete
    ? job.frames.map((frame) => frame.ordinal)
    : job.workerProgress.completedFrameOrdinals);
  const source = receiptComplete || job.workerProgress.completionSource === "scheduler-receipt"
    ? "scheduler-receipt"
    : job.workerProgress.completedFrameOrdinals.length
      ? "worker-progress"
      : "none";
  const frames = job.frames.map((frame) => ({
    ordinal: frame.ordinal,
    role: frame.role,
    status: completed.has(frame.ordinal)
      ? source === "scheduler-receipt" ? "receipt-confirmed" : "inspected"
      : job.status === "claimed" && job.workerProgress.currentFrameOrdinal === frame.ordinal
        ? "viewing"
        : "pending",
    timestampSeconds: frame.timestampSeconds,
  }));
  const completedCount = frames.filter((frame) => frame.status === "inspected" || frame.status === "receipt-confirmed").length;
  return {
    completed: completedCount,
    total: frames.length,
    percent: frames.length ? Math.round((completedCount / frames.length) * 100) : 0,
    currentOrdinal: job.status === "claimed" ? job.workerProgress.currentFrameOrdinal : null,
    source,
    frames,
  };
}

function projectHumanVideoOpticalWorker(job, frameProgress, nowMs) {
  const workerId = job.lease.workerId || job.lastWorkerId || "";
  const expiresAtMs = job.lease.expiresAt ? Date.parse(job.lease.expiresAt) : NaN;
  const claimedAtMs = job.lease.claimedAt ? Date.parse(job.lease.claimedAt) : NaN;
  const leaseRemainingMs = Number.isFinite(expiresAtMs) ? Math.max(0, expiresAtMs - nowMs) : null;
  const leaseDurationMs = Number.isFinite(expiresAtMs) && Number.isFinite(claimedAtMs) ? Math.max(0, expiresAtMs - claimedAtMs) : 0;
  const leaseHealth = job.status !== "claimed" && job.status !== "completing"
    ? job.attempt > 0 ? "released" : "none"
    : leaseRemainingMs === 0
      ? "expired"
      : leaseRemainingMs <= Math.max(30_000, Math.trunc(leaseDurationMs * 0.2))
        ? "expiring"
        : "fresh";
  return {
    workerId,
    agentPath: job.schedulerTelemetry.agentPath || "",
    jobId: job.id,
    lifecycleState: humanVideoOpticalLifecycleState(job, leaseHealth),
    status: job.status,
    videoKey: job.videoKey,
    videoId: job.videoId,
    videoName: job.videoName,
    attempt: job.attempt,
    claimedAt: job.schedulerTiming.startedAt || job.lease.claimedAt || null,
    updatedAt: job.updatedAt,
    expiresAt: job.lease.expiresAt,
    leaseHealth,
    leaseRemainingMs,
    phase: job.workerProgress.phase || lifecyclePhaseForStatus(job.status),
    frameProgress,
    telemetry: {
      status: job.schedulerTelemetry.status || "pending",
      model: job.schedulerTelemetry.model || job.workerConfiguration.model,
      reasoningEffort: job.schedulerTelemetry.reasoningEffort || job.workerConfiguration.reasoningEffort,
      startedAt: job.schedulerTelemetry.startedAt,
      completedAt: job.schedulerTelemetry.completedAt,
      wallClockMs: job.schedulerTelemetry.wallClockMs,
      directImageViewCalls: job.schedulerTelemetry.directImageViewCalls,
      totalTokens: job.schedulerTelemetry.totalTokens,
    },
    failure: job.failure,
  };
}

function compareHumanVideoOpticalWorkers(left, right) {
  const leftActive = left.status === "claimed" || left.status === "completing";
  const rightActive = right.status === "claimed" || right.status === "completing";
  if (leftActive !== rightActive) return leftActive ? -1 : 1;
  return String(right.updatedAt || "").localeCompare(String(left.updatedAt || "")) || left.workerId.localeCompare(right.workerId);
}

function humanVideoOpticalLifecycleState(job, leaseHealth) {
  if ((job.status === "claimed" || job.status === "completing") && leaseHealth === "expired") return "lease-expired";
  if (job.status === "completing") return "finalizing";
  if (job.status === "submitted") return "completed";
  if (job.status === "failed") return job.failure?.retryable ? "retryable-failed" : "failed";
  if (job.status === "queued") return job.attempt > 0 ? "requeued" : "queued";
  if (job.workerProgress.phase === "inspecting") return "inspecting-frames";
  return job.workerProgress.phase || "claimed";
}

function lifecyclePhaseForStatus(status) {
  if (status === "completing") return "submitting";
  if (status === "submitted") return "completed";
  if (status === "failed") return "failed";
  return status;
}

function normalizeOpticalReviewCoverage(input = {}, knownVideos = 0) {
  const totalReviews = nonNegative(input?.totalReviews);
  const opticalComplete = nonNegative(input?.opticalComplete);
  const legacyIncomplete = nonNegative(input?.legacyIncomplete);
  const blocked = nonNegative(input?.blocked);
  const known = Math.max(nonNegative(knownVideos), nonNegative(input?.knownVideos));
  return {
    knownVideos: known,
    totalReviews,
    opticalComplete,
    compliantOpticalReviews: opticalComplete,
    paletteComplete: opticalComplete,
    legacyIncomplete,
    legacyPaletteRepairs: legacyIncomplete,
    blocked,
    remaining: Math.max(0, known - opticalComplete),
    completionRule: "attested optical inspection + at least three distinct registered frames including First/Mid/Last + an evidence-bound 3–8 color palette per frame",
  };
}

function projectHumanVideoOpticalActivity(store, eventsInput, options = {}) {
  const source = Array.isArray(eventsInput) ? eventsInput : [];
  const limit = Math.max(0, Math.min(100, Math.trunc(number(options.limit, 24))));
  const jobsById = new Map(store.jobs.map((job) => [job.id, job]));
  return source
    .filter((event) => event && typeof event === "object" && event.schemaVersion === HUMAN_VIDEO_OPTICAL_CAMPAIGN_EVENT_SCHEMA)
    .sort((left, right) => String(right.occurredAt || "").localeCompare(String(left.occurredAt || "")))
    .slice(0, limit)
    .map((event) => {
      const job = jobsById.get(clean(event.jobId, 600));
      const eventProgress = job && event.progress
        ? projectHumanVideoOpticalFrameProgress({
            ...job,
            status: "queued",
            attempt: nonNegative(event.attempt) || job.attempt,
            lease: emptyLease(),
            completion: emptyCompletion(),
            workerProgress: event.progress,
            schedulerTelemetry: event.telemetry || emptySchedulerTelemetry(),
          })
        : job && event.telemetry?.status === "captured" && Number(event.telemetry.directImageViewCalls) === job.frames.length
          ? projectHumanVideoOpticalFrameProgress({ ...job, status: "queued", lease: emptyLease(), completion: emptyCompletion(), schedulerTelemetry: event.telemetry })
          : null;
      return {
        action: clean(event.action, 240),
        occurredAt: clean(event.occurredAt, 80) || null,
        jobId: clean(event.jobId, 600),
        workerId: clean(event.workerId, 240),
        videoKey: clean(event.videoKey, 4_500),
        videoName: clean(event.videoName || job?.videoName, 800),
        attempt: nonNegative(event.attempt),
        lifecycleState: lifecycleStateForEvent(event),
        phase: clean(event.progress?.phase, 80) || lifecyclePhaseForStatus(clean(event.status, 80)),
        frameProgress: eventProgress,
      };
    });
}

function lifecycleStateForEvent(event) {
  const action = clean(event.action, 240).replace(/^human-video-optical-campaign\./, "");
  if (action === "claimed") return "claimed";
  if (action === "progress-recorded") return clean(event.progress?.phase, 80) || "working";
  if (action === "telemetry-recorded") return "telemetry-recorded";
  if (action === "completion-prepared") return "finalizing";
  if (action === "submitted") return "completed";
  if (action === "failed" || action === "completion-aborted") return "failed";
  if (action === "stale-lease-recovered" || action === "completion-requeued") return "requeued";
  return action || "activity";
}

function normalizeWorkerProgress(input = null, context = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return emptyWorkerProgress();
  const attempt = nonNegative(input.attempt);
  const phase = clean(input.phase, 80).toLowerCase();
  if (phase && !WORK_PHASES.has(phase)) throw campaignError("optical_campaign_progress_phase_invalid", `Unknown optical worker phase: ${phase}.`);
  const hasCompletedFrameOrdinals = Object.prototype.hasOwnProperty.call(input, "completedFrameOrdinals");
  if (hasCompletedFrameOrdinals && !Array.isArray(input.completedFrameOrdinals)) {
    throw campaignError("optical_campaign_progress_frames_invalid", "Persisted optical worker progress must store completed frame ordinals as an array.");
  }
  const manifestOrdinals = new Set((context.frames || []).map((frame) => frame.ordinal));
  const completedFrameOrdinals = [...new Set((input.completedFrameOrdinals || [])
    .map((value) => Math.trunc(number(value?.ordinal ?? value, -1))))].sort((left, right) => left - right);
  if (completedFrameOrdinals.some((ordinal) => !manifestOrdinals.has(ordinal))) {
    throw campaignError("optical_campaign_progress_frame_not_registered", "Persisted optical progress references a frame outside its registered manifest.");
  }
  const currentFrameOrdinal = input.currentFrameOrdinal == null ? null : Math.trunc(number(input.currentFrameOrdinal, -1));
  if (currentFrameOrdinal != null && !manifestOrdinals.has(currentFrameOrdinal)) {
    throw campaignError("optical_campaign_progress_current_frame_not_registered", "Persisted optical progress names a current frame outside its registered manifest.");
  }
  const completionSource = new Set(["worker-progress", "scheduler-receipt"]).has(input.completionSource) ? input.completionSource : "";
  const hasProgressContent = attempt > 0
    || Boolean(phase || completionSource || input.startedAt || input.updatedAt)
    || currentFrameOrdinal != null
    || completedFrameOrdinals.length > 0;
  if (hasProgressContent && (attempt < 1 || attempt !== context.attempt)) {
    throw campaignError("optical_campaign_progress_attempt_mismatch", "Persisted optical worker progress must carry the job's positive current attempt.");
  }
  return {
    attempt,
    phase,
    currentFrameOrdinal: phase === "inspecting" ? currentFrameOrdinal : null,
    completedFrameOrdinals,
    completionSource,
    startedAt: clean(input.startedAt, 80) || null,
    updatedAt: clean(input.updatedAt, 80) || null,
  };
}

function createWorkerProgress(frames, attempt, now) {
  return {
    attempt,
    phase: "claimed",
    currentFrameOrdinal: null,
    completedFrameOrdinals: [],
    completionSource: "",
    startedAt: now,
    updatedAt: now,
  };
}

function emptyWorkerProgress() {
  return {
    attempt: 0,
    phase: "",
    currentFrameOrdinal: null,
    completedFrameOrdinals: [],
    completionSource: "",
    startedAt: null,
    updatedAt: null,
  };
}

function normalizeLease(input = {}) {
  if (!input || typeof input !== "object") return emptyLease();
  return { workerId: clean(input.workerId, 240), leaseId: clean(input.leaseId, 360), claimedAt: clean(input.claimedAt, 80) || null, expiresAt: clean(input.expiresAt, 80) || null };
}

function emptyLease() { return { workerId: "", leaseId: "", claimedAt: null, expiresAt: null }; }

function normalizeCompletion(input = {}) {
  if (!input || typeof input !== "object") return emptyCompletion();
  const resultDigest = clean(input.resultDigest, 240).toLowerCase();
  if (resultDigest && !/^sha256:[a-f0-9]{64}$/.test(resultDigest)) throw campaignError("optical_campaign_completion_digest_invalid", "The prepared optical result digest must be canonical SHA-256.");
  return {
    token: clean(input.token, 500),
    resultDigest,
    preparedAt: clean(input.preparedAt, 80) || null,
  };
}

function emptyCompletion() { return { token: "", resultDigest: "", preparedAt: null }; }

function normalizeSchedulerTelemetry(input = null) {
  if (!input || typeof input !== "object") return emptySchedulerTelemetry();
  const status = TELEMETRY_STATUSES.has(input.status) ? input.status : "";
  const receipt = {
    status,
    receiptId: clean(input.receiptId, 500),
    jobId: clean(input.jobId, 600),
    attempt: Math.max(0, Math.trunc(number(input.attempt, 0))),
    frameDigest: clean(input.frameDigest, 240),
    leaseIdDigest: clean(input.leaseIdDigest, 240),
    source: clean(input.source, 360),
    sessionId: clean(input.sessionId, 500),
    model: clean(input.model, 240),
    reasoningEffort: clean(input.reasoningEffort || input.effort, 80),
    agentPath: clean(input.agentPath, 500),
    startedAt: clean(input.startedAt, 80) || null,
    completedAt: clean(input.completedAt, 80) || null,
    wallClockMs: input.wallClockMs == null ? null : nonNegative(input.wallClockMs),
    directImageViewCalls: nonNegative(input.directImageViewCalls ?? input.viewImageCalls),
    inputTokens: nonNegative(input.inputTokens),
    cachedInputTokens: nonNegative(input.cachedInputTokens),
    outputTokens: nonNegative(input.outputTokens),
    reasoningTokens: nonNegative(input.reasoningTokens),
    totalTokens: nonNegative(input.totalTokens),
  };
  if (status === "captured" && (
    !receipt.source || !receipt.sessionId || !receipt.model || !receipt.reasoningEffort || !receipt.agentPath || !receipt.startedAt || !receipt.completedAt
    || receipt.wallClockMs == null || receipt.directImageViewCalls < 1 || receipt.totalTokens !== receipt.inputTokens + receipt.outputTokens
    || receipt.cachedInputTokens > receipt.inputTokens || receipt.reasoningTokens > receipt.outputTokens
    || !Number.isFinite(Date.parse(receipt.startedAt)) || !Number.isFinite(Date.parse(receipt.completedAt))
    || Math.abs((Date.parse(receipt.completedAt) - Date.parse(receipt.startedAt)) - receipt.wallClockMs) > 1_000
  )) throw campaignError("optical_campaign_telemetry_invalid", "Captured scheduler telemetry requires model/effort/agent/timing/image-view provenance and internally consistent token counts.");
  if (status === "unavailable" && !receipt.source) throw campaignError("optical_campaign_telemetry_source_required", "Unavailable telemetry must name the scheduler source that could not provide it.");
  return receipt;
}

function emptySchedulerTelemetry() {
  return {
    status: "",
    receiptId: "",
    jobId: "",
    attempt: 0,
    frameDigest: "",
    leaseIdDigest: "",
    source: "",
    sessionId: "",
    model: "",
    reasoningEffort: "",
    agentPath: "",
    startedAt: null,
    completedAt: null,
    wallClockMs: null,
    directImageViewCalls: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
  };
}

function normalizeSchedulerTiming(input = {}) {
  if (!input || typeof input !== "object") return { startedAt: null, completedAt: null, wallClockMs: null };
  return {
    startedAt: clean(input.startedAt, 80) || null,
    completedAt: clean(input.completedAt, 80) || null,
    wallClockMs: input.wallClockMs == null ? null : nonNegative(input.wallClockMs),
  };
}

function normalizeFailure(input = null) {
  if (!input || typeof input !== "object") return null;
  return { code: clean(input.code, 180) || "scheduler_worker_failed", message: clean(input.message, 2_000), retryable: input.retryable === true };
}

function assertLease(job, input, now = new Date().toISOString(), allowedStatuses = ["claimed"]) {
  assertLeaseIdentity(job, input, allowedStatuses);
  if (Date.parse(job.lease.expiresAt) <= Date.parse(now)) {
    throw campaignError("optical_campaign_lease_expired", "This optical worker lease expired. Reclaim the job before recording telemetry or submitting output.", 409);
  }
}

function assertLeaseIdentity(job, input, allowedStatuses = ["claimed"]) {
  if (!allowedStatuses.includes(job.status)) throw campaignError("optical_campaign_job_not_claimed", `Optical job state ${job.status} does not permit this lease operation.`, 409);
  if (Math.trunc(number(input.attempt, -1)) !== job.attempt || clean(input.workerId, 240) !== job.lease.workerId || clean(input.leaseId, 360) !== job.lease.leaseId) {
    throw campaignError("optical_campaign_lease_mismatch", "The optical worker no longer owns this job lease.", 409);
  }
}

function assertCompletion(job, input) {
  if (!job.completion.token || clean(input.completionToken, 500) !== job.completion.token || clean(input.resultDigest, 240).toLowerCase() !== job.completion.resultDigest) {
    throw campaignError("optical_campaign_completion_receipt_mismatch", "The server-prepared completion receipt does not match this optical result.", 409);
  }
}

function replaceJob(store, job, now) {
  return normalizeHumanVideoOpticalCampaignStore({ ...store, jobs: [...store.jobs.filter((item) => item.id !== job.id), job], updatedAt: now });
}

function legacyStableDigest(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function legacyFrameManifestDigest(framesInput = []) {
  const frames = normalizeFrames(framesInput);
  return `fnv1a:${legacyStableDigest(frames.map((frame) => `${frame.ordinal}|${frame.role}|${frame.sha256}|${frame.timestampSeconds}|${frame.normalizedPosition}|${frame.imagePath}|${frame.imageUri}`).join("\n"))}`;
}

function frameManifestCanonical(frames) {
  return JSON.stringify(frames.map((frame) => ({
    ordinal: frame.ordinal,
    role: frame.role,
    timestampSeconds: frame.timestampSeconds,
    normalizedPosition: frame.normalizedPosition,
    imagePath: frame.imagePath,
    imageUri: frame.imageUri,
    sha256: frame.sha256,
  })));
}

function sha256Hex(value) { return bytesToHex(sha256(new TextEncoder().encode(String(value)))); }
function sha256Digest(value) { return `sha256:${sha256Hex(value)}`; }
function randomLeaseId(seed) {
  if (globalThis.crypto?.randomUUID) return `lease:${globalThis.crypto.randomUUID()}`;
  return `lease:${sha256Hex(`${seed}\n${Date.now()}\n${Math.random()}`)}`;
}
function randomCompletionToken(seed) {
  if (globalThis.crypto?.randomUUID) return `completion:${globalThis.crypto.randomUUID()}`;
  return `completion:${sha256Hex(`${seed}\n${Date.now()}\n${Math.random()}`)}`;
}

function nonNegative(value) { return Math.max(0, Math.trunc(number(value, 0))); }
function nullableNumber(value) { const parsed = Number(value); return value == null || !Number.isFinite(parsed) ? null : parsed; }
function number(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function clean(value, max) { return String(value || "").replace(/\0/g, "").trim().slice(0, max); }
function campaignError(code, message, statusCode = 400, details = null) { const error = new Error(message); error.code = code; error.statusCode = statusCode; error.details = details; return error; }
