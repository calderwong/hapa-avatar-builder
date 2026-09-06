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

export const PROTECTED_MEDIA_CAMERA_SCHEMA = "hapa.director.media-role-camera.v2";

const validRect = (r) => r && [r.x, r.y, r.width, r.height].every(Number.isFinite)
  && r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0
  && r.x + r.width <= 1 + 1e-9 && r.y + r.height <= 1 + 1e-9;

export function buildProtectedCameraPath({
  mediaId, sourceHash, technical = {}, analysis = {}, role = "foundation", phraseCue = null,
  startSeconds = 0, durationSeconds = 5,
  outputProfiles = [{ width: 1920, height: 1080 }, { width: 1080, height: 1920 }, { width: 1080, height: 1080 }],
  maxUpscale = 1, maxVelocity = 0.08, maxAcceleration = 0.16,
  readingSeconds = 2, maxTextureSize = 8192, maxDecodedBytes = 128 * 1024 * 1024,
  viewRegion = { x:0,y:0,width:1,height:1 },
} = {}) {
  if (!/^[a-f0-9]{64}$/.test(sourceHash || "")) throw new Error("image-source-hash-required");
  const width = Number(technical.width), height = Number(technical.height);
  if (![width, height].every(n => Number.isInteger(n) && n > 0)) throw new Error("image-dimensions-required");
  if (![startSeconds, durationSeconds, readingSeconds, maxUpscale, maxVelocity, maxAcceleration].every(Number.isFinite)
    || durationSeconds <= 0 || readingSeconds < 0 || maxUpscale < 1 || maxVelocity <= 0 || maxAcceleration <= 0) throw new Error("invalid-camera-limits");
  if (![maxTextureSize, maxDecodedBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("invalid-camera-decode-limits");
  if (!outputProfiles.length || outputProfiles.length > 8 || outputProfiles.some(p => ![p.width,p.height].every(n => Number.isInteger(n) && n > 0))) throw new Error("invalid-camera-output-profile");
  const supplied = Array.isArray(analysis.protectedRegions) ? analysis.protectedRegions : [];
  if (supplied.length > 256 || supplied.some(r => !validRect(r))) throw new Error("invalid-protected-region");
  // Unknown protection cannot certify a moving crop. A fitted whole image is
  // the explicit conservative fallback until source-bound regions are supplied.
  const verifiedRegions = ["verified", "source-bound"].includes(analysis.protectedRegionsStatus) && analysis.sourceHash === sourceHash && supplied.length > 0;
  if (!validRect(viewRegion)) throw new Error("invalid-camera-view-region");
  const view = verifiedRegions ? viewRegion : {x:0,y:0,width:1,height:1};
  if (verifiedRegions && supplied.some(r => r.x<view.x-1e-9 || r.y<view.y-1e-9 || r.x+r.width>view.x+view.width+1e-9 || r.y+r.height>view.y+view.height+1e-9)) throw new Error("protected-region-outside-panel");
  const regions = verifiedRegions ? supplied : [{ x: 0, y: 0, width: 1, height: 1 }];
  const left = Math.min(...regions.map(r => r.x)), top = Math.min(...regions.map(r => r.y));
  const right = Math.max(...regions.map(r => r.x+r.width)), bottom = Math.max(...regions.map(r => r.y+r.height));
  const union = { x:left, y:top, width:right-left, height:bottom-top };
  const cueTime = phraseCue?.atSeconds ?? phraseCue?.startSeconds;
  const measuredCue = ["verified", "source-bound"].includes(phraseCue?.timingStatus) && Number.isFinite(cueTime)
    && cueTime >= startSeconds && cueTime < startSeconds + durationSeconds;
  const hold = Math.min(durationSeconds, Math.max(readingSeconds, measuredCue ? cueTime-startSeconds : 0));
  const moveDuration = durationSeconds-hold;
  const residentBytes = width*height*4;
  const decodeFits = width <= maxTextureSize && height <= maxTextureSize && residentBytes <= maxDecodedBytes;
  const corridors = outputProfiles.map(profile => {
    const targetAspect = profile.width/profile.height;
    const localCover = coverCrop((width*view.width)/(height*view.height),targetAspect,1);
    const fullCover = {x:view.x,y:view.y,width:localCover.width*view.width,height:localCover.height*view.height};
    const reasons = [];
    if (!verifiedRegions) reasons.push(analysis.sourceHash && analysis.sourceHash !== sourceHash ? "protected-regions-source-mismatch" : "protected-regions-unverified");
    if (union.width > fullCover.width+1e-9 || union.height > fullCover.height+1e-9) reasons.push("protected-region-outside-cover");
    if (fullCover.width*width*maxUpscale < profile.width || fullCover.height*height*maxUpscale < profile.height) reasons.push("insufficient-original-resolution-for-cover");
    if (!decodeFits) reasons.push("decode-sized-rendition-required");
    if (reasons.length) {
      const fitScale = Math.min(1,maxUpscale/Math.min(profile.width/(width*view.width),profile.height/(height*view.height)));
      const crop = { ...view,cameraModel:"protected-v2",fit:"contain",fitScale };
      return { ...profile,targetAspect,startCrop:crop,endCrop:{...crop},fullBleed:false,blackMatExposure:false,
        layout:"fitted-image",reasons,motion:"hold",holdSeconds:durationSeconds,
        maximumVelocity:0,maximumAcceleration:0,nativeResolution:maxUpscale===1 };
    }
    const minimumX = Math.max(view.x,right-fullCover.width), maximumX = Math.min(left,view.x+view.width-fullCover.width);
    const minimumY = Math.max(view.y,bottom-fullCover.height), maximumY = Math.min(top,view.y+view.height-fullCover.height);
    const center = centeredCrop(union,fullCover);
    const deltaLimit = moveDuration > 0 ? Math.min(maxVelocity*moveDuration/1.875,maxAcceleration*moveDuration*moveDuration/(10/Math.sqrt(3))) : 0;
    const dx = Math.min(0.035,Math.max(0,maximumX-minimumX),deltaLimit/Math.sqrt(2));
    const dy = Math.min(0.02,Math.max(0,maximumY-minimumY),deltaLimit/Math.sqrt(2));
    const x = clamp(center.x-dx/2,minimumX,maximumX-dx);
    const y = clamp(center.y-dy/2,minimumY,maximumY-dy);
    const startCrop = { ...fullCover,x,y,cameraModel:"protected-v2",fit:"cover" };
    const endCrop = { ...startCrop,x:x+dx,y:y+dy };
    const distance = Math.hypot(dx,dy);
    return { ...profile,targetAspect,startCrop,endCrop,fullBleed:true,blackMatExposure:false,layout:"protected-cover",reasons,
      motion:distance>0?"phrase-drift":"hold",holdSeconds:hold,
      maximumVelocity:moveDuration>0?1.875*distance/moveDuration:0,
      maximumAcceleration:moveDuration>0?(10/Math.sqrt(3))*distance/(moveDuration*moveDuration):0,nativeResolution:maxUpscale===1 };
  });
  const identity = { mediaId,sourceHash,technical,regions,role,startSeconds,durationSeconds,phraseCue,outputProfiles,maxUpscale,maxVelocity,maxAcceleration,readingSeconds,maxTextureSize,maxDecodedBytes,viewRegion };
  return {
    id:`camera-path:${hash(identity).slice(0,16)}`,schemaVersion:PROTECTED_MEDIA_CAMERA_SCHEMA,mediaId,sourceHash,shotRole:role,
    startSeconds,durationSeconds,easing:"smootherstep",viewRegion:view,subjectROI:union,protectedRegions:regions,
    protectedRegionsStatus:verifiedRegions?analysis.protectedRegionsStatus:"whole-image-fallback",
    phraseCue: measuredCue ? { id:phraseCue.id,atSeconds:cueTime,source:phraseCue.source,timingStatus:phraseCue.timingStatus }
      : { id:null,atSeconds:startSeconds,source:"shot-boundary",timingStatus:"unverified" },
    limits:{maxUpscale,maxVelocity,maxAcceleration,maxTextureSize,maxDecodedBytes},
    decode:{originalBytes:residentBytes,originalFits:decodeFits},depthMode:"deterministic-2d",corridors,
    reading:{requiredSeconds:readingSeconds,availableSeconds:durationSeconds,sufficient:durationSeconds>=readingSeconds},
    keyframes:[{offset:0,crop:corridors[0].startCrop},{offset:corridors[0].holdSeconds/durationSeconds,crop:corridors[0].startCrop},{offset:1,crop:corridors[0].endCrop}],
    proof:{method:"convex-rectangle-containment-and-monotone-quintic",maximumSpeedFactor:1.875,maximumAccelerationFactor:10/Math.sqrt(3)},
  };
}
