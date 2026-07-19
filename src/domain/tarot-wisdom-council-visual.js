import * as THREE from "three";

const CYAN = 0x00f3ff;
const GOLD = 0xf6c96d;
const MAGENTA = 0xff6df2;
const MINT = 0x45f2c8;
const VIOLET = 0xa472ff;
const ORANGE = 0xff8a55;
const SEAT_COLORS = [CYAN, GOLD, MAGENTA];
const DISSENT_COLORS = [CYAN, GOLD, MINT, VIOLET, ORANGE];
const CENTER = new THREE.Vector3(0, 2.16, -0.72);
const MINT_NODE_COLORS = [GOLD, CYAN, MINT, MAGENTA];

function glow(color, opacity = 0.8) {
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

function seatPod(index) {
  const color = SEAT_COLORS[index];
  const group = new THREE.Group();
  group.name = `wisdomCouncilSeat${index + 1}`;
  const glass = new THREE.Mesh(new THREE.CapsuleGeometry(0.31, 0.5, 8, 18), glow(color, 0.12));
  glass.material.wireframe = true;
  const card = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.51, 0.035), glow(color, 0.72));
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.35, 0.57, 0.045)), line(GOLD, 0.82));
  const eye = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.012, 7, 28), glow(0xf8f3e7, 0.88));
  eye.position.z = 0.035;
  eye.scale.y = 1.34;
  const blindShield = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.022, 8, 64), glow(color, 0.34));
  blindShield.rotation.x = Math.PI / 2;
  blindShield.scale.y = 0.64;
  group.add(glass, card, frame, eye, blindShield);
  group.scale.setScalar(0.001);
  return { group, glass, card, frame, eye, blindShield, color };
}

function faultLine(index) {
  const angle = -Math.PI * 0.82 + index * (Math.PI * 0.41);
  const start = new THREE.Vector3(0, -0.06, 0.02);
  const mid = new THREE.Vector3(Math.cos(angle) * 0.94, -0.47 + (index % 2) * 0.18, Math.sin(angle) * 0.28);
  const end = new THREE.Vector3(Math.cos(angle) * 1.58, -0.94 + (index % 2) * 0.24, 0.24 + Math.sin(angle) * 0.46);
  const curve = new THREE.CatmullRomCurve3([start, mid, end]);
  const fracture = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(28)), line(DISSENT_COLORS[index], 0));
  const shard = new THREE.Mesh(new THREE.OctahedronGeometry(0.11, 0), glow(DISSENT_COLORS[index], 0));
  shard.position.copy(end);
  return { fracture, shard, curve, color: DISSENT_COLORS[index] };
}

export function createTarotWisdomCouncilRig() {
  const group = new THREE.Group();
  group.name = "tarotWisdomCouncil";
  group.visible = false;
  group.position.copy(CENTER);

  const crown = new THREE.Mesh(new THREE.TorusKnotGeometry(0.43, 0.045, 112, 12, 3, 5), glow(VIOLET, 0.24));
  crown.scale.y = 0.48;
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22, 1), glow(MINT, 0.74));
  const coreCage = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.33, 1)), line(GOLD, 0.66));
  const sealRing = new THREE.Mesh(new THREE.TorusGeometry(0.73, 0.028, 10, 112), glow(GOLD, 0.42));
  sealRing.scale.y = 0.42;
  sealRing.rotation.x = Math.PI / 2;

  const seats = [0, 1, 2].map(seatPod);
  const positions = [
    new THREE.Vector3(-1.18, 0.08, 0.3),
    new THREE.Vector3(0, 0.86, -0.08),
    new THREE.Vector3(1.18, 0.08, 0.3),
  ];
  const beams = seats.map((seat, index) => {
    seat.group.position.copy(positions[index]);
    const curve = new THREE.QuadraticBezierCurve3(positions[index], positions[index].clone().lerp(new THREE.Vector3(), 0.5).add(new THREE.Vector3(0, 0.24, 0.2)), new THREE.Vector3());
    const beam = new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(52)), line(seat.color, 0));
    const packet = new THREE.Mesh(new THREE.OctahedronGeometry(0.055, 0), glow(seat.color, 0));
    group.add(beam, packet);
    return { beam, packet, curve };
  });

  const partitions = [
    new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), glow(CYAN, 0.055)),
    new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.2), glow(MAGENTA, 0.055)),
  ];
  partitions[0].position.set(-0.55, 0.38, 0.18); partitions[0].rotation.y = 0.48;
  partitions[1].position.set(0.55, 0.38, 0.18); partitions[1].rotation.y = -0.48;

  const faultLines = DISSENT_COLORS.map((_, index) => faultLine(index));
  faultLines.forEach(({ fracture, shard }) => group.add(fracture, shard));

  const humanDais = new THREE.Group();
  const daisBase = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.62, 0.17, 6), glow(GOLD, 0.22));
  const humanOrb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), glow(GOLD, 0.9));
  const humanBody = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.42, 6), glow(GOLD, 0.44));
  humanOrb.position.y = 0.33; humanBody.position.y = 0.05;
  const authorityRing = new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.025, 8, 72), glow(GOLD, 0.58));
  authorityRing.rotation.x = Math.PI / 2;
  humanDais.add(daisBase, humanBody, humanOrb, authorityRing);
  humanDais.position.set(0, -0.88, 0.72);
  humanDais.scale.setScalar(0.001);

  const mintGate = new THREE.Group();
  mintGate.name = "wisdomCouncilMintGate";
  mintGate.visible = false;
  const mintRailCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1.66, -0.92, 0.8),
    new THREE.Vector3(-0.72, -0.62, 0.44),
    new THREE.Vector3(0.12, -0.48, 0.24),
    new THREE.Vector3(0.86, -0.68, 0.46),
    new THREE.Vector3(1.66, -0.92, 0.8),
  ]);
  const mintRail = new THREE.Line(new THREE.BufferGeometry().setFromPoints(mintRailCurve.getPoints(96)), line(GOLD, 0.12));
  const authorityDoor = new THREE.Group();
  const authorityOuter = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 10, 72), glow(GOLD, 0.62));
  const authorityInner = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.018, 8, 56), glow(MINT, 0.3));
  authorityOuter.scale.y = 1.28; authorityInner.scale.y = 1.28;
  authorityDoor.position.copy(mintRailCurve.getPoint(0.02));
  authorityDoor.add(authorityOuter, authorityInner);
  const mintNodes = MINT_NODE_COLORS.map((color, index) => {
    const group = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.14, 6), glow(color, 0.18));
    const beacon = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), glow(color, 0.14));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.018, 8, 42), glow(color, 0.16));
    ring.rotation.x = Math.PI / 2; beacon.position.y = 0.18;
    group.position.copy(mintRailCurve.getPoint([0.08, 0.36, 0.64, 0.92][index]));
    group.add(base, beacon, ring);
    mintGate.add(group);
    return { group, base, beacon, ring, color, active: false };
  });
  const proposalToken = new THREE.Group();
  const proposalCard = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.46, 0.045), glow(VIOLET, 0.78));
  const proposalFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.37, 0.52, 0.06)), line(GOLD, 0.92));
  const proposalSeal = new THREE.Mesh(new THREE.IcosahedronGeometry(0.08, 1), glow(GOLD, 0.78));
  proposalSeal.position.z = 0.065;
  proposalToken.add(proposalCard, proposalFrame, proposalSeal);
  proposalToken.position.copy(mintRailCurve.getPoint(0));
  proposalToken.scale.setScalar(0.001);
  const resultPortal = new THREE.Group();
  const resultHalo = new THREE.Mesh(new THREE.TorusKnotGeometry(0.29, 0.025, 72, 10, 2, 3), glow(MINT, 0.46));
  const resultCard = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.54, 0.055), glow(MINT, 0.74));
  const resultFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(0.44, 0.62, 0.07)), line(GOLD, 0.92));
  resultPortal.position.copy(mintRailCurve.getPoint(1));
  resultPortal.add(resultHalo, resultCard, resultFrame);
  resultPortal.scale.setScalar(0.001);
  const mintSparks = Array.from({ length: 18 }, (_, index) => {
    const spark = new THREE.Mesh(new THREE.OctahedronGeometry(0.025 + (index % 3) * 0.008, 0), glow(MINT_NODE_COLORS[index % 4], 0));
    mintGate.add(spark);
    return spark;
  });
  mintGate.add(mintRail, authorityDoor, proposalToken, resultPortal);

  group.add(crown, core, coreCage, sealRing, ...seats.map((seat) => seat.group), ...partitions, humanDais, mintGate);
  return {
    group, crown, core, coreCage, sealRing, seats, positions, beams, partitions, faultLines, humanDais, humanOrb, authorityRing,
    mintGate, mintRail, mintRailCurve, authorityDoor, authorityOuter, authorityInner, mintNodes, proposalToken, proposalCard, proposalFrame, proposalSeal, resultPortal, resultHalo, resultCard, resultFrame, mintSparks,
    state: "idle", seatCount: 0, startedAt: 0, completedAt: 0, dissentCounts: {}, creativeDirectorCount: 0,
    mintState: "idle", mintStartedAt: 0, mintCompletedAt: 0, mintDecision: "", mintProgress: 0,
  };
}

export function beginTarotWisdomCouncil(rig, { seatCount = 3, elapsed = 0 } = {}) {
  if (!rig?.group) return false;
  rig.state = "invoking";
  rig.seatCount = Math.max(1, Math.min(3, Number(seatCount) || 1));
  rig.startedAt = elapsed;
  rig.completedAt = 0;
  rig.dissentCounts = {};
  rig.creativeDirectorCount = 0;
  rig.group.visible = true;
  rig.seats.forEach((seat, index) => {
    seat.group.visible = index < rig.seatCount;
    seat.group.scale.setScalar(0.001);
    seat.card.material.color.setHex(SEAT_COLORS[index]);
  });
  rig.beams.forEach(({ beam, packet }, index) => { beam.visible = index < rig.seatCount; packet.visible = index < rig.seatCount; beam.material.opacity = 0.08; packet.material.opacity = 0.12; });
  rig.faultLines.forEach(({ fracture, shard }) => { fracture.material.opacity = 0; shard.material.opacity = 0; });
  rig.humanDais.scale.setScalar(0.001);
  return true;
}

export function completeTarotWisdomCouncil(rig, { countsByCategory = {}, creativeDirectorCount = 0, elapsed = 0 } = {}) {
  if (!rig?.group) return false;
  rig.state = "sealed";
  rig.completedAt = elapsed;
  rig.dissentCounts = { ...countsByCategory };
  rig.creativeDirectorCount = Math.max(0, Number(creativeDirectorCount) || 0);
  rig.faultLines.forEach(({ fracture, shard }, index) => {
    const key = ["scope", "goal", "evidence", "mechanism", "true-tradeoff"][index];
    const active = Number(rig.dissentCounts[key] || 0) > 0;
    fracture.material.opacity = active ? 0.82 : 0.06;
    shard.material.opacity = active ? 0.96 : 0.08;
  });
  return true;
}

export function failTarotWisdomCouncil(rig, { elapsed = 0 } = {}) {
  if (!rig?.group) return false;
  rig.state = "failed";
  rig.completedAt = elapsed;
  rig.seats.forEach((seat) => seat.card.material.color.setHex(0xff473d));
  rig.beams.forEach(({ beam, packet }) => { beam.material.opacity = 0; packet.material.opacity = 0; });
  rig.faultLines.forEach(({ fracture, shard }) => { fracture.material.opacity = 0; shard.material.opacity = 0; });
  rig.humanDais.scale.setScalar(0.001);
  return true;
}

export function beginTarotProposalReview(rig, { elapsed = 0 } = {}) {
  if (!rig?.mintGate) return false;
  rig.group.visible = true;
  rig.mintGate.visible = true;
  rig.mintState = "reviewing";
  rig.mintDecision = "";
  rig.mintStartedAt = elapsed;
  rig.mintCompletedAt = 0;
  rig.mintProgress = 0;
  rig.proposalToken.position.copy(rig.mintRailCurve.getPoint(0));
  rig.proposalToken.scale.setScalar(0.001);
  rig.resultPortal.scale.setScalar(0.001);
  rig.mintRail.material.opacity = 0.18;
  rig.mintNodes.forEach((node) => { node.active = false; node.beacon.material.opacity = 0.12; node.ring.material.opacity = 0.16; });
  rig.mintSparks.forEach((spark) => { spark.material.opacity = 0; });
  return true;
}

export function recordTarotProposalDecision(rig, { decision = "defer", elapsed = 0 } = {}) {
  if (!rig?.mintGate) return false;
  rig.mintDecision = decision;
  rig.mintStartedAt = elapsed;
  rig.mintState = decision === "approve" ? "minting" : `${decision}_unminted`;
  const color = decision === "approve" ? GOLD : decision === "reject" ? 0xfb7185 : decision === "revise" ? CYAN : VIOLET;
  rig.proposalCard.material.color.setHex(color);
  rig.proposalFrame.material.color.setHex(color);
  rig.authorityOuter.material.color.setHex(color);
  return true;
}

export function completeTarotProposalMint(rig, { elapsed = 0 } = {}) {
  if (!rig?.mintGate) return false;
  rig.mintState = "peer_announced";
  rig.mintDecision = "approve";
  rig.mintCompletedAt = elapsed;
  rig.mintProgress = 1;
  rig.mintNodes.forEach((node) => { node.active = true; node.beacon.material.opacity = 0.96; node.ring.material.opacity = 0.8; });
  return true;
}

export function updateTarotWisdomCouncilRig(rig, { delta = 0, elapsed = 0, gateOpen = false, reducedMotion = false } = {}) {
  if (!rig?.group || (rig.state === "idle" && !rig.mintGate?.visible)) return;
  const age = Math.max(0, elapsed - rig.startedAt);
  const entrance = THREE.MathUtils.smoothstep(Math.min(1, age / (reducedMotion ? 0.25 : 1.35)), 0, 1);
  rig.group.scale.setScalar((0.72 + entrance * 0.28) * (gateOpen ? 1 : 0.62));
  rig.crown.rotation.x = elapsed * 0.16;
  rig.crown.rotation.y = elapsed * -0.24;
  rig.core.rotation.x = elapsed * 0.72;
  rig.core.rotation.y = elapsed * -0.9;
  rig.core.scale.setScalar(0.82 + Math.sin(elapsed * 4.2) * 0.13 + (rig.state === "sealed" ? 0.28 : 0));
  rig.coreCage.rotation.x = elapsed * -0.32;
  rig.coreCage.rotation.z = elapsed * 0.26;
  rig.sealRing.rotation.z = elapsed * 0.42;
  rig.sealRing.material.opacity = 0.24 + entrance * 0.28 + Math.sin(elapsed * 3.1) * 0.08;
  rig.seats.forEach((seat, index) => {
    if (!seat.group.visible) return;
    const local = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, entrance * 1.2 - index * 0.1)), 0, 1);
    seat.group.scale.setScalar(Math.max(0.001, local));
    seat.group.position.y = rig.positions[index].y + Math.sin(elapsed * 1.7 + index * 2.1) * 0.07;
    seat.group.rotation.y = Math.sin(elapsed * 0.72 + index) * 0.16;
    seat.blindShield.rotation.z = elapsed * (index % 2 ? -0.42 : 0.42);
    seat.glass.material.opacity = 0.08 + Math.sin(elapsed * 2.2 + index) * 0.025;
    seat.eye.rotation.z = elapsed * (index % 2 ? -0.54 : 0.54);
  });
  rig.beams.forEach(({ beam, packet, curve }, index) => {
    if (!beam.visible) return;
    beam.material.opacity = rig.state === "sealed" ? 0.78 : 0.18 + Math.sin(elapsed * 2.6 + index) * 0.08;
    packet.material.opacity = rig.state === "failed" ? 0 : 0.88;
    const travel = reducedMotion ? Math.min(1, entrance) : (elapsed * (0.24 + index * 0.025) + index / 3) % 1;
    packet.position.copy(curve.getPoint(travel));
    packet.rotation.x = elapsed * 1.8;
    packet.rotation.y = elapsed * -1.3;
    packet.scale.setScalar(0.72 + Math.sin(elapsed * 5.2 + index) * 0.2);
  });
  if (rig.state === "sealed") {
    rig.faultLines.forEach(({ fracture, shard }, index) => {
      const key = ["scope", "goal", "evidence", "mechanism", "true-tradeoff"][index];
      if (!Number(rig.dissentCounts[key] || 0)) return;
      fracture.material.opacity = 0.5 + Math.sin(elapsed * 3.4 + index) * 0.28;
      shard.rotation.x = elapsed * (0.7 + index * 0.09);
      shard.rotation.y = elapsed * (-0.8 - index * 0.07);
      shard.scale.setScalar(0.88 + Math.sin(elapsed * 4 + index) * 0.2);
    });
    const daisReveal = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, elapsed - rig.completedAt) / (reducedMotion ? 0.2 : 0.9)), 0, 1);
    rig.humanDais.scale.setScalar(rig.creativeDirectorCount ? Math.max(0.001, daisReveal) : 0.001);
    rig.authorityRing.rotation.z = elapsed * -0.42;
    rig.humanOrb.scale.setScalar(0.84 + Math.sin(elapsed * 3.7) * 0.18);
  }
  if (rig.mintGate.visible) {
    const reviewReveal = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, elapsed - rig.mintStartedAt) / (reducedMotion ? 0.18 : 0.72)), 0, 1);
    rig.proposalToken.scale.setScalar(Math.max(0.001, reviewReveal));
    rig.authorityOuter.rotation.z = elapsed * 0.52;
    rig.authorityInner.rotation.z = elapsed * -0.8;
    rig.proposalSeal.rotation.x = elapsed * 1.4;
    rig.proposalSeal.rotation.y = elapsed * -1.1;
    let progress = 0;
    if (rig.mintState === "minting") progress = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, elapsed - rig.mintStartedAt) / (reducedMotion ? 0.8 : 4.2)), 0, 1);
    if (rig.mintState === "peer_announced") progress = 1;
    rig.mintProgress = progress;
    if (["minting", "peer_announced"].includes(rig.mintState)) {
      rig.proposalToken.position.copy(rig.mintRailCurve.getPoint(progress));
      rig.proposalToken.rotation.y = Math.sin(progress * Math.PI * 4) * 0.32;
      rig.proposalToken.rotation.z = Math.sin(progress * Math.PI) * -0.18;
      rig.mintRail.material.opacity = 0.38 + progress * 0.58;
      rig.mintNodes.forEach((node, index) => {
        const threshold = [0.05, 0.32, 0.6, 0.87][index];
        node.active = progress >= threshold;
        node.beacon.material.opacity = node.active ? 0.92 : 0.1;
        node.ring.material.opacity = node.active ? 0.66 + Math.sin(elapsed * 4 + index) * 0.18 : 0.12;
        node.beacon.scale.setScalar(node.active ? 0.9 + Math.sin(elapsed * 5.2 + index) * 0.22 : 0.62);
        node.ring.rotation.z = elapsed * (index % 2 ? -0.68 : 0.68);
      });
      rig.mintSparks.forEach((spark, index) => {
        const local = (progress + index / rig.mintSparks.length * 0.24) % 1;
        spark.position.copy(rig.mintRailCurve.getPoint(local));
        spark.position.y += Math.sin(elapsed * 4 + index) * 0.12;
        spark.material.opacity = progress > 0.02 ? 0.28 + Math.sin(elapsed * 5 + index) * 0.22 : 0;
      });
      const resultReveal = THREE.MathUtils.smoothstep(Math.min(1, Math.max(0, progress - 0.72) / 0.28), 0, 1);
      rig.resultPortal.scale.setScalar(Math.max(0.001, resultReveal * (0.96 + Math.sin(elapsed * 4.8) * 0.06)));
      rig.resultHalo.rotation.x = elapsed * 0.6;
      rig.resultHalo.rotation.y = elapsed * -0.84;
    } else {
      rig.proposalToken.position.copy(rig.mintRailCurve.getPoint(0));
      rig.proposalToken.position.y += Math.sin(elapsed * 2.4) * 0.06;
    }
  }
}

export function disposeTarotWisdomCouncilRig(rig) {
  if (!rig?.group) return;
  dispose(rig.group);
  rig.group.removeFromParent();
}
