import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildAudioFallbackProfile, validateAudioFallbackProfile } from "../src/domain/audio-fallback-profile.js";

test("no-stem fallback never invents isolated buses and stays deterministic", () => {
  const input = {
    stems: [], durationSeconds: 12, fps: 10,
    sections: [{ id: "verse", startSeconds: 0, endSeconds: 12, energy: 0.5 }],
    lyricCues: [{ startSeconds: 2, endSeconds: 4, words: [{ text: "Dear" }, { text: "Papa" }] }],
    beatTimes: [1, 2, 3, 4], timingTruth: { lyric: "inferred" },
  };
  const a = buildAudioFallbackProfile(input);
  const b = buildAudioFallbackProfile(input);
  assert.deepEqual(a, b);
  assert.ok(validateAudioFallbackProfile(a).ok);
  assert.equal(a.mode, "master-structural-fallback");
  assert.equal(a.isolatedStemCount, 0);
  assert.ok(a.buses.every((bus) => !bus.isolatedStem && bus.kind !== "stem_signal"));
  assert.ok(a.unavailableSignals.includes("isolated-drums"));
  assert.ok(a.targetGrammar.bounded);
  assert.ok(a.upgradePath.steps.length >= 3);
});

test("Echo UI exposes the no-stem upgrade path instead of fake stem toggles", () => {
  const source = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
  assert.match(source, /data-testid="echo-audio-fallback-upgrade"/);
  assert.match(source, /No isolated stems claimed/);
  assert.match(source, /attach registry-linked stems or stronger timing/);
  assert.match(source, /activeIsolatedStems\.map/);
});
