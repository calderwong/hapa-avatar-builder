import test from "node:test";
import assert from "node:assert/strict";
import { buildEchoMusicalTimelineFromAtlas } from "../src/domain/echo-visual-score.js";
import { validateEchoLivingLightCues } from "../src/domain/echo-living-light-cues.js";
import { normalizeEchoPersistentShaderSlots } from "../src/domain/echo-persistent-shader-slots.js";
import { validateEchoScoreDustLayer, compileEchoScoreDustTrack } from "../src/domain/echo-score-dust-layer.js";
import {
  ECHO_INTEGRATED_TREATMENTS, echoIntegratedMediaPool, echoIntegratedShaderPool, planEchoIntegratedPerformance,
  projectEchoIntegratedPerformance, renderEchoIntegratedPerformanceScript,
} from "../src/domain/echo-integrated-performance.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const MASTER = "a".repeat(64);
const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const song = { songId: "song-trip", title: "Trip", durationSeconds: 204.92 };
const row = (id, group, type = "video") => ({ media_id: id, media_title: `Media ${id}`, media_uri: `/media/${id}.${type === "image" ? "png" : "mp4"}`, media_source_group: group,
  media_contract: { type }, section_id: "old", start_sec: 0, end_sec: 4, edit_reason: "old cut", camera_motion: "drift" });
const cuts = [
  { timeline: [row("m1", "harbor"), row("m2", "harbor"), row("m3", "letters", "image"), row("m4", "letters"), row("m5", "road")] },
  { timeline: [row("m1", "harbor"), row("m6", "road", "image"), { media_id: "none", media_uri: "", media_contract: { type: "generated-visualizer" } }] },
];
const mediaPool = echoIntegratedMediaPool(cuts);
const shader = (id, extra = {}) => ({ id, title: id, shaderType: "generator", audioMap: {}, ...extra });
const manifest = [
  shader("wave-a", { hmvCategory: "Waveforms Always On", audioMap: { gain: { signal: "rms", depth: 0.2 } } }),
  shader("wave-b", { hmvCategory: "Waveforms Always On", audioMap: { hue: { signal: "mid", depth: 0.2 } } }),
  shader("pulse-1", { audioMap: { zoom: { signal: "beat", depth: 0.2 }, rate: { signal: "bass", depth: 0.2 } } }),
  shader("pulse-2", { audioMap: { scale: { signal: "bass", depth: 0.2 } } }),
  shader("calm-1", { audioMap: { rate: { signal: "mid", depth: 0.2 } } }),
  shader("calm-2", { audioMap: { hue: { signal: "rms", depth: 0.2 } } }),
  shader("unready", { audioMap: { rate: { signal: "beat" } } }),
  { ...shader("a-filter"), shaderType: "filter" },
];
const shaderPool = echoIntegratedShaderPool(manifest, (s) => s.id !== "unready");
const livingLight = { journeyRef: { journeyId: "ll-journey:trip", revisionId: "ll-journey-r:1" } };
const lines = [
  { text: "Join a Navy, Sea the World,", start: 12, end: 15, voice: "lead" },
  { text: "I Herd the Others,", start: 16, end: 18, voice: "lead", voices: [{ voice: "backing" }] },
  { text: "Now we’re ruled by Wanna Bees", start: 72, end: 75, voice: "lead", alignmentReview: { needsReview: true } },
];
const plan = (treatment, extra = {}) => planEchoIntegratedPerformance({ song, timeline, mediaPool, shaderPool, livingLight, treatment, seed: "test", lyrics: { verified: true, lines, status: "verified" }, lyricAudioHash: MASTER, ...extra });

test("the media and shader pools keep only castable media and render-ready generators", () => {
  assert.deepEqual(mediaPool.map((m) => m.mediaId), ["m1", "m2", "m3", "m4", "m5", "m6"], "most-cast first; no-media rows are not media");
  assert.equal(mediaPool[0].uses, 2);
  assert.equal(mediaPool.find((m) => m.mediaId === "m3").kind, "image");
  assert.equal(mediaPool[0].fields.start_sec, undefined, "placement in the old cut is not copied");
  assert.equal(mediaPool[0].fields.camera_motion, "drift", "media framing is kept");
  assert.deepEqual(shaderPool.map((s) => s.id).sort(), ["calm-1", "calm-2", "pulse-1", "pulse-2", "wave-a", "wave-b"]);
  assert.equal(shaderPool.find((s) => s.id === "pulse-1").beatReactive, true);
});

test("every treatment plans all five layers over continuous media, deterministically", () => {
  for (const treatment of Object.keys(ECHO_INTEGRATED_TREATMENTS)) {
    const a = plan(treatment), b = plan(treatment);
    assert.deepEqual(a, b, `${treatment} is a pure function of its inputs`);
    assert.equal(a.checks.layersUsed, 5, `${treatment}: ${JSON.stringify(a.checks.layers)}`);
    assert.equal(a.checks.mediaContinuous, true);
    assert.equal(a.layers.media.at(-1).end, a.sections.at(-1).end);
    assert.ok(a.layers.media.every((s) => s.end - s.start >= 1.5), "no flash shots");
    assert.ok(a.layers.shaders.every((s) => shaderPool.some((p) => p.id === s.shaderId && !p.alwaysOn)), "only ready changing shaders");
    assert.equal(a.layers.alwaysOn.length, 3);
  }
  assert.notEqual(plan("story-arc").planId, plan("tunnel-journey").planId);
  assert.ok(plan("telemetry-pulse").layers.media.length > plan("tunnel-journey").layers.media.length, "telemetry cuts faster than the tunnel");
});

test("sections take relative roles; there is one climax and repeated motifs are returns", () => {
  const p = plan("story-arc");
  assert.equal(p.sections[0].role, "arrival");
  assert.equal(p.sections.filter((s) => s.role === "climax").length, 1);
  assert.equal(p.sections.find((s) => s.atlasSectionIds.includes("master:region:5")).role, "break");
  assert.equal(p.sections.find((s) => s.atlasSectionIds.includes("master:region:6")).role, "return");
  assert.equal(p.sections.at(-1).role, "release");
  assert.match(p.sources.qualification, /not established verse\/chorus/);
});

test("transitions follow the Atlas events, snap to downbeats and match-cut returns", () => {
  const p = plan("story-arc");
  const lift = p.transitions.find((t) => t.kind === "lift");
  assert.equal(lift.snappedTo, "downbeat");
  assert.ok(timeline.downbeats.includes(lift.at) && Math.abs(lift.at - 97.773) <= 0.4);
  assert.deepEqual([lift.grammar.media, lift.grammar.livingLight, lift.grammar.dust], ["cut", "transition", "shock"]);
  const fall = p.transitions.find((t) => t.kind === "fall");
  assert.deepEqual([fall.grammar.media, fall.grammar.dust], ["crossfade", "calm"]);
  const returning = p.sections.find((s) => s.atlasSectionIds.includes("master:region:6"));
  const firstOfGroup = p.layers.media.find((s) => p.sections.find((x) => x.id === s.sectionId).repeatGroup === returning.repeatGroup);
  const opening = p.layers.media.find((s) => s.sectionId === returning.id);
  assert.equal(opening.mediaId, firstOfGroup.mediaId, "the return opens on the media first shown with its motif");
  assert.match(opening.reason, /match cut/);
  for (let i = 1; i < p.layers.media.length; i++) assert.notEqual(p.layers.media[i].mediaId, p.layers.media[i - 1].mediaId);
});

test("Living Light cues validate, never overlap and keep song time; no Journey means no cues", () => {
  for (const treatment of Object.keys(ECHO_INTEGRATED_TREATMENTS)) {
    const cues = plan(treatment).layers.livingLight.cues;
    assert.ok(cues.length > 0, treatment);
    validateEchoLivingLightCues(cues, { songId: song.songId, durationUs: Math.round(song.durationSeconds * 1e6) });
    assert.ok(cues.every((c) => c.journeyWindow.startUs === c.window.startUs && c.window.endUs - c.window.startUs >= 2e6));
  }
  assert.ok(plan("telemetry-pulse").layers.livingLight.cues.every((c) => c.role === "transition"));
  assert.ok(plan("tunnel-journey").layers.livingLight.cues.filter((c) => c.role === "scene").length > plan("story-arc").layers.livingLight.cues.filter((c) => c.role === "scene").length);
  const short = plan("tunnel-journey", { livingLight: { ...livingLight, durationUs: 20e6 } });
  assert.equal(short.layers.livingLight.mapping, "entered-late");
  assert.ok(short.layers.livingLight.cues.every((c) => c.journeyWindow.startUs >= 0 && c.journeyWindow.endUs <= 20e6 && c.journeyWindow.endUs - c.journeyWindow.startUs === c.window.endUs - c.window.startUs),
    "a shorter Journey still plays at 1x and never past its end");
  assert.ok(plan("tunnel-journey").layers.livingLight.cues.at(-1).window.endUs % 1000 === 0, "cue times are whole milliseconds, as the compiler measures the song");
  const none = plan("story-arc", { livingLight: null });
  assert.equal(none.layers.livingLight.status, "unavailable");
  assert.equal(none.checks.layers["living-light"], false);
});

test("only written lyrics with verified timing reach the script and the dust", () => {
  const p = plan("dust-chorus");
  const verse = p.sections.find((s) => s.lyrics.length);
  assert.equal(verse.lyrics[0].text, "Join a Navy, Sea the World,", "the written line, exactly");
  assert.deepEqual(verse.voices, ["backing", "lead"]);
  assert.ok(p.sections.flatMap((s) => s.lyrics).find((l) => l.index === 2).needsReview);
  assert.ok(p.layers.scoreDust.phrases.length > 0);
  assert.ok(p.layers.scoreDust.phrases.every((ph) => ph.lineIndex !== 2), "a line flagged for review never becomes dust words");
  const unverified = plan("dust-chorus", { lyrics: { verified: false, lines, status: "unverified", reason: "no master hash" } });
  assert.ok(unverified.sections.every((s) => s.lyrics.length === 0));
  assert.equal(unverified.layers.scoreDust.phrases.length, 0);
  assert.match(renderEchoIntegratedPerformanceScript(unverified), /Lyrics: not placed \(no master hash\)/);
});

test("intents the runtime cannot execute are labelled, and Score Dust composites only through a bound layer", () => {
  const p = plan("telemetry-pulse");
  const layer = p.layers.scoreDust.layer;
  assert.equal(p.layers.scoreDust.compositeExportSupported, true);
  assert.equal(validateEchoScoreDustLayer(layer, { songId: song.songId, durationUs: Math.round(song.durationSeconds * 1e6) }), layer);
  assert.equal(layer.render, null, "a plan never claims a render it has not made");
  assert.equal(layer.binding.scoreFingerprint, p.layers.scoreDust.fingerprint);
  assert.equal(layer.source.atlasRunId, timeline.source.runId);
  assert.equal(layer.source.lyricLines, "project", "the score used verified written lyric timing");
  assert.equal(layer.window.startUs, Math.ceil(p.layers.scoreDust.visibleWindows[0].start * 1e3) * 1e3);
  assert.equal(plan("tunnel-journey").layers.scoreDust.layer.blend, "screen");
  assert.equal(plan("dust-chorus").layers.scoreDust.layer.opacity, 1);
  assert.equal(p.layers.scoreDust.renderPlacement.status, "not-used", "telemetry never lets dust lead");
  const chorus = plan("dust-chorus").layers.scoreDust.renderPlacement;
  assert.equal(chorus.status, "needs-render");
  assert.ok(chorus.shots.length > 0 && chorus.windows.length > 0, "dust-led shots are the ones a published render would replace");
  assert.ok(p.modulation.some((m) => m.id === "always-on:opacity-follows-energy" && m.executable === false));
  assert.ok(p.modulation.filter((m) => m.target === "visualizer_uniform").every((m) => m.executable === (m.source.length > 0 ? true : null)), "a shader with no audio map is not an unmet intent");
  assert.ok(p.layers.alwaysOn.filter((s) => s.enabled).length === 3, "telemetry uses a second waveform");
});

test("the projection is a saved-cut-shaped project the compiler and slots accept", () => {
  const p = plan("story-arc");
  const base = { song_id: song.songId, duration: song.durationSeconds, timeline: [{ section_id: "verse_1", section_label: "Verse 1", section_type: "verse", start_sec: 0, end_sec: 300 }],
    timed_lyrics: lines, director_show_graph: { stale: true }, hyperframe_script: "<old/>" };
  const project = projectEchoIntegratedPerformance(p, base, mediaPool);
  assert.equal(project.director_show_graph, undefined);
  assert.equal(project.hyperframe_script, undefined);
  assert.deepEqual(project.timed_lyrics, lines, "the written timed lyrics stay with the project");
  assert.equal(project.timeline.length, p.layers.media.length);
  assert.equal(project.timeline[0].media_uri, mediaPool.find((m) => m.mediaId === p.layers.media[0].mediaId).fields.media_uri);
  assert.equal(project.timeline[0].section_type, "verse", "the base project's section labels are reused");
  assert.equal(normalizeEchoPersistentShaderSlots(project).filter((s) => s.enabled).length, 2);
  validateEchoLivingLightCues(project.living_light_cues, { songId: song.songId });
  assert.equal(project.integrated_performance.scoreDust.compositeExportSupported, true);
  assert.equal(project.integrated_performance.scoreDust.layerStatus, "render-required");
  assert.deepEqual(project.score_dust_layer, p.layers.scoreDust.layer);
  assert.equal(compileEchoScoreDustTrack(project).status, "render-required");
  assert.throws(() => projectEchoIntegratedPerformance(p, base, mediaPool.slice(0, 1)), /not in the pool/);
  const wrapped = projectEchoIntegratedPerformance(p, { music_video_project: base }, mediaPool);
  assert.equal(wrapped.music_video_project, undefined, "a wrapped Director project file projects its body");
  assert.deepEqual(wrapped.timeline, project.timeline);
});

test("the director script tells the story section by section", () => {
  const text = renderEchoIntegratedPerformanceScript(plan("story-arc"), { compiled: { tracks: 4, modulationBindings: 7, livingLight: true, mediaPreflight: "ok" } });
  assert.match(text, /^# Trip — Story Arc/);
  assert.match(text, /> Join a Navy, Sea the World,/);
  assert.match(text, /\*\*In:\*\* lift at /);
  assert.match(text, /✗ not executable yet: always-on:opacity-follows-energy/);
  assert.match(text, /7 executable modulation bindings/);
});

test("plans refuse missing telemetry, media or shaders", () => {
  assert.throws(() => plan("story-arc", { treatment: "nope" }), /Unknown treatment/);
  assert.throws(() => plan("story-arc", { timeline: {} }), /musical timeline/);
  assert.throws(() => plan("story-arc", { mediaPool: [] }), /no cast media/);
  assert.throws(() => plan("story-arc", { shaderPool: shaderPool.filter((s) => s.alwaysOn) }), /final-render-ready/);
});
