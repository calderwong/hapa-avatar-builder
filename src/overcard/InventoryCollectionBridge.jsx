import { useEffect, useMemo, useRef, useState } from "react";
import { useOvercardSnapshot, useOvercardStore } from "@hapa/overcard/react";
import { isBuilderAvatarHandCollection, selectSharedInventoryHandCollections } from "./inventoryBridge.js";

const API_BASE = ["5177", "5178"].includes(globalThis.location?.port) ? "http://127.0.0.1:8787" : "";

export default function InventoryCollectionBridge() {
  const snapshot = useOvercardSnapshot();
  const store = useOvercardStore();
  const [hydrated, setHydrated] = useState(false);
  const expectedUpdatedAt = useRef(null);
  const lastSent = useRef("");
  const avatarCollections = useMemo(() => Object.values(snapshot.collections.collections).filter(isBuilderAvatarHandCollection), [snapshot.collections.collections]);
  const fingerprint = useMemo(() => JSON.stringify(avatarCollections.map((collection) => [collection.id, collection.revision, collection.members.map((member) => member.entityId)])), [avatarCollections]);

  useEffect(() => {
    if (snapshot.status !== "ready" || hydrated) return;
    let cancelled = false;
    void fetch(`${API_BASE}/api/overcard/inventory-collections`).then((response) => { if (!response.ok) throw new Error(`Inventory projection ${response.status}`); return response.json(); }).then(async (projection) => {
      if (cancelled) return;
      expectedUpdatedAt.current = projection.storeUpdatedAt;
      const existing = Object.values(snapshot.collections.collections).some(isBuilderAvatarHandCollection);
      const sharedHands = selectSharedInventoryHandCollections(projection.collections);
      if (!existing && sharedHands.length) {
        const ledger = structuredClone(snapshot.collections);
        for (const collection of sharedHands) ledger.collections[collection.id] = collection;
        await store.dispatch("state.upsert", { record: { kind: "collection-ledger", id: "canonical", value: ledger, summary: "Imported Builder avatar inventories" } });
      }
      if (!cancelled) setHydrated(true);
    }).catch((error) => { if (!cancelled) console.warn("[overcard-inventory-bridge]", error); });
    return () => { cancelled = true; };
  }, [hydrated, snapshot.collections, snapshot.status, store]);

  useEffect(() => {
    if (!hydrated || !avatarCollections.length || fingerprint === lastSent.current) return;
    lastSent.current = fingerprint;
    void fetch(`${API_BASE}/api/overcard/inventory-collections`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedUpdatedAt: expectedUpdatedAt.current, collections: avatarCollections }) }).then(async (response) => {
      const body = await response.json();
      if (!response.ok) throw new Error(body?.issues?.map((issue) => issue.message).join("; ") || `Inventory commit ${response.status}`);
      expectedUpdatedAt.current = body.storeUpdatedAt;
    }).catch((error) => { lastSent.current = ""; console.warn("[overcard-inventory-bridge]", error); });
  }, [avatarCollections, fingerprint, hydrated]);
  return null;
}
