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
