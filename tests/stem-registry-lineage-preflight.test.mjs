import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { preflightStemRegistryLineage } from "../server/stem-registry-lineage-preflight.mjs";

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-stem-lineage-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const masterPath = path.join(root, "master.wav");
  const synthPath = path.join(root, "synth.wav");
  const wrongPath = path.join(root, "wrong.wav");
  fs.writeFileSync(masterPath, "master");
  fs.writeFileSync(synthPath, "synth");
  fs.writeFileSync(wrongPath, "wrong");
  const registry = {
    songs: [{ id: "song:master", localPath: masterPath }],
    stems: [{
      id: "stem:synth",
      parentId: "song:master",
      localPath: synthPath,
      stemType: "Synth",
      settings: { stem_from_id: "song:master", stem_type_group_name: "Synth" },
      raw: { metadata: { stem_from_id: "song:master" } },
    }],
  };
  const showGraph = {
    song: { id: "song:master" },
    stems: { items: [{ id: "stem:synth", stemType: "Synth", audioPath: synthPath }] },
  };
  return { masterPath, synthPath, wrongPath, registry, showGraph };
}

test("certifies exact registry stem ID, role, path, and parent-master lineage", (t) => {
  const value = fixture(t);
  const report = preflightStemRegistryLineage(value);
  assert.equal(report.ok, true);
  assert.equal(report.master.id, "song:master");
  assert.equal(report.verifiedStemCount, 1);
  assert.deepEqual(report.errors, []);
});

test("rejects an unrelated or relabeled stem even when it is a readable audio path", (t) => {
  const value = fixture(t);
  const graph = structuredClone(value.showGraph);
  graph.stems.items[0].audioPath = value.wrongPath;
  graph.stems.items[0].stemType = "Vocals";
  value.registry.stems[0].parentId = "song:other";
  value.registry.stems[0].settings.stem_from_id = "song:other";
  value.registry.stems[0].raw.metadata.stem_from_id = "song:other";
  const report = preflightStemRegistryLineage({ ...value, showGraph: graph });
  assert.equal(report.ok, false);
  assert.ok(report.errors.includes("stem-registry-path-mismatch"));
  assert.ok(report.errors.includes("stem-registry-role-mismatch"));
  assert.ok(report.errors.includes("stem-registry-parent-mismatch"));
});

test("fails closed when a graph stem ID has no canonical registry row", (t) => {
  const value = fixture(t);
  value.showGraph.stems.items[0].id = "stem:invented";
  const report = preflightStemRegistryLineage(value);
  assert.equal(report.ok, false);
  assert.ok(report.errors.includes("stem-registry-row-missing"));
});

test("one stale matching parent field cannot mask contradictory canonical lineage claims", (t) => {
  const value = fixture(t);
  value.registry.stems[0].parentId = "song:other";
  value.registry.stems[0].settings.stem_from_id = "song:other";
  value.registry.stems[0].settings.edited_clip_id = "song:master";
  const report = preflightStemRegistryLineage(value);
  assert.equal(report.ok, false);
  assert.ok(report.errors.includes("stem-registry-parent-mismatch"));
  assert.deepEqual(report.entries[0].parentIds.sort(), ["song:master", "song:other"]);
});
