import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const SCRIPT = path.join(ROOT, "scripts/build-album-shader-repair-release-gate.mjs");
const CANONICAL_REPORT = path.join(ROOT, "artifacts/echo-director-v2/album/shader-repair-release-gate.json");

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function evidenceHash(report) {
  const { evidenceHash: _stored, ...evidence } = report;
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(canonical(evidence))).digest("hex")}`;
}

function runGate(output) {
  const result = spawnSync(process.execPath, [SCRIPT, "--output", output], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 30_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(output), true, "release gate must write its evidence report");
  return JSON.parse(fs.readFileSync(output, "utf8"));
}

test("all 79 Echo projects pass the deterministic shader-repair release gate", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-album-shader-gate-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  const first = runGate(path.join(temporary, "first.json"));
  const second = runGate(path.join(temporary, "second.json"));

  assert.deepEqual(second, first, "identical compiled inputs must produce byte-stable evidence");
  assert.equal(first.ok, true);
  assert.equal(first.schemaVersion, "hapa.echo.album-shader-repair-release-gate.v1");
  assert.equal(first.evidenceHash, evidenceHash(first));
  assert.deepEqual(first.violations, []);
  assert.ok(Object.values(first.assertions).every(Boolean));

  assert.deepEqual(first.totals, {
    projectCount: 79,
    sourceCueCount: 791,
    validClippedCueCount: 791,
    graphCueCount: 791,
    receiptCount: 791,
    sourceClippedDuration: 17035.08,
    compiledDuration: 17035.08,
    immutableIdCount: 791,
    exactTitleCount: 791,
    titleSubstitutionCount: 0,
    silentDefaultCount: 0,
    fallbackCount: 0,
    rendererReceiptCount: 3164,
  });
  assert.equal(first.projects.length, 79);
  assert.ok(first.projects.every((project) => project.sourceCueCount === project.validClippedCueCount));
  assert.ok(first.projects.every((project) => project.graphCueCount === project.sourceCueCount));
  assert.ok(first.projects.every((project) => project.receiptCount === project.sourceCueCount));
  assert.ok(first.projects.every((project) => project.compiledDuration === project.sourceClippedDuration));
  assert.ok(first.projects.every((project) => project.immutableIdCount === project.graphCueCount));
  assert.ok(first.projects.every((project) => project.exactTitleCount === project.graphCueCount));
  assert.ok(first.projects.every((project) => project.silentDefaultCount === 0 && project.fallbackCount === 0));

  assert.equal(first.sources.manifestShaderCount, 182);
  assert.equal(first.sources.catalogShaderCount, 182);
  assert.equal(first.sources.albumUniqueRequestedIdCount, 181);
  assert.equal(first.sources.validContractCount, 181);
  assert.equal(first.sources.contracts.length, 181);
  assert.ok(first.sources.contracts.every((row) => row.ok && row.responseStatus === 200 && row.hashMismatchRejected));
  assert.ok(first.sources.contracts.every((row) => /^sha256:[a-f0-9]{64}$/.test(row.sourceHash)));
  assert.ok(first.sources.contracts.every((row) => /^\/api\/echos\/shader-source\?id=.+&sha256=[a-f0-9]{64}$/.test(row.source)));
  assert.equal(first.sources.runtime.ok, true);
  assert.equal(first.sources.runtime.hashMismatchRejected, true);

  assert.deepEqual(first.renderers.echo.routeCounts, { "exact-browser-isf": 791 });
  assert.deepEqual(first.renderers.tarot.routeCounts, { "exact-browser-isf": 791 });
  assert.deepEqual(first.renderers.native.routeCounts, {
    "exact-native": 11,
    "hash-bound-exact-proxy": 692,
    unsupported: 88,
  });
  assert.deepEqual(first.renderers.hyperframes.routeCounts, {
    "hash-bound-exact-proxy": 703,
    unsupported: 88,
  });
  for (const renderer of Object.values(first.renderers)) {
    assert.equal(renderer.receiptCount, 791);
    assert.equal(renderer.substituteCount, 0);
    assert.equal(renderer.silentDefaultCount, 0);
    assert.equal(renderer.allRoutesRecognized, true);
    assert.equal(renderer.allUnsupportedExplicit, true);
  }
  assert.deepEqual(first.unsupportedAccounting, {
    echo: { cueCount: 0, uniqueIdCount: 0, explicit: true },
    tarot: { cueCount: 0, uniqueIdCount: 0, explicit: true },
    native: { cueCount: 88, uniqueIdCount: 19, explicit: true },
    hyperframes: { cueCount: 88, uniqueIdCount: 19, explicit: true },
  });

  assert.equal(first.proxies.registryProxyCount, 163);
  assert.equal(first.proxies.registryFailureCount, 19);
  assert.equal(first.proxies.nativeUniqueExactProxyCount, 159);
  assert.equal(first.proxies.hyperframesUniqueExactProxyCount, 162);
  assert.ok(first.proxies.contracts.every((row) => row.ok));

  assert.equal(fs.existsSync(CANONICAL_REPORT), true, "the board-ready canonical evidence report must be checked in locally");
  assert.deepEqual(JSON.parse(fs.readFileSync(CANONICAL_REPORT, "utf8")), first);
});
