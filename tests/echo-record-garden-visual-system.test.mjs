import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  ECHO_RECORD_GARDEN_VISUAL_PROFILE,
  sampleEchoGardenSurface,
} from "../src/components/echo-record-garden-visual-system.js";

const source = await readFile(
  new URL("../src/components/echo-record-garden-visual-system.js", import.meta.url),
  "utf8",
);

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

test("material maps share a height field and are configured for stable distance viewing", () => {
  assert.match(source, /const heights = new Float32Array/);
  assert.match(source, /const height = heights\[pixel\]/);
  assert.match(source, /const dx = \(sample\(x \+ 1, y\) - sample\(x - 1, y\)\)/);
  assert.match(source, /new THREE\.DataTexture\(albedo/);
  assert.match(source, /new THREE\.DataTexture\(normals/);
  assert.match(source, /texture\.wrapS = THREE\.RepeatWrapping/);
  assert.match(source, /texture\.wrapT = THREE\.RepeatWrapping/);
  assert.match(source, /texture\.minFilter = THREE\.LinearMipmapLinearFilter/);
  assert.match(source, /if \(color\) texture\.colorSpace = THREE\.SRGBColorSpace/);
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
  assert.match(source, /new THREE\.Vector3\(Math\.cos\(angle\) \* radius, 0\.02 \+ \(index % 3\) \* 0\.04, Math\.sin\(angle\) \* radius\)/);
  assert.match(source, /const geometries = new Set\(\)/);
  assert.match(source, /const materials = new Set\(\)/);
  assert.match(source, /Object\.values\(materialKit\.materials\)\.forEach\(\(material\) => materials\.add\(material\)\)/);
  assert.match(source, /if \(disposed\) return/);
  assert.match(source, /if \(reducedMotion\) \{[\s\S]*?resources\.clouds\.position\.set\(0, 0, 0\)/);
  assert.match(source, /resources\.windChime\.rotation\.set\(0, 0, 0\)/);
  assert.match(source, /resources\.leafDrift\.rotation\.set\(0, 0, 0\)/);
});

test("the sky-derived environment response can be rebuilt after context restoration", () => {
  assert.match(source, /const rebuildEnvironmentResponse = \(\) => \{/);
  assert.match(source, /const staleTarget = environmentTarget/);
  assert.match(source, /environmentTarget = pmrem\.fromEquirectangular\(skyTexture\)/);
  assert.match(source, /staleTarget\?\.dispose\?\.\(\)/);
  assert.match(source, /rebuildEnvironmentResponse,/);
});
