import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { createAudioAtlas } from "../server/audio-atlas.mjs";
import { handleAudioAtlas } from "../server/audio-atlas-routes.mjs";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

function atlasRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-score-dust-"));
  const storage = path.join(root, "data/audio-atlas"), result = atlasFixture();
  const bytes = Buffer.from(JSON.stringify(result));
  fs.mkdirSync(path.join(storage, "runs", result.run_id), { recursive: true });
  fs.mkdirSync(path.join(storage, "jobs"), { recursive: true });
  fs.writeFileSync(path.join(storage, "runs", result.run_id, "result.json"), bytes);
  fs.writeFileSync(path.join(storage, "jobs", `${result.run_id}.json`), JSON.stringify({ id: result.run_id, song_id: result.song_id, state: "complete", created_at: "2026-10-24T00:00:00Z", result_sha256: createHash("sha256").update(bytes).digest("hex") }));
  return { root, atlas: createAudioAtlas({ root }), runId: result.run_id, songId: result.song_id };
}

async function route(atlas, method, pathname, body) {
  const url = new URL(`http://127.0.0.1:8787/api/echos/audio-atlas${pathname}`);
  let sent = null;
  await handleAudioAtlas({ req: { method, headers: { host: "127.0.0.1:8787" } }, res: {}, url, atlas, uploads: null,
    requireAdmin: () => true, readBody: async () => structuredClone(body), sendJson: (res, status, payload) => { sent = { status, payload }; }, serveLocalFile: null });
  return sent;
}

test("saved directions append revisions, refuse stale bases and become the default score", async () => {
  const { root, atlas, runId, songId } = atlasRoot();
  try {
    assert.equal(atlas.visualScoreDirections(runId).revisions.length, 0);
    const base = atlas.visualScore(runId);
    assert.equal(base.direction_source, "default");
    const group = base.timeline.sections[1].repeatGroup;
    const saved = atlas.saveVisualScoreDirection(runId, { baseRevision: 0, direction: { families: { [group]: "jellyfish" }, playSettings: { pulse: "half" } }, note: "repeat motif reads as jellyfish" });
    assert.equal(saved.revision, 1);
    assert.equal(saved.runId, runId);
    assert.equal(saved.timelineFingerprint, base.timeline.fingerprint);
    const next = atlas.visualScore(runId);
    assert.equal(next.direction_source, "saved:r1");
    assert.equal(next.score.motifs.find((m) => m.repeatGroup === group).family, "jellyfish");
    assert.equal(next.playSettings.pulse, "half");
    assert.equal(next.score.fingerprint, saved.scoreFingerprint);
    assert.equal(atlas.visualScore(runId, { useSaved: "false" }).direction_source, "default");
    assert.throws(() => atlas.saveVisualScoreDirection(runId, { baseRevision: 0, direction: {} }), (e) => e.statusCode === 409);
    assert.throws(() => atlas.saveVisualScoreDirection(runId, { baseRevision: 1, direction: { families: { [group]: "teapot" } } }), /invalid direction/);
    assert.throws(() => atlas.saveVisualScoreDirection(runId, { baseRevision: 1, direction: { phrases: [{ text: "a", start: 1, end: 3 }, { text: "b", start: 2, end: 4 }] } }), /phrase-overlap/);
    assert.equal(atlas.saveVisualScoreDirection(runId, { baseRevision: 1, direction: { baseHue: 40 } }).revision, 2);
    const ledger = atlas.visualScoreDirections(runId);
    assert.deepEqual(ledger.revisions.map((r) => r.revision), [1, 2]);
    assert.equal(ledger.revisions[0].direction.families[group], "jellyfish", "earlier revisions are preserved");
    assert.equal(ledger.songId, songId);
  } finally { await atlas.close?.(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("routes expose the same ledger, saves and read-only projections", async () => {
  const { root, atlas, runId } = atlasRoot();
  try {
    const listed = await route(atlas, "GET", `/jobs/${runId}/visual-score-directions`);
    assert.equal(listed.status, 200);
    assert.deepEqual(listed.payload.revisions, []);
    const created = await route(atlas, "POST", `/jobs/${runId}/visual-score-directions`, { baseRevision: 0, direction: { baseHue: 120 } });
    assert.equal(created.status, 201);
    assert.equal(created.payload.revision, 1);
    const stale = await route(atlas, "POST", `/jobs/${runId}/visual-score-directions`, { baseRevision: 0, direction: {} });
    assert.equal(stale.status, 409);
    const projected = await route(atlas, "POST", `/jobs/${runId}/visual-score`, { direction: { baseHue: 10 } });
    assert.equal(projected.payload.direction_source, "request");
    const queried = await route(atlas, "GET", `/jobs/${runId}/query?op=visual-score`);
    assert.equal(queried.payload.direction_source, "saved:r1");
    assert.equal((await route(atlas, "DELETE", `/jobs/${runId}/visual-score-directions`)).status, 405);
  } finally { await atlas.close?.(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("a torn final ledger line is reported, not guessed", () => {
  const { root, atlas, runId } = atlasRoot();
  try {
    atlas.saveVisualScoreDirection(runId, { baseRevision: 0, direction: { baseHue: 5 } });
    const dir = path.join(root, "data/echo-visual-score-directions"), file = path.join(dir, fs.readdirSync(dir)[0]);
    fs.appendFileSync(file, '{"schemaVersion":"hapa.echo.visual-score-dir');
    const ledger = atlas.visualScoreDirections(runId);
    assert.equal(ledger.revisions.length, 1);
    assert.equal(ledger.ignoredLines, 1);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("an invalid or foreign saved direction never breaks reads, and saving works during an analysis lock", () => {
  const { root, atlas, runId } = atlasRoot();
  try {
    atlas.saveVisualScoreDirection(runId, { baseRevision: 0, direction: { baseHue: 5 } });
    assert.equal(atlas.visualScore(runId).direction_timeline_matches, true);
    const dir = path.join(root, "data/echo-visual-score-directions"), file = path.join(dir, fs.readdirSync(dir).find((n) => n.endsWith(".ndjson")));
    const rows = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    fs.appendFileSync(file, JSON.stringify({ ...rows[0], revision: 2, timelineFingerprint: "fnv1a:other", direction: { families: { "group-A": "teapot" } } }) + "\n");
    const read = atlas.visualScore(runId);
    assert.match(read.direction_source, /saved r2 is invalid/);
    assert.equal(read.validation.ok, true);
    // Hold the Atlas writer lock as a running analysis would.
    const atlasLock = path.join(root, "data/audio-atlas/.writer.lock");
    fs.writeFileSync(atlasLock, JSON.stringify({ schemaVersion: "hapa.audio-atlas.lock.v1", pid: process.pid, token: "f".repeat(64), createdAt: new Date().toISOString() }));
    assert.equal(atlas.saveVisualScoreDirection(runId, { baseRevision: 2, direction: { baseHue: 7 } }).revision, 3);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
