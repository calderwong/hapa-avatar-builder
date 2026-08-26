import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(path.join(root, "scripts", "sync-dear-papa-lyric-timings.mjs"), "utf8");

test("canonical playlist timing is checked before project-local timing", () => {
  const canonical = source.indexOf('path.join(PLAYLIST_ROOT, "lyric_timings", `${song.id}.json`)');
  const declared = source.indexOf("song.lyricTimingPath");
  const local = source.indexOf('path.join(song.localDir, "lyric-timing.json")');
  assert.ok(canonical >= 0 && canonical < declared && declared < local);
});

test("canonical playlist manifest overrides the alignment snapshot", () => {
  const alignment = source.indexOf("...(echoAlignmentManifest.songs || [])");
  const canonical = source.indexOf("...(manifest.songs || [])");
  assert.ok(alignment >= 0 && alignment < canonical);
});
