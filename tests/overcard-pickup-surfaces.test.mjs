import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { builderEntityRef, builderPickupDataset, entityRefFromPickupElement } from "../src/overcard/pickup.js";

test("Builder pickup data uses canonical refs, keyboard commands, and native-compatible draggable metadata", () => {
  const attrs = builderPickupDataset({ id: "red", entityType: "avatar", title: "Red", readOnly: true, uri: "/api/avatars/red" });
  assert.equal(attrs.draggable, true);
  assert.match(attrs["aria-keyshortcuts"], /Control\+Enter/);
  assert.match(attrs["aria-keyshortcuts"], /Alt\+Enter/);
  assert.equal(attrs["data-overcard-read-only"], "true");
  const ref = entityRefFromPickupElement({ dataset: { overcardEntityId: "red", overcardEntityType: "avatar", overcardEntityLabel: "Red", overcardSourceSystem: "hapa-avatar-builder", overcardEntityRevision: "1", overcardEntityUri: "/api/avatars/red" } });
  assert.deepEqual(ref, builderEntityRef({ id: "red", entityType: "avatar", title: "Red", revision: "1", uri: "/api/avatars/red" }));
});

test("all required Builder source families register pickup without replacing select handlers", async () => {
  const files = await Promise.all(["../src/App.jsx", "../src/components/TarotLibraryView.jsx", "../src/components/TarotDraw3DView.jsx", "../src/components/HellWeekView.jsx", "../src/components/CreatorCardSetsView.jsx"].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  const source = files.join("\n");
  for (const token of ["entityType: \"avatar\"", "entityType: card.cardType", "entityType: \"deck\"", "entityType: \"set\"", "3D Tarot Draw card", "Hell Week read-only projection", "Creator Set"]) assert.match(source, new RegExp(token));
  assert.match(source, /onClick=\{\(\) => onSelect\(avatar\.id\)\}/);
  assert.match(source, /onClick=\{onSelect\}/);
});

test("delegator preserves native drag data while adding canonical MIME and separates threshold from click", async () => {
  const source = await readFile(new URL("../src/overcard/BuilderPickupDelegator.jsx", import.meta.url), "utf8");
  assert.match(source, /dataTransfer\.setData\(OVERCARD_ENTITY_MIME/);
  assert.doesNotMatch(source, /dataTransfer\.clearData/);
  assert.match(source, /Math\.hypot/);
  assert.match(source, />= 7/);
  assert.match(source, /event\.altKey/);
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/);
});
