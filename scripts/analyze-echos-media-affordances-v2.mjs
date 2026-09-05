#!/usr/bin/env node
import fs from "node:fs";
import { projectEchoMediaAffordance } from "../src/domain/echo-media-affordance-projection.js";
import fsp from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const mediaRoot = path.join(root, "data", "media");
const storePaths = [path.join(root, "data", "item-manager-store.json"), path.join(root, "data", "scene-store.json")];
const cachePath = path.join(root, "artifacts", "echo-media-affordances", "technical-cache-v2.json");
const reportPath = path.join(root, "artifacts", "echo-media-affordances", "report-v2.json");
const contactRoot = path.join(mediaRoot, "echo-affordance-contacts-v2");
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(root, "data", "backups", `echo-media-affordances-v2-${stamp}`);
const apply = process.argv.includes("--apply");
const missingOnly = process.argv.includes("--missing-only");
const concurrency = Math.max(1, Math.min(4, Number(process.env.HAPA_MEDIA_PROBE_CONCURRENCY) || 4));


function mediaPath(uri = "") {
  if (!uri.startsWith("/media/")) return "";
  const resolved = path.resolve(mediaRoot, decodeURIComponent(uri.slice(7)));
  return resolved.startsWith(`${mediaRoot}${path.sep}`) ? resolved : "";
}

function mediaUri(filePath) {
  return `/media/${path.relative(mediaRoot, filePath).split(path.sep).map(encodeURIComponent).join("/")}`;
}

async function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    const deadline = setTimeout(() => stream.destroy(new Error("Source hashing exceeded 30 seconds")), 30000);
    stream.on("error", error => { clearTimeout(deadline); reject(error); });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => { clearTimeout(deadline); resolve(hash.digest("hex")); });
  });
}

function parseRate(value = "") {
  const [left, right] = String(value).split("/").map(Number);
  return left && right ? Number((left / right).toFixed(3)) : null;
}

async function probe(filePath) {
  const [{ stdout: streamText }, { stdout: keyframeText }] = await Promise.all([
    run("/opt/homebrew/bin/ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", filePath], { maxBuffer: 8 * 1024 * 1024, timeout: 30000, killSignal: "SIGKILL" }),
    run("/opt/homebrew/bin/ffprobe", ["-v", "error", "-select_streams", "v:0", "-skip_frame", "nokey", "-show_entries", "frame=best_effort_timestamp_time", "-of", "json", filePath], { maxBuffer: 8 * 1024 * 1024, timeout: 30000, killSignal: "SIGKILL" }),
  ]);
  const payload = JSON.parse(streamText || "{}");
  const stream = (payload.streams || []).find((item) => item.codec_type === "video") || {};
  if (!(Number(stream.width) > 0 && Number(stream.height) > 0 && stream.codec_name)) throw new Error("No decodable video stream was found");
  const keyframes = (JSON.parse(keyframeText || "{}").frames || []).map((frame) => Number(frame.best_effort_timestamp_time)).filter(Number.isFinite);
  const intervals = keyframes.slice(1).map((value, index) => value - keyframes[index]).filter((value) => value >= 0);
  const duration = Number(stream.duration || payload.format?.duration || 0) || null;
  const fps = parseRate(stream.avg_frame_rate || stream.r_frame_rate);
  return {
    durationSec: duration ? Number(duration.toFixed(3)) : null,
    width: Number(stream.width || 0) || null,
    height: Number(stream.height || 0) || null,
    fps,
    codec: stream.codec_name || null,
    pixelFormat: stream.pix_fmt || null,
    bitRate: Number(stream.bit_rate || payload.format?.bit_rate || 0) || null,
    keyframes: {
      count: keyframes.length,
      firstSeconds: keyframes.slice(0, 12),
      averageIntervalSeconds: intervals.length ? Number((intervals.reduce((sum, value) => sum + value, 0) / intervals.length).toFixed(3)) : null,
      maxIntervalSeconds: intervals.length ? Number(Math.max(...intervals).toFixed(3)) : null,
      estimatedFramesPerGop: intervals.length && fps ? Number(((intervals.reduce((sum, value) => sum + value, 0) / intervals.length) * fps).toFixed(2)) : null,
      source: "ffprobe-skip_frame-nokey",
    },
  };
}

async function contactSheet(filePath, duration, hash) {
  const output = path.join(contactRoot, `${hash.slice(0, 24)}.jpg`);
  try { await fsp.access(output); return output; } catch { /* create below */ }
  await fsp.mkdir(contactRoot, { recursive: true });
  const mid = Math.max(0, Number(duration || 1) * 0.5);
  const end = Math.max(0, Number(duration || 1) - 0.08);
  await run("/opt/homebrew/bin/ffmpeg", [
    "-nostdin", "-v", "error", "-y", "-ss", "0", "-i", filePath, "-ss", String(mid), "-i", filePath, "-ss", String(end), "-i", filePath,
    "-filter_complex", "[0:v]scale=320:-2[a];[1:v]scale=320:-2[b];[2:v]scale=320:-2[c];[a][b][c]hstack=inputs=3[out]",
    "-map", "[out]", "-frames:v", "1", "-q:v", "4", "-strict", "unofficial", output,
  ], { maxBuffer: 2 * 1024 * 1024, timeout: 30000, killSignal: "SIGKILL" });
  return output;
}

async function mapLimit(values, limit, fn) {
  const output = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      output[index] = await fn(values[index], index);
    }
  }));
  return output;
}

const storeBytes = await Promise.all(storePaths.map(file => fsp.readFile(file, "utf8")));
const stores = storeBytes.map(JSON.parse);
const records = [];
for (const card of stores[0].cards || []) for (const asset of card.mediaAssets || []) if (asset.type === "video") records.push({ asset, parent: card, source: "item-manager-store" });
for (const scene of stores[1].scenes || []) for (const asset of scene.assets || []) if (asset.type === "video") records.push({ asset, parent: scene, source: "scene-store" });
const byPath = new Map();
for (const record of records) {
  if (missingOnly && ["verified-source-file", "unreadable"].includes(record.asset.metadata?.echosTechnicalAffordance?.status)) continue;
  const filePath = mediaPath(record.asset.uri || "");
  if (!filePath) throw new Error(`Unsupported unclassified media URI: ${record.asset.id}`);
  const list = byPath.get(filePath) || [];
  list.push(record);
  byPath.set(filePath, list);
}
let cache = {};
try { cache = JSON.parse(await fsp.readFile(cachePath, "utf8")); } catch { /* first run */ }
const stats = { records: records.length, uniquePaths: byPath.size, cacheHits: 0, analyzed: 0, readable: 0, failed: 0, contactSheetsCreated: 0 };

await mapLimit([...byPath.entries()], concurrency, async ([filePath, linked]) => {
  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile() || stat.size > 512 * 1024 * 1024) throw new Error("Source exceeds the 512 MiB per-asset analysis budget or is not a file");
    const realPath = await fsp.realpath(filePath);
    const key = `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`;
    let technical = cache[filePath]?.key === key ? cache[filePath].technical : null;
    if (technical) stats.cacheHits += 1;
    else {
      const [contentHash, details] = await Promise.all([sha256(filePath), probe(filePath)]);
      const existingFrames = linked.flatMap(({ asset }) => asset.state?.keyframes || asset.metadata?.frames || []).filter((frame) => frame?.uri);
      let contactFrames = existingFrames.slice(0, 3).map((frame) => ({ marker: frame.marker || frame.role || "contact", atSeconds: Number(frame.time ?? 0), uri: frame.uri, source: "existing-extracted-frame" }));
      let posterUri = linked.map(({ asset }) => asset.thumbnailUri || asset.metadata?.thumbnailUri || "").find(Boolean) || contactFrames[0]?.uri || "";
      if (contactFrames.length < 3) {
        const sheet = await contactSheet(filePath, details.durationSec, contentHash);
        stats.contactSheetsCreated += 1;
        const sheetUri = mediaUri(sheet);
        contactFrames = [{ marker: "contact-sheet-first-mid-last", atSeconds: null, uri: sheetUri, source: "ffmpeg-three-sample-contact-sheet" }];
        if (!posterUri) posterUri = sheetUri;
      }
      technical = {
        schemaVersion: "hapa.echo.media-technical-affordance.v2",
        status: "verified-source-file",
        sourcePath: filePath,
        sourceProvenance: { storeRecords: linked.map(({ source, parent, asset }) => ({ source, parentId: parent.id, assetId: asset.id })) },
        contentHash: { algorithm: "sha256", value: contentHash },
        fileSizeBytes: stat.size,
        ...details,
        posterUri,
        contactFrames,
        analyzedAt: new Date().toISOString(),
        analyzer: "scripts/analyze-echos-media-affordances-v2.mjs",
      };
      cache[filePath] = { key, technical };
      stats.analyzed += 1;
    }
    const afterStat = await fsp.stat(filePath);
    if (`${afterStat.dev}:${afterStat.ino}:${afterStat.size}:${afterStat.mtimeMs}:${afterStat.ctimeMs}` !== key || await fsp.realpath(filePath) !== realPath) throw new Error("Source changed during affordance analysis");
    const declaredDuration = linked.map(({ asset }) => Number(asset.duration || asset.metadata?.length || 0)).find((value) => value > 0) || null;
    if (!technical.durationSec && declaredDuration) {
      technical.durationSec = declaredDuration;
      technical.durationBasis = "source-record-declared; stream-duration-missing";
    } else {
      technical.durationBasis ||= "ffprobe-stream-or-container";
    }
    if (!technical.bitRate && technical.durationSec) {
      technical.bitRate = Math.round((stat.size * 8) / technical.durationSec);
      technical.bitRateBasis = "derived-average-from-file-size-and-duration";
    } else {
      technical.bitRateBasis ||= "ffprobe-stream-or-container";
    }
    if (cache[filePath]) cache[filePath].technical = technical;
    stats.readable += 1;
    for (const { asset, parent, source } of linked) {
      Object.assign(asset, projectEchoMediaAffordance(asset, technical, source));
    }
  } catch (error) {
    stats.failed += 1;
    for (const { asset } of linked) asset.metadata = { ...(asset.metadata || {}), echosTechnicalAffordance: { schemaVersion: "hapa.echo.media-technical-affordance.v2", status: "unreadable", sourcePath: filePath, error: String(error.message || error) } };
  }
});

const report = { schemaVersion: "hapa.echo.media-affordance-report.v2", ok: stats.readable + stats.failed === stats.uniquePaths, mode: apply ? "apply" : "dry-run", scope: missingOnly ? "missing-only" : "all", existingRecordsPreserved: missingOnly, stats, invalidFilesAreClassified: true, cachePath, backupRoot: apply ? backupRoot : null, generatedAt: new Date().toISOString() };
await fsp.mkdir(path.dirname(cachePath), { recursive: true });
await fsp.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
await fsp.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
if (apply) {
  await fsp.mkdir(backupRoot, { recursive: true });
  for (let index = 0; index < storePaths.length; index++) {
    const next = `${JSON.stringify(stores[index], null, 2)}\n`;
    if (JSON.stringify(JSON.parse(storeBytes[index])) === JSON.stringify(stores[index])) continue;
    const file = storePaths[index];
    await fsp.writeFile(path.join(backupRoot, path.basename(file)), storeBytes[index], { flag: "wx" });
    const temporary = `${file}.${process.pid}.affordances.tmp`;
    await fsp.writeFile(temporary, next, { flag: "wx" });
    if (await fsp.readFile(file, "utf8") !== storeBytes[index]) {
      await fsp.unlink(temporary);
      throw new Error(`Concurrent store edit: ${path.basename(file)}; analysis cache retained for retry`);
    }
    await fsp.rename(temporary, file);
  }
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
