import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { compileHyperFramesShow } from "../src/domain/hyperframes-show-compiler.js";
import {
  ECHO_LANDSCAPE_OUTPUT_PROFILE,
  ECHO_VERTICAL_OUTPUT_PROFILE,
} from "../src/domain/echo-output-profile.js";

function profileProject(outputProfile) {
  return {
    music_video_project: {
      song_id: "profile-song",
      song_title: "Profile Song",
      duration: 4,
      ...(outputProfile === undefined ? {} : { output_profile: outputProfile }),
      song_edit_map: {
        sections: [{ id: "all", type: "verse", label: "All", start: 0, end: 4 }],
        editPulses: [],
      },
      timed_lyrics: [{ text: "Vertical echo", start: 1, end: 3 }],
      timeline: [{
        section_id: "all",
        section_type: "verse",
        start_sec: 0,
        end_sec: 4,
        media_id: "none",
        media_uri: "",
        media_contract: { type: "generated-visualizer" },
      }],
      visualizer_timeline: [],
    },
  };
}

function minimalShowGraph(outputProfile) {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    ...(outputProfile === undefined ? {} : { outputProfile }),
    song: { id: "profile-song", title: "Profile Song", durationSeconds: 4, lyricOverlay: { lines: [] } },
    tracks: [],
    directorV2: {},
  };
}

test("Echo HyperFrame scripts emit canonical profile metadata and profile-sized compositions", () => {
  const landscape = generateEchoHyperframeScript(profileProject().music_video_project);
  assert.match(landscape, /data-output-profile="landscape"/u);
  assert.match(landscape, /data-width="1920"/u);
  assert.match(landscape, /data-height="1080"/u);
  assert.match(landscape, /width: 1920px; height: 1080px/u);

  const vertical = generateEchoHyperframeScript(profileProject("vertical").music_video_project);
  assert.match(vertical, /Output Profile: Vertical \(vertical, 9:16, 1080x1920 @ 30fps\)/u);
  assert.match(vertical, /data-output-profile="vertical"/u);
  assert.match(vertical, /data-output-profile-schema="hapa\.echo\.output-profile\.v1"/u);
  assert.match(vertical, /data-orientation="vertical"/u);
  assert.match(vertical, /data-aspect-ratio="9:16"/u);
  assert.match(vertical, /data-width="1080"/u);
  assert.match(vertical, /data-height="1920"/u);
  assert.match(vertical, /data-fps="30"/u);
  assert.match(vertical, /window\.HAPA_OUTPUT_PROFILE = \{/u);
  assert.match(vertical, /data-safe-bottom="269"/u);
  assert.match(vertical, /width: 1080px; height: 1920px/u);
});

test("Director variants carry canonical output profiles and separate profile hashes", () => {
  const build = (outputProfile) => buildDirectorV2Artifacts({
    project: profileProject(outputProfile),
    manifest: { shaders: [] },
    duration: 4,
    recipe: "conservative",
    seed: "same-profile-seed",
  });
  const legacy = build(undefined);
  const vertical = build("vertical");

  assert.deepEqual(legacy.treatment.outputProfile, ECHO_LANDSCAPE_OUTPUT_PROFILE);
  assert.deepEqual(legacy.showGraph.outputProfile, ECHO_LANDSCAPE_OUTPUT_PROFILE);
  assert.deepEqual(vertical.treatment.outputProfile, ECHO_VERTICAL_OUTPUT_PROFILE);
  assert.deepEqual(vertical.showGraph.outputProfile, ECHO_VERTICAL_OUTPUT_PROFILE);
  assert.deepEqual(vertical.showGraph.directorV2.outputProfile, ECHO_VERTICAL_OUTPUT_PROFILE);
  assert.deepEqual(vertical.receipt.outputProfile, ECHO_VERTICAL_OUTPUT_PROFILE);
  assert.ok(vertical.showGraph.directorV2.mediaRoleCamera.length > 0);
  assert.ok(vertical.showGraph.directorV2.mediaRoleCamera.every((path) => path.corridors[0].targetAspect === 9 / 16));
  assert.ok(legacy.showGraph.directorV2.mediaRoleCamera.every((path) => path.corridors[0].targetAspect === 16 / 9));
  assert.deepEqual(
    vertical.showGraph.directorV2.cameraKeyframes[0].crop,
    vertical.showGraph.directorV2.mediaRoleCamera[0].corridors[0].startCrop,
  );
  assert.notEqual(vertical.treatment.treatmentId, legacy.treatment.treatmentId);
  assert.notEqual(vertical.showGraph.directorV2.variantHash, legacy.showGraph.directorV2.variantHash);
  assert.notEqual(vertical.showGraph.runId, legacy.showGraph.runId);
});

test("HyperFrames executable manifests preserve the graph profile and default legacy graphs to landscape", () => {
  const telemetry = { fps: 10, stems: [] };
  const legacy = compileHyperFramesShow({ showGraph: minimalShowGraph(), telemetry, project: {} });
  const vertical = compileHyperFramesShow({ showGraph: minimalShowGraph("vertical"), telemetry, project: {} });

  assert.deepEqual(legacy.outputProfile, ECHO_LANDSCAPE_OUTPUT_PROFILE);
  assert.deepEqual(vertical.outputProfile, ECHO_VERTICAL_OUTPUT_PROFILE);
  assert.notEqual(vertical.showHash, legacy.showHash);

  assert.throws(
    () => compileHyperFramesShow({ showGraph: minimalShowGraph("landscape"), telemetry, project: profileProject("vertical") }),
    (error) => error?.code === "echo_output_profile_mismatch",
  );
  const inconsistentGraph = minimalShowGraph("vertical");
  inconsistentGraph.directorV2.outputProfile = ECHO_LANDSCAPE_OUTPUT_PROFILE;
  assert.throws(
    () => compileHyperFramesShow({ showGraph: inconsistentGraph, telemetry, project: {} }),
    (error) => error?.code === "echo_output_profile_mismatch",
  );
});

test("HyperFrames phone packages use manifest dimensions, safe areas, portrait type, and cover-cropped shader proxies", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-echo-vertical-hyperframes-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const graphPath = path.join(root, "graph.json");
  const telemetryPath = path.join(root, "telemetry.json");
  const projectPath = path.join(root, "project.json");
  const proxyRegistryPath = path.join(root, "proxies.json");
  const proxyPath = path.join(root, "profile-proxy.png");
  const output = path.join(root, "output");
  const sourceHash = `sha256:${"b".repeat(64)}`;
  const proxyBytes = Buffer.from("vertical-profile-proxy-atlas");
  const assetSha256 = `sha256:${crypto.createHash("sha256").update(proxyBytes).digest("hex")}`;
  fs.writeFileSync(proxyPath, proxyBytes);

  const graph = minimalShowGraph(ECHO_VERTICAL_OUTPUT_PROFILE);
  graph.tracks = [{
    id: "track-b",
    role: "visualizer",
    cards: [{
      id: "vertical-proxy-cue",
      startSeconds: 0,
      endSeconds: 4,
      parameters: { opacity: 0.8 },
      visualization: {
        sourceId: "isf:vertical-profile-proxy",
        card: {
          schemaVersion: "hapa.visualizer-card.v2",
          id: "isf:vertical-profile-proxy",
          title: "Vertical Profile Proxy",
          source: { uri: "/static/isf/shaders/vertical-profile-proxy.fs", hash: sourceHash },
          inputs: [],
          controls: {},
          audioMap: {},
          layer: { opacity: 0.8 },
        },
      },
    }],
  }];
  fs.writeFileSync(graphPath, JSON.stringify(graph));
  fs.writeFileSync(telemetryPath, JSON.stringify({
    fps: 10,
    stems: [{ id: "master", role: "master", frames: [{ t: 0, rms: 0.2, peak: 0.3, onset: 0 }, { t: 4, rms: 0.2, peak: 0.3, onset: 0 }] }],
  }));
  fs.writeFileSync(projectPath, JSON.stringify({ output_profile: "vertical", timeline: [] }));
  fs.writeFileSync(proxyRegistryPath, JSON.stringify({
    proxies: [{
      id: "isf:vertical-profile-proxy",
      sourceHash,
      assetPath: proxyPath,
      assetSha256,
      width: 16,
      height: 9,
      frameCount: 1,
      fps: 1,
    }],
  }));

  const result = spawnSync(process.execPath, [
    "scripts/compile-hyperframes-show-v2.mjs",
    `--graph=${graphPath}`,
    `--telemetry=${telemetryPath}`,
    `--project=${projectPath}`,
    `--proxy-registry=${proxyRegistryPath}`,
    `--output=${output}`,
  ], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);

  const manifest = JSON.parse(fs.readFileSync(path.join(output, "executable-show.json"), "utf8"));
  const html = fs.readFileSync(path.join(output, "index.html"), "utf8");
  assert.deepEqual(manifest.outputProfile, ECHO_VERTICAL_OUTPUT_PROFILE);
  assert.match(html, /content="width=1080,height=1920"/u);
  assert.match(html, /html,body\{margin:0;width:1080px;height:1920px/u);
  assert.match(html, /data-output-profile="vertical"[^>]+data-width="1080" data-height="1920"/u);
  assert.match(html, /<canvas id="viz" class="viz" width="1080" height="1920"><\/canvas>/u);
  assert.match(html, /--hf-action-inset:6%;--hf-title-inset:10%;--hf-lyric-bottom:14%/u);
  assert.match(html, /font:20px ui-monospace/u);
  assert.match(html, /font:900 58px\/\.98/u);
  assert.match(html, /font:800 64px\/1\.12/u);
  assert.match(html, /function aspectCoverSourceRect/u);
  assert.match(html, /coverRect=aspectCoverSourceRect\(rect,C\.width,C\.height\)/u);
  assert.match(html, /drawImage\(img,coverRect\[0\],coverRect\[1\],coverRect\[2\],coverRect\[3\],0,0,C\.width,C\.height\)/u);
  assert.match(html, /echoCameraCropPresentation\(camera\?\.crop\)/u);
  assert.match(html, /el\.style\.objectPosition=framing\?\.objectPosition/u);
  assert.doesNotMatch(html, /drawImage\(img,rect\[0\],rect\[1\],rect\[2\],rect\[3\],0,0,C\.width,C\.height\)/u);
});
