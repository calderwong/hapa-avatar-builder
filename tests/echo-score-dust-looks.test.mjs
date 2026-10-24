import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createAudioAtlas } from "../server/audio-atlas.mjs";
import { handleAudioAtlas } from "../server/audio-atlas-routes.mjs";
import { applyDustLook, extractDustLook, validateDustLook, BUILTIN_DUST_LOOKS } from "../src/domain/echo-score-dust-looks.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback, placeCameraMove, validateEchoScoreDirection, validateEchoVisualScore } from "../src/domain/echo-visual-score.js";
import { createScoreDustPerformance } from "../src/domain/echo-score-dust-performance.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());

test("a look carries the reusable part of a direction and leaves song-bound fields alone", () => {
  const group = timeline.sections[1].repeatGroup;
  const songA = { colour: { preset: "sunset", mode: "speed" }, stemResponses: { drums: 0.4 }, eventResponses: { lift: "gather" }, baseHue: 200,
    families: { [group]: "jellyfish" }, cameraMoves: [{ id: "c1", mode: "orbit", start: 10, end: 20 }], playSettings: { seed: 9, pulse: "half", flashLimitPerSecond: 1 } };
  const look = extractDustLook(songA);
  assert.deepEqual(Object.keys(look).sort(), ["baseHue", "colour", "eventResponses", "playSettings", "stemResponses"]);
  assert.deepEqual(look.playSettings, { flashLimitPerSecond: 1 });
  assert.equal(validateDustLook({ name: "Dusk", look }).ok, true);
  const songB = { families: { x: "ring" }, colour: { preset: "neon" }, maxDensity: 0.5, playSettings: { seed: 3, pulse: "double", reducedMotion: true } };
  const applied = applyDustLook(songB, look);
  assert.deepEqual(applied.families, { x: "ring" }, "song-bound families stay");
  assert.equal(applied.colour.preset, "sunset");
  assert.equal(applied.maxDensity, undefined, "fields the look does not set are cleared, so a look applies the same everywhere");
  assert.deepEqual(applied.playSettings, { seed: 3, pulse: "double", flashLimitPerSecond: 1 });
  assert.equal(validateEchoScoreDirection(applied).ok, true);
  assert.ok(validateDustLook({ name: "x", look: { families: {} } }).errors.some((e) => e.code === "look-key"));
  assert.ok(validateDustLook({ name: "x", look: { playSettings: { seed: 1 } } }).errors.some((e) => e.code === "look-key"));
  assert.ok(validateDustLook({ name: "  ", look: {} }).errors.some((e) => e.code === "look-name"));
  assert.ok(validateDustLook({ name: "x", look: { colour: { mode: "plaid" } } }).errors.some((e) => e.code === "colour"));
  for (const row of BUILTIN_DUST_LOOKS) {
    assert.equal(validateDustLook(row).ok, true, row.name);
    const score = composeEchoVisualScore(timeline, applyDustLook({}, row.look));
    assert.equal(validateEchoVisualScore(score, { timeline }).ok, true, row.name);
  }
});

test("camera moves placed on the strip never conflict and drive the camera", () => {
  let moves = placeCameraMove([], { mode: "orbit", start: 10, end: 40 }, { duration: 204 });
  moves = placeCameraMove(moves, { mode: "hold", start: 20, end: 25 }, { duration: 204 });
  assert.deepEqual(moves.map((m) => [m.mode, m.start, m.end]), [["orbit", 10, 20], ["hold", 20, 25], ["orbit", 25, 40]]);
  moves = placeCameraMove(moves, { mode: "push", start: 5, end: 30 }, { duration: 204 });
  assert.deepEqual(moves.map((m) => [m.mode, m.start, m.end]), [["push", 5, 30], ["orbit", 30, 40]]);
  assert.equal(placeCameraMove(moves, { mode: "zoom", start: 1, end: 2 }).length, 2, "unknown modes are ignored");
  assert.equal(new Set(moves.map((m) => m.id)).size, moves.length);
  const direction = { cameraMoves: placeCameraMove([], { mode: "hold", start: 60, end: 80 }) };
  assert.equal(validateEchoScoreDirection(direction).ok, true);
  const score = composeEchoVisualScore(timeline, direction), playback = prepareEchoScorePlayback(score, timeline);
  assert.equal(validateEchoVisualScore(score, { timeline }).ok, true);
  assert.equal(playback.stateAt(70).camera.mode, "hold");
  const performance = createScoreDustPerformance({ playback, settings: { seed: 1, particleCount: 300 } });
  const { state: a } = performance.advanceTo(65), yawA = performance.camera(65, a).yaw;
  const { state: b } = performance.advanceTo(75);
  assert.ok(Math.abs(performance.camera(75, b).yaw - yawA) < 1e-9, "a hold keeps the camera still");
});

test("named looks are an append-only ledger shared by every Song, via API and module", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-score-dust-looks-"));
  const atlas = createAudioAtlas({ root });
  const route = async (method, body) => {
    let sent = null;
    await handleAudioAtlas({ req: { method, headers: { host: "127.0.0.1:8787" } }, res: {}, url: new URL("http://127.0.0.1:8787/api/echos/audio-atlas/visual-score-looks"), atlas, uploads: null,
      requireAdmin: () => true, readBody: async () => structuredClone(body), sendJson: (res, status, payload) => { sent = { status, payload }; }, serveLocalFile: null });
    return sent;
  };
  try {
    const initial = atlas.visualScoreLooks();
    assert.equal(initial.saved, 0);
    assert.deepEqual(initial.looks.map((l) => l.name), BUILTIN_DUST_LOOKS.map((l) => l.name));
    const saved = await route("POST", { name: "Dusk", look: { colour: { preset: "sunset" } }, note: "for slow songs" });
    assert.equal(saved.status, 201);
    assert.equal(saved.payload.look.revision, 1);
    assert.equal(atlas.saveVisualScoreLook({ name: "dusk", look: JSON.stringify({ colour: { preset: "ember" } }) }).revision, 2, "names match case-insensitively");
    atlas.saveVisualScoreLook({ name: "Club", look: { colour: { preset: "red" } } });
    const listed = (await route("GET")).payload;
    assert.equal(listed.saved, 2);
    assert.equal(listed.looks.find((l) => l.slug === "dusk").look.colour.preset, "ember");
    assert.equal(listed.looks.filter((l) => l.name === "Club").length, 1, "a saved look replaces the built-in of the same name");
    assert.equal(listed.looks.find((l) => l.name === "Club").look.colour.preset, "red");
    assert.equal((await route("POST", { name: "Dusk", look: { families: {} } })).status, 422);
    atlas.saveVisualScoreLook({ name: "Dusk", deleted: true });
    assert.equal(atlas.visualScoreLooks().looks.some((l) => l.slug === "dusk"), false);
    assert.equal(atlas.visualScoreLooks().revisions, 4, "deletion is a tombstone; history is kept");
    assert.throws(() => atlas.saveVisualScoreLook({ name: "Dusk", deleted: true }), (e) => e.statusCode === 404);
    assert.equal((await route("DELETE")).status, 405);
  } finally { await atlas.close?.(); fs.rmSync(root, { recursive: true, force: true }); }
});

test("camera move ids stay unique when moves share a start or split twice", () => {
  let moves = placeCameraMove([], { mode: "orbit", start: 10, end: 40 });
  moves = placeCameraMove(moves, { mode: "hold", start: 10, end: 15 });
  moves = placeCameraMove(moves, { mode: "push", start: 20, end: 22 });
  moves = placeCameraMove(moves, { mode: "drift", start: 30, end: 32 });
  assert.deepEqual(moves.map((m) => [m.mode, m.start, m.end]), [["hold", 10, 15], ["orbit", 15, 20], ["push", 20, 22], ["orbit", 22, 30], ["drift", 30, 32], ["orbit", 32, 40]]);
  assert.equal(new Set(moves.map((m) => m.id)).size, moves.length);
  const edited = placeCameraMove(moves, { ...moves[2], end: 25 });
  assert.equal(edited.filter((m) => m.mode === "push").length, 1, "re-placing a move by id replaces it");
  assert.equal(validateEchoScoreDirection({ cameraMoves: edited }).ok, true);
});
