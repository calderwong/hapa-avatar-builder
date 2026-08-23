import test from "node:test";
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createSongCardRemintStore } from "../server/song-card-remint-store.mjs";
import { createSongCardRemintQueue } from "../src/domain/song-card-remint-queue.js";

const SONG_A = "11111111-1111-4111-8111-111111111111";
const SONG_B = "22222222-2222-4222-8222-222222222222";

function candidate({ id, songId, status, planId = "", mintPlanId = "", predictedEdition = 1, updatedAt = "2026-08-14T00:00:00.000Z" }) {
  return {
    id,
    fingerprint: `fp:${id}`,
    songId,
    status,
    planId: planId || null,
    mintPlanId: mintPlanId || null,
    expectedLatestEdition: 0,
    predictedEdition,
    reasons: [],
    renderWork: [],
    reusableWork: [],
    requiresExplicitApproval: false,
    renderArtifacts: [],
    sourceRevisions: { current: { source: `src:${id}` } },
    createdAt: updatedAt,
    updatedAt,
  };
}

async function openStore(t, seed) {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "song-card-remint-candidate-join-"));
  t.after(() => fsp.rm(root, { recursive: true, force: true }));
  const queuePath = path.join(root, "remint-queue.json");
  const seedQueue = createSongCardRemintQueue({ createdAt: "2026-08-14T00:00:00.000Z" });
  seedQueue.candidates = seed;
  await fsp.writeFile(queuePath, `${JSON.stringify(seedQueue, null, 2)}\n`);
  const controller = { ledger: { getHead: async () => null, readEdition: async () => null } };
  const store = createSongCardRemintStore({ root, controller });
  await store.initialize();
  return store;
}

test("currentCandidateForSong ranks actionable candidates and ignores terminal states", async (t) => {
  const store = await openStore(t, [
    candidate({ id: "c-minted", songId: SONG_A, status: "minted", updatedAt: "2026-08-14T09:00:00.000Z" }),
    candidate({ id: "c-superseded", songId: SONG_A, status: "superseded", updatedAt: "2026-08-14T09:00:00.000Z" }),
    candidate({ id: "c-canceled", songId: SONG_A, status: "canceled" }),
    candidate({ id: "c-rejected", songId: SONG_A, status: "rejected" }),
    candidate({ id: "c-queued", songId: SONG_A, status: "queued" }),
    candidate({ id: "c-render-ready", songId: SONG_A, status: "render-ready", updatedAt: "2026-08-14T05:00:00.000Z" }),
    candidate({ id: "c-ready", songId: SONG_B, status: "ready-for-mint-review", mintPlanId: "plan:b2aa3537" }),
    candidate({ id: "c-minting", songId: SONG_B, status: "minting" }),
    candidate({ id: "c-failed", songId: SONG_B, status: "failed", updatedAt: "2026-08-14T10:00:00.000Z" }),
  ]);

  // render-ready outranks queued for the same song; finished mints and inactive
  // terminal states never shadow an actionable candidate.
  assert.equal((await store.currentCandidateForSong(SONG_A))?.id, "c-render-ready");
  // ready-for-mint-review outranks minting and failed for the other song.
  assert.equal((await store.currentCandidateForSong(SONG_B))?.id, "c-ready");
  assert.equal(await store.currentCandidateForSong("33333333-3333-4333-8333-333333333333"), null);
  assert.equal(await store.currentCandidateForSong(""), null);
  assert.equal(await store.currentCandidateForSong(null), null);
});

test("currentCandidateForSong prefers the newest row when ranks tie", async (t) => {
  const store = await openStore(t, [
    candidate({ id: "c-old", songId: SONG_A, status: "failed", updatedAt: "2026-08-13T00:00:00.000Z" }),
    candidate({ id: "c-new", songId: SONG_A, status: "failed", updatedAt: "2026-08-14T00:00:00.000Z" }),
  ]);
  assert.equal((await store.currentCandidateForSong(SONG_A))?.id, "c-new");
});

test("actionableSummary rolls up only operator-actionable candidates, newest first", async (t) => {
  const store = await openStore(t, [
    candidate({ id: "c-minted", songId: SONG_A, status: "minted", updatedAt: "2026-08-14T09:00:00.000Z" }),
    candidate({ id: "c-superseded", songId: SONG_A, status: "superseded" }),
    candidate({ id: "c-canceled", songId: SONG_B, status: "canceled" }),
    candidate({ id: "c-awaiting", songId: SONG_A, status: "awaiting-approval", predictedEdition: 2, updatedAt: "2026-08-13T12:00:00.000Z" }),
    candidate({ id: "c-render-ready", songId: SONG_B, status: "render-ready", predictedEdition: 1, updatedAt: "2026-08-14T06:00:00.000Z" }),
    candidate({ id: "c-ready", songId: SONG_A, status: "ready-for-mint-review", predictedEdition: 3, updatedAt: "2026-08-14T07:00:00.000Z" }),
  ]);

  const summary = await store.actionableSummary();
  assert.deepEqual(summary.map((row) => row.candidateId), ["c-ready", "c-render-ready", "c-awaiting"]);
  const ready = summary.find((row) => row.candidateId === "c-ready");
  assert.equal(ready.songId, SONG_A);
  assert.equal(ready.status, "ready-for-mint-review");
  assert.equal(ready.predictedEdition, 3);
  const renderReady = summary.find((row) => row.candidateId === "c-render-ready");
  assert.equal(renderReady.songId, SONG_B);
  assert.equal(renderReady.predictedEdition, 1);
});

test("actionableSummary is empty for a queue with only terminal candidates", async (t) => {
  const store = await openStore(t, [
    candidate({ id: "c-minted", songId: SONG_A, status: "minted" }),
    candidate({ id: "c-superseded", songId: SONG_A, status: "superseded" }),
    candidate({ id: "c-canceled", songId: SONG_B, status: "canceled" }),
    candidate({ id: "c-rejected", songId: SONG_B, status: "rejected" }),
  ]);
  assert.deepEqual(await store.actionableSummary(), []);
});
