import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url),
  "utf8",
);
const threeRuntime = component.slice(component.indexOf("const ECHO_RECORD_GARDEN_POWER_PROFILES"));

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

test("late image callbacks dispose their result and never mutate a disposed fallback texture", () => {
  assert.match(threeRuntime, /let disposed = false;\s*loader\.load\(/s);
  assert.match(
    threeRuntime,
    /\(loaded\) => \{\s*if \(disposed\) \{\s*loaded\.dispose\(\);\s*return;\s*\}/s,
  );
  assert.match(
    threeRuntime,
    /dispose\(\) \{\s*if \(disposed\) return;\s*disposed = true;\s*loadedTexture\?\.dispose\?\.\(\);\s*texture\.dispose\(\);/s,
  );
  assert.match(threeRuntime, /if \(disposed \|\| entry\.disposed \|\| entry\.textureUri !== uri\) \{\s*texture\.dispose\(\);/s);
  assert.match(threeRuntime, /function disposeRecordEntry\(entry\) \{\s*if \(entry\.disposed\) return;\s*entry\.disposed = true;\s*entry\.textureUri = "";/s);
});

test("reduced motion freezes decorative pulses and untimed context playback", () => {
  assert.match(threeRuntime, /framePowerProfile\.dropRingPulse/);
  assert.match(threeRuntime, /: 0\.26;/);
  const sundayUpdate = threeRuntime.slice(
    threeRuntime.indexOf("function updateSundayScene"),
    threeRuntime.indexOf("function createRecordPlayer"),
  );
  assert.match(sundayUpdate, /if \(reducedMotion\) \{\s*mote\.material\.opacity = mote\.userData\.baseOpacity \?\? 0\.2;\s*return;/s);
  assert.ok(
    sundayUpdate.indexOf("return;") < sundayUpdate.indexOf("Math.sin(elapsed * 0.7"),
    "reduced motion must return before the bokeh opacity pulse",
  );
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
  assert.match(threeRuntime, /renderer\.shadowMap\.enabled = profile\.shadows/);
  assert.match(threeRuntime, /diagnostics\.powerProfile = profile\.id/);
  assert.match(threeRuntime, /canvas\.dataset\.powerProfile = profile\.id/);
  assert.match(threeRuntime, /canvas\.dataset\.renderPixelRatio = pixelRatio\.toFixed\(2\)/);
  assert.match(threeRuntime, /canvas\.dataset\.shadows = profile\.shadows \? "enabled" : "disabled"/);
  assert.match(threeRuntime, /const initialReducedMotion = globalThis\.matchMedia\?\.\("\(prefers-reduced-motion: reduce\)"\)\?\.matches === true/);
  assert.match(threeRuntime, /applyPowerProfile\(initialReducedMotion\)/);
  assert.match(threeRuntime, /applyPowerProfile\(playback\.reducedMotion\)/);
});

test("physical platter drops wait for audio preflight and failed videos keep their source-labelled fallback", () => {
  const pointerUp = threeRuntime.slice(
    threeRuntime.indexOf("const handlePointerUp"),
    threeRuntime.indexOf("const handlePointerCancel"),
  );
  assert.match(pointerUp, /onDropRecord\?\.\(entry\.record\.songId\)/);
  assert.doesNotMatch(pointerUp, /placedRecordId\s*=/);
  assert.match(pointerUp, /platter will switch after its audio is verified/);

  const mediaFactory = threeRuntime.slice(
    threeRuntime.indexOf("function createScreenMediaResource"),
    threeRuntime.indexOf("function disposeScreenMediaResource"),
  );
  assert.match(mediaFactory, /const texture = fallbackTexture/);
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
  assert.match(mediaFactory, /hasPresentedFrame: false/);
  assert.match(mediaFactory, /lastPresentedVideoTime: Number\.NaN/);

  const presenter = mediaFactory.slice(
    mediaFactory.indexOf("const presentVideoFrame"),
    mediaFactory.indexOf("const scheduleFrame"),
  );
  assert.match(presenter, /video\.readyState < 2/);
  assert.match(presenter, /resource\.hasPresentedFrame = true/);
  assert.match(presenter, /resource\.lastPresentedVideoTime = Number\(video\.currentTime\) \|\| 0/);
  assert.match(presenter, /texture\.image = video/);
  assert.match(presenter, /texture\.needsUpdate = true/);

  const frameLoop = mediaFactory.slice(
    mediaFactory.indexOf("const scheduleFrame"),
    mediaFactory.indexOf("const handleMetadata"),
  );
  assert.match(frameLoop, /video\.requestVideoFrameCallback/);
  assert.match(frameLoop, /presentVideoFrame\(\)/);
  assert.match(
    frameLoop,
    /if \(video\.requestVideoFrameCallback\) scheduleFrame\(\);\s*else presentVideoFrame\(\);/s,
    "browsers without requestVideoFrameCallback still promote a decoded current frame",
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
  assert.match(mediaFactory, /fallbackImage = posterImage/);
  assert.match(mediaFactory, /if \(resource\.hasPresentedFrame\) return;\s*texture\.image = fallbackImage/s);
  assert.match(mediaFactory, /texture\.image = fallbackImage;\s*texture\.needsUpdate = true;/s);
  assert.match(mediaFactory, /video\.cancelVideoFrameCallback\(resource\.frameCallback\)/);
  assert.match(mediaFactory, /posterImage\.onload = null/);
  assert.match(mediaFactory, /posterImage\.removeAttribute\("src"\)/);
});

test("the screen pool warms exactly three forward surfaces and refreshes videos without frame callbacks", () => {
  assert.match(component, /selectEchoRecordMediaWindow\(visuals, surfacePage, \{/);
  assert.match(component, /visibleCount: SCREEN_COUNT,\s*warmCount: SCREEN_COUNT/s);
  assert.match(component, /const directorWarmVisuals = useMemo/);
  assert.match(component, /buildEchoRecordDirectorWarmSurfaces\(\{/);
  assert.match(component, /count: SCREEN_COUNT \* 2/);
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
  assert.match(pool, /warm\(visuals = \[\]\) \{/);
  assert.match(pool, /visuals\.slice\(0, SCREEN_COUNT\)\.forEach/);
  assert.match(pool, /const entry = ensureEntry\(visual\)/);
  assert.match(pool, /entry\.warm = true/);
  assert.match(pool, /entry\.references === 0 && !entry\.warm/);
  assert.match(pool, /diagnostics\.warmingVideos/);
  assert.match(pool, /resource\.video && resource\.mediaState === "ready"/);
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
    threeRuntime.indexOf("function updateAlbumScreen"),
    threeRuntime.indexOf("function createScreenMediaResource"),
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
