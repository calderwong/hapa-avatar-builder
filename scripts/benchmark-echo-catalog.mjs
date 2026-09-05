#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import os from "node:os";
import { createHash } from "node:crypto";

const args = process.argv.slice(2);
const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const base = new URL(option("--base", "http://127.0.0.1:8787"));
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) throw new Error("Benchmark only supports an explicit local Builder API");
const output = option("--out", "echo-catalog-benchmark.json");
const label = option("--condition", "warm-server");
const requests = [];
let songs = [];
for (let i = 0; i < 21; i++) {
  const start = performance.now();
  const response = await fetch(new URL("/api/echos/director-projects?summary=1", base), { signal: AbortSignal.timeout(120_000), cache: "no-store" });
  const body = await response.text();
  const elapsedMs = performance.now() - start;
  if (!response.ok) throw new Error(`Catalog ${response.status}: ${body.slice(0, 500)}`);
  const projects = JSON.parse(body);
  songs = projects.map(row => ({ songId: row.music_video_project.song_id, selectedCut: row.music_video_project.selected_cut }));
  requests.push({ ordinal: i, elapsedMs, bytes: Buffer.byteLength(body), songs: songs.length,
    catalog: response.headers.get("x-hapa-echo-catalog"), serverTiming: response.headers.get("server-timing"),
    sha256: createHash("sha256").update(body).digest("hex"),
  });
  if (i === 0) console.log(`First catalog: ${Math.round(elapsedMs)} ms, ${songs.length} songs, ${Buffer.byteLength(body)} bytes`);
}
const warm = requests.slice(1).map(row => row.elapsedMs).sort((a, b) => a - b);
const p95Ms = warm[Math.ceil(warm.length * .95) - 1];
const report = { schemaVersion: "hapa.echo.catalog-benchmark.v1", createdAt: new Date().toISOString(),
  condition: label, base: base.href, machine: { cpu: os.cpus()[0]?.model, cores: os.cpus().length, memoryBytes: os.totalmem(), platform: os.platform(), release: os.release(), arch: os.arch(), node: process.version },
  firstRequest: requests[0], warmRequests: 20, warmP95Ms: p95Ms,
  targets: { warmP95Ms: 500, processColdIndexedMs: 2000 },
  warmTargetMet: p95Ms <= 500,
  coldIndexedTargetMet: label === "process-cold-indexed" ? requests[0].elapsedMs <= 2000 && /rebuilt=0; errors=0/.test(requests[0].catalog) : null,
  requests, songs,
};
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, firstMs: report.firstRequest.elapsedMs, warmP95Ms: p95Ms, warmTargetMet: report.warmTargetMet, coldIndexedTargetMet: report.coldIndexedTargetMet }));
if (!report.warmTargetMet || report.coldIndexedTargetMet === false) process.exitCode = 1;
