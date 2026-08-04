import { appendFile, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { withLocalJsonFileLock } from "./local-json-file-lock.mjs";
import {
  abortHumanVideoOpticalCampaignCompletion,
  beginHumanVideoOpticalCampaignCompletion,
  createHumanVideoOpticalCampaignStore,
  enqueueHumanVideoOpticalCampaignJob,
  claimHumanVideoOpticalCampaignJob,
  failHumanVideoOpticalCampaignJob,
  HUMAN_VIDEO_OPTICAL_CAMPAIGN_EVENT_SCHEMA,
  normalizeHumanVideoOpticalCampaignStore,
  recordHumanVideoOpticalCampaignProgress,
  recordHumanVideoOpticalCampaignTelemetry,
  requeueExpiredHumanVideoOpticalCampaignCompletion,
  recoverStaleHumanVideoOpticalCampaignLeases,
  submitHumanVideoOpticalCampaignJob,
  updateHumanVideoOpticalCampaignPlanning,
} from "../src/domain/human-video-optical-campaign.js";

export function openHumanVideoOpticalCampaignStore({ filePath, eventPath, clock = () => new Date().toISOString() } = {}) {
  if (!filePath) throw new Error("Human video optical campaign store requires a file path.");
  const resolvedFilePath = path.resolve(filePath);
  const resolvedEventPath = path.resolve(eventPath || path.join(path.dirname(resolvedFilePath), "human-video-optical-campaign-events.ndjson"));
  let writeQueue = Promise.resolve();

  async function read() {
    try { return normalizeHumanVideoOpticalCampaignStore(JSON.parse(await readFile(resolvedFilePath, "utf8"))); }
    catch (error) {
      if (error?.code === "ENOENT") return createHumanVideoOpticalCampaignStore();
      error.code ||= "human_video_optical_campaign_store_invalid";
      error.statusCode ||= 500;
      throw error;
    }
  }

  async function enqueue(input = {}) {
    return mutate("enqueued", async (store, now) => enqueueHumanVideoOpticalCampaignJob(store, input, { now }));
  }
  async function enqueueIf(input = {}, predicate = async () => true) {
    return mutate("enqueued", async (store, now) => {
      if (!await predicate(store, input)) return { store, job: null, created: false, skipped: true };
      return enqueueHumanVideoOpticalCampaignJob(store, input, { now });
    });
  }
  async function plan(input = {}) {
    return mutate("planned", async (store, now) => ({ store: updateHumanVideoOpticalCampaignPlanning(store, input, { now }), job: null }));
  }
  async function claim(worker, options = {}) {
    return mutate("claimed", async (store, now) => claimHumanVideoOpticalCampaignJob(store, worker, { ...options, now }));
  }
  async function submit(input = {}) {
    return mutate("submitted", async (store, now) => submitHumanVideoOpticalCampaignJob(store, input, { now }));
  }
  async function beginCompletion(input = {}) {
    return mutate("completion-prepared", async (store, now) => beginHumanVideoOpticalCampaignCompletion(store, input, { now }));
  }
  async function completeWithReview(input = {}, persistReview) {
    if (typeof persistReview !== "function") throw storeError("optical_campaign_review_writer_required", "Campaign completion requires one review-store writer.");
    return exclusive(async () => {
      const preparedAt = clock();
      const currentStore = await read();
      const currentJob = currentStore.jobs.find((job) => job.id === String(input.jobId || input.id || "").trim());
      const wasPrepared = currentJob?.status === "completing";
      const prepared = beginHumanVideoOpticalCampaignCompletion(currentStore, input, { now: preparedAt });
      if (!wasPrepared) await persistMutation("completion-prepared", prepared, preparedAt);
      let reviewResult;
      try {
        reviewResult = await persistReview(prepared.job);
      } catch (error) {
        error.preparedJob = prepared.job;
        throw error;
      }
      const completedAt = clock();
      const submitted = submitHumanVideoOpticalCampaignJob(prepared.store, {
        ...input,
        completionToken: prepared.job.completion.token,
        resultDigest: prepared.job.completion.resultDigest,
        schedulerTelemetry: prepared.job.schedulerTelemetry,
        reviewId: reviewResult?.review?.id,
      }, { now: completedAt });
      await persistMutation("submitted", submitted, completedAt);
      return { ...submitted, review: reviewResult.review, preparedJob: prepared.job };
    });
  }
  async function abortCompletion(input = {}) {
    return mutate("completion-aborted", async (store, now) => abortHumanVideoOpticalCampaignCompletion(store, input, { now }));
  }
  async function fail(input = {}) {
    return mutate("failed", async (store, now) => failHumanVideoOpticalCampaignJob(store, input, { now }));
  }
  async function telemetry(input = {}) {
    return mutate("telemetry-recorded", async (store, now) => recordHumanVideoOpticalCampaignTelemetry(store, input, { now }));
  }
  async function progress(input = {}) {
    return mutate("progress-recorded", async (store, now) => recordHumanVideoOpticalCampaignProgress(store, input, { now }));
  }
  async function recover() {
    return mutate("stale-lease-recovered", async (store, now) => recoverStaleHumanVideoOpticalCampaignLeases(store, { now }));
  }

  async function recoverCompletion(input = {}, findMatchingReview = async () => null) {
    return exclusive(async () => {
      const now = clock();
      const store = await read();
      const job = store.jobs.find((candidate) => candidate.id === String(input.jobId || input.id || "").trim());
      if (!job) throw storeError("optical_campaign_job_not_found", "The optical campaign job no longer exists.", 404);
      const review = await findMatchingReview(job);
      const result = review
        ? submitHumanVideoOpticalCampaignJob(store, {
            ...input,
            completionToken: job.completion.token,
            resultDigest: job.completion.resultDigest,
            schedulerTelemetry: job.schedulerTelemetry,
            reviewId: review.id,
          }, { now })
        : requeueExpiredHumanVideoOpticalCampaignCompletion(store, input, { now });
      await persistMutation(review ? "submitted" : "completion-requeued", result, now);
      return { ...result, review, reconciled: Boolean(review), requeued: !review };
    });
  }

  async function withVideoAvailable(videoKeyInput, operation) {
    const videoKey = String(videoKeyInput || "").trim();
    if (!videoKey) throw storeError("optical_campaign_video_key_required", "Direct optical review custody requires one stable video key.");
    return exclusive(async () => {
      const store = await read();
      const reserved = store.jobs.find((job) => job.videoKey === videoKey && !(job.status === "failed" && job.failure?.retryable !== true));
      if (reserved) {
        throw storeError("optical_campaign_video_reserved", "This video already belongs to the resumable optical campaign. Complete or explicitly close that campaign job instead of preempting it through the manual queue.", 409, {
          videoKey,
          jobId: reserved.id,
          status: reserved.status,
          attempt: reserved.attempt,
        });
      }
      return operation(store);
    });
  }

  async function mutate(action, operation) {
    return exclusive(async () => {
      const now = clock();
      const result = await operation(await read(), now);
      if (result.skipped) return result;
      await persistMutation(action, result, now);
      return result;
    });
  }

  async function persistMutation(action, result, now) {
    await writeAtomic(resolvedFilePath, result.store);
    const job = result.job || null;
    await appendEvent(resolvedEventPath, {
        schemaVersion: HUMAN_VIDEO_OPTICAL_CAMPAIGN_EVENT_SCHEMA,
        action: `human-video-optical-campaign.${action}`,
        occurredAt: now,
        jobId: job?.id || null,
        videoKey: job?.videoKey || null,
        videoName: job?.videoName || null,
        attempt: job?.attempt || null,
        workerId: job?.lease?.workerId || job?.lastWorkerId || null,
        status: job?.status || null,
        workerConfiguration: job?.workerConfiguration || null,
        schedulerTiming: job?.schedulerTiming || null,
        progress: job?.workerProgress?.attempt ? {
          attempt: job.workerProgress.attempt,
          phase: job.workerProgress.phase,
          currentFrameOrdinal: job.workerProgress.currentFrameOrdinal,
          completedFrameOrdinals: job.workerProgress.completedFrameOrdinals,
          completionSource: job.workerProgress.completionSource,
          startedAt: job.workerProgress.startedAt,
          updatedAt: job.workerProgress.updatedAt,
        } : null,
        completion: job?.completion?.resultDigest ? { resultDigest: job.completion.resultDigest, preparedAt: job.completion.preparedAt } : null,
        reviewId: job?.reviewId || null,
        telemetry: job?.schedulerTelemetry?.status ? {
          status: job.schedulerTelemetry.status,
          receiptId: job.schedulerTelemetry.receiptId,
          jobId: job.schedulerTelemetry.jobId,
          attempt: job.schedulerTelemetry.attempt,
          frameDigest: job.schedulerTelemetry.frameDigest,
          leaseIdDigest: job.schedulerTelemetry.leaseIdDigest,
          source: job.schedulerTelemetry.source,
          sessionId: job.schedulerTelemetry.sessionId,
          model: job.schedulerTelemetry.model,
          reasoningEffort: job.schedulerTelemetry.reasoningEffort,
          agentPath: job.schedulerTelemetry.agentPath,
          startedAt: job.schedulerTelemetry.startedAt,
          completedAt: job.schedulerTelemetry.completedAt,
          wallClockMs: job.schedulerTelemetry.wallClockMs,
          directImageViewCalls: job.schedulerTelemetry.directImageViewCalls,
          inputTokens: job.schedulerTelemetry.inputTokens,
          cachedInputTokens: job.schedulerTelemetry.cachedInputTokens,
          outputTokens: job.schedulerTelemetry.outputTokens,
          reasoningTokens: job.schedulerTelemetry.reasoningTokens,
          totalTokens: job.schedulerTelemetry.totalTokens,
        } : null,
        recovered: result.recovered || [],
    });
  }

  async function exclusive(operation) {
    const result = writeQueue.then(() => withLocalJsonFileLock(`${resolvedFilePath}.lock`, operation, { errorCode: "optical_campaign_store_locked", errorMessage: "The optical campaign store is busy in another process; retry this mutation." }));
    writeQueue = result.catch(() => {});
    return result;
  }

  async function recentEvents(options = {}) {
    return readRecentCampaignEvents(resolvedEventPath, options);
  }

  return { filePath: resolvedFilePath, eventPath: resolvedEventPath, read, plan, enqueue, enqueueIf, withVideoAvailable, claim, beginCompletion, completeWithReview, recoverCompletion, submit, fail, abortCompletion, telemetry, progress, recover, recentEvents };
}

function storeError(code, message, statusCode = 400, details = null) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

async function writeAtomic(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);
}

async function appendEvent(filePath, event) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
}

async function readRecentCampaignEvents(filePath, options = {}) {
  const limit = Math.max(0, Math.min(100, Math.trunc(Number(options.limit ?? 24) || 0)));
  if (!limit) return [];
  let handle;
  try {
    handle = await open(filePath, "r");
    const { size } = await handle.stat();
    if (!size) return [];
    let byteCount = Math.min(size, Math.max(128 * 1024, limit * 8 * 1024));
    let events = [];
    while (byteCount <= size) {
      const offset = size - byteCount;
      const buffer = Buffer.alloc(byteCount);
      await handle.read(buffer, 0, byteCount, offset);
      let text = buffer.toString("utf8");
      if (offset > 0) text = text.slice(Math.max(0, text.indexOf("\n") + 1));
      events = text.split("\n").filter(Boolean).flatMap((line) => {
        try { return [JSON.parse(line)]; }
        catch { return []; }
      });
      if (events.length >= limit || offset === 0) break;
      byteCount = Math.min(size, byteCount * 2);
    }
    return events.slice(-limit);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  } finally {
    await handle?.close().catch(() => {});
  }
}
