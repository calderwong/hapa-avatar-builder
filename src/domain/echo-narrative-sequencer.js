import { evaluateEchoMediaEligibility, evaluateEchoGeneratedMediaEligibility, echoMediaConstraintError, mergeEchoMediaConstraints } from "./echo-media-eligibility.js";
import { createEchoObservedContentRanker } from "./semantic-media-ranker-v2.js";
import { reflowEchoCueBoundaries } from "./echo-cue-reflow.js";

const list = value => Array.isArray(value) ? value : [];
const shared = (left, right) => left.some(value => right.includes(value));
const unit = (seed, scope) => {
  let value = 2166136261;
  for (const char of `${seed}\0${scope}`) value = Math.imul(value ^ char.codePointAt(0), 16777619) >>> 0;
  return value / 4294967296;
};
const MAX_CANDIDATES = 200000;
const MAX_BRANCH_EVALUATIONS = 800000;
const MAX_BEAM_WIDTH = 8;
const MAX_DECISION_ALTERNATIVES = 32;
const MAX_STORED_ALTERNATIVES = 8192;
const MAX_RECEIPT_DECISION_BYTES = 16 * 1024 * 1024;

/** Search only already prepared candidates. Each branch owns its panel order,
 * recent sources and cast continuity. Hard gates and favorite locks remain hard.
 * Bounded search can exhaust its beam; it never claims global optimality. */
export function sequenceEchoNarrative({ slots, recipe, seed, constraints = {}, cueGraph, timingMode = "preserve", locks = [], lyricCues = [], lyricTiming = {} }) {
  if (!Array.isArray(slots) || slots.length > 4096) throw new Error("This sequence exceeds the bounded recut workspace.");
  const candidateCount = slots.reduce((count, slot) => count + (slot.locks?.includes("media") ? 1 : list(slot.candidateMedia).length), 0);
  if (candidateCount > MAX_CANDIDATES) throw new Error("This sequence exceeds the recut work budget. Select fewer complete shots.");
  const timing = reflowEchoCueBoundaries({ slots, recipe, seed, cueGraph, mode: timingMode, locks });
  const hasObservedContent = timing.slots.some(slot => [slot.media,...list(slot.candidateMedia)].some(candidate => candidate?.contentEvidence));
  const observedRanker = hasObservedContent ? createEchoObservedContentRanker({lyricCues,timingSource:lyricTiming.timingSource}) : null;
  const width = Math.max(1, Math.min(MAX_BEAM_WIDTH, Math.floor(MAX_BRANCH_EVALUATIONS / Math.max(1, candidateCount))));
  // Prepare one slot at a time; retaining every annotation receipt would multiply
  // observation memory by the full candidate × slot workspace. Reconstruction
  // repeats only bounded pure scoring, never analysis or source IO.
  const prepare = (slot, index) => {
    const cueContext = observedRanker?.context(slot);
    const required = mergeEchoMediaConstraints(constraints, slot.mediaConstraints);
    const locked = slot.locks?.includes("media");
    const candidates = (locked ? [slot.media] : list(slot.candidateMedia)).map(candidate => candidate.sourceKind === "pure-visualizer"
      ? { ...candidate, characterIds: [], sceneIds: [], cast: null } : candidate);
    const gates = candidates.map(candidate => candidate.sourceKind === "pure-visualizer"
      ? evaluateEchoGeneratedMediaEligibility(candidate, required) : evaluateEchoMediaEligibility(candidate, required));
    const role = recipe.grammar.shotRoles[index % recipe.grammar.shotRoles.length];
    const options = candidates.flatMap((candidate, candidateIndex) => {
      if (!gates[candidateIndex].eligible) return [];
      const evidence = [], components = {};
      components.shotRole = { value: list(candidate.shotRoles).includes(role) ? 3 : 0, basis: list(candidate.shotRoles).length ? "prepared-metadata-preference" : "missing-shot-role" };
      components.sourceKind = { value: recipe.grammar.preferredSourceKind === candidate.sourceKind ? 2 : 0, basis: recipe.grammar.preferredSourceKind ? "prepared-metadata-preference" : "not-requested" };
      components.palette = { value: recipe.grammar.palette !== "source" && candidate.paletteFamily === recipe.grammar.palette ? 1 : 0, basis: recipe.grammar.palette === "source" ? "not-requested" : candidate.paletteFamily ? "prepared-metadata-preference" : "missing-palette" };
      const observedContent = observedRanker?.score(candidate,slot,cueContext);
      if(observedContent){
        for(const [key,part,weight]of [["observedPhrase","phrase",4],["observedSection","section",1]]){
          const score=observedContent[part];
          components[key]={value:weight*(score.value??0),rawValue:score.value,weight,basis:score.value===null?observedContent.reason||"missing-lyric-context":"inferred-sampled-lexical-overlap"};
          for(const match of score.matches)evidence.push(`${key}:${match.token}`);
        }
      }
      if (components.shotRole.value) evidence.push(`shot-role:${role}`);
      if (components.sourceKind.value) evidence.push(`source-kind:${candidate.sourceKind}`);
      if (components.palette.value) evidence.push(`palette:${candidate.paletteFamily}`);
      return [{ candidate, candidateIndex, components, evidence, observedContent, tie: unit(seed, `${slot.id}:${candidate.id}:${candidate.runtimeUri || candidate.uri || ""}`) }];
    });
    if (!options.length) throw echoMediaConstraintError(gates, { stage: "narrative-sequencing", slotId: slot.id, recipe: recipe.id, locked });
    return { slot, role, locked, gates, options };
  };
  const rank = (row, state) => {
    const last = state.previous.at(-1);
    return row.options.flatMap(option => {
      const { candidate } = option;
      const evidence = [...option.evidence], components = { ...option.components };
      components.sceneContinuity = { value: 0, basis: recipe.grammar.sceneMode !== "continuity" || !last ? "not-requested" : list(candidate.sceneIds).length && list(last.sceneIds).length ? "prepared-metadata-preference" : "missing-scene-identity" };
      components.castResponse = { value: 0, basis: recipe.grammar.sceneMode !== "alternate-cast" || !last ? "not-requested" : list(candidate.characterIds).length && list(last.characterIds).length ? "prepared-metadata-preference" : "missing-cast-identity" };
      components.panelOrder = { value: 0, basis: recipe.grammar.sceneMode !== "ordered-panels" ? "not-requested" : candidate.comicId && Number.isFinite(candidate.panelIndex) ? "prepared-metadata-preference" : "missing-panel-order" };
      if (recipe.grammar.sceneMode === "continuity" && last && shared(list(candidate.sceneIds), list(last.sceneIds))) { components.sceneContinuity.value = 2; evidence.push("same-declared-scene"); }
      if (recipe.grammar.sceneMode === "alternate-cast" && last && list(candidate.characterIds).length && list(last.characterIds).length
        && !shared(candidate.characterIds, last.characterIds)) { components.castResponse.value = 3; evidence.push("different-declared-cast"); }
      if (recipe.grammar.sceneMode === "ordered-panels" && candidate.comicId && Number.isFinite(candidate.panelIndex)) {
        const prior = state.panels.get(candidate.comicId);
        if (prior !== undefined && candidate.panelIndex <= prior) return [];
        components.panelOrder.value = 3; evidence.push(`ordered-panel:${candidate.comicId}:${candidate.panelIndex}`);
      }
      const repeat = state.previous.some(entry => entry.id === candidate.id);
      components.recentRepeat = { value: repeat ? -4 : 0, basis: "sequence-history" };
      return [{ ...option, components, evidence, repeat, preference: Object.values(components).reduce((sum, component) => sum + component.value, 0) }];
    }).sort((a, b) => b.preference - a.preference
      || (recipe.grammar.sceneMode === "ordered-panels"
        ? (a.candidate.comicId && Number.isFinite(a.candidate.panelIndex) ? a.candidate.panelIndex : Infinity)
          - (b.candidate.comicId && Number.isFinite(b.candidate.panelIndex) ? b.candidate.panelIndex : Infinity) : 0)
      || a.tie - b.tie || String(a.candidate.id).localeCompare(String(b.candidate.id))
      || String(a.candidate.runtimeUri || a.candidate.uri || "").localeCompare(String(b.candidate.runtimeUri || b.candidate.uri || ""))
      || String(a.candidate.sourceSelectionKey||"").localeCompare(String(b.candidate.sourceSelectionKey||"")));
  };
  let beam = [{ score: 0, previous: [], panels: new Map(), node: null }];
  let evaluatedBranches = 0, prunedBranches = 0, exhaustedBranches = 0;
  for (const [index, slot] of timing.slots.entries()) {
    const row = prepare(slot, index);
    const next = [];
    let ordinal = 0;
    for (const state of beam) {
      evaluatedBranches += row.options.length;
      const ranked = rank(row, state);
      if (!ranked.length) exhaustedBranches++;
      // Retain a bounded frontier instead of all candidates or complete paths.
      for (const winner of ranked) {
        const score = state.score + winner.preference;
        const order = ordinal++;
        // Later equal scores have a larger ordinal and cannot enter the frontier.
        // Avoid copying their branch history only to discard it immediately.
        if (next.length === width && score <= next.at(-1).score) { prunedBranches++; continue; }
        const panels = new Map(state.panels);
        if (winner.candidate.comicId && Number.isFinite(winner.candidate.panelIndex)) panels.set(winner.candidate.comicId, winner.candidate.panelIndex);
        const branch = { score, order, panels, previous: [...state.previous.slice(-2), winner.candidate], node: { winner, parent: state.node } };
        next.push(branch); next.sort((a, b) => b.score - a.score || a.order - b.order);
        if (next.length > width) { next.pop(); prunedBranches++; }
      }
    }
    if (!next.length) throw echoMediaConstraintError(row.gates.map(gate => gate.eligible ? { ...gate, reasons: ["narrative-sequence-exhausted"] } : gate),
      { stage: "narrative-sequencing", slotId: row.slot.id, recipe: recipe.id, locked: row.locked, search: { width, evaluatedBranches, prunedBranches, exhaustedBranches, globallyOptimal: false } });
    beam = next;
  }
  const selected = [];
  for (let node = beam[0].node; node; node = node.parent) selected.push(node.winner);
  selected.reverse();
  const decisions = [], state = { previous: [], panels: new Map() };
  const explanationLimit = Math.min(MAX_DECISION_ALTERNATIVES, Math.floor(MAX_STORED_ALTERNATIVES / Math.max(1, timing.slots.length)));
  const encoder = new TextEncoder();
  let decisionBytes = 0;
  const result = timing.slots.map((sourceSlot, index) => {
    const row = prepare(sourceSlot, index);
    const { slot, role, locked, gates } = row, winner = selected[index];
    const ranked = rank(row, state);
    const alternatives = ranked.filter(option => option.candidateIndex !== winner.candidateIndex);
    const viable = new Set(ranked.map(option => option.candidateIndex));
    const rejected = [...gates.filter(gate => !gate.eligible),
      ...row.options.filter(option => !viable.has(option.candidateIndex)).map(option => ({ mediaId: option.candidate.id, reasons: ["narrative-sequence-exhausted"] }))]
      .sort((a, b) => String(a.mediaId).localeCompare(String(b.mediaId)) || a.reasons.join("|").localeCompare(b.reasons.join("|")));
    const decision = {
      schemaVersion: "hapa.echo.narrative-selection.v1", slotId: slot.id, selectedMediaId: winner.candidate.id,
      selectedUri: winner.candidate.runtimeUri || winner.candidate.uri || "", recipeId: recipe.id,
      requestedShotRole: role, locked, source: winner.observedContent ? "sampled-observations-and-prepared-metadata" : "prepared-candidate-metadata", semanticConfidence: null,
      ...(winner.observedContent?{observedContent:winner.observedContent}:{}),
      evidence: winner.evidence, preferenceScore: winner.preference, scoreComponents: winner.components, pendingEvidence: gates[winner.candidateIndex].pendingEvidence,
      selectionBasis: ranked[0]?.candidateIndex === winner.candidateIndex ? "sequence-and-local-preference" : "bounded-sequence-preference",
      limitations: [
        ...(!winner.evidence.some(value => value.startsWith("shot-role:")) ? ["requested-shot-role-unverified"] : []),
        ...(winner.repeat ? ["recent-source-repeated"] : []),
        ...(recipe.grammar.sceneMode === "alternate-cast" && !list(winner.candidate.characterIds).length ? ["cast-identity-unverified"] : []),
        ...(recipe.grammar.sceneMode === "ordered-panels" && !winner.candidate.comicId ? ["comic-panel-order-unavailable"] : []),
      ],
      rejected: rejected.slice(0, explanationLimit).map(({ mediaId, reasons }) => ({ mediaId, reasons })), rejectedCount: rejected.length,
      alternatives: alternatives.slice(0, explanationLimit).map(({ candidate, evidence, preference, components, observedContent }) => ({ mediaId: candidate.id, title: candidate.title || candidate.media_title || candidate.sourceShot?.media_title || candidate.id, uri: candidate.runtimeUri || candidate.uri || null, posterUri: candidate.posterUri || candidate.media_thumbnail || candidate.sourceShot?.media_thumbnail || null, evidence, preferenceScore: preference, components,
        ...(observedContent?{observedContent:{status:observedContent.status,reason:observedContent.reason,sourceWindow:observedContent.sourceWindow,artifactRevision:observedContent.artifactRevision,phraseValue:observedContent.phrase.value,sectionValue:observedContent.section.value}}:{}) })), alternativeCount: alternatives.length,
      timing: slot.startSeconds !== slots[index].startSeconds || slot.endSeconds !== slots[index].endSeconds ? "supported-cue-reflow" : "source-boundaries-preserved",
    };
    let bytes = encoder.encode(JSON.stringify(decision)).byteLength;
    if (observedRanker) {
      const allowance = Math.floor(MAX_RECEIPT_DECISION_BYTES / Math.max(1, timing.slots.length));
      // Keep the selected evidence and honest total counts. Explanatory examples
      // may shrink to preserve long supported sequences inside the same budget.
      while (bytes > allowance && (decision.alternatives.length || decision.rejected.length)) {
        if (decision.alternatives.length) decision.alternatives.pop(); else decision.rejected.pop();
        bytes = encoder.encode(JSON.stringify(decision)).byteLength;
      }
    }
    decisionBytes += bytes;
    if (decisionBytes > MAX_RECEIPT_DECISION_BYTES) throw new Error("Sequence explanations exceed the bounded workspace. Select fewer complete shots.");
    decisions.push(decision);
    state.previous = [...state.previous.slice(-2), winner.candidate];
    if (winner.candidate.comicId && Number.isFinite(winner.candidate.panelIndex)) state.panels.set(winner.candidate.comicId, winner.candidate.panelIndex);
    const camera = slot.locks?.includes("camera") ? slot.camera : { ...slot.camera,
      motion: recipe.grammar.cameraMotions[index % recipe.grammar.cameraMotions.length],
      intensity: Math.min(1.35, Math.max(0, recipe.cameraEnergy)), speed: Math.max(.1, recipe.cameraEnergy) };
    return { ...slot, selectedMedia: winner.candidate, camera, compiledIndex: index, decisionEvidence: decision };
  });
  return { slots: result, receipt: { schemaVersion: "hapa.echo.narrative-sequence.v1", recipeId: recipe.id, seed, decisions, modelCalls: 0, analysisCalls: 0,
    search: { algorithm: "bounded-beam-v1", width, candidateCount, evaluatedBranches, prunedBranches, exhaustedBranches, maximumBranchEvaluations: MAX_BRANCH_EVALUATIONS, explanationLimitPerDecision: explanationLimit, storedAlternativesLimit: MAX_STORED_ALTERNATIVES, decisionBytes, maximumDecisionBytes: MAX_RECEIPT_DECISION_BYTES, globallyOptimal: false },
    ...(observedRanker?{observedContentPolicy:{schemaVersion:"hapa.echo.observed-recipe-scoring.v1",phraseWeight:4,sectionWeight:1,lyricTiming,semanticConfidence:null}}:{}),
    timingPolicy: timingMode === "preserve" ? "preserve-all-source-boundaries" : "approved-cues-within-bounded-tolerance", cueReflow: timing.receipt } };
}
