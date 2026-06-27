import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
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
  const child = spawn(process.execPath, ["server/api.mjs", "--port", String(PORT), "--static", "dist"], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
  });

  try {
    await waitForHealth(child);

    const summaryResponse = await fetch(`${BASE}/api/echos/director-projects?summary=1`);
    assert.equal(summaryResponse.ok, true);
    const summaryText = await summaryResponse.text();
    const summaries = JSON.parse(summaryText);
    assert.ok(summaries.length > 0, "expected director project summaries");
    assert.ok(summaryText.length < 250_000, `summary payload is too large: ${summaryText.length} bytes`);

    const firstProject = summaries[0].music_video_project;
    assert.ok(firstProject.song_id, "summary must include song_id");
    assert.equal(firstProject.hyperframe_script, undefined, "summary must not ship full HyperFrames script");
    assert.equal(firstProject.timeline, undefined, "summary must not ship full timeline");
    assert.equal(typeof firstProject.timeline_count, "number", "summary should include timeline count");

    const detailResponse = await fetch(`${BASE}/api/echos/director-project?songId=${encodeURIComponent(firstProject.song_id)}`);
    assert.equal(detailResponse.ok, true);
    const detailText = await detailResponse.text();
    const detail = JSON.parse(detailText).music_video_project;
    assert.ok(Array.isArray(detail.timeline), "detail endpoint should hydrate the timeline");
    assert.ok(detail.hyperframe_script, "detail endpoint should hydrate the HyperFrames script");
    assert.ok(detailText.length > summaryText.length / summaries.length, "detail payload should be intentionally larger than one summary row");

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
  }
});
