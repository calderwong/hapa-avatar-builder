import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { withLocalJsonFileLock } from "./local-json-file-lock.mjs";
import { createHumanVideoOpticalReviewFromClaim, createHumanVideoOpticalWorkerOutputContract, HUMAN_VIDEO_OPTICAL_DIRECT_RECEIPT_SCHEMA } from "../src/domain/human-video-optical-worker.js";
import { acceptHumanVideoOpticalBenchmarkReceipt, claimHumanVideoOpticalBenchmarkJob, createHumanVideoOpticalBenchmarkDispatcher, failHumanVideoOpticalBenchmarkReceipt, normalizeHumanVideoOpticalBenchmarkDispatcher } from "../src/domain/human-video-optical-benchmark-dispatcher.js";

export function createHumanVideoOpticalBenchmarkDispatcherService(options = {}) {
  const storePath = path.resolve(options.storePath);
  const receiptRoot = path.resolve(options.receiptRoot);
  const leaseMs = Math.max(30_000, Number(options.leaseMs || 90_000));
  const locked = (operation) => withLocalJsonFileLock(`${storePath}.lock`, operation, { errorCode: "benchmark_dispatcher_locked" });
  return {
    async initialize(jobs, now = new Date().toISOString()) {
      return locked(async () => {
        await mkdir(receiptRoot, { recursive: true });
        const store = createHumanVideoOpticalBenchmarkDispatcher({ jobs, createdAt: now });
        await atomicJson(storePath, store);
        return store;
      });
    },
    async read() { return normalizeHumanVideoOpticalBenchmarkDispatcher(JSON.parse(await readFile(storePath, "utf8"))); },
    async claim(workerId, now = new Date().toISOString()) {
      return locked(async () => {
        const store = await this.read();
        const leaseId = randomUUID();
        const receiptId = `optical-receipt:${randomUUID()}`;
        const receiptPath = path.join(receiptRoot, `${receiptId.replace(/:/g, "-")}.json`);
        const rawResultPath = path.join(receiptRoot, `${receiptId.replace(/:/g, "-")}.raw.json`);
        const expiresAt = new Date(Date.parse(now) + leaseMs).toISOString();
        const transitioned = claimHumanVideoOpticalBenchmarkJob(store, { workerId, receiptId, leaseHash: digest(leaseId), receiptPath, rawResultPath, now, expiresAt });
        if (!transitioned.claim) return { claim: null, store: transitioned.store };
        const sourcePacket = JSON.parse(await readFile(transitioned.claim.job.packetPath, "utf8"));
        const requiredReceiptEnvelope = {
          schemaVersion: HUMAN_VIDEO_OPTICAL_DIRECT_RECEIPT_SCHEMA,
          receiptId,
          jobId: sourcePacket.job.id,
          videoKey: sourcePacket.job.videoKey,
          videoId: sourcePacket.job.videoId,
          videoName: sourcePacket.job.videoName,
          frameDigest: sourcePacket.job.frameDigest,
        };
        const packet = {
          ...sourcePacket,
          outputContract: {
            ...createHumanVideoOpticalWorkerOutputContract(sourcePacket.job),
            requiredReceiptEnvelope,
            forbiddenTopLevel: ["quality", "signals", "strengths", "issues", "uncertainty", "directorNotes", "references", "cards"],
          },
        };
        const durableReceipt = { schemaVersion: "hapa.human-video-optical-benchmark-receipt.v1", id: receiptId, status: "pending", workerId, leaseHash: digest(leaseId), job: transitioned.claim.job, packet, rawResultPath, claimedAt: now, expiresAt, settledAt: null, failure: null, normalizedReview: null };
        await atomicJson(receiptPath, durableReceipt);
        await atomicJson(storePath, transitioned.store);
        return { claim: { receiptId, receiptPath, rawResultPath, leaseId, expiresAt, packet }, store: transitioned.store };
      });
    },
    async submit(input = {}, now = new Date().toISOString()) {
      return locked(async () => {
        const store = await this.read();
        const pending = store.receipts.find((receipt) => receipt.id === input.receiptId && receipt.status === "pending");
        if (!pending) throw serviceError("benchmark_dispatcher_pending_receipt_missing", "No pending receipt matches this submission.");
        const leaseHash = digest(input.leaseId);
        let raw;
        let normalized;
        try {
          const durable = JSON.parse(await readFile(pending.receiptPath, "utf8"));
          if (durable.status !== "pending" || durable.leaseHash !== leaseHash || durable.workerId !== input.workerId) throw serviceError("benchmark_dispatcher_lease_mismatch", "Durable pending receipt does not match worker and lease.");
          raw = JSON.parse(await readFile(pending.rawResultPath, "utf8"));
          assertExactReceiptEnvelope(raw, durable.packet.outputContract?.requiredReceiptEnvelope);
          normalized = createHumanVideoOpticalReviewFromClaim(durable.packet.job, raw, { campaignId: "human-enricher-mechanical-benchmark", receiptId: pending.id, workerId: input.workerId, model: "gpt-5.6-terra", reasoningEffort: "low" });
        } catch (error) {
          const failed = failHumanVideoOpticalBenchmarkReceipt(store, { receiptId: pending.id, workerId: input.workerId, leaseHash, now, failureReason: `${error.code || "validation-failed"}:${error.message}` });
          const durable = JSON.parse(await readFile(pending.receiptPath, "utf8").catch(() => "{}"));
          await atomicJson(pending.receiptPath, { ...durable, status: "terminal-failed", settledAt: now, failure: { code: error.code || "validation-failed", message: error.message } });
          await atomicJson(storePath, failed.store);
          return { accepted: false, error: { code: error.code || "validation-failed", message: error.message }, receipt: failed.receipt, store: failed.store };
        }
        const resultDigest = `sha256:${digest(JSON.stringify(normalized))}`;
        const accepted = acceptHumanVideoOpticalBenchmarkReceipt(store, { receiptId: pending.id, workerId: input.workerId, leaseHash, now, resultDigest });
        const durable = JSON.parse(await readFile(pending.receiptPath, "utf8"));
        await atomicJson(pending.receiptPath, { ...durable, status: "accepted", settledAt: now, resultDigest, normalizedReview: normalized });
        await atomicJson(storePath, accepted.store);
        return { accepted: true, receipt: accepted.receipt, review: normalized, store: accepted.store };
      });
    },
    async fail(input = {}, now = new Date().toISOString()) {
      return locked(async () => {
        const store = await this.read();
        const pending = store.receipts.find((receipt) => receipt.id === input.receiptId && receipt.status === "pending");
        if (!pending) throw serviceError("benchmark_dispatcher_pending_receipt_missing", "No pending receipt matches this failure.");
        const leaseHash = digest(input.leaseId);
        const failed = failHumanVideoOpticalBenchmarkReceipt(store, { receiptId: pending.id, workerId: input.workerId, leaseHash, now, failureReason: input.failureReason });
        const durable = JSON.parse(await readFile(pending.receiptPath, "utf8"));
        await atomicJson(pending.receiptPath, { ...durable, status: "terminal-failed", settledAt: now, failure: { code: "worker-failed", message: input.failureReason || "worker-failed" } });
        await atomicJson(storePath, failed.store);
        return { receipt: failed.receipt, store: failed.store };
      });
    },
  };
}

async function atomicJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}
function digest(value) { return createHash("sha256").update(String(value || "")).digest("hex"); }
function assertExactReceiptEnvelope(raw, expected) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw serviceError("benchmark_dispatcher_raw_result_invalid", "The raw result must be one JSON object.");
  for (const [field, value] of Object.entries(expected || {})) {
    if (String(raw[field] || "") !== String(value || "")) throw serviceError("benchmark_dispatcher_receipt_binding_mismatch", `Raw result ${field} must exactly match the dispatcher-owned pending receipt.`);
  }
}
function serviceError(code, message) { const error = new Error(message); error.code = code; return error; }
