export const ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA = "hapa.echo.persistent-shader-slots.v1";
export const ECHO_PERSISTENT_SHADER_SLOT_COUNT = 3;

export const ECHO_ULTIMATE_FLAME_SHADER = Object.freeze({
  id: "isf:5e7a7fc27c113618206de3e4",
  title: "UltimateFlame",
});

export const ECHO_AUDIO_WAVE_FORMS_SHADER = Object.freeze({
  id: "isf:62919b67cbcd960019678792",
  title: "Untitled Shader",
});

export const ECHO_PREVIOUS_AUDIO_WAVE_FORMS_SHADER = Object.freeze({
  id: "isf:66d31ee18d90c9001a4ac89d",
  title: "Waveform 2",
});

const SLOT_DEFAULTS = Object.freeze([
  Object.freeze({
    id: "always-on-shader-1",
    track_id: "track-shader-always-on-1",
    label: "Always On 1 · Ultimate Flame",
    enabled: true,
    shader_id: ECHO_ULTIMATE_FLAME_SHADER.id,
    shader_title: ECHO_ULTIMATE_FLAME_SHADER.title,
    stem_focus: "master",
    stem_fallback: "master",
    allow_alternate_isolated_stems: false,
    opacity: 0.14,
    blend_mode: "screen",
    layer_role: "persistent-atmosphere",
  }),
  Object.freeze({
    id: "always-on-shader-2",
    track_id: "track-shader-always-on-2",
    label: "Always On 2 · Audio Wave Forms · Simple Lines",
    enabled: true,
    shader_id: ECHO_AUDIO_WAVE_FORMS_SHADER.id,
    shader_title: ECHO_AUDIO_WAVE_FORMS_SHADER.title,
    stem_focus: "leadVocals",
    stem_fallback: "master",
    allow_alternate_isolated_stems: false,
    opacity: 0.2,
    blend_mode: "screen",
    layer_role: "persistent-waveform",
  }),
  Object.freeze({
    id: "always-on-shader-3",
    track_id: "track-shader-always-on-3",
    label: "Always On 3 · Open",
    enabled: false,
    shader_id: "none",
    shader_title: "Open",
    stem_focus: "master",
    stem_fallback: "master",
    allow_alternate_isolated_stems: false,
    opacity: 0.18,
    blend_mode: "screen",
    layer_role: "persistent-open",
  }),
]);

const clone = (value) => (
  typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value))
);

const text = (value) => String(value ?? "").trim();
const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function sourceSlots(value = {}) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.persistent_shader_slots)) return value.persistent_shader_slots;
  if (Array.isArray(value?.persistentShaderSlots)) return value.persistentShaderSlots;
  return [];
}

export function defaultEchoPersistentShaderSlots() {
  return SLOT_DEFAULTS.map((slot) => clone(slot));
}

export function normalizeEchoPersistentShaderSlots(value = {}, options = {}) {
  const input = sourceSlots(value);
  const byId = new Map(input.map((slot) => [text(slot?.id), slot]));
  const duration = Math.max(0, finite(
    options.durationSeconds
      ?? value?.duration
      ?? value?.durationSeconds
      ?? value?.song?.durationSeconds,
    0,
  ));
  return SLOT_DEFAULTS.map((defaults, index) => {
    const source = byId.get(defaults.id) || input[index] || {};
    const shaderId = text(source.shader_id ?? source.shaderId ?? source.visualizer_id ?? source.visualizerId ?? defaults.shader_id) || "none";
    const sourceShaderTitle = text(source.shader_title ?? source.shaderTitle ?? source.visualizer_title ?? source.visualizerTitle);
    const configured = shaderId.toLowerCase() !== "none";
    const enabled = configured && (source.enabled === undefined
      ? defaults.enabled
      : source.enabled === true);
    return {
      ...clone(defaults),
      ...clone(source),
      id: defaults.id,
      track_id: defaults.track_id,
      label: text(source.label) || defaults.label,
      enabled,
      always_on: true,
      selection_mode: "persistent-full-song",
      shader_id: configured ? shaderId : "none",
      shader_title: configured
        ? (sourceShaderTitle && !(shaderId === defaults.shader_id && sourceShaderTitle === shaderId))
          ? sourceShaderTitle
          : shaderId === defaults.shader_id ? defaults.shader_title : shaderId
        : "Open",
      stem_focus: text(source.stem_focus ?? source.stemFocus) || defaults.stem_focus,
      stem_fallback: text(source.stem_fallback ?? source.stemFallback) || defaults.stem_fallback,
      allow_alternate_isolated_stems: source.allow_alternate_isolated_stems === true,
      opacity: Math.max(0, Math.min(1, finite(source.opacity, defaults.opacity))),
      blend_mode: text(source.blend_mode ?? source.blendMode) || defaults.blend_mode,
      layer_role: text(source.layer_role ?? source.layerRole) || defaults.layer_role,
      start_sec: 0,
      end_sec: duration,
    };
  });
}

export function echoPersistentShaderSegments(project = {}) {
  return normalizeEchoPersistentShaderSlots(project)
    .filter((slot) => slot.enabled && slot.shader_id !== "none")
    .map((slot) => ({
      start_sec: 0,
      end_sec: Math.max(0, finite(project.duration, slot.end_sec)),
      visualizer_id: slot.shader_id,
      visualizer_title: slot.shader_title,
      stem_focus: slot.stem_focus,
      stem_fallback: slot.stem_fallback,
      allow_alternate_isolated_stems: slot.allow_alternate_isolated_stems,
      opacity: slot.opacity,
      ...(slot.recipe_treatment ? {recipe_treatment: clone(slot.recipe_treatment)} : {}),
      blend_mode: slot.blend_mode,
      layer_role: slot.layer_role,
      transition: "cut",
      persistent_slot_id: slot.id,
      persistent_track_id: slot.track_id,
      always_on: true,
      portable_visualizer_card: slot.portable_visualizer_card || slot.portableVisualizerCard || null,
      edit_reason: slot.edit_reason || `${slot.label} remains selected for the full song.`,
    }));
}

export function withEchoPersistentShaderSlots(project = {}) {
  return {
    ...project,
    persistent_shader_slots_schema: ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
    persistent_shader_slots: normalizeEchoPersistentShaderSlots(project),
  };
}
