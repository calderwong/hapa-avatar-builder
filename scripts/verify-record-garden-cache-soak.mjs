#!/usr/bin/env node
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ByteBoundedLruCache } from "../server/byte-bounded-lru-cache.mjs";
import { createEchoDirectorShowGraphCache } from "../server/echo-director-show-graph-loader.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const projectsRoot = path.join(root, "data/music-video-projects");
const variantsRoot = path.join(root, "data/music-video-project-variants");
const graphsRoot = path.join(root, "artifacts/echo-director-v2/album");
const rawCache = new ByteBoundedLruCache({
  maxBytes: 128 * 1024 * 1024,
  maxEntries: 64,
  maxEntryBytes: 8 * 1024 * 1024,
});
const graphCache = createEchoDirectorShowGraphCache();

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

async function jsonFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort();
}

async function representativeFiles() {
  const projects = await jsonFiles(projectsRoot);
  const songIds = projects.map((filePath) => path.basename(filePath).replace(/-video-project\.json$/u, ""));
  const variants = [];
  const graphs = [];
  for (const songId of songIds) {
    const candidates = await jsonFiles(path.join(variantsRoot, songId));
    if (candidates.length) {
      const ranked = await Promise.all(candidates.map(async (filePath) => ({
        filePath,
        mtimeMs: (await fs.stat(filePath)).mtimeMs,
      })));
      ranked.sort((left, right) => right.mtimeMs - left.mtimeMs || left.filePath.localeCompare(right.filePath));
      variants.push(ranked[0].filePath);
    }
    const graphPath = path.join(graphsRoot, songId, "native-show-graph.json");
    if (await fs.stat(graphPath).then((value) => value.isFile()).catch(() => false)) graphs.push(graphPath);
  }
  return { projects, variants, graphs };
}

async function parseInto(cache, filePath, kind) {
  const bytes = await fs.readFile(filePath);
  const parsed = JSON.parse(bytes.toString("utf8"));
  cache.set(filePath, kind === "graph"
    ? { graph: parsed, sourceBytes: bytes.byteLength }
    : { value: parsed, size: bytes.byteLength });
}

function collectGarbage() {
  if (typeof globalThis.gc !== "function") {
    throw new Error("Run this verifier with node --expose-gc so heap plateau evidence is deterministic.");
  }
  globalThis.gc();
  globalThis.gc();
  globalThis.gc();
}

async function runPass(files, index) {
  for (const filePath of files.projects) await parseInto(rawCache, filePath, "raw");
  for (const filePath of files.variants) await parseInto(rawCache, filePath, "raw");
  for (const filePath of files.graphs) await parseInto(graphCache, filePath, "graph");
  collectGarbage();
  const memory = process.memoryUsage();
  return {
    index,
    heapUsedBytes: memory.heapUsed,
    rssBytes: memory.rss,
    raw: rawCache.telemetry(),
    graphs: graphCache.telemetry(),
  };
}

const files = await representativeFiles();
if (files.projects.length < 150 || files.graphs.length < 150) {
  throw new Error(`Expected representative album data; found ${files.projects.length} projects and ${files.graphs.length} graphs.`);
}
const before = process.memoryUsage();
const passes = [await runPass(files, 1), await runPass(files, 2)];
const first = passes[0];
const second = passes[1];
const heapPlateauLimitBytes = Math.ceil(first.heapUsedBytes * 1.15 + 64 * 1024 * 1024);
const ok = (
  rawCache.bytes <= rawCache.maxBytes
  && rawCache.size <= rawCache.maxEntries
  && graphCache.bytes <= graphCache.maxBytes
  && graphCache.size <= graphCache.maxEntries
  && rawCache.evictions > 0
  && graphCache.evictions > 0
  && second.heapUsedBytes <= heapPlateauLimitBytes
);
const receipt = {
  schemaVersion: "hapa.echo-record-garden.cache-soak.v1",
  generatedAt: new Date().toISOString(),
  ok,
  scope: "two-pass-representative-all-song-project-variant-and-show-graph-cache-soak",
  inputs: {
    projects: files.projects.length,
    latestVariantCandidates: files.variants.length,
    showGraphs: files.graphs.length,
  },
  before: {
    heapUsedBytes: before.heapUsed,
    rssBytes: before.rss,
  },
  passes,
  heapPlateauLimitBytes,
  assertions: {
    rawBytesBounded: rawCache.bytes <= rawCache.maxBytes,
    rawEntriesBounded: rawCache.size <= rawCache.maxEntries,
    graphBytesBounded: graphCache.bytes <= graphCache.maxBytes,
    graphEntriesBounded: graphCache.size <= graphCache.maxEntries,
    rawEvictionObserved: rawCache.evictions > 0,
    graphEvictionObserved: graphCache.evictions > 0,
    secondPassHeapPlateau: second.heapUsedBytes <= heapPlateauLimitBytes,
  },
};
const outputPath = argument("--out");
if (outputPath) {
  const resolved = path.resolve(outputPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, `${JSON.stringify(receipt, null, 2)}\n`);
}
process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
if (!ok) process.exitCode = 1;
