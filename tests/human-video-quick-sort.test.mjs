import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createHumanVideoQuickSortStore,
  migrateHumanVideoQuickSortStoreToVideos,
  upsertHumanVideoQuickSortDecision,
} from "../src/domain/human-video-quick-sort.js";
import { openHumanVideoQuickSortStore } from "../server/human-video-quick-sort-store.mjs";

test("Quick Sort decisions are human-owned and revisioned independently of optical review", () => {
  const first = upsertHumanVideoQuickSortDecision(createHumanVideoQuickSortStore(), {
    videoKey: "record:raw-video",
    videoId: "raw-video",
    state: "accepted",
    expectedRevision: 0,
  }, { now: "2026-08-20T21:00:00.000Z", actorId: "human-enricher-quick-sort" });
  assert.equal(first.decision.state, "accepted");
  assert.equal(first.decision.revision, 1);
  assert.equal(first.changed, true);
  const repeated = upsertHumanVideoQuickSortDecision(first.store, {
    videoKey: "record:raw-video",
    state: "accepted",
  });
  assert.equal(repeated.changed, false);
  assert.equal(repeated.decision.revision, 1);
  assert.throws(() => upsertHumanVideoQuickSortDecision(first.store, {
    videoKey: "record:raw-video",
    state: "rejected",
    expectedRevision: 0,
  }), (error) => error.code === "quick_sort_revision_conflict");
});

test("Quick Sort service writes current state and append-only human triage events", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-quick-sort-"));
  const service = openHumanVideoQuickSortStore({
    filePath: path.join(root, "decisions.json"),
    eventPath: path.join(root, "events.ndjson"),
    clock: () => "2026-08-20T21:00:00.000Z",
  });
  await service.decide({ videoKey: "record:raw-video", videoId: "raw-video", state: "rejected" }, { actorId: "human-enricher-quick-sort" });
  const repeated = await service.decide({ videoKey: "record:raw-video", videoId: "raw-video", state: "rejected" }, { actorId: "human-enricher-quick-sort" });
  assert.equal(repeated.changed, false);
  assert.equal((await service.read()).decisions[0].state, "rejected");
  const eventLines = (await readFile(service.eventPath, "utf8")).trim().split("\n");
  assert.equal(eventLines.length, 1);
  const event = JSON.parse(eventLines[0]);
  assert.equal(event.action, "human-video-quick-sort.rejected");
  assert.equal(event.authority, "human-media-triage-only");
});

test("Quick Sort identity migration remaps legacy aliases and collapses duplicate decisions deterministically", () => {
  const store = createHumanVideoQuickSortStore({ decisions: [
    { videoKey: "record:legacy-a", state: "accepted", revision: 1, updatedAt: "2026-08-20T20:00:00.000Z" },
    { videoKey: "uri:/media/shared.mp4", state: "rejected", revision: 2, updatedAt: "2026-08-20T21:00:00.000Z" },
  ] });
  const result = migrateHumanVideoQuickSortStoreToVideos(store, [{
    id: "canonical-video",
    name: "Shared video",
    humanVideoKey: "fingerprint:sha256:shared",
    humanVideoAliases: ["fingerprint:sha256:shared", "record:legacy-a", "uri:/media/shared.mp4"],
  }], { now: "2026-08-20T22:00:00.000Z" });

  assert.equal(result.report.beforeDecisions, 2);
  assert.equal(result.report.afterDecisions, 1);
  assert.equal(result.report.collapsed, 1);
  assert.equal(result.report.conflicts.length, 1);
  assert.equal(result.store.decisions[0].videoKey, "fingerprint:sha256:shared");
  assert.equal(result.store.decisions[0].state, "rejected");
  assert.ok(result.store.decisions[0].aliases.includes("record:legacy-a"));
});
