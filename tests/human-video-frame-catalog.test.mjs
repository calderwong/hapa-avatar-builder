import assert from "node:assert/strict";
import { mkdtemp, mkdir, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  HUMAN_VIDEO_FRAME_CATALOG_RECEIPT_SCHEMA,
  openHumanVideoFrameCatalog,
  resolveTrustedHumanVideoCatalogFrameUri,
} from "../server/human-video-frame-catalog.mjs";

test("frame catalog attaches only exact content-bound First/Mid/Last sets", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const catalog = openHumanVideoFrameCatalog(fixture);
  const existingFrames = [
    { marker: "first", uri: "/media/existing-first.jpg" },
    { marker: "mid", uri: "/media/existing-mid.jpg" },
    { marker: "last", uri: "/media/existing-last.jpg" },
  ];
  const dashboard = {
    records: [
      videoRecord("hash-match", { contentFingerprint: `sha256:${fixture.hashA}` }),
      videoRecord("uri-match", { uri: fixture.uriB }),
      videoRecord("existing", {
        contentFingerprint: fixture.hashA,
        asset: { id: "asset-existing", metadata: { frames: existingFrames } },
      }),
      videoRecord("contradictory", { contentFingerprint: fixture.hashA, uri: fixture.uriB }),
      videoRecord("basename-only", { sourcePath: "/unrelated/place/shared-name.mp4" }),
    ],
  };

  const projected = catalog.attachMediaDashboard(dashboard);
  assert.equal(projected.receipt.schemaVersion, HUMAN_VIDEO_FRAME_CATALOG_RECEIPT_SCHEMA);
  assert.equal(projected.receipt.catalog, "echo-video-enrichment-v1");
  assert.equal(projected.receipt.catalogVideos, 2);
  assert.equal(projected.receipt.completeFrameSets, 2);
  assert.equal(projected.receipt.attachedRecords, 2);
  assert.equal(projected.receipt.alreadyRegistered, 1);
  assert.equal(projected.receipt.contradictoryRecords, 1);
  assert.equal(projected.receipt.unmatchedRecords, 1);
  assert.equal("databasePath" in projected.receipt, false);
  assert.equal("frameRoot" in projected.receipt, false);

  for (const id of ["hash-match", "uri-match"]) {
    const record = projected.dashboard.records.find((item) => item.id === id);
    assert.deepEqual(record.asset.metadata.frames.map((frame) => frame.marker), ["first", "mid", "last"]);
    assert.ok(record.asset.metadata.frames.every((frame) => frame.uri.startsWith("/api/local-file?path=")));
    assert.equal(record.asset.metadata.humanVideoFrameCatalogReceipt.frameCount, 3);
    assert.equal("databasePath" in record.asset.metadata.humanVideoFrameCatalogReceipt, false);
  }
  assert.equal(projected.dashboard.records.find((item) => item.id === "existing").asset.metadata.frames, existingFrames);
  assert.equal(projected.dashboard.records.find((item) => item.id === "contradictory").asset, null);
  assert.equal(projected.dashboard.records.find((item) => item.id === "basename-only").asset, null);
});

test("frame catalog ignores incomplete or out-of-root frame sets", async (t) => {
  const fixture = await createFixture({ unsafeSecondVideo: true });
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const projected = openHumanVideoFrameCatalog(fixture).attachMediaDashboard({
    records: [videoRecord("unsafe", { contentFingerprint: fixture.hashB })],
  });
  assert.equal(projected.receipt.catalogVideos, 1);
  assert.equal(projected.receipt.attachedRecords, 0);
  assert.equal(projected.receipt.unmatchedRecords, 1);
  assert.equal(projected.dashboard.records[0].asset, null);
});

test("trusted catalog frame resolver is root-scoped and image-only", async (t) => {
  const fixture = await createFixture();
  t.after(() => rm(fixture.root, { recursive: true, force: true }));
  const acceptedPath = fixture.framesA.first;
  const acceptedUri = `/api/local-file?path=${encodeURIComponent(acceptedPath)}`;
  assert.equal(resolveTrustedHumanVideoCatalogFrameUri(acceptedUri, fixture.frameRoot), await realpath(acceptedPath));

  const outside = path.join(fixture.root, "outside.jpg");
  const textFile = path.join(fixture.frameRoot, "not-an-image.txt");
  await writeFile(outside, "outside");
  await writeFile(textFile, "text");
  assert.equal(resolveTrustedHumanVideoCatalogFrameUri(`/api/local-file?path=${encodeURIComponent(outside)}`, fixture.frameRoot), "");
  assert.equal(resolveTrustedHumanVideoCatalogFrameUri(`/api/local-file?path=${encodeURIComponent(textFile)}`, fixture.frameRoot), "");
  assert.equal(resolveTrustedHumanVideoCatalogFrameUri("/api/local-file?path=relative.jpg", fixture.frameRoot), "");
  assert.equal(resolveTrustedHumanVideoCatalogFrameUri("/media/frame.jpg", fixture.frameRoot), "");
});

function videoRecord(id, overrides = {}) {
  return {
    id,
    name: `${id}.mp4`,
    mediaType: "video",
    uri: "",
    sourcePath: "",
    contentFingerprint: "",
    asset: null,
    ...overrides,
  };
}

async function createFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "human-frame-catalog-"));
  const frameRoot = path.join(root, "frames");
  const outsideRoot = path.join(root, "outside-frames");
  const databasePath = path.join(root, "catalog.sqlite3");
  await mkdir(frameRoot, { recursive: true });
  await mkdir(outsideRoot, { recursive: true });
  const hashA = "a".repeat(64);
  const hashB = "b".repeat(64);
  const uriA = "hapa://catalog/video-a";
  const uriB = "hapa://catalog/video-b";
  const framesA = await createFrames(frameRoot, "video-a");
  const framesB = await createFrames(options.unsafeSecondVideo ? outsideRoot : frameRoot, "video-b");
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE videos (
      media_id TEXT PRIMARY KEY,
      sha256 TEXT NOT NULL,
      canonical_path TEXT,
      aliases_json TEXT NOT NULL,
      uris_json TEXT NOT NULL
    );
    CREATE TABLE frames (
      frame_id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      marker TEXT NOT NULL,
      at_seconds REAL NOT NULL,
      path TEXT NOT NULL
    );
  `);
  const insertVideo = database.prepare("INSERT INTO videos (media_id, sha256, canonical_path, aliases_json, uris_json) VALUES (?, ?, ?, ?, ?)");
  const insertFrame = database.prepare("INSERT INTO frames (frame_id, media_id, marker, at_seconds, path) VALUES (?, ?, ?, ?, ?)");
  insertVideo.run("video-a", hashA, "/catalog/a/shared-name.mp4", JSON.stringify(["/alias/a.mp4"]), JSON.stringify([uriA]));
  insertVideo.run("video-b", hashB, "/catalog/b/video-b.mp4", JSON.stringify(["/alias/b.mp4"]), JSON.stringify([uriB]));
  for (const [mediaId, frames] of [["video-a", framesA], ["video-b", framesB]]) {
    for (const [index, marker] of ["first", "mid", "last"].entries()) {
      insertFrame.run(`${mediaId}-${marker}`, mediaId, marker, index * 2.5, frames[marker]);
    }
  }
  database.close();
  return { root, databasePath, frameRoot, hashA, hashB, uriA, uriB, framesA, framesB };
}

async function createFrames(root, mediaId) {
  const directory = path.join(root, mediaId);
  await mkdir(directory, { recursive: true });
  const result = {};
  for (const marker of ["first", "mid", "last"]) {
    const filePath = path.join(directory, `${marker}.jpg`);
    await writeFile(filePath, `${mediaId}:${marker}`);
    result[marker] = filePath;
  }
  return result;
}
