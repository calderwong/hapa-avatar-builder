import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

test("the compact Record preview index is rebuilt atomically from exact Director media", async (t) => {
  const variantsRoot = await mkdtemp(path.join(os.tmpdir(), "echo-record-preview-index-"));
  t.after(() => rm(variantsRoot, { recursive: true, force: true }));
  await mkdir(path.join(variantsRoot, "song-one"), { recursive: true });
  await writeFile(path.join(variantsRoot, "song-one", "cut-one.json"), JSON.stringify({
    id: "cut-one",
    timeline: [
      {
        shot_index: 0,
        start_sec: 2,
        end_sec: 8,
        media_id: "older-loop",
        media_contract: { runtimeUri: "/media/older-loop.mp4", playbackMode: "loop" },
      },
      {
        shot_index: 1,
        start_sec: 8,
        end_sec: 14,
        media_id: "media-one",
        media_contract: {
          runtimeUri: "/media/exact-one.mp4",
          posterUri: "/media/exact-one.jpg",
          sourceInSeconds: 1.5,
          sourceOutSeconds: 7.5,
          actualDurationSeconds: 6,
          playbackMode: "once",
          contentHash: "sha256:exact-one",
          timeMapping: { valid: true, reachesDeclaredLastFrame: true },
        },
        decision_evidence: {
          atomicTransition: {
            role: "authored-transition",
            visualValidation: { decision: "certified" },
          },
        },
      },
    ],
  }));
  await writeFile(path.join(variantsRoot, "index.json"), JSON.stringify({
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [
      {
        songId: "song-one",
        variantId: "cut-one",
        relativePath: "song-one/cut-one.json",
      },
      {
        songId: "unsafe",
        variantId: "outside",
        relativePath: "../outside.json",
      },
    ],
  }));

  const { stdout } = await execFileAsync(process.execPath, [
    path.join(ROOT, "scripts", "build-echo-record-preview-index.mjs"),
  ], {
    cwd: ROOT,
    env: { ...process.env, HAPA_ECHO_DIRECTION_VARIANTS_DIR: variantsRoot },
  });
  const result = JSON.parse(stdout);
  assert.deepEqual({ variants: result.variants, enriched: result.enriched }, { variants: 2, enriched: 1 });

  const index = JSON.parse(await readFile(path.join(variantsRoot, "index.json"), "utf8"));
  assert.equal(index.recordPreviewCount, 1);
  assert.equal(index.recordPreviewSchemaVersion, "hapa.echo-record-garden.catalog-preview.v1");
  assert.deepEqual(index.variants[0].recordPreview, {
    schemaVersion: "hapa.echo-record-garden.catalog-preview.v1",
    mediaId: "media-one",
    videoUri: "/media/exact-one.mp4",
    posterUri: "/media/exact-one.jpg",
    sourceStartSeconds: 1.5,
    sourceEndSeconds: 7.5,
    durationSeconds: 6,
    playbackMode: "loop",
    mediaContentHash: "sha256:exact-one",
    selectionRole: "certified-authored-transition",
  });
  assert.equal(index.variants[1].recordPreview, undefined, "path traversal rows must never be hydrated");
  assert.deepEqual(
    (await readdir(variantsRoot)).filter((name) => name.includes("record-preview") && name.endsWith(".tmp")),
    [],
    "the atomic temporary file should not remain after a successful rename",
  );
});
