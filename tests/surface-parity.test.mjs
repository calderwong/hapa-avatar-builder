import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);

test("manifest, CLI, UI, and parity documentation use one canonical identity", async () => {
  const manifest = JSON.parse(await readFile(new URL("../hapa-node.json", import.meta.url), "utf8"));
  const docs = await readFile(new URL("../docs/API_CLI_UI_PARITY.md", import.meta.url), "utf8");
  const main = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const help = await exec(process.execPath, [new URL("../cli/avatar-builder.mjs", import.meta.url).pathname, "--help"]);
  const capabilities = await exec(process.execPath, [new URL("../cli/avatar-builder.mjs", import.meta.url).pathname, "capabilities", "--json"]);
  const cli = JSON.parse(capabilities.stdout);
  assert.equal(manifest.id, "hapa-avatar-builder");
  assert.ok(manifest.aliases.includes("hapa-app-hapa-avatar-builder"));
  assert.deepEqual(cli.capabilities, manifest.capabilities);
  assert.equal(cli.id, manifest.id);
  assert.match(help.stdout, /Hapa Avatar Builder CLI/);
  assert.match(main, /Hapa Avatar Builder/);
  assert.match(docs, /Quest Keeper[\s\S]*Hapa Dash[\s\S]*Node Space[\s\S]*Second Brain/);
  assert.equal(Object.values(manifest.surfaceParity).includes(false), false);
});
