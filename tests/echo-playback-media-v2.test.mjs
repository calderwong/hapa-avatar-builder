import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const projectRoot = path.resolve("data/music-video-projects");
const files = fs.readdirSync(projectRoot).filter((file) => file.endsWith("-video-project.json"));

test("all Echo projects carry typed playback manifests and images never route to video", () => {
  assert.equal(files.length, 79);
  let imageShots = 0;
  for (const file of files) {
    const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, file), "utf8"));
    const project = payload.music_video_project || payload;
    assert.equal(project.media_manifest?.schemaVersion, "hapa.echo.playback-media-manifest.v2", file);
    assert.equal(project.media_manifest.items.length, project.timeline.length, file);
    for (const shot of project.timeline) {
      assert.equal(shot.media_contract?.schemaVersion, "hapa.echo.playback-media.v2", file);
      if (/\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(shot.media_uri || "")) {
        imageShots += 1;
        assert.equal(shot.media_contract.type, "image", file);
        assert.match(shot.media_contract.mimeType, /^image\//);
      }
    }
  }
  assert.equal(imageShots, 16);
  const view = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
  assert.match(view, /shotMediaType\(currentTimelineItem\) === "image"/);
  assert.match(view, /shotMediaType\(currentTimelineItem\) === "video"/);
});

test("Dear Papa proxies are verified cut-friendly H.264 and stay below 60 MiB", () => {
  const payload = JSON.parse(fs.readFileSync(path.join(projectRoot, "dear-papa-song-dear-papa-video-project.json"), "utf8"));
  const project = payload.music_video_project;
  const contracts = project.timeline.filter((shot) => shot.media_contract?.type === "video").map((shot) => shot.media_contract);
  assert.equal(contracts.length, 60);
  assert.ok(contracts.every((contract) => contract.proxy.status === "ready"));
  const unique = [...new Map(contracts.map((contract) => [contract.runtimeUri, contract])).values()];
  const bytes = unique.reduce((sum, contract) => sum + contract.proxy.byteSize, 0);
  assert.ok(bytes < 60 * 1024 * 1024, `Dear Papa proxy payload is ${bytes} bytes`);
  for (const contract of unique) {
    const filePath = path.join("data", decodeURIComponent(contract.runtimeUri));
    const probe = JSON.parse(execFileSync("/opt/homebrew/bin/ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,width,height,bit_rate", "-of", "json", filePath], { encoding: "utf8" }));
    const stream = probe.streams[0];
    assert.equal(stream.codec_name, "h264");
    assert.equal(stream.pix_fmt, "yuv420p");
    assert.ok(Math.max(stream.width, stream.height) <= 1280);
    assert.ok(Number(stream.bit_rate || 0) <= 4_000_000);
    const head = fs.readFileSync(filePath).subarray(0, Math.min(fs.statSync(filePath).size, 1024 * 1024)).toString("latin1");
    assert.ok(head.indexOf("moov") >= 0 && head.indexOf("moov") < head.indexOf("mdat"), `${filePath} is not fast-start`);
    assert.equal(contract.keyframeIntervalSeconds, 1);
  }
});

test("smooth preview compilation loops short sources, verifies outputs, and is exposed per song", () => {
  const builder = fs.readFileSync("scripts/build-echo-playback-media-v2.mjs", "utf8");
  const server = fs.readFileSync("server/api.mjs", "utf8");
  const view = fs.readFileSync("src/components/HapaEchosView.jsx", "utf8");
  assert.match(builder, /"-stream_loop", "-1"/);
  assert.match(builder, /proxy verification failed codec=/);
  assert.match(builder, /actualDurationSeconds/);
  assert.match(builder, /cached\.proxy\?\.durationSeconds/);
  assert.match(builder, /durationCoverage:/);
  assert.match(builder, /commitPlaybackProjection/);
  assert.match(builder, /projectMergeConflicts/);
  assert.doesNotMatch(builder, /need\?\.proxy \|\| cache\[/);
  assert.match(builder, /playbackMode: originalType === "video" \? "loop"/);
  assert.match(server, /\/api\/echos\/director-preview\/prepare/);
  assert.match(server, /build-echo-playback-media-v2\.mjs/);
  assert.match(server, /echoPreviewPreparationQueue/);
  assert.match(server, /status: "queued"/);
  assert.match(view, /COMPILE SMOOTH PREVIEW/);
  assert.match(view, /\["queued", "running"\]\.includes\(previewPreparation\.status\)/);
});
