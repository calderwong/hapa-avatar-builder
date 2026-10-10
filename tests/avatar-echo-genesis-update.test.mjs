import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Echo Avatar Genesis dry run preserves choices and resolves the current song lineage", () => {
  const stores = ["data/avatar-store.json", "data/hapa-songs-store.json"];
  const digest = relative => createHash("sha256").update(fs.readFileSync(path.join(root, relative))).digest("hex");
  const beforeHashes = stores.map(digest);
  const avatarIds = JSON.parse(fs.readFileSync(path.join(root, stores[0]), "utf8")).avatars.map(avatar => avatar.id).sort();
  assert.ok(avatarIds.length >= 70, "acceptance must use the canonical populated Avatar store");
  assert.equal(new Set(avatarIds).size, avatarIds.length, "Avatar identities must be unique");
  const output = execFileSync(process.execPath, [
    "scripts/run-echo-reference-avatar-genesis-update.mjs",
    "--additional-songs",
    "1"
  ], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 60000, killSignal: "SIGTERM" });
  const report = JSON.parse(output);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.before.avatars, avatarIds.length);
  assert.deepEqual(report.avatars.map(avatar => avatar.avatarId).sort(), avatarIds, "every current Avatar is accounted for exactly once");
  assert.deepEqual(stores.map(digest), beforeHashes, "dry run must preserve both authoritative stores byte-for-byte");
  assert.equal(report.after.avatarsWithEchoReferenceGraph, avatarIds.length);
  assert.ok(report.after.selectedSongCards >= report.before.selectedSongCards);
  assert.ok(report.after.connectorSnapshots > 0);
  assert.equal(report.avatars.flatMap((avatar) => avatar.unresolvedSelections).length, 0);
  if (report.before.avatarsWithCurrentEchoReferenceGraph === report.before.avatars) {
    assert.equal(report.after.selectedSongCards, report.before.selectedSongCards);
    assert.equal(report.avatars.flatMap((avatar) => avatar.newSelections).length, 0);
  }
});
