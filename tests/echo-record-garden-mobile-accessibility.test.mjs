import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [component, css, html] = await Promise.all([
  readFile(new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
]);

test("phone and notch layouts keep Record Garden controls inside safe areas without the inherited readout overlap", () => {
  assert.match(html, /viewport-fit=cover/);
  assert.match(css, /\.echo-record-garden-readouts span:last-child\s*\{\s*grid-column: auto;/s);
  assert.match(css, /left: max\(10px, env\(safe-area-inset-left\)\)/);
  assert.match(css, /right: max\(10px, env\(safe-area-inset-right\)\)/);
  assert.match(css, /bottom: max\(10px, env\(safe-area-inset-bottom\)\)/);
  assert.match(css, /\.echo-record-surface-pages button\s*\{[\s\S]*?min-width: 44px;[\s\S]*?height: 44px;/);
  assert.match(css, /\.echo-record-visual-selector button,[\s\S]*?min-height: 44px;/);
  assert.match(css, /\.echo-record-scrubber\s*\{[\s\S]*?min-height: 44px;/);
  assert.match(css, /\.echo-record-garden-boundary-actions \.hapa-btn\s*\{[\s\S]*?min-height: 44px;/);
});

test("mobile record selection reveals its inspector and the crate has a roving arrow-key path", () => {
  assert.match(component, /matchMedia\?\.\("\(max-width: 760px\)"\)\?\.matches/);
  assert.match(component, /visualInspectorRef\.current\?\.scrollIntoView/);
  assert.match(component, /const handleCrateKeyDown = useCallback/);
  assert.match(component, /"ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"/);
  assert.match(component, /tabIndex=\{selected \|\|/);
  assert.match(component, /role="group" aria-label="Visible album surfaces"/);
});

test("recoverable scene, sleeve, and audio failures expose explicit retry actions", () => {
  assert.match(component, /Retry 3D scene/);
  assert.match(component, /Retry record sleeve/);
  assert.match(component, /Retry record audio/);
  assert.match(component, /setSceneRevision\(\(revision\) => revision \+ 1\)/);
  assert.match(component, /setProjectRevision\(\(revision\) => revision \+ 1\)/);
});

test("blur, hidden-page, and reduced-motion paths cancel motion and held-record interactions", () => {
  assert.match(component, /gameRef\.current\?\.cancelInteraction\?\.\(\)/);
  assert.match(component, /addEventListener\?\.\("blur", handleWindowBlur\)/);
  assert.match(component, /cancelInteraction: \(\) => handlePointerCancel\(\)/);
  assert.match(component, /controls\.enableDamping = !playback\.reducedMotion/);
  assert.match(
    component,
    /if \(framePlayback\.reducedMotion\) \{\s*entry\.root\.position\.y = targetY;\s*entry\.root\.scale\.setScalar\(scale\);/s,
  );
});
