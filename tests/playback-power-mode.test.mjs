import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { normalizePlaybackPowerMode, playbackPowerPolicy } from "../src/domain/playback-power-mode.js";

test("playback power modes enforce decoder and frame budgets", () => {
  assert.deepEqual(playbackPowerPolicy("hidden"), { mode: "hidden", maxFps: 0, maxPlayingVideos: 0, animationEnabled: false, audioEnabled: false });
  assert.equal(playbackPowerPolicy("docked", { activeFps: 60 }).maxFps, 12);
  assert.equal(playbackPowerPolicy("docked").maxPlayingVideos, 1);
  assert.equal(playbackPowerPolicy("active").animationEnabled, true);
  assert.equal(normalizePlaybackPowerMode("invented"), "active");
});

test("App routes explicit power modes and Tarot preserves its WebGL game across mode changes", () => {
  const app = fs.readFileSync("./src/App.jsx", "utf8");
  const tarot = fs.readFileSync("./src/components/TarotDraw3DView.jsx", "utf8");
  const echo = fs.readFileSync("./src/components/HapaEchosView.jsx", "utf8");
  assert.match(app, /const tarotDrawPlaybackMode = isTarotDrawView \? "active" : \(tarotDrawSceneLive \? "docked" : "hidden"\)/);
  assert.match(app, /playbackMode=\{tarotDrawPlaybackMode\}/);
  assert.match(tarot, /setPlaybackMode/);
  assert.match(tarot, /playbackPowerMode === "hidden"/);
  assert.match(tarot, /playbackPowerMode === "docked"/);
  assert.match(tarot, /maxPlayingVideos === 0/);
  assert.match(tarot, /lastFrameTime = performance\.now\(\) \/ 1000/);
  assert.match(echo, /powerMode === "hidden"/);
  assert.match(echo, /1000 \/ 12/);
});
