#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile, rename } from "node:fs/promises";
import path from "node:path";

const args = Object.fromEntries(process.argv.slice(2).filter((value) => value.startsWith("--")).map((value) => { const [key, ...rest] = value.slice(2).split("="); return [key, rest.join("=")]; }));
const root = path.resolve(args.root);
const store = JSON.parse(await readFile(path.join(root, "store.json"), "utf8"));
const startedAt = args.startedAt;
const completedAt = args.completedAt;
const deadline = args.deadline;
const expectedStores = JSON.parse(process.env.BENCHMARK_EXPECTED_STORE_SNAPSHOT_JSON || "[]");
const receipts = [];
for (const index of store.receipts || []) receipts.push({ index, durable: JSON.parse(await readFile(index.receiptPath, "utf8")) });
const accepted = receipts.filter(({ index, durable }) => index.status === "accepted" && durable.status === "accepted");
const failed = receipts.filter(({ index, durable }) => index.status === "terminal-failed" && durable.status === "terminal-failed");
const perVideo = [];
for (const { index, durable } of accepted) {
  const [packetStat, rawStat] = await Promise.all([stat(index.jobId ? store.jobs.find((job) => job.id === index.jobId).packetPath : durable.job.packetPath), stat(index.rawResultPath)]);
  const frames = durable.packet.job.frames || [];
  const frameBytes = (await Promise.all(frames.map((frame) => stat(frame.imagePath)))).reduce((sum, item) => sum + item.size, 0);
  perVideo.push({
    ordinal: durable.packet.ordinal,
    videoKey: index.videoKey,
    receiptId: index.id,
    workerId: index.workerId,
    attempt: index.attempt,
    optical: {
      packetBytes: packetStat.size,
      imageBytes: frameBytes,
      outputBytes: rawStat.size,
      elapsedMs: Date.parse(index.settledAt) - Date.parse(index.claimedAt),
      frameCount: frames.length,
      accepted: true,
    },
    reference: { executed: false, packetCards: 0, packetBytes: 0, outputBytes: 0, elapsedMs: 0, status: "not-run-before-batch-stop" },
    actualProviderUsage: { available: false, inputTokens: null, outputTokens: null, totalTokens: null, credits: null },
    authority: durable.normalizedReview?.status || null,
  });
}
perVideo.sort((a, b) => a.ordinal - b.ordinal);
const afterStores = [];
for (const expected of expectedStores) {
  try {
    const bytes = await readFile(expected.path);
    afterStores.push({ path: expected.path, exists: true, bytes: bytes.byteLength, sha256: digest(bytes) });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    afterStores.push({ path: expected.path, exists: false, bytes: null, sha256: null });
  }
}
const productionStoresUnchanged = JSON.stringify(afterStores) === JSON.stringify(expectedStores);
const sum = (selector) => perVideo.reduce((total, row) => total + selector(row), 0);
const report = {
  schemaVersion: "hapa.human-video-optical-benchmark-report.v1",
  scope: "benchmark-only; no production review or enrichment writes",
  startedAt,
  completedAt,
  deadline,
  elapsedMs: Date.parse(completedAt) - Date.parse(startedAt),
  withinDeadline: Date.parse(completedAt) <= Date.parse(deadline),
  stopReason: "completed-40-optical-before-deadline",
  counts: { selected: store.jobs.length, accepted: accepted.length, queued: store.jobs.filter((job) => job.status === "queued").length, pending: store.jobs.filter((job) => job.status === "pending-receipt").length, retryable: store.jobs.filter((job) => job.status === "retryable").length, failedAttemptsPreserved: failed.length },
  passes: {
    optical: { executed: true, completed: accepted.length, exactFramesPerVideo: 3, totalDirectFrames: accepted.length * 3, packetBytes: sum((row) => row.optical.packetBytes), imageBytes: sum((row) => row.optical.imageBytes), outputBytes: sum((row) => row.optical.outputBytes), elapsedReceiptMs: sum((row) => row.optical.elapsedMs) },
    reference: { executed: false, completed: 0, candidateCardsPerVideo: 12, packetBytes: 0, outputBytes: 0, elapsedMs: 0, stopReason: "not-run-before-overall-batch-stop" },
  },
  actualProviderUsage: { available: false, inputTokens: null, outputTokens: null, totalTokens: null, credits: null, provenance: "The collaboration runtime exposed no provider-signed per-worker token, credit, or platform usage counter receipt to the dispatcher; byte counts are reported only as byte proxies." },
  productionStores: { unchanged: productionStoresUnchanged, before: expectedStores, after: afterStores },
  authority: { durableTruthModified: false, proposalStatus: "pending-human", benchmarkIsHumanValidation: false },
  failedAttempts: failed.map(({ index, durable }) => ({ receiptId: index.id, videoKey: index.videoKey, workerId: index.workerId, attempt: index.attempt, reason: index.failureReason, durableStatus: durable.status })),
  perVideo,
};
if (report.counts.accepted !== 40 || report.counts.queued || report.counts.pending || report.counts.retryable) throw new Error("Benchmark dispatcher is not terminal at 40 accepted videos.");
if (!productionStoresUnchanged) throw new Error("Production store snapshot changed during benchmark.");
await atomic(path.join(root, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
const md = `# Human Enricher bounded optical benchmark\n\n- Accepted: ${report.counts.accepted}/40\n- Elapsed: ${(report.elapsedMs / 1000).toFixed(3)} seconds\n- Deadline respected: ${report.withinDeadline}\n- Optical frames directly inspected: ${report.passes.optical.totalDirectFrames}\n- Optical packet bytes: ${report.passes.optical.packetBytes}\n- Optical image bytes: ${report.passes.optical.imageBytes}\n- Optical output bytes: ${report.passes.optical.outputBytes}\n- Reference pass: not run before the overall batch stop\n- Actual provider tokens/credits: unavailable (null; not estimated)\n- Failed attempts preserved: ${report.counts.failedAttemptsPreserved}\n- Production stores unchanged: ${report.productionStores.unchanged}\n- Authority: benchmark proposals remain pending-human\n`;
await atomic(path.join(root, "REPORT.md"), md);
console.log(JSON.stringify({ ok: true, report: path.join(root, "report.json"), summary: { counts: report.counts, elapsedMs: report.elapsedMs, withinDeadline: report.withinDeadline, passes: report.passes, productionStoresUnchanged, actualProviderUsageAvailable: false } }, null, 2));

async function atomic(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporary, contents, { encoding: "utf8", mode: 0o600 });
  await rename(temporary, file);
}
function digest(value) { return createHash("sha256").update(value).digest("hex"); }
