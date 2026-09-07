export const HUMAN_VIDEO_OPTICAL_BENCHMARK_DISPATCHER_SCHEMA = "hapa.human-video-optical-benchmark-dispatcher.v1";
const JOB_STATUSES = new Set(["queued", "pending-receipt", "retryable", "accepted"]);
const RECEIPT_STATUSES = new Set(["pending", "terminal-failed", "accepted"]);

export function createHumanVideoOpticalBenchmarkDispatcher(input = {}) {
  const jobs = list(input.jobs).map((job, index) => ({
    id: clean(job.id || `benchmark-job:${index + 1}`, 800),
    ordinal: positive(job.ordinal, index + 1),
    videoKey: clean(job.videoKey, 4_500),
    packetPath: clean(job.packetPath, 4_500),
    status: "queued",
    attempts: 0,
    activeReceiptId: "",
    acceptedReceiptId: "",
  }));
  if (!jobs.length || jobs.some((job) => !job.id || !job.videoKey || !job.packetPath)) throw dispatcherError("benchmark_dispatcher_jobs_invalid", "Dispatcher initialization requires non-empty jobs with stable IDs, video keys, and packet paths.");
  if (new Set(jobs.map((job) => job.id)).size !== jobs.length || new Set(jobs.map((job) => job.videoKey)).size !== jobs.length) throw dispatcherError("benchmark_dispatcher_jobs_duplicate", "Benchmark jobs must have unique IDs and video keys.");
  return normalizeHumanVideoOpticalBenchmarkDispatcher({ schemaVersion: HUMAN_VIDEO_OPTICAL_BENCHMARK_DISPATCHER_SCHEMA, jobs, receipts: [], createdAt: input.createdAt || null, updatedAt: input.createdAt || null });
}

export function normalizeHumanVideoOpticalBenchmarkDispatcher(input = {}) {
  if (input.schemaVersion && input.schemaVersion !== HUMAN_VIDEO_OPTICAL_BENCHMARK_DISPATCHER_SCHEMA) throw dispatcherError("benchmark_dispatcher_schema_invalid", "Unknown benchmark dispatcher schema.");
  const jobs = list(input.jobs).map((job) => {
    if (!JOB_STATUSES.has(job.status)) throw dispatcherError("benchmark_dispatcher_job_status_invalid", `Unknown benchmark job status: ${job.status}`);
    return { id: clean(job.id, 800), ordinal: positive(job.ordinal, 1), videoKey: clean(job.videoKey, 4_500), packetPath: clean(job.packetPath, 4_500), status: job.status, attempts: Math.max(0, integer(job.attempts, 0)), activeReceiptId: clean(job.activeReceiptId, 800), acceptedReceiptId: clean(job.acceptedReceiptId, 800) };
  });
  const receipts = list(input.receipts).map((receipt) => {
    if (!RECEIPT_STATUSES.has(receipt.status)) throw dispatcherError("benchmark_dispatcher_receipt_status_invalid", `Unknown benchmark receipt status: ${receipt.status}`);
    return { id: clean(receipt.id, 800), jobId: clean(receipt.jobId, 800), videoKey: clean(receipt.videoKey, 4_500), attempt: positive(receipt.attempt, 1), workerId: clean(receipt.workerId, 500), leaseHash: clean(receipt.leaseHash, 100), receiptPath: clean(receipt.receiptPath, 4_500), rawResultPath: clean(receipt.rawResultPath, 4_500), status: receipt.status, claimedAt: clean(receipt.claimedAt, 80), expiresAt: clean(receipt.expiresAt, 80), settledAt: clean(receipt.settledAt, 80), failureReason: clean(receipt.failureReason, 1_200), resultDigest: clean(receipt.resultDigest, 100) };
  });
  if (new Set(jobs.map((job) => job.id)).size !== jobs.length || new Set(receipts.map((receipt) => receipt.id)).size !== receipts.length) throw dispatcherError("benchmark_dispatcher_identity_duplicate", "Dispatcher job and receipt IDs must be unique.");
  for (const receipt of receipts) if (!jobs.some((job) => job.id === receipt.jobId)) throw dispatcherError("benchmark_dispatcher_receipt_job_missing", "Every receipt must belong to one dispatcher job.");
  const pendingWorkers = receipts.filter((receipt) => receipt.status === "pending").map((receipt) => receipt.workerId);
  if (new Set(pendingWorkers).size !== pendingWorkers.length) throw dispatcherError("benchmark_dispatcher_worker_overlap", "A worker may hold only one pending video receipt.");
  return { schemaVersion: HUMAN_VIDEO_OPTICAL_BENCHMARK_DISPATCHER_SCHEMA, jobs: jobs.sort((a, b) => a.ordinal - b.ordinal), receipts, createdAt: clean(input.createdAt, 80) || null, updatedAt: clean(input.updatedAt, 80) || null };
}

export function claimHumanVideoOpticalBenchmarkJob(storeInput, input = {}) {
  const store = normalizeHumanVideoOpticalBenchmarkDispatcher(storeInput);
  const workerId = clean(input.workerId, 500);
  if (!workerId) throw dispatcherError("benchmark_dispatcher_worker_required", "A claim requires one worker ID.");
  if (store.receipts.some((receipt) => receipt.workerId === workerId && receipt.status === "pending")) throw dispatcherError("benchmark_dispatcher_previous_receipt_pending", "The worker cannot receive another video until its previous receipt validates or terminates.", 409);
  const job = store.jobs.find((candidate) => candidate.status === "retryable") || store.jobs.find((candidate) => candidate.status === "queued");
  if (!job) return { store, claim: null };
  const now = clean(input.now, 80) || new Date().toISOString();
  const receipt = { id: clean(input.receiptId, 800), jobId: job.id, videoKey: job.videoKey, attempt: job.attempts + 1, workerId, leaseHash: clean(input.leaseHash, 100), receiptPath: clean(input.receiptPath, 4_500), rawResultPath: clean(input.rawResultPath, 4_500), status: "pending", claimedAt: now, expiresAt: clean(input.expiresAt, 80), settledAt: "", failureReason: "", resultDigest: "" };
  if (!receipt.id || !receipt.leaseHash || !receipt.receiptPath || !receipt.rawResultPath || !receipt.expiresAt) throw dispatcherError("benchmark_dispatcher_claim_receipt_invalid", "A claim requires dispatcher-owned receipt, lease, expiry, and raw-result paths.");
  const jobs = store.jobs.map((candidate) => candidate.id === job.id ? { ...candidate, status: "pending-receipt", attempts: receipt.attempt, activeReceiptId: receipt.id } : candidate);
  return { store: normalizeHumanVideoOpticalBenchmarkDispatcher({ ...store, jobs, receipts: [...store.receipts, receipt], updatedAt: now }), claim: { job: jobs.find((candidate) => candidate.id === job.id), receipt } };
}

export function acceptHumanVideoOpticalBenchmarkReceipt(storeInput, input = {}) {
  return settle(storeInput, input, "accepted");
}

export function failHumanVideoOpticalBenchmarkReceipt(storeInput, input = {}) {
  return settle(storeInput, input, "terminal-failed");
}

function settle(storeInput, input, status) {
  const store = normalizeHumanVideoOpticalBenchmarkDispatcher(storeInput);
  const receipt = store.receipts.find((candidate) => candidate.id === input.receiptId);
  if (!receipt || receipt.status !== "pending") throw dispatcherError("benchmark_dispatcher_pending_receipt_missing", "Settlement requires one current pending receipt.", 409);
  if (receipt.workerId !== input.workerId || receipt.leaseHash !== input.leaseHash) throw dispatcherError("benchmark_dispatcher_lease_mismatch", "Worker and lease must match the pending receipt.", 409);
  const now = clean(input.now, 80) || new Date().toISOString();
  const settled = { ...receipt, status, settledAt: now, failureReason: status === "terminal-failed" ? clean(input.failureReason, 1_200) || "worker-failed" : "", resultDigest: status === "accepted" ? clean(input.resultDigest, 100) : "" };
  if (status === "accepted" && !settled.resultDigest) throw dispatcherError("benchmark_dispatcher_result_digest_required", "Accepted receipts require a normalized result digest.");
  const receipts = store.receipts.map((candidate) => candidate.id === receipt.id ? settled : candidate);
  const jobs = store.jobs.map((job) => job.id === receipt.jobId ? { ...job, status: status === "accepted" ? "accepted" : "retryable", activeReceiptId: "", acceptedReceiptId: status === "accepted" ? receipt.id : "" } : job);
  return { store: normalizeHumanVideoOpticalBenchmarkDispatcher({ ...store, jobs, receipts, updatedAt: now }), receipt: settled };
}

function list(value) { return Array.isArray(value) ? value : []; }
function integer(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback; }
function positive(value, fallback) { const parsed = integer(value, fallback); return parsed > 0 ? parsed : fallback; }
function clean(value, max) { return String(value || "").replace(/\0/g, "").trim().slice(0, max); }
function dispatcherError(code, message, statusCode = 400) { const error = new Error(message); error.code = code; error.statusCode = statusCode; return error; }
