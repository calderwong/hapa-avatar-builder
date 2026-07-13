import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeSafetyFinding, runVisualMediaSafetyProbe } from "../src/domain/visual-media-safety.js";

test("known black, frozen, corrupt, portrait, and flash fixtures fail without false passes", () => {
  const report = runVisualMediaSafetyProbe({
    exportId: "bad-fixtures",
    blackSpans: [{ startSeconds: 1, endSeconds: 2, durationSeconds: 1, graphNodeId: "shot:black", sourceAsset: "black.mp4" }],
    frozenSpans: [{ startSeconds: 3, endSeconds: 6, durationSeconds: 3, graphNodeId: "shot:frozen", sourceAsset: "frozen.mp4" }],
    media: [
      { status: "corrupt", atSeconds: 7, graphNodeId: "shot:corrupt", sourceAsset: "corrupt.mp4" },
      { status: "ready", orientationMismatch: true, blackMatExposure: true, atSeconds: 8, graphNodeId: "shot:portrait", sourceAsset: "portrait.jpg" },
    ],
    flashes: [0, 0.2, 0.4, 0.6].map((atSeconds) => ({ atSeconds, luminanceDelta: 0.18, frameArea: 0.2, graphNodeId: "effect:flash" })),
  });
  assert.equal(report.ok, false);
  assert.equal(report.approval, "blocked-hard-failure");
  for (const code of ["black-frame-span", "frozen-texture-span", "media-corrupt", "orientation-or-black-mat", "unsafe-flash-density"]) assert.ok(report.findings.some((row) => row.code === code), code);
  assert.ok(report.findings.every((row) => Number.isFinite(row.atSeconds) && row.graphNodeId));
});

test("soft warnings require a saved operator rationale", () => {
  const input = { exportId: "soft", lyrics: [{ atSeconds: 2, endSeconds: 4, contrastRatio: 3.8, graphNodeId: "lyric:1", sourceAsset: "show-graph.json" }] };
  const blocked = runVisualMediaSafetyProbe(input);
  assert.equal(blocked.approval, "blocked-unacknowledged-warning");
  const receipt = acknowledgeSafetyFinding({ findingId: blocked.findings[0].id, operator: "Calder", rationale: "Reviewed against intentional low-light bridge treatment", acknowledgedAt: "2026-07-11T07:48:00Z" });
  const approved = runVisualMediaSafetyProbe({ ...input, acknowledgements: [receipt] });
  assert.equal(approved.ok, true);
  assert.equal(approved.summary.acknowledgedSoft, 1);
});

test("known-good export evidence passes", () => {
  const report = runVisualMediaSafetyProbe({
    exportId: "good",
    blackSpans: [], frozenSpans: [],
    media: [{ status: "ready", orientationMismatch: false, blackMatExposure: false, atSeconds: 0, graphNodeId: "shot:1", sourceAsset: "ready.mp4" }],
    lyrics: [{ atSeconds: 1, endSeconds: 2, contrastRatio: 7.2, occludesSubject: false, graphNodeId: "lyric:1", sourceAsset: "show.json" }],
    flashes: [0, 0.4, 0.8].map((atSeconds) => ({ atSeconds, luminanceDelta: 0.18, frameArea: 0.2, graphNodeId: "effect:safe" })),
    camera: [{ atSeconds: 0, velocityPerSecond: 0.4, zoom: 1.12, blackMatExposure: false, graphNodeId: "camera:1" }],
    audio: [{ atSeconds: 0, truePeakDbTP: -1.2, clippedSamples: 0, graphNodeId: "audio:master" }],
    telemetry: [{ atSeconds: 0, stale: false, durationMismatchSeconds: 0, sourceHashMismatch: false, graphNodeId: "telemetry:1" }],
  });
  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
});
