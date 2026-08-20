import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  HUMAN_VIDEO_REVIEW_FILTERS,
  createHumanVideoEnricherDashboard,
  createHumanVideoEnrichmentStore,
  humanVideoSourceKeys,
  isHumanVideoQuickSortSeen,
  matchesHumanVideoQuickSortSeenFilter,
  matchesHumanVideoReviewFilter,
  matchesHumanVideoSourceFilter,
} from "../src/domain/human-video-enrichment.js";

const video = (id, ownerType = "library", relationships = []) => ({ id, name: id, mediaType: "video", uri: `/${id}.mp4`, ownerType, relationships });
const review = (id, status, actorId = "") => ({
  id: `record:${id}:optical:r1`,
  videoKey: `record:${id}`,
  status,
  humanDecision: actorId ? { action: status, actorId } : null,
});

test("seen, unseen, accepted, and source filters derive from durable review and media state", () => {
  const pending = { agentReview: review("pending", "pending-human") };
  const accepted = { agentReview: review("accepted", "accepted") };
  const acceptedEdited = { agentReview: review("edited", "accepted-edited") };
  const rejected = { agentReview: review("rejected", "rejected") };

  assert.equal(matchesHumanVideoQuickSortSeenFilter(pending, "unseen"), true);
  assert.equal(matchesHumanVideoQuickSortSeenFilter(accepted, "unseen"), false);
  assert.equal(isHumanVideoQuickSortSeen(acceptedEdited), true);
  assert.equal(isHumanVideoQuickSortSeen(rejected), true);
  assert.equal(matchesHumanVideoReviewFilter(accepted, "accepted"), true);
  assert.equal(matchesHumanVideoReviewFilter(acceptedEdited, "accepted"), true);
  assert.equal(matchesHumanVideoReviewFilter(rejected, "accepted"), false);
  assert.equal(HUMAN_VIDEO_REVIEW_FILTERS.some((filter) => filter.value === "accepted"), true);

  const sourced = { ownerType: "library", relationships: [{ ownerType: "avatar" }, { ownerType: "scene" }] };
  assert.deepEqual(humanVideoSourceKeys(sourced), ["library", "avatar", "scene"]);
  assert.equal(matchesHumanVideoSourceFilter(sourced, "avatar"), true);
  assert.equal(matchesHumanVideoSourceFilter(sourced, "tarot"), false);
});

test("dashboard exposes seen/not-seen telemetry, accepted totals, and eligible source options", () => {
  const records = [
    video("pending", "library", [{ ownerType: "avatar" }]),
    video("quick-accepted", "tarot"),
    video("detail-edited", "scene"),
    video("quick-rejected", "library"),
    video("blocked", "library"),
    video("untouched", "song"),
  ];
  const reviews = [
    review("pending", "pending-human"),
    review("quick-accepted", "accepted", "human-enricher-quick-sort"),
    review("detail-edited", "accepted-edited", "human-enricher-ui"),
    review("quick-rejected", "rejected", "human-enricher-quick-sort"),
    review("blocked", "blocked"),
  ];
  const dashboard = createHumanVideoEnricherDashboard({
    mediaDashboard: { records },
    enrichmentStore: createHumanVideoEnrichmentStore(),
    agentReviewStore: { reviews },
  });

  assert.equal(dashboard.summary.quickSortKnown, 6);
  assert.equal(dashboard.summary.quickSortSeen, 3);
  assert.equal(dashboard.summary.quickSortNotSeen, 1);
  assert.equal(dashboard.summary.quickSortAccepted, 1);
  assert.equal(dashboard.summary.quickSortRejected, 1);
  assert.equal(dashboard.summary.acceptedAgentReviews, 2);
  assert.deepEqual(dashboard.quickSortSourceOptions.map(({ value }) => value), ["avatar", "scene", "library", "tarot"]);
});

test("UI and API apply unseen/source filtering before paginated Quick Sort rendering", async () => {
  const [ui, api] = await Promise.all([
    readFile(new URL("../src/components/HumanEnricherView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(ui, /params\.set\("seen", quickSortSeenFilter\)/);
  assert.match(ui, /params\.set\("source", quickSortSourceFilter\)/);
  assert.match(ui, /return new URLSearchParams\(globalThis\.location\?\.search \|\| ""\)\.get\("seen"\) === "all" \? "all" : "unseen"/);
  assert.match(ui, /Filter Quick Sort by source/);
  assert.match(ui, /quickSortSeen/);
  assert.match(ui, /quickSortNotSeen/);
  assert.match(ui, /removeOneFromPagination/);
  assert.match(api, /matchesHumanVideoQuickSortSeenFilter\(video, seen\)/);
  assert.match(api, /matchesHumanVideoSourceFilter\(video, source\)/);
  assert.ok(api.indexOf("matchesHumanVideoSourceFilter(video, source)") < api.indexOf("videos.slice(offset, offset + limit)"));
});
