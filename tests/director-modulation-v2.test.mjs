import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { evaluateDirectorModulationSequence, createDirectorModulationRuntime, prepareDirectorModulationTimeline } from "../src/domain/director-modulation-v2.js";

const binding = (id, stemFocus) => ({
  id,
  source: { kind: "stem_signal", stemFocus, signal: "rms" },
  target: { kind: "visualizer_uniform", visualizerId: `viz-${stemFocus}`, uniform: "gain" },
  envelope: {
    depth: 0.8, attackSeconds: 0.05, releaseSeconds: 0.2, smoothingSeconds: 0.02,
    easing: "power2.out", clamp: [0, 1], quantize: "frame", quantizeStep: 0,
    gate: { threshold: 0.02, floor: 0 }, delaySeconds: 0, polarity: "positive",
    safetyBounds: { min: 0, max: 1, maxDeltaPerSecond: 8 },
  },
});

test("executable modulation produces identical preview/export envelopes", () => {
  const bindings = [binding("drums", "drums"), binding("synth", "synth")];
  const frames = Array.from({ length: 8 }, (_, index) => ({
    atSeconds: index / 10,
    signals: { stems: { drums: { rms: index / 10 }, synth: { rms: (7 - index) / 10 } }, master: { rms: 0.5 } },
  }));
  const preview = evaluateDirectorModulationSequence(bindings, frames);
  const exported = evaluateDirectorModulationSequence(bindings, frames);
  assert.deepEqual(exported, preview);
});

test("muting one stem removes only its assigned modulation", () => {
  const bindings = [binding("drums", "drums"), binding("synth", "synth")];
  const frames = [{ atSeconds: 0.1, signals: { stems: { drums: { rms: 0.9 }, synth: { rms: 0.7 } } } }];
  const full = evaluateDirectorModulationSequence(bindings, frames)[0].outputs;
  const muted = evaluateDirectorModulationSequence(bindings, frames, { mutedStems: ["drums"] })[0].outputs;
  assert.deepEqual(muted.map((output) => output.id), ["synth"]);
  assert.equal(muted[0].value, full.find((output) => output.id === "synth").value);
});

test("compiled bindings expose the complete grammar and a true master mix bus", () => {
  const source = buildDirectorV2Artifacts.toString();
  assert.ok(source.length > 0);
  const moduleText = fs.readFileSync("./src/domain/echo-director-v2.js", "utf8");
  for (const field of ["attackSeconds", "releaseSeconds", "smoothingSeconds", "easing", "clamp", "quantize", "gate", "delaySeconds", "depth", "polarity", "safetyBounds"]) assert.ok(moduleText.includes(field));
  assert.ok(moduleText.includes('source: { kind: "mix_signal", bus: "master", signal: "rms" }'));
});

test("the 0.6-second modulation probe is identical on continuous, direct, reverse and repeated seeks", () => {
  let samples = 0;
  const bindings = [binding("d", "drums")];
  const preparedTimeline = prepareDirectorModulationTimeline(bindings, {
    durationSeconds: 2, fps: 60, sourceFingerprint: "fixture-pinned-ramp",
    sampleSignals: atSeconds => { samples++; return { stems: { drums: { rms: Math.min(1, atSeconds / 0.6) } } }; },
  });
  const callsAfterPreparation = samples;
  const continuous = createDirectorModulationRuntime(bindings, { preparedTimeline });
  let sequential;
  for (let frame = 0; frame <= 36; frame++) sequential = continuous.step({ atSeconds: frame / 60 });
  const direct = createDirectorModulationRuntime(bindings, { preparedTimeline });
  assert.deepEqual(direct.step({ atSeconds: 0.6 }), sequential);
  direct.step({ atSeconds: 1.8 }); direct.step({ atSeconds: 0.02 });
  assert.deepEqual(direct.step({ atSeconds: 0.6, signals: { stems: { drums: { rms: 99 } } } }), sequential);
  assert.equal(samples, callsAfterPreparation, "seeking must not invoke signal analysis or sampling again");
  assert.ok(sequential[0].value > 0 && sequential[0].value < 0.8);
  assert.deepEqual(direct.step({ atSeconds: 0.6, muted: ["drums"] }), []);
});

test("shared modulation channels and an explicit sample budget bound compilation", () => {
  const bindings = Array.from({ length: 20 }, (_, index) => binding(`d-${index}`, "drums"));
  const timeline = prepareDirectorModulationTimeline(bindings, { durationSeconds: 1, fps: 60, sourceFingerprint: "same-source", sampleSignals: () => ({ stems: { drums: { rms: 0.5 } } }) });
  assert.equal(timeline.channels.length, 1);
  assert.equal(timeline.policy.samples, 61);
  assert.throws(() => prepareDirectorModulationTimeline(bindings, { durationSeconds: 100, fps: 60, maxSamples: 100, sourceFingerprint: "same-source", sampleSignals: () => ({}) }), { code: "echo_modulation_budget_exceeded" });
});
