import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const files = {
  app: new URL("../src/App.jsx", import.meta.url),
  component: new URL("../src/components/ProviderCredentialsPanel.jsx", import.meta.url),
  main: new URL("../electron/main.cjs", import.meta.url),
  preload: new URL("../electron/preload.cjs", import.meta.url),
  gitignore: new URL("../.gitignore", import.meta.url),
};

test("desktop UI exposes save/status/remove but no credential read or reveal bridge", async () => {
  const [app, component, main, preload] = await Promise.all([
    readFile(files.app, "utf8"),
    readFile(files.component, "utf8"),
    readFile(files.main, "utf8"),
    readFile(files.preload, "utf8"),
  ]);

  assert.match(app, /ProviderCredentialsPanel/);
  assert.match(app, /Provider API keys/);
  assert.match(component, /type="password"/);
  assert.match(component, /No key reveal API/);
  assert.match(preload, /hapaCredentials/);
  assert.match(preload, /hapa-credentials:status/);
  assert.match(preload, /hapa-credentials:save/);
  assert.match(preload, /hapa-credentials:remove/);
  assert.doesNotMatch(preload, /hapa-credentials:(read|reveal|export)/);
  assert.match(main, /isTrustedCredentialSender/);
  assert.match(main, /event\.sender !== mainWindow\.webContents/);
});

test("repository ignore rules explicitly cover common and Builder credential files", async () => {
  const gitignore = await readFile(files.gitignore, "utf8");
  assert.match(gitignore, /^\.env$/m);
  assert.match(gitignore, /^\.env\.\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(gitignore, /^\*\*\/provider-credentials\*\.json$/m);
  assert.match(gitignore, /^\*\*\/provider-secrets\*\.json$/m);
});
