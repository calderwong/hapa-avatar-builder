import test from "node:test";
import assert from "node:assert/strict";
import { buildDirectorPlaybackReceipt, createBoundedRuntimeRecorder, explainFromDirectorReceipt } from "../src/domain/director-observability-receipt.js";

test("runtime recorder aggregates every tick but samples on a bounded interval", () => {
  const recorder = createBoundedRuntimeRecorder({ maxSamples: 3, sampleIntervalMs: 250 });
  for (let frame = 0; frame < 120; frame += 1) { recorder.increment("presentedFrames"); recorder.sample(frame * 16.667, { droppedFrames: frame % 30 === 0 ? 1 : 0 }); }
  const result = recorder.export();
  assert.equal(result.counters.presentedFrames, 120);
  assert.equal(result.samples.length, 3);
  assert.equal(result.policy.perFrameLogging, false);
  assert.equal(result.policy.reactStateWrites, false);
});

test("one receipt carries source-to-export lineage and answers from saved evidence", () => {
  const receipt = buildDirectorPlaybackReceipt({ source: { manifestHash: "m" }, compilation: { treatmentId: "t", cueGraphId: "c", variantId: "v", variantHash: "h" }, adapter: { adapterId: "hyperframes" }, preview: { sessionId: "p" }, exportValidation: { artifactHash: "e" }, evidenceIndex: { shot: { "card:a:0": { reason: "stored" } }, visualizer: { "card:b:0": { reason: "stored" } }, modulation: { "binding:1": { reason: "stored" } }, fallback: { "loss:1": { reason: "stored" } } } });
  assert.deepEqual(Object.values(receipt.lineage), ["m", "t", "c", "v", "h", "hyperframes", "p", "e"]);
  for (const kind of ["shot", "visualizer", "modulation", "fallback"]) assert.equal(explainFromDirectorReceipt(receipt, { kind, id: Object.keys(receipt.evidenceIndex[kind])[0] }).found, true);
});
