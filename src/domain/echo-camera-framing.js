const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, finite(value)));
const round = (value, digits = 6) => {
  const factor = 10 ** digits;
  const result = Math.round(finite(value) * factor) / factor;
  return Object.is(result, -0) ? 0 : result;
};

const PORTRAIT_AUTO_MOTIONS = Object.freeze([
  "pan-down",
  "pan-up",
  "pan-down-left",
  "pan-up-right",
  "pan-down",
  "pan-up-left",
]);

const LANDSCAPE_AUTO_MOTIONS = Object.freeze([
  "pan-down",
  "pan-up",
  "pan-up-left",
  "pan-down-right",
  "slow-push-in",
  "pan-up-right",
  "pan-down-left",
  "drift-diagonal",
]);

export function normalizeEchoCameraCrop(crop = null) {
  if (!crop || typeof crop !== "object") return null;
  const x = clamp(crop.x);
  const y = clamp(crop.y);
  const width = Math.min(1 - x, clamp(crop.width, 0.000001, 1));
  const height = Math.min(1 - y, clamp(crop.height, 0.000001, 1));
  if (!(width > 0 && height > 0)) return null;
  return { x, y, width, height };
}

export function echoCameraCropPresentation(crop = null) {
  const normalized = normalizeEchoCameraCrop(crop);
  if (!normalized) return null;
  // CSS object-position is a percentage of the *remaining overflow*, not a
  // normalized source-space center. Converting x/y against the remaining crop
  // range makes a y=0 portrait corridor actually show the source top and a
  // y=(1-height) corridor actually show its bottom.
  const centerX = normalized.width >= 0.999999
    ? 50
    : clamp(normalized.x / (1 - normalized.width)) * 100;
  const centerY = normalized.height >= 0.999999
    ? 50
    : clamp(normalized.y / (1 - normalized.height)) * 100;
  const scale = 1 / Math.max(normalized.width, normalized.height);
  const objectPosition = `${centerX.toFixed(3)}% ${centerY.toFixed(3)}%`;
  return {
    crop: normalized,
    centerX,
    centerY,
    scale,
    objectPosition,
    transformOrigin: objectPosition,
  };
}

/**
 * Resolves Director camera motion into renderer-neutral numeric framing.
 * Consumers may map these values to CSS transforms or Canvas2D operations,
 * keeping the camera decision identical across preview surfaces.
 */
export function echoCameraMotionPresentation({
  startSeconds = 0,
  endSeconds = Number(startSeconds) + 1,
  timeSeconds = startSeconds,
  motion = "auto",
  intensity = 1,
  speed,
  shotIndex = 0,
  sourceId = "",
  isPortrait = false,
  crop = null,
} = {}) {
  const start = finite(startSeconds);
  const end = finite(endSeconds, start + 1);
  const duration = Math.max(0.1, end - start);
  const rawProgress = clamp((finite(timeSeconds, start) - start) / duration);
  const normalizedShotIndex = Math.max(0, Math.trunc(finite(shotIndex)));
  const fallbackSpeed = 1.15 + (
    (normalizedShotIndex * 17 + String(sourceId || "").length) % 7
  ) * 0.13;
  const resolvedSpeed = clamp(speed === undefined || speed === null || speed === ""
    ? fallbackSpeed
    : speed, 0.75, 2.4);
  const pacedProgress = clamp(Math.pow(rawProgress, 1 / resolvedSpeed));
  const progress = pacedProgress * pacedProgress * (3 - (2 * pacedProgress));
  const resolvedIntensity = clamp(intensity, 0, 2);
  const declaredMotion = String(motion || "auto").trim().toLowerCase() || "auto";
  const motionAliases = {
    "tilt-up": "pan-up",
    "tilt-down": "pan-down",
    "slow-push": "slow-push-in",
    "push-in": "slow-push-in",
    "slow-pull": "slow-pull-out",
    "pull-out": "slow-pull-out",
    "static-shot": "static",
  };
  const normalizedMotion = motionAliases[declaredMotion] || declaredMotion;
  const autoMotions = isPortrait ? PORTRAIT_AUTO_MOTIONS : LANDSCAPE_AUTO_MOTIONS;
  const resolvedMotion = normalizedMotion === "auto"
    ? autoMotions[normalizedShotIndex % autoMotions.length]
    : normalizedMotion;
  const cropPresentation = echoCameraCropPresentation(crop);
  // A declared crop corridor already describes the complete cover framing. The
  // legacy portrait/landscape emphasis is only a fallback for pathless shots;
  // applying it on top of a corridor silently zooms away the corridor edges.
  const baseScale = cropPresentation ? 1 : isPortrait ? 1.34 : 1.18;
  const translateSpan = 4.8 * resolvedIntensity * resolvedSpeed;
  const positionSpan = Math.min(
    42,
    (isPortrait ? 30 : 22) * resolvedIntensity * Math.min(1.35, resolvedSpeed),
  );
  let scale = baseScale;
  let translateXPercent = 0;
  let translateYPercent = 0;
  let objectPositionXPercent = 50;
  let objectPositionYPercent = 50;
  const setDirectionalPan = (xDirection, yDirection) => {
    const phase = (progress * 2) - 1;
    if (xDirection) {
      translateXPercent = xDirection * translateSpan * phase;
      objectPositionXPercent = 50 + (xDirection * positionSpan * phase);
    }
    if (yDirection) {
      translateYPercent = yDirection * translateSpan * phase;
      objectPositionYPercent = 50 + (yDirection * positionSpan * phase);
    }
    scale = baseScale + (xDirection && yDirection ? 0.05 : 0) + (0.04 * resolvedIntensity);
  };

  if (resolvedMotion === "static") {
    // A certified static crop already defines the complete cover framing. Applying the
    // legacy portrait emphasis on top of it would silently zoom Preview/export away from
    // the exact Reference seam even at zero intensity.
    scale = cropPresentation && resolvedIntensity === 0 ? 1 : isPortrait ? 1.18 : 1;
  } else if (resolvedMotion === "slow-push-in") {
    scale = baseScale + (0.16 * resolvedIntensity * progress * resolvedSpeed);
  } else if (resolvedMotion === "slow-pull-out") {
    scale = baseScale + (0.16 * resolvedIntensity * (1 - progress) * resolvedSpeed);
  } else if (resolvedMotion === "pan-left") {
    setDirectionalPan(-1, 0);
  } else if (resolvedMotion === "pan-right") {
    setDirectionalPan(1, 0);
  } else if (resolvedMotion === "pan-up") {
    setDirectionalPan(0, -1);
  } else if (resolvedMotion === "pan-down") {
    setDirectionalPan(0, 1);
  } else if (resolvedMotion === "pan-up-left") {
    setDirectionalPan(-1, -1);
  } else if (resolvedMotion === "pan-up-right") {
    setDirectionalPan(1, -1);
  } else if (resolvedMotion === "pan-down-left") {
    setDirectionalPan(-1, 1);
  } else if (resolvedMotion === "pan-down-right") {
    setDirectionalPan(1, 1);
  } else if (resolvedMotion === "drift-diagonal") {
    setDirectionalPan(1, -1);
    scale = baseScale + (0.07 * resolvedIntensity);
  } else if (resolvedMotion === "handheld-float") {
    translateXPercent = Math.sin(rawProgress * Math.PI * 4) * 3.4 * resolvedIntensity * resolvedSpeed;
    translateYPercent = Math.cos(rawProgress * Math.PI * 3) * 2.8 * resolvedIntensity * resolvedSpeed;
    scale = baseScale + (0.025 * resolvedIntensity);
  }

  if (cropPresentation) {
    scale *= cropPresentation.scale;
    objectPositionXPercent = cropPresentation.centerX;
    objectPositionYPercent = cropPresentation.centerY;
  }

  return {
    declaredMotion,
    motion: resolvedMotion,
    auto: normalizedMotion === "auto",
    shotIndex: normalizedShotIndex,
    isPortrait: Boolean(isPortrait),
    startSeconds: round(start),
    endSeconds: round(end),
    durationSeconds: round(duration),
    timeSeconds: round(finite(timeSeconds, start)),
    rawProgress: round(rawProgress),
    pacedProgress: round(pacedProgress),
    progress: round(progress),
    intensity: round(resolvedIntensity),
    speed: round(resolvedSpeed),
    scale: round(scale),
    translateXPercent: round(translateXPercent),
    translateYPercent: round(translateYPercent),
    objectPositionXPercent: round(clamp(objectPositionXPercent, 0, 100)),
    objectPositionYPercent: round(clamp(objectPositionYPercent, 0, 100)),
    transformOriginXPercent: round(cropPresentation?.centerX ?? 50),
    transformOriginYPercent: round(cropPresentation?.centerY ?? 50),
    crop: cropPresentation?.crop || null,
    cropScale: round(cropPresentation?.scale ?? 1),
  };
}

/**
 * Projects the CSS preview contract (`object-fit: cover`, object-position,
 * transform-origin, then `scale() translate3d()`) into an equivalent Canvas2D
 * source rectangle. This keeps canvas-based surfaces on the same sampled frame
 * as the Echo Album's DOM preview, including asymmetric overflow positioning.
 */
export function echoCameraCoverSourceRect({
  sourceWidth,
  sourceHeight,
  outputWidth,
  outputHeight,
  presentation = null,
} = {}) {
  const safeSourceWidth = Math.max(1, finite(sourceWidth, 1));
  const safeSourceHeight = Math.max(1, finite(sourceHeight, 1));
  const safeOutputWidth = Math.max(1, finite(outputWidth, 1));
  const safeOutputHeight = Math.max(1, finite(outputHeight, 1));
  const camera = presentation && typeof presentation === "object" ? presentation : {};
  const coverScale = Math.max(
    safeOutputWidth / safeSourceWidth,
    safeOutputHeight / safeSourceHeight,
  );
  const renderedWidth = safeSourceWidth * coverScale;
  const renderedHeight = safeSourceHeight * coverScale;
  const positionX = clamp(finite(camera.objectPositionXPercent, 50), 0, 100) / 100;
  const positionY = clamp(finite(camera.objectPositionYPercent, 50), 0, 100) / 100;
  const objectLeft = (safeOutputWidth - renderedWidth) * positionX;
  const objectTop = (safeOutputHeight - renderedHeight) * positionY;
  const scale = Math.max(0.01, finite(camera.scale, 1));
  const originX = (clamp(finite(camera.transformOriginXPercent, 50), 0, 100) / 100) * safeOutputWidth;
  const originY = (clamp(finite(camera.transformOriginYPercent, 50), 0, 100) / 100) * safeOutputHeight;
  const translateX = (finite(camera.translateXPercent) / 100) * safeOutputWidth;
  const translateY = (finite(camera.translateYPercent) / 100) * safeOutputHeight;

  // CSS composes `scale() translate3d()` right-to-left. Inverting that
  // transform maps the output viewport back into the video's element box.
  const elementLeft = originX + ((0 - originX) / scale) - translateX;
  const elementTop = originY + ((0 - originY) / scale) - translateY;
  const width = Math.min(safeSourceWidth, safeOutputWidth / (coverScale * scale));
  const height = Math.min(safeSourceHeight, safeOutputHeight / (coverScale * scale));
  const unclampedX = (elementLeft - objectLeft) / coverScale;
  const unclampedY = (elementTop - objectTop) / coverScale;
  const x = clamp(unclampedX, 0, Math.max(0, safeSourceWidth - width));
  const y = clamp(unclampedY, 0, Math.max(0, safeSourceHeight - height));

  return {
    x: round(x),
    y: round(y),
    width: round(width),
    height: round(height),
    coverScale: round(coverScale),
    objectLeft: round(objectLeft),
    objectTop: round(objectTop),
  };
}

export function echoCameraKeyframeAt(keyframes = [], timeSeconds = 0) {
  const rows = Array.isArray(keyframes) ? keyframes : [];
  const time = finite(timeSeconds);
  let index = -1;
  for (let candidateIndex = 0; candidateIndex < rows.length; candidateIndex += 1) {
    if (finite(rows[candidateIndex]?.atSeconds, Number.POSITIVE_INFINITY) <= time) index = candidateIndex;
    else break;
  }
  if (index < 0) return rows[0] ? { ...rows[0] } : null;
  const current = rows[index];
  const next = rows[index + 1];
  const start = finite(current?.atSeconds);
  const end = finite(next?.atSeconds, start);
  const sameCorridor = next
    && end > start
    && String(current?.cameraPathId || "") === String(next?.cameraPathId || "")
    && String(current?.slotId || "") === String(next?.slotId || "");
  const currentCrop = normalizeEchoCameraCrop(current?.crop);
  const nextCrop = sameCorridor ? normalizeEchoCameraCrop(next?.crop) : null;
  if (!currentCrop || !nextCrop) return { ...current };
  const progress = clamp((time - start) / (end - start));
  const mix = (left, right) => Number((left + ((right - left) * progress)).toFixed(12));
  return {
    ...current,
    crop: {
      x: mix(currentCrop.x, nextCrop.x),
      y: mix(currentCrop.y, nextCrop.y),
      width: mix(currentCrop.width, nextCrop.width),
      height: mix(currentCrop.height, nextCrop.height),
    },
  };
}

/**
 * Emits the exact camera-framing implementation for deterministic browser
 * render packages. Keeping the helpers inside one namespace avoids colliding
 * with a host renderer's utility names while preserving the same crop and
 * motion math used by the live Echo preview.
 */
export function echoCameraFramingRuntimeBrowserSource(namespace = "HapaEchoCameraFraming") {
  const safeNamespace = String(namespace || "HapaEchoCameraFraming")
    .replace(/[^A-Za-z0-9_$]/g, "") || "HapaEchoCameraFraming";
  return [
    `const ${safeNamespace}=(()=>{`,
    `const finite=${finite.toString()};`,
    `const clamp=${clamp.toString()};`,
    `const round=${round.toString()};`,
    `const PORTRAIT_AUTO_MOTIONS=Object.freeze(${JSON.stringify(PORTRAIT_AUTO_MOTIONS)});`,
    `const LANDSCAPE_AUTO_MOTIONS=Object.freeze(${JSON.stringify(LANDSCAPE_AUTO_MOTIONS)});`,
    normalizeEchoCameraCrop.toString(),
    echoCameraCropPresentation.toString(),
    echoCameraMotionPresentation.toString(),
    echoCameraCoverSourceRect.toString(),
    echoCameraKeyframeAt.toString(),
    "return {normalizeEchoCameraCrop,echoCameraCropPresentation,echoCameraMotionPresentation,echoCameraCoverSourceRect,echoCameraKeyframeAt};",
    "})();",
  ].join("\n");
}
