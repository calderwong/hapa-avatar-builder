// Score Dust as a Three.js layer in an Echo 3D stage (Record Garden).
//
// Stage ↔ dust contract (research priority 5):
// - the stage provides an anchor object, a radius, its scene fog (applied to
//   the dust material) and a background luminance for contrast;
// - the dust reports its centroid, mean colour and energy so the stage can
//   answer with light/colour.
// Depth policy for the "black dot" lead: dust is depth-tested (solid set
// pieces hide it) but never writes depth, and blends additively, so luminous
// moving dots cannot stamp opaque-looking holes into what is behind them.
import * as THREE from "three";
import { createScoreDustPerformance } from "../domain/echo-score-dust-performance.js";
import { dustBandsFromSpectrum, DUST_BAND_COUNT } from "../domain/echo-dust-swarm.js";

export const ECHO_SCORE_DUST_STAGE_CONTRACT = Object.freeze({
  schemaVersion: "hapa.echo.score-dust.stage-contract.v1",
  stageProvides: ["anchor Object3D", "radius (scene units)", "scene fog (material fog: true)", "backgroundLuminance 0..1"],
  dustReports: ["centroid (world)", "meanColor (hex)", "energy 0..1", "visible particles"],
  depth: { depthTest: true, depthWrite: false, blending: "additive", renderOrder: 5 },
  budget: { full: 1, reduced: 0.4 },
});
const FORMATION_RADIUS = 1.25;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function discTexture() {
  const make = typeof OffscreenCanvas === "function" ? (s) => new OffscreenCanvas(s, s) : typeof document !== "undefined" ? (s) => Object.assign(document.createElement("canvas"), { width: s, height: s }) : null;
  if (!make) return null;
  const canvas = make(64), ctx = canvas.getContext("2d");
  // Crisp core with a short falloff: grains stay sharp; glow comes from density.
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, "rgba(255,255,255,1)"); g.addColorStop(0.55, "rgba(255,255,255,0.9)"); g.addColorStop(0.8, "rgba(255,255,255,0.25)"); g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createEchoScoreDustThreeLayer({ world, particleCount = 3000, detailTier = "full" } = {}) {
  if (!world?.isObject3D) throw new TypeError("A Three.js world is required.");
  const n = Math.max(200, Math.min(8000, Math.floor(particleCount)));
  const root = new THREE.Group();
  root.name = "EchoScoreDustLayer";
  root.visible = false;
  world.add(root);
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(n * 3), colors = new Float32Array(n * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  const map = discTexture();
  const material = new THREE.PointsMaterial({ size: 0.03, sizeAttenuation: true, vertexColors: true, map, alphaTest: 0, transparent: true,
    depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, toneMapped: false });
  material.name = "EchoScoreDustMaterial";
  const points = new THREE.Points(geometry, material);
  points.name = "EchoScoreDustPoints";
  points.frustumCulled = false;
  points.renderOrder = 5;
  root.add(points);

  let performanceHost = null, playbackKey = "", target = null, drawCount = n, disposed = false;
  const bands = new Float32Array(DUST_BAND_COUNT), palette = [new THREE.Color(), new THREE.Color(), new THREE.Color()], targetPosition = new THREE.Vector3(), centroid = new THREE.Vector3();
  const report = { active: false, centroid: new THREE.Vector3(), meanColor: 0x56f0cf, energy: 0, visible: 0, formation: null, cueId: null };

  function setPlayback(playback, settings = {}, key = "") {
    if (key && key === playbackKey) return;
    playbackKey = key;
    performanceHost = playback ? createScoreDustPerformance({ playback, settings: { ...settings, particleCount: n }, count: n }) : null;
  }
  function setTarget(next) { target = next?.isObject3D ? next : null; return target; }
  function setDetailTier(tier = "full") {
    drawCount = tier === "reduced" ? Math.floor(n * ECHO_SCORE_DUST_STAGE_CONTRACT.budget.reduced) : n;
    geometry.setDrawRange(0, drawCount);
    return tier;
  }

  /** Advance on the song clock and refresh buffers. Returns the dust → stage report. */
  function update({ active = true, currentTime = 0, fft = null, reducedMotion = false, radius = 0.8, heightOffset = 0.3, stage = {} } = {}) {
    report.active = false;
    if (disposed || !active || !target || !performanceHost) { root.visible = false; return report; }
    root.visible = true;
    target.getWorldPosition(targetPosition);
    root.parent?.worldToLocal(targetPosition);
    root.position.copy(targetPosition);
    root.position.y += heightOffset + radius * 0.6;
    const scale = radius / FORMATION_RADIUS;
    root.scale.setScalar(scale);
    if (fft?.length) dustBandsFromSpectrum(fft, bands); else bands.fill(0);
    const { state } = performanceHost.advanceTo(currentTime, { bandsAt: fft?.length ? () => bands : null });
    root.rotation.y = reducedMotion ? 0 : performanceHost.camera(currentTime, state).yaw;
    (state.palette || []).slice(0, 3).forEach((c, i) => palette[i].setHSL(c.h / 360, c.s, Math.min(0.75, c.l)));
    // Contrast: brighter dust over bright stages, never blown out over dark ones.
    const contrast = 0.8 + 0.6 * clamp(stage.backgroundLuminance ?? 0.15);
    const swarm = performanceHost.swarm, colorsUsed = Math.max(1, Math.min(3, state.palette?.length || 1));
    let r = 0, g = 0, b = 0, sx = 0, sy = 0, sz = 0, lit = 0;
    for (let i = 0; i < drawCount; i++) {
      const i3 = i * 3, alpha = swarm.visibility[i] * swarm.brightness[i] * (0.35 + 0.5 * swarm.band[i]) * contrast;
      positions[i3] = swarm.position[i3]; positions[i3 + 1] = swarm.position[i3 + 1]; positions[i3 + 2] = swarm.position[i3 + 2];
      const c = palette[i % colorsUsed];
      colors[i3] = c.r * alpha; colors[i3 + 1] = c.g * alpha; colors[i3 + 2] = c.b * alpha;
      if (alpha > 0.05) { r += c.r; g += c.g; b += c.b; sx += positions[i3]; sy += positions[i3 + 1]; sz += positions[i3 + 2]; lit++; }
    }
    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.color.needsUpdate = true;
    material.size = 0.045 * (0.8 + 0.4 * state.intensity);
    if (lit) {
      centroid.set(sx / lit, sy / lit, sz / lit);
      root.localToWorld(report.centroid.copy(centroid));
      report.meanColor = new THREE.Color(r / lit, g / lit, b / lit).getHex();
    }
    Object.assign(report, { active: true, energy: clamp(state.intensity), visible: lit, formation: swarm.formation, cueId: state.cue?.id || null });
    return report;
  }

  setDetailTier(detailTier);
  return {
    root, points, contract: ECHO_SCORE_DUST_STAGE_CONTRACT,
    metrics: Object.freeze({ particles: n, drawables: 1, materials: 1, textures: map ? 1 : 0, lights: 0, depthWrite: false }),
    get playbackKey() { return playbackKey; },
    setPlayback, setTarget, setDetailTier, update,
    dispose() {
      if (disposed) return;
      disposed = true; root.removeFromParent(); geometry.dispose(); material.dispose(); map?.dispose(); performanceHost = null;
    },
  };
}
