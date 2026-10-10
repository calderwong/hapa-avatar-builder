#!/usr/bin/env node
/**
 * Wave 1 description quality uplift using Grok 4.6 in the Hermes/xAI harness.
 *
 * Replaces `local-vision` and `echo-enrichment` text on Human Enricher accepted
 * videos. Never overwrites `agent-optical` (gpt-5.6-terra) descriptions.
 *
 * Usage:
 *   node scripts/upgrade-human-accepted-descriptions-grok.mjs [--apply] [--limit N] [--concurrency N] [--offset N]
 */
import { execFile as execFileCallback } from "node:child_process";
import { readFileSync } from "node:fs";
import { appendFile, copyFile, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  createHumanVideoVisualEnrichmentStore,
  findHumanVideoVisualEnrichmentRecord,
  humanVideoVisualEnrichmentEvent,
  upsertHumanVideoVisualEnrichment,
} from "../src/domain/human-video-visual-enrichment.js";

const execFile = promisify(execFileCallback);
const SCRIPT_PATH = fileURLToPath(import.meta.url);
const REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const QUEUE_PATH = path.join(REPO_ROOT, "work/human-visual-enrichment/description-quality-queue-grok-2026-09-08.json");
const STORE_PATH = path.join(REPO_ROOT, "data/human-video-visual-enrichments.json");
const EVENTS_PATH = path.join(REPO_ROOT, "data/human-video-visual-enrichment-events.ndjson");
const BACKUPS_ROOT = path.join(REPO_ROOT, "data/backups");
const OUTPUT_ROOT = path.join(REPO_ROOT, "work/human-visual-enrichment");
const PROMPT_VERSION = "hermes-grok-optical-v1";
const SOURCE_CLASS = "hermes-grok-optical";
const MODEL = "grok-4.6";
const FRAME_EDGE = 768;
const EXTRACT_TIMEOUT_MS = 60_000;
const VISION_TIMEOUT_MS = 90_000;
const PROMPT = [
  "These three images are the First, Middle, and Last frames of one short video clip, in that order.",
  "Write one specific overall visual description grounded in all three frames.",
  "Length: 80 to 1200 characters.",
  "Describe only visible content: subjects, setting, wardrobe, lighting, color, and how the shot changes across the three frames.",
  "Do not add quality scores, tags, categories, Hapa lore, Card IDs, director notes, confidence, or speculation about off-screen events or audio.",
].join(" ");

function loadDotEnv(filePath) {
  try {
    const text = readFileSync(filePath, "utf8");
    for (const line of text.split("\n")) {
      let trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
      if (trimmed.startsWith("export ")) trimmed = trimmed.slice(7).trim();
      const index = trimmed.indexOf("=");
      const key = trimmed.slice(0, index).trim();
      let value = trimmed.slice(index + 1).trim();
      if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key && process.env[key] == null) process.env[key] = value;
    }
  } catch {
    /* missing env file is fine */
  }
}

loadDotEnv(path.join(process.env.HOME || "", ".hermes/profiles/conviction/.env"));
loadDotEnv(path.join(process.env.HOME || "", ".hermes/.env"));

function parseArgs(argv = process.argv.slice(2)) {
  const options = { apply: false, limit: null, offset: 0, concurrency: 2, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") options.apply = true;
    else if (value === "--help" || value === "-h") options.help = true;
    else if (value === "--limit") options.limit = Number(argv[++index]);
    else if (value === "--offset") options.offset = Number(argv[++index]);
    else if (value === "--concurrency") options.concurrency = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${value}`);
  }
  if (options.limit != null && (!Number.isInteger(options.limit) || options.limit < 1)) throw new Error("--limit must be a positive integer");
  if (!Number.isInteger(options.offset) || options.offset < 0) throw new Error("--offset must be a non-negative integer");
  if (!Number.isInteger(options.concurrency) || options.concurrency < 1 || options.concurrency > 8) throw new Error("--concurrency must be 1..8");
  return options;
}

function progress(line) {
  console.log(line);
  appendFile(path.join(OUTPUT_ROOT, "grok-uplift-progress.log"), `${new Date().toISOString()} ${line}\n`).catch(() => {});
}

function visionFrameTimes(duration) {
  const seconds = Number(duration);
  if (!(seconds > 0)) return [0.1, null, null];
  if (seconds < 1) return [0, seconds / 2, Math.max(0, seconds * 0.85)];
  return [0.1, seconds * 0.5, Math.max(0.1, seconds - 0.3)];
}

async function extractJpeg(ffmpegBin, filePath, atSeconds, outPath) {
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin"];
  if (atSeconds != null) args.push("-ss", Number(atSeconds).toFixed(3));
  args.push("-i", filePath, "-frames:v", "1",
    "-vf", `scale=${FRAME_EDGE}:-2:force_original_aspect_ratio=decrease,format=yuv420p`,
    "-q:v", "4", "-y", outPath);
  await execFile(ffmpegBin, args, { maxBuffer: 32 * 1024 * 1024, timeout: EXTRACT_TIMEOUT_MS });
  return (await readFile(outPath)).toString("base64");
}

function candidateSourcePaths(item) {
  const paths = [];
  if (item.sourcePath) paths.push(item.sourcePath);
  const uri = String(item.uri || "");
  if (uri.startsWith("/media/")) {
    const rel = decodeURIComponent(uri.replace(/^\/media\//u, "").split(/[?#]/u)[0]);
    const alt = path.join(REPO_ROOT, "data/media", rel);
    if (!paths.includes(alt)) paths.push(alt);
  }
  return paths;
}

async function extractThreeFrames(ffmpegBin, frameDir, item, index) {
  const times = visionFrameTimes(item.duration);
  const paths = candidateSourcePaths(item);
  let lastError = new Error("no source path");
  for (const filePath of paths) {
    const frames = [];
    try {
      for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
        const out = path.join(frameDir, `grok-${process.pid}-${index}-${frameIndex}.jpg`);
        try {
          frames.push(await extractJpeg(ffmpegBin, filePath, times[frameIndex], out));
        } finally {
          await unlink(out).catch(() => {});
        }
      }
      return frames;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

function grokBody(images) {
  const content = [
    { type: "text", text: PROMPT },
    ...images.map((image, index) => ({
      type: "image_url",
      image_url: {
        url: `data:image/jpeg;base64,${image}`,
        detail: "high",
      },
      // label is not a standard field; order is First, Middle, Last via the text prompt
      _role: ["First", "Middle", "Last"][index],
    })),
  ].map(({ _role, ...rest }) => rest);
  return {
    model: MODEL,
    temperature: 0.3,
    max_tokens: 600,
    messages: [{ role: "user", content }],
  };
}

async function grokDescribe(apiKey, images) {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(grokBody(images)),
    signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`xAI HTTP ${response.status}: ${raw.slice(0, 400)}`);
  const body = JSON.parse(raw);
  const text = String(body.choices?.[0]?.message?.content || "").replace(/\s+/gu, " ").trim();
  if (text.length < 80) throw new Error(`description too short (${text.length} chars)`);
  return text.slice(0, 1200);
}

async function mapPool(items, worker, concurrency) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      try { results[index] = { ok: true, value: await worker(items[index], index) }; }
      catch (error) {
        progress(`[fail] ${items[index]?.key || index} ${String(error?.message || error).slice(0, 200)}`);
        results[index] = { ok: false, error };
      }
    }
  });
  await Promise.all(runners);
  return results;
}

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, typeof value === "string" ? value : `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, filePath);
}

async function main() {
  const options = parseArgs();
  if (options.help) {
    process.stdout.write(`Upgrade Wave 1 descriptions with Grok 4.6 (Hermes/xAI)\n\n  --apply          write store + events (default dry-run)\n  --limit N        process at most N queue items\n  --offset N       skip the first N queue items\n  --concurrency N  parallel xAI calls (default 2, max 8)\n`);
    return;
  }
  const apiKey = String(process.env.XAI_API_KEY || "").trim();
  if (!apiKey) throw new Error("XAI_API_KEY is not set (expected in the conviction Hermes .env)");
  const queue = JSON.parse(await readFile(QUEUE_PATH, "utf8"));
  const slice = queue.wave1.slice(options.offset, options.limit ? options.offset + options.limit : undefined);
  console.log(`[plan] model=${MODEL} prompt=${PROMPT_VERSION} apply=${options.apply} offset=${options.offset} selected=${slice.length}/${queue.wave1.length} concurrency=${options.concurrency}`);

  const storeFile = await readFile(STORE_PATH, "utf8");
  let store = createHumanVideoVisualEnrichmentStore(JSON.parse(storeFile));
  let storeLock = Promise.resolve();
  const withStoreLock = (fn) => {
    const run = storeLock.then(fn);
    storeLock = run.catch(() => {});
    return run;
  };

  const frameDir = path.join(OUTPUT_ROOT, "grok-frames");
  await mkdir(frameDir, { recursive: true });
  const ffmpegBin = process.env.HAPA_FFMPEG_BIN || "ffmpeg";
  const startedAt = new Date().toISOString();
  const report = { processed: 0, skipped: 0, keptAgentOptical: 0, failed: 0, failures: [] };
  const events = [];
  let backedUp = false;
  let pendingEvents = [];

  const persistStore = async () => {
    if (!options.apply) return;
    await atomicWrite(STORE_PATH, store);
    if (pendingEvents.length) {
      await appendFile(EVENTS_PATH, pendingEvents.map((event) => `${JSON.stringify(event)}\n`).join(""), "utf8");
      pendingEvents = [];
    }
  };

  const results = await mapPool(slice, async (item, index) => {
    const stored = findHumanVideoVisualEnrichmentRecord(store, { key: item.key, aliases: item.aliases });
    const existingClass = stored?.description?.sourceClass;
    if (existingClass === "agent-optical") {
      report.keptAgentOptical += 1;
      return { status: "kept-agent-optical", key: item.key };
    }
    const provenance = stored?.description?.provenance || {};
    if (existingClass === SOURCE_CLASS && provenance.model === MODEL && provenance.promptVersion === PROMPT_VERSION) {
      report.skipped += 1;
      return { status: "skipped-current", key: item.key };
    }
    const started = Date.now();
    const frames = await extractThreeFrames(ffmpegBin, frameDir, item, index);
    const text = await grokDescribe(apiKey, frames);
    if (text.length < 80 || text.length > 1200) throw new Error(`length ${text.length} outside 80-1200`);
    const description = {
      text,
      sourceClass: SOURCE_CLASS,
      provenance: {
        provider: "xai-hermes",
        model: MODEL,
        promptVersion: PROMPT_VERSION,
        frameCount: 3,
        frameSource: "video-file",
        replacedSourceClass: existingClass || item.sourceClass,
      },
    };
    if (!options.apply) {
      report.processed += 1;
      return { status: "dry-run", key: item.key, chars: text.length, preview: text.slice(0, 140) };
    }
    await withStoreLock(async () => {
      if (!backedUp) {
        await mkdir(BACKUPS_ROOT, { recursive: true });
        const backupPath = path.join(BACKUPS_ROOT, `human-video-visual-enrichments.${startedAt.replace(/[:.]/gu, "-")}.json`);
        await copyFile(STORE_PATH, backupPath);
        backedUp = true;
        console.log(`[backup] ${backupPath}`);
      }
      const upserted = upsertHumanVideoVisualEnrichment(store, {
        key: stored?.key || item.key,
        aliases: item.aliases,
        videoId: item.videoId,
        videoName: item.videoName,
        description,
      });
      store = upserted.store;
      if (upserted.changed) {
        events.push(humanVideoVisualEnrichmentEvent({
          record: upserted.record,
          stage: "description",
          actorId: "scripts/upgrade-human-accepted-descriptions-grok",
        }));
        pendingEvents.push(events.at(-1));
      }
    });
    report.processed += 1;
    if (options.apply && report.processed % 10 === 0) await persistStore();
    progress(`[ok] ${item.key} chars=${text.length} ms=${Date.now() - started} grok=${report.processed}`);
    return { status: "applied", key: item.key, chars: text.length };
  }, options.concurrency);

  for (const result of results) {
    if (result.ok) continue;
    report.failed += 1;
    report.failures.push(String(result.error?.message || result.error).slice(0, 300));
  }

  if (options.apply) await persistStore();

  const byClass = new Map();
  for (const record of store.records) {
    const sourceClass = record.description?.sourceClass || "none";
    byClass.set(sourceClass, Number(byClass.get(sourceClass) || 0) + 1);
  }
  const runId = `grok-description-uplift-${startedAt.replace(/[:.]/gu, "-")}`;
  const reportPath = path.join(OUTPUT_ROOT, `${runId}.json`);
  const payload = {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    apply: options.apply,
    model: MODEL,
    promptVersion: PROMPT_VERSION,
    selected: slice.length,
    report,
    dryRunSamples: results.filter((result) => result.ok && result.value?.preview).slice(0, 5).map((result) => result.value),
    coverage: Object.fromEntries(byClass),
  };
  await atomicWrite(reportPath, payload);
  console.log(`[done] processed=${report.processed} skipped=${report.skipped} keptAgentOptical=${report.keptAgentOptical} failed=${report.failed}`);
  console.log(`[coverage] ${JSON.stringify(payload.coverage)}`);
  if (report.failures.length) console.log(`[failures] ${report.failures.slice(0, 8).join(" | ")}`);
  console.log(`[report] ${reportPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
