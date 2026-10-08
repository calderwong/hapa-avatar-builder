#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
if (process.env.HAPA_LOCAL_HYPERFRAMES_WORKER === "1") {
  console.error("A HyperFrames worker cannot re-enter the local CLI orchestrator.");
  process.exit(1);
}

function versionParts(value) {
  return String(value || "0.0.0").split(/[.-]/).slice(0, 3).map((part) => Number(part) || 0);
}

function compareVersions(left, right) {
  const a = versionParts(left);
  const b = versionParts(right);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function candidate(cliPath) {
  if (!cliPath || !fs.existsSync(cliPath)) return null;
  const packagePath = path.resolve(path.dirname(cliPath), "../package.json");
  try {
    const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
    return { cliPath, version: pkg.version || "0.0.0", packagePath };
  } catch (_) {
    return { cliPath, version: "0.0.0", packagePath };
  }
}

function resolveLocalHyperFrames() {
  const explicit = candidate(process.env.HYPERFRAMES_CLI);
  if (explicit) return explicit;
  const local = candidate(path.join(ROOT, "node_modules/hyperframes/dist/cli.js"));
  if (local) return local;
  const cacheRoot = path.join(os.homedir(), ".npm/_npx");
  const cached = fs.existsSync(cacheRoot)
    ? fs.readdirSync(cacheRoot, { withFileTypes: true })
      .filter((row) => row.isDirectory())
      .map((row) => candidate(path.join(cacheRoot, row.name, "node_modules/hyperframes/dist/cli.js")))
      .filter(Boolean)
      .sort((left, right) => compareVersions(right.version, left.version))
    : [];
  return cached[0] || null;
}

const resolved = resolveLocalHyperFrames();
if (!resolved) {
  console.error("HyperFrames is not installed locally or in the existing npm execution cache. Set HYPERFRAMES_CLI to a local dist/cli.js path; network installation is intentionally disabled.");
  process.exit(1);
}
if (process.argv.includes("--print-path")) {
  process.stdout.write(`${JSON.stringify(resolved, null, 2)}\n`);
  process.exit(0);
}
// The renderer remains upstream-owned. Local validation must not opt into
// telemetry, background installation, update checks, or inherited Node loaders.
const childEnv = { ...process.env, HAPA_LOCAL_HYPERFRAMES_WORKER: "1",
  HYPERFRAMES_NO_UPDATE_CHECK: "1", HYPERFRAMES_NO_AUTO_INSTALL: "1", HYPERFRAMES_NO_TELEMETRY: "1" };
delete childEnv.NODE_OPTIONS;
const child = spawnSync(process.execPath, [resolved.cliPath, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: childEnv,
  shell: false,
  stdio: "inherit",
});
if (child.error) {
  console.error(child.error.stack || child.error.message || String(child.error));
  process.exit(1);
}
process.exit(child.status ?? 1);
