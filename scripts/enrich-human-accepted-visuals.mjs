#!/usr/bin/env node
/**
 * Enrich Human Enricher "accepted" videos/images with machine-derived visual
 * telemetry for the Echo album director:
 *
 *   --stage palette     Sample up to 5 evenly-spaced frames per video via
 *                       ffmpeg, downscale to 32x32 raw rgb24, and store a
 *                       deterministic median-cut color profile (8 swatches,
 *                       luminance, saturation, hue histogram, warmth, chroma
 *                       share) plus extraction provenance.
 *   --stage description Join the cheapest trustworthy description: agent
 *                       optical review first, Echo enrichment catalog
 *                       synopsis second.
 *   --stage all         Both, in order.
 *
 * Results land in `data/human-video-visual-enrichments.json` (schema
 * hapa.human-video-visual-enrichment-store.v1) with an append-only NDJSON
 * journal at `data/human-video-visual-enrichment-events.ndjson`. The run is
 * resume-safe: a stored palette whose source identity matches the current
 * file is skipped, and descriptions only write when text or source class
 * changed. Without `--apply` the run is a dry run: it prints the plan and
 * still writes the run report under `work/` (gitignored), but never writes
 * the store or the event journal.
 *
 * Gap closure (phase 5): when a source file is gone, palettes fall back to
 * a single thumbnail frame (provenance `frameSource: "thumbnail"`) and the
 * description falls back to local-vision prose from whichever frames remain
 * (first/mid/last from the file, or the thumbnail), using an Ollama vision
 * model (default qwen3.5:27b). Surrogate records self-heal: when the real
 * file reappears the next run re-derives from it.
 */

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  agentReviewDescription,
  createHumanVideoVisualEnrichmentStore,
  descriptionForVideo,
  echoCatalogDescription,
  findHumanVideoVisualEnrichmentRecord,
  humanVideoVisualEnrichmentEvent,
  localVisionDescriptionStable,
  paletteFromRawFrames,
  paletteStillCurrent,
  upsertHumanVideoVisualEnrichment,
  visualSourceIdentity,
} from "../src/domain/human-video-visual-enrichment.js";
import {
  createHumanVideoEnricherDashboard,
  humanVideoAliasKeys,
  humanVideoIdentity,
  humanVideoKey,
} from "../src/domain/human-video-enrichment.js";
import { createSystemMediaDashboard } from "../src/domain/systemMedia.js";

const execFile = promisify(execFileCallback);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const FRAME_SIZE = 32;
const SAMPLE_FRAME_COUNT = 5;
const STAT_TIMEOUT_MS = 10_000;
const EXTRACT_TIMEOUT_MS = 60_000;
const VISION_FRAME_EDGE = 768;
const VISION_TIMEOUT_MS = 180_000;
const VISION_PROMPT_VERSION = "local-vision-v1";
const VISION_PROMPT =
  "These are frames sampled from one short video clip (first, middle, and last, unless noted). "
  + "In one or two concise sentences, describe it for a music-video director: the dominant subject or scene, "
  + "the color palette and mood, and any notable motion or change across the frames.";
const VISION_PROMPT_SINGLE =
  "This is a single thumbnail frame from one short video clip whose source file is no longer available. "
  + "In one or two concise sentences, describe it for a music-video director: the dominant subject or scene, "
  + "the color palette and mood, and the likely character of the clip. Note that only one frame is visible.";

function requiredArg(value, flag) {
  if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
  return value;
}

function numberArg(value, flag, { minimum = -Infinity, maximum = Infinity, integer = false } = {}) {
  requiredArg(value, flag);
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum || (integer && !Number.isInteger(parsed))) {
    throw new Error(`${flag} received invalid value: ${value}`);
  }
  return parsed;
}

function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    stage: "all",
    apply: false,
    limit: null,
    concurrency: 8,
    vision: true,
    visionModel: "qwen3.5:27b",
    visionUrl: "http://127.0.0.1:11434",
    visionConcurrency: 8,
    repoRoot: DEFAULT_REPO_ROOT,
    outputRoot: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (["--palette", "--description", "--all"].includes(value)) {
      options.stage = value.slice(2);
      continue;
    }
    if (value.startsWith("--stage")) {
      const explicit = value.includes("=") ? value.split("=").slice(1).join("=") : requiredArg(argv[++index], value);
      if (!["palette", "description", "all"].includes(explicit)) throw new Error("--stage must be palette, description, or all");
      options.stage = explicit;
    }
    else if (value === "--apply") options.apply = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--limit") options.limit = numberArg(argv[++index], value, { minimum: 1, integer: true });
    else if (value === "--concurrency") options.concurrency = numberArg(argv[++index], value, { minimum: 1, maximum: 32, integer: true });
    else if (value === "--no-vision") options.vision = false;
    else if (value === "--vision-model") options.visionModel = requiredArg(argv[++index], value);
    else if (value === "--vision-url") options.visionUrl = requiredArg(argv[++index], value).replace(/\/$/u, "");
    else if (value === "--vision-concurrency") options.visionConcurrency = numberArg(argv[++index], value, { minimum: 1, maximum: 32, integer: true });
    else if (value === "--repo-root") options.repoRoot = path.resolve(requiredArg(argv[++index], value));
    else if (value === "--output") options.outputRoot = path.resolve(requiredArg(argv[++index], value));
    else throw new Error(`Unknown argument: ${value}`);
  }
  options.outputRoot ||= path.join(options.repoRoot, "work/human-visual-enrichment");
  return options;
}

function usage() {
  return `Human Enricher accepted visuals enrichment (palette + description)

Usage:
  node scripts/enrich-human-accepted-visuals.mjs [--stage palette|description|all] [--apply]
                                                 [--limit N] [--concurrency N]
                                                 [--repo-root DIR] [--output DIR]

Stages:
  --palette      Extract up to 5 evenly-spaced 32x32 frames per video with ffmpeg and
                 store a deterministic median-cut color profile (8 swatches plus
                 luminance, saturation, hue histogram, warmth, chroma share).
  --description  Join the cheapest trustworthy description per video: agent optical
                 review first, Echo enrichment catalog synopsis second.
  --all          Both stages, in order (default).

Options:
  --apply                Write the store and event journal. Without it the run is a dry
                         run: the plan is printed, the store and journal are left
                         untouched (the run report under work/ is still written).
  --limit N              Process only the first N deterministic targets (default: all).
  --concurrency N        Parallel ffmpeg worker count (default 8, max 32).
  --no-vision            Disable the local-vision description fallback.
  --vision-model NAME    Ollama model for local vision (default qwen3.5:27b).
  --vision-url URL       Ollama base URL (default http://127.0.0.1:11434).
  --vision-concurrency N Parallel vision request count (default 8).
  --repo-root DIR        Repository root (default: the checkout containing this script).
  --output DIR           Run report directory (default: <repo>/work/human-visual-enrichment).
  --help, -h             Show this help.

Resume safety: stored palettes whose source identity (content fingerprint, or path +
size + mtime) still matches are skipped; descriptions only write when the text or
source class changed.
`;
}

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;
const sha256Of = (value) => createHash("sha256").update(value).digest("hex");
const NO_FALLBACK = Symbol("no-fallback");
const readJson = async (filePath, fallback = NO_FALLBACK) => {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (fallback !== NO_FALLBACK && error?.code === "ENOENT") return fallback; throw error; }
};
const atomicWrite = async (filePath, value) => {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, typeof value === "string" ? value : json(value), "utf8");
  await rename(temporary, filePath);
};

// stat on a stalled volume can hang; bound it so one wedged path cannot
// wedge the worker pool (the target is simply treated as unreadable this run).
const statWithTimeout = (filePath, ms = STAT_TIMEOUT_MS) => Promise.race([
  stat(filePath).catch(() => null),
  new Promise((resolve) => setTimeout(() => resolve(null), ms).unref()),
]);

function localPathForVideo(video = {}) {
  const sourcePath = String(video.sourcePath || "").replace(/^file:\/\//u, "");
  if (sourcePath) return sourcePath;
  if (!String(video.uri || "").startsWith("/media/")) return "";
  const relative = String(video.uri).replace(/^\/media\//u, "").split(/[?#]/u)[0];
  try { return path.join(video.__dataRoot, "media", decodeURIComponent(relative)); }
  catch { return path.join(video.__dataRoot, "media", relative); }
}

async function mapPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try { results[index] = { ok: true, value: await worker(items[index], index) }; }
      catch (error) { results[index] = { ok: false, error }; }
    }
  });
  await Promise.all(runners);
  return results;
}

function ffmpegArgsForFrame(filePath, atSeconds) {
  const args = ["-hide_banner", "-loglevel", "error"];
  if (atSeconds !== null) args.push("-ss", atSeconds.toFixed(3), "-i", filePath);
  else args.push("-i", filePath);
  args.push(
    "-frames:v", "1",
    "-vf", `scale=${FRAME_SIZE}:${FRAME_SIZE}:flags=area,format=rgb24`,
    "-f", "rawvideo", "-",
  );
  return args;
}

async function extractRawFrame(ffmpegBin, filePath, atSeconds) {
  // `encoding: "buffer"` is load-bearing: raw video bytes are not UTF-8 and
  // default string decoding would corrupt and miscount them.
  const { stdout } = await execFile(ffmpegBin, ffmpegArgsForFrame(filePath, atSeconds), {
    maxBuffer: 64 * 1024 * 1024,
    timeout: EXTRACT_TIMEOUT_MS,
    encoding: "buffer",
  });
  const expected = FRAME_SIZE * FRAME_SIZE * 3;
  if (stdout.length < expected) {
    throw new Error(`ffmpeg returned ${stdout.length} bytes, expected at least ${expected}`);
  }
  return { data: new Uint8Array(stdout.buffer, stdout.byteOffset, expected), width: FRAME_SIZE, height: FRAME_SIZE };
}

function samplePlanForVideo(video) {
  if (video.mediaType === "image") {
    return { times: [null], basis: "single" };
  }
  const duration = Number(video.duration) > 0 ? Number(video.duration) : null;
  if (!duration) return { times: [null], basis: "first-frame" };
  const times = Array.from({ length: SAMPLE_FRAME_COUNT }, (_, index) =>
    (duration * (index + 0.5)) / SAMPLE_FRAME_COUNT);
  return { times, basis: `duration-${SAMPLE_FRAME_COUNT}th` };
}

function sampleTimesForVideo(video) {
  const plan = samplePlanForVideo(video);
  return { times: plan.times, basis: plan.basis, duration: Number(video.duration) > 0 ? Number(video.duration) : null };
}

function visionVisionChatBody(model, images, prompt, maxTokens = 300) {
  // `think: false` is load-bearing: qwen3.5 thinking models otherwise burn
  // the token budget on reasoning and return an empty content field.
  return {
    model,
    stream: false,
    think: false,
    messages: [{ role: "user", content: prompt, images }],
    options: { temperature: 0.3, num_predict: maxTokens },
  };
}

async function probeVision(visionUrl, visionModel) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    const res = await fetch(`${visionUrl}/api/tags`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return { available: false, modelPresent: false };
    const body = await res.json();
    const entry = (body.models || []).find((model) => model.name === visionModel || model.name === `${visionModel}:latest`);
    return { available: true, modelPresent: Boolean(entry), visionCapable: (entry?.capabilities || []).includes("vision") };
  } catch {
    return { available: false, modelPresent: false };
  }
}

async function visionDescribe(visionUrl, visionModel, images, prompt) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), VISION_TIMEOUT_MS);
  try {
    const res = await fetch(`${visionUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(visionVisionChatBody(visionModel, images, prompt)),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`vision HTTP ${res.status}`);
    const body = await res.json();
    const text = String(body.message?.content || "").replace(/\s+/gu, " ").trim();
    if (!text) throw new Error("vision returned empty content");
    return text.slice(0, 1_200);
  } finally {
    clearTimeout(timer);
  }
}

// Best-effort unload so the batch does not leave a 27B model resident in RAM.
async function visionUnload(visionUrl, visionModel) {
  try {
    await fetch(`${visionUrl}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: visionModel, stream: false, keep_alive: 0, prompt: " ", options: { num_predict: 1 } }),
    });
  } catch { /* unloading is best-effort */ }
}

function visionFrameTimes(video) {
  const duration = Number(video.duration) > 0 ? Number(video.duration) : null;
  if (!duration) return [null, null, null];
  if (duration < 1) return [0, duration / 2, Math.max(0, duration * 0.85)];
  return [0.1, duration * 0.5, Math.max(0.1, duration - 0.3)];
}

/** Extract up to `count` evenly-placed frames from a video as base64 JPEGs. */
async function extractVisionFrames(ffmpegBin, frameDir, target) {
  const { video, filePath, fileStat } = target;
  const times = visionFrameTimes(video);
  const frames = [];
  const stamp = process.pid;
  for (let index = 0; index < Math.min(3, times.length); index += 1) {
    const out = path.join(frameDir, `vision-${stamp}-${index}.jpg`);
    const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
    if (times[index] !== null) args.push("-ss", times[index].toFixed(3));
    args.push("-i", filePath, "-frames:v", "1",
      "-vf", `scale=${VISION_FRAME_EDGE}:-2:force_original_aspect_ratio=decrease,format=yuv420p`,
      "-q:v", "4", "-y", out);
    await execFile(ffmpegBin, args, { maxBuffer: 64 * 1024 * 1024, timeout: EXTRACT_TIMEOUT_MS });
    frames.push((await readFile(out)).toString("base64"));
    await unlink(out).catch(() => {});
  }
  return frames;
}

/** Normalize any local image (thumbnail) to a base64 JPEG for vision input. */
async function imageToBase64Jpeg(ffmpegBin, frameDir, imagePath, label) {
  const out = path.join(frameDir, `vision-${label}-${process.pid}.jpg`);
  await execFile(ffmpegBin, ["-hide_banner", "-loglevel", "error", "-nostdin", "-i", imagePath,
    "-frames:v", "1", "-vf", `scale=${VISION_FRAME_EDGE}:-2:force_original_aspect_ratio=decrease,format=yuv420p`,
    "-q:v", "4", "-y", out], { maxBuffer: 64 * 1024 * 1024, timeout: EXTRACT_TIMEOUT_MS });
  const b64 = (await readFile(out)).toString("base64");
  await unlink(out).catch(() => {});
  return b64;
}

async function detectFfmpeg(repoRoot) {
  const candidates = [process.env.HAPA_FFMPEG_BIN, "ffmpeg"].filter(Boolean);
  for (const candidate of candidates) {
    try {
      const { stdout } = await execFile(candidate, ["-version"], { timeout: 15_000, cwd: repoRoot });
      const version = String(stdout).split("\n", 1)[0].trim();
      if (/ffmpeg version/i.test(version)) return { bin: candidate, version };
    } catch { /* try next candidate */ }
  }
  throw new Error("ffmpeg was not found on PATH (set HAPA_FFMPEG_BIN to override)");
}

function loadEchoSynopses(catalogPath) {
  const synopses = new Map();
  let catalogAvailable = false;
  try {
    const db = new DatabaseSync(catalogPath, { readOnly: true });
    const rows = db.prepare(
      "SELECT v.sha256 AS sha, e.synopsis FROM enrichments e JOIN videos v ON v.media_id = e.media_id WHERE e.status = 'ready' AND e.synopsis IS NOT NULL AND TRIM(e.synopsis) != ''",
    ).all();
    db.close();
    for (const row of rows) {
      const digest = String(row.sha || "").replace(/^sha256:/iu, "").toLowerCase();
      if (/^[a-f0-9]{64}$/.test(digest) && !synopses.has(digest)) synopses.set(digest, row.synopsis);
    }
    catalogAvailable = true;
  } catch {
    catalogAvailable = false;
  }
  return { synopses, catalogAvailable };
}

async function deriveTargets(repoRoot, limit) {
  const dataRoot = path.join(repoRoot, "data");
  const [avatarStore, tarotStore, sceneStore, mediaLibrary, itemStore, songStore, enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore] = await Promise.all([
    readJson(path.join(dataRoot, "avatar-store.json"), { avatars: [] }),
    readJson(path.join(dataRoot, "tarot-store.json"), { cards: [] }),
    readJson(path.join(dataRoot, "scene-store.json"), { scenes: [] }),
    readJson(path.join(dataRoot, "media-library.json"), { records: [] }),
    readJson(path.join(dataRoot, "item-manager-store.json"), { cards: [] }),
    readJson(path.join(dataRoot, "hapa-songs-store.json"), { songs: [] }),
    readJson(path.join(dataRoot, "human-video-enrichments.json"), { records: [] }),
    readJson(path.join(dataRoot, "human-video-agent-reviews.json"), { reviews: [] }),
    readJson(path.join(dataRoot, "human-video-quick-sort-decisions.json"), { decisions: [] }),
    readJson(path.join(dataRoot, "human-video-reference-reviews.json"), { reviews: [] }),
  ]);
  const mediaDashboard = createSystemMediaDashboard({
    avatars: avatarStore.avatars || [], tarotStore, sceneGraph: sceneStore, mediaLibrary, itemStore, songStore,
  });
  const humanDashboard = createHumanVideoEnricherDashboard({
    mediaDashboard, enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore,
    avatars: avatarStore.avatars || [], songs: songStore.songs || [],
  });
  const accepted = humanDashboard.videos
    .filter((video) => video.quickSortDecision?.state === "accepted")
    .map((video) => ({ ...video, __dataRoot: dataRoot }));
  const statResults = await mapPool(accepted, async (video) => {
    const filePath = localPathForVideo(video);
    const fileStat = filePath ? await statWithTimeout(filePath) : null;
    const realFileReadable = Boolean(fileStat?.isFile() && fileStat.size > 0);
    // Thumbnail fallback for records whose source file is gone (surrogate
    // palette/description source). Checked only when the real file is not.
    let thumbnailPath = null;
    let thumbStat = null;
    if (!realFileReadable && video.thumbnailUri) {
      let thumb = String(video.thumbnailUri);
      if (thumb.startsWith("/media/")) {
        const rel = thumb.replace(/^\/media\//u, "").split(/[?#]/u)[0];
        try { thumb = path.join(dataRoot, "media", decodeURIComponent(rel)); }
        catch { thumb = path.join(dataRoot, "media", rel); }
      }
      thumbStat = await statWithTimeout(thumb);
      if (thumbStat?.isFile() && thumbStat.size > 0) thumbnailPath = thumb;
      else thumbStat = null;
    }
    return {
      ...video,
      __filePath: filePath || null,
      __fileStat: realFileReadable ? fileStat : null,
      __thumbnailPath: thumbnailPath,
      __thumbnailStat: thumbStat,
    };
  }, 16);
  const withStats = statResults.map((result) => result.value);
  const toTarget = (video) => {
    const key = video.humanVideoKey || humanVideoKey(video);
    return {
      video,
      key,
      aliases: video.humanVideoAliases || humanVideoAliasKeys(video),
      filePath: video.__filePath,
      fileStat: video.__fileStat,
      realFileReadable: Boolean(video.__fileStat),
      thumbnailPath: video.__thumbnailPath || null,
      thumbnailStat: video.__thumbnailStat || null,
    };
  };
  const allTargets = withStats
    // readable files, plus unreadable ones that still have a usable thumbnail
    .filter((video) => video.__fileStat || video.__thumbnailPath)
    .map(toTarget)
    .sort((a, b) => a.key.localeCompare(b.key) || String(a.video.id || "").localeCompare(String(b.video.id || "")));
  const allReadable = allTargets.filter((target) => target.realFileReadable);
  return { dashboard: humanDashboard, allReadable, allTargets, targets: limit ? allTargets.slice(0, limit) : allTargets };
}

function recordPayloadFor(target, extra = {}) {
  const { video, key, aliases } = target;
  return {
    key,
    aliases,
    videoId: video.id || key,
    videoName: video.name || video.id || key,
    mediaType: video.mediaType || "video",
    videoIdentity: humanVideoIdentity(video),
    ...extra,
  };
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  const startedAt = new Date().toISOString();
  const runId = `human-visual-enrichment-${startedAt.replace(/[:.]/gu, "-")}`;
  const repoRoot = options.repoRoot;
  const dataRoot = path.join(repoRoot, "data");
  const storePath = path.join(dataRoot, "human-video-visual-enrichments.json");
  const eventsPath = path.join(dataRoot, "human-video-visual-enrichment-events.ndjson");
  const backupsRoot = path.join(dataRoot, "backups");
  const outputRoot = options.outputRoot;

  console.log(`[plan] stage=${options.stage} apply=${options.apply} limit=${options.limit ?? "none"} concurrency=${options.concurrency}`);
  const { dashboard, allReadable, allTargets, targets } = await deriveTargets(repoRoot, options.limit);
  console.log(`[plan] accepted=${dashboard.summary.quickSortAccepted} readable=${allReadable.length} surrogate-eligible=${allTargets.length - allReadable.length} selected=${targets.length}`);

  const storeFile = await readFile(storePath, "utf8").catch((error) => (error?.code === "ENOENT" ? null : error));
  if (storeFile instanceof Error) throw storeFile;
  let store = storeFile ? createHumanVideoVisualEnrichmentStore(JSON.parse(storeFile)) : createHumanVideoVisualEnrichmentStore({});

  const stagesToRun = options.stage === "all" ? ["palette", "description"] : [options.stage];
  const visionRequested = options.vision && stagesToRun.includes("description");
  const visionProbe = visionRequested ? await probeVision(options.visionUrl, options.visionModel) : { available: false, modelPresent: false };
  const needsFfmpeg = stagesToRun.includes("palette") || (visionRequested && visionProbe.available && visionProbe.modelPresent);
  const ffmpeg = needsFfmpeg ? await detectFfmpeg(repoRoot) : null;
  const visionAvailable = Boolean(visionRequested && visionProbe.available && visionProbe.modelPresent && ffmpeg);
  if (visionRequested && !visionAvailable) {
    console.log(`[warn] local vision unavailable (url=${options.visionUrl} model=${options.visionModel} present=${visionProbe.modelPresent}); description fallback will use agent/echo only`);
  }
  if (visionAvailable) {
    console.log(`[plan] local vision: ${options.visionModel} @ ${options.visionUrl} (concurrency ${options.visionConcurrency})`);
  }
  const { synopses: echoSynopses, catalogAvailable } = stagesToRun.includes("description")
    ? loadEchoSynopses(path.join(repoRoot, "artifacts/echo-video-enrichment-v1/catalog.sqlite3"))
    : { synopses: new Map(), catalogAvailable: false };
  if (stagesToRun.includes("description")) {
    console.log(`[plan] echo catalog available=${catalogAvailable} synopses=${echoSynopses.size}`);
  }
  const frameDir = path.join(outputRoot, "vision-frames");
  if (visionAvailable) await mkdir(frameDir, { recursive: true });
  const visionStats = { calls: 0, failures: 0, totalMs: 0 };

  const events = [];
  const stageReports = {};
  const changedRecords = new Map();
  // Upserts are read-modify-write over the in-memory store, so the store
  // mutation itself is serialized; ffmpeg extraction stays parallel.
  let storeLock = Promise.resolve();
  const withStoreLock = (fn) => {
    const run = storeLock.then(fn);
    storeLock = run.catch(() => {});
    return run;
  };

  for (const stage of stagesToRun) {
    const report = { processed: 0, skippedUpToDate: 0, kept: 0, deferred: 0, failed: 0, failures: [] };
    const recordMutation = (target, extra) => withStoreLock(() => {
      const stored = findHumanVideoVisualEnrichmentRecord(store, { key: target.key, aliases: target.aliases });
      const upserted = upsertHumanVideoVisualEnrichment(store, recordPayloadFor(target, extra));
      store = upserted.store;
      if (upserted.changed) {
        events.push(humanVideoVisualEnrichmentEvent({ record: upserted.record, stage, actorId: "scripts/enrich-human-accepted-visuals" }));
        changedRecords.set(upserted.record.key, upserted.record);
      }
      return { stored, upserted };
    });
    const worker = async (target) => {
      if (stage === "palette") {
        const stored = findHumanVideoVisualEnrichmentRecord(store, { key: target.key, aliases: target.aliases });
        // Surrogate fallback: when the source file is gone, sample the surviving
        // thumbnail instead. Identity comes from the same helper either way.
        const frameSource = target.realFileReadable ? "video-file" : "thumbnail";
        const identitySource = target.realFileReadable
          ? { fileStat: target.fileStat, filePath: target.filePath }
          : { fileStat: target.thumbnailStat, filePath: target.thumbnailPath };
        const currentIdentity = visualSourceIdentity(target.video, identitySource.fileStat, { filePath: identitySource.filePath });
        if (currentIdentity.basis === "none") throw new Error("no local source identity (no fingerprint, path, or stat)");
        if (stored?.palette?.source && paletteStillCurrent(stored.palette.source, currentIdentity, { realFileReadable: target.realFileReadable })) {
          return { skipped: true };
        }
        const isThumbnail = frameSource === "thumbnail";
        const { times, basis, duration } = isThumbnail ? { times: [null], basis: "thumbnail", duration: null } : sampleTimesForVideo(target.video);
        const sourcePath = target.realFileReadable ? target.filePath : target.thumbnailPath;
        const frames = [];
        const failedAt = [];
        for (const at of times) {
          try {
            frames.push(await extractRawFrame(ffmpeg.bin, sourcePath, at));
          } catch (error) {
            failedAt.push({ at: at === null ? null : Number(at.toFixed(3)), error: String(error?.message || error).slice(0, 200) });
          }
        }
        if (!frames.length) throw new Error(`all ${times.length} frame extractions failed; last: ${failedAt.at(-1)?.error}`);
        const palette = paletteFromRawFrames(frames, { swatchCount: 8 });
        palette.source = {
          sourceIdentity: currentIdentity,
          frameSource,
          sampleTimes: times.map((value) => (value === null ? null : Number(value.toFixed(3)))),
          sampleTimesBasis: isThumbnail ? "thumbnail" : basis,
          sampleFailures: failedAt.length ? failedAt : 0,
          duration,
          ffmpegVersion: ffmpeg.version,
        };
        const { upserted } = await recordMutation(target, { palette });
        if (upserted.changed || !stored?.palette) return { processed: true };
        return { skipped: true };
      }
      // description stage — authority ladder: stored (untouched) > agent >
      // local vision > echo catalog. Local vision is the gap-closer.
      const stored = findHumanVideoVisualEnrichmentRecord(store, { key: target.key, aliases: target.aliases });
      const visionConfig = { model: options.visionModel, promptVersion: VISION_PROMPT_VERSION };
      if (stored?.description) {
        if (stored.description.sourceClass !== "local-vision") return { kept: true };
        if (localVisionDescriptionStable(stored.description, visionConfig, { realFileReadable: target.realFileReadable })) {
          return { skipped: true };
        }
        if (!visionAvailable) return { deferred: true };
        // fall through: re-derive with the newer config (agent wins if one exists)
      }
      const agent = agentReviewDescription(target.video.agentReview);
      if (agent) {
        const { upserted } = await recordMutation(target, { description: agent });
        return { processed: upserted.changed ? true : "kept" };
      }
      let derived = null;
      if (visionAvailable) {
        const canDescribe = target.realFileReadable || Boolean(target.thumbnailPath);
        if (canDescribe) {
          visionStats.calls += 1;
          const started = Date.now();
          try {
            const images = target.realFileReadable
              ? await extractVisionFrames(ffmpeg.bin, frameDir, target)
              : [await imageToBase64Jpeg(ffmpeg.bin, frameDir, target.thumbnailPath, "thumb")];
            const prompt = images.length > 1 ? VISION_PROMPT : VISION_PROMPT_SINGLE;
            derived = {
              text: await visionDescribe(options.visionUrl, options.visionModel, images, prompt),
              sourceClass: "local-vision",
              provenance: {
                provider: "ollama",
                model: options.visionModel,
                promptVersion: VISION_PROMPT_VERSION,
                frameSource: target.realFileReadable ? "video-frames" : "thumbnail",
                frameCount: images.length,
              },
            };
          } catch (error) {
            visionStats.failures += 1;
            throw new Error(`local vision failed: ${String(error?.message || error).slice(0, 200)}`);
          } finally {
            visionStats.totalMs += Date.now() - started;
          }
        }
      }
      if (!derived) {
        derived = descriptionForVideo(target.video, { echoSynopses, catalogTable: "enrichments" });
      }
      if (!derived) return stored?.description ? { kept: true } : { skipped: true };
      const { upserted } = await recordMutation(target, { description: derived });
      return { processed: upserted.changed ? true : "kept" };
    };

    const results = await mapPool(targets, worker, stage === "palette" ? options.concurrency : (visionAvailable ? options.visionConcurrency : 32));
    for (const result of results) {
      if (!result.ok) {
        report.failed += 1;
        if (report.failures.length < 50) report.failures.push({ error: String(result.error?.message || result.error).slice(0, 300) });
        continue;
      }
      if (result.value.skipped) report.skippedUpToDate += 1;
      else if (result.value.processed === "kept" || result.value.kept) report.kept += 1;
      else if (result.value.deferred) report.deferred += 1;
      else if (result.value.processed) report.processed += 1;
    }
    if (stage === "description" && visionAvailable) {
      await visionUnload(options.visionUrl, options.visionModel);
    }
    stageReports[stage] = report;
    console.log(`[${stage}] processed=${report.processed} skipped=${report.skippedUpToDate} kept=${report.kept} deferred=${report.deferred} failed=${report.failed}`);
  }

  const nextBytes = json(store);
  const storeUnchanged = storeFile !== null && nextBytes === storeFile;
  if (storeUnchanged) {
    console.log(`[write] store unchanged (resume-safe rerun); nothing to write`);
  } else if (!options.apply) {
    console.log(`[dry-run] would write ${store.records.length} records (${changedRecords.size} changed) to ${path.relative(repoRoot, storePath)}; rerun with --apply to commit`);
  } else {
    if (storeFile !== null) {
      const backupDir = path.join(backupsRoot, runId);
      await mkdir(backupDir, { recursive: true });
      await copyFile(storePath, path.join(backupDir, path.basename(storePath)));
    }
    await atomicWrite(storePath, nextBytes);
    if (events.length) {
      // NDJSON: one compact object per line (journal convention). Existing
      // lines are re-serialized through the parser so the file stays
      // machine-readable line-by-line.
      const existingLines = (await readFile(eventsPath, "utf8").catch(() => ""))
        .split("\n").filter((line) => line.trim())
        .map((line) => JSON.stringify(JSON.parse(line)));
      const lines = [...existingLines, ...events.map((event) => JSON.stringify(event))];
      await writeFile(eventsPath, `${lines.join("\n")}\n`, "utf8");
    }
    console.log(`[write] store=${store.records.length} records changed=${changedRecords.size} events=${events.length} backup=${storeFile !== null ? runId : "first-write"}`);
  }

  // Coverage across the whole store (not just the --limit slice).
  const bySourceClass = new Map();
  let withPalette = 0;
  let withDescription = 0;
  for (const record of store.records) {
    if (record.palette) withPalette += 1;
    if (record.description) {
      withDescription += 1;
      bySourceClass.set(record.description.sourceClass, Number(bySourceClass.get(record.description.sourceClass) || 0) + 1);
    }
  }
  const report = {
    schemaVersion: "hapa.human-visual-enrichment-run-report.v1",
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    repoRoot,
    options: { stage: options.stage, apply: options.apply, limit: options.limit, concurrency: options.concurrency },
    ffmpeg: ffmpeg ? { bin: ffmpeg.bin, version: ffmpeg.version } : null,
    dashboardSummary: dashboard.summary,
    targets: {
      selected: targets.length,
      readableTotal: allReadable.length,
      surrogateTotal: allTargets.length - allReadable.length,
      acceptedTotal: dashboard.summary.quickSortAccepted,
    },
    stages: stageReports,
    store: { records: store.records.length, updatedAt: store.updatedAt, storeUnchanged, storeSha256: sha256Of(nextBytes) },
    vision: visionAvailable
      ? { model: options.visionModel, url: options.visionUrl, calls: visionStats.calls, failures: visionStats.failures, totalMs: visionStats.totalMs }
      : null,
    coverage: {
      withPalette,
      withDescription,
      descriptionBySourceClass: Object.fromEntries([...bySourceClass.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
      paletteByFrameSource: Object.fromEntries(
        [...new Set(store.records.filter((record) => record.palette).map((record) => record.palette.source?.frameSource || "video-file"))]
          .sort()
          .map((source) => [source, store.records.filter((record) => record.palette && (record.palette.source?.frameSource || "video-file") === source).length]),
      ),
    },
  };
  await atomicWrite(path.join(outputRoot, `${runId}.json`), report);
  console.log(`[report] ${path.relative(repoRoot, path.join(outputRoot, `${runId}.json`))}`);
  if (Object.values(stageReports).some((entry) => entry.failed > 0)) {
    console.log(`[warn] ${Object.values(stageReports).reduce((sum, entry) => sum + entry.failed, 0)} targets failed; see report failures`);
  }
}

main().catch((error) => {
  console.error(`[error] ${error?.message || error}`);
  if (process.env.DEBUG) console.error(error);
  process.exitCode = 1;
});
