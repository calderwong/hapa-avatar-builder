#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runEchoReferenceMining } from "../src/domain/echo-reference-mining.js";
import { runEchoReferenceSharpening } from "../src/domain/echo-reference-sharpening.js";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");

function argumentValue(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function numberArgument(name, fallback) {
  const value = Number(argumentValue(name, fallback));
  return Number.isFinite(value) ? value : fallback;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function escapeHtml(value = "") {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function benchmarkHtml(result) {
  const comparison = result.benchmarkComparison;
  const census = result.database.census;
  const gaps = census.rows
    .filter((row) => row.external.status !== "coverage-prior-satisfied")
    .sort((left, right) => right.external.deficit - left.external.deficit || left.title.localeCompare(right.title));
  const rows = gaps.slice(0, 60).map((row) => `
    <tr>
      <td>${escapeHtml(row.title)}</td>
      <td>${escapeHtml(row.eligibility)}</td>
      <td>${row.external.distinctReferenceCount} / ${row.external.minimum}</td>
      <td>${row.internal.qualifiedPeerCount} / ${row.internal.minimum}</td>
      <td>${row.unresolvedNodeIds.length}</td>
    </tr>`).join("");
  const passCards = comparison.map((benchmark) => `
    <article class="pass">
      <p class="eyebrow">${escapeHtml(benchmark.pass)}</p>
      <div class="big">${benchmark.diagnosticAverage}<span>/4</span></div>
      <dl>
        <div><dt>External ≥3</dt><dd>${benchmark.headline.externalSongsMeetingThree}</dd></div>
        <div><dt>Internal ≥3</dt><dd>${benchmark.headline.internalSongsMeetingThree}</dd></div>
        <div><dt>Theme deltas</dt><dd>${benchmark.headline.themeDeltaRecords}</dd></div>
        <div><dt>Research items</dt><dd>${benchmark.headline.researchQueueItems}</dd></div>
        <div><dt>Bridges</dt><dd>${benchmark.headline.externalInternalBridges}</dd></div>
        <div><dt>Authority violations</dt><dd>${benchmark.headline.authorityViolations}</dd></div>
      </dl>
    </article>`).join("");
  const diagnosticNames = comparison.at(-1).diagnostics.map((row) => row.name);
  const diagnosticRows = diagnosticNames.map((name) => `
    <tr>
      <td>${escapeHtml(name)}</td>
      ${comparison.map((benchmark) => {
        const row = benchmark.diagnostics.find((item) => item.name === name);
        return `<td>${row?.score ?? 0}</td>`;
      }).join("")}
    </tr>`).join("");
  const embedded = JSON.stringify({
    sharpeningRunId: result.sharpeningRunId,
    databaseHash: result.databaseHash,
    comparison,
  }).replace(/</g, "\\u003c");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Echo Reference Sharpening Benchmark</title>
  <style>
    :root { color-scheme: dark; --ink:#f5f1e8; --muted:#aaa69d; --panel:#151a1d; --line:#30383c; --gold:#e8b86b; --teal:#64c9bd; }
    * { box-sizing:border-box; }
    body { margin:0; font:15px/1.55 ui-sans-serif,system-ui,-apple-system,sans-serif; color:var(--ink); background:radial-gradient(circle at 10% 0,#263135 0,transparent 33%),#0c1012; }
    main { width:min(1280px,calc(100% - 32px)); margin:0 auto; padding:48px 0 80px; }
    h1 { max-width:850px; margin:8px 0 10px; font:700 clamp(36px,6vw,78px)/.94 ui-serif,Georgia,serif; letter-spacing:-.04em; }
    h2 { margin:56px 0 16px; font:650 28px/1.1 ui-serif,Georgia,serif; }
    .lede { max-width:820px; color:#d3d0c9; font-size:18px; }
    .eyebrow { color:var(--gold); text-transform:uppercase; letter-spacing:.14em; font-size:12px; font-weight:800; }
    .passes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; margin-top:32px; }
    .pass { padding:22px; border:1px solid var(--line); border-radius:18px; background:linear-gradient(155deg,rgba(255,255,255,.055),rgba(255,255,255,.018)); }
    .big { margin:14px 0 18px; color:var(--teal); font:700 54px/1 ui-serif,Georgia,serif; }
    .big span { color:var(--muted); font-size:18px; }
    dl { margin:0; }
    dl div { display:flex; justify-content:space-between; gap:16px; padding:8px 0; border-top:1px solid var(--line); }
    dt { color:var(--muted); } dd { margin:0; font-variant-numeric:tabular-nums; }
    .note { padding:18px 20px; border-left:3px solid var(--gold); background:#16191a; color:#ddd8cf; }
    .table-wrap { overflow:auto; border:1px solid var(--line); border-radius:16px; }
    table { width:100%; border-collapse:collapse; min-width:720px; background:rgba(13,17,19,.82); }
    th,td { padding:11px 14px; border-bottom:1px solid var(--line); text-align:left; }
    th { color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; }
    td:not(:first-child) { font-variant-numeric:tabular-nums; }
    code { color:var(--teal); }
    @media (max-width:850px) { .passes { grid-template-columns:1fr; } main { padding-top:28px; } }
  </style>
</head>
<body>
<main>
  <p class="eyebrow">Reference Atlas · Continuous Sharpening</p>
  <h1>Three passes. No forced canon.</h1>
  <p class="lede">The 3+3 assumption is treated as a research prior: each lyric-bearing song should be tested for at least three external canon activations and three evidence-bearing internal song routes. Missing evidence stays missing.</p>
  <section class="passes">${passCards}</section>
  <p class="note"><strong>Current result:</strong> internal connectivity is already healthy for every lyric-bearing song. External source coverage is the bottleneck, with ${census.summary.external.totalReferenceDeficit} placements still requiring research. The score measures process completeness—not truth.</p>
  <h2>Diagnostic movement</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Dimension</th>${comparison.map((row) => `<th>${escapeHtml(row.pass)}</th>`).join("")}</tr></thead>
    <tbody>${diagnosticRows}</tbody>
  </table></div>
  <h2>External coverage queue</h2>
  <div class="table-wrap"><table>
    <thead><tr><th>Song</th><th>Status</th><th>External</th><th>Internal peers</th><th>Open nodes</th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>
  <h2>Run identity</h2>
  <p><code>${escapeHtml(result.sharpeningRunId)}</code><br><code>${escapeHtml(result.databaseHash)}</code></p>
</main>
<script type="application/json" id="benchmark-data">${embedded}</script>
</body>
</html>`;
}

const apply = process.argv.includes("--apply");
const storePath = path.resolve(argumentValue("--store", path.join(repoRoot, "data", "hapa-songs-store.json")));
const sourceRunPath = argumentValue("--source-run");
const outputRoot = path.resolve(argumentValue("--output", path.join(repoRoot, "artifacts", "echo-reference-sharpening")));
const databaseOutput = argumentValue("--database-output");
const generatedAt = argumentValue("--generated-at", new Date().toISOString());
const store = readJson(storePath);
const sourceRun = sourceRunPath
  ? readJson(path.resolve(sourceRunPath))
  : runEchoReferenceMining(store, {
    generatedAt,
    maxCandidatesPerSong: numberArgument("--max-candidates-per-song", 8),
  });
const result = runEchoReferenceSharpening(sourceRun, {
  minimumExternalReferences: numberArgument("--minimum-external", 3),
  minimumInternalSongLinks: numberArgument("--minimum-internal", 3),
  internalConfidenceFloor: numberArgument("--internal-confidence-floor", 0.55),
  maxBridgesPerActivation: numberArgument("--max-bridges-per-activation", 3),
  bridgeLineDistance: numberArgument("--bridge-line-distance", 8),
});

if (apply) {
  const [passOne, passTwo, passThree] = result.passes;
  writeJson(path.join(outputRoot, "pass-1-inventory.json"), passOne);
  writeJson(path.join(outputRoot, "pass-2-expansion.json"), passTwo);
  writeJson(path.join(outputRoot, "pass-3-verification.json"), passThree);
  writeJson(path.join(outputRoot, "benchmark-comparison.json"), {
    sharpeningRunId: result.sharpeningRunId,
    databaseHash: result.databaseHash,
    benchmarks: result.benchmarkComparison,
    reflection: result.reflection,
  });
  writeJson(path.join(outputRoot, "reference-enrichment-database.json"), result);
  fs.writeFileSync(path.join(outputRoot, "index.html"), benchmarkHtml(result));
  if (databaseOutput) writeJson(path.resolve(databaseOutput), result);
}

console.log(JSON.stringify({
  mode: apply ? "apply" : "dry-run",
  sourceRunId: sourceRun.runId,
  sharpeningRunId: result.sharpeningRunId,
  databaseHash: result.databaseHash,
  outputRoot: apply ? outputRoot : null,
  comparison: result.benchmarkComparison.map((benchmark) => ({
    pass: benchmark.pass,
    diagnosticAverage: benchmark.diagnosticAverage,
    ...benchmark.headline,
  })),
  reflection: result.reflection,
}, null, 2));

