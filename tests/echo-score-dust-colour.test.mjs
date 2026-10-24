import test from "node:test";
import assert from "node:assert/strict";
import { DUST_COLOUR_MODES, presetPaletteFor, hslToHex, hexToHsl, computeDustColours, dustColourStyle, createFlashGate, normalizeDustColour } from "../src/domain/echo-score-dust-colour.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback, validateEchoVisualScore, validateEchoScoreDirection, normalizeDustPlaySettings } from "../src/domain/echo-visual-score.js";
import { createScoreDustPerformance } from "../src/domain/echo-score-dust-performance.js";
import { createDustSwarm, sampleDustTargetsFromPixels } from "../src/domain/echo-dust-swarm.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());

test("presets give each section a related palette; pinned palettes still win", () => {
  assert.notDeepEqual(presetPaletteFor("sunset", 0), presetPaletteFor("sunset", 1));
  assert.deepEqual(presetPaletteFor("monochrome", 0).map((c) => c.h), presetPaletteFor("monochrome", 3).map((c) => c.h));
  assert.equal(presetPaletteFor("nope", 0), null);
  const group = timeline.sections[1].repeatGroup, pinned = [{ h: 10, s: 0.5, l: 0.5 }];
  const score = composeEchoVisualScore(timeline, { colour: { preset: "ice", mode: "frequency" }, palettes: { [group]: pinned } });
  assert.deepEqual(score.palettes[`palette-${group}`], pinned);
  assert.deepEqual(score.palettes[`palette-${timeline.sections[0].repeatGroup}`], presetPaletteFor("ice", 0));
  assert.equal(score.colour.mode, "frequency");
  assert.ok(score.cues.every((c) => Number.isInteger(c.occurrence)));
  assert.equal(validateEchoVisualScore(score, { timeline }).ok, true);
  assert.ok(validateEchoVisualScore({ ...score, colour: { mode: "plaid" } }, { timeline }).errors.some((e) => e.code === "colour"));
});

test("hex colour pickers round-trip through palette HSL", () => {
  for (const hex of ["#ff0000", "#22d3ee", "#808080", "#123456"]) assert.equal(hslToHex(hexToHsl(hex)), hex);
  assert.equal(hexToHsl("blue"), null);
});

test("directions validate colour and comfort settings strictly", () => {
  assert.equal(validateEchoScoreDirection({ colour: { mode: "speed", preset: "ember", liftFlash: false }, playSettings: { reducedMotion: true, flashLimitPerSecond: 1 } }).ok, true);
  const codes = (d) => validateEchoScoreDirection(d).errors.map((e) => e.code);
  assert.ok(codes({ colour: { mode: "rainbow" } }).includes("colour"));
  assert.ok(codes({ colour: { glitter: true } }).includes("colour"));
  assert.ok(codes({ playSettings: { flashLimitPerSecond: 6 } }).includes("playSettings"), "the limit can only go down from 3");
  assert.equal(normalizeDustPlaySettings({ flashLimitPerSecond: 9 }).flashLimitPerSecond, 3);
  assert.equal(normalizeDustPlaySettings({}).reducedMotion, false);
});

test("each colour mode colours particles by its own rule", () => {
  const swarm = createDustSwarm({ count: 400, seed: 2 });
  swarm.setFormation("sheet");
  swarm.advanceTo(1, () => ({ spin: 0 }));
  const palette = [{ r: 1, g: 0, b: 0 }, { r: 0, g: 0, b: 1 }];
  const base = { palette, flash: 0, desaturate: 0 };
  const freq = computeDustColours(swarm, { ...base, mode: "frequency" });
  const low = swarm.param.indexOf(Math.min(...swarm.param)), high = swarm.param.indexOf(Math.max(...swarm.param));
  assert.ok(freq[low * 3] > 0.9 && freq[high * 3 + 2] > 0.9, "bass end red, treble end blue");
  const pal = computeDustColours(swarm, { ...base, mode: "palette" });
  assert.deepEqual([pal[0], pal[3 + 2]], [1, 1]);
  const grey = computeDustColours(swarm, { ...base, mode: "palette", desaturate: 1 });
  assert.ok(Math.abs(grey[0] - grey[1]) < 1e-6 && Math.abs(grey[1] - grey[2]) < 1e-6);
  const white = computeDustColours(swarm, { ...base, mode: "palette", flash: 1 });
  assert.ok([...white.subarray(0, 30)].every((v) => Math.abs(v - 1) < 1e-6));
  // From the picture: particles keep the sampled pixel colours.
  const data = new Uint8ClampedArray(20 * 20 * 4);
  for (let i = 0; i < 400; i++) data.set([0, 200, 40, 255], i * 4);
  swarm.setFormation(sampleDustTargetsFromPixels({ width: 20, height: 20, data }, { count: 400 }));
  const pic = computeDustColours(swarm, { ...base, mode: "picture" });
  assert.ok(Math.abs(pic[1] - 200 / 255) < 1e-6 && pic[0] === 0);
  for (const mode of DUST_COLOUR_MODES) assert.ok([...computeDustColours(swarm, { ...base, mode })].every((v) => v >= 0 && v <= 1), mode);
});

test("palettes crossfade into a new section and calm breaks drain colour", () => {
  const score = composeEchoVisualScore(timeline, { colour: { crossfadeSeconds: 2 } }), playback = prepareEchoScorePlayback(score, timeline);
  const cue = score.cues[1], before = playback.stateAt(cue.start - 0.01), start = playback.stateAt(cue.start + 1e-6), settled = playback.stateAt(cue.start + 3);
  const prev = dustColourStyle(playback, before, cue.start - 0.01).palette[0], first = dustColourStyle(playback, start, cue.start + 1e-6).palette[0], after = dustColourStyle(playback, settled, cue.start + 3).palette[0];
  assert.ok(Math.abs(first.r - prev.r) < 0.02 && Math.abs(first.b - prev.b) < 0.02, "starts from the previous palette");
  assert.notDeepEqual(after, first);
  const fall = score.events.find((e) => e.response === "calm");
  assert.ok(dustColourStyle(playback, playback.stateAt(fall.at + 0.5), fall.at + 0.5).desaturate > 0.4);
  assert.equal(normalizeDustColour({}).liftFlash, true);
});

test("the flash gate never allows more than three bright flashes per second", () => {
  const gate = createFlashGate(3);
  const allowed = [];
  for (let t = 0; t < 10; t += 0.05) if (gate.request(t)) allowed.push(t);
  for (let i = 3; i < allowed.length; i++) assert.ok(allowed[i] - allowed[i - 3] >= 1 - 1e-9);
  assert.equal(createFlashGate(0).request(1), false);
  assert.equal(createFlashGate(9).stats().limitPerSecond, 3);
  // Inside a real performance at double-time pulse, flashes stay within budget.
  const playback = prepareEchoScorePlayback(composeEchoVisualScore(timeline), timeline, { pulse: "double" });
  const performance = createScoreDustPerformance({ playback, settings: { seed: 1, particleCount: 300 } });
  performance.advanceTo(90); performance.advanceTo(110);
  const stats = performance.diagnostics().flashes;
  assert.ok(stats.allowed > 0, "downbeats and the lift flash");
  assert.ok(stats.allowed <= Math.ceil(21.5 * 3), `${stats.allowed} flashes`);
});

test("reduced motion stops spin and orbit, softens kicks and suppresses flashes", () => {
  const playback = prepareEchoScorePlayback(composeEchoVisualScore(timeline), timeline);
  const run = (reducedMotion) => {
    const p = createScoreDustPerformance({ playback, settings: { seed: 4, particleCount: 500, reducedMotion } });
    p.advanceTo(96); const { state } = p.advanceTo(99);
    let speed = 0; for (let i = 0; i < p.swarm.count; i++) speed += Math.hypot(p.swarm.velocity[i * 3], p.swarm.velocity[i * 3 + 1], p.swarm.velocity[i * 3 + 2]);
    return { p, state, speed: speed / p.swarm.count };
  };
  const normal = run(false), calm = run(true);
  assert.equal(calm.p.camera(99, calm.state).yaw, 0);
  assert.equal(calm.p.swarm.rotation, 0);
  assert.ok(calm.speed < normal.speed * 0.6, `${calm.speed} < ${normal.speed}`);
  assert.equal(calm.p.diagnostics().flashes.allowed, 0);
  assert.equal(calm.p.swarm.activeShocks, 0, "no travelling shock fronts");
});
