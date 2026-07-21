import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildTarotCardBrowserCollections,
  filterTarotCardBrowserItemsByQuery,
} from "../src/domain/tarot-card-browser-collections.js";

const buildWeekItems = Array.from({ length: 16 }, (_, index) => ({
  id: `media-${index + 1}`,
  cardId: `codex-build-week-card-${index + 1}`,
  title: `Build Week Card ${index + 1}`,
  kind: "image",
  uri: `/media/codex-build-week/cards/card-${index + 1}.png`,
  tags: ["codex-build-week", "tarot-draw-ready"],
  card: {
    id: `codex-build-week-card-${index + 1}`,
    title: `Build Week Card ${index + 1}`,
    enrichment: {
      media: {
        codexBuildWeek: {
          setId: "codex-build-week-2026",
          category: ["turn", "skill", "capability", "protocol"][Math.floor(index / 4)],
          number: `${index + 1}`,
          order: index + 1,
          sourceTurnIds: [`ai_turn:${String(index + 1).padStart(16, "0")}`]
        }
      }
    }
  }
}));

test("Codex Build Week search resolves the full hyphen-tagged Set", () => {
  assert.equal(filterTarotCardBrowserItemsByQuery(buildWeekItems, "Codex Build Week").length, 16);
  assert.equal(filterTarotCardBrowserItemsByQuery(buildWeekItems, "codex-build-week").length, 16);
});

test("Card Browser projects one ordered 16-Card Build Week collection", () => {
  const collections = buildTarotCardBrowserCollections([...buildWeekItems].reverse());
  assert.equal(collections.length, 1);
  assert.equal(collections[0].id, "codex-build-week-2026");
  assert.equal(collections[0].title, "Codex Build Week");
  assert.equal(collections[0].count, 16);
  assert.deepEqual(collections[0].items.map((item) => item.card.enrichment.media.codexBuildWeek.order), Array.from({ length: 16 }, (_, index) => index + 1));
  assert.deepEqual(collections[0].categories, ["capability", "protocol", "skill", "turn"]);
});

test("3D Card Browser exposes Set loading and explicit Details controls", async () => {
  const source = await readFile(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8");
  assert.match(source, /Featured Tarot Sets/);
  assert.match(source, /Add All \$\{collection\.count\}/);
  assert.match(source, /View details for \$\{item\.title\}/);
  assert.match(source, /Add & Open 3D Details/);
});
