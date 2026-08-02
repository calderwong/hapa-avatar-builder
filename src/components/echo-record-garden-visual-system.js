import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const ECHO_RECORD_GARDEN_VISUAL_PROFILE = Object.freeze({
  id: "echo-record-garden-sunwashed-diorama-v1",
  sourcePattern: "pallet-town-3d-inspired-system-transfer",
  activeLights: 3,
  shadowCastingLights: 1,
  textureStrategy: "deterministic-shared-surface-fields",
  composition: "dense-ground-clean-hero-plane-layered-horizon",
});

export const ECHO_RECORD_GARDEN_PALETTE = Object.freeze({
  skyZenith: 0x5595d6,
  skyHorizon: 0xc8e5ed,
  haze: 0xbcd9d7,
  sun: 0xfff0cf,
  grassLight: 0x7cad56,
  grassMid: 0x5f8d50,
  grassShadow: 0x365f42,
  foliageLight: 0x82b85a,
  foliageMid: 0x4d7d4d,
  foliageShadow: 0x2f583c,
  soilLight: 0xc9aa7d,
  soilDark: 0x8e6848,
  woodLight: 0xa87545,
  woodMid: 0x7f5435,
  woodDark: 0x3f2a22,
  stoneLight: 0xc2beb0,
  stoneDark: 0x777b70,
  cream: 0xf1ead9,
  canvas: 0xe4b66f,
  rose: 0xef8fa8,
  amber: 0xf4c86a,
  cyan: 0x56f0cf,
  vinyl: 0x17181c,
});

const TWO_PI = Math.PI * 2;

function fract(value) {
  return value - Math.floor(value);
}

function smooth(value) {
  const clamped = THREE.MathUtils.clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function periodicWave(u, v, frequency, phase) {
  return (
    Math.sin((u * frequency + phase) * TWO_PI)
    + Math.cos((v * frequency - phase * 1.7) * TWO_PI)
    + Math.sin(((u + v) * frequency + phase * 0.61) * TWO_PI)
  ) / 3;
}

/**
 * A deterministic, tileable surface field. It intentionally uses only
 * periodic functions so opposite texture edges agree without a stitching pass.
 */
export function sampleEchoGardenSurface(u, v, seed = 1, kind = "organic") {
  const phase = fract(Math.sin(seed * 17.171) * 43758.5453);
  let value = 0;
  let amplitude = 0.58;
  let frequency = 1;
  for (let octave = 0; octave < 4; octave += 1) {
    value += periodicWave(u, v, frequency, phase + octave * 0.173) * amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  if (kind === "wood") {
    const warp = value * 0.065;
    const grain = Math.sin((v + warp + phase * 0.2) * TWO_PI * 18);
    const fine = Math.sin((v - warp * 0.35) * TWO_PI * 41) * 0.25;
    return THREE.MathUtils.clamp(grain * 0.56 + fine + value * 0.22, -1, 1);
  }
  if (kind === "weave") {
    const warp = Math.sin((u * 28 + phase) * TWO_PI);
    const weft = Math.sin((v * 24 - phase) * TWO_PI);
    return THREE.MathUtils.clamp((warp + weft) * 0.31 + value * 0.24, -1, 1);
  }
  if (kind === "soil") {
    const grit = periodicWave(u, v, 17, phase + 0.37) * 0.22;
    return THREE.MathUtils.clamp(value * 0.75 + grit, -1, 1);
  }
  if (kind === "bark") {
    const ridges = Math.sin((u + value * 0.04) * TWO_PI * 13);
    return THREE.MathUtils.clamp(ridges * 0.58 + value * 0.34, -1, 1);
  }
  return THREE.MathUtils.clamp(value, -1, 1);
}

function rgbFromHex(hex) {
  return [
    ((hex >> 16) & 255) / 255,
    ((hex >> 8) & 255) / 255,
    (hex & 255) / 255,
  ];
}

function mixRgb(a, b, amount) {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function toByte(value) {
  return Math.round(THREE.MathUtils.clamp(value, 0, 1) * 255);
}

function configureTexture(texture, renderer, repeat = 1, color = false) {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.anisotropy = Math.min(8, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  if (color) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function createSurfaceMaps(renderer, {
  key,
  kind,
  seed,
  dark,
  light,
  repeat,
  normalStrength = 1.7,
  size = 128,
}) {
  const darkRgb = rgbFromHex(dark);
  const lightRgb = rgbFromHex(light);
  const heights = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      heights[y * size + x] = sampleEchoGardenSurface(x / size, y / size, seed, kind);
    }
  }

  const albedo = new Uint8Array(size * size * 4);
  const normals = new Uint8Array(size * size * 4);
  const sample = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const pixel = y * size + x;
      const height = heights[pixel];
      const tonal = smooth(height * 0.5 + 0.5);
      const color = mixRgb(darkRgb, lightRgb, 0.18 + tonal * 0.7);
      albedo[pixel * 4] = toByte(color[0]);
      albedo[pixel * 4 + 1] = toByte(color[1]);
      albedo[pixel * 4 + 2] = toByte(color[2]);
      albedo[pixel * 4 + 3] = 255;

      const dx = (sample(x + 1, y) - sample(x - 1, y)) * normalStrength;
      const dy = (sample(x, y + 1) - sample(x, y - 1)) * normalStrength;
      const inverseLength = 1 / Math.hypot(dx, dy, 2);
      normals[pixel * 4] = toByte((-dx * inverseLength) * 0.5 + 0.5);
      normals[pixel * 4 + 1] = toByte((-dy * inverseLength) * 0.5 + 0.5);
      normals[pixel * 4 + 2] = toByte((2 * inverseLength) * 0.5 + 0.5);
      normals[pixel * 4 + 3] = 255;
    }
  }

  const map = configureTexture(
    new THREE.DataTexture(albedo, size, size, THREE.RGBAFormat),
    renderer,
    repeat,
    true,
  );
  map.name = `EchoGarden.${key}.albedo`;
  const normalMap = configureTexture(
    new THREE.DataTexture(normals, size, size, THREE.RGBAFormat),
    renderer,
    repeat,
    false,
  );
  normalMap.name = `EchoGarden.${key}.normal`;
  return { map, normalMap };
}

function createSkyTexture(renderer) {
  const width = 512;
  const height = 256;
  const data = new Uint8Array(width * height * 4);
  const zenith = rgbFromHex(ECHO_RECORD_GARDEN_PALETTE.skyZenith);
  const horizon = rgbFromHex(ECHO_RECORD_GARDEN_PALETTE.skyHorizon);
  const sun = rgbFromHex(ECHO_RECORD_GARDEN_PALETTE.sun);
  for (let y = 0; y < height; y += 1) {
    const v = y / (height - 1);
    const horizonWeight = Math.exp(-Math.pow((v - 0.54) / 0.21, 2));
    const base = mixRgb(zenith, horizon, 0.18 + horizonWeight * 0.82);
    for (let x = 0; x < width; x += 1) {
      const u = x / (width - 1);
      const du = Math.min(Math.abs(u - 0.64), 1 - Math.abs(u - 0.64));
      const dv = v - 0.34;
      const halo = Math.exp(-(du * du * 42 + dv * dv * 92));
      const thinCloud = Math.max(0, periodicWave(u, v, 3, 0.41) - 0.28)
        * Math.exp(-Math.pow((v - 0.47) / 0.17, 2));
      const sky = mixRgb(base, sun, THREE.MathUtils.clamp(halo * 0.82 + thinCloud * 0.24, 0, 0.86));
      const pixel = (y * width + x) * 4;
      data[pixel] = toByte(sky[0]);
      data[pixel + 1] = toByte(sky[1]);
      data[pixel + 2] = toByte(sky[2]);
      data[pixel + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  texture.name = "EchoGarden.SkyGradient";
  texture.anisotropy = Math.min(4, renderer?.capabilities?.getMaxAnisotropy?.() || 1);
  return texture;
}

function createCloudTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / (size - 1) * 2 - 1;
      const v = y / (size - 1) * 2 - 1;
      const lobes = [
        [u * 1.15 + 0.42, v * 1.5 + 0.02, 1],
        [u * 1.05 - 0.08, v * 1.32 - 0.14, 1.2],
        [u * 1.2 - 0.48, v * 1.55 + 0.08, 0.88],
      ];
      let density = 0;
      for (const [lx, ly, scale] of lobes) {
        density = Math.max(density, 1 - Math.sqrt(lx * lx + ly * ly) * scale);
      }
      density = smooth(THREE.MathUtils.clamp(density * 1.55, 0, 1));
      const pixel = (y * size + x) * 4;
      data[pixel] = 245;
      data[pixel + 1] = 244;
      data[pixel + 2] = 232;
      data[pixel + 3] = toByte(density * 0.72);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.name = "EchoGarden.CloudSilhouette";
  return texture;
}

function materialClone(material, overrides = {}) {
  const clone = material.clone();
  for (const [key, value] of Object.entries(overrides)) {
    if (key === "color" || key === "emissive") clone[key]?.setHex?.(value);
    else clone[key] = value;
  }
  clone.needsUpdate = true;
  return clone;
}

function createMaterialKit(renderer) {
  const maps = {
    grass: createSurfaceMaps(renderer, {
      key: "grass",
      kind: "organic",
      seed: 91,
      dark: ECHO_RECORD_GARDEN_PALETTE.grassShadow,
      light: ECHO_RECORD_GARDEN_PALETTE.grassLight,
      repeat: 8,
      normalStrength: 1.35,
    }),
    soil: createSurfaceMaps(renderer, {
      key: "soil",
      kind: "soil",
      seed: 211,
      dark: ECHO_RECORD_GARDEN_PALETTE.soilDark,
      light: ECHO_RECORD_GARDEN_PALETTE.soilLight,
      repeat: 6,
      normalStrength: 1.7,
    }),
    wood: createSurfaceMaps(renderer, {
      key: "wood",
      kind: "wood",
      seed: 307,
      dark: ECHO_RECORD_GARDEN_PALETTE.woodDark,
      light: ECHO_RECORD_GARDEN_PALETTE.woodLight,
      repeat: 2.4,
      normalStrength: 1.2,
    }),
    bark: createSurfaceMaps(renderer, {
      key: "bark",
      kind: "bark",
      seed: 421,
      dark: 0x30251f,
      light: 0x886342,
      repeat: 3.5,
      normalStrength: 2.1,
    }),
    textile: createSurfaceMaps(renderer, {
      key: "textile",
      kind: "weave",
      seed: 617,
      dark: 0xa66f48,
      light: 0xf0d4a0,
      repeat: 7,
      normalStrength: 0.95,
    }),
  };
  const materials = {
    grass: new THREE.MeshStandardMaterial({
      map: maps.grass.map,
      normalMap: maps.grass.normalMap,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.94,
      metalness: 0,
    }),
    soil: new THREE.MeshStandardMaterial({
      map: maps.soil.map,
      normalMap: maps.soil.normalMap,
      normalScale: new THREE.Vector2(0.34, 0.34),
      roughness: 0.9,
      metalness: 0,
    }),
    wood: new THREE.MeshStandardMaterial({
      map: maps.wood.map,
      normalMap: maps.wood.normalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.64,
      metalness: 0.02,
      envMapIntensity: 0.68,
    }),
    deepWood: new THREE.MeshStandardMaterial({
      color: 0x755039,
      map: maps.wood.map,
      normalMap: maps.wood.normalMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.77,
      metalness: 0.01,
      envMapIntensity: 0.55,
    }),
    bark: new THREE.MeshStandardMaterial({
      map: maps.bark.map,
      normalMap: maps.bark.normalMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.94,
      metalness: 0,
    }),
    foliage: new THREE.MeshStandardMaterial({
      color: ECHO_RECORD_GARDEN_PALETTE.foliageMid,
      map: maps.grass.map,
      normalMap: maps.grass.normalMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.82,
      metalness: 0,
      side: THREE.DoubleSide,
      vertexColors: true,
      envMapIntensity: 0.72,
    }),
    textile: new THREE.MeshStandardMaterial({
      color: 0xffe1b4,
      map: maps.textile.map,
      normalMap: maps.textile.normalMap,
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughness: 0.88,
      side: THREE.DoubleSide,
      envMapIntensity: 0.45,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: ECHO_RECORD_GARDEN_PALETTE.stoneLight,
      map: maps.soil.map,
      normalMap: maps.soil.normalMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.86,
      metalness: 0,
    }),
    ceramic: new THREE.MeshPhysicalMaterial({
      color: ECHO_RECORD_GARDEN_PALETTE.cream,
      roughness: 0.34,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.86,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xd9b77b,
      roughness: 0.24,
      metalness: 0.88,
      envMapIntensity: 1.12,
    }),
    charcoal: new THREE.MeshStandardMaterial({
      color: ECHO_RECORD_GARDEN_PALETTE.vinyl,
      roughness: 0.38,
      metalness: 0.48,
      envMapIntensity: 0.82,
    }),
    paper: new THREE.MeshStandardMaterial({
      color: 0xf1e5c9,
      map: maps.textile.map,
      normalMap: maps.textile.normalMap,
      normalScale: new THREE.Vector2(0.08, 0.08),
      roughness: 0.78,
      metalness: 0,
    }),
  };
  Object.entries(materials).forEach(([key, material]) => {
    material.name = `EchoGarden.${key}`;
  });
  const textures = Object.values(maps).flatMap((value) => [value.map, value.normalMap]);
  return {
    materials,
    textures,
    clone(role, overrides = {}) {
      const source = materials[role] || materials.wood;
      return materialClone(source, overrides);
    },
  };
}

function rounded(width, height, depth, radius = 0.08, segments = 3) {
  const maxRadius = Math.min(width, height, depth) * 0.45;
  return new RoundedBoxGeometry(width, height, depth, segments, Math.min(radius, maxRadius));
}

export function createEchoGardenRoundedBoxGeometry(width, height, depth, radius = 0.08, segments = 3) {
  return rounded(width, height, depth, radius, segments);
}

function placeInstanced(mesh, index, position, rotation, scale, matrix = new THREE.Matrix4()) {
  matrix.compose(position, rotation, scale);
  mesh.setMatrixAt(index, matrix);
}

function createGardenPavilion(materialKit, x, z, accent, mirrored = false) {
  const group = new THREE.Group();
  group.name = mirrored ? "GardenPavilionEast" : "GardenPavilionWest";
  group.position.set(x, 0, z);
  const base = new THREE.Mesh(rounded(3.35, 2.15, 2.55, 0.18, 4), materialKit.clone("paper", { color: 0xe8dcc2 }));
  base.position.y = 0.5;
  base.castShadow = true;
  base.receiveShadow = true;
  group.add(base);
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(2.35, 1.05, 4, 1, false),
    materialKit.clone("textile", { color: accent, roughness: 0.72 }),
  );
  roof.position.y = 2.02;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  const door = new THREE.Mesh(rounded(0.86, 1.45, 0.12, 0.07, 3), materialKit.clone("deepWood"));
  door.position.set(mirrored ? -0.65 : 0.65, 0.34, 1.31);
  group.add(door);
  const windowMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd99c,
    transparent: true,
    opacity: 0.5,
    toneMapped: false,
  });
  windowMaterial.name = "EchoGarden.pavilionWindow";
  const window = new THREE.Mesh(rounded(0.9, 0.68, 0.04, 0.05, 3), windowMaterial);
  window.position.set(mirrored ? 0.62 : -0.62, 0.75, 1.39);
  group.add(window);
  return group;
}

function createCloudLayer(environment, cloudTexture) {
  const clouds = new THREE.Group();
  clouds.name = "EchoGardenHeroClouds";
  const cloudMaterial = new THREE.SpriteMaterial({
    map: cloudTexture,
    color: 0xfffcf0,
    transparent: true,
    opacity: 0.64,
    depthWrite: false,
    toneMapped: false,
    fog: true,
  });
  const placements = [
    [-11, 11.5, -20, 7.8, 3.2, 0.0],
    [9, 13.4, -24, 6.4, 2.7, 0.8],
    [15, 10.8, -7, 5.6, 2.3, 1.6],
    [-17, 14.2, 3, 6.9, 2.8, 2.4],
  ];
  placements.forEach(([x, y, z, width, height, phase]) => {
    const cloud = new THREE.Sprite(cloudMaterial);
    cloud.position.set(x, y, z);
    cloud.scale.set(width, height, 1);
    cloud.userData.homeX = x;
    cloud.userData.homeY = y;
    cloud.userData.phase = phase;
    clouds.add(cloud);
  });
  environment.add(clouds);
  return clouds;
}

function createAmbientLeafDrift(environment) {
  const positions = new Float32Array(18 * 3);
  for (let index = 0; index < 18; index += 1) {
    const phase = index * 2.399963;
    positions[index * 3] = Math.cos(phase) * (4.5 + (index % 5) * 1.1);
    positions[index * 3 + 1] = 0.45 + (index % 6) * 0.72;
    positions[index * 3 + 2] = Math.sin(phase) * (4.2 + (index % 4) * 1.4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xd9b56b,
    size: 0.055,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
  });
  const drift = new THREE.Points(geometry, material);
  drift.name = "EchoGardenLeafDrift";
  environment.add(drift);
  return drift;
}

export function createEchoRecordGardenVisualSystem({ world, scene, renderer }) {
  const materialKit = createMaterialKit(renderer);
  const environment = new THREE.Group();
  environment.name = "LazySundayGardenEnvironment";
  world.add(environment);

  const previousEnvironment = scene.environment;
  const previousEnvironmentIntensity = scene.environmentIntensity;
  const previousBackground = scene.background;
  const previousFog = scene.fog;
  const skyTexture = createSkyTexture(renderer);
  const skyGeometry = new THREE.SphereGeometry(44, 32, 18);
  const skyMaterial = new THREE.MeshBasicMaterial({
    map: skyTexture,
    side: THREE.BackSide,
    toneMapped: false,
    fog: false,
  });
  skyMaterial.name = "EchoGarden.sky";
  const skyDome = new THREE.Mesh(skyGeometry, skyMaterial);
  skyDome.name = "EchoGardenSkyDome";
  skyDome.position.y = 4;
  skyDome.renderOrder = -100;
  environment.add(skyDome);
  scene.background = new THREE.Color(ECHO_RECORD_GARDEN_PALETTE.skyHorizon);
  scene.fog = new THREE.FogExp2(ECHO_RECORD_GARDEN_PALETTE.haze, 0.0165);

  let environmentTarget = null;
  let disposed = false;
  const rebuildEnvironmentResponse = () => {
    if (!renderer || disposed) return false;
    const staleTarget = environmentTarget;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    environmentTarget = pmrem.fromEquirectangular(skyTexture);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = 0.72;
    pmrem.dispose();
    staleTarget?.dispose?.();
    return true;
  };
  rebuildEnvironmentResponse();

  const grass = new THREE.Mesh(new THREE.CircleGeometry(25, 96), materialKit.materials.grass);
  grass.name = "EchoGardenTexturedLawn";
  grass.rotation.x = -Math.PI / 2;
  grass.position.y = -0.6;
  grass.receiveShadow = true;
  environment.add(grass);

  const path = new THREE.Mesh(
    new THREE.RingGeometry(8.8, 13.5, 96, 2, 0.42, 2.3),
    materialKit.materials.soil,
  );
  path.name = "EchoGardenTexturedPath";
  path.rotation.x = -Math.PI / 2;
  path.position.y = -0.575;
  path.receiveShadow = true;
  environment.add(path);

  const farHillsGeometry = new THREE.DodecahedronGeometry(1, 1);
  const farHillsMaterial = materialKit.clone("foliage", {
    color: 0x5f8066,
    roughness: 0.94,
  });
  farHillsMaterial.vertexColors = false;
  farHillsMaterial.needsUpdate = true;
  const farHills = new THREE.InstancedMesh(farHillsGeometry, farHillsMaterial, 14);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < 14; index += 1) {
    const angle = (index / 14) * TWO_PI + 0.12;
    const radius = 22.5 + (index % 3) * 1.4;
    placeInstanced(
      farHills,
      index,
      new THREE.Vector3(Math.cos(angle) * radius, 1.1 + (index % 4) * 0.25, Math.sin(angle) * radius),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, 0)),
      new THREE.Vector3(5.1 + (index % 3), 2.8 + (index % 4) * 0.35, 4.2),
      matrix,
    );
  }
  farHills.receiveShadow = false;
  environment.add(farHills);

  const table = new THREE.Mesh(rounded(9.4, 0.34, 5.9, 0.13, 5), materialKit.materials.wood);
  table.name = "EchoGardenSunWornTable";
  table.position.y = -0.22;
  table.receiveShadow = true;
  table.castShadow = true;
  environment.add(table);
  const apron = new THREE.Mesh(rounded(9.2, 0.38, 5.66, 0.1, 4), materialKit.materials.deepWood);
  apron.position.y = -0.47;
  apron.castShadow = true;
  environment.add(apron);

  for (let index = -2; index <= 2; index += 1) {
    const plank = new THREE.Mesh(
      rounded(9.16, 0.038, 1.02, 0.022, 2),
      materialKit.clone("wood", {
        color: index % 2 === 0 ? 0xfff4e6 : 0xe8d4bd,
        roughness: 0.66 + Math.abs(index) * 0.025,
      }),
    );
    plank.name = `EchoGardenTablePlank${index + 3}`;
    plank.position.set(0, -0.032, index * 1.08);
    plank.rotation.y = index * 0.0018;
    plank.receiveShadow = true;
    environment.add(plank);
  }

  const legGeometry = rounded(0.48, 2.3, 0.48, 0.08, 4);
  for (const [x, z] of [[-4.1, -2.35], [4.1, -2.35], [-4.1, 2.35], [4.1, 2.35]]) {
    const leg = new THREE.Mesh(legGeometry, materialKit.materials.deepWood);
    leg.position.set(x, -1.55, z);
    leg.castShadow = true;
    leg.receiveShadow = true;
    environment.add(leg);
  }

  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(4.4, 3.5, 16, 12),
    materialKit.materials.textile,
  );
  cloth.name = "EchoGardenWovenPicnicCloth";
  cloth.rotation.x = -Math.PI / 2;
  cloth.rotation.z = -0.04;
  cloth.position.set(-2.2, -0.006, 0.05);
  cloth.receiveShadow = true;
  environment.add(cloth);

  const parasolRoot = new THREE.Group();
  parasolRoot.name = "EchoGardenParasol";
  parasolRoot.position.set(-5.35, 1.7, -2.8);
  parasolRoot.rotation.z = -0.06;
  environment.add(parasolRoot);
  const parasolPole = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.09, 6.2, 16),
    materialKit.materials.brass,
  );
  parasolPole.castShadow = true;
  parasolRoot.add(parasolPole);
  const canopyMaterial = materialKit.clone("textile", {
    color: ECHO_RECORD_GARDEN_PALETTE.canvas,
    roughness: 0.78,
  });
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(3.5, 1.05, 32, 2, true), canopyMaterial);
  canopy.position.y = 3.08;
  canopy.rotation.y = Math.PI / 32;
  canopy.castShadow = true;
  parasolRoot.add(canopy);
  const canopyTrim = new THREE.Mesh(
    new THREE.TorusGeometry(3.48, 0.055, 6, 48),
    materialKit.clone("textile", { color: 0xf0d39b, roughness: 0.74 }),
  );
  canopyTrim.position.y = 2.56;
  canopyTrim.rotation.x = Math.PI / 2;
  parasolRoot.add(canopyTrim);

  const windChime = new THREE.Group();
  windChime.name = "EchoGardenWindChime";
  windChime.position.set(2.1, 2.32, 0.15);
  parasolRoot.add(windChime);
  for (let index = 0; index < 3; index += 1) {
    const chime = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.033, 0.56 + index * 0.08, 10, 1, true),
      materialKit.clone("brass", { roughness: 0.3 + index * 0.03 }),
    );
    chime.position.set((index - 1) * 0.13, -index * 0.04, 0);
    windChime.add(chime);
  }

  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.38, 4.6, 10);
  const crownGeometry = new THREE.DodecahedronGeometry(1.52, 1);
  const treePositions = [[-11, -7], [-7, -11], [8, -10], [12, -4], [-13, 2], [13, 5], [-8, 10], [7, 11]];
  const trunks = new THREE.InstancedMesh(trunkGeometry, materialKit.materials.bark, treePositions.length);
  const crowns = new THREE.InstancedMesh(crownGeometry, materialKit.materials.foliage, treePositions.length * 3);
  treePositions.forEach(([x, z], index) => {
    placeInstanced(
      trunks,
      index,
      new THREE.Vector3(x, 1.55, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.63, (index % 2 ? -1 : 1) * 0.025)),
      new THREE.Vector3(1 + (index % 3) * 0.08, 1, 1),
      matrix,
    );
    for (let layer = 0; layer < 3; layer += 1) {
      const offset = layer === 0 ? 0 : layer === 1 ? -0.8 : 0.68;
      const scale = layer === 0 ? 1 : layer === 1 ? 0.72 : 0.62;
      const crownIndex = index * 3 + layer;
      placeInstanced(
        crowns,
        crownIndex,
        new THREE.Vector3(x + offset, 4.0 + layer * 0.34, z + (layer - 1) * 0.32),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.37 + layer * 0.41, layer * 0.035)),
        new THREE.Vector3(scale * (1.08 + (index % 3) * 0.08), scale, scale * 1.03),
        matrix,
      );
      const tint = new THREE.Color(
        layer === 0
          ? ECHO_RECORD_GARDEN_PALETTE.foliageMid
          : layer === 1
            ? ECHO_RECORD_GARDEN_PALETTE.foliageShadow
            : ECHO_RECORD_GARDEN_PALETTE.foliageLight,
      );
      crowns.setColorAt(crownIndex, tint.offsetHSL((index % 3 - 1) * 0.012, 0, 0));
    }
  });
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  crowns.castShadow = true;
  crowns.receiveShadow = true;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  environment.add(trunks, crowns);

  const hedgeGeometry = new THREE.DodecahedronGeometry(0.72, 1);
  const hedgeMaterial = materialKit.clone("foliage", { roughness: 0.9 });
  const hedges = new THREE.InstancedMesh(hedgeGeometry, hedgeMaterial, 42);
  for (let index = 0; index < 42; index += 1) {
    const angle = (index / 42) * TWO_PI;
    const radius = 16.8 + ((index * 17) % 5) * 0.16;
    placeInstanced(
      hedges,
      index,
      new THREE.Vector3(Math.cos(angle) * radius, 0.02 + (index % 3) * 0.04, Math.sin(angle) * radius),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle * 1.7, 0)),
      new THREE.Vector3(1.1 + (index % 4) * 0.1, 0.85 + (index % 3) * 0.08, 1.0),
      matrix,
    );
    hedges.setColorAt(index, new THREE.Color(index % 3 === 0 ? 0x5e8d53 : 0x47764a));
  }
  hedges.receiveShadow = true;
  hedges.instanceMatrix.needsUpdate = true;
  if (hedges.instanceColor) hedges.instanceColor.needsUpdate = true;
  environment.add(hedges);

  const grassBladeGeometry = new THREE.ConeGeometry(0.052, 0.34, 3);
  const grassBladeMaterial = materialKit.clone("foliage", {
    color: ECHO_RECORD_GARDEN_PALETTE.grassLight,
    roughness: 0.92,
  });
  grassBladeMaterial.vertexColors = false;
  grassBladeMaterial.needsUpdate = true;
  const grassBlades = new THREE.InstancedMesh(grassBladeGeometry, grassBladeMaterial, 180);
  for (let index = 0; index < 180; index += 1) {
    const angle = index * 2.399963 + periodicWave(index / 180, 0.2, 3, 0.1) * 0.12;
    const radius = 6.4 + ((index * 37) % 101) / 101 * 9.4;
    const height = 0.7 + (index % 5) * 0.09;
    placeInstanced(
      grassBlades,
      index,
      new THREE.Vector3(Math.cos(angle) * radius, -0.43, Math.sin(angle) * radius),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle * 3.1, (index % 2 ? -1 : 1) * 0.09)),
      new THREE.Vector3(0.78 + (index % 4) * 0.08, height, 0.78),
      matrix,
    );
  }
  grassBlades.receiveShadow = true;
  grassBlades.instanceMatrix.needsUpdate = true;
  environment.add(grassBlades);

  const flowerGeometry = new THREE.OctahedronGeometry(0.095, 0);
  const flowerMaterial = materialKit.clone("paper", { color: ECHO_RECORD_GARDEN_PALETTE.rose, roughness: 0.7 });
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, 96);
  const flowerColors = [0xef8fa8, 0xf6cf65, 0xe9e6df, 0xb88bd5];
  for (let index = 0; index < 96; index += 1) {
    const angle = index * 2.399963;
    const radius = 7.1 + (index % 11) * 0.62;
    placeInstanced(
      flowers,
      index,
      new THREE.Vector3(Math.cos(angle) * radius, -0.4 + (index % 3) * 0.035, Math.sin(angle) * radius),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(index * 0.1, angle, 0)),
      new THREE.Vector3(0.82 + (index % 4) * 0.08, 0.82, 0.82),
      matrix,
    );
    flowers.setColorAt(index, new THREE.Color(flowerColors[Math.floor(index / 12) % flowerColors.length]));
  }
  flowers.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  environment.add(flowers);

  const pebbleGeometry = new THREE.DodecahedronGeometry(0.12, 0);
  const pebbleMaterial = materialKit.materials.stone;
  const pebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, 32);
  for (let index = 0; index < 32; index += 1) {
    const angle = index * 2.399963 + 0.6;
    const radius = 9 + (index % 8) * 0.55;
    placeInstanced(
      pebbles,
      index,
      new THREE.Vector3(Math.cos(angle) * radius, -0.52, Math.sin(angle) * radius),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(index * 0.23, angle, 0)),
      new THREE.Vector3(0.65 + (index % 3) * 0.2, 0.35 + (index % 2) * 0.12, 0.8),
      matrix,
    );
  }
  pebbles.receiveShadow = true;
  pebbles.instanceMatrix.needsUpdate = true;
  environment.add(pebbles);

  const fencePostGeometry = rounded(0.18, 1.2, 0.18, 0.045, 3);
  const fencePosts = new THREE.InstancedMesh(fencePostGeometry, materialKit.materials.deepWood, 24);
  for (let index = 0; index < 24; index += 1) {
    const side = index < 12 ? -1 : 1;
    const row = index % 12;
    placeInstanced(
      fencePosts,
      index,
      new THREE.Vector3(side * 14.8, 0.02, -10.8 + row * 1.85),
      new THREE.Quaternion(),
      new THREE.Vector3(1, 1, 1),
      matrix,
    );
  }
  fencePosts.castShadow = false;
  fencePosts.receiveShadow = true;
  fencePosts.instanceMatrix.needsUpdate = true;
  environment.add(fencePosts);
  for (const side of [-1, 1]) {
    for (const height of [-0.05, 0.42]) {
      const rail = new THREE.Mesh(rounded(0.16, 0.18, 21.2, 0.045, 3), materialKit.materials.deepWood);
      rail.position.set(side * 14.8, height, -0.65);
      rail.receiveShadow = true;
      environment.add(rail);
    }
  }

  environment.add(
    createGardenPavilion(materialKit, -10.8, -14.3, 0xcb7658, false),
    createGardenPavilion(materialKit, 10.7, -13.8, 0x5f8eb6, true),
  );

  const teaTray = new THREE.Group();
  teaTray.name = "EchoGardenTeaSetting";
  teaTray.position.set(3.65, 0.05, 1.55);
  environment.add(teaTray);
  const tray = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.72, 0.06, 32),
    materialKit.clone("wood", { roughness: 0.54 }),
  );
  tray.castShadow = true;
  teaTray.add(tray);
  const teapot = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), materialKit.materials.ceramic);
  teapot.position.set(0, 0.25, 0);
  teapot.castShadow = true;
  teaTray.add(teapot);
  const spout = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.45, 12), materialKit.materials.ceramic);
  spout.position.set(0.34, 0.28, 0);
  spout.rotation.z = -Math.PI / 2.6;
  teaTray.add(spout);
  for (const x of [-0.46, 0.46]) {
    const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.11, 0.22, 18), materialKit.materials.ceramic);
    cup.position.set(x, 0.16, 0.12);
    cup.castShadow = true;
    teaTray.add(cup);
  }

  const condensationMaterial = new THREE.MeshBasicMaterial({
    color: 0x6b4b35,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
    toneMapped: false,
  });
  condensationMaterial.name = "EchoGarden.tableHistory";
  for (const [x, z, scale] of [[3.65, 1.55, 1], [-0.7, 1.95, 0.72], [1.05, -1.8, 0.55]]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.014, 6, 32), condensationMaterial);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, -0.006, z);
    ring.scale.setScalar(scale);
    environment.add(ring);
  }

  const crateMaterial = materialKit.clone("deepWood", { roughness: 0.82 });
  for (const [x, z, rotation] of [[-5.4, 3.25, -0.24], [5.55, 3.05, 0.31]]) {
    const crate = new THREE.Group();
    crate.position.set(x, -0.1, z);
    crate.rotation.y = rotation;
    environment.add(crate);
    for (let index = -1; index <= 1; index += 1) {
      const slat = new THREE.Mesh(rounded(1.65, 0.12, 0.23, 0.035, 3), crateMaterial);
      slat.position.set(0, index * 0.42, index === 0 ? 0 : 0.02);
      slat.castShadow = true;
      crate.add(slat);
    }
  }

  const sun = new THREE.DirectionalLight(ECHO_RECORD_GARDEN_PALETTE.sun, 3.25);
  sun.name = "EchoGardenSunKey";
  sun.position.set(-8, 12, 7);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -14;
  sun.shadow.camera.right = 14;
  sun.shadow.camera.top = 14;
  sun.shadow.camera.bottom = -14;
  sun.shadow.camera.near = 0.5;
  sun.shadow.camera.far = 42;
  sun.shadow.bias = -0.00016;
  sun.shadow.normalBias = 0.024;
  sun.shadow.radius = 2;
  sun.target.position.set(0, 0, -0.5);
  environment.add(sun, sun.target);
  const fill = new THREE.HemisphereLight(0x8ec5f0, 0x6b8f4e, 0.92);
  fill.name = "EchoGardenSkyFill";
  environment.add(fill);
  const bounce = new THREE.DirectionalLight(0xffd9a8, 0.28);
  bounce.name = "EchoGardenGroundBounce";
  bounce.position.set(5, 2.4, 5.5);
  bounce.target.position.set(0, 0.3, -1);
  environment.add(bounce, bounce.target);

  const cloudTexture = createCloudTexture();
  const clouds = createCloudLayer(environment, cloudTexture);
  const leafDrift = createAmbientLeafDrift(environment);

  const motePositions = new Float32Array(84 * 3);
  for (let index = 0; index < 84; index += 1) {
    motePositions[index * 3] = -9 + ((index * 2.37) % 18);
    motePositions[index * 3 + 1] = 0.2 + ((index * 1.73) % 6);
    motePositions[index * 3 + 2] = -7 + ((index * 2.11) % 14);
  }
  const moteGeometry = new THREE.BufferGeometry();
  moteGeometry.setAttribute("position", new THREE.BufferAttribute(motePositions, 3));
  const moteMaterial = new THREE.PointsMaterial({
    color: 0xffedaa,
    size: 0.07,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const bokeh = new THREE.Points(moteGeometry, moteMaterial);
  bokeh.name = "GardenSunMotes";
  environment.add(bokeh);

  const metrics = Object.freeze({
    profileId: ECHO_RECORD_GARDEN_VISUAL_PROFILE.id,
    activeLights: 3,
    shadowCastingLights: 1,
    sharedSurfaceTextures: materialKit.textures.length + 2,
    instancedDetailCount: 14 + 8 + 24 + 42 + 180 + 96 + 32 + 24,
    materialRoles: Object.keys(materialKit.materials).length,
    postProcessingPasses: 0,
  });

  return {
    environment,
    bokeh,
    parasolRoot,
    crowns,
    cloth,
    clouds,
    leafDrift,
    windChime,
    materialKit,
    metrics,
    rebuildEnvironmentResponse,
    dispose() {
      if (disposed) return;
      disposed = true;
      const geometries = new Set();
      const materials = new Set();
      Object.values(materialKit.materials).forEach((material) => materials.add(material));
      environment.traverse((object) => {
        if (object.geometry) geometries.add(object.geometry);
        if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
        else if (object.material) materials.add(object.material);
      });
      geometries.forEach((geometry) => geometry.dispose?.());
      materials.forEach((material) => material.dispose?.());
      [...materialKit.textures, skyTexture, cloudTexture].forEach((texture) => texture.dispose?.());
      environmentTarget?.dispose?.();
      if (scene.environment === environmentTarget?.texture) scene.environment = previousEnvironment;
      scene.environmentIntensity = previousEnvironmentIntensity;
      scene.background = previousBackground;
      scene.fog = previousFog;
      environment.removeFromParent();
    },
  };
}

export function updateEchoRecordGardenVisualSystem(resources, elapsed, reducedMotion) {
  if (!resources) return;
  if (reducedMotion) {
    resources.clouds.position.set(0, 0, 0);
    resources.clouds.children.forEach((cloud) => {
      cloud.position.x = cloud.userData.homeX;
      cloud.position.y = cloud.userData.homeY;
    });
    resources.windChime.rotation.set(0, 0, 0);
    resources.leafDrift.position.set(0, 0, 0);
    resources.leafDrift.rotation.set(0, 0, 0);
    return;
  }
  resources.clouds.children.forEach((cloud) => {
    const phase = Number(cloud.userData.phase) || 0;
    cloud.position.x = cloud.userData.homeX + Math.sin(elapsed * 0.035 + phase) * 0.55;
    cloud.position.y = cloud.userData.homeY + Math.sin(elapsed * 0.09 + phase) * 0.08;
  });
  resources.windChime.rotation.z = Math.sin(elapsed * 0.72) * 0.045;
  resources.windChime.rotation.x = Math.sin(elapsed * 0.39 + 1.4) * 0.018;
  resources.leafDrift.rotation.y = elapsed * 0.028;
  resources.leafDrift.position.y = Math.sin(elapsed * 0.21) * 0.09;
}
