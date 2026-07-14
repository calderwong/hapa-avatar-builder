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

test("Director Preview starts compact and expansion does not invoke native Fullscreen", () => {
  assert.match(source, /const \[directorPreviewExpanded, setDirectorPreviewExpanded\] = useState\(false\)/);
  assert.match(source, /const \[directorPreviewFullscreen, setDirectorPreviewFullscreen\] = useState\(false\)/);
  assert.match(source, /data-testid="echo-director-preview-expand"/);
  assert.match(source, /aria-label="Open larger Director Preview"/);
  assert.match(source, />\s*Expand Preview\s*</);
  assert.match(source, /data-expanded=\{directorPreviewExpanded \? "true" : "false"\}/);

  const expandToggle = between("const toggleDirectorPreviewExpanded", "const toggleDirectorPreviewFullscreen");
  assert.match(expandToggle, /setDirectorPreviewExpanded\(true\)/);
  assert.doesNotMatch(expandToggle, /requestFullscreen|webkitRequestFullscreen/);
});

test("Director Preview never mistakes the initial null ref for active Fullscreen", () => {
  const helperSource = between("function directorPreviewIsFullscreen", "async function saveEchoProjectRequest");
  const isFullscreen = Function(`${helperSource}; return directorPreviewIsFullscreen;`)();
  const previewSurface = {};
  assert.equal(isFullscreen({ fullscreenElement: null }, null), false);
  assert.equal(isFullscreen({ fullscreenElement: null }, previewSurface), false);
  assert.equal(isFullscreen({ fullscreenElement: previewSurface }, previewSurface), true);
  assert.equal(isFullscreen({ webkitFullscreenElement: previewSurface }, previewSurface), true);
  assert.equal(isFullscreen({ fullscreenElement: {} }, previewSurface), false);

  const lifecycle = between("const syncDirectorPreviewFullscreen", "const activeDirectorProject");
  assert.match(lifecycle, /const previewSurface = directorPreviewFullscreenRef\.current/);
  assert.match(lifecycle, /const previewIsFullscreen = directorPreviewIsFullscreen\(documentRef, previewSurface\)/);
  assert.doesNotMatch(lifecycle, /const previewIsFullscreen = fullscreenElement ===/);
  assert.match(lifecycle, /setDirectorPreviewFullscreen\(previewIsFullscreen\)/);
});

test("expanded Preview is a fixed high-z overlay with an explicit compact return", () => {
  assert.match(source, /import \{ createPortal \} from "react-dom"/);
  assert.match(source, /createPortal\(previewSurface, globalThis\.document\.body\)/);
  assert.match(source, /data-testid="echo-director-preview-expanded-header"/);
  assert.match(source, /data-testid="echo-director-preview-close-expanded"/);
  assert.match(source, /aria-label="Close expanded Director Preview"/);
  assert.match(source, /role=\{directorPreviewExpanded \? "dialog" : "region"\}/);
  assert.match(source, /aria-modal=\{directorPreviewExpanded \? "true" : undefined\}/);
  assert.match(source, />\s*Compact View\s*</);
  assert.match(source, /position: 'fixed'/);
  assert.match(source, /inset: 0/);
  assert.match(source, /zIndex: 2147483000/);
  assert.match(source, /height: '100vh'/);
  assert.match(source, /isolation: 'isolate'/);
  assert.match(source, /void closeDirectorPreviewExpanded\(\)/);
  assert.match(source, /body\.style\.overflow = "hidden"/);
  assert.match(source, /body\.style\.overflow = previousBodyOverflow/);
});

test("native Fullscreen remains a separate, truthful expanded-view action", () => {
  const toggle = between("const toggleDirectorPreviewFullscreen", "const activeDirectorProject");
  assert.match(toggle, /if \(!directorPreviewExpanded\)/);
  assert.match(toggle, /Expand Preview before requesting native Full Screen/);
  assert.match(toggle, /previewSurface\.requestFullscreen\(\)/);
  assert.match(toggle, /previewSurface\.webkitRequestFullscreen\(\)/);
  assert.match(toggle, /documentRef\.exitFullscreen \|\| documentRef\.webkitExitFullscreen/);
  assert.match(toggle, /Full Screen is not supported in this window/);
  assert.match(toggle, /Full Screen could not start/);

  assert.match(source, /data-testid="echo-director-preview-fullscreen"/);
  assert.match(source, /aria-pressed=\{directorPreviewFullscreen\}/);
  assert.match(source, /data-fullscreen=\{directorPreviewFullscreen \? "true" : "false"\}/);
  assert.match(source, /Open Director Preview full screen/);
  assert.match(source, /Exit Director Preview full screen/);

  const close = between("const closeDirectorPreviewExpanded", "const toggleDirectorPreviewExpanded");
  assert.match(close, /if \(directorPreviewIsFullscreen\(documentRef, previewSurface\)\)/);
  assert.match(close, /catch \(error\) \{[\s\S]*setDirectorPreviewFullscreenMessage[\s\S]*return;/);
});

test("Escape closes only the in-app overlay while the browser owns native Fullscreen", () => {
  const lifecycle = between("const syncDirectorPreviewFullscreen", "const activeDirectorProject");
  for (const eventName of ["fullscreenchange", "webkitfullscreenchange", "fullscreenerror", "webkitfullscreenerror"]) {
    assert.match(lifecycle, new RegExp(`addEventListener\\(\"${eventName}\"`));
    assert.match(lifecycle, new RegExp(`removeEventListener\\(\"${eventName}\"`));
  }
  assert.match(lifecycle, /event\.key === "Escape" && !directorPreviewFullscreenActiveRef\.current/);
  assert.match(lifecycle, /addEventListener\("keydown", closeExpandedPreviewOnEscape\)/);
  assert.match(lifecycle, /removeEventListener\("keydown", closeExpandedPreviewOnEscape\)/);
  assert.match(lifecycle, /setDirectorPreviewExpanded\(true\)/);
  assert.match(lifecycle, /Exited full-screen Preview/);
});

test("large Preview fits the complete 16:9 frame and wrapping controls inside the viewport", () => {
  assert.match(source, /ECHO_EXPANDED_PREVIEW_WIDTH = "min\(calc\(100vw - 32px\), calc\(177\.7778vh - 384px\)\)"/);
  assert.match(source, /ECHO_EXPANDED_PREVIEW_MAX_HEIGHT = "calc\(100vh - 216px\)"/);
  assert.match(source, /data-testid="echo-director-preview-frame"/);
  assert.match(source, /data-export-aspect="1920x1080"/);
  assert.match(source, /aspectRatio: '16 \/ 9'/);
  assert.match(source, /maxHeight: directorPreviewExpanded \? ECHO_EXPANDED_PREVIEW_MAX_HEIGHT/);
  assert.match(source, /flexShrink: 0/);
  assert.match(source, /justifyContent: 'flex-start'/);
  assert.match(source, /data-testid="echo-director-preview-controls"/);
  assert.match(source, /flexWrap: 'wrap'/);
  assert.match(source, /flex: directorPreviewExpanded \? '1 1 260px'/);
  assert.match(source, /!directorPreviewExpanded && \(/);
  assert.match(source, /currentTimelineItem && !directorPreviewExpanded/);
  assert.match(source, /Math\.min\(1280, Math\.max\(640, Math\.round\(cssWidth \* pixelRatio\)\)\)/);
  assert.match(source, /Math\.round\(targetWidth \* 9 \/ 16\)/);
});

test("compact Preview stacks the shot inspector before fixed columns can clip it", () => {
  assert.match(source, /data-testid="echo-director-authoring-split"/);
  assert.match(source, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(min\(560px, 100%\), 1fr\)\)'/);
  assert.match(source, /minWidth: 0/);
  assert.doesNotMatch(source, /gridTemplateColumns: 'minmax\(620px, 1\.05fr\) minmax\(560px, 0\.95fr\)'/);
});
