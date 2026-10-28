import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8");

test("Score Dust preview cannot hide a cut that carries its own Score Dust layer", () => {
  // The preview draws dust in place of the cut's shaders and media; with a dust
  // layer in the cut it would leave only dust on screen.
  assert.match(source, /const cutHasScoreDustLayer = Boolean\(activeProject\?\.score_dust_layer\);/);
  assert.match(source, /useEffect\(\(\) => \{ if \(cutHasScoreDustLayer\) setScoreDustPreview\(false\); \}, \[cutHasScoreDustLayer\]\);/);
  const toggle = source.match(/<input type="checkbox" data-testid="echo-score-dust-toggle"[^>]*>/)?.[0] || "";
  assert.match(toggle, /checked=\{scoreDustPreview && !cutHasScoreDustLayer\}/);
  assert.match(toggle, /disabled=\{previewRecordingActiveRef\.current \|\| cutHasScoreDustLayer\}/);
});
