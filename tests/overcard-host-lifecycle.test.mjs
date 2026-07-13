import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = await Promise.all([
  readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
  readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
  readFile(new URL("../scripts/launch-desktop-dedicated.zsh", import.meta.url), "utf8"),
  readFile(new URL("../src/overcard/hostAdapter.js", import.meta.url), "utf8"),
]);
const [electron, preload, server, launcher, adapter] = files;

test("Electron ensures one canonical host before renderer hydration and exposes only scoped lifecycle calls", () => {
  assert.match(electron, /await ensureOvercardHost\(url\);[\s\S]*new BrowserWindow/);
  assert.match(electron, /ensureLocalOvercardHost/);
  assert.match(electron, /overcardHostPromise/);
  assert.match(electron, /webSecurity:\s*true/);
  assert.doesNotMatch(electron, /webSecurity:\s*false/);
  assert.match(electron, /before-quit[\s\S]*void overcardHost\.close\(\)/);
  assert.match(preload, /hapaOvercard/);
  assert.match(preload, /status: \(\) => ipcRenderer\.invoke\("hapa-overcard:status"\)/);
  for (const operation of ["ensure", "reconnect"]) assert.match(preload, new RegExp(`${operation}: \\(\\) => invokeOvercardLifecycle\\("hapa-overcard:${operation}"\\)`));
  assert.match(preload, /OvercardHostLifecycleError/);
  assert.match(preload, /missingOrigins/);
  assert.doesNotMatch(preload, /token|repository|eventLog|snapshotPath/);
});

test("web, desktop, and dedicated modes reserve 8794 for Overcard and register exact local origins", () => {
  assert.match(server, /await ensureLocalOvercardHost/);
  assert.match(server, /Builder remains read-only/);
  assert.match(server, /127\.0\.0\.1:\$\{port\}/);
  assert.match(electron, /127\.0\.0\.1:5178/);
  assert.match(electron, /127\.0\.0\.1:8787/);
  assert.match(electron, /requiredOrigins:\s*overcardOrigins\(rendererUrl\)/);
  assert.match(electron, /status\.missingOrigins/);
  assert.match(electron, /hapa-overcard:reconnect[^\n]+runOvercardLifecycle/);
  assert.doesNotMatch(electron, /hapa-overcard:reconnect[^\n]+close\(/);
  const candidates = launcher.match(/port_candidates=\(([^)]+)\)/)?.[1] || "";
  assert.doesNotMatch(candidates, /\b8794\b/);
  assert.match(adapter, /queuePolicy:\s*"reject"/);
  assert.doesNotMatch(electron, /Access-Control-Allow-Origin",\s*"\*"/);
});
