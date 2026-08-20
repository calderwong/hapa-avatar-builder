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
        palette: {
          colors: [
            { hex: "#123ABC", label: "celestial blue", prevalence: "dominant", explanation: `Blue light fills frame ${index + 1}.` },
            { hex: "#D4A63A", label: "brass gold", prevalence: "supporting", explanation: `Warm brass appears in frame ${index + 1}.` },
            { hex: "#101820", label: "shadow navy", prevalence: "supporting", explanation: `Deep shadows frame image ${index + 1}.` },
          ],
          uncertainty: `Frame ${index + 1} hex values are visually estimated.`,
        },
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
  assert.equal(review.evidence.frames[0].palette.colors[0].hex, "#123ABC");
  assert.deepEqual(review.evidence.frames.map((frame) => frame.role), ["first", "mid", "last"]);
  assert.equal(review.evidence.frames[1].palette.frameSha256, hashes[1]);
  assert.deepEqual(review.evidence.frames[2].palette.colors[0].evidenceFrameHashes, [hashes[2]]);
  assert.equal(Object.hasOwn(review.proposal, "palette"), false);
  assert.deepEqual(review.proposal.referenceSignals, ["blue coat", "brass circular instrument", "cat silhouette"]);

  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ reviewer: { opticalInspectionConfirmed: false } })), (error) => error.code === "optical_inspection_attestation_required");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { frames: opticalReview().evidence.frames.slice(0, 2) } })), (error) => error.code === "optical_frame_evidence_insufficient");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { frames: opticalReview().evidence.frames.map((frame) => ({ ...frame, sha256: hashes[0] })) } })), (error) => error.code === "optical_frame_evidence_not_distinct");
  assert.throws(() => normalizeHumanVideoAgentReview(opticalReview({ evidence: { requiredFrameCount: 4, frames: opticalReview().evidence.frames } })), (error) => error.code === "registered_frame_coverage_incomplete");
  assert.throws(() => upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), opticalReview({ proposal: { ...opticalReview().proposal, references: [{ id: "same-sky" }] } })), (error) => error.code === "reference_fields_require_reference_pass");
  assert.throws(() => upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), opticalReview({ proposal: { ...opticalReview().proposal, referenceSignals: ["This matches Hapa Card X."] } })), (error) => error.code === "agent_review_knowledge_claim_forbidden");
  assert.throws(() => upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), opticalReview({ evidence: { frames: opticalReview().evidence.frames.map((frame, index) => index === 1 ? { ...frame, palette: { colors: [] } } : frame) } })), (error) => error.code === "optical_frame_palette_required");
  assert.throws(() => upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), opticalReview({ evidence: { frames: opticalReview().evidence.frames.map((frame, index) => index === 1 ? { ...frame, palette: { ...frame.palette, uncertainty: "" } } : frame) } })), (error) => error.code === "optical_frame_palette_required");
  assert.throws(() => upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), opticalReview({ evidence: { frames: opticalReview().evidence.frames.map((frame, index) => index === 1 ? { ...frame, palette: { ...frame.palette, colors: frame.palette.colors.map((color, colorIndex) => colorIndex === 0 ? { ...color, prevalence: "" } : color) } } : frame) } })), (error) => error.code === "optical_frame_palette_required");
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

test("Reference Atlas packet profiles widen deliberately without erasing authority or provenance", () => {
  const referenceCards = [
    { id: "reference:direct", title: "Direct", revisionId: "reference:direct:r1", authority: { evidenceClass: "direct", reviewStatus: "pending-review", canonStatus: "non-canon" }, rightsAndPrivacy: { visibility: "shared", containsPrivateClues: false, licenseStatus: "reference-only" }, provenance: { method: "legacy-migration", sourceRunId: "run:atlas", sourcePacketHash: "fnv1a:packet" }, citations: [{ label: "Direct source", url: "https://example.test/direct", sourceClass: "official-source", retrievedAt: "2026-08-03" }], signalLexicon: { orthographic: ["DIRECT"] } },
    { id: "reference:sourced", title: "Sourced", authority: { evidenceClass: "source-backed-candidate", reviewStatus: "proposed", canonStatus: "non-canon" }, provenance: { method: "research-loop" } },
    { id: "reference:comparative", title: "Comparative", authority: { evidenceClass: "comparative", reviewStatus: "proposed", canonStatus: "non-canon" }, provenance: { method: "proper-name-recurrence" } },
    { id: "reference:unresolved", title: "Unresolved", authority: { evidenceClass: "unresolved", reviewStatus: "proposed", canonStatus: "non-canon" }, provenance: { method: "phonetic-near-match" } },
  ];
  const input = {
    referenceCards,
    referenceRun: { runId: "run:atlas", runHash: "fnv1a:atlas", referenceRuntime: { source: "external-research-projection", authority: { status: "applied", receiptId: "authority:one", approvedCards: 3, resolvedWithoutPromotion: 1, previewPolicy: "visible-before-review", publicActivation: false, canonPromotion: false } } },
    songs: [{ id: "song:one", title: "Song One" }],
    avatars: [{ id: "avatar:one", primaryName: "Avatar One" }],
  };
  const standard = buildHumanVideoReferenceCardPacket(input, { profile: "echo-reference-cards" });
  const wide = buildHumanVideoReferenceCardPacket(input, { profile: "echo-reference-wide" });
  const exploratory = buildHumanVideoReferenceCardPacket(input, { profile: "echo-reference-exploratory" });
  const core = buildHumanVideoReferenceCardPacket(input, { profile: "echo-core-cards" });
  assert.equal(standard.cardCount, 2);
  assert.equal(wide.cardCount, 3);
  assert.equal(exploratory.cardCount, 4);
  assert.equal(core.cardCount, 4);
  assert.deepEqual(standard.authorityCounts, { direct: 1, "source-backed-candidate": 1 });
  assert.deepEqual(standard.reviewStatusCounts, { "pending-review": 1, proposed: 1 });
  assert.deepEqual(standard.canonStatusCounts, { "non-canon": 2 });
  assert.equal(standard.referenceAtlas.availableCards, 4);
  assert.equal(standard.referenceAtlas.source, "external-research-projection");
  assert.equal(standard.referenceAtlas.authority.receiptId, "authority:one");
  assert.equal(standard.cards[0].source.sourceKind, "official-source");
  assert.equal(standard.cards[0].signals.includes("DIRECT"), true);
  assert.equal(standard.cards[0].provenance.sourceRunId, "run:atlas");
  assert.equal(standard.cards[0].sourcePath, "data/echo-reference-research-loop/projected-run.json");
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
  const forged = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), { ...opticalReview(), status: "accepted", humanDecision: { action: "accepted", actorId: "forged-human" } }, { now: "2026-08-03T20:00:00.000Z", agentId: "agent" });
  assert.equal(forged.review.status, "pending-human");
  assert.equal(forged.review.humanDecision, null);
  const forgedReceipt = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), { ...opticalReview(), reviewer: { ...opticalReview().reviewer, schedulerReceipt: { jobId: "forged-job", frameDigest: "sha256:forged" } } }, { now: "2026-08-03T20:00:00.000Z", agentId: "agent" });
  assert.equal(forgedReceipt.review.reviewer.schedulerReceipt, null);
});

test("scheduler authority may repair only the exact pending-human legacy revision", () => {
  const legacy = normalizeHumanVideoAgentReview({
    ...opticalReview(),
    evidence: {
      frames: opticalReview().evidence.frames.map((frame) => ({
        ...frame,
        palette: { colors: [], uncertainty: "" },
      })),
    },
    revision: 1,
  });
  const legacyStore = createHumanVideoAgentReviewStore({ reviews: [legacy] });
  const schedulerReceipt = {
    campaignId: "human-enricher-optical-v1",
    jobId: "optical:repair-one",
    attempt: 1,
    frameDigest: `sha256:${"d".repeat(64)}`,
    telemetryStatus: "unavailable",
    telemetrySource: "test-scheduler",
  };
  const repaired = upsertHumanVideoAgentReview(legacyStore, {
    ...opticalReview(),
    expectedRevision: 1,
    reviewer: { ...opticalReview().reviewer, schedulerReceipt },
  }, { now: "2026-08-03T20:05:00.000Z", agentId: "/root/optical-repair", schedulerAuthority: true });
  assert.equal(repaired.review.id, legacy.id);
  assert.equal(repaired.review.revision, 2);
  assert.equal(repaired.review.status, "pending-human");
  assert.equal(repaired.review.humanDecision, null);
  assert.equal(repaired.review.reviewer.schedulerReceipt.jobId, schedulerReceipt.jobId);
  assert.throws(
    () => upsertHumanVideoAgentReview(legacyStore, { ...opticalReview(), expectedRevision: 0, reviewer: { ...opticalReview().reviewer, schedulerReceipt } }, { agentId: "/root/optical-repair", schedulerAuthority: true }),
    (error) => error.code === "agent_review_revision_conflict",
  );
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

test("Quick Sort telemetry is reconstructed from durable attributed decisions", () => {
  const accepted = normalizeHumanVideoAgentReview({
    ...opticalReview(),
    videoKey: "record:accepted-video",
    videoId: "accepted-video",
    id: "record:accepted-video:optical:r2",
    status: "accepted",
    humanDecision: { action: "accepted", actorId: "human-enricher-quick-sort", decidedAt: "2026-08-20T18:00:00.000Z" },
  });
  const rejected = normalizeHumanVideoAgentReview({
    ...opticalReview(),
    videoKey: "record:rejected-video",
    videoId: "rejected-video",
    id: "record:rejected-video:optical:r2",
    status: "rejected",
    humanDecision: { action: "rejected", actorId: "human-enricher-quick-sort", decidedAt: "2026-08-20T18:01:00.000Z" },
  });
  const detailAccepted = normalizeHumanVideoAgentReview({
    ...opticalReview(),
    videoKey: "record:detail-video",
    videoId: "detail-video",
    id: "record:detail-video:optical:r2",
    status: "accepted",
    humanDecision: { action: "accepted", actorId: "human-enricher-ui", decidedAt: "2026-08-20T18:02:00.000Z" },
  });
  const records = ["accepted-video", "rejected-video", "detail-video", "untouched-video"].map((id) => ({
    id,
    name: id,
    mediaType: "video",
    uri: `/${id}.mp4`,
    relationships: [],
  }));
  const dashboard = createHumanVideoEnricherDashboard({
    mediaDashboard: { records },
    enrichmentStore: createHumanVideoEnrichmentStore(),
    agentReviewStore: createHumanVideoAgentReviewStore({ reviews: [accepted, rejected, detailAccepted] }),
  });

  assert.equal(dashboard.summary.quickSortKnown, 4);
  assert.equal(dashboard.summary.quickSortAccepted, 1);
  assert.equal(dashboard.summary.quickSortRejected, 1);
});

test("terminal invalid-media receipts remain distinct from optical reviews", () => {
  const blocked = normalizeHumanVideoAgentReview({
    videoKey: "record:invalid-video",
    videoId: "invalid-video",
    videoName: "Not actually an MP4",
    status: "blocked",
    reviewer: { agentId: "frame-preparation-audit", opticalInspectionConfirmed: false },
    blockedReason: "terminal-invalid-media: zero-byte registered source; First/Mid/Last inspection is unavailable.",
    evidence: { frames: [] },
  });
  const dashboard = createHumanVideoEnricherDashboard({
    mediaDashboard: { records: [{ id: "invalid-video", name: "Not actually an MP4", mediaType: "video", uri: "/invalid.mp4", relationships: [] }] },
    enrichmentStore: createHumanVideoEnrichmentStore(),
    agentReviewStore: createHumanVideoAgentReviewStore({ reviews: [blocked] }),
  });
  assert.equal(dashboard.summary.agentReviewed, 1);
  assert.equal(dashboard.summary.terminalInvalidMedia, 1);
  assert.equal(dashboard.summary.pendingHumanValidation, 0);
  assert.equal(dashboard.videos[0].agentReview.status, "blocked");
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

test("cross-process review locking preserves a concurrent human decision over an agent revision", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-optical-review-lock-"));
  const options = { filePath: path.join(root, "reviews.json"), eventPath: path.join(root, "events.ndjson"), clock: () => "2026-08-03T20:00:00.000Z" };
  const first = openHumanVideoAgentReviewStore(options);
  const second = openHumanVideoAgentReviewStore(options);
  const initial = await first.submit({ ...opticalReview(), expectedRevision: 0 }, { agentId: "/root/optical_batch_test" });
  const outcomes = await Promise.allSettled([
    first.decide(initial.review.id, { action: "accepted" }, { actorId: "human" }),
    second.submit({ ...opticalReview(), expectedRevision: 1, proposal: { ...opticalReview().proposal, description: "Concurrent agent revision." } }, { agentId: "/root/optical_batch_test" }),
  ]);
  const stored = await first.read();
  assert.equal(stored.reviews[0].status, "accepted");
  assert.equal(stored.reviews[0].humanDecision.actorId, "human");
  assert.equal(outcomes.some((outcome) => outcome.status === "fulfilled"), true);
});

test("UI, API, CLI, and node discovery expose optical and bounded Reference Atlas passes", async () => {
  const [ui, api, cli, nodeManifest] = await Promise.all([
    readFile(new URL("../src/components/HumanEnricherView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    readFile(new URL("../cli/avatar-builder.mjs", import.meta.url), "utf8"),
    readFile(new URL("../hapa-node.json", import.meta.url), "utf8"),
  ]);
  assert.match(ui, /OPTICAL PASS · NO KNOWLEDGE SEARCH/);
  assert.match(ui, /Use as editable draft/);
  assert.match(ui, /Append suggestions/);
  assert.match(ui, /Reject proposal/);
  assert.match(ui, /REFERENCE PASS · BOUNDED HAPA CARDS/);
  assert.match(ui, /frame\.role/);
  assert.match(ui, /human-frame-palette/);
  assert.match(ui, /no Cards assigned here/);
  assert.match(ui, /setTimeout\(\(\) => save\(\), 350\)/);
  assert.match(ui, /if \(saveState === "dirty" && !\(await save\(\)\)\) return/);
  assert.doesNotMatch(ui, /Save human enrichment/);
  assert.match(ui, /agentReview\?\.proposal\?\.quality\?\.value/);
  assert.match(ui, /review: reviewFilter/);
  assert.match(ui, /get\("review"\)/);
  assert.match(api, /\/api\/human-enricher\/agent-reviews/);
  assert.match(api, /\/api\/human-enricher\/optical-campaign/);
  assert.match(api, /frameManifestsEqual\(currentFrames, job\.frames\)/);
  assert.match(api, /humanVideoOpticalCampaignStore\.completeWithReview/);
  assert.match(api, /humanVideoOpticalCampaignStore\.progress/);
  assert.match(api, /isRepairableLegacyOpticalReview/);
  assert.match(api, /matchesLegacyOpticalRepairTarget/);
  assert.match(api, /expectedRevision: matchingRepairTarget \? job\.repair\.priorRevision : 0/);
  assert.match(api, /agent_review_terminal_invalid_media_unverified/);
  assert.match(api, /isTerminalInvalidMediaReview/);
  assert.match(ui, /Full catalog resolved/);
  assert.match(ui, /invalid-media terminals/);
  assert.match(api, /humanVideoFrameCatalog\.attachMediaDashboard/);
  assert.match(api, /resolveTrustedHumanVideoCatalogFrameUri/);
  assert.doesNotMatch(api, /agentReview: video\.agentReview \|\| null/);
  assert.match(api, /leaseId: job\.lease\.leaseId/);
  assert.match(api, /optical_campaign_telemetry_required/);
  assert.match(api, /matchesHumanVideoReviewFilter\(video, review\)/);
  assert.match(api, /reference-card-packets/);
  assert.match(api, /echoReferenceMiningStore\.currentRun\(\)/);
  assert.match(api, /forbiddenInputs/);
  assert.match(api, /wholeVideoPaletteForbidden/);
  assert.match(cli, /human-enricher-agent-queue/);
  assert.match(cli, /human-enricher-agent-submit/);
  assert.match(cli, /human-enricher-agent-decision/);
  assert.match(cli, /human-enricher-optical-campaign-plan/);
  assert.match(cli, /human-enricher-optical-campaign-claim/);
  assert.match(cli, /human-enricher-optical-campaign-telemetry/);
  assert.match(cli, /human-enricher-optical-campaign-progress/);
  assert.match(cli, /human-enricher-optical-campaign-complete/);
  assert.match(cli, /human-enricher-reference-queue/);
  assert.match(cli, /human-enricher-reference-submit/);
  assert.match(cli, /echo-reference-wide/);
  assert.match(cli, /echo-reference-exploratory/);
  assert.match(nodeManifest, /humanEnricherReferenceCards/);
  assert.match(nodeManifest, /humanEnricherReferenceReviews/);
  assert.match(nodeManifest, /humanEnricherOpticalCampaign/);
});
