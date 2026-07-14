import crypto from "node:crypto";
import fsp from "node:fs/promises";
import path from "node:path";
import {
  approveSongCardRemintCandidate,
  bindSongCardRemintMintPlan,
  cancelSongCardRemintCandidate,
  claimSongCardRemintWork,
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

function normalizedSha256(value) {
  return String(value || "").trim().replace(/^sha256:/u, "").toLowerCase();
}

function releaseReceiptBlocked(message, details = {}) {
  const error = new Error(message);
  error.code = "REMINT_RELEASE_RECEIPT_BLOCKED";
  error.statusCode = 409;
  error.details = details;
  throw error;
}

function verifyReleaseReceipt(candidate, receipt, { masterSha256, verifiedAt }) {
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
  try { return JSON.parse(await fsp.readFile(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT") return structuredClone(fallback); throw error; }
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
      this.queue = await readJson(this.path, createSongCardRemintQueue({ createdAt: this.now() }));
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
      await atomicJson(this.path, this.queue);
    })().finally(() => { this.initializing = null; });
    await this.initializing;
    return this;
  }

  async mutate(fn) {
    const run = this.pending.then(async () => {
      await this.initialize();
      const result = await fn(this.queue);
      this.queue = result.queue || result;
      await atomicJson(this.path, this.queue);
      return { queue: this.queue, result: result.result };
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
  async enqueue() { return songCardRemintQueueView((await this.mutate((queue) => enqueueApprovedSongCardRemints(queue, { enqueuedAt: this.now() }))).queue); }
  async claim(body = {}) {
    const { queue, result } = await this.mutate((current) => {
      const claimed = claimSongCardRemintWork(current, {
        activePlayback: body.activePlayback === true,
        candidateId: String(body.candidateId || ""),
        claimedAt: this.now(),
      });
      return { queue: claimed.queue, result: claimed.claimed };
    });
    return { queue: songCardRemintQueueView(queue), claimed: result };
  }
  async recordResult(candidateId, jobId, body) { return songCardRemintQueueView((await this.mutate((queue) => recordSongCardRemintJobResult(queue, candidateId, jobId, body, { recordedAt: this.now() }))).queue); }
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
      const releaseJobReceipt = current.batches?.[candidateId]?.jobs?.find((job) => job.stage === "release-export")?.receipt || null;
      const verifiedRelease = verifyReleaseReceipt(candidate, candidate.releaseReceipt || releaseJobReceipt, {
        masterSha256: managed.master.sha256,
        verifiedAt: this.now(),
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
