import assert from "node:assert/strict";
import test from "node:test";
import {
  createHumanVideoAgentReviewStore,
  decideHumanVideoAgentReview,
  upsertHumanVideoAgentReview,
} from "../src/domain/human-video-agent-review.js";
import { assertHumanVideoOpticalTextBoundary } from "../src/domain/human-video-optical-boundary.js";
import { createHumanVideoOpticalReviewFromClaim } from "../src/domain/human-video-optical-worker.js";

const frames = ["a", "b", "c"].map((letter, index) => ({
  ordinal: index + 1,
  role: index === 0 ? "first" : index === 2 ? "last" : "mid",
  timestampSeconds: index * 2.5,
  normalizedPosition: index / 2,
  imagePath: `/tmp/${letter}.jpg`,
  imageUri: `/media/${letter}.jpg`,
  sha256: `sha256:${letter.repeat(64)}`,
}));

const job = {
  id: "optical:job-one",
  videoKey: "fingerprint:video-one",
  videoId: "video-one",
  videoName: "Video One",
  frameDigest: "fnv1a:frames",
  frames,
  attempt: 1,
  lease: { workerId: "/root/terra-one", claimedAt: "2026-08-03T20:00:00.000Z" },
  schedulerTelemetry: { status: "captured", source: "codex-rollout", sessionId: "session-one" },
};

function rawWorkerResult() {
  const palette = {
    colors: [
      { hex: "#102030", label: "deep blue-gray", prevalence: "dominant", explanation: "Large dark background regions." },
      { hex: "#A0B0C0", label: "pale steel", prevalence: "supporting", explanation: "Light subject surfaces." },
      { hex: "#D08040", label: "warm orange", prevalence: "accent", explanation: "Small warm highlights." },
    ],
    uncertainty: "Visual estimates, not colorimetric measurements.",
  };
  return {
    perFrame: frames.map((frame) => ({
      label: frame.role,
      literalObservation: `${frame.role} literal observation authored after direct optical inspection.`,
      dominantPalette: palette,
    })),
    overallDescription: "A visually coherent three-frame optical sequence.",
    quality: { score: 4, explanation: "Strong composition with a usable transition." },
    categories: ["optical-test"],
    tags: ["three-frame"],
    observedSignals: ["circular blue marking"],
    directorNotes: "Hold the last composition.",
    strengths: ["clear subject"],
    issues: ["soft midpoint"],
    uncertainty: "Audio was not reviewed.",
    reviewerAttestation: "I personally opened and inspected all three claimed images.",
  };
}

test("claimed worker output is normalized into hash-bound pending-human optical evidence", () => {
  const input = createHumanVideoOpticalReviewFromClaim(job, rawWorkerResult(), {
    campaignId: "campaign-one",
    workerId: "/root/terra-one",
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    submittedAt: "2026-08-03T20:00:25.000Z",
    telemetryStatus: "captured",
    telemetrySource: "codex-rollout",
    sessionId: "session-one",
  });
  const result = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), input, { now: "2026-08-03T20:00:25.000Z", schedulerAuthority: true });
  assert.equal(result.review.status, "pending-human");
  assert.deepEqual(result.review.evidence.frames.map((frame) => frame.sha256), frames.map((frame) => frame.sha256));
  assert.equal(result.review.evidence.frames[0].palette.colors[0].hex, "#102030");
  assert.equal(result.review.proposal.quality.value, 4);
  assert.deepEqual(result.review.proposal.referenceSignals, ["circular blue marking"]);
  assert.equal(result.review.reviewer.schedulerReceipt.jobId, job.id);
  assert.equal(result.review.reviewer.schedulerReceipt.sessionId, "session-one");
  assert.ok(result.review.reviewer.fieldNormalization.includes("quality.value"));
});

test("vision-only normalization rejects whole-video palettes and relationship/reference output", () => {
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, { ...rawWorkerResult(), palette: ["#000000"] }), (error) => error.code === "optical_worker_whole_video_palette_forbidden");
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, { ...rawWorkerResult(), references: [{ id: "song-one" }] }), (error) => error.code === "optical_worker_reference_fields_forbidden");
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, { ...rawWorkerResult(), visualReferenceAnalysis: { matches: [{ id: "card-one" }] } }), (error) => error.code === "optical_worker_reference_fields_forbidden");
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, { ...rawWorkerResult(), cards: [{ id: "card-one" }] }), (error) => error.code === "optical_worker_output_field_forbidden");
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, { ...rawWorkerResult(), referenceSignals: ["Hapa Card X is a match."] }), (error) => error.code === "optical_worker_knowledge_claim_forbidden");
  const bareHex = rawWorkerResult();
  bareHex.perFrame[0].dominantPalette = ["#102030", "#A0B0C0", "#D08040"];
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, bareHex), (error) => error.code === "optical_worker_palette_object_required");
  const duplicateRole = rawWorkerResult();
  duplicateRole.perFrame[2].label = "mid";
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, duplicateRole), (error) => error.code === "optical_worker_frame_mapping_invalid");
});

test("vision-only text boundary permits literal visible Hapa and Echo State lettering", () => {
  assert.doesNotThrow(() => assertHumanVideoOpticalTextBoundary({
    observations: [
      "Visible lettering reads HAPA across the wall.",
      "The shirt displays the literal words ECHO STATE in white capitals.",
      "A poster visibly says Hapa Card, with the word Card below.",
      "Blue arcs visually echo each other between the first and last frames.",
    ],
  }));
});

test("vision-only text boundary rejects common semantic relationship and reference claims", () => {
  const claims = [
    "This appears to be an intended reference to Hapa.",
    "The rings visually echo the Echo State album concept.",
    "This frame matches the Hapa scene Blue Null.",
    "The image has a relationship to Echo State.",
    "Echo State is connected to this costume design.",
    "The composition is meant to symbolize an existing Card.",
  ];
  claims.forEach((claim) => {
    assert.throws(
      () => assertHumanVideoOpticalTextBoundary({ claim }),
      (error) => error.code === "optical_worker_knowledge_claim_forbidden",
      claim,
    );
  });
});

test("partial or contradictory frame mapping metadata cannot fall back to position", () => {
  const partialRoles = rawWorkerResult();
  partialRoles.perFrame = [
    { ...partialRoles.perFrame[1], label: "mid", literalObservation: "ACTUAL MID" },
    { ...partialRoles.perFrame[2], label: "unknown", literalObservation: "ACTUAL LAST" },
    { ...partialRoles.perFrame[0], label: "first", literalObservation: "ACTUAL FIRST" },
  ];
  assert.throws(
    () => createHumanVideoOpticalReviewFromClaim(job, partialRoles, { workerId: "/root/terra-one", model: "gpt-5.6-terra", reasoningEffort: "medium" }),
    (error) => error.code === "optical_worker_frame_mapping_invalid",
  );

  const incompleteOrdinals = rawWorkerResult();
  incompleteOrdinals.perFrame = incompleteOrdinals.perFrame.map((frame, index) => {
    const { label, ...withoutRole } = frame;
    return { ...withoutRole, ordinal: index === 2 ? "" : index + 1 };
  });
  assert.throws(
    () => createHumanVideoOpticalReviewFromClaim(job, incompleteOrdinals, { workerId: "/root/terra-one", model: "gpt-5.6-terra", reasoningEffort: "medium" }),
    (error) => error.code === "optical_worker_frame_mapping_invalid",
  );

  const contradictoryMappings = rawWorkerResult();
  contradictoryMappings.perFrame = contradictoryMappings.perFrame.map((frame, index) => ({ ...frame, ordinal: ((index + 1) % 3) + 1 }));
  assert.throws(
    () => createHumanVideoOpticalReviewFromClaim(job, contradictoryMappings, { workerId: "/root/terra-one", model: "gpt-5.6-terra", reasoningEffort: "medium" }),
    (error) => error.code === "optical_worker_frame_mapping_invalid",
  );
});

test("a later optical submission cannot silently overwrite a human-decided proposal", () => {
  const reviewInput = createHumanVideoOpticalReviewFromClaim(job, rawWorkerResult(), { workerId: "/root/terra-one", model: "gpt-5.6-terra", reasoningEffort: "medium" });
  const submitted = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), reviewInput, { now: "2026-08-03T20:00:25.000Z" });
  const decided = decideHumanVideoAgentReview(submitted.store, submitted.review.id, { action: "accepted" }, { now: "2026-08-03T20:01:00.000Z", actorId: "human" });
  assert.throws(() => upsertHumanVideoAgentReview(decided.store, { ...reviewInput, expectedRevision: decided.review.revision, allowHumanDecisionSupersede: true }, { now: "2026-08-03T20:02:00.000Z" }), (error) => error.code === "agent_review_human_decision_final");
});
