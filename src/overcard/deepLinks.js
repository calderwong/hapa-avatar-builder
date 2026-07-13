import { createOvercardDeepLink } from "@hapa/overcard/core";

export function buildAttachmentNavigation(attachment, { catalog = {}, bindings = {}, processAdapter = null, telemetry = [] } = {}) {
  const key = `${attachment.entity.sourceSystem}:${attachment.entity.entityType}:${attachment.entity.entityId}`;
  const catalogEntry = catalog[key] || Object.values(catalog).find((entry) => entry.sourceSystem === attachment.entity.sourceSystem && entry.entityType === attachment.entity.entityType && entry.entityId === attachment.entity.entityId);
  const binding = attachment.bindingId ? bindings[attachment.bindingId] : null;
  const evidence = telemetry.filter((entry) => entry.traceId && [attachment.provenance?.traceId, attachment.bindingId].includes(entry.traceId)).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 3);
  return {
    source: { label: "Open source", href: catalogEntry?.detailUri || catalogEntry?.resolver?.uri || createOvercardDeepLink({ nodeId: attachment.entity.sourceSystem, resourceType: "source", resourceId: attachment.entity.entityId, revision: attachment.entity.revision }) },
    binding: attachment.bindingId ? { label: "Open binding", href: createOvercardDeepLink({ nodeId: attachment.host.nodeId, resourceType: "binding", resourceId: attachment.bindingId, revision: binding?.formation?.revision }) } : null,
    process: attachment.host.processId ? { label: "Open process", href: processAdapter?.inspect?.uri || createOvercardDeepLink({ nodeId: attachment.host.nodeId, resourceType: "process", resourceId: attachment.host.processId }) } : null,
    evidence: evidence.map((entry) => ({ id: entry.id, label: entry.summary, at: entry.at, level: entry.level, href: createOvercardDeepLink({ nodeId: attachment.host.nodeId, resourceType: "evidence", resourceId: entry.id }) })),
  };
}
