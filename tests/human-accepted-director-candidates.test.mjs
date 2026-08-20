import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBalancedDirectorCandidates,
  recastBalancedEchoDirectorProject,
} from "../src/domain/echo-media-recast.js";
import {
  buildHumanAcceptedDirectorCandidates,
  summarizeHumanAcceptedDirectorCandidates,
} from "../src/domain/human-accepted-director-candidates.js";

const video = (id, state, extra = {}) => ({
  id,
  name: `${id}.mp4`,
  mediaType: "video",
  uri: `/media/${id}.mp4`,
  humanVideoKey: `fingerprint:${id.padEnd(64, "a")}`,
  humanVideoAliases: [`uri:/media/${id}.mp4`],
  quickSortDecision: state ? { id: `${id}:decision`, state, actorId: "calder", revision: 1 } : null,
  relationships: [{ ownerType: "scene", ownerId: "scene-1", ownerName: "Scene One" }],
  width: 1920,
  height: 1080,
  duration: 4,
  ...extra,
});

test("Director candidates include only durable Human Enricher accepted videos", () => {
  const candidates = buildHumanAcceptedDirectorCandidates([
    video("accepted", "accepted", { tags: ["transition"] }),
    video("rejected", "rejected"),
    video("unseen", ""),
    video("blocked", "accepted", { mediaType: "image" }),
  ]);

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].sourceGroup, "human-accepted");
  assert.equal(candidates[0].motionRole, "transition");
  assert.equal(candidates[0].humanAcceptedIdentity.decisionState, "accepted");
  assert.equal(candidates[0].origin.authority, "human-media-triage-only");
  assert.deepEqual(summarizeHumanAcceptedDirectorCandidates(candidates).byOwnerKind, { scene: 1 });
});

test("accepted candidates remain eligible as one truth-bounded Director source family", () => {
  const candidates = buildHumanAcceptedDirectorCandidates([
    video("one", "accepted"),
    video("two", "accepted"),
  ]);
  const balanced = buildBalancedDirectorCandidates(candidates, { allowedSourceGroups: ["human-accepted"] });
  assert.equal(balanced.length, 2);
  assert.ok(balanced.every((candidate) => candidate.sourceGroup === "human-accepted"));
});

test("Director shots retain the exact Human Enricher acceptance receipt", () => {
  const candidates = buildHumanAcceptedDirectorCandidates([
    video("receipt", "accepted", {
      quickSortDecision: {
        id: "receipt:decision",
        state: "accepted",
        actorId: "calder",
        revision: 4,
        updatedAt: "2026-08-20T12:00:00.000Z",
      },
    }),
  ]);
  const project = {
    song_id: "accepted-only-song",
    song_title: "Accepted Only Song",
    duration: 4,
    timeline: [{ shot_index: 0, start_sec: 0, end_sec: 4, media_id: "old", media_uri: "/media/old.mp4" }],
  };
  const variant = recastBalancedEchoDirectorProject(project, candidates, {
    variantId: "human-accepted-test",
    allowedSourceGroups: ["human-accepted"],
    sourcePattern: ["human-accepted"],
    requireAllSourceGroups: true,
    seed: "human-accepted-receipt",
    createdAt: "2026-08-20T12:30:00.000Z",
  });

  assert.deepEqual(variant.timeline[0].decision_evidence.humanAcceptedIdentity, {
    videoKey: candidates[0].technicalIdentity,
    aliases: candidates[0].humanAcceptedIdentity.aliases,
    decisionId: "receipt:decision",
    decisionState: "accepted",
    decisionRevision: 4,
    actorId: "calder",
    origin: "",
    decidedAt: "2026-08-20T12:00:00.000Z",
    humanEnrichmentRevision: 0,
  });
});
