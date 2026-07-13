import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tarotSource = fs.readFileSync(path.join(root, "src/components/TarotDraw3DView.jsx"), "utf8");
const echoSource = fs.readFileSync(path.join(root, "src/components/HapaEchosView.jsx"), "utf8");

test("Tarot scene construction is stable across card and audit prop identity changes", () => {
  const constructionEffect = tarotSource.match(/game = createTarotDrawGame\([\s\S]*?\n  \}, \[([^\]]*)\]\);/);
  assert.ok(constructionEffect, "Tarot construction effect must remain explicit");
  assert.doesNotMatch(constructionEffect[1], /\bcards\b|\bproductionAudit\b/);
  assert.match(tarotSource, /gameRef\.current\?\.reconcileCards\?\.\(cards\)/);
  assert.match(tarotSource, /gameRef\.current\?\.setProductionAudit\?\.\(productionAudit\)/);
  assert.match(tarotSource, /if \(disposed\) return;/);
});

test("Echo playback time commits are isolated below the top-level view", () => {
  const ticker = echoSource.match(/\/\/ Playback timer ticker fallback[\s\S]*?\/\/ Audio time update handler/);
  const timeUpdate = echoSource.match(/const handleTimeUpdate = \(\) => \{[\s\S]*?\n  \};/);
  assert.ok(ticker);
  assert.ok(timeUpdate);
  assert.doesNotMatch(ticker[0], /setCurrentTime\(next\)/);
  assert.doesNotMatch(timeUpdate[0], /setCurrentTime/);
  assert.match(echoSource, /function EchoPlaybackClockBoundary/);
  assert.match(echoSource, /__HAPA_ECHO_CLOCK_DIAGNOSTICS__/);
});
