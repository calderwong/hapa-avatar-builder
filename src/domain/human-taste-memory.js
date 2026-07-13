import { contextHash } from "./song-context-packet.js";

export const HUMAN_TASTE_SCHEMA = "hapa.director.human-taste-memory.v1";
export const TASTE_SCOPES = ["shot", "song", "album", "character", "visualizer-family", "global"];

export function createTasteMemory({ workspaceId = "local", events = [] } = {}) { return { schemaVersion: HUMAN_TASTE_SCHEMA, workspaceId, localOnly: true, transparentPriorsOnly: true, events }; }

export function appendTasteEvidence(memory, entry) {
  if (!TASTE_SCOPES.includes(entry.scope) || !entry.scopeId || !entry.actionEventId || !entry.action || !entry.operator) throw new Error("Taste evidence requires valid scope, scopeId, source action, action, and operator");
  const event = { schemaVersion: "hapa.director.taste-evidence.v1", id: `taste:${contextHash(entry).slice(0, 20)}`, status: "active", strength: Number(entry.strength ?? 1), recordedAt: entry.recordedAt || new Date().toISOString(), ...entry };
  return { ...memory, events: [...memory.events, event] };
}

export function setTasteEvidenceEnabled(memory, eventId, enabled, { operator, at = new Date().toISOString(), reason = "operator-toggle" } = {}) {
  if (!operator) throw new Error("Taste toggle requires operator");
  const toggle = { schemaVersion: "hapa.director.taste-control.v1", id: `taste-control:${contextHash({ eventId, enabled, operator, at }).slice(0, 20)}`, status: "control", targetEventId: eventId, enabled: Boolean(enabled), operator, reason, recordedAt: at };
  return { ...memory, events: [...memory.events, toggle] };
}

export function resetTasteScope(memory, scope, scopeId, { operator, at = new Date().toISOString() } = {}) {
  if (!TASTE_SCOPES.includes(scope) || !operator) throw new Error("Taste reset requires valid scope and operator");
  const reset = { schemaVersion: "hapa.director.taste-control.v1", id: `taste-reset:${contextHash({ scope, scopeId, operator, at }).slice(0, 20)}`, status: "reset", scope, scopeId, operator, recordedAt: at };
  return { ...memory, events: [...memory.events, reset] };
}

export function activeTasteEvidence(memory, context = {}) {
  const toggles = new Map();
  const resets = [];
  for (const event of memory.events) { if (event.status === "control") toggles.set(event.targetEventId, event.enabled); if (event.status === "reset") resets.push(event); }
  return memory.events.filter((event) => event.status === "active" && toggles.get(event.id) !== false && (event.scope === "global" || String(context[event.scope] || context[`${event.scope}Id`] || "") === String(event.scopeId)) && !resets.some((reset) => reset.scope === event.scope && reset.scopeId === event.scopeId && reset.recordedAt >= event.recordedAt));
}

export function applyTastePriors(candidates = [], memory, context = {}) {
  const evidence = activeTasteEvidence(memory, context);
  return candidates.map((candidate) => {
    const contributions = evidence.filter((event) => !event.targetId || event.targetId === candidate.id).map((event) => ({ eventId: event.id, actionEventId: event.actionEventId, feature: event.feature, delta: (event.action === "ban" || event.action === "reject") ? -.1 * event.strength : .1 * event.strength, scope: event.scope, scopeId: event.scopeId }));
    return { ...candidate, tastePrior: Number(contributions.reduce((sum, row) => sum + row.delta, 0).toFixed(4)), tastePriorContributions: contributions, baseScoreUnchanged: candidate.score };
  });
}

export function evaluateTastePromotion({ blindReview = {}, safety = {}, performance = {}, evidenceCount = 0 } = {}) {
  const requirements = { blindReview: blindReview.status === "pass" && Boolean(blindReview.receiptHash), safety: safety.status === "pass" && Boolean(safety.receiptHash), performance: performance.status === "pass" && Boolean(performance.receiptHash), evidence: evidenceCount > 0 };
  return { schemaVersion: "hapa.director.taste-promotion.v1", promoted: Object.values(requirements).every(Boolean), requirements, reason: Object.values(requirements).every(Boolean) ? "reviewed-evidence-promoted" : "promotion-blocked-missing-evidence" };
}
