import { resolveEchoOutputProfile } from "./echo-output-profile.js";
import { validateSafeCameraPath } from "./media-role-camera.js";

export const ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINE_SCHEMA =
  "hapa.echo.horizontal-portrait-camera-doctrine.v1";

// A tall source (portrait or square) shown in a landscape frame with
// `object-fit: cover` loses most of its height. Locking or zooming that crop cuts
// heads and action off, so every such shot scans the full source height: from the
// very top down, or from the very bottom up. `scan-down`/`scan-up` are rendered by
// echoCameraMotionPresentation with no extra zoom and independent of intensity.
export const ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINES = Object.freeze([
  Object.freeze({
    id: "alternating-full-height-scan-v2",
    label: "Full-Height Scan · Alternating Down/Up",
    cutOrdinal: 3,
    firstMotion: "scan-down",
    alternate: true,
  }),
  Object.freeze({
    id: "top-first-fast-scan-v1",
    label: "Top First · Full-Height Scan Down",
    cutOrdinal: 1,
    firstMotion: "scan-down",
    alternate: false,
  }),
  Object.freeze({
    id: "top-arrival-fast-scan-v1",
    label: "Bottom First · Full-Height Scan Up",
    cutOrdinal: 2,
    firstMotion: "scan-up",
    alternate: false,
  }),
]);

export const ECHO_PORTRAIT_SCAN_DEFAULT_DOCTRINE_ID = "alternating-full-height-scan-v2";
// Scan when the landscape cover crop would hide at least 35% of the source height.
export const ECHO_PORTRAIT_SCAN_MAX_VISIBLE_HEIGHT = 0.65;

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

function hasPlayableMedia(shot = {}) {
  const id = text(shot.media_id || shot.mediaId);
  if (id === "none") return false;
  return Boolean(id || text(shot.runtime_media_uri || shot.media_contract?.runtimeUri || shot.media_uri));
}

function hasProtectedCropPath(shot = {}) {
  const keyframes = Array.isArray(shot.cameraKeyframes) ? shot.cameraKeyframes : [];
  return keyframes.some((row) => ["protected-v2", "section-crop-v1"].includes(row?.crop?.cameraModel));
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

function coverCrop(sourceAspect, targetAspect, motion) {
  const width = sourceAspect >= targetAspect ? targetAspect / sourceAspect : 1;
  const height = sourceAspect >= targetAspect ? 1 : sourceAspect / targetAspect;
  const maxX = Math.max(0, 1 - width);
  const maxY = Math.max(0, 1 - height);
  const x = round(maxX / 2);
  const top = { x, y: 0, width: round(width), height: round(height) };
  const bottom = { x, y: round(maxY), width: round(width), height: round(height) };
  return motion === "scan-up" ? { startCrop: bottom, endCrop: top } : { startCrop: top, endCrop: bottom };
}

/** Fraction of the source height a cover crop shows in the output frame. */
export function echoCoverVisibleHeightFraction(sourceAspect, outputAspect) {
  const source = positive(sourceAspect), output = positive(outputAspect);
  if (!source || !output) return 1;
  return Math.min(1, source / output);
}

/** Why a shot does or does not need a full-height scan in this output. */
export function echoShotPortraitScanEligibility(shot = {}, outputProfile = {}) {
  const width = positive(outputProfile.width), height = positive(outputProfile.height);
  if (!(width > height)) return { eligible: false, reason: "non-landscape-output" };
  if (!hasPlayableMedia(shot)) return { eligible: false, reason: "no-media" };
  const dimensions = shotDimensions(shot);
  if (!dimensions) return { eligible: false, reason: "dimensions-unknown" };
  const visibleHeightFraction = echoCoverVisibleHeightFraction(dimensions.width / dimensions.height, width / height);
  if (visibleHeightFraction >= ECHO_PORTRAIT_SCAN_MAX_VISIBLE_HEIGHT) return { eligible: false, reason: "fits-frame", visibleHeightFraction };
  if (isCertifiedAtomicShot(shot)) return { eligible: false, reason: "certified-atomic-transition", visibleHeightFraction };
  if ((Array.isArray(shot.locks) ? shot.locks : []).includes("camera")) return { eligible: false, reason: "camera-locked", visibleHeightFraction };
  if (hasProtectedCropPath(shot)) return { eligible: false, reason: "protected-crop-path", visibleHeightFraction };
  return { eligible: true, reason: "tall-source-in-landscape", visibleHeightFraction, dimensions };
}

export function resolveEchoHorizontalPortraitCameraDoctrine(value) {
  const id = typeof value === "object" ? text(value?.id) : text(value);
  const doctrine = ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINES.find((row) => row.id === id);
  if (!doctrine) throw new Error(`Unknown horizontal portrait camera doctrine: ${id || "missing"}.`);
  return doctrine;
}

// Compact mode: playback is driven by camera_motion alone, so drop any stale
// framing contract (it described a different camera) and keep small evidence.
function applyCompactScanToShot(shot, doctrine, motion, visibleHeightFraction) {
  const next = clone(shot);
  delete next.camera_framing_contract;
  delete next.cameraFramingContract;
  const decisionEvidence = clone(shot.decision_evidence || shot.decisionEvidence || {});
  decisionEvidence.preservedDirection = { ...(decisionEvidence.preservedDirection || {}), camera: false };
  decisionEvidence.cameraFraming = {
    status: "rederived-by-horizontal-portrait-camera-doctrine",
    reason: "portrait-source-in-landscape-output-full-height-scan",
    doctrineId: doctrine.id,
    motion,
    previousMotion: text(shot.camera_motion, "auto"),
    visibleHeightFraction: round(visibleHeightFraction),
  };
  return { ...next, camera_motion: motion, camera_intensity: 1, camera_speed: 1, camera_focus: "vertical-scan", decision_evidence: decisionEvidence };
}

function applyDoctrineToShot(shot, doctrine, outputProfile, index, motion, visibleHeightFraction) {
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
    ...coverCrop(sourceAspect, aspect, motion),
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
    zoomLimits: { min: 1, max: 1, startCloseCrop: true },
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
    motion,
    intensity: 1,
    speed: 1,
    focus: "vertical-scan",
    shotRole: path.shotRole,
    subjectROI: clone(subjectROI),
    doctrine: {
      schemaVersion: ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINE_SCHEMA,
      id: doctrine.id,
      label: doctrine.label,
      startAnchor: motion === "scan-up" ? "bottom" : "top",
      endAnchor: motion === "scan-up" ? "top" : "bottom",
      visibleHeightFraction: round(visibleHeightFraction),
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
    motion,
    previousMotion: text(shot.camera_motion, "auto"),
    visibleHeightFraction: round(visibleHeightFraction),
    mediaId,
  };
  return {
    ...clone(shot),
    camera_motion: motion,
    camera_intensity: 1,
    camera_speed: 1,
    camera_focus: contract.focus,
    camera_framing_contract: contract,
    decision_evidence: decisionEvidence,
  };
}

export function applyEchoHorizontalPortraitCameraDoctrine({
  project = {},
  timeline = project.timeline || [],
  doctrine: doctrineValue = ECHO_PORTRAIT_SCAN_DEFAULT_DOCTRINE_ID,
  outputProfile: outputProfileValue = null,
  contractMode = "full",
} = {}) {
  const doctrine = resolveEchoHorizontalPortraitCameraDoctrine(doctrineValue);
  const outputProfile = resolveEchoOutputProfile(
    outputProfileValue || project.output_profile || project.outputProfile || project,
  );
  const rows = Array.isArray(timeline) ? timeline : [];
  if (!(outputProfile.width > outputProfile.height)) {
    return {
      doctrine,
      outputProfile,
      timeline: clone(rows),
      telemetry: { totalShots: rows.length, tallMediaShots: 0, reframedShots: 0, skipped: {}, skippedNonLandscapeOutput: true },
    };
  }
  const skipped = {};
  let tallMediaShots = 0;
  let reframedShots = 0;
  let scans = 0;
  const motions = { "scan-down": 0, "scan-up": 0 };
  const nextTimeline = rows.map((shot, index) => {
    const eligibility = echoShotPortraitScanEligibility(shot, outputProfile);
    if (eligibility.visibleHeightFraction !== undefined && eligibility.visibleHeightFraction < ECHO_PORTRAIT_SCAN_MAX_VISIBLE_HEIGHT) tallMediaShots += 1;
    if (!eligibility.eligible) {
      if (eligibility.reason !== "fits-frame" && eligibility.reason !== "no-media") skipped[eligibility.reason] = (skipped[eligibility.reason] || 0) + 1;
      return clone(shot);
    }
    // Alternate down/up so consecutive tall shots hand off top-to-bottom-to-top.
    const opposite = doctrine.firstMotion === "scan-down" ? "scan-up" : "scan-down";
    const motion = doctrine.alternate && scans % 2 ? opposite : doctrine.firstMotion;
    scans += 1;
    reframedShots += 1;
    motions[motion] += 1;
    return contractMode === "compact"
      ? applyCompactScanToShot(shot, doctrine, motion, eligibility.visibleHeightFraction)
      : applyDoctrineToShot(shot, doctrine, outputProfile, index, motion, eligibility.visibleHeightFraction);
  });
  return {
    doctrine,
    outputProfile,
    timeline: nextTimeline,
    telemetry: {
      totalShots: nextTimeline.length,
      tallMediaShots,
      portraitVideoShots: tallMediaShots,
      reframedShots,
      motions,
      skipped,
      certifiedAtomicShotsPreserved: skipped["certified-atomic-transition"] || 0,
      skippedNonLandscapeOutput: false,
      maxVisibleHeightFraction: ECHO_PORTRAIT_SCAN_MAX_VISIBLE_HEIGHT,
      fullHeightCoverage: true,
    },
  };
}

/** Director entry point: give every tall shot in a landscape cut a full-height scan.
 * Compact by default (camera_motion drives every renderer); pass contractMode
 * "full" where a validator requires a complete asset camera framing contract. */
export function applyEchoPortraitScanCamera({ project = {}, timeline = project.timeline || [], outputProfile = null, contractMode = "compact" } = {}) {
  return applyEchoHorizontalPortraitCameraDoctrine({ project, timeline, outputProfile, doctrine: ECHO_PORTRAIT_SCAN_DEFAULT_DOCTRINE_ID, contractMode });
}
