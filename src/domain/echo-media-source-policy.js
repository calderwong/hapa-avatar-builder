const HAPA_DEV_PROTO_MEDIA_ROOTS = [
  "/users/calderwong/comics/reviclips/",
  "/users/calderwong/comics/hapa-trains/",
];


function normalizedToken(value = "") {
  return String(value).trim().toLowerCase().replace(/[_\s]+/g, "-");
}

function sourceValues(value = {}) {
  return [
    value?.source,
    value?.sourceSystem,
    value?.cardSourceSystem,
    value?.adapterId,
    value?.sourceAdapter,
    value?.sourceRepo,
    value?.sourceRepository,
    value?.sourceNode,
    value?.sourceKind,
    value?.originId,
    value?.originNode,
    value?.sourcePath,
    value?.targetPath,
    value?.originalPath,
  ].filter(Boolean);
}

function normalizedSourceValue(value = "") {
  return String(value).trim().toLowerCase().replaceAll("\\", "/");
}

function isDevProtoSourceValue(value = "") {
  const normalized = normalizedSourceValue(value);
  return normalizedToken(normalized).includes("hapa-dev-proto")
    || HAPA_DEV_PROTO_MEDIA_ROOTS.some((root) => normalized.startsWith(root));
}

function isHellWeekSourceValue(value = "") {
  return normalizedToken(normalizedSourceValue(value)).includes("hell-week");
}

function hasExplicitOriginMatch(predicate, records = []) {
  const queue = records.filter(Boolean);
  const visited = new Set();
  while (queue.length) {
    const value = queue.shift();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    if (sourceValues(value).some((entry) => predicate(entry))) return true;
    for (const key of ["origin", "provenance", "sourceProvenance", "cardOrigin", "hapaOrigin", "records", "folderIngest", "storage"]) {
      const nested = value[key];
      if (Array.isArray(nested)) queue.push(...nested);
      else if (nested && typeof nested === "object") queue.push(nested);
    }
  }
  return false;
}

/**
 * Excludes a Card only when its explicit origin/provenance names hapa-dev-proto.
 * Titles, OCR, descriptive tags, and lore are intentionally not searched.
 */
export function hasHapaDevProtoOrigin(...records) {
  return hasExplicitOriginMatch(isDevProtoSourceValue, records);
}

/** Excludes Hell Week only when explicit origin/provenance names it. */
export function hasHellWeekOrigin(...records) {
  return hasExplicitOriginMatch(isHellWeekSourceValue, records);
}

/** Shared exclusion contract for new Echo Director media passes. */
export function hasExcludedEchoDirectorOrigin(...records) {
  return hasHapaDevProtoOrigin(...records) || hasHellWeekOrigin(...records);
}
