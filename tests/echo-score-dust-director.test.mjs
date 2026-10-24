import test from "node:test";
import assert from "node:assert/strict";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, validateEchoScoreDirection, validateEchoVisualScore } from "../src/domain/echo-visual-score.js";
import { interpretDustCue, sectionRoles, suggestDustDirection, SCORE_DUST_CUE_EXAMPLES } from "../src/domain/echo-score-dust-director.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const valid = (direction) => {
  const check = validateEchoScoreDirection(direction);
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  const score = composeEchoVisualScore(timeline, direction);
  assert.equal(validateEchoVisualScore(score, { timeline }).ok, true);
  return score;
};

test("section roles are inferred from repeats and energy and say why", () => {
  const roles = sectionRoles(timeline);
  assert.equal(roles.chorus.group, "group-B");
  assert.match(roles.chorus.reason, /most energetic repeated group/);
  assert.equal(roles.intro.sectionId, timeline.sections[0].id);
  assert.equal(roles.outro.sectionId, timeline.sections.at(-1).id);
});

test("suggestions follow mood words, structure and lyrics, with reasons, and always validate", () => {
  const sad = suggestDustDirection({ timeline, mood: "melancholy, lost", tags: ["piano"] });
  assert.equal(sad.direction.colour.preset, "ice");
  assert.match(sad.reasons[0], /melancholy/);
  assert.ok(sad.direction.cameraMoves.length >= 2, "the likely chorus orbits");
  valid(sad.direction);
  const party = suggestDustDirection({ timeline, mood: "euphoric dance party" });
  assert.equal(party.direction.colour.preset, "sunset");
  assert.equal(party.direction.eventResponses.lift, "shock");
  valid(party.direction);
  const blank = suggestDustDirection({ timeline });
  assert.match(blank.reasons[0], /no mood words/);
  valid(blank.direction);
  const lines = Array.from({ length: 10 }, (_, i) => ({ text: i % 3 ? `line ${i}` : "the hook", start: 10 + i * 8, end: 13 + i * 8 }));
  const lyrical = suggestDustDirection({ timeline, mood: "dreamy", lyricLines: lines });
  assert.deepEqual([lyrical.direction.lyrics.pick, lyrical.direction.lyrics.font], ["hooks", "serif"]);
  valid(lyrical.direction);
  assert.deepEqual(suggestDustDirection({ timeline, mood: "sad" }), suggestDustDirection({ timeline, mood: "sad" }), "deterministic");
});

test("every example cue is understood and yields a valid direction", () => {
  for (const cue of SCORE_DUST_CUE_EXAMPLES) {
    const result = interpretDustCue(cue, { timeline });
    assert.equal(result.understood, true, cue);
    assert.deepEqual(result.unknown, [], `${cue}: ${result.unknown}`);
    valid(result.direction);
  }
});

test("cues edit the right fields and explain what they did", () => {
  const base = composeEchoVisualScore(timeline);
  const r = interpretDustCue("orbit during the chorus, neon colours; make the second chorus jellyfish. gather on lifts, no drums", { timeline, score: base });
  const chorus = timeline.sections.filter((s) => s.repeatGroup === "group-B");
  assert.equal(r.direction.colour.preset, "neon");
  assert.equal(r.direction.cameraMoves.filter((m) => m.mode === "orbit").length, chorus.length);
  assert.deepEqual(r.direction.sections.cues[`cue-${chorus[1].id}`], { family: "jellyfish" });
  assert.equal(r.direction.eventResponses.lift, "gather");
  assert.equal(r.direction.stemResponses.drums, 0);
  assert.ok(r.steps.some((s) => s.did.some((d) => /second likely chorus/.test(d))));
  valid(r.direction);
  const t = interpretDustCue("hold the camera from 1:10 to 1:30, split at 2:00, background #223344 gradient", { timeline });
  assert.deepEqual(t.direction.cameraMoves.map((m) => [m.mode, m.start, m.end]), [["hold", 70, 90]]);
  assert.deepEqual(t.direction.sections.split, [120]);
  assert.deepEqual(t.direction.background, { kind: "gradient", colour: "#223344", colour2: "#020409", shape: "radial" });
  valid(t.direction);
  const keep = interpretDustCue("no words", { timeline, direction: { families: { "group-A": "ring" } } });
  assert.deepEqual(keep.direction.families, { "group-A": "ring" }, "cues edit on top of the current direction");
});

test("unclear cues are reported, not guessed", () => {
  const r = interpretDustCue("make it jellyfish, play kazoo", { timeline });
  assert.equal(r.understood, false);
  assert.equal(r.unknown.length, 2);
  assert.match(r.unknown[0], /which section/);
  assert.deepEqual(r.direction, {});
});

test("the API suggests from the Song card's mood and interprets cues on the saved direction", async () => {
  const fs = await import("node:fs"), os = await import("node:os"), path = await import("node:path"), { createHash } = await import("node:crypto");
  const { createAudioAtlas } = await import("../server/audio-atlas.mjs");
  const { handleAudioAtlas } = await import("../server/audio-atlas-routes.mjs");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-score-dust-director-"));
  const storage = path.join(root, "data/audio-atlas"), result = atlasFixture(), bytes = Buffer.from(JSON.stringify(result));
  fs.mkdirSync(path.join(storage, "runs", result.run_id), { recursive: true }); fs.mkdirSync(path.join(storage, "jobs"), { recursive: true });
  fs.writeFileSync(path.join(storage, "runs", result.run_id, "result.json"), bytes);
  fs.writeFileSync(path.join(storage, "jobs", `${result.run_id}.json`), JSON.stringify({ id: result.run_id, song_id: result.song_id, state: "complete", created_at: "2026-10-24T00:00:00Z", result_sha256: createHash("sha256").update(bytes).digest("hex") }));
  fs.writeFileSync(path.join(root, "data/hapa-songs-store.json"), JSON.stringify({ songs: [{ id: "card", songId: result.song_id, title: "Trip", mood: "angry and fierce", tags: [] }] }));
  const atlas = createAudioAtlas({ root });
  const route = async (action, body) => {
    let sent = null;
    await handleAudioAtlas({ req: { method: "POST", headers: { host: "127.0.0.1:8787" } }, res: {}, url: new URL(`http://127.0.0.1:8787/api/echos/audio-atlas/jobs/${result.run_id}/${action}`), atlas, uploads: null,
      requireAdmin: () => true, readBody: async () => structuredClone(body), sendJson: (res, status, payload) => { sent = { status, payload }; }, serveLocalFile: null });
    return sent;
  };
  try {
    const suggested = await route("visual-score-suggest", {});
    assert.equal(suggested.status, 200);
    assert.equal(suggested.payload.direction.colour.preset, "ember", "mood comes from the Song card");
    assert.equal(suggested.payload.validation.ok, true);
    atlas.saveVisualScoreDirection(result.run_id, { baseRevision: 0, direction: { families: { "group-A": "ring" } } });
    const cue = await route("visual-score-cue", { text: "neon colours" });
    assert.deepEqual([cue.payload.direction.colour.preset, cue.payload.direction.families["group-A"]], ["neon", "ring"], "applied on top of the saved direction");
    assert.equal(cue.payload.validation.ok, true);
    assert.equal((await route("visual-score-cue", { text: "" })).status, 422);
    assert.equal(atlas.visualScoreDirections(result.run_id).revisions.length, 1, "nothing is saved by suggestions or cues");
  } finally { await atlas.close?.(); fs.rmSync(root, { recursive: true, force: true }); }
});
