#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createEchoSourceInspector } from "../server/echo-source-inventory.mjs";
import { publishEchoPerformance } from "../server/echo-prepared-performance-store.mjs";
import { createEchoPerformanceCache } from "../server/echo-performance-cache.mjs";

const root = path.resolve(import.meta.dirname, "..");
const argument = (name, fallback = null) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) ?? fallback;
const required = name => { const value = argument(name); if (!value) throw new Error(`--${name}=<path> is required`); return path.resolve(value); };
const telemetryPath = required("telemetry"), masterPath = required("master"), graphPath = required("graph"), output = required("output");
const read = async file => {
  if ((await fs.stat(file)).size > 128 * 1024 * 1024) throw new Error(`Prepared input exceeds 128 MiB budget: ${file}`);
  return JSON.parse(await fs.readFile(file, "utf8"));
};
const cacheRoot = path.resolve(argument("cache", path.join(root, "data/cache/echo-performance")));
const hashCachePath = path.join(cacheRoot, "source-hashes.json");
let hashes = {};
try { hashes = await read(hashCachePath); } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
const inspector = createEchoSourceInspector({ cache: hashes });
const run = promisify(execFile);
const metadataCachePath = path.join(cacheRoot, "source-audio-metadata.json");
let metadata = {};
try { metadata = await read(metadataCachePath); } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
async function sourceMetadata(file, hash) {
  if (metadata[hash]) return metadata[hash];
  const result = await run("ffprobe", ["-v", "error", "-select_streams", "a:0", "-show_entries", "stream=sample_rate,channels,start_time", "-of", "json", file], { timeout: 15000, maxBuffer: 1024 * 1024 });
  const stream = JSON.parse(result.stdout).streams?.[0];
  if (!stream?.sample_rate || !stream.channels) throw new Error("Audio source metadata is unavailable");
  return metadata[hash] = { sourceSampleRate: Number(stream.sample_rate), sourceChannels: Number(stream.channels), sourceStreamStartSeconds: Number(stream.start_time || 0) };
}
const started = performance.now();
const [telemetry, graph] = await Promise.all([read(telemetryPath), read(graphPath)]);
const master = await inspector.inspect(masterPath);
if (master.status !== "bytes-verified" || !master.audioHeaderRecognized) throw new Error(`Master audio is unavailable: ${master.status}`);
const sourceChecks = [{ role: "master", ...master }];
Object.assign(telemetry.masterMix, await sourceMetadata(masterPath, master.sha256), { originSeconds: 0, originStatus: "verified" });
for (const stem of telemetry.stems || []) {
  if (!stem.frames?.length) continue; // Remains explicitly missing in the bundle.
  const source = await inspector.inspect(stem.audioPath);
  if (!source.audioHeaderRecognized || source.sha256 !== String(stem.audioHash || "").replace(/^sha256:/, "")) {
    const error = new Error(`Prepared ${stem.role || stem.id} analysis is stale or its source bytes are missing.`);
    error.code = "echo_performance_stem_source_mismatch"; throw error;
  }
  sourceChecks.push({ role: stem.role || stem.id, ...source });
  Object.assign(stem, await sourceMetadata(stem.audioPath, source.sha256));
}
const eventsPath = argument("events");
const eventPayload = eventsPath ? await read(path.resolve(eventsPath)) : telemetry.sparseEvents || [];
const cache = createEchoPerformanceCache({ root: cacheRoot });
const bundle = await cache.prepare({ telemetry, expectedMasterHash: master.sha256,
  lyricContract: graph.song?.lyricOverlay || {}, events: Array.isArray(eventPayload) ? eventPayload : eventPayload.events || [] });
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.mkdir(cacheRoot, { recursive: true });
const temporary = `${output}.${process.pid}.tmp`;
try { await fs.writeFile(temporary, JSON.stringify(bundle) + "\n", { flag: "wx" }); await fs.rename(temporary, output); }
finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
await fs.writeFile(hashCachePath, JSON.stringify(inspector.cache));
await fs.writeFile(metadataCachePath, JSON.stringify(metadata));
const publication = await publishEchoPerformance({ root: cacheRoot, bundle, sourceChecks });
const receipt = { publication, schemaVersion: "hapa.echo.performance-preparation.v1", generatedAt: new Date().toISOString(), output,
  fingerprint: bundle.fingerprint, masterAudioHash: bundle.masterAudioHash, resourceKeys: bundle.resourceKeys,
  elapsedMs: performance.now() - started, cache: cache.metrics(), sourceHashing: inspector.metrics(),
  sourceChecks, missingData: bundle.missingData, rejectedEvents: bundle.rejectedEvents,
  analysisExecuted: false, scope: "Prepared analysis reuse and current source byte validation. Alignment quality and musical event detection remain independently measured gates." };
await fs.writeFile(`${output}.receipt.json`, JSON.stringify(receipt, null, 2) + "\n");
console.log(JSON.stringify({ fingerprint: bundle.fingerprint, output, elapsedMs: receipt.elapsedMs, cache: receipt.cache, missingData: bundle.missingData }, null, 2));
