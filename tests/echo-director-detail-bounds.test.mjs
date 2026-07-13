import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 19397;
const BASE = `http://127.0.0.1:${PORT}`;
const SONG_ID = "dear-papa-song-boba-tea-strum";
const SELECTED_VARIANT_ID = "wide-coverage-dense-v1";

async function waitForHealth(child, output) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000 && child.exitCode === null) {
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch {
      // The isolated server has not bound its test port yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Builder API did not become healthy.\n${output.join("").slice(-4_000)}`);
}

async function measuredJson(url) {
  const startedAt = performance.now();
  const response = await fetch(url);
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    response,
    bytes: bytes.byteLength,
    elapsedMs: performance.now() - startedAt,
    payload: JSON.parse(bytes.toString("utf8")),
  };
}

test("Boba Tea Strum detail stays bounded and hydrates only the selected cut", async (t) => {
  const output = [];
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(PORT), "--static", "dist"], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
  });
  await waitForHealth(child, output);

  const detailUrl = `${BASE}/api/echos/director-project?songId=${encodeURIComponent(SONG_ID)}`;
  const cold = await measuredJson(detailUrl);
  const warm = await measuredJson(detailUrl);
  const selected = await measuredJson(`${detailUrl}&variantId=${encodeURIComponent(SELECTED_VARIANT_ID)}`);
  const source = await measuredJson(`${detailUrl}&profile=source`);

  assert.equal(cold.response.status, 200);
  assert.equal(cold.response.headers.get("x-hapa-echo-detail-profile"), "editor-bounded-v1");
  assert.equal(selected.response.headers.get("x-hapa-echo-selected-variant"), SELECTED_VARIANT_ID);
  assert.equal(source.response.headers.get("x-hapa-echo-detail-profile"), "source-v1");

  const coldProject = cold.payload.music_video_project;
  const warmProject = warm.payload.music_video_project;
  const selectedProject = selected.payload.music_video_project;
  const sourceProject = source.payload.music_video_project;
  const catalogIds = coldProject.direction_script_variants.map((variant) => variant.id);

  assert.ok(catalogIds.length >= 5, "the compact response should retain the complete Boba cut catalog");
  assert.deepEqual(warmProject.direction_script_variants.map((variant) => variant.id), catalogIds);
  assert.deepEqual(selectedProject.direction_script_variants.map((variant) => variant.id), catalogIds, "switching cuts must preserve every metadata option");
  assert.equal(coldProject.direction_script_variants.filter((variant) => Array.isArray(variant.timeline)).length, 0);
  assert.deepEqual(
    selectedProject.direction_script_variants.filter((variant) => Array.isArray(variant.timeline)).map((variant) => variant.id),
    [SELECTED_VARIANT_ID],
  );
  assert.ok(sourceProject.direction_script_variants.every((variant) => Array.isArray(variant.timeline)), "the explicit source profile remains lossless");
  for (const field of coldProject.director_show_graph_receipt.delivery.omittedDirectorV2Fields) {
    assert.equal(coldProject.director_show_graph.directorV2[field], undefined, `${field} should not ride the editor response`);
    assert.notEqual(sourceProject.director_show_graph.directorV2[field], undefined, `${field} must remain available from the source profile`);
  }

  assert.ok(cold.bytes < 3_000_000, `cold editor detail exceeded its 3 MB budget: ${cold.bytes}`);
  assert.ok(selected.bytes < 3_500_000, `selected-cut detail exceeded its 3.5 MB budget: ${selected.bytes}`);
  assert.ok(cold.bytes < source.bytes * 0.55, `compact detail should be materially smaller (${cold.bytes}/${source.bytes})`);
  assert.ok(selected.bytes < source.bytes * 0.65, `selected-cut detail should stay bounded (${selected.bytes}/${source.bytes})`);
  assert.ok(cold.elapsedMs < 5_000 && warm.elapsedMs < 5_000 && selected.elapsedMs < 5_000, "bounded detail requests should not stall the API event loop");
  t.diagnostic(`Boba detail benchmark: cold ${cold.elapsedMs.toFixed(1)} ms / ${cold.bytes} B; warm ${warm.elapsedMs.toFixed(1)} ms / ${warm.bytes} B; selected ${selected.elapsedMs.toFixed(1)} ms / ${selected.bytes} B; source ${source.elapsedMs.toFixed(1)} ms / ${source.bytes} B`);
});
