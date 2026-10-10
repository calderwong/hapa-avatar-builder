import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  discoverDirectionVariantIndexRows,
  mergeDirectionVariantIndexRows,
} from "../src/domain/echo-direction-variant-index.js";

const VARIANT_SCHEMA = "hapa.echo.direction-script-variant.v1";

function writeVariant(root, songId, variantId, extra = {}) {
  const directory = path.join(root, songId);
  fs.mkdirSync(directory, { recursive: true });
  const payload = {
    schemaVersion: VARIANT_SCHEMA,
    id: variantId,
    title: `${variantId} title`,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T01:00:00.000Z",
    parent: { songId, projectSha256: `sha256:${songId}` },
    sourcePolicy: { mode: "append-only", preserveLegacy: true },
    telemetry: {
      replacementShots: 3,
      selectionsBySource: { "ref-cards": 3 },
      uniqueMedia: 2,
    },
    ...extra,
  };
  fs.writeFileSync(path.join(directory, `${variantId}.json`), `${JSON.stringify(payload, null, 2)}\n`);
  return payload;
}

test("discovers every authoritative per-song cut without consulting stale index.json", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-direction-variant-index-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, "index.json"), JSON.stringify({
    variants: [{ id: "song-b:old-index-only" }],
  }));
  writeVariant(root, "song-b", "cut-z", {
    title: "Newest cut",
    variationSet: "wide-coverage-v1",
    cut: { id: "airy" },
    densityProfile: { id: "spacious" },
    coveragePass: { pass: 2 },
    telemetry: {
      replacementShots: 4,
      selectionsBySource: { scene: 2, avatar: 2 },
      uniqueMedia: 4,
      mediaBearingShots: 4,
      visualizerOnlyShots: 1,
      actualVideoRatio: 0.8,
      previouslyUnseenSelections: 3,
    },
  });
  writeVariant(root, "song-a", "cut-a");
  fs.writeFileSync(path.join(root, "song-a", "notes.txt"), "not a cut");

  const rows = discoverDirectionVariantIndexRows({ variantsDirectory: root });

  assert.deepEqual(rows.map((row) => row.id), ["song-a:cut-a", "song-b:cut-z"]);
  assert.deepEqual(rows[1], {
    id: "song-b:cut-z",
    songId: "song-b",
    variantId: "cut-z",
    title: "Newest cut",
    relativePath: "song-b/cut-z.json",
    parentProjectSha256: "sha256:song-b",
    variationSet: "wide-coverage-v1",
    cut: { id: "airy" },
    densityProfile: { id: "spacious" },
    coveragePass: { pass: 2 },
    sourcePolicy: { mode: "append-only", preserveLegacy: true },
    replacementShots: 4,
    sourceSelections: { scene: 2, avatar: 2 },
    uniqueMedia: 4,
    mediaBearingShots: 4,
    visualizerOnlyShots: 1,
    actualVideoRatio: 0.8,
    previouslyUnseenSelections: 3,
    updatedAt: "2026-08-01T01:00:00.000Z",
  });
});

test("merges by id with filesystem authority and incoming over disk over index", () => {
  const existingRows = [{
    id: "song-b:cut-z",
    title: "Stale index title",
    parentProjectSha256: "sha256:stale",
    sourcePolicy: { preserveLegacy: false, indexOnlyFlag: true },
    recordPreview: { videoUri: "/media/preview.mp4", playbackMode: "loop" },
  }, {
    id: "song-c:index-only",
    title: "Index-only cut remains",
  }];
  const diskRows = [{
    id: "song-b:cut-z",
    title: "Disk title",
    parentProjectSha256: "sha256:disk",
    sourcePolicy: { preserveLegacy: true, diskOnlyFlag: true },
  }, {
    id: "song-a:disk-only",
    title: "Cut omitted from stale index",
  }];
  const incomingRows = [{
    id: "song-b:cut-z",
    title: "Incoming title",
    sourcePolicy: { mode: "new-batch", incomingOnlyFlag: true },
  }, {
    id: "song-d:incoming-only",
    title: "Incoming cut",
  }];

  const merged = mergeDirectionVariantIndexRows(existingRows, diskRows, incomingRows);

  assert.deepEqual(merged.map((row) => row.id), [
    "song-a:disk-only",
    "song-b:cut-z",
    "song-d:incoming-only",
  ]);
  assert.deepEqual(merged[1], {
    id: "song-b:cut-z",
    title: "Incoming title",
    parentProjectSha256: "sha256:disk",
    sourcePolicy: {
      preserveLegacy: true,
      indexOnlyFlag: true,
      diskOnlyFlag: true,
      mode: "new-batch",
      incomingOnlyFlag: true,
    },
    recordPreview: { videoUri: "/media/preview.mp4", playbackMode: "loop" },
  });
  assert.equal(existingRows[0].title, "Stale index title");
  assert.equal(diskRows[0].sourcePolicy.indexOnlyFlag, undefined);
  assert.throws(
    () => mergeDirectionVariantIndexRows([{
      id: "song-missing:cut",
      relativePath: "song-missing/cut.json",
    }], [], []),
    /points to missing authoritative file song-missing\/cut\.json/u
  );
});

test("fails closed instead of silently dropping malformed or path-mismatched cuts", (t) => {
  const malformedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-direction-variant-malformed-"));
  const mismatchedRoot = fs.mkdtempSync(path.join(os.tmpdir(), "echo-direction-variant-mismatch-"));
  t.after(() => {
    fs.rmSync(malformedRoot, { recursive: true, force: true });
    fs.rmSync(mismatchedRoot, { recursive: true, force: true });
  });

  fs.mkdirSync(path.join(malformedRoot, "song-a"));
  fs.writeFileSync(path.join(malformedRoot, "song-a", "broken.json"), "{not-json");
  assert.throws(
    () => discoverDirectionVariantIndexRows({ variantsDirectory: malformedRoot }),
    /Cannot parse Direction Variant song-a\/broken\.json/u
  );

  writeVariant(mismatchedRoot, "song-a", "cut-a", {
    parent: { songId: "song-b", projectSha256: "sha256:mismatch" },
  });
  assert.throws(
    () => discoverDirectionVariantIndexRows({ variantsDirectory: mismatchedRoot }),
    /declares parent\.songId song-b/u
  );
});

test("index rows keep small source-policy fields and stub oversized ones so catalogs stay bounded", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "variant-index-compact-"));
  try {
    const qualityPolicy = { accepted: Array.from({ length: 4000 }, (_, index) => ({ id: `media-${index}`, grade: 3 })) };
    fs.mkdirSync(path.join(root, "song-a"), { recursive: true });
    fs.writeFileSync(path.join(root, "song-a", "cut-a.json"), JSON.stringify({
      id: "cut-a", status: "ready", schemaVersion: "hapa.echo.direction-script-variant.v1", createdAt: "2026-10-09T00:00:00.000Z", parent: { songId: "song-a" },
      sourcePolicy: { mode: "balanced-mixed-library-allowlist", allowedSourceGroups: ["human-accepted", "reference"], humanAccepted: { acceptedStateOnly: true, qualityPolicy } },
      timeline: [],
    }));
    const [row] = discoverDirectionVariantIndexRows({ variantsDirectory: root });
    assert.equal(row.sourcePolicy.mode, "balanced-mixed-library-allowlist");
    assert.deepEqual(row.sourcePolicy.allowedSourceGroups, ["human-accepted", "reference"]);
    assert.equal(row.sourcePolicy.humanAccepted.acceptedStateOnly, true);
    assert.equal(row.sourcePolicy.humanAccepted.qualityPolicy.accepted.omittedFromIndex, true);
    assert.match(row.sourcePolicy.humanAccepted.qualityPolicy.accepted.sha256, /^[a-f0-9]{64}$/u);
    assert.ok(JSON.stringify(row).length < 3000);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
