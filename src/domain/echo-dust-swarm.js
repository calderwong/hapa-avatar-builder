// Echo Score Dust particle kernel.
//
// Hapa reimplementation of architectural ideas recorded in
// docs/ECHO_SCORE_DUST.md (Nanodot deconstruction, 2026-10-23). No Nanodot
// source, shader text or artwork is copied; constants below are Hapa choices
// unless the doc names them as observed values.
//
// Every particle keeps a persistent position/velocity and a separate desired
// place. Formations only describe targets (position, normal, band coordinate,
// flexibility); one motion kernel moves every formation. The kernel is
// deterministic for a given seed, count and control sequence.

export const DUST_BAND_COUNT = 32;
export const DUST_MAX_STEP_SECONDS = 1 / 30;
export const DUST_FIXED_STEP_SECONDS = 1 / 60;
export const DUST_VISIBILITY_TAU_SECONDS = 0.35;
export const DUST_MAX_PARTICLES = 20000;
export const DUST_SHOCK_SPEED = 2.6;

const TAU = Math.PI * 2;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

/** Stable 32-bit integer hash (lowbias32). Same inputs, same value, every platform. */
export function hash32(a, b = 0, c = 0) {
  let x = (Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1)) >>> 0;
  x ^= x >>> 16; x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15; x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}
export const hashUnit = (a, b = 0, c = 0) => hash32(a, b, c) / 4294967296;

/** Seed from any string identity (FNV-1a), e.g. a song's source hash. */
export function seedFromString(value = "") {
  let h = 0x811c9dc5;
  for (const char of String(value)) { h ^= char.codePointAt(0); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

function normalize3(x, y, z) {
  const length = Math.hypot(x, y, z) || 1;
  return [x / length, y / length, z / length];
}

// Each formation maps (u, v, w) in [0,1) to [x, y, z, nx, ny, nz, bandCoordinate].
// u is the particle's ordered slot; v and w are stable hashed randoms.
const FORMATIONS = {
  ring(u, v) {
    const a = u * TAU, r = 1 + (v - 0.5) * 0.06;
    return [Math.cos(a) * r, (v - 0.5) * 0.08, Math.sin(a) * r, Math.cos(a), 0, Math.sin(a), u];
  },
  helix(u, v) {
    const strand = v < 0.5 ? 0 : Math.PI, a = u * 6 * Math.PI + strand;
    return [Math.cos(a) * 0.55, (u - 0.5) * 2.2, Math.sin(a) * 0.55, Math.cos(a), 0, Math.sin(a), u];
  },
  sheet(u, v, w, i, n) {
    const columns = Math.max(1, Math.ceil(Math.sqrt(n))), col = i % columns, row = Math.floor(i / columns);
    const x = ((col + 0.5) / columns - 0.5) * 2.4, z = ((row + 0.5) / columns - 0.5) * 2.4;
    return [x, -0.35, z, 0, 1, 0, clamp((x + 1.2) / 2.4)];
  },
  sphere(u, v, w, i, n) {
    const y = 1 - 2 * ((i + 0.5) / n), r = Math.sqrt(1 - y * y), a = i * GOLDEN_ANGLE;
    return [Math.cos(a) * r, y, Math.sin(a) * r, Math.cos(a) * r, y, Math.sin(a) * r, (y + 1) / 2];
  },
  gem(u, v, w, i, n) {
    const y0 = 1 - 2 * ((i + 0.5) / n), r0 = Math.sqrt(1 - y0 * y0), a = i * GOLDEN_ANGLE;
    let x = Math.cos(a) * r0, y = y0, z = Math.sin(a) * r0;
    const l1 = Math.abs(x) + Math.abs(y) + Math.abs(z) || 1;
    x /= l1; y /= l1; z /= l1;
    const [nx, ny, nz] = normalize3(Math.sign(x) || 1, Math.sign(y) || 1, Math.sign(z) || 1);
    return [x * 1.25, y * 1.4, z * 1.25, nx, ny, nz, u];
  },
  attractor(u, v, w) {
    // (3,7) torus knot with a thin hashed tube.
    const t = u * TAU, p = 3, q = 7, r = 0.7 + 0.28 * Math.cos(q * t);
    const cx = r * Math.cos(p * t), cy = 0.28 * Math.sin(q * t), cz = r * Math.sin(p * t);
    const a = v * TAU, tube = 0.05 * Math.sqrt(w);
    const [nx, ny, nz] = normalize3(cx, cy * 2, cz);
    return [cx + Math.cos(a) * tube, cy + Math.sin(a) * tube, cz + Math.sin(a) * tube, nx, ny, nz, u];
  },
  spiral(u, v, w) {
    const arm = v < 0.5 ? 0 : Math.PI, r = 0.08 + Math.sqrt(u) * 1.15, a = arm + Math.log(r / 0.08) * 1.9 + (w - 0.5) * 0.35;
    const [nx, ny, nz] = normalize3(Math.cos(a), 0.6, Math.sin(a));
    return [Math.cos(a) * r, (w - 0.5) * 0.08 * (1.2 - r), Math.sin(a) * r, nx, ny, nz, clamp(r / 1.23)];
  },
  fountain(u, v, w) {
    const a = v * TAU, s = u, spread = 0.75 + w * 0.25;
    const x = Math.cos(a) * s * spread, z = Math.sin(a) * s * spread, y = 2.4 * s - 2.2 * s * s - 0.85;
    const [nx, ny, nz] = normalize3(Math.cos(a), 0.4, Math.sin(a));
    return [x, y, z, nx, ny, nz, s];
  },
  dandelion(u, v, w, i, n) {
    const y0 = 1 - 2 * ((i + 0.5) / n), r0 = Math.sqrt(1 - y0 * y0), a = i * GOLDEN_ANGLE;
    const radius = 0.18 + 0.82 * Math.pow(w, 0.25);
    return [Math.cos(a) * r0 * radius, y0 * radius + 0.15, Math.sin(a) * r0 * radius, Math.cos(a) * r0, y0, Math.sin(a) * r0, radius];
  },
  sunflower(u, v, w, i, n) {
    const r = Math.sqrt((i + 0.5) / n) * 1.15, a = i * GOLDEN_ANGLE;
    const [nx, ny, nz] = normalize3(Math.cos(a) * r * 0.3, 1, Math.sin(a) * r * 0.3);
    return [Math.cos(a) * r, 0.25 - r * r * 0.18, Math.sin(a) * r, nx, ny, nz, clamp(r / 1.15)];
  },
  mobius(u, v) {
    const a = u * TAU, s = (v - 0.5) * 0.6, half = a / 2, radial = 1 + s * Math.cos(half);
    // Surface normal of the standard Möbius parameterisation.
    const [nx, ny, nz] = normalize3(Math.cos(a) * Math.sin(half), -Math.cos(half), Math.sin(a) * Math.sin(half));
    return [radial * Math.cos(a), s * Math.sin(half), radial * Math.sin(a), nx, ny, nz, u];
  },
  shell(u, v) {
    const a = u * 5 * Math.PI, r = 0.08 * Math.exp(0.17 * a), cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = 0.9 - u * 1.8;
    const tube = r * 0.38, b = v * TAU;
    const nx = Math.cos(a) * Math.cos(b), ny = Math.sin(b), nz = Math.sin(a) * Math.cos(b);
    return [cx + nx * tube, cy + ny * tube, cz + nz * tube, nx, ny, nz, u];
  },
  jellyfish(u, v, w) {
    if (v < 0.6) {
      const a = (v / 0.6) * TAU, polar = Math.sqrt(w) * Math.PI * 0.45;
      const nx = Math.sin(polar) * Math.cos(a), ny = Math.cos(polar), nz = Math.sin(polar) * Math.sin(a);
      return [nx * 0.9, ny * 0.65 + 0.2, nz * 0.9, nx, ny, nz, polar / (Math.PI * 0.45) * 0.5];
    }
    const k = Math.floor(((v - 0.6) / 0.4) * 9), a = (k / 9) * TAU, t = w;
    const sway = Math.sin(t * 7 + k) * 0.06, radius = 0.55 - t * 0.2;
    return [Math.cos(a) * radius + sway, 0.2 - t * 1.5, Math.sin(a) * radius, Math.cos(a), 0, Math.sin(a), 0.5 + t * 0.5];
  },
  snowflake(u, v, w) {
    const arm = Math.floor(v * 6), a = (arm / 6) * TAU + Math.PI / 2;
    let x, y;
    if (w < 0.55) { const t = w / 0.55; x = Math.cos(a) * t; y = Math.sin(a) * t; }
    else {
      const branch = Math.floor((w - 0.55) / 0.45 * 6), side = branch % 2 ? 1 : -1, at = 0.35 + Math.floor(branch / 2) * 0.22;
      const len = (u * 0.3) * (1 - at * 0.6), ba = a + side * Math.PI / 4;
      x = Math.cos(a) * at + Math.cos(ba) * len; y = Math.sin(a) * at + Math.sin(ba) * len;
    }
    const [nx, ny] = normalize3(x, y, 0);
    return [x, y, (u - 0.5) * 0.04, nx, ny, 0, clamp(Math.hypot(x, y))];
  },
};

export const DUST_FORMATION_FAMILIES = Object.freeze(Object.keys(FORMATIONS));
// Hapa defaults for how loosely each family is held against band deformation.
const FAMILY_FLEXIBILITY = { sheet: 0.9, fountain: 0.8, dandelion: 0.75, jellyfish: 0.7, ring: 0.65 };

/**
 * Sample particle targets from RGBA pixels (text or images rasterised by the
 * host). Pixels need not come from a canvas; any {width,height,data} works.
 * Outline points get low flexibility so strokes stay legible.
 */
export function sampleDustTargetsFromPixels(image, { count = 2000, seed = 1, threshold = 0.3, scale = 1.4, mode = "auto" } = {}) {
  const { width, height, data } = image || {};
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || !data || data.length < width * height * 4) {
    throw new TypeError("RGBA pixels with integer width and height are required.");
  }
  // Backgroundless pictures (meaningful transparency) use their alpha
  // silhouette, so dark clothing still forms; opaque pictures use luminance.
  let transparent = 0;
  for (let i = 3; i < width * height * 4; i += 16) if (data[i] < 26) transparent++;
  const useAlpha = mode === "alpha" || (mode === "auto" && transparent > (width * height) / 4 * 0.05);
  const lit = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return 0;
    const o = (y * width + x) * 4, alpha = data[o + 3] / 255;
    if (useAlpha) return alpha >= 0.5 ? Math.max(threshold, alpha) : 0;
    return ((0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255) * alpha;
  };
  const candidates = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (lit(x, y) >= threshold) candidates.push(y * width + x);
  const total = Math.max(0, Math.min(DUST_MAX_PARTICLES, count | 0));
  const points = { count: 0, position: new Float32Array(total * 3), normal: new Float32Array(total * 3), param: new Float32Array(total), flex: new Float32Array(total), edge: new Uint8Array(total) };
  if (!candidates.length || !total) return points;
  const span = Math.max(width, height), half = scale / 2;
  for (let i = 0; i < total; i++) {
    // Stratified pick: deterministic, evenly spread over lit pixels.
    const slot = Math.min(candidates.length - 1, Math.floor(((i + hashUnit(i, seed, 11)) / total) * candidates.length));
    const index = candidates[slot], px = index % width, py = Math.floor(index / width);
    const edge = lit(px - 1, py) < threshold || lit(px + 1, py) < threshold || lit(px, py - 1) < threshold || lit(px, py + 1) < threshold;
    const jx = hashUnit(i, seed, 12) - 0.5, jy = hashUnit(i, seed, 13) - 0.5;
    points.position[i * 3] = ((px + 0.5 + jx) - width / 2) / span * scale;
    points.position[i * 3 + 1] = (height / 2 - (py + 0.5 + jy)) / span * scale;
    points.position[i * 3 + 2] = 0;
    points.normal[i * 3 + 2] = 1;
    points.param[i] = clamp((points.position[i * 3] + half) / scale);
    points.flex[i] = edge ? 0.15 : 0.45;
    points.edge[i] = edge ? 1 : 0;
  }
  points.count = total;
  return points;
}

/** Log-spaced 32-band reduction of an analyser byte/float spectrum. Hapa's own band map. */
export function dustBandsFromSpectrum(spectrum, out = new Float32Array(DUST_BAND_COUNT)) {
  const length = spectrum?.length || 0;
  if (!length) { out.fill(0); return out; }
  const scale = Math.max(...[spectrum[0], spectrum[Math.floor(length / 2)], 1].map(Number)) > 1 ? 255 : 1;
  // Six-octave exponential edges starting at bin 0; low bands may share bins.
  const edge = (b) => Math.floor(length * (Math.pow(2, (6 * b) / DUST_BAND_COUNT) - 1) / 63);
  for (let b = 0; b < DUST_BAND_COUNT; b++) {
    const from = Math.min(length - 1, edge(b)), to = Math.min(length, Math.max(from + 1, edge(b + 1)));
    let sum = 0;
    for (let k = from; k < to; k++) sum += Number(spectrum[k]) || 0;
    out[b] = clamp(sum / (to - from) / scale);
  }
  return out;
}

function bandAt(bands, coordinate) {
  if (!bands) return 0;
  const position = clamp(coordinate) * (DUST_BAND_COUNT - 1), low = Math.floor(position), high = Math.min(DUST_BAND_COUNT - 1, low + 1);
  return bands[low] + (bands[high] - bands[low]) * (position - low);
}

/** Create a persistent swarm. All state lives in typed arrays (16 floats per particle). */
export function createDustSwarm({ count = 6000, seed = 1 } = {}) {
  const n = clamp(Math.floor(Number(count) || 0), 1, DUST_MAX_PARTICLES);
  const s = Number(seed) >>> 0;
  // State: position + band value, velocity + visibility (2 × vec4).
  const position = new Float32Array(n * 3), velocity = new Float32Array(n * 3), band = new Float32Array(n), visibility = new Float32Array(n);
  // Target: desired position + band coordinate, normal + flexibility (2 × vec4),
  // plus the previous target for staggered formation changes.
  const target = new Float32Array(n * 3), normal = new Float32Array(n * 3), param = new Float32Array(n), flex = new Float32Array(n), previous = new Float32Array(n * 3);
  // Stable per-particle variation from the integer hash.
  const frequency = new Float32Array(n), size = new Float32Array(n), brightness = new Float32Array(n), rank = new Float32Array(n), lag = new Float32Array(n), scatter = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    frequency[i] = 0.7 + 0.6 * hashUnit(i, s, 1);
    size[i] = 0.6 + 0.8 * hashUnit(i, s, 2);
    brightness[i] = 0.7 + 0.6 * hashUnit(i, s, 3);
    rank[i] = hashUnit(i, s, 4);
    lag[i] = hashUnit(i, s, 5);
    const [sx, sy, sz] = normalize3(hashUnit(i, s, 6) - 0.5, hashUnit(i, s, 7) - 0.5, hashUnit(i, s, 8) - 0.5);
    scatter[i * 3] = sx; scatter[i * 3 + 1] = sy; scatter[i * 3 + 2] = sz;
  }
  const shocks = [];
  let time = 0, rotation = 0, formation = null, switchedAt = -Infinity, stagger = 0, pendingKick = 0;

  /** Return to the seeded initial state at a given simulation time. */
  function reset(startTime = 0) {
    for (let i = 0; i < n * 3; i++) { position[i] = scatter[i] * 2.5; velocity[i] = 0; target[i] = 0; previous[i] = 0; normal[i] = 0; }
    visibility.fill(0); band.fill(0); param.fill(0); flex.fill(0);
    shocks.length = 0;
    time = Number(startTime) || 0; rotation = 0; formation = null; switchedAt = -Infinity; stagger = 0; pendingKick = 0;
  }
  reset(0);

  function setFormation(spec = "sphere", { scale = 1, flexibility = null, stagger: staggerSeconds = 0.35, snap = false, rotation: snapRotation = null } = {}) {
    previous.set(target);
    const points = typeof spec === "object" && spec?.position ? spec : null;
    const family = points ? "points" : String(spec);
    if (!points && !FORMATIONS[family]) throw new RangeError(`Unknown dust formation: ${family}`);
    const baseFlex = flexibility ?? FAMILY_FLEXIBILITY[family] ?? 0.5;
    for (let i = 0; i < n; i++) {
      let p;
      if (points?.count) {
        const j = i % points.count;
        p = [points.position[j * 3], points.position[j * 3 + 1], points.position[j * 3 + 2], points.normal[j * 3], points.normal[j * 3 + 1], points.normal[j * 3 + 2], points.param[j]];
        flex[i] = points.flex[j];
      } else if (points) {
        p = [scatter[i * 3] * 1.6, scatter[i * 3 + 1] * 1.6, scatter[i * 3 + 2] * 1.6, scatter[i * 3], scatter[i * 3 + 1], scatter[i * 3 + 2], rank[i]];
        flex[i] = baseFlex;
      } else {
        p = FORMATIONS[family]((i + 0.5) / n, hashUnit(i, s, 9), hashUnit(i, s, 10), i, n);
        flex[i] = baseFlex;
      }
      target[i * 3] = p[0] * scale; target[i * 3 + 1] = p[1] * scale; target[i * 3 + 2] = p[2] * scale;
      normal[i * 3] = p[3]; normal[i * 3 + 1] = p[4]; normal[i * 3 + 2] = p[5];
      param[i] = p[6];
    }
    if (formation === null || snap) previous.set(target);
    if (snap) {
      // Start already in place (export preroll), at the requested rotation.
      if (Number.isFinite(snapRotation)) rotation = snapRotation;
      const cr = Math.cos(rotation), sr = Math.sin(rotation);
      for (let i = 0; i < n; i++) {
        const i3 = i * 3, x = target[i3], z = target[i3 + 2];
        position[i3] = x * cr - z * sr; position[i3 + 1] = target[i3 + 1]; position[i3 + 2] = x * sr + z * cr;
        velocity[i3] = velocity[i3 + 1] = velocity[i3 + 2] = 0;
        visibility[i] = 1;
      }
    }
    formation = family; switchedAt = time; stagger = snap ? 0 : Math.max(0, staggerSeconds);
    return family;
  }

  /** Immediate beat impulse: every active particle moves on this step. */
  function kick(strength = 1) { pendingKick += Math.max(0, Number(strength) || 0); }
  /** Travelling radial front for larger events; distant particles feel it later. */
  function shock(strength = 1, speed = DUST_SHOCK_SPEED) { shocks.push({ at: time, strength: Math.max(0, Number(strength) || 0), speed }); if (shocks.length > 8) shocks.shift(); }

  function step(dtSeconds, controls = {}) {
    const dt = clamp(Number(dtSeconds) || 0, 0, DUST_MAX_STEP_SECONDS);
    if (dt <= 0) return 0;
    time += dt;
    const hold = clamp(controls.hold ?? 0.7), omega = Math.max(0.1, Number(controls.omega) || 5.5);
    // A firmly held formation is stiff and well damped; a released one floats.
    const stiffnessScale = 0.15 + 0.85 * hold, zeta = 0.22 + 0.5 * hold;
    const calm = 1 - 0.8 * clamp(controls.calm ?? 0);
    const reach = (Number(controls.reach ?? 0.35)) * calm, flow = (Number(controls.flow ?? 0.25)) * calm;
    const participation = clamp(controls.participation ?? 1), halo = Number(controls.halo ?? 0.12);
    const bands = controls.bands || null, kickNow = pendingKick * calm * 1.6;
    pendingKick = 0;
    if (Number.isFinite(controls.rotation)) rotation = controls.rotation;
    else if (controls.face) {
      // Readable material faces the viewer: ease the spin back to a whole turn.
      const offset = rotation - Math.round(rotation / TAU) * TAU;
      rotation -= offset * (1 - Math.exp(-dt / 0.3));
    } else rotation += (Number(controls.spin ?? 0.12)) * dt;
    const cr = Math.cos(rotation), sr = Math.sin(rotation), ease = 1 - Math.exp(-dt / DUST_VISIBILITY_TAU_SECONDS);
    for (let k = shocks.length - 1; k >= 0; k--) if ((time - shocks[k].at) * shocks[k].speed > 4) shocks.splice(k, 1);
    for (let i = 0; i < n; i++) {
      const i3 = i * 3, active = rank[i] < participation;
      const switched = time - switchedAt >= lag[i] * stagger;
      const src = switched ? target : previous;
      const e = bandAt(bands, param[i]);
      band[i] = e;
      // Reactive target = base + normal * band energy * reach * flexibility.
      const push = active ? e * reach * flex[i] : 0;
      let tx = src[i3] + normal[i3] * push, ty = src[i3 + 1] + normal[i3 + 1] * push, tz = src[i3 + 2] + normal[i3 + 2] * push;
      if (!active) { tx += scatter[i3] * halo; ty += scatter[i3 + 1] * halo; tz += scatter[i3 + 2] * halo; }
      const rx = tx * cr - tz * sr, rz = tx * sr + tz * cr;
      const px = position[i3], py = position[i3 + 1], pz = position[i3 + 2];
      let vx = velocity[i3], vy = velocity[i3 + 1], vz = velocity[i3 + 2];
      const w = omega * frequency[i], k = w * w * stiffnessScale, c = 2 * zeta * w;
      // Two-scale analytic flow; each component depends only on the other two
      // coordinates, so the field is divergence-free and circulates.
      const t = time * 0.35;
      const fx = Math.sin(1.7 * py + t) + Math.cos(1.3 * pz - t) + 0.5 * Math.sin(4.1 * pz + 2.3 * py);
      const fy = Math.sin(1.7 * pz + t) + Math.cos(1.3 * px - t) + 0.5 * Math.sin(4.1 * px + 2.3 * pz);
      const fz = Math.sin(1.7 * px + t) + Math.cos(1.3 * py - t) + 0.5 * Math.sin(4.1 * py + 2.3 * px);
      let ax = k * (rx - px) - c * vx + flow * fx;
      let ay = k * (ty - py) - c * vy + flow * fy;
      let az = k * (rz - pz) - c * vz + flow * fz;
      if (kickNow > 0 && active) {
        // Mix the outward normal with the particle's own direction so bursts
        // do not all fly straight toward the viewer.
        const nx = normal[i3] * cr - normal[i3 + 2] * sr, nz = normal[i3] * sr + normal[i3 + 2] * cr;
        const amount = kickNow * (0.6 + 0.4 * brightness[i]);
        vx += (nx * 0.6 + scatter[i3] * 0.4) * amount;
        vy += (normal[i3 + 1] * 0.6 + scatter[i3 + 1] * 0.4) * amount;
        vz += (nz * 0.6 + scatter[i3 + 2] * 0.4) * amount;
      }
      if (shocks.length) {
        const distance = Math.hypot(px, py, pz) || 1e-6;
        for (const front of shocks) {
          const gap = Math.abs(distance - (time - front.at) * front.speed);
          if (gap < 0.3) { const f = front.strength * (1 - gap / 0.3) * 18 * calm; ax += (px / distance) * f; ay += (py / distance) * f; az += (pz / distance) * f; }
        }
      }
      // Semi-implicit Euler: velocity first, then position.
      vx += ax * dt; vy += ay * dt; vz += az * dt;
      velocity[i3] = vx; velocity[i3 + 1] = vy; velocity[i3 + 2] = vz;
      position[i3] = px + vx * dt; position[i3 + 1] = py + vy * dt; position[i3 + 2] = pz + vz * dt;
      visibility[i] += ((active ? 1 : 0) - visibility[i]) * ease;
    }
    return dt;
  }

  /** Fixed-step advance for reproducible export: same seed + controls → same frames. */
  function advanceTo(targetTime, controlsAt = () => ({})) {
    let steps = 0;
    while (time + DUST_FIXED_STEP_SECONDS <= targetTime + 1e-9) { step(DUST_FIXED_STEP_SECONDS, controlsAt(time)); steps++; }
    return steps;
  }

  /** FNV-1a over state bytes; a determinism receipt, not a cryptographic hash. */
  function fingerprint() {
    let h = 0x811c9dc5;
    for (const array of [position, velocity, visibility]) {
      const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    }
    return (h >>> 0).toString(16).padStart(8, "0");
  }

  return {
    count: n, seed: s, position, velocity, band, visibility, target, normal, param, flex, size, brightness, frequency, rank,
    get time() { return time; },
    get formation() { return formation; },
    get rotation() { return rotation; },
    get activeShocks() { return shocks.length; },
    setFormation, kick, shock, step, advanceTo, fingerprint, reset,
  };
}

/**
 * Perspective projection for a 2D canvas host. Fills reusable buffers so the
 * frame loop allocates nothing. Small dots receive compensating brightness.
 */
export function projectDustSwarm(swarm, { width, height, yaw = 0, pitch = 0.22, distance = 4.4, fov = 0.9, pointSize = 1.5, depthFade = 0.22 } = {}, out = null) {
  const n = swarm.count;
  const buffers = out && out.x.length >= n ? out : { x: new Float32Array(n), y: new Float32Array(n), radius: new Float32Array(n), alpha: new Float32Array(n), depth: new Float32Array(n), visible: 0 };
  const focal = (height / 2) / Math.tan(fov / 2), cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  let visible = 0;
  for (let i = 0; i < n; i++) {
    const i3 = i * 3, x0 = swarm.position[i3], y0 = swarm.position[i3 + 1], z0 = swarm.position[i3 + 2];
    const x1 = x0 * cy - z0 * sy, z1 = x0 * sy + z0 * cy;
    const y2 = y0 * cp - z1 * sp, z2 = y0 * sp + z1 * cp + distance;
    const alpha = swarm.visibility[i];
    if (z2 <= 0.05 || alpha < 0.01) { buffers.alpha[i] = 0; continue; }
    // Radius scales with pixels per scene unit, so dots keep their look at any canvas size.
    const perspective = focal / z2, radius = Math.max(0.35, pointSize * swarm.size[i] * perspective / 110);
    buffers.x[i] = width / 2 + x1 * perspective;
    buffers.y[i] = height / 2 - y2 * perspective;
    buffers.radius[i] = radius;
    buffers.depth[i] = z2;
    // Framing compensation keeps shrinking dots luminous instead of vanishing.
    // Nearer dots read brighter than the far side of a formation (depth cue).
    const depthLight = clamp(1 - (z2 - distance) * depthFade, 0.35, 1.25);
    buffers.alpha[i] = clamp(alpha * swarm.brightness[i] * (0.3 + 0.4 * swarm.band[i]) * depthLight * Math.min(1.6, 1 / Math.max(0.6, radius)));
    visible++;
  }
  buffers.visible = visible;
  return buffers;
}
