import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CLI = path.join(ROOT, "cli/avatar-builder.mjs");
const STORE = path.join(ROOT, "data/avatar-store.json");

test("CLI audit emits machine-readable completeness", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "hapa-avatar-cli-"));
  const storePath = path.join(temp, "avatar-store.json");
  await copyFile(STORE, storePath);

  try {
    const output = await execNode([CLI, "audit", "red-reaper", "--store", storePath, "--json"]);
    const audit = JSON.parse(output);
    assert.equal(audit.avatarId, "red-reaper");
    assert.equal(audit.required, 43);
    assert.equal(audit.complete, audit.filled >= audit.required);
    assert.equal(typeof audit.percent, "number");
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("CLI attach emits an agent reference pack", async () => {
  const output = await execNode([CLI, "attach", "red-reaper", "--target", "video", "--json"]);
  const pack = JSON.parse(output);
  assert.equal(pack.avatarCardId, "red-reaper");
  assert.equal(pack.target, "video");
  assert.ok(pack.baseReferences.length > 0);
  assert.equal(pack.mind.schemaVersion, "hapa.avatar-mind-summary.v1");
});

test("CLI mind commands update avatar mind mappings", async () => {
  const temp = await mkdtemp(path.join(tmpdir(), "hapa-avatar-cli-mind-"));
  const storePath = path.join(temp, "avatar-store.json");
  await copyFile(STORE, storePath);

  try {
    await execNode([
      CLI,
      "mind-set",
      "red-reaper",
      "--store",
      storePath,
      "--wants",
      "A clean route through the next scene",
      "--json"
    ]);
    await execNode([
      CLI,
      "relationship-set",
      "red-reaper",
      "--store",
      storePath,
      "--target",
      "test-ally",
      "--label",
      "ally",
      "--trust",
      "3",
      "--json"
    ]);
    const output = await execNode([CLI, "mind", "red-reaper", "--store", storePath, "--json"]);
    const pack = JSON.parse(output);
    assert.equal(pack.mind.personaAnchor.wants, "A clean route through the next scene");
    const testAlly = pack.summary.knownOthers.find((item) => item.name === "test-ally");
    assert.ok(testAlly);
    assert.equal(testAlly.trust, 3);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

function execNode(args) {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, args, { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr}`));
        return;
      }
      resolve(stdout);
    });
  });
}
