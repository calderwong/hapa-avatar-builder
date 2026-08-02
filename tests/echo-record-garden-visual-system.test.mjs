import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import * as THREE from "three";
import { ECHO_RECORD_GARDEN_SPATIAL_LAYOUT } from "../src/domain/echo-record-garden-spatial-layout.js";

import {
  ECHO_RECORD_GARDEN_VISUAL_PROFILE,
  createEchoGardenLayout,
  createEchoRecordGardenVisualSystem,
  sampleEchoGardenSurface,
  updateEchoRecordGardenVisualSystem,
} from "../src/components/echo-record-garden-visual-system.js";

const source = await readFile(
  new URL("../src/components/echo-record-garden-visual-system.js", import.meta.url),
  "utf8",
);

function createVisualSystemHarness() {
  const scene = new THREE.Scene();
  const world = new THREE.Group();
  scene.add(world);
  const resources = createEchoRecordGardenVisualSystem({ world, scene, renderer: null });
  return { resources, scene, world };
}

test("procedural surface fields are deterministic and tile seamlessly", () => {
  for (const kind of ["organic", "soil", "wood", "bark", "weave"]) {
    const first = sampleEchoGardenSurface(0.317, 0.619, 91, kind);
    assert.equal(first, sampleEchoGardenSurface(0.317, 0.619, 91, kind));
    assert.ok(Math.abs(sampleEchoGardenSurface(0, 0.41, 91, kind)
      - sampleEchoGardenSurface(1, 0.41, 91, kind)) < 1e-10);
    assert.ok(Math.abs(sampleEchoGardenSurface(0.67, 0, 91, kind)
      - sampleEchoGardenSurface(0.67, 1, 91, kind)) < 1e-10);
  }
  assert.doesNotMatch(source, /Math\.random/);
});

test("the v2 profile declares adapted lineage and cached material families", () => {
  assert.match(ECHO_RECORD_GARDEN_VISUAL_PROFILE.id, /-v2$/);
  assert.equal(
    ECHO_RECORD_GARDEN_VISUAL_PROFILE.sourcePattern,
    "pallet-town-3d-mit-adapted-system-transfer-v2",
  );
  assert.match(
    ECHO_RECORD_GARDEN_VISUAL_PROFILE.textureStrategy,
    /deterministic.*cached.*material.?famil/i,
  );
});

test("surface families expose deterministic albedo, normal, and roughness maps", () => {
  const first = createVisualSystemHarness();
  const second = createVisualSystemHarness();
  try {
    for (const role of ["grass", "soil", "wood", "bark", "textile"]) {
      const firstMaterial = first.resources.materialKit.materials[role];
      const secondMaterial = second.resources.materialKit.materials[role];
      assert.ok(firstMaterial.map, `${role} must expose an albedo map`);
      assert.ok(firstMaterial.normalMap, `${role} must expose a normal map`);
      assert.ok(firstMaterial.roughnessMap, `${role} must expose a roughness map`);
      assert.equal(firstMaterial.map.colorSpace, THREE.SRGBColorSpace);
      assert.equal(firstMaterial.normalMap.colorSpace, THREE.NoColorSpace);
      assert.equal(firstMaterial.roughnessMap.colorSpace, THREE.NoColorSpace);
      assert.equal(firstMaterial.map.wrapS, THREE.RepeatWrapping);
      assert.equal(firstMaterial.normalMap.wrapT, THREE.RepeatWrapping);
      assert.equal(firstMaterial.roughnessMap.wrapS, THREE.RepeatWrapping);
      assert.deepEqual(
        firstMaterial.roughnessMap.image.data,
        secondMaterial.roughnessMap.image.data,
        `${role} roughness pixels must be stable across identical bakes`,
      );
      assert.ok(
        new Set(firstMaterial.roughnessMap.image.data).size > 1,
        `${role} roughness must carry surface variation rather than a flat scalar`,
      );
    }

    for (const [primary, related] of [
      ["grass", "foliage"],
      ["soil", "stone"],
      ["textile", "paper"],
    ]) {
      const primaryMaterial = first.resources.materialKit.materials[primary];
      const relatedMaterial = first.resources.materialKit.materials[related];
      assert.equal(relatedMaterial.map, primaryMaterial.map);
      assert.equal(relatedMaterial.normalMap, primaryMaterial.normalMap);
      assert.equal(relatedMaterial.roughnessMap, primaryMaterial.roughnessMap);
    }
  } finally {
    first.resources.dispose();
    second.resources.dispose();
  }
});

test("runtime metrics keep the authored world dense while exposing adaptive quality", () => {
  const { resources } = createVisualSystemHarness();
  try {
    const { metrics } = resources;
    assert.ok(metrics.authoredSetPieceCount >= 8);
    assert.ok(metrics.instancedDetailCount >= 600);
    assert.ok(metrics.sharedSurfaceTextures >= 18);
    assert.ok(metrics.sharedSurfaceTextures <= 48, "surface textures must remain inside the declared budget");
    assert.ok(metrics.materialRoles >= 14);
    assert.deepEqual(metrics.qualityTiers, ["reduced", "full"]);
    assert.equal(metrics.adaptiveDetail, true);
    assert.equal(metrics.activeLights, ECHO_RECORD_GARDEN_VISUAL_PROFILE.activeLights);
    assert.equal(metrics.shadowCastingLights, ECHO_RECORD_GARDEN_VISUAL_PROFILE.shadowCastingLights);
    assert.ok(metrics.postProcessingPasses <= 1);
  } finally {
    resources.dispose();
  }
});

test("authored scatter stays deterministic, clustered, and outside the interaction quiet zones", () => {
  const first = createEchoGardenLayout(9127);
  const second = createEchoGardenLayout(9127);
  assert.deepEqual(first, second);
  const allPoints = Object.values(first).flat();
  assert.ok(allPoints.length >= 700);
  for (const point of allPoints) {
    assert.ok(Math.hypot(point.x, point.z) <= 16.2);
    assert.equal(Math.abs(point.x) < 6.2 && point.z > -4.1 && point.z < 4, false);
    assert.equal(Math.abs(point.x) < 4.7 && point.z > -7.2 && point.z <= -4.1, false);
  }
  const colorByCluster = new Map();
  for (const flower of first.flowers) {
    if (!colorByCluster.has(flower.clusterIndex)) colorByCluster.set(flower.clusterIndex, flower.color);
    assert.equal(flower.color, colorByCluster.get(flower.clusterIndex));
  }
});

test("the enlarged Director screen keeps physical scenery outside its protected volume", () => {
  const { resources } = createVisualSystemHarness();
  try {
    const layout = ECHO_RECORD_GARDEN_SPATIAL_LAYOUT;
    const frame = resources.environment.getObjectByName("EchoGardenDirectorScreenStructure");
    const planters = resources.environment.getObjectByName("EchoGardenDirectorPlanters");
    const parasol = resources.environment.getObjectByName("EchoGardenParasol");
    assert.deepEqual(resources.tableStage.position.toArray(), [0, 0, layout.tableStage.z]);
    assert.deepEqual(frame.position.toArray(), Object.values(layout.directorFrame.position));
    assert.deepEqual(frame.scale.toArray(), Object.values(layout.directorFrame.scale));
    assert.deepEqual(parasol.position.toArray(), Object.values(layout.parasol));

    const tableRearEdge = layout.tableStage.z - 5.9 / 2;
    const screenFront = layout.screen.z + layout.screenHalfDepth;
    assert.ok(tableRearEdge > screenFront + 1.1, "table and screen need a generous depth gap");
    const screenBack = layout.screen.z - layout.screenHalfDepth;
    const shadeForwardEdge = layout.directorFrame.position.z + 0.24 + 1.2 / 2 + 0.02;
    assert.ok(shadeForwardEdge < screenBack - 0.1, "screen structure must remain behind the screen face");

    const innerFrameEdge = 4.04 * layout.directorFrame.scale.x
      - (0.22 * layout.directorFrame.scale.x) / 2;
    assert.ok(innerFrameEdge > layout.screenHalfWidth, "frame posts must sit outside the screen face");
    const nearestPlanterEdge = layout.directorPlanters.x - 0.38;
    assert.ok(nearestPlanterEdge > layout.screenHalfWidth, "planters must clear the screen sides");
    const parasolNearestEdge = Math.abs(layout.parasol.x) - 3.5;
    assert.ok(parasolNearestEdge > layout.screenHalfWidth, "parasol canopy must clear the screen sides");
    assert.equal(planters.children.length > 0, true);
  } finally {
    resources.dispose();
  }
});

test("one shared wind clock moves foliage and resolves to a stable reduced-motion state", () => {
  const { resources } = createVisualSystemHarness();
  try {
    assert.ok(resources.windStates.length >= 4);
    updateEchoRecordGardenVisualSystem(resources, 2.5, false);
    for (const state of resources.windStates) {
      assert.equal(state.uniforms.uEchoGardenWindTime.value, 2.5);
      assert.equal(state.uniforms.uEchoGardenWindStrength.value, state.amplitude);
    }
    updateEchoRecordGardenVisualSystem(resources, 8.2, true);
    for (const state of resources.windStates) {
      assert.equal(state.uniforms.uEchoGardenWindTime.value, 0);
      assert.equal(state.uniforms.uEchoGardenWindStrength.value, 0);
    }
  } finally {
    resources.dispose();
  }
});

test("material maps share a height field and are configured for stable distance viewing", () => {
  assert.match(source, /const heights = new Float32Array/);
  assert.match(source, /const height = heights\[pixel\]/);
  assert.match(source, /const dx = \(topLeft \+ left \* 2 \+ bottomLeft - topRight - right \* 2 - bottomRight\)/);
  assert.match(source, /new THREE\.DataTexture\(baked\.albedo/);
  assert.match(source, /new THREE\.DataTexture\(baked\.normals/);
  assert.match(source, /new THREE\.DataTexture\(baked\.roughness/);
  assert.match(source, /texture\.wrapS = THREE\.RepeatWrapping/);
  assert.match(source, /texture\.wrapT = THREE\.RepeatWrapping/);
  assert.match(source, /texture\.minFilter = THREE\.LinearMipmapLinearFilter/);
  assert.match(source, /texture\.colorSpace = color \? THREE\.SRGBColorSpace : THREE\.NoColorSpace/);
  assert.match(source, /texture\.anisotropy = Math\.min\(8/);
});

test("the atmosphere uses the bounded three-light rig and one shadow caster", () => {
  assert.equal(ECHO_RECORD_GARDEN_VISUAL_PROFILE.activeLights, 3);
  assert.equal(ECHO_RECORD_GARDEN_VISUAL_PROFILE.shadowCastingLights, 1);
  assert.equal((source.match(/new THREE\.DirectionalLight/g) || []).length, 2);
  assert.equal((source.match(/new THREE\.HemisphereLight/g) || []).length, 1);
  assert.equal((source.match(/new THREE\.PointLight/g) || []).length, 0);
  assert.equal((source.match(/castShadow = true/g) || []).filter((_, index) => index >= 0).length > 0, true);
  assert.match(source, /const sun = new THREE\.DirectionalLight/);
  assert.match(source, /sun\.castShadow = true/);
  assert.match(source, /const bounce = new THREE\.DirectionalLight/);
  assert.doesNotMatch(source, /bounce\.castShadow = true/);
  assert.match(source, /new THREE\.PMREMGenerator\(renderer\)/);
  assert.match(source, /scene\.fog = new THREE\.FogExp2/);
});

test("scene dressing is instanced, rounded, disposable, and reduced-motion safe", () => {
  assert.match(source, /new RoundedBoxGeometry/);
  assert.match(source, /new THREE\.InstancedMesh/);
  assert.match(source, /export function createEchoGardenLayout/);
  assert.match(source, /const hedgeRng = makeGardenRng/);
  assert.match(source, /sampleClusteredGardenPoints/);
  assert.match(source, /const geometries = new Set\(\)/);
  assert.match(source, /const materials = new Set\(\)/);
  assert.match(source, /Object\.values\(materialKit\.materials\)\.forEach\(\(material\) => materials\.add\(material\)\)/);
  assert.match(source, /if \(disposed\) return/);
  assert.match(source, /if \(reducedMotion\) \{[\s\S]*?resources\.clouds\.position\.set\(0, 0, 0\)/);
  assert.match(source, /resources\.windChime\.rotation\.set\(0, 0, 0\)/);
  assert.match(source, /resources\.leafDrift\.rotation\.set\(0, 0, 0\)/);
  assert.match(source, /state\.uniforms\.uEchoGardenWindStrength\.value = 0/);
});

test("the sky-derived environment response can be rebuilt after context restoration", () => {
  assert.match(source, /const rebuildEnvironmentResponse = \(\) => \{/);
  assert.match(source, /const staleTarget = environmentTarget/);
  assert.match(source, /environmentTarget = pmrem\.fromEquirectangular\(skyTexture\)/);
  assert.match(source, /staleTarget\?\.dispose\?\.\(\)/);
  assert.match(source, /rebuildEnvironmentResponse,/);
});
