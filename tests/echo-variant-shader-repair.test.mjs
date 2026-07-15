import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { deriveEchoDirectionVariantProject } from "../src/domain/echo-direction-variants.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 19207;
const BASE = `http://127.0.0.1:${PORT}`;
const SONG_ID = "dear-papa-song-blue";
const QUARANTINED_ID = "isf:5e7a80447c113618206dee1e";

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

function visualizerCards(graph) {
  return graph?.tracks?.find((track) => track.role === "visualizer" || ["track-b", "ivf-stack"].includes(track.id))?.cards || [];
}

test("Echo repairs variant-only timelines and declared graphs without expanding metadata-only cuts", async (t) => {
  const variantsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-echo-variant-shader-repair-"));
  const songDir = path.join(variantsRoot, SONG_ID);
  await fs.mkdir(songDir, { recursive: true });
  const derivedPath = path.join(songDir, "derived-only.json");
  const declaredPath = path.join(songDir, "declared-graph.json");
  const derivedFixture = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "derived-only",
    title: "Derived graph fixture",
    timeline: [{ shot_index: 0, start_sec: 0, end_sec: 4, media_id: "fixture-media" }],
    visualizer_timeline: [{
      start_sec: 0,
      end_sec: 4,
      visualizer_id: QUARANTINED_ID,
      visualizer_title: "Color Chords",
      active_stems: ["Vocals"],
    }],
  };
  const declaredFixture = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "declared-graph",
    title: "Declared graph fixture",
    timeline: [{ shot_index: 0, start_sec: 0, end_sec: 4, media_id: "fixture-media-2" }],
    visualizerTimeline: [{
      startSeconds: 0,
      endSeconds: 4,
      visualizerId: QUARANTINED_ID,
      visualizerTitle: "Color Chords",
      active_stems: ["Drums"],
    }],
    directorShowGraph: {
      schemaVersion: "hapa.music-viz.native-show-graph.v2",
      song: { id: SONG_ID, title: "Blue", durationSeconds: 4 },
      stems: { items: [{ id: "stem:drums", stemType: "Drums", audioPath: "/fixture/drums.wav" }] },
      tracks: [{
        id: "track-b",
        role: "visualizer",
        cards: [{
          id: "variant-only-quarantined-card",
          trackId: "track-b",
          startSeconds: 0,
          endSeconds: 4,
          visualization: { sourceId: QUARANTINED_ID, requestedSourceId: QUARANTINED_ID, status: "declared" },
          parameters: { opacity: 0.62, blendMode: "screen", stemMap: ["Drums"] },
          provenance: { stemFocus: "drums", rendererRoute: "declared" },
        }],
      }],
      directorV2: { variantId: "declared-graph", variantHash: "fixture:declared" },
    },
  };
  await fs.writeFile(derivedPath, `${JSON.stringify(derivedFixture, null, 2)}\n`);
  await fs.writeFile(declaredPath, `${JSON.stringify(declaredFixture, null, 2)}\n`);
  await fs.writeFile(path.join(variantsRoot, "index.json"), `${JSON.stringify({
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [
      {
        songId: SONG_ID,
        variantId: "derived-only",
        title: "Derived graph fixture",
        relativePath: `${SONG_ID}/derived-only.json`,
        mediaBearingShots: 1,
        visualizerOnlyShots: 0,
      },
      {
        songId: SONG_ID,
        variantId: "declared-graph",
        title: "Declared graph fixture",
        relativePath: `${SONG_ID}/declared-graph.json`,
        mediaBearingShots: 1,
        visualizerOnlyShots: 0,
      },
    ],
  }, null, 2)}\n`);
  const sourceBytesBefore = new Map([
    [derivedPath, await fs.readFile(derivedPath)],
    [declaredPath, await fs.readFile(declaredPath)],
  ]);

  const output = [];
  const child = spawn(process.execPath, ["server/api.mjs", "--host", "127.0.0.1", "--port", String(PORT), "--static", "dist"], {
    cwd: ROOT,
    env: { ...process.env, HAPA_ECHO_DIRECTION_VARIANTS_DIR: variantsRoot },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.on("data", (chunk) => output.push(String(chunk)));
  child.stderr.on("data", (chunk) => output.push(String(chunk)));
  t.after(async () => {
    if (child.exitCode === null) child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
    await fs.rm(variantsRoot, { recursive: true, force: true });
  });
  await waitForHealth(child, output);

  const shaders = await (await fetch(`${BASE}/api/echos/shaders`)).json();
  const shaderById = new Map(shaders.map((shader) => [shader.id, shader]));
  assert.equal(shaderById.get(QUARANTINED_ID)?.runtimeEligibility, "unsupported-quarantine");

  const defaultProject = (await (await fetch(`${BASE}/api/echos/director-project?songId=${SONG_ID}`)).json()).music_video_project;
  assert.equal(defaultProject.direction_script_variants.length, 2);
  for (const variant of defaultProject.direction_script_variants) {
    assert.equal(variant.visualizer_timeline, undefined);
    assert.equal(variant.visualizerTimeline, undefined);
    assert.equal(variant.director_show_graph, undefined);
    assert.equal(variant.directorShowGraph, undefined);
    assert.equal(variant.runtime_shader_repair_receipt, undefined);
  }

  const derivedProject = (await (await fetch(`${BASE}/api/echos/director-project?songId=${SONG_ID}&variantId=derived-only`)).json()).music_video_project;
  const derived = derivedProject.direction_script_variants.find((variant) => variant.id === "derived-only");
  assert.equal(derived?.director_show_graph, undefined, "an unpublished cut must not receive an on-demand execution graph");
  assert.equal(derived?.execution_preview?.status, "preparing");
  assert.notEqual(derived.visualizer_timeline[0].visualizer_id, QUARANTINED_ID);
  assert.equal(derived.visualizer_timeline[0].shader_repair.originalId, QUARANTINED_ID);
  assert.equal(derived.runtime_shader_repair_receipt.sourceVariantMutated, false);
  assert.ok(derived.runtime_shader_repair_receipt.scopes.some((scope) => scope.scope === "variant:derived-only:visualizer_timeline" && scope.replacementCount === 1));
  assert.ok(!derivedProject.runtime_shader_repair_receipt.scopes.some((scope) => scope.scope === "variant:derived-only:derived-director-show-graph"));
  assert.equal(deriveEchoDirectionVariantProject(derivedProject, derived).director_show_graph, null, "the client projection must not recreate an unpublished graph");

  const declaredProject = (await (await fetch(`${BASE}/api/echos/director-project?songId=${SONG_ID}&variantId=declared-graph`)).json()).music_video_project;
  const declared = declaredProject.direction_script_variants.find((variant) => variant.id === "declared-graph");
  assert.notEqual(declared.visualizerTimeline[0].visualizerId, QUARANTINED_ID);
  assert.equal(declared.visualizerTimeline[0].visualizer_id, declared.visualizerTimeline[0].visualizerId);
  assert.equal(declared.directorShowGraph, undefined, "a declared source graph cannot bypass immutable cut certification");
  assert.equal(declared.execution_preview.status, "preparing");
  assert.ok(declared.runtime_shader_repair_receipt.scopes.some((scope) => scope.scope === "variant:declared-graph:directorShowGraph" && scope.replacementCount === 1));

  const sourceProject = (await (await fetch(`${BASE}/api/echos/director-project?songId=${SONG_ID}&profile=source`)).json()).music_video_project;
  const sourceDerived = sourceProject.direction_script_variants.find((variant) => variant.id === "derived-only");
  const sourceDeclared = sourceProject.direction_script_variants.find((variant) => variant.id === "declared-graph");
  assert.notEqual(sourceDerived.visualizer_timeline[0].visualizer_id, QUARANTINED_ID, "every full source-profile timeline should be repaired independently");
  assert.notEqual(sourceDeclared.visualizerTimeline[0].visualizerId, QUARANTINED_ID);
  assert.notEqual(visualizerCards(sourceDeclared.directorShowGraph)[0].visualization.sourceId, QUARANTINED_ID);
  assert.deepEqual(await fs.readFile(derivedPath), sourceBytesBefore.get(derivedPath));
  assert.deepEqual(await fs.readFile(declaredPath), sourceBytesBefore.get(declaredPath));
});
