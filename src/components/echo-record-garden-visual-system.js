import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  EchoGardenSimplex,
  echoGardenSmoothstep,
  echoGardenTileableFbm,
  echoGardenWorley,
  gardenRange,
  makeGardenRng,
} from "./echo-record-garden-noise.js";

export const ECHO_RECORD_GARDEN_VISUAL_PROFILE = Object.freeze({
  id: "echo-record-garden-sunwashed-diorama-v2",
  sourcePattern: "pallet-town-3d-mit-adapted-system-transfer-v2",
  activeLights: 3,
  shadowCastingLights: 1,
  textureStrategy: "deterministic-cached-albedo-normal-roughness-material-families",
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
  plasterLight: 0xf4ecdc,
  plasterShadow: 0xcabda9,
  roofRed: 0xc9654e,
  roofBlue: 0x5e8fb7,
  sage: 0x9fb28c,
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
const echoGardenNoiseCache = new Map();
const echoGardenSurfaceBakeCache = new Map();

function noiseForSeed(seed) {
  const key = Number(seed) || 1;
  if (!echoGardenNoiseCache.has(key)) echoGardenNoiseCache.set(key, new EchoGardenSimplex(key));
  return echoGardenNoiseCache.get(key);
}

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
  u = fract(u);
  v = fract(v);
  const simplex = noiseForSeed(seed);
  const phase = fract(Math.sin(seed * 17.171) * 43758.5453);
  const macro = echoGardenTileableFbm(simplex, u, v, 2.2, 4, 0.52);
  const fine = echoGardenTileableFbm(simplex, u + 0.173, v - 0.219, 14, 3, 0.48);
  let value = macro * 0.72 + fine * 0.28;
  if (kind === "grass") {
    const comb = echoGardenTileableFbm(simplex, u + 0.37, v - 0.11, 5, 2, 0.5);
    const angle = comb * Math.PI;
    const direction = Math.cos(angle) * u + Math.sin(angle) * v;
    const blade = Math.sin((direction + macro * 0.025) * TWO_PI * 42);
    const clump = echoGardenTileableFbm(simplex, u, v, 7, 3, 0.5);
    return THREE.MathUtils.clamp(blade * 0.36 + clump * 0.42 + fine * 0.22, -1, 1);
  }
  if (kind === "wood") {
    const warp = value * 0.045;
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
    const cells = echoGardenWorley(u, v, 19, seed);
    const pebble = echoGardenSmoothstep(0.22, 0.035, cells.first);
    return THREE.MathUtils.clamp(value * 0.62 + fine * 0.18 + pebble * 0.46, -1, 1);
  }
  if (kind === "bark") {
    const ridges = Math.sin((u + value * 0.035) * TWO_PI * 15);
    const fissures = 1 - Math.abs(echoGardenTileableFbm(simplex, u * 0.8, v, 9, 4, 0.52));
    return THREE.MathUtils.clamp(ridges * 0.46 + fissures * 0.42 + value * 0.2, -1, 1);
  }
  if (kind === "stone") {
    const cells = echoGardenWorley(u, v, 10, seed);
    const mortar = echoGardenSmoothstep(0.015, 0.105, cells.second - cells.first);
    const identity = ((cells.id % 997) / 997 - 0.5) * 0.36;
    return THREE.MathUtils.clamp((mortar * 2 - 1) * 0.68 + identity + fine * 0.12, -1, 1);
  }
  if (kind === "tile") {
    const rows = 12;
    const row = Math.floor(v * rows);
    const localV = fract(v * rows);
    const offset = row % 2 === 0 ? 0 : 0.5;
    const localU = fract(u * rows + offset + Math.sin(row * 12.9898) * 0.06);
    const arch = Math.sin(localV * Math.PI);
    const side = echoGardenSmoothstep(0, 0.11, localU) * echoGardenSmoothstep(1, 0.89, localU);
    const jitter = fract(Math.sin((row + 1) * 12.9898 + Math.floor(u * rows) * 78.233) * 43758.5453);
    return THREE.MathUtils.clamp((arch * side * (0.72 + jitter * 0.32)) * 2 - 1 + fine * 0.08, -1, 1);
  }
  if (kind === "plaster") {
    const pits = echoGardenWorley(u, v, 31, seed).first;
    return THREE.MathUtils.clamp(value * 0.42 + fine * 0.24 - echoGardenSmoothstep(0.08, 0.01, pits) * 0.34, -1, 1);
  }
  if (kind === "leaf") {
    const cells = echoGardenWorley(u, v, 14, seed);
    const veins = echoGardenSmoothstep(0.03, 0.13, cells.second - cells.first);
    return THREE.MathUtils.clamp(value * 0.48 + (veins * 2 - 1) * 0.42 + fine * 0.1, -1, 1);
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
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
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
  roughnessRange = [0.58, 0.94],
  size = 256,
}) {
  const bakeKey = JSON.stringify([key, kind, seed, dark, light, normalStrength, roughnessRange, size]);
  let baked = echoGardenSurfaceBakeCache.get(bakeKey);
  if (!baked) {
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
    const roughness = new Uint8Array(size * size * 4);
    const sample = (x, y) => heights[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const pixel = y * size + x;
        const height = heights[pixel];
        const tonal = smooth(height * 0.5 + 0.5);
        const color = mixRgb(darkRgb, lightRgb, 0.13 + tonal * 0.76);
        albedo[pixel * 4] = toByte(color[0]);
        albedo[pixel * 4 + 1] = toByte(color[1]);
        albedo[pixel * 4 + 2] = toByte(color[2]);
        albedo[pixel * 4 + 3] = 255;

        const topLeft = sample(x - 1, y - 1);
        const top = sample(x, y - 1);
        const topRight = sample(x + 1, y - 1);
        const left = sample(x - 1, y);
        const right = sample(x + 1, y);
        const bottomLeft = sample(x - 1, y + 1);
        const bottom = sample(x, y + 1);
        const bottomRight = sample(x + 1, y + 1);
        const dx = (topLeft + left * 2 + bottomLeft - topRight - right * 2 - bottomRight) * normalStrength;
        const dy = (topLeft + top * 2 + topRight - bottomLeft - bottom * 2 - bottomRight) * normalStrength;
        const inverseLength = 1 / Math.hypot(dx, dy, 1);
        normals[pixel * 4] = toByte((dx * inverseLength) * 0.5 + 0.5);
        normals[pixel * 4 + 1] = toByte((dy * inverseLength) * 0.5 + 0.5);
        normals[pixel * 4 + 2] = toByte(inverseLength * 0.5 + 0.5);
        normals[pixel * 4 + 3] = 255;

        const microVariation = sample(x + 5, y - 7) * 0.5 + 0.5;
        const surfaceWear = THREE.MathUtils.clamp(tonal * 0.68 + microVariation * 0.32, 0, 1);
        const roughnessValue = roughnessRange[0]
          + (roughnessRange[1] - roughnessRange[0]) * (1 - surfaceWear);
        const roughnessByte = toByte(roughnessValue);
        roughness[pixel * 4] = roughnessByte;
        roughness[pixel * 4 + 1] = roughnessByte;
        roughness[pixel * 4 + 2] = roughnessByte;
        roughness[pixel * 4 + 3] = 255;
      }
    }
    baked = { albedo, normals, roughness };
    echoGardenSurfaceBakeCache.set(bakeKey, baked);
  }

  const map = configureTexture(
    new THREE.DataTexture(baked.albedo, size, size, THREE.RGBAFormat),
    renderer,
    repeat,
    true,
  );
  map.name = `EchoGarden.${key}.albedo`;
  const normalMap = configureTexture(
    new THREE.DataTexture(baked.normals, size, size, THREE.RGBAFormat),
    renderer,
    repeat,
    false,
  );
  normalMap.name = `EchoGarden.${key}.normal`;
  const roughnessMap = configureTexture(
    new THREE.DataTexture(baked.roughness, size, size, THREE.RGBAFormat),
    renderer,
    repeat,
    false,
  );
  roughnessMap.name = `EchoGarden.${key}.roughness`;
  return { map, normalMap, roughnessMap };
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
      const heightLight = THREE.MathUtils.clamp(0.72 - v * 0.62, 0, 1);
      const sideLight = THREE.MathUtils.clamp(0.65 + u * 0.18, 0, 1);
      const rim = echoGardenSmoothstep(0.06, 0.28, density)
        * (1 - echoGardenSmoothstep(0.3, 0.82, density));
      const shade = mixRgb([0.52, 0.66, 0.82], [0.97, 0.95, 0.89], heightLight * sideLight);
      const lit = mixRgb(shade, [1, 0.96, 0.82], rim * 0.34);
      const pixel = (y * size + x) * 4;
      data[pixel] = toByte(lit[0]);
      data[pixel + 1] = toByte(lit[1]);
      data[pixel + 2] = toByte(lit[2]);
      data[pixel + 3] = toByte(density * 0.78);
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

function createContactShadowTexture() {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = (x + 0.5) / size * 2 - 1;
      const v = (y + 0.5) / size * 2 - 1;
      const radius = Math.hypot(u, v);
      const opacity = 1 - echoGardenSmoothstep(0.08, 1, radius);
      const pixel = (y * size + x) * 4;
      data[pixel] = 58;
      data[pixel + 1] = 69;
      data[pixel + 2] = 45;
      data[pixel + 3] = toByte(opacity * opacity * 0.52);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  texture.name = "EchoGarden.ContactShadow";
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
      kind: "grass",
      seed: 91,
      dark: ECHO_RECORD_GARDEN_PALETTE.grassShadow,
      light: ECHO_RECORD_GARDEN_PALETTE.grassLight,
      repeat: 8,
      normalStrength: 1.35,
      roughnessRange: [0.78, 0.97],
    }),
    soil: createSurfaceMaps(renderer, {
      key: "soil",
      kind: "soil",
      seed: 211,
      dark: ECHO_RECORD_GARDEN_PALETTE.soilDark,
      light: ECHO_RECORD_GARDEN_PALETTE.soilLight,
      repeat: 6,
      normalStrength: 1.7,
      roughnessRange: [0.7, 0.96],
    }),
    wood: createSurfaceMaps(renderer, {
      key: "wood",
      kind: "wood",
      seed: 307,
      dark: ECHO_RECORD_GARDEN_PALETTE.woodDark,
      light: ECHO_RECORD_GARDEN_PALETTE.woodLight,
      repeat: 2.4,
      normalStrength: 1.2,
      roughnessRange: [0.48, 0.82],
    }),
    bark: createSurfaceMaps(renderer, {
      key: "bark",
      kind: "bark",
      seed: 421,
      dark: 0x30251f,
      light: 0x886342,
      repeat: 3.5,
      normalStrength: 2.1,
      roughnessRange: [0.78, 0.98],
      size: 128,
    }),
    stone: createSurfaceMaps(renderer, {
      key: "stone",
      kind: "stone",
      seed: 503,
      dark: ECHO_RECORD_GARDEN_PALETTE.stoneDark,
      light: ECHO_RECORD_GARDEN_PALETTE.stoneLight,
      repeat: 4.2,
      normalStrength: 2.05,
      roughnessRange: [0.58, 0.91],
      size: 128,
    }),
    textile: createSurfaceMaps(renderer, {
      key: "textile",
      kind: "weave",
      seed: 617,
      dark: 0xa66f48,
      light: 0xf0d4a0,
      repeat: 7,
      normalStrength: 0.95,
      roughnessRange: [0.7, 0.96],
    }),
    plaster: createSurfaceMaps(renderer, {
      key: "plaster",
      kind: "plaster",
      seed: 733,
      dark: ECHO_RECORD_GARDEN_PALETTE.plasterShadow,
      light: ECHO_RECORD_GARDEN_PALETTE.plasterLight,
      repeat: 3.2,
      normalStrength: 0.72,
      roughnessRange: [0.7, 0.94],
      size: 128,
    }),
    roofRed: createSurfaceMaps(renderer, {
      key: "roof-red",
      kind: "tile",
      seed: 811,
      dark: 0x71382f,
      light: ECHO_RECORD_GARDEN_PALETTE.roofRed,
      repeat: 2.2,
      normalStrength: 2.35,
      roughnessRange: [0.48, 0.79],
      size: 128,
    }),
    roofBlue: createSurfaceMaps(renderer, {
      key: "roof-blue",
      kind: "tile",
      seed: 823,
      dark: 0x34536f,
      light: ECHO_RECORD_GARDEN_PALETTE.roofBlue,
      repeat: 2.2,
      normalStrength: 2.35,
      roughnessRange: [0.48, 0.79],
      size: 128,
    }),
    leaf: createSurfaceMaps(renderer, {
      key: "leaf",
      kind: "leaf",
      seed: 947,
      dark: ECHO_RECORD_GARDEN_PALETTE.foliageShadow,
      light: ECHO_RECORD_GARDEN_PALETTE.foliageLight,
      repeat: 5,
      normalStrength: 1.15,
      roughnessRange: [0.68, 0.91],
    }),
  };
  const materials = {
    grass: new THREE.MeshStandardMaterial({
      map: maps.grass.map,
      normalMap: maps.grass.normalMap,
      roughnessMap: maps.grass.roughnessMap,
      normalScale: new THREE.Vector2(0.28, 0.28),
      roughness: 0.94,
      metalness: 0,
    }),
    soil: new THREE.MeshStandardMaterial({
      map: maps.soil.map,
      normalMap: maps.soil.normalMap,
      roughnessMap: maps.soil.roughnessMap,
      normalScale: new THREE.Vector2(0.34, 0.34),
      roughness: 0.9,
      metalness: 0,
    }),
    wood: new THREE.MeshStandardMaterial({
      map: maps.wood.map,
      normalMap: maps.wood.normalMap,
      roughnessMap: maps.wood.roughnessMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.64,
      metalness: 0.02,
      envMapIntensity: 0.68,
    }),
    deepWood: new THREE.MeshStandardMaterial({
      color: 0x755039,
      map: maps.wood.map,
      normalMap: maps.wood.normalMap,
      roughnessMap: maps.wood.roughnessMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.77,
      metalness: 0.01,
      envMapIntensity: 0.55,
    }),
    bark: new THREE.MeshStandardMaterial({
      map: maps.bark.map,
      normalMap: maps.bark.normalMap,
      roughnessMap: maps.bark.roughnessMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.94,
      metalness: 0,
    }),
    foliage: new THREE.MeshStandardMaterial({
      color: ECHO_RECORD_GARDEN_PALETTE.foliageMid,
      map: maps.grass.map,
      normalMap: maps.grass.normalMap,
      roughnessMap: maps.grass.roughnessMap,
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
      roughnessMap: maps.textile.roughnessMap,
      normalScale: new THREE.Vector2(0.2, 0.2),
      roughness: 0.88,
      side: THREE.DoubleSide,
      envMapIntensity: 0.45,
    }),
    stone: new THREE.MeshStandardMaterial({
      color: ECHO_RECORD_GARDEN_PALETTE.stoneLight,
      map: maps.soil.map,
      normalMap: maps.soil.normalMap,
      roughnessMap: maps.soil.roughnessMap,
      normalScale: new THREE.Vector2(0.25, 0.25),
      roughness: 0.86,
      metalness: 0,
    }),
    cobble: new THREE.MeshStandardMaterial({
      map: maps.stone.map,
      normalMap: maps.stone.normalMap,
      roughnessMap: maps.stone.roughnessMap,
      normalScale: new THREE.Vector2(0.32, 0.32),
      roughness: 0.84,
      metalness: 0,
      envMapIntensity: 0.6,
    }),
    ceramic: new THREE.MeshPhysicalMaterial({
      color: ECHO_RECORD_GARDEN_PALETTE.cream,
      map: maps.plaster.map,
      normalMap: maps.plaster.normalMap,
      roughnessMap: maps.plaster.roughnessMap,
      normalScale: new THREE.Vector2(0.08, 0.08),
      roughness: 0.34,
      metalness: 0,
      clearcoat: 0.14,
      clearcoatRoughness: 0.4,
      envMapIntensity: 0.86,
    }),
    brass: new THREE.MeshStandardMaterial({
      color: 0xd9b77b,
      map: maps.roofRed.map,
      normalMap: maps.roofRed.normalMap,
      roughnessMap: maps.roofRed.roughnessMap,
      normalScale: new THREE.Vector2(0.05, 0.05),
      roughness: 0.24,
      metalness: 0.88,
      envMapIntensity: 1.12,
    }),
    charcoal: new THREE.MeshStandardMaterial({
      color: ECHO_RECORD_GARDEN_PALETTE.vinyl,
      map: maps.soil.map,
      normalMap: maps.soil.normalMap,
      roughnessMap: maps.soil.roughnessMap,
      normalScale: new THREE.Vector2(0.06, 0.06),
      roughness: 0.38,
      metalness: 0.48,
      envMapIntensity: 0.82,
    }),
    paper: new THREE.MeshStandardMaterial({
      color: 0xf1e5c9,
      map: maps.textile.map,
      normalMap: maps.textile.normalMap,
      roughnessMap: maps.textile.roughnessMap,
      normalScale: new THREE.Vector2(0.08, 0.08),
      roughness: 0.78,
      metalness: 0,
    }),
    plaster: new THREE.MeshStandardMaterial({
      map: maps.plaster.map,
      normalMap: maps.plaster.normalMap,
      roughnessMap: maps.plaster.roughnessMap,
      normalScale: new THREE.Vector2(0.18, 0.18),
      roughness: 0.82,
      metalness: 0,
      envMapIntensity: 0.58,
    }),
    roofRed: new THREE.MeshPhysicalMaterial({
      map: maps.roofRed.map,
      normalMap: maps.roofRed.normalMap,
      roughnessMap: maps.roofRed.roughnessMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.68,
      clearcoat: 0.14,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.82,
    }),
    roofBlue: new THREE.MeshPhysicalMaterial({
      map: maps.roofBlue.map,
      normalMap: maps.roofBlue.normalMap,
      roughnessMap: maps.roofBlue.roughnessMap,
      normalScale: new THREE.Vector2(0.42, 0.42),
      roughness: 0.68,
      clearcoat: 0.14,
      clearcoatRoughness: 0.42,
      envMapIntensity: 0.82,
    }),
    leaf: new THREE.MeshStandardMaterial({
      map: maps.leaf.map,
      normalMap: maps.leaf.normalMap,
      roughnessMap: maps.leaf.roughnessMap,
      normalScale: new THREE.Vector2(0.22, 0.22),
      roughness: 0.8,
      metalness: 0,
      side: THREE.DoubleSide,
      vertexColors: true,
      envMapIntensity: 0.74,
    }),
    rattan: new THREE.MeshStandardMaterial({
      color: 0xc6985d,
      map: maps.textile.map,
      normalMap: maps.textile.normalMap,
      roughnessMap: maps.textile.roughnessMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 0.86,
      metalness: 0,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xb9e4e7,
      roughness: 0.12,
      metalness: 0,
      transmission: 0.68,
      thickness: 0.08,
      ior: 1.45,
      transparent: true,
      opacity: 0.76,
      envMapIntensity: 1.05,
    }),
  };
  Object.entries(materials).forEach(([key, material]) => {
    material.name = `EchoGarden.${key}`;
  });
  const textures = Object.values(maps).flatMap((value) => [value.map, value.normalMap, value.roughnessMap]);
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

const ECHO_GARDEN_DETAIL_CLUSTERS = Object.freeze([
  Object.freeze({ x: -10.8, z: 5.6, radiusX: 3.2, radiusZ: 2.6, color: 0 }),
  Object.freeze({ x: 10.6, z: 6.4, radiusX: 3.5, radiusZ: 2.4, color: 1 }),
  Object.freeze({ x: -11.6, z: -6.2, radiusX: 2.8, radiusZ: 3.4, color: 2 }),
  Object.freeze({ x: 11.2, z: -7.1, radiusX: 3.1, radiusZ: 3.0, color: 3 }),
  Object.freeze({ x: -1.4, z: -11.9, radiusX: 5.2, radiusZ: 2.2, color: 0 }),
]);

function isEchoGardenQuietZone(x, z) {
  if (Math.abs(x) < 6.2 && z > -4.1 && z < 4.0) return true;
  if (Math.abs(x) < 4.7 && z > -7.2 && z <= -4.1) return true;
  return Math.hypot(x, z) > 16.2;
}

function sampleClusteredGardenPoints(count, seed, inset = 0) {
  const rng = makeGardenRng(seed);
  const points = [];
  for (let index = 0; index < count; index += 1) {
    const clusterIndex = (index + Math.floor(rng() * ECHO_GARDEN_DETAIL_CLUSTERS.length))
      % ECHO_GARDEN_DETAIL_CLUSTERS.length;
    const cluster = ECHO_GARDEN_DETAIL_CLUSTERS[clusterIndex];
    let point = null;
    for (let attempt = 0; attempt < 18 && !point; attempt += 1) {
      const angle = rng() * TWO_PI;
      const radius = Math.pow(rng(), 0.72);
      const x = cluster.x + Math.cos(angle) * Math.max(0.2, cluster.radiusX - inset) * radius;
      const z = cluster.z + Math.sin(angle) * Math.max(0.2, cluster.radiusZ - inset) * radius;
      if (!isEchoGardenQuietZone(x, z)) {
        point = {
          x,
          z,
          rotation: gardenRange(rng, -Math.PI, Math.PI),
          scale: gardenRange(rng, 0.76, 1.24),
          clusterIndex,
          color: cluster.color,
        };
      }
    }
    if (point) points.push(point);
  }
  return points;
}

export function createEchoGardenLayout(seed = 20260801) {
  return Object.freeze({
    grass: Object.freeze(sampleClusteredGardenPoints(360, seed + 11)),
    flowers: Object.freeze(sampleClusteredGardenPoints(160, seed + 29, 0.18)),
    clover: Object.freeze(sampleClusteredGardenPoints(144, seed + 47)),
    pebbles: Object.freeze(sampleClusteredGardenPoints(54, seed + 71, 0.1)),
    fallenLeaves: Object.freeze(sampleClusteredGardenPoints(72, seed + 89)),
  });
}

function installEchoGardenWind(material, amplitude = 0.05) {
  const uniforms = {
    uEchoGardenWindTime: { value: 0 },
    uEchoGardenWindStrength: { value: amplitude },
  };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uEchoGardenWindTime;
uniform float uEchoGardenWindStrength;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
float echoGardenPhase = position.x * 0.61 + position.z * 0.47;
#ifdef USE_INSTANCING
  echoGardenPhase += instanceMatrix[3][0] * 0.73 + instanceMatrix[3][2] * 0.51;
#endif
float echoGardenFlex = smoothstep(-0.3, 1.4, position.y);
transformed.x += sin(uEchoGardenWindTime * 0.9 + echoGardenPhase) * uEchoGardenWindStrength * echoGardenFlex;
transformed.z += cos(uEchoGardenWindTime * 0.63 + echoGardenPhase * 1.17) * uEchoGardenWindStrength * 0.55 * echoGardenFlex;`,
      );
  };
  material.customProgramCacheKey = () => `echo-garden-wind-v1-${amplitude.toFixed(3)}`;
  return { uniforms, amplitude };
}

function createGrassTuftGeometry() {
  const bladeA = new THREE.PlaneGeometry(0.085, 0.38, 1, 2);
  bladeA.translate(0, 0.19, 0);
  const bladeB = bladeA.clone();
  bladeB.rotateY(Math.PI / 2);
  const bladeC = new THREE.PlaneGeometry(0.068, 0.3, 1, 2);
  bladeC.translate(0.045, 0.15, 0.02);
  bladeC.rotateY(Math.PI / 4);
  const merged = mergeGeometries([bladeA, bladeB, bladeC], false);
  bladeA.dispose();
  bladeB.dispose();
  bladeC.dispose();
  return merged;
}

function createFlowerHeadGeometry() {
  const petals = [];
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * TWO_PI;
    const petal = new THREE.OctahedronGeometry(0.075, 0);
    petal.scale(1.25, 0.72, 0.8);
    petal.rotateZ(angle);
    petal.translate(Math.cos(angle) * 0.09, Math.sin(angle) * 0.09, 0);
    petals.push(petal);
  }
  const center = new THREE.OctahedronGeometry(0.045, 0);
  const merged = mergeGeometries([...petals, center], false);
  petals.forEach((geometry) => geometry.dispose());
  center.dispose();
  return merged;
}

function createCloverGeometry() {
  const leaves = [];
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * TWO_PI;
    const leaf = new THREE.CircleGeometry(0.072, 8);
    leaf.scale(1.25, 0.86, 1);
    leaf.rotateZ(angle);
    leaf.translate(Math.cos(angle) * 0.055, Math.sin(angle) * 0.055, 0);
    leaves.push(leaf);
  }
  const merged = mergeGeometries(leaves, false);
  leaves.forEach((geometry) => geometry.dispose());
  return merged;
}

function createGardenPavilion(materialKit, x, z, accent, mirrored = false) {
  const group = new THREE.Group();
  group.name = mirrored ? "EchoGardenListeningCanopy" : "EchoGardenOpenTrellis";
  group.position.set(x, 0, z);
  const foundation = new THREE.Mesh(
    rounded(3.8, 0.18, 2.9, 0.08, 4),
    materialKit.clone("cobble", { color: 0xb7b19f, roughness: 0.9 }),
  );
  foundation.position.y = -0.49;
  foundation.receiveShadow = true;
  group.add(foundation);

  const timber = materialKit.clone("deepWood", {
    color: mirrored ? 0x79513d : 0x765139,
    roughness: 0.73,
  });
  for (const [postX, postZ] of [[-1.58, -1.08], [1.58, -1.08], [-1.58, 1.08], [1.58, 1.08]]) {
    const post = new THREE.Mesh(rounded(0.22, 2.95, 0.22, 0.055, 4), timber);
    post.position.set(postX, 1.02, postZ);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
    const foot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.28, 0.14, 12),
      materialKit.clone("cobble", { color: 0x9d9a8d, roughness: 0.93 }),
    );
    foot.position.set(postX, -0.35, postZ);
    foot.receiveShadow = true;
    group.add(foot);
  }

  for (const beamZ of [-1.08, 1.08]) {
    const beam = new THREE.Mesh(rounded(3.62, 0.22, 0.24, 0.055, 4), timber);
    beam.position.set(0, 2.45, beamZ);
    beam.castShadow = true;
    group.add(beam);
  }

  if (mirrored) {
    const backWall = new THREE.Mesh(
      rounded(3.22, 1.72, 0.16, 0.06, 4),
      materialKit.clone("plaster", { color: 0xefe2c7, roughness: 0.82 }),
    );
    backWall.position.set(0, 0.48, -1.04);
    backWall.castShadow = true;
    backWall.receiveShadow = true;
    group.add(backWall);
    for (const side of [-1, 1]) {
      const roofPanel = new THREE.Mesh(
        rounded(2.18, 0.16, 3.02, 0.045, 4),
        materialKit.clone("roofBlue", { color: accent, roughness: 0.66 }),
      );
      roofPanel.position.set(side * 0.94, 2.86, 0);
      roofPanel.rotation.z = side * -0.34;
      roofPanel.castShadow = true;
      group.add(roofPanel);
    }
    const bench = new THREE.Mesh(rounded(2.7, 0.34, 0.82, 0.12, 5), materialKit.materials.rattan);
    bench.position.set(0, -0.08, -0.38);
    bench.castShadow = true;
    bench.receiveShadow = true;
    group.add(bench);
    for (const cushionX of [-0.72, 0.72]) {
      const cushion = new THREE.Mesh(
        rounded(0.92, 0.2, 0.64, 0.1, 5),
        materialKit.clone("textile", {
          color: cushionX < 0 ? 0xdda07e : 0xe3c477,
          roughness: 0.9,
        }),
      );
      cushion.position.set(cushionX, 0.15, -0.3);
      cushion.rotation.y = cushionX * 0.045;
      group.add(cushion);
    }
    const shelf = new THREE.Mesh(rounded(2.42, 0.12, 0.32, 0.035, 3), timber);
    shelf.position.set(0, 1.08, -0.82);
    group.add(shelf);
    for (let index = 0; index < 7; index += 1) {
      const sleeve = new THREE.Mesh(
        rounded(0.25, 0.52, 0.05, 0.018, 2),
        materialKit.clone("paper", {
          color: [0xd37a68, 0x6e9ab2, 0xe2bc72, 0x92a66f][index % 4],
          roughness: 0.84,
        }),
      );
      sleeve.position.set(-0.87 + index * 0.29, 1.4 + (index % 2) * 0.025, -0.64);
      sleeve.rotation.z = (index % 3 - 1) * 0.035;
      group.add(sleeve);
    }
  } else {
    for (let index = 0; index < 7; index += 1) {
      const slat = new THREE.Mesh(rounded(0.13, 0.12, 2.78, 0.035, 3), timber);
      slat.position.set(-1.44 + index * 0.48, 2.7 + Math.sin(index * 0.8) * 0.025, 0);
      slat.rotation.z = (index - 3) * 0.008;
      slat.castShadow = index % 2 === 0;
      group.add(slat);
    }
    const daybed = new THREE.Mesh(
      rounded(2.82, 0.32, 1.35, 0.13, 5),
      materialKit.clone("rattan", { color: 0xc49964, roughness: 0.88 }),
    );
    daybed.position.set(0, -0.12, 0.1);
    daybed.castShadow = true;
    daybed.receiveShadow = true;
    group.add(daybed);
    const quilt = new THREE.Mesh(
      rounded(2.55, 0.14, 1.16, 0.085, 5),
      materialKit.clone("textile", { color: accent, roughness: 0.92 }),
    );
    quilt.position.set(0, 0.1, 0.12);
    quilt.rotation.y = -0.025;
    group.add(quilt);
    for (const braceX of [-1.58, 1.58]) {
      const brace = new THREE.Mesh(rounded(0.12, 1.24, 0.12, 0.03, 3), timber);
      brace.position.set(braceX, 1.78, 0);
      brace.rotation.z = braceX < 0 ? -0.72 : 0.72;
      group.add(brace);
    }
  }

  const lanternShade = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 10),
    materialKit.clone("paper", { color: 0xf4d797, roughness: 0.72 }),
  );
  lanternShade.position.set(mirrored ? 1.04 : -1.04, 2.12, 0.68);
  lanternShade.scale.y = 1.18;
  group.add(lanternShade);
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = false;
    object.receiveShadow = true;
  });
  return group;
}

function createDirectorGardenFrame(materialKit) {
  const group = new THREE.Group();
  group.name = "EchoGardenDirectorScreenStructure";
  group.position.z = -2.82;
  const timber = materialKit.clone("deepWood", { color: 0x684737, roughness: 0.7 });
  for (const x of [-4.04, 4.04]) {
    const post = new THREE.Mesh(rounded(0.22, 5.15, 0.25, 0.055, 4), timber);
    post.position.set(x, 2.49, 0);
    post.castShadow = true;
    post.receiveShadow = true;
    group.add(post);
    const foot = new THREE.Mesh(
      rounded(0.48, 0.12, 0.52, 0.055, 4),
      materialKit.clone("brass", { roughness: 0.3, metalness: 0.7 }),
    );
    foot.position.set(x, -0.015, 0.04);
    group.add(foot);
  }
  const crossbar = new THREE.Mesh(rounded(8.42, 0.24, 0.28, 0.06, 4), timber);
  crossbar.position.set(0, 5.03, 0);
  crossbar.castShadow = true;
  group.add(crossbar);
  const shade = new THREE.Mesh(
    rounded(8.8, 0.12, 1.2, 0.055, 4),
    materialKit.clone("textile", { color: 0xd6a96d, roughness: 0.88 }),
  );
  shade.position.set(0, 5.11, 0.24);
  shade.rotation.x = -0.1;
  shade.castShadow = true;
  group.add(shade);
  const fastenerMaterial = materialKit.clone("brass", { roughness: 0.2, metalness: 0.92 });
  for (const x of [-3.92, 3.92]) {
    for (const y of [0.62, 4.86]) {
      const fastener = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), fastenerMaterial);
      fastener.position.set(x, y, 0.17);
      group.add(fastener);
    }
  }
  const bulbMaterial = materialKit.clone("ceramic", {
    color: 0xffd58c,
    emissive: 0x6e4316,
    emissiveIntensity: 0.3,
    roughness: 0.42,
  });
  for (let index = 0; index < 9; index += 1) {
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.075, 10, 8), bulbMaterial);
    bulb.position.set(-3.45 + index * 0.86, 5.02 + Math.sin((index / 8) * Math.PI) * 0.08, 0.08);
    group.add(bulb);
  }
  const vineMaterial = materialKit.clone("leaf", { color: 0x5d8f50, roughness: 0.86 });
  vineMaterial.vertexColors = true;
  vineMaterial.needsUpdate = true;
  group.userData.windStates = [installEchoGardenWind(vineMaterial, 0.032)];
  const vineGeometry = new THREE.IcosahedronGeometry(0.18, 1);
  const vineLeaves = new THREE.InstancedMesh(vineGeometry, vineMaterial, 28);
  const vineMatrix = new THREE.Matrix4();
  let vineIndex = 0;
  for (const side of [-1, 1]) {
    for (let index = 0; index < 10; index += 1) {
      const y = 0.52 + index * 0.45;
      const x = side * (4.0 + Math.sin(index * 1.7) * 0.14);
      placeInstanced(
        vineLeaves,
        vineIndex,
        new THREE.Vector3(x, y, 0.18 + Math.cos(index * 1.3) * 0.08),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(index * 0.21, index * 0.49, index * 0.17)),
        new THREE.Vector3(1.05 + (index % 3) * 0.18, 0.72 + (index % 2) * 0.16, 0.72),
        vineMatrix,
      );
      vineLeaves.setColorAt(vineIndex, new THREE.Color(index % 3 === 0 ? 0x7caf58 : 0x4f7d49));
      vineIndex += 1;
    }
  }
  for (let index = 0; index < 8; index += 1) {
    placeInstanced(
      vineLeaves,
      vineIndex,
      new THREE.Vector3(-3.45 + index * 0.98, 5.04 + Math.sin(index * 0.8) * 0.12, 0.15),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(index * 0.19, index * 0.63, 0)),
      new THREE.Vector3(1.12, 0.72, 0.76),
      vineMatrix,
    );
    vineLeaves.setColorAt(vineIndex, new THREE.Color(index % 2 === 0 ? 0x6e9e55 : 0x4d7847));
    vineIndex += 1;
  }
  vineLeaves.instanceMatrix.needsUpdate = true;
  if (vineLeaves.instanceColor) vineLeaves.instanceColor.needsUpdate = true;
  vineLeaves.castShadow = false;
  vineLeaves.receiveShadow = true;
  group.add(vineLeaves);
  return group;
}

function createDirectorGardenPlanters(materialKit) {
  const group = new THREE.Group();
  group.name = "EchoGardenDirectorPlanters";
  const potColors = [0xc66d55, 0x658fab];
  for (const [index, x] of [-4.72, 4.72].entries()) {
    const pot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.38, 0.29, 0.62, 18),
      materialKit.clone(index === 0 ? "roofRed" : "roofBlue", {
        color: potColors[index],
        roughness: 0.72,
      }),
    );
    pot.position.set(x, -0.26, -3.18);
    pot.castShadow = true;
    pot.receiveShadow = true;
    group.add(pot);
    const lip = new THREE.Mesh(
      new THREE.TorusGeometry(0.38, 0.055, 8, 24),
      materialKit.clone(index === 0 ? "roofRed" : "roofBlue", {
        color: potColors[index],
        roughness: 0.72,
      }),
    );
    lip.position.set(x, 0.045, -3.18);
    lip.rotation.x = Math.PI / 2;
    group.add(lip);
    const soil = new THREE.Mesh(
      new THREE.CircleGeometry(0.32, 24),
      materialKit.clone("soil", { color: 0x5e4738, roughness: 0.96 }),
    );
    soil.position.set(x, 0.055, -3.18);
    soil.rotation.x = -Math.PI / 2;
    group.add(soil);
  }
  const leafGeometry = new THREE.PlaneGeometry(0.2, 0.9, 1, 3);
  leafGeometry.translate(0, 0.45, 0);
  const leafMaterial = materialKit.clone("leaf", { color: 0x5f9450, roughness: 0.84 });
  leafMaterial.vertexColors = true;
  leafMaterial.needsUpdate = true;
  group.userData.windStates = [installEchoGardenWind(leafMaterial, 0.04)];
  const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, 16);
  const leafMatrix = new THREE.Matrix4();
  for (let index = 0; index < 16; index += 1) {
    const side = index < 8 ? -1 : 1;
    const local = index % 8;
    const angle = (local / 8) * TWO_PI;
    placeInstanced(
      leaves,
      index,
      new THREE.Vector3(side * 4.72, 0.02, -3.18),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle, (local - 3.5) * 0.09)),
      new THREE.Vector3(0.82 + (local % 3) * 0.14, 0.78 + (local % 4) * 0.09, 1),
      leafMatrix,
    );
    leaves.setColorAt(index, new THREE.Color(local % 3 === 0 ? 0x82b85a : 0x4f8248));
  }
  leaves.castShadow = false;
  leaves.receiveShadow = true;
  leaves.instanceMatrix.needsUpdate = true;
  if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
  group.add(leaves);
  return group;
}

function createGardenBirdBath(materialKit) {
  const group = new THREE.Group();
  group.name = "EchoGardenBirdBath";
  group.position.set(6.15, 0, 5.1);
  const stone = materialKit.clone("cobble", { color: 0xb8b4a8, roughness: 0.88 });
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.7, 0.18, 18), stone);
  foot.position.y = -0.49;
  foot.receiveShadow = true;
  group.add(foot);
  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.34, 1.05, 16), stone);
  pedestal.position.y = 0.08;
  pedestal.castShadow = true;
  pedestal.receiveShadow = true;
  group.add(pedestal);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.58, 0.24, 28, 1, true), stone);
  bowl.position.y = 0.67;
  bowl.castShadow = true;
  group.add(bowl);
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(0.68, 36),
    materialKit.clone("glass", { color: 0x79bac7, roughness: 0.16, transmission: 0.72, opacity: 0.7 }),
  );
  water.rotation.x = -Math.PI / 2;
  water.position.y = 0.79;
  group.add(water);
  const bird = new THREE.Group();
  bird.position.set(0.36, 1.02, 0.04);
  const birdMaterial = materialKit.clone("paper", { color: 0xd39a65, roughness: 0.82 });
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 8), birdMaterial);
  body.scale.set(1.22, 0.9, 0.86);
  bird.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.105, 12, 8), birdMaterial);
  head.position.set(0.15, 0.12, 0);
  bird.add(head);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 8), materialKit.clone("paper", { color: 0xe5bd68 }));
  beak.position.set(0.28, 0.12, 0);
  beak.rotation.z = -Math.PI / 2;
  bird.add(beak);
  group.add(bird);
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
    [-4, 15.8, -29, 4.8, 2.0, 3.2],
    [18, 16.1, -31, 5.2, 2.1, 4.0],
    [-20, 12.6, -11, 4.5, 1.9, 4.8],
    [4, 10.2, 9, 3.7, 1.55, 5.6],
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
  const layout = createEchoGardenLayout();
  const windStates = [];
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

  const legGeometry = rounded(0.48, 0.32, 0.48, 0.08, 4);
  for (const [x, z] of [[-4.1, -2.35], [4.1, -2.35], [-4.1, 2.35], [4.1, 2.35]]) {
    const leg = new THREE.Mesh(legGeometry, materialKit.materials.deepWood);
    leg.position.set(x, -0.44, z);
    leg.castShadow = true;
    leg.receiveShadow = true;
    environment.add(leg);
  }

  const directorGardenFrame = createDirectorGardenFrame(materialKit);
  windStates.push(...(directorGardenFrame.userData.windStates || []));
  environment.add(directorGardenFrame);
  const directorPlanters = createDirectorGardenPlanters(materialKit);
  windStates.push(...(directorPlanters.userData.windStates || []));
  const birdBath = createGardenBirdBath(materialKit);
  environment.add(directorPlanters, birdBath);

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
  const crownGeometry = new THREE.IcosahedronGeometry(1.52, 2);
  const treePositions = [[-11, -7], [-7, -11], [8, -10], [12, -4], [-13, 2], [13, 5], [-8, 10], [7, 11]];
  const trunks = new THREE.InstancedMesh(trunkGeometry, materialKit.materials.bark, treePositions.length);
  const crownMaterial = materialKit.clone("leaf", { roughness: 0.82 });
  windStates.push(installEchoGardenWind(crownMaterial, 0.052));
  const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, treePositions.length * 5);
  treePositions.forEach(([x, z], index) => {
    placeInstanced(
      trunks,
      index,
      new THREE.Vector3(x, 1.55, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.63, (index % 2 ? -1 : 1) * 0.025)),
      new THREE.Vector3(1 + (index % 3) * 0.08, 1, 1),
      matrix,
    );
    for (let layer = 0; layer < 5; layer += 1) {
      const offsets = [[0, 0], [-0.86, -0.2], [0.72, 0.34], [-0.28, 0.72], [0.36, -0.68]];
      const offset = offsets[layer];
      const scale = layer === 0 ? 1 : 0.52 + (layer % 3) * 0.08;
      const crownIndex = index * 5 + layer;
      placeInstanced(
        crowns,
        crownIndex,
        new THREE.Vector3(x + offset[0], 4.0 + (layer % 3) * 0.34, z + offset[1]),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.37 + layer * 0.41, layer * 0.035)),
        new THREE.Vector3(scale * (1.08 + (index % 3) * 0.08), scale, scale * 1.03),
        matrix,
      );
      const tint = new THREE.Color(
        layer === 0
          ? ECHO_RECORD_GARDEN_PALETTE.foliageMid
          : layer === 1 || layer === 4
            ? ECHO_RECORD_GARDEN_PALETTE.foliageShadow
            : ECHO_RECORD_GARDEN_PALETTE.foliageLight,
      );
      crowns.setColorAt(crownIndex, tint.offsetHSL((index % 3 - 1) * 0.012, 0, 0));
    }
  });
  trunks.castShadow = true;
  trunks.receiveShadow = true;
  crowns.castShadow = false;
  crowns.receiveShadow = true;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  environment.add(trunks, crowns);

  const rootFlares = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.48, 0.72, 0.24, 10),
    materialKit.materials.bark,
    treePositions.length,
  );
  treePositions.forEach(([x, z], index) => {
    placeInstanced(
      rootFlares,
      index,
      new THREE.Vector3(x, -0.49, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, index * 0.71, 0)),
      new THREE.Vector3(1 + (index % 3) * 0.08, 1, 0.88 + (index % 2) * 0.12),
      matrix,
    );
  });
  rootFlares.castShadow = true;
  rootFlares.receiveShadow = true;
  rootFlares.instanceMatrix.needsUpdate = true;
  environment.add(rootFlares);

  const contactShadowTexture = createContactShadowTexture();
  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    map: contactShadowTexture,
    color: 0x526044,
    transparent: true,
    opacity: 0.44,
    depthWrite: false,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
  });
  contactShadowMaterial.name = "EchoGarden.ContactShadowMaterial";
  const contactSpecs = [
    ...treePositions.map(([x, z], index) => ({ x, z, sx: 1.1 + (index % 3) * 0.14, sz: 0.9 + (index % 2) * 0.12 })),
    { x: -10.8, z: -14.3, sx: 2.35, sz: 1.72 },
    { x: 10.7, z: -13.8, sx: 2.35, sz: 1.72 },
  ];
  const contactShadows = new THREE.InstancedMesh(
    new THREE.CircleGeometry(1, 32),
    contactShadowMaterial,
    contactSpecs.length,
  );
  contactSpecs.forEach((spec, index) => {
    placeInstanced(
      contactShadows,
      index,
      new THREE.Vector3(spec.x, -0.568, spec.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, index * 0.43)),
      new THREE.Vector3(spec.sx, spec.sz, 1),
      matrix,
    );
  });
  contactShadows.renderOrder = 2;
  contactShadows.instanceMatrix.needsUpdate = true;
  environment.add(contactShadows);

  const hedgeGeometry = new THREE.DodecahedronGeometry(0.72, 1);
  const hedgeMaterial = materialKit.clone("foliage", { roughness: 0.9 });
  const hedges = new THREE.InstancedMesh(hedgeGeometry, hedgeMaterial, 42);
  const hedgeRng = makeGardenRng(34129);
  for (let index = 0; index < 42; index += 1) {
    const angle = (index / 42) * TWO_PI + gardenRange(hedgeRng, -0.055, 0.055);
    const radius = 16.5 + gardenRange(hedgeRng, -0.42, 0.68);
    const width = gardenRange(hedgeRng, 0.98, 1.42);
    const height = gardenRange(hedgeRng, 0.78, 1.08);
    placeInstanced(
      hedges,
      index,
      new THREE.Vector3(Math.cos(angle) * radius, 0.02 + gardenRange(hedgeRng, -0.03, 0.08), Math.sin(angle) * radius),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, angle + gardenRange(hedgeRng, -0.6, 0.6), 0)),
      new THREE.Vector3(width, height, gardenRange(hedgeRng, 0.88, 1.18)),
      matrix,
    );
    hedges.setColorAt(index, new THREE.Color(index % 3 === 0 ? 0x5e8d53 : 0x47764a));
  }
  hedges.receiveShadow = true;
  hedges.instanceMatrix.needsUpdate = true;
  if (hedges.instanceColor) hedges.instanceColor.needsUpdate = true;
  environment.add(hedges);

  const grassBladeGeometry = createGrassTuftGeometry();
  const grassBladeMaterial = materialKit.clone("leaf", {
    color: ECHO_RECORD_GARDEN_PALETTE.grassLight,
    roughness: 0.92,
  });
  grassBladeMaterial.vertexColors = true;
  grassBladeMaterial.needsUpdate = true;
  windStates.push(installEchoGardenWind(grassBladeMaterial, 0.065));
  const grassBlades = new THREE.InstancedMesh(grassBladeGeometry, grassBladeMaterial, layout.grass.length);
  layout.grass.forEach((point, index) => {
    placeInstanced(
      grassBlades,
      index,
      new THREE.Vector3(point.x, -0.57, point.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, point.rotation, (index % 2 ? -1 : 1) * 0.035)),
      new THREE.Vector3(point.scale, 0.78 + point.scale * 0.25, point.scale),
      matrix,
    );
    grassBlades.setColorAt(
      index,
      new THREE.Color(point.clusterIndex % 2 === 0 ? 0x78ad4f : 0x5f9850),
    );
  });
  grassBlades.receiveShadow = true;
  grassBlades.instanceMatrix.needsUpdate = true;
  if (grassBlades.instanceColor) grassBlades.instanceColor.needsUpdate = true;
  environment.add(grassBlades);

  const flowerGeometry = createFlowerHeadGeometry();
  const flowerMaterial = materialKit.clone("paper", { color: ECHO_RECORD_GARDEN_PALETTE.rose, roughness: 0.7 });
  flowerMaterial.vertexColors = true;
  flowerMaterial.needsUpdate = true;
  windStates.push(installEchoGardenWind(flowerMaterial, 0.028));
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, layout.flowers.length);
  const stemMaterial = materialKit.clone("leaf", { color: 0x4f7f43, roughness: 0.9 });
  stemMaterial.vertexColors = false;
  stemMaterial.needsUpdate = true;
  windStates.push(installEchoGardenWind(stemMaterial, 0.018));
  const flowerStems = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.012, 0.02, 0.29, 6),
    stemMaterial,
    layout.flowers.length,
  );
  const flowerColors = [0xef8fa8, 0xf6cf65, 0xe9e6df, 0xb88bd5];
  layout.flowers.forEach((point, index) => {
    const headHeight = -0.27 + (point.scale - 1) * 0.04;
    placeInstanced(
      flowers,
      index,
      new THREE.Vector3(point.x, headHeight, point.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (index % 3 - 1) * 0.07, point.rotation, 0)),
      new THREE.Vector3(point.scale, point.scale, point.scale),
      matrix,
    );
    placeInstanced(
      flowerStems,
      index,
      new THREE.Vector3(point.x, -0.425, point.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler((index % 2 ? -1 : 1) * 0.025, point.rotation, 0)),
      new THREE.Vector3(1, 0.92 + point.scale * 0.08, 1),
      matrix,
    );
    flowers.setColorAt(index, new THREE.Color(flowerColors[point.color % flowerColors.length]));
  });
  flowers.instanceMatrix.needsUpdate = true;
  flowerStems.instanceMatrix.needsUpdate = true;
  if (flowers.instanceColor) flowers.instanceColor.needsUpdate = true;
  environment.add(flowerStems, flowers);

  const cloverMaterial = materialKit.clone("leaf", { color: 0x4f8645, roughness: 0.9 });
  cloverMaterial.vertexColors = true;
  cloverMaterial.needsUpdate = true;
  const clover = new THREE.InstancedMesh(createCloverGeometry(), cloverMaterial, layout.clover.length);
  layout.clover.forEach((point, index) => {
    placeInstanced(
      clover,
      index,
      new THREE.Vector3(point.x, -0.566, point.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, point.rotation)),
      new THREE.Vector3(point.scale, point.scale, point.scale),
      matrix,
    );
    clover.setColorAt(index, new THREE.Color(index % 4 === 0 ? 0x6aa858 : 0x4e8748));
  });
  clover.receiveShadow = true;
  clover.instanceMatrix.needsUpdate = true;
  if (clover.instanceColor) clover.instanceColor.needsUpdate = true;
  environment.add(clover);

  const pebbleGeometry = new THREE.DodecahedronGeometry(0.12, 0);
  const pebbleMaterial = materialKit.materials.stone;
  const pebbles = new THREE.InstancedMesh(pebbleGeometry, pebbleMaterial, layout.pebbles.length);
  layout.pebbles.forEach((point, index) => {
    placeInstanced(
      pebbles,
      index,
      new THREE.Vector3(point.x, -0.535, point.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(index * 0.23, point.rotation, 0)),
      new THREE.Vector3(point.scale, 0.38 + (index % 2) * 0.1, point.scale * 0.82),
      matrix,
    );
  });
  pebbles.receiveShadow = true;
  pebbles.instanceMatrix.needsUpdate = true;
  environment.add(pebbles);

  const fallenLeafMaterial = materialKit.clone("paper", { color: 0xc18a4e, roughness: 0.87 });
  fallenLeafMaterial.vertexColors = true;
  fallenLeafMaterial.needsUpdate = true;
  const fallenLeaves = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(0.18, 0.09),
    fallenLeafMaterial,
    layout.fallenLeaves.length,
  );
  const leafColors = [0xc18a4e, 0xd0a45d, 0xa96f45, 0xb58a52];
  layout.fallenLeaves.forEach((point, index) => {
    placeInstanced(
      fallenLeaves,
      index,
      new THREE.Vector3(point.x, -0.562, point.z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, point.rotation * 0.08, point.rotation)),
      new THREE.Vector3(point.scale, point.scale, point.scale),
      matrix,
    );
    fallenLeaves.setColorAt(index, new THREE.Color(leafColors[point.clusterIndex % leafColors.length]));
  });
  fallenLeaves.instanceMatrix.needsUpdate = true;
  if (fallenLeaves.instanceColor) fallenLeaves.instanceColor.needsUpdate = true;
  environment.add(fallenLeaves);

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
  sun.shadow.camera.left = -9.5;
  sun.shadow.camera.right = 9.5;
  sun.shadow.camera.top = 9.5;
  sun.shadow.camera.bottom = -9.5;
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

  let activeDetailTier = "full";
  const setDetailTier = (tier = "full") => {
    activeDetailTier = tier === "reduced" ? "reduced" : "full";
    const fullDetail = activeDetailTier === "full";
    clover.visible = fullDetail;
    fallenLeaves.visible = fullDetail;
    leafDrift.visible = fullDetail;
    bokeh.visible = fullDetail;
    clouds.children.forEach((cloud, index) => {
      cloud.visible = fullDetail || index % 2 === 0;
    });
    return activeDetailTier;
  };

  const metrics = Object.freeze({
    profileId: ECHO_RECORD_GARDEN_VISUAL_PROFILE.id,
    activeLights: 3,
    shadowCastingLights: 1,
    sharedSurfaceTextures: materialKit.textures.length + 3,
    instancedDetailCount:
      14
      + treePositions.length
      + treePositions.length * 5
      + treePositions.length
      + contactSpecs.length
      + 42
      + layout.grass.length
      + layout.flowers.length * 2
      + layout.clover.length
      + layout.pebbles.length
      + layout.fallenLeaves.length
      + 24
      + 28
      + 16,
    authoredSetPieceCount: 15,
    materialRoles: Object.keys(materialKit.materials).length,
    postProcessingPasses: 0,
    qualityTiers: Object.freeze(["reduced", "full"]),
    adaptiveDetail: true,
    surfaceBakeCacheEntries: echoGardenSurfaceBakeCache.size,
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
    birdBath,
    windStates,
    materialKit,
    metrics,
    setDetailTier,
    getDetailTier: () => activeDetailTier,
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
      [...materialKit.textures, skyTexture, cloudTexture, contactShadowTexture].forEach((texture) => texture.dispose?.());
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
    resources.windStates?.forEach((state) => {
      state.uniforms.uEchoGardenWindTime.value = 0;
      state.uniforms.uEchoGardenWindStrength.value = 0;
    });
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
  resources.windStates?.forEach((state) => {
    state.uniforms.uEchoGardenWindTime.value = elapsed;
    state.uniforms.uEchoGardenWindStrength.value = state.amplitude;
  });
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
