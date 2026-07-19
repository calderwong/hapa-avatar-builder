import * as THREE from "three";

const CENTER = new THREE.Vector3(0, 1.32, -0.58);
const CYAN = 0x00f3ff;
const GOLD = 0xf6c96d;
const MAGENTA = 0xff6df2;
const MINT = 0x45f2c8;

function additive(color, opacity = 0.8) {
  return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

function line(color, opacity = 0.5) {
  return new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending });
}

function dispose(object) {
  object?.traverse?.((child) => {
    child.geometry?.dispose?.();
    if (Array.isArray(child.material)) child.material.forEach((material) => material?.dispose?.());
    else child.material?.dispose?.();
  });
}

function cardGlyph(color, index) {
  const group = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.25, 0.018), additive(color, 0.78));
  const rune = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.008, 6, 20), additive(index % 2 ? GOLD : CYAN, 0.92));
  rune.position.z = 0.018;
  rune.scale.y = 1.3;
  group.add(plate, rune);
  return group;
}

export function createTarotContextForgeRig() {
  const group = new THREE.Group();
  group.name = "tarotContextForge";
  group.visible = false;

  const prism = new THREE.Mesh(new THREE.IcosahedronGeometry(0.28, 1), additive(CYAN, 0.42));
  const inner = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 0), additive(GOLD, 0.84));
  const cage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.DodecahedronGeometry(0.39, 0)), line(MINT, 0.62));
  const rings = [0.44, 0.56, 0.7].map((radius, index) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.012 - index * 0.002, 8, 96), additive([CYAN, GOLD, MAGENTA][index], 0.52));
    ring.rotation.set(index === 1 ? Math.PI / 2 : 0.25, index === 2 ? Math.PI / 2 : 0, index * 0.66);
    return ring;
  });
  const seal = new THREE.Mesh(new THREE.TorusGeometry(0.84, 0.028, 10, 112), additive(GOLD, 0.6));
  seal.scale.y = 0.42;
  seal.rotation.x = Math.PI / 2;
  const proposal = new THREE.Group();
  const proposalPlate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.68, 0.035), additive(MAGENTA, 0.2));
  proposalPlate.material.wireframe = true;
  const proposalFrame = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.014, 8, 64), additive(GOLD, 0.84));
  proposalFrame.scale.y = 1.22;
  proposal.add(proposalPlate, proposalFrame);
  proposal.position.set(0, 0.18, 0.12);
  proposal.scale.setScalar(0.001);
  group.position.copy(CENTER);
  group.add(prism, inner, cage, ...rings, seal, proposal);

  return {
    group, prism, inner, cage, rings, seal, proposal, proposalPlate, proposalFrame,
    glyphs: [], rails: [], packets: [], state: "idle", mode: "deterministic_scaffold",
    startedAt: 0, completedAt: 0, sourceCount: 0, packetDigest: "", runDigest: "",
  };
}

export function beginTarotContextForge(rig, { sourceCount = 1, mode = "deterministic_scaffold", elapsed = 0 } = {}) {
  if (!rig?.group) return false;
  clearTarotContextForgeSources(rig);
  rig.state = "sealing";
  rig.mode = mode;
  rig.startedAt = elapsed;
  rig.completedAt = 0;
  rig.sourceCount = Math.max(1, Math.min(8, Number(sourceCount) || 1));
  rig.packetDigest = "";
  rig.runDigest = "";
  rig.group.visible = true;
  rig.proposal.scale.setScalar(0.001);
  rig.proposalPlate.material.color.setHex(mode === "ollama_local" ? MAGENTA : MINT);
  for (let index = 0; index < rig.sourceCount; index += 1) {
    const angle = -Math.PI * 0.84 + (index / Math.max(1, rig.sourceCount - 1)) * Math.PI * 0.68;
    const start = new THREE.Vector3(Math.cos(angle) * 2.2, -0.72 + Math.sin(index * 1.7) * 0.08, 0.72 + Math.sin(angle) * 0.38);
    const glyph = cardGlyph(index % 2 ? GOLD : CYAN, index);
    glyph.position.copy(start);
    glyph.userData.start = start.clone();
    glyph.userData.phase = index / rig.sourceCount;
    const control = start.clone().lerp(new THREE.Vector3(0, 0, 0), 0.48).add(new THREE.Vector3(0, 0.62 + index * 0.025, -0.12));
    const curve = new THREE.QuadraticBezierCurve3(start, control, new THREE.Vector3(0, 0, 0));
    const rail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(44)), line(index % 2 ? GOLD : CYAN, 0.44));
    const packet = new THREE.Mesh(new THREE.OctahedronGeometry(0.045, 0), additive(index % 2 ? GOLD : CYAN, 0.96));
    rig.group.add(rail, packet, glyph);
    rig.glyphs.push(glyph);
    rig.rails.push({ rail, curve });
    rig.packets.push(packet);
  }
  return true;
}

export function setTarotContextForgeStage(rig, { state, packetDigest = "", runDigest = "", elapsed = 0 } = {}) {
  if (!rig?.group) return false;
  rig.state = state || rig.state;
  rig.packetDigest = packetDigest || rig.packetDigest;
  rig.runDigest = runDigest || rig.runDigest;
  if (["proposal", "scaffold", "failed"].includes(rig.state)) rig.completedAt = elapsed;
  if (rig.state === "invoking") rig.proposalPlate.material.color.setHex(MAGENTA);
  if (rig.state === "scaffold") rig.proposalPlate.material.color.setHex(MINT);
  if (rig.state === "proposal") rig.proposalPlate.material.color.setHex(MAGENTA);
  if (rig.state === "failed") rig.proposalPlate.material.color.setHex(0xff473d);
  rig.group.visible = rig.state !== "idle";
  return true;
}

export function updateTarotContextForgeRig(rig, { delta = 0, elapsed = 0, gateOpen = false, reducedMotion = false } = {}) {
  if (!rig?.group || rig.state === "idle") return;
  const age = Math.max(0, elapsed - rig.startedAt);
  const sealDuration = reducedMotion ? 0.35 : 2.2;
  const sealProgress = THREE.MathUtils.smoothstep(Math.min(1, age / sealDuration), 0, 1);
  const active = gateOpen ? 1 : 0.62;
  rig.group.scale.setScalar((0.72 + sealProgress * 0.28) * active);
  rig.prism.rotation.x = elapsed * 0.34;
  rig.prism.rotation.y = elapsed * -0.48;
  rig.inner.rotation.x = elapsed * -0.8;
  rig.inner.rotation.y = elapsed * 1.1;
  rig.inner.scale.setScalar(0.86 + Math.sin(elapsed * 4.4) * 0.16 + (["invoking", "proposal"].includes(rig.state) ? 0.22 : 0));
  rig.cage.rotation.y = elapsed * 0.22;
  rig.cage.rotation.z = elapsed * -0.18;
  rig.rings.forEach((ring, index) => {
    ring.rotation.z += delta * (0.32 + index * 0.16) * (index % 2 ? -1 : 1);
    ring.material.opacity = 0.26 + sealProgress * 0.34 + Math.sin(elapsed * 2.4 + index) * 0.08;
  });
  rig.seal.rotation.z = elapsed * 0.38;
  rig.seal.scale.setScalar(0.86 + Math.sin(elapsed * 3.2) * 0.08 + (["sealed", "invoking", "proposal", "scaffold"].includes(rig.state) ? 0.16 : 0));
  rig.glyphs.forEach((glyph, index) => {
    const local = Math.max(0, Math.min(1, sealProgress * 1.22 - index * 0.045));
    glyph.position.copy(glyph.userData.start).lerp(new THREE.Vector3(0, 0, 0), local * 0.82);
    glyph.rotation.y = elapsed * (0.5 + index * 0.04) * (index % 2 ? -1 : 1);
    glyph.scale.setScalar(0.78 + (1 - local) * 0.22 + Math.sin(elapsed * 3 + index) * 0.05);
    rig.rails[index].rail.material.opacity = 0.18 + sealProgress * 0.42;
    const travel = reducedMotion ? sealProgress : (elapsed * (0.18 + index * 0.012) + glyph.userData.phase) % 1;
    rig.packets[index].position.copy(rig.rails[index].curve.getPoint(travel));
    rig.packets[index].rotation.x = elapsed * 1.8;
    rig.packets[index].rotation.y = elapsed * -1.4;
    rig.packets[index].scale.setScalar(0.7 + Math.sin(elapsed * 5 + index) * 0.2);
  });
  const reveal = ["proposal", "scaffold", "failed"].includes(rig.state)
    ? THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, elapsed - rig.completedAt) / (reducedMotion ? 0.2 : 1.15)), 0, 1)
    : 0;
  rig.proposal.scale.setScalar(Math.max(0.001, reveal * (rig.state === "failed" ? 0.72 : 1)));
  rig.proposal.position.y = 0.18 + reveal * 0.78 + Math.sin(elapsed * 2.4) * 0.035;
  rig.proposal.rotation.y = elapsed * -0.18;
  rig.proposalFrame.rotation.z = elapsed * 0.42;
  rig.proposalFrame.material.opacity = 0.46 + reveal * 0.4 + Math.sin(elapsed * 3.5) * 0.08;
}

export function clearTarotContextForgeSources(rig) {
  if (!rig?.group) return;
  [...rig.glyphs, ...rig.rails.map((item) => item.rail), ...rig.packets].forEach((object) => {
    dispose(object);
    object.removeFromParent();
  });
  rig.glyphs = [];
  rig.rails = [];
  rig.packets = [];
}

export function disposeTarotContextForgeRig(rig) {
  if (!rig?.group) return;
  clearTarotContextForgeSources(rig);
  dispose(rig.group);
  rig.group.removeFromParent();
}
