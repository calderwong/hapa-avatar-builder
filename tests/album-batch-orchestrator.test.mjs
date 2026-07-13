import test from "node:test";
import assert from "node:assert/strict";
import { albumBatchQueueView, claimAlbumJobs, createAlbumBatch, invalidateRendererOnly, recordAlbumJobResult, resumeAlbumBatch } from "../src/domain/album-batch-orchestrator.js";

test("restart resumes running work and skips valid content-addressed artifacts", () => {
  let batch = createAlbumBatch({ songs: [{ id: "song-1", sourceHash: "source" }] });
  batch.jobs[0].status = "running";
  const cached = batch.jobs[1];
  batch = resumeAlbumBatch(batch, { [cached.artifactHash]: { valid: true, receipt: { hash: "r" }, artifacts: ["a.json"] } });
  assert.equal(batch.jobs[0].status, "queued");
  assert.equal(batch.jobs[1].status, "cached");
});

test("active session budgets bound claims and failures retry only twice", () => {
  let batch = resumeAlbumBatch(createAlbumBatch({ songs: [{ id: "song-1", sourceHash: "source" }] }));
  let claim = claimAlbumJobs(batch, { activeInteractiveSession: true });
  assert.equal(claim.claimedJobIds.length, 1);
  batch = claim.batch;
  const id = claim.claimedJobIds[0];
  batch = recordAlbumJobResult(batch, id, { ok: false, message: "bounded failure" });
  assert.equal(batch.jobs.find((job) => job.id === id).status, "queued");
  claim = claimAlbumJobs(batch, { activeInteractiveSession: true });
  batch = recordAlbumJobResult(claim.batch, id, { ok: false, message: "second failure" });
  assert.equal(batch.jobs.find((job) => job.id === id).status, "failed");
});

test("renderer-only changes never rerun decision envelopes and queue view exposes operations", () => {
  let batch = createAlbumBatch({ songs: [{ id: "song-1", sourceHash: "source" }] });
  batch = invalidateRendererOnly(batch, { songId: "song-1", variant: "kinetic", renderer: "hyperframes" });
  assert.equal(batch.jobs.find((job) => job.expensiveDecision).status, "queued");
  assert.equal(batch.events.at(-1).expensiveDecisionRerun, false);
  const view = albumBatchQueueView(batch);
  assert.ok(view.every((row) => Object.hasOwn(row, "cost") && Object.hasOwn(row, "dependencies") && Object.hasOwn(row, "logs") && Object.hasOwn(row, "cancellable") && Object.hasOwn(row, "artifacts")));
});
