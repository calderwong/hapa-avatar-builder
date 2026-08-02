import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url),
  "utf8",
);
const threeRuntime = component.slice(component.indexOf("const ECHO_RECORD_GARDEN_POWER_PROFILES"));

function runtimeFunctionBlock(startMarker, endMarker) {
  const start = threeRuntime.indexOf(startMarker);
  const end = threeRuntime.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing runtime function: ${startMarker}`);
  assert.ok(end > start, `missing runtime function boundary: ${endMarker}`);
  return threeRuntime.slice(start, end);
}

test("screen media identity includes source URI and revision instead of trusting visual id alone", () => {
  const identity = threeRuntime.slice(
    threeRuntime.indexOf("function screenMediaSourceIdentity"),
    threeRuntime.indexOf("function setPlayerRecordVisual"),
  );
  assert.match(identity, /visual\.source\?\.revisionId/);
  assert.match(identity, /visual\.provenance\?\.referenceRevisionId/);
  assert.match(identity, /visual\.provenance\?\.contentHash/);
  assert.match(identity, /visual\.sourceId \|\| visual\.mediaId/);
  assert.match(identity, /visual\.startSeconds/);
  assert.match(identity, /visual\.sourceStartSeconds/);
  assert.match(identity, /visual\.durationSeconds/);
  assert.doesNotMatch(identity, /visual\.(?:role|title)/);
  assert.match(threeRuntime, /const key = screenMediaSourceIdentity\(visual\)\.key/);
  assert.match(threeRuntime, /mediaPool\.acquire\(visual\)/);
  assert.doesNotMatch(threeRuntime, /screen\.visual\?\.id === visual\?\.id/);
});

test("empty media slots avoid null dereferences and preserve the last complete player texture", () => {
  const identityFunction = runtimeFunctionBlock(
    "function screenMediaSourceIdentity",
    "function assignMaterialTexture",
  );
  const playerBindingFunction = runtimeFunctionBlock(
    "function setPlayerRecordVisual",
    "function createAlbumScreens",
  );
  const createHarness = new Function(`
    ${identityFunction}
    ${playerBindingFunction}
    return { screenMediaSourceIdentity, setPlayerRecordVisual };
  `);
  const { screenMediaSourceIdentity, setPlayerRecordVisual } = createHarness();
  const player = {
    visual: null,
    mediaResource: null,
    recordMaterials: [{}, {}],
  };
  let acquireCalls = 0;
  let releaseCalls = 0;
  const mediaPool = {
    acquire() {
      acquireCalls += 1;
      throw new Error("a null startup slot must not acquire media");
    },
    release() {
      releaseCalls += 1;
    },
  };

  assert.doesNotThrow(
    () => setPlayerRecordVisual(player, null, { mediaPool }),
    "startup commonly has no Director visual while project media is loading",
  );
  const standbyIdentity = screenMediaSourceIdentity(null);
  assert.equal(standbyIdentity.videoUri, "");
  assert.equal(standbyIdentity.imageUri, "");
  assert.equal(player.visual, null);
  assert.equal(player.mediaResource, null);
  assert.equal(acquireCalls, 0);
  assert.equal(releaseCalls, 0);

  const previousResource = { key: "previous-video" };
  const previousTexture = { id: "previous-texture" };
  player.visual = { id: "previous-visual" };
  player.mediaResource = previousResource;
  player.recordMaterials[1] = {
    map: previousTexture,
    color: { setHex: () => { throw new Error("clearing media must not blank or repaint the last frame"); } },
    needsUpdate: false,
  };
  setPlayerRecordVisual(player, null, { mediaPool });
  assert.equal(releaseCalls, 1, "clearing an active slot releases its pooled media exactly once");
  assert.equal(player.visual, null);
  assert.equal(player.mediaResource, null);
  assert.equal(player.recordMaterials[1].map, previousTexture);
  assert.equal(player.recordMaterials[1].needsUpdate, false);
});

test("late image callbacks dispose their result and never mutate a disposed fallback texture", () => {
  assert.match(threeRuntime, /let disposed = false;[\s\S]*?loadedTexture = loader\.load\(/s);
  assert.match(
    threeRuntime,
    /\(loaded\) => \{\s*if \(disposed\) \{\s*loaded\.dispose\(\);\s*return;\s*\}/s,
  );
  assert.match(
    threeRuntime,
    /dispose\(\) \{\s*if \(disposed\) return;\s*disposed = true;[\s\S]*?loadedTexture\?\.dispose\?\.\(\);\s*fallbackTexture\.dispose\(\);/s,
  );
  assert.match(threeRuntime, /resource\.texture = loaded/);
  assert.doesNotMatch(threeRuntime, /fallbackTexture\.image = loaded\.image/);
  assert.match(threeRuntime, /if \(disposed \|\| entry\.disposed \|\| entry\.textureUri !== uri\) \{\s*texture\.dispose\(\);/s);
  assert.match(threeRuntime, /function disposeRecordEntry\(entry\) \{\s*if \(entry\.disposed\) return;\s*entry\.disposed = true;\s*entry\.textureUri = "";/s);
});

test("reduced motion freezes garden décor and uses immediate, non-animated state changes", () => {
  assert.match(threeRuntime, /framePowerProfile\.dropRingPulse/);
  assert.match(threeRuntime, /: 0\.26;/);
  const sundayUpdate = threeRuntime.slice(
    threeRuntime.indexOf("function updateSundayScene"),
    threeRuntime.indexOf("function createRecordPlayer"),
  );
  assert.match(
    sundayUpdate,
    /if \(reducedMotion\) \{\s*resources\.bokeh\.rotation\.y = 0;\s*resources\.parasolRoot\.rotation\.y = 0;\s*resources\.cloth\.rotation\.z = -0\.04;\s*updateEchoRecordGardenVisualSystem\(resources, 0, true\);\s*return;/s,
  );
  assert.ok(
    sundayUpdate.indexOf("return;") < sundayUpdate.indexOf("Math.sin(elapsed * 0.7"),
    "reduced motion must return before the bokeh opacity pulse",
  );
  assert.match(threeRuntime, /controls\.enableDamping = !playback\.reducedMotion/);
  assert.match(threeRuntime, /if \(framePlayback\.reducedMotion\) \{\s*entry\.root\.position\.y = targetY;\s*entry\.root\.scale\.setScalar\(scale\);/s);
  assert.match(threeRuntime, /player\.record\.rotation\.y = framePlayback\.reducedMotion \? 0 : displayRecordAngle/);
  assert.match(threeRuntime, /echoRecordVideoPlaybackPlan\(\{/);
  assert.match(threeRuntime, /reducedMotion,/);
  assert.match(threeRuntime, /setScreenVideoPlaying\(resource, plan\.shouldPlay\)/);
});

test("full and reduced power profiles change pixel ratio and shadows with observable diagnostics", () => {
  const profiles = threeRuntime.slice(
    threeRuntime.indexOf("const ECHO_RECORD_GARDEN_POWER_PROFILES"),
    threeRuntime.indexOf("function createEchoRecordGardenGame"),
  );
  assert.match(profiles, /full:[\s\S]*?pixelRatioCap: 1\.65,[\s\S]*?shadows: true/);
  assert.match(profiles, /reduced:[\s\S]*?pixelRatioCap: 1,[\s\S]*?shadows: false/);
  assert.match(threeRuntime, /renderer\.setPixelRatio\(pixelRatio\)/);
  assert.match(threeRuntime, /const shadowsEnabled = profile\.shadows && adaptiveDetailTier !== "reduced"/);
  assert.match(threeRuntime, /renderer\.shadowMap\.enabled = shadowsEnabled/);
  assert.match(threeRuntime, /diagnostics\.powerProfile = profile\.id/);
  assert.match(threeRuntime, /canvas\.dataset\.powerProfile = profile\.id/);
  assert.match(threeRuntime, /canvas\.dataset\.renderPixelRatio = pixelRatio\.toFixed\(2\)/);
  assert.match(threeRuntime, /canvas\.dataset\.shadows = shadowsEnabled \? "enabled" : "disabled"/);
  assert.match(threeRuntime, /const initialReducedMotion = globalThis\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\?\.matches === true/);
  assert.match(threeRuntime, /applyPowerProfile\(initialReducedMotion\)/);
  assert.match(threeRuntime, /applyPowerProfile\(playback\.reducedMotion\)/);
});

test("context recovery rebuilds the sky-derived environment instead of claiming stale reflections", () => {
  assert.match(threeRuntime, /const handleContextRestored = \(\) => \{\s*try \{\s*resetAdaptiveTiming\(\);\s*sceneResources\.rebuildEnvironmentResponse\?\.\(\)/s);
  assert.match(threeRuntime, /diagnostics\.contextState = "degraded"/);
  assert.match(threeRuntime, /garden lighting needs a scene retry/);
});

test("human acceptance telemetry is run-scoped and keeps uninterrupted playback identity", () => {
  const renderLoop = threeRuntime.slice(
    threeRuntime.indexOf("const render ="),
    threeRuntime.indexOf("\n  render();"),
  );
  assert.match(renderLoop, /acceptanceRunId !== acceptanceRun\.startedAt/);
  assert.match(renderLoop, /frameTimingSamples\.length = 0/);
  assert.match(renderLoop, /acceptanceRun\.lastPlaybackSongId === placedRecordId/);
  assert.match(renderLoop, /acceptanceRun\.lastPlaybackCutId === currentCutId/);
  assert.match(renderLoop, /maxUninterruptedPlaybackSeconds/);
  assert.match(renderLoop, /uninterruptedPlaybackSongId = String\(placedRecordId/);
  assert.match(renderLoop, /uninterruptedPlaybackCutId = currentCutId/);
  assert.match(threeRuntime, /acceptanceRun\.contextLosses = Number\(acceptanceRun\.contextLosses/);
  assert.match(threeRuntime, /acceptanceRun\.mediaFailures = Number\(acceptanceRun\.mediaFailures/);
  assert.match(threeRuntime, /acceptanceRun\.bufferingTransitions = Number\(acceptanceRun\.bufferingTransitions/);
  assert.match(threeRuntime, /maxRendererGeometries/);
  assert.match(threeRuntime, /maxRendererTextures/);
  assert.match(threeRuntime, /acceptanceMetrics\.frameTiming = diagnostics\.frameTiming/);
  assert.match(threeRuntime, /resource\.hasPresentedFrame && resource\.mediaState !== "buffering"/);
});

test("physical platter drops place the same record object immediately and failed videos keep their source-labelled fallback", () => {
  const pointerUp = threeRuntime.slice(
    threeRuntime.indexOf("const handlePointerUp"),
    threeRuntime.indexOf("const handlePointerCancel"),
  );
  const attachIndex = pointerUp.indexOf("attachEchoRecordObjectPreservingWorldTransform(entry.root, player.recordAnchor)");
  const callbackIndex = pointerUp.indexOf("onDropRecord?.(entry.record.songId)");
  assert.ok(attachIndex >= 0);
  assert.ok(callbackIndex > attachIndex, "the held Object3D reaches the platter before audio/media work starts");
  assert.match(pointerUp, /recordEntityRegistry\.transition\(entry\.record\.id, "place"/);
  assert.match(pointerUp, /entry\.root\.position\.set\(0, 0, 0\)/);
  assert.match(pointerUp, /entry\.root\.scale\.setScalar\(1\.48\)/);
  assert.match(pointerUp, /entry\.placed = true/);
  assert.match(pointerUp, /placedRecordId = entry\.record\.songId/);
  assert.match(pointerUp, /onDropRecord\?\.\(entry\.record\.songId\)/);
  assert.match(pointerUp, /is on the platter while its warmed media becomes audible/);

  const setPlacedRecord = threeRuntime.slice(
    threeRuntime.indexOf("const setPlacedRecord ="),
    threeRuntime.indexOf("const setPlayback ="),
  );
  assert.match(setPlacedRecord, /attachEchoRecordObjectPreservingWorldTransform\(nextEntry\.root, player\.recordAnchor\)/);
  assert.match(setPlacedRecord, /nextEntry\.placed = true/);

  const mediaFactory = threeRuntime.slice(
    threeRuntime.indexOf("function createScreenMediaResource"),
    threeRuntime.indexOf("function disposeScreenMediaResource"),
  );
  assert.match(mediaFactory, /texture: fallbackTexture/);
  assert.match(mediaFactory, /new THREE\.VideoTexture\(video\)/);
  assert.match(mediaFactory, /mediaState: "loading"/);
  assert.match(mediaFactory, /video\.addEventListener\("loadeddata", handleLoadedData\)/);
  assert.match(mediaFactory, /video\.addEventListener\("canplay", handleCanPlay\)/);
  assert.match(mediaFactory, /video\.addEventListener\("error", handleError\)/);
  assert.match(mediaFactory, /resource\.mediaState = "failed"/);
  assert.match(mediaFactory, /onMediaError\?\.\(visual\)/);
});

test("video textures wait for a decoded frame and preserve the last frame through buffering", () => {
  const mediaFactory = threeRuntime.slice(
    threeRuntime.indexOf("function createScreenMediaResource"),
    threeRuntime.indexOf("function disposeScreenMediaResource"),
  );
  const videoFactoryEnd = mediaFactory.indexOf(
    "\n  if (imageUri) {",
    mediaFactory.indexOf("return resource;"),
  );
  const videoFactory = mediaFactory.slice(0, videoFactoryEnd);
  assert.match(mediaFactory, /hasPresentedFrame: false/);
  assert.match(mediaFactory, /lastPresentedVideoTime: Number\.NaN/);
  assert.ok(
    /new THREE\.VideoTexture\(video\)/.test(videoFactory)
      || /drawImage\(\s*video\b/.test(videoFactory),
    "decoded video must use a dedicated video upload path (VideoTexture or a stable frame canvas)",
  );
  assert.doesNotMatch(
    videoFactory,
    /const texture = fallbackTexture[\s\S]*?texture\.image = video/,
    "an allocated fallback CanvasTexture cannot be promoted to a differently sized video source",
  );

  const presenter = mediaFactory.slice(
    mediaFactory.indexOf("const presentVideoFrame"),
    mediaFactory.indexOf("const scheduleFrame"),
  );
  assert.match(presenter, /video\.readyState < 2/);
  assert.match(presenter, /resource\.hasPresentedFrame = true/);
  assert.match(presenter, /resource\.lastPresentedVideoTime = mediaTime/);
  assert.match(presenter, /resource\.texture = videoTexture/);
  assert.match(presenter, /video\.seeking/);

  const frameLoop = mediaFactory.slice(
    mediaFactory.indexOf("const scheduleFrame"),
    mediaFactory.indexOf("const handleMetadata"),
  );
  assert.match(frameLoop, /video\.requestVideoFrameCallback/);
  assert.match(frameLoop, /presentVideoFrame\(\{ mediaTime: video\.currentTime \}\)/);
  assert.match(
    frameLoop,
    /presentVideoFrame\(\{ mediaTime: video\.currentTime \}\);\s*if \(video\.requestVideoFrameCallback\) scheduleFrame\(\);/s,
    "an already decoded current frame must be promoted before waiting for another callback",
  );

  const waiting = mediaFactory.slice(
    mediaFactory.indexOf("const handleWaiting"),
    mediaFactory.indexOf("const handleError"),
  );
  assert.match(
    waiting,
    /resource\.mediaState = resource\.hasPresentedFrame \? "buffering" : "first-frame-pending"/,
  );
  assert.doesNotMatch(
    waiting,
    /texture\.image\s*=/,
    "waiting after presentation must keep the last decoded frame on every screen and disc",
  );

  assert.match(mediaFactory, /posterImage = document\.createElement\("img"\)/);
  assert.match(mediaFactory, /posterTexture = new THREE\.Texture\(posterImage\)/);
  assert.match(mediaFactory, /if \(resource\.hasPresentedFrame\) return;/);
  assert.match(mediaFactory, /resource\.texture = posterTexture/);
  assert.doesNotMatch(mediaFactory, /texture\.image = (?:posterImage|video)/);
  assert.match(mediaFactory, /video\.cancelVideoFrameCallback\(resource\.frameCallback\)/);
  assert.match(mediaFactory, /posterImage\.onload = null/);
  assert.match(mediaFactory, /posterImage\.removeAttribute\("src"\)/);
});

test("Director surface identity advances from the same live audio frame used for video sync", () => {
  const renderLoop = threeRuntime.slice(
    threeRuntime.indexOf("const render ="),
    threeRuntime.indexOf("\n  render();"),
  );
  const usesFrameClockForSurfaceSelection = (
    /buildEchoRecordVisualSurfaces\(\{[\s\S]*?clockSeconds:\s*framePlayback\.currentTime/.test(renderLoop)
    || /(?:sync|refresh|select|resolve)\w*Director\w*\(\s*framePlayback\.currentTime/.test(renderLoop)
    || /(?:sync|refresh|select|resolve)\w*Visual\w*\(\s*framePlayback\.currentTime/.test(renderLoop)
  );
  assert.equal(
    usesFrameClockForSurfaceSelection,
    true,
    "screen/disc identity must cross Director cue boundaries on the requestAnimationFrame audio clock, not wait for the coarse React audio timeupdate event",
  );
});

test("the one cinematic screen and spinning record share the exact Director composite", () => {
  const setVisuals = threeRuntime.slice(
    threeRuntime.indexOf("const setVisuals ="),
    threeRuntime.indexOf("const setPlacedRecord ="),
  );
  assert.match(setVisuals, /const masterVisual = state\.compositeVisual \|\| directorVisual \|\| visuals\[0\] \|\| null/);
  assert.match(setVisuals, /activeVisuals = masterVisual \? \[masterVisual\] : \[\]/);
  assert.match(setVisuals, /assignAlbumScreenVisuals\(screens, activeVisuals, mediaPool\)/);
  assert.match(setVisuals, /setPlayerRecordVisual\(player, state\.compositeVisual \|\| directorVisual, \{ mediaPool \}\)/);
  assert.match(
    setVisuals,
    /entry\.mediaResource\?\.texture \|\| entry\.coverTexture \|\| entry\.labelTexture/,
    "visible records must retain their independent looping face videos while the placed record shows the Director composite",
  );
  assert.doesNotMatch(
    setVisuals,
    /player\.recordMaterials\[1\]\.map = screens\[0\]\.mediaResource\.texture/,
    "the record must bind the composite by identity rather than copy an incidental screen texture",
  );
});

test("the Director Preview runs the full canvas compositor and Three presents that live canvas", () => {
  const previewEffect = component.slice(
    component.indexOf("source = selectEchoDirectorPreviewSource(project)"),
    component.indexOf("}, [apiBase, placedRecordId, project]);"),
  );
  assert.match(previewEffect, /selectEchoDirectorPreviewSource\(project\)/);
  assert.match(previewEffect, /createRecordGardenDirectorPreviewAdapters\(\{/);
  assert.match(previewEffect, /createEchoDirectorPreviewRuntime\(\{/);
  assert.match(previewEffect, /source: "record-garden-master-audio"/);
  assert.match(previewEffect, /adapters: adapterBundle\.adapters/);
  assert.match(previewEffect, /strictParity: true/);
  assert.match(previewEffect, /manageCanvasSize: false/);
  assert.match(previewEffect, /kind: "director-composite"/);
  assert.match(previewEffect, /directorPreview: true/);
  assert.match(previewEffect, /runtime\.start\(\)/);

  const adapters = component.slice(
    component.indexOf("function createRecordGardenDirectorPreviewAdapters"),
    component.indexOf("export default function EchoRecordGarden3DView"),
  );
  assert.match(adapters, /adapters: \{ media, visualizers, transition, automation, lyrics \}/);
  assert.match(adapters, /createEchoIsfSurface\(\{/);

  const mediaFactory = threeRuntime.slice(
    threeRuntime.indexOf("function createScreenMediaResource"),
    threeRuntime.indexOf("function disposeScreenMediaResource"),
  );
  assert.match(mediaFactory, /if \(identity\.canvasKey && visual\.canvas\)/);
  assert.match(mediaFactory, /new THREE\.CanvasTexture\(visual\.canvas\)/);
  assert.match(mediaFactory, /canvasBacked: true/);
  assert.match(mediaFactory, /status: "director-composite-canvas"/);
  assert.match(mediaFactory, /texture\.needsUpdate = true/);
});

test("the one-screen media window warms one next surface and keeps a bounded visible-record pool", () => {
  assert.match(component, /const SCREEN_COUNT = 1/);
  assert.match(component, /const VISIBLE_RECORD_VIDEO_LIMIT = RECORDS_PER_CRATE/);
  assert.match(component, /const SCREEN_MEDIA_POOL_LIMIT = VISIBLE_RECORD_VIDEO_LIMIT \+ 4/);
  assert.match(component, /selectEchoRecordMediaWindow\(visuals, surfacePage, \{/);
  assert.match(component, /visibleCount: SCREEN_COUNT,\s*warmCount: SCREEN_COUNT/s);
  assert.match(component, /const directorWarmVisuals = useMemo/);
  assert.match(component, /buildEchoRecordDirectorWarmSurfaces\(\{/);
  assert.match(component, /const warmVisuals = useMemo/);
  assert.match(
    component,
    /selectGardenWarmVisuals\(visibleVisuals, directorWarmVisuals, mediaWindow\.warm\)/,
  );
  assert.match(component, /\[\.\.\.directorWarmVisuals, \.\.\.pageWarmVisuals\]/);
  assert.match(component, /visibleKeys\.has\(key\) \|\| warmKeys\.has\(key\)/);
  assert.match(component, /\.slice\(0, SCREEN_COUNT\)/);
  assert.match(component, /setVisuals\(visibleVisuals, \{\s*activeSongId:[\s\S]*?warmVisuals,/);

  const pool = threeRuntime.slice(
    threeRuntime.indexOf("function createScreenMediaPool"),
    threeRuntime.indexOf("function assignAlbumScreenVisuals"),
  );
  assert.match(pool, /limit = SCREEN_MEDIA_POOL_LIMIT/);
  assert.match(pool, /warm\(visuals = \[\]\) \{/);
  assert.match(pool, /visuals\.slice\(0, SCREEN_COUNT\)\.forEach/);
  assert.match(pool, /const entry = ensureEntry\(visual\)/);
  assert.match(pool, /entry\.warm = true/);
  assert.match(pool, /entry\.references === 0 && !entry\.warm/);
  assert.match(pool, /diagnostics\.warmingVideos/);
  assert.match(pool, /resource\.mediaState === "ready"/);
  assert.match(pool, /resource\.hasPresentedFrame/);
  assert.doesNotMatch(
    pool,
    /\["ready",\s*"buffering"\]\.includes/,
    "transient buffering is not reported as fully buffered",
  );

  const gameSetVisuals = threeRuntime.slice(
    threeRuntime.indexOf("const setVisuals ="),
    threeRuntime.indexOf("const setPlacedRecord ="),
  );
  assert.match(gameSetVisuals, /mediaPool\.warm\(state\.warmVisuals \|\| \[\]\)/);

  const updater = threeRuntime.slice(
    threeRuntime.indexOf("function updateMediaResourcePlayback"),
    threeRuntime.indexOf("function createGeneratedDirectorVisualizerResource"),
  );
  assert.match(updater, /!video\.requestVideoFrameCallback/);
  assert.match(updater, /video\.readyState >= 2/);
  assert.match(updater, /!resource\.hasPresentedFrame/);
  assert.match(
    updater,
    /Math\.abs\(\(Number\(video\.currentTime\) \|\| 0\) - resource\.lastPresentedVideoTime\) > 0\.001/,
  );
  assert.match(updater, /resource\.presentVideoFrame\?\.\(\)/);

  assert.match(threeRuntime, /canvas\.dataset\.presentedVideos = String\(diagnostics\.presentedVideos\)/);
  assert.match(threeRuntime, /canvas\.dataset\.warmingVideos = String\(diagnostics\.warmingVideos\)/);
  assert.match(threeRuntime, /canvas\.dataset\.waitingVideos = String\(diagnostics\.waitingVideos\)/);
});

test("table arrangements persist stable transforms and reject colliding drops", () => {
  const pointerUp = threeRuntime.slice(
    threeRuntime.indexOf("const handlePointerUp"),
    threeRuntime.indexOf("const handlePointerCancel"),
  );
  assert.match(pointerUp, /resolveEchoRecordGardenTableDrop/);
  assert.match(pointerUp, /occupiedPositions:/);
  assert.match(pointerUp, /drop\.reason === "record-collision"/);
  assert.match(pointerUp, /onRecordTransform\?\.\(entry\.record\.songId, transform\)/);
  assert.match(threeRuntime, /let restoredRecordTransforms = \{\}/);
  assert.match(threeRuntime, /state\.recordTransforms/);
  assert.match(threeRuntime, /entry\.homeRotation\.fromArray/);
  assert.match(threeRuntime, /Object\.hasOwn\(state, "placedRecordId"\)/);
  assert.match(threeRuntime, /placedRecordId = state\.placedRecordId \|\| ""/);
  assert.match(threeRuntime, /transform\?\.manipulated === true/);
  assert.match(threeRuntime, /recordInventoryIds/);
  assert.match(threeRuntime, /schemaVersion: "hapa\.echo-record-garden\.scene\.v2"/);
  assert.match(threeRuntime, /recordTransforms,/);
  assert.doesNotMatch(
    threeRuntime,
    /entry\.root\.rotation\.y \+= selected/,
    "decorative motion must not corrupt the persisted base rotation",
  );
});

test("table scenery and manipulable objects share one translated coordinate frame", () => {
  assert.match(threeRuntime, /tableInteractionRoot\.name = "EchoRecordGardenTableInteractionRoot"/);
  assert.match(threeRuntime, /ECHO_RECORD_GARDEN_SPATIAL_LAYOUT\.tableStage\.z/);
  assert.match(threeRuntime, /tableInteractionRoot\.add\(recordsRoot\)/);
  assert.match(threeRuntime, /tableInteractionRoot\.add\(printedCardsRoot\)/);
  assert.match(threeRuntime, /createRecordPlayer\(tableInteractionRoot/);
  assert.match(threeRuntime, /createRecordCatalogConsole\(tableInteractionRoot/);
  assert.match(threeRuntime, /tableInteractionRoot\.worldToLocal\(tableDragPoint\)/);
  assert.match(threeRuntime, /player\.platterTablePosition/);
});
