#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createPrintedSongCard, querySongCardAppearances } from "../src/domain/song-card-mint.js";

export const SONG_CARD_KIOSK_SOAK_SCHEMA = "hapa.song-card.production-kiosk-soak.v1";

function percentile(values, fraction) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return Number(sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))].toFixed(3));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

async function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function appearanceKey(row) {
  return `${row.trackId || "track"}:${row.cueId || row.shotId || row.sourceCardId || row.appearanceId}`;
}

function appearanceMaterial(row) {
  return stable({
    startMs: row.startMs,
    endMs: row.endMs,
    sourceCardId: row.sourceCardId,
    sourceDigest: row.sourceDigest || row.snapshotDigest,
    trackId: row.trackId,
    cueId: row.cueId,
    zOrder: row.zOrder,
  });
}

function mergeRanges(ranges) {
  const sorted = ranges.filter((row) => row.endMs > row.startMs).sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const merged = [];
  for (const row of sorted) {
    const prior = merged.at(-1);
    if (prior && row.startMs <= prior.endMs) {
      prior.endMs = Math.max(prior.endMs, row.endMs);
      prior.appearanceKeys = [...new Set([...prior.appearanceKeys, ...row.appearanceKeys])].sort();
    } else merged.push({ ...row, appearanceKeys: [...row.appearanceKeys] });
  }
  return merged;
}

export function deriveChangedIntervals(beforeIndex = {}, afterIndex = {}) {
  const before = new Map((beforeIndex.appearances || []).map((row) => [appearanceKey(row), row]));
  const after = new Map((afterIndex.appearances || []).map((row) => [appearanceKey(row), row]));
  const keys = new Set([...before.keys(), ...after.keys()]);
  return mergeRanges([...keys].flatMap((key) => {
    const left = before.get(key);
    const right = after.get(key);
    if (JSON.stringify(appearanceMaterial(left || {})) === JSON.stringify(appearanceMaterial(right || {}))) return [];
    return [{
      startMs: Math.min(Number(left?.startMs ?? right?.startMs ?? 0), Number(right?.startMs ?? left?.startMs ?? 0)),
      endMs: Math.max(Number(left?.endMs || 0), Number(right?.endMs || 0)),
      appearanceKeys: [key],
    }];
  }));
}

export function printCheckpoints(changedIntervals = [], durationMs = 0) {
  const changed = changedIntervals[0] || { startMs: Math.round(durationMs / 3), endMs: Math.round(durationMs * 2 / 3) };
  const lastMs = Math.max(0, durationMs - 1);
  return [
    { id: "before-change", timestampMs: Math.max(0, Math.min(lastMs, changed.startMs - 100)) },
    { id: "inside-change", timestampMs: Math.max(0, Math.min(lastMs, changed.startMs + Math.max(1, Math.floor((changed.endMs - changed.startMs) / 2)))) },
    { id: "after-change", timestampMs: Math.max(0, Math.min(lastMs, changed.endMs + 100)) },
  ];
}

function intervalCovered(interval, declared) {
  return declared.some((row) => Number(row.startMs) <= interval.startMs + 1 && Number(row.endMs) >= interval.endMs - 1);
}

export function analyzePlaybackTelemetry({ framePtsMs = [], frameWallMs = [], progressSamples = [], blackIntervals = [], expectedBlackIntervals = [], expectedDurationMs = 0, completed = false } = {}) {
  const ptsIntervals = framePtsMs.slice(1).map((value, index) => value - framePtsMs[index]).filter((value) => value >= 0);
  const wallIntervals = frameWallMs.slice(1).map((value, index) => value - frameWallMs[index]).filter((value) => value >= 0);
  const medianPts = percentile(ptsIntervals, 0.5) || 33.333;
  const medianWall = percentile(wallIntervals, 0.5) || medianPts;
  const presentationGapThresholdMs = Math.max(100, medianPts * 2.5);
  const progressWallIntervals = progressSamples.slice(1).map((row, index) => row.wallMs - progressSamples[index].wallMs).filter((value) => value >= 0);
  const progressMediaIntervals = progressSamples.slice(1).map((row, index) => row.outTimeMs - progressSamples[index].outTimeMs);
  const wallStallThresholdMs = 750;
  const presentationGaps = ptsIntervals.flatMap((intervalMs, index) => intervalMs > presentationGapThresholdMs ? [{ atMs: framePtsMs[index], intervalMs }] : []);
  const wallStalls = progressWallIntervals.flatMap((intervalMs, index) => {
    const mediaDeltaMs = Number(progressMediaIntervals[index] || 0);
    const unexplainedWallLagMs = intervalMs - mediaDeltaMs;
    return unexplainedWallLagMs > wallStallThresholdMs ? [{ atMediaMs: progressSamples[index]?.outTimeMs ?? null, intervalMs, mediaDeltaMs, unexplainedWallLagMs }] : [];
  });
  const last = progressSamples.at(-1) || {};
  const decodedDurationMs = Math.max(Number(last.outTimeMs || 0), Number(framePtsMs.at(-1) || 0));
  const reportedDroppedFrames = Math.max(0, ...progressSamples.map((row) => Number(row.dropFrames || 0)));
  const reportedDuplicateFrames = Math.max(0, ...progressSamples.map((row) => Number(row.dupFrames || 0)));
  const unintendedBlackIntervals = blackIntervals.filter((row) => !intervalCovered(row, expectedBlackIntervals));
  const durationReached = decodedDurationMs >= Math.max(0, expectedDurationMs - 250);
  const checks = {
    completed,
    durationReached,
    framesPresented: framePtsMs.length > 0,
    noPresentationTimestampGaps: presentationGaps.length === 0,
    noRealtimeWallStalls: wallStalls.length === 0,
    noReportedDroppedFrames: reportedDroppedFrames === 0,
    noUnintendedBlackIntervals: unintendedBlackIntervals.length === 0,
  };
  return {
    ok: Object.values(checks).every(Boolean),
    checks,
    decodedDurationMs: Number(decodedDurationMs.toFixed(3)),
    frameCount: framePtsMs.length,
    presentationIntervalsMs: { median: percentile(ptsIntervals, 0.5), p95: percentile(ptsIntervals, 0.95), p99: percentile(ptsIntervals, 0.99), max: ptsIntervals.length ? Number(Math.max(...ptsIntervals).toFixed(3)) : null, threshold: Number(presentationGapThresholdMs.toFixed(3)) },
    decodedFrameArrivalIntervalsMs: { median: percentile(wallIntervals, 0.5), p95: percentile(wallIntervals, 0.95), p99: percentile(wallIntervals, 0.99), max: wallIntervals.length ? Number(Math.max(...wallIntervals).toFixed(3)) : null },
    realtimeProgressIntervalsMs: { median: percentile(progressWallIntervals, 0.5), p95: percentile(progressWallIntervals, 0.95), p99: percentile(progressWallIntervals, 0.99), max: progressWallIntervals.length ? Number(Math.max(...progressWallIntervals).toFixed(3)) : null, unexplainedWallLagStallThreshold: wallStallThresholdMs },
    presentationGaps,
    wallStalls,
    reportedDroppedFrames,
    reportedDuplicateFrames,
    blackIntervals,
    expectedBlackIntervals,
    unintendedBlackIntervals,
    progressSampleCount: progressSamples.length,
  };
}

function parseProgressBlock(block, wallMs) {
  const values = Object.fromEntries(block.split(/\r?\n/u).filter(Boolean).map((line) => {
    const index = line.indexOf("=");
    return index > 0 ? [line.slice(0, index), line.slice(index + 1)] : [line, ""];
  }));
  const outTimeMs = Number(values.out_time_us || 0) / 1000;
  return { wallMs, outTimeMs, frame: Number(values.frame || 0), fps: Number(values.fps || 0), speed: values.speed || "", dropFrames: Number(values.drop_frames || 0), dupFrames: Number(values.dup_frames || 0), progress: values.progress || "" };
}

export async function runRealtimePlaybackPass({ filePath, edition, cycle, maxSeconds = 60, expectedDurationMs = maxSeconds * 1000, expectedBlackIntervals = [], ffmpegPath = "ffmpeg", realtime = true } = {}) {
  const args = ["-hide_banner", "-nostdin", "-loglevel", "info"];
  if (realtime) args.push("-re");
  args.push("-i", filePath, "-map", "0:v:0", "-map", "0:a:0?", "-t", String(maxSeconds), "-vf", "blackdetect=d=0.20:pix_th=0.05:pic_th=0.98,showinfo", "-fps_mode", "passthrough", "-f", "null", "-", "-stats_period", "0.25", "-progress", "pipe:3");
  const startedAt = new Date().toISOString();
  const startedWall = performance.now();
  const framePtsMs = [];
  const frameWallMs = [];
  const progressSamples = [];
  const blackIntervals = [];
  let blackStartMs = null;
  let stderrTail = "";
  let stderrBuffer = "";
  let progressBuffer = "";
  let progressLines = [];
  let timedOut = false;
  const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe", "pipe"] });
  const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, Math.ceil((maxSeconds + 15) * 1000));
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => {
    stderrTail = `${stderrTail}${chunk}`.slice(-16000);
    stderrBuffer += chunk;
    const lines = stderrBuffer.split(/\r?\n/u);
    stderrBuffer = lines.pop() || "";
    for (const line of lines) {
      const frame = line.match(/\bn:\s*(\d+).*\bpts_time:([\d.]+)/u);
      if (frame) { framePtsMs.push(Number(frame[2]) * 1000); frameWallMs.push(performance.now() - startedWall); }
      const start = line.match(/black_start:([\d.]+)/u);
      if (start) blackStartMs = Number(start[1]) * 1000;
      const end = line.match(/black_end:([\d.]+).*black_duration:([\d.]+)/u);
      if (end) { blackIntervals.push({ startMs: blackStartMs ?? (Number(end[1]) - Number(end[2])) * 1000, endMs: Number(end[1]) * 1000, durationMs: Number(end[2]) * 1000 }); blackStartMs = null; }
    }
  });
  child.stdio[3].setEncoding("utf8");
  child.stdio[3].on("data", (chunk) => {
    progressBuffer += chunk;
    const lines = progressBuffer.split(/\r?\n/u);
    progressBuffer = lines.pop() || "";
    for (const line of lines) {
      progressLines.push(line);
      if (line.startsWith("progress=")) {
        progressSamples.push(parseProgressBlock(progressLines.join("\n"), performance.now() - startedWall));
        progressLines = [];
      }
    }
  });
  const exit = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
  clearTimeout(timeout);
  if (progressBuffer.trim()) progressLines.push(progressBuffer.trim());
  if (progressLines.length) progressSamples.push(parseProgressBlock(progressLines.join("\n"), performance.now() - startedWall));
  if (blackStartMs !== null) blackIntervals.push({ startMs: blackStartMs, endMs: expectedDurationMs, durationMs: Math.max(0, expectedDurationMs - blackStartMs), openEnded: true });
  const telemetry = analyzePlaybackTelemetry({ framePtsMs, frameWallMs, progressSamples, blackIntervals, expectedBlackIntervals, expectedDurationMs, completed: exit.code === 0 && !timedOut });
  return {
    schemaVersion: "hapa.song-card.kiosk-playback-pass.v1",
    edition,
    cycle,
    order: `cycle-${cycle}:edition-${edition}`,
    method: realtime ? "ffmpeg-realtime-decoded-frame-clock" : "ffmpeg-fast-decoded-frame-clock",
    sourceSha256: await fileSha256(filePath),
    maxSeconds,
    startedAt,
    finishedAt: new Date().toISOString(),
    wallDurationMs: Number((performance.now() - startedWall).toFixed(3)),
    exit,
    timedOut,
    telemetry,
    diagnostic: telemetry.ok ? undefined : { stderrCaptured: Boolean(stderrTail), stderrOmittedFromPortableReceipt: true },
  };
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function atomicWriteJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const temp = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  await fsp.writeFile(temp, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fsp.rename(temp, filePath);
}

function publicPrintEvidence(manifest, index, checkpoint) {
  const query = querySongCardAppearances(index, checkpoint.timestampMs);
  if (!query.primary) return { ...checkpoint, ok: false, truthStatus: query.truthStatus, reason: "no-printable-card" };
  const printed = createPrintedSongCard({ head: manifest.head, edition: manifest.edition, appearance: query.primary, timestampMs: checkpoint.timestampMs, activeAppearances: query.active, printedAt: "soak-receipt-time" });
  return {
    ...checkpoint,
    ok: printed.songCardPrint?.edition === manifest.edition.edition && printed.songCardPrint?.timestampMs === checkpoint.timestampMs,
    primaryAppearanceId: query.primary.appearanceId,
    sourceCardId: query.primary.sourceCardId,
    activeAppearanceIds: query.active.map((row) => row.appearanceId),
    printReceipt: printed.songCardPrint,
  };
}

async function editionInputs(outputRoot) {
  const ledgerRoot = path.join(outputRoot, "mint-ledger");
  const ledger = await readJson(path.join(ledgerRoot, "heads.json"));
  const head = Object.values(ledger.heads || {})[0];
  if (!head) throw new Error("The verified Song Card mint ledger has no head");
  const inputs = [];
  for (const edition of [1, 2]) {
    const record = (head.editions || []).find((row) => Number(row.edition) === edition);
    if (!record) throw new Error(`Verified demo Edition ${edition} is missing`);
    const directory = path.resolve(ledgerRoot, record.path);
    const manifest = await readJson(path.join(directory, "manifest.public.json"));
    const index = await readJson(path.join(directory, "timestamp-index.json"));
    inputs.push({ edition, directory, manifest, index, masterPath: path.join(directory, manifest.render.path) });
  }
  return inputs;
}

export async function runSongCardKioskSoak({ outputRoot = path.resolve("outputs/dear-papa-song-card-mint-demo-verified"), cycles = 2, maxSeconds = 60, ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg", realtime = true, expectedBlackIntervals = {} } = {}) {
  const inputs = await editionInputs(outputRoot);
  const changedIntervals = deriveChangedIntervals(inputs[0].index, inputs[1].index);
  const durationMs = Math.min(...inputs.map((row) => Number(row.index.durationMs || row.manifest.render.durationMs || maxSeconds * 1000)), maxSeconds * 1000);
  const checkpoints = printCheckpoints(changedIntervals, durationMs);
  const printEvidence = inputs.map((row) => ({ edition: row.edition, checkpoints: checkpoints.map((checkpoint) => publicPrintEvidence(row.manifest, row.index, checkpoint)) }));
  const runs = [];
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    for (const input of inputs) {
      runs.push(await runRealtimePlaybackPass({ filePath: input.masterPath, edition: input.edition, cycle, maxSeconds, expectedDurationMs: durationMs, expectedBlackIntervals: expectedBlackIntervals[input.edition] || [], ffmpegPath, realtime }));
    }
  }
  const checks = {
    exactEditionOrderRepeatedTwice: cycles === 2 && runs.map((row) => `${row.edition}`).join(",") === "1,2,1,2",
    fourCompletedRealtimeDecodes: runs.length === 4 && runs.every((row) => row.method === "ffmpeg-realtime-decoded-frame-clock" && row.telemetry.checks.completed),
    everyPassReachedBoundedDuration: runs.every((row) => row.telemetry.checks.durationReached && row.maxSeconds <= 60),
    noPresentationTimestampGaps: runs.every((row) => row.telemetry.checks.noPresentationTimestampGaps),
    noRealtimeWallStalls: runs.every((row) => row.telemetry.checks.noRealtimeWallStalls),
    noReportedDroppedFrames: runs.every((row) => row.telemetry.checks.noReportedDroppedFrames),
    noUnintendedBlackIntervals: runs.every((row) => row.telemetry.checks.noUnintendedBlackIntervals),
    changedIntervalDetected: changedIntervals.length > 0,
    beforeInsideAfterHistoricalPrints: printEvidence.every((row) => row.checkpoints.length === 3 && row.checkpoints.every((checkpoint) => checkpoint.ok)),
  };
  const base = {
    schemaVersion: SONG_CARD_KIOSK_SOAK_SCHEMA,
    generatedAt: new Date().toISOString(),
    ok: Object.values(checks).every(Boolean),
    status: Object.values(checks).every(Boolean) ? "verified-twice-through-kiosk-playback" : "failed-twice-through-kiosk-playback",
    truthPolicy: {
      smoothnessEvidence: "real-time decoded frames and wall-clock presentation arrivals; never inferred from ffprobe metadata",
      blackPolicy: "black intervals >=200ms are failures unless explicitly declared expected",
      stallPolicy: "decoded PTS gaps and real-time wall arrival stalls are independently measured",
      limitation: "ffmpeg null sink validates real-time decode/presentation clock behavior, not the Electron GPU compositor or display hardware",
    },
    source: { productionGate: "production-gate-report.json", integration: "separate-linked-report", outputRoot: path.basename(outputRoot) },
    configuration: { cycles, editionOrderPerCycle: [1, 2], maxSecondsPerEdition: maxSeconds, realtime, blackDetect: { minimumDurationMs: 200, pixelThreshold: 0.05, pictureRatio: 0.98 } },
    changedIntervals,
    printEvidence,
    runs,
    checks,
  };
  const receipt = { ...base, receiptSha256: sha256(JSON.stringify(stable(base))) };
  await atomicWriteJson(path.join(outputRoot, "kiosk-soak-receipt.json"), receipt);
  return receipt;
}

function args(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const value = argv[index + 1];
    parsed[key.slice(2)] = value && !value.startsWith("--") ? (index += 1, value) : true;
  }
  return parsed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const options = args(process.argv.slice(2));
  const receipt = await runSongCardKioskSoak({
    outputRoot: path.resolve(options.output || "outputs/dear-papa-song-card-mint-demo-verified"),
    cycles: Number(options.cycles || 2),
    maxSeconds: Math.min(60, Number(options["max-seconds"] || 60)),
    ffmpegPath: String(options.ffmpeg || process.env.FFMPEG_PATH || "ffmpeg"),
    realtime: options["fast-test"] !== true,
  });
  console.log(JSON.stringify({ ok: receipt.ok, status: receipt.status, receipt: path.join(options.output || "outputs/dear-papa-song-card-mint-demo-verified", "kiosk-soak-receipt.json"), checks: receipt.checks }, null, 2));
  if (!receipt.ok) process.exitCode = 1;
}
