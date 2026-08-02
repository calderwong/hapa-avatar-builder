/*
 * Adapted from pallet-town-3d/src/core/Noise.ts.
 * Copyright (c) 2026 Paulius. Used under the MIT License.
 * See THIRD_PARTY_NOTICES.md for the complete notice and source lineage.
 */

export function makeGardenRng(seed) {
  let state = Number(seed) >>> 0;
  return function gardenRng() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function gardenRange(rng, minimum, maximum) {
  return minimum + rng() * (maximum - minimum);
}

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3;
const G3 = 1 / 6;

const GRADIENTS = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0,
  1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1,
  0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1,
]);

export class EchoGardenSimplex {
  constructor(seed = 1337) {
    this.permutation = new Uint8Array(512);
    this.permutationMod12 = new Uint8Array(512);
    const rng = makeGardenRng(seed);
    const source = new Uint8Array(256);
    for (let index = 0; index < 256; index += 1) source[index] = index;
    for (let index = 255; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng() * (index + 1));
      const current = source[index];
      source[index] = source[swapIndex];
      source[swapIndex] = current;
    }
    for (let index = 0; index < 512; index += 1) {
      this.permutation[index] = source[index & 255];
      this.permutationMod12[index] = this.permutation[index] % 12;
    }
  }

  noise2D(xin, yin) {
    const permutation = this.permutation;
    const permutationMod12 = this.permutationMod12;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    const skew = (xin + yin) * F2;
    const i = Math.floor(xin + skew);
    const j = Math.floor(yin + skew);
    const unskew = (i + j) * G2;
    const x0 = xin - (i - unskew);
    const y0 = yin - (j - unskew);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = x0 > y0 ? 0 : 1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 >= 0) {
      const gradient = permutationMod12[ii + permutation[jj]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (GRADIENTS[gradient] * x0 + GRADIENTS[gradient + 1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 >= 0) {
      const gradient = permutationMod12[ii + i1 + permutation[jj + j1]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (GRADIENTS[gradient] * x1 + GRADIENTS[gradient + 1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 >= 0) {
      const gradient = permutationMod12[ii + 1 + permutation[jj + 1]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (GRADIENTS[gradient] * x2 + GRADIENTS[gradient + 1] * y2);
    }
    return 70 * (n0 + n1 + n2);
  }

  noise3D(xin, yin, zin) {
    const permutation = this.permutation;
    const permutationMod12 = this.permutationMod12;
    let n0 = 0;
    let n1 = 0;
    let n2 = 0;
    let n3 = 0;
    const skew = (xin + yin + zin) * F3;
    const i = Math.floor(xin + skew);
    const j = Math.floor(yin + skew);
    const k = Math.floor(zin + skew);
    const unskew = (i + j + k) * G3;
    const x0 = xin - (i - unskew);
    const y0 = yin - (j - unskew);
    const z0 = zin - (k - unskew);
    let i1;
    let j1;
    let k1;
    let i2;
    let j2;
    let k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else if (y0 < z0) {
      i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
    } else if (x0 < z0) {
      i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
    } else {
      i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
    }
    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;
    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;
    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 >= 0) {
      const gradient = permutationMod12[ii + permutation[jj + permutation[kk]]] * 3;
      t0 *= t0;
      n0 = t0 * t0 * (
        GRADIENTS[gradient] * x0
        + GRADIENTS[gradient + 1] * y0
        + GRADIENTS[gradient + 2] * z0
      );
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 >= 0) {
      const gradient = permutationMod12[ii + i1 + permutation[jj + j1 + permutation[kk + k1]]] * 3;
      t1 *= t1;
      n1 = t1 * t1 * (
        GRADIENTS[gradient] * x1
        + GRADIENTS[gradient + 1] * y1
        + GRADIENTS[gradient + 2] * z1
      );
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 >= 0) {
      const gradient = permutationMod12[ii + i2 + permutation[jj + j2 + permutation[kk + k2]]] * 3;
      t2 *= t2;
      n2 = t2 * t2 * (
        GRADIENTS[gradient] * x2
        + GRADIENTS[gradient + 1] * y2
        + GRADIENTS[gradient + 2] * z2
      );
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 >= 0) {
      const gradient = permutationMod12[ii + 1 + permutation[jj + 1 + permutation[kk + 1]]] * 3;
      t3 *= t3;
      n3 = t3 * t3 * (
        GRADIENTS[gradient] * x3
        + GRADIENTS[gradient + 1] * y3
        + GRADIENTS[gradient + 2] * z3
      );
    }
    return 32 * (n0 + n1 + n2 + n3);
  }
}

export function echoGardenTileableFbm(simplex, u, v, frequency, octaves = 5, gain = 0.5) {
  let amplitude = 1;
  let octaveFrequency = frequency;
  let sum = 0;
  let normalization = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    const a = u * Math.PI * 2;
    const b = v * Math.PI * 2;
    const radius = octaveFrequency / (Math.PI * 2);
    const nx = Math.cos(a) * radius;
    const ny = Math.sin(a) * radius;
    const nz = Math.cos(b) * radius;
    const nw = Math.sin(b) * radius;
    const sample = 0.5 * (
      simplex.noise3D(nx, ny, nz)
      + simplex.noise3D(ny, nz, nw)
    );
    sum += amplitude * sample;
    normalization += amplitude;
    amplitude *= gain;
    octaveFrequency *= 2;
  }
  return sum / Math.max(0.00001, normalization);
}

function gardenHash2(x, y, seed) {
  let hash = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
  return (hash ^ (hash >>> 16)) >>> 0;
}

export function echoGardenWorley(u, v, cells, seed = 1) {
  const x = u * cells;
  const y = v * cells;
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let first = 1e9;
  let second = 1e9;
  let id = 0;
  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      const cellX = ((xi + offsetX) % cells + cells) % cells;
      const cellY = ((yi + offsetY) % cells + cells) % cells;
      const hash = gardenHash2(cellX, cellY, seed);
      const pointX = xi + offsetX + (hash & 0xffff) / 65535;
      const pointY = yi + offsetY + ((hash >>> 16) & 0xffff) / 65535;
      const distance = Math.hypot(pointX - x, pointY - y);
      if (distance < first) {
        second = first;
        first = distance;
        id = hash;
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  return { first: Math.min(1, first), second: Math.min(1, second), id };
}

export function echoGardenSmoothstep(edge0, edge1, value) {
  const denominator = edge1 - edge0;
  const t = denominator === 0
    ? value >= edge1 ? 1 : 0
    : Math.min(1, Math.max(0, (value - edge0) / denominator));
  return t * t * (3 - 2 * t);
}
