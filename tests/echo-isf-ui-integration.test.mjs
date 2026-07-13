import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const echoSource = fs.readFileSync(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8");
const tarotSource = fs.readFileSync(new URL("../src/components/TarotDraw3DView.jsx", import.meta.url), "utf8");

function between(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

test("Echo resolves graph-backed Track B cards through a bounded lookahead playback pool", () => {
  assert.match(echoSource, /from "\.\.\/domain\/echo-isf-browser-runtime\.js"/);
  assert.match(echoSource, /createEchoIsfPlaybackPool/);
  assert.match(echoSource, /visualizerLookaheadCards/);
  assert.match(echoSource, /activeProject\?\.director_show_graph/);
  assert.match(echoSource, /visualizerLookaheadCards\(directorShowGraph, t, 3\)/);
  assert.match(echoSource, /visualization\?\.sourceId/);
  assert.match(echoSource, /width: canvas\.width/);
  assert.match(echoSource, /height: canvas\.height/);
  assert.match(echoSource, /ctx\.drawImage\(presentationCanvas, 0, 0, width, height\)/);
  assert.match(echoSource, /exactIsfPlaybackPoolRef\.current\?\.dispose\?\.\(\)/);
  assert.match(echoSource, /data-echo-exact-isf-status/);
  assert.match(echoSource, /EXACT ISF HOLD/);

  const exactBranch = between(echoSource, "if (hasDirectorShowGraph) {", "} else {\n      const legacyRenderer = legacyEchoRendererTruth");
  assert.match(exactBranch, /pool\.present\(graphVisualizerCard/);
  assert.doesNotMatch(exactBranch, /getRenderer\(|spectrum-nebula|visualizerTitle/);
});

test("Echo prewarms lookahead and invalidates only graph identity changes", () => {
  const poolPath = between(echoSource, "const createExactPlaybackPool", "const bandAvg");
  assert.match(poolPath, /maxSurfaces: 3/);
  assert.match(poolPath, /previousIdentity\.variantKey !== nextIdentity\.variantKey/);
  assert.match(poolPath, /previousIdentity\.dirtyKey !== nextIdentity\.dirtyKey/);
  assert.match(echoSource, /pool\.prewarm\(/);
  assert.match(echoSource, /graphVisualizerCards\.slice\(1\)/);
  assert.match(echoSource, /presentation\.canvas \|\| exactIsfLastPresentedCanvasRef\.current/);
  assert.match(echoSource, /heldPreviousFrame/);
  assert.match(echoSource, /preservePixels: true/);
  assert.match(echoSource, /data-echo-isf-handoff/);
  assert.match(echoSource, /data-echo-isf-black-intervals/);
  assert.match(echoSource, /sourceCache/);
  assert.match(echoSource, /frameTiming/);
  assert.doesNotMatch(echoSource, /exactIsfSurfaceRef/);
});

test("Tarot carries exact graph identity into its source and renders exact pixels before lyrics", () => {
  assert.match(tarotSource, /from "\.\.\/domain\/echo-isf-browser-runtime\.js"/);
  assert.match(tarotSource, /echoDirectorGraphVariantId\(project\)/);
  assert.match(tarotSource, /echoVisualizerSourceId: graphVisualizer\.sourceId/);
  assert.match(tarotSource, /echoVisualizerCard: graphVisualizer\.card/);
  assert.match(tarotSource, /echoHasDirectorGraph: graphVisualizer\.hasGraph/);
  assert.match(tarotSource, /echoDirectorGraphVariantId: graphVisualizer\.variantId/);
  assert.match(tarotSource, /exactIsfPlaybackPool: null/);
  assert.match(tarotSource, /overlay\.exactIsfPlaybackPool\?\.dispose\?\.\(\)/);
  assert.match(tarotSource, /ctx\.drawImage\(presentedCanvas, 0, 0, canvas\.width, canvas\.height\)/);

  const overlayUpdate = between(tarotSource, "function updateEchoDirectorPreviewOverlay", "function drawEchoDirectorShaderOverlay");
  const exactDrawIndex = overlayUpdate.indexOf("drawTarotExactIsfOverlay");
  const legacyDrawIndex = overlayUpdate.indexOf("drawEchoDirectorShaderOverlay");
  const lyricDrawIndex = overlayUpdate.indexOf("drawEchoDirectorLyricOverlay");
  assert.ok(exactDrawIndex >= 0 && legacyDrawIndex > exactDrawIndex, "graph exact path must be selected before legacy approximation");
  assert.ok(lyricDrawIndex > exactDrawIndex, "exact pixels must be drawn before lyrics");
  assert.match(overlayUpdate, /if \(graphBacked\)/);
  assert.match(overlayUpdate, /overlay\.exactIsfHandoffState/);
  assert.match(overlayUpdate, /Legacy approximation is intentionally limited to old projects with no Director graph/);
});

test("Tarot exact playback pool prewarms lookahead and preserves explicit failures", () => {
  const preparePath = between(tarotSource, "function ensureTarotExactIsfPlaybackPool", "function drawTarotExactIsfDiagnostic");
  assert.match(preparePath, /createEchoIsfPlaybackPool/);
  assert.match(preparePath, /maxSurfaces: 3/);
  assert.match(preparePath, /pool\.prewarm\(\{ cards: exactCards, cacheKey \}\)/);
  assert.match(preparePath, /lookahead-error-holding-current/);
  assert.match(tarotSource, /No executable Track B card at this graph time/);
  assert.match(tarotSource, /exactIsfStatus/);
  assert.match(tarotSource, /exactIsfError/);
});
