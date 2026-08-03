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
  createHumanVideoQualityCalibration,
  HUMAN_VIDEO_REVIEW_FILTERS,
  matchesHumanVideoReviewFilter,
} from "../src/domain/human-video-enrichment.js";
import { openHumanVideoAgentReviewStore } from "../server/human-video-agent-review-store.mjs";
import {
  buildHumanVideoReferenceCardPacket,
  createHumanVideoReferenceReviewStore,
  normalizeHumanVideoReferenceReview,
  upsertHumanVideoReferenceReview,
} from "../src/domain/human-video-reference-review.js";

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
      referenceSignals: ["blue coat", "brass circular instrument", "cat silhouette"],
      directorNotes: "Hold the final astrolabe composition; treat the midpoint as dream logic.",
      uncertainty: "Audio was not reviewed.",
      confidence: 0.82,
    },
    ...overrides,
  };
}

test("completed proposals require optical attestation and three distinct hash-bound frame observations", () => {
  const review = normalizeHumanVideoAgentReview(opticalReview());
  assert.equal(review.evidence.inspectedFrameCount, 3);
  assert.equal(review.evidence.semanticJudgmentAutomation, false);
  assert.equal(review.proposal.quality.value, 4);
  assert.deepEqual(review.proposal.referenceSignals, ["blue coat", "brass circular instrument", "cat silhouette"]);

  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ reviewer: { opticalInspectionConfirmed: false } })), (error) => error.code === "optical_inspection_attestation_required");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { frames: opticalReview().evidence.frames.slice(0, 2) } })), (error) => error.code === "optical_frame_evidence_insufficient");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { frames: opticalReview().evidence.frames.map((frame) => ({ ...frame, sha256: hashes[0] })) } })), (error) => error.code === "optical_frame_evidence_not_distinct");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { requiredFrameCount: 4, frames: opticalReview().evidence.frames } })), (error) => error.code === "registered_frame_coverage_incomplete");
  assert.throws(() => upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), opticalReview({ proposal: { ...opticalReview().proposal, references: [{ id: "same-sky" }] } })), (error) => error.code === "reference_fields_require_reference_pass");
});

test("reference workers are independently configured and may select only supplied Hapa Cards", () => {
  const packet = buildHumanVideoReferenceCardPacket({
    referenceCatalog: [{ id: "reference:blue-sky", schemaVersion: "hapa.reference-card.v1", title: "Blue Sky", publicContext: "A source-backed sky reference." }],
    songs: [{ id: "song:same-sky", title: "Same Sky" }],
  }, { profile: "echo-reference-cards", digest: "sha256:packet", createdAt: "2026-08-03T22:00:00.000Z" });
  assert.equal(packet.cardCount, 1);
  assert.equal(packet.cards[0].id, "reference:blue-sky");
  const input = {
    videoKey: "record:video-1",
    opticalReview: { id: "record:video-1:optical:r1", revision: 1 },
    packet: { id: packet.id, profile: packet.profile, digest: packet.digest, cardCount: packet.cardCount },
    reviewer: { agentId: "reference-terra", model: "gpt-5.6-terra", reasoningEffort: "high", parameters: { temperature: 0.2 }, referenceInspectionConfirmed: true },
    proposal: { status: "matched", matches: [{ cardId: "reference:blue-sky", cardTitle: "Blue Sky", matchType: "palette", observedEvidence: "The frame is dominated by cyan sky.", explanation: "The supplied Card explicitly names the same visual signal.", confidence: 0.74 }] },
  };
  const review = normalizeHumanVideoReferenceReview(input, {}, { allowedCardIds: packet.cards.map((card) => card.id) });
  assert.equal(review.reviewer.model, "gpt-5.6-terra");
  assert.equal(review.reviewer.parameters.temperature, 0.2);
  assert.throws(() => normalizeHumanVideoReferenceReview({ ...input, proposal: { ...input.proposal, matches: [{ ...input.proposal.matches[0], cardId: "invented-card" }] } }, {}, { allowedCardIds: packet.cards.map((card) => card.id) }), (error) => error.code === "reference_card_outside_packet");
  const submitted = upsertHumanVideoReferenceReview(createHumanVideoReferenceReviewStore(), input, { now: "2026-08-03T22:00:00.000Z", allowedCardIds: packet.cards.map((card) => card.id) });
  assert.equal(submitted.review.revision, 1);
});

test("human quality corrections form a bounded calibration profile", () => {
  const calibration = createHumanVideoQualityCalibration([
    { humanVideoKey: "a", agentReview: { proposal: { quality: { value: 4 } } }, humanEnrichment: { quality: { value: 4 } } },
    { humanVideoKey: "b", agentReview: { proposal: { quality: { value: 2 } } }, humanEnrichment: { quality: { value: 3 } } },
    { humanVideoKey: "c", agentReview: { proposal: { quality: { value: 3 } } }, humanEnrichment: null },
  ]);
  assert.equal(calibration.sampleSize, 2);
  assert.equal(calibration.exactMatchRate, 0.5);
  assert.equal(calibration.meanAbsoluteError, 0.5);
  assert.equal(calibration.gradeBands.find((band) => band.agentQuality === 2).humanAverage, 3);
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
  assert.match(ui, /OPTICAL PASS · NO KNOWLEDGE SEARCH/);
  assert.match(ui, /Use as editable draft/);
  assert.match(ui, /Append suggestions/);
  assert.match(ui, /Reject proposal/);
  assert.match(ui, /REFERENCE PASS · BOUNDED HAPA CARDS/);
  assert.match(ui, /no Cards assigned here/);
  assert.match(ui, /setTimeout\(\(\) => save\(\), 350\)/);
  assert.match(ui, /if \(saveState === "dirty" && !\(await save\(\)\)\) return/);
  assert.doesNotMatch(ui, /Save human enrichment/);
  assert.match(ui, /agentReview\?\.proposal\?\.quality\?\.value/);
  assert.match(ui, /review: reviewFilter/);
  assert.match(ui, /get\("review"\)/);
  assert.match(api, /\/api\/human-enricher\/agent-reviews/);
  assert.match(api, /matchesHumanVideoReviewFilter\(video, review\)/);
  assert.match(api, /reference-card-packets/);
  assert.match(api, /forbiddenInputs/);
  assert.match(cli, /human-enricher-agent-queue/);
  assert.match(cli, /human-enricher-agent-submit/);
  assert.match(cli, /human-enricher-agent-decision/);
  assert.match(cli, /human-enricher-reference-queue/);
  assert.match(cli, /human-enricher-reference-submit/);
});
