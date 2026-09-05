import { evaluateEchoMediaEligibility, echoMediaConstraintError, mergeEchoMediaConstraints } from "./echo-media-eligibility.js";

const list = (value) => Array.isArray(value) ? value : [];
const shared = (left, right) => left.some((value) => right.includes(value));
const unit = (seed, scope) => {
  let value = 2166136261;
  for (const char of `${seed}\0${scope}`) value = Math.imul(value ^ char.codePointAt(0), 16777619) >>> 0;
  return value / 4294967296;
};

/** Uses already prepared metadata only. Grammar preferences are not semantic
 * measurements; every selection records the evidence it actually consumed.
 * Source timing stays immutable, including phrases and explicit cut locks. */
export function sequenceEchoNarrative({ slots, recipe, seed, constraints = {} }) {
  const previous = [];
  const panelPositions = new Map();
  const decisions = [];
  const result = slots.map((slot, index) => {
    const required = mergeEchoMediaConstraints(constraints, slot.mediaConstraints);
    const locked = slot.locks?.includes("media");
    const candidates = locked ? [slot.media] : list(slot.candidateMedia);
    const gates = candidates.map((candidate) => {
      if (candidate.sourceKind !== "pure-visualizer") return evaluateEchoMediaEligibility(candidate, required);
      // Generated slots have no source bytes/crop. Cast, scene, bans and source
      // policy still apply; do not let intentional empty media bypass them.
      const gate = evaluateEchoMediaEligibility({ ...candidate, uri: candidate.uri || "/generated/visualizer" }, {
        ...required, requireVerifiedBytes: false, requireVerifiedCrop: false, outputProfile: null,
      });
      return { ...gate, pendingEvidence: gate.pendingEvidence.filter((item) => item !== "source-bytes-unverified") };
    });
    const last = previous.at(-1);
    const role = recipe.grammar.shotRoles[index % recipe.grammar.shotRoles.length];
    const ranked = candidates.flatMap((candidate, candidateIndex) => {
      if (!gates[candidateIndex].eligible) return [];
      const evidence = [];
      // These are explicit authored/analysis fields, never guessed from titles.
      let affinity = 0;
      if (list(candidate.shotRoles).includes(role)) { affinity += 3; evidence.push(`shot-role:${role}`); }
      if (recipe.grammar.preferredSourceKind === candidate.sourceKind) { affinity += 2; evidence.push(`source-kind:${candidate.sourceKind}`); }
      if (recipe.grammar.palette !== "source" && candidate.paletteFamily === recipe.grammar.palette) { affinity += 1; evidence.push(`palette:${candidate.paletteFamily}`); }
      if (recipe.grammar.sceneMode === "continuity" && last && shared(list(candidate.sceneIds), list(last.sceneIds))) { affinity += 2; evidence.push("same-declared-scene"); }
      if (recipe.grammar.sceneMode === "alternate-cast" && last && list(candidate.characterIds).length && list(last.characterIds).length
        && !shared(candidate.characterIds, last.characterIds)) { affinity += 3; evidence.push("different-declared-cast"); }
      if (recipe.grammar.sceneMode === "ordered-panels" && candidate.comicId && Number.isFinite(candidate.panelIndex)) {
        const prior = panelPositions.get(candidate.comicId);
        if (prior !== undefined && candidate.panelIndex <= prior && !locked) return [];
        affinity += 3;
        evidence.push(`ordered-panel:${candidate.comicId}:${candidate.panelIndex}`);
      }
      const repeat = previous.slice(-3).some((entry) => entry.id === candidate.id);
      const preference = affinity - (repeat ? 4 : 0);
      return [{ candidate, candidateIndex, preference, repeat, evidence, tie: unit(seed, `${slot.id}:${candidate.id}:${candidate.runtimeUri || candidate.uri || ""}`) }];
    }).sort((a, b) => b.preference - a.preference
      || (recipe.grammar.sceneMode === "ordered-panels" && a.candidate.comicId && a.candidate.comicId === b.candidate.comicId
        && Number.isFinite(a.candidate.panelIndex) && Number.isFinite(b.candidate.panelIndex) ? a.candidate.panelIndex - b.candidate.panelIndex : 0)
      || a.tie - b.tie || String(a.candidate.id).localeCompare(String(b.candidate.id))
      || String(a.candidate.runtimeUri || a.candidate.uri || "").localeCompare(String(b.candidate.runtimeUri || b.candidate.uri || "")));
    if (!ranked.length) throw echoMediaConstraintError(gates.map((gate) => gate.eligible ? { ...gate, reasons: ["narrative-sequence-exhausted"] } : gate), { stage: "narrative-sequencing", slotId: slot.id, recipe: recipe.id, locked });
    const winner = ranked[0];
    previous.push(winner.candidate);
    if (winner.candidate.comicId && Number.isFinite(winner.candidate.panelIndex)) panelPositions.set(winner.candidate.comicId, winner.candidate.panelIndex);
    const decision = {
      schemaVersion: "hapa.echo.narrative-selection.v1", slotId: slot.id, selectedMediaId: winner.candidate.id,
      selectedUri: winner.candidate.runtimeUri || winner.candidate.uri || "",
      recipeId: recipe.id, requestedShotRole: role, locked, source: "prepared-candidate-metadata",
      semanticConfidence: null, evidence: winner.evidence, pendingEvidence: gates[winner.candidateIndex].pendingEvidence,
      limitations: [
        ...(!winner.evidence.some((value) => value.startsWith("shot-role:")) ? ["requested-shot-role-unverified"] : []),
        ...(winner.repeat ? ["recent-source-repeated"] : []),
        ...(recipe.grammar.sceneMode === "alternate-cast" && !list(winner.candidate.characterIds).length ? ["cast-identity-unverified"] : []),
        ...(recipe.grammar.sceneMode === "ordered-panels" && !winner.candidate.comicId ? ["comic-panel-order-unavailable"] : []),
      ],
      rejected: gates.filter((gate) => !gate.eligible).map(({ mediaId, reasons }) => ({ mediaId, reasons })),
      alternatives: ranked.slice(1).map(({ candidate, evidence }) => ({ mediaId: candidate.id, evidence })),
      timing: "source-boundaries-preserved",
    };
    decisions.push(decision);
    const camera = slot.locks?.includes("camera") ? slot.camera : {
      ...slot.camera, motion: recipe.grammar.cameraMotions[index % recipe.grammar.cameraMotions.length],
      intensity: Math.min(1.35, Math.max(0, recipe.cameraEnergy)), speed: Math.max(.1, recipe.cameraEnergy),
    };
    return { ...slot, selectedMedia: winner.candidate, camera, compiledIndex: index, decisionEvidence: decision };
  });
  return { slots: result, receipt: { schemaVersion: "hapa.echo.narrative-sequence.v1", recipeId: recipe.id, seed, decisions, modelCalls: 0, analysisCalls: 0, timingPolicy: "preserve-all-source-boundaries" } };
}
