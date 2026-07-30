#!/usr/bin/env node

import crypto from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { verifyEncodedLyricMaster } from "../server/lyric-render-parity.mjs";
import { hashEchoLyricOverlayExecutionContract } from "../src/domain/hyperframes-show-compiler.js";

const execFile = promisify(execFileCallback);
const ROOT = path.resolve(".");
const OUTPUT = path.join(ROOT, "artifacts/echo-lyric-quality-v4/rendered-parity");
const templates = [
  "kinetic-word-burst-v1",
  "scanline-phrase-ribbon-v1",
  "stacked-hook-echo-v1",
  "orbit-caption-v1",
  "disabled",
];

const writeJson = async (filePath, value) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
};
const fileSha256 = (filePath) => `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
const run = (command, args, options = {}) => execFile(command, args, {
  cwd: ROOT,
  timeout: 10 * 60_000,
  maxBuffer: 64 * 1024 * 1024,
  ...options,
});

await fsp.rm(OUTPUT, { recursive: true, force: true });
await fsp.mkdir(OUTPUT, { recursive: true });
const audioPath = path.join(OUTPUT, "fixture.wav");
const backgroundPath = path.join(OUTPUT, "fixture-background.png");
await run("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "sine=frequency=330:sample_rate=44100:duration=3",
  "-c:a", "pcm_s16le",
  audioPath,
]);
await run("ffmpeg", [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", "color=c=0x071426:s=1920x1080",
  "-frames:v", "1",
  backgroundPath,
]);
const proxyRegistryPath = path.join(OUTPUT, "proxy-registry.json");
await writeJson(proxyRegistryPath, { schemaVersion: "hapa.music-viz.native-exact-proxies.v1", proxies: [] });
const telemetryPath = path.join(OUTPUT, "telemetry.json");
await writeJson(telemetryPath, {
  schemaVersion: "hapa.stem-telemetry.v1",
  fps: 30,
  duration: 3,
  stems: [],
  masterMix: {
    id: "master",
    role: "master",
    frames: [
      { t: 0, rms: .2, peak: .3, onset: .1, low: .2, mid: .3, high: .2 },
      { t: 1.5, rms: .5, peak: .7, onset: .6, low: .4, mid: .6, high: .3 },
      { t: 3, rms: .2, peak: .3, onset: .1, low: .2, mid: .3, high: .2 },
    ],
  },
});

const results = [];
for (const templateId of templates) {
  const enabled = templateId !== "disabled";
  const caseDirectory = path.join(OUTPUT, templateId);
  const packageDirectory = path.join(caseDirectory, "hyperframes");
  const qaDirectory = path.join(caseDirectory, "qa");
  const projectPath = path.join(caseDirectory, "project.json");
  const graphPath = path.join(caseDirectory, "show-graph.json");
  const masterPath = path.join(caseDirectory, "master.mp4");
  const line = {
    index: 0,
    text: "Preview export mint parity",
    start: .75,
    end: 2.25,
    words: [
      { word: "Preview", start: .75, end: 1.1 },
      { word: "export", start: 1.1, end: 1.5 },
      { word: "mint", start: 1.5, end: 1.85 },
      { word: "parity", start: 1.85, end: 2.25 },
    ],
  };
  const lyricOverlay = {
    enabled,
    templateId: enabled ? templateId : "scanline-phrase-ribbon-v1",
    position: "bottom-center",
    style: "neon-cyan",
    timingHash: "sha256:rendered-parity-fixture",
    lines: enabled ? [line] : [],
  };
  const project = {
    song_id: `lyric-parity-${templateId}`,
    song_title: `Lyric Parity ${templateId}`,
    duration: 3,
    output_profile: { id: "landscape" },
    lyrics: lyricOverlay,
    lyrics_enabled: enabled,
    lyric_template_id: lyricOverlay.templateId,
    timed_lyrics: enabled ? [line] : [],
  };
  const showGraph = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    outputProfile: { id: "landscape" },
    song: {
      id: project.song_id,
      title: project.song_title,
      durationSeconds: 3,
      lyricOverlay,
    },
    stems: { items: [] },
    tracks: [{
      id: "track-a",
      role: "media",
      cards: [{
        id: `media:${templateId}`,
        startSeconds: 0,
        endSeconds: 3,
        media: { id: "fixture-background", title: "Fixture Background", localPath: backgroundPath },
        parameters: {},
        provenance: { rendererRoute: "offline-image" },
      }],
    }],
    directorV2: {
      schemaVersion: "hapa.director-v2.v1",
      rendererSupport: { hyperframes: { status: "implemented", route: "deterministic-precompiled-show" } },
      cameraKeyframes: [],
      modulationBindings: [],
      timeModulation: [],
    },
  };
  await writeJson(projectPath, project);
  await writeJson(graphPath, showGraph);
  await run(process.execPath, [
    path.join(ROOT, "scripts/compile-hyperframes-show-v2.mjs"),
    `--graph=${graphPath}`,
    `--telemetry=${telemetryPath}`,
    `--project=${projectPath}`,
    `--source-project-path=${projectPath}`,
    `--proxy-registry=${proxyRegistryPath}`,
    `--output=${packageDirectory}`,
    `--audio=${audioPath}`,
  ]);
  await run(path.join(ROOT, "node_modules/.bin/electron"), [
    path.join(ROOT, "scripts/hyperframes-pixel-capture.cjs"),
    `--project=${packageDirectory}`,
    `--output=${qaDirectory}`,
  ]);
  const pixelReport = JSON.parse(await fsp.readFile(path.join(qaDirectory, "pixel-capture-report.json"), "utf8"));
  await run(process.execPath, [
    path.join(ROOT, "scripts/run-local-hyperframes.mjs"),
    "render",
    `--output=${masterPath}`,
    "--fps=30",
    "--resolution=landscape",
    "--quality=high",
    "--strict",
    "--workers=1",
    "--low-memory-mode",
    packageDirectory,
  ]);
  const encodedMasterProof = await verifyEncodedLyricMaster({
    masterPath,
    pixelReport,
    outputDirectory: path.join(qaDirectory, "encoded-master"),
    execFile,
  });
  const compilerReport = JSON.parse(await fsp.readFile(path.join(packageDirectory, "compiler-report.json"), "utf8"));
  const contractHash = hashEchoLyricOverlayExecutionContract(lyricOverlay);
  const immutableMasterPath = path.join(caseDirectory, "immutable-edition-bundle", "master.mp4");
  await fsp.mkdir(path.dirname(immutableMasterPath), { recursive: true });
  await fsp.copyFile(masterPath, immutableMasterPath);
  const masterSha256 = fileSha256(masterPath);
  const immutableSha256 = fileSha256(immutableMasterPath);
  results.push({
    templateId,
    enabled,
    ok: compilerReport.ok === true
      && pixelReport.lyrics?.ok === true
      && encodedMasterProof.ok === true
      && compilerReport.lyrics?.contractHash === contractHash
      && masterSha256 === immutableSha256,
    contractHash,
    compilerContractHash: compilerReport.lyrics?.contractHash || null,
    boundaryPixelProof: pixelReport.lyrics,
    encodedMasterProof,
    masterPath,
    masterSha256,
    immutableMasterPath,
    immutableSha256,
  });
  process.stdout.write(`${templateId}: ${results.at(-1).ok ? "PASS" : "FAIL"}\n`);
}

const report = {
  schemaVersion: "hapa.echo.preview-export-mint-rendered-parity.v1",
  generatedAt: new Date().toISOString(),
  ok: results.every((result) => result.ok),
  cases: results.length,
  templates: results,
};
await writeJson(path.join(OUTPUT, "report.json"), report);
process.stdout.write(`${JSON.stringify({ ok: report.ok, output: path.join(OUTPUT, "report.json"), cases: report.cases }, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
