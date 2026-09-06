// Shared by the deterministic compiler and the human Variation Lab.
export const DEFAULT_VARIANT_RECIPES = Object.freeze({
  conservative: Object.freeze({
    id: "conservative",
    cutScale: 1.18,
    visualizerMix: 0.28,
    maxVisualizerLayers: 4,
    cameraEnergy: 0.46,
    accentDensity: 0.28,
    temporalModulation: 0.12,
    mediaOffset: 0,
  }),
  kinetic: Object.freeze({
    id: "kinetic",
    cutScale: 0.78,
    visualizerMix: 0.5,
    maxVisualizerLayers: 4,
    cameraEnergy: 0.82,
    accentDensity: 0.72,
    temporalModulation: 0.48,
    mediaOffset: 1,
  }),
  "visualizer-forward": Object.freeze({
    id: "visualizer-forward",
    cutScale: 0.94,
    visualizerMix: 0.72,
    maxVisualizerLayers: 6,
    cameraEnergy: 0.64,
    accentDensity: 0.54,
    temporalModulation: 0.34,
    mediaOffset: 2,
  }),
});

const narrative = (id, label, axes, grammar) => Object.freeze({
  ...DEFAULT_VARIANT_RECIPES.conservative, ...axes, id, label,
  schemaVersion: "hapa.echo.narrative-recipe.v1",
  revision: 3,
  lyricPresentation: Object.freeze({
    templateId: id === "performance-kinetic" ? "kinetic-word-burst-v1" : id === "ensemble-response" ? "stacked-hook-echo-v1" : id === "comic-journey" ? "orbit-caption-v1" : "scanline-phrase-ribbon-v1",
    motionIntensity: axes.cameraEnergy,
    preserveTextAndTiming: true,
  }),
  timing: Object.freeze({ schemaVersion: "hapa.echo.recipe-timing.v1", maxShiftSeconds: .18, minimumShotSeconds: .75,
    preferredCueKinds: Object.freeze(grammar.pacing === "source-cue-accents" ? ["edit_pulse", "beat", "bar", "hook"] : ["section_start", "hook", "section_end", "ringout", "edit_pulse"]) }),
  grammar: Object.freeze(grammar),
});

export const NARRATIVE_VARIANT_RECIPES = Object.freeze({
  "letter-intimate": narrative("letter-intimate", "Letter / intimate", {
    visualizerMix: .18, cameraEnergy: .28, accentDensity: .12, temporalModulation: .08,
  }, { shotRoles: ["portrait", "detail", "memory"], sceneMode: "continuity", palette: "warm", lyricRule: "preserve-vocal-phrases", cameraMotions: ["slow-push-in", "static"], pacing: "hold-source-phrases" }),
  "ensemble-response": narrative("ensemble-response", "Ensemble / call and response", {
    visualizerMix: .38, cameraEnergy: .55, accentDensity: .4, temporalModulation: .2,
  }, { shotRoles: ["lead", "response", "ensemble"], sceneMode: "alternate-cast", palette: "source", lyricRule: "preserve-vocal-phrases", cameraMotions: ["pan-left", "pan-right"], pacing: "alternate-at-source-boundaries" }),
  "comic-journey": narrative("comic-journey", "Comic journey", {
    visualizerMix: .22, cameraEnergy: .38, accentDensity: .2, temporalModulation: .12,
  }, { shotRoles: ["establishing", "panel", "detail", "reveal"], sceneMode: "ordered-panels", palette: "source", lyricRule: "preserve-vocal-phrases", cameraMotions: ["pan-right", "slow-push-in"], pacing: "hold-source-phrases", preferredSourceKind: "local-photo" }),
  "performance-kinetic": narrative("performance-kinetic", "Performance / kinetic", {
    cutScale: .78, visualizerMix: .52, cameraEnergy: .8, accentDensity: .7, temporalModulation: .45, mediaOffset: 1,
  }, { shotRoles: ["performance", "motion", "detail"], sceneMode: "variety", palette: "source", lyricRule: "preserve-vocal-phrases", cameraMotions: ["pan-left", "pan-right", "slow-push-in"], pacing: "source-cue-accents", preferredSourceKind: "local-video" }),
  "ambient-instrumental": narrative("ambient-instrumental", "Ambient / instrumental", {
    cutScale: 1.5, visualizerMix: .65, cameraEnergy: .18, accentDensity: .06, temporalModulation: .05,
  }, { shotRoles: ["landscape", "texture", "ringout"], sceneMode: "continuity", palette: "cool", lyricRule: "preserve-existing-lyrics-if-present", cameraMotions: ["slow-pull-out", "static"], pacing: "hold-source-phrases" }),
});

export const ECHO_DIRECTOR_RECIPES = Object.freeze({ ...DEFAULT_VARIANT_RECIPES, ...NARRATIVE_VARIANT_RECIPES });

export function resolveEchoDirectorRecipe(recipe) {
  if (typeof recipe === "string") return ECHO_DIRECTOR_RECIPES[recipe] || DEFAULT_VARIANT_RECIPES.conservative;
  const parent = ECHO_DIRECTOR_RECIPES[recipe?.id] || DEFAULT_VARIANT_RECIPES.conservative;
  return { ...parent, ...(recipe || {}), id: String(recipe?.id || parent.id) };
}
