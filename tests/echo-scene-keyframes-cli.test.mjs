import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  assessTelemetry,
  atomicWriteJson,
  buildFourCountWindows,
  run,
} from "../scripts/echo-scene-keyframes.mjs";

function fixtureRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-scene-keyframes-"));
  for (const child of ["projects", "telemetry", "pilot", "generated", "runtime"]) fs.mkdirSync(path.join(root, child), { recursive: true });
  return root;
}

function telemetry(id = "track-1") {
  return {
    schemaVersion: "hapa.audioTelemetry.run.v1",
    songId: id,
    status: "complete",
    duration: 4.4,
    confidence: 0.8,
    summary: { tempoConfidence: 0.75 },
    timeline: { events: [0, 1, 2, 3, 4].map((start, index) => ({ type: "beat", start, confidence: 0.75, source: "fixture-grid", id: `b-${index}` })) },
  };
}

test("four-count planner groups actual beats and labels only an incomplete last group partial", () => {
  const project = { timed_lyrics: [{ text: "first lyric", start: 0.2, end: 1.2 }, { text: "last lyric", start: 4, end: 4.3 }] };
  const result = buildFourCountWindows({ songId: "song", telemetry: telemetry(), project });
  assert.equal(result.assessment.ready, true);
  assert.equal(result.windows.length, 2);
  assert.deepEqual(result.windows.map((window) => [window.kind, window.beatStart, window.beatEndExclusive, window.startSeconds, window.endSeconds]), [
    ["four-count", 0, 4, 0, 4],
    ["partial-final-count", 4, 5, 4, 4.4],
  ]);
  assert.equal(result.windows[0].lyricOverlap[0].text, "first lyric");
  assert.equal(result.windows[1].lyricOverlap[0].text, "last lyric");
});

test("telemetry without a completed source-backed beat map is blocked", () => {
  assert.deepEqual(assessTelemetry(null).state, "needs_timing_truth");
  assert.equal(assessTelemetry({ status: "running", duration: 3 }).reason, "telemetry_status_running");
  assert.equal(assessTelemetry({ status: "complete", duration: 3, timeline: { events: [] } }).reason, "usable_beat_events_missing");
});

test("audit is dry-run by default, deduplicates song ids, and apply writes only runtime state", () => {
  const root = fixtureRoot();
  const projects = path.join(root, "projects");
  const project = {
    music_video_project: {
      song_id: "song-a",
      song_title: "Song A",
      registry_track_id: "track-a",
      timed_lyrics: [{ text: "at the beat", start: 0, end: 1 }],
    },
  };
  atomicWriteJson(path.join(projects, "a-video-project.json"), project);
  atomicWriteJson(path.join(projects, "duplicate-video-project.json"), project);
  atomicWriteJson(path.join(root, "telemetry", "track-a.json"), telemetry("track-a"));
  atomicWriteJson(path.join(root, "pilot", "sample", "plan.json"), { songId: "song-a", counts: [{ id: "song-a-count-0001", ordinal: 1, prompt: { status: "ready" }, image: { status: "keyframe_exists", retrievalHandle: path.join(root, "generated", "song-a-count-0001.director-1920x1080.png") }, video: { quest: { status: "held" } } }] });
  fs.writeFileSync(path.join(root, "generated", "song-a-count-0001.png"), "native");
  fs.writeFileSync(path.join(root, "generated", "song-a-count-0001.director-1920x1080.png"), "director");

  const args = ["audit", "--projects", "projects", "--telemetry-root", "telemetry", "--runtime-root", "runtime", "--pilot-root", "pilot", "--generated-root", "generated"];
  const dry = run(args, root);
  assert.equal(dry.applied, false);
  assert.equal(dry.audit.summary.uniqueSongs, 1);
  assert.equal(dry.audit.summary.duplicateProjectFilesIgnored, 1);
  assert.equal(dry.audit.summary.exactSourceBackedFourCounts, 2);
  assert.equal(dry.audit.summary.existingKeyframes, 1);
  assert.equal(fs.existsSync(path.join(root, "runtime", "audit.json")), false);

  const applied = run([...args, "--apply"], root);
  assert.equal(applied.applied, true);
  assert.equal(fs.existsSync(path.join(root, "runtime", "audit.json")), true);
  const status = run(["status", "--runtime-root", "runtime"], root);
  assert.equal(status.persisted, true);
  assert.equal(status.audit.summary.uniqueSongs, 1);
});

test("plan apply creates held video state only and never dispatches provider work", () => {
  const root = fixtureRoot();
  atomicWriteJson(path.join(root, "projects", "a-video-project.json"), { music_video_project: { song_id: "song-a", song_title: "Song A", registry_track_id: "track-a" } });
  atomicWriteJson(path.join(root, "telemetry", "track-a.json"), telemetry("track-a"));
  const report = run(["plan", "--apply", "--projects", "projects", "--telemetry-root", "telemetry", "--runtime-root", "runtime", "--pilot-root", "pilot", "--generated-root", "generated"], root);
  assert.equal(report.applied, true);
  const plan = JSON.parse(fs.readFileSync(path.join(root, "runtime", "plan.json"), "utf8"));
  assert.equal(plan.executionPolicy.providerCallsAllowed, false);
  assert.equal(plan.noVideoGeneration, true);
  assert.equal(plan.songs[0].counts[0].state.video.executionPolicy, "hold-video-generation-v1");
});
