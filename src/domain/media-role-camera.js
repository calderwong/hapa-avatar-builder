import crypto from "node:crypto";

export const MEDIA_CAMERA_SCHEMA = "hapa.director.media-role-camera.v1";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
  const centerY = 1 - (Number(roi.y || 0) + Number(roi.height || 1) / 2);
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
