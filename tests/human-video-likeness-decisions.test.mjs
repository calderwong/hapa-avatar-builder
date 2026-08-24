import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  HUMAN_VIDEO_LIKENESS_DECISION_SCHEMA,
  HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA,
  createHumanVideoLikenessDecisionsStore,
  normalizeHumanVideoLikenessDecision,
  normalizeHumanVideoLikenessDecisionsStore,
  upsertHumanVideoLikenessDecision,
  normalizeReceipt,
  humanVideoLikenessLaneState,
  matchesHumanVideoLikenessLaneFilter,
  isHumanVideoLikenessDecided,
  likenessDecisionError,
} from "../src/domain/human-video-likeness-decisions.js";
import { openHumanVideoLikenessDecisionsStore } from "../server/human-video-likeness-decisions-store.mjs";

const RECIPT = {
  schemaVersion: "hapa.avatar-likeness-match.v1",
  key: "uri:/media/a.mp4",
  videoId: "v1",
  videoName: "a.mp4",
  runId: "avatar-likeness-match-2026-08-24",
  verdict: "assigned",
  reasons: [],
  primary: { avatarId: "avatar-1", name: "Alpha", score: 0.8734, channels: { palette: 0.9, dHash: 0.8, text: null, colorWords: 0.4 } },
  secondary: { avatarId: "avatar-2", name: "Beta", score: 0.7, channels: { palette: 0.8, dHash: 0.7, text: 0.1, colorWords: 0.5 } },
  candidates: [
    { avatarId: "avatar-1", name: "Alpha", score: 0.8734, channels: { palette: 0.9, dHash: 0.8, text: null, colorWords: 0.4 } },
    { avatarId: "avatar-2", name: "Beta", score: 0.7, channels: { palette: 0.8, dHash: 0.7, text: 0.1, colorWords: 0.5 } },
    { avatarId: "avatar-3", name: "Gamma", score: 0.66, channels: { palette: 0.7, dHash: 0.6, text: 0.1, colorWords: 0.5 } },
    { avatarId: "avatar-4", name: "Delta", score: 0.6, channels: { palette: 0.6, dHash: 0.6, text: 0.1, colorWords: 0.5 } },
    { avatarId: "avatar-5", name: "Epsilon", score: 0.58, channels: { palette: 0.6, dHash: 0.5, text: 0.1, colorWords: 0.5 } },
    { avatarId: "avatar-6", name: "Zeta", score: 0.5, channels: { palette: 0.5, dHash: 0.5, text: 0.1, colorWords: 0.5 } },
  ],
  excludedProfileless: 1,
  matchedAt: "2026-08-24T05:00:00.000Z",
};

test("decision normalizes to the family shape with origin avatar-likeness", () => {
  const decision = normalizeHumanVideoLikenessDecision({
    videoKey: "uri:/media/a.mp4",
    state: "accepted",
    decisionAvatarId: "avatar-1",
    receipt: RECIPT,
    actorId: "calder",
  });
  assert.equal(decision.schemaVersion, HUMAN_VIDEO_LIKENESS_DECISION_SCHEMA);
  assert.equal(decision.id, "uri:/media/a.mp4:avatar-likeness");
  assert.equal(decision.state, "accepted");
  assert.equal(decision.origin, "avatar-likeness");
  assert.equal(decision.decisionAvatarId, "avatar-1");
  assert.equal(decision.receipt.runId, "avatar-likeness-match-2026-08-24");
  assert.equal(decision.receipt.primary.avatarId, "avatar-1");
  // Candidates are bounded to five with ranks; the sixth is dropped.
  assert.equal(decision.receipt.candidates.length, 5);
  assert.equal(decision.receipt.candidates[0].rank, 1);
  assert.equal(decision.receipt.candidates[4].avatarId, "avatar-5");
  assert.equal(decision.receipt.primary.channels.text, null, "null channels survive the receipt");
  assert.equal(decision.receipt.staleSignature, false);
  assert.throws(
    () => normalizeHumanVideoLikenessDecision({ videoKey: "uri:/media/a.mp4", state: "maybe" }),
    (error) => error instanceof Error && error.code === "likeness_decision_state_invalid" && error.statusCode === 400,
  );
  assert.throws(
    () => normalizeHumanVideoLikenessDecision({ state: "accepted" }),
    (error) => error.code === "likeness_decision_video_key_required",
  );
});

test("receipts are bounded and honest about missing parts", () => {
  assert.equal(normalizeReceipt(null), null);
  const bounded = normalizeReceipt({ runId: "x".repeat(500), verdict: "unresolved", reasons: ["too_close"], primary: RECIPT.primary });
  assert.equal(bounded.runId.length, 160);
  assert.equal(bounded.primary.score, "0.8734");
  assert.equal(bounded.candidates.length, 0);
  assert.equal(bounded.gate, null);
});

test("store rejects duplicate video keys and sorts deterministically", () => {
  const make = (videoKey, state) => ({
    schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_SCHEMA,
    id: `${videoKey}:avatar-likeness`,
    videoKey,
    state,
    origin: "avatar-likeness",
    revision: 1,
    updatedAt: "2026-08-24T05:00:00.000Z",
  });
  const store = normalizeHumanVideoLikenessDecisionsStore({ schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA, decisions: [make("b", "accepted"), make("a", "rejected")] });
  assert.deepEqual(store.decisions.map((decision) => decision.videoKey), ["a", "b"]);
  assert.match(store.truthBoundary, /human-confirmed/);
  assert.throws(
    () => normalizeHumanVideoLikenessDecisionsStore({ schemaVersion: HUMAN_VIDEO_LIKENESS_DECISION_STORE_SCHEMA, decisions: [make("a", "accepted"), make("a", "rejected")] }),
    (error) => error.code === "likeness_decisions_store_duplicate_video" && error.statusCode === 500,
  );
});

test("upsert is idempotent, bumps revisions, and enforces optimistic concurrency", () => {
  let store = createHumanVideoLikenessDecisionsStore();
  const input = { videoKey: "uri:/media/a.mp4", state: "accepted", decisionAvatarId: "avatar-1", receipt: RECIPT };
  const first = upsertHumanVideoLikenessDecision(store, input, { now: "2026-08-24T05:00:00.000Z", actorId: "calder" });
  assert.equal(first.changed, true);
  assert.equal(first.decision.revision, 1);
  store = first.store;
  const repeat = upsertHumanVideoLikenessDecision(store, input, { now: "2026-08-24T05:01:00.000Z" });
  assert.equal(repeat.changed, false, "same state + same avatar is a no-op");
  const flip = upsertHumanVideoLikenessDecision(store, { ...input, state: "rejected" }, { now: "2026-08-24T05:02:00.000Z" });
  assert.equal(flip.changed, true);
  assert.equal(flip.decision.revision, 2);
  assert.equal(flip.decision.state, "rejected");
  assert.throws(
    () => upsertHumanVideoLikenessDecision(flip.store, { ...input, state: "accepted", expectedRevision: 1 }),
    (error) => error.code === "likeness_decision_revision_conflict" && error.statusCode === 409,
  );
});

test("lane states and filters follow verdict + decision", () => {
  const proposedAssigned = { likenessVerdict: { verdict: "assigned" } };
  const proposedUnresolved = { likenessVerdict: { verdict: "unresolved" } };
  const accepted = { likenessVerdict: { verdict: "assigned" }, likenessDecision: { state: "accepted" } };
  const rejected = { likenessVerdict: { verdict: "unresolved" }, likenessDecision: { state: "rejected" } };
  const unknown = {};
  assert.equal(humanVideoLikenessLaneState(proposedAssigned), "assigned");
  assert.equal(humanVideoLikenessLaneState(proposedUnresolved), "proposed");
  assert.equal(humanVideoLikenessLaneState(accepted), "accepted");
  assert.equal(humanVideoLikenessLaneState(rejected), "rejected");
  assert.equal(humanVideoLikenessLaneState(unknown), "unknown");
  assert.equal(matchesHumanVideoLikenessLaneFilter(unknown, "all"), false);
  assert.equal(matchesHumanVideoLikenessLaneFilter(proposedAssigned, "proposed"), true);
  assert.equal(matchesHumanVideoLikenessLaneFilter(proposedUnresolved, "proposed"), true);
  assert.equal(matchesHumanVideoLikenessLaneFilter(accepted, "proposed"), false);
  assert.equal(matchesHumanVideoLikenessLaneFilter(accepted, "accepted"), true);
  assert.equal(matchesHumanVideoLikenessLaneFilter(rejected, "all"), true);
  assert.equal(isHumanVideoLikenessDecided(accepted), true);
  assert.equal(isHumanVideoLikenessDecided(proposedAssigned), false);
});

test("durable store round-trips decisions with event receipts and concurrency", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "human-likeness-decisions-"));
  try {
    const store = openHumanVideoLikenessDecisionsStore({ filePath: path.join(root, "decisions.json") });
    assert.equal((await store.read()).decisions.length, 0);
    const result = await store.decide({ videoKey: "uri:/media/a.mp4", videoId: "v1", videoName: "a.mp4", state: "accepted", decisionAvatarId: "avatar-1", receipt: RECIPT }, { actorId: "calder" });
    assert.equal(result.decision.state, "accepted");
    const persisted = await store.read();
    assert.equal(persisted.decisions.length, 1);
    assert.equal(persisted.decisions[0].origin, "avatar-likeness");
    assert.equal(persisted.decisions[0].actorId, "calder");
    const events = (await fs.readFile(store.eventPath, "utf8")).trim().split("\n");
    assert.equal(events.length, 1);
    const parsed = JSON.parse(events[0]);
    assert.equal(parsed.action, "human-video-likeness.accepted");
    assert.equal(parsed.authority, "human-likeness-acceptance-only");
    // Concurrent decides serialize without losing writes.
    await Promise.all([
      store.decide({ videoKey: "uri:/media/b.mp4", state: "rejected" }, { actorId: "calder" }),
      store.decide({ videoKey: "uri:/media/c.mp4", state: "rejected" }, { actorId: "calder" }),
      store.decide({ videoKey: "uri:/media/d.mp4", state: "rejected" }, { actorId: "calder" }),
    ]);
    assert.equal((await store.read()).decisions.length, 4);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("likenessDecisionError carries codes, statuses, and details", () => {
  const error = likenessDecisionError("some_code", "message", 409, { currentRevision: 2 });
  assert.equal(error.code, "some_code");
  assert.equal(error.statusCode, 409);
  assert.deepEqual(error.details, { currentRevision: 2 });
});
