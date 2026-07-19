import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Echo Avatar Genesis dry run preserves choices and resolves the current song lineage", () => {
  const output = execFileSync(process.execPath, [
    "scripts/run-echo-reference-avatar-genesis-update.mjs",
    "--additional-songs",
    "1"
  ], { cwd: root, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  const report = JSON.parse(output);
  assert.equal(report.mode, "dry-run");
  assert.equal(report.before.avatars, 74);
  assert.equal(report.after.avatarsWithEchoReferenceGraph, 74);
  assert.ok(report.after.selectedSongCards >= report.before.selectedSongCards);
  assert.ok(report.after.connectorSnapshots > 0);
  assert.equal(report.avatars.flatMap((avatar) => avatar.unresolvedSelections).length, 0);
  if (report.before.avatarsWithEchoReferenceGraph === report.before.avatars) {
    assert.equal(report.after.selectedSongCards, report.before.selectedSongCards);
    assert.equal(report.avatars.flatMap((avatar) => avatar.newSelections).length, 0);
  }
});
