import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("app launch paths default to a LAN-reachable secure Phone Card bridge", async () => {
  const [server, electron, launcher, packageJson] = await Promise.all([
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
    readFile(new URL("../scripts/launch-desktop-dedicated.zsh", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.match(server, /usesAppLaunchDefaults = Boolean\(staticDir\) && !configuredHost/);
  assert.match(server, /usesAppLaunchDefaults \? "0\.0\.0\.0" : "127\.0\.0\.1"/);
  assert.match(server, /usesAppLaunchDefaults \? true : ""/);
  assert.match(electron, /HAPA_AVATAR_BIND_HOST \|\| "0\.0\.0\.0"/);
  assert.match(launcher, /HAPA_AVATAR_BIND_HOST:-0\.0\.0\.0/);
  assert.match(packageJson.scripts.start, /server\/api\.mjs.*--static dist/);
});

test("API-only launches retain the loopback default and explicit overrides remain available", async () => {
  const server = await readFile(new URL("../server/api.mjs", import.meta.url), "utf8");
  assert.match(server, /usesAppLaunchDefaults \? "0\.0\.0\.0" : "127\.0\.0\.1"/);
  assert.match(server, /args\.get\("host"\) \|\| process\.env\.HAPA_AVATAR_HOST/);
  assert.match(server, /args\.get\("https-port"\) \?\? process\.env\.HAPA_AVATAR_HTTPS_PORT/);
});
