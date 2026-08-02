import * as THREE from "three";

const MAX_VISUALIZER_BARS = 48;
const TWO_PI = Math.PI * 2;

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeSample(value) {
  const numeric = Number(value) || 0;
  return clamp(numeric > 1 ? numeric / 255 : numeric, 0, 1);
}

function frequencyDataFrom(input) {
  if (ArrayBuffer.isView(input) || Array.isArray(input)) return input;
  if (!input || typeof input !== "object") return null;
  return input.frequencyData
    || input.fft
    || input.signal?.frequencyData
    || input.signal?.fft
    || null;
}

export const ECHO_RECORD_GARDEN_AUDIO_VISUALIZER_PROFILE = Object.freeze({
  maxBars: MAX_VISUALIZER_BARS,
  maxDrawables: 2,
  maxMaterials: 2,
  lights: 0,
  textures: 0,
  audioContexts: 0,
});

export function createEchoRecordGardenAudioVisualizer({
  world,
  maxBars = MAX_VISUALIZER_BARS,
  detailTier = "full",
} = {}) {
  if (!world?.isObject3D) throw new TypeError("A Three.js world is required.");

  const barCapacity = clamp(Math.floor(Number(maxBars) || MAX_VISUALIZER_BARS), 1, MAX_VISUALIZER_BARS);
  const reducedBarCount = Math.max(1, Math.min(barCapacity, Math.ceil(barCapacity / 2)));
  const root = new THREE.Group();
  root.name = "EchoRecordGardenAudioVisualizer";
  root.visible = false;
  world.add(root);

  const barGeometry = new THREE.BoxGeometry(0.035, 1, 0.035);
  barGeometry.translate(0, 0.5, 0);
  const barMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity: 0.76,
    depthWrite: false,
    toneMapped: false,
  });
  barMaterial.name = "EchoRecordGardenVisualizerBars";
  const bars = new THREE.InstancedMesh(barGeometry, barMaterial, barCapacity);
  bars.name = "EchoRecordGardenVisualizerBarInstances";
  bars.castShadow = false;
  bars.receiveShadow = false;
  bars.frustumCulled = false;
  bars.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  root.add(bars);

  const ringPositions = new Float32Array(barCapacity * 3);
  const ringGeometry = new THREE.BufferGeometry();
  const ringPosition = new THREE.BufferAttribute(ringPositions, 3);
  ringPosition.setUsage(THREE.DynamicDrawUsage);
  ringGeometry.setAttribute("position", ringPosition);
  const ringMaterial = new THREE.LineBasicMaterial({
    color: 0x56f0cf,
    transparent: true,
    opacity: 0.52,
    depthWrite: false,
    toneMapped: false,
  });
  ringMaterial.name = "EchoRecordGardenVisualizerRing";
  const ring = new THREE.LineLoop(ringGeometry, ringMaterial);
  ring.name = "EchoRecordGardenVisualizerSignalRing";
  ring.frustumCulled = false;
  root.add(ring);

  const levels = new Float32Array(barCapacity);
  const targetLevels = new Float32Array(barCapacity);
  const dummy = new THREE.Object3D();
  const targetPosition = new THREE.Vector3();
  const accentColor = new THREE.Color(0x56f0cf);
  const warmColor = new THREE.Color(0xffc86a);
  const barColor = new THREE.Color();
  let target = null;
  let activeDetailTier = "full";
  let activeBarCount = barCapacity;
  let disposed = false;
  let lastAccent = null;

  const updateColors = (accent) => {
    accentColor.set(accent ?? 0x56f0cf);
    const accentHex = accentColor.getHex();
    if (accentHex === lastAccent) return;
    lastAccent = accentHex;
    ringMaterial.color.copy(accentColor);
    for (let index = 0; index < barCapacity; index += 1) {
      const emphasis = index / Math.max(1, barCapacity - 1);
      barColor.copy(accentColor).lerp(warmColor, emphasis * 0.34);
      bars.setColorAt(index, barColor);
    }
    if (bars.instanceColor) {
      bars.instanceColor.setUsage(THREE.DynamicDrawUsage);
      bars.instanceColor.needsUpdate = true;
    }
  };

  const setDetailTier = (tier = "full") => {
    activeDetailTier = tier === "reduced" ? "reduced" : "full";
    activeBarCount = activeDetailTier === "reduced" ? reducedBarCount : barCapacity;
    bars.count = activeBarCount;
    ringGeometry.setDrawRange(0, activeBarCount);
    return activeDetailTier;
  };

  const setTarget = (nextTarget) => {
    target = nextTarget?.isObject3D ? nextTarget : null;
    root.visible = Boolean(target);
    return target;
  };

  const update = (input = {}) => {
    if (disposed) return false;
    const options = ArrayBuffer.isView(input) || Array.isArray(input) ? { frequencyData: input } : input;
    const active = options?.active !== false;
    if (!target || !active) {
      root.visible = false;
      return false;
    }
    root.visible = true;
    target.getWorldPosition(targetPosition);
    root.parent?.worldToLocal(targetPosition);
    root.position.copy(targetPosition);
    root.position.y += Number(options?.heightOffset) || 0.035;

    const reducedMotion = Boolean(options?.reducedMotion);
    const elapsed = Number(options?.elapsed) || 0;
    const delta = clamp(Number(options?.delta) || 1 / 60, 1 / 240, 0.1);
    const frequencyData = frequencyDataFrom(options);
    const hasSignal = Boolean(frequencyData?.length);
    const smoothing = reducedMotion ? 1 : 1 - Math.exp(-delta * 14);
    const radius = clamp(Number(options?.radius) || 0.72, 0.2, 2.5);

    updateColors(options?.accent);
    barMaterial.opacity = hasSignal ? 0.76 : 0.16;
    ringMaterial.opacity = hasSignal ? 0.52 : 0.22;
    root.rotation.y = reducedMotion ? 0 : elapsed * 0.045;

    for (let index = 0; index < activeBarCount; index += 1) {
      const normalizedIndex = index / Math.max(1, activeBarCount - 1);
      const sourceIndex = hasSignal
        ? Math.min(
          frequencyData.length - 1,
          Math.floor(Math.exp(normalizedIndex * Math.log(frequencyData.length + 1)) - 1),
        )
        : 0;
      targetLevels[index] = hasSignal ? normalizeSample(frequencyData[sourceIndex]) : 0;
      levels[index] += (targetLevels[index] - levels[index]) * smoothing;
      const angle = (index / activeBarCount) * TWO_PI;
      const barHeight = 0.018 + levels[index] * 0.52;
      dummy.position.set(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
      dummy.rotation.set(0, -angle, 0);
      dummy.scale.set(1, barHeight, 1);
      dummy.updateMatrix();
      bars.setMatrixAt(index, dummy.matrix);

      const ringRadius = radius + 0.1 + levels[index] * 0.08;
      ringPositions[index * 3] = Math.cos(angle) * ringRadius;
      ringPositions[index * 3 + 1] = 0.02 + levels[index] * 0.055;
      ringPositions[index * 3 + 2] = Math.sin(angle) * ringRadius;
    }
    bars.instanceMatrix.needsUpdate = true;
    ringPosition.needsUpdate = true;
    return true;
  };

  const metrics = Object.freeze({
    maxBars: barCapacity,
    fullBars: barCapacity,
    reducedBars: reducedBarCount,
    drawables: 2,
    materials: 2,
    lights: 0,
    textures: 0,
    shadowCasters: 0,
  });

  updateColors(0x56f0cf);
  setDetailTier(detailTier);
  update({ active: true, reducedMotion: true });

  return {
    root,
    bars,
    ring,
    metrics,
    setTarget,
    getTarget: () => target,
    setDetailTier,
    getDetailTier: () => activeDetailTier,
    update,
    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      barGeometry.dispose();
      barMaterial.dispose();
      ringGeometry.dispose();
      ringMaterial.dispose();
    },
  };
}
