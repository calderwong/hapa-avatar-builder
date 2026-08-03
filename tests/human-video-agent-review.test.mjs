import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createHumanVideoAgentReviewStore,
  decideHumanVideoAgentReview,
  normalizeHumanVideoAgentReview,
  upsertHumanVideoAgentReview,
} from "../src/domain/human-video-agent-review.js";
import {
  createHumanVideoEnricherDashboard,
  createHumanVideoEnrichmentStore,
  HUMAN_VIDEO_REVIEW_FILTERS,
  matchesHumanVideoReviewFilter,
} from "../src/domain/human-video-enrichment.js";
import { openHumanVideoAgentReviewStore } from "../server/human-video-agent-review-store.mjs";

const hashes = ["a", "b", "c"].map((letter) => `sha256:${letter.repeat(64)}`);

function opticalReview(overrides = {}) {
  return {
    videoKey: "record:video-1",
    videoId: "video-1",
    videoName: "Optical test",
    status: "pending-human",
    reviewer: {
      agentId: "/root/optical_batch_test",
      taskId: "optical_batch_test",
      model: "GPT-5 Codex",
      opticalInspectionConfirmed: true,
      attestation: "I personally inspected every listed frame with view_image.",
    },
    evidence: {
      frames: hashes.map((sha256, index) => ({
        timestampSeconds: index * 2.5,
        normalizedPosition: index / 2,
        imagePath: `/tmp/frame-${index}.jpg`,
        sha256,
        observation: `Frame ${index + 1} has a distinct literal visual observation authored after optical inspection.`,
      })),
    },
    proposal: {
      description: "A blue-coated figure crosses a celestial instrument room while a cat watches.",
      quality: { value: 4, explanation: "Strong composition and identity continuity, with visible midpoint morphing." },
      categories: ["character-transition", "fantasy-tech"],
      tags: ["blue-light", "cat", "astrolabe"],
      avatarRelationships: [{ avatarId: "avatar-2", avatarName: "Blue", evidenceType: "visual-observation", explanation: "Face and costume match the inspected dossier reference.", confidence: 0.97 }],
      references: [{ type: "echo-song", id: "same-sky", label: "Same Sky", evidenceType: "knowledge-base-inference", explanation: "Optional thematic connection to celestial routes.", confidence: 0.62 }],
      directorNotes: "Hold the final astrolabe composition; treat the midpoint as dream logic.",
      uncertainty: "Audio was not reviewed.",
      confidence: 0.82,
    },
    knowledgeComparisons: [{ sourcePath: "data/avatar-store.json", entityId: "avatar-2", entityLabel: "Blue", relationship: "identity-candidate", explanation: "Compared only after optical review.", confidence: 0.97 }],
    ...overrides,
  };
}

test("completed proposals require optical attestation and three distinct hash-bound frame observations", () => {
  const review = normalizeHumanVideoAgentReview(opticalReview());
  assert.equal(review.evidence.inspectedFrameCount, 3);
  assert.equal(review.evidence.semanticJudgmentAutomation, false);
  assert.equal(review.proposal.quality.value, 4);
  assert.equal(review.proposal.avatarRelationships[0].evidenceType, "visual-observation");

  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ reviewer: { opticalInspectionConfirmed: false } })), (error) => error.code === "optical_inspection_attestation_required");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { frames: opticalReview().evidence.frames.slice(0, 2) } })), (error) => error.code === "optical_frame_evidence_insufficient");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { frames: opticalReview().evidence.frames.map((frame) => ({ ...frame, sha256: hashes[0] })) } })), (error) => error.code === "optical_frame_evidence_not_distinct");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { requiredFrameCount: 4, frames: opticalReview().evidence.frames } })), (error) => error.code === "registered_frame_coverage_incomplete");
});

test("agent proposal revisions and explicit human decisions remain separate and append-only", () => {
  const submitted = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), { ...opticalReview(), expectedRevision: 0 }, { now: "2026-08-03T20:00:00.000Z", agentId: "/root/optical_batch_test" });
  assert.equal(submitted.review.revision, 1);
  assert.equal(submitted.review.status, "pending-human");
  const decided = decideHumanVideoAgentReview(submitted.store, submitted.review.id, { action: "accepted-edited", resultingEnrichmentRevision: 2 }, { now: "2026-08-03T21:00:00.000Z", actorId: "calder" });
  assert.equal(decided.review.status, "accepted-edited");
  assert.equal(decided.review.humanDecision.actorId, "calder");
  assert.equal(decided.review.revision, 2);
  assert.throws(() => decideHumanVideoAgentReview(submitted.store, "missing", { action: "accepted" }), (error) => error.code === "agent_review_not_found");
});

test("agent proposals rank and describe videos without becoming human enrichment or Echo authority", () => {
  const { store: reviewStore } = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), opticalReview(), { now: "2026-08-03T20:00:00.000Z" });
  const dashboard = createHumanVideoEnricherDashboard({
    mediaDashboard: { records: [{ id: "video-1", name: "Optical test", mediaType: "video", uri: "/video-1.mp4", relationships: [] }] },
    enrichmentStore: createHumanVideoEnrichmentStore(),
    agentReviewStore: reviewStore,
  });
  assert.equal(dashboard.summary.agentReviewed, 1);
  assert.equal(dashboard.summary.pendingHumanValidation, 1);
  assert.equal(dashboard.videos[0].agentReview.proposal.description, opticalReview().proposal.description);
  assert.equal(dashboard.videos[0].humanEnrichment, null);
});

test("optical review views isolate reviewed, pending-human, validated, and untouched videos", () => {
  const pending = { agentReview: { status: "pending-human" } };
  const accepted = { agentReview: { status: "accepted-edited" } };
  const untouched = { agentReview: null };
  assert.equal(matchesHumanVideoReviewFilter(pending, "agent-reviewed"), true);
  assert.equal(matchesHumanVideoReviewFilter(pending, "pending-human"), true);
  assert.equal(matchesHumanVideoReviewFilter(pending, "human-validated"), false);
  assert.equal(matchesHumanVideoReviewFilter(accepted, "human-validated"), true);
  assert.equal(matchesHumanVideoReviewFilter(untouched, "not-reviewed"), true);
  assert.equal(matchesHumanVideoReviewFilter(untouched, "agent-reviewed"), false);
  assert.equal(HUMAN_VIDEO_REVIEW_FILTERS.find((filter) => filter.value === "agent-reviewed")?.label, "Optically reviewed");
});

test("agent review service writes current proposals and append-only receipts", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-optical-review-"));
  const service = openHumanVideoAgentReviewStore({ filePath: path.join(root, "reviews.json"), eventPath: path.join(root, "events.ndjson"), clock: () => "2026-08-03T20:00:00.000Z" });
  const submitted = await service.submit(opticalReview(), { agentId: "/root/optical_batch_test" });
  assert.equal((await service.read()).reviews.length, 1);
  assert.equal(submitted.review.evidence.frames.length, 3);
  const firstEvent = JSON.parse((await readFile(service.eventPath, "utf8")).trim());
  assert.equal(firstEvent.action, "human-video-agent-review.submitted");
  assert.equal(firstEvent.semanticJudgmentAutomation, false);
});

test("UI, API, and CLI expose optical proposals and explicit human decisions", async () => {
  const [ui, api, cli] = await Promise.all([
    readFile(new URL("../src/components/HumanEnricherView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    readFile(new URL("../cli/avatar-builder.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /OPTICAL SUB-AGENT PASS/);
  assert.match(ui, /Use as editable draft/);
  assert.match(ui, /Append suggestions/);
  assert.match(ui, /Reject proposal/);
  assert.match(ui, /review: reviewFilter/);
  assert.match(ui, /get\("review"\)/);
  assert.match(api, /\/api\/human-enricher\/agent-reviews/);
  assert.match(api, /matchesHumanVideoReviewFilter\(video, review\)/);
  assert.match(cli, /human-enricher-agent-queue/);
  assert.match(cli, /human-enricher-agent-submit/);
  assert.match(cli, /human-enricher-agent-decision/);
});
