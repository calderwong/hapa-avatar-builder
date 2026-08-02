import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { classifySourcePrior } from "../src/domain/echo-video-enrichment.js";

import {
  VISION_LABEL_MAX_PER_FRAME,
  VISION_LABEL_MIN_CONFIDENCE,
  VISION_LABEL_RELATIVE_CONFIDENCE,
  canonicalMediaId,
  confidentFrameLabels,
  fingerprintGrayscaleFrame,
  loadSourcePriorOverrides,
  normalizeMarker,
  parseArgs,
  runEchoVideoEnrichment,
  shardForKey,
  stableBatchGeneratedAt,
} from "../scripts/enrich-echo-video-catalog.mjs";

test("semantic Vision labels use a confidence and top-K gate while raw labels remain available", () => {
  const raw = Array.from({ length: 20 }, (_, index) => ({
    identifier: `label-${index}`,
    confidence: index === 19 ? 0.95 : index / 100,
  }));
  const frame = { labels: raw };
  const selected = confidentFrameLabels(frame);
  assert.ok(selected.length <= VISION_LABEL_MAX_PER_FRAME);
  assert.ok(selected.every((label) => label.confidence >= VISION_LABEL_MIN_CONFIDENCE));
  assert.ok(selected.every((label) => label.confidence >= raw[19].confidence * VISION_LABEL_RELATIVE_CONFIDENCE));
  assert.equal(selected[0].identifier, "label-19");
  assert.equal(frame.labels.length, 20, "the raw recognition evidence was mutated or discarded");
  assert.deepEqual(confidentFrameLabels({ labels: [{ identifier: "curated-unscored" }] }), [
    { identifier: "curated-unscored", confidence: null },
  ]);
});

test("argument parsing preserves explicit dry-run and deterministic shard settings", () => {
  const hash = "a".repeat(64);
  const options = parseArgs(["--recognize", "--batch-index", "2", "--batch-count", "3", "--concurrency", "4", "--media-id", hash]);
  assert.equal(options.mode, "recognize");
  assert.equal(options.apply, false);
  assert.deepEqual({ index: options.batchIndex, count: options.batchCount }, { index: 2, count: 3 });
  assert.equal(options.concurrency, 4);
  assert.deepEqual(options.mediaIds, [`hapa-media:sha256:${hash}`]);
  assert.equal(parseArgs(["--repair-frames"]).mode, "repair-frames");
  assert.throws(() => parseArgs(["--prepare", "--finalize"]), /exactly one mode/i);
});

test("content IDs and shards are stable", () => {
  const hash = "a".repeat(64);
  assert.equal(canonicalMediaId(hash), `hapa-media:sha256:${hash}`);
  assert.equal(shardForKey("same-key", 7), shardForKey("same-key", 7));
  assert.ok(shardForKey("same-key", 7) >= 0 && shardForKey("same-key", 7) < 7);
});

test("the curated source-prior overlay is content-addressed and does not rely on review titles", async () => {
  const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
  const loaded = await loadSourcePriorOverrides({ repoRoot }, { warnings: [] });
  assert.equal(loaded.byMediaId.size, 8);
  for (const [mediaId, record] of loaded.byMediaId) {
    assert.match(mediaId, /^hapa-media:sha256:[a-f0-9]{64}$/u);
    assert.equal(record.sourceClass, "hell-week");
    assert.equal(record.prior, 0.1);
    assert.equal(record.provenanceEvidence.sourceCatalog, "hell-week");
    assert.equal(record.provenanceEvidence.authority, "operator-confirmed-card-lineage");
    assert.deepEqual(
      { sourceClass: classifySourcePrior(record.provenanceEvidence).sourceClass, prior: classifySourcePrior(record.provenanceEvidence).prior },
      { sourceClass: "hell-week", prior: 0.1 },
    );
  }
});

test("a production finalize fails closed when the curated source-prior overlay is absent", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "echo-source-prior-overlay-missing-"));
  try {
    await assert.rejects(
      loadSourcePriorOverrides({ repoRoot }, { warnings: [] }, { required: true }),
      /required echo source-prior override overlay is missing or unreadable/i,
    );
    const optional = await loadSourcePriorOverrides({ repoRoot }, { warnings: [] });
    assert.equal(optional.byMediaId.size, 0);
  } finally {
    await rm(repoRoot, { recursive: true, force: true });
  }
});

test("an unchanged enrichment fingerprint preserves its batch timestamp for replay-safe Director IDs", () => {
  const fingerprint = `sha256:${"a".repeat(64)}`;
  const prior = { batchFingerprint: fingerprint, generatedAt: "2026-08-02T18:52:56.863Z" };
  assert.equal(stableBatchGeneratedAt(prior, fingerprint, "2027-01-01T00:00:00.000Z"), prior.generatedAt);
  assert.equal(
    stableBatchGeneratedAt(prior, `sha256:${"b".repeat(64)}`, "2027-01-01T00:00:00.000Z"),
    "2027-01-01T00:00:00.000Z",
  );
});

test("frame marker aliases normalize to the three evidence positions", () => {
  assert.equal(normalizeMarker("opening"), "first");
  assert.equal(normalizeMarker("middle-frame"), "mid");
  assert.equal(normalizeMarker("closing"), "last");
  assert.equal(normalizeMarker("unknown"), "");
});

test("perceptual frame fingerprints are deterministic and complete", () => {
  const pixels = Buffer.alloc(16 * 16);
  for (let index = 0; index < pixels.length; index += 1) pixels[index] = (index * 17) % 256;
  const first = fingerprintGrayscaleFrame(pixels, 16, 16);
  const second = fingerprintGrayscaleFrame(pixels, 16, 16);
  assert.deepEqual(first, second);
  for (const key of ["ahash", "dhash", "phash"]) assert.match(first[key], /^[a-f0-9]{16}$/u);
  assert.equal(first.status, "ready");
});

test("dry-run plans without creating an output directory or database", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "echo-enrichment-dry-run-"));
  const outputRoot = path.join(root, "should-not-exist");
  try {
    const options = parseArgs(["--prepare", "--repo-root", root, "--output", outputRoot]);
    const report = await runEchoVideoEnrichment(options);
    assert.equal(report.apply, false);
    assert.equal(report.note, "No database, frames, enrichments, cuts, or indexes were written.");
    await assert.rejects(readFile(path.join(outputRoot, "catalog.sqlite3")), /ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("an unchanged all/apply replay preserves row clocks and byte-stable catalog artifacts", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "echo-enrichment-replay-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const mediaRoot = path.join(root, "data", "media");
  const outputRoot = path.join(root, "artifacts", "echo-video-enrichment-v1");
  await mkdir(mediaRoot, { recursive: true });
  const mediaPaths = [path.join(mediaRoot, "fixture-a.mp4"), path.join(mediaRoot, "fixture-b.mp4")];
  await Promise.all(mediaPaths.map((filePath, index) => writeFile(filePath, Buffer.from(`fixture-video-${index}`))));
  await writeFile(path.join(root, "data", "media-library.json"), `${JSON.stringify({
    records: mediaPaths.map((filePath, index) => ({
      id: `fixture-${index}`,
      name: `Fixture ${index}`,
      mediaType: "video",
      sourcePath: filePath,
      uri: `/media/${path.basename(filePath)}`,
      sourceKind: "replay-fixture",
      tags: ["replay-fixture"],
    })),
  }, null, 2)}\n`);
  await writeFile(path.join(root, "data", "echo-video-source-prior-overrides.json"), `${JSON.stringify({
    schemaVersion: "hapa.echo.video-source-prior-overrides.v1",
    authority: "focused-regression-fixture",
    overrides: [],
  }, null, 2)}\n`);

  const externalCalls = [];
  const execFile = async (command, args) => {
    externalCalls.push({ command, args: [...args] });
    if (command === "ffprobe") {
      return {
        stdout: JSON.stringify({
          format: { duration: "2" },
          streams: [{ codec_type: "video", codec_name: "h264", pix_fmt: "yuv420p", width: 640, height: 360, r_frame_rate: "30/1", duration: "2" }],
        }),
        stderr: "",
      };
    }
    if (command === "ffmpeg" && args.at(-1) === "pipe:1") {
      const inputCount = args.filter((value) => value === "-i").length;
      return { stdout: Buffer.alloc(inputCount * 256, 96), stderr: Buffer.alloc(0) };
    }
    if (command === "ffmpeg") {
      const target = args.at(-1);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, Buffer.from("fixture-frame"));
      return { stdout: "", stderr: "" };
    }
    throw new Error(`Unexpected fixture command: ${command}`);
  };
  const visionRunner = async (paths) => paths.map((filePath) => ({
    path: filePath,
    ok: true,
    engine: "fixture-vision",
    description: "A luminous figure crosses a calm blue field.",
    labels: [{ identifier: "luminous_figure", confidence: 0.99 }],
    textLines: [],
    raw: { fixture: true },
  }));
  const options = {
    ...parseArgs(["--all", "--apply", "--repo-root", root, "--output", outputRoot, "--edge-threshold", "0"]),
    execFile,
    visionRunner,
  };
  const artifactPaths = ["manifest.ndjson", "enrichments.ndjson", "chain-graph.json", "report.json"]
    .map((name) => path.join(outputRoot, name));
  const rowClocks = () => {
    const db = new DatabaseSync(path.join(outputRoot, "catalog.sqlite3"), { readOnly: true });
    try {
      return {
        videos: db.prepare("SELECT media_id,created_at,updated_at FROM videos ORDER BY media_id").all(),
        frames: db.prepare("SELECT frame_id,created_at,updated_at FROM frames ORDER BY frame_id").all(),
        recognition: db.prepare("SELECT frame_id,recognized_at FROM recognition ORDER BY frame_id").all(),
        enrichments: db.prepare("SELECT media_id,updated_at FROM enrichments ORDER BY media_id").all(),
        chainEdges: db.prepare("SELECT edge_id,updated_at FROM chain_edges ORDER BY edge_id").all(),
      };
    } finally {
      db.close();
    }
  };

  const first = await runEchoVideoEnrichment(options);
  assert.equal(first.catalog.counts.manifestVideos, 2);
  assert.ok(first.catalog.counts.chainEdges > 0);
  const firstBytes = await Promise.all(artifactPaths.map((filePath) => readFile(filePath)));
  const firstMtimes = await Promise.all(artifactPaths.map(async (filePath) => (await stat(filePath)).mtimeMs));
  const firstClocks = rowClocks();
  assert.ok(externalCalls.length > 0);

  await new Promise((resolve) => setTimeout(resolve, 20));
  externalCalls.length = 0;
  const second = await runEchoVideoEnrichment(options);
  const secondBytes = await Promise.all(artifactPaths.map((filePath) => readFile(filePath)));
  const secondMtimes = await Promise.all(artifactPaths.map(async (filePath) => (await stat(filePath)).mtimeMs));

  assert.equal(second.stages.prepare.videosReused, 2);
  assert.equal(second.stages.prepare.videoProbesReused, 2);
  assert.equal(second.stages.recognize.reused, 6);
  assert.equal(second.stages.finalize.created, 0);
  assert.equal(second.stages.finalize.reused, 2);
  assert.equal(second.stages.percentiles.updated, 0);
  assert.equal(second.stages.percentiles.reused, 2);
  assert.deepEqual(externalCalls, [], "unchanged replay invoked decode, frame extraction, fingerprinting, or Vision work");
  assert.deepEqual(rowClocks(), firstClocks, "unchanged replay refreshed a persisted semantic row clock");
  assert.deepEqual(secondBytes, firstBytes, "unchanged replay changed compact catalog artifact bytes");
  assert.deepEqual(secondMtimes, firstMtimes, "unchanged replay rewrote an identical compact catalog artifact");
});
