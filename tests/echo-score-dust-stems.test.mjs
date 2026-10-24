import test from "node:test";
import assert from "node:assert/strict";
import { createStemReflex, normalizeStemResponses } from "../src/domain/echo-score-dust-stems.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback, validateEchoScoreDirection } from "../src/domain/echo-visual-score.js";
import { createScoreDustPerformance } from "../src/domain/echo-score-dust-performance.js";
import { sampleDustTargetsFromPixels } from "../src/domain/echo-dust-swarm.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const frames = (fn) => Array.from({ length: 2050 }, (_, i) => ({ t: i / 10, ...fn(i / 10) }));
function performanceFixture({ bass = 0.8 } = {}) {
  const period = 60 / 129.805;
  const bus = (id, role, fn) => ({ id, role, originSeconds: 0, durationSeconds: 204.92, frames: frames(fn) });
  return { buses: [
    bus("master", "master", () => ({ rms: 0.5, peak: 0.6, low: 0.5, mid: 0.5, high: 0.5, onsetEnvelope: 0 })),
    bus("stem-drums", "Drums", (t) => { const phase = (t % period) / period; return { rms: 0.7, peak: 0.8, low: 0.4, mid: 0.3, high: 0.9, onsetEnvelope: phase < 0.2 ? 1 : 0 }; }),
    bus("stem-bass", "Bass", () => ({ rms: bass, peak: bass, low: bass, mid: 0.1, high: 0, onsetEnvelope: 0 })),
    bus("stem-vocals", "Lead Vocals", (t) => ({ rms: t > 60 ? 0.8 : 0, peak: 0.8, low: 0, mid: 0.8, high: 0.2, onsetEnvelope: 0 })),
  ] };
}

test("stems group by role and master-only songs keep the spectrum response", () => {
  const reflex = createStemReflex(performanceFixture());
  assert.deepEqual(reflex.available.sort(), ["bass", "drums", "vocals"]);
  assert.deepEqual(reflex.roles.vocals, ["Lead Vocals"]);
  const at = reflex.at(70);
  assert.ok(at.bass > 0.7 && at.vocals > 0.7 && at.cymbals > 0.8);
  assert.equal(createStemReflex({ buses: [{ id: "master", role: "master", frames: [{ t: 0, rms: 1 }] }] }), null);
  assert.deepEqual(normalizeStemResponses({ drums: 3, bass: 0.5 }), { drums: 1, bass: 0.5, vocals: 1, harmony: 1 });
  assert.equal(validateEchoScoreDirection({ stemResponses: { drums: 0.5, bass: 0 } }).ok, true);
  assert.equal(validateEchoScoreDirection({ stemResponses: { kazoo: 1 } }).ok, false);
});

function run({ weights = {}, reducedMotion = false, bass = 0.8, to = 75 } = {}) {
  const playback = prepareEchoScorePlayback(composeEchoVisualScore(timeline, { stemResponses: weights }), timeline);
  const stems = createStemReflex(performanceFixture({ bass }));
  const performance = createScoreDustPerformance({ playback, settings: { seed: 3, particleCount: 600, reducedMotion } });
  performance.advanceTo(to - 5, { stemsAt: (t) => stems.at(t) });
  performance.advanceTo(to, { stemsAt: (t) => stems.at(t) });
  return performance;
}

test("drum hits kick, and a zero weight turns the instrument off", () => {
  assert.ok(run().diagnostics().drumHits >= 8, "about two hits per second");
  assert.equal(run({ weights: { drums: 0 } }).diagnostics().drumHits, 0);
});

test("bass swells the shape, cymbals sparkle, reduced motion keeps sparkle off", () => {
  const spread = (p) => { let r = 0; for (let i = 0; i < p.swarm.count; i++) r += Math.hypot(p.swarm.position[i * 3], p.swarm.position[i * 3 + 1], p.swarm.position[i * 3 + 2]); return r / p.swarm.count; };
  assert.ok(spread(run({ bass: 1 })) > spread(run({ weights: { bass: 0 } })) + 0.02);
  assert.ok(run().swarm.sparkle > 0.5);
  assert.equal(run({ reducedMotion: true }).swarm.sparkle, 0);
});

test("stem responses are deterministic across frame rates", () => {
  const playback = prepareEchoScorePlayback(composeEchoVisualScore(timeline), timeline);
  const stems = createStemReflex(performanceFixture());
  const at = (fps) => { const p = createScoreDustPerformance({ playback, settings: { seed: 3, particleCount: 400 } }); for (let f = 0; f <= 3 * fps; f++) p.advanceTo(70 + f / fps, { stemsAt: (t) => stems.at(t) }); return p.swarm.fingerprint(); };
  assert.equal(at(24), at(60));
});

test("words follow the singer: loose before the vocal arrives, tight once it does", () => {
  // Vocals enter at 60 s in the fixture; the phrase starts forming 0.4 s before 59.
  const playbackFor = (vocals) => prepareEchoScorePlayback(composeEchoVisualScore(timeline, { phrases: [{ text: "to the edge", start: 59, end: 64 }], stemResponses: { vocals } }), timeline);
  const pixels = { width: 64, height: 20, data: new Uint8ClampedArray(64 * 20 * 4) };
  for (let y = 4; y < 16; y++) for (let x = 4; x < 60; x += 3) pixels.data.set([255, 255, 255, 255], (y * 64 + x) * 4);
  const phraseTargets = (phrase, count, seed) => sampleDustTargetsFromPixels(pixels, { count, seed });
  const spread = (vocals, at) => {
    const p = createScoreDustPerformance({ playback: playbackFor(vocals), settings: { seed: 5, particleCount: 400 }, phraseTargets });
    const stems = createStemReflex(performanceFixture());
    p.advanceTo(at - 1.4, { stemsAt: (t) => stems.at(t) }); p.advanceTo(at, { stemsAt: (t) => stems.at(t) });
    let error = 0; for (let i = 0; i < p.swarm.count * 3; i++) error += Math.abs(p.swarm.position[i] - p.swarm.target[i]);
    return { error: error / p.swarm.count, diagnostics: p.diagnostics() };
  };
  const waiting = spread(1, 59.9), stiff = spread(0, 59.9), sung = spread(1, 61.5);
  assert.ok(waiting.error > stiff.error * 1.15, `${waiting.error} vs ${stiff.error}: held loosely until the vocal`);
  assert.ok(sung.error < waiting.error, "tight once the singer comes in");
  assert.equal(sung.diagnostics.vocalWordOnsets, 1);
  assert.equal(stiff.diagnostics.vocalWordOnsets, 0, "no vocal yet at 59.9 s");
  assert.equal(spread(0, 61.5).diagnostics.vocalWordOnsets, 1, "the onset is still detected at weight 0; only the response is weighted");
});
