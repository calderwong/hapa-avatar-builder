import { useEffect, useRef, useState } from "react";
import { applyCollectionCommand, pickUpEntity } from "@hapa/overcard/core";
import { OVERCARD_ENTITY_MIME, serializeOvercardEntity, useOvercardCollections, useOvercardPickup, useOvercardStore } from "@hapa/overcard/react";
import { entityRefFromPickupElement } from "./pickup.js";

export default function BuilderPickupDelegator({ surfaceId = "hapa-avatar-builder", actor = "calder" }) {
  const pickup = useOvercardPickup();
  const collections = useOvercardCollections();
  const store = useOvercardStore();
  const [status, setStatus] = useState("");
  const pointer = useRef(null);
  const state = useRef({ collections, store });
  state.current = { collections, store };
  useEffect(() => {
    const source = (target) => target instanceof Element ? target.closest("[data-overcard-entity-id]") : null;
    const hold = (element) => { const entity = entityRefFromPickupElement(element); if (!entity) return; pickup.setHeld(pickUpEntity({ entity, surfaceId, actor, at: new Date().toISOString() })); setStatus(`Holding ${entity.label || entity.entityId}.`); };
    const add = async (element) => {
      const entity = entityRefFromPickupElement(element); if (!entity) return;
      const ledger = state.current.collections; const preference = ledger.activeHands[surfaceId];
      const hand = preference?.collectionId ? ledger.collections[preference.collectionId] : Object.values(ledger.collections).find((entry) => entry.kind === "hand" && entry.activeForSurfaces?.includes(surfaceId));
      if (!hand) { setStatus("Create or select a Hand first."); return; }
      const at = new Date().toISOString(); const id = crypto.randomUUID();
      try { const receipt = applyCollectionCommand(ledger, { id, operation: "copy", entity, toCollectionId: hand.id, expectedToRevision: hand.revision, actor, at, provenance: { source: `${surfaceId}:delegated-pickup`, actor, createdAt: at, traceId: id } }); await state.current.store.dispatch("state.upsert", { record: { kind: "collection-ledger", id: "canonical", value: receipt.state, summary: `Add ${entity.label || entity.entityId} to Hand` } }); setStatus(`Added ${entity.label || entity.entityId} to ${hand.name}.`); } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    };
    const down = (event) => { const element = source(event.target); if (element) pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, element, crossed: false }; };
    const move = (event) => { if (pointer.current?.id === event.pointerId && Math.hypot(event.clientX - pointer.current.x, event.clientY - pointer.current.y) >= 7) pointer.current.crossed = true; };
    const up = (event) => { if (pointer.current?.id === event.pointerId && pointer.current.crossed) hold(pointer.current.element); pointer.current = null; };
    const key = (event) => { const element = source(event.target); if (!element || event.key !== "Enter") return; if (event.altKey) { event.preventDefault(); void add(element); } else if (event.ctrlKey || event.metaKey) { event.preventDefault(); hold(element); } };
    const drag = (event) => { const element = source(event.target); const entity = entityRefFromPickupElement(element); if (!entity || !event.dataTransfer) return; event.dataTransfer.setData(OVERCARD_ENTITY_MIME, serializeOvercardEntity(entity)); event.dataTransfer.effectAllowed = element.dataset.overcardReadOnly === "true" ? "copy" : "copyMove"; hold(element); };
    document.addEventListener("pointerdown", down, true); document.addEventListener("pointermove", move, true); document.addEventListener("pointerup", up, true); document.addEventListener("pointercancel", up, true); document.addEventListener("keydown", key, true); document.addEventListener("dragstart", drag, true);
    return () => { document.removeEventListener("pointerdown", down, true); document.removeEventListener("pointermove", move, true); document.removeEventListener("pointerup", up, true); document.removeEventListener("pointercancel", up, true); document.removeEventListener("keydown", key, true); document.removeEventListener("dragstart", drag, true); };
  }, [actor, pickup, surfaceId]);
  return status ? <div className="builder-overcard-pickup-status" role="status">{status}</div> : null;
}
