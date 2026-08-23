import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Director Preview exposes a persisted Hide Overlays toggle in the playback controls", () => {
  assert.match(source, /const \[cleanPreviewMode, setCleanPreviewMode\] = useState\(\(\) => \{[\s\S]*?localStorage\?\.getItem\("hapa-echoes-clean-preview"\) === "1"/);
  assert.match(source, /const toggleCleanPreviewMode = useCallback\(\(\) => \{[\s\S]*?setCleanPreviewMode\(\(current\) => \{[\s\S]*?localStorage\?\.setItem\("hapa-echoes-clean-preview", next \? "1" : "0"\)/);

  const controls = between('data-testid="echo-director-preview-controls"', 'data-testid="echo-director-preview-expand"');
  assert.match(controls, /data-testid="echo-director-preview-clean-view"/);
  assert.match(controls, /aria-pressed=\{cleanPreviewMode\}/);
  assert.match(controls, /onClick=\{toggleCleanPreviewMode\}/);
  assert.match(controls, /\{cleanPreviewMode \? "\u25c9 Overlays Hidden" : "\u25cb Hide Overlays"\}/);
  assert.match(controls, /title=\{cleanPreviewMode \? "Restore the overlay telemetry and lyrics" : "Hide the overlay telemetry and lyrics for a clean look at the picture"\}/);
});

test("clean preview mode hides the telemetry HUD from the picture", () => {
  const hud = between("{/* Neon HUD Overlay", "</div>", true);
  assert.match(hud, /data-echo-preview-hud=\{cleanPreviewMode \? "hidden" : "visible"\}/);
  assert.match(hud, /display: cleanPreviewMode \? 'none' : 'flex'/);
  // The HUD is telemetry only: hiding it must never be applied to the rendered
  // picture layers (video, image, or shader canvas).
  const canvas = between('id="director-preview-canvas"', "/>", true);
  assert.match(canvas, /id="director-preview-canvas"/);
  assert.doesNotMatch(canvas, /cleanPreviewMode/);
});

test("clean preview mode unmounts the timed lyrics overlay, keeping media and canvas intact", () => {
  assert.match(source, /\{!cleanPreviewMode && currentLine && \(\(\) => \{/);
  assert.match(source, /data-clean-preview=\{cleanPreviewMode \? "true" : "false"\}/);
  const frame = between('data-testid="echo-director-preview-frame"', 'data-testid="echo-director-preview-controls"');
  assert.match(frame, /data-clean-preview=\{cleanPreviewMode \? "true" : "false"\}/);
  // Media presentation must stay visible in both modes.
  assert.doesNotMatch(between("<PersistentEchoABPlayers", "/>", true), /cleanPreviewMode/);
  assert.doesNotMatch(between("<PresentedEchoImage", "/>", true), /cleanPreviewMode/);
});
