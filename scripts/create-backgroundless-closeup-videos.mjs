#!/usr/bin/env node
import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STORE_PATH = path.join(ROOT, "data/avatar-store.json");
const MEDIA_DIR = path.join(ROOT, "data/media");
const OUT_DIR = path.join(MEDIA_DIR, "backgroundless/closeup-emotions");
const BATCH_PATH = path.join(ROOT, "data/backgroundless-closeup-emotions-batch.json");
const API_BASE = process.env.HAPA_AVATAR_BUILDER_API || "http://127.0.0.1:8789";

const args = parseArgs(process.argv.slice(2));
const LIMIT = Number(args.limit || 0);
const FORCE = Boolean(args.force);
const DRY_RUN = Boolean(args["dry-run"]);
const INCLUDE_BACKGROUNDS = Boolean(args["include-backgrounds"]);
const ONLY_ASSET_ID = args["asset-id"] || "";
const SIMILARITY = Number(args.similarity || 0.22);
const BLEND = Number(args.blend || 0.08);
const SILHOUETTE_PROTECT = !Boolean(args["no-silhouette-protect"]);
const SILHOUETTE_CLOSE_PASSES = clampInt(args["silhouette-close-passes"], 1, 8, 4);
const EDGE_SOFTEN = clampInt(args["edge-soften"], 0, 6, 1);
const CRF = Number(args.crf || 30);
const CPU_USED = Number(args["cpu-used"] || 6);

mkdirSync(OUT_DIR, { recursive: true });

const batch = readBatch();
const store = JSON.parse(readFileSync(STORE_PATH, "utf8"));
const candidates = collectCandidates(store)
  .filter((item) => !ONLY_ASSET_ID || item.asset.id === ONLY_ASSET_ID)
  .filter((item) => FORCE || !item.asset.metadata?.backgroundless?.ready)
  .filter((item) => FORCE || batch.items[item.asset.id]?.status !== "ready");
const selected = LIMIT > 0 ? candidates.slice(0, LIMIT) : candidates;

batch.schemaVersion = "hapa.avatar-builder.backgroundless-closeup-batch.v2";
batch.apiBase = API_BASE;
batch.outputDir = OUT_DIR;
batch.updatedAt = new Date().toISOString();
batch.totalCandidates = candidates.length;
batch.selected = selected.length;
writeBatch(batch);

console.log(`Close-up emotion backgroundless batch: ${selected.length}/${candidates.length} selected`);
if (DRY_RUN) {
  console.log(JSON.stringify(selected.slice(0, 20).map(summaryForCandidate), null, 2));
  process.exit(0);
}

assertTool("ffmpeg", ["-version"]);
assertTool("ffprobe", ["-version"]);
await assertApi();

let ready = 0;
let failed = 0;
let skipped = 0;

for (let index = 0; index < selected.length; index += 1) {
  const candidate = selected[index];
  const label = `${index + 1}/${selected.length} ${candidate.avatar.primaryName || candidate.avatar.id} ${candidate.asset.name}`;
  try {
    console.log(`\n[${label}] scoring`);
    const scored = scoreVideo(candidate.sourcePath);
    const outputPath = outputPathFor(candidate);
    const webUri = `/media/${path.relative(MEDIA_DIR, outputPath).split(path.sep).join("/")}`;
    const sourceHash = sha256File(candidate.sourcePath);
    const existingProbe = existsSync(outputPath) ? probeVideo(outputPath) : null;
    if (!FORCE && existingProbe && validAlphaWebmProbe(existingProbe)) {
      console.log(`[${label}] output exists; registering ${webUri}`);
    } else {
      if (existingProbe && !validAlphaWebmProbe(existingProbe)) {
        console.log(`[${label}] existing output is incomplete or opaque; rerendering`);
      }
      console.log(`[${label}] rendering key=${rgbToHex(scored.key_rgb)} score=${scored.score} silhouetteProtect=${SILHOUETTE_PROTECT}`);
      renderAlphaWebm({
        inputPath: candidate.sourcePath,
        outputPath,
        keyRgb: scored.key_rgb,
        similarity: SIMILARITY,
        blend: BLEND,
        silhouetteProtect: SILHOUETTE_PROTECT,
        silhouetteClosePasses: SILHOUETTE_CLOSE_PASSES,
        edgeSoften: EDGE_SOFTEN,
        crf: CRF,
        cpuUsed: CPU_USED
      });
    }
    const probe = probeVideo(outputPath);
    if (!validAlphaWebmProbe(probe)) throw new Error(`rendered output is missing alpha metadata: ${JSON.stringify(probe)}`);
    const registration = await registerVariant(candidate, {
      webUri,
      outputPath,
      sourceHash,
      scored,
      probe
    });
    batch.items[candidate.asset.id] = {
      status: "ready",
      avatarId: candidate.avatar.id,
      avatarName: candidate.avatar.primaryName,
      assetId: candidate.asset.id,
      assetName: candidate.asset.name,
      sourceUri: candidate.asset.uri,
      sourcePath: candidate.sourcePath,
      webUri,
      outputPath,
      sourceVideoHash: sourceHash,
      score: scored.score,
      decision: scored.decision,
      keyRgb: scored.key_rgb,
      keyer: SILHOUETTE_PROTECT ? "colorkey-silhouette-protected" : "colorkey",
      silhouetteProtect: SILHOUETTE_PROTECT,
      silhouetteClosePasses: SILHOUETTE_CLOSE_PASSES,
      edgeSoften: EDGE_SOFTEN,
      probe,
      registrationStatus: registration?.summary?.ready != null ? "registered" : "posted",
      updatedAt: new Date().toISOString()
    };
    ready += 1;
    console.log(`[${label}] ready ${webUri}`);
  } catch (error) {
    failed += 1;
    batch.items[candidate.asset.id] = {
      status: "failed",
      avatarId: candidate.avatar.id,
      avatarName: candidate.avatar.primaryName,
      assetId: candidate.asset.id,
      assetName: candidate.asset.name,
      sourceUri: candidate.asset.uri,
      sourcePath: candidate.sourcePath,
      error: error instanceof Error ? error.message : String(error),
      updatedAt: new Date().toISOString()
    };
    console.error(`[${label}] failed: ${batch.items[candidate.asset.id].error}`);
  }
  batch.updatedAt = new Date().toISOString();
  batch.counts = summarizeBatch(batch);
  writeBatch(batch);
}

for (const candidate of candidates) {
  if (!selected.some((item) => item.asset.id === candidate.asset.id)) skipped += 1;
}
batch.finishedAt = new Date().toISOString();
batch.counts = summarizeBatch(batch);
writeBatch(batch);
console.log(JSON.stringify({ ready, failed, skipped, counts: batch.counts, batchPath: BATCH_PATH }, null, 2));

function parseArgs(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const arg = values[index];
    if (!arg.startsWith("--")) continue;
    const [key, inlineValue] = arg.slice(2).split("=");
    if (inlineValue !== undefined) parsed[key] = inlineValue;
    else if (values[index + 1] && !values[index + 1].startsWith("--")) parsed[key] = values[++index];
    else parsed[key] = true;
  }
  return parsed;
}

function clampInt(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function readBatch() {
  if (!existsSync(BATCH_PATH)) return { items: {} };
  try {
    const parsed = JSON.parse(readFileSync(BATCH_PATH, "utf8"));
    return { ...parsed, items: parsed.items || {} };
  } catch {
    return { items: {} };
  }
}

function writeBatch(value) {
  writeFileSync(BATCH_PATH, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function collectCandidates(data) {
  const items = [];
  for (const avatar of data.avatars || []) {
    for (const asset of avatar.assets || []) {
      if (asset.type !== "video" || !asset.uri) continue;
      const isCloseupEmotion = asset.requirementId === "closeup_emotions";
      const isCloseupBackground = asset.requirementId === "closeup_backgrounds";
      if (!isCloseupEmotion && !(INCLUDE_BACKGROUNDS && isCloseupBackground)) continue;
      const sourcePath = sourcePathForUri(asset.uri);
      if (!sourcePath || !existsSync(sourcePath)) continue;
      items.push({ avatar, asset, sourcePath });
    }
  }
  return items.sort((a, b) =>
    String(a.avatar.primaryName || a.avatar.id).localeCompare(String(b.avatar.primaryName || b.avatar.id)) ||
    String(a.asset.name || a.asset.id).localeCompare(String(b.asset.name || b.asset.id))
  );
}

function summaryForCandidate({ avatar, asset, sourcePath }) {
  return {
    avatarId: avatar.id,
    avatarName: avatar.primaryName,
    assetId: asset.id,
    name: asset.name,
    uri: asset.uri,
    sourcePath
  };
}

function sourcePathForUri(uri) {
  const text = String(uri || "");
  if (!text.startsWith("/media/")) return "";
  return path.resolve(MEDIA_DIR, decodeURIComponent(text.replace(/^\/media\/?/, "")));
}

function outputPathFor({ avatar, asset }) {
  const file = `${slugify(avatar.id)}-${slugify(asset.id).slice(0, 96)}-backgroundless.webm`;
  return path.join(OUT_DIR, file);
}

function slugify(value) {
  return String(value || "asset")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function assertTool(bin, argsForTool) {
  const result = spawnSync(bin, argsForTool, { stdio: "ignore" });
  if (result.status !== 0) throw new Error(`${bin} is unavailable`);
}

async function assertApi() {
  const response = await fetch(`${API_BASE}/api/health`);
  if (!response.ok) throw new Error(`Avatar Builder API unavailable: ${response.status}`);
}

function probeVideo(filePath) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_streams",
    "-show_format",
    "-print_format", "json",
    filePath
  ], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    return { ok: false, error: result.stderr || `ffprobe exited ${result.status}` };
  }
  const data = JSON.parse(result.stdout || "{}");
  const stream = (data.streams || []).find((item) => item.codec_type === "video") || {};
  return {
    ok: true,
    width: stream.width || null,
    height: stream.height || null,
    pixFmt: stream.pix_fmt || "",
    codec: stream.codec_name || "",
    duration: Number(data.format?.duration || stream.duration || 0),
    alphaMode: stream.tags?.alpha_mode || stream.tags?.ALPHA_MODE || data.format?.tags?.alpha_mode || data.format?.tags?.ALPHA_MODE || null,
    sizeBytes: Number(data.format?.size || 0)
  };
}

function scoreVideo(filePath) {
  const probe = probeVideo(filePath);
  const duration = Math.max(0, Number(probe.duration || 0));
  if (!probe.ok || duration <= 0) return { score: 0, decision: "review", key_rgb: [0, 255, 0], probe, frames: [] };
  const times = [...new Set([0.05, Math.min(duration * 0.5, Math.max(0.05, duration - 0.05)), Math.max(0.05, duration - 0.1)].map((item) => Number(item.toFixed(3))))];
  const frames = times.map((timestamp) => {
    const raw = sampleFrame(filePath, timestamp);
    const scored = scoreFrame(raw);
    return { ...scored, timestamp };
  });
  const score = round(frames.reduce((sum, frame) => sum + frame.score, 0) / Math.max(1, frames.length), 4);
  const key_rgb = meanColor(frames.map((frame) => frame.key_rgb));
  return {
    score,
    decision: score >= 0.2 ? "auto" : score >= 0.05 ? "review" : "low-confidence",
    key_rgb,
    probe,
    frames
  };
}

function sampleFrame(filePath, timestamp, size = 64) {
  const result = spawnSync("ffmpeg", [
    "-v", "error",
    "-ss", timestamp.toFixed(3),
    "-i", filePath,
    "-frames:v", "1",
    "-vf", `scale=${size}:${size}`,
    "-f", "rawvideo",
    "-pix_fmt", "rgb24",
    "pipe:1"
  ], { encoding: "buffer", maxBuffer: size * size * 3 + 1024 * 1024 });
  if (result.status !== 0 || result.stdout.length < size * size * 3) throw new Error(`frame sample failed at ${timestamp}s`);
  return result.stdout;
}

function scoreFrame(raw, size = 64) {
  const border = [];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (x >= 6 && x < size - 6 && y >= 6 && y < size - 6) continue;
      border.push(rgbAt(raw, x, y, size));
    }
  }
  const key_rgb = dominantColor(border);
  const distances = border.map((pixel) => colorDistance(pixel, key_rgb));
  const within = distances.filter((distance) => distance <= 32).length / Math.max(1, distances.length);
  const avg = distances.reduce((sum, distance) => sum + distance, 0) / Math.max(1, distances.length);
  const variancePenalty = Math.min(1, avg / 96);
  return {
    score: round(Math.max(0, Math.min(1, within * 0.75 + (1 - variancePenalty) * 0.25)), 4),
    key_rgb,
    border_within: round(within, 4),
    avg_distance: round(avg, 4)
  };
}

function rgbAt(raw, x, y, size) {
  const index = (y * size + x) * 3;
  return [raw[index], raw[index + 1], raw[index + 2]];
}

function dominantColor(pixels, bucketSize = 24) {
  const buckets = new Map();
  for (const pixel of pixels) {
    const key = pixel.map((channel) => Math.floor(channel / bucketSize)).join(":");
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(pixel);
  }
  let largest = [];
  for (const bucket of buckets.values()) {
    if (bucket.length > largest.length) largest = bucket;
  }
  return meanColor(largest);
}

function meanColor(pixels) {
  if (!pixels.length) return [0, 0, 0];
  return [0, 1, 2].map((index) => Math.round(pixels.reduce((sum, pixel) => sum + Number(pixel[index] || 0), 0) / pixels.length));
}

function colorDistance(a, b) {
  return Math.sqrt([0, 1, 2].reduce((sum, index) => sum + ((a[index] || 0) - (b[index] || 0)) ** 2, 0));
}

function rgbToHex(rgb) {
  return `0x${rgb.map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function renderAlphaWebm({
  inputPath,
  outputPath,
  keyRgb,
  similarity,
  blend,
  silhouetteProtect = true,
  silhouetteClosePasses = 4,
  edgeSoften = 1,
  crf,
  cpuUsed
}) {
  mkdirSync(path.dirname(outputPath), { recursive: true });
  const keyColor = rgbToHex(keyRgb);
  const filterArgs = silhouetteProtect
    ? [
        "-filter_complex",
        buildSilhouetteProtectedFilter({
          keyColor,
          similarity,
          blend,
          closePasses: silhouetteClosePasses,
          edgeSoften
        }),
        "-map", "[out]"
      ]
    : [
        "-vf", `colorkey=${keyColor}:${similarity}:${blend},format=yuva420p`
      ];
  const result = spawnSync("ffmpeg", [
    "-y",
    "-i", inputPath,
    ...filterArgs,
    "-an",
    "-c:v", "libvpx-vp9",
    "-pix_fmt", "yuva420p",
    "-auto-alt-ref", "0",
    "-deadline", "realtime",
    "-cpu-used", String(cpuUsed),
    "-row-mt", "1",
    "-b:v", "0",
    "-crf", String(crf),
    "-metadata:s:v:0", "alpha_mode=1",
    outputPath
  ], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 15 * 60 * 1000 });
  if (result.status !== 0) {
    throw new Error(`ffmpeg render failed: ${result.stderr?.slice(-3000) || result.error?.message || result.status}`);
  }
}

function buildSilhouetteProtectedFilter({ keyColor, similarity, blend, closePasses = 4, edgeSoften = 1 }) {
  const close = buildAlphaCloseFilters(closePasses);
  const soften = edgeSoften > 0 ? `,boxblur=${edgeSoften}:1` : "";
  return [
    "[0:v]format=rgba,split=2[color][keysrc]",
    `[keysrc]colorkey=${keyColor}:${similarity}:${blend},alphaextract,format=gray${close}${soften}[alpha]`,
    "[color][alpha]alphamerge,format=yuva420p[out]"
  ].join(";");
}

function buildAlphaCloseFilters(passes = 4) {
  const count = clampInt(passes, 1, 8, 4);
  return [
    ...Array.from({ length: count }, () => "dilation"),
    ...Array.from({ length: count }, () => "erosion")
  ].map((name) => `,${name}`).join("");
}

function sha256File(filePath) {
  return crypto.createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

async function registerVariant(candidate, { webUri, outputPath, sourceHash, scored, probe }) {
  let lastError = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}/api/avatars/${encodeURIComponent(candidate.avatar.id)}/backgroundless`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoAssetId: candidate.asset.id,
          status: "ready",
          webUri,
          preferredUri: webUri,
          alphaUri: webUri,
          localPath: outputPath,
          sourceUri: candidate.asset.uri,
          sourceVideoHash: sourceHash,
          backend: "hapa-avatar-builder-closeup-batch",
          keyer: SILHOUETTE_PROTECT ? "colorkey-silhouette-protected" : "colorkey",
          codec: "vp9-webm-alpha",
          confidence: scored.score,
          hasAlpha: true,
          metadata: {
            score: scored,
            probe,
            similarity: SIMILARITY,
            blend: BLEND,
            silhouetteProtect: SILHOUETTE_PROTECT,
            silhouetteClosePasses: SILHOUETTE_CLOSE_PASSES,
            edgeSoften: EDGE_SOFTEN,
            crf: CRF
          }
        })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(`register failed ${response.status}: ${JSON.stringify(body)}`);
      return body;
    } catch (error) {
      lastError = error;
      await sleep(500 * attempt * attempt);
    }
  }
  throw lastError || new Error("register failed");
}

function validAlphaWebmProbe(probe) {
  return Boolean(
    probe?.ok &&
    probe.sizeBytes > 0 &&
    ["vp8", "vp9"].includes(String(probe.codec || "").toLowerCase()) &&
    String(probe.alphaMode || "") === "1"
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeBatch(value) {
  const items = Object.values(value.items || {});
  return {
    ready: items.filter((item) => item.status === "ready").length,
    failed: items.filter((item) => item.status === "failed").length,
    processing: items.filter((item) => item.status === "processing").length
  };
}

function round(value, places = 4) {
  const factor = 10 ** places;
  return Math.round(Number(value || 0) * factor) / factor;
}
