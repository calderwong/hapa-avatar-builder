import * as THREE from "three";

const GATE_CENTER = new THREE.Vector3(0, 1.38, -0.78);
const FAMILY_ORDER = Object.freeze([
  "placement", "consent", "comment", "communication", "peer",
  "gate", "build", "council", "proposal", "mint"
]);

function slotForFamily(family = "placement") {
  const index = Math.max(0, FAMILY_ORDER.indexOf(family));
  const angle = Math.PI * (0.12 + (index / Math.max(1, FAMILY_ORDER.length - 1)) * 0.76);
  const radiusX = 2.05;
  const radiusY = 1.18;
  return new THREE.Vector3(
    Math.cos(angle) * radiusX,
    0.52 + Math.sin(angle) * radiusY,
    -0.98 - Math.sin(angle) * 0.22
  );
}

function additive(color, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function lineMaterial(color, opacity = 0.45) {
  return new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
}

function createCore(cue) {
  const color = cue.color;
  const accent = cue.accent;
  const group = new THREE.Group();
  group.name = `spatialTruthCore:${cue.family}`;
  let primary;

  if (cue.geometry === "ledger-spire") {
    primary = new THREE.Mesh(new THREE.OctahedronGeometry(0.14, 0), additive(color, 0.9));
    primary.scale.set(0.74, 2.2, 0.74);
    const pages = [0, 1, 2].map((index) => {
      const page = new THREE.Mesh(new THREE.BoxGeometry(0.2 + index * 0.05, 0.016, 0.12), additive(index % 2 ? accent : color, 0.64));
      page.position.y = -0.16 + index * 0.15;
      page.rotation.y = index * 0.5;
      return page;
    });
    group.add(primary, ...pages);
  } else if (cue.geometry === "wisdom-triad") {
    const triad = [0, 1, 2].map((index) => {
      const node = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), additive(index === 1 ? accent : color, 0.9));
      const angle = -Math.PI / 2 + index * Math.PI * 2 / 3;
      node.position.set(Math.cos(angle) * 0.18, Math.sin(angle) * 0.18, 0);
      node.userData.phase = index / 3;
      return node;
    });
    primary = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.012, 8, 48), additive(accent, 0.64));
    group.add(primary, ...triad);
  } else if (cue.geometry === "candidate-ghost") {
    primary = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.018), additive(color, 0.58));
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.012, 8, 48), additive(accent, 0.62));
    frame.scale.y = 1.32;
    group.add(primary, frame);
  } else if (cue.geometry === "authority-seal") {
    primary = new THREE.Mesh(new THREE.DodecahedronGeometry(0.14, 0), additive(color, 0.94));
    const rings = [0.2, 0.27, 0.34].map((radius, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012 - index * 0.002, 8, 64), additive(index === 1 ? accent : color, 0.72));
      ring.rotation.set(index === 1 ? Math.PI / 2 : 0, index === 2 ? Math.PI / 2 : 0, index * 0.45);
      return ring;
    });
    group.add(primary, ...rings);
  } else if (cue.geometry === "lock-iris") {
    primary = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), additive(accent, 0.9));
    const rings = [0.19, 0.28].map((radius, index) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012, 8, 48), additive(index ? color : accent, 0.76));
      ring.rotation.y = index ? Math.PI / 2 : 0;
      return ring;
    });
    group.add(primary, ...rings);
  } else if (cue.geometry === "identity-orbit") {
    primary = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), additive(color, 0.86));
    const peers = [0, 1].map((index) => {
      const peer = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), additive(index ? accent : color, 0.94));
      peer.userData.phase = index * Math.PI;
      return peer;
    });
    group.add(primary, ...peers);
  } else if (cue.geometry === "comet") {
    primary = new THREE.Mesh(new THREE.TetrahedronGeometry(0.13, 0), additive(color, 0.92));
    const tail = [0, 1, 2, 3].map((index) => {
      const particle = new THREE.Mesh(new THREE.SphereGeometry(0.035 - index * 0.004, 8, 6), additive(index % 2 ? accent : color, 0.74 - index * 0.1));
      particle.position.x = -0.12 - index * 0.09;
      return particle;
    });
    group.add(primary, ...tail);
  } else if (cue.geometry === "lineage-arc") {
    primary = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), additive(color, 0.9));
    const nodes = Array.from({ length: 5 }, (_, index) => {
      const node = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), additive(index % 2 ? accent : color, 0.78));
      node.position.set((index - 2) * 0.1, Math.sin(index / 4 * Math.PI) * 0.14, 0);
      return node;
    });
    group.add(primary, ...nodes);
  } else if (cue.geometry === "aperture") {
    primary = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 12, 64), additive(color, 0.9));
    const horizon = new THREE.Mesh(new THREE.CircleGeometry(0.16, 48), additive(accent, 0.34));
    group.add(primary, horizon);
  } else {
    primary = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), additive(color, 0.9));
    const ripple = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.012, 8, 48), additive(accent, 0.64));
    group.add(primary, ripple);
  }

  group.userData.primary = primary;
  return group;
}

function createCommitmentRail(start, color) {
  const control = start.clone().lerp(GATE_CENTER, 0.54).add(new THREE.Vector3(0, 0.25, 0.08));
  const curve = new THREE.QuadraticBezierCurve3(start, control, GATE_CENTER);
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(36));
  const line = new THREE.Line(geometry, lineMaterial(color, 0.36));
  const packet = new THREE.Mesh(new THREE.OctahedronGeometry(0.04, 0), additive(color, 0.94));
  return { line, packet, curve };
}

export function createTarotSpatialTruthRig() {
  const group = new THREE.Group();
  group.name = "tarotSpatialTruthConstellation";
  group.visible = false;
  return {
    group,
    cues: [],
    accepted: 0,
    lastFamily: null
  };
}

export function emitTarotSpatialTruthCue(rig, cue, elapsed = 0) {
  if (!rig?.group || !cue?.cueId) return null;
  if (rig.cues.some((entry) => entry.cue.cueId === cue.cueId)) return null;
  const anchor = slotForFamily(cue.family);
  const root = new THREE.Group();
  root.name = cue.cueId;
  root.position.copy(anchor);
  root.scale.setScalar(0.001);
  const core = createCore(cue);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.008, 8, 72), additive(cue.accent, 0.46));
  halo.rotation.x = Math.PI / 2;
  const { line, packet, curve } = createCommitmentRail(anchor.clone(), cue.color);
  rig.group.add(line, packet);
  root.add(core, halo);
  rig.group.add(root);
  rig.group.visible = true;
  const entry = { cue, root, core, halo, line, packet, curve, bornAt: elapsed, life: 0 };
  rig.cues.push(entry);
  rig.accepted += 1;
  rig.lastFamily = cue.family;
  return entry;
}

export function updateTarotSpatialTruthRig(rig, { delta = 0, elapsed = 0, gateOpen = false, reducedMotion = false } = {}) {
  if (!rig?.group) return;
  rig.group.visible = rig.cues.length > 0;
  rig.cues.forEach((entry, index) => {
    entry.life += delta;
    const arrivalDuration = reducedMotion ? 0.22 : 1.35;
    const arrival = THREE.MathUtils.smoothstep(Math.min(1, entry.life / arrivalDuration), 0, 1);
    const heroDamp = entry.cue.family === "gate" ? 0.9 : 0.72;
    const gateGain = gateOpen ? 1 : 0.62;
    entry.root.scale.setScalar(arrival * heroDamp * gateGain);
    entry.root.position.y += Math.sin(elapsed * (0.8 + index * 0.03) + index) * 0.0005;
    entry.root.rotation.y = elapsed * (0.12 + index * 0.007) * (index % 2 ? -1 : 1);
    entry.core.rotation.z = elapsed * (0.26 + index * 0.018);
    entry.core.rotation.y = elapsed * (0.34 + index * 0.014) * (index % 2 ? -1 : 1);
    entry.halo.rotation.z = elapsed * (index % 2 ? -0.44 : 0.38);
    entry.halo.scale.setScalar(0.82 + Math.sin(elapsed * 2.5 + index) * 0.12);
    entry.halo.material.opacity = 0.22 + arrival * 0.3 + Math.sin(elapsed * 2.2 + index) * 0.08;
    entry.line.material.opacity = 0.12 + arrival * (gateOpen ? 0.32 : 0.16);
    const travel = reducedMotion ? 0.92 : (elapsed * (0.12 + index * 0.006) + index / Math.max(1, rig.cues.length)) % 1;
    entry.packet.position.copy(entry.curve.getPoint(travel));
    entry.packet.rotation.x = elapsed * 1.7;
    entry.packet.rotation.y = elapsed * 1.2;
    entry.packet.scale.setScalar(0.7 + arrival * 0.5 + Math.sin(elapsed * 4 + index) * 0.12);
  });
}

export function clearTarotSpatialTruthRig(rig) {
  if (!rig?.group) return;
  rig.cues.forEach((entry) => {
    for (const object of [entry.root, entry.line, entry.packet]) {
      object.traverse?.((child) => {
        child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
        else child.material?.dispose?.();
      });
      object.removeFromParent();
    }
  });
  rig.cues = [];
  rig.accepted = 0;
  rig.lastFamily = null;
  rig.group.visible = false;
}
