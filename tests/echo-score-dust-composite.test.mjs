import test from "node:test";
import assert from "node:assert/strict";
import { cutMediaAt } from "../src/components/echo-score-dust-composite.js";

const shots = [
  { id: "a", start_sec: 0, end_sec: 4, media_uri: "/media/intro.mp4", media_contract: { type: "video", runtimeUri: "/media/intro-proxy.mp4", sourceInSeconds: 10 } },
  { id: "b", start_sec: 4, end_sec: 8, media_uri: "/media/still.png" },
  { id: "c", start_sec: 8, end_sec: 9, media_id: "none" },
  { id: "d", startSeconds: 9, endSeconds: 12, media_uri: "/media/clip.webm", trim_start_sec: 2 },
];

test("the cut gives the shot under each song time and its exact source time", () => {
  assert.deepEqual(cutMediaAt(shots, 1.5), { shot: shots[0], type: "video", uri: "/media/intro-proxy.mp4", sourceSeconds: 11.5 });
  assert.equal(cutMediaAt(shots, 4).shot.id, "b", "shot ends are exclusive");
  assert.equal(cutMediaAt(shots, 5).type, "image");
  assert.equal(cutMediaAt(shots, 8.5), null, "an empty shot draws nothing");
  assert.equal(cutMediaAt(shots, 10).sourceSeconds, 3);
  assert.equal(cutMediaAt(shots, 12), null);
  assert.equal(cutMediaAt([], 1), null);
  assert.equal(cutMediaAt(null, 1), null);
});
