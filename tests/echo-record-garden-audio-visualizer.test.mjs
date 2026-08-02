import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";

import {
  ECHO_RECORD_GARDEN_AUDIO_VISUALIZER_PROFILE,
  createEchoRecordGardenAudioVisualizer,
} from "../src/components/echo-record-garden-audio-visualizer.js";

const source = await readFile(
  new URL("../src/components/echo-record-garden-audio-visualizer.js", import.meta.url),
  "utf8",
);

test("the visualizer stays inside its scene resource budget", () => {
  const world = new THREE.Group();
  const visualizer = createEchoRecordGardenAudioVisualizer({ world, maxBars: 200 });
  try {
    const drawables = [];
    const lights = [];
    visualizer.root.traverse((object) => {
      if (object.isMesh || object.isLine) drawables.push(object);
      if (object.isLight) lights.push(object);
    });
    assert.equal(visualizer.metrics.maxBars, 48);
    assert.equal(visualizer.metrics.drawables, 2);
    assert.equal(visualizer.metrics.materials, 2);
    assert.equal(drawables.length, 2);
    assert.equal(lights.length, 0);
    assert.equal(visualizer.bars.isInstancedMesh, true);
    assert.equal(visualizer.bars.count, 48);
    assert.equal(visualizer.bars.castShadow, false);
    assert.equal(visualizer.ring.material.map, null);
    assert.equal(visualizer.bars.material.map, null);
    assert.deepEqual(ECHO_RECORD_GARDEN_AUDIO_VISUALIZER_PROFILE, {
      maxBars: 48,
      maxDrawables: 2,
      maxMaterials: 2,
      lights: 0,
      textures: 0,
      audioContexts: 0,
    });
    assert.doesNotMatch(source, /AudioContext|webkitAudioContext/);
    assert.doesNotMatch(source, /new THREE\.(?:Ambient|Directional|Hemisphere|Point|Spot|RectArea)Light/);
    assert.doesNotMatch(source, /new THREE\.(?:Canvas|Data|Video|Compressed|Cube)?Texture/);
  } finally {
    visualizer.dispose();
  }
});

test("the visualizer follows its target and maps live frequency data onto instances", () => {
  const world = new THREE.Group();
  world.position.set(5, 0, 2);
  world.rotation.y = 0.3;
  const target = new THREE.Group();
  target.position.set(2, 1, -3);
  world.add(target);
  const visualizer = createEchoRecordGardenAudioVisualizer({ world });
  try {
    visualizer.setTarget(target);
    world.updateMatrixWorld(true);
    const fft = new Uint8Array(64);
    for (let index = 0; index < fft.length; index += 1) fft[index] = index * 4;
    assert.equal(visualizer.update({
      frequencyData: fft,
      elapsed: 3,
      delta: 1 / 60,
      reducedMotion: true,
      accent: 0xff66aa,
    }), true);
    assert.equal(visualizer.root.visible, true);
    assert.equal(visualizer.root.position.x, 2);
    assert.equal(visualizer.root.position.y, 1.035);
    assert.equal(visualizer.root.position.z, -3);
    assert.equal(visualizer.root.rotation.y, 0);

    const instanceMatrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    visualizer.bars.getMatrixAt(47, instanceMatrix);
    instanceMatrix.decompose(position, rotation, scale);
    assert.ok(scale.y > 0.45, "upper frequency bins should drive visible bar height");
    assert.equal(visualizer.ring.material.color.getHex(), 0xff66aa);

    visualizer.update({ reducedMotion: true });
    visualizer.bars.getMatrixAt(47, instanceMatrix);
    instanceMatrix.decompose(position, rotation, scale);
    assert.ok(Math.abs(scale.y - 0.018) < 1e-6, "missing analysis data must settle to a dormant state");
  } finally {
    visualizer.dispose();
  }
});

test("detail tiers, target clearing, and disposal are deterministic and idempotent", () => {
  const world = new THREE.Group();
  const target = new THREE.Group();
  world.add(target);
  const visualizer = createEchoRecordGardenAudioVisualizer({ world });
  let barGeometryDisposals = 0;
  let barMaterialDisposals = 0;
  let ringGeometryDisposals = 0;
  let ringMaterialDisposals = 0;
  visualizer.bars.geometry.dispose = () => {
    barGeometryDisposals += 1;
  };
  visualizer.bars.material.dispose = () => {
    barMaterialDisposals += 1;
  };
  visualizer.ring.geometry.dispose = () => {
    ringGeometryDisposals += 1;
  };
  visualizer.ring.material.dispose = () => {
    ringMaterialDisposals += 1;
  };

  assert.equal(visualizer.setDetailTier("reduced"), "reduced");
  assert.equal(visualizer.bars.count, 24);
  assert.equal(visualizer.ring.geometry.drawRange.count, 24);
  assert.equal(visualizer.setDetailTier("full"), "full");
  assert.equal(visualizer.bars.count, 48);
  visualizer.setTarget(target);
  assert.equal(visualizer.getTarget(), target);
  visualizer.setTarget(null);
  assert.equal(visualizer.update({ frequencyData: new Uint8Array([255]) }), false);
  assert.equal(visualizer.root.visible, false);

  visualizer.dispose();
  visualizer.dispose();
  assert.equal(world.children.includes(visualizer.root), false);
  assert.equal(barGeometryDisposals, 1);
  assert.equal(barMaterialDisposals, 1);
  assert.equal(ringGeometryDisposals, 1);
  assert.equal(ringMaterialDisposals, 1);
});
