import test from "node:test";
import assert from "node:assert/strict";
import { buildMissingMediaPlan, registerGeneratedMediaCandidate } from "../src/domain/missing-media-plan.js";

const project = { song_id: "song", timeline: [{ shot_index: 0, section_id: "verse", section_type: "verse", section_label: "Verse", start_sec: 0, end_sec: 5, media_id: "weak", camera_motion: "hold", semantic_casting: { selected: { eligible: true, confidence: .2 } } }, { shot_index: 1, section_id: "hook", section_type: "hook", section_label: "Hook", start_sec: 5, end_sec: 10, media_id: "none", semantic_casting: { selected: null } }] };
test("required/optional/symbolic gaps emit bounded detailed renderable requests", () => {
  const plan = buildMissingMediaPlan(project, { maxRequests: 1, contextPacket: { allowedCharacters: [{ id: "red" }], song: { source: { file: "song.json" } }, scenes: [] } });
  assert.equal(plan.requests.length, 1);
  assert.equal(plan.requests[0].gapKind, "required");
  for (const field of ["character", "continuity", "framing", "motion", "frameRange", "sourceAnchors", "intendedCue"]) assert.ok(Object.hasOwn(plan.requests[0], field));
  assert.equal(plan.renderableWhilePending, true);
  assert.equal(plan.placeholderTreatment.neverSilentReplacement, true);
});
test("generated results return only as provenance-marked pending candidates", () => {
  const plan = buildMissingMediaPlan(project);
  const candidate = registerGeneratedMediaCandidate(plan, plan.requests[0].id, { contentHash: "a".repeat(64), path: "/local/result.mp4", prompt: "p", model: "local", seed: "1" }, { sourceNodeId: "hapa-mlx", operator: "human", receivedAt: "2026-07-11T10:10:00Z" });
  assert.equal(candidate.status, "candidate-pending-human-review");
  assert.match(candidate.replacementPolicy, /never-silent/);
});

test("Vertical projects request exact 9:16 generated media independently of source dimensions", () => {
  const verticalProject = {
    ...project,
    output_profile: "vertical",
    timeline: project.timeline.map((shot) => ({
      ...shot,
      media_contract: { dimensions: { width: 1920, height: 1080 } },
    })),
  };
  const plan = buildMissingMediaPlan(verticalProject, { maxRequests: 1 });
  assert.deepEqual(plan.requests[0].requestedOutput, {
    profileId: "vertical",
    durationSeconds: 5,
    aspect: "9:16",
    width: 1080,
    height: 1920,
    fps: 30,
    startFrameReference: null,
    endFrameReference: null,
  });
  assert.equal(plan.requests[0].framing.outputOrientation, "vertical");

  const candidate = registerGeneratedMediaCandidate(
    plan,
    plan.requests[0].id,
    { contentHash: "b".repeat(64), path: "/local/vertical.mp4", width: 1920, height: 1080 },
    { sourceNodeId: "hapa-mlx", operator: "human" },
  );
  assert.equal(candidate.outputConformance.status, "mismatch");
  assert.equal(candidate.status, "candidate-pending-human-review");
});
