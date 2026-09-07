#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHumanVideoOpticalReviewFromClaim } from "../src/domain/human-video-optical-worker.js";
import { buildHumanVideoReferenceCandidatePacket, buildHumanVideoReferenceCardPacket, normalizeHumanVideoReferenceReview } from "../src/domain/human-video-reference-review.js";
import { createHumanVideoCostBenchmarkReport } from "../src/domain/human-video-cost-benchmark.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = parseArgs(process.argv.slice(2));
const sourceRoot = path.resolve(args.sourceRoot || "/Users/calderwong/Desktop/hapa-avatar-builder");
const outputRoot = path.resolve(args.output || path.join(ROOT, "work/human-enricher-cost-benchmark"));
const opticalFiles = String(args.optical || "").split(",").filter(Boolean).map((value) => path.resolve(value));
const referenceFiles = String(args.reference || "").split(",").filter(Boolean).map((value) => path.resolve(value));
const configuration = { model: "gpt-5.6-terra", reasoningEffort: "low", budgetId: "human-enricher-cost-v1" };
const budgets = {
  optical: { maxInputTokens: 40_000, maxOutputTokens: 1_800, maxTotalTokens: 41_800, maxWallClockMs: 90_000, maxReasoningEffort: "low" },
  reference: { maxInputTokens: 24_000, maxOutputTokens: 1_200, maxTotalTokens: 25_200, maxWallClockMs: 90_000, maxReasoningEffort: "low" },
};

await mkdir(outputRoot, { recursive: true });
if (!opticalFiles.length) throw new Error("Pass --optical file-a.json,file-b.json,file-c.json.");
const campaignPath = path.join(sourceRoot, "data/human-video-optical-campaign.json");
const sourceSnapshotBefore = await productionSnapshot(sourceRoot);
const campaign = JSON.parse(await readFile(campaignPath, "utf8"));
const rawOptical = (await Promise.all(opticalFiles.map(readJson))).flatMap((packet) => packet.videos || []);
if (rawOptical.length !== 9 || new Set(rawOptical.map((row) => row.videoKey)).size !== 9) throw new Error("Benchmark requires exactly nine distinct optical results.");
const jobsByKey = new Map((campaign.jobs || []).map((job) => [job.videoKey, job]));
const optical = [];
for (const row of rawOptical) {
  const videoKey = String(row.videoKey).startsWith("fingerprint:") ? row.videoKey : `fingerprint:${row.videoKey}`;
  const job = jobsByKey.get(videoKey);
  if (!job || job.status !== "submitted" || job.frames?.length !== 3) throw new Error(`Benchmark video is not a submitted exact-three job: ${videoKey}`);
  let frameBytes = 0;
  for (const frame of job.frames) {
    const bytes = await readFile(frame.imagePath);
    frameBytes += bytes.byteLength;
    const digest = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
    if (digest !== frame.sha256) throw new Error(`Frame digest changed: ${frame.imagePath}`);
  }
  const { videoKey: _videoKey, videoName: _videoName, startedAt: _startedAt, completedAt: _completedAt, elapsedSeconds: _elapsedSeconds, packetRecords: _packetRecords, accounting: _accounting, ...rawWorkerResult } = row;
  const normalized = createHumanVideoOpticalReviewFromClaim({ ...job, attempt: 1, lease: { workerId: "benchmark-optical", claimedAt: row.startedAt }, schedulerTelemetry: { status: "unavailable", source: "collaboration-runtime" } }, rawWorkerResult, {
    campaignId: "human-enricher-cost-benchmark",
    workerId: "benchmark-optical",
    model: configuration.model,
    reasoningEffort: configuration.reasoningEffort,
    parameters: { promptVersion: "human-enricher-optical-v2-compact", budget: budgets.optical },
  });
  optical.push({
    videoKey,
    videoName: row.videoName,
    normalized,
    configuration,
    elapsedMs: Math.max(0, Number(row.elapsedSeconds || 0) * 1_000),
    inputPacketBytes: Buffer.byteLength(JSON.stringify({ job: { videoKey, frames: job.frames }, instructions: "compact-optical-v2" })),
    frameBytes,
    outputBytes: Buffer.byteLength(JSON.stringify(row)),
    outcome: row.signalOutcome || "unknown",
    stoppedDueToBudget: false,
    accounting: { status: "unavailable", source: "collaboration-runtime", inputTokens: null, outputTokens: null, totalTokens: null },
  });
}

const [avatarStore, songStore, itemStore, referenceRun] = await Promise.all([
  readJson(path.join(sourceRoot, "data/avatar-store.json")),
  readJson(path.join(sourceRoot, "data/hapa-songs-store.json")),
  readJson(path.join(sourceRoot, "data/item-manager-store.json")),
  readJson(path.join(sourceRoot, "data/echo-reference-research-loop/projected-run.json")),
]);
let basePacket = buildHumanVideoReferenceCardPacket({ avatars: avatarStore.avatars || [], songs: songStore.songs || [], referenceCatalog: songStore.referenceCatalog || [], referenceCards: referenceRun.cards || [], referenceRun, itemCards: itemStore.cards || [] }, { profile: "echo-reference-cards", maxCards: 400 });
basePacket = { ...basePacket, digest: `sha256:${createHash("sha256").update(JSON.stringify(basePacket.cards)).digest("hex")}` };
const packetCache = new Map();
const referencePackets = optical.map((row) => {
  let packet = buildHumanVideoReferenceCandidatePacket(basePacket, row.normalized, { targetCards: 12 });
  const cacheKey = packet.selection.packetCacheKey;
  const cached = packetCache.get(cacheKey);
  if (cached) packet = cached;
  else packetCache.set(cacheKey, packet);
  const digest = `sha256:${createHash("sha256").update(JSON.stringify({ cards: packet.cards, selection: packet.selection })).digest("hex")}`;
  return { videoKey: row.videoKey, videoName: row.videoName, opticalReview: row.normalized, packet: { ...packet, id: `${packet.id}:${digest.slice(-16)}`, digest }, cacheStatus: cached ? "hit" : "miss", workerBoundary: "Read only optical evidence and this exact packet. Do not read Hapa/Echo stores or inspect images." };
});
await writeJson(path.join(outputRoot, "benchmark-prepared.json"), { schemaVersion: "hapa.human-video-cost-benchmark-prepared.v1", createdAt: new Date().toISOString(), configuration, budgets, sourceSnapshotBefore, optical });
await writeJson(path.join(outputRoot, "reference-packets.json"), { schemaVersion: "hapa.human-video-reference-benchmark-packets.v1", createdAt: new Date().toISOString(), configuration, budget: budgets.reference, sourceCardCount: basePacket.cardCount, packetCount: referencePackets.length, uniquePacketCount: packetCache.size, packets: referencePackets });

if (referenceFiles.length) {
  const rawReference = (await Promise.all(referenceFiles.map(readJson))).flatMap((packet) => packet.videos || []);
  const packetByVideo = new Map(referencePackets.map((row) => [row.videoKey, row]));
  const reference = rawReference.map((row) => {
    const videoKey = String(row.videoKey).startsWith("fingerprint:") ? row.videoKey : `fingerprint:${row.videoKey}`;
    const prepared = packetByVideo.get(videoKey);
    if (!prepared) throw new Error(`Reference result is outside the exact-nine sample: ${videoKey}`);
    const review = normalizeHumanVideoReferenceReview({
      ...row,
      videoKey,
      videoName: row.videoName || prepared.videoName,
      opticalReview: { id: prepared.opticalReview.id || `${videoKey}:optical:benchmark`, revision: 1, frameDigest: jobsByKey.get(videoKey).frameDigest },
      packet: prepared.packet,
      reviewer: { ...row.reviewer, model: configuration.model, reasoningEffort: configuration.reasoningEffort, budget: budgets.reference, accounting: row.accounting || { status: "unavailable", source: "collaboration-runtime", stopReason: row.proposal?.status === "none-supported" ? "no-confident-match" : "unknown" }, referenceInspectionConfirmed: true },
    }, {}, { allowedCardIds: prepared.packet.cards.map((card) => card.id), requireAccounting: true, strictOutcome: true });
    return {
      videoKey,
      videoName: row.videoName || prepared.videoName,
      review,
      configuration,
      packetRecords: prepared.packet.cardCount,
      elapsedMs: Math.max(0, Number(row.elapsedSeconds || 0) * 1_000),
      inputPacketBytes: Buffer.byteLength(JSON.stringify(prepared)),
      outputBytes: Buffer.byteLength(JSON.stringify(row)),
      outcome: review.proposal.status,
      stoppedDueToBudget: review.reviewer.accounting.budgetExceeded,
      accounting: review.reviewer.accounting,
    };
  });
  const sourceSnapshotAfter = await productionSnapshot(sourceRoot);
  const report = createHumanVideoCostBenchmarkReport({ optical, reference, remainingVideos: Number(args.remaining || 10_865), sourceSnapshotBefore, sourceSnapshotAfter });
  await writeJson(path.join(outputRoot, "benchmark-report.json"), report);
  await writeFile(path.join(outputRoot, "benchmark-report.md"), markdownReport(report), "utf8");
}

console.log(JSON.stringify({ ok: true, outputRoot, opticalVideos: optical.length, referencePackets: referencePackets.length, uniquePacketCount: packetCache.size, finalized: referenceFiles.length > 0 }, null, 2));

async function productionSnapshot(root) {
  const names = ["human-video-optical-campaign.json", "human-video-agent-reviews.json", "human-video-reference-reviews.json", "human-video-enrichments.json"];
  const rows = {};
  for (const name of names) {
    const file = path.join(root, "data", name);
    try { const bytes = await readFile(file); rows[name] = { bytes: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") }; }
    catch (error) { if (error.code !== "ENOENT") throw error; rows[name] = null; }
  }
  return rows;
}
async function readJson(file) { return JSON.parse(await readFile(file, "utf8")); }
async function writeJson(file, value) { await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8"); }
function parseArgs(values) { return Object.fromEntries(values.filter((value) => value.startsWith("--")).map((value) => { const [key, ...rest] = value.slice(2).split("="); return [key, rest.join("=") || true]; })); }
function markdownReport(report) {
  const rows = report.rows.map((row) => `| ${row.videoName} | ${row.optical.elapsedMs / 1000}s | ${row.reference.elapsedMs / 1000}s | ${row.reference.packetRecords} | ${row.optical.accounting.status} | ${row.reference.accounting.status} | ${row.reference.outcome} |`).join("\n");
  return `# Human Enricher exact-nine cost benchmark\n\nThis benchmark used nine unimported proposals. It is not human validation or durable truth.\n\n| Video | Optical | Reference | Cards | Optical tokens | Reference tokens | Reference outcome |\n| --- | ---: | ---: | ---: | --- | --- | --- |\n${rows}\n\n## Verified totals and forecast\n\n- Total measured elapsed: ${(report.totals.elapsedMs / 1000).toFixed(1)} seconds.\n- Mean combined elapsed per video: ${(report.forecast.meanElapsedMsPerVideo / 1000).toFixed(1)} seconds.\n- Serial forecast for ${report.forecast.remainingVideos.toLocaleString()} videos: ${report.forecast.serialHours} hours.\n- Verified input/frame byte proxy per video: ${report.forecast.meanMeasuredInputBytesPerVideo.toLocaleString()} bytes.\n- Verified output byte proxy per video: ${report.forecast.meanMeasuredOutputBytesPerVideo.toLocaleString()} bytes.\n- Provider input/output/total tokens: unavailable. Credits: unavailable. No token or price estimate was invented.\n- Production stores unchanged: ${report.productionStateUnchanged}.\n\n${report.forecast.tokenTruthBoundary}\n`;
}
