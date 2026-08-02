import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  REF_CARDS_CUT_BLUEPRINTS,
  REF_CARDS_SOURCE_GROUPS,
  buildRefCardsCutConfigurations,
  computeRefCardsBatchFingerprint,
  sha256File,
} from "../scripts/append-ref-cards-expanded-direction-variants.mjs";

test("uses true full-file SHA-256 rather than trusting a 64-hex ingest fingerprint", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "ref-cards-full-hash-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "clip.mp4");
  const bytes = Buffer.from("header-content-middle-content-tail-content");
  await writeFile(filePath, bytes);

  const expected = createHash("sha256").update(bytes).digest("hex");
  const misleadingPartialFingerprint = "a".repeat(64);

  assert.equal(await sha256File(filePath), expected);
  assert.notEqual(expected, misleadingPartialFingerprint);
});

test("derives a stable content-addressed family and changes it when the corpus changes", () => {
  const rows = [
    { recordId: "media-b", relativePath: "run2/b.mp4", sha256: "b".repeat(64) },
    { recordId: "media-a", relativePath: "a.mp4", sha256: "a".repeat(64) },
  ];
  const reversed = [...rows].reverse();
  const changed = rows.map((row, index) => index === 0 ? { ...row, sha256: "c".repeat(64) } : row);

  const fingerprint = computeRefCardsBatchFingerprint(rows);
  assert.equal(fingerprint, computeRefCardsBatchFingerprint(reversed));
  assert.notEqual(fingerprint, computeRefCardsBatchFingerprint(changed));

  const cuts = buildRefCardsCutConfigurations(fingerprint);
  assert.equal(cuts.length, 3);
  assert.deepEqual(cuts.map((cut) => cut.key), ["balanced", "rhythmic", "cinematic"]);
  assert.equal(new Set(cuts.map((cut) => cut.id)).size, 3);
  assert.ok(cuts.every((cut) => cut.id.includes(fingerprint.slice(0, 12))));
  assert.ok(cuts.every((cut) => cut.variationSet.batchFingerprint === `sha256:${fingerprint}`));
});

test("every new cut family deliberately includes Ref Cards and all approved Hapa media groups", () => {
  assert.deepEqual(REF_CARDS_SOURCE_GROUPS, [
    "ref-cards", "reference", "scroll", "scene", "avatar", "deevid", "tarot",
  ]);
  assert.equal(REF_CARDS_CUT_BLUEPRINTS.length, 3);
  for (const cut of REF_CARDS_CUT_BLUEPRINTS) {
    assert.ok(cut.pattern.includes("ref-cards"), `${cut.key} omitted Ref Cards`);
    for (const group of REF_CARDS_SOURCE_GROUPS) {
      assert.ok(cut.pattern.includes(group), `${cut.key} omitted ${group}`);
    }
  }
});
