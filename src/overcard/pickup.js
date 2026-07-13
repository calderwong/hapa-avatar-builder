export function builderEntityRef(input = {}) {
  const id = String(input.id || input.entityId || "").trim();
  if (!id) throw new Error("Builder pickup entity id is required.");
  const type = input.entityType || input.type || "card";
  return {
    schema: "hapa.entity-ref.v2",
    sourceSystem: input.sourceSystem || "hapa-avatar-builder",
    entityType: type,
    entityId: id,
    revision: String(input.revision || input.updatedAt || "unversioned"),
    availability: input.availability || "available",
    label: input.label || input.title || input.name || id,
    resolver: input.resolver || { kind: "api", uri: input.uri || `/api/overcard/catalog?entityId=${encodeURIComponent(id)}` },
    presentation: { title: input.title || input.label || input.name || id, subtitle: input.subtitle || "", ...(input.thumbnail ? { thumbnail: input.thumbnail } : {}) },
  };
}

export function builderPickupDataset(input = {}) {
  const ref = builderEntityRef(input);
  return {
    draggable: true,
    "data-overcard-source-system": ref.sourceSystem,
    "data-overcard-entity-type": ref.entityType,
    "data-overcard-entity-id": ref.entityId,
    "data-overcard-entity-label": ref.label,
    "data-overcard-entity-revision": ref.revision,
    "data-overcard-entity-uri": ref.resolver?.uri || "",
    "data-overcard-read-only": input.readOnly ? "true" : "false",
    "aria-keyshortcuts": "Control+Enter Meta+Enter Alt+Enter",
  };
}

export function entityRefFromPickupElement(element) {
  if (!element?.dataset?.overcardEntityId) return null;
  return builderEntityRef({ sourceSystem: element.dataset.overcardSourceSystem, entityType: element.dataset.overcardEntityType, id: element.dataset.overcardEntityId, label: element.dataset.overcardEntityLabel, revision: element.dataset.overcardEntityRevision, uri: element.dataset.overcardEntityUri });
}
