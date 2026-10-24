import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { scoreDustShotPlacements } from "../src/domain/echo-score-dust-cut.js";
import { cutMediaAt } from "../src/components/echo-score-dust-composite.js";
import { hyperFramesMediaSourceCandidates } from "../src/domain/hyperframes-show-compiler.js";
import { createPreviewRecordingStore } from "../server/preview-recording-store.mjs";
import { publishScoreDustRender } from "../server/echo-score-dust-loops.mjs";

const timeline = [
  { start_sec: 0, end_sec: 10, media_id: "intro", media_uri: "/media/intro.mp4", characterIds: ["ava"], media_contract: { type: "video", runtimeUri: "/media/intro.mp4" } },
  { start_sec: 10, end_sec: 20, media_id: "verse", media_uri: "/media/verse.mp4", semantic_casting: { who: "x" } },
  { start_sec: 20, end_sec: 30, media_id: "chorus", media_uri: "/media/chorus.mp4", mediaConstraints: { requiredCharacterIds: ["ava"] } },
  { start_sec: 30, end_sec: 45, media_id: "bridge", media_uri: "/media/bridge.mp4" },
];
const render = { recordingId: "abcdef12-render", uri: "/media/score-dust-renders/abcdef12-render.webm", sha256: "f".repeat(64), width: 1280, height: 720, startSeconds: 8, durationSeconds: 32, receipt: { scoreFingerprint: "fnv1a:1", seed: 3, background: "cut" } };

test("a render replaces only the shots it fully covers, with exact source points and provenance", () => {
  const { placements, skipped } = scoreDustShotPlacements(timeline, render);
  assert.deepEqual(placements.map((p) => p.index), [1]);
  assert.deepEqual(skipped, [{ index: 0, reason: "only partly covered by the render" }, { index: 2, reason: "this shot requires specific characters or scenes" }, { index: 3, reason: "only partly covered by the render" }]);
  const shot = { ...timeline[1], ...placements[0].patch };
  assert.deepEqual([shot.source_in_seconds, shot.source_out_seconds, shot.media_contract.sourceInSeconds, shot.media_contract.sourceOutSeconds], [2, 12, 2, 12]);
  assert.equal(shot.semantic_casting, undefined, "the replaced media's casting claims are cleared");
  assert.equal(JSON.parse(JSON.stringify(shot)).characterIds, undefined);
  assert.equal(shot.provenance.replacedMediaId, "verse");
  assert.equal(shot.media_contract.contentHash, `sha256:${"f".repeat(64)}`);
  // The same source point is what the export compositor and preview read.
  assert.deepEqual(cutMediaAt([shot], 15).sourceSeconds, 7);
  assert.equal(cutMediaAt([shot], 15).uri, render.uri);
  // The final-render compiler resolves /media/ URIs to the Builder's media root.
  const candidates = hyperFramesMediaSourceCandidates({ source: { runtimeUri: render.uri } }, { root: "/repo" });
  assert.ok(candidates.includes(path.join("/repo", "data", "media/score-dust-renders/abcdef12-render.webm")));
  const loop = scoreDustShotPlacements([{ start_sec: 30, end_sec: 39 }], { ...render, receipt: { loopBridgeSeconds: 1.5 } });
  assert.equal(loop.skipped[0].reason, "falls in the loop bridge, which blends back to the start");
});

test("publishing copies the recording into the public media root and reports its geometry", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-score-dust-render-"));
  try {
    const mediaDir = path.join(root, "media"), recordings = createPreviewRecordingStore({ mediaRoot: path.join(mediaDir, "echo-preview-recordings") });
    const bytes = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(512, 1)]);
    const record = await recordings.add({ buffer: bytes, mimeType: "video/webm", metadata: { songId: "song-trip", width: "1280", height: "720", durationMs: "32000" } });
    const value = await publishScoreDustRender({ recordings, mediaDir }, { recordingId: record.id });
    assert.equal(value.uri, `/media/score-dust-renders/${record.id}.webm`);
    assert.deepEqual([value.width, value.height, value.durationSeconds, value.sizeBytes], [1280, 720, 32, bytes.length]);
    assert.deepEqual(fs.readFileSync(path.join(mediaDir, "score-dust-renders", `${record.id}.webm`)), bytes);
    await assert.rejects(publishScoreDustRender({ recordings, mediaDir }, { recordingId: "../x" }), (e) => e.statusCode === 400);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
