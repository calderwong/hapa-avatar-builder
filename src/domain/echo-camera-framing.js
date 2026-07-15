const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const clamp = (value, minimum = 0, maximum = 1) => Math.max(minimum, Math.min(maximum, finite(value)));

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
  const centerX = clamp(normalized.x + (normalized.width / 2)) * 100;
  const centerY = clamp(normalized.y + (normalized.height / 2)) * 100;
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
