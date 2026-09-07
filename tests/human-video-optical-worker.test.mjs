import assert from "node:assert/strict";
import test from "node:test";
import {
  createHumanVideoAgentReviewStore,
  decideHumanVideoAgentReview,
  upsertHumanVideoAgentReview,
} from "../src/domain/human-video-agent-review.js";
import { assertHumanVideoOpticalTextBoundary } from "../src/domain/human-video-optical-boundary.js";
import {
  createHumanVideoOpticalReviewFromClaim,
  createHumanVideoOpticalWorkerOutputContract,
  HUMAN_VIDEO_OPTICAL_DIRECT_RECEIPT_SCHEMA,
} from "../src/domain/human-video-optical-worker.js";

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
  frameDigest: "sha256:frames",
  frames,
  attempt: 1,
  lease: { workerId: "/root/terra-one", claimedAt: "2026-08-03T20:00:00.000Z" },
  schedulerTelemetry: { status: "captured", source: "codex-rollout", sessionId: "session-one" },
};

function rawWorkerResult() {
  return {
    description: "A centered figure moves from a dim blue interior through a brighter middle pose into a warm exterior close-up, with stable framing and a clear lighting transition.",
    palettes: {
      first: ["#102030", "#405060", "#8090A0"],
      middle: ["#182838", "#607080", "#C08040"],
      last: ["#203040", "#A0B0C0", "#D08040"],
    },
  };
}

test("minimal optical output becomes a hash-bound pending-human description and three palettes", () => {
  const input = createHumanVideoOpticalReviewFromClaim(job, rawWorkerResult(), {
    campaignId: "human-enricher-optical-minimal-v3",
    workerId: "/root/terra-one",
    model: "gpt-5.6-terra",
    reasoningEffort: "low",
    submittedAt: "2026-08-03T20:00:25.000Z",
  });
  const result = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), input, { now: "2026-08-03T20:00:25.000Z", schedulerAuthority: true });
  assert.equal(result.review.status, "pending-human");
  assert.equal(result.review.reviewer.reasoningEffort, "low");
  assert.deepEqual(result.review.evidence.frames.map((frame) => frame.sha256), frames.map((frame) => frame.sha256));
  assert.deepEqual(result.review.evidence.frames.map((frame) => frame.palette.colors.map((color) => color.hex)), [
    rawWorkerResult().palettes.first,
    rawWorkerResult().palettes.middle,
    rawWorkerResult().palettes.last,
  ]);
  assert.ok(result.review.evidence.frames.every((frame) => frame.observation === ""));
  assert.equal(result.review.proposal.description, rawWorkerResult().description);
  assert.equal(result.review.proposal.quality.value, 0);
  assert.deepEqual(result.review.proposal.referenceSignals, []);
});

test("minimal contract requires exactly First, Middle, and Last and only four semantic outputs", () => {
  const contract = createHumanVideoOpticalWorkerOutputContract(job);
  assert.equal(contract.schemaVersion, HUMAN_VIDEO_OPTICAL_DIRECT_RECEIPT_SCHEMA);
  assert.equal(contract.inspection.exactFrameCount, 3);
  assert.deepEqual(contract.requiredTopLevel, ["description", "palettes"]);
  assert.deepEqual(Object.keys(contract.outputShape.palettes), ["first", "middle", "last"]);
  assert.ok(contract.forbiddenOutput.includes("quality"));
  assert.ok(contract.forbiddenOutput.includes("references"));

  assert.throws(
    () => createHumanVideoOpticalReviewFromClaim({ ...job, frames: [...frames, { ...frames[2], role: "last", sha256: `sha256:${"d".repeat(64)}` }] }, rawWorkerResult()),
    (error) => error.code === "optical_worker_claim_frames_required",
  );
  const missingMiddle = rawWorkerResult();
  delete missingMiddle.palettes.middle;
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, missingMiddle), (error) => error.code === "optical_worker_palettes_required");
});

test("minimal output rejects every discarded semantic field", () => {
  const discarded = [
    ["quality", 4],
    ["signalOutcome", "observed"],
    ["referenceSignals", ["blue circle"]],
    ["strengths", ["clear"]],
    ["issues", ["soft"]],
    ["uncertainty", "three frames"],
    ["directorNotes", "hold"],
    ["references", [{ id: "card-one" }]],
    ["categories", ["portrait"]],
    ["tags", ["blue"]],
    ["reviewerAttestation", "inspected"],
  ];
  for (const [field, value] of discarded) {
    assert.throws(
      () => createHumanVideoOpticalReviewFromClaim(job, { ...rawWorkerResult(), [field]: value }),
      (error) => error.code === "optical_worker_output_field_forbidden",
      field,
    );
  }
});

test("each concise palette requires three to five distinct valid hex values", () => {
  const tooShort = rawWorkerResult();
  tooShort.palettes.first = ["#102030", "#405060"];
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, tooShort), (error) => error.code === "optical_worker_palette_count_invalid");

  const duplicate = rawWorkerResult();
  duplicate.palettes.middle = ["#182838", "#182838", "#C08040"];
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, duplicate), (error) => error.code === "optical_worker_palette_count_invalid");

  const invalid = rawWorkerResult();
  invalid.palettes.last = ["#203040", "blue", "#D08040"];
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, invalid), (error) => error.code === "optical_worker_palette_hex_invalid");
});

test("optional transport bindings remain claim-bound without entering the semantic shape", () => {
  const bound = { ...rawWorkerResult(), schemaVersion: HUMAN_VIDEO_OPTICAL_DIRECT_RECEIPT_SCHEMA, jobId: job.id, videoKey: job.videoKey, frameDigest: job.frameDigest };
  assert.doesNotThrow(() => createHumanVideoOpticalReviewFromClaim(job, bound));
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, { ...bound, frameDigest: "sha256:wrong" }), (error) => error.code === "optical_worker_receipt_binding_mismatch");
});

test("description boundary permits literal lettering but rejects invented Hapa relationships", () => {
  assert.doesNotThrow(() => assertHumanVideoOpticalTextBoundary({ description: "Visible lettering reads HAPA across the wall." }));
  const result = rawWorkerResult();
  result.description = "The blue rings visually echo the Echo State album concept and are clearly designed as a Hapa Card reference.";
  assert.throws(() => createHumanVideoOpticalReviewFromClaim(job, result), (error) => error.code === "optical_worker_knowledge_claim_forbidden");
});

test("a later minimal optical submission cannot overwrite a human-decided proposal", () => {
  const reviewInput = createHumanVideoOpticalReviewFromClaim(job, rawWorkerResult(), { workerId: "/root/terra-one", model: "gpt-5.6-terra", reasoningEffort: "low" });
  const submitted = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), reviewInput, { now: "2026-08-03T20:00:25.000Z" });
  const decided = decideHumanVideoAgentReview(submitted.store, submitted.review.id, { action: "accepted" }, { now: "2026-08-03T20:01:00.000Z", actorId: "human" });
  assert.throws(() => upsertHumanVideoAgentReview(decided.store, { ...reviewInput, expectedRevision: decided.review.revision }, { now: "2026-08-03T20:02:00.000Z" }), (error) => error.code === "agent_review_human_decision_final");
});
