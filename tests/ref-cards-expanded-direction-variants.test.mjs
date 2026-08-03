import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  REF_CARDS_CUT_BLUEPRINTS,
  REF_CARDS_DIRECTION_POLICY,
  REF_CARDS_DIRECTION_POLICY_DIGEST,
  REF_CARDS_SOURCE_GROUPS,
  buildRefCardsCutConfigurations,
  classifyRefCardsMotionRole,
  computeRefCardsBatchFingerprint,
  computeRefCardsDirectionPolicyDigest,
  refCardsSourceCohort,
  sha256File,
  validateRefCardsIngestReceipt,
} from "../scripts/append-ref-cards-expanded-direction-variants.mjs";
import {
  createFolderVideoSourceManifestReceipt,
  folderVideoSourceStateDigest,
} from "../scripts/ingest-folder-videos.mjs";

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
  assert.ok(cuts.every((cut) => cut.variationSet.batchFingerprint === `sha256:${fingerprint}`));
  assert.ok(cuts.every((cut) => cut.variationSet.directingPolicyDigest === `sha256:${REF_CARDS_DIRECTION_POLICY_DIGEST}`));
  assert.equal(
    computeRefCardsDirectionPolicyDigest(Object.fromEntries(Object.entries(REF_CARDS_DIRECTION_POLICY).reverse())),
    REF_CARDS_DIRECTION_POLICY_DIGEST,
  );

  const changedPolicyDigest = computeRefCardsDirectionPolicyDigest({
    ...REF_CARDS_DIRECTION_POLICY,
    transitionEditorialMotionWeight: 3,
  });
  const changedPolicyCuts = buildRefCardsCutConfigurations(fingerprint, changedPolicyDigest);
  assert.notEqual(changedPolicyCuts[0].variationSet.id, cuts[0].variationSet.id);
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

test("explicit Ref Cards transitions outrank holds without claiming endpoint certification", () => {
  const transition = classifyRefCardsMotionRole("run2/run3/create-a-smooth-and-slick-transition (4).mp4");
  const hold = classifyRefCardsMotionRole("run2/Create_a_subtle_relaxing_loop_202607282219.mp4");

  assert.equal(transition.motionRole, "transition");
  assert.equal(transition.authoredUse, "scene-motion");
  assert.equal(transition.editorialMotionWeight, 2);
  assert.match(transition.endpointStatus, /unverified/);
  assert.ok(transition.authoredRoles.includes("endpoint-certification-required-for-atomic-bridge"));
  assert.equal(hold.motionRole, "loop");
  assert.equal(hold.authoredUse, "hold");
  assert.equal(hold.editorialMotionWeight, 1);
});

test("Ref Cards cohorts keep run3 distinct from its same-named run2 predecessors", () => {
  assert.equal(refCardsSourceCohort("clip.mp4"), "ref-cards-run-1/root");
  assert.equal(refCardsSourceCohort("run2/clip.mp4"), "ref-cards-run-1/run2");
  assert.equal(refCardsSourceCohort("run2/run3/clip.mp4"), "ref-cards-run-1/run2/run3");
});

test("Ref Cards compilation accepts only persisted complete source/library receipts", () => {
  const sourceFolder = path.resolve("/tmp/ref-cards-receipt-fixture");
  const entry = {
    sourcePath: path.join(sourceFolder, "run2/clip.mp4"),
    sourceRoots: ["ref-cards-run-1"],
    sourceRelativePaths: { "ref-cards-run-1": "run2/clip.mp4" },
    sizeBytes: 42,
    mtimeMs: 4200,
    contentFingerprint: "d".repeat(64),
    mediaLibraryRecordId: "folder-video-d",
  };
  const generatedAt = "2026-08-03T16:30:00.000Z";
  const sourceLibraryManifest = createFolderVideoSourceManifestReceipt([entry], {
    persisted: true,
    roots: [sourceFolder],
    generatedAt,
  });
  const ingestReport = {
    dryRun: false,
    generatedAt,
    sourceVideos: 1,
    errors: [],
    sourceLibraryManifest,
  };
  const sourceSnapshot = {
    videoPaths: 1,
    sourceStateDigest: folderVideoSourceStateDigest([entry]),
  };
  const mediaLibrary = {
    records: [{
      id: "folder-video-d",
      sourceKind: "folder-video",
      sourceRoots: ["ref-cards-run-1"],
      contentFingerprint: "d".repeat(64),
      asset: { uri: "/media/clip.mp4" },
    }],
  };

  assert.equal(validateRefCardsIngestReceipt({
    ingestReport,
    sourceSnapshot,
    mediaLibrary,
    sourceFolder,
  }).verified, true);
  assert.throws(() => validateRefCardsIngestReceipt({
    ingestReport: { ...ingestReport, dryRun: true },
    sourceSnapshot,
    mediaLibrary,
    sourceFolder,
  }), /non-dry-run/);
  assert.throws(() => validateRefCardsIngestReceipt({
    ingestReport: { ...ingestReport, errors: [{ message: "frame failed" }] },
    sourceSnapshot,
    mediaLibrary,
    sourceFolder,
  }), /reports with errors/);
  assert.throws(() => validateRefCardsIngestReceipt({
    ingestReport,
    sourceSnapshot: { ...sourceSnapshot, sourceStateDigest: "e".repeat(64) },
    mediaLibrary,
    sourceFolder,
  }), /current complete source snapshot/);
  assert.throws(() => validateRefCardsIngestReceipt({
    ingestReport,
    sourceSnapshot,
    mediaLibrary: { records: [] },
    sourceFolder,
  }), /matching media-library records/);
});
