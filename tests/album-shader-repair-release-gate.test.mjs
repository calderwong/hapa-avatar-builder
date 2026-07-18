import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "..");
const COMPILE_SCRIPT = path.join(ROOT, "scripts/compile-echo-director-v2-album.mjs");
const GATE_SCRIPT = path.join(ROOT, "scripts/build-album-shader-repair-release-gate.mjs");

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

function compileAlbum(output) {
  const result = spawnSync(process.execPath, [COMPILE_SCRIPT, "--output", output], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
}

function runGate(album, output, expectedStatus = 0) {
  const result = spawnSync(process.execPath, [GATE_SCRIPT, "--album", album, "--output", output], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 60_000,
  });
  assert.equal(result.status, expectedStatus, `${result.stdout}\n${result.stderr}`);
  assert.equal(fs.existsSync(output), true, "release gate must write its evidence report");
  return JSON.parse(fs.readFileSync(output, "utf8"));
}

test("freshly compiled Echo projects accept only source-bound quarantine repair lineage", (t) => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-album-shader-gate-"));
  t.after(() => fs.rmSync(temporary, { recursive: true, force: true }));
  compileAlbum(temporary);

  const first = runGate(temporary, path.join(temporary, "first.json"));
  const second = runGate(temporary, path.join(temporary, "second.json"));

  assert.deepEqual(second, first, "identical freshly compiled inputs must produce byte-stable evidence");
  assert.equal(first.ok, true);
  assert.equal(first.schemaVersion, "hapa.echo.album-shader-repair-release-gate.v1");
  assert.equal(first.evidenceHash, evidenceHash(first));
  assert.deepEqual(first.violations, []);
  assert.ok(Object.values(first.assertions).every(Boolean));
  const songbook = JSON.parse(fs.readFileSync(path.join(ROOT, "data/dear-papa-songbook.json"), "utf8"));
  assert.equal(first.totals.projectCount, songbook.songCards.length);
  assert.equal(first.totals.validClippedCueCount, first.totals.sourceCueCount);
  assert.equal(first.totals.graphCueCount, first.totals.sourceCueCount);
  assert.equal(first.totals.receiptCount, first.totals.sourceCueCount);
  assert.equal(first.totals.compiledDuration, first.totals.sourceClippedDuration);
  assert.equal(first.totals.immutableIdCount, first.totals.sourceCueCount);
  assert.equal(first.totals.directIdentityCount + first.totals.approvedRepairLineageCount, first.totals.sourceCueCount);
  assert.equal(first.totals.exactTitleCount, first.totals.sourceCueCount);
  assert.equal(first.totals.titleSubstitutionCount, 0);
  assert.equal(first.totals.silentDefaultCount, 0);
  assert.equal(first.totals.fallbackCount, 0);
  assert.equal(first.totals.rendererReceiptCount, first.totals.sourceCueCount * 4);
  assert.equal(first.projects.length, songbook.songCards.length);
  assert.ok(first.projects.every((project) => project.sourceCueCount === project.validClippedCueCount));
  assert.ok(first.projects.every((project) => project.graphCueCount === project.sourceCueCount));
  assert.ok(first.projects.every((project) => project.receiptCount === project.sourceCueCount));
  assert.ok(first.projects.every((project) => project.compiledDuration === project.sourceClippedDuration));
  assert.ok(first.projects.every((project) => project.immutableIdCount === project.graphCueCount));
  assert.ok(first.projects.every((project) => project.directIdentityCount + project.approvedRepairLineageCount === project.graphCueCount));
  assert.ok(first.projects.every((project) => project.exactTitleCount === project.graphCueCount));
  assert.ok(first.projects.every((project) => project.silentDefaultCount === 0 && project.fallbackCount === 0));

  assert.equal(first.shaderRepairs.declaredAlbumRepairCount, first.shaderRepairs.declaredProjectRepairCount);
  assert.equal(first.shaderRepairs.approvedRepairLineageCount, first.shaderRepairs.declaredProjectRepairCount);
  assert.equal(first.shaderRepairs.invalidRepairLineageCount, 0);
  assert.equal(first.shaderRepairs.lineages.length, first.shaderRepairs.approvedRepairLineageCount);
  assert.ok(first.shaderRepairs.lineages.every((lineage) => (
    lineage.ok
    && lineage.nonDestructive
    && lineage.original.quarantineRoute === "unsupported"
    && lineage.original.quarantineStatus === "quarantined"
    && /^sha256:[a-f0-9]{64}$/.test(lineage.original.sourceHash)
    && lineage.replacement.route === "hash-bound-exact-proxy"
    && /^sha256:[a-f0-9]{64}$/.test(lineage.replacement.sourceHash)
    && /^sha256:[a-f0-9]{64}$/.test(lineage.replacement.assetSha256)
  )));

  assert.equal(first.sources.manifestShaderCount, 182);
  assert.equal(first.sources.catalogShaderCount, 182);
  assert.ok(first.sources.albumUniqueRequestedIdCount > 0);
  assert.ok(first.sources.albumUniqueExecutableIdCount > 0);
  assert.ok(first.sources.albumUniqueLineageSourceIdCount >= first.sources.albumUniqueExecutableIdCount);
  assert.equal(first.sources.validContractCount, first.sources.albumUniqueLineageSourceIdCount);
  assert.equal(first.sources.contracts.length, first.sources.albumUniqueLineageSourceIdCount);
  assert.ok(first.sources.contracts.every((row) => row.ok && row.responseStatus === 200 && row.hashMismatchRejected));
  assert.ok(first.sources.contracts.every((row) => /^sha256:[a-f0-9]{64}$/.test(row.sourceHash)));
  assert.ok(first.sources.contracts.every((row) => /^\/api\/echos\/shader-source\?id=.+&sha256=[a-f0-9]{64}$/.test(row.source)));
  assert.equal(first.sources.runtime.ok, true);
  assert.equal(first.sources.runtime.hashMismatchRejected, true);

  assert.deepEqual(first.renderers.echo.routeCounts, { "exact-browser-isf": first.totals.sourceCueCount });
  assert.deepEqual(first.renderers.tarot.routeCounts, { "exact-browser-isf": first.totals.sourceCueCount });
  assert.equal(Object.values(first.renderers.native.routeCounts).reduce((sum, value) => sum + value, 0), first.totals.sourceCueCount);
  assert.equal(Object.values(first.renderers.hyperframes.routeCounts).reduce((sum, value) => sum + value, 0), first.totals.sourceCueCount);
  for (const renderer of Object.values(first.renderers)) {
    assert.equal(renderer.receiptCount, first.totals.sourceCueCount);
    assert.equal(renderer.substituteCount, 0);
    assert.equal(renderer.silentDefaultCount, 0);
    assert.equal(renderer.allRoutesRecognized, true);
    assert.equal(renderer.allUnsupportedExplicit, true);
  }
  assert.deepEqual(first.unsupportedAccounting, {
    echo: { cueCount: 0, uniqueIdCount: 0, explicit: true },
    tarot: { cueCount: 0, uniqueIdCount: 0, explicit: true },
    native: { cueCount: 0, uniqueIdCount: 0, explicit: true },
    hyperframes: { cueCount: 0, uniqueIdCount: 0, explicit: true },
  });

  assert.equal(first.proxies.registryProxyCount, 162);
  assert.equal(first.proxies.registryFailureCount, 20);
  assert.ok(first.proxies.nativeUniqueExactProxyCount > 0);
  assert.ok(first.proxies.hyperframesUniqueExactProxyCount > 0);
  assert.ok(first.proxies.contracts.every((row) => row.ok));

  const hydrationPath = path.join(temporary, "album-hydration-report.json");
  const hydration = JSON.parse(fs.readFileSync(hydrationPath, "utf8"));
  const repairedProject = hydration.projects.find((project) => Number(project.shaderRepair?.replacementCount || 0) > 0);
  if (repairedProject) {
    const removed = repairedProject.shaderRepair.replacements[0];
    repairedProject.shaderRepair.replacements = repairedProject.shaderRepair.replacements
      .filter((receipt) => Number(receipt.cueIndex) !== Number(removed.cueIndex));
    repairedProject.shaderRepair.replacementCount -= 1;
    delete repairedProject.shaderRepair.timeline[removed.cueIndex].shader_repair;
    fs.writeFileSync(hydrationPath, `${JSON.stringify(hydration, null, 2)}\n`);

    const rejected = runGate(temporary, path.join(temporary, "tampered.json"), 1);
    assert.equal(rejected.ok, false);
    assert.ok(rejected.violations.some((violation) => (
      violation.code === "requested-id-mutated"
      && violation.songId === repairedProject.songId
      && violation.sourceCueIndex === removed.cueIndex
    )), "an executable replacement without its source repair receipt must fail closed");
    assert.equal(rejected.assertions.hydrationShaderRepairCountsAgree, false);
  }
});
