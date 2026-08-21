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
 */

import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

import {
  createHumanVideoVisualEnrichmentStore,
  descriptionForVideo,
  findHumanVideoVisualEnrichmentRecord,
  humanVideoVisualEnrichmentEvent,
  paletteFromRawFrames,
  sourceIdentityMatches,
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
    return { ...video, __filePath: filePath || null, __fileStat: fileStat?.isFile() && fileStat.size > 0 ? fileStat : null };
  }, 16);
  const withStats = statResults.map((result) => result.value);
  const readable = withStats.filter((video) => video.__fileStat).map((video) => {
    const key = video.humanVideoKey || humanVideoKey(video);
    return {
      video,
      key,
      aliases: video.humanVideoAliases || humanVideoAliasKeys(video),
      filePath: video.__filePath,
      fileStat: video.__fileStat,
    };
  }).sort((a, b) => a.key.localeCompare(b.key) || String(a.video.id || "").localeCompare(String(b.video.id || "")));
  return { dashboard: humanDashboard, allReadable: readable, targets: limit ? readable.slice(0, limit) : readable };
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

function paletteUpToDate(storedRecord, currentIdentity) {
  if (!storedRecord?.palette?.source) return false;
  if (!sourceIdentityMatches(storedRecord.palette.source.sourceIdentity, currentIdentity)) return false;
  // A partial extraction (sampleFailures recorded) is never final: rerun
  // re-derives it so a transiently stalled file heals on the next pass.
  return !storedRecord.palette.source.sampleFailures;
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
  const { dashboard, allReadable, targets } = await deriveTargets(repoRoot, options.limit);
  console.log(`[plan] accepted=${dashboard.summary.quickSortAccepted} readable=${allReadable.length} selected=${targets.length}`);

  const storeFile = await readFile(storePath, "utf8").catch((error) => (error?.code === "ENOENT" ? null : error));
  if (storeFile instanceof Error) throw storeFile;
  let store = storeFile ? createHumanVideoVisualEnrichmentStore(JSON.parse(storeFile)) : createHumanVideoVisualEnrichmentStore({});

  const stagesToRun = options.stage === "all" ? ["palette", "description"] : [options.stage];
  const ffmpeg = stagesToRun.includes("palette") ? await detectFfmpeg(repoRoot) : null;
  const { synopses: echoSynopses, catalogAvailable } = stagesToRun.includes("description")
    ? loadEchoSynopses(path.join(repoRoot, "artifacts/echo-video-enrichment-v1/catalog.sqlite3"))
    : { synopses: new Map(), catalogAvailable: false };
  if (stagesToRun.includes("description")) {
    console.log(`[plan] echo catalog available=${catalogAvailable} synopses=${echoSynopses.size}`);
  }

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
    const report = { processed: 0, skippedUpToDate: 0, kept: 0, failed: 0, failures: [] };
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
        const currentIdentity = visualSourceIdentity(target.video, target.fileStat, { filePath: target.filePath });
        if (currentIdentity.basis === "none") throw new Error("no local source identity (no fingerprint, path, or stat)");
        const stored = findHumanVideoVisualEnrichmentRecord(store, { key: target.key, aliases: target.aliases });
        if (stored?.palette && paletteUpToDate(stored, currentIdentity)) return { skipped: true };
        const { times, basis, duration } = sampleTimesForVideo(target.video);
        const frames = [];
        const failedAt = [];
        for (const at of times) {
          try {
            frames.push(await extractRawFrame(ffmpeg.bin, target.filePath, at));
          } catch (error) {
            failedAt.push({ at: at === null ? null : Number(at.toFixed(3)), error: String(error?.message || error).slice(0, 200) });
          }
        }
        if (!frames.length) throw new Error(`all ${times.length} frame extractions failed; last: ${failedAt.at(-1)?.error}`);
        const palette = paletteFromRawFrames(frames, { swatchCount: 8 });
        palette.source = {
          sourceIdentity: currentIdentity,
          sampleTimes: times.map((value) => (value === null ? null : Number(value.toFixed(3)))),
          sampleTimesBasis: basis,
          sampleFailures: failedAt.length ? failedAt : 0,
          duration,
          ffmpegVersion: ffmpeg.version,
        };
        const { upserted } = await recordMutation(target, { palette });
        if (upserted.changed || !stored?.palette) return { processed: true };
        return { skipped: true };
      }
      // description stage
      const derived = descriptionForVideo(target.video, { echoSynopses, catalogTable: "enrichments" });
      const stored = findHumanVideoVisualEnrichmentRecord(store, { key: target.key, aliases: target.aliases });
      if (!derived) {
        return stored?.description ? { kept: true } : { skipped: true };
      }
      if (stored?.description && stored.description.text === derived.text && stored.description.sourceClass === derived.sourceClass) {
        return { skipped: true };
      }
      const { upserted } = await recordMutation(target, { description: derived });
      return { processed: upserted.changed ? true : "kept" };
    };

    const results = await mapPool(targets, worker, stage === "palette" ? options.concurrency : 32);
    for (const result of results) {
      if (!result.ok) {
        report.failed += 1;
        if (report.failures.length < 50) report.failures.push({ error: String(result.error?.message || result.error).slice(0, 300) });
        continue;
      }
      if (result.value.skipped) report.skippedUpToDate += 1;
      else if (result.value.processed === "kept" || result.value.kept) report.kept += 1;
      else if (result.value.processed) report.processed += 1;
    }
    stageReports[stage] = report;
    console.log(`[${stage}] processed=${report.processed} skipped=${report.skippedUpToDate} kept=${report.kept} failed=${report.failed}`);
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
      const existing = await readFile(eventsPath, "utf8").catch(() => "");
      const prefix = existing && !existing.endsWith("\n") ? "\n" : "";
      await writeFile(eventsPath, `${existing}${prefix}${events.map((event) => json(event)).join("")}`, "utf8");
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
    targets: { selected: targets.length, readableTotal: allReadable.length, acceptedTotal: dashboard.summary.quickSortAccepted },
    stages: stageReports,
    store: { records: store.records.length, updatedAt: store.updatedAt, storeUnchanged, storeSha256: sha256Of(nextBytes) },
    coverage: {
      withPalette,
      withDescription,
      descriptionBySourceClass: Object.fromEntries([...bySourceClass.entries()].sort((a, b) => a[0].localeCompare(b[0]))),
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
