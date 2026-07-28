#!/usr/bin/env node
import { createReadStream } from "node:fs";
import {
  access,
  copyFile,
  mkdir,
  readFile,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { normalizeSystemMediaLibrary } from "../src/domain/systemMedia.js";
import {
  buildVibesTransitionFrameCatalog,
  countVibesTransitionJobs,
  createVibesTransitionJob,
  createVibesTransitionMediaRecord,
  createVibesTransitionQueue,
  enqueueVibesTransitionJobs,
  fillVibesTransitionBuffer,
  markVibesTransitionFailed,
  markVibesTransitionReady,
  markVibesTransitionSubmitted,
} from "../src/domain/vibes-transition-links.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const STATE_DIR = path.join(DATA_DIR, "vibes-transition-links");
const CLAIMS_DIR = path.join(STATE_DIR, "claims");
const EVENTS_PATH = path.join(STATE_DIR, "events.ndjson");
const QUEUE_PATH = path.join(STATE_DIR, "queue.json");
const CATALOG_PATH = path.join(STATE_DIR, "frame-catalog.json");
const MEDIA_DIR = path.join(DATA_DIR, "media", "vibes-transition-links");
const MEDIA_LIBRARY_PATH = path.join(DATA_DIR, "media-library.json");
const AVATAR_STORE_PATH = path.join(DATA_DIR, "avatar-store.json");
const SCENE_STORE_PATH = path.join(DATA_DIR, "scene-store.json");
const REFERENCE_MEDIA_PATH = path.join(DATA_DIR, "echo-reference-animated-media.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const REPORT_DIR = path.join(DATA_DIR, "merge-reports");

async function main() {
  const { command, flags, positionals } = parseArgs(process.argv.slice(2));
  if (command === "catalog") return catalogCommand(flags);
  if (command === "enqueue") return enqueueCommand(flags);
  if (command === "seed") return seedCommand(flags);
  if (command === "pump") return pumpCommand(flags);
  if (command === "submit") return submitCommand(flags, positionals);
  if (command === "complete") return completeCommand(flags, positionals);
  if (command === "fail") return failCommand(flags, positionals);
  if (command === "status") return statusCommand(flags);
  if (command === "help" || !command) return printHelp();
  throw new Error(`Unknown transition-link command "${command}". Run: npm run echo:transitions -- help`);
}

function parseArgs(values = []) {
  const [command = "", ...rest] = values;
  const flags = {};
  const positionals = [];
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      index += 1;
    } else {
      flags[key] = true;
    }
  }
  return { command, flags, positionals };
}

async function ensureStateDirs() {
  await Promise.all([
    mkdir(STATE_DIR, { recursive: true }),
    mkdir(CLAIMS_DIR, { recursive: true }),
    mkdir(MEDIA_DIR, { recursive: true }),
    mkdir(BACKUP_DIR, { recursive: true }),
    mkdir(REPORT_DIR, { recursive: true }),
  ]);
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

async function writeJsonAtomic(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function appendEvent(type, payload = {}, now = new Date().toISOString()) {
  const event = {
    schemaVersion: "hapa.vibes-transition-link-event.v1",
    id: `vibes-transition-event:${now.replace(/[:.]/g, "-")}:${type}`,
    type,
    at: now,
    payload,
  };
  await mkdir(path.dirname(EVENTS_PATH), { recursive: true });
  await writeFile(EVENTS_PATH, `${JSON.stringify(event)}\n`, { encoding: "utf8", flag: "a" });
  return event;
}

async function readQueue() {
  return createVibesTransitionQueue(await readJson(QUEUE_PATH, { jobs: [], maxConcurrent: 3 }));
}

async function writeQueue(queue) {
  await writeJsonAtomic(QUEUE_PATH, queue);
}

async function buildCatalog() {
  const [referenceMedia, avatarStore, sceneStore] = await Promise.all([
    readJson(REFERENCE_MEDIA_PATH, { records: [] }),
    readJson(AVATAR_STORE_PATH, { avatars: [] }),
    readJson(SCENE_STORE_PATH, { scenes: [] }),
  ]);
  const catalog = buildVibesTransitionFrameCatalog({ referenceMedia, avatarStore, sceneStore });
  const verifiedFrames = [];
  for (const frame of catalog.frames) {
    if (!frame.path) continue;
    if (await access(frame.path).then(() => true).catch(() => false)) verifiedFrames.push(frame);
  }
  return {
    ...catalog,
    frames: verifiedFrames,
    counts: {
      total: verifiedFrames.length,
      reference: verifiedFrames.filter((frame) => frame.kind === "reference").length,
      avatar: verifiedFrames.filter((frame) => frame.kind === "avatar").length,
      scene: verifiedFrames.filter((frame) => frame.kind === "scene").length,
      omittedMissingLocalFile: catalog.frames.length - verifiedFrames.length,
    },
  };
}

async function catalogCommand(flags = {}) {
  await ensureStateDirs();
  const catalog = await buildCatalog();
  await writeJsonAtomic(CATALOG_PATH, catalog);
  const query = String(flags.query || "").trim().toLowerCase();
  const kind = String(flags.kind || "").trim().toLowerCase();
  const limit = Math.max(1, Number(flags.limit || 20));
  const rows = catalog.frames
    .filter((frame) => !kind || frame.kind === kind)
    .filter((frame) => !query || [
      frame.id,
      frame.cardId,
      frame.cardTitle,
      frame.assetId,
      frame.assetTitle,
    ].join(" ").toLowerCase().includes(query))
    .slice(0, limit);
  console.log(JSON.stringify({
    catalogPath: CATALOG_PATH,
    counts: catalog.counts,
    matches: rows,
  }, null, 2));
}

async function currentCatalog() {
  const stored = await readJson(CATALOG_PATH, null);
  if (stored) return stored;
  const catalog = await buildCatalog();
  await writeJsonAtomic(CATALOG_PATH, catalog);
  return catalog;
}

function required(flags, key) {
  const value = String(flags[key] || "").trim();
  if (!value) throw new Error(`--${key} is required.`);
  return value;
}

function findFrame(catalog, frameId, label) {
  const frame = catalog.frames.find((row) => row.id === frameId);
  if (!frame) throw new Error(`Unknown ${label} frame "${frameId}". Refresh with: npm run echo:transitions -- catalog`);
  return frame;
}

async function enqueueInputs(inputs = [], sourceManifest = "") {
  const now = new Date().toISOString();
  const queue = await readQueue();
  const jobs = inputs.map((input) => createVibesTransitionJob({
    ...input,
    sourceManifest,
    createdBy: "hapa-avatar-builder-vibes-transition-cli",
  }, now));
  const result = enqueueVibesTransitionJobs(queue, jobs, now);
  await writeQueue(result.queue);
  await appendEvent("transition-links.enqueued", {
    sourceManifest,
    jobIds: result.added.map((job) => job.id),
    ignoredDuplicateCount: jobs.length - result.added.length,
  }, now);
  return result;
}

async function enqueueCommand(flags = {}) {
  await ensureStateDirs();
  const catalog = await currentCatalog();
  const from = findFrame(catalog, required(flags, "from"), "first");
  const to = findFrame(catalog, required(flags, "to"), "last");
  const result = await enqueueInputs([{
    from,
    to,
    prompt: required(flags, "prompt"),
    negativePrompt: flags["negative-prompt"] || "",
    priority: flags.priority,
    projectUrl: flags["project-url"] || "",
    projectName: flags["project-name"] || "",
    model: flags.model || "vibes-video",
    resolution: flags.resolution || "720p",
  }]);
  console.log(JSON.stringify({
    added: result.added.map(projectJob),
    counts: result.queue.counts,
    next: "Run: npm run echo:transitions -- pump",
  }, null, 2));
}

async function seedCommand(flags = {}) {
  await ensureStateDirs();
  const manifestPath = path.resolve(required(flags, "manifest"));
  const manifest = await readJson(manifestPath);
  const catalog = await currentCatalog();
  const pairs = Array.isArray(manifest.pairs) ? manifest.pairs : [];
  if (!pairs.length) throw new Error("Transition manifest must contain a non-empty pairs array.");
  const inputs = pairs.map((pair) => ({
    ...pair,
    from: findFrame(catalog, pair.fromFrameId, "first"),
    to: findFrame(catalog, pair.toFrameId, "last"),
    projectUrl: pair.projectUrl || manifest.projectUrl || "",
    projectName: pair.projectName || manifest.projectName || "",
    model: pair.model || manifest.model || "vibes-video",
    resolution: pair.resolution || manifest.resolution || "720p",
  }));
  const result = await enqueueInputs(inputs, manifestPath);
  console.log(JSON.stringify({
    manifestPath,
    requested: inputs.length,
    added: result.added.length,
    ignoredDuplicates: inputs.length - result.added.length,
    counts: result.queue.counts,
  }, null, 2));
}

function projectJob(job) {
  return {
    id: job.id,
    status: job.status,
    title: job.title,
    prompt: job.prompt,
    from: {
      frameId: job.from.id,
      card: `${job.from.kind}:${job.from.cardId}`,
      path: job.from.path,
      uri: job.from.uri,
    },
    to: {
      frameId: job.to.id,
      card: `${job.to.kind}:${job.to.cardId}`,
      path: job.to.path,
      uri: job.to.uri,
    },
    provider: job.provider,
    output: job.output,
  };
}

async function pump(queueInput, options = {}) {
  const now = new Date().toISOString();
  const queue = queueInput || await readQueue();
  const result = fillVibesTransitionBuffer(queue, {
    maxConcurrent: Number(options.maxConcurrent || 3),
    claimant: options.claimant || "codex-in-app-browser",
    now,
  });
  await writeQueue(result.queue);
  if (result.claimed.length) {
    const packet = {
      schemaVersion: "hapa.vibes-transition-claim-packet.v1",
      claimedAt: now,
      provider: "https://vibes.ai/",
      instructions: [
        "Open the Builder-owned Vibes project in the Codex in-app browser.",
        "For each job: upload from.path as Start frame and to.path as End frame.",
        "Paste prompt, keep the configured resolution, and submit one generation.",
        "Run submit immediately after Vibes accepts it, then use Copy link and Download when the output is ready.",
        "Run complete with the downloaded video path and copied Vibes link; completion imports the video and immediately replenishes this three-slot buffer.",
      ],
      capacity: result.capacity,
      jobs: result.claimed.map(projectJob),
    };
    const packetPath = path.join(CLAIMS_DIR, `claim-${now.replace(/[:.]/g, "-")}.json`);
    await writeJsonAtomic(packetPath, packet);
    await appendEvent("transition-buffer.claimed", {
      claimPacketPath: packetPath,
      jobIds: result.claimed.map((job) => job.id),
      capacity: result.capacity,
    }, now);
    return { ...result, claimPacketPath: packetPath, packet };
  }
  return result;
}

async function pumpCommand(flags = {}) {
  await ensureStateDirs();
  const result = await pump(null, {
    maxConcurrent: flags.limit || flags["max-concurrent"] || 3,
    claimant: flags.claimant,
  });
  console.log(JSON.stringify({
    claimPacketPath: result.claimPacketPath || null,
    capacity: result.capacity,
    claimed: result.claimed.map(projectJob),
    counts: result.queue.counts,
  }, null, 2));
}

function jobIdFrom(flags, positionals) {
  return String(flags["job-id"] || positionals[0] || "").trim();
}

async function submitCommand(flags = {}, positionals = []) {
  await ensureStateDirs();
  const jobId = jobIdFrom(flags, positionals);
  if (!jobId) throw new Error("--job-id is required.");
  const now = new Date().toISOString();
  const queue = markVibesTransitionSubmitted(await readQueue(), jobId, {
    projectUrl: flags["project-url"],
    projectName: flags["project-name"],
    providerJobId: flags["provider-job-id"],
    outputUrl: flags["vibes-link"],
  }, now);
  await writeQueue(queue);
  await appendEvent("transition-link.submitted", { jobId, provider: queue.jobs.find((job) => job.id === jobId)?.provider }, now);
  console.log(JSON.stringify({
    job: projectJob(queue.jobs.find((job) => job.id === jobId)),
    counts: queue.counts,
  }, null, 2));
}

async function sha256File(filePath) {
  return await new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const input = createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

function safeExtension(filePath = "") {
  const extension = path.extname(filePath).toLowerCase();
  return [".mp4", ".mov", ".webm", ".m4v"].includes(extension) ? extension : ".mp4";
}

async function backupFile(filePath, suffix) {
  const destination = path.join(BACKUP_DIR, `${path.basename(filePath, ".json")}.before-vibes-transition-${suffix}.json`);
  await copyFile(filePath, destination);
  return destination;
}

async function completeCommand(flags = {}, positionals = []) {
  await ensureStateDirs();
  const jobId = jobIdFrom(flags, positionals);
  if (!jobId) throw new Error("--job-id is required.");
  const sourcePath = path.resolve(required(flags, "video"));
  const info = await stat(sourcePath);
  if (!info.isFile()) throw new Error(`Transition output is not a file: ${sourcePath}`);
  const sha256 = await sha256File(sourcePath);
  const extension = safeExtension(sourcePath);
  const fileName = `${jobId.replace(/[^a-z0-9-]+/gi, "-")}-${sha256.slice(0, 12)}${extension}`;
  const destination = path.join(MEDIA_DIR, fileName);
  await copyFile(sourcePath, destination);
  const uri = `/media/vibes-transition-links/${encodeURIComponent(fileName)}`;
  const now = new Date().toISOString();
  let queue = markVibesTransitionReady(await readQueue(), jobId, {
    uri,
    path: destination,
    sha256,
    bytes: info.size,
    mimeType: extension === ".webm" ? "video/webm" : extension === ".mov" ? "video/quicktime" : "video/mp4",
    providerOutputUrl: flags["vibes-link"],
    durationSeconds: flags.duration,
    width: flags.width,
    height: flags.height,
  }, now);
  const job = queue.jobs.find((row) => row.id === jobId);
  const record = createVibesTransitionMediaRecord(job, job.output, now);
  const mediaLibrary = normalizeSystemMediaLibrary(await readJson(MEDIA_LIBRARY_PATH, { records: [], batches: [] }));
  const existingIndex = mediaLibrary.records.findIndex((row) => row.id === record.id);
  if (existingIndex >= 0) mediaLibrary.records[existingIndex] = record;
  else mediaLibrary.records.unshift(record);
  mediaLibrary.updatedAt = now;
  const suffix = now.replace(/[:.]/g, "-");
  const backupPath = await backupFile(MEDIA_LIBRARY_PATH, suffix);
  await writeJsonAtomic(MEDIA_LIBRARY_PATH, mediaLibrary);
  await writeQueue(queue);
  await appendEvent("transition-link.ready", {
    jobId,
    mediaRecordId: record.id,
    from: job.from,
    to: job.to,
    output: job.output,
  }, now);
  const refill = await pump(queue, {
    maxConcurrent: queue.maxConcurrent || 3,
    claimant: "codex-in-app-browser",
  });
  queue = refill.queue;
  const report = {
    schemaVersion: "hapa.vibes-transition-import-report.v1",
    generatedAt: now,
    jobId,
    mediaRecordId: record.id,
    video: job.output,
    endpointRelationships: record.relationships,
    backupPath,
    refilledJobIds: refill.claimed.map((row) => row.id),
    claimPacketPath: refill.claimPacketPath || null,
    counts: queue.counts,
  };
  const reportPath = path.join(REPORT_DIR, `vibes-transition-${jobId.replace(/[^a-z0-9-]+/gi, "-")}-${suffix}.json`);
  await writeJsonAtomic(reportPath, report);
  console.log(JSON.stringify({ ...report, reportPath }, null, 2));
}

async function failCommand(flags = {}, positionals = []) {
  await ensureStateDirs();
  const jobId = jobIdFrom(flags, positionals);
  if (!jobId) throw new Error("--job-id is required.");
  const now = new Date().toISOString();
  const queue = markVibesTransitionFailed(
    await readQueue(),
    jobId,
    required(flags, "reason"),
    { retry: flags.retry === true },
    now,
  );
  await writeQueue(queue);
  await appendEvent("transition-link.failed", {
    jobId,
    reason: flags.reason,
    retry: flags.retry === true,
  }, now);
  const refill = await pump(queue, {
    maxConcurrent: queue.maxConcurrent || 3,
    claimant: "codex-in-app-browser",
  });
  console.log(JSON.stringify({
    failedJobId: jobId,
    retryQueued: flags.retry === true,
    refilled: refill.claimed.map(projectJob),
    claimPacketPath: refill.claimPacketPath || null,
    counts: refill.queue.counts,
  }, null, 2));
}

async function statusCommand(flags = {}) {
  await ensureStateDirs();
  const queue = await readQueue();
  const status = String(flags.status || "").trim();
  const jobs = queue.jobs
    .filter((job) => !status || job.status === status)
    .map(projectJob);
  console.log(JSON.stringify({
    queuePath: QUEUE_PATH,
    catalogPath: CATALOG_PATH,
    eventsPath: EVENTS_PATH,
    maxConcurrent: queue.maxConcurrent,
    counts: countVibesTransitionJobs(queue.jobs),
    jobs,
  }, null, 2));
}

function printHelp() {
  console.log(`
Hapa Avatar Builder · Vibes Transition Links

  npm run echo:transitions -- catalog [--kind reference|avatar|scene] [--query words] [--limit 20]
  npm run echo:transitions -- enqueue --from <frame-id> --to <frame-id> --prompt <text>
  npm run echo:transitions -- seed --manifest <transition-pairs.json>
  npm run echo:transitions -- pump
  npm run echo:transitions -- submit --job-id <id> [--project-url <url>] [--provider-job-id <id>]
  npm run echo:transitions -- complete --job-id <id> --video <downloaded-file> --vibes-link <url>
  npm run echo:transitions -- fail --job-id <id> --reason <text> [--retry]
  npm run echo:transitions -- status [--status queued|claimed|generating|ready|failed]

Manifest shape:
{
  "projectUrl": "https://vibes.ai/",
  "resolution": "720p",
  "pairs": [
    {
      "fromFrameId": "transition-frame:reference:...",
      "toFrameId": "transition-frame:scene:...",
      "prompt": "Create a continuous cinematic transition..."
    }
  ]
}
`.trim());
}

await main().catch((error) => {
  console.error(error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
