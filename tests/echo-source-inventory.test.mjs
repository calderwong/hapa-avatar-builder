import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEchoSourceInspector, classifyEchoStemGap, reconcileEchoAcceptance } from "../server/echo-source-inventory.mjs";

test("inventory hashes exact bytes, invalidates edits, excludes ZIP containers and never implies decoded audio", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "echo-source-audit-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const file = path.join(root, "voice.mp3");
  await fs.writeFile(file, "ID3audio-a");
  const inspector = createEchoSourceInspector();
  const first = await inspector.inspect(file);
  assert.equal(first.container, "mp3"); assert.equal(first.decodeVerified, false); assert.equal(first.usable, null);
  await inspector.inspect(file); assert.equal(inspector.metrics().cacheHits, 1);
  await fs.writeFile(file, "ID3audio-b");
  assert.notEqual((await inspector.inspect(file)).sha256, first.sha256);
  const zip = path.join(root, "misnamed.mp3"); await fs.writeFile(zip, "PKarchive");
  const archive = await inspector.inspect(zip);
  assert.equal(archive.status, "archive-excluded"); assert.equal(archive.sha256, null);
  assert.equal((await inspector.inspect(path.join(root, "absent"))).status, "missing-file");
});

test("stem omissions distinguish byte failures from project metadata gaps", () => {
  const base = { declared: [{ id: "v" }], projectRoles: [], registryParentId: "master" };
  assert.equal(classifyEchoStemGap({ ...base, inspected: [{ container: "mp3", status: "bytes-verified", audioHeaderRecognized: true }] }).reason, "readable-store-stems-omitted-by-project");
  assert.equal(classifyEchoStemGap({ ...base, inspected: [{ status: "missing-file" }] }).reason, "project-omits-stems-and-source-verification-incomplete");
});

test("historical machine acceptance and accepted-media filenames cannot certify a changed cut or human taste", () => {
  const result = reconcileEchoAcceptance({ currentContractHash: "new", historicalLyricRow: { status: "verified", contractHash: "old" }, selectedCut: { id: "human-accepted-cut", fingerprint: "new" }, renderReceipt: { cuts: [{ cutId: "human-accepted-cut", cutFingerprint: "old", status: "ready" }] }, projectHumanReviewed: false });
  assert.equal(result.historicalLyrics.matchesCurrentContract, false);
  assert.equal(result.render.matchesCurrentCut, false);
  assert.equal(result.humanTaste, "not-established-by-these-receipts");
});
