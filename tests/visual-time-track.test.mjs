import test from "node:test";
import assert from "node:assert/strict";
import { buildVisualTimeTrack, validateVisualTimeTrack, VISUAL_TIME_LIMITS } from "../src/domain/visual-time-track.js";

const cues = [0, 10, 20].map((atSeconds, index) => ({ id: `section:${index}`, approved: true, atSeconds, kind: "section_start", eligibleActions: ["effect"] }))
  .concat(Array.from({ length: 60 }, (_, index) => ({ id: `onset:${index}`, approved: true, atSeconds: 0.3 + index * 0.3, kind: "stem_onset", eligibleActions: ["effect"], evidence: { stemRole: index % 2 ? "drums" : "bass", onset: 0.8 } })));

test("visual time effects are deterministic, bounded, visual-only, and fail visibly", () => {
  const a = buildVisualTimeTrack({ cues, density: 0.8, durationSeconds: 20 });
  const b = buildVisualTimeTrack({ cues, density: 0.8, durationSeconds: 20 });
  assert.deepEqual(a, b);
  assert.ok(validateVisualTimeTrack(a, { sectionBoundaries: [10, 20] }).ok);
  assert.deepEqual(a.canonicalAudioClock, { rate: 1, edited: false });
  assert.ok(a.events.every((event) => event.target.clock === "visual-only" && event.unsupportedBehavior.mode === "fail-visible"));
  assert.ok(a.events.filter((event) => event.kind === "playback-rate").flatMap((event) => event.keyframes).filter((frame) => frame.visualRate != null).every((frame) => frame.visualRate >= VISUAL_TIME_LIMITS.minRate && frame.visualRate <= VISUAL_TIME_LIMITS.maxRate));
  assert.ok(a.events.every((event) => Object.values(event.rendererSupport).every((support) => typeof support.supported === "boolean" && support.route)));
});

test("reduced motion removes reversal and stutter without changing the base clock", () => {
  const normal = buildVisualTimeTrack({ cues, density: 0.8, durationSeconds: 20 });
  const reduced = buildVisualTimeTrack({ cues, density: 0.8, durationSeconds: 20, reducedMotion: true });
  assert.ok(normal.events.some((event) => ["micro-reverse", "beat-stutter"].includes(event.kind)));
  assert.ok(reduced.events.every((event) => !["micro-reverse", "beat-stutter"].includes(event.kind)));
  assert.deepEqual(reduced.canonicalAudioClock, normal.canonicalAudioClock);
  assert.ok(validateVisualTimeTrack(reduced, { sectionBoundaries: [10, 20] }).ok);
});
