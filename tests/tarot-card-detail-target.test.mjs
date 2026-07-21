import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  isTarotCardDetailTargetSettled,
  resolveTarotCardDetailTargetEntry,
} from "../src/domain/tarot-card-detail-target.js";

function placedEntry(id, overrides = {}) {
  return {
    card: { id, title: id },
    state: "placed",
    drawAnim: null,
    delay: 0,
    detailsOpen: false,
    ...overrides,
  };
}

test("a settled selected browser card exposes the shared 3D Details target", () => {
  const selectedEntry = placedEntry("codex-build-week-card", { browserAdded: true });

  assert.equal(isTarotCardDetailTargetSettled(selectedEntry), true);
  assert.equal(resolveTarotCardDetailTargetEntry({ selectedEntry }), selectedEntry);
});

test("a settled hovered card takes precedence over the selected card", () => {
  const selectedEntry = placedEntry("selected");
  const hoveredEntry = placedEntry("hovered");

  assert.equal(resolveTarotCardDetailTargetEntry({ selectedEntry, hoveredEntry }), hoveredEntry);
});

test("the Details target stays hidden while a card is held or details are already open", () => {
  const selectedEntry = placedEntry("selected");

  assert.equal(resolveTarotCardDetailTargetEntry({ selectedEntry, heldEntry: selectedEntry }), null);
  assert.equal(resolveTarotCardDetailTargetEntry({ selectedEntry: { ...selectedEntry, detailsOpen: true } }), null);
});

test("unsettled selected cards wait until their deal animation completes", () => {
  const animatingEntry = placedEntry("animating", { drawAnim: { life: 0 } });
  const delayedEntry = placedEntry("delayed", { delay: 0.2 });

  assert.equal(resolveTarotCardDetailTargetEntry({ selectedEntry: animatingEntry }), null);
  assert.equal(resolveTarotCardDetailTargetEntry({ selectedEntry: delayedEntry }), null);
});

test("the 3D target selector and projector share the extracted settled contract", async () => {
  const source = await readFile(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8");

  assert.match(source, /resolveTarotCardDetailTargetEntry\(\{ selectedEntry, hoveredEntry, heldEntry \}\)/);
  assert.match(source, /isTarotCardDetailTargetSettled\(entry\)/);
  assert.doesNotMatch(source, /isCardDetailTargetSettled/);
});
