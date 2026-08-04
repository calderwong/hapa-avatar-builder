import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  buildHumanVideoFrameCandidateManifest,
  HUMAN_VIDEO_FRAME_CANDIDATE_MANIFEST_SCHEMA,
  parseOptions,
  resolveExactVideoSource,
} from "../scripts/prepare-human-video-optical-frames.mjs";
import {
  parseArgs as parseEnrichmentArgs,
  runEchoVideoEnrichment,
} from "../scripts/enrich-echo-video-catalog.mjs";

test("frame preparation manifest uses exact readable record sources and skips frame-ready videos", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "human-optical-frame-prep-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const mediaRoot = path.join(root, "data", "media");
  const externalRoot = path.join(root, "external");
  await mkdir(mediaRoot, { recursive: true });
  await mkdir(externalRoot, { recursive: true });
  const mediaPath = path.join(mediaRoot, "media-source.mp4");
  const localPath = path.join(externalRoot, "local-source.mp4");
  await writeFile(mediaPath, "media");
  await writeFile(localPath, "local");
  const dashboard = {
    videos: [
      video("ready", "/media/media-source.mp4", readyFrames()),
      video("media", "/media/media-source.mp4"),
      video("local", `/api/local-file?path=${encodeURIComponent(localPath)}`),
      video("unavailable", "/media/missing.mp4"),
    ],
  };
  const manifest = await buildHumanVideoFrameCandidateManifest(dashboard, { repoRoot: root, baseUrl: "http://127.0.0.1:8797" });
  assert.equal(manifest.schemaVersion, HUMAN_VIDEO_FRAME_CANDIDATE_MANIFEST_SCHEMA);
  assert.deepEqual(manifest.summary, {
    knownVideos: 4,
    frameGaps: 3,
    exactReadableSources: 2,
    selectedSources: 2,
    unavailableSources: 1,
  });
  assert.deepEqual(manifest.candidates.map((candidate) => candidate.videoKey), ["fingerprint:local", "fingerprint:media"]);
  assert.deepEqual(new Set(manifest.candidates.map((candidate) => candidate.sourcePath)), new Set([await realpath(localPath), await realpath(mediaPath)]));
  assert.equal(manifest.unavailable[0].videoKey, "fingerprint:unavailable");
  assert.match(manifest.truthBoundary, /No basename, fuzzy, semantic, or visual matching/);
  assert.equal(await resolveExactVideoSource(dashboard.videos[1], root), await realpath(mediaPath));
  assert.equal(await resolveExactVideoSource(dashboard.videos[2], root), await realpath(localPath));
});

test("schema-bound candidate manifest restricts enrichment discovery without writing in dry-run", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "human-optical-frame-manifest-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const videoPath = path.join(root, "candidate.mp4");
  const manifestPath = path.join(root, "candidates.json");
  const outputRoot = path.join(root, "no-output");
  await writeFile(videoPath, "video");
  await writeFile(manifestPath, `${JSON.stringify({
    schemaVersion: HUMAN_VIDEO_FRAME_CANDIDATE_MANIFEST_SCHEMA,
    candidates: [{
      videoKey: "fingerprint:candidate",
      videoId: "candidate",
      videoName: "Candidate",
      uri: "/media/candidate.mp4",
      sourcePath: videoPath,
      technical: { durationSec: 4, width: 640, height: 360 },
    }],
  })}\n`);
  const options = parseEnrichmentArgs(["--prepare", "--candidate-manifest", manifestPath, "--repo-root", root, "--output", outputRoot]);
  const report = await runEchoVideoEnrichment(options);
  assert.equal(report.apply, false);
  assert.equal(report.candidates, 1);
  await assert.rejects(readFile(path.join(outputRoot, "catalog.sqlite3")), /ENOENT/);
  assert.equal(parseOptions(["--limit", "7", "--concurrency", "4"]).limit, 7);
  assert.equal(parseOptions(["--limit", "7", "--concurrency", "4"]).concurrency, 4);
});

function video(id, uri, frames = []) {
  return {
    id,
    assetId: `asset-${id}`,
    humanVideoKey: `fingerprint:${id}`,
    name: `${id}.mp4`,
    uri,
    ownerType: "avatar",
    ownerId: "avatar-1",
    ownerName: "Avatar",
    role: "loop-video",
    duration: 4,
    width: 640,
    height: 360,
    sourceMetadata: { registeredFrames: frames },
  };
}

function readyFrames() {
  return [
    { marker: "first", uri: "/media/first.jpg" },
    { marker: "mid", uri: "/media/mid.jpg" },
    { marker: "last", uri: "/media/last.jpg" },
  ];
}
