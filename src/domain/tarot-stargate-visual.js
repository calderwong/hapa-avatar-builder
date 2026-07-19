import * as THREE from "three";

const GATE_CENTER = Object.freeze({ x: 0, y: 1.38, z: -0.78 });
const GATE_TABLE_CENTER = Object.freeze({ x: 0, y: 0.09, z: -0.62 });
const GATE_PALETTE = Object.freeze([0xff5b6e, 0xf6c96d, 0x00f3ff, 0x45f2c8, 0xff6df2, 0x7aa7ff, 0xa472ff, 0xf8f3e7]);
const STATE_COLORS = Object.freeze({
  dormant: 0x1d4054,
  arranging: 0x6aa7bd,
  needs_identity: 0xff7448,
  ready: 0xf6c96d,
  dialing: 0x00f3ff,
  active: 0x45f2c8,
  sealing: 0xf6c96d,
  connected: 0x45f2c8,
  stale: 0xffb347,
  expired: 0x7b8794,
  disconnected: 0x7aa7ff
});

function materialOpacity(material, opacity) {
  if (!material) return;
  material.transparent = true;
  material.opacity = THREE.MathUtils.clamp(opacity, 0, 1);
}

function gateLabelTexture(label, accent = "#00f3ff") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, "rgba(2, 6, 23, 0)");
  gradient.addColorStop(0.12, "rgba(2, 6, 23, 0.92)");
  gradient.addColorStop(0.88, "rgba(2, 6, 23, 0.92)");
  gradient.addColorStop(1, "rgba(2, 6, 23, 0)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 18, canvas.width, 124);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(36, 22);
  ctx.lineTo(476, 22);
  ctx.moveTo(36, 138);
  ctx.lineTo(476, 138);
  ctx.stroke();
  ctx.shadowColor = accent;
  ctx.shadowBlur = 24;
  ctx.fillStyle = "#f8f3e7";
  ctx.font = "900 48px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 256, 82);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function gateGlyphTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, 1024, 1024);
  ctx.translate(512, 512);
  ctx.lineCap = "round";
  for (let ring = 0; ring < 5; ring += 1) {
    ctx.strokeStyle = ring % 2 ? "rgba(246,201,109,.42)" : "rgba(0,243,255,.36)";
    ctx.lineWidth = ring === 4 ? 6 : 3;
    ctx.setLineDash(ring % 2 ? [18 + ring * 3, 12] : [7, 15 + ring * 2]);
    ctx.lineDashOffset = ring * 13;
    ctx.beginPath();
    ctx.arc(0, 0, 212 + ring * 46, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (let index = 0; index < 24; index += 1) {
    const angle = (index / 24) * Math.PI * 2;
    const inner = 328 + (index % 3) * 10;
    const outer = inner + 34 + (index % 4) * 7;
    ctx.strokeStyle = index % 4 === 0 ? "rgba(246,201,109,.78)" : "rgba(142,247,255,.52)";
    ctx.lineWidth = index % 4 === 0 ? 7 : 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function createEventHorizonMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uOpen: { value: 0 },
      uEnergy: { value: 0 },
      uStateColor: { value: new THREE.Color(0x00f3ff) }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      precision highp float;
      varying vec2 vUv;
      uniform float uTime;
      uniform float uOpen;
      uniform float uEnergy;
      uniform vec3 uStateColor;

      float hash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
      }

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x);
        float rim = smoothstep(1.0, 0.86, r) * smoothstep(0.74, 0.94, r);
        float membrane = smoothstep(1.0, 0.12, r);
        float spiralA = 0.5 + 0.5 * sin(19.0 * r - 5.0 * a - uTime * 2.2);
        float spiralB = 0.5 + 0.5 * sin(31.0 * r + 3.0 * a + uTime * 1.35);
        float caustic = pow(max(spiralA * spiralB, 0.0), 1.7);
        float core = exp(-r * r * 8.5);
        float grain = hash(floor((p + uTime * 0.012) * 90.0));
        vec3 deep = vec3(0.006, 0.018, 0.06);
        vec3 cyan = mix(vec3(0.0, 0.44, 0.72), uStateColor, 0.62);
        vec3 magenta = vec3(0.78, 0.12, 0.74);
        vec3 gold = vec3(1.0, 0.72, 0.28);
        vec3 color = deep;
        color += cyan * (0.18 + caustic * 0.72) * membrane;
        color += magenta * spiralB * (1.0 - r) * 0.22;
        color += gold * rim * (0.32 + uEnergy * 0.54);
        color += cyan * core * (0.18 + uEnergy * 0.5);
        color += grain * 0.022;
        float alpha = smoothstep(1.02, 0.96, r) * uOpen * (0.74 + uEnergy * 0.2);
        gl_FragColor = vec4(color, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
}

function createGateParticles(count = 180) {
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const radius = 1.1 + ((index * 37) % 101) / 101 * 1.45;
    const angle = (index * 2.3999632297) % (Math.PI * 2);
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = -0.06 + ((index * 17) % 23) / 23 * 0.24;
    const color = new THREE.Color(GATE_PALETTE[index % GATE_PALETTE.length]);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.025,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    sizeAttenuation: true
  });
  return new THREE.Points(geometry, material);
}

function createConstellation() {
  const count = 34;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const angle = (index * 2.3999632297) % (Math.PI * 2);
    const radius = 0.08 + ((index * 29) % 97) / 97 * 0.72;
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = Math.sin(angle) * radius;
    positions[index * 3 + 2] = -0.08 - (index % 5) * 0.012;
    const color = new THREE.Color(index % 7 === 0 ? 0xf6c96d : index % 3 === 0 ? 0xff6df2 : 0x8ef7ff);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.034,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
}

function createPortalDepthTunnel(count = 9) {
  const root = new THREE.Group();
  root.name = "stargatePortalDepthTunnel";
  const rings = Array.from({ length: count }, (_, index) => {
    const color = index % 3 === 0 ? 0xf6c96d : index % 2 === 0 ? 0xff6df2 : 0x00f3ff;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.79 - index * 0.025, 0.008 + (index % 3) * 0.002, 8, 96),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.name = `stargatePortalDepthRing${index + 1}`;
    ring.position.z = -0.02 - index * 0.075;
    ring.userData.phase = index / count;
    root.add(ring);
    return ring;
  });
  root.userData.rings = rings;
  return root;
}

function createGateShockwaves(count = 3) {
  const root = new THREE.Group();
  root.name = "stargateApertureShockwaves";
  root.position.z = 0.155;
  const rings = Array.from({ length: count }, (_, index) => {
    const color = index === 0 ? 0xf6c96d : index === 1 ? 0x00f3ff : 0xff6df2;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.92, 0.012 - index * 0.002, 8, 112),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    ring.name = `stargateApertureShockwave${index + 1}`;
    ring.userData.phase = index / count;
    root.add(ring);
    return ring;
  });
  root.userData.rings = rings;
  return root;
}

function createBeam(index) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(12 * 3), 3));
  const color = GATE_PALETTE[index % GATE_PALETTE.length];
  const outer = new THREE.Line(geometry, new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  }));
  outer.name = `stargateEnergyRibbon${index + 1}`;
  outer.userData.slotIndex = index;
  outer.userData.phase = index * 0.73;
  const spark = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.045, 1),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  spark.name = `stargateTransferSpark${index + 1}`;
  outer.add(spark);
  outer.userData.spark = spark;
  return outer;
}

function createGateSlot(index) {
  const root = new THREE.Group();
  root.name = `stargateSlot${index + 1}`;
  root.userData.stargateSlotIndex = index;
  const color = GATE_PALETTE[index % GATE_PALETTE.length];
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.47, 0.515, 48),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.018;
  const bracket = new THREE.Mesh(
    new THREE.TorusGeometry(0.53, 0.018, 8, 28, Math.PI * 1.55),
    new THREE.MeshStandardMaterial({ color: 0x182b3c, roughness: 0.26, metalness: 0.82, emissive: color, emissiveIntensity: 0.3, transparent: true, opacity: 0 })
  );
  bracket.rotation.x = Math.PI / 2;
  bracket.rotation.z = -Math.PI * 0.28;
  bracket.position.y = 0.026;
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.32, 0.12),
    new THREE.MeshBasicMaterial({ map: gateLabelTexture(String(index + 1).padStart(2, "0"), `#${new THREE.Color(color).getHexString()}`), transparent: true, opacity: 0, depthWrite: false })
  );
  label.position.set(0, 0.16, 0.45);
  label.rotation.x = -Math.PI * 0.22;
  // The luminous ring is intentionally thin. Give it a generous invisible
  // interaction surface so a held Card can actually be dropped into the slot.
  const hitArea = new THREE.Mesh(
    new THREE.CircleGeometry(0.62, 32),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide })
  );
  hitArea.name = `stargateSlotHitArea${index + 1}`;
  hitArea.rotation.x = -Math.PI / 2;
  hitArea.position.y = 0.055;
  hitArea.userData.stargateSlotIndex = index;
  root.add(ring, bracket, label, hitArea);
  root.userData.refs = { ring, bracket, label, hitArea };
  return root;
}

function createPeerPresence(label, color, side) {
  const root = new THREE.Group();
  root.name = `stargatePeerPresence${label}`;
  root.position.set(side * 0.62, 2.03, -0.38);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(0.33, 64),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  glow.position.z = -0.025;
  const outer = new THREE.Mesh(
    new THREE.TorusGeometry(0.3, 0.022, 10, 72),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  const inner = new THREE.Mesh(
    new THREE.TorusGeometry(0.2, 0.012, 8, 56),
    new THREE.MeshBasicMaterial({ color: 0xf6c96d, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  inner.position.z = 0.015;
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.085, 1),
    new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  core.position.z = 0.03;
  const labelPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.86, 0.27),
    new THREE.MeshBasicMaterial({ map: gateLabelTexture(label.toUpperCase(), `#${new THREE.Color(color).getHexString()}`), transparent: true, opacity: 0, depthWrite: false })
  );
  labelPlane.position.set(0, -0.47, 0.02);
  root.add(glow, outer, inner, core, labelPlane);
  root.userData.refs = { glow, outer, inner, core, label: labelPlane };
  root.userData.side = side;
  return root;
}

function createPeerRail(side, color) {
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(side * 4.1, 0.72, 0.5),
    new THREE.Vector3(side * 3.0, 1.7, 0.14),
    new THREE.Vector3(side * 2.12, 1.08, -0.18),
    new THREE.Vector3(side * 0.68, 2.03, -0.38)
  ]);
  const points = curve.getPoints(72);
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  line.name = `stargatePeerSignatureRail${side < 0 ? "Aurora" : "Beacon"}`;
  const packets = Array.from({ length: 4 }, (_, index) => {
    const packet = new THREE.Mesh(
      new THREE.OctahedronGeometry(index === 0 ? 0.075 : 0.045, 0),
      new THREE.MeshBasicMaterial({ color: index === 0 ? 0xf6c96d : color, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    line.add(packet);
    return packet;
  });
  line.userData.curve = curve;
  line.userData.packets = packets;
  line.userData.side = side;
  return line;
}

export function tarotStargateSlotPosition(index, count, target = new THREE.Vector3()) {
  const safeCount = Math.max(2, Math.min(8, Number(count) || 2));
  if (safeCount <= 4) {
    const spacing = safeCount === 4 ? 1.08 : 1.18;
    const x = (index - (safeCount - 1) / 2) * spacing;
    const z = 0.24 + Math.abs(index - (safeCount - 1) / 2) * 0.06;
    return target.set(x, 0.16, z);
  }
  const firstRow = Math.ceil(safeCount / 2);
  const row = index < firstRow ? 0 : 1;
  const rowIndex = row === 0 ? index : index - firstRow;
  const rowCount = row === 0 ? firstRow : safeCount - firstRow;
  const spacing = rowCount > 3 ? 1.0 : 1.16;
  return target.set((rowIndex - (rowCount - 1) / 2) * spacing, 0.16, row === 0 ? 0.58 : -0.04);
}

export function createTarotStargateRig() {
  const root = new THREE.Group();
  root.name = "tarotStargateRig";
  root.visible = false;
  root.scale.setScalar(0.001);

  const base = new THREE.Group();
  base.name = "stargateTableSeal";
  base.position.set(GATE_TABLE_CENTER.x, GATE_TABLE_CENTER.y, GATE_TABLE_CENTER.z);
  const sealMaterial = new THREE.MeshBasicMaterial({
    map: gateGlyphTexture(),
    transparent: true,
    opacity: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending
  });
  const seal = new THREE.Mesh(new THREE.PlaneGeometry(3.45, 3.45), sealMaterial);
  seal.rotation.x = -Math.PI / 2;
  const sealRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.43, 0.035, 10, 96),
    new THREE.MeshPhysicalMaterial({ color: 0x1b2b3b, roughness: 0.26, metalness: 0.88, clearcoat: 0.62, emissive: 0x00f3ff, emissiveIntensity: 0.2, transparent: true, opacity: 0 })
  );
  sealRing.rotation.x = Math.PI / 2;
  sealRing.position.y = 0.022;
  const baseLight = new THREE.PointLight(0x00f3ff, 0, 5.5, 1.5);
  baseLight.position.y = 0.38;
  base.add(seal, sealRing, baseLight);

  const aperture = new THREE.Group();
  aperture.name = "stargateAperture";
  aperture.position.set(GATE_CENTER.x, GATE_CENTER.y, GATE_CENTER.z);
  const frameMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x07121c,
    roughness: 0.42,
    metalness: 0.82,
    clearcoat: 0.34,
    clearcoatRoughness: 0.28,
    emissive: 0x021216,
    emissiveIntensity: 0.08
  });
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0x9f7a32,
    roughness: 0.2,
    metalness: 0.92,
    emissive: 0x68440f,
    emissiveIntensity: 0.24
  });
  const outerRing = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.115, 18, 128), frameMaterial);
  outerRing.name = "stargateOuterRing";
  outerRing.castShadow = true;
  const middleRing = new THREE.Mesh(new THREE.TorusGeometry(1.13, 0.052, 12, 112), goldMaterial);
  middleRing.name = "stargateMiddleRing";
  middleRing.position.z = 0.035;
  const innerRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.94, 0.036, 10, 112),
    new THREE.MeshStandardMaterial({ color: 0x153745, roughness: 0.28, metalness: 0.76, emissive: 0x00f3ff, emissiveIntensity: 0.42 })
  );
  innerRing.name = "stargateInnerRing";
  innerRing.position.z = 0.07;
  const glyphDisc = new THREE.Mesh(
    new THREE.PlaneGeometry(2.88, 2.88),
    new THREE.MeshBasicMaterial({ map: gateGlyphTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  glyphDisc.name = "stargateGlyphDisc";
  glyphDisc.position.z = 0.09;
  const horizonMaterial = createEventHorizonMaterial();
  const horizon = new THREE.Mesh(new THREE.CircleGeometry(0.9, 128), horizonMaterial);
  horizon.name = "stargateEventHorizon";
  horizon.position.z = 0.1;
  const horizonBack = new THREE.Mesh(
    new THREE.CircleGeometry(0.92, 96),
    new THREE.MeshBasicMaterial({ color: 0x01050f, transparent: true, opacity: 0, depthWrite: false })
  );
  horizonBack.position.z = 0.075;

  const iris = new THREE.Group();
  iris.name = "stargateIris";
  iris.position.z = 0.085;
  const irisSegments = [];
  for (let index = 0; index < 12; index += 1) {
    const segment = new THREE.Mesh(
      new THREE.RingGeometry(0.18, 0.88, 20, 1, index / 12 * Math.PI * 2 + 0.018, Math.PI * 2 / 12 - 0.036),
      new THREE.MeshStandardMaterial({
        color: index % 2 ? 0x183545 : 0x202c3c,
        roughness: 0.32,
        metalness: 0.78,
        emissive: index % 3 === 0 ? 0x68440f : 0x053943,
        emissiveIntensity: 0.22,
        transparent: true,
        opacity: 0.96,
        side: THREE.DoubleSide
      })
    );
    segment.userData.index = index;
    irisSegments.push(segment);
    iris.add(segment);
  }

  const chevrons = [];
  for (let index = 0; index < 8; index += 1) {
    const angle = Math.PI * 0.5 - index / 8 * Math.PI * 2;
    const color = GATE_PALETTE[index];
    const chevron = new THREE.Group();
    chevron.name = `stargateChevron${index + 1}`;
    chevron.position.set(Math.cos(angle) * 1.34, Math.sin(angle) * 1.34, 0.12);
    chevron.rotation.z = angle - Math.PI * 0.5;
    const housing = new THREE.Mesh(new THREE.OctahedronGeometry(0.13, 0), frameMaterial.clone());
    housing.scale.set(1.35, 0.72, 0.7);
    const signal = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.065, 0),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.08, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    signal.position.z = 0.075;
    chevron.userData.signal = signal;
    chevron.add(housing, signal);
    chevrons.push(chevron);
    aperture.add(chevron);
  }

  const particles = createGateParticles();
  particles.name = "stargateApertureParticles";
  const constellation = createConstellation();
  constellation.name = "stargateDestinationConstellation";
  constellation.position.z = 0.12;
  const depthTunnel = createPortalDepthTunnel();
  const shockwaves = createGateShockwaves();
  const portalLight = new THREE.PointLight(0x00f3ff, 0, 8.5, 1.25);
  portalLight.name = "stargatePortalLight";
  portalLight.position.set(0, 0.05, 0.55);
  const rimLight = new THREE.PointLight(0xff6df2, 0, 5.5, 1.4);
  rimLight.name = "stargateRimLight";
  rimLight.position.set(0.74, 0.62, 0.35);
  aperture.add(depthTunnel, horizonBack, iris, outerRing, middleRing, innerRing, glyphDisc, horizon, constellation, particles, shockwaves, portalLight, rimLight);

  const pylons = new THREE.Group();
  pylons.name = "stargateSupports";
  [-1, 1].forEach((side) => {
    const support = new THREE.Group();
    support.position.set(side * 1.08, 0.62, -0.74);
    support.rotation.z = side * -0.08;
    const column = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.18, 0.26), frameMaterial.clone());
    column.castShadow = true;
    const foot = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.54), goldMaterial.clone());
    foot.position.y = -0.62;
    support.add(column, foot);
    pylons.add(support);
  });

  const slots = Array.from({ length: 8 }, (_, index) => createGateSlot(index));
  const beams = Array.from({ length: 8 }, (_, index) => createBeam(index));
  const peerPresences = [
    createPeerPresence("Aurora", 0x00f3ff, -1),
    createPeerPresence("Beacon", 0xa472ff, 1)
  ];
  const peerRails = [createPeerRail(-1, 0x00f3ff), createPeerRail(1, 0xa472ff)];
  slots.forEach((slot) => root.add(slot));
  beams.forEach((beam) => root.add(beam));
  peerRails.forEach((rail) => root.add(rail));
  peerPresences.forEach((presence) => root.add(presence));
  root.add(base, pylons, aperture);
  root.userData.stargate = {
    base,
    seal,
    sealRing,
    baseLight,
    aperture,
    outerRing,
    middleRing,
    innerRing,
    glyphDisc,
    horizon,
    horizonBack,
    horizonMaterial,
    iris,
    irisSegments,
    chevrons,
    particles,
    constellation,
    depthTunnel,
    depthRings: depthTunnel.userData.rings,
    shockwaves,
    shockwaveRings: shockwaves.userData.rings,
    portalLight,
    rimLight,
    pylons,
    slots,
    beams,
    peerPresences,
    peerRails,
    visibleBlend: 0,
    openBlend: 0,
    energy: 0,
    lastState: "dormant"
  };
  return root;
}

function updateBeam(beam, source, slotIndex, activeSlots, energy, elapsed, reducedMotion, reverse = false) {
  const active = slotIndex < activeSlots && source;
  const positions = beam.geometry.attributes.position.array;
  const start = source || new THREE.Vector3(0, 0, 0);
  const endAngle = Math.PI * 0.5 - slotIndex / Math.max(2, activeSlots) * Math.PI * 2;
  const end = new THREE.Vector3(
    GATE_CENTER.x + Math.cos(endAngle) * 1.16,
    GATE_CENTER.y + Math.sin(endAngle) * 1.16,
    GATE_CENTER.z + 0.11
  );
  for (let pointIndex = 0; pointIndex < 12; pointIndex += 1) {
    const t = pointIndex / 11;
    const inv = 1 - t;
    const controlX = start.x * 0.42;
    const controlY = 0.28 + Math.sin(t * Math.PI) * (0.34 + slotIndex * 0.018);
    const controlZ = THREE.MathUtils.lerp(start.z, GATE_TABLE_CENTER.z, 0.64);
    positions[pointIndex * 3] = inv * inv * start.x + 2 * inv * t * controlX + t * t * end.x;
    positions[pointIndex * 3 + 1] = inv * inv * (start.y + 0.06) + 2 * inv * t * controlY + t * t * end.y;
    positions[pointIndex * 3 + 2] = inv * inv * start.z + 2 * inv * t * controlZ + t * t * end.z;
  }
  beam.geometry.attributes.position.needsUpdate = true;
  beam.geometry.computeBoundingSphere();
  const pulse = reducedMotion ? 1 : 0.72 + Math.sin(elapsed * 6.4 + beam.userData.phase) * 0.28;
  beam.material.opacity = active ? (0.08 + energy * 0.54) * pulse : 0;
  const spark = beam.userData.spark;
  const travel = reducedMotion ? 0.82 : (elapsed * 0.31 + slotIndex * 0.127) % 1;
  const sparkT = reverse ? 1 - travel : travel;
  const sparkPoint = Math.min(10, Math.floor(sparkT * 11));
  spark.position.fromArray(positions, sparkPoint * 3);
  spark.material.opacity = active ? energy * 0.9 : 0;
  spark.scale.setScalar(0.72 + pulse * 0.52);
}

export function updateTarotStargateRig(root, options = {}) {
  const data = root?.userData?.stargate;
  if (!data) return;
  const state = options.state || "dormant";
  const elapsed = Number(options.elapsed || 0);
  const delta = Math.min(0.1, Math.max(0, Number(options.delta || 0)));
  const progress = THREE.MathUtils.clamp(Number(options.progress || 0), 0, 1);
  const activeSlots = Math.max(0, Math.min(8, Number(options.activeSlots || 0)));
  const sources = Array.isArray(options.sources) ? options.sources : [];
  const reducedMotion = Boolean(options.reducedMotion);
  const peerArrival = options.peerArrival || { state: "idle", progress: 0, peers: [] };
  const peerArrivalState = String(peerArrival.state || "idle");
  const peerArrivalProgress = THREE.MathUtils.clamp(Number(peerArrival.progress || 0), 0, 1);
  const peerVerifying = peerArrivalState === "verifying";
  const peerVisible = ["verifying", "arriving", "joined"].includes(peerArrivalState);
  const peerJoined = ["arriving", "joined"].includes(peerArrivalState);
  const stateColor = new THREE.Color(STATE_COLORS[state] || STATE_COLORS.dormant);
  const targetVisible = state !== "dormant";
  const visibilityRate = reducedMotion ? 1 : 1 - Math.pow(0.0008, delta || 0.016);
  data.visibleBlend = THREE.MathUtils.lerp(data.visibleBlend, targetVisible ? 1 : 0, visibilityRate);
  if (targetVisible) root.visible = true;
  root.scale.setScalar(Math.max(0.001, 0.82 + data.visibleBlend * 0.18));
  root.position.y = -0.06 + data.visibleBlend * 0.06;
  if (!targetVisible && data.visibleBlend < 0.012) root.visible = false;

  const readyEnergy = state === "ready" ? 0.44 : state === "needs_identity" ? 0.2 : state === "arranging" ? 0.24 : 0;
  const activeEnergy = state === "dialing" ? 0.42 + progress * 0.58 : ["active", "connected"].includes(state) ? 1 : state === "sealing" ? 1.08 : state === "stale" ? 0.48 : state === "disconnected" ? (peerVerifying ? 0.58 : 0.26) : state === "expired" ? 0.18 : readyEnergy;
  data.energy = THREE.MathUtils.lerp(data.energy, activeEnergy, reducedMotion ? 1 : 1 - Math.pow(0.004, delta || 0.016));
  const sealCollapse = state === "sealing" ? THREE.MathUtils.smoothstep(progress, 0.08, 0.98) : 0;
  const openTarget = ["active", "connected"].includes(state) ? 1 : state === "dialing" ? THREE.MathUtils.smoothstep(progress, 0.48, 0.94) : state === "sealing" ? 1 - sealCollapse : state === "stale" ? 0.34 : state === "disconnected" ? (peerVerifying ? 0.22 : 0.08) : 0;
  data.openBlend = THREE.MathUtils.lerp(data.openBlend, openTarget, reducedMotion ? 1 : 1 - Math.pow(0.0005, delta || 0.016));

  const motionTime = reducedMotion ? 0.75 : elapsed;
  data.base.rotation.y = reducedMotion ? 0 : motionTime * (0.035 + data.energy * 0.12);
  data.seal.material.color.set(stateColor);
  data.seal.material.opacity = data.visibleBlend * (0.08 + data.energy * 0.34);
  data.sealRing.material.emissive.copy(stateColor);
  data.sealRing.material.emissiveIntensity = 0.18 + data.energy * 1.7;
  data.sealRing.material.opacity = data.visibleBlend * (0.32 + data.energy * 0.66);
  data.baseLight.color.copy(stateColor);
  data.baseLight.intensity = data.visibleBlend * data.energy * 18;

  const breathing = reducedMotion ? 1 : 0.86 + Math.sin(motionTime * 2.4) * 0.14;
  data.aperture.position.y = GATE_CENTER.y - (1 - data.visibleBlend) * 0.42 - sealCollapse * 0.3;
  data.aperture.position.z = GATE_CENTER.z + sealCollapse * 0.18;
  data.aperture.scale.setScalar((0.92 + data.energy * 0.08 + (state === "active" ? breathing * 0.018 : 0)) * (1 - sealCollapse * 0.78));
  data.outerRing.rotation.z = reducedMotion ? 0.04 : motionTime * (0.08 + data.energy * 0.18);
  data.middleRing.rotation.z = reducedMotion ? -0.08 : -motionTime * (0.14 + data.energy * 0.28);
  data.innerRing.rotation.z = reducedMotion ? 0.12 : motionTime * (0.22 + data.energy * 0.36);
  [data.outerRing, data.middleRing, data.innerRing].forEach((ring, index) => {
    ring.material.emissive.copy(index === 1 ? new THREE.Color(0xf6c96d) : stateColor);
    ring.material.emissiveIntensity = 0.08 + data.energy * (index === 1 ? 0.52 : index === 2 ? 0.76 : 0.36);
  });
  data.glyphDisc.material.color.set(stateColor);
  data.glyphDisc.material.opacity = data.visibleBlend * (0.06 + data.energy * 0.45);
  data.glyphDisc.rotation.z = reducedMotion ? 0 : -motionTime * 0.11;

  data.irisSegments.forEach((segment, index) => {
    const stagger = THREE.MathUtils.clamp((data.openBlend * 1.35) - index / data.irisSegments.length * 0.35, 0, 1);
    segment.rotation.z = (index % 2 ? 1 : -1) * stagger * 0.46;
    segment.scale.setScalar(1 + stagger * 0.42);
    segment.material.opacity = data.visibleBlend * (1 - stagger * 0.94) * (state === "disconnected" ? 0.24 : 1);
    segment.material.emissive.copy(stateColor);
    segment.material.emissiveIntensity = 0.12 + data.energy * 0.62;
  });
  data.horizonMaterial.uniforms.uTime.value = motionTime;
  data.horizonMaterial.uniforms.uOpen.value = data.openBlend;
  data.horizonMaterial.uniforms.uEnergy.value = data.energy;
  data.horizonMaterial.uniforms.uStateColor.value.copy(stateColor);
  data.horizonBack.material.opacity = data.openBlend * 0.94;
  data.constellation.material.opacity = data.openBlend * (0.44 + data.energy * 0.46) * (1 - sealCollapse);
  data.constellation.rotation.z = reducedMotion ? 0.08 : motionTime * 0.035;
  data.constellation.scale.setScalar(0.88 + data.openBlend * 0.12);
  data.depthRings.forEach((ring, index) => {
    const phase = ring.userData.phase;
    const travel = reducedMotion ? phase : (phase + motionTime * (0.075 + data.energy * 0.055)) % 1;
    const depthScale = 0.56 + travel * 0.54;
    ring.scale.setScalar(depthScale);
    ring.position.z = -0.62 + travel * 0.7;
    ring.rotation.z = reducedMotion ? index * 0.11 : motionTime * (index % 2 ? -0.16 : 0.13) + index * 0.22;
    if (index % 3 === 0) ring.material.color.setHex(0xf6c96d);
    else if (index % 2 === 0) ring.material.color.setHex(0xff6df2);
    else ring.material.color.copy(stateColor);
    ring.material.opacity = data.openBlend * data.energy * Math.sin(travel * Math.PI) * (index % 3 === 0 ? 0.3 : 0.2);
  });
  const shockwaveClock = peerVisible
    ? peerArrivalProgress * 2.2 + (reducedMotion ? 0.4 : motionTime * 0.12)
    : state === "dialing"
      ? progress * 2.4
      : reducedMotion ? 0.4 : motionTime * 0.18;
  data.shockwaveRings.forEach((ring, index) => {
    const phase = reducedMotion ? (0.22 + index * 0.2) : (shockwaveClock + ring.userData.phase) % 1;
    const arrivalBoost = peerVisible ? 0.45 + peerArrivalProgress * 0.55 : 1;
    ring.scale.setScalar(0.9 + phase * (0.62 + data.energy * 0.28));
    ring.rotation.z = reducedMotion ? index * 0.18 : motionTime * (index % 2 ? -0.22 : 0.18);
    ring.material.opacity = data.openBlend * data.energy * arrivalBoost * Math.pow(1 - phase, 2) * (index === 0 ? 0.58 : 0.42);
  });
  data.particles.material.opacity = data.visibleBlend * data.energy * 0.68;
  data.particles.rotation.z = reducedMotion ? 0 : motionTime * 0.09;
  data.particles.scale.setScalar((0.88 + data.energy * 0.18) * (1 - sealCollapse * 0.52));
  data.portalLight.color.copy(stateColor);
  data.portalLight.intensity = data.openBlend * (5 + data.energy * 8);
  data.rimLight.intensity = data.openBlend * (2.5 + data.energy * 5.5);

  const peerChevronCount = peerVisible ? Math.floor((peerJoined ? peerArrivalProgress : (0.2 + ((motionTime * 0.7) % 0.8))) * 8) : 0;
  const dialedChevronCount = ["active", "connected", "sealing"].includes(state) ? activeSlots : state === "dialing" ? Math.floor(progress * (activeSlots + 1)) : peerChevronCount;
  data.chevrons.forEach((chevron, index) => {
    const engaged = peerVisible ? index < dialedChevronCount : index < activeSlots && (state === "ready" || state === "needs_identity" || index < dialedChevronCount);
    const signal = chevron.userData.signal;
    const pulse = reducedMotion ? 1 : 0.78 + Math.sin(motionTime * 5.6 + index) * 0.22;
    signal.material.opacity = engaged ? (state === "active" ? 0.95 : 0.36 + data.energy * 0.5) * pulse : 0.06;
    signal.scale.setScalar(engaged ? 1 + data.energy * 0.34 : 0.78);
  });

  data.slots.forEach((slot, index) => {
    const active = index < activeSlots;
    // Keep two empty targets visible at first, then reveal the next available
    // slot as the ordered formation grows. This makes Gate construction
    // discoverable without turning all eight targets into visual noise.
    const visibleSlots = Math.min(8, Math.max(2, activeSlots + 1));
    const formationSlots = Math.max(2, activeSlots);
    const position = tarotStargateSlotPosition(index, active ? formationSlots : visibleSlots);
    slot.position.copy(position);
    slot.visible = targetVisible && index < visibleSlots;
    const refs = slot.userData.refs;
    refs.ring.material.opacity = slot.visible ? data.visibleBlend * (active ? 0.2 + data.energy * 0.58 : 0.08) : 0;
    refs.bracket.material.opacity = slot.visible ? data.visibleBlend * (active ? 0.82 : 0.28) : 0;
    refs.bracket.material.emissiveIntensity = active ? 0.32 + data.energy * 1.2 : 0.1;
    refs.label.material.opacity = slot.visible ? data.visibleBlend * (active ? 0.92 : 0.3) : 0;
    refs.ring.rotation.z = reducedMotion ? 0 : motionTime * (0.14 + index * 0.012) * (index % 2 ? -1 : 1);
  });
  data.beams.forEach((beam, index) => updateBeam(beam, sources[index], index, activeSlots, data.energy, motionTime, reducedMotion, state === "sealing"));
  data.peerRails.forEach((rail, railIndex) => {
    const strength = peerVisible ? (peerJoined ? 0.2 + peerArrivalProgress * 0.45 : 0.24 + Math.sin(motionTime * 4 + railIndex) * 0.08) : 0;
    rail.material.opacity = strength;
    rail.userData.packets.forEach((packet, packetIndex) => {
      const travel = reducedMotion ? 0.82 : (motionTime * (peerVerifying ? 0.36 : 0.52) + packetIndex * 0.22 + railIndex * 0.08) % 1;
      packet.position.copy(rail.userData.curve.getPoint(travel));
      packet.rotation.x = motionTime * 2.2;
      packet.rotation.y = motionTime * 1.7;
      packet.material.opacity = peerVisible ? (0.34 + (packetIndex === 0 ? 0.56 : 0.3)) * (peerJoined ? 1 : 0.78) : 0;
      packet.scale.setScalar(peerJoined ? 0.9 + peerArrivalProgress * 0.55 : 0.72 + Math.sin(motionTime * 7 + packetIndex) * 0.15);
    });
  });
  data.peerPresences.forEach((presence, index) => {
    const refs = presence.userData.refs;
    const arrival = peerJoined ? THREE.MathUtils.smoothstep(peerArrivalProgress, 0.16 + index * 0.12, 0.78 + index * 0.1) : 0;
    const verifyPulse = peerVerifying ? 0.18 + Math.sin(motionTime * 4.8 + index * 1.4) * 0.06 : 0;
    const opacity = THREE.MathUtils.clamp(arrival + verifyPulse, 0, 1);
    presence.visible = peerVisible;
    presence.position.x = presence.userData.side * (0.62 + (1 - arrival) * 0.42);
    presence.scale.setScalar(0.62 + opacity * 0.38 + (peerJoined && !reducedMotion ? Math.sin(motionTime * 3.4 + index) * 0.025 : 0));
    refs.glow.material.opacity = opacity * 0.2;
    refs.outer.material.opacity = opacity * 0.92;
    refs.inner.material.opacity = opacity * 0.76;
    refs.core.material.opacity = opacity;
    refs.label.material.opacity = opacity * 0.94;
    refs.outer.rotation.z = reducedMotion ? 0 : motionTime * (index ? -0.7 : 0.7);
    refs.inner.rotation.z = reducedMotion ? 0 : motionTime * (index ? 1.05 : -1.05);
    refs.core.rotation.x = motionTime * 0.8;
    refs.core.rotation.y = motionTime * 1.1;
  });
  data.lastState = state;
}

export function disposeTarotStargateRig(root) {
  if (!root) return;
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    materials.forEach((material) => {
      material.map?.dispose?.();
      material.dispose?.();
    });
  });
}
