export const ECHO_OUTPUT_PROFILE_SCHEMA = "hapa.echo.output-profile.v1";

const LANDSCAPE_SAFE_AREA = Object.freeze({
  actionInset: 0.05,
  titleInset: 0.08,
  lyricBottom: 0.1,
});

const VERTICAL_SAFE_AREA = Object.freeze({
  actionInset: 0.06,
  titleInset: 0.1,
  lyricBottom: 0.14,
});

export const ECHO_LANDSCAPE_OUTPUT_PROFILE = Object.freeze({
  schemaVersion: ECHO_OUTPUT_PROFILE_SCHEMA,
  id: "landscape",
  label: "Landscape",
  orientation: "landscape",
  width: 1920,
  height: 1080,
  aspectRatio: "16:9",
  fps: 30,
  safeArea: LANDSCAPE_SAFE_AREA,
});

export const ECHO_VERTICAL_OUTPUT_PROFILE = Object.freeze({
  schemaVersion: ECHO_OUTPUT_PROFILE_SCHEMA,
  id: "vertical",
  label: "Vertical",
  orientation: "vertical",
  width: 1080,
  height: 1920,
  aspectRatio: "9:16",
  fps: 30,
  safeArea: VERTICAL_SAFE_AREA,
});

export const ECHO_OUTPUT_PROFILES = Object.freeze([
  ECHO_LANDSCAPE_OUTPUT_PROFILE,
  ECHO_VERTICAL_OUTPUT_PROFILE,
]);

export const DEFAULT_ECHO_OUTPUT_PROFILE_ID = ECHO_LANDSCAPE_OUTPUT_PROFILE.id;

const OUTPUT_PROFILE_BY_ID = Object.freeze({
  [ECHO_LANDSCAPE_OUTPUT_PROFILE.id]: ECHO_LANDSCAPE_OUTPUT_PROFILE,
  [ECHO_VERTICAL_OUTPUT_PROFILE.id]: ECHO_VERTICAL_OUTPUT_PROFILE,
});

const OUTPUT_PROFILE_ALIASES = Object.freeze({
  landscape: ECHO_LANDSCAPE_OUTPUT_PROFILE.id,
  "16:9": ECHO_LANDSCAPE_OUTPUT_PROFILE.id,
  "16x9": ECHO_LANDSCAPE_OUTPUT_PROFILE.id,
  "1920x1080": ECHO_LANDSCAPE_OUTPUT_PROFILE.id,
  vertical: ECHO_VERTICAL_OUTPUT_PROFILE.id,
  portrait: ECHO_VERTICAL_OUTPUT_PROFILE.id,
  "9:16": ECHO_VERTICAL_OUTPUT_PROFILE.id,
  "9x16": ECHO_VERTICAL_OUTPUT_PROFILE.id,
  "1080x1920": ECHO_VERTICAL_OUTPUT_PROFILE.id,
});

const text = (value) => String(value ?? "").trim().toLowerCase();

function outputProfileCandidates(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];

  const nested = value.output_profile ?? value.outputProfile;
  const candidates = [
    value.id,
    value.profile_id,
    value.profileId,
    value.orientation,
    value.aspectRatio,
    value.aspect_ratio,
  ];
  if (nested !== undefined && nested !== value) candidates.push(...outputProfileCandidates(nested));

  const width = Number(value.width);
  const height = Number(value.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    candidates.push(height > width ? "vertical" : "landscape");
  }
  return candidates;
}

export function normalizeEchoOutputProfileId(value) {
  for (const candidate of outputProfileCandidates(value)) {
    const id = OUTPUT_PROFILE_ALIASES[text(candidate)];
    if (id) return id;
  }
  return DEFAULT_ECHO_OUTPUT_PROFILE_ID;
}

export function resolveEchoOutputProfile(value) {
  return OUTPUT_PROFILE_BY_ID[normalizeEchoOutputProfileId(value)];
}

export function attachEchoOutputProfile(project = {}, value) {
  const source = value === undefined
    ? project?.output_profile ?? project?.outputProfile ?? project
    : value;
  return {
    ...(project && typeof project === "object" ? project : {}),
    output_profile: resolveEchoOutputProfile(source),
  };
}

export function echoOutputProfileCacheKey(value) {
  const profile = resolveEchoOutputProfile(value);
  return `${ECHO_OUTPUT_PROFILE_SCHEMA}:${profile.id}:${profile.width}x${profile.height}:${profile.aspectRatio}:${profile.fps}fps`;
}
