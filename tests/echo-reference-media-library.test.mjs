import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  buildEchoReferenceMediaLibrary,
  resolveEchoReferenceMediaAsset,
} from "../server/echo-reference-media-library.mjs";

async function writeManifest(root, runId, manifest) {
  const runRoot = path.join(root, runId);
  await fs.mkdir(runRoot, { recursive: true });
  await fs.writeFile(path.join(runRoot, "manifest.json"), JSON.stringify(manifest));
}

function imageJob(id, patch = {}) {
  return {
    id,
    status: "completed",
    outputPath: `/placeholder/${id}.png`,
    outputSha256: `sha256:${id}`,
    songId: "song:one",
    songTitle: "One Song",
    referenceId: `reference:${id}`,
    referenceTitle: `Reference ${id}`,
    prompt: `Distinct prompt ${id}`,
    finishedAt: "2026-09-13T20:00:00.000Z",
    ...patch,
  };
}

test("consolidated media index includes every retained image run and joins loops by source job", async (context) => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "echo-reference-media-"));
  context.after(() => fs.rm(tempRoot, { recursive: true, force: true }));
  const imageRunsRoot = path.join(tempRoot, "images");
  const loopRunsRoot = path.join(tempRoot, "loops");
  const firstRunId = "image-run-one";
  const secondRunId = "image-run-two";
  const imagePath = path.join(imageRunsRoot, secondRunId, "second.png");
  const loopPath = path.join(loopRunsRoot, "loop-run-one", "second.mp4");

  await writeManifest(imageRunsRoot, firstRunId, {
    runId: firstRunId,
    model: "gpt-image-test",
    createdAt: "2026-09-13T18:00:00.000Z",
    state: "completed",
    jobs: [imageJob("first")],
  });
  await fs.mkdir(path.dirname(imagePath), { recursive: true });
  await fs.writeFile(imagePath, "png");
  await writeManifest(imageRunsRoot, secondRunId, {
    runId: secondRunId,
    model: "gpt-image-test",
    createdAt: "2026-09-13T19:00:00.000Z",
    state: "completed",
    jobs: [imageJob("second", { outputPath: imagePath })],
  });
  await fs.mkdir(path.dirname(loopPath), { recursive: true });
  await fs.writeFile(loopPath, "video");
  await writeManifest(loopRunsRoot, "loop-run-one", {
    runId: "loop-run-one",
    sourceImageRunId: secondRunId,
    createdAt: "2026-09-13T21:00:00.000Z",
    jobs: [{ id: "loop-second", sourceJobId: "second", status: "completed", outputPath: loopPath, outputSha256: "sha256:loop-second", finishedAt: "2026-09-13T21:01:00.000Z" }],
  });

  const legacyLibrary = {
    generatedAt: "2026-09-13T17:00:00.000Z",
    items: [{ id: "reference:catalog", title: "Catalog Reference", songs: [{ id: "song:one", title: "One Song" }], image: { uri: "/media/catalog.png", hash: "sha256:catalog" }, loopVideo: { uri: "/media/catalog.mp4", hash: "sha256:catalog-loop" }, source: { generator: "Codex GPT Image" } }],
  };
  const options = { imageRunsRoot, loopRunsRoot };
  const firstIndex = await buildEchoReferenceMediaLibrary(legacyLibrary, options);

  assert.equal(firstIndex.counts.visuals, 3);
  assert.equal(firstIndex.counts.catalogVisuals, 1);
  assert.equal(firstIndex.counts.generatedVisuals, 2);
  assert.equal(firstIndex.counts.imageRuns, 2);
  assert.equal(firstIndex.counts.loopRuns, 1);
  assert.equal(firstIndex.counts.loopReady, 2);
  assert.equal(firstIndex.policy.allRetainedRuns, true);
  assert.deepEqual(firstIndex.runs.filter((run) => run.kind === "api-run").map((run) => run.id), [secondRunId, firstRunId]);
  assert.equal(firstIndex.items.find((item) => item.source.jobId === "second").loopVideo.uri, "/api/echos/reference-media/assets/loop/loop-run-one/loop-second");
  assert.doesNotMatch(JSON.stringify(firstIndex), /\/placeholder\/|\/private\/|\/var\/folders\//, "browser payload must not expose local custody paths");

  const imageAsset = await resolveEchoReferenceMediaAsset("image", secondRunId, "second", options);
  const loopAsset = await resolveEchoReferenceMediaAsset("loop", "loop-run-one", "loop-second", options);
  assert.equal(imageAsset.filePath, imagePath);
  assert.equal(loopAsset.filePath, loopPath);

  await writeManifest(imageRunsRoot, firstRunId, {
    runId: firstRunId,
    model: "gpt-image-test",
    createdAt: "2026-09-13T18:00:00.000Z",
    state: "completed",
    jobs: [imageJob("first"), imageJob("third")],
  });
  const refreshed = await buildEchoReferenceMediaLibrary(legacyLibrary, options);
  assert.equal(refreshed.counts.visuals, 4, "a newly completed manifest job must appear on the next rescan");
  assert.notEqual(refreshed.digest, firstIndex.digest);
});
