import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const projectDir = path.resolve("data/music-video-projects");
const files = fs.readdirSync(projectDir).filter((file) => file.endsWith("-video-project.json"));
const songbook = JSON.parse(fs.readFileSync("data/dear-papa-songbook.json", "utf8"));

test("all Echo plans expose unmeasured critic truth and evidence-bearing shot decisions", () => {
  assert.equal(files.length, songbook.songCards.length);
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(projectDir, file), "utf8"));
    const project = payload.music_video_project || payload;
    assert.equal(project.critic_assessment?.status, "unmeasured", file);
    assert.ok(Object.values(project.critic_scores || {}).every((value) => value === null), `${file} has optimistic critic numbers`);
    for (const shot of project.timeline || []) {
      assert.equal(shot.confidence, null, `${file} retains fabricated shot confidence`);
      assert.doesNotMatch(String(shot.edit_reason || ""), /matching (red|blue|green) mood/i, file);
      assert.equal(shot.decision_evidence?.schemaVersion, "hapa.echo.shot-decision-evidence.v2", file);
      assert.equal(shot.decision_evidence?.scoreComponents?.semanticMusicMatch?.value, null, file);
      assert.ok(Array.isArray(shot.decision_evidence?.evidence) && shot.decision_evidence.evidence.length >= 2, file);
      assert.ok(Array.isArray(shot.decision_evidence?.rejectedAlternatives), file);
      assert.equal(shot.decision_evidence?.confidence?.value, null, file);
    }
  }
});

test("generator cannot derive critic quality or mood claims from hashes", () => {
  const source = fs.readFileSync("scripts/generate-music-video-plans.mjs", "utf8");
  assert.doesNotMatch(source, /song_structure_alignment:\s*85\s*\+/);
  assert.doesNotMatch(source, /emotional_arc:\s*80\s*\+/);
  assert.doesNotMatch(source, /matching \$\{perspective\} mood/);
  assert.match(source, /semanticMusicMatch:\s*\{ value: null, basis: "unmeasured" \}/);
});
