import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import {
  buildBalancedAssignmentReport,
  buildRefCardsTransitionContracts,
  ECHO_CHAIN_GRAPH_SCHEMA,
  REF_CARDS_TRANSITION_REPORT_SCHEMA,
} from "../scripts/build-ref-cards-transition-contracts.mjs";

const execFile = promisify(execFileCallback);
const FIXED_TIME = "2026-08-03T00:00:00.000Z";

async function sha256File(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function makeColorImage(filePath, color) {
  await execFile("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=${color}:s=64x64:d=1`,
    "-frames:v", "1", "-y", filePath,
  ]);
}

async function makeTwoFrameVideo(filePath, firstColor, lastColor) {
  await execFile("ffmpeg", [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", `color=c=${firstColor}:s=64x64:r=1:d=1`,
    "-f", "lavfi", "-i", `color=c=${lastColor}:s=64x64:r=1:d=1`,
    "-filter_complex", "[0:v][1:v]concat=n=2:v=1:a=0,format=yuv420p",
    "-r", "1", "-c:v", "libx264", "-y", filePath,
  ]);
}

function mediaRecord({ id, fileName, runtimePath, relativePath, sizeBytes, wrongFramePath }) {
  const uri = `/media/${fileName}`;
  return {
    id,
    sourceKind: "folder-video",
    name: fileName,
    mediaType: "video",
    uri,
    sourceRoots: ["ref-cards-run-1"],
    sourceRelativePaths: { "ref-cards-run-1": relativePath },
    sizeBytes,
    width: 64,
    height: 64,
    duration: 2,
    updatedAt: FIXED_TIME,
    asset: {
      id,
      name: fileName,
      uri,
      type: "video",
      metadata: {
        duration: 2,
        storage: { kind: "local-file", path: runtimePath, fileName },
        // Deliberately wrong ingest thumbnails prove the builder reads the
        // physical video terminals instead of trusting cached JPEGs.
        frames: ["first", "mid", "last"].map((marker) => ({
          id: `${id}-${marker}`,
          marker,
          storage: { path: wrongFramePath },
        })),
      },
    },
  };
}

async function buildFixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), "ref-transition-contracts-"));
  const mediaRoot = path.join(root, "media");
  const projectsDirectory = path.join(root, "projects");
  await Promise.all([mkdir(mediaRoot), mkdir(projectsDirectory)]);

  const redImage = path.join(mediaRoot, "red.png");
  const blueImage = path.join(mediaRoot, "blue.png");
  const wrongFrame = path.join(mediaRoot, "wrong-yellow.png");
  await Promise.all([
    makeColorImage(redImage, "red"),
    makeColorImage(blueImage, "blue"),
    makeColorImage(wrongFrame, "yellow"),
  ]);

  const videos = [
    { id: "folder-video-generic", fileName: "ordinary-motion.mp4", relativePath: "ordinary-motion.mp4", first: "red", last: "blue" },
    { id: "folder-video-false-hint", fileName: "transition-but-unmatched.mp4", relativePath: "run2/transition-but-unmatched.mp4", first: "yellow", last: "yellow" },
    { id: "folder-video-run3", fileName: "reverse-motion.mp4", relativePath: "run2/run3/reverse-motion.mp4", first: "blue", last: "red" },
  ];
  for (const video of videos) {
    video.runtimePath = path.join(mediaRoot, video.fileName);
    await makeTwoFrameVideo(video.runtimePath, video.first, video.last);
    video.sha256 = await sha256File(video.runtimePath);
    video.sizeBytes = (await stat(video.runtimePath)).size;
  }

  const mediaLibraryPath = path.join(root, "media-library.json");
  const mediaLibrary = {
    schemaVersion: "hapa.system-media-library.v1",
    updatedAt: FIXED_TIME,
    records: videos.map((video) => mediaRecord({ ...video, wrongFramePath: wrongFrame })),
  };
  await writeFile(mediaLibraryPath, `${JSON.stringify(mediaLibrary, null, 2)}\n`);

  const referenceCatalogPath = path.join(root, "echo-reference-animated-media.json");
  const referenceCatalog = {
    schemaVersion: "hapa.echo-reference-animated-media-catalog.v1",
    updatedAt: FIXED_TIME,
    records: [
      { id: "red", title: "Red Hold", imagePath: redImage, uri: "/media/red.png" },
      { id: "blue", title: "Blue Hold", imagePath: blueImage, uri: "/media/blue.png" },
    ].map((row) => ({
      schemaVersion: "hapa.echo-reference-animated-media-receipt.v1",
      card: { id: `reference:${row.id}`, revisionId: `reference:${row.id}:r1`, title: row.title },
      artifacts: { image: { path: row.imagePath, uri: row.uri, sha256: null } },
      custody: { sourceCardUnchanged: true, reviewStatus: "approved" },
    })),
  };
  for (const record of referenceCatalog.records) record.artifacts.image.sha256 = await sha256File(record.artifacts.image.path);
  await writeFile(referenceCatalogPath, `${JSON.stringify(referenceCatalog, null, 2)}\n`);

  const hashCachePath = path.join(root, "hash-cache-v1.json");
  const hashCache = {
    schemaVersion: "hapa.ref-cards-expanded-direction-hash-cache.v1",
    updatedAt: FIXED_TIME,
    entries: Object.fromEntries(videos.map((video) => [video.fileName, {
      sizeBytes: video.sizeBytes,
      sha256: video.sha256,
      verifiedAt: FIXED_TIME,
    }])),
  };
  await writeFile(hashCachePath, `${JSON.stringify(hashCache, null, 2)}\n`);

  const baseEnrichmentsPath = path.join(root, "enrichments.ndjson");
  const preservedBase = {
    schemaVersion: "hapa.echo.video-enrichment.v1",
    id: `hapa-media:sha256:${videos[0].sha256}`,
    mediaId: `hapa-media:sha256:${videos[0].sha256}`,
    runtimeUri: `/media/${videos[0].fileName}`,
    playable: true,
    decodeStatus: "decoded",
    semantic: { fixtureSentinel: "must-survive-overlay" },
    quality: { score: 88.5, normalizedScore: 0.885, tier: "excellent" },
    recognition: { provider: "fixture-provider", frames: [] },
    flow: { loop: { eligible: false, classification: "not-loop" } },
  };
  await writeFile(baseEnrichmentsPath, `${JSON.stringify(preservedBase)}\n`);

  const canonicalSongs = [
    { songId: "dear-papa-song-alpha", songTitle: "Alpha" },
    { songId: "dear-papa-song-beta", songTitle: "Beta" },
  ];
  for (const song of canonicalSongs) {
    await writeFile(path.join(projectsDirectory, `${song.songId}-video-project.json`), `${JSON.stringify({
      music_video_project: { song_id: song.songId, song_title: song.songTitle },
    }, null, 2)}\n`);
  }

  return {
    root,
    mediaRoot,
    projectsDirectory,
    mediaLibraryPath,
    referenceCatalogPath,
    hashCachePath,
    baseEnrichmentsPath,
    videos,
    hashCache,
  };
}

function optionsFor(fixture, outputDirectory) {
  return {
    mediaLibraryPath: fixture.mediaLibraryPath,
    referenceCatalogPath: fixture.referenceCatalogPath,
    hashCachePath: fixture.hashCachePath,
    baseEnrichmentsPath: fixture.baseEnrichmentsPath,
    projectsDirectory: fixture.projectsDirectory,
    mediaRoot: fixture.mediaRoot,
    outputDirectory,
    concurrency: 2,
    expectedVideoCount: 3,
    expectedReferenceCount: 2,
    expectedSongCount: 2,
  };
}

test("Ref Cards contracts use physical terminal pixels, quarantine filename-only hints, and replay deterministically", { timeout: 120_000 }, async () => {
  const fixture = await buildFixture();
  const firstOutput = path.join(fixture.root, "output-a");
  const secondOutput = path.join(fixture.root, "output-b");
  const first = await buildRefCardsTransitionContracts(optionsFor(fixture, firstOutput));
  const second = await buildRefCardsTransitionContracts(optionsFor(fixture, secondOutput));
  assert.equal(first.contentUniqueVideos, 3);
  assert.equal(first.declaredCandidates, 2);
  assert.equal(first.quarantined, 1);
  assert.equal(first.assignmentPairs, 4);
  assert.equal(second.inputManifestDigest, first.inputManifestDigest);

  const graph = JSON.parse(await readFile(path.join(firstOutput, "chain-graph.json")));
  assert.equal(graph.schemaVersion, ECHO_CHAIN_GRAPH_SCHEMA);
  assert.equal(graph.declaredTransitions.length, 2);
  assert.equal(graph.declaredTransitions.some((row) => row.transitionLink.id.startsWith("vibes-transition:")), false);
  assert.equal(graph.declaredTransitions.every((row) => row.visuallyValidated === false), true);
  assert.equal(graph.truthBoundary.certificationAuthority.script, "scripts/validate-echo-transition-endpoints.mjs");

  const report = JSON.parse(await readFile(path.join(firstOutput, "candidate-quarantine-report.json")));
  assert.equal(report.schemaVersion, REF_CARDS_TRANSITION_REPORT_SCHEMA);
  const ordinary = report.candidates.find((row) => row.sourceRelativePath === "ordinary-motion.mp4");
  const falseHint = report.candidates.find((row) => row.sourceRelativePath.includes("transition-but-unmatched"));
  const run3 = report.candidates.find((row) => row.sourceCohort === "ref-cards-run-1/run2/run3");
  assert.equal(ordinary.filenameHint, false);
  assert.equal(ordinary.decision, "declared-candidate");
  assert.equal(ordinary.first.selected.cardId, "reference:red");
  assert.equal(ordinary.last.selected.cardId, "reference:blue");
  assert.equal(falseHint.filenameHint, true);
  assert.equal(falseHint.decision, "quarantine");
  assert.ok(falseHint.quarantineReasons.includes("first-endpoint-no-reference-match"));
  assert.equal(run3.decision, "declared-candidate");
  assert.equal(report.totals.candidatesWithoutFilenameHint, 2);
  assert.equal(report.totals.filenameHintsQuarantined, 1);

  const mergedRows = (await readFile(path.join(firstOutput, "enrichments.ndjson"), "utf8"))
    .trim().split("\n").map(JSON.parse);
  const preserved = mergedRows.find((row) => row.semantic?.fixtureSentinel);
  assert.equal(preserved.semantic.fixtureSentinel, "must-survive-overlay");
  assert.equal(preserved.quality.score, 88.5);
  assert.equal(preserved.flow.loop.classification, "not-loop");
  assert.equal(preserved.flow.transition.declaredTransition, true);
  assert.equal(preserved.flow.transition.visuallyValidated, false);

  const assignments = JSON.parse(await readFile(path.join(firstOutput, "transition-assignment-report.json")));
  assert.equal(assignments.schemaVersion, "hapa.echo.transition-director-script-report.v1");
  assert.equal(assignments.assignment.source, "ref-cards-certified-transition-family");
  assert.equal(assignments.assignment.songs.length, 2);
  assert.equal(assignments.assignment.songs.every((row) => row.jobIds.length === 2), true);
  assert.equal(assignments.validation.allDeclaredJobsCovered, true);
  assert.equal(assignments.validation.allCanonicalSongsCovered, true);
  assert.equal(assignments.balance.jobUsageSpread, 0);
  assert.equal(assignments.balance.jobUsageMaximum <= assignments.balance.jobUsageMaximumPolicy, true);

  const fileNames = (await readdir(firstOutput)).sort();
  assert.deepEqual(fileNames, (await readdir(secondOutput)).sort());
  for (const fileName of fileNames) {
    assert.deepEqual(await readFile(path.join(firstOutput, fileName)), await readFile(path.join(secondOutput, fileName)), `${fileName} must be deterministic`);
  }
});

test("Ref Cards contracts fail closed on a stale or forged full-file hash", { timeout: 120_000 }, async () => {
  const fixture = await buildFixture();
  const forged = structuredClone(fixture.hashCache);
  forged.entries[fixture.videos[0].fileName].sha256 = "0".repeat(64);
  await writeFile(fixture.hashCachePath, `${JSON.stringify(forged, null, 2)}\n`);
  await assert.rejects(
    buildRefCardsTransitionContracts(optionsFor(fixture, path.join(fixture.root, "forged-output"))),
    /video SHA-256 mismatch/u,
  );
});

test("balanced assignments enforce the configured maximum reuse", () => {
  const declarations = [{
    sourceFrame: { cardId: "reference:a", cardTitle: "A" },
    targetFrame: { cardId: "reference:b", cardTitle: "B" },
    transitionLink: { id: "ref-cards-transition:only-job" },
  }];
  const canonicalSongs = Array.from({ length: 4 }, (_, index) => ({
    songId: `song-${index}`,
    songTitle: `Song ${index}`,
  }));
  assert.throws(
    () => buildBalancedAssignmentReport({ declarations, canonicalSongs, inputBinding: {}, generatedAt: FIXED_TIME }),
    /permits at most 3/u,
  );
});
