import { resolveEchoOutputProfile } from "./echo-output-profile.js";
import { validateSafeCameraPath } from "./media-role-camera.js";

export const ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINE_SCHEMA =
  "hapa.echo.horizontal-portrait-camera-doctrine.v1";

export const ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINES = Object.freeze([
  Object.freeze({
    id: "top-first-fast-scan-v1",
    label: "Top First · Fast Full-Height Scan",
    cutOrdinal: 1,
    motion: "pan-up",
    speed: 2.4,
    intensity: 0,
    startAnchor: "top",
    endAnchor: "bottom",
  }),
  Object.freeze({
    id: "top-arrival-fast-scan-v1",
    label: "Top Arrival · Fast Full-Height Scan",
    cutOrdinal: 2,
    motion: "pan-down",
    speed: 2.4,
    intensity: 0,
    startAnchor: "bottom",
    endAnchor: "near-top",
  }),
]);

function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function round(value) {
  return Number(Number(value).toFixed(12));
}

function compactHash(value) {
  const input = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index += 1) {
    hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function shotDimensions(shot = {}) {
  const dimensions = shot.media_contract?.dimensions
    || shot.mediaContract?.dimensions
    || shot.media_dimensions
    || shot.dimensions
    || {};
  const width = positive(dimensions.width ?? shot.media_width ?? shot.video_width);
  const height = positive(dimensions.height ?? shot.media_height ?? shot.video_height);
  return width && height ? { width, height, maxDimension: Math.max(width, height) } : null;
}

function isVideoShot(shot = {}) {
  const kind = text(shot.media_contract?.type || shot.mediaContract?.type).toLowerCase();
  if (kind) return kind === "video";
  return /\.(?:mp4|mov|m4v|webm)(?:$|\?)/iu.test(text(
    shot.runtime_media_uri
    || shot.media_contract?.runtimeUri
    || shot.media_uri,
  ));
}

function isCertifiedAtomicShot(shot = {}) {
  const role = text(
    shot.decision_evidence?.atomicTransition?.role
    || shot.decisionEvidence?.atomicTransition?.role,
  );
  return ["entry-reference-still", "authored-transition", "exit-reference-still"].includes(role)
    && Boolean(
      shot.camera_framing_contract?.cropPolicy === "certified-centered-cover-no-motion"
      || shot.decision_evidence?.atomicTransition?.visualValidation
      || shot.decisionEvidence?.atomicTransition?.visualValidation,
    );
}

function coverCrop(sourceAspect, targetAspect, doctrine) {
  const width = sourceAspect >= targetAspect ? targetAspect / sourceAspect : 1;
  const height = sourceAspect >= targetAspect ? 1 : sourceAspect / targetAspect;
  const maxX = Math.max(0, 1 - width);
  const maxY = Math.max(0, 1 - height);
  if (maxY <= 0.000001) {
    const centered = { x: round(maxX / 2), y: 0, width: round(width), height: round(height) };
    return { startCrop: centered, endCrop: clone(centered) };
  }
  const top = 0;
  const nearTop = Math.min(maxY, maxY * 0.015);
  const startY = doctrine.startAnchor === "top" ? top : maxY;
  const endY = doctrine.endAnchor === "bottom" ? maxY : nearTop;
  return {
    startCrop: { x: round(maxX / 2), y: round(startY), width: round(width), height: round(height) },
    endCrop: { x: round(maxX / 2), y: round(endY), width: round(width), height: round(height) },
  };
}

export function resolveEchoHorizontalPortraitCameraDoctrine(value) {
  const id = typeof value === "object" ? text(value?.id) : text(value);
  const doctrine = ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINES.find((row) => row.id === id);
  if (!doctrine) throw new Error(`Unknown horizontal portrait camera doctrine: ${id || "missing"}.`);
  return doctrine;
}

function applyDoctrineToShot(shot, doctrine, outputProfile, index) {
  const dimensions = shotDimensions(shot);
  const sourceAspect = dimensions.width / dimensions.height;
  const targetAspect = outputProfile.width / outputProfile.height;
  const targetAspects = [...new Set([targetAspect, 16 / 9, 9 / 16, 1])];
  const existingFraming = shot.camera_framing_contract || shot.cameraFramingContract || {};
  const subjectROI = clone(existingFraming.subjectROI || existingFraming.path?.subjectROI) || {
    x: 0.25,
    y: 0.2,
    width: 0.5,
    height: 0.6,
    status: "center-safe-fallback",
    evidence: "portrait-source-full-height-scan-doctrine",
    faceCount: 0,
  };
  subjectROI.status = text(subjectROI.status, "inherited-or-center-safe");
  subjectROI.evidence = text(subjectROI.evidence, "portrait-source-full-height-scan-doctrine");
  subjectROI.faceCount = Number.isFinite(Number(subjectROI.faceCount)) ? Number(subjectROI.faceCount) : 0;
  const mediaId = text(shot.media_id || shot.mediaId);
  const startSeconds = Number(shot.start_sec ?? shot.startSeconds ?? 0);
  const endSeconds = Number(shot.end_sec ?? shot.endSeconds ?? startSeconds);
  const corridors = targetAspects.map((aspect) => ({
    targetAspect: aspect,
    ...coverCrop(sourceAspect, aspect, doctrine),
    fullBleed: true,
    blackMatExposure: false,
  }));
  const path = {
    id: `camera-path:horizontal-portrait:${compactHash([mediaId, doctrine.id, index, startSeconds, endSeconds])}`,
    schemaVersion: "hapa.director.media-role-camera.v1",
    mediaId,
    shotRole: "portrait-full-height-scan",
    phraseCue: {
      id: text(shot.section_id || shot.sectionId, `shot-${index}`),
      atSeconds: startSeconds,
      source: "horizontal-portrait-camera-doctrine",
    },
    subjectROI,
    easing: "linear",
    zoomLimits: { min: 1, max: 1.18, startCloseCrop: true },
    corridors,
    keyframes: [
      { offset: 0, crop: clone(corridors[0].startCrop), zoom: 1 },
      { offset: 1, crop: clone(corridors[0].endCrop), zoom: 1 },
    ],
    sourceDimensions: clone(dimensions),
    sourceAspect,
    sourceOrientation: "portrait",
    activeTargetAspect: targetAspect,
    activeOutputProfileId: outputProfile.id,
    doctrine: { schemaVersion: ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINE_SCHEMA, id: doctrine.id },
  };
  const pathValidation = validateSafeCameraPath(path);
  if (!pathValidation.ok) {
    throw new Error(`Shot ${index} generated an unsafe portrait scan path: ${pathValidation.errors.join(", ")}.`);
  }
  const contract = {
    schemaVersion: "hapa.echo.asset-camera-framing.v2",
    mediaId,
    mediaTechnicalIdentity: shot.media_technical_identity || null,
    reason: "portrait-source-in-landscape-output-full-height-scan",
    derived: true,
    parentMediaId: mediaId,
    parentOrientation: "portrait",
    sourceDimensions: { ...dimensions, measured: true },
    sourceAspect,
    sourceOrientation: "portrait",
    outputProfile: {
      id: outputProfile.id,
      width: outputProfile.width,
      height: outputProfile.height,
      aspect: targetAspect,
      orientation: "landscape",
    },
    cropPolicy: "aspect-cover-full-height-portrait-scan",
    motion: doctrine.motion,
    intensity: doctrine.intensity,
    speed: doctrine.speed,
    focus: doctrine.endAnchor === "near-top" ? "top-center" : "center",
    shotRole: path.shotRole,
    subjectROI: clone(subjectROI),
    doctrine: {
      schemaVersion: ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINE_SCHEMA,
      id: doctrine.id,
      label: doctrine.label,
      startAnchor: doctrine.startAnchor,
      endAnchor: doctrine.endAnchor,
      fullHeightCoverage: true,
    },
    path,
  };
  const decisionEvidence = clone(shot.decision_evidence || shot.decisionEvidence || {});
  decisionEvidence.preservedDirection = {
    ...(decisionEvidence.preservedDirection || {}),
    camera: false,
  };
  decisionEvidence.cameraFraming = {
    status: "rederived-by-horizontal-portrait-camera-doctrine",
    reason: contract.reason,
    contractSchema: contract.schemaVersion,
    doctrineId: doctrine.id,
    sourceOrientation: "portrait",
    outputOrientation: "landscape",
    mediaId,
  };
  return {
    ...clone(shot),
    camera_motion: doctrine.motion,
    camera_intensity: doctrine.intensity,
    camera_speed: doctrine.speed,
    camera_focus: contract.focus,
    camera_framing_contract: contract,
    decision_evidence: decisionEvidence,
  };
}

export function applyEchoHorizontalPortraitCameraDoctrine({
  project = {},
  timeline = project.timeline || [],
  doctrine: doctrineValue,
} = {}) {
  const doctrine = resolveEchoHorizontalPortraitCameraDoctrine(doctrineValue);
  const outputProfile = resolveEchoOutputProfile(
    project.output_profile || project.outputProfile || project,
  );
  if (!(outputProfile.width > outputProfile.height)) {
    return {
      doctrine,
      outputProfile,
      timeline: clone(timeline),
      telemetry: {
        totalShots: Array.isArray(timeline) ? timeline.length : 0,
        portraitVideoShots: 0,
        reframedShots: 0,
        certifiedAtomicShotsPreserved: 0,
        skippedNonLandscapeOutput: true,
      },
    };
  }
  let portraitVideoShots = 0;
  let reframedShots = 0;
  let certifiedAtomicShotsPreserved = 0;
  const nextTimeline = (Array.isArray(timeline) ? timeline : []).map((shot, index) => {
    const dimensions = shotDimensions(shot);
    if (!dimensions || !(dimensions.height > dimensions.width) || !isVideoShot(shot)) return clone(shot);
    portraitVideoShots += 1;
    if (isCertifiedAtomicShot(shot)) {
      certifiedAtomicShotsPreserved += 1;
      return clone(shot);
    }
    reframedShots += 1;
    return applyDoctrineToShot(shot, doctrine, outputProfile, index);
  });
  return {
    doctrine,
    outputProfile,
    timeline: nextTimeline,
    telemetry: {
      totalShots: nextTimeline.length,
      portraitVideoShots,
      reframedShots,
      certifiedAtomicShotsPreserved,
      skippedNonLandscapeOutput: false,
      speed: doctrine.speed,
      intensity: doctrine.intensity,
      fullHeightCoverage: true,
    },
  };
}
