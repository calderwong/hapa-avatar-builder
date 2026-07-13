import test from "node:test";
import assert from "node:assert/strict";
import { buildAccentEventTrack, createAccentOverrideReceipt, SAFE_ACCENT_LIMITS, validateAccentEventTrack } from "../src/domain/accent-event-track.js";

const cues = Array.from({ length: 20 }, (_, index) => ({
  id: `cue:${index}`,
  approved: true,
  atSeconds: index * 0.2,
  kind: "stem_onset",
  eligibleActions: ["accent", "effect"],
  evidence: { stemRole: index % 2 ? "drums" : "bass", onset: 0.8 },
}));

test("safe accent tracks are sparse, cue/stem-addressed, and layer-targeted", () => {
  const track = buildAccentEventTrack({ cues, density: 1, durationSeconds: 4 });
  assert.ok(validateAccentEventTrack(track).ok);
  assert.ok(track.events.every((event) => event.cueId && event.source.stemRole && event.target.scope === "single-layer"));
  assert.ok(track.events.every((event) => event.safety.flashHz <= SAFE_ACCENT_LIMITS.maxFlashHz));
  assert.ok(track.events.every((event) => event.safety.luminanceDelta <= SAFE_ACCENT_LIMITS.maxLuminanceDelta));
  assert.ok(track.events.every((event) => event.safety.frameArea <= SAFE_ACCENT_LIMITS.maxFrameArea));
});

test("reduced motion removes reversals, shutters, flicker, and glitch", () => {
  const track = buildAccentEventTrack({ cues, density: 1, durationSeconds: 4, reducedMotion: true });
  assert.ok(track.events.every((event) => !["glitch", "shutter", "flicker"].includes(event.kind)));
  assert.ok(track.events.every((event) => event.safety.flashCount === 0));
  assert.ok(validateAccentEventTrack(track).ok);
});

test("strong treatments require an explicit operator override receipt", () => {
  const track = buildAccentEventTrack({ cues: cues.slice(0, 1), density: 1, durationSeconds: 1 });
  track.events[0].safety.luminanceDelta = 0.4;
  assert.equal(validateAccentEventTrack(track).ok, false);
  const receipt = createAccentOverrideReceipt({ operator: "Calder", reason: "Reviewed hook treatment", acknowledgedAt: "2026-07-11T07:24:00Z", eventIds: [track.events[0].id] });
  assert.ok(validateAccentEventTrack(track, { overrideReceipt: receipt }).ok);
});
