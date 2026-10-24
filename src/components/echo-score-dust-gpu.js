// Dense Score Dust on the GPU (P2 item 16): a WebGL2 swarm with the same
// interface as the CPU swarm (setFormation, kick, shock, step, reset), so the
// song-clock performance drives it unchanged, plus a 2D-host renderer that
// draws it with trails and a cheap bloom. 20k–80k particles.
//
// The CPU swarm stays the exact reference: exports, offline frames and
// receipts use it. GPU float maths follow the same equations but are not
// bit-identical, so the GPU tier is a live preview tier and says so.
import { DUST_BAND_COUNT, DUST_MAX_STEP_SECONDS, DUST_VISIBILITY_TAU_SECONDS, DUST_SHOCK_SPEED, DUST_MAX_GPU_PARTICLES, dustParticleConstants, fillDustFormationTargets, dustBandsFromSpectrum } from "../domain/echo-dust-swarm.js";
import { createScoreDustPerformance } from "../domain/echo-score-dust-performance.js";
import { composeEchoVisualScore, prepareEchoScorePlayback, reflexOnlyEchoTimeline } from "../domain/echo-visual-score.js";
import { DUST_COLOUR_MODES } from "../domain/echo-score-dust-colour.js";
import { createImageTargetCache, rasterizePhraseTargets, paintScoreBackground } from "./echo-score-dust-renderer.js";

const TAU = Math.PI * 2;
const clamp = (v, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const TEXTURE_WIDTH = 256;

const QUAD_VS = `#version 300 es
in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;

// One fixed step for every particle: the CPU kernel's equations, per texel.
const STEP_FS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uPos, uVel, uTarget, uNormal, uPrev, uConstA, uConstB;
uniform float uTime, uDt, uHold, uOmega, uReach, uFlow, uParticipation, uHalo, uKick, uCr, uSr, uEase, uSwitchedAt, uStagger, uCalm;
uniform float uBands[${DUST_BAND_COUNT}]; uniform int uUseBands;
uniform int uShockCount; uniform vec3 uShocks[8];
uniform int uCount, uWidth;
layout(location = 0) out vec4 oPos; layout(location = 1) out vec4 oVel;
float bandAt(float coordinate) {
  if (uUseBands == 0) return 0.0;
  float p = clamp(coordinate, 0.0, 1.0) * ${(DUST_BAND_COUNT - 1).toFixed(1)};
  int lo = int(floor(p)); int hi = min(${DUST_BAND_COUNT - 1}, lo + 1);
  return uBands[lo] + (uBands[hi] - uBands[lo]) * (p - float(lo));
}
void main() {
  ivec2 xy = ivec2(gl_FragCoord.xy); int i = xy.y * uWidth + xy.x;
  if (i >= uCount) { oPos = vec4(0.0); oVel = vec4(0.0); return; }
  vec4 P = texelFetch(uPos, xy, 0), V = texelFetch(uVel, xy, 0), T = texelFetch(uTarget, xy, 0), N = texelFetch(uNormal, xy, 0);
  vec4 PR = texelFetch(uPrev, xy, 0), A = texelFetch(uConstA, xy, 0), B = texelFetch(uConstB, xy, 0);
  float stiffness = 0.15 + 0.85 * uHold, zeta = 0.22 + 0.5 * uHold;
  bool engaged = A.y < uParticipation;
  bool switched = (uTime - uSwitchedAt) >= A.z * uStagger;
  vec3 src = switched ? T.xyz : PR.xyz;
  float e = bandAt(T.w);
  float push = engaged ? e * uReach * N.w : 0.0;
  vec3 t = src + N.xyz * push;
  if (!engaged) t += B.xyz * uHalo;
  float rx = t.x * uCr - t.z * uSr, rz = t.x * uSr + t.z * uCr;
  vec3 p = P.xyz, v = V.xyz;
  float w = uOmega * A.x, k = w * w * stiffness, c = 2.0 * zeta * w, tt = uTime * 0.35;
  vec3 f = vec3(sin(1.7 * p.y + tt) + cos(1.3 * p.z - tt) + 0.5 * sin(4.1 * p.z + 2.3 * p.y),
                sin(1.7 * p.z + tt) + cos(1.3 * p.x - tt) + 0.5 * sin(4.1 * p.x + 2.3 * p.z),
                sin(1.7 * p.x + tt) + cos(1.3 * p.y - tt) + 0.5 * sin(4.1 * p.y + 2.3 * p.x));
  vec3 a = vec3(k * (rx - p.x), k * (t.y - p.y), k * (rz - p.z)) - c * v + uFlow * f;
  if (uKick > 0.0 && engaged) {
    float nx = N.x * uCr - N.z * uSr, nz = N.x * uSr + N.z * uCr, amount = uKick * (0.6 + 0.4 * A.w);
    v += (vec3(nx, N.y, nz) * 0.6 + B.xyz * 0.4) * amount;
  }
  if (uShockCount > 0) {
    float d = max(length(p), 1e-6);
    for (int s = 0; s < 8; s++) {
      if (s >= uShockCount) break;
      vec3 sh = uShocks[s]; float gap = abs(d - (uTime - sh.x) * sh.z);
      if (gap < 0.3) a += p / d * (sh.y * (1.0 - gap / 0.3) * 18.0 * uCalm);
    }
  }
  v += a * uDt; p += v * uDt;
  oPos = vec4(p, e); oVel = vec4(v, V.w + ((engaged ? 1.0 : 0.0) - V.w) * uEase);
}`;

// Project, size and colour each particle like the 2D painter does.
const POINTS_VS = `#version 300 es
precision highp float; precision highp int;
uniform sampler2D uPos, uVel, uTarget, uConstA, uConstB, uTint;
uniform int uWidth, uCount, uMode, uPaletteCount, uHasTint;
uniform float uYaw, uPitch, uDistance, uFocal, uW, uH, uPointSize, uDepthFade, uBoost, uSparkle, uTwinkleStep, uFlash, uDesat, uRotCos, uRotSin, uScale;
uniform vec3 uPalette[5];
out vec4 vColor;
uint hash32(uint a, uint b, uint c) {
  uint x = (a * 0x27d4eb2du) ^ (b * 0x165667b1u) ^ (c * 0x9e3779b1u);
  x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x;
}
vec3 ramp(float u) {
  if (uPaletteCount <= 1) return uPalette[0];
  float x = clamp(u, 0.0, 1.0) * float(uPaletteCount - 1); int i = min(uPaletteCount - 2, int(floor(x)));
  return mix(uPalette[i], uPalette[i + 1], x - float(i));
}
void main() {
  int i = gl_VertexID; ivec2 xy = ivec2(i % uWidth, i / uWidth);
  vec4 P = texelFetch(uPos, xy, 0), V = texelFetch(uVel, xy, 0), A = texelFetch(uConstA, xy, 0), B = texelFetch(uConstB, xy, 0);
  float cy = cos(uYaw), sy = sin(uYaw), cp = cos(uPitch), sp = sin(uPitch);
  float x1 = P.x * cy - P.z * sy, z1 = P.x * sy + P.z * cy;
  float y2 = P.y * cp - z1 * sp, z2 = P.y * sp + z1 * cp + uDistance;
  vColor = vec4(0.0); gl_PointSize = 0.0; gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
  if (i >= uCount || z2 <= 0.05 || V.w < 0.01) return;
  float perspective = uFocal / z2, radius = max(0.35, uPointSize * B.w * perspective / 110.0) * uScale;
  float depthLight = clamp(1.0 - (z2 - uDistance) * uDepthFade, 0.35, 1.25);
  float twinkle = (uSparkle > 0.02 && float(hash32(uint(i), uint(uTwinkleStep), 31u)) / 4294967296.0 < 0.14 * uSparkle) ? 1.0 + 1.6 * uSparkle : 1.0;
  float alpha = clamp(V.w * A.w * (0.3 + 0.4 * P.w) * depthLight * min(1.6, 1.0 / max(0.6, radius)) * twinkle, 0.0, 1.0);
  float size = 2.0 * radius;
  alpha = min(1.0, alpha * uBoost) * min(1.0, size * size);
  vec3 c;
  vec4 T = texelFetch(uTarget, xy, 0);
  if (uMode == 5 && uHasTint == 1) c = texelFetch(uTint, xy, 0).rgb;
  else if (uMode == 1) c = ramp(T.w);
  else if (uMode == 2) c = ramp(length(V.xyz) / 2.5);
  else if (uMode == 3) c = ramp((P.y + 1.3) / 2.6);
  else if (uMode == 4) c = ramp((P.x * uRotSin + P.z * uRotCos + 1.5) / 3.0);
  else c = uPalette[i % max(1, uPaletteCount)];
  if (uDesat > 0.0) c = mix(c, vec3(dot(c, vec3(0.2126, 0.7152, 0.0722))), uDesat);
  if (uFlash > 0.0) c = mix(c, vec3(1.0), uFlash);
  vColor = vec4(c * alpha, alpha);
  gl_PointSize = max(1.0, size);
  gl_Position = vec4((uW / 2.0 + x1 * perspective) / uW * 2.0 - 1.0, 1.0 - (uH / 2.0 - y2 * perspective) / uH * 2.0, 0.0, 1.0);
}`;
const POINTS_FS = `#version 300 es
precision mediump float; in vec4 vColor; out vec4 o; void main() { o = vColor; }`;
const FADE_FS = `#version 300 es
precision mediump float; uniform float uFade; out vec4 o; void main() { o = vec4(0.0, 0.0, 0.0, uFade); }`;
const PRESENT_FS = `#version 300 es
precision mediump float; in vec2 vUv; uniform sampler2D uTrail; uniform float uGlow; out vec4 o;
void main() { vec4 base = texture(uTrail, vUv); vec4 glow = textureLod(uTrail, vUv, 2.5) * uGlow; o = min(base + glow, vec4(1.0)); }`;

function compile(gl, vs, fs) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`Score Dust GPU shader: ${gl.getShaderInfoLog(shader)}`);
    gl.attachShader(program, shader);
  }
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`Score Dust GPU program: ${gl.getProgramInfoLog(program)}`);
  const uniforms = new Map(), count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let k = 0; k < count; k++) { const info = gl.getActiveUniform(program, k), name = info.name.replace(/\[0\]$/, ""); uniforms.set(name, gl.getUniformLocation(program, info.name)); }
  return { program, u: (name) => uniforms.get(name) ?? null };
}

/** WebGL2 with renderable float textures, or why not. */
export function scoreDustGpuSupport(gl) {
  if (!gl) return { ok: false, reason: "WebGL2 is unavailable in this browser." };
  if (!gl.getExtension("EXT_color_buffer_float")) return { ok: false, reason: "This GPU cannot render to float textures (EXT_color_buffer_float)." };
  return { ok: true, reason: "", maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE) };
}

let supportCache = null;
/** Cached probe for UI: can this browser run the dense GPU tier? */
export function probeScoreDustGpu() {
  if (supportCache) return supportCache;
  try {
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(1, 1) : document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    supportCache = scoreDustGpuSupport(gl);
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  } catch (error) { supportCache = { ok: false, reason: String(error?.message || error) }; }
  return supportCache;
}

/**
 * createGpuDustSwarm({ gl, count, seed }) — same interface as createDustSwarm
 * for the performance (no CPU-side positions; fingerprint is not sampled).
 */
export function createGpuDustSwarm({ gl, count = 40000, seed = 1 } = {}) {
  const support = scoreDustGpuSupport(gl);
  if (!support.ok) throw new Error(support.reason);
  const n = clamp(Math.floor(Number(count) || 0), 1, DUST_MAX_GPU_PARTICLES), s = Number(seed) >>> 0;
  const width = Math.min(TEXTURE_WIDTH, n), height = Math.ceil(n / width), texels = width * height;
  const constants = dustParticleConstants(n, s);
  const target = new Float32Array(n * 3), normal = new Float32Array(n * 3), param = new Float32Array(n), flex = new Float32Array(n), previous = new Float32Array(n * 3), tint = new Uint8Array(n * 3);
  const texture = (format, internal, type, data) => {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, width, height, 0, format, type, data);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    return t;
  };
  const rgba = (fill) => { const out = new Float32Array(texels * 4); for (let i = 0; i < n; i++) fill(i, out, i * 4); return out; };
  const float = (data) => texture(gl.RGBA, gl.RGBA32F, gl.FLOAT, data);
  const constA = float(rgba((i, o, k) => { o[k] = constants.frequency[i]; o[k + 1] = constants.rank[i]; o[k + 2] = constants.lag[i]; o[k + 3] = constants.brightness[i]; }));
  const constB = float(rgba((i, o, k) => { o[k] = constants.scatter[i * 3]; o[k + 1] = constants.scatter[i * 3 + 1]; o[k + 2] = constants.scatter[i * 3 + 2]; o[k + 3] = constants.size[i]; }));
  const targetTex = float(null), normalTex = float(null), prevTex = float(null);
  const tintTex = texture(gl.RGBA, gl.RGBA8, gl.UNSIGNED_BYTE, null);
  const pair = () => { const pos = float(null), vel = float(null), fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, pos, 0); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, vel, 0); return { pos, vel, fbo }; };
  const states = [pair(), pair()];
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  let current = 0;
  const step = compile(gl, QUAD_VS, STEP_FS);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);

  const upload = (tex, data, format = gl.RGBA, type = gl.FLOAT) => { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, format, type, data); };
  const uploadTargets = () => {
    upload(targetTex, rgba((i, o, k) => { o[k] = target[i * 3]; o[k + 1] = target[i * 3 + 1]; o[k + 2] = target[i * 3 + 2]; o[k + 3] = param[i]; }));
    upload(normalTex, rgba((i, o, k) => { o[k] = normal[i * 3]; o[k + 1] = normal[i * 3 + 1]; o[k + 2] = normal[i * 3 + 2]; o[k + 3] = flex[i]; }));
    upload(prevTex, rgba((i, o, k) => { o[k] = previous[i * 3]; o[k + 1] = previous[i * 3 + 1]; o[k + 2] = previous[i * 3 + 2]; }));
  };
  const writeState = (positionAt, visibility) => {
    upload(states[current].pos, rgba((i, o, k) => { const p = positionAt(i); o[k] = p[0]; o[k + 1] = p[1]; o[k + 2] = p[2]; }));
    upload(states[current].vel, rgba((i, o, k) => { o[k + 3] = visibility; }));
  };

  const shocks = [];
  let time = 0, rotation = 0, formation = null, switchedAt = -Infinity, stagger = 0, pendingKick = 0, sparkle = 0, tintActive = false, steps = 0;

  function reset(startTime = 0) {
    target.fill(0); previous.fill(0); normal.fill(0); param.fill(0); flex.fill(0);
    shocks.length = 0;
    time = Number(startTime) || 0; rotation = 0; formation = null; switchedAt = -Infinity; stagger = 0; pendingKick = 0; sparkle = 0;
    uploadTargets();
    const sc = constants.scatter;
    writeState((i) => [sc[i * 3] * 2.5, sc[i * 3 + 1] * 2.5, sc[i * 3 + 2] * 2.5], 0);
  }
  reset(0);

  function setFormation(spec = "sphere", { scale = 1, flexibility = null, stagger: staggerSeconds = 0.35, snap = false, rotation: snapRotation = null } = {}) {
    previous.set(target);
    const filled = fillDustFormationTargets(spec, { n, seed: s, scale, flexibility, scatter: constants.scatter, rank: constants.rank, target, normal, param, flex, tint });
    tintActive = filled.tintActive;
    if (tintActive) { const t = new Uint8Array(texels * 4); for (let i = 0; i < n; i++) { t[i * 4] = tint[i * 3]; t[i * 4 + 1] = tint[i * 3 + 1]; t[i * 4 + 2] = tint[i * 3 + 2]; t[i * 4 + 3] = 255; } upload(tintTex, t, gl.RGBA, gl.UNSIGNED_BYTE); }
    if (formation === null || snap) previous.set(target);
    uploadTargets();
    if (snap) {
      if (Number.isFinite(snapRotation)) rotation = snapRotation;
      const cr = Math.cos(rotation), sr = Math.sin(rotation);
      writeState((i) => [target[i * 3] * cr - target[i * 3 + 2] * sr, target[i * 3 + 1], target[i * 3] * sr + target[i * 3 + 2] * cr], 1);
    }
    formation = filled.family; switchedAt = time; stagger = snap ? 0 : Math.max(0, staggerSeconds);
    return formation;
  }
  function kick(strength = 1) { pendingKick += Math.max(0, Number(strength) || 0); }
  function shock(strength = 1, speed = DUST_SHOCK_SPEED) { shocks.push({ at: time, strength: Math.max(0, Number(strength) || 0), speed }); if (shocks.length > 8) shocks.shift(); }

  const bandUniform = new Float32Array(DUST_BAND_COUNT), shockUniform = new Float32Array(24);
  function stepGpu(dtSeconds, controls = {}) {
    const dt = clamp(Number(dtSeconds) || 0, 0, DUST_MAX_STEP_SECONDS);
    if (dt <= 0) return 0;
    time += dt;
    sparkle = clamp(controls.sparkle ?? 0);
    const hold = clamp(controls.hold ?? 0.7), omega = Math.max(0.1, Number(controls.omega) || 5.5);
    const calm = 1 - 0.8 * clamp(controls.calm ?? 0);
    const reach = Number(controls.reach ?? 0.35) * calm, flow = Number(controls.flow ?? 0.25) * calm;
    const participation = clamp(controls.participation ?? 1), halo = Number(controls.halo ?? 0.12), kickNow = pendingKick * calm * 1.6;
    pendingKick = 0;
    if (Number.isFinite(controls.rotation)) rotation = controls.rotation;
    else if (controls.face) { const offset = rotation - Math.round(rotation / TAU) * TAU; rotation -= offset * (1 - Math.exp(-dt / 0.3)); }
    else rotation += Number(controls.spin ?? 0.12) * dt;
    for (let k = shocks.length - 1; k >= 0; k--) if ((time - shocks[k].at) * shocks[k].speed > 4) shocks.splice(k, 1);
    const from = states[current], to = states[1 - current];
    gl.useProgram(step.program);
    gl.bindFramebuffer(gl.FRAMEBUFFER, to.fbo);
    gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    [from.pos, from.vel, targetTex, normalTex, prevTex, constA, constB].forEach((tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); });
    ["uPos", "uVel", "uTarget", "uNormal", "uPrev", "uConstA", "uConstB"].forEach((name, unit) => gl.uniform1i(step.u(name), unit));
    const f = (name, value) => gl.uniform1f(step.u(name), value);
    f("uTime", time); f("uDt", dt); f("uHold", hold); f("uOmega", omega); f("uReach", reach); f("uFlow", flow); f("uParticipation", participation); f("uHalo", halo);
    f("uKick", kickNow); f("uCr", Math.cos(rotation)); f("uSr", Math.sin(rotation)); f("uEase", 1 - Math.exp(-dt / DUST_VISIBILITY_TAU_SECONDS));
    f("uSwitchedAt", Number.isFinite(switchedAt) ? switchedAt : -1e9); f("uStagger", stagger); f("uCalm", calm);
    if (controls.bands) bandUniform.set(controls.bands.subarray ? controls.bands.subarray(0, DUST_BAND_COUNT) : controls.bands.slice(0, DUST_BAND_COUNT));
    gl.uniform1fv(step.u("uBands"), bandUniform); gl.uniform1i(step.u("uUseBands"), controls.bands ? 1 : 0);
    shocks.forEach((front, k) => { shockUniform[k * 3] = front.at; shockUniform[k * 3 + 1] = front.strength; shockUniform[k * 3 + 2] = front.speed; });
    gl.uniform1i(step.u("uShockCount"), shocks.length); gl.uniform3fv(step.u("uShocks"), shockUniform);
    gl.uniform1i(step.u("uCount"), n); gl.uniform1i(step.u("uWidth"), width);
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    current = 1 - current; steps++;
    return dt;
  }

  function dispose() {
    for (const st of states) { gl.deleteTexture(st.pos); gl.deleteTexture(st.vel); gl.deleteFramebuffer(st.fbo); }
    for (const t of [constA, constB, targetTex, normalTex, prevTex, tintTex]) gl.deleteTexture(t);
    gl.deleteProgram(step.program); gl.deleteBuffer(quad); gl.deleteVertexArray(vao);
  }

  return {
    count: n, seed: s, gpu: true, width, height,
    get tintActive() { return tintActive; },
    get time() { return time; },
    get formation() { return formation; },
    get rotation() { return rotation; },
    get sparkle() { return sparkle; },
    get activeShocks() { return shocks.length; },
    get steps() { return steps; },
    textures: () => ({ position: states[current].pos, velocity: states[current].vel, target: targetTex, constA, constB, tint: tintTex }),
    setFormation, kick, shock, step: stepGpu, reset, dispose,
    fingerprint: () => `gpu-unsampled:${steps}`,
    /** Read positions back (diagnostics and parity checks only; stalls the pipeline). */
    readPositions() {
      const out = new Float32Array(texels * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, states[current].fbo); gl.readBuffer(gl.COLOR_ATTACHMENT0);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.FLOAT, out); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      const position = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { position[i * 3] = out[i * 4]; position[i * 3 + 1] = out[i * 4 + 1]; position[i * 3 + 2] = out[i * 4 + 2]; }
      return position;
    },
  };
}

function reflexPlayback() {
  const timeline = reflexOnlyEchoTimeline(600);
  return prepareEchoScorePlayback(composeEchoVisualScore(timeline), timeline);
}

/**
 * Live 2D-host renderer with the same API as createEchoScoreDustRenderer:
 * the dust is simulated and drawn in WebGL2, then composited onto the host's
 * 2D canvas. Throws when the GPU tier is unavailable (callers fall back).
 */
export function createEchoScoreDustGpuRenderer({ particleCount = 40000, canvasFactory = () => document.createElement("canvas") } = {}) {
  const canvas = canvasFactory(), gl = canvas.getContext("webgl2", { premultipliedAlpha: true, alpha: true, antialias: false });
  const support = scoreDustGpuSupport(gl);
  if (!support.ok) throw new Error(support.reason);
  const points = compile(gl, POINTS_VS, POINTS_FS), fade = compile(gl, QUAD_VS, FADE_FS), present = compile(gl, QUAD_VS, PRESENT_FS);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
  const empty = gl.createVertexArray();
  const pictures = createImageTargetCache(), bands = new Float32Array(DUST_BAND_COUNT);
  let trail = null, performanceHost = null, swarm = null, source = "reflex-only", stemsAt = null, previousBeatFlash = 0, lastWall = null, frameMs = 0, size = [0, 0];
  const count = clamp(Math.floor(particleCount), 1000, DUST_MAX_GPU_PARTICLES);

  function ensureTrail(width, height) {
    if (trail && size[0] === width && size[1] === height) return;
    if (trail) { gl.deleteTexture(trail.tex); gl.deleteFramebuffer(trail.fbo); }
    canvas.width = width; canvas.height = height; size = [width, height];
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texStorage2D(gl.TEXTURE_2D, Math.floor(Math.log2(Math.max(width, height))) + 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    trail = { tex, fbo };
  }

  function setPlayback(playback, settings = null, nextSource = "reflex-only", { stems = null } = {}) {
    source = playback ? nextSource : "reflex-only";
    stemsAt = playback && stems ? (t) => stems.at(t) : null;
    swarm?.dispose();
    performanceHost = createScoreDustPerformance({ playback: playback || reflexPlayback(), settings: settings || {}, count,
      createSwarm: (options) => (swarm = createGpuDustSwarm({ gl, ...options, count })),
      targetsFor: pictures.targetsFor, phraseTargets: (phrase, n, seed) => rasterizePhraseTargets(phrase, Math.min(n, DUST_MAX_GPU_PARTICLES), seed) });
  }

  function draw(ctx, { width, height, t, fft, beatFlash = 0 }) {
    if (!performanceHost) setPlayback(null);
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const wallDt = lastWall === null ? 1 / 60 : clamp((now - lastWall) / 1000, 0, 0.25);
    lastWall = now;
    dustBandsFromSpectrum(fft, bands);
    const liveKick = beatFlash > 0.6 && previousBeatFlash <= 0.6 ? 0.3 + 0.5 * beatFlash : 0;
    previousBeatFlash = beatFlash;
    // No analyser (e.g. a visuals-only guest device): fall back to score-derived bands.
    const { state } = performanceHost.advanceTo(t, { bandsAt: fft?.length ? () => bands : null, liveKick, stemsAt });
    paintScoreBackground(ctx, performanceHost, t, state, width, height);
    if (state?.phrase && !state.phrase.burst) { ctx.fillStyle = `rgba(0,0,0,${(0.35 * state.calm).toFixed(3)})`; ctx.fillRect(0, 0, width, height); }
    ensureTrail(width, height);
    const camera = performanceHost.camera(t, state), style = performanceHost.style(t, state), textures = swarm.textures();
    const busy = state?.busy ?? 0.45, intensity = state?.intensity ?? 0.5;
    gl.bindFramebuffer(gl.FRAMEBUFFER, trail.fbo); gl.viewport(0, 0, width, height);
    // Trails fade by elapsed time, like the 2D painter.
    gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(fade.program); gl.uniform1f(fade.u("uFade"), 1 - Math.pow(1 - (0.22 + 0.4 * (1 - busy)), wallDt * 60));
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(points.program);
    [textures.position, textures.velocity, textures.target, textures.constA, textures.constB, textures.tint].forEach((tex, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, tex); });
    ["uPos", "uVel", "uTarget", "uConstA", "uConstB", "uTint"].forEach((name, unit) => gl.uniform1i(points.u(name), unit));
    const f = (name, v) => gl.uniform1f(points.u(name), v);
    f("uYaw", camera.yaw); f("uPitch", camera.pitch); f("uDistance", camera.distance); f("uFocal", (height / 2) / Math.tan(0.9 / 2)); f("uW", width); f("uH", height);
    f("uPointSize", 1.5); f("uDepthFade", 0.22); f("uBoost", Math.min(1, Math.sqrt(2500 / swarm.count))); f("uSparkle", swarm.sparkle); f("uTwinkleStep", Math.floor(swarm.time * 24));
    f("uFlash", style.flash); f("uDesat", style.desaturate); f("uRotCos", Math.cos(swarm.rotation)); f("uRotSin", Math.sin(swarm.rotation)); f("uScale", 1);
    const palette = new Float32Array(15); (style.palette || []).slice(0, 5).forEach((c, k) => { palette[k * 3] = c.r; palette[k * 3 + 1] = c.g; palette[k * 3 + 2] = c.b; });
    gl.uniform3fv(points.u("uPalette"), palette); gl.uniform1i(points.u("uPaletteCount"), Math.max(1, Math.min(5, style.palette?.length || 1)));
    gl.uniform1i(points.u("uMode"), Math.max(0, DUST_COLOUR_MODES.indexOf(style.mode))); gl.uniform1i(points.u("uHasTint"), swarm.tintActive ? 1 : 0);
    gl.uniform1i(points.u("uWidth"), swarm.width); gl.uniform1i(points.u("uCount"), swarm.count);
    gl.bindVertexArray(empty); gl.drawArrays(gl.POINTS, 0, swarm.count);
    gl.bindTexture(gl.TEXTURE_2D, trail.tex); gl.generateMipmap(gl.TEXTURE_2D);
    // Present: trails plus a mip-level bloom, onto a clear canvas.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(present.program); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, trail.tex);
    gl.uniform1i(present.u("uTrail"), 0); gl.uniform1f(present.u("uGlow"), 0.22 + 0.22 * intensity);
    gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.bindVertexArray(null);
    ctx.drawImage(canvas, 0, 0, width, height);
    ctx.fillStyle = "rgba(226,232,240,.55)"; ctx.font = "9px monospace";
    ctx.fillText(`SCORE DUST · GPU ${swarm.count.toLocaleString("en-US")} · ${source}${state?.cue ? ` · ${state.cue.id} · ${swarm.formation}` : ""}`, 14, height - 14);
    frameMs = frameMs * 0.9 + ((typeof performance !== "undefined" ? performance.now() : Date.now()) - now) * 0.1;
    return { mode: "score-dust", tier: "gpu", source, cueId: state?.cue?.id || null, formation: swarm.formation, particles: swarm.count, frameMs: Number(frameMs.toFixed(2)) };
  }

  function dispose() {
    swarm?.dispose(); swarm = null; performanceHost = null; pictures.clear();
    if (trail) { gl.deleteTexture(trail.tex); gl.deleteFramebuffer(trail.fbo); trail = null; }
    for (const p of [points, fade, present]) gl.deleteProgram(p.program);
    gl.deleteBuffer(quad); gl.deleteVertexArray(vao); gl.deleteVertexArray(empty);
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  }
  return { setPlayback, draw, dispose, get source() { return source; }, tier: "gpu",
    diagnostics: () => ({ tier: "gpu", source, particles: swarm?.count || 0, frameMs, ...(performanceHost?.diagnostics() || {}) }) };
}

/**
 * Live host that follows the play settings: the exact CPU renderer by default,
 * the dense GPU renderer when `renderer: "gpu"` is chosen and available.
 * Falls back to CPU (and reports why) when WebGL2 float rendering is missing.
 */
export function createEchoScoreDustAutoRenderer({ createCpu, createGpu = (options) => createEchoScoreDustGpuRenderer(options) } = {}) {
  const cpu = createCpu();
  let gpu = null, gpuCount = 0, active = cpu, fallback = "";
  function setPlayback(playback, settings = null, source = "reflex-only", options = {}) {
    const wantGpu = settings?.renderer === "gpu", count = settings?.gpuParticleCount || 40000;
    if (wantGpu && (!gpu || gpuCount !== count)) {
      gpu?.dispose(); gpu = null;
      try { gpu = createGpu({ particleCount: count }); gpuCount = count; fallback = ""; } catch (error) { fallback = String(error?.message || error); }
    }
    active = wantGpu && gpu ? gpu : cpu;
    active.setPlayback(playback, settings, source, options);
  }
  return {
    setPlayback, draw: (ctx, frame) => active.draw(ctx, frame),
    dispose() { cpu.dispose(); gpu?.dispose(); gpu = null; },
    get source() { return active.source; },
    get tier() { return active === gpu ? "gpu" : "cpu"; },
    diagnostics: () => ({ tier: active === gpu ? "gpu" : "cpu", gpuFallback: fallback || null, ...active.diagnostics() }),
  };
}
