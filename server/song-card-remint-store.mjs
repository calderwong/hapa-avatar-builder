import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  approveSongCardRemintCandidate,
  bindSongCardRemintMintPlan,
  cancelSongCardRemintCandidate,
  claimSongCardRemintWork,
  compactSongCardRemintResumeHistory,
  createSongCardRemintQueue,
  enqueueApprovedSongCardRemints,
  planSongCardRemintCandidate,
  recordSongCardRemintMint,
  recordSongCardRemintJobResult,
  retrySongCardRemintRender,
  resumeSongCardRemintQueue,
  SONG_CARD_REMINT_RELEASE_RECEIPT_SCHEMA,
  songCardRemintQueueView,
  upsertSongCardRemintCandidate,
} from "../src/domain/song-card-remint-queue.js";

const RELEASE_RENDERER_TRUTH_SCHEMA = "hapa.show.release-renderer-truth.v1";
const RELEASE_RECEIPT_VERIFICATION_SCHEMA = "hapa.song-card.remint-release-export-verification.v1";
const LOCAL_RENDER_EXECUTOR_ID = "hapa-avatar-builder:local-hyperframes";
const RESULT_PERSISTENCE_GUARD_SCHEMA = "hapa.song-card.local-result-persistence-guard.v1";
const RESULT_PERSISTENCE_RECEIPT_SCHEMA = "hapa.song-card.local-result-persistence-receipt.v1";
const SHA256_IDENTITY = /^sha256:[a-f0-9]{64}$/u;
const RESULT_GUARD_GENERATION = /^result-guard:[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

function normalizedSha256(value) {
  return String(value || "").trim().replace(/^sha256:/u, "").toLowerCase();
}

function resultPersistenceConflict(reason, message, details = {}) {
  const error = new Error(message);
  error.code = "local_render_result_persistence_conflict";
  error.statusCode = 409;
  error.details = {
    stage: "result-persistence",
    reason,
    ...details,
  };
  throw error;
}

function normalizeResultGuardRequest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const planId = String(value.planId || "").trim();
  const candidateFingerprint = String(value.candidateFingerprint || "").trim();
  const startCertificateSha256 = String(value.startCertificateSha256 || "").trim().toLowerCase();
  const renderIdentitySha256 = String(value.renderIdentitySha256 || "").trim().toLowerCase();
  if (!planId || !candidateFingerprint || !SHA256_IDENTITY.test(startCertificateSha256) || !SHA256_IDENTITY.test(renderIdentitySha256)) {
    resultPersistenceConflict(
      "result-guard-request-incomplete",
      "A successful local render result requires one exact plan, candidate, start certificate, and render identity.",
      { planId: planId || null, candidateFingerprint: candidateFingerprint || null },
    );
  }
  return { planId, candidateFingerprint, startCertificateSha256, renderIdentitySha256 };
}

function sameResultGuard(left, right) {
  return Boolean(left && right)
    && left.schemaVersion === RESULT_PERSISTENCE_GUARD_SCHEMA
    && right.schemaVersion === RESULT_PERSISTENCE_GUARD_SCHEMA
    && String(left.generation || "") === String(right.generation || "")
    && String(left.candidateId || "") === String(right.candidateId || "")
    && String(left.jobId || "") === String(right.jobId || "")
    && String(left.planId || "") === String(right.planId || "")
    && String(left.candidateFingerprint || "") === String(right.candidateFingerprint || "")
    && String(left.startCertificateSha256 || "") === String(right.startCertificateSha256 || "")
    && String(left.renderIdentitySha256 || "") === String(right.renderIdentitySha256 || "")
    && Number(left.jobAttempt || 0) === Number(right.jobAttempt || 0);
}

function validateGuardedResultState(queue, candidateId, jobId, suppliedGuard) {
  const candidate = queue.candidates.find((row) => row.id === candidateId);
  const job = queue.batches?.[candidateId]?.jobs?.find((row) => row.id === jobId);
  const durableGuard = job?.resultPersistenceGuard || null;
  if (!candidate || !job) {
    resultPersistenceConflict(
      "result-guard-target-missing",
      "The guarded local render result no longer belongs to a current candidate job.",
      { candidateId, jobId },
    );
  }
  if (!sameResultGuard(durableGuard, suppliedGuard)) {
    resultPersistenceConflict(
      "result-guard-generation-changed",
      "The local render result belongs to an obsolete claim generation and was not saved.",
      {
        candidateId,
        jobId,
        expectedGeneration: durableGuard?.generation || null,
        observedGeneration: suppliedGuard?.generation || null,
      },
    );
  }
  if (
    candidate.planId !== durableGuard.planId
    || candidate.fingerprint !== durableGuard.candidateFingerprint
    || candidate.renderWorkAuthorized !== true
    || !candidate.approval?.approvedBy
    || !["queued", "rendering"].includes(candidate.status)
    || job.status !== "running"
    || Number(job.attempts || 0) !== Number(durableGuard.jobAttempt || 0)
  ) {
    resultPersistenceConflict(
      "result-guard-state-changed",
      "The approved render candidate or claimed job changed before its successful result could be saved.",
      {
        candidateId,
        jobId,
        expectedPlanId: durableGuard.planId,
        observedPlanId: candidate.planId || null,
        candidateStatus: candidate.status,
        jobStatus: job.status,
        expectedJobAttempt: durableGuard.jobAttempt,
        observedJobAttempt: Number(job.attempts || 0),
      },
    );
  }
  return { candidate, job, durableGuard };
}

function bindGuardReceipt(body, guard, recordedAt) {
  const suppliedReceipt = body?.receipt && typeof body.receipt === "object" && !Array.isArray(body.receipt)
    ? body.receipt
    : {};
  const suppliedCertificate = String(suppliedReceipt.startCertificateSha256 || "").trim().toLowerCase();
  const suppliedIdentity = String(suppliedReceipt.checkpointIdentity || suppliedReceipt.renderIdentitySha256 || "").trim().toLowerCase();
  if (suppliedCertificate && suppliedCertificate !== guard.startCertificateSha256) {
    resultPersistenceConflict(
      "result-receipt-certificate-mismatch",
      "The successful result receipt names a different render-start certificate.",
      { expectedStartCertificateSha256: guard.startCertificateSha256, observedStartCertificateSha256: suppliedCertificate },
    );
  }
  if (suppliedIdentity && suppliedIdentity !== guard.renderIdentitySha256) {
    resultPersistenceConflict(
      "result-receipt-render-identity-mismatch",
      "The successful result receipt names a different immutable render identity.",
      { expectedRenderIdentitySha256: guard.renderIdentitySha256, observedRenderIdentitySha256: suppliedIdentity },
    );
  }
  return {
    ...structuredClone(body),
    receipt: {
      ...structuredClone(suppliedReceipt),
      startCertificateSha256: guard.startCertificateSha256,
      resultPersistence: {
        schemaVersion: RESULT_PERSISTENCE_RECEIPT_SCHEMA,
        generation: guard.generation,
        candidateId: guard.candidateId,
        jobId: guard.jobId,
        planId: guard.planId,
        candidateFingerprint: guard.candidateFingerprint,
        startCertificateSha256: guard.startCertificateSha256,
        renderIdentitySha256: guard.renderIdentitySha256,
        jobAttempt: guard.jobAttempt,
        committedAt: recordedAt,
      },
    },
  };
}

function releaseReceiptBlocked(message, details = {}) {
  const error = new Error(message);
  error.code = "REMINT_RELEASE_RECEIPT_BLOCKED";
  error.statusCode = 409;
  error.details = details;
  throw error;
}

function verifyReleaseReceipt(candidate, receipt, { masterSha256, verifiedAt, releaseJobId = "", releaseJobAttempt = 0 }) {
  if (!receipt || typeof receipt !== "object" || Array.isArray(receipt)) {
    releaseReceiptBlocked("The release worker did not provide a release-export receipt.");
  }
  if (receipt.schemaVersion !== SONG_CARD_REMINT_RELEASE_RECEIPT_SCHEMA) {
    releaseReceiptBlocked("The release-export receipt schema is missing or unsupported.", { expectedSchemaVersion: SONG_CARD_REMINT_RELEASE_RECEIPT_SCHEMA });
  }
  const executorId = String(receipt.executorId || "").trim();
  if (!executorId) releaseReceiptBlocked("The release-export receipt does not identify its executor.");
  if (String(receipt.candidateId || "") !== candidate.id) releaseReceiptBlocked("The release-export receipt belongs to a different remint candidate.");
  if (String(receipt.planId || "") !== String(candidate.planId || "")) releaseReceiptBlocked("The release-export receipt belongs to a different source plan revision.");
  const sourceRevision = String(candidate.sourceRevisions?.current?.source || "");
  if (!sourceRevision || String(receipt.sourceRevision || "") !== sourceRevision) releaseReceiptBlocked("The release-export receipt belongs to a different editor source revision.");
  if (executorId === LOCAL_RENDER_EXECUTOR_ID) {
    const binding = receipt.resultPersistence;
    if (
      binding?.schemaVersion !== RESULT_PERSISTENCE_RECEIPT_SCHEMA
      || !RESULT_GUARD_GENERATION.test(String(binding.generation || ""))
      || String(binding.candidateId || "") !== candidate.id
      || String(binding.jobId || "") !== String(releaseJobId || "")
      || String(binding.planId || "") !== String(candidate.planId || "")
      || String(binding.candidateFingerprint || "") !== String(candidate.fingerprint || "")
      || !SHA256_IDENTITY.test(String(binding.startCertificateSha256 || ""))
      || String(binding.startCertificateSha256 || "") !== String(receipt.startCertificateSha256 || "")
      || !SHA256_IDENTITY.test(String(binding.renderIdentitySha256 || ""))
      || String(binding.renderIdentitySha256 || "") !== String(receipt.checkpointIdentity || "")
      || Number(binding.jobAttempt || 0) !== Number(releaseJobAttempt || 0)
      || Number(binding.jobAttempt || 0) < 1
    ) {
      releaseReceiptBlocked("The local release-export receipt is detached from its exact start certificate and guarded claim generation.", {
        candidateId: candidate.id,
        planId: candidate.planId,
        releaseJobId: releaseJobId || null,
      });
    }
  }
  const receiptMasterSha256 = normalizedSha256(receipt.masterSha256);
  const verifiedMasterSha256 = normalizedSha256(masterSha256);
  if (!/^[a-f0-9]{64}$/u.test(receiptMasterSha256) || receiptMasterSha256 !== verifiedMasterSha256) {
    releaseReceiptBlocked("The release-export receipt master hash does not match the verified rendered master.", { receiptMasterSha256, verifiedMasterSha256 });
  }
  const rendererTruth = receipt.rendererTruth;
  if (rendererTruth?.schemaVersion !== RELEASE_RENDERER_TRUTH_SCHEMA
    || rendererTruth?.executionStatus !== "executed"
    || rendererTruth?.ok !== true
    || rendererTruth?.allStatesVisible !== true
    || Number(rendererTruth?.silentDefaultCount || 0) !== 0) {
    releaseReceiptBlocked("The release-export receipt does not contain passing executed renderer truth.");
  }
  const cueReceipts = Array.isArray(rendererTruth.receipts) ? rendererTruth.receipts : [];
  const cueReceiptCount = Number(rendererTruth.cueReceiptCount || 0);
  const unresolvedRendererIds = Array.isArray(rendererTruth.unresolvedRendererIds) ? rendererTruth.unresolvedRendererIds.filter(Boolean) : [];
  if (unresolvedRendererIds.length
    || (cueReceiptCount > 0 && cueReceipts.length !== cueReceiptCount)
    || cueReceipts.some((row) => row?.executionStatus !== "executed"
      || row?.ok !== true
      || ["unsupported", "compile-error"].includes(String(row?.status || "").toLowerCase())
      || (String(row?.status || "").toLowerCase() === "fallback" && !String(row?.substitute?.id || "").trim()))) {
    releaseReceiptBlocked("The release-export receipt contains unresolved or unexecuted visualizer cues.", { unresolvedRendererIds, cueReceiptCount, receivedCueReceipts: cueReceipts.length });
  }
  const qa = receipt.qa;
  if (qa?.executionStatus !== "executed" || qa?.status !== "passed" || qa?.ok !== true) {
    releaseReceiptBlocked("The release-export receipt does not contain passing executed release QA.");
  }
  const preserved = structuredClone(receipt);
  const receiptSha256 = crypto.createHash("sha256").update(JSON.stringify(preserved)).digest("hex");
  return {
    receipt: preserved,
    rendererTruth: structuredClone(rendererTruth),
    verification: {
      schemaVersion: RELEASE_RECEIPT_VERIFICATION_SCHEMA,
      ok: true,
      receiptSha256,
      executorId,
      candidateId: candidate.id,
      planId: candidate.planId,
      sourceRevision,
      masterSha256: verifiedMasterSha256,
      rendererTruthExecutionStatus: rendererTruth.executionStatus,
      qaStatus: qa.status,
      verifiedAt,
    },
  };
}

async function readJson(filePath, fallback) {
  try { return { value: JSON.parse(await fsp.readFile(filePath, "utf8")), exists: true }; }
  catch (error) {
    if (error?.code === "ENOENT") return { value: structuredClone(fallback), exists: false };
    throw error;
  }
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fsp.rename(temporary, filePath);
}

export class SongCardRemintStore {
  constructor({ root, controller, clock = () => new Date() } = {}) {
    if (!root || !controller) throw new Error("SongCardRemintStore requires root and controller");
    this.controller = controller;
    this.clock = clock;
    this.path = path.join(path.resolve(root), "remint-queue.json");
    this.queue = null;
    this.initializing = null;
    this.pending = Promise.resolve();
  }

  now() { return this.clock().toISOString(); }

  async initialize() {
    if (this.queue) return this;
    if (!this.initializing) this.initializing = (async () => {
      const loaded = await readJson(this.path, createSongCardRemintQueue({ createdAt: this.now() }));
      this.queue = loaded.value;
      const loadedFingerprint = JSON.stringify(this.queue);
      this.queue = compactSongCardRemintResumeHistory(this.queue);
      const interruptedReservations = this.queue.candidates.filter((candidate) => candidate.status === "minting" && candidate.mintReservation);
      if (interruptedReservations.length) {
        const recoveredAt = this.now();
        this.queue = {
          ...this.queue,
          candidates: this.queue.candidates.map((candidate) => candidate.status === "minting" && candidate.mintReservation ? {
            ...candidate,
            status: candidate.mintReservation.previousStatus || "awaiting-approval",
            mintReservation: null,
            mintAuthorized: false,
            nextAction: candidate.mintReservation.previousNextAction || candidate.nextAction,
          } : candidate),
          events: [...(this.queue.events || []), ...interruptedReservations.map((candidate) => ({ type: "remint-explicit-mint-reservation-recovered", at: recoveredAt, candidateId: candidate.id, planId: candidate.mintReservation.planId, autoMint: false }))],
        };
      }
      this.queue = resumeSongCardRemintQueue(this.queue, { resumedAt: this.now() });
      if (!loaded.exists || JSON.stringify(this.queue) !== loadedFingerprint) {
        await atomicJson(this.path, this.queue);
      }
    })().finally(() => { this.initializing = null; });
    await this.initializing;
    return this;
  }

  async mutate(fn) {
    const run = this.pending.then(async () => {
      await this.initialize();
      const result = await fn(this.queue);
      const nextQueue = result.queue || result;
      await atomicJson(this.path, nextQueue);
      this.queue = nextQueue;
      return { queue: nextQueue, result: result.result };
    });
    this.pending = run.catch(() => {});
    return run;
  }

  async proposeFromPlan(songId, storedPlan) {
    const head = await this.controller.ledger.getHead(storedPlan.headId);
    const latest = head?.latestEdition ? await this.controller.ledger.readEdition(storedPlan.headId, head.latestEdition).catch(() => null) : null;
    const beforeHashes = storedPlan.semanticDiff?.beforeFamilyHashes || {};
    const afterHashes = storedPlan.semanticDiff?.afterFamilyHashes || {};
    const candidate = {
      ...planSongCardRemintCandidate({
      songId,
      title: storedPlan.input?.song?.title || songId,
      latestEdition: Number(head?.latestEdition || 0),
      headGeneration: Number(head?.generation || head?.version || 0),
      mintedSnapshot: latest?.snapshot || null,
      currentSnapshot: storedPlan.snapshot,
      mintedRevisions: {
        source: head?.editions?.at(-1)?.sourceRevision || "",
        editor: latest?.snapshot?.editor?.revision || head?.editions?.at(-1)?.sourceRevision || "",
        renderer: beforeHashes.renderer || "",
        capability: beforeHashes.ivf || "",
      },
      currentRevisions: {
        source: storedPlan.sourceRevision,
        editor: storedPlan.snapshot?.editor?.revision || storedPlan.sourceRevision,
        renderer: afterHashes.renderer || "",
        capability: afterHashes.ivf || "",
      },
      variantId: storedPlan.snapshot?.showGraph?.directorV2?.variantId || "next-mint",
      }),
      planId: storedPlan.planId,
    };
    if (!candidate.changed) return null;
    const { queue } = await this.mutate((current) => upsertSongCardRemintCandidate(current, candidate, { eventAt: this.now() }));
    return [...queue.candidates].reverse().find((row) => row.fingerprint === candidate.fingerprint) || candidate;
  }

  async view() { await this.initialize(); await this.pending; return songCardRemintQueueView(this.queue); }
  async approve(candidateId, body = {}) { return songCardRemintQueueView((await this.mutate((queue) => approveSongCardRemintCandidate(queue, candidateId, { ...body, approvedAt: body.approvedAt || this.now() }))).queue); }
  async cancel(candidateId, body = {}) { return songCardRemintQueueView((await this.mutate((queue) => cancelSongCardRemintCandidate(queue, candidateId, { ...body, canceledAt: body.canceledAt || this.now() }))).queue); }
  async supersede(candidateId, body = {}) {
    const supersededAt = body.supersededAt || this.now();
    const replacementCandidateId = String(body.replacementCandidateId || "");
    const replacementPlanId = String(body.replacementPlanId || "");
    const { queue } = await this.mutate((current) => {
      const candidate = current.candidates.find((row) => row.id === candidateId);
      if (!candidate) throw new Error(`Unknown remint candidate: ${candidateId}`);
      if (candidate.status === "minted") throw new Error(`Minted remint candidate ${candidateId} cannot be superseded`);
      return {
        ...current,
        candidates: current.candidates.map((row) => row.id === candidateId ? {
          ...row,
          status: "superseded",
          supersededAt,
          supersededBy: replacementCandidateId || null,
          supersededByPlanId: replacementPlanId || null,
          renderWorkAuthorized: false,
          mintAuthorized: false,
          approval: null,
          nextAction: replacementCandidateId ? "review-canonical-replacement" : "none",
        } : row),
        events: [...(current.events || []), {
          type: "remint-candidate-canonical-replacement",
          at: supersededAt,
          candidateId,
          replacementCandidateId: replacementCandidateId || null,
          replacementPlanId: replacementPlanId || null,
          reason: String(body.reason || "canonical-mint-plan-rehydrated"),
          autoMint: false,
        }],
      };
    });
    return songCardRemintQueueView(queue);
  }
  async enqueue() { return songCardRemintQueueView((await this.mutate((queue) => enqueueApprovedSongCardRemints(queue, { enqueuedAt: this.now() }))).queue); }
  async claim(body = {}) {
    const { queue, result } = await this.mutate(async (current) => {
      const claimed = claimSongCardRemintWork(current, {
        activePlayback: body.activePlayback === true,
        candidateId: String(body.candidateId || ""),
        claimedAt: this.now(),
      });
      const claimedCandidateIds = [...new Set(claimed.claimed.map((row) => row.candidateId))];
      for (const claimedCandidateId of claimedCandidateIds) {
        const candidate = current.candidates.find((row) => row.id === claimedCandidateId);
        if (!candidate?.planId) {
          const error = new Error(`Remint candidate ${claimedCandidateId} has no saved source plan.`);
          error.code = "REMINT_SOURCE_PLAN_NOT_FOUND";
          error.statusCode = 409;
          throw error;
        }
        // The pure queue claim has not been persisted yet. A compatibility
        // failure rejects this mutation, so no worker can begin stale work.
        if (typeof this.controller.assertPlanRunnable === "function") {
          await this.controller.assertPlanRunnable(candidate.planId);
        }
      }
      const requestedGuard = normalizeResultGuardRequest(body.resultPersistenceGuard);
      if (claimed.claimed.length === 0) {
        return { queue: claimed.queue, result: claimed.claimed };
      }
      if (!requestedGuard) {
        const claimedJobIds = new Map();
        for (const work of claimed.claimed) {
          if (!claimedJobIds.has(work.candidateId)) claimedJobIds.set(work.candidateId, new Set());
          claimedJobIds.get(work.candidateId).add(work.jobId);
        }
        const unguardedQueue = {
          ...claimed.queue,
          batches: Object.fromEntries(Object.entries(claimed.queue.batches || {}).map(([candidateId, batch]) => {
            const jobIds = claimedJobIds.get(candidateId);
            if (!jobIds) return [candidateId, batch];
            return [candidateId, {
              ...batch,
              jobs: batch.jobs.map((job) => jobIds.has(job.id) ? { ...job, resultPersistenceGuard: null } : job),
            }];
          })),
        };
        return { queue: unguardedQueue, result: claimed.claimed };
      }
      const guardedWork = [];
      let guardedQueue = claimed.queue;
      for (const work of claimed.claimed) {
        const candidate = guardedQueue.candidates.find((row) => row.id === work.candidateId);
        const job = guardedQueue.batches?.[work.candidateId]?.jobs?.find((row) => row.id === work.jobId);
        if (!candidate || !job) {
          resultPersistenceConflict(
            "result-guard-claim-target-missing",
            "The claimed local render job disappeared before its result guard could be attached.",
            { candidateId: work.candidateId, jobId: work.jobId },
          );
        }
        if (candidate.planId !== requestedGuard.planId || candidate.fingerprint !== requestedGuard.candidateFingerprint) {
          resultPersistenceConflict(
            "result-guard-claim-candidate-mismatch",
            "The claimed local render job belongs to a different saved plan or candidate revision.",
            {
              candidateId: work.candidateId,
              jobId: work.jobId,
              expectedPlanId: requestedGuard.planId,
              observedPlanId: candidate.planId || null,
            },
          );
        }
        const resultPersistenceGuard = {
          schemaVersion: RESULT_PERSISTENCE_GUARD_SCHEMA,
          generation: `result-guard:${crypto.randomUUID()}`,
          candidateId: work.candidateId,
          jobId: work.jobId,
          planId: requestedGuard.planId,
          candidateFingerprint: requestedGuard.candidateFingerprint,
          startCertificateSha256: requestedGuard.startCertificateSha256,
          renderIdentitySha256: requestedGuard.renderIdentitySha256,
          jobAttempt: Number(job.attempts || 0),
          boundAt: this.now(),
        };
        guardedQueue = {
          ...guardedQueue,
          batches: {
            ...guardedQueue.batches,
            [work.candidateId]: {
              ...guardedQueue.batches[work.candidateId],
              jobs: guardedQueue.batches[work.candidateId].jobs.map((row) => row.id === work.jobId
                ? { ...row, resultPersistenceGuard }
                : row),
            },
          },
        };
        guardedWork.push({ ...work, resultPersistenceGuard: structuredClone(resultPersistenceGuard) });
      }
      return { queue: guardedQueue, result: guardedWork };
    });
    return { queue: songCardRemintQueueView(queue), claimed: result };
  }
  async recordResult(candidateId, jobId, body) {
    return songCardRemintQueueView((await this.mutate((queue) => {
      const job = queue.batches?.[candidateId]?.jobs?.find((row) => row.id === jobId);
      if (job?.receipt?.resultPersistence?.schemaVersion === RESULT_PERSISTENCE_RECEIPT_SCHEMA) {
        resultPersistenceConflict(
          "guarded-result-already-committed",
          "This certificate-bound job result is already committed and cannot be overwritten or rolled back through the unguarded worker path.",
          {
            candidateId,
            jobId,
            generation: job.receipt.resultPersistence.generation || null,
          },
        );
      }
      if (body?.ok === true && job?.resultPersistenceGuard) {
        resultPersistenceConflict(
          "guarded-result-path-required",
          "This claimed local render job can only save success through its certificate-aware compare-and-set path.",
          { candidateId, jobId, generation: job.resultPersistenceGuard.generation || null },
        );
      }
      return recordSongCardRemintJobResult(queue, candidateId, jobId, body, { recordedAt: this.now() });
    })).queue);
  }
  async recordGuardedResult(candidateId, jobId, body, options = {}) {
    if (body?.ok !== true || !options?.resultPersistenceGuard) {
      resultPersistenceConflict(
        "guarded-result-success-required",
        "The guarded result path only accepts a successful result with its exact claim generation.",
        { candidateId, jobId },
      );
    }
    const recordedAt = this.now();
    return songCardRemintQueueView((await this.mutate(async (queue) => {
      const suppliedGuard = structuredClone(options.resultPersistenceGuard);
      const initialState = validateGuardedResultState(queue, candidateId, jobId, suppliedGuard);
      if (typeof options.assertFresh !== "function") {
        resultPersistenceConflict(
          "result-guard-freshness-check-missing",
          "The exact render-start certificate cannot be revalidated inside the guarded result commit.",
          { candidateId, jobId, generation: suppliedGuard.generation || null },
        );
      }
      await options.assertFresh({
        stage: String(options.stage || `commit-${initialState.job.stage || "render"}-result`),
        candidateId,
        jobId,
        planId: initialState.durableGuard.planId,
        startCertificateSha256: initialState.durableGuard.startCertificateSha256,
        generation: initialState.durableGuard.generation,
      });
      // The store mutation is serialized. Rechecking after the awaited freshness
      // proof makes the following pure queue transition a compare-and-set against
      // the exact claim generation that started this render.
      const currentState = validateGuardedResultState(queue, candidateId, jobId, suppliedGuard);
      const guardedBody = bindGuardReceipt(body, currentState.durableGuard, recordedAt);
      const next = recordSongCardRemintJobResult(queue, candidateId, jobId, guardedBody, { recordedAt });
      const nextCandidate = next.candidates.find((row) => row.id === candidateId);
      const nextJob = next.batches?.[candidateId]?.jobs?.find((row) => row.id === jobId);
      if (nextJob?.status !== "done") {
        resultPersistenceConflict(
          "guarded-result-not-committed",
          "The guarded successful result did not produce one completed durable job.",
          { candidateId, jobId, observedJobStatus: nextJob?.status || null },
        );
      }
      if (currentState.job.stage === "release-export") {
        if (nextCandidate?.status !== "render-ready") {
          resultPersistenceConflict(
            "guarded-release-not-render-ready",
            "The guarded release export did not atomically produce a render-ready candidate.",
            { candidateId, jobId, observedCandidateStatus: nextCandidate?.status || null },
          );
        }
        if (
          nextCandidate?.releaseReceipt?.startCertificateSha256 !== currentState.durableGuard.startCertificateSha256
          || nextCandidate?.releaseReceipt?.resultPersistence?.generation !== currentState.durableGuard.generation
        ) {
          resultPersistenceConflict(
            "guarded-release-receipt-detached",
            "The render-ready release receipt was not bound to the exact start certificate and claim generation.",
            { candidateId, jobId },
          );
        }
      }
      return next;
    })).queue);
  }
  async recordPreclaimFailure(candidateId, body = {}) {
    return songCardRemintQueueView((await this.mutate((queue) => {
      const candidate = queue.candidates.find((row) => row.id === candidateId);
      if (!candidate) throw new Error(`Unknown remint candidate: ${candidateId}`);
      const batch = queue.batches?.[candidateId];
      if (!batch) throw new Error(`Unknown remint batch: ${candidateId}`);
      const job = batch.jobs.find((row) => ["queued", "running", "awaiting-approval"].includes(row.status))
        || batch.jobs.find((row) => !["done", "cached", "cancelled"].includes(row.status));
      if (!job) throw new Error(`Remint candidate ${candidateId} has no render work available for a pre-claim failure`);
      return recordSongCardRemintJobResult(queue, candidateId, job.id, {
        ...body,
        ok: false,
        requiresExplicitRetry: body.requiresExplicitRetry !== false,
      }, { recordedAt: this.now() });
    })).queue);
  }
  async retry(candidateId) { return songCardRemintQueueView((await this.mutate((queue) => retrySongCardRemintRender(queue, candidateId, { retriedAt: this.now() }))).queue); }
  async bindRenderPlan(candidateId, body = {}) {
    const { queue, result } = await this.mutate(async (current) => {
      let candidate = current.candidates.find((row) => row.id === candidateId);
      if (!candidate) throw new Error(`Unknown remint candidate: ${candidateId}`);
      if (candidate.status !== "render-ready") throw new Error(`Remint candidate ${candidateId} is not render-ready`);
      const artifacts = Array.isArray(candidate.renderArtifacts) ? candidate.renderArtifacts : [];
      const master = artifacts.find((artifact) => artifact && typeof artifact === "object" && artifact.role === "master");
      const poster = artifacts.find((artifact) => artifact && typeof artifact === "object" && artifact.role === "poster");
      if (!master?.path || !master?.sha256) throw new Error("Release export must report a hashed master artifact before mint review");
      const managed = await this.controller.prepareManagedRender(candidate.songId, {
        masterPath: master.path,
        posterPath: poster?.path || "",
      });
      if (String(master.sha256).replace(/^sha256:/u, "") !== managed.master.sha256) {
        throw new Error("Worker-produced master hash does not match the managed render copy");
      }
      if (poster?.sha256 && String(poster.sha256).replace(/^sha256:/u, "") !== managed.poster.sha256) {
        throw new Error("Worker-produced poster hash does not match the managed poster copy");
      }
      const releaseJob = current.batches?.[candidateId]?.jobs?.find((job) => job.stage === "release-export") || null;
      const releaseJobReceipt = releaseJob?.receipt || null;
      const verifiedRelease = verifyReleaseReceipt(candidate, candidate.releaseReceipt || releaseJobReceipt, {
        masterSha256: managed.master.sha256,
        verifiedAt: this.now(),
        releaseJobId: releaseJob?.id || "",
        releaseJobAttempt: Number(releaseJob?.attempts || 0),
      });
      const managedArtifacts = [
        ...artifacts.filter((artifact) => !artifact || typeof artifact !== "object" || !["master", "poster"].includes(artifact.role)),
        managed.master,
        managed.poster,
      ];
      const managedCurrent = {
        ...current,
        candidates: current.candidates.map((row) => row.id === candidateId ? {
          ...row,
          renderArtifacts: managedArtifacts,
          releaseReceipt: verifiedRelease.receipt,
          releaseReceiptVerification: verifiedRelease.verification,
        } : row),
        events: [...(current.events || []), {
          type: "remint-render-artifacts-managed",
          at: this.now(),
          candidateId,
          workspaceId: managed.workspaceId,
          posterGenerated: managed.poster.generated === true,
          autoMint: false,
        }, {
          type: "remint-release-export-receipt-verified",
          at: verifiedRelease.verification.verifiedAt,
          candidateId,
          executorId: verifiedRelease.verification.executorId,
          receiptSha256: verifiedRelease.verification.receiptSha256,
          planId: verifiedRelease.verification.planId,
          sourceRevision: verifiedRelease.verification.sourceRevision,
          masterSha256: verifiedRelease.verification.masterSha256,
          autoMint: false,
        }],
      };
      candidate = managedCurrent.candidates.find((row) => row.id === candidateId);
      const plan = await this.controller.plan(candidate.songId, {
        ...body,
        renderMasterPath: managed.master.path,
        posterPath: managed.poster.path,
        rendererTruth: verifiedRelease.rendererTruth,
        receipts: {
          ...(body.receipts && typeof body.receipts === "object" ? body.receipts : {}),
          releaseExport: verifiedRelease.receipt,
          releaseExportVerification: verifiedRelease.verification,
        },
      });
      if (plan.sourceRevision !== candidate.sourceRevisions?.current?.source) throw new Error("Editor source changed after the remint candidate was rendered");
      const next = bindSongCardRemintMintPlan(managedCurrent, candidateId, {
        planId: plan.planId,
        predictedEdition: plan.predictedEdition,
        expectedHeadGeneration: plan.expectedHeadGeneration,
        renderMasterPath: plan.renderMasterPath,
        renderMasterSha256: plan.renderMasterSha256,
        posterPath: plan.posterPath,
        posterSha256: plan.posterSha256,
        boundAt: this.now(),
      });
      return { queue: next, result: { plan } };
    });
    const view = songCardRemintQueueView(queue);
    return { plan: result.plan, remintCandidate: view.candidates.find((row) => row.id === candidateId) || null };
  }
  async mintExplicit({ songId, planId, edition, mintId = "" } = {}, mintOperation) {
    if (typeof mintOperation !== "function") throw new Error("mintExplicit requires a mint operation");
    const run = this.pending.then(async () => {
      await this.initialize();
      const matching = this.queue.candidates.find((candidate) => [candidate.mintPlanId, candidate.planId].filter(Boolean).includes(planId));
      if (matching && ["superseded", "canceled", "rejected"].includes(matching.status)) {
        const error = new Error(`Remint plan ${planId} is ${matching.status} and cannot mint`);
        error.code = "REMINT_PLAN_SUPERSEDED";
        error.statusCode = 409;
        throw error;
      }
      const reservationId = matching ? `remint-mint-reservation:${crypto.randomUUID()}` : null;
      if (matching) {
        const reservedAt = this.now();
        this.queue = {
          ...this.queue,
          candidates: this.queue.candidates.map((candidate) => candidate.id === matching.id ? {
            ...candidate,
            status: "minting",
            mintReservation: { id: reservationId, planId, previousStatus: candidate.status, previousNextAction: candidate.nextAction, reservedAt },
            mintAuthorized: false,
            nextAction: "explicit-song-card-mint-in-progress",
          } : candidate),
          events: [...(this.queue.events || []), { type: "remint-explicit-mint-reserved", at: reservedAt, candidateId: matching.id, planId, autoMint: false }],
        };
        await atomicJson(this.path, this.queue);
      }
      try {
        const result = await mintOperation();
        this.queue = recordSongCardRemintMint(this.queue, { songId, planId, edition: result.edition || edition, mintId: result.editionRecord?.mintId || result.editionRecord?.id || mintId, mintedAt: this.now() });
        await atomicJson(this.path, this.queue);
        return result;
      } catch (error) {
        if (matching) {
          const failedAt = this.now();
          this.queue = {
            ...this.queue,
            candidates: this.queue.candidates.map((candidate) => candidate.mintReservation?.id === reservationId ? {
              ...candidate,
              status: candidate.mintReservation.previousStatus || "awaiting-approval",
              nextAction: candidate.mintReservation.previousNextAction || "operator-review-and-confirm-song-card-mint",
              mintReservation: null,
              mintAuthorized: false,
            } : candidate),
            events: [...(this.queue.events || []), { type: "remint-explicit-mint-reservation-released", at: failedAt, candidateId: matching.id, planId, error: error?.code || error?.message || "mint-failed", autoMint: false }],
          };
          await atomicJson(this.path, this.queue);
        }
        throw error;
      }
    });
    this.pending = run.catch(() => {});
    return run;
  }
  async recordMint(body) { return songCardRemintQueueView((await this.mutate((queue) => recordSongCardRemintMint(queue, { ...body, mintedAt: body?.mintedAt || this.now() }))).queue); }
}

export function createSongCardRemintStore(options) { return new SongCardRemintStore(options); }
