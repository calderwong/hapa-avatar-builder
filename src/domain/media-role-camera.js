export const MEDIA_CAMERA_SCHEMA = "hapa.director.media-role-camera.v1";

// Keep camera-path identities byte-compatible with Node's SHA-256 while also
// allowing this shared planner to run in the browser Preview and Record Garden.
const SHA256_INITIAL_STATE = Object.freeze([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);
const SHA256_CONSTANTS = Object.freeze([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotateRight = (value, bits) => (value >>> bits) | (value << (32 - bits));

function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value));
  const bitLength = bytes.length * 8;
  const paddingLength = (56 - ((bytes.length + 1) % 64) + 64) % 64;
  const padded = new Uint8Array(bytes.length + 1 + paddingLength + 8);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(padded.length - 4, bitLength >>> 0, false);

  const state = [...SHA256_INITIAL_STATE];
  const words = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) words[index] = view.getUint32(offset + (index * 4), false);
    for (let index = 16; index < 64; index += 1) {
      const left = words[index - 15];
      const right = words[index - 2];
      const sigma0 = rotateRight(left, 7) ^ rotateRight(left, 18) ^ (left >>> 3);
      const sigma1 = rotateRight(right, 17) ^ rotateRight(right, 19) ^ (right >>> 10);
      words[index] = (words[index - 16] + sigma0 + words[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ ((~e) & g);
      const temporary1 = (h + sum1 + choose + SHA256_CONSTANTS[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temporary2 = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temporary1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temporary1 + temporary2) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }
  return state.map((word) => word.toString(16).padStart(8, "0")).join("");
}

const hash = (value) => sha256Hex(JSON.stringify(value));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function classifyMediaRole({ technical = {}, subjectROI = {}, atSectionStart = false, isFinal = false } = {}) {
  const aspect = Number(technical.width || 1) / Math.max(1, Number(technical.height || 1));
  const duration = Number(technical.durationSec || 0);
  const roiArea = Number(subjectROI.width || 0.5) * Number(subjectROI.height || 0.5);
  if (isFinal) return "ringout";
  if (duration > 0 && duration <= 2) return "transition-plate";
  if (atSectionStart) return "reveal";
  if (aspect < 0.82) return "portrait";
  if (roiArea < 0.16) return "detail";
  if (technical.keyframes?.count === 1 && duration >= 3 && duration <= 8) return "loop";
  if (Number(technical.fps || 0) >= 30) return "motion";
  if (technical.codec === "image") return "texture";
  return "foundation";
}

function coverCrop(sourceAspect, targetAspect, closeFactor) {
  const width = sourceAspect >= targetAspect ? targetAspect / sourceAspect : 1;
  const height = sourceAspect >= targetAspect ? 1 : sourceAspect / targetAspect;
  return { width: width * closeFactor, height: height * closeFactor };
}

function centeredCrop(roi, crop) {
  const centerX = Number(roi.x || 0) + Number(roi.width || 1) / 2;
  // Vision/enrichment ROIs and every Preview/Canvas consumer use top-origin Y.
  // Keep that convention at the camera-contract boundary so a subject near the
  // top of a portrait source is not reframed toward the bottom.
  const centerY = Number(roi.y || 0) + Number(roi.height || 1) / 2;
  return { x: clamp(centerX - crop.width / 2, 0, 1 - crop.width), y: clamp(centerY - crop.height / 2, 0, 1 - crop.height), width: crop.width, height: crop.height };
}

export function buildSafeCameraPath({ mediaId, technical, analysis, role, phraseCue, targetAspects = [16 / 9, 9 / 16, 1] } = {}) {
  const sourceAspect = Number(technical.width) / Math.max(1, Number(technical.height));
  const roi = analysis.subjectROI || { x: 0.25, y: 0.2, width: 0.5, height: 0.6 };
  const corridors = targetAspects.map((targetAspect) => {
    const startCrop = centeredCrop(roi, coverCrop(sourceAspect, targetAspect, 0.9));
    const endCrop = centeredCrop({ ...roi, x: clamp(Number(roi.x) + Number(roi.width) * 0.08, 0, 1), y: clamp(Number(roi.y) + Number(roi.height) * 0.05, 0, 1) }, coverCrop(sourceAspect, targetAspect, 0.97));
    return { targetAspect, startCrop, endCrop, fullBleed: true, blackMatExposure: false };
  });
  return {
    id: `camera-path:${hash([mediaId, role, phraseCue?.id]).slice(0, 16)}`,
    schemaVersion: MEDIA_CAMERA_SCHEMA,
    mediaId,
    shotRole: role,
    phraseCue: { id: phraseCue?.id || null, atSeconds: phraseCue?.atSeconds ?? phraseCue?.startSeconds ?? null, source: phraseCue?.source || null },
    subjectROI: { ...roi, status: analysis.status || "unknown", evidence: analysis.evidence || "center-safe-fallback", faceCount: analysis.faceCount || 0 },
    easing: role === "reveal" ? "power3.out" : role === "ringout" ? "sine.inOut" : "power2.inOut",
    zoomLimits: { min: 1.03, max: 1.18, startCloseCrop: true },
    corridors,
    keyframes: [{ offset: 0, crop: corridors[0].startCrop, zoom: 1.12 }, { offset: 1, crop: corridors[0].endCrop, zoom: 1.05 }],
  };
}

export function validateSafeCameraPath(path) {
  const errors = [];
  if (!path.subjectROI?.evidence || !path.shotRole || !path.phraseCue || !path.easing) errors.push("missing-citation");
  if (path.zoomLimits.min < 1 || path.zoomLimits.max > 1.18 || !path.zoomLimits.startCloseCrop) errors.push("unsafe-zoom");
  for (const corridor of path.corridors || []) {
    for (const crop of [corridor.startCrop, corridor.endCrop]) if (crop.x < 0 || crop.y < 0 || crop.x + crop.width > 1.000001 || crop.y + crop.height > 1.000001) errors.push("crop-out-of-bounds");
    if (!corridor.fullBleed || corridor.blackMatExposure) errors.push("black-mat-risk");
  }
  return { ok: errors.length === 0, errors };
}
