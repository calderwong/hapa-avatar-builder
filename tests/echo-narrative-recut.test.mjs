import test from "node:test";
import assert from "node:assert/strict";
import { createEchoNarrativeRecut, echoRecutIdentityOptions } from "../src/domain/echo-narrative-recut.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";
import { createEchoDirectionWorkingFork, buildEchoDirectionForkRequest, echoDirectionVariantOptionLabel } from "../src/domain/echo-direction-variants.js";

const fixture = () => ({ song_id: "recut-song", song_title: "Recut", duration: 24, audio_uri: "/master.mp3", timed_lyrics: [{ start: 1, end: 3, text: "A phrase" }],
  active_direction_script_variant: { id: "parent" }, visualizer_timeline: [],
  timeline: Array.from({ length: 8 }, (_, index) => ({ start_sec: index * 3, end_sec: index * 3 + 3, media_id: `m${index}`, media_title: `Media ${index}`, media_uri: `/media/m${index}.mp4`, media_thumbnail: `/media/m${index}.png`, camera_motion: "static", camera_intensity: .1, camera_speed: 1, transition: "cut", media_contract: { type: "video", originalUri: `/media/m${index}.mp4`, dimensions: { width: 1920, height: 1080 } }, decision_evidence: { source: "original" } })),
});
const recut = (project, extra = {}) => createEchoNarrativeRecut({ project, recipeId: "performance-kinetic", seed: "A", range: { startSeconds: 4, endSeconds: 20 }, ...extra });

test("selected-range recuts preserve partial boundaries, other shots, source bytes, master and lyrics", () => {
  const project = fixture(), before = JSON.stringify(project);
  const result = recut(project);
  assert.deepEqual(result.receipt.preservedShotIndices, [0, 1, 6, 7]);
  for (const index of result.receipt.preservedShotIndices) assert.equal(JSON.stringify(result.project.timeline[index]), JSON.stringify(project.timeline[index]));
  assert.equal(result.project.audio_uri, project.audio_uri);
  assert.deepEqual(result.project.timed_lyrics, project.timed_lyrics);
  assert.deepEqual(result.project.timeline.map(s => [s.start_sec, s.end_sec]), project.timeline.map(s => [s.start_sec, s.end_sec]));
  assert.equal(JSON.stringify(project), before);
  assert.deepEqual(recut(project), result);
  assert.ok(result.project.timeline.slice(2, 6).some((s, index) => s.media_id !== project.timeline[index + 2].media_id));
});

test("actual editor graph and append-only fork payload carry the selected footage and camera", () => {
  const project = fixture();
  const result = recut(project);
  const graph = projectToEditorGraph(result.project);
  const cards = graph.tracks.find(track => track.role === "media" || track.role === "foundation").cards;
  assert.deepEqual(cards.map(card => card.media.id), result.project.timeline.map(shot => shot.media_id));
  const parent = { id: "parent", timeline: project.timeline };
  const working = createEchoDirectionWorkingFork(project, parent);
  const request = buildEchoDirectionForkRequest(working, result.project);
  assert.equal(request.parentVariantId, "parent");
  assert.match(request.title, /Performance \/ kinetic · 4–20s · A/);
  assert.match(echoDirectionVariantOptionLabel({ title: request.title, cut: { kind: "human-fork", label: "Edit 1" } }), /Performance \/ kinetic · 4–20s · A/);
  assert.deepEqual(request.timeline, result.project.timeline);
  assert.deepEqual(request.projectPatch.director_patch_lineage.narrativeRecut.range, result.receipt.range);
  assert.equal(request.requestedId, buildEchoDirectionForkRequest(working, result.project).requestedId);
});

test("locks and missing constraints remain explicit; no out-of-range or graph-edit rewrite occurs", () => {
  const project = fixture();
  project.timeline[2].locks = ["media", "camera"];
  const result = recut(project, { locks: [{ targetId: "media-casting" }] });
  assert.deepEqual(result.project.timeline.map(s => s.media_id), project.timeline.map(s => s.media_id));
  assert.equal(result.project.timeline[2].camera_motion, "static");
  project.mediaConstraints = { requiredCharacterIds: ["absent"] };
  assert.throws(() => recut(project), /required-character/);
  assert.throws(() => recut(fixture(), { range: { startSeconds: 1, endSeconds: 2 } }), /no complete shots/);
  assert.throws(() => recut(fixture(), { range: { startSeconds: 1, endSeconds: 25 } }), /within the song/);
  assert.throws(() => recut({ ...fixture(), director_show_graph_patches: [{}] }), /track patches/);
});

test("change amount chooses a deterministic bounded subset and leaves unselected shot bytes untouched", () => {
  const project = fixture();
  for (const amount of [0, .25, .5, 1]) {
    const result = recut(project, { changeAmount: amount });
    assert.equal(result.receipt.changeBudget.selectedShots, Math.ceil(4 * amount));
    assert.equal(result.receipt.changedShotIndices.length, Math.ceil(4 * amount));
    for (const index of result.receipt.preservedShotIndices) assert.equal(JSON.stringify(result.project.timeline[index]), JSON.stringify(project.timeline[index]));
    assert.deepEqual(result, recut(project, { changeAmount: amount }));
  }
  assert.throws(() => recut(project, { changeAmount: NaN }), /Change amount/);
  assert.throws(() => recut(project, { changeAmount: 1.1 }), /Change amount/);
  const locked = recut(project, { locks: [{ targetId: "media-casting" }, { targetId: "camera" }] });
  assert.equal(locked.receipt.changeBudget.selectedShots, 0);
  assert.deepEqual(locked.project.timeline, project.timeline);
});

test("declared cast and scene constrain only changed shots and survive the saved fork contract", () => {
  const project = fixture();
  project.timeline[7].cast = { characterIds: ["declared-person"], sceneIds: ["declared-scene"] };
  project.timeline[1].media_title = "Imagined Person at Imagined Scene";
  assert.deepEqual(echoRecutIdentityOptions(project), { characterIds: ["declared-person"], sceneIds: ["declared-scene"] });
  const result = recut(project, { changeAmount: .5, requiredCharacterIds: ["declared-person"], requiredSceneIds: ["declared-scene"] });
  for (const index of result.receipt.changedShotIndices) {
    assert.equal(result.project.timeline[index].media_id, "m7");
    assert.deepEqual(result.project.timeline[index].cast, project.timeline[7].cast);
    assert.deepEqual(result.project.timeline[index].mediaConstraints.requiredCharacterIds, ["declared-person"]);
  }
  const working = createEchoDirectionWorkingFork(project, { id: "parent", timeline: project.timeline });
  const request = buildEchoDirectionForkRequest(working, result.project);
  assert.deepEqual(request.projectPatch.director_patch_lineage.narrativeRecut.controls, result.receipt.controls);
  assert.throws(() => recut(project, { requiredCharacterIds: ["undeclared"] }), /required-character/);
  project.timeline[7].sourceAllowed = false;
  assert.throws(() => recut(project, { requiredCharacterIds: ["declared-person"] }), /invalid-source-policy/);
});
