import assert from "node:assert/strict";
import test from "node:test";
import {
  createHumanVideoAgentReviewStore,
  decideHumanVideoAgentReview,
  HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA,
  normalizeHumanVideoAgentReview,
  normalizeHumanVideoAgentReviewStore,
  upsertHumanVideoAgentReview,
} from "../src/domain/human-video-agent-review.js";
import {
  createHumanVideoOpticalCampaignStore,
  enqueueHumanVideoOpticalCampaignJob,
  HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE_SCHEMA,
  normalizeHumanVideoOpticalCampaignJob,
  normalizeHumanVideoOpticalCampaignStore,
} from "../src/domain/human-video-optical-campaign.js";

const frameHashes = ["a", "b", "c"].map((letter) => `sha256:${letter.repeat(64)}`);

function opticalReview(overrides = {}) {
  return {
    videoKey: "fingerprint:review-one",
    videoId: "review-one",
    videoName: "Review One",
    reviewer: {
      agentId: "terra-one",
      model: "gpt-5.6-terra",
      reasoningEffort: "medium",
      opticalInspectionConfirmed: true,
      attestation: "I inspected First, Mid, and Last directly.",
    },
    evidence: {
      frames: frameHashes.map((sha256, index) => ({
        imagePath: `/tmp/review-${index}.jpg`,
        timestampSeconds: index,
        normalizedPosition: index / 2,
        sha256,
        observation: `A literal observation for frame ${index + 1}.`,
        palette: {
          colors: [
            { hex: "#123ABC", label: "blue", prevalence: "dominant", explanation: "Blue fills the frame." },
            { hex: "#D4A63A", label: "gold", prevalence: "supporting", explanation: "Gold supports the frame." },
            { hex: "#101820", label: "navy", prevalence: "accent", explanation: "Navy accents the frame." },
          ],
          uncertainty: "Hex values are visually estimated.",
        },
      })),
    },
    proposal: {
      description: "A figure crosses a blue room.",
      quality: { value: 4, explanation: "The subject and composition remain legible." },
      categories: ["character"],
      tags: ["blue"],
      referenceSignals: ["blue room"],
    },
    ...overrides,
  };
}

const campaignFrames = frameHashes.map((sha256, index) => ({
  imagePath: `/tmp/campaign-${index}.jpg`,
  timestampSeconds: index,
  normalizedPosition: index / 2,
  sha256,
}));

test("optical stores fail closed on malformed collection shapes", () => {
  assert.throws(
    () => normalizeHumanVideoAgentReviewStore({ schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA, reviews: {} }),
    (error) => error.code === "agent_review_store_reviews_invalid",
  );
  assert.throws(
    () => normalizeHumanVideoOpticalCampaignStore({ schemaVersion: HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE_SCHEMA, jobs: "not-an-array" }),
    (error) => error.code === "optical_campaign_store_jobs_invalid",
  );
  assert.throws(() => normalizeHumanVideoAgentReviewStore([]), (error) => error.code === "agent_review_store_root_invalid");
  assert.throws(() => normalizeHumanVideoOpticalCampaignStore({ unrelated: true }), (error) => error.code === "optical_campaign_store_schema_invalid");
  assert.throws(
    () => normalizeHumanVideoAgentReviewStore({ schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA }),
    (error) => error.code === "agent_review_store_reviews_missing",
  );
  assert.throws(
    () => normalizeHumanVideoOpticalCampaignStore({ schemaVersion: HUMAN_VIDEO_OPTICAL_CAMPAIGN_STORE_SCHEMA }),
    (error) => error.code === "optical_campaign_store_jobs_missing",
  );
});

test("unknown statuses and malformed lease timestamps fail closed", () => {
  assert.throws(() => normalizeHumanVideoAgentReview({ ...opticalReview(), status: "agent-approved" }), (error) => error.code === "agent_review_status_invalid");
  assert.throws(() => normalizeHumanVideoOpticalCampaignJob({
    videoKey: "fingerprint:invalid-status",
    frames: campaignFrames,
    status: "running",
  }), (error) => error.code === "optical_campaign_job_status_invalid");
  assert.throws(() => normalizeHumanVideoOpticalCampaignJob({
    videoKey: "fingerprint:invalid-lease",
    frames: campaignFrames,
    status: "claimed",
    attempt: 1,
    lease: { workerId: "terra", leaseId: "lease", claimedAt: "not-a-date", expiresAt: "also-not-a-date" },
  }), (error) => error.code === "optical_campaign_lease_timestamps_invalid");
});

test("review-store normalization rejects duplicate video identities", () => {
  const first = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), opticalReview(), {
    now: "2026-08-03T20:00:00.000Z",
  }).review;
  assert.throws(
    () => normalizeHumanVideoAgentReviewStore({ schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA, reviews: [first, { ...first, id: `${first.id}:duplicate`, revision: 2 }] }),
    (error) => error.code === "agent_review_store_duplicate_video_identity" && error.details.videoKey === first.videoKey,
  );
  const { status, ...missingStatus } = first;
  assert.throws(
    () => normalizeHumanVideoAgentReviewStore({ schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA, reviews: [missingStatus] }),
    (error) => error.code === "agent_review_store_entry_invalid" && error.details.cause === "agent_review_status_missing",
  );
  assert.throws(
    () => normalizeHumanVideoAgentReviewStore({ schemaVersion: HUMAN_VIDEO_AGENT_REVIEW_STORE_SCHEMA, reviews: [{ ...first, schemaVersion: "unknown.review.v9" }] }),
    (error) => error.code === "agent_review_store_entry_invalid" && error.details.cause === "agent_review_schema_invalid",
  );
});

test("campaign-store normalization rejects duplicate job ids and video keys", () => {
  let store = createHumanVideoOpticalCampaignStore();
  ({ store } = enqueueHumanVideoOpticalCampaignJob(store, {
    videoKey: "fingerprint:campaign-one",
    videoId: "campaign-one",
    videoName: "Campaign One",
    frames: campaignFrames,
  }, { now: "2026-08-03T20:00:00.000Z" }));
  const first = store.jobs[0];
  assert.throws(
    () => normalizeHumanVideoOpticalCampaignStore({ ...store, jobs: [first, { ...first, videoKey: "fingerprint:campaign-two" }] }),
    (error) => error.code === "optical_campaign_store_duplicate_job_id" && error.details.jobId === first.id,
  );
  assert.throws(
    () => normalizeHumanVideoOpticalCampaignStore({ ...store, jobs: [first, { ...first, id: `${first.id}:duplicate` }] }),
    (error) => error.code === "optical_campaign_store_duplicate_video_key" && error.details.videoKey === first.videoKey,
  );
  const { status, ...missingStatus } = first;
  assert.throws(
    () => normalizeHumanVideoOpticalCampaignStore({ ...store, jobs: [missingStatus] }),
    (error) => error.code === "optical_campaign_store_entry_invalid" && error.details.cause === "optical_campaign_job_status_missing",
  );
  assert.throws(
    () => normalizeHumanVideoOpticalCampaignStore({ ...store, jobs: [{ ...first, schemaVersion: "unknown.campaign-job.v9" }] }),
    (error) => error.code === "optical_campaign_store_entry_invalid" && error.details.cause === "optical_campaign_job_schema_invalid",
  );
});

test("ordinary agents cannot revise a campaign-managed proposal while humans can decide it", () => {
  const campaignManaged = upsertHumanVideoAgentReview(createHumanVideoAgentReviewStore(), {
    ...opticalReview(),
    reviewer: {
      ...opticalReview().reviewer,
      schedulerReceipt: {
        campaignId: "campaign:test",
        jobId: "optical:test-job",
        attempt: 1,
        frameDigest: `sha256:${"d".repeat(64)}`,
      },
    },
  }, {
    now: "2026-08-03T20:00:00.000Z",
    schedulerAuthority: true,
  });
  assert.throws(
    () => upsertHumanVideoAgentReview(campaignManaged.store, {
      ...opticalReview(),
      expectedRevision: 1,
      proposal: { ...opticalReview().proposal, description: "An ordinary agent tried to replace campaign output." },
    }, { now: "2026-08-03T20:01:00.000Z" }),
    (error) => error.code === "agent_review_campaign_managed" && error.details.campaignJobId === "optical:test-job",
  );
  const decided = decideHumanVideoAgentReview(campaignManaged.store, campaignManaged.review.id, { action: "accepted" }, {
    now: "2026-08-03T20:02:00.000Z",
    actorId: "human",
  });
  assert.equal(decided.review.status, "accepted");
  assert.equal(decided.review.humanDecision.actorId, "human");
});
