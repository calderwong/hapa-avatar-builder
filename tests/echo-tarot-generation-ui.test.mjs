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
  assert.match(monitor, /Generate 4-card quality pilot/);
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

test("the renderer bridge exposes queue operations but never a credential read method", () => {
  assert.match(preload, /hapaEchoTarotImages/);
  assert.match(preload, /startPilot/);
  assert.match(preload, /continueFull/);
  assert.match(preload, /review/);
  assert.doesNotMatch(preload, /hapaCredentials[\s\S]*read:/);
  assert.match(main, /createEchoTarotImageGeneration/);
  assert.match(main, /providerCredentialStore/);
  assert.match(main, /hapa-echo-tarot-images:start-pilot/);
});
