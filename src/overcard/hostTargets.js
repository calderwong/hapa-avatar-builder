const NODE_ID = "hapa-avatar-builder";
const COMMON_CONTEXT = ["avatar", "card", "deck", "set"];

export const BUILDER_HOST_TARGETS = Object.freeze([
  host("builder", "Builder", "grid", ["builder", "build", "media"], "view-context", "filters the media intake and assembly view", COMMON_CONTEXT, [{ store: "avatars", delay: 900 }]),
  host("mind", "Mind", "brain", ["mind", "avatar-mind"], "view-context", "filters the selected Avatar Mind and loadout", ["avatar", "card", "deck"]),
  host("scenes", "Scenes", "scenes", ["scenes", "scene", "world"], "process-context", "contributes bounded avatar, card, and set context to scene authoring", ["avatar", "card", "set", "scene"], [{ store: "world", delay: 800 }], { processId: "scenes", adapterId: "builder-scenes-author" }),
  host("items", "Items", "items", ["items", "item-manager", "inventory"], "process-context", "contributes context to Item Manager inventory operations", ["avatar", "card", "deck", "set", "node", "tool"], [{ store: "items", delay: 800 }], { processId: "items", adapterId: "builder-item-manager", fallback: "inventory-defaults" }),
  host("loops", "Loops", "loops", ["loops", "loop", "routes"], "process-context", "contributes media and avatar context to loop routing", ["avatar", "card", "media", "scene"], [], { processId: "loops", adapterId: "builder-loop-router", fallback: "manual-routing" }),
  host("lookbook", "Look Book", "lookbook", ["lookbook", "look-book"], "view-context", "filters the avatar Look Book presentation", ["avatar", "card", "set"]),
  host("lore", "Lore Reader", "lore", ["lore", "lore-reader"], "view-context", "filters lore sources without granting write authority", ["avatar", "card", "set", "scene"], [{ store: "avatars", delay: 900 }, { store: "world", delay: 1300 }, { store: "items", delay: 1700 }]),
  host("songs", "Hapa Songs", "songs", ["songs", "song", "music"], "process-context", "contributes avatar, scene, and card context to song workflows", ["avatar", "card", "deck", "scene", "song"], [{ store: "song-registry", delay: 360 }, { store: "songs", delay: 520 }, { store: "avatars", delay: 1200 }, { store: "world", delay: 1600 }], { processId: "songs-director", adapterId: "builder-songs-director", role: "director", effect: "authority", activation: "human-gate", requiredCapabilities: ["songs.direct"], requiredPermissions: ["songs.run"], fallback: "song-director-defaults" }),
  host("echos", "Echos Album", "echos", ["echos", "echo", "album"], "process-context", "contributes song and visual context to Echos playback", ["avatar", "card", "scene", "song"], [], { processId: "echos-director", adapterId: "builder-echos-director", fallback: "embedded-playback-defaults" }),
  host("kanban", "Kanban", "kanban", ["kanban", "board", "tasks"], "view-context", "filters board work; an explicit second socket stages only approved append-only actions", ["avatar", "card", "set", "task"], [{ store: "kanban", delay: 800 }], { processId: "kanban-actions", adapterId: "builder-kanban-actions-remote", additionalSlots: [{ id: "kanban:approved-action", label: "Approved Action", role: "operator", accepts: ["avatar", "card", "set", "task"], capacity: 1, effect: "authority", requiredCapabilities: ["board.append"], requiredPermissions: ["kanban.approved-action"], activation: "human-gate", interruptionPolicy: "pause-at-checkpoint" }], fallback: "read-only-board" }),
  host("protocol", "Avatar Card", "avatar-card", ["protocol", "avatar-card", "profile"], "view-context", "selects the Avatar Card and related presentation context", ["avatar", "card", "deck", "set"], [{ store: "items", delay: 700 }]),
  host("bank", "Hapa Bank", "bank", ["bank", "hapa-bank"], "view-context", "filters the embedded Bank view; it cannot stage financial authority", ["avatar", "card", "set"], [], { processId: "bank-context", adapterId: "builder-bank-embed", fallback: "unfiltered-embed" }),
  host("tarot-library", "Tarot Library", "tarot-library", ["tarot-library", "tarot-cards", "tarot-decks"], "view-context", "filters Tarot records and can contribute explicit materials to the local Forge", ["avatar", "card", "deck", "set"], [{ store: "tarot", delay: 520 }, { store: "avatars", delay: 1400 }], { processId: "tarot-forge", adapterId: "builder-tarot-forge", additionalSlots: [{ id: "tarot-library:forge-materials", label: "Forge Materials", role: "materials", accepts: ["card", "deck", "set"], capacity: 12, effect: "context", requiredCapabilities: ["context.read"], requiredPermissions: ["tarot.context"], activation: "confirm", interruptionPolicy: "finish-run" }] }),
  host("hell-week", "Hell Week", "hell-week", ["hell-week", "hellweek"], "responsibility", "can stage a bounded manager responsibility plus Card/Deck/Set context for remotely owned Hell Week after authorization", ["avatar"], [], { processId: "hell-week", role: "manager", effect: "authority", capacity: 1, adapterId: "builder-hell-week-remote", fallback: "process-default", additionalSlots: [{ id: "hell-week:context", label: "Run Context", role: "context", accepts: ["card", "deck", "set"], capacity: 12, effect: "context", requiredCapabilities: ["context.read"], requiredPermissions: ["hell-week.context"], activation: "confirm", interruptionPolicy: "finish-run" }] }),
  host("tarot", "Tarot Draw", "tarot-draw", ["tarot", "tarot-draw", "draw"], "process-context", "contributes cards, Decks, Sets, and avatars to the 3D Tarot process", ["avatar", "card", "deck", "set", "song"], [{ store: "song-registry", delay: 620 }, { store: "songs", delay: 900 }, { store: "items", delay: 1200 }], { processId: "tarot-draw", role: "context", effect: "context", capacity: 22, adapterId: "builder-tarot-draw", fallback: "local-deck" }),
  host("creator-sets", "Creator Sets", "creator-sets", ["creator-sets", "creator", "sets"], "process-context", "contributes cards, avatars, and Sets to creator-set assembly", ["avatar", "card", "deck", "set"], [{ store: "items", delay: 800 }], { processId: "creator-set-assembly", adapterId: "builder-creator-set-assembly", fallback: "empty-set" }),
]);

const BY_ROUTE = new Map(BUILDER_HOST_TARGETS.map((target) => [target.route, target]));
const BY_ALIAS = new Map(BUILDER_HOST_TARGETS.flatMap((target) => target.aliases.map((alias) => [alias, target.route])));

export function resolveBuilderHostAlias(value, fallback = "builder") { return BY_ALIAS.get(String(value || "").trim().toLowerCase()) || (BY_ROUTE.has(value) ? value : fallback); }
export function getBuilderHostTarget(route) { return BY_ROUTE.get(resolveBuilderHostAlias(route, "builder")) || BY_ROUTE.get("builder"); }
export const BUILDER_OVERCARD_MANAGEMENT_TARGETS = Object.freeze({
  hand: null,
  deck: "tarot-library",
  set: "creator-sets",
  library: "tarot-library",
});
export function getBuilderOvercardManagementTarget(kind) {
  const route = BUILDER_OVERCARD_MANAGEMENT_TARGETS[kind] ?? null;
  return route ? getBuilderHostTarget(route) : null;
}
export function builderHostTargetRegistrations() {
  return BUILDER_HOST_TARGETS.map((target) => ({
    id: target.id, nodeId: NODE_ID, hostId: target.hostId, ...(target.processId ? { processId: target.processId } : {}),
    label: target.label, accepts: [...new Set(target.slots.flatMap((slot) => slot.accepts))], rendererId: target.renderer,
    route: target.route, aliases: target.aliases, contextMode: target.contextMode, effectExplanation: target.effectExplanation,
    launchAction: target.launchAction, adapterId: target.adapterId, fallback: target.fallback, slots: target.slots,
  }));
}

function host(route, label, iconId, aliases, contextMode, effectExplanation, accepts, lazyLoad = [], overrides = {}) {
  const effect = overrides.effect || (contextMode === "view-context" ? "presentation" : contextMode === "responsibility" ? "authority" : "context");
  const role = overrides.role || (effect === "presentation" ? "filter" : "context");
  return Object.freeze({
    id: `builder-host:${route}`, nodeId: NODE_ID, hostId: route, route, aliases: [...new Set([route, ...aliases])], label, iconId,
    contextMode, effectExplanation, lazyLoad, renderer: `builder-host-${route}`, adapterId: overrides.adapterId || (effect === "presentation" ? "builder-view-context" : "builder-process-context"),
    processId: overrides.processId, fallback: overrides.fallback || (effect === "presentation" ? "unfiltered-view" : "process-default"), launchAction: { type: "switch-view", view: route },
    slots: [{ id: `${route}:${role}`, label: role === "filter" ? "View Context" : role === "manager" ? "Manager" : "Process Context", role, accepts, capacity: overrides.capacity || (effect === "presentation" ? 9 : 12), effect, requiredCapabilities: overrides.requiredCapabilities || (effect === "authority" ? ["process.manage"] : effect === "context" ? ["context.read"] : []), requiredPermissions: overrides.requiredPermissions || (effect === "authority" ? [`${overrides.processId || route}.run`] : []), activation: overrides.activation || (effect === "authority" ? "human-gate" : effect === "context" ? "confirm" : "none"), interruptionPolicy: overrides.interruptionPolicy || "finish-run" }, ...(overrides.additionalSlots || [])],
  });
}
