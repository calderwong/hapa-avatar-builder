import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createVariationLab, loadVariationLab, promoteVariation, regenerateVariationLab, saveVariationLab, setVariationLock } from "../src/domain/variation-lab.js";

function memoryStorage() {
  const data = new Map();
  return { setItem: (key, value) => data.set(key, value), getItem: (key) => data.get(key) || null };
}

test("A/B/C variants reuse expensive decisions and human locks survive regeneration", () => {
  let lab = createVariationLab({ projectId: "dear-papa", treatmentId: "treatment:1", cueGraphId: "cue:1" });
  assert.equal(lab.variants.length, 3);
  assert.equal(lab.semanticDecisionRuns, 0);
  assert.ok(lab.reusedExpensiveDecisions.includes("semantic-media-rankings"));
  assert.ok(lab.rerolledCheapAxes.includes("visualizer-mix"));
  lab = setVariationLock(lab, { targetKind: "decision", targetId: "media-casting", value: "locked" });
  const storage = memoryStorage();
  saveVariationLab(storage, lab);
  const loaded = loadVariationLab(storage, "dear-papa");
  const regenerated = regenerateVariationLab(loaded, { treatmentId: "treatment:2", cueGraphId: "cue:1" });
  assert.deepEqual(regenerated.locks, lab.locks);
  assert.equal(regenerated.treatmentId, "treatment:2");
});

test("promotion is a non-destructive lineage patch and losers remain reproducible", () => {
  const lab = createVariationLab({ projectId: "dear-papa", treatmentId: "treatment:1", cueGraphId: "cue:1" });
  const promoted = promoteVariation(lab, lab.variants[1].id, { operator: "Calder", promotedAt: "2026-07-11T07:55:00Z" });
  assert.equal(promoted.promoted.nonDestructive, true);
  assert.equal(promoted.promoted.parentTreatmentId, "treatment:1");
  assert.equal(promoted.promoted.parentCueGraphId, "cue:1");
  assert.ok(promoted.promoted.losers.every((row) => row.reproducible && row.seed && row.receiptHash));
  assert.deepEqual(promoted.promoted.formatVariantInputs.supportedFormats, ["16:9", "9:16", "1:1", "lyric", "instrumental"]);
});

test("Variation Lab UI exposes axes, locks, previews, reuse, and promotion", () => {
  const source = fs.readFileSync("src/components/VariationLabPanel.jsx", "utf8");
  assert.match(source, /data-testid="variation-lab"/);
  assert.match(source, /Cheap axes reroll/);
  assert.match(source, /0 expensive decision runs/);
  assert.match(source, /Promote winner/);
  assert.match(source, /previewRange/);
});
