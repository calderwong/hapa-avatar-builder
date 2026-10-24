import test from "node:test";
import assert from "node:assert/strict";
import {
  createDustSwarm, sampleDustTargetsFromPixels, dustBandsFromSpectrum, projectDustSwarm, hash32,
  DUST_FORMATION_FAMILIES, DUST_MAX_STEP_SECONDS, DUST_BAND_COUNT,
} from "../src/domain/echo-dust-swarm.js";

const still = () => ({ spin: 0, flow: 0, hold: 1 });
const meanError = (swarm) => {
  let sum = 0;
  for (let i = 0; i < swarm.count; i++) sum += Math.hypot(swarm.position[i * 3] - swarm.target[i * 3], swarm.position[i * 3 + 1] - swarm.target[i * 3 + 1], swarm.position[i * 3 + 2] - swarm.target[i * 3 + 2]);
  return sum / swarm.count;
};

test("every formation yields finite targets, unit normals and band coordinates in [0,1]", () => {
  for (const family of DUST_FORMATION_FAMILIES) {
    const swarm = createDustSwarm({ count: 400, seed: 3 });
    swarm.setFormation(family);
    for (let i = 0; i < swarm.count; i++) {
      assert.ok([0, 1, 2].every((k) => Number.isFinite(swarm.target[i * 3 + k])), family);
      assert.ok(Math.abs(Math.hypot(swarm.normal[i * 3], swarm.normal[i * 3 + 1], swarm.normal[i * 3 + 2]) - 1) < 1e-3, family);
      assert.ok(swarm.param[i] >= 0 && swarm.param[i] <= 1, family);
    }
  }
  assert.throws(() => createDustSwarm().setFormation("teapot"), /Unknown dust formation/);
});

test("springs pull persistent particles to a new formation without teleporting", () => {
  const swarm = createDustSwarm({ count: 800, seed: 11 });
  swarm.setFormation("sphere");
  swarm.advanceTo(3, still);
  assert.ok(meanError(swarm) < 0.02);
  const before = Float32Array.from(swarm.position);
  swarm.setFormation("ring");
  swarm.step(1 / 60, still());
  let largest = 0;
  for (let i = 0; i < swarm.position.length; i++) largest = Math.max(largest, Math.abs(swarm.position[i] - before[i]));
  assert.ok(largest < 0.1, "formation change continues from current positions");
  swarm.advanceTo(swarm.time + 3, still);
  assert.ok(meanError(swarm) < 0.02);
});

test("same seed and controls give identical state; a different seed differs", () => {
  const run = (seed) => { const s = createDustSwarm({ count: 600, seed }); s.setFormation("helix"); s.advanceTo(1, (t) => ({ bands: new Float32Array(DUST_BAND_COUNT).fill(t % 0.5), flow: 0.3 })); s.kick(1); s.shock(1); s.advanceTo(2); return s.fingerprint(); };
  assert.equal(run(5), run(5));
  assert.notEqual(run(5), run(6));
  assert.equal(hash32(1, 2, 3), hash32(1, 2, 3));
});

test("a stalled frame cannot inject an arbitrarily large step", () => {
  const swarm = createDustSwarm({ count: 10, seed: 1 });
  swarm.setFormation("sphere");
  assert.equal(swarm.step(2, still()), DUST_MAX_STEP_SECONDS);
  assert.ok(Math.abs(swarm.time - DUST_MAX_STEP_SECONDS) < 1e-9);
});

test("a beat kick is immediate while a shock reaches distant particles later", () => {
  const settle = () => { const s = createDustSwarm({ count: 2000, seed: 2 }); s.setFormation("sphere", { scale: 0.3 }); s.advanceTo(3, still); return s; };
  const speed = (s) => { let sum = 0; for (let i = 0; i < s.count; i++) sum += Math.hypot(s.velocity[i * 3], s.velocity[i * 3 + 1], s.velocity[i * 3 + 2]); return sum / s.count; };
  const kicked = settle();
  kicked.kick(1);
  kicked.step(1 / 60, still());
  assert.ok(speed(kicked) > 0.5, "kick moves particles on the very next step");
  // Ring of radius 1 around a small core: the front (2.6 u/s) arrives ~0.3 s later.
  const shocked = createDustSwarm({ count: 2000, seed: 2 });
  shocked.setFormation("ring");
  shocked.advanceTo(3, still);
  shocked.shock(1);
  shocked.advanceTo(shocked.time + 0.1, still);
  const early = speed(shocked);
  shocked.advanceTo(shocked.time + 0.3, still);
  assert.ok(speed(shocked) > early * 3, "the front reaches the ring after travelling");
});

test("band energy deforms targets along their normals by flexibility", () => {
  const quiet = createDustSwarm({ count: 500, seed: 4 }), loud = createDustSwarm({ count: 500, seed: 4 });
  for (const s of [quiet, loud]) s.setFormation("ring", { flexibility: 1 });
  quiet.advanceTo(3, still);
  loud.advanceTo(3, () => ({ ...still(), bands: new Float32Array(DUST_BAND_COUNT).fill(1), reach: 0.4 }));
  const radius = (s) => { let r = 0; for (let i = 0; i < s.count; i++) r += Math.hypot(s.position[i * 3], s.position[i * 3 + 2]); return r / s.count; };
  assert.ok(Math.abs(radius(loud) - radius(quiet) - 0.4) < 0.03);
});

test("participation fades points into a halo with a 0.35 s time constant", () => {
  const swarm = createDustSwarm({ count: 2000, seed: 8 });
  swarm.setFormation("sphere");
  swarm.advanceTo(2, still);
  swarm.advanceTo(swarm.time + 0.35, () => ({ ...still(), participation: 0.25 }));
  const hidden = [...swarm.visibility].filter((v, i) => swarm.rank[i] >= 0.25);
  const mean = hidden.reduce((a, b) => a + b, 0) / hidden.length;
  assert.ok(Math.abs(mean - Math.exp(-1)) < 0.05, `visibility ${mean}`);
  assert.ok([...swarm.visibility].filter((v, i) => swarm.rank[i] < 0.25).every((v) => v > 0.99));
});

test("pixels become legible targets with stiffer outline points", () => {
  const width = 20, height = 10, data = new Uint8ClampedArray(width * height * 4);
  for (let y = 2; y < 8; y++) for (let x = 3; x < 17; x++) data.set([255, 255, 255, 255], (y * width + x) * 4);
  const points = sampleDustTargetsFromPixels({ width, height, data }, { count: 300, seed: 1 });
  assert.equal(points.count, 300);
  const edges = [...points.edge].filter(Boolean).length;
  assert.ok(edges > 0 && edges < 300);
  for (let i = 0; i < points.count; i++) assert.ok(Math.abs(points.flex[i] - (points.edge[i] ? 0.15 : 0.45)) < 1e-6);
  const swarm = createDustSwarm({ count: 900, seed: 1 });
  swarm.setFormation(points);
  assert.equal(swarm.formation, "points");
  assert.throws(() => sampleDustTargetsFromPixels({ width: 2, height: 2, data: [] }), /RGBA/);
});

test("spectrum reduction and projection stay bounded", () => {
  const bands = dustBandsFromSpectrum(Uint8Array.from({ length: 256 }, (_, i) => 255 - i));
  assert.equal(bands.length, DUST_BAND_COUNT);
  assert.ok(bands[0] > bands[31] && [...bands].every((v) => v >= 0 && v <= 1));
  assert.ok([...dustBandsFromSpectrum(new Float32Array(64).fill(0.5))].every((v) => Math.abs(v - 0.5) < 1e-6));
  const swarm = createDustSwarm({ count: 300, seed: 1 });
  swarm.setFormation("sphere");
  swarm.advanceTo(2, still);
  const projected = projectDustSwarm(swarm, { width: 640, height: 360 });
  assert.equal(projected.visible, 300);
  for (let i = 0; i < 300; i++) assert.ok(projected.alpha[i] >= 0 && projected.alpha[i] <= 1 && projected.radius[i] > 0);
  assert.equal(projectDustSwarm(swarm, { width: 640, height: 360 }, projected), projected, "buffers are reused");
});
