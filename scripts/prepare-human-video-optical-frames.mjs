#!/usr/bin/env node

import http from "node:http";
import https from "node:https";
import { access, mkdir, realpath, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseArgs as parseEnrichmentArgs,
  runEchoVideoEnrichment,
} from "./enrich-echo-video-catalog.mjs";

export const HUMAN_VIDEO_FRAME_CANDIDATE_MANIFEST_SCHEMA = "hapa.human-video-optical-frame-candidates.v1";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_REPO_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const VIDEO_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".avi", ".mkv"]);

export function parseOptions(argv = process.argv.slice(2)) {
  const options = {
    apply: false,
    baseUrl: "http://127.0.0.1:8797",
    repoRoot: DEFAULT_REPO_ROOT,
    outputRoot: null,
    manifestPath: null,
    concurrency: 3,
    limit: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--apply") options.apply = true;
    else if (value === "--base-url") options.baseUrl = required(argv[++index], value).replace(/\/$/u, "");
    else if (value === "--repo-root") options.repoRoot = path.resolve(required(argv[++index], value));
    else if (value === "--output") options.outputRoot = path.resolve(required(argv[++index], value));
    else if (value === "--manifest") options.manifestPath = path.resolve(required(argv[++index], value));
    else if (value === "--concurrency") options.concurrency = boundedInteger(argv[++index], 1, 12, value);
    else if (value === "--limit") options.limit = boundedInteger(argv[++index], 1, 100_000, value);
    else throw new Error(`Unknown argument: ${value}`);
  }
  options.outputRoot ||= path.join(options.repoRoot, "artifacts/echo-video-enrichment-v1");
  options.manifestPath ||= path.join(options.repoRoot, "work/human-enricher-optical/frame-preparation/candidates.json");
  return options;
}

export async function buildHumanVideoFrameCandidateManifest(dashboard = {}, options = {}) {
  const repoRoot = path.resolve(options.repoRoot || DEFAULT_REPO_ROOT);
  const videos = Array.isArray(dashboard.videos) ? dashboard.videos : [];
  const candidates = [];
  const unavailable = [];
  const seenVideoKeys = new Set();
  for (const video of videos) {
    if (requiredOpticalFrames(video.sourceMetadata?.registeredFrames || [])) continue;
    const videoKey = clean(video.humanVideoKey);
    if (!videoKey || seenVideoKeys.has(videoKey)) throw new Error(`Frame candidate requires one unique stable video key: ${videoKey || "missing"}`);
    seenVideoKeys.add(videoKey);
    const sourcePath = await resolveExactVideoSource(video, repoRoot);
    if (!sourcePath) {
      unavailable.push({ videoKey, videoId: clean(video.id), uri: clean(video.uri), reason: "exact-local-video-source-unavailable" });
      continue;
    }
    candidates.push({
      videoKey,
      videoId: clean(video.id),
      assetId: clean(video.assetId),
      videoName: clean(video.name),
      uri: clean(video.uri),
      sourcePath,
      contentFingerprint: clean(video.contentFingerprint),
      ownerType: clean(video.ownerType),
      ownerId: clean(video.ownerId),
      ownerName: clean(video.ownerName),
      role: clean(video.role),
      technical: {
        status: "human-enricher-exact-source-file",
        sourcePath,
        durationSec: finite(video.duration),
        width: finite(video.width),
        height: finite(video.height),
      },
    });
  }
  candidates.sort((left, right) => left.videoKey.localeCompare(right.videoKey));
  unavailable.sort((left, right) => left.videoKey.localeCompare(right.videoKey));
  const selected = options.limit ? candidates.slice(0, options.limit) : candidates;
  return {
    schemaVersion: HUMAN_VIDEO_FRAME_CANDIDATE_MANIFEST_SCHEMA,
    generatedAt: new Date().toISOString(),
    source: `${clean(options.baseUrl) || "local-human-enricher"}/api/human-enricher/videos?limit=all`,
    summary: {
      knownVideos: videos.length,
      frameGaps: candidates.length + unavailable.length,
      exactReadableSources: candidates.length,
      selectedSources: selected.length,
      unavailableSources: unavailable.length,
    },
    candidates: selected,
    unavailable,
    truthBoundary: "Every candidate is bound to one exact Human Enricher video record and a readable absolute source path resolved from that record. No basename, fuzzy, semantic, or visual matching is used.",
  };
}

export async function resolveExactVideoSource(video = {}, repoRoot = DEFAULT_REPO_ROOT) {
  const storage = video.sourceMetadata?.storage;
  const possibilities = [video.sourcePath, storage?.path, storage?.filePath];
  const uri = clean(video.uri);
  if (uri.startsWith("/media/") && !uri.includes("..")) possibilities.push(path.join(repoRoot, "data", uri.replace(/^\/+/, "")));
  if (uri.startsWith("/api/local-file?")) {
    try { possibilities.push(new URL(uri, "http://local.invalid").searchParams.get("path")); }
    catch { /* malformed exact source remains unavailable */ }
  }
  for (const candidate of possibilities) {
    if (!candidate || !path.isAbsolute(String(candidate)) || !VIDEO_EXTENSIONS.has(path.extname(String(candidate)).toLowerCase())) continue;
    try {
      const resolved = await realpath(String(candidate));
      await access(resolved);
      if ((await stat(resolved)).isFile()) return resolved;
    } catch {
      // Continue through the exact path fields carried by this same record.
    }
  }
  return "";
}

export async function runHumanVideoFramePreparation(options = parseOptions()) {
  const dashboard = await requestJson(`${options.baseUrl}/api/human-enricher/videos?limit=all`);
  const manifest = await buildHumanVideoFrameCandidateManifest(dashboard, options);
  if (!options.apply) return { ok: true, apply: false, manifest: { ...manifest, candidates: undefined, unavailable: undefined } };
  await atomicJson(options.manifestPath, manifest);
  const enrichmentOptions = parseEnrichmentArgs([
    "--prepare",
    "--apply",
    "--repo-root", options.repoRoot,
    "--output", options.outputRoot,
    "--candidate-manifest", options.manifestPath,
    "--concurrency", String(options.concurrency),
  ]);
  const preparation = await runEchoVideoEnrichment(enrichmentOptions);
  return {
    ok: true,
    apply: true,
    manifestPath: options.manifestPath,
    manifestSummary: manifest.summary,
    preparation,
  };
}

function requiredOpticalFrames(framesInput = []) {
  const frames = Array.isArray(framesInput) ? framesInput : [];
  const find = (values) => frames.find((frame) => values.some((value) => clean(frame.marker || frame.role || frame.label).toLowerCase().includes(value)));
  const first = find(["first", "start"]);
  const mid = find(["mid", "middle"]);
  const last = find(["last", "end"]);
  return Boolean(first && mid && last && new Set([first.uri, mid.uri, last.uri].filter(Boolean)).size === 3);
}

function requestJson(url) {
  const target = new URL(url);
  const transport = target.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.get(target, { headers: { accept: "application/json" } }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`Human Enricher returned HTTP ${response.statusCode}.`));
          return;
        }
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
        catch (error) { reject(new Error(`Human Enricher returned invalid JSON: ${error.message}`)); }
      });
    });
    request.setTimeout(180_000, () => request.destroy(new Error("Human Enricher frame-gap request timed out.")));
    request.on("error", reject);
  });
}

async function atomicJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

function required(value, flag) {
  if (!value || String(value).startsWith("--")) throw new Error(`${flag} requires a value.`);
  return String(value);
}

function boundedInteger(value, minimum, maximum, flag) {
  const number = Math.trunc(Number(required(value, flag)));
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${flag} received invalid value: ${value}`);
  return number;
}

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function clean(value) {
  return String(value || "").trim();
}

async function main() {
  const report = await runHumanVideoFramePreparation(parseOptions());
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  main().catch((error) => {
    process.stderr.write(`Human video optical frame preparation failed: ${error.stack || error.message}\n`);
    process.exitCode = 1;
  });
}
