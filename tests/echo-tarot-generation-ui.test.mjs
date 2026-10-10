import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [monitor, notebook, preload, main] = await Promise.all([
  readFile(new URL("../src/components/EchoTarotGenerationMonitor.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/EchoSongNotebook.jsx", import.meta.url), "utf8"),
  readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
  readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
]);

test("the Echo Song notebook embeds local run monitoring, references, outputs, and human feedback", () => {
  assert.match(notebook, /EchoTarotGenerationMonitor/);
  assert.match(monitor, /Generate \{status\.pilotCount \|\| 4\}-card quality pilot/);
  assert.match(monitor, /Continue all/);
  assert.match(monitor, /kind="reference"/);
  assert.match(monitor, /Sent to GPT Image/);
  assert.match(monitor, /Local review only/);
  assert.match(monitor, /kind="output"/);
  assert.match(monitor, /Approve/);
  assert.match(monitor, /Revise/);
  assert.match(monitor, /Reject/);
  assert.match(monitor, /estimatedCostUsd/);
  assert.match(monitor, /Generation blocked before the full-deck spend/);
  assert.match(monitor, /Recheck model access/);
});

test("generated Tarot cards provide a large dossier preview and an album-wide browser", () => {
  assert.match(monitor, /Open large preview of/);
  assert.match(monitor, /showModal\(\)/);
  assert.match(monitor, /Close large Tarot card preview/);
  assert.match(monitor, /event\.key === "Escape"/);
  assert.match(monitor, /Card × Song dossier/);
  assert.match(monitor, /Previous/);
  assert.match(monitor, /Next/);
  assert.match(monitor, /Full album/);
  assert.match(monitor, /All Tarot cards for the album/);
  assert.match(monitor, /Search album Tarot cards/);
  assert.match(monitor, /ALBUM_PAGE_SIZE = 24/);
  assert.match(monitor, /Show next/);
});

test("the renderer bridge exposes queue operations but never a credential read method", () => {
  assert.match(preload, /hapaEchoTarotImages/);
  assert.match(preload, /hapaEchoTarotManImages/);
  assert.match(preload, /hapaEchoTarotCoupleImages/);
  assert.match(preload, /startPilot/);
  assert.match(preload, /continueFull/);
  assert.match(preload, /review/);
  assert.doesNotMatch(preload, /hapaCredentials[\s\S]*read:/);
  assert.match(main, /createEchoTarotImageGeneration/);
  assert.match(main, /providerCredentialStore/);
  assert.match(main, /hapa-echo-tarot-images:start-pilot/);
  assert.match(main, /hapa-echo-tarot-man-images:start-pilot/);
  assert.match(main, /hapa-echo-tarot-couple-images:start-pilot/);
  assert.match(monitor, /Hapa Main Couple/);
  assert.match(monitor, /Hapa Main Man/);
  assert.match(monitor, /Hapa Main Woman/);
});

test("the Echo Tarot monitor exposes the FAL loop pilot, album continuation, and motion review without credential reads", () => {
  assert.match(monitor, /H3 Max Turbo card loops/);
  assert.match(monitor, /Generate 3-loop quality pilot/);
  assert.match(monitor, /Approve pilot & animate album/);
  assert.match(monitor, /Motion loop/);
  assert.match(monitor, /FAL motion-loop review/);
  assert.match(preload, /hapaEchoTarotLoops/);
  assert.match(preload, /hapaEchoTarotManLoops/);
  assert.match(preload, /hapaEchoTarotCoupleLoops/);
  assert.match(preload, /hapa-echo-tarot-loops:start-pilot/);
  assert.match(preload, /hapa-echo-tarot-loops:continue-full/);
  assert.match(preload, /hapa-echo-tarot-loops:asset/);
  assert.match(main, /createEchoTarotLoopGeneration/);
  assert.match(main, /hapa-echo-tarot-loops:start-pilot/);
  assert.match(main, /hapa-echo-tarot-loops:continue-full/);
  assert.match(main, /hapa-echo-tarot-man-loops:start-pilot/);
  assert.match(main, /hapa-echo-tarot-couple-loops:start-pilot/);
  assert.match(monitor, /loopAssetBridge=\{loopBridge\}/);
  assert.doesNotMatch(preload, /hapaEchoTarotLoops[\s\S]*credential/);
});
