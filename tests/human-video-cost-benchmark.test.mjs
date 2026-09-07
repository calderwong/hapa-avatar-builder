import assert from "node:assert/strict";
import test from "node:test";
import { createHumanVideoCostBenchmarkReport } from "../src/domain/human-video-cost-benchmark.js";

const configuration = { model: "gpt-5.6-terra", reasoningEffort: "low", budgetId: "human-enricher-cost-v1" };
const optical = Array.from({ length: 9 }, (_, index) => ({
  videoKey: `video:${index}`,
  videoName: `Video ${index}`,
  configuration,
  elapsedMs: 10_000 + index,
  inputPacketBytes: 1_000,
  frameBytes: 30_000,
  outputBytes: 2_000,
  outcome: "observed",
  accounting: { status: "unavailable", source: "collaboration-runtime" },
}));
const reference = Array.from({ length: 9 }, (_, index) => ({
  videoKey: `video:${index}`,
  configuration,
  packetRecords: 12,
  elapsedMs: 5_000 + index,
  inputPacketBytes: 8_000,
  outputBytes: 1_000,
  outcome: "none-supported",
  accounting: { status: "unavailable", source: "collaboration-runtime" },
}));

test("exact-nine benchmark reports verified byte/time proxies without inventing provider tokens or credits", () => {
  const snapshot = { campaign: { sha256: "same" } };
  const report = createHumanVideoCostBenchmarkReport({ optical, reference, remainingVideos: 10_000, sourceSnapshotBefore: snapshot, sourceSnapshotAfter: snapshot, generatedAt: "2026-08-08T00:00:00.000Z" });
  assert.equal(report.sampleSize, 9);
  assert.equal(report.rows.every((row) => row.optical.packetRecords === 3 && row.reference.packetRecords === 12), true);
  assert.equal(report.totals.providerReceiptsCaptured, 0);
  assert.equal(report.totals.providerReceiptsUnavailable, 18);
  assert.equal(report.forecast.inputTokens, null);
  assert.equal(report.forecast.credits, null);
  assert.equal(report.productionStateUnchanged, true);
  assert.match(report.forecast.tokenTruthBoundary, /not converted into invented tokens/i);
});

test("benchmark rejects non-nine samples, oversized packets, and mixed configurations", () => {
  assert.throws(() => createHumanVideoCostBenchmarkReport({ optical: optical.slice(0, 8), reference }), (error) => error.code === "human_video_benchmark_exact_nine_required");
  assert.throws(() => createHumanVideoCostBenchmarkReport({ optical, reference: reference.map((row, index) => index === 0 ? { ...row, packetRecords: 21 } : row) }), (error) => error.code === "human_video_benchmark_packet_size_invalid");
  assert.throws(() => createHumanVideoCostBenchmarkReport({ optical, reference: reference.map((row, index) => index === 0 ? { ...row, configuration: { ...configuration, reasoningEffort: "medium" } } : row) }), (error) => error.code === "human_video_benchmark_configuration_mismatch");
});
