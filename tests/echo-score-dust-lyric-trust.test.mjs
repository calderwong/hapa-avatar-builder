import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createAudioAtlas } from "../server/audio-atlas.mjs";
import { handleAudioAtlas } from "../server/audio-atlas-routes.mjs";
import { verifyScoreDustLyricTiming, SCORE_DUST_UNMEASURED_TIMING_SOURCES } from "../src/domain/echo-visual-score.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const MASTER = "a".repeat(64), STEM = "c".repeat(64), OTHER = "d".repeat(64);
const sha = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

function lyricLines() {
  const lines = [];
  let t = 12;
  for (let i = 0; i < 24; i++) {
    const text = i % 4 === 1 ? "take me to the edge" : `verse line number ${i}`;
    lines.push({ id: `line-${i}`, text, start: t, end: t + text.split(" ").length * 0.5 });
    t += 7.5;
  }
  return lines;
}

// A Director project synced from a timing file, as scripts/sync-dear-papa-lyric-timings.mjs writes it.
function project({ timingSource = "dear-papa-playlist-lyric-timing", lines = lyricLines(), timingPath = "/timing.json", activeHash = sha(lines) } = {}) {
  return { song_id: "song-trip", timed_lyrics: lines, lyric_timing_heal: { timingSource, timingPath, timingConfidence: 0.9, timingSourceSha256: activeHash, activeTimingSha256: activeHash } };
}
const verify = (p, timing, extra = {}) => verifyScoreDustLyricTiming({ project: p, timing, activeLinesSha256: p ? sha(p.timed_lyrics) : null, masterSha256: MASTER, sameMasterSourceSha256s: [MASTER, STEM], ...extra });

test("only measured timing aligned on this master, or a stem analysed with it, verifies", () => {
  const master = verify(project(), { provenance: { audioSha256: MASTER } });
  assert.deepEqual([master.status, master.basis, master.lyricAudioHash], ["verified", "master", MASTER]);
  const atlasV2 = verify(project(), { provenance: { masterAudioSha256: `sha256:${MASTER}`, audioSha256: STEM } });
  assert.deepEqual([atlasV2.status, atlasV2.basis], ["verified", "master"], "an Atlas v2 receipt names the master it was timed for");
  const stem = verify(project(), { provenance: { audioSha256: STEM } });
  assert.deepEqual([stem.status, stem.basis, stem.lyricAudioHash], ["verified", "stem", MASTER]);
  assert.equal(verify(project(), { provenance: { audioSha256: OTHER } }).status, "audio-mismatch", "another file or master revision");
});

test("synthetic, unsourced, edited or unprovable timing is refused", () => {
  for (const source of SCORE_DUST_UNMEASURED_TIMING_SOURCES) {
    const refused = verify(project({ timingSource: source }), { provenance: { audioSha256: MASTER } });
    assert.equal(refused.status, "synthetic", source);
    assert.equal(refused.lyricAudioHash, undefined);
  }
  assert.ok(SCORE_DUST_UNMEASURED_TIMING_SOURCES.includes("synthetic-weighted-lyric-heal"));
  assert.equal(verify(project({ timingSource: "" }), { provenance: { audioSha256: MASTER } }).status, "unverified");
  const edited = project();
  edited.timed_lyrics = edited.timed_lyrics.map((line, i) => (i === 3 ? { ...line, start: line.start + 1 } : line));
  assert.match(verify(edited, { provenance: { audioSha256: MASTER } }).reason, /no longer match/, "lines changed after sync");
  assert.equal(verify(project(), null).status, "unverified", "timing file unreadable");
  assert.match(verify(project(), { provenance: {} }).reason, /does not record which audio/);
  assert.equal(verify(project(), { provenance: { audioSha256: MASTER } }, { masterSha256: null }).status, "unverified");
  assert.equal(verify(null, null).status, "none");
  assert.equal(verify(project({ lines: [] }), null).status, "none");
});

function atlasRoot({ timingSource = "dear-papa-playlist-lyric-timing", alignedOn = MASTER } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-score-dust-lyrics-"));
  const storage = path.join(root, "data/audio-atlas"), result = atlasFixture();
  result.assets = [...result.assets, { ...result.assets[0], id: "stem-1", source_sha256: STEM }];
  const bytes = Buffer.from(JSON.stringify(result));
  fs.mkdirSync(path.join(storage, "runs", result.run_id), { recursive: true });
  fs.mkdirSync(path.join(storage, "jobs"), { recursive: true });
  fs.writeFileSync(path.join(storage, "runs", result.run_id, "result.json"), bytes);
  fs.writeFileSync(path.join(storage, "jobs", `${result.run_id}.json`), JSON.stringify({ id: result.run_id, song_id: result.song_id, state: "complete", created_at: "2026-10-24T00:00:00Z", result_sha256: createHash("sha256").update(bytes).digest("hex") }));
  const timingPath = path.join(root, "timing.json");
  fs.writeFileSync(timingPath, JSON.stringify({ provenance: { audioSha256: alignedOn } }));
  fs.mkdirSync(path.join(root, "data/music-video-projects"), { recursive: true });
  fs.writeFileSync(path.join(root, "data/music-video-projects/song-trip-video-project.json"), JSON.stringify({ music_video_project: project({ timingSource, timingPath }) }));
  return { root, atlas: createAudioAtlas({ root }), runId: result.run_id };
}

test("the Atlas owner serves verified lines, and lyricLines:\"project\" composes only with them", async () => {
  const verified = atlasRoot({ alignedOn: STEM });
  try {
    const lyrics = verified.atlas.visualScoreLyrics(verified.runId);
    assert.deepEqual([lyrics.status, lyrics.basis, lyrics.lyricAudioHash, lyrics.lyricLines.length], ["verified", "stem", MASTER, 24]);
    const score = verified.atlas.visualScore(verified.runId, { lyricLines: "project" });
    assert.ok(score.score.phrases.length > 0, "verified timing forms words");
    assert.deepEqual([score.lyric_timing.status, score.score.phraseSource.status], ["verified", "selected"]);
    assert.equal(verified.atlas.visualScore(verified.runId, { lyricLines: lyricLines() }).score.phrases.length, 0, "raw lines without a verified hash form no words");
    let sent = null;
    await handleAudioAtlas({ req: { method: "GET", headers: { host: "127.0.0.1:8787" } }, res: {}, url: new URL(`http://127.0.0.1:8787/api/echos/audio-atlas/jobs/${verified.runId}/visual-score-lyrics`), atlas: verified.atlas, uploads: null,
      requireAdmin: () => true, readBody: async () => ({}), sendJson: (res, status, payload) => { sent = { status, payload }; }, serveLocalFile: null });
    assert.deepEqual([sent.status, sent.payload.status, sent.payload.schema_version], [200, "verified", "hapa.audio-atlas.visual-score-lyrics.v1"]);
  } finally { fs.rmSync(verified.root, { recursive: true, force: true }); }

  const synthetic = atlasRoot({ timingSource: "synthetic-weighted-lyric-heal" });
  try {
    const lyrics = synthetic.atlas.visualScoreLyrics(synthetic.runId);
    assert.deepEqual([lyrics.status, lyrics.lyricLines, lyrics.lyricAudioHash], ["synthetic", null, null]);
    const score = synthetic.atlas.visualScore(synthetic.runId, { lyricLines: "project" });
    assert.deepEqual([score.score.phrases.length, score.lyric_timing.status], [0, "synthetic"], "synthetic timing never becomes dust words");
  } finally { fs.rmSync(synthetic.root, { recursive: true, force: true }); }

  const elsewhere = atlasRoot({ alignedOn: OTHER });
  try { assert.equal(elsewhere.atlas.visualScoreLyrics(elsewhere.runId).status, "audio-mismatch"); }
  finally { fs.rmSync(elsewhere.root, { recursive: true, force: true }); }
});
