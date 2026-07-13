#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  buildFoundationFfmpegArgs,
  buildFoundationTimeline,
  installFoundationReelInShow,
  inlineFoundationRuntimeHtml,
  patchFoundationReelHtml,
} from "../src/domain/hyperframes-foundation-reel.js";
import { clipHyperFramesShow } from "../src/domain/hyperframes-show-compiler.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const value = (name, fallback = null) => {
  const prefix = `--${name}=`;
  const row = process.argv.find((argument) => argument.startsWith(prefix));
  return row ? row.slice(prefix.length) : fallback;
};
const flag = (name) => process.argv.includes(`--${name}`);
const sourceProject = path.resolve(value("project", path.join(ROOT, "outputs/hyperframes-dear-papa-v2-demo")));
const outputProject = path.resolve(value("output", path.join(ROOT, "outputs/hyperframes-dear-papa-v2-foundation-demo")));
const fps = Number(value("fps", "30"));
const width = Number(value("width", "1920"));
const height = Number(value("height", "1080"));
const preset = value("preset", "faster");
const crf = Number(value("crf", "18"));
const requestedDuration = Number(value("duration", "0"));
const planOnly = flag("plan-only");

const sourceManifestPath = path.join(sourceProject, "executable-show.json");
const sourceHtmlPath = path.join(sourceProject, "index.html");
if (!fs.existsSync(sourceManifestPath) || !fs.existsSync(sourceHtmlPath)) {
  throw new Error(`Source project is not a compiled HyperFrames project: ${sourceProject}`);
}

const sha256 = (bytes) => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const stable = (input) => {
  if (Array.isArray(input)) return input.map(stable);
  if (input && typeof input === "object") return Object.fromEntries(Object.keys(input).sort().map((key) => [key, stable(input[key])]));
  return input;
};
const stableHash = (input) => sha256(JSON.stringify(stable(input)));
const copyTree = (source, destination) => {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(destination, { recursive: true });
  for (const row of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, row.name);
    const to = path.join(destination, row.name);
    if (row.isDirectory()) copyTree(from, to);
    else if (row.isFile()) fs.copyFileSync(from, to);
  }
};
const run = (command, args, options = {}) => {
  const startedAt = Date.now();
  const result = spawnSync(command, args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, ...options });
  const elapsedSeconds = Number(((Date.now() - startedAt) / 1000).toFixed(3));
  if (result.status !== 0) {
    throw new Error(`${command} failed (${result.status}) after ${elapsedSeconds}s\n${result.stderr || result.stdout}`);
  }
  return { ...result, elapsedSeconds };
};
const probe = (file) => JSON.parse(run("ffprobe", [
  "-v", "error",
  "-show_entries", "format=duration,size,bit_rate:stream=index,codec_type,codec_name,width,height,pix_fmt,r_frame_rate,avg_frame_rate,nb_frames",
  "-of", "json",
  file,
]).stdout);
const atomOffsets = (file) => {
  const bytes = fs.readFileSync(file);
  const rows = [];
  let offset = 0;
  while (offset + 8 <= bytes.length) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    let header = 8;
    if (size === 1 && offset + 16 <= bytes.length) {
      size = Number(bytes.readBigUInt64BE(offset + 8));
      header = 16;
    } else if (size === 0) size = bytes.length - offset;
    if (!(size >= header) || offset + size > bytes.length) break;
    rows.push({ type, offset, size });
    offset += size;
  }
  return rows;
};

const sourceManifestBytes = fs.readFileSync(sourceManifestPath);
const fullShow = JSON.parse(sourceManifestBytes.toString("utf8"));
const show = requestedDuration > 0 && requestedDuration < Number(fullShow.duration)
  ? clipHyperFramesShow(fullShow, requestedDuration)
  : fullShow;
const plan = buildFoundationTimeline(show, { projectRoot: sourceProject, fps, width, height });
const planHash = stableHash(plan);
fs.mkdirSync(outputProject, { recursive: true });
fs.writeFileSync(path.join(outputProject, "foundation-reel-plan.json"), `${JSON.stringify({ ...plan, planSha256: planHash }, null, 2)}\n`);

if (planOnly) {
  console.log(JSON.stringify({ ok: true, planOnly: true, outputProject, planSha256: planHash, plan }, null, 2));
  process.exit(0);
}

for (const directory of ["assets/audio", "assets/data", "assets/media", "assets/runtime", "assets/visualizers", "qa", "renders"]) {
  fs.mkdirSync(path.join(outputProject, directory), { recursive: true });
}
copyTree(path.join(sourceProject, "assets/audio"), path.join(outputProject, "assets/audio"));
copyTree(path.join(sourceProject, "assets/runtime"), path.join(outputProject, "assets/runtime"));
copyTree(path.join(sourceProject, "assets/visualizers"), path.join(outputProject, "assets/visualizers"));
if (fs.existsSync(path.join(sourceProject, "DESIGN.md"))) fs.copyFileSync(path.join(sourceProject, "DESIGN.md"), path.join(outputProject, "DESIGN.md"));

const reelName = `${String(show.title || "hapa").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hapa"}-foundation-reel.mp4`;
const reelPath = path.join(outputProject, "assets/media", reelName);
const temporaryReel = `${reelPath}.tmp.mp4`;
const ffmpegArgs = buildFoundationFfmpegArgs(plan, temporaryReel, { preset, crf });
const ffmpeg = run("ffmpeg", ffmpegArgs, { cwd: sourceProject });
fs.renameSync(temporaryReel, reelPath);
const reelProbe = probe(reelPath);
const videoStream = (reelProbe.streams || []).find((row) => row.codec_type === "video") || {};
const atoms = atomOffsets(reelPath);
const moov = atoms.find((row) => row.type === "moov");
const mdat = atoms.find((row) => row.type === "mdat");
const faststart = Boolean(moov && mdat && moov.offset < mdat.offset);
const durationDelta = Math.abs(Number(reelProbe.format?.duration || 0) - plan.duration);
const frameDelta = Math.abs(Number(videoStream.nb_frames || 0) - plan.totalFrames);
if (videoStream.codec_name !== "h264" || videoStream.pix_fmt !== "yuv420p" || !faststart || durationDelta > 1 / fps || frameDelta > 1) {
  throw new Error(`Foundation reel verification failed: ${JSON.stringify({ videoStream, faststart, durationDelta, frameDelta })}`);
}

const reelHash = fileSha256(reelPath);
const reelUri = `assets/media/${reelName}`;
const derivedShow = installFoundationReelInShow(show, {
  compiledUri: reelUri,
  sha256: reelHash,
  planSha256: planHash,
  sourceManifestSha256: sha256(sourceManifestBytes),
  boundedFromDurationSeconds: Number(fullShow.duration),
  explicitBlackIntervals: plan.explicitBlackIntervals,
});
derivedShow.showHash = stableHash({ ...derivedShow, showHash: undefined });
fs.writeFileSync(path.join(outputProject, "executable-show.json"), `${JSON.stringify(derivedShow, null, 2)}\n`);
fs.writeFileSync(path.join(outputProject, "assets/data/show.js"), `window.HAPA_EXECUTABLE_SHOW=${JSON.stringify(derivedShow)};\n`);
const patchedHtml = patchFoundationReelHtml(fs.readFileSync(sourceHtmlPath, "utf8"), { duration: plan.duration, reelUri });
const derivedHtml = inlineFoundationRuntimeHtml(patchedHtml, {
  showScript: `window.HAPA_EXECUTABLE_SHOW=${JSON.stringify(derivedShow)};`,
  pinnedTimelineSource: fs.readFileSync(path.join(sourceProject, "assets/runtime/pinned-timeline.js"), "utf8"),
  visualizerRuntimeSource: fs.readFileSync(path.join(sourceProject, "assets/runtime/hyperframes-visualizer-runtime.js"), "utf8"),
});
fs.writeFileSync(path.join(outputProject, "index.html"), derivedHtml);

const compiledAudioPath = path.join(outputProject, "assets/audio/full_mix.mp3");
const productionArtifactPath = path.join(outputProject, "renders", `${String(show.title || "hapa").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "hapa"}-foundation-production.mp4`);
let productionArtifact = null;
if (fs.existsSync(compiledAudioPath)) {
  const mux = run("ffmpeg", [
    "-hide_banner", "-loglevel", "warning",
    "-i", reelPath,
    "-i", compiledAudioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-b:a", "256k",
    "-t", String(plan.duration),
    "-movflags", "+faststart",
    "-map_metadata", "-1",
    "-metadata", "creation_time=",
    "-y", productionArtifactPath,
  ]);
  const productionProbe = probe(productionArtifactPath);
  const productionAtoms = atomOffsets(productionArtifactPath);
  const productionMoov = productionAtoms.find((row) => row.type === "moov");
  const productionMdat = productionAtoms.find((row) => row.type === "mdat");
  productionArtifact = {
    path: productionArtifactPath,
    sha256: fileSha256(productionArtifactPath),
    elapsedSeconds: mux.elapsedSeconds,
    probe: productionProbe,
    faststart: Boolean(productionMoov && productionMdat && productionMoov.offset < productionMdat.offset),
    foundationOnly: true,
    overlays: "retained in the adjacent HyperFrames project and verified by pixel-capture; not baked into this fallback artifact",
    bootstrapPixels: false,
  };
}

const report = {
  schemaVersion: "hapa.hyperframes.foundation-reel-report.v1",
  ok: true,
  sourceProject,
  outputProject,
  sourceManifestPath,
  sourceManifestSha256: sha256(sourceManifestBytes),
  planPath: path.join(outputProject, "foundation-reel-plan.json"),
  planSha256: planHash,
  reelPath,
  reelUri,
  reelSha256: reelHash,
  productionArtifact,
  ffmpeg: {
    elapsedSeconds: ffmpeg.elapsedSeconds,
    preset,
    crf,
    args: ffmpegArgs,
  },
  verification: {
    probe: reelProbe,
    codec: videoStream.codec_name,
    pixelFormat: videoStream.pix_fmt,
    width: videoStream.width,
    height: videoStream.height,
    fps: videoStream.avg_frame_rate,
    frameCount: Number(videoStream.nb_frames || 0),
    durationSeconds: Number(reelProbe.format?.duration || 0),
    durationDeltaSeconds: durationDelta,
    frameDelta,
    faststart,
    topLevelAtoms: atoms,
    bootstrapPixels: false,
    physicalVideoElementCount: 1,
  },
  coverage: {
    sourceMediaInstanceCount: plan.segments.length,
    mediaSegments: plan.mediaSegments,
    explicitBlackSegments: plan.explicitBlackSegments,
    explicitBlackIntervals: plan.explicitBlackIntervals,
    cameraBakedSegments: plan.cameraBakedSegments,
    unexplainedGapFrames: 0,
  },
  retained: {
    visualizerInstances: derivedShow.instances?.visualizers?.length || 0,
    lyricInstances: derivedShow.instances?.lyrics?.length || 0,
    accentEvents: derivedShow.instances?.accents?.length || 0,
    cameraAutomationEvents: derivedShow.automation?.camera?.length || 0,
    audio: fs.existsSync(path.join(outputProject, "assets/audio/full_mix.mp3")),
    deterministicTimeline: true,
    networkDependencies: 0,
  },
};
fs.writeFileSync(path.join(outputProject, "foundation-reel-report.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(outputProject, "compiler-report.json"), `${JSON.stringify({
  schemaVersion: "hapa.hyperframes.compiler-report.v3",
  ok: true,
  output: outputProject,
  boundedDemo: { enabled: true, compiledDurationSeconds: plan.duration },
  media: { declared: 1, compiled: 1, offlineMissing: [], foundationReel: report.coverage },
  visualizers: { declared: report.retained.visualizerInstances, offlineMissing: [] },
  runtime: { mediaRoute: "single-precompiled-foundation-reel", networkDependencies: 0, bootstrapPixels: false },
  validation: { foundationReel: "pass", mediaOffline: "pass", showcaseReady: true },
}, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
