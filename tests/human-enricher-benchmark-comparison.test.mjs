import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHumanVideoBenchmarkComparison } from "../src/domain/human-video-benchmark-comparison.js";

function fixtures() {
  const perVideo = [];
  const jobs = [];
  const videos = [];
  const catalogVideos = [];
  for (let index = 1; index <= 40; index += 1) {
    const videoKey = `fingerprint:video-${index}`;
    const receiptId = `optical-receipt:${index}`;
    perVideo.push({ ordinal: index, videoKey, receiptId, optical: { accepted: true, elapsedMs: 1000, packetBytes: 200, imageBytes: 300, outputBytes: 400 }, actualProviderUsage: { available: false } });
    jobs.push({ id: `job:${index}`, ordinal: index, videoKey, status: "accepted", acceptedReceiptId: receiptId, packetPath: `/private/raw/${index}.json` });
    videos.push({ ordinal: index, pass: "optical", authority: "pending-human", description: `Benchmark ${index}`, quality: { value: 4, explanation: "Visible quality" }, signalOutcome: "observed", visibleSignals: ["blue light"], strengths: ["clear"], issues: [], uncertainty: "three frames only", frames: frameRows() });
    catalogVideos.push({ humanVideoKey: videoKey, id: `video-${index}`, name: `Video ${index}.mp4`, uri: `/media/video-${index}.mp4`, thumbnailUri: `/media/video-${index}.jpg`, sourcePath: `/private/source/${index}.mp4`, agentReview: { id: `review:${index}`, status: "pending-human", reviewer: { model: "gpt-5.6-terra", reasoningEffort: "medium", opticalInspectionConfirmed: true, schedulerReceipt: { campaignId: "production-optical", submittedAt: "2026-08-08T10:00:00.000Z" } }, proposal: { description: `Production ${index}`, quality: { value: 3, explanation: "Prior quality" }, referenceSignals: ["warm light"] }, evidence: { frames: frameRows() } } });
  }
  return {
    report: { schemaVersion: "hapa.human-video-optical-benchmark-report.v1", counts: { selected: 40, accepted: 40 }, authority: { durableTruthModified: false, proposalStatus: "pending-human", benchmarkIsHumanValidation: false }, productionStores: { unchanged: true }, passes: { optical: { totalDirectFrames: 120 }, reference: { executed: false, stopReason: "not-run-before-overall-batch-stop" } }, perVideo, startedAt: "2026-08-08T23:14:16.855Z", completedAt: "2026-08-08T23:31:29.217Z", stopReason: "completed-40-optical-before-deadline", withinDeadline: true },
    dispatcher: { schemaVersion: "hapa.human-video-optical-benchmark-dispatcher.v1", jobs },
    acceptedOutput: { videos },
    catalogVideos,
  };
}

function frameRows() {
  return ["first", "mid", "last"].map((role) => ({ role, imagePath: `/private/${role}.jpg`, sha256: `sha256:${role}`, observation: `${role} visible frame`, palette: { colors: [{ hex: "#112233", label: "blue", prevalence: "dominant", explanation: "background" }], uncertainty: "visual estimate" } }));
}

test("comparison joins exactly 40 accepted benchmark receipts to catalog names without exposing private evidence bindings", () => {
  const projection = createHumanVideoBenchmarkComparison({ ...fixtures(), runId: "human-enricher-mechanical-benchmark", generatedAt: "2026-08-09T00:00:00.000Z" });
  assert.equal(projection.videos.length, 40);
  assert.equal(projection.run.id, "human-enricher-mechanical-benchmark");
  assert.equal(projection.run.referencePass.executed, false);
  assert.equal(projection.authority.mode, "read-only-comparison");
  assert.equal(projection.authority.importAvailable, false);
  assert.equal(projection.videos[0].video.name, "Video 1.mp4");
  assert.equal(projection.videos[0].existingProductionReview.description, "Production 1");
  assert.equal(projection.videos[0].benchmarkOpticalOutput.description, "Benchmark 1");
  assert.equal(projection.videos[0].benchmarkOpticalOutput.referencePass, "not-run");
  assert.doesNotMatch(JSON.stringify(projection), /private\/|sha256:first|sourcePath|packetPath/);
});

test("comparison fails closed for incomplete runs, modified production authority, or broken receipt joins", () => {
  const incomplete = fixtures(); incomplete.report.counts.accepted = 39;
  assert.throws(() => createHumanVideoBenchmarkComparison(incomplete), (error) => error.code === "benchmark_report_not_complete");
  const modified = fixtures(); modified.report.productionStores.unchanged = false;
  assert.throws(() => createHumanVideoBenchmarkComparison(modified), (error) => error.code === "benchmark_authority_boundary_invalid");
  const unbound = fixtures(); unbound.dispatcher.jobs[0].acceptedReceiptId = "wrong";
  assert.throws(() => createHumanVideoBenchmarkComparison(unbound), (error) => error.code === "benchmark_receipt_binding_invalid");
});

test("comparison UI is a GET-only route with explicit pending-human and reference-pass boundaries", async () => {
  const [component, app, api] = await Promise.all([
    readFile(new URL("../src/components/HumanEnricherBenchmarkComparisonView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(app, /get\("compare"\) === "optical-benchmark"/);
  assert.match(component, /Existing production review/);
  assert.match(component, /Benchmark optical output/);
  assert.match(component, /Benchmark pending human/);
  assert.match(component, /Reference pass not run/);
  assert.match(api, /\/api\/human-enricher\/benchmark-comparison" && req\.method === "GET"/);
  assert.doesNotMatch(component, /method:\s*["'](?:POST|PUT|PATCH|DELETE)/);
});
