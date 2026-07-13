import {
  SCHEMAS,
  compileRuntimePolicy,
  entityKey,
  validateCanonical,
  validateRuntimeContext,
} from "@hapa/overcard/core";

export function resolveBuilderRuntimeContext(input, sources = {}) {
  const binding = requireCanonical(SCHEMAS.responsibilityBinding, input.binding, "ResponsibilityBinding");
  const process = requireCanonical(SCHEMAS.processDefinition, input.process, "ProcessDefinition");
  const policy = compileRuntimePolicy({
    binding,
    process,
    operator: input.operator,
    processAllowance: input.processAllowance,
    runtime: input.runtime,
    cardConstraints: input.cardConstraints || [],
    satisfiedHumanGates: input.satisfiedHumanGates || [],
    now: input.now,
  });

  const avatar = (sources.avatars?.avatars || []).find((entry) => entry.id === binding.principal.entityId) || null;
  const memory = summarizeAllowedMemory(avatar?.mind, {
    visibility: binding.memoryPolicy.visibility,
    classifications: binding.memoryPolicy.classifications,
    authorized: policy.canReadContext,
  });
  const collections = resolveCollections(binding.collectionRefs, sources);
  const settingsResult = sanitizeSettings(mergeSettings([
    avatar?.runtimeSettings,
    input.settings?.process,
    input.settings?.operator,
    input.settings?.binding,
  ]));
  const contextRefs = policy.decision === "deny" ? [] : uniqueRefs(binding.contextRefs || []);
  const collectionRefs = policy.decision === "deny" ? [] : collections.map((entry) => ({
    id: entry.id,
    revision: entry.revision,
    memberKeys: entry.memberKeys,
  }));
  const toolRefs = policy.decision === "deny"
    ? []
    : (binding.toolRefs || []).filter((tool) => policy.tools.includes(entityKey(tool)));
  const sourceRevisions = buildSourceRevisions({ avatar, sources, collections, process, binding });
  const budget = cleanObject({
    tokens: policy.limits.maxTokenBudget,
    costUsd: policy.limits.maxBudgetUsd,
    toolCalls: input.estimatedToolCalls,
  });
  const traceId = String(input.traceId || binding.provenance?.traceId || `preview:${binding.id}`);
  const contextBase = {
    schema: SCHEMAS.runtimeContext,
    snapshotId: "pending",
    process: process.process,
    processVersion: process.version,
    ...(binding.formation ? { formation: binding.formation } : {}),
    binding: { id: binding.id, revision: String(input.bindingRevision || binding.provenance?.sourceRevision || binding.createdAt) },
    principal: binding.principal,
    role: binding.role,
    mode: binding.mode,
    contextRefs,
    collectionRefs,
    memory: {
      mode: memoryMode(policy.memory.sources),
      scopes: memory.scopes,
      resultRefs: policy.canReadContext ? memory.resultRefs : [],
    },
    ...(safeShortString(input.provider) ? { provider: safeShortString(input.provider) } : {}),
    ...(safeShortString(input.model) ? { model: safeShortString(input.model) } : {}),
    toolRefs,
    settings: settingsResult.value,
    secretRefs: policy.secretRefs,
    permissions: policy.permissions,
    sourceRevisions,
    ...(Object.keys(budget).length ? { budget } : {}),
    fallback: {
      mode: policy.fallback,
      reason: policy.decision === "allow" ? "Compiled least-privilege runtime policy." : policy.reasons[0] || "Runtime is not executable.",
    },
    resolvedAt: input.now,
    traceId,
  };
  const snapshotId = `runtime:${binding.id}:${fingerprint(contextBase)}`;
  const runtimeContext = { ...contextBase, snapshotId };
  const validation = validateRuntimeContext(runtimeContext);
  if (!validation.ok) throw new Error(`Resolved RuntimeContext is invalid: ${JSON.stringify(validation.issues)}`);

  const avatarSourceAvailable = Boolean(avatar);
  const runtimeStatus = policy.decision === "deny"
    ? "denied"
    : policy.canExecuteProcess
      ? "executable"
      : input.runtime.envelope.running
        ? "context-only"
        : "unavailable";
  return {
    schema: "hapa.builder-runtime-context-preview.v1",
    previewOnly: true,
    runtimeContext,
    policy,
    status: {
      avatarContext: {
        sourceAvailable: avatarSourceAvailable,
        authorizedForContext: policy.canReadContext,
        status: !avatarSourceAvailable ? "unavailable" : policy.canReadContext ? "available" : "available-not-authorized",
      },
      executableRuntime: {
        installed: Boolean(input.runtime.envelope.installed),
        running: Boolean(input.runtime.envelope.running),
        trusted: Boolean(input.runtime.envelope.trusted),
        authorized: Boolean(input.runtime.envelope.authorized),
        status: runtimeStatus,
      },
    },
    sources: buildSourcePreview({ avatar, sources, collections, process, binding, memory }),
    exact: {
      sourceRevisions,
      memoryScopes: runtimeContext.memory.scopes,
      memoryResultRefs: runtimeContext.memory.resultRefs,
      decks: collections,
      tools: toolRefs.map((tool) => ({ key: entityKey(tool), label: tool.label || tool.entityId })),
      provider: runtimeContext.provider || null,
      model: runtimeContext.model || null,
      settings: runtimeContext.settings,
      permissions: runtimeContext.permissions,
      secretRefs: runtimeContext.secretRefs,
      fallback: runtimeContext.fallback,
      estimatedLimits: policy.limits,
      writeback: {
        allowed: policy.memory.allowWriteback,
        requiresApproval: policy.memory.writebackRequiresApproval,
      },
    },
    redactions: {
      rejectedSettingPaths: settingsResult.rejectedPaths,
      rawMemoryIncluded: false,
      credentialValuesIncluded: false,
    },
  };
}

export function sanitizeSettings(input) {
  const rejectedPaths = [];
  const visit = (value, path, depth) => {
    if (depth > 5) {
      rejectedPaths.push(path);
      return undefined;
    }
    if (value === null || typeof value === "boolean") return value;
    if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
    if (typeof value === "string") return value.slice(0, 500);
    if (Array.isArray(value)) return value.slice(0, 64).map((entry, index) => visit(entry, `${path}[${index}]`, depth + 1)).filter((entry) => entry !== undefined);
    if (!value || typeof value !== "object") return undefined;
    const output = {};
    for (const [key, child] of Object.entries(value).slice(0, 64)) {
      const childPath = `${path}.${key}`;
      if (sensitiveSettingKey(key)) {
        rejectedPaths.push(childPath);
        continue;
      }
      const safe = visit(child, childPath, depth + 1);
      if (safe !== undefined) output[key] = safe;
    }
    return output;
  };
  return { value: visit(input || {}, "$", 0) || {}, rejectedPaths };
}

function summarizeAllowedMemory(mind, options) {
  const scopes = [];
  const resultRefs = [];
  const counts = {};
  if (!mind || typeof mind !== "object") return { scopes, resultRefs, counts };
  const families = ["facts", "context", "phraseCards", "journalEntries", "knownOthers", "canonicalChoices"];
  for (const family of families) {
    const entries = Array.isArray(mind[family]) ? mind[family] : [];
    const allowed = entries.filter((entry) => memoryEntryAllowed(entry, options));
    counts[family] = { available: entries.length, allowed: options.authorized ? allowed.length : 0 };
    if (allowed.length && options.authorized) scopes.push(`avatar-mind:${family}`);
    if (options.authorized) {
      for (const [index, entry] of allowed.entries()) {
        const id = typeof entry === "object" && entry ? entry.id || entry.choiceId || entry.cardId : null;
        resultRefs.push(`avatar-mind:${family}:${id || index}`);
      }
    }
  }
  return { scopes: [...new Set(scopes)], resultRefs: resultRefs.slice(0, 64), counts };
}

function memoryEntryAllowed(entry, options) {
  if (!entry || typeof entry !== "object") return options.visibility.includes("public") && options.classifications.includes("unclassified");
  const visibility = entry.visibility || entry.access || "private";
  const classification = entry.classification || entry.kind || "unclassified";
  return options.visibility.includes(visibility) && options.classifications.includes(classification);
}

function resolveCollections(refs, sources) {
  const tarot = sources.tarot || {};
  const candidates = [
    ...(tarot.decks || []).map((entry) => ({ ...entry, kind: "deck" })),
    ...(tarot.sets || []).map((entry) => ({ ...entry, kind: "set" })),
  ];
  return (refs || []).map((ref) => {
    const match = candidates.find((entry) => entry.id === ref.id);
    const memberIds = match?.cardIds || match?.memberIds || [];
    return {
      id: ref.id,
      revision: ref.revision,
      kind: match?.kind || "collection",
      available: Boolean(match),
      memberKeys: memberIds.map((id) => `hapa-avatar-builder:card:${id}`),
      sourceOwner: "hapa-avatar-builder",
    };
  });
}

function buildSourceRevisions({ avatar, sources, collections, process, binding }) {
  const revisions = {
    process: String(process.version),
    binding: String(binding.provenance?.sourceRevision || binding.createdAt),
  };
  if (avatar) revisions.avatar = revisionOf(avatar, sources.avatars);
  for (const [key, source] of Object.entries(sources)) {
    if (key !== "avatars" && source?.updatedAt) revisions[key] = String(source.updatedAt);
  }
  for (const collection of collections) revisions[`collection:${collection.id}`] = String(collection.revision);
  return revisions;
}

function buildSourcePreview({ avatar, sources, collections, process, binding, memory }) {
  return [
    { kind: "process", id: process.id, owner: process.ownerNodeId, revision: process.version, resolver: process.process.resolver?.uri || null, included: true },
    { kind: "binding", id: binding.id, owner: binding.createdBy, revision: binding.provenance?.sourceRevision || binding.createdAt, resolver: null, included: true },
    ...(avatar ? [{
      kind: "avatar", id: avatar.id, owner: "hapa-avatar-builder", revision: revisionOf(avatar, sources.avatars),
      resolver: `/api/avatars/${encodeURIComponent(avatar.id)}`, included: true,
      summary: { primaryName: avatar.primaryName || avatar.id, memoryCounts: memory.counts },
    }] : []),
    ...collections.map((collection) => ({
      kind: collection.kind, id: collection.id, owner: collection.sourceOwner, revision: String(collection.revision),
      resolver: `/api/tarot/attach?${collection.kind}Id=${encodeURIComponent(collection.id)}`, included: collection.available,
      summary: { memberCount: collection.memberKeys.length },
    })),
    ...safeSourceSummaries(sources),
  ];
}

function safeSourceSummaries(sources) {
  const definitions = [
    ["inventory", "/api/inventory", ["inventories", "assignments", "hardpoints"]],
    ["items", "/api/items", ["cards"]],
    ["tarot", "/api/tarot", ["cards", "decks", "sets"]],
    ["world", "/api/world", ["scenes", "places", "episodes"]],
    ["songs", "/api/hapa-songs", ["songs"]],
    ["teams", "/api/avatar-teams", ["teams"]],
  ];
  return definitions.flatMap(([kind, resolver, fields]) => {
    const source = sources[kind];
    if (!source) return [];
    return [{
      kind,
      id: `hapa-avatar-builder:${kind}`,
      owner: "hapa-avatar-builder",
      revision: revisionOf(source),
      resolver,
      included: true,
      summary: Object.fromEntries(fields.map((field) => [`${field}Count`, Array.isArray(source[field]) ? source[field].length : 0])),
    }];
  });
}

function requireCanonical(schema, value, label) {
  const result = validateCanonical(schema, value);
  if (!result.ok) throw new Error(`${label} is invalid: ${JSON.stringify(result.issues)}`);
  return result.value;
}

function uniqueRefs(refs) {
  const seen = new Set();
  return refs.filter((ref) => {
    const key = entityKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeSettings(layers) {
  return Object.assign({}, ...layers.filter((layer) => layer && typeof layer === "object" && !Array.isArray(layer)));
}

function memoryMode(sources) {
  if (sources.includes("avatar-mind")) return "personal";
  if (sources.includes("second-brain")) return "durable";
  if (sources.includes("run")) return "run";
  return "none";
}

function cleanObject(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function revisionOf(record, store) {
  return String(record?.revision || record?.updatedAt || store?.updatedAt || store?.schemaVersion || "unversioned");
}

function safeShortString(value) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 160) : "";
}

function sensitiveSettingKey(key) {
  return /^(password|passphrase|api[-_]?key|access[-_]?token|refresh[-_]?token|secret|private[-_]?key|raw[-_]?memory|memory[-_]?content|private[-_]?facts)$/i.test(key);
}

function fingerprint(value) {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193) >>> 0;
  return hash.toString(16).padStart(8, "0");
}
