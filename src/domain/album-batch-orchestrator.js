import { contextHash } from "./song-context-packet.js";

export const ALBUM_BATCH_SCHEMA = "hapa.director.album-batch.v1";
const stages = [
  { id: "decision-envelope", expensiveDecision: true, resources: { cpu: 2, gpu: 0, disk: 1, decoders: 0, cacheGB: .2 } },
  { id: "variant-compile", resources: { cpu: 1, gpu: 0, disk: 1, decoders: 0, cacheGB: .1 } },
  { id: "proxy", resources: { cpu: 2, gpu: 0, disk: 2, decoders: 1, cacheGB: .5 } },
  { id: "native-buffer", resources: { cpu: 2, gpu: 1, disk: 1, decoders: 1, cacheGB: .4 } },
  { id: "hyperframes", resources: { cpu: 3, gpu: 0, disk: 2, decoders: 2, cacheGB: 1 } },
  { id: "qa", resources: { cpu: 1, gpu: 0, disk: 1, decoders: 1, cacheGB: .2 } },
  { id: "release-export", requiresHumanApproval: true, resources: { cpu: 3, gpu: 1, disk: 3, decoders: 2, cacheGB: 2 } },
];

export function createAlbumBatch({ songs = [], variants = ["conservative", "kinetic", "visualizer-forward"], budgets = {} } = {}) {
  const jobs = [];
  for (const song of songs) {
    const envelopeId = `job:${song.id}:decision-envelope`;
    jobs.push(makeJob({ id: envelopeId, songId: song.id, stage: stages[0], dependencies: [], inputHash: song.sourceHash }));
    for (const variant of variants) {
      let dependency = envelopeId;
      for (const stage of stages.slice(1)) {
        const id = `job:${song.id}:${variant}:${stage.id}`;
        jobs.push(makeJob({ id, songId: song.id, variant, stage, dependencies: [dependency], inputHash: contextHash({ song: song.sourceHash, variant, stage: stage.id }) }));
        dependency = id;
      }
    }
  }
  return { schemaVersion: ALBUM_BATCH_SCHEMA, status: "planned", budgets: { cpu: 6, gpu: 1, disk: 5, decoders: 3, cacheGB: 8, activeSessionScale: .34, ...budgets }, policy: { localOnly: true, databaseOperationalTruth: true, maxRetries: 2, minimumFileAgeSeconds: 30, placeholderAdaptersAllowed: false, rendererOnlyInvalidationRerunsExpensiveDecisions: false, paidGenerationAllowed: false }, jobs, events: [], artifacts: [] };
}

function makeJob({ id, songId, variant = null, stage, dependencies, inputHash }) { return { id, songId, variant, stage: stage.id, status: "queued", dependencies, inputHash, artifactHash: contextHash({ id, inputHash }), expensiveDecision: Boolean(stage.expensiveDecision), requiresHumanApproval: Boolean(stage.requiresHumanApproval), approval: null, resources: stage.resources, attempts: 0, maxRetries: 2, cost: { measuredSeconds: null, estimatedClass: stage.expensiveDecision ? "high" : stage.id.includes("export") ? "high" : "bounded" }, logs: [], receipt: null, producedArtifacts: [] }; }

export function resumeAlbumBatch(batch, artifactIndex = {}) {
  return { ...batch, status: "ready", jobs: batch.jobs.map((job) => artifactIndex[job.artifactHash]?.valid ? { ...job, status: "cached", receipt: artifactIndex[job.artifactHash].receipt, producedArtifacts: artifactIndex[job.artifactHash].artifacts || [] } : job.status === "running" ? { ...job, status: "queued", logs: [...job.logs, "restart-recovered-running-to-queued"] } : job), events: [...batch.events, { type: "resume", at: new Date().toISOString(), artifactIndexEntries: Object.keys(artifactIndex).length }] };
}

export function claimAlbumJobs(batch, { activeInteractiveSession = false, approvals = {} } = {}) {
  const scale = activeInteractiveSession ? batch.budgets.activeSessionScale : 1;
  const remaining = Object.fromEntries(["cpu", "gpu", "disk", "decoders", "cacheGB"].map((key) => [key, Number(batch.budgets[key]) * scale]));
  const done = new Set(batch.jobs.filter((job) => ["done", "cached"].includes(job.status)).map((job) => job.id));
  const claimed = [];
  const jobs = batch.jobs.map((job) => {
    if (job.status !== "queued" || !job.dependencies.every((id) => done.has(id))) return job;
    const approval = approvals[job.id] || job.approval;
    if (job.requiresHumanApproval && !approval?.approvedBy) return { ...job, status: "awaiting-approval" };
    if (Object.entries(job.resources).some(([key, cost]) => Number(cost) > remaining[key])) return job;
    for (const [key, cost] of Object.entries(job.resources)) remaining[key] -= Number(cost);
    claimed.push(job.id);
    return { ...job, status: "running", approval: approval || null, attempts: job.attempts + 1, logs: [...job.logs, `claimed:interactive=${activeInteractiveSession}`] };
  });
  return { batch: { ...batch, jobs, events: [...batch.events, { type: "claim", at: new Date().toISOString(), activeInteractiveSession, jobIds: claimed, remaining }] }, claimedJobIds: claimed, remaining };
}

export function recordAlbumJobResult(batch, jobId, result) {
  const jobs = batch.jobs.map((job) => {
    if (job.id !== jobId) return job;
    if (result.cancelled) return { ...job, status: "cancelled", logs: [...job.logs, result.message || "cancelled"] };
    if (result.ok) return { ...job, status: "done", receipt: result.receipt, producedArtifacts: result.artifacts || [], cost: { ...job.cost, measuredSeconds: Number(result.durationSeconds || 0) }, logs: [...job.logs, result.message || "done"] };
    return { ...job, status: job.attempts < job.maxRetries ? "queued" : "failed", logs: [...job.logs, result.message || "failed"] };
  });
  return { ...batch, jobs, events: [...batch.events, { type: result.ok ? "job-done" : result.cancelled ? "job-cancelled" : "job-failed", at: new Date().toISOString(), jobId }] };
}

export function invalidateRendererOnly(batch, { songId, variant, renderer }) {
  const rendererStages = new Set(renderer === "hyperframes" ? ["hyperframes", "qa", "release-export"] : ["native-buffer", "qa", "release-export"]);
  return { ...batch, jobs: batch.jobs.map((job) => job.songId === songId && job.variant === variant && rendererStages.has(job.stage) ? { ...job, status: "queued", receipt: null, producedArtifacts: [], logs: [...job.logs, `renderer-only-invalidation:${renderer}`] } : job), events: [...batch.events, { type: "renderer-only-invalidation", songId, variant, renderer, expensiveDecisionRerun: false, at: new Date().toISOString() }] };
}

export function albumBatchQueueView(batch) { return batch.jobs.map((job) => ({ id: job.id, songId: job.songId, variant: job.variant, stage: job.stage, status: job.status, cost: job.cost, dependencies: job.dependencies, logs: job.logs.slice(-5), receipt: job.receipt, cancellable: ["queued", "running", "awaiting-approval"].includes(job.status), artifacts: job.producedArtifacts })); }
