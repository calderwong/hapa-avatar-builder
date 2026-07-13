import test from "node:test";
import assert from "node:assert/strict";
import { inspectOfflineManifest, simulateAlbumGraphPass, simulateBoundedSetPass, validateAlbumGraphEntry } from "../src/domain/showcase-soak-rehearsal.js";

test("offline inspection names every missing and corrupt dependency", () => {
  const manifest = { artifacts: [{ path: "a", sha256: "good" }], offlineReplay: { requiredFiles: ["a", "b"] } };
  const result = inspectOfflineManifest(manifest, [{ path: "a", sha256: "bad" }]);
  assert.deepEqual(result.missing, ["b"]); assert.deepEqual(result.corrupt, ["a"]); assert.equal(result.ready, false);
});
test("album graph pass validates every cue and recovers injected failures at real shot boundaries", () => {
  const project = (id) => ({ song_id: id, song_title: id, duration: 10, stems_available: ["Drums"], timed_lyrics: [{ start: 1 }], timeline: [{ start_sec: 0, end_sec: 5, media_uri: "/a" }, { start_sec: 5, end_sec: 10, media_uri: "/b" }], visualizer_timeline: [{ start_sec: 0, end_sec: 10 }] });
  assert.equal(validateAlbumGraphEntry(project("a")).graphValid, true);
  const pass = simulateAlbumGraphPass([project("a"), project("b")], { pass: 1, failureStride: 2 });
  assert.equal(pass.completedWithoutIndefiniteStall, true); assert.equal(pass.songs, 2); assert.equal(pass.fallbackCount, 1);
});
test("failure injection recovers at a bounded safe cue and records a receipt", () => {
  const pass = simulateBoundedSetPass({ entries: [{ id: "a", durationSeconds: 10 }, { id: "b", durationSeconds: 10 }] }, [{ entryId: "a", kind: "renderer-failure", atSeconds: 2 }]);
  assert.equal(pass.completed, true); assert.equal(pass.receipts[0].fallbackAtSafeCueSeconds, 2.25); assert.equal(pass.receipts[0].receiptRecorded, true);
});
