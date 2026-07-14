import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  loadGatedEchoIsfManifest,
  repairEchoProjectShaders,
} from "../scripts/echo-isf-gated-manifest.mjs";

const hash = (letter) => `sha256:${letter.repeat(64)}`;

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-isf-gate-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const manifestPath = path.join(root, "manifest.json");
  const pixelGatePath = path.join(root, "pixel-gate.json");
  const manifest = { shaders: [
    { id: "bad", title: "Bad filter", source: "/bad.fs", sourceHash: hash("a"), enabled: true, directorEligible: true, shaderType: "filter", hmvRole: "filter" },
    { id: "safe-generator", title: "Safe generator", source: "/safe.fs", sourceHash: hash("b"), enabled: true, directorEligible: true, shaderType: "generator", hmvRole: "filter" },
    { id: "safe-filter", title: "Safe filter", source: "/filter.fs", sourceHash: hash("c"), enabled: true, directorEligible: true, shaderType: "filter", hmvRole: "filter" },
  ] };
  const report = { schemaVersion: "gate.v1", classifications: [
    { id: "bad", sourceHash: hash("a"), classification: "unsupported-quarantine", reason: "compile-failed" },
    { id: "safe-generator", sourceHash: hash("b"), classification: "hash-bound-exact-proxy", playableFrameIndices: [0] },
    { id: "safe-filter", sourceHash: hash("c"), classification: "hash-bound-exact-proxy", playableFrameIndices: [0] },
  ] };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.writeFileSync(pixelGatePath, JSON.stringify(report));
  return { root, manifestPath, pixelGatePath, manifest, report };
}

test("the shared loader fails closed for missing, stale, or incomplete pixel-gate truth", (t) => {
  const files = fixture(t);
  const loaded = loadGatedEchoIsfManifest(files);
  assert.equal(loaded.quarantinedShaderCount, 1);
  assert.equal(loaded.manifest.shaders.find((shader) => shader.id === "bad").directorEligible, false);

  fs.rmSync(files.pixelGatePath);
  assert.throws(() => loadGatedEchoIsfManifest(files), /pixel-gate report is required/i);
  fs.writeFileSync(files.pixelGatePath, JSON.stringify({ ...files.report, classifications: files.report.classifications.slice(1) }));
  assert.throws(() => loadGatedEchoIsfManifest(files), /stale or incomplete/i);
  fs.writeFileSync(files.pixelGatePath, JSON.stringify({ ...files.report, classifications: [{ ...files.report.classifications[0], sourceHash: hash("d") }, ...files.report.classifications.slice(1)] }));
  assert.throws(() => loadGatedEchoIsfManifest(files), /source-hash-mismatch/i);
});

test("project repair is non-destructive and prefers a media-independent same-role shader", (t) => {
  const files = fixture(t);
  const { manifest } = loadGatedEchoIsfManifest(files);
  const source = { music_video_project: { song_id: "fixture", visualizer_timeline: [{ start_sec: 0, end_sec: 4, visualizer_id: "bad", visualizer_title: "Bad filter" }] } };
  const repaired = repairEchoProjectShaders(source, manifest);
  assert.equal(repaired.shaderRepair.replacementCount, 1);
  assert.equal(repaired.projectBody.visualizer_timeline[0].visualizer_id, "safe-generator");
  assert.equal(source.music_video_project.visualizer_timeline[0].visualizer_id, "bad");
  assert.equal(repaired.projectBody.runtime_shader_repair_receipt.sourceProjectMutated, false);
});

test("every Director artifact script consumes the shared fail-closed shader gate", () => {
  const scriptsRoot = path.resolve(import.meta.dirname, "../scripts");
  const consumers = fs.readdirSync(scriptsRoot)
    .filter((file) => file.endsWith(".mjs"))
    .filter((file) => fs.readFileSync(path.join(scriptsRoot, file), "utf8").includes("buildDirectorV2Artifacts"));
  assert.ok(consumers.length >= 8);
  for (const file of consumers) {
    const source = fs.readFileSync(path.join(scriptsRoot, file), "utf8");
    assert.match(source, /echo-isf-gated-manifest\.mjs/, `${file} must not select shaders from the raw manifest`);
    assert.match(source, /repairEchoProjectShaders/, `${file} must repair quarantined source cues before compilation`);
  }
  const generator = fs.readFileSync(path.join(scriptsRoot, "generate-music-video-plans.mjs"), "utf8");
  assert.match(generator, /loadGatedEchoIsfManifest/);
  assert.doesNotMatch(generator, /applyIsfPixelGate/);
});
