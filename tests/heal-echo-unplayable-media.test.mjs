import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const reportPath = path.join(root, "artifacts/echo-unplayable-media-heal/report.json");

test("unplayable-media healer reselects the four damaged cues from shot-local semantic evidence", () => {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.schemaVersion, "hapa.echo.unplayable-media-heal.v2");
  assert.equal(report.mode, "apply");
  assert.equal(report.rehealFromBackups, true);
  assert.equal(report.backupOriginalsFound, 4);
  assert.equal(report.changes.length, 4);
  const expected = new Map([
    ["dear-papa-song-check-the-logs:37", "local-card-862t5i-2025-12-25t13-43-27-card-1764826291160-862t5i-no-did-mp4-1764826292000-6030052"],
    ["dear-papa-song-eye-can-t-quit:5", "local-card-s0xksr-2025-12-25t13-42-15-card-1764826113735-s0xksr-no-did-mp4-1764826114000-2948670"],
    ["dear-papa-song-eye-can-t-quit:69", "local-010f29cc-e564-41e9-b9fc-8309dc36cefe-mp4-1780974547929-8883581"],
    ["dear-papa-song-protocol-for-the-broken:54", "local-02a67496-f982-4f23-bf0a-f54af848d584-mp4-1780974491863-3914188"]
  ]);
  for (const change of report.changes) {
    const key = `${change.songId}:${change.shotIndex}`;
    assert.equal(change.after.mediaId, expected.get(key), key);
    assert.equal(change.after.selectedBy, "semantic-casting.selected", key);
    assert.equal(change.after.selectionTier, "shot-local", key);
    assert.equal(change.after.technical.playable, true, key);
    assert.equal(change.after.technical.browserPreferred, true, key);
    assert.ok(change.after.technical.duration + 0.08 >= change.endSeconds - change.startSeconds, key);
    assert.equal(change.candidateAudit[0].accepted, true, key);
  }
});

test("all 4,477 director intervals have valid media or an explicit covering fallback", () => {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  assert.equal(report.coverage.totalIntervals, 4477);
  assert.equal(report.coverage.validVideoIntervals, 3499);
  assert.equal(report.coverage.validImageIntervals, 16);
  assert.equal(report.coverage.explicitIvfIntervals, 962);
  assert.equal(report.coverage.uncoveredIntervals, 0);
  assert.deepEqual(report.coverage.timelineInternalGaps, []);
  assert.equal(report.coverage.allIntervalsCovered, true);
  assert.equal(
    report.coverage.validVideoIntervals + report.coverage.validImageIntervals + report.coverage.explicitIvfIntervals + report.coverage.explicitPosterFallbackIntervals,
    report.coverage.totalIntervals
  );
});

test("applied project shots and playback manifests agree with the healer receipt", () => {
  const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const projectCache = new Map();
  for (const change of report.changes) {
    if (!projectCache.has(change.songId)) {
      const file = path.join(root, "data/music-video-projects", `${change.songId}-video-project.json`);
      projectCache.set(change.songId, JSON.parse(fs.readFileSync(file, "utf8")).music_video_project);
    }
    const project = projectCache.get(change.songId);
    const shot = project.timeline[change.shotIndex];
    const manifest = project.media_manifest.items[change.shotIndex];
    assert.equal(shot.media_id, change.after.mediaId);
    assert.equal(shot.media_uri, change.after.uri);
    assert.equal(shot.technical_fallback.selectedBy, "semantic-casting.selected");
    assert.equal(shot.technical_fallback.priorReplacement.mediaId, change.before.mediaId);
    const selectedTechnical = shot.technical_fallback.candidateAudit.find((candidate) => candidate.mediaId === shot.media_id)?.technical;
    assert.ok(Number(selectedTechnical?.duration || 0) + 0.08 >= Number(shot.end_sec) - Number(shot.start_sec));
    assert.ok(["verified", "pending"].includes(shot.media_contract.durationCoverage.status));
    if (shot.media_contract.proxy?.status === "ready") {
      assert.equal(shot.media_contract.durationCoverage.status, "verified");
      assert.ok(Number(shot.media_contract.actualDurationSeconds || 0) + 0.08 >= Number(shot.end_sec) - Number(shot.start_sec));
    } else {
      assert.equal(shot.media_contract.proxy?.status, "pending");
      assert.equal(shot.media_contract.runtimeUri, shot.media_uri);
    }
    assert.equal(manifest.mediaId, shot.media_id);
    assert.equal(manifest.runtimeUri, shot.media_contract.runtimeUri);
    assert.equal(project.hyperframe_script_stale, true);
  }
});
