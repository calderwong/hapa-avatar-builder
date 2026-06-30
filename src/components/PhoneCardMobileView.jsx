import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Crosshair, Gamepad2, Maximize2, Minimize2, Radio, RefreshCw, RotateCcw, Video, VideoOff, Zap } from "lucide-react";
import * as THREE from "three";

const PHONE_POSE_LIMITS = {
  x: [-3.2, 3.2],
  y: [0.55, 3.2],
  z: [-2.3, 2.6]
};
const DEFAULT_PHONE_POSE = { x: 0.2, y: 1.34, z: 1.12, yaw: 0, pitch: -0.08, roll: 0 };
const PHONE_PITCH_MIN = -Math.PI / 2 + 0.01;
const PHONE_PITCH_MAX = Math.PI / 2 - 0.01;
const PHONE_ROLL_MIN = -Math.PI;
const PHONE_ROLL_MAX = Math.PI;
const PHONE_FLIGHT_SPEED = 3.25;
const PHONE_FREEZE_HOLD_MS = 720;
const PHONE_FREEZE_CENTER_DEADZONE = 0.28;
const PHONE_ORIENTATION_ZEE = new THREE.Vector3(0, 0, 1);
const PHONE_ORIENTATION_Q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const REMOTE_CARD_WIDTH = 0.92;
const REMOTE_CARD_HEIGHT = 1.48;
const REMOTE_CARD_DEPTH = 0.055;
const REMOTE_VIDEO_SEEK_DRIFT_SECONDS = 1.7;

function phoneCameraConstraints(facingMode = "user") {
  return {
    facingMode: { ideal: facingMode },
    width: { ideal: 1280 },
    height: { ideal: 720 }
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function normalizeAngle(value) {
  let angle = Number(value) || 0;
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function screenOrientationRadians() {
  const angle = Number(globalThis.screen?.orientation?.angle ?? globalThis.orientation ?? 0) || 0;
  return THREE.MathUtils.degToRad(angle);
}

function deviceOrientationQuaternion(orientation = {}) {
  const alpha = THREE.MathUtils.degToRad(Number(orientation.alpha || 0));
  const beta = THREE.MathUtils.degToRad(Number(orientation.beta || 0));
  const gamma = THREE.MathUtils.degToRad(Number(orientation.gamma || 0));
  const screen = THREE.MathUtils.degToRad(Number(orientation.screenAngle || 0));
  const euler = new THREE.Euler(beta, alpha, -gamma, "YXZ");
  const quaternion = new THREE.Quaternion().setFromEuler(euler);
  quaternion.multiply(PHONE_ORIENTATION_Q1);
  quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(PHONE_ORIENTATION_ZEE, -screen));
  return quaternion;
}

function poseQuaternion(pose = DEFAULT_PHONE_POSE) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    Number(pose.pitch || 0),
    Number(pose.yaw || 0),
    Number(pose.roll || 0),
    "YXZ"
  ));
}

function poseAnglesFromQuaternion(quaternion, fallback = DEFAULT_PHONE_POSE) {
  const euler = new THREE.Euler().setFromQuaternion(quaternion, "YXZ");
  return {
    yaw: normalizeAngle(euler.y),
    pitch: clamp(euler.x, PHONE_PITCH_MIN, PHONE_PITCH_MAX),
    roll: clamp(normalizeAngle(euler.z), PHONE_ROLL_MIN, PHONE_ROLL_MAX),
    x: fallback.x,
    y: fallback.y,
    z: fallback.z
  };
}

function apiUrl(apiBase, pathname) {
  const base = String(apiBase || "").replace(/\/+$/, "");
  return base ? `${base}${pathname}` : pathname;
}

function remoteNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function remoteVector(values, fallback = [0, 0, 0]) {
  return new THREE.Vector3(
    remoteNumber(values?.[0], fallback[0]),
    remoteNumber(values?.[1], fallback[1]),
    remoteNumber(values?.[2], fallback[2])
  );
}

function applyRemoteTransform(object, snapshot = {}) {
  object.position.copy(remoteVector(snapshot.position, [0, 0, 0]));
  object.quaternion.copy(remoteQuaternion(snapshot));
  if (Array.isArray(snapshot.scale) && snapshot.scale.length >= 3) {
    object.scale.copy(remoteVector(snapshot.scale, [1, 1, 1]));
  } else {
    object.scale.set(1, 1, 1);
  }
}

function remoteQuaternion(snapshot = {}) {
  if (Array.isArray(snapshot.quaternion) && snapshot.quaternion.length >= 4) {
    return new THREE.Quaternion(
      remoteNumber(snapshot.quaternion[0]),
      remoteNumber(snapshot.quaternion[1]),
      remoteNumber(snapshot.quaternion[2]),
      remoteNumber(snapshot.quaternion[3], 1)
    );
  }
  if (Array.isArray(snapshot.rotation) && snapshot.rotation.length >= 3) {
    return new THREE.Quaternion().setFromEuler(new THREE.Euler(
      remoteNumber(snapshot.rotation[0]),
      remoteNumber(snapshot.rotation[1]),
      remoteNumber(snapshot.rotation[2]),
      "YXZ"
    ));
  }
  return new THREE.Quaternion();
}

function setRemoteTransformTarget(item, object, snapshot = {}) {
  item.targetPosition = item.targetPosition || new THREE.Vector3();
  item.targetQuaternion = item.targetQuaternion || new THREE.Quaternion();
  item.targetScale = item.targetScale || new THREE.Vector3(1, 1, 1);
  item.targetPosition.copy(remoteVector(snapshot.position, [0, 0, 0]));
  item.targetQuaternion.copy(remoteQuaternion(snapshot));
  if (Array.isArray(snapshot.scale) && snapshot.scale.length >= 3) {
    item.targetScale.copy(remoteVector(snapshot.scale, [1, 1, 1]));
  } else {
    item.targetScale.set(1, 1, 1);
  }
  if (!item.hasPose) {
    object.position.copy(item.targetPosition);
    object.quaternion.copy(item.targetQuaternion);
    object.scale.copy(item.targetScale);
    item.hasPose = true;
  }
}

function resolvePhoneSceneMediaUrl(uri = "") {
  const raw = String(uri || "").trim();
  if (!raw || /^(blob:|data:|file:|mediastream:|hapa-live-camera-card:)/i.test(raw)) return "";
  try {
    const parsed = new URL(raw, globalThis.location?.href || "https://127.0.0.1/");
    if (/^(blob:|data:|file:|mediastream:|hapa-live-camera-card:)/i.test(parsed.protocol)) return "";
    if (globalThis.location?.protocol === "https:" && parsed.protocol === "http:") {
      const sameLocalOrigin = ["127.0.0.1", "localhost"].includes(parsed.hostname) || parsed.hostname === globalThis.location.hostname;
      if (sameLocalOrigin) {
        parsed.protocol = "https:";
        parsed.host = globalThis.location.host;
      }
    }
    return parsed.href;
  } catch {
    return raw.startsWith("/") ? raw : "";
  }
}

function remoteColorForSnapshot(snapshot = {}) {
  const value = `${snapshot.kind || ""} ${snapshot.zone || ""}`.toLowerCase();
  if (value.includes("song")) return 0xf6c96d;
  if (value.includes("camera")) return 0x00f3ff;
  if (value.includes("avatar")) return 0xff6df2;
  if (value.includes("dock")) return 0x65f58a;
  if (value.includes("drop")) return 0xff8fcf;
  return 0x8ef7ff;
}

function createRemoteFallbackMaterial(color = 0x8ef7ff, opacity = 0.82) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    toneMapped: false
  });
}

function createRemoteVideoBundle(uri, opacity = 1) {
  const url = resolvePhoneSceneMediaUrl(uri);
  if (!url) return null;
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.loop = true;
  video.autoplay = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;
  const texture = new THREE.VideoTexture(video);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    color: 0xffffff,
    transparent: true,
    opacity,
    side: THREE.DoubleSide,
    toneMapped: false
  });
  video.play().catch(() => {});
  return { url, video, texture, material };
}

function disposeRemoteVideoBundle(bundle) {
  if (!bundle) return;
  bundle.video?.pause?.();
  if (bundle.video) {
    bundle.video.removeAttribute("src");
    bundle.video.load?.();
  }
  bundle.texture?.dispose?.();
  bundle.material?.dispose?.();
}

function setRemoteVideoMaterial(item, mesh, snapshot, fallbackColor) {
  const targetUri = resolvePhoneSceneMediaUrl(snapshot.videoUri || "");
  const opacity = clamp(snapshot.opacity ?? 0.88, 0.18, 1);
  if (targetUri) {
    if (item.videoBundle?.url !== targetUri) {
      disposeRemoteVideoBundle(item.videoBundle);
      item.videoBundle = createRemoteVideoBundle(targetUri, opacity);
    }
    if (item.videoBundle) {
      item.videoBundle.material.opacity = opacity;
      mesh.material = item.videoBundle.material;
      const targetTime = Number(snapshot.currentTime || 0);
      const video = item.videoBundle.video;
      const now = performance.now();
      if (
        targetTime > 0.05 &&
        Number.isFinite(video.duration) &&
        video.duration > 0.8 &&
        Math.abs((video.currentTime || 0) - targetTime) > REMOTE_VIDEO_SEEK_DRIFT_SECONDS &&
        now - (item.lastSeekAt || 0) > 1600
      ) {
        item.lastSeekAt = now;
        try {
          video.currentTime = Math.min(Math.max(0, targetTime), Math.max(0, video.duration - 0.2));
        } catch {
          // Some mobile media backends reject early seeks until a frame is decoded.
        }
      }
      if (snapshot.playing !== false) video.play().catch(() => {});
      else video.pause();
      return;
    }
  }
  disposeRemoteVideoBundle(item.videoBundle);
  item.videoBundle = null;
  if (!item.fallbackMaterial) item.fallbackMaterial = createRemoteFallbackMaterial(fallbackColor, opacity);
  item.fallbackMaterial.color.setHex(fallbackColor);
  item.fallbackMaterial.opacity = opacity;
  mesh.material = item.fallbackMaterial;
}

function createRemoteLabelSprite(text = "", color = 0x8ef7ff) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 144;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(2, 8, 16, 0.78)";
  ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
  ctx.lineWidth = 5;
  ctx.fillRect(10, 22, 492, 86);
  ctx.strokeRect(10, 22, 492, 86);
  ctx.fillStyle = "#ecfbff";
  ctx.font = "800 34px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textBaseline = "middle";
  const label = String(text || "Card").toUpperCase();
  let trimmed = label;
  while (ctx.measureText(trimmed).width > 440 && trimmed.length > 6) trimmed = `${trimmed.slice(0, -2)}...`;
  ctx.fillText(trimmed, 34, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(0.78, 0.22, 1);
  return sprite;
}

function disposeRemoteObject(object) {
  if (!object) return;
  object.traverse?.((child) => {
    child.geometry?.dispose?.();
    const materials = Array.isArray(child.material) ? child.material : [child.material].filter(Boolean);
    materials.forEach((material) => {
      material.map?.dispose?.();
      material.dispose?.();
    });
  });
  object.parent?.remove?.(object);
}

function disposeRemoteItem(item) {
  disposeRemoteVideoBundle(item?.videoBundle);
  disposeRemoteObject(item?.group || item?.mesh);
}

function clearRemoteReplica(remote) {
  if (!remote) return;
  remote.cards.forEach(disposeRemoteItem);
  remote.screens.forEach(disposeRemoteItem);
  remote.effects.forEach(disposeRemoteItem);
  remote.cards.clear();
  remote.screens.clear();
  remote.effects.clear();
}

function ensureRemoteRoot(three, remote) {
  if (remote.root) return remote.root;
  remote.root = new THREE.Group();
  remote.root.name = "RemoteTarotSceneReplica";
  three.scene.add(remote.root);
  return remote.root;
}

function ensureRemoteCardItem(three, remote, snapshot) {
  const root = ensureRemoteRoot(three, remote);
  let item = remote.cards.get(snapshot.id);
  if (item) return item;
  const group = new THREE.Group();
  group.name = `RemoteCard:${snapshot.title || snapshot.id}`;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(REMOTE_CARD_WIDTH, REMOTE_CARD_DEPTH, REMOTE_CARD_HEIGHT),
    new THREE.MeshStandardMaterial({
      color: 0x0c1b2c,
      emissive: 0x031421,
      roughness: 0.55,
      metalness: 0.12
    })
  );
  const face = new THREE.Mesh(
    new THREE.PlaneGeometry(REMOTE_CARD_WIDTH * 0.94, REMOTE_CARD_HEIGHT * 0.94),
    createRemoteFallbackMaterial(remoteColorForSnapshot(snapshot), 0.86)
  );
  face.rotation.x = -Math.PI / 2;
  face.position.y = REMOTE_CARD_DEPTH / 2 + 0.004;
  const edge = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(REMOTE_CARD_WIDTH * 1.01, REMOTE_CARD_DEPTH * 1.12, REMOTE_CARD_HEIGHT * 1.01)),
    new THREE.LineBasicMaterial({ color: 0xf6c96d, transparent: true, opacity: 0.55 })
  );
  group.add(body, face, edge);
  root.add(group);
  item = { group, face, body, edge, label: null, labelText: "", videoBundle: null, fallbackMaterial: face.material };
  remote.cards.set(snapshot.id, item);
  return item;
}

function updateRemoteCardItem(three, remote, snapshot) {
  const item = ensureRemoteCardItem(three, remote, snapshot);
  const color = remoteColorForSnapshot(snapshot);
  setRemoteTransformTarget(item, item.group, snapshot);
  item.body.material.emissive.setHex(snapshot.selected ? 0x2d1642 : 0x031421);
  item.body.material.color.setHex(snapshot.selected ? 0x251a42 : 0x0c1b2c);
  item.edge.material.color.setHex(snapshot.hover || snapshot.selected ? 0x00f3ff : color);
  item.edge.material.opacity = snapshot.hover || snapshot.selected ? 0.92 : 0.52;
  setRemoteVideoMaterial(item, item.face, snapshot, color);
  const labelText = `${snapshot.title || "Card"}${snapshot.zone ? ` / ${snapshot.zone}` : ""}`;
  if (item.labelText !== labelText) {
    if (item.label) disposeRemoteObject(item.label);
    item.label = createRemoteLabelSprite(labelText, color);
    item.label.position.set(0, 0.2, -REMOTE_CARD_HEIGHT * 0.64);
    item.group.add(item.label);
    item.labelText = labelText;
  }
}

function ensureRemoteScreenItem(three, remote, snapshot) {
  const root = ensureRemoteRoot(three, remote);
  let item = remote.screens.get(snapshot.id);
  if (item) return item;
  const width = Math.max(0.1, remoteNumber(snapshot.width, 1.6));
  const height = Math.max(0.1, remoteNumber(snapshot.height, 0.9));
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    createRemoteFallbackMaterial(0x15546a, clamp(snapshot.opacity ?? 0.72, 0.16, 1))
  );
  mesh.name = `RemoteScreen:${snapshot.family || "screen"}`;
  mesh.renderOrder = snapshot.family === "dock-projection" ? 2 : 1;
  root.add(mesh);
  item = { mesh, width, height, videoBundle: null, fallbackMaterial: mesh.material };
  remote.screens.set(snapshot.id, item);
  return item;
}

function updateRemoteScreenItem(three, remote, snapshot) {
  const item = ensureRemoteScreenItem(three, remote, snapshot);
  const width = Math.max(0.1, remoteNumber(snapshot.width, 1.6));
  const height = Math.max(0.1, remoteNumber(snapshot.height, 0.9));
  if (Math.abs(width - item.width) > 0.02 || Math.abs(height - item.height) > 0.02) {
    const previous = item.mesh.geometry;
    item.mesh.geometry = new THREE.PlaneGeometry(width, height);
    previous?.dispose?.();
    item.width = width;
    item.height = height;
  }
  setRemoteTransformTarget(item, item.mesh, snapshot);
  const color = snapshot.family === "dock-projection" ? 0x0fd0d8 : 0x9d74ff;
  setRemoteVideoMaterial(item, item.mesh, snapshot, color);
}

function colorFromRemoteHex(value = "", fallback = 0x00f3ff) {
  const text = String(value || "").trim();
  if (!/^#?[0-9a-f]{6}$/i.test(text)) return fallback;
  return Number.parseInt(text.replace("#", ""), 16);
}

function ensureRemoteEffectItem(three, remote, snapshot) {
  const root = ensureRemoteRoot(three, remote);
  let item = remote.effects.get(snapshot.id);
  if (item) return item;
  const color = colorFromRemoteHex(snapshot.color, 0x00f3ff);
  const group = new THREE.Group();
  group.name = `RemoteEffect:${snapshot.label || snapshot.id}`;
  const ringGeometry = snapshot.type === "dock"
    ? new THREE.PlaneGeometry(Math.max(0.2, remoteNumber(snapshot.width, 2.8)), Math.max(0.2, remoteNumber(snapshot.depth, 0.7)))
    : new THREE.TorusGeometry(Math.max(0.08, remoteNumber(snapshot.radius, 0.62)), 0.014, 8, 96);
  const ring = new THREE.Mesh(
    ringGeometry,
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  ring.name = "remoteEffectRing";
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  const core = new THREE.Mesh(
    new THREE.CircleGeometry(Math.max(0.08, remoteNumber(snapshot.radius, 0.62)) * 0.74, 64),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.08,
      depthWrite: false,
      side: THREE.DoubleSide
    })
  );
  core.name = "remoteEffectCore";
  core.rotation.x = -Math.PI / 2;
  if (snapshot.type !== "dock") group.add(core);
  root.add(group);
  item = {
    group,
    ring,
    core,
    targetEnergy: 0,
    energy: 0,
    active: false,
    phase: Math.random() * Math.PI * 2,
    hasPose: false
  };
  remote.effects.set(snapshot.id, item);
  return item;
}

function updateRemoteEffectItem(three, remote, snapshot) {
  const item = ensureRemoteEffectItem(three, remote, snapshot);
  const color = colorFromRemoteHex(snapshot.color, 0x00f3ff);
  setRemoteTransformTarget(item, item.group, {
    position: snapshot.position,
    quaternion: [0, 0, 0, 1],
    scale: [1, 1, 1]
  });
  item.targetEnergy = clamp(snapshot.energy || 0, 0, 1.4);
  item.active = Boolean(snapshot.active);
  item.band = snapshot.band || "energy";
  item.ring.material.color.setHex(color);
  if (item.core) item.core.material.color.setHex(color);
}

function easeRemoteObjectToTarget(item, object, dt, stiffness = 13) {
  if (!item?.targetPosition || !object) return;
  const alpha = 1 - Math.exp(-stiffness * dt);
  object.position.lerp(item.targetPosition, alpha);
  object.quaternion.slerp(item.targetQuaternion, alpha);
  object.scale.lerp(item.targetScale, alpha);
}

function updateRemoteReplicaAnimation(remote, dt, elapsed) {
  remote.cards.forEach((item) => {
    easeRemoteObjectToTarget(item, item.group, dt, 14);
    if (item.label) item.label.material.opacity = 0.72 + Math.sin(elapsed * 1.8) * 0.08;
  });
  remote.screens.forEach((item) => {
    easeRemoteObjectToTarget(item, item.mesh, dt, 18);
  });
  remote.effects.forEach((item) => {
    easeRemoteObjectToTarget(item, item.group, dt, 16);
    item.energy = THREE.MathUtils.damp(item.energy || 0, item.targetEnergy || 0, 7.5, dt);
    const pulse = (Math.sin(elapsed * (2.4 + item.energy * 2.5) + item.phase) + 1) * 0.5;
    const scale = 1 + item.energy * 0.26 + pulse * (item.active ? 0.065 : 0.028);
    if (item.ring) {
      item.ring.scale.setScalar(scale);
      item.ring.rotation.z += dt * (0.18 + item.energy * 0.42);
      item.ring.material.opacity = clamp(0.16 + item.energy * 0.42 + pulse * 0.08, 0.06, 0.88);
    }
    if (item.core) {
      item.core.scale.setScalar(0.86 + item.energy * 0.18 + pulse * 0.04);
      item.core.rotation.z -= dt * (0.12 + item.energy * 0.25);
      item.core.material.opacity = clamp(0.05 + item.energy * 0.2 + pulse * 0.04, 0.02, 0.36);
    }
  });
}

function updateRemoteSceneFromState(three, remote, state) {
  if (!three?.scene || !state) return { cards: 0, screens: 0, videos: 0, effects: 0 };
  ensureRemoteRoot(three, remote);
  const seenCards = new Set();
  for (const snapshot of Array.isArray(state.cards) ? state.cards : []) {
    if (!snapshot?.id) continue;
    seenCards.add(snapshot.id);
    updateRemoteCardItem(three, remote, snapshot);
  }
  for (const [id, item] of remote.cards) {
    if (seenCards.has(id)) continue;
    disposeRemoteItem(item);
    remote.cards.delete(id);
  }
  const seenScreens = new Set();
  for (const snapshot of Array.isArray(state.screens) ? state.screens : []) {
    if (!snapshot?.id) continue;
    seenScreens.add(snapshot.id);
    updateRemoteScreenItem(three, remote, snapshot);
  }
  for (const [id, item] of remote.screens) {
    if (seenScreens.has(id)) continue;
    disposeRemoteItem(item);
    remote.screens.delete(id);
  }
  const seenEffects = new Set();
  for (const snapshot of Array.isArray(state.effects) ? state.effects : []) {
    if (!snapshot?.id) continue;
    seenEffects.add(snapshot.id);
    updateRemoteEffectItem(three, remote, snapshot);
  }
  for (const [id, item] of remote.effects) {
    if (seenEffects.has(id)) continue;
    disposeRemoteItem(item);
    remote.effects.delete(id);
  }
  let videos = 0;
  remote.cards.forEach((item) => { if (item.videoBundle) videos += 1; });
  remote.screens.forEach((item) => { if (item.videoBundle) videos += 1; });
  return { cards: remote.cards.size, screens: remote.screens.size, videos, effects: remote.effects.size };
}

export default function PhoneCardMobileView({ apiBase = "" }) {
  const params = new URLSearchParams(globalThis.location?.search || "");
  const session = params.get("session") || "";
  const inviteId = params.get("invite") || "";
  const cardId = params.get("card") || "";
  const rootRef = useRef(null);
  const videoRef = useRef(null);
  const desktopFpvVideoRef = useRef(null);
  const canvasRef = useRef(null);
  const moveJoystickPadRef = useRef(null);
  const moveJoystickPointerRef = useRef(null);
  const heightJoystickPadRef = useRef(null);
  const heightJoystickPointerRef = useRef(null);
  const moveFreezeGestureRef = useRef(null);
  const heightFreezeGestureRef = useRef(null);
  const pcRef = useRef(null);
  const channelRef = useRef(null);
  const iceServersRef = useRef([]);
  const inviteRef = useRef({ inviteId, cardId });
  const streamRef = useRef(null);
  const videoSenderRef = useRef(null);
  const audioSenderRef = useRef(null);
  const desktopFpvStreamRef = useRef(null);
  const desktopFpvReadyRef = useRef(false);
  const sinceRef = useRef(0);
  const pollTimerRef = useRef(0);
  const rafRef = useRef(0);
  const controlsRef = useRef({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0 });
  const orientationRef = useRef({ alpha: 0, beta: 0, gamma: 0, screenAngle: 0, active: false, hasSample: false });
  const orientationCalibrationRef = useRef({ ready: false, deviceBase: null, poseBase: DEFAULT_PHONE_POSE });
  const motionRef = useRef({ active: false, x: 0, y: 0, z: 0, baseX: 0, baseY: 0, baseZ: 0, calibrated: false });
  const velocityRef = useRef({ x: 0, y: 0, z: 0 });
  const poseRef = useRef({ ...DEFAULT_PHONE_POSE });
  const positionFrozenRef = useRef(false);
  const orientationFrozenRef = useRef(false);
  const frozenPositionRef = useRef({ x: DEFAULT_PHONE_POSE.x, y: DEFAULT_PHONE_POSE.y, z: DEFAULT_PHONE_POSE.z });
  const cameraFacingRef = useRef("user");
  const threeRef = useRef(null);
  const remoteSceneRef = useRef({ root: null, cards: new Map(), screens: new Map(), effects: new Map(), pendingState: null, lastStatsAt: 0 });
  const lastSendRef = useRef(0);
  const xrSessionRef = useRef(null);
  const xrCalibrationRef = useRef({ ready: false, basePosition: null, baseQuaternion: null, poseBase: { ...DEFAULT_PHONE_POSE } });
  const [status, setStatus] = useState(session ? "Ready to join" : "Missing session");
  const [error, setError] = useState("");
  const [connected, setConnected] = useState(false);
  const [mediaReady, setMediaReady] = useState(false);
  const [desktopFpvReady, setDesktopFpvReady] = useState(false);
  const [fpv, setFpv] = useState(true);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [orientationEnabled, setOrientationEnabled] = useState(false);
  const [xrSupported, setXrSupported] = useState({ ar: false, vr: false, checked: false });
  const [xrActive, setXrActive] = useState(false);
  const [xrMode, setXrMode] = useState("");
  const [fullScreenMode, setFullScreenMode] = useState(false);
  const [joystickVector, setJoystickVector] = useState({ x: 0, z: 0 });
  const [heightJoystickValue, setHeightJoystickValue] = useState(0);
  const [freezeState, setFreezeState] = useState({ position: false, orientation: false });
  const [lastPose, setLastPose] = useState(poseRef.current);
  const [remoteSceneStats, setRemoteSceneStats] = useState({ cards: 0, screens: 0, videos: 0, effects: 0, live: false });
  const [phoneToolState, setPhoneToolState] = useState({ laserTagged: false, tractorActive: false, status: "" });

  const postEvent = useCallback(async (target, type, payload = {}) => {
    if (!session) return null;
    const response = await fetch(apiUrl(apiBase, "/api/phone-bridge/events"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, from: "mobile", target, type, payload })
    });
    return response.json().catch(() => null);
  }, [apiBase, session]);

  useEffect(() => {
    let cancelled = false;
    if (!session) return undefined;
    fetch(apiUrl(apiBase, `/api/phone-bridge/info?session=${encodeURIComponent(session)}`))
      .then((response) => response.json())
      .then((payload) => {
        if (cancelled) return;
        iceServersRef.current = Array.isArray(payload?.iceServers) ? payload.iceServers : [];
        inviteRef.current = {
          inviteId,
          cardId,
          bridgeOrigin: payload?.origin || "",
          mobileUrl: payload?.mobileUrl || "",
          iceServerCount: iceServersRef.current.length
        };
      })
      .catch(() => {
        if (!cancelled) iceServersRef.current = [];
      });
    return () => {
      cancelled = true;
    };
  }, [apiBase, cardId, inviteId, session]);

  const pollDesktopEvents = useCallback(async () => {
    if (!session) return;
    try {
      const response = await fetch(apiUrl(apiBase, `/api/phone-bridge/events?session=${encodeURIComponent(session)}&target=mobile&since=${sinceRef.current}`));
      const payload = await response.json();
      if (payload?.nextSeq) sinceRef.current = Math.max(sinceRef.current, Number(payload.nextSeq) || 0);
      for (const event of payload?.events || []) {
        if (event.type === "answer" && event.payload?.sdp && pcRef.current) {
          await pcRef.current.setRemoteDescription(new RTCSessionDescription(event.payload));
          setStatus("Connected to Tarot space");
        } else if (event.type === "candidate" && event.payload?.candidate && pcRef.current) {
          await pcRef.current.addIceCandidate(new RTCIceCandidate(event.payload)).catch(() => {});
        }
      }
    } catch (pollError) {
      setStatus("Waiting for Tarot desktop");
    } finally {
      pollTimerRef.current = window.setTimeout(pollDesktopEvents, 420);
    }
  }, [apiBase, session]);

  const applyRemoteSceneState = useCallback((state) => {
    if (!state || typeof state !== "object") return;
    const remote = remoteSceneRef.current;
    remote.pendingState = state;
    if (state.tools) {
      setPhoneToolState({
        laserTagged: Boolean(state.tools.laserTagged),
        tractorActive: Boolean(state.tools.tractorActive),
        status: String(state.tools.status || "")
      });
    }
    if (desktopFpvReadyRef.current) {
      if (remote.cards.size || remote.screens.size || remote.effects.size) clearRemoteReplica(remote);
      setRemoteSceneStats({
        cards: Number(state.counts?.cards || state.cards?.length || 0),
        screens: Number(state.counts?.screens || state.screens?.length || 0),
        effects: Number(state.counts?.effects || state.effects?.length || 0),
        videos: 0,
        live: true
      });
      return;
    }
    const three = threeRef.current;
    if (!three) return;
    const stats = updateRemoteSceneFromState(three, remote, state);
    const now = performance.now();
    if (!remote.lastStatsAt || now - remote.lastStatsAt > 650) {
      remote.lastStatsAt = now;
      setRemoteSceneStats({ ...stats, live: true });
    }
  }, []);

  const handlePhoneChannelMessage = useCallback((event) => {
    try {
      const message = JSON.parse(event.data || "{}");
      if (message.type === "scene-state") applyRemoteSceneState(message.state);
      if (message.type === "phone-tool-state") {
        setPhoneToolState({
          laserTagged: Boolean(message.tools?.laserTagged),
          tractorActive: Boolean(message.tools?.tractorActive),
          status: String(message.tools?.status || "")
        });
      }
    } catch {
      // Ignore malformed scene packets.
    }
  }, [applyRemoteSceneState]);

  const toggleFullScreenMode = useCallback(async () => {
    const documentRef = globalThis.document;
    const root = rootRef.current;
    const fullscreenElement = documentRef?.fullscreenElement || documentRef?.webkitFullscreenElement || null;
    if (fullScreenMode || fullscreenElement === root) {
      setFullScreenMode(false);
      if (fullscreenElement && documentRef?.exitFullscreen) {
        await documentRef.exitFullscreen().catch(() => {});
      } else if (fullscreenElement && documentRef?.webkitExitFullscreen) {
        documentRef.webkitExitFullscreen();
      }
      return;
    }
    setFullScreenMode(true);
    if (root?.requestFullscreen) {
      await root.requestFullscreen({ navigationUI: "hide" }).catch(() => {});
    } else if (root?.webkitRequestFullscreen) {
      root.webkitRequestFullscreen();
    }
  }, [fullScreenMode]);

  useEffect(() => {
    const documentRef = globalThis.document;
    if (!documentRef?.addEventListener) return undefined;
    const syncFullscreenState = () => {
      const fullscreenElement = documentRef.fullscreenElement || documentRef.webkitFullscreenElement || null;
      if (!fullscreenElement) setFullScreenMode(false);
      else if (fullscreenElement === rootRef.current) setFullScreenMode(true);
    };
    documentRef.addEventListener("fullscreenchange", syncFullscreenState);
    documentRef.addEventListener("webkitfullscreenchange", syncFullscreenState);
    return () => {
      documentRef.removeEventListener("fullscreenchange", syncFullscreenState);
      documentRef.removeEventListener("webkitfullscreenchange", syncFullscreenState);
    };
  }, []);

  useEffect(() => {
    const diagnostics = {
      kind: "hapa-phone-card",
      actions: {
        applySceneState: (state = {}) => {
          applyRemoteSceneState(state);
          const remote = remoteSceneRef.current;
          return {
            cards: remote.cards.size,
            screens: remote.screens.size,
            effects: remote.effects.size
          };
        }
      },
      get state() {
        const remote = remoteSceneRef.current;
        return {
          connected: channelRef.current?.readyState === "open",
          peerState: pcRef.current?.connectionState || "",
          mediaReady: Boolean(streamRef.current),
          desktopFpvReady: desktopFpvReadyRef.current,
          cameraFacing: cameraFacingRef.current,
          tools: phoneToolState,
          fpv,
          xrActive: Boolean(xrSessionRef.current),
          fullScreenMode,
          freeze: {
            position: positionFrozenRef.current,
            orientation: orientationFrozenRef.current
          },
          pose: { ...poseRef.current },
          remoteScene: {
            cards: remote.cards.size,
            screens: remote.screens.size,
            effects: remote.effects.size,
            pending: Boolean(remote.pendingState),
            lastStatsAt: remote.lastStatsAt || 0
          },
          renderer: threeRef.current?.renderer?.info ? {
            calls: threeRef.current.renderer.info.render.calls,
            triangles: threeRef.current.renderer.info.render.triangles,
            geometries: threeRef.current.renderer.info.memory.geometries,
            textures: threeRef.current.renderer.info.memory.textures
          } : null
        };
      }
    };
    window.__HAPA_PHONE_CARD_DIAGNOSTICS__ = diagnostics;
    return () => {
      if (window.__HAPA_PHONE_CARD_DIAGNOSTICS__ === diagnostics) delete window.__HAPA_PHONE_CARD_DIAGNOSTICS__;
    };
  }, [applyRemoteSceneState, fpv, freezeState, fullScreenMode, phoneToolState]);

  const startPhoneCard = useCallback(async () => {
    if (!session) return;
    setError("");
    setStatus("Requesting camera and mic");
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("Camera/mic access is not available here. Mobile browsers usually require HTTPS for local-network camera access.");
      setStatus("Media blocked");
      return;
    }
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: phoneCameraConstraints(cameraFacingRef.current),
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setMediaReady(true);
      setStatus("Opening peer link");

      const pc = new RTCPeerConnection({ iceServers: iceServersRef.current || [] });
      pcRef.current = pc;
      videoSenderRef.current = null;
      audioSenderRef.current = null;
      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind === "video") videoSenderRef.current = sender;
        if (track.kind === "audio") audioSenderRef.current = sender;
      });
      pc.addTransceiver("video", { direction: "recvonly" });
      pc.addTransceiver("audio", { direction: "recvonly" });
      pc.onicecandidate = (event) => {
        if (event.candidate) postEvent("desktop", "candidate", event.candidate.toJSON?.() || event.candidate);
      };
      pc.ontrack = (event) => {
        const inboundStream = event.streams?.[0] || desktopFpvStreamRef.current || new MediaStream();
        if (!event.streams?.[0] && event.track && !inboundStream.getTracks().includes(event.track)) {
          inboundStream.addTrack(event.track);
        }
        desktopFpvStreamRef.current = inboundStream;
        if (desktopFpvVideoRef.current && desktopFpvVideoRef.current.srcObject !== inboundStream) {
          desktopFpvVideoRef.current.srcObject = inboundStream;
        }
        if (event.track.kind === "video") {
          desktopFpvReadyRef.current = true;
          setDesktopFpvReady(true);
          clearRemoteReplica(remoteSceneRef.current);
          setStatus("Desktop FPV stream online");
        }
        desktopFpvVideoRef.current?.play?.().catch(() => {});
      };
      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        setConnected(["connected", "completed"].includes(state));
        if (state === "connected") setStatus("Phone Card live in Tarot space");
        if (["failed", "disconnected", "closed"].includes(state)) setStatus(`Peer ${state}`);
      };
      const channel = pc.createDataChannel("phone-controls", { ordered: false, maxRetransmits: 0 });
      channelRef.current = channel;
      channel.onopen = () => {
        setConnected(true);
        setStatus("Flight controls online");
      };
      channel.onclose = () => setConnected(false);
      channel.onmessage = handlePhoneChannelMessage;
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      await postEvent("desktop", "hello", {
        label: inviteId ? "Scene Invite Phone Card" : "Phone Card",
        inviteId,
        cardId,
        bridge: inviteRef.current
      });
      await postEvent("desktop", "offer", pc.localDescription?.toJSON?.() || pc.localDescription);
      setStatus("Waiting for desktop answer");
    } catch (startError) {
      stream?.getTracks?.().forEach((track) => track.stop());
      setError(startError?.message || "Phone media could not start");
      setStatus("Media blocked");
    }
  }, [cardId, handlePhoneChannelMessage, inviteId, postEvent, session]);

  const switchCameraFacing = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia || !streamRef.current) return;
    const nextFacing = cameraFacingRef.current === "user" ? "environment" : "user";
    setError("");
    setStatus(nextFacing === "user" ? "Switching to front camera" : "Switching to back camera");
    const currentStream = streamRef.current;
    const oldVideoTracks = currentStream.getVideoTracks();
    let nextVideoStream = null;
    try {
      nextVideoStream = await navigator.mediaDevices.getUserMedia({
        video: phoneCameraConstraints(nextFacing),
        audio: false
      });
    } catch (firstError) {
      oldVideoTracks.forEach((track) => track.stop());
      try {
        nextVideoStream = await navigator.mediaDevices.getUserMedia({
          video: phoneCameraConstraints(nextFacing),
          audio: false
        });
      } catch (retryError) {
        setError(retryError?.message || firstError?.message || "Camera switch failed");
        setStatus("Camera switch blocked");
        return;
      }
    }
    const nextVideoTrack = nextVideoStream.getVideoTracks()[0] || null;
    if (!nextVideoTrack) {
      setError("No replacement camera track was returned.");
      setStatus("Camera switch blocked");
      return;
    }
    const sender = videoSenderRef.current ||
      pcRef.current?.getSenders?.().find((item) => item.track?.kind === "video") ||
      null;
    try {
      if (sender?.replaceTrack) {
        await sender.replaceTrack(nextVideoTrack);
        videoSenderRef.current = sender;
      } else if (pcRef.current) {
        videoSenderRef.current = pcRef.current.addTrack(nextVideoTrack, currentStream);
      }
      oldVideoTracks.forEach((track) => {
        currentStream.removeTrack?.(track);
        track.stop();
      });
      currentStream.addTrack(nextVideoTrack);
      nextVideoStream.getAudioTracks().forEach((track) => track.stop());
      streamRef.current = currentStream;
      if (videoRef.current) {
        videoRef.current.srcObject = currentStream;
        videoRef.current.play().catch(() => {});
      }
      cameraFacingRef.current = nextFacing;
      setCameraFacing(nextFacing);
      setStatus(nextFacing === "user" ? "Front camera sending" : "Back camera sending");
    } catch (switchError) {
      nextVideoTrack.stop();
      setError(switchError?.message || "Camera switch failed");
      setStatus("Camera switch blocked");
    }
  }, []);

  const sendPhoneAction = useCallback((action, payload = {}) => {
    const channel = channelRef.current;
    if (channel?.readyState !== "open") {
      setStatus("Flight controls are not connected yet");
      return false;
    }
    const actionId = `phone-action-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const packet = JSON.stringify({
      type: "phone-action",
      action,
      actionId,
      payload,
      pose: poseRef.current,
      cameraFacing: cameraFacingRef.current,
      sentAt: Date.now()
    });
    const sendOnce = () => {
      if (channel.readyState !== "open") return;
      if (channel.bufferedAmount > 512 * 1024) return;
      channel.send(packet);
    };
    sendOnce();
    window.setTimeout(sendOnce, 45);
    window.setTimeout(sendOnce, 115);
    setPhoneToolState((current) => ({
      ...current,
      tractorActive: action === "tractor-toggle" ? current.tractorActive : current.tractorActive,
      status: action === "laser-tag" ? "Tagging reticle" : action === "tractor-toggle" ? "Tractor command sent" : current.status
    }));
    return true;
  }, []);

  const requestOrientation = useCallback(async () => {
    try {
      if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== "granted") {
          setError("Motion permission was denied.");
          return;
        }
      }
      setOrientationEnabled(true);
      orientationRef.current.active = true;
      orientationRef.current.screenAngle = THREE.MathUtils.radToDeg(screenOrientationRadians());
      orientationCalibrationRef.current = { ready: false, deviceBase: null, poseBase: { ...poseRef.current } };
      motionRef.current = { ...motionRef.current, active: false, calibrated: false };
      velocityRef.current = { x: 0, y: 0, z: 0 };
      setStatus("Phone aim telemetry active");
    } catch (orientationError) {
      setError(orientationError?.message || "Motion telemetry unavailable");
    }
  }, []);

  const setControls = useCallback((updates) => {
    controlsRef.current = { ...controlsRef.current, ...updates };
  }, []);

  const updateFreezeState = useCallback(() => {
    setFreezeState({
      position: positionFrozenRef.current,
      orientation: orientationFrozenRef.current
    });
  }, []);

  const beginFreezeGesture = useCallback((gestureRef) => {
    gestureRef.current = {
      startedAt: performance.now(),
      maxMagnitude: 0
    };
  }, []);

  const trackFreezeGesture = useCallback((gestureRef, magnitude) => {
    if (!gestureRef.current) return;
    gestureRef.current.maxMagnitude = Math.max(gestureRef.current.maxMagnitude || 0, Math.abs(Number(magnitude) || 0));
  }, []);

  const finishFreezeGesture = useCallback((gestureRef) => {
    const gesture = gestureRef.current;
    gestureRef.current = null;
    if (!gesture) return false;
    return performance.now() - gesture.startedAt >= PHONE_FREEZE_HOLD_MS
      && (gesture.maxMagnitude || 0) <= PHONE_FREEZE_CENTER_DEADZONE;
  }, []);

  const togglePositionFreeze = useCallback(() => {
    const next = !positionFrozenRef.current;
    positionFrozenRef.current = next;
    if (next) {
      const pose = poseRef.current;
      frozenPositionRef.current = { x: pose.x, y: pose.y, z: pose.z };
      setJoystickVector({ x: 0, z: 0 });
      setHeightJoystickValue(0);
      setControls({ x: 0, y: 0, z: 0 });
      setStatus("Position frozen in Tarot space");
    } else {
      setStatus("Position controls live");
    }
    updateFreezeState();
  }, [setControls, updateFreezeState]);

  const toggleOrientationFreeze = useCallback(async () => {
    const next = !orientationFrozenRef.current;
    orientationFrozenRef.current = next;
    if (next) {
      setControls({ yaw: 0, pitch: 0 });
      setStatus("Phone Card orientation frozen");
    } else {
      orientationRef.current.screenAngle = THREE.MathUtils.radToDeg(screenOrientationRadians());
      orientationCalibrationRef.current = { ready: false, deviceBase: null, poseBase: { ...poseRef.current } };
      xrCalibrationRef.current = { ready: false, basePosition: null, baseQuaternion: null, poseBase: { ...poseRef.current } };
      if (!orientationRef.current.active && !xrSessionRef.current) {
        await requestOrientation();
      }
      setStatus("Phone Card orientation mirroring phone");
    }
    updateFreezeState();
  }, [requestOrientation, setControls, updateFreezeState]);

  const updateMoveJoystickFromPointer = useCallback((event) => {
    const rect = moveJoystickPadRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = Math.max(1, Math.min(rect.width, rect.height) * 0.42);
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const rawX = event.clientX - centerX;
    const rawY = event.clientY - centerY;
    const distance = Math.hypot(rawX, rawY);
    const scale = distance > radius ? radius / distance : 1;
    const next = {
      x: clamp((rawX * scale) / radius, -1, 1),
      z: clamp((-rawY * scale) / radius, -1, 1)
    };
    const magnitude = Math.hypot(next.x, next.z);
    trackFreezeGesture(moveFreezeGestureRef, magnitude);
    setJoystickVector(next);
    setControls(positionFrozenRef.current ? { x: 0, z: 0 } : next);
  }, [setControls, trackFreezeGesture]);

  const startJoystick = useCallback((event) => {
    event.preventDefault();
    moveJoystickPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginFreezeGesture(moveFreezeGestureRef);
    updateMoveJoystickFromPointer(event);
  }, [beginFreezeGesture, updateMoveJoystickFromPointer]);

  const moveJoystick = useCallback((event) => {
    if (moveJoystickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    updateMoveJoystickFromPointer(event);
  }, [updateMoveJoystickFromPointer]);

  const stopJoystick = useCallback((event) => {
    if (event && moveJoystickPointerRef.current !== event.pointerId) return;
    const shouldToggleFreeze = finishFreezeGesture(moveFreezeGestureRef);
    moveJoystickPointerRef.current = null;
    setJoystickVector({ x: 0, z: 0 });
    setControls({ x: 0, z: 0 });
    if (shouldToggleFreeze) togglePositionFreeze();
  }, [finishFreezeGesture, setControls, togglePositionFreeze]);

  const updateHeightJoystickFromPointer = useCallback((event) => {
    const rect = heightJoystickPadRef.current?.getBoundingClientRect();
    if (!rect) return;
    const radius = Math.max(1, rect.height * 0.38);
    const centerY = rect.top + rect.height / 2;
    const rawY = event.clientY - centerY;
    const value = clamp(-rawY / radius, -1, 1);
    trackFreezeGesture(heightFreezeGestureRef, Math.abs(value));
    setHeightJoystickValue(value);
    setControls({ y: positionFrozenRef.current ? 0 : value });
  }, [setControls, trackFreezeGesture]);

  const startHeightJoystick = useCallback((event) => {
    event.preventDefault();
    heightJoystickPointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    beginFreezeGesture(heightFreezeGestureRef);
    updateHeightJoystickFromPointer(event);
  }, [beginFreezeGesture, updateHeightJoystickFromPointer]);

  const moveHeightJoystick = useCallback((event) => {
    if (heightJoystickPointerRef.current !== event.pointerId) return;
    event.preventDefault();
    updateHeightJoystickFromPointer(event);
  }, [updateHeightJoystickFromPointer]);

  const stopHeightJoystick = useCallback((event) => {
    if (event && heightJoystickPointerRef.current !== event.pointerId) return;
    const shouldToggleFreeze = finishFreezeGesture(heightFreezeGestureRef);
    heightJoystickPointerRef.current = null;
    setHeightJoystickValue(0);
    setControls({ y: 0 });
    if (shouldToggleFreeze) toggleOrientationFreeze();
  }, [finishFreezeGesture, setControls, toggleOrientationFreeze]);

  const resetPose = useCallback(() => {
    poseRef.current = { ...DEFAULT_PHONE_POSE };
    velocityRef.current = { x: 0, y: 0, z: 0 };
    frozenPositionRef.current = { x: DEFAULT_PHONE_POSE.x, y: DEFAULT_PHONE_POSE.y, z: DEFAULT_PHONE_POSE.z };
    orientationCalibrationRef.current = { ready: false, deviceBase: null, poseBase: { ...DEFAULT_PHONE_POSE } };
    xrCalibrationRef.current = { ready: false, basePosition: null, baseQuaternion: null, poseBase: { ...DEFAULT_PHONE_POSE } };
    setLastPose(poseRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function detectWebXr() {
      if (!navigator.xr?.isSessionSupported) {
        if (!cancelled) setXrSupported({ ar: false, vr: false, checked: true });
        return;
      }
      const [ar, vr] = await Promise.all([
        navigator.xr.isSessionSupported("immersive-ar").catch(() => false),
        navigator.xr.isSessionSupported("immersive-vr").catch(() => false)
      ]);
      if (!cancelled) setXrSupported({ ar: Boolean(ar), vr: Boolean(vr), checked: true });
    }
    detectWebXr();
    return () => {
      cancelled = true;
    };
  }, []);

  const startWebXr = useCallback(async () => {
    setError("");
    if (xrSessionRef.current) {
      await xrSessionRef.current.end().catch(() => {});
      return;
    }
    const renderer = threeRef.current?.renderer;
    if (!renderer) {
      setError("XR renderer is not ready yet.");
      return;
    }
    if (!navigator.xr?.requestSession) {
      setError("WebXR is not available in this browser. Use the secure phone URL in a WebXR-capable browser.");
      return;
    }
    const mode = xrSupported.ar ? "immersive-ar" : xrSupported.vr ? "immersive-vr" : "";
    if (!mode) {
      setError("This phone/browser does not report immersive WebXR support.");
      return;
    }
    const requestOptions = [
      {
        referenceSpaceType: "local-floor",
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["dom-overlay", "bounded-floor", "hit-test"],
        domOverlay: { root: document.body }
      },
      {
        referenceSpaceType: "local",
        requiredFeatures: ["local"],
        optionalFeatures: ["bounded-floor"]
      }
    ];
    let xrSession = null;
    let lastError = null;
    let referenceSpaceType = "local-floor";
    for (const options of requestOptions) {
      try {
        const { referenceSpaceType: nextReferenceSpaceType, ...sessionOptions } = options;
        xrSession = await navigator.xr.requestSession(mode, sessionOptions);
        referenceSpaceType = nextReferenceSpaceType;
        break;
      } catch (requestError) {
        lastError = requestError;
      }
    }
    if (!xrSession) {
      setError(lastError?.message || "WebXR session could not start.");
      return;
    }
    try {
      renderer.xr.enabled = true;
      renderer.xr.setReferenceSpaceType(referenceSpaceType);
      await renderer.xr.setSession(xrSession);
    } catch (setSessionError) {
      await xrSession.end().catch(() => {});
      setError(setSessionError?.message || "WebXR renderer could not attach to the session.");
      return;
    }
    xrSessionRef.current = xrSession;
    xrCalibrationRef.current = { ready: false, basePosition: null, baseQuaternion: null, poseBase: { ...poseRef.current } };
    setXrActive(true);
    setXrMode(mode);
    setStatus(mode === "immersive-ar" ? "WebXR AR pose active" : "WebXR pose active");
    xrSession.addEventListener("end", () => {
      xrSessionRef.current = null;
      xrCalibrationRef.current = { ready: false, basePosition: null, baseQuaternion: null, poseBase: { ...poseRef.current } };
      setXrActive(false);
      setXrMode("");
      setStatus("WebXR pose ended");
    }, { once: true });
  }, [xrSupported.ar, xrSupported.vr]);

  useEffect(() => {
    postEvent("desktop", "viewer-ready", {
      userAgent: navigator.userAgent,
      inviteId,
      cardId,
      bridge: inviteRef.current
    }).catch(() => {});
    pollDesktopEvents();
    return () => {
      if (pollTimerRef.current) window.clearTimeout(pollTimerRef.current);
      streamRef.current?.getTracks?.().forEach((track) => track.stop());
      desktopFpvStreamRef.current = null;
      desktopFpvReadyRef.current = false;
      channelRef.current?.close?.();
      pcRef.current?.close?.();
      videoSenderRef.current = null;
      audioSenderRef.current = null;
      xrSessionRef.current?.end?.().catch(() => {});
    };
  }, [cardId, inviteId, pollDesktopEvents, postEvent]);

  useEffect(() => {
    function handleOrientation(event) {
      if (!orientationRef.current.active) return;
      orientationRef.current = {
        active: true,
        hasSample: true,
        alpha: Number(event.alpha || 0),
        beta: Number(event.beta || 0),
        gamma: Number(event.gamma || 0),
        screenAngle: THREE.MathUtils.radToDeg(screenOrientationRadians())
      };
    }
    window.addEventListener("deviceorientation", handleOrientation, true);
    return () => window.removeEventListener("deviceorientation", handleOrientation, true);
  }, []);

  useEffect(() => {
    const clearTouchControls = () => {
      moveJoystickPointerRef.current = null;
      heightJoystickPointerRef.current = null;
      moveFreezeGestureRef.current = null;
      heightFreezeGestureRef.current = null;
      setJoystickVector({ x: 0, z: 0 });
      setHeightJoystickValue(0);
      setControls({ x: 0, z: 0, y: 0 });
    };
    window.addEventListener("blur", clearTouchControls);
    window.addEventListener("pointercancel", clearTouchControls);
    return () => {
      window.removeEventListener("blur", clearTouchControls);
      window.removeEventListener("pointercancel", clearTouchControls);
    };
  }, [setControls]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.xr.enabled = true;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08121c);
    scene.fog = new THREE.FogExp2(0x102638, 0.045);
    const camera = new THREE.PerspectiveCamera(68, 1, 0.04, 80);
    scene.add(new THREE.HemisphereLight(0xa7f8ff, 0x08070f, 1.15));
    const keyLight = new THREE.PointLight(0x00f3ff, 2.8, 8);
    keyLight.position.set(0, 2.6, 1.4);
    scene.add(keyLight);
    const table = new THREE.Mesh(
      new THREE.PlaneGeometry(7.4, 5.1),
      new THREE.MeshStandardMaterial({ color: 0x09243a, emissive: 0x031421, roughness: 0.72, metalness: 0.08 })
    );
    table.rotation.x = -Math.PI / 2;
    table.position.y = -0.012;
    scene.add(table);
    const grid = new THREE.GridHelper(7.4, 22, 0x00f3ff, 0x21445b);
    grid.position.y = 0;
    scene.add(grid);
    const screenMaterial = new THREE.MeshBasicMaterial({ color: 0x15546a, transparent: true, opacity: 0.66, side: THREE.DoubleSide });
    const backScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(5.75, 3.25),
      screenMaterial.clone()
    );
    backScreen.position.set(0, 2.15, -3.25);
    scene.add(backScreen);
    const leftScreen = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 3.0), screenMaterial.clone());
    leftScreen.position.set(-3.2, 1.82, -1.35);
    leftScreen.rotation.y = Math.PI * 0.34;
    scene.add(leftScreen);
    const rightScreen = leftScreen.clone();
    rightScreen.position.x = 3.2;
    rightScreen.rotation.y = -Math.PI * 0.34;
    scene.add(rightScreen);
    const centerRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.82, 0.018, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0xff6df2, transparent: true, opacity: 0.78 })
    );
    centerRing.rotation.x = -Math.PI / 2;
    centerRing.position.set(0, 0.04, 0.02);
    scene.add(centerRing);
    const deck = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.06, 1.42),
      new THREE.MeshStandardMaterial({ color: 0xf6c96d, emissive: 0x4b3208, roughness: 0.5 })
    );
    deck.position.set(-2.1, 0.05, 1.2);
    scene.add(deck);
    const dock = new THREE.Mesh(
      new THREE.BoxGeometry(2.8, 0.05, 0.72),
      new THREE.MeshStandardMaterial({ color: 0x0abbd0, emissive: 0x003842, roughness: 0.45 })
    );
    dock.position.set(-0.78, 0.035, 2.1);
    scene.add(dock);
    const dropPad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.52, 0.035, 48),
      new THREE.MeshBasicMaterial({ color: 0xff6df2, transparent: true, opacity: 0.42 })
    );
    dropPad.position.set(2.64, 0.025, 1.42);
    scene.add(dropPad);
    const poolPad = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.035, 48),
      new THREE.MeshBasicMaterial({ color: 0x00f3ff, transparent: true, opacity: 0.34 })
    );
    poolPad.position.set(-2.62, 0.025, -1.35);
    scene.add(poolPad);
    for (let index = 0; index < 8; index += 1) {
      const card = new THREE.Mesh(
        new THREE.BoxGeometry(0.42, 0.025, 0.66),
        new THREE.MeshStandardMaterial({
          color: index % 2 ? 0x102a4a : 0x3b1a5c,
          emissive: index % 2 ? 0x001d3b : 0x1b0730,
          roughness: 0.55
        })
      );
      card.position.set(-1.8 + index * 0.46, 0.05 + index * 0.006, 0.78 - Math.abs(index - 3.5) * 0.08);
      card.rotation.y = (index - 3.5) * 0.06;
      scene.add(card);
    }
    const phoneGhost = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.82, 0.035),
      new THREE.MeshBasicMaterial({ color: 0xff6df2, transparent: true, opacity: 0.34 })
    );
    scene.add(phoneGhost);
    const remoteRoot = new THREE.Group();
    remoteRoot.name = "RemoteTarotSceneReplica";
    scene.add(remoteRoot);
    const remote = remoteSceneRef.current;
    remote.root = remoteRoot;
    threeRef.current = { renderer, scene, camera, phoneGhost, remoteRoot };
    if (remote.pendingState) {
      const stats = updateRemoteSceneFromState(threeRef.current, remote, remote.pendingState);
      setRemoteSceneStats({ ...stats, live: true });
    }
    return () => {
      xrSessionRef.current?.end?.().catch(() => {});
      renderer.setAnimationLoop(null);
      renderer.dispose();
      const remoteScene = remoteSceneRef.current;
      remoteScene.cards.forEach(disposeRemoteItem);
      remoteScene.screens.forEach(disposeRemoteItem);
      remoteScene.effects.forEach(disposeRemoteItem);
      remoteScene.cards.clear();
      remoteScene.screens.clear();
      remoteScene.effects.clear();
      remoteScene.root = null;
      scene.traverse((child) => {
        child.geometry?.dispose?.();
        const materials = Array.isArray(child.material) ? child.material : [child.material].filter(Boolean);
        materials.forEach((material) => material.dispose?.());
      });
      threeRef.current = null;
    };
  }, []);

  useEffect(() => {
    let last = performance.now();
    const tick = (timestamp, xrFrame = null) => {
      const now = Number(timestamp || performance.now());
      const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
      last = now;
      const controls = controlsRef.current;
      const orientation = orientationRef.current;
      const pose = { ...poseRef.current };
      const positionFrozen = positionFrozenRef.current;
      const orientationFrozen = orientationFrozenRef.current;
      const three = threeRef.current;
      const xrReferenceSpace = xrFrame && three?.renderer?.xr?.getReferenceSpace?.();
      const xrViewerPose = xrReferenceSpace ? xrFrame.getViewerPose(xrReferenceSpace) : null;

      if (!orientationFrozen && xrViewerPose?.transform) {
        const { orientation: xrOrientation } = xrViewerPose.transform;
        const xrQuaternion = new THREE.Quaternion(xrOrientation.x, xrOrientation.y, xrOrientation.z, xrOrientation.w);
        const calibration = xrCalibrationRef.current;
        if (!calibration.ready) {
          xrCalibrationRef.current = {
            ready: true,
            baseQuaternion: xrQuaternion.clone(),
            poseBase: { ...pose }
          };
        } else {
          const basePose = calibration.poseBase || DEFAULT_PHONE_POSE;
          const relativeQuaternion = calibration.baseQuaternion.clone().invert().multiply(xrQuaternion);
          const finalQuaternion = poseQuaternion(basePose).multiply(relativeQuaternion);
          Object.assign(pose, poseAnglesFromQuaternion(finalQuaternion, pose));
        }
      } else if (!orientationFrozen && orientation.active && orientation.hasSample) {
        const deviceQuaternion = deviceOrientationQuaternion(orientation);
        const calibration = orientationCalibrationRef.current;
        if (!calibration.ready) {
          orientationCalibrationRef.current = {
            ready: true,
            deviceBase: deviceQuaternion.clone(),
            poseBase: { ...pose }
          };
        } else {
          const relativeQuaternion = calibration.deviceBase.clone().invert().multiply(deviceQuaternion);
          const finalQuaternion = poseQuaternion(calibration.poseBase).multiply(relativeQuaternion);
          Object.assign(pose, poseAnglesFromQuaternion(finalQuaternion, pose));
        }
      }

      if (!orientationFrozen) {
        pose.yaw = normalizeAngle(pose.yaw + controls.yaw * dt * 2.35);
        pose.pitch = clamp(pose.pitch + controls.pitch * dt * 1.65, PHONE_PITCH_MIN, PHONE_PITCH_MAX);
      }
      pose.roll = clamp(normalizeAngle(pose.roll), PHONE_ROLL_MIN, PHONE_ROLL_MAX);
      const speed = PHONE_FLIGHT_SPEED;
      const forwardX = -Math.sin(pose.yaw);
      const forwardZ = -Math.cos(pose.yaw);
      const rightX = Math.cos(pose.yaw);
      const rightZ = -Math.sin(pose.yaw);
      const controlDeltaX = (forwardX * controls.z + rightX * controls.x) * speed * dt;
      const controlDeltaZ = (forwardZ * controls.z + rightZ * controls.x) * speed * dt;
      const controlDeltaY = controls.y * speed * dt;
      if (positionFrozen) {
        pose.x = frozenPositionRef.current.x;
        pose.y = frozenPositionRef.current.y;
        pose.z = frozenPositionRef.current.z;
      } else {
        pose.x += controlDeltaX;
        pose.z += controlDeltaZ;
        pose.y += controlDeltaY;
      }
      velocityRef.current = { x: 0, y: 0, z: 0 };
      pose.x = clamp(pose.x, ...PHONE_POSE_LIMITS.x);
      pose.y = clamp(pose.y, ...PHONE_POSE_LIMITS.y);
      pose.z = clamp(pose.z, ...PHONE_POSE_LIMITS.z);
      poseRef.current = pose;
      if (three) {
        const { renderer, scene, camera, phoneGhost } = three;
        phoneGhost.position.set(pose.x, pose.y, pose.z);
        phoneGhost.rotation.set(pose.pitch, pose.yaw, pose.roll, "YXZ");
        if (!desktopFpvReadyRef.current) {
          const rect = renderer.domElement.getBoundingClientRect();
          const width = Math.max(1, Math.floor(rect.width));
          const height = Math.max(1, Math.floor(rect.height));
          if (renderer.domElement.width !== width || renderer.domElement.height !== height) {
            renderer.setSize(width, height, false);
            camera.aspect = width / height;
            camera.updateProjectionMatrix();
          }
          updateRemoteReplicaAnimation(remoteSceneRef.current, dt, now * 0.001);
          if (!xrViewerPose) {
            camera.position.set(pose.x, pose.y + 0.05, pose.z);
            camera.rotation.set(pose.pitch, pose.yaw, pose.roll, "YXZ");
          }
          renderer.render(scene, camera);
        }
      }
      const channel = channelRef.current;
      if (channel?.readyState === "open" && now - lastSendRef.current > 48) {
        lastSendRef.current = now;
        channel.send(JSON.stringify({
          type: "pose",
          pose,
          controls,
          freeze: { position: positionFrozen, orientation: orientationFrozen },
          orientation,
          source: orientationFrozen ? "orientation-frozen" : xrViewerPose ? "webxr" : orientation.active ? "device-orientation" : "flight-controls",
          xrActive: Boolean(xrViewerPose || xrSessionRef.current),
          xrMode,
          fpv,
          cameraFacing: cameraFacingRef.current,
          sentAt: Date.now()
        }));
      }
      setLastPose((current) => {
        if (Math.abs(current.x - pose.x) + Math.abs(current.y - pose.y) + Math.abs(current.z - pose.z) < 0.025) return current;
        return pose;
      });
    };
    const renderer = threeRef.current?.renderer;
    if (renderer) {
      renderer.setAnimationLoop(tick);
      return () => renderer.setAnimationLoop(null);
    }
    const fallbackTick = (time) => {
      tick(time, null);
      rafRef.current = window.requestAnimationFrame(fallbackTick);
    };
    rafRef.current = window.requestAnimationFrame(fallbackTick);
    return () => window.cancelAnimationFrame(rafRef.current);
  }, [fpv, xrMode]);

  return (
    <main ref={rootRef} className="phone-card-mobile" data-connected={connected ? "true" : "false"} data-fpv={fpv ? "true" : "false"} data-xr={xrActive ? "true" : "false"} data-desktop-fpv={desktopFpvReady ? "true" : "false"} data-camera-facing={cameraFacing} data-fullscreen={fullScreenMode ? "true" : "false"} data-position-frozen={freezeState.position ? "true" : "false"} data-orientation-frozen={freezeState.orientation ? "true" : "false"}>
      <section className="phone-card-hero">
        <span className="phone-card-kicker"><Radio size={14} /> Hapa Phone Card</span>
        <h1>Tarot Space Link</h1>
        <p>{status}</p>
        {error && <strong className="phone-card-error">{error}</strong>}
      </section>

      <section className="phone-card-stage">
        <video ref={videoRef} muted playsInline autoPlay className="phone-card-preview" />
        <video ref={desktopFpvVideoRef} playsInline autoPlay className="phone-card-fpv-stream" />
        <canvas ref={canvasRef} className="phone-card-fpv" />
        <div className="phone-card-reticle" aria-hidden="true">
          <span />
          <span />
        </div>
        <div className="phone-card-stage-status">
          <span>{desktopFpvReady ? "Desktop FPV" : xrActive ? `XR ${xrMode.replace("immersive-", "")}` : orientationEnabled ? "Device pose" : "FPV"}</span>
          <code>{lastPose.x.toFixed(1)} / {lastPose.y.toFixed(1)} / {lastPose.z.toFixed(1)}</code>
          <span>{freezeState.position ? "Position frozen" : "Position live"}</span>
          <span>{freezeState.orientation ? "Aim frozen" : "Aim live"}</span>
          <span>{cameraFacing === "user" ? "Front cam" : "Back cam"}</span>
          <span>{remoteSceneStats.live ? `${remoteSceneStats.cards} cards / ${remoteSceneStats.screens} screens / ${remoteSceneStats.effects} fx` : "Scene sync pending"}</span>
          {phoneToolState.status && <span>{phoneToolState.status}</span>}
        </div>
        <div className="phone-card-immersive-bar" aria-live="polite">
          <span>{desktopFpvReady ? "Desktop FPV" : fpv ? "Phone FPV" : "Camera"}</span>
          <code>{lastPose.y.toFixed(1)}m</code>
          <span>{freezeState.position ? "Pos locked" : "Pos live"}</span>
          <span>{freezeState.orientation ? "Aim locked" : "Aim live"}</span>
          <button type="button" onClick={toggleFullScreenMode}>
            <Minimize2 size={15} />
            Exit
          </button>
        </div>
        <div
          ref={moveJoystickPadRef}
          className="phone-card-joystick"
          data-frozen={freezeState.position ? "true" : "false"}
          role="application"
          aria-label={freezeState.position ? "Position joystick, frozen" : "Position joystick"}
          onPointerDown={startJoystick}
          onPointerMove={moveJoystick}
          onPointerUp={stopJoystick}
          onPointerCancel={stopJoystick}
        >
          <span className="phone-card-stick-status">{freezeState.position ? "Position Frozen" : "Move"}</span>
          <div className="phone-card-joystick-ring">
            <div
              className="phone-card-joystick-thumb"
              style={{ transform: `translate(${joystickVector.x * 42}px, ${-joystickVector.z * 42}px)` }}
            />
          </div>
          <span className="phone-card-stick-hint">Hold center</span>
        </div>
        <div
          ref={heightJoystickPadRef}
          className="phone-card-height-joystick"
          data-frozen={freezeState.orientation ? "true" : "false"}
          role="application"
          aria-label={freezeState.orientation ? "Height lever, orientation frozen" : "Height lever"}
          onPointerDown={startHeightJoystick}
          onPointerMove={moveHeightJoystick}
          onPointerUp={stopHeightJoystick}
          onPointerCancel={stopHeightJoystick}
        >
          <span className="phone-card-stick-status">{freezeState.orientation ? "Aim Frozen" : "Height"}</span>
          <div className="phone-card-height-rail">
            <span />
            <div
              className="phone-card-height-thumb"
              style={{ transform: `translateY(${-heightJoystickValue * 46}px)` }}
            />
          </div>
          <span className="phone-card-stick-hint">Hold center</span>
        </div>
      </section>

      <section className="phone-card-actions">
        <button type="button" onClick={startPhoneCard} disabled={!session || mediaReady}>
          {mediaReady ? <Video size={18} /> : <Camera size={18} />}
          {mediaReady ? "Camera Live" : "Join With Camera"}
        </button>
        <button type="button" onClick={() => setFpv((value) => !value)}>
          {fpv ? <Video size={18} /> : <VideoOff size={18} />}
          {fpv ? "FPV On" : "FPV Off"}
        </button>
        <button type="button" onClick={toggleFullScreenMode}>
          {fullScreenMode ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
          {fullScreenMode ? "Exit Full" : "Full Screen"}
        </button>
        <button type="button" onClick={switchCameraFacing} disabled={!mediaReady}>
          <RefreshCw size={18} />
          {cameraFacing === "user" ? "Use Back" : "Use Front"}
        </button>
        <button type="button" onClick={requestOrientation} disabled={orientationEnabled}>
          <Gamepad2 size={18} />
          {orientationEnabled ? "Telemetry On" : "Use Motion"}
        </button>
        <button type="button" onClick={startWebXr} disabled={!xrSupported.checked || (!xrSupported.ar && !xrSupported.vr)}>
          <Gamepad2 size={18} />
          {xrActive ? "Exit XR" : xrSupported.checked ? "WebXR Pose" : "XR Check"}
        </button>
        <button type="button" onClick={resetPose}>
          <RotateCcw size={18} />
          Reset
        </button>
        <button type="button" onClick={() => sendPhoneAction("laser-tag")} disabled={!connected}>
          <Crosshair size={18} />
          {phoneToolState.laserTagged ? "Move Tag" : "Tag"}
        </button>
        <button type="button" onClick={() => sendPhoneAction("tractor-toggle")} disabled={!connected}>
          <Zap size={18} />
          {phoneToolState.tractorActive ? "Drop Beam" : "Tractor"}
        </button>
      </section>

      <footer className="phone-card-telemetry">
        <span>{xrActive ? `XR ${xrMode.replace("immersive-", "")}` : connected ? "Peer connected" : "Waiting for peer"}</span>
        <code>x {lastPose.x.toFixed(2)} y {lastPose.y.toFixed(2)} z {lastPose.z.toFixed(2)} / {cameraFacing} / {remoteSceneStats.videos} live surfaces</code>
      </footer>
    </main>
  );
}
