import path from "node:path";

const PATH_SAFETY_ERROR_CODE = "ERR_ECHO_ENRICHMENT_UNSAFE_PATH";
const ENCODED_PATH_CONTROL = /%(?:00|25|2e|2f|5c)/iu;
const MALFORMED_PERCENT_ESCAPE = /%(?![a-f0-9]{2})/iu;
const PATH_SEPARATOR = /[\\/]/u;
const WINDOWS_DRIVE_PREFIX = /^[a-z]:/iu;

function unsafePath(label, reason) {
  const error = new TypeError(`${label} ${reason}`);
  error.code = PATH_SAFETY_ERROR_CODE;
  return error;
}

function requireString(value, label, { canonicalWhitespace = false } = {}) {
  if (typeof value !== "string") throw unsafePath(label, "must be a string.");
  if (!value.length || !value.trim().length) throw unsafePath(label, "must not be empty.");
  if (value.includes("\0")) throw unsafePath(label, "must not contain NUL.");
  if (canonicalWhitespace && value.trim() !== value) {
    throw unsafePath(label, "must not have leading or trailing whitespace.");
  }
  return value;
}

function decodedPathLayers(value, label) {
  const layers = [value];
  let current = value;

  if (MALFORMED_PERCENT_ESCAPE.test(current)) {
    throw unsafePath(label, "contains a malformed percent escape.");
  }
  if (ENCODED_PATH_CONTROL.test(current)) {
    throw unsafePath(label, "contains an encoded path control.");
  }

  if (!current.includes("%")) return layers;

  try {
    current = decodeURIComponent(current);
  } catch {
    throw unsafePath(label, "contains an invalid percent escape.");
  }

  if (current.includes("\0")) throw unsafePath(label, "contains an encoded NUL.");
  layers.push(current);
  return layers;
}

function pathSegments(value) {
  return value.split(PATH_SEPARATOR);
}

function assertRelativeSegments(value, label) {
  if (path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || WINDOWS_DRIVE_PREFIX.test(value)) {
    throw unsafePath(label, "must be relative.");
  }

  const segments = pathSegments(value);
  if (!segments.length || segments.some((segment) => !segment.length)) {
    throw unsafePath(label, "must not contain empty path segments.");
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw unsafePath(label, "must not contain dot traversal segments.");
  }
  return segments;
}

/**
 * Validates and returns a song ID that is safe as one path segment.
 *
 * The check is intentionally lexical and fail-closed. It does not coerce,
 * trim, decode, or otherwise rewrite the supplied identity.
 */
function validateEchoEnrichmentPathSegment(value, label) {
  const canonicalValue = requireString(value, label, { canonicalWhitespace: true });

  for (const layer of decodedPathLayers(canonicalValue, label)) {
    if (path.posix.isAbsolute(layer) || path.win32.isAbsolute(layer) || WINDOWS_DRIVE_PREFIX.test(layer)) {
      throw unsafePath(label, "must not be absolute.");
    }
    if (PATH_SEPARATOR.test(layer)) {
      throw unsafePath(label, "must be exactly one path segment.");
    }
    if (layer === "." || layer === "..") {
      throw unsafePath(label, "must not be a dot path segment.");
    }
  }

  return canonicalValue;
}

export function validateEchoEnrichmentSongId(songId) {
  return validateEchoEnrichmentPathSegment(songId, "songId");
}

/** Validates a Director-variant ID before it becomes a filename segment. */
export function validateEchoEnrichmentVariantId(variantId) {
  return validateEchoEnrichmentPathSegment(variantId, "variantId");
}

/**
 * Resolves a relative Director-variant path beneath a lexical root.
 *
 * Both slash styles are treated as separators before resolution so the same
 * input cannot become safe or unsafe merely by moving between host platforms.
 * This helper performs no filesystem access and does not rely on realpath or
 * symlink state for its containment decision.
 */
export function resolveEchoEnrichmentVariantPath(rootPath, relativeVariantPath) {
  const root = requireString(rootPath, "variant root");
  const relative = requireString(relativeVariantPath, "variant path", { canonicalWhitespace: true });

  const layers = decodedPathLayers(relative, "variant path");
  for (const layer of layers) assertRelativeSegments(layer, "variant path");

  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, ...pathSegments(relative));
  const containment = path.relative(resolvedRoot, resolvedPath);
  const escapes = !containment
    || containment === ".."
    || containment.startsWith(`..${path.sep}`)
    || path.isAbsolute(containment);

  if (escapes) throw unsafePath("variant path", "escapes the resolved variant root.");
  return resolvedPath;
}
