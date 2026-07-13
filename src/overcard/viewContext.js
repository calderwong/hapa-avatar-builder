import { BUILDER_HOST_TARGETS } from "./hostTargets.js";

const ROUTE_ACTIONS = {
  builder: { avatar: "select-avatar" }, mind: { avatar: "select-avatar" }, lookbook: { avatar: "select-avatar" },
  lore: { avatar: "select-avatar", scene: "select-scene" },
  protocol: { avatar: "select-avatar" }, bank: { avatar: "select-avatar" }, kanban: { avatar: "select-avatar" },
  items: { avatar: "select-avatar", card: "select-item", node: "select-item", tool: "select-item" },
  scenes: { avatar: "select-avatar", scene: "select-scene" },
  loops: { avatar: "select-avatar", card: "select-loop", media: "select-loop", scene: "select-scene" },
  songs: { avatar: "select-avatar", song: "select-song" },
  echos: { avatar: "select-avatar", song: "select-song" },
  "tarot-library": { avatar: "select-avatar", card: "select-tarot-card", deck: "select-tarot-deck", set: "select-tarot-set" },
  "creator-sets": { avatar: "select-avatar", set: "select-creator-set" },
};

export function resolveBuilderViewContext(route, attachments = []) {
  const target = BUILDER_HOST_TARGETS.find((entry) => entry.route === route);
  if (!target || target.contextMode === "responsibility" || route === "tarot") return { route, contextMode: target?.contextMode || "unsupported", attachments: [], actions: [], unsupported: [], labels: [], inert: true };
  const active = attachments.filter((attachment) => attachment.status === "active" && attachment.host.nodeId === "hapa-avatar-builder" && attachment.host.hostId === route);
  const actions = []; const unsupported = [];
  for (const attachment of active) {
    const action = ROUTE_ACTIONS[route]?.[attachment.entity.entityType];
    const record = { action: action || "inert", entityId: attachment.entity.entityId, entityType: attachment.entity.entityType, attachmentId: attachment.id, label: attachment.entity.label || attachment.entity.entityId };
    if (action) actions.push(record); else unsupported.push({ ...record, reason: `${target.label} has no view adapter for ${attachment.entity.entityType}; attachment remains context-only and inert.` });
  }
  return { route, contextMode: target.contextMode, attachments: active, actions, unsupported, labels: active.map((item) => item.entity.label || item.entity.entityId), inert: !actions.length };
}
