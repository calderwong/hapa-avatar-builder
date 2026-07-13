import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { appendShotPreferenceEvent, inspectStoredShotDecision } from "../src/domain/shot-decision-inspector.js";

const project = JSON.parse(fs.readFileSync("data/music-video-projects/dear-papa-song-dear-papa-video-project.json", "utf8")).music_video_project;
test("inspector reconstructs selected shot, scores, evidence, alternatives, renderer truth, and risks from stored fields", () => {
  const inspector = inspectStoredShotDecision(project.timeline[0]);
  assert.equal(inspector.reconstructionRule, "stored-evidence-only-no-after-the-fact-generation");
  assert.equal(inspector.selectedMedia.id, project.timeline[0].media_id);
  assert.ok(inspector.lyricCanonMediaEvidence.length);
  assert.ok(inspector.alternatives.length);
  assert.equal(inspector.rendererTruth.schemaVersion, "hapa.echo.playback-media.v2");
  assert.ok(inspector.sourceSnapshotHash);
});

test("human decisions append events without rewriting source shot truth", () => {
  const shot = project.timeline[0];
  const before = JSON.stringify(shot);
  const inspector = inspectStoredShotDecision(shot);
  const result = appendShotPreferenceEvent([], { inspector, action: "pin", targetMediaId: shot.media_id, operator: "reviewer", rationale: "Keep the opening silhouette.", at: "2026-07-11T09:20:00Z" });
  assert.equal(result.events.length, 1);
  assert.equal(result.event.mutationPolicy, "append-only-source-shot-unchanged");
  assert.equal(JSON.stringify(shot), before);
});
