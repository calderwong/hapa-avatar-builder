import test from "node:test";
import assert from "node:assert/strict";
import { songCardCapturedFrameProgress } from "../server/song-card-local-renderer.mjs";

test("managed progress recognizes file capture as well as streaming capture", () => {
  assert.deepEqual(songCardCapturedFrameProgress("page.goto complete\n  ███░  40%  Capturing frame 3000/7754\n"), { completed: 3000, total: 7754 });
  assert.deepEqual(songCardCapturedFrameProgress("Streaming frame 30/120\rStreaming frame 120/120"), { completed: 120, total: 120 });
  assert.deepEqual(songCardCapturedFrameProgress("Capturing frame 3000/7754\nCapturing frame 3030/7754 (1 workers)"), { completed: 3030, total: 7754 });
  for (const input of ["page.goto complete", "Capturing frame 1/0", "Capturing frame 121/120", "Capturing frame 12/"]) assert.equal(songCardCapturedFrameProgress(input), null);
});
