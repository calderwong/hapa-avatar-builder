import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  createHumanVideoQuickSortStore,
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
  assert.equal((await service.read()).decisions[0].state, "rejected");
  const event = JSON.parse((await readFile(service.eventPath, "utf8")).trim());
  assert.equal(event.action, "human-video-quick-sort.rejected");
  assert.equal(event.authority, "human-media-triage-only");
});
