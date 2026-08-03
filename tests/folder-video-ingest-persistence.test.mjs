import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createFolderVideoSourceManifestReceipt,
  folderVideoFrameIdentity,
  folderVideoHasCompleteFrameSet,
  folderVideoHasReadableCompleteFrameSet,
  folderVideoIngestPersistencePlan,
  folderVideoSourceLibraryDigest,
  folderVideoSourceStateDigest,
  validateFolderVideoSourceManifestReceipt,
} from "../scripts/ingest-folder-videos.mjs";

function frameSet(contentFingerprint) {
  return ["first", "mid", "last"].map((marker) => {
    const identity = folderVideoFrameIdentity(contentFingerprint, marker);
    return {
      ...identity,
      marker,
      uri: `/media/${identity.fileName}`,
    };
  });
}

test("folder video no-attach mode persists only the media library", () => {
  assert.deepEqual(folderVideoIngestPersistencePlan(true), {
    mediaLibrary: true,
    avatarStore: false,
    tarotStore: false,
    sceneStore: false,
  });
});

test("folder video attach mode may persist all attachment stores", () => {
  assert.deepEqual(folderVideoIngestPersistencePlan(false), {
    mediaLibrary: true,
    avatarStore: true,
    tarotStore: true,
    sceneStore: true,
  });
});

test("folder video frame files use bounded content identities while preserving stable frame IDs", () => {
  const fingerprint = "0123456789abcdef".repeat(4);
  const frame = folderVideoFrameIdentity(fingerprint, "first");

  assert.deepEqual(frame, {
    id: "folder-video-0123456789abcdef-frame-first",
    fileName: "folder-video-0123456789abcdef-frame-first.jpg",
  });
  assert.ok(Buffer.byteLength(frame.fileName, "utf8") < 255);
  assert.doesNotMatch(frame.fileName, /source-name|display-name/);
});

test("folder video frame identities reject malformed fingerprints and markers", () => {
  assert.throws(() => folderVideoFrameIdentity("not-a-fingerprint", "first"), /hexadecimal folder-video fingerprint/);
  assert.throws(() => folderVideoFrameIdentity("a".repeat(64), "poster"), /Unsupported folder-video frame marker/);
});

test("folder video frame completeness rejects partial and duplicate frame sets", () => {
  const fingerprint = "abcdef0123456789".repeat(4);
  const complete = frameSet(fingerprint);
  assert.equal(folderVideoHasCompleteFrameSet(complete, fingerprint), true);
  assert.equal(folderVideoHasCompleteFrameSet(complete.slice(1), fingerprint), false);
  assert.equal(folderVideoHasCompleteFrameSet([...complete, complete[0]], fingerprint), false);
  assert.equal(folderVideoHasCompleteFrameSet(complete.map((frame, index) => (
    index === 0 ? { ...frame, id: "wrong-content-frame" } : frame
  )), fingerprint), false);
  assert.equal(folderVideoHasCompleteFrameSet(complete.map((frame, index) => (
    index === 1 ? { ...frame, uri: "" } : frame
  )), fingerprint), false);
  assert.equal(folderVideoHasCompleteFrameSet(null), false);
});

test("folder video frame completeness requires all three readable content-bound files", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "folder-video-frames-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const fingerprint = "1234567890abcdef".repeat(4);
  const frames = frameSet(fingerprint);
  await Promise.all(frames.map((frame) => writeFile(path.join(directory, frame.fileName), "frame")));
  assert.equal(await folderVideoHasReadableCompleteFrameSet(frames, fingerprint, { mediaDirectory: directory }), true);
  await rm(path.join(directory, frames[2].fileName));
  assert.equal(await folderVideoHasReadableCompleteFrameSet(frames, fingerprint, { mediaDirectory: directory }), false);
});

test("folder video source/library receipts are complete, stable, and distinguish dry-run persistence", () => {
  const sourceRoot = path.resolve("/tmp/ref-cards-fixture");
  const entries = [
    {
      sourcePath: path.join(sourceRoot, "run2/b.mp4"),
      sourceRoots: ["ref-cards-run-1"],
      sourceRelativePaths: { "ref-cards-run-1": "run2/b.mp4" },
      sizeBytes: 22,
      mtimeMs: 2000,
      contentFingerprint: "b".repeat(64),
      mediaLibraryRecordId: "folder-video-b",
    },
    {
      sourcePath: path.join(sourceRoot, "a.mp4"),
      sourceRoots: ["ref-cards-run-1"],
      sourceRelativePaths: { "ref-cards-run-1": "a.mp4" },
      sizeBytes: 11,
      mtimeMs: 1000,
      contentFingerprint: "a".repeat(64),
      mediaLibraryRecordId: "folder-video-a",
    },
  ];
  const generatedAt = "2026-08-03T16:00:00.000Z";
  const persisted = createFolderVideoSourceManifestReceipt(entries, {
    persisted: true,
    roots: [sourceRoot],
    generatedAt,
  });
  const reversed = createFolderVideoSourceManifestReceipt([...entries].reverse(), {
    persisted: true,
    roots: [sourceRoot],
    generatedAt,
  });
  const dryRun = createFolderVideoSourceManifestReceipt(entries, {
    persisted: false,
    roots: [sourceRoot],
    generatedAt,
  });

  assert.equal(persisted.sourceStateDigest, folderVideoSourceStateDigest(entries));
  assert.equal(persisted.sourceLibraryDigest, folderVideoSourceLibraryDigest(entries));
  assert.equal(persisted.sourceLibraryDigest, reversed.sourceLibraryDigest);
  assert.equal(persisted.sourceFingerprintAlgorithm, "hapa-partial-video-v1");
  assert.equal(persisted.persisted, true);
  assert.equal(dryRun.persisted, false);
  const mediaLibrary = {
    records: entries.map((entry) => ({
      id: entry.mediaLibraryRecordId,
      sourceKind: "folder-video",
      contentFingerprint: entry.contentFingerprint,
      asset: { uri: `/media/${path.basename(entry.sourcePath)}` },
    })),
  };
  assert.equal(validateFolderVideoSourceManifestReceipt(persisted, mediaLibrary).verified, true);
  assert.throws(() => validateFolderVideoSourceManifestReceipt(persisted, { records: [] }), /unresolved source mapping/);
  assert.notEqual(
    persisted.sourceLibraryDigest,
    folderVideoSourceLibraryDigest(entries.map((entry, index) => (
      index === 0 ? { ...entry, mediaLibraryRecordId: "folder-video-other" } : entry
    ))),
  );
});
