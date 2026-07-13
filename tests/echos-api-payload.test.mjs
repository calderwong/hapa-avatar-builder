import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PORT = 18997;
const BASE = `http://127.0.0.1:${PORT}`;

async function waitForHealth(child) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < 8000) {
    if (child.exitCode !== null) break;
    try {
      const response = await fetch(`${BASE}/api/health`);
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`server did not become healthy: ${lastError?.message || "unknown"}`);
}

test("Echo summary endpoint stays compact and lazy-loads project detail", async () => {
  const projectFiles = (await fs.readdir(path.join(ROOT, "data/music-video-projects"))).filter((file) => file.endsWith(".json"));
  const targetProjectPayload = JSON.parse(await fs.readFile(path.join(ROOT, "data/music-video-projects", projectFiles[0]), "utf8"));
  const targetSongId = targetProjectPayload.music_video_project.song_id;
  const variantsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "hapa-echo-direction-variants-"));
  const targetVariantDir = path.join(variantsRoot, targetSongId);
  await fs.mkdir(targetVariantDir, { recursive: true });
  await fs.writeFile(path.join(targetVariantDir, "scroll-fal.json"), JSON.stringify({
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "direction:scroll-fal",
    title: "Scroll + FAL append-only",
    createdAt: "2026-07-12T00:00:00.000Z",
    variationSet: { id: "fixture-cuts", label: "Fixture cuts" },
    cut: { ordinal: 2, label: "Rhythmic" },
    densityProfile: { id: "rhythmic", label: "Rhythmic", ordinal: 2 },
    coveragePass: { ordinal: 2, label: "Library pass 2" },
    telemetry: { replacementShots: 1, uniqueMedia: 1 },
    timeline: [{ shot_index: 0, start_sec: 0, end_sec: 4, media_id: "scroll-fixture", media_uri: "/media/scroll-fixture.mp4" }],
    hyperframe_script: "<div data-direction-variant=\"scroll-fal\"></div>"
  }), "utf8");
  await fs.writeFile(path.join(variantsRoot, "index.json"), JSON.stringify({
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    updatedAt: "2026-07-12T00:00:00.000Z",
    variants: [{
      id: `${targetSongId}:direction:scroll-fal`,
      songId: targetSongId,
      variantId: "direction:scroll-fal",
      title: "Scroll + FAL append-only",
      relativePath: `${targetSongId}/scroll-fal.json`,
      createdAt: "2026-07-12T00:00:00.000Z",
      variationSet: { id: "fixture-cuts", label: "Fixture cuts" },
      cut: { ordinal: 2, label: "Rhythmic" },
      densityProfile: { id: "rhythmic", label: "Rhythmic", ordinal: 2 },
      coveragePass: { ordinal: 2, label: "Library pass 2" },
      mediaBearingShots: 1,
      visualizerOnlyShots: 0,
      replacementShots: 1,
      uniqueMedia: 1,
    }],
  }), "utf8");
  const child = spawn(process.execPath, ["server/api.mjs", "--port", String(PORT), "--static", "dist"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, HAPA_ECHO_DIRECTION_VARIANTS_DIR: variantsRoot },
  });

  try {
    await waitForHealth(child);

    const summaryResponse = await fetch(`${BASE}/api/echos/director-projects?summary=1`);
    assert.equal(summaryResponse.ok, true);
    assert.equal(summaryResponse.headers.get("x-hapa-echo-direction-variant-summary"), "index", "fresh album summaries should be served from the compact index");
    const summaryText = await summaryResponse.text();
    const summaries = JSON.parse(summaryText);
    assert.ok(summaries.length > 0, "expected director project summaries");
    assert.ok(summaryText.length < 250_000, `summary payload is too large: ${summaryText.length} bytes`);

    const firstProject = summaries[0].music_video_project;
    assert.ok(firstProject.song_id, "summary must include song_id");
    assert.equal(firstProject.hyperframe_script, undefined, "summary must not ship full HyperFrames script");
    assert.equal(firstProject.timeline, undefined, "summary must not ship full timeline");
    assert.equal(typeof firstProject.timeline_count, "number", "summary should include timeline count");

    const targetSummary = summaries.find((row) => row.music_video_project.song_id === targetSongId).music_video_project;
    assert.equal(targetSummary.direction_script_variant_count, 1);
    assert.deepEqual(targetSummary.direction_script_variant_summaries, [{
      id: "direction:scroll-fal",
      title: "Scroll + FAL append-only",
      schemaVersion: "hapa.echo.direction-script-variant.v1",
      createdAt: "2026-07-12T00:00:00.000Z",
      timelineCount: 1,
      hasHyperframeScript: true,
      nonDestructive: true,
      variationSet: { id: "fixture-cuts", label: "Fixture cuts" },
      cut: { ordinal: 2, label: "Rhythmic" },
      densityProfile: { id: "rhythmic", label: "Rhythmic", ordinal: 2 },
      coveragePass: 2,
      coveragePassLabel: "Library pass 2",
      telemetry: {
        replacementShots: 1,
        uniqueMedia: 1,
        videoEventsPerMinute: null,
        videoCoverageSeconds: null,
      },
      fingerprint: null,
    }]);
    assert.equal(targetSummary.direction_script_variant_summaries[0].timeline, undefined, "summary must not ship variant timelines");
    assert.equal(targetSummary.direction_script_variant_summaries[0].hyperframe_script, undefined, "summary must not ship variant scripts");

    const detailResponse = await fetch(`${BASE}/api/echos/director-project?songId=${encodeURIComponent(firstProject.song_id)}`);
    assert.equal(detailResponse.ok, true);
    const detailText = await detailResponse.text();
    const detail = JSON.parse(detailText).music_video_project;
    assert.ok(Array.isArray(detail.timeline), "detail endpoint should hydrate the timeline");
    assert.ok(detail.hyperframe_script, "detail endpoint should hydrate the HyperFrames script");
    assert.ok(detailText.length > summaryText.length / summaries.length, "detail payload should be intentionally larger than one summary row");

    const targetDetailResponse = await fetch(`${BASE}/api/echos/director-project?songId=${encodeURIComponent(targetSongId)}`);
    assert.equal(targetDetailResponse.ok, true);
    const targetDetail = (await targetDetailResponse.json()).music_video_project;
    assert.equal(targetDetailResponse.headers.get("x-hapa-echo-detail-profile"), "editor-bounded-v1");
    assert.equal(targetDetail.direction_script_variants.length, 1);
    assert.equal(targetDetail.direction_script_variants[0].id, "direction:scroll-fal");
    assert.equal(targetDetail.direction_script_variants[0].variant_source.nonDestructive, true);
    assert.equal(targetDetail.direction_script_variants[0].timeline, undefined, "default detail should ship variant metadata, not every cut timeline");
    assert.equal(targetDetail.direction_script_variants[0].hyperframe_script, undefined, "default detail should not ship every cut script");
    assert.equal(targetDetail.director_show_graph_receipt.delivery.profile, "editor-bounded-v1");

    const selectedCutResponse = await fetch(`${BASE}/api/echos/director-project?songId=${encodeURIComponent(targetSongId)}&variantId=${encodeURIComponent("direction:scroll-fal")}`);
    assert.equal(selectedCutResponse.ok, true);
    assert.equal(selectedCutResponse.headers.get("x-hapa-echo-selected-variant"), "direction:scroll-fal");
    const selectedCutDetail = (await selectedCutResponse.json()).music_video_project;
    assert.equal(selectedCutDetail.direction_script_variants[0].timeline[0].media_id, "scroll-fixture");
    assert.match(selectedCutDetail.direction_script_variants[0].hyperframe_script, /data-direction-variant/);
    assert.equal(selectedCutDetail.selected_direction_script_variant_id, "direction:scroll-fal");

    const sourceProfileResponse = await fetch(`${BASE}/api/echos/director-project?songId=${encodeURIComponent(targetSongId)}&profile=source`);
    assert.equal(sourceProfileResponse.ok, true);
    assert.equal(sourceProfileResponse.headers.get("x-hapa-echo-detail-profile"), "source-v1");
    const sourceProfileDetail = (await sourceProfileResponse.json()).music_video_project;
    assert.equal(sourceProfileDetail.direction_script_variants[0].timeline[0].media_id, "scroll-fixture", "the explicit source profile should retain complete diagnostic payloads");
    assert.deepEqual(sourceProfileDetail.director_show_graph_receipt.delivery.omittedDirectorV2Fields, []);

    const parentVariantPath = path.join(targetVariantDir, "scroll-fal.json");
    const parentBytesBeforeFork = await fs.readFile(parentVariantPath);
    const forkRequest = {
      schemaVersion: "hapa.echo.direction-variant-fork-request.v1",
      songId: targetSongId,
      parentVariantId: "direction:scroll-fal",
      requestedId: "edited-fixture-cut",
      title: "Fixture · Edited cut",
      timeline: [{ shot_index: 0, start_sec: 0, end_sec: 4, media_id: "human-choice", media_uri: "/media/human-choice.mp4" }],
      visualizerTimeline: [{ start_sec: 0, end_sec: 4, visualizer_id: "isf:fixture" }],
      mediaDensityTelemetry: { profile: "airy" },
      projectPatch: { lyric_style: "cinematic", ignored_private_field: "must-not-persist" },
      hyperframeScript: "<div data-direction-variant=\"edited-fixture\"></div>",
    };
    const forkResponse = await fetch(`${BASE}/api/echos/direction-variant/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forkRequest),
    });
    assert.equal(forkResponse.status, 201);
    const forkPayload = await forkResponse.json();
    assert.equal(forkPayload.variant.id, "edited-fixture-cut");
    assert.equal(forkPayload.lineage.parentVariantId, "direction:scroll-fal");
    assert.equal(forkPayload.lineage.nonDestructive, true);
    assert.deepEqual(await fs.readFile(parentVariantPath), parentBytesBeforeFork, "fork must not alter its source cut");
    const childVariant = JSON.parse(await fs.readFile(path.join(targetVariantDir, "edited-fixture-cut.json"), "utf8"));
    assert.equal(childVariant.parent.variantId, "direction:scroll-fal");
    assert.equal(childVariant.parent.immutableParent, true);
    assert.equal(childVariant.timeline[0].media_id, "human-choice");
    assert.equal(childVariant.project_patch.lyric_style, "cinematic");
    assert.equal(childVariant.project_patch.ignored_private_field, undefined);
    assert.match(childVariant.fingerprint, /^sha256:[a-f0-9]{64}$/);
    const forkedDetail = (await (await fetch(`${BASE}/api/echos/director-project?songId=${encodeURIComponent(targetSongId)}&variantId=edited-fixture-cut`)).json()).music_video_project;
    const hydratedChild = forkedDetail.direction_script_variants.find((variant) => variant.id === "edited-fixture-cut");
    assert.equal(hydratedChild.lineage.parentVariantId, "direction:scroll-fal");
    assert.equal(hydratedChild.variant_source.nonDestructive, true);
    const postForkSummaryResponse = await fetch(`${BASE}/api/echos/director-projects?summary=1`);
    assert.equal(postForkSummaryResponse.headers.get("x-hapa-echo-direction-variant-summary"), "index+authoritative-fallback");
    const postForkSummaries = await postForkSummaryResponse.json();
    const postForkTarget = postForkSummaries.find((row) => row.music_video_project.song_id === targetSongId).music_video_project;
    assert.equal(postForkTarget.direction_script_variant_count, 2, "an unindexed child cut must remain immediately visible");
    assert.ok(postForkTarget.direction_script_variant_summaries.some((variant) => variant.id === "edited-fixture-cut"));

    const staleParentResponse = await fetch(`${BASE}/api/echos/direction-variant/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...forkRequest, requestedId: "stale-parent-cut", expectedParentFingerprint: "fnv:stale" }),
    });
    assert.equal(staleParentResponse.status, 409);
    assert.equal((await staleParentResponse.json()).error, "parent_variant_changed");

    const conflictResponse = await fetch(`${BASE}/api/echos/direction-variant/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(forkRequest),
    });
    assert.equal(conflictResponse.status, 409);
    assert.equal((await conflictResponse.json()).error, "direction_variant_conflict");

    const traversalResponse = await fetch(`${BASE}/api/echos/direction-variant/fork`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...forkRequest, songId: "../outside" }),
    });
    assert.equal(traversalResponse.status, 400);
    assert.equal((await traversalResponse.json()).error, "invalid_song_id");

    const gapsResponse = await fetch(`${BASE}/api/echos/gaps?summary=1`);
    assert.equal(gapsResponse.ok, true);
    const gapsText = await gapsResponse.text();
    const gaps = JSON.parse(gapsText);
    assert.ok(gaps.videos.length > 0, "expected media summaries");
    assert.ok(gapsText.length < 1_500_000, `gaps summary payload is too large: ${gapsText.length} bytes`);
    assert.equal(gaps.videos[0].narrativeSummary, undefined, "media summary must not ship long narrative text");
    assert.equal(gaps.videos[0].objectiveSummary, undefined, "media summary must not ship long objective text");

    const videoDetailResponse = await fetch(`${BASE}/api/echos/video-detail?id=${encodeURIComponent(gaps.videos[0].id)}&sourceId=${encodeURIComponent(gaps.videos[0].sourceId)}`);
    assert.equal(videoDetailResponse.ok, true);
    const videoDetail = await videoDetailResponse.json();
    assert.ok("narrativeSummary" in videoDetail, "video detail endpoint should hydrate long narrative text");
  } finally {
    child.kill("SIGTERM");
    await once(child, "exit").catch(() => {});
    await fs.rm(variantsRoot, { recursive: true, force: true });
  }
});
