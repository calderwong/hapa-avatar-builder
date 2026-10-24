import test from "node:test";
import assert from "node:assert/strict";
import { createEchoScoreDustAutoRenderer, scoreDustGpuSupport } from "../src/components/echo-score-dust-gpu.js";
import { normalizeDustPlaySettings, validateEchoScoreDirection } from "../src/domain/echo-visual-score.js";
import { dustParticleConstants, createDustSwarm, sampleDustTargetsFromPixels, DUST_MAX_GPU_PARTICLES } from "../src/domain/echo-dust-swarm.js";

const fakeRenderer = (tier, log) => ({ tier, source: tier, setPlayback: (p, settings) => log.push([tier, settings?.renderer]), draw: () => ({ tier }), dispose: () => log.push([tier, "disposed"]), diagnostics: () => ({ tier }) });

test("the live host uses the CPU swarm unless the GPU tier is chosen and available", () => {
  const log = [];
  let gpuBuilds = 0;
  const auto = createEchoScoreDustAutoRenderer({ createCpu: () => fakeRenderer("cpu", log), createGpu: ({ particleCount }) => { gpuBuilds++; return { ...fakeRenderer("gpu", log), particleCount }; } });
  auto.setPlayback(null, { renderer: "cpu" });
  assert.equal(auto.tier, "cpu");
  auto.setPlayback(null, { renderer: "gpu", gpuParticleCount: 60000 });
  assert.equal(auto.tier, "gpu");
  auto.setPlayback(null, { renderer: "gpu", gpuParticleCount: 60000 });
  assert.equal(gpuBuilds, 1, "the GPU host is kept while its particle count is unchanged");
  auto.setPlayback(null, { renderer: "gpu", gpuParticleCount: 80000 });
  assert.equal(gpuBuilds, 2);
  const broken = createEchoScoreDustAutoRenderer({ createCpu: () => fakeRenderer("cpu", log), createGpu: () => { throw new Error("WebGL2 is unavailable in this browser."); } });
  broken.setPlayback(null, { renderer: "gpu" });
  assert.equal(broken.tier, "cpu", "falls back to the exact CPU swarm");
  assert.equal(broken.diagnostics().gpuFallback, "WebGL2 is unavailable in this browser.");
});

test("GPU settings validate and normalise; support checks explain themselves", () => {
  assert.deepEqual([normalizeDustPlaySettings({}).renderer, normalizeDustPlaySettings({}).gpuParticleCount], ["cpu", 40000]);
  assert.equal(normalizeDustPlaySettings({ renderer: "gpu", gpuParticleCount: 999999 }).gpuParticleCount, 80000);
  assert.equal(validateEchoScoreDirection({ playSettings: { renderer: "gpu", gpuParticleCount: 60000 } }).ok, true);
  assert.equal(validateEchoScoreDirection({ playSettings: { renderer: "metal" } }).ok, false);
  assert.equal(validateEchoScoreDirection({ playSettings: { gpuParticleCount: 100 } }).ok, false);
  assert.match(scoreDustGpuSupport(null).reason, /WebGL2/);
  assert.match(scoreDustGpuSupport({ getExtension: () => null }).reason, /float textures/);
});

test("both swarms share per-particle constants, and samplers fill dense GPU swarms", () => {
  const constants = dustParticleConstants(500, 9), cpu = createDustSwarm({ count: 500, seed: 9 });
  assert.deepEqual(constants.frequency, cpu.frequency);
  assert.deepEqual(constants.size, cpu.size);
  const data = new Uint8ClampedArray(64 * 64 * 4).fill(255);
  assert.equal(sampleDustTargetsFromPixels({ width: 64, height: 64, data }, { count: 60000 }).count, 60000);
  assert.equal(DUST_MAX_GPU_PARTICLES, 80000);
});
