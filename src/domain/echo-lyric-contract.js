export const ECHO_LYRIC_CONTRACT_SCHEMA = "hapa.echo.lyric-overlay.v1";

export const ECHO_LYRIC_TEMPLATES = Object.freeze([
  Object.freeze({
    id: "kinetic-word-burst-v1",
    label: "Kinetic Word Burst",
    legacyVariant: "signal-karaoke",
    motion: "split-word-stagger-impact",
  }),
  Object.freeze({
    id: "scanline-phrase-ribbon-v1",
    label: "Scanline Phrase Ribbon",
    legacyVariant: "scanline-ribbon",
    motion: "phrase-window-active-word-scan",
  }),
  Object.freeze({
    id: "stacked-hook-echo-v1",
    label: "Stacked Hook Echo",
    legacyVariant: "stacked-echo",
    motion: "hook-stack-bounded-decay",
  }),
  Object.freeze({
    id: "orbit-caption-v1",
    label: "Orbit Caption",
    legacyVariant: "orbit-caption",
    motion: "protected-region-arc-rail",
  }),
]);

const TEMPLATE_BY_ID = new Map(ECHO_LYRIC_TEMPLATES.map((template) => [template.id, template]));
const LEGACY_TEMPLATE_IDS = Object.freeze({
  "phrase-window": "scanline-phrase-ribbon-v1",
  "scanline-ribbon": "scanline-phrase-ribbon-v1",
  "signal-karaoke": "kinetic-word-burst-v1",
  "stacked-echo": "stacked-hook-echo-v1",
  "orbit-caption": "orbit-caption-v1",
});

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function echoLyricTemplateIdFromLegacyVariant(variant = "") {
  return LEGACY_TEMPLATE_IDS[text(variant)] || "scanline-phrase-ribbon-v1";
}

export function echoLyricTemplate(value = "") {
  const id = TEMPLATE_BY_ID.has(text(value)) ? text(value) : echoLyricTemplateIdFromLegacyVariant(value);
  return TEMPLATE_BY_ID.get(id) || ECHO_LYRIC_TEMPLATES[1];
}

export function normalizeEchoLyricContract(projectInput = {}) {
  const project = projectInput && typeof projectInput === "object" && !Array.isArray(projectInput)
    ? projectInput
    : {};
  const source = project?.lyrics && typeof project.lyrics === "object" && !Array.isArray(project.lyrics)
    ? project.lyrics
    : {};
  const enabled = source.enabled === undefined
    ? project.lyrics_enabled !== false
    : source.enabled !== false;
  const legacyVariant = text(source.legacyVariant || project.lyric_variant) || "phrase-window";
  const template = echoLyricTemplate(source.templateId || source.template_id || project.lyric_template_id || legacyVariant);
  const timingTruth = project.lyric_timing_truth || {};
  const timingHeal = project.lyric_timing_heal || {};
  const mapProvenance = project.song_edit_map?.provenance || {};
  return {
    schemaVersion: ECHO_LYRIC_CONTRACT_SCHEMA,
    enabled,
    templateId: template.id,
    templateLabel: template.label,
    legacyVariant,
    position: text(source.position || project.lyric_position) || "bottom-center",
    style: text(source.style || project.lyric_style) || "neon-cyan",
    timingSource: text(
      source.timingSource
        || timingTruth.timingSource
        || mapProvenance.lyricTimingSource
        || timingHeal.timingSource,
    ) || "missing",
    timingSourcePath: text(
      source.timingSourcePath
        || timingTruth.timingSourcePath
        || mapProvenance.lyricTimingPath
        || timingHeal.timingPath,
    ),
    timingHash: text(
      source.timingHash
        || timingTruth.activeTimingSha256
        || mapProvenance.activeTimingSha256
        || timingHeal.activeTimingSha256,
    ),
    audioHash: text(source.audioHash || timingTruth.audioSha256 || mapProvenance.audioSha256),
    confidence: Number(source.confidence ?? timingTruth.confidence ?? timingHeal.timingConfidence ?? 0),
    reducedMotion: source.reducedMotion === true,
    safeArea: source.safeArea && typeof source.safeArea === "object" ? structuredClone(source.safeArea) : null,
  };
}

export function echoLyricSourceLines(project = {}) {
  return Array.isArray(project?.timed_lyrics) ? project.timed_lyrics : [];
}

export function echoLyricOverlayLines(project = {}) {
  return normalizeEchoLyricContract(project).enabled ? echoLyricSourceLines(project) : [];
}

export function attachEchoLyricContract(projectInput = {}) {
  const project = projectInput && typeof projectInput === "object" && !Array.isArray(projectInput)
    ? projectInput
    : {};
  const lyrics = normalizeEchoLyricContract(project);
  return {
    ...project,
    lyrics,
    lyrics_enabled: lyrics.enabled,
    lyric_template_id: lyrics.templateId,
  };
}
