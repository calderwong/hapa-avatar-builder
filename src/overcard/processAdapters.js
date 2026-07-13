import { SCHEMAS, validateCanonical } from "@hapa/overcard/core";
import { resolveBuilderRuntimeContext } from "./runtimeContext.js";

const NODE_ID = "hapa-avatar-builder";

export const BUILDER_PROCESS_ADAPTERS = Object.freeze([
  adapter("builder-scenes-author", "scenes", "Scene Authoring", "local", NODE_ID, "/?view=scenes", "/api/world", "process-default", [
    socket("context", "context", ["avatar", "card", "set", "scene"], "context", ["context.read"], ["scenes.context"]),
    socket("author", "operator", ["avatar"], "authority", ["scene.author"], ["scenes.write"], "human-gate"),
  ]),
  adapter("builder-item-manager", "items", "Item Manager", "local", NODE_ID, "/?view=items", "/api/inventory", "inventory-defaults", [
    socket("context", "context", ["avatar", "card", "deck", "set", "node", "tool"], "context", ["context.read"], ["items.context"]),
  ]),
  adapter("builder-loop-router", "loops", "Loop Router", "local", NODE_ID, "/?view=loops", "/api/media-loops", "manual-routing", [
    socket("context", "context", ["avatar", "card", "media", "scene"], "context", ["context.read"], ["loops.context"]),
  ]),
  adapter("builder-songs-director", "songs-director", "Hapa Songs Director", "local", NODE_ID, "/?view=songs", "/api/hapa-songs", "song-director-defaults", [
    socket("director", "operator", ["avatar"], "authority", ["songs.direct"], ["songs.run"], "human-gate"),
    socket("context", "context", ["card", "deck", "scene", "song"], "context", ["context.read"], ["songs.context"]),
  ]),
  adapter("builder-echos-director", "echos-director", "Echos Director", "embedded", "hapa-echo-node", "/?view=echos", "/api/echos/capabilities", "embedded-playback-defaults", [
    socket("director", "advisor", ["avatar"], "authority", ["echos.direct"], ["echos.preview"], "confirm"),
    socket("context", "context", ["card", "scene", "song"], "context", ["context.read"], ["echos.context"]),
  ], { containerHostId: "echos", bridge: "post-message" }),
  adapter("builder-tarot-draw", "tarot-draw", "Tarot Draw", "local", NODE_ID, "/?view=tarot", "/api/tarot", "local-deck", [
    socket("host-avatar", "operator", ["avatar"], "authority", ["tarot.host"], ["tarot.draw"], "confirm"),
    socket("draw-context", "context", ["card", "deck", "set", "song"], "context", ["context.read"], ["tarot.context"]),
  ]),
  adapter("builder-tarot-forge", "tarot-forge", "Tarot Forge", "local", NODE_ID, "/?view=tarot-library", "/api/tarot", "manual-forge", [
    socket("author", "operator", ["avatar"], "authority", ["tarot.forge"], ["tarot.write"], "human-gate"),
    socket("materials", "context", ["card", "deck", "set"], "context", ["context.read"], ["tarot.context"]),
  ]),
  adapter("builder-creator-set-assembly", "creator-set-assembly", "Creator Set Assembly", "local", NODE_ID, "/?view=creator-sets", "/api/creator-card-sets", "empty-set", [
    socket("context", "context", ["avatar", "card", "deck", "set"], "context", ["context.read"], ["creator-sets.context"]),
  ]),
  adapter("builder-hell-week-remote", "hell-week", "Hell Week", "remote", "hapa-dev-proto", "hapa://hapa-dev-proto/pipeline", "http://127.0.0.1:5173/v1/formations/capabilities", "process-default", [
    socket("manager", "manager", ["avatar"], "authority", ["process.manage"], ["hell-week.run"], "human-gate", "pause-at-checkpoint"),
    socket("context", "context", ["card", "deck", "set"], "context", ["context.read"], ["hell-week.context"]),
    socket("reviewer", "reviewer", ["avatar", "card"], "authority", ["review.perform"], ["hell-week.review"], "confirm"),
  ], { capabilityUri: "http://127.0.0.1:5173/v1/formations/capabilities" }),
  adapter("builder-kanban-actions-remote", "kanban-actions", "Approved Kanban Actions", "remote", "hapa-overwatch-kanban", "http://127.0.0.1:5181/?project=hapa-app-hapa-avatar-builder", "/api/overwatch/board-status", "read-only-board", [
    socket("operator", "operator", ["avatar"], "authority", ["board.append"], ["kanban.approved-action"], "human-gate"),
    socket("context", "context", ["card", "set", "task"], "context", ["context.read"], ["kanban.context"]),
  ], { capabilityUri: "/api/overwatch/board-status", appendOnly: true }),
  adapter("builder-bank-embed", "bank-context", "Hapa Bank Embed", "embedded", "hapa-bank", "/?view=bank", "/api/bank/health", "unfiltered-embed", [
    socket("view-context", "context", ["avatar", "card", "set"], "presentation", ["context.read"], [], "none", "finish-run"),
  ], { containerHostId: "bank", bridge: "read-only-query" }),
]);

const BY_ID = new Map(BUILDER_PROCESS_ADAPTERS.map((entry) => [entry.id, entry]));
const BY_PROCESS = new Map(BUILDER_PROCESS_ADAPTERS.map((entry) => [entry.processId, entry]));

export function getBuilderProcessAdapter(idOrProcess) { return BY_ID.get(idOrProcess) || BY_PROCESS.get(idOrProcess) || null; }
export function builderProcessAdapterRegistrations() {
  return BUILDER_PROCESS_ADAPTERS.map((entry) => ({
    id: entry.id, processId: entry.processId, label: entry.label, mode: entry.mode, ownerNodeId: entry.ownerNodeId,
    launch: entry.launch, inspect: entry.inspect, capabilityUri: entry.capabilityUri, fallback: entry.fallback,
    runContextUri: `/api/overcard/process-adapters/${encodeURIComponent(entry.id)}/run-context`,
    process: entry.definition, bridge: entry.bridge, appendOnly: entry.appendOnly === true,
  }));
}

export function freezeBuilderRunContext(adapterId, input, sources = {}) {
  const adapterEntry = getBuilderProcessAdapter(adapterId);
  if (!adapterEntry) throw new Error(`Unknown Builder process adapter: ${adapterId}.`);
  if (input?.phase !== "run-start") throw new Error("A RuntimeContext may be frozen only at run-start.");
  if (input?.binding?.status !== "active") throw new Error("Only an active ResponsibilityBinding may be resolved for a run.");
  if (input.binding.target?.processId && input.binding.target.processId !== adapterEntry.processId) throw new Error("Binding targets a different process adapter.");
  const preview = resolveBuilderRuntimeContext({ ...input, process: adapterEntry.definition }, sources);
  const frozen = {
    schema: "hapa.builder-run-context.v1", adapterId: adapterEntry.id, processId: adapterEntry.processId,
    ownerNodeId: adapterEntry.ownerNodeId, mode: adapterEntry.mode, launch: adapterEntry.launch, inspect: adapterEntry.inspect,
    fallback: adapterEntry.fallback, frozenAt: input.now, runtimeContext: preview.runtimeContext, policy: preview.policy,
  };
  return deepFreeze(structuredClone(frozen));
}

function adapter(id, processId, label, mode, ownerNodeId, launch, inspect, fallback, sockets, options = {}) {
  const definition = {
    schema: SCHEMAS.processDefinition, id, version: "1.0.0",
    process: { schema: SCHEMAS.entityRef, sourceSystem: ownerNodeId, entityType: "process", entityId: processId, availability: "available", label },
    sockets, defaultContextLabel: `${label} process-owned defaults`, ownerNodeId,
  };
  const validation = validateCanonical(SCHEMAS.processDefinition, definition);
  if (!validation.ok) throw new Error(`Invalid Builder ProcessDefinition ${id}: ${JSON.stringify(validation.issues)}`);
  return Object.freeze({ id, processId, label, mode, ownerNodeId, launch: { kind: mode === "local" ? "builder-route" : mode === "remote" ? "external-node" : "embedded-host", uri: launch }, inspect: { kind: "capabilities", uri: inspect }, capabilityUri: options.capabilityUri || inspect, fallback, definition: validation.value, ...options });
}

function socket(id, role, accepts, effect, requiredCapabilities, requiredPermissions, activation = "confirm", interruptionPolicy = "finish-run") {
  return { id, label: id.split("-").map((part) => part[0].toUpperCase() + part.slice(1)).join(" "), role, accepts, capacity: 1, effect, requiredCapabilities, requiredPermissions, activation, interruptionPolicy };
}

function deepFreeze(value) { if (value && typeof value === "object" && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); } return value; }
