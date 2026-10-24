import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createAudioAtlas } from "../server/audio-atlas.mjs";
import { handleAudioAtlas } from "../server/audio-atlas-routes.mjs";
import { selectEchoScoreDustRun } from "../src/domain/echo-visual-score.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

// A lyric-timing or transcription run: same master, no beats and no structure.
function lyricOnly(runId) {
  const { musical_structure, observations, ...rest } = atlasFixture();
  return { ...rest, run_id: runId, observations: [] };
}

function writeRun(storage, result, createdAt) {
  const bytes = Buffer.from(JSON.stringify(result));
  fs.mkdirSync(path.join(storage, "runs", result.run_id), { recursive: true });
  fs.writeFileSync(path.join(storage, "runs", result.run_id, "result.json"), bytes);
  fs.writeFileSync(path.join(storage, "jobs", `${result.run_id}.json`), JSON.stringify({ id: result.run_id, song_id: result.song_id, state: "complete", created_at: createdAt, result_sha256: createHash("sha256").update(bytes).digest("hex") }));
}

function atlasRoot(runs) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-score-dust-run-"));
  const storage = path.join(root, "data/audio-atlas");
  fs.mkdirSync(path.join(storage, "jobs"), { recursive: true });
  for (const [result, createdAt] of runs) writeRun(storage, result, createdAt);
  return { root, atlas: createAudioAtlas({ root }) };
}

test("the newest run with beats and sections wins over newer lyric-only runs", () => {
  const structured = atlasFixture();
  const { root, atlas } = atlasRoot([[structured, "2026-10-07T00:00:00Z"], [lyricOnly("run-lyrics-1"), "2026-10-10T00:00:00Z"], [lyricOnly("run-lyrics-2"), "2026-10-13T00:00:00Z"]]);
  try {
    assert.equal(atlas.jobs("song-trip")[0].id, "run-lyrics-2", "a lyric run is the newest job");
    const picked = atlas.visualScoreRun("song-trip");
    assert.equal(picked.run.id, structured.run_id);
    assert.equal(picked.basis, "beats-and-sections");
    assert.match(picked.reason, /2 newer runs measured none/);
    assert.deepEqual(picked.candidates.map((c) => [c.id, c.beats > 0, c.sections]), [["run-lyrics-2", false, false], ["run-lyrics-1", false, false], [structured.run_id, true, true]]);
    assert.equal(atlas.visualScore(picked.run.id).timeline.sections.length, 8, "the chosen run carries the song's sections");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("selection falls back honestly and stops reading at the first structured run", () => {
  const read = [];
  const shapes = { a: { beats: 0, sections: false }, b: { beats: 40, sections: true }, c: { beats: 90, sections: true } };
  const shapeOf = (id) => { read.push(id); return shapes[id]; };
  const best = selectEchoScoreDustRun([{ id: "a" }, { id: "b" }, { id: "c" }], shapeOf);
  assert.equal(best.run.id, "b");
  assert.deepEqual(read, ["a", "b"], "older runs are never read once a structured run is found");
  assert.equal(selectEchoScoreDustRun([{ id: "x", beats: 0 }, { id: "y", beats: 50, sections: false }]).basis, "beats");
  const newest = selectEchoScoreDustRun([{ id: "x", beats: 0 }, { id: "y", error: "integrity" }]);
  assert.deepEqual([newest.run.id, newest.basis], ["x", "newest"]);
  assert.match(newest.reason, /Detect beats/);
  assert.deepEqual([selectEchoScoreDustRun([{ id: "y", error: "integrity" }]).run, selectEchoScoreDustRun([]).basis], [null, "none"]);
});

test("run shapes are cached per result, and the route and CLI share the selection", async () => {
  const structured = atlasFixture();
  const { root, atlas } = atlasRoot([[structured, "2026-10-07T00:00:00Z"], [lyricOnly("run-lyrics-1"), "2026-10-10T00:00:00Z"]]);
  try {
    const realResult = fs.readFileSync;
    let reads = 0;
    fs.readFileSync = function (file, ...rest) { if (String(file).endsWith("result.json")) reads++; return realResult.call(this, file, ...rest); };
    try { atlas.visualScoreRun("song-trip"); atlas.visualScoreRun("song-trip"); } finally { fs.readFileSync = realResult; }
    assert.equal(reads, 2, "each completed result is read once");
    let sent = null;
    await handleAudioAtlas({ req: { method: "GET", headers: { host: "127.0.0.1:8787" } }, res: {}, url: new URL("http://127.0.0.1:8787/api/echos/audio-atlas/visual-score-run?songId=song-trip"), atlas, uploads: null,
      requireAdmin: () => true, readBody: async () => ({}), sendJson: (res, status, payload) => { sent = { status, payload }; }, serveLocalFile: null });
    assert.deepEqual([sent.status, sent.payload.run.id, sent.payload.schema_version], [200, structured.run_id, "hapa.audio-atlas.visual-score-run.v1"]);
    assert.throws(() => atlas.visualScoreRun(""), (e) => e.statusCode === 400);
    const cli = fs.readFileSync(new URL("../cli/audio-atlas.mjs", import.meta.url), "utf8");
    assert.match(cli, /op==='visual-score-run'\)result=atlas\.visualScoreRun\(id\)/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
