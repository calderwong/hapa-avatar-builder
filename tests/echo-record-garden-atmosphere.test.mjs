import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";

import {
  ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES,
  getNextEchoRecordGardenAtmospherePhase,
  interpolateEchoRecordGardenAtmospheres,
  resolveEchoRecordGardenAtmosphere,
  resolveEchoRecordGardenAtmosphereProgress,
} from "../src/domain/echo-record-garden-atmosphere.js";
import {
  createEchoRecordGardenVisualSystem,
  updateEchoRecordGardenVisualSystem,
} from "../src/components/echo-record-garden-visual-system.js";

function createVisualSystemHarness() {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const resources = createEchoRecordGardenVisualSystem({ world, scene, renderer: null });
  return { resources, scene, world };
}

test("atmosphere tokens are immutable, ordered, and cover the four scene phases", () => {
  assert.deepEqual(
    ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES.map(({ name }) => name),
    ["sunrise", "high-noon", "sunset", "night"],
  );
  assert.deepEqual(
    ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES.map(({ progress }) => progress),
    [0, 0.32, 0.68, 1],
  );
  assert.equal(Object.isFrozen(ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES), true);
  for (const entry of ECHO_RECORD_GARDEN_ATMOSPHERE_PHASES) {
    assert.equal(Object.isFrozen(entry), true);
  }
});

test("phase resolution accepts names, aliases, objects, and bounded numeric progress", () => {
  assert.equal(resolveEchoRecordGardenAtmosphereProgress("sunrise"), 0);
  assert.equal(resolveEchoRecordGardenAtmosphereProgress("NOON"), 0.32);
  assert.equal(resolveEchoRecordGardenAtmosphereProgress("dusk"), 0.68);
  assert.equal(resolveEchoRecordGardenAtmosphereProgress({ phase: "night" }), 1);
  assert.equal(resolveEchoRecordGardenAtmosphereProgress({ progress: 0.41 }), 0.41);
  assert.equal(resolveEchoRecordGardenAtmosphereProgress(-4), 0);
  assert.equal(resolveEchoRecordGardenAtmosphereProgress(7), 1);
  assert.equal(resolveEchoRecordGardenAtmosphereProgress("unknown"), 0.32);
  assert.equal(getNextEchoRecordGardenAtmospherePhase("sunset").name, "night");
  assert.equal(getNextEchoRecordGardenAtmospherePhase("night").name, "sunrise");
});

test("the pure resolver smooths between tokens and can reuse an output frame", () => {
  const sunrise = resolveEchoRecordGardenAtmosphere("sunrise");
  const noon = resolveEchoRecordGardenAtmosphere("high-noon");
  const output = {};
  const midpoint = resolveEchoRecordGardenAtmosphere(0.16, output);
  assert.equal(midpoint, output);
  assert.equal(midpoint.fromPhase, "sunrise");
  assert.equal(midpoint.toPhase, "high-noon");
  assert.equal(midpoint.blend, 0.5);
  assert.equal(midpoint.sunIntensity, (sunrise.sunIntensity + noon.sunIntensity) / 2);

  const early = resolveEchoRecordGardenAtmosphere(0.08);
  assert.ok(early.blend < 0.25, "smoothstep must ease into a phase rather than jump linearly");
  assert.ok(early.sunIntensity > sunrise.sunIntensity);
  assert.ok(early.sunIntensity < noon.sunIntensity);
});

test("night wraps directly into sunrise without replaying the day in reverse", () => {
  const night = resolveEchoRecordGardenAtmosphere("night");
  const sunrise = resolveEchoRecordGardenAtmosphere("sunrise");
  const midpoint = interpolateEchoRecordGardenAtmospheres("night", "sunrise", 0.5);
  assert.equal(midpoint.fromPhase, "night");
  assert.equal(midpoint.toPhase, "sunrise");
  assert.equal(midpoint.sunIntensity, (night.sunIntensity + sunrise.sunIntensity) / 2);
  assert.notEqual(midpoint.backgroundColor, resolveEchoRecordGardenAtmosphere(0.5).backgroundColor);
});

test("the scene weather target eases through the existing three-light atmosphere", () => {
  const { resources, scene } = createVisualSystemHarness();
  try {
    const environmentBefore = scene.environment;
    const sun = scene.getObjectByName("EchoGardenSunKey");
    const fill = scene.getObjectByName("EchoGardenSkyFill");
    const bounce = scene.getObjectByName("EchoGardenGroundBounce");
    const initialSunColor = sun.color.getHex();
    const initialFogDensity = scene.fog.density;
    const initialCloudOpacity = resources.clouds.children[0].material.opacity;

    assert.equal(resources.setWeatherPhase("night"), 1);
    updateEchoRecordGardenVisualSystem(resources, 0, false);
    const firstFrame = resources.getWeatherState();
    assert.ok(firstFrame.currentProgress > 0.32);
    assert.ok(firstFrame.currentProgress < 1, "weather changes must ease rather than snap");

    for (let frame = 1; frame <= 480; frame += 1) {
      updateEchoRecordGardenVisualSystem(resources, frame / 60, false);
    }
    const settled = resources.getWeatherState();
    assert.equal(settled.targetProgress, 1);
    assert.ok(settled.currentProgress > 0.99);
    assert.notEqual(sun.color.getHex(), initialSunColor);
    assert.ok(sun.intensity < 1);
    assert.ok(scene.fog.density > initialFogDensity);
    assert.ok(resources.clouds.children[0].material.opacity < initialCloudOpacity);
    assert.equal(scene.environment, environmentBefore, "weather updates must not rebuild the PMREM target");

    const lights = [];
    scene.traverse((object) => {
      if (object.isLight) lights.push(object);
    });
    assert.equal(lights.length, 3);
    assert.deepEqual(
      lights.map((light) => light.type).sort(),
      ["DirectionalLight", "DirectionalLight", "HemisphereLight"],
    );
    assert.equal(lights.filter((light) => light.castShadow).length, 1);
    assert.equal(fill.isHemisphereLight, true);
    assert.equal(bounce.castShadow, false);

    assert.equal(resources.setWeatherPhase(), 0, "an omitted phase advances night back to sunrise");
    updateEchoRecordGardenVisualSystem(resources, 9, true);
    assert.equal(resources.getWeatherState().currentProgress, 0);
    assert.equal(resources.getWeatherState().fromPhase, "sunrise");
    assert.equal(resources.getWeatherState().toPhase, "sunrise");
    for (const state of resources.windStates) {
      assert.equal(state.uniforms.uEchoGardenWindTime.value, 0);
      assert.equal(state.uniforms.uEchoGardenWindStrength.value, 0);
    }
  } finally {
    resources.dispose();
  }
});
