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

test("Director Preview offers an accessible full-screen control beside playback", () => {
  assert.match(source, /data-testid="echo-director-preview-surface"/);
  assert.match(source, /data-testid="echo-director-preview-fullscreen"/);
  assert.match(source, /aria-pressed=\{directorPreviewFullscreen\}/);
  assert.match(source, /Open Director Preview full screen/);
  assert.match(source, /Exit Director Preview full screen/);
  assert.match(source, /<Maximize2 size=\{13\} aria-hidden="true" \/>/);
  assert.match(source, /<Minimize2 size=\{13\} aria-hidden="true" \/>/);
});

test("Director Preview uses standard Fullscreen APIs with WebKit fallbacks and honest errors", () => {
  const toggle = between("const toggleDirectorPreviewFullscreen", "const activeDirectorProject");
  assert.match(toggle, /previewSurface\.requestFullscreen\(\)/);
  assert.match(toggle, /previewSurface\.webkitRequestFullscreen\(\)/);
  assert.match(toggle, /documentRef\.exitFullscreen \|\| documentRef\.webkitExitFullscreen/);
  assert.match(toggle, /Full Screen is not supported in this window/);
  assert.match(toggle, /Full Screen could not start/);
  assert.match(toggle, /Another full-screen view is active/);
});

test("Director Preview synchronizes Escape and browser exits and cleans up every listener", () => {
  const lifecycle = between("const syncDirectorPreviewFullscreen", "const activeDirectorProject");
  for (const eventName of ["fullscreenchange", "webkitfullscreenchange", "fullscreenerror", "webkitfullscreenerror"]) {
    assert.match(lifecycle, new RegExp(`addEventListener\\(\"${eventName}\"`));
    assert.match(lifecycle, new RegExp(`removeEventListener\\(\"${eventName}\"`));
  }
  assert.match(lifecycle, /fullscreenElement === directorPreviewFullscreenRef\.current/);
  assert.match(lifecycle, /Exited full-screen Preview/);
  assert.match(lifecycle, /Press Escape or choose Exit Full Screen/);
});

test("Director Preview announces full-screen status without replacing the inline fallback", () => {
  assert.match(source, /data-testid="echo-director-preview-fullscreen-status"/);
  assert.match(source, /role="status"/);
  assert.match(source, /aria-live="polite"/);
  assert.match(source, /You can keep using the inline Preview/);
  assert.match(source, /data-fullscreen=\{directorPreviewFullscreen \? "true" : "false"\}/);
});

test("Director Preview keeps a valid 16:9 viewport in full screen", () => {
  assert.match(source, /data-export-aspect="1920x1080"/);
  assert.match(source, /aspectRatio: '16 \/ 9'/);
  assert.match(source, /min\(calc\(177\.7778vh - 220\.4445px\), calc\(100vw - 28px\)\)/);
  assert.match(source, /min\(calc\(100vh - 124px\), calc\(56\.25vw - 15\.75px\)\)/);
  assert.match(source, /maxHeight: directorPreviewFullscreen \? 'none'/);
  assert.match(source, /boxSizing: 'border-box'/);
  assert.match(source, /Math\.min\(1280, Math\.max\(640, Math\.round\(cssWidth \* pixelRatio\)\)\)/);
  assert.match(source, /Math\.round\(targetWidth \* 9 \/ 16\)/);
  assert.match(source, /Math\.min\(1\.5, Number\(globalThis\.devicePixelRatio \|\| 1\)\)/);
  assert.match(source, /!directorPreviewFullscreen && \(/);
  assert.match(source, /currentTimelineItem && !directorPreviewFullscreen/);
  assert.doesNotMatch(source, /calc\(\(100vh - 124px\) \* 16 \/ 9\)/);
});
