import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MUSIC_VIZ_ROOT = process.env.HAPA_MUSIC_VIZ_ROOT || "/Users/calderwong/Desktop/hapa-music-viz";
const PORT = 19182;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForHealth(child, output) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000 && child.exitCode === null) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      // The server has not bound its port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Builder API did not become healthy.\n${output.join("").slice(-4_000)}`);
}

async function fetchShaderBatch(shaders, batchSize = 24) {
  const rows = [];
  for (let index = 0; index < shaders.length; index += batchSize) {
    const batch = shaders.slice(index, index + batchSize);
    rows.push(...await Promise.all(batch.map(async (shader) => {
      const response = await fetch(`${BASE}${shader.source}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      return { shader, response, bytes };
    })));
  }
  return rows;
}

test("Builder serves a hash-verified ISF catalog/runtime and hydrates the compiled Director graph", async (t) => {
  assert.equal(fs.existsSync(path.join(MUSIC_VIZ_ROOT, "web/isf/manifest.json")), true, "canonical Music Viz manifest is required");
  const output = [];
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(PORT), "--static", "dist"], {
    cwd: ROOT,
    env: { ...process.env, HAPA_MUSIC_VIZ_ROOT: MUSIC_VIZ_ROOT },
    stdio: ["ignore", "pipe", "pipe"]
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));

  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
  });
  await waitForHealth(child, output);

  const catalogResponse = await fetch(`${BASE}/api/echos/shaders`);
  assert.equal(catalogResponse.status, 200);
  assert.match(catalogResponse.headers.get("content-type") || "", /^application\/json/);
  const shaders = await catalogResponse.json();
  assert.equal(shaders.length, 182);
  assert.equal(new Set(shaders.map((shader) => shader.id)).size, 182);
  assert.equal(new Set(shaders.map((shader) => shader.source)).size, 182);
  const pixelGateQuarantine = shaders.filter((shader) => shader.runtimeEligibility === "unsupported-quarantine");
  assert.equal(pixelGateQuarantine.length, 20);
  assert.ok(pixelGateQuarantine.every((shader) => shader.directorEligible === false && shader.enabled === false));
  assert.ok(pixelGateQuarantine.every((shader) => shader.pixelGate?.status === "source-hash-verified"));
  assert.equal(shaders.find((shader) => shader.id === "isf:5e7a80447c113618206dee1e")?.pixelGate?.classification, "unsupported-quarantine");
  const finalReadyCatalog = shaders.filter((shader) => shader.directorEligible !== false && shader.enabled !== false);
  assert.equal(finalReadyCatalog.length, 160);
  assert.ok(finalReadyCatalog.every((shader) => shader.hyperframesProxy?.verified === true));
  assert.ok(finalReadyCatalog.every((shader) => shader.hyperframesProxy?.sourceHash === shader.sourceHash));
  assert.ok(finalReadyCatalog.every((shader) => ["exact-native", "hash-bound-exact-proxy"].includes(shader.nativeRoute?.route)));
  const linescape = shaders.find((shader) => shader.id === "isf:5f4321100c6c470015d2fec0");
  assert.equal(linescape?.title, "Linescape");
  assert.equal(linescape?.hyperframesProxy?.frameCount, 8);
  assert.match(linescape?.hyperframesProxy?.assetSha256 || "", /^sha256:[a-f0-9]{64}$/);
  assert.deepEqual(linescape?.hyperframesProxy?.controls, { Offset_X: 1, Speed: 0 });
  for (const shader of shaders) {
    assert.match(shader.id, /^(isf:|builtin:)/);
    assert.match(shader.source, /^\/api\/echos\/shader-source\?id=/);
    assert.match(shader.sourceHash, /^sha256:[a-f0-9]{64}$/);
    assert.ok(shader.sourceBytes > 0);
    assert.match(shader.runtime, /^\/api\/echos\/isf-runtime\.js\?sha256=[a-f0-9]{64}$/);
    assert.match(shader.runtimeHash, /^sha256:[a-f0-9]{64}$/);
    assert.ok(shader.runtimeBytes > 0);
  }

  const sourceRows = await fetchShaderBatch(shaders);
  for (const { shader, response, bytes } of sourceRows) {
    assert.equal(response.status, 200, shader.id);
    assert.match(response.headers.get("content-type") || "", /^text\/plain/);
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.equal(response.headers.get("x-hapa-shader-id"), shader.id);
    assert.equal(response.headers.get("x-hapa-source-sha256"), shader.sourceHash.slice("sha256:".length));
    assert.equal(Number(response.headers.get("content-length")), shader.sourceBytes);
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assert.equal(createHash("sha256").update(bytes).digest("hex"), shader.sourceHash.slice("sha256:".length));
    assert.doesNotMatch(bytes.toString("utf8", 0, 160), /<!doctype html|<html/i);
  }

  const first = shaders[0];
  const firstResponse = sourceRows[0].response;
  const headResponse = await fetch(`${BASE}${first.source}`, { method: "HEAD" });
  assert.equal(headResponse.status, 200);
  assert.equal(Number(headResponse.headers.get("content-length")), first.sourceBytes);
  assert.equal((await headResponse.arrayBuffer()).byteLength, 0);
  const notModified = await fetch(`${BASE}${first.source}`, {
    headers: { "If-None-Match": firstResponse.headers.get("etag") }
  });
  assert.equal(notModified.status, 304);
  assert.equal((await notModified.arrayBuffer()).byteLength, 0);

  const wrongHash = await fetch(`${BASE}/api/echos/shader-source?id=${encodeURIComponent(first.id)}&sha256=${"0".repeat(64)}`);
  assert.equal(wrongHash.status, 409);
  assert.equal((await wrongHash.json()).error, "shader_source_hash_mismatch");
  const unknown = await fetch(`${BASE}/api/echos/shader-source?id=${encodeURIComponent("../../etc/passwd")}`);
  assert.equal(unknown.status, 404);
  assert.match(unknown.headers.get("content-type") || "", /^application\/json/);
  assert.doesNotMatch(await unknown.text(), /<!doctype html|<html/i);
  const wrongMethod = await fetch(`${BASE}/api/echos/shader-source?id=${encodeURIComponent(first.id)}`, { method: "POST" });
  assert.equal(wrongMethod.status, 405);
  assert.match(wrongMethod.headers.get("content-type") || "", /^application\/json/);
  assert.doesNotMatch(await wrongMethod.text(), /<!doctype html|<html/i);
  const malformedAssetRoute = await fetch(`${BASE}/api/echos/shader-source/not-a-real-asset`);
  assert.equal(malformedAssetRoute.status, 404);
  assert.match(malformedAssetRoute.headers.get("content-type") || "", /^application\/json/);
  assert.doesNotMatch(await malformedAssetRoute.text(), /<!doctype html|<html/i);

  const runtimeResponse = await fetch(`${BASE}${first.runtime}`);
  const runtimeBytes = Buffer.from(await runtimeResponse.arrayBuffer());
  assert.equal(runtimeResponse.status, 200);
  assert.match(runtimeResponse.headers.get("content-type") || "", /^text\/javascript/);
  assert.equal(runtimeResponse.headers.get("x-content-type-options"), "nosniff");
  assert.equal(runtimeResponse.headers.get("cache-control"), "public, max-age=31536000, immutable");
  assert.equal(runtimeBytes.byteLength, first.runtimeBytes);
  assert.equal(createHash("sha256").update(runtimeBytes).digest("hex"), first.runtimeHash.slice("sha256:".length));
  assert.match(runtimeBytes.toString("utf8", 0, 500), /interactiveShaderFormat/);
  const badRuntime = await fetch(`${BASE}/api/echos/isf-runtime.js?sha256=${"f".repeat(64)}`);
  assert.equal(badRuntime.status, 409);
  assert.equal((await badRuntime.json()).error, "isf_runtime_hash_mismatch");

  const detailResponse = await fetch(`${BASE}/api/echos/director-project?songId=dear-papa-song-dear-papa`);
  assert.equal(detailResponse.status, 200);
  const project = (await detailResponse.json()).music_video_project;
  assert.ok(["ready", "preparing"].includes(project.director_show_graph_receipt.status));
  if (project.director_show_graph_receipt.status === "ready") {
    assert.match(project.director_show_graph_receipt.sourceHash, /^sha256:[a-f0-9]{64}$/);
  } else {
    assert.ok(project.director_show_graph_receipt.reason);
  }
  assert.ok(Array.isArray(project.timeline) && project.timeline.length > 0);
  if (project.director_show_graph) {
    assert.equal(project.director_show_graph.schemaVersion, "hapa.music-viz.native-show-graph.v2");
    assert.ok([project.song_id, project.audio_id, project.registry_track_id].includes(project.director_show_graph.song.id));
    const visualizerTrack = project.director_show_graph.tracks.find((track) => track.role === "visualizer" || track.id === "track-b");
    assert.ok(visualizerTrack.cards.length > 0);
    assert.equal(project.director_show_graph_receipt.visualizerCards, visualizerTrack.cards.length);
    assert.ok(visualizerTrack.cards.every((card) => card.visualization?.sourceId));
  } else {
    assert.equal(project.director_show_graph_receipt.status, "preparing");
    assert.ok(project.director_show_graph_receipt.reason);
  }

  const blueResponse = await fetch(`${BASE}/api/echos/director-project?songId=dear-papa-song-blue`);
  assert.equal(blueResponse.status, 200);
  const blue = (await blueResponse.json()).music_video_project;
  assert.ok(blue.runtime_shader_repair_receipt.replacementCount >= 0);
  assert.equal(blue.runtime_shader_repair_receipt.sourceProjectMutated, false);
  if (blue.runtime_shader_repair_receipt.replacementCount > 0) {
    assert.ok(blue.runtime_shader_repair_receipt.replacements.some((row) => row.originalId === "isf:5e7a80447c113618206dee1e"));
  }
  assert.equal(blue.visualizer_timeline.some((row) => row.visualizer_id === "isf:5e7a80447c113618206dee1e"), false);
  if (blue.director_show_graph) {
    const blueVisualizerCards = blue.director_show_graph.tracks.find((track) => track.id === "track-b" || track.role === "visualizer").cards;
    assert.equal(blueVisualizerCards.some((card) => card.visualization?.sourceId === "isf:5e7a80447c113618206dee1e"), false);
    if (blue.runtime_shader_repair_receipt.replacementCount > 0) {
      assert.ok(blueVisualizerCards.some((card) => card.provenance?.runtimeShaderRepair?.originalId === "isf:5e7a80447c113618206dee1e"));
    }
  } else {
    assert.equal(blue.director_show_graph_receipt.status, "preparing");
  }
});
