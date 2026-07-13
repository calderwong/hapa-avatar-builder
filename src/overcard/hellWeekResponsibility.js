import { SCHEMAS, entityKey, validateCanonical } from "@hapa/overcard/core";
import { freezeBuilderRunContext } from "./processAdapters.js";

export function createActiveHellWeekBinding({ principal, attachment, actor, at = new Date().toISOString(), contextAttachments = [], formation } = {}) {
  const binding = {
    schema: SCHEMAS.responsibilityBinding, id: `binding:hell-week:${principal.entityId}:${Date.parse(at) || Date.now()}`,
    ...(formation ? { formation } : {}), principal: structuredClone(principal),
    target: { nodeId: "hapa-dev-proto", hostId: "hell-week", processId: "hell-week", socketId: "manager" },
    mode: "operator", role: "manager", status: "active",
    contextRefs: contextAttachments.filter((item) => item.entity?.entityType === "card").map((item) => structuredClone(item.entity)),
    collectionRefs: contextAttachments.filter((item) => ["deck", "set"].includes(item.entity?.entityType)).map((item) => ({ id: item.entity.entityId, revision: Math.max(1, Number(item.entity.revision) || 1) })),
    capabilityIds: ["process.manage"], permissions: ["hell-week.run"], toolRefs: [], secretRefs: [],
    memoryPolicy: { sources: ["avatar-mind"], visibility: ["public", "shared"], classifications: ["persona", "process-context"], allowWriteback: false, writebackRequiresApproval: true },
    executionPolicy: { mode: "active", tokenBudget: 9000, budgetUsd: 4, timeoutMs: 900000, concurrency: 1, humanGates: ["socket:manager:human-gate"], fallback: "process-default" },
    createdAt: at, createdBy: actor, activatedAt: at, activatedBy: actor,
    provenance: { source: "hapa-avatar-builder:overcard-slot", actor, createdAt: at, sourceRevision: String(attachment?.revision || 1), traceId: attachment?.provenance?.traceId || `red-hell-week:${at}` },
  };
  const result = validateCanonical(SCHEMAS.responsibilityBinding, binding);
  if (!result.ok) throw new Error(`Hell Week ResponsibilityBinding is invalid: ${JSON.stringify(result.issues)}`);
  return result.value;
}

export function prepareHellWeekNextRun({ binding, remoteCapabilities, trustGrant, authorizationGrant, now = new Date().toISOString(), traceId, settings = {}, estimatedToolCalls = 0 } = {}, sources = {}) {
  if (!trustGrant?.granted || trustGrant.nodeId !== "hapa-dev-proto") throw new Error("An explicit hapa-dev-proto trust grant is required.");
  if (!authorizationGrant?.granted || authorizationGrant.nodeId !== "hapa-dev-proto") throw new Error("An explicit hapa-dev-proto authorization grant is required.");
  const envelopeValidation = validateCanonical(SCHEMAS.capabilityEnvelope, remoteCapabilities);
  if (!envelopeValidation.ok) throw new Error("Hell Week capability envelope is invalid.");
  const observed = envelopeValidation.value;
  if (observed.nodeId !== "hapa-dev-proto" || !observed.installed || !observed.running || !observed.compatible || !observed.processes.includes("hell-week")) throw new Error("The remote Hell Week runtime is unavailable or incompatible.");
  const envelope = { ...observed, trusted: true, authorized: true, reasons: [...observed.reasons, `Trust grant ${trustGrant.grantId}; authorization grant ${authorizationGrant.grantId}.`] };
  const tools = binding.toolRefs.map(entityKey); const authority = {
    permissions: [...binding.permissions], capabilities: [...binding.capabilityIds], tools,
    memorySources: [...binding.memoryPolicy.sources], memoryVisibility: [...binding.memoryPolicy.visibility], memoryClassifications: [...binding.memoryPolicy.classifications],
    allowWriteback: binding.memoryPolicy.allowWriteback, writebackRequiresApproval: binding.memoryPolicy.writebackRequiresApproval, fallback: binding.executionPolicy.fallback,
    maxBudgetUsd: binding.executionPolicy.budgetUsd, maxTokenBudget: binding.executionPolicy.tokenBudget,
  };
  return freezeBuilderRunContext("builder-hell-week-remote", {
    phase: "run-start", binding, operator: { ...authority, allowedModes: ["operator", "advisor", "reviewer", "context"], allowedSecretRefSchemes: ["keychain", "hapa-keys"] },
    processAllowance: authority, runtime: { ...authority, envelope }, satisfiedHumanGates: [...binding.executionPolicy.humanGates],
    now, traceId: traceId || binding.provenance.traceId, settings, estimatedToolCalls,
  }, sources);
}

export function transitionHellWeekBinding(binding, status, actor, at = new Date().toISOString()) {
  if (!['paused', 'revoked', 'removed'].includes(status)) throw new Error("Unsupported Hell Week binding transition.");
  const next = { ...structuredClone(binding), status, ...(status === 'revoked' ? { revokedAt: at, revokedBy: actor } : {}), provenance: { ...binding.provenance, traceId: `${binding.provenance.traceId}:${status}` } };
  return { binding: next, currentRun: status === 'paused' ? 'pause-at-checkpoint' : 'immutable-until-complete', nextRun: 'process-defaults', attachmentStatus: status === 'paused' ? 'paused' : 'removed' };
}
