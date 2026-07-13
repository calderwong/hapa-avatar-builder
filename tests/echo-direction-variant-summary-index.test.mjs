import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  ECHO_DIRECTION_VARIANT_INDEX_SCHEMA,
  createEchoDirectionVariantSummaryIndex,
} from "../server/echo-direction-variant-summary-index.mjs";

async function tempVariantStore() {
  return fs.mkdtemp(path.join(os.tmpdir(), "hapa-variant-summary-index-"));
}

function indexRow(songId, variantId, overrides = {}) {
  return {
    id: `${songId}:${variantId}`,
    songId,
    variantId,
    title: `${variantId} title`,
    relativePath: `${songId}/${variantId}.json`,
    variationSet: { id: "wide-cuts", label: "Wide cuts" },
    cut: { ordinal: 2, label: "Rhythmic" },
    densityProfile: { id: "rhythmic", label: "Rhythmic", ordinal: 2 },
    coveragePass: { ordinal: 2, label: "Library pass 2" },
    mediaBearingShots: 14,
    visualizerOnlyShots: 6,
    replacementShots: 14,
    uniqueMedia: 13,
    videoEventsPerMinute: 8.5,
    videoCoverageSeconds: 61,
    updatedAt: "2026-07-13T06:53:36.178Z",
    ...overrides,
  };
}

async function writeIndexedStore(root, rows) {
  await Promise.all(rows.map(async (row) => {
    const filePath = path.join(root, row.relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    // Invalid on purpose: a fresh summary must never parse the full cut file.
    await fs.writeFile(filePath, "full-variant-json-must-not-be-read", "utf8");
  }));
  await new Promise((resolve) => setTimeout(resolve, 5));
  await fs.writeFile(path.join(root, "index.json"), `${JSON.stringify({
    schemaVersion: ECHO_DIRECTION_VARIANT_INDEX_SCHEMA,
    variants: rows,
    updatedAt: "2026-07-13T06:53:36.178Z",
  })}\n`, "utf8");
}

test("395-row album summary uses the compact index with zero authoritative variant parses", async () => {
  const root = await tempVariantStore();
  try {
    const songIds = Array.from({ length: 79 }, (_, index) => `song-${String(index + 1).padStart(2, "0")}`);
    const rows = songIds.flatMap((songId) => Array.from({ length: 5 }, (_, index) => indexRow(songId, `cut-${index + 1}`)));
    await writeIndexedStore(root, rows);
    let authoritativeReads = 0;
    const catalog = createEchoDirectionVariantSummaryIndex({ variantsRoot: root, validationTtlMs: 60_000 });
    const first = await catalog.variantsForSongs(songIds, async () => {
      authoritativeReads += 1;
      throw new Error("fresh indexed summaries must not parse full variants");
    });
    const second = await catalog.variantsForSongs(songIds, async () => {
      authoritativeReads += 1;
      throw new Error("cached indexed summaries must not parse full variants");
    });

    assert.equal([...first.bySong.values()].flat().length, 395);
    assert.equal([...second.bySong.values()].flat().length, 395);
    assert.equal(authoritativeReads, 0, "summary benchmark: full variant parse count must stay at zero");
    assert.deepEqual([...first.sourceBySong.values()], Array(79).fill("index"));
    const sample = first.bySong.get(songIds[0])[0];
    assert.equal(sample.id, "cut-1");
    assert.equal(sample.timelineCount, 20);
    assert.equal(sample.variationSet.label, "Wide cuts");
    assert.equal(sample.cut.label, "Rhythmic");
    assert.equal(sample.densityProfile.label, "Rhythmic");
    assert.equal(sample.coveragePass.label, "Library pass 2");
    assert.equal(sample.telemetry.uniqueMedia, 13);
    assert.equal(sample.timeline, undefined);
    assert.equal(sample.hyperframe_script, undefined);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("a stale or missing index falls back only to authoritative song variants and caches that fallback", async () => {
  const root = await tempVariantStore();
  try {
    const songId = "song-stale";
    const row = indexRow(songId, "cut-1");
    await writeIndexedStore(root, [row]);
    const catalog = createEchoDirectionVariantSummaryIndex({ variantsRoot: root, validationTtlMs: 0 });
    let reads = 0;
    const authoritative = [{ id: "cut-1", timeline: [{ shot_index: 0 }] }, { id: "new-human-cut", timeline: [{ shot_index: 0 }] }];
    const readAuthoritative = async () => {
      reads += 1;
      return authoritative;
    };

    const indexed = await catalog.variantsForSongs([songId], readAuthoritative);
    assert.equal(indexed.sourceBySong.get(songId), "index");
    assert.equal(reads, 0);

    await fs.writeFile(path.join(root, songId, "new-human-cut.json"), "{}\n", "utf8");
    const stale = await catalog.variantsForSongs([songId], readAuthoritative);
    assert.equal(stale.sourceBySong.get(songId), "authoritative-fallback");
    assert.equal(stale.bySong.get(songId).length, 2);
    assert.equal(reads, 1);
    await catalog.variantsForSongs([songId], readAuthoritative);
    assert.equal(reads, 1, "unchanged stale inventory should reuse the authoritative fallback cache");

    await fs.rm(path.join(root, "index.json"));
    const missing = await catalog.variantsForSongs([songId], readAuthoritative);
    assert.equal(missing.indexValid, false);
    assert.equal(missing.sourceBySong.get(songId), "authoritative-fallback");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});
