import assert from "node:assert/strict";
import test from "node:test";
import {
  AVATAR_LIKENESS_CAST_SCHEMA,
  AVATAR_LIKENESS_VARIANT_ID,
  LIKENESS_EVIDENCE_BASIS,
  LIKENESS_DECISION_ORIGIN,
  LIKENESS_CAST_AUTHORITY,
  LIKENESS_SEED_BASIS,
  buildAvatarLikenessDecisionIndex,
  avatarLikenessDecisionForVideo,
  selectLikenessSeedAssets,
  buildAvatarLikenessCast,
  attachAvatarLikenessCast,
  injectAvatarLikenessCastIntoVariant,
  auditAvatarLikenessVariant,
  summarizeAvatarLikenessCast,
  safeMediaShotMask,
} from "../src/domain/avatar-likeness-director-cast.js";
import { createHumanVideoLikenessDecisionsStore, upsertHumanVideoLikenessDecision } from "../src/domain/human-video-likeness-decisions.js";

const HEX_1 = "1".repeat(64);
const HEX_2 = "2".repeat(64);

function likenessDecision(videoId, state, options = {}) {
  const store = createHumanVideoLikenessDecisionsStore({ decisions: [] });
  const result = upsertHumanVideoLikenessDecision(store, {
    videoKey: `fingerprint:${HEX_1}`,
    videoId,
    videoName: `${videoId}.mp4`,
    aliases: [`uri:/media/${videoId}.mp4`],
    state,
    decisionAvatarId: options.avatarId || "avatar-1",
    decisionAvatarName: options.avatarName || "Mara",
    receipt: {
      runId: "avatar-likeness-match-test",
      verdict: state === "accepted" ? "assigned" : "unresolved",
      reasons: state === "accepted" ? [] : ["too_close"],
      gate: { assignedScore: 0.71, assignedMargin: 0.21, secondaryScore: 0.5 },
      weights: { palette: 0.45, dHash: 0.25, text: 0.2, colorWords: 0.1 },
      contentFingerprint: HEX_1,
      staleSignature: false,
      primary: { avatarId: options.avatarId || "avatar-1", name: options.avatarName || "Mara", score: 0.71, channels: { palette: 0.8, dHash: 0.7, text: 0.4, colorWords: 0.3 }, active: ["palette"] },
      secondary: { avatarId: "avatar-2", name: "Blue", score: 0.5, channels: { palette: 0.6, dHash: 0.5, text: 0.4, colorWords: 0.3 }, active: ["palette"] },
      candidates: [
        { avatarId: options.avatarId || "avatar-1", name: options.avatarName || "Mara", score: 0.71, channels: { palette: 0.8, dHash: 0.7, text: 0.4, colorWords: 0.3 }, active: ["palette"] },
        { avatarId: "avatar-2", name: "Blue", score: 0.5, channels: { palette: 0.6, dHash: 0.5, text: 0.4, colorWords: 0.3 }, active: ["palette"] },
      ],
      excludedProfileless: 1,
      matchedAt: "2026-08-24T00:00:00.000Z",
    },
    actorId: "calder",
  }, { now: "2026-08-25T00:00:00.000Z" });
  return result.decision;
}

const profile = {
  avatarId: "avatar-1",
  name: "Mara",
  status: "profiled",
  sourceAssets: [
    { assetId: "avatar-asset-1", kind: "video", fileName: "mara-1.mp4", weight: 1, status: "signed" },
    { assetId: "avatar-asset-2", kind: "video", fileName: "mara-2.mp4", weight: 1, status: "signed" },
    { assetId: "avatar-asset-3", kind: "video", fileName: "mara-3.mp4", weight: 1, status: "signed" },
    { assetId: "avatar-asset-4", kind: "video", fileName: "mara-4.mp4", weight: 1, status: "signed" },
    { assetId: "avatar-asset-ctx", kind: "image", fileName: "dossier.jpg", weight: 0.5, status: "signed" },
  ],
};

const mediaLibrary = [
  { id: "avatar-asset-1", uri: "/media/mara-1.mp4", sourcePath: "/tmp/mara-1.mp4", contentFingerprint: "a".repeat(64), mediaType: "video" },
  { id: "avatar-asset-2", uri: "/media/mara-2.mp4", sourcePath: "/tmp/mara-2.mp4", contentFingerprint: "b".repeat(64), mediaType: "video" },
  { id: "avatar-asset-3", uri: "/media/mara-3.mp4", sourcePath: "/tmp/mara-3.mp4", contentFingerprint: "c".repeat(64), mediaType: "video" },
];

test("safeMediaShotMask caps single-candidate pools at one media shot", () => {
  const timeline = [{ start_sec: 0, end_sec: 2 }, { start_sec: 2, end_sec: 4 }, { start_sec: 4, end_sec: 6 }, { start_sec: 6, end_sec: 8 }];
  assert.deepEqual(safeMediaShotMask([0, 1, 2, 3], timeline, 1), [0]);
  assert.deepEqual(safeMediaShotMask([1, 2, 3], timeline, 1), [1]);
  assert.deepEqual(safeMediaShotMask([0, 1], timeline, 1), [0]);
  assert.deepEqual(safeMediaShotMask([0, 1, 2, 3], timeline, 5), [0, 1, 2, 3]);
  assert.deepEqual(safeMediaShotMask([0, 1, 2, 3], timeline, 2), [0, 1, 2, 3]);
  assert.deepEqual(safeMediaShotMask([9, -1, "x", 2], timeline, 1), [2]);
  assert.deepEqual(safeMediaShotMask([], timeline, 1), []);
});

test("source contract carries the guardrail and the typed evidence basis", async () => {
  const { readFile } = await import("node:fs/promises");
  const source = await readFile(new URL("../src/domain/avatar-likeness-director-cast.js", import.meta.url), "utf8");
  assert.match(source, /Acceptance is the boundary; likeness is the placement\./);
  assert.equal(LIKENESS_EVIDENCE_BASIS, "likeness-accepted-v1");
  assert.equal(LIKENESS_DECISION_ORIGIN, "avatar-likeness");
  assert.equal(LIKENESS_CAST_AUTHORITY, "human-likeness-acceptance-only");
  assert.equal(AVATAR_LIKENESS_VARIANT_ID, "avatar-likeness-v1");
  assert.equal(AVATAR_LIKENESS_CAST_SCHEMA, "hapa.echo.avatar-likeness-cast.v1");
});

test("decision index admits only accepted likeness receipts", () => {
  const accepted = likenessDecision("folder-video-1", "accepted");
  const rejected = likenessDecision("folder-video-2", "rejected");
  const foreignOrigin = { ...accepted, id: "foreign", videoKey: "fingerprint:333", origin: "some-other-system" };
  const index = buildAvatarLikenessDecisionIndex([accepted, rejected, foreignOrigin]);
  assert.equal(index.size > 0, true);
  const hit = avatarLikenessDecisionForVideo(index, { humanVideoKey: `fingerprint:${HEX_1}` });
  assert.equal(hit?.id, accepted.id);
  assert.equal(avatarLikenessDecisionForVideo(index, { id: "folder-video-2" }), null);
  assert.equal(avatarLikenessDecisionForVideo(index, { id: "folder-video-3" }), null);
  assert.equal(avatarLikenessDecisionForVideo(new Map(), { id: "folder-video-1" }), null);
});

test("lookup resolves by uri, fingerprint hex, and id aliases", () => {
  const accepted = likenessDecision("folder-video-1", "accepted");
  const index = buildAvatarLikenessDecisionIndex([accepted]);
  assert.equal(avatarLikenessDecisionForVideo(index, { uri: `/media/folder-video-1.mp4` })?.id, accepted.id);
  assert.equal(avatarLikenessDecisionForVideo(index, { contentFingerprint: `sha256:${HEX_1}` })?.id, accepted.id);
  assert.equal(avatarLikenessDecisionForVideo(index, { id: "folder-video-1" })?.id, accepted.id);
  assert.equal(avatarLikenessDecisionForVideo(index, { contentFingerprint: "f".repeat(64) }), null);
});

test("seed selection takes identity-class signed assets, capped and resolved", () => {
  const seeds = selectLikenessSeedAssets(profile, mediaLibrary, { avatarId: "avatar-1", max: 3 });
  assert.deepEqual(seeds.map((seed) => seed.assetId), ["avatar-asset-1", "avatar-asset-2", "avatar-asset-3"]);
  assert.equal(seeds[0].resolved, true);
  assert.equal(seeds[0].avatarId, "avatar-1");
  assert.equal(seeds[0].contentHash, "a".repeat(64));
  assert.equal(seeds[0].retrievalHandle, "/tmp/mara-1.mp4");
  const all = selectLikenessSeedAssets(profile, null, { avatarId: "avatar-1", max: 8 });
  assert.equal(all.length, 4);
  assert.ok(!all.some((seed) => seed.assetId === "avatar-asset-ctx"), "context-class assets are excluded");
  assert.ok(all.every((seed) => seed.resolved === false), "unresolvable seeds are flagged, not dropped");
});

test("buildAvatarLikenessCast produces a typed cast with bounded receipt", () => {
  const decision = likenessDecision("folder-video-1", "accepted");
  const { cast, reason } = buildAvatarLikenessCast({
    decision,
    avatars: { "avatar-1": { id: "avatar-1", name: "Mara" } },
    profiles: { "avatar-1": profile },
    mediaLibrary: mediaLibrary,
  });
  assert.equal(reason, "ok");
  assert.equal(cast.schemaVersion, AVATAR_LIKENESS_CAST_SCHEMA);
  assert.equal(cast.evidenceBasis, LIKENESS_EVIDENCE_BASIS);
  assert.equal(cast.cast.avatarId, "avatar-1");
  assert.equal(cast.cast.avatarName, "Mara");
  assert.equal(cast.cast.castClass, "additional");
  assert.equal(cast.cast.profiled, true);
  assert.equal(cast.decision.state, "accepted");
  assert.equal(cast.decision.origin, LIKENESS_DECISION_ORIGIN);
  assert.equal(cast.decision.revision, 1);
  assert.equal(cast.decision.actorId, "calder");
  assert.equal(cast.scoreReceipt.verdict, "assigned");
  assert.equal(cast.scoreReceipt.score, 0.71);
  assert.equal(cast.scoreReceipt.gate.assignedMargin, 0.21);
  assert.equal(cast.seedBasis, LIKENESS_SEED_BASIS);
  assert.equal(cast.castAppearances.length, 3);
  for (const appearance of cast.castAppearances) {
    assert.equal(appearance.evidenceBasis, LIKENESS_EVIDENCE_BASIS);
    assert.equal(appearance.avatarId, "avatar-1");
    assert.equal(appearance.presence, "on_screen");
  }
});

test("cast refuses rejections, foreign origins, and unresolvable Avatars honestly", () => {
  const rejected = likenessDecision("folder-video-2", "rejected");
  assert.equal(buildAvatarLikenessCast({ decision: rejected, avatars: { "avatar-1": {} } }).reason, "decision-state-rejected");
  const foreign = { ...likenessDecision("folder-video-1", "accepted"), origin: "some-other-system" };
  assert.match(buildAvatarLikenessCast({ decision: foreign }).reason, /decision-origin-not/);
  const noAvatar = { ...likenessDecision("folder-video-1", "accepted"), decisionAvatarId: "", decisionAvatarName: "" };
  assert.equal(buildAvatarLikenessCast({ decision: noAvatar }).reason, "decision-has-no-avatar");
  const orphan = { ...likenessDecision("folder-video-1", "accepted"), decisionAvatarId: "avatar-99", decisionAvatarName: "" };
  assert.equal(buildAvatarLikenessCast({ decision: orphan, avatars: {} }).reason, "avatar-unresolvable:avatar-99");
  const nameOnly = { ...likenessDecision("folder-video-1", "accepted"), decisionAvatarId: "avatar-99" };
  const nameOnlyResult = buildAvatarLikenessCast({ decision: nameOnly, avatars: {} });
  assert.equal(nameOnlyResult.reason, "ok");
  assert.equal(nameOnlyResult.cast.cast.avatarName, "Mara");
  assert.equal(nameOnlyResult.cast.seedBasis, "no-avatar-profile");
  assert.equal(nameOnlyResult.cast.seedAssets.length, 0);
  assert.equal(buildAvatarLikenessCast({}).reason, "no-accepted-likeness-decision");
});

function directorCandidate(videoId) {
  const hex = videoId.endsWith("2") ? HEX_2 : HEX_1;
  return {
    id: `human-accepted:${videoId}`,
    mediaLibraryId: videoId,
    cardId: "avatar-1",
    cardKind: "avatar",
    cardTitle: "Mara",
    title: `${videoId}.mp4`,
    uri: `/media/${videoId}.mp4`,
    sourcePath: `/tmp/${videoId}.mp4`,
    sha256: hex,
    technicalIdentity: `fingerprint:${hex}`,
    sourceGroup: "human-accepted",
    humanAcceptedIdentity: {
      videoKey: `fingerprint:${hex}`,
      aliases: [`fingerprint:${hex}`, `uri:/media/${videoId}.mp4`],
      decisionState: "accepted",
    },
  };
}

test("attach casts only candidates whose media an accepted decision covers", () => {
  const decision = likenessDecision("folder-video-1", "accepted");
  const candidates = attachAvatarLikenessCast(
    [directorCandidate("folder-video-1"), directorCandidate("folder-video-2")],
    {
      decisions: [decision],
      avatars: { "avatar-1": { id: "avatar-1", name: "Mara" } },
      profiles: { "avatar-1": profile },
      mediaLibrary: mediaLibrary,
    },
  );
  assert.equal(candidates[0].avatarLikeness?.cast.avatarName, "Mara");
  assert.equal(candidates[1].avatarLikeness, undefined);
  assert.equal(candidates[1].avatarLikenessGap, undefined);
  assert.equal(summarizeAvatarLikenessCast(candidates).withTypedCast, 1);
});

function variantFixture(candidates) {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  return {
    id: "avatar-likeness-v1:test",
    timeline: [
      { start_sec: 0, end_sec: 2, media_id: "byId-missing", media_uri: "/media/none.mp4", media_card_id: "avatar-1", decision_evidence: { candidateId: "not-in-pool" } },
      { start_sec: 2, end_sec: 4, media_id: byId.get("human-accepted:folder-video-1")?.id, media_uri: "/media/legacy.mp4", media_card_id: "avatar-1", decision_evidence: { candidateId: "human-accepted:folder-video-1" } },
    ],
    selectionEvidence: [],
  };
}

test("injection types matching shots, labels them, and leaves the rest untouched", () => {
  const decision = likenessDecision("folder-video-1", "accepted");
  const candidates = attachAvatarLikenessCast(
    [directorCandidate("folder-video-1"), directorCandidate("folder-video-2")],
    { decisions: [decision], avatars: { "avatar-1": { id: "avatar-1", name: "Mara" } }, profiles: { "avatar-1": profile }, mediaLibrary: mediaLibrary },
  );
  const variant = injectAvatarLikenessCastIntoVariant(variantFixture(candidates), candidates);
  const [firstShot, secondShot] = variant.timeline;
  assert.equal(firstShot.decision_evidence.avatarLikeness, undefined, "untyped shot keeps no cast");
  assert.equal(firstShot.media_cast_label, undefined);
  assert.equal(secondShot.decision_evidence.avatarLikeness?.cast.avatarName, "Mara");
  assert.equal(secondShot.media_cast_label, "Avatar Card | Mara");
  assert.equal(variant.avatarLikenessCast.mediaShots, 2);
  assert.equal(variant.avatarLikenessCast.typedShots, 1);
  assert.equal(variant.avatarLikenessCast.untypedMediaShots, 1);
  assert.deepEqual(variant.avatarLikenessCast.byAvatar, { "avatar-1": 1 });
});

test("audit passes when every typed shot resolves to the accepted receipt", () => {
  const decision = likenessDecision("folder-video-1", "accepted");
  const candidates = attachAvatarLikenessCast(
    [directorCandidate("folder-video-1"), directorCandidate("folder-video-2")],
    { decisions: [decision], avatars: { "avatar-1": { id: "avatar-1", name: "Mara" } }, profiles: { "avatar-1": profile }, mediaLibrary: mediaLibrary },
  );
  const variant = injectAvatarLikenessCastIntoVariant(variantFixture(candidates), candidates);
  const audit = auditAvatarLikenessVariant(variant, { decisions: [decision] });
  assert.equal(audit.ok, true);
  assert.deepEqual(audit.failures, []);
  assert.equal(audit.typedShots, 1);
  assert.equal(audit.untypedMediaShots, 1);
  assert.equal(audit.evidenceBasis, LIKENESS_EVIDENCE_BASIS);
  assert.match(audit.guardrail, /Acceptance is the boundary/);
});

test("audit fails closed on forged or stale typed casts", () => {
  const decision = likenessDecision("folder-video-1", "accepted");
  const candidates = attachAvatarLikenessCast(
    [directorCandidate("folder-video-1")],
    { decisions: [decision], avatars: { "avatar-1": { id: "avatar-1", name: "Mara" } }, profiles: { "avatar-1": profile }, mediaLibrary: mediaLibrary },
  );
  let variant = injectAvatarLikenessCastIntoVariant(variantFixture(candidates), candidates);

  const missingReceipt = {
    ...variant,
    timeline: variant.timeline.map((shot) => ({
      ...shot,
      decision_evidence: shot.decision_evidence?.avatarLikeness
        ? { ...shot.decision_evidence, avatarLikeness: { ...shot.decision_evidence.avatarLikeness, decision: { ...shot.decision_evidence.avatarLikeness.decision, id: "forged-decision-id" } } }
        : shot.decision_evidence,
    })),
  };
  const forged = auditAvatarLikenessVariant(missingReceipt, { decisions: [decision] });
  assert.equal(forged.ok, false);
  assert.match(forged.failures.join(" "), /no durable decision receipt/);

  const staleRevision = {
    ...variant,
    timeline: variant.timeline.map((shot) => ({
      ...shot,
      decision_evidence: shot.decision_evidence?.avatarLikeness
        ? { ...shot.decision_evidence, avatarLikeness: { ...shot.decision_evidence.avatarLikeness, decision: { ...shot.decision_evidence.avatarLikeness.decision, revision: 9 } } }
        : shot.decision_evidence,
    })),
  };
  assert.equal(auditAvatarLikenessVariant(staleRevision, { decisions: [decision] }).ok, false);

  const wrongAvatar = {
    ...variant,
    timeline: variant.timeline.map((shot) => ({
      ...shot,
      decision_evidence: shot.decision_evidence?.avatarLikeness
        ? {
            ...shot.decision_evidence,
            avatarLikeness: {
              ...shot.decision_evidence.avatarLikeness,
              castAppearances: shot.decision_evidence.avatarLikeness.castAppearances.map((appearance) => ({ ...appearance, avatarId: "avatar-evil" })),
            },
          }
        : shot.decision_evidence,
    })),
  };
  assert.equal(auditAvatarLikenessVariant(wrongAvatar, { decisions: [decision] }).ok, false);

  const visualizerWithCast = {
    ...variant,
    timeline: [
      { start_sec: 0, end_sec: 2, media_id: "none", decision_evidence: { avatarLikeness: variant.timeline[0].decision_evidence.avatarLikeness || {} } },
      ...variant.timeline.slice(1),
    ],
  };
  assert.equal(auditAvatarLikenessVariant(visualizerWithCast, { decisions: [decision] }).ok, false);
});
