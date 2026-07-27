#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildEchoExternalReferenceCycle,
  claimEchoExternalReferenceJobs,
  rebaseEchoExternalReferenceProjection,
  seedEchoExternalReferenceLoop,
  submitEchoExternalReferenceResult,
} from "../src/domain/echo-external-reference-loop.js";
import { runEchoReferenceMining } from "../src/domain/echo-reference-mining.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "status";

function option(name, fallback = "") {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

function numberOption(name, fallback) {
  const value = Number(option(name, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function options(name) {
  return [...new Set(args.filter((arg) => arg.startsWith(`${name}=`)).map((arg) => arg.slice(name.length + 1)))];
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filePath);
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value);
}

function escapeHtml(value = "") {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function statusOf(loop = {}) {
  const statuses = {};
  for (const job of loop.jobs || []) statuses[job.status] = (statuses[job.status] || 0) + 1;
  return {
    loopId: loop.loopId,
    sourceRunId: loop.sourceRunId,
    jobs: loop.jobs?.length || 0,
    statuses,
    cycles: loop.cycles?.length || 0,
    latestCycle: loop.cycles?.at(-1)?.cycleId || "",
  };
}

function dashboard(loop = {}) {
  const cycles = loop.cycles || [];
  const rows = cycles.map((cycle, index) => `
    <tr>
      <td>${index + 1}</td>
      <td>${escapeHtml(cycle.cycleId)}</td>
      <td>${cycle.metrics.externalSongsMeetingThree}</td>
      <td>${cycle.metrics.externalReferenceDeficit}</td>
      <td>${cycle.metrics.themeDeltaRecords}</td>
      <td>${cycle.metrics.externalInternalBridges}</td>
      <td>${cycle.quality.newOccurrencesFoundByRecheck}</td>
      <td>${cycle.quality.averageResearchQuality}</td>
      <td>${cycle.artManifest.jobs.length}</td>
    </tr>`).join("");
  const latest = cycles.at(-1);
  const art = latest?.artManifest?.jobs?.map((job) => `
    <article>
      <p>${escapeHtml(job.status)}</p>
      <h2>${escapeHtml(job.source.title)}</h2>
      <code>${escapeHtml(job.source.cardId)}</code>
      <details><summary>GPT Image prompt</summary><pre>${escapeHtml(job.prompt)}</pre></details>
    </article>`).join("") || "<p>No evidence-gated art jobs yet.</p>";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Echo External Reference Loop</title>
<style>
:root{color-scheme:dark;font:15px/1.5 ui-sans-serif,system-ui;background:#081012;color:#edf4ef}body{margin:0;background:radial-gradient(circle at 12% 0,#243a38,transparent 34rem),#081012}
main{width:min(1320px,calc(100% - 32px));margin:auto;padding:48px 0 80px}h1{font:700 clamp(38px,7vw,78px)/.94 Georgia,serif;max-width:950px;margin:8px 0 16px}h2{font:650 22px/1.1 Georgia,serif}.eyebrow{color:#e7bd72;text-transform:uppercase;letter-spacing:.15em;font-weight:800;font-size:12px}.lede{max-width:850px;color:#c0cdc8;font-size:18px}
.table{overflow:auto;border:1px solid #30413e;border-radius:16px;margin:32px 0 56px}table{border-collapse:collapse;width:100%;min-width:980px;background:#0d1718}th,td{padding:11px 13px;border-bottom:1px solid #263634;text-align:left}th{color:#8fb9b1;text-transform:uppercase;letter-spacing:.08em;font-size:11px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}.cards article{padding:20px;border:1px solid #30413e;border-radius:16px;background:#101b1d}.cards article p{color:#e7bd72;text-transform:uppercase;font-size:11px;letter-spacing:.1em}.cards code{color:#7ad3c3;overflow-wrap:anywhere}.cards pre{white-space:pre-wrap;font-size:11px;color:#b6c9c4}
</style></head><body><main>
<p class="eyebrow">Reference Atlas · research → recheck → art</p>
<h1>External canon learns in cycles.</h1>
<p class="lede">Each cycle accepts only source-backed research contributions, re-runs every lyric and existing connection, measures what changed, and plans GPT Image Card art only after the evidence gate.</p>
<div class="table"><table><thead><tr><th>Cycle</th><th>Identity</th><th>Songs ≥3</th><th>Deficit</th><th>Theme deltas</th><th>Bridges</th><th>Recheck hits</th><th>Research quality</th><th>Art jobs</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="eyebrow">Latest evidence-gated GPT Image candidates</p><section class="cards">${art}</section>
</main></body></html>`;
}

const apply = args.includes("--apply");
const runtimeRoot = path.resolve(option("--runtime-root", path.join(repoRoot, "data", "echo-reference-research-loop")));
const loopPath = path.resolve(option("--loop", path.join(runtimeRoot, "loop.json")));
const sourceRunOption = option("--source-run");
const sourceRunPath = sourceRunOption
  ? path.resolve(sourceRunOption)
  : path.join(runtimeRoot, "source-run.json");
const storePath = path.resolve(option("--store", path.join(repoRoot, "data", "hapa-songs-store.json")));
const sharpeningPath = path.resolve(option("--sharpening", path.join(repoRoot, "data", "echo-reference-mining", "sharpening", "latest.json")));
const sourceRun = command === "seed" && !sourceRunOption
  ? runEchoReferenceMining(readJson(storePath), { generatedAt: option("--generated-at", new Date().toISOString()) })
  : readJson(sourceRunPath);

if (command === "seed") {
  const sharpening = readJson(sharpeningPath);
  if (sharpening.source?.packetHash && sharpening.source.packetHash !== sourceRun.packetHash) {
    throw new Error("Sharpening queue and freshly mined source packet do not match. Refresh sharpening before seeding.");
  }
  const loop = seedEchoExternalReferenceLoop(sourceRun, sharpening);
  if (apply) {
    writeJson(sourceRunPath, sourceRun);
    writeJson(loopPath, loop);
  }
  console.log(JSON.stringify({ ok: true, command, applied: apply, loopPath, ...statusOf(loop) }, null, 2));
} else if (command === "claim") {
  if (!apply) throw new Error("Claim requires --apply.");
  const loop = readJson(loopPath);
  const result = claimEchoExternalReferenceJobs(loop, {
    limit: numberOption("--limit", 1),
    runner: option("--runner"),
    leaseSeconds: numberOption("--lease-seconds", 3600),
    jobIds: options("--job"),
  });
  writeJson(loopPath, result.loop);
  console.log(JSON.stringify({
    ok: true,
    command,
    claimed: result.claimed.map((job) => ({
      jobId: job.id,
      songId: job.songId,
      songTitle: job.songTitle,
      candidateClues: job.candidateClues,
      internalContext: job.internalContext,
      researchQuestions: job.researchQuestions,
      requiredOutput: job.requiredOutput,
    })),
    ...statusOf(result.loop),
  }, null, 2));
} else if (command === "submit") {
  if (!apply) throw new Error("Submit requires --apply.");
  const loop = readJson(loopPath);
  const result = submitEchoExternalReferenceResult(loop, sourceRun, { result: readJson(path.resolve(option("--result"))) });
  writeJson(loopPath, result.loop);
  console.log(JSON.stringify({ ok: result.validation.valid, command, validation: result.validation, ...statusOf(result.loop) }, null, 2));
} else if (command === "cycle") {
  if (!apply) throw new Error("Cycle requires --apply.");
  const loop = readJson(loopPath);
  const prior = loop.cycles?.at(-1) || null;
  const acceptedResults = loop.jobs
    .filter((job) => job.status === "validated" && !job.history.some((event) => event.event === "integrated"))
    .slice(0, numberOption("--limit", Number.MAX_SAFE_INTEGER))
    .map((job) => job.result);
  if (!acceptedResults.length) throw new Error("No newly validated research results are ready.");
  const cycle = buildEchoExternalReferenceCycle({
    sourceRun: prior?.projectedRun || sourceRun,
    previousCycle: prior,
    acceptedResults,
  });
  const nextLoop = {
    ...loop,
    jobs: loop.jobs,
    cycles: [...(loop.cycles || []), cycle],
  };
  nextLoop.jobs = nextLoop.jobs.map((job) => {
    const resultIndex = acceptedResults.indexOf(job.result);
    return resultIndex >= 0 ? {
      ...job,
      status: "integrated",
      resultHash: cycle.acceptedResultHashes[resultIndex],
      history: [...(job.history || []), { event: "integrated", at: new Date().toISOString(), cycleId: cycle.cycleId }],
    } : job;
  });
  writeJson(loopPath, nextLoop);
  writeJson(path.join(runtimeRoot, "cycles", `${String(nextLoop.cycles.length).padStart(3, "0")}.json`), cycle);
  writeJson(path.join(runtimeRoot, "cycles", `${String(nextLoop.cycles.length).padStart(3, "0")}-gpt-image-manifest.json`), cycle.artManifest);
  writeJson(path.join(runtimeRoot, "latest-cycle.json"), cycle);
  writeJson(path.join(runtimeRoot, "projected-run.json"), cycle.projectedRun);
  writeJson(path.join(runtimeRoot, "gpt-image-manifest.json"), cycle.artManifest);
  writeText(path.join(runtimeRoot, "index.html"), dashboard(nextLoop));
  console.log(JSON.stringify({ ok: true, command, cycleId: cycle.cycleId, metrics: cycle.metrics, delta: cycle.delta, quality: cycle.quality, changes: cycle.changes, artJobs: cycle.artManifest.jobs.length, ...statusOf(nextLoop) }, null, 2));
} else if (command === "art-next") {
  const loop = readJson(loopPath);
  const jobs = (loop.cycles?.at(-1)?.artManifest?.jobs || [])
    .filter((job) => job.status === "planned")
    .slice(0, numberOption("--limit", 4))
    .map((job) => ({ jobId: job.id, cardId: job.source.cardId, title: job.source.title, prompt: job.prompt }));
  console.log(JSON.stringify({ ok: true, command, jobs }, null, 2));
} else if (command === "rebase") {
  const priorPath = path.resolve(option("--prior-projected-run", path.join(runtimeRoot, "projected-run.json")));
  const outputPath = path.resolve(option("--output", path.join(runtimeRoot, "projected-run.json")));
  const priorProjectedRun = readJson(priorPath);
  const rebased = rebaseEchoExternalReferenceProjection(sourceRun, priorProjectedRun);
  if (apply) writeJson(outputPath, rebased.projectedRun);
  console.log(JSON.stringify({
    ok: true,
    command,
    applied: apply,
    outputPath,
    ...rebased.receipt,
    cards: rebased.projectedRun.cards.length,
  }, null, 2));
} else if (command === "status") {
  const loop = readJson(loopPath);
  console.log(JSON.stringify({ ok: true, command, loopPath, runtimeRoot, ...statusOf(loop) }, null, 2));
} else {
  throw new Error(`Unknown command ${command}. Expected seed, claim, submit, cycle, rebase, art-next, or status.`);
}
