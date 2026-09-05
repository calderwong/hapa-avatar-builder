import { resolveEchoDirectorRecipe } from "./echo-director-recipes.js";
export const VARIATION_LAB_SCHEMA = "hapa.director.variation-lab.v1";
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const hash = (value) => {
  const input = JSON.stringify(stable(value));
  let a = 0x811c9dc5;
  let b = 0x9e3779b9;
  for (let index = 0; index < input.length; index += 1) {
    a = Math.imul(a ^ input.charCodeAt(index), 0x01000193) >>> 0;
    b = Math.imul(b ^ (input.charCodeAt(index) + index), 0x85ebca6b) >>> 0;
  }
  return `${a.toString(16).padStart(8, "0")}${b.toString(16).padStart(8, "0")}`.repeat(4);
};


export function createVariationLab({ projectId, treatmentId, cueGraphId, basePlanId = treatmentId, locks = [], seeds = ["A", "B", "C"], recipes = ["conservative", "kinetic", "visualizer-forward"], previewRange = { startSeconds: 0, durationSeconds: 10 } } = {}) {
  const range = { startSeconds: Math.max(0, Number(previewRange.startSeconds) || 0), durationSeconds: Math.max(.001, Number(previewRange.durationSeconds) || 10) };
  const variants = recipes.map((recipe, index) => {
    const seed = `${projectId}:${seeds[index] || String(index + 1)}`;
    const { cutScale, visualizerMix, cameraEnergy, accentDensity, temporalModulation } = resolveEchoDirectorRecipe(recipe);
    const axes = { cutScale, visualizerMix, cameraEnergy, accentDensity, temporalModulation };
    return { id: `lab-variant:${hash([basePlanId, cueGraphId, recipe, seed]).slice(0, 20)}`, label: seeds[index] || String(index + 1), recipe, seed, axes, previewRange: { ...range }, receiptHash: hash({ basePlanId, cueGraphId, recipe, seed, axes }) };
  });
  return {
    schemaVersion: VARIATION_LAB_SCHEMA,
    projectId, treatmentId, cueGraphId, basePlanId, previewRange: range,
    reusedExpensiveDecisions: ["editorial-treatment", "canonical-cue-graph", "semantic-media-rankings", "stem-telemetry", "media-affordances"],
    rerolledCheapAxes: ["cut-scale", "visualizer-mix", "camera-energy", "accent-density", "temporal-modulation", "media-offset"],
    semanticDecisionRuns: 0,
    locks: [...locks],
    variants,
    promoted: null,
  };
}

export function setVariationLock(lab, lock) {
  const key = `${lock.targetKind}:${lock.targetId}`;
  return { ...lab, locks: [...lab.locks.filter((row) => `${row.targetKind}:${row.targetId}` !== key), { ...lock, key, source: "human-lock" }] };
}

export function promoteVariation(lab, variantId, { operator = "human", promotedAt = null } = {}) {
  const winner = lab.variants.find((variant) => variant.id === variantId);
  if (!winner) throw new Error(`Unknown variation ${variantId}`);
  const losers = lab.variants.filter((variant) => variant.id !== variantId).map((variant) => ({ id: variant.id, recipe: variant.recipe, seed: variant.seed, receiptHash: variant.receiptHash, reproducible: true }));
  const patch = {
    schemaVersion: "hapa.director.variant-promotion-patch.v1",
    parentTreatmentId: lab.treatmentId,
    parentCueGraphId: lab.cueGraphId,
    basePlanId: lab.basePlanId,
    winner: { ...winner, locks: lab.locks },
    losers,
    operator,
    promotedAt,
    nonDestructive: true,
    formatVariantInputs: { recipe: winner.recipe, seed: winner.seed, locks: lab.locks, supportedFormats: ["16:9", "9:16", "1:1", "lyric", "instrumental"] },
  };
  patch.patchHash = hash(patch);
  return { ...lab, promoted: patch };
}

export function saveVariationLab(storage, lab) {
  storage.setItem(`hapa.variation-lab:${lab.projectId}`, JSON.stringify(lab));
  return lab;
}

export function loadVariationLab(storage, projectId) {
  try { return JSON.parse(storage.getItem(`hapa.variation-lab:${projectId}`) || "null"); } catch { return null; }
}

export function regenerateVariationLab(previous, inputs = {}) {
  const next = createVariationLab({ ...inputs, projectId: previous.projectId, treatmentId: inputs.treatmentId || previous.treatmentId, cueGraphId: inputs.cueGraphId || previous.cueGraphId, previewRange: inputs.previewRange || previous.previewRange, locks: previous.locks });
  return previous.promoted ? { ...next, promoted: previous.promoted } : next;
}
