export const EMBED_PROTOCOL = "hapa.overcard.v1";
export const EMBED_SCHEMAS = Object.freeze({ handshake: "hapa.overcard-embed-handshake.v1", handshakeResult: "hapa.overcard-embed-handshake-result.v1", context: "hapa.overcard-embed-context.v1", action: "hapa.overcard-embed-action.v1", actionResult: "hapa.overcard-embed-action-result.v1", rejection: "hapa.overcard-embed-rejection.v1" });
export const BUILDER_EMBED_SURFACES = Object.freeze({
  bank: surface("bank", ["context.read"], ["view.filter"], ["view-context"], ["avatar", "card", "set"]),
  echos: surface("echos", ["context.read"], ["playback.select-context"], ["view-context", "process-context"], ["avatar", "card", "scene", "song"]),
  phone: surface("phone", ["context.read"], [], ["view-context", "process-context"], ["avatar", "card", "deck", "set"]),
  embed: surface("embed", ["context.read"], [], ["view-context"], ["avatar", "card", "deck", "set"]),
});

export function negotiateEmbeddedHandshake(input, options) {
  const rejected = validateEnvelope(input, EMBED_SCHEMAS.handshake); if (rejected) return rejection(input, rejected.code, rejected.message);
  if (!options.allowedOrigins.includes(options.origin)) return rejection(input, "origin_denied", `Origin ${options.origin || "<empty>"} is not allowed.`);
  const target = BUILDER_EMBED_SURFACES[input.surfaceId]; if (!target) return rejection(input, "surface_denied", `Unknown embedded surface ${String(input.surfaceId)}.`);
  const capabilities = stringArray(input.capabilities); if (capabilities.some((item) => !target.capabilities.includes(item))) return rejection(input, "capability_denied", "The embedded node requested an unsupported capability.");
  const grantedActions = stringArray(input.actions).filter((item) => target.approvedActions.includes(item));
  return { schema: EMBED_SCHEMAS.handshakeResult, protocol: EMBED_PROTOCOL, version: 1, accepted: true, surfaceId: target.id, nonce: input.nonce, sessionId: options.sessionId, grantedCapabilities: capabilities, grantedActions, readOnly: grantedActions.length === 0, context: projectEmbeddedContext(target.id, options.attachments) };
}

export function authorizeEmbeddedAction(input, session) {
  const rejected = validateEnvelope(input, EMBED_SCHEMAS.action); if (rejected) return rejection(input, rejected.code, rejected.message);
  if (!session || input.sessionId !== session.sessionId || input.surfaceId !== session.surfaceId) return rejection(input, "session_denied", "Embedded session is missing, expired, or belongs to another surface.");
  if (!session.grantedActions.includes(input.action)) return rejection(input, "action_denied", `Action ${String(input.action)} was not explicitly advertised and approved.`);
  if (!isPortableArgs(input.args)) return rejection(input, "unsafe_args", "Embedded action arguments must be bounded portable JSON without credential or memory values.");
  return { schema: EMBED_SCHEMAS.actionResult, protocol: EMBED_PROTOCOL, version: 1, accepted: true, requestId: input.requestId, sessionId: session.sessionId, surfaceId: session.surfaceId, action: input.action, args: structuredClone(input.args || {}) };
}

export function projectEmbeddedContext(surfaceId, attachments = {}) {
  const target = BUILDER_EMBED_SURFACES[surfaceId] || BUILDER_EMBED_SURFACES.embed;
  const projected = Object.values(attachments).filter((item) => { const host = String(item?.host?.hostId || ""); const hostMatches = surfaceId === "phone" ? ["phone", "tarot"].includes(host) : surfaceId === "embed" ? true : host === surfaceId; return hostMatches && target.acceptedModes.includes(item?.mode) && target.entityTypes.includes(item?.entity?.entityType) && !["revoked", "removed", "conflict"].includes(item?.status); }).map((item) => ({ attachmentId: String(item.id), revision: Number(item.revision) || 0, entity: minimalEntity(item.entity), role: String(item.role || item.host?.socketId || "context"), mode: item.mode, status: item.status, socketId: item.host?.socketId ? String(item.host.socketId) : null }));
  return { schema: EMBED_SCHEMAS.context, protocol: EMBED_PROTOCOL, version: 1, surfaceId: target.id, attachments: projected };
}

export function allowedEmbedOrigins(locationOrigin, configured = "") { return [...new Set([locationOrigin, ...String(configured).split(",").map((value) => value.trim()).filter(Boolean)].filter((origin) => /^https?:\/\//.test(origin)))]; }
function validateEnvelope(input, schema) { if (!input || typeof input !== "object" || Array.isArray(input)) return { code: "invalid_message", message: "Embedded message must be an object." }; if (input.schema !== schema) return { code: "schema_denied", message: `Expected ${schema}.` }; if (input.protocol !== EMBED_PROTOCOL || input.version !== 1) return { code: "version_denied", message: "Unsupported Overcard embed protocol or version." }; if (typeof input.surfaceId !== "string" || schema === EMBED_SCHEMAS.handshake && typeof input.nonce !== "string") return { code: "invalid_message", message: "Surface and nonce are required." }; return null; }
function rejection(input, code, message) { return { schema: EMBED_SCHEMAS.rejection, protocol: EMBED_PROTOCOL, version: 1, accepted: false, surfaceId: typeof input?.surfaceId === "string" ? input.surfaceId : null, requestId: typeof input?.requestId === "string" ? input.requestId : null, code, message }; }
function surface(id, capabilities, approvedActions, acceptedModes, entityTypes) { return Object.freeze({ id, capabilities, approvedActions, acceptedModes, entityTypes }); }
function stringArray(value) { return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : []; }
function minimalEntity(entity) { return { schema: "hapa.entity-ref.v2", sourceSystem: String(entity.sourceSystem), entityType: String(entity.entityType), entityId: String(entity.entityId), ...(entity.revision ? { revision: String(entity.revision) } : {}), ...(entity.label ? { label: String(entity.label).slice(0, 160) } : {}), availability: ["available", "unavailable", "unknown"].includes(entity.availability) ? entity.availability : "unknown" }; }
function isPortableArgs(value) { try { const encoded = JSON.stringify(value || {}); return encoded.length <= 8192 && !/(password|secret|token|credential|privateMemory|memoryText)/i.test(encoded); } catch { return false; } }
