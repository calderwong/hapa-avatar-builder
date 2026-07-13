#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = path.resolve(import.meta.dirname, "..");
const mediaRoot = path.join(root, "data", "media");
const projectRoot = path.join(root, "data", "music-video-projects");
const proxyRoot = path.join(mediaRoot, "echo-proxies-v2");
const reportPath = path.join(root, "artifacts", "echo-playback-media-v2", "report.json");
const cachePath = path.join(root, "artifacts", "echo-playback-media-v2", "cache.json");
const apply = process.argv.includes("--apply");
const concurrency = Math.max(1, Number(process.env.HAPA_PROXY_CONCURRENCY || 5));
const onlyDearPapa = process.argv.includes("--dear-papa-only");
const onlySongId = process.argv.find((value) => value.startsWith("--song="))?.slice("--song=".length) || "";
const imagePattern = /\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i;

function resolveUri(uri = "") {
  if (uri.startsWith("/api/local-file?")) {
    try {
      const file = new URL(uri, "http://127.0.0.1").searchParams.get("path") || "";
      return path.isAbsolute(file) ? file : "";
    } catch { return ""; }
  }
  if (!uri.startsWith("/media/")) return "";
  const file = path.resolve(mediaRoot, decodeURIComponent(uri.slice(7)));
  return file.startsWith(`${mediaRoot}${path.sep}`) ? file : "";
}

function uriFor(file) {
  return `/media/${path.relative(mediaRoot, file).split(path.sep).map(encodeURIComponent).join("/")}`;
}

async function mapLimit(values, limit, fn) {
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, async () => {
    while (cursor < values.length) await fn(values[cursor++]);
  }));
}

const files = (await fs.readdir(projectRoot)).filter((file) => file.endsWith("-video-project.json")).sort();
const projects = await Promise.all(files.map(async (file) => {
  const originalText = await fs.readFile(path.join(projectRoot, file), "utf8");
  return { file, originalText, payload: JSON.parse(originalText) };
}));
const sourceNeeds = new Map();
let imageShots = 0;
let visualizerShots = 0;
let videoShots = 0;
for (const entry of projects) {
  const project = entry.payload.music_video_project || entry.payload;
  for (const shot of project.timeline || []) {
    const uri = String(shot.media_uri || "");
    if (!uri || shot.media_id === "none") { visualizerShots += 1; continue; }
    if (imagePattern.test(uri)) { imageShots += 1; continue; }
    videoShots += 1;
    const sourcePath = resolveUri(uri);
    if (!sourcePath) continue;
    const duration = Math.max(0.1, Number(shot.end_sec || 0) - Number(shot.start_sec || 0));
    const need = sourceNeeds.get(sourcePath) || { sourcePath, duration: 0, refs: [] };
    need.duration = Math.max(need.duration, duration);
    need.refs.push({ projectId: project.song_id, shotIndex: shot.shot_index, start: shot.start_sec, end: shot.end_sec });
    sourceNeeds.set(sourcePath, need);
  }
}

let cache = {};
try { cache = JSON.parse(await fs.readFile(cachePath, "utf8")); } catch { /* first run */ }
await fs.mkdir(proxyRoot, { recursive: true });
const selectedNeeds = [...sourceNeeds.values()].filter((need) => {
  if (onlySongId) return need.refs.some((ref) => ref.projectId === onlySongId);
  return !onlyDearPapa || need.refs.some((ref) => ref.projectId === "dear-papa-song-dear-papa");
});
const stats = { projects: projects.length, projectsWritten: 0, shots: videoShots + imageShots + visualizerShots, videoShots, imageShots, visualizerShots, uniqueVideoSources: sourceNeeds.size, selectedProxySources: selectedNeeds.length, transcoded: 0, cacheHits: 0, failed: 0 };

await mapLimit([...sourceNeeds.values()], Math.max(concurrency, 12), async (need) => {
  try {
    const stat = await fs.stat(need.sourcePath);
    need.fingerprint = crypto.createHash("sha256").update(`${need.sourcePath}:${stat.size}:${stat.mtimeMs}:${need.duration.toFixed(3)}:h264-1500k-gop1-loop-verified-v3`).digest("hex");
    need.proxyPath = path.join(proxyRoot, `${need.fingerprint.slice(0, 24)}.mp4`);
    const cached = cache[need.sourcePath];
    if (cached?.fingerprint !== need.fingerprint) return;
    if (cached.proxy?.status !== "ready" || cached.proxy?.codec !== "h264" || cached.proxy?.pixelFormat !== "yuv420p") return;
    if (Number(cached.proxy?.durationSeconds || 0) < need.duration - .08) return;
    await fs.access(need.proxyPath);
    need.proxy = cached.proxy;
  } catch (error) {
    need.preflightError = String(error.message || error);
  }
});

await mapLimit(selectedNeeds, concurrency, async (need) => {
  try {
    if (need.proxy?.status === "ready") { stats.cacheHits += 1; return; }
    if (need.preflightError) throw new Error(need.preflightError);
    const fingerprint = need.fingerprint;
    const proxyPath = need.proxyPath;
    const fps = 30;
    await run("/opt/homebrew/bin/ffmpeg", [
      "-v", "error", "-y", "-stream_loop", "-1", "-ss", "0", "-i", need.sourcePath, "-t", need.duration.toFixed(3),
      "-map", "0:v:0", "-an", "-vf", "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2:out_range=tv,format=yuv420p",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "27", "-maxrate", "1500k", "-bufsize", "3000k",
      "-pix_fmt", "yuv420p", "-r", String(fps), "-g", String(fps), "-keyint_min", String(fps), "-sc_threshold", "0", "-movflags", "+faststart", proxyPath,
    ], { maxBuffer: 2 * 1024 * 1024 });
    const proxyStat = await fs.stat(proxyPath);
    const { stdout: probeText } = await run("/opt/homebrew/bin/ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name,pix_fmt,width,height,avg_frame_rate:format=duration", "-of", "json", proxyPath], { maxBuffer: 1024 * 1024 });
    const probe = JSON.parse(probeText); const stream = probe.streams?.[0]; const actualDurationSeconds = Number(probe.format?.duration || 0);
    if (stream?.codec_name !== "h264" || stream?.pix_fmt !== "yuv420p" || actualDurationSeconds < need.duration - .08) throw new Error(`proxy verification failed codec=${stream?.codec_name} pix_fmt=${stream?.pix_fmt} duration=${actualDurationSeconds}/${need.duration}`);
    need.proxy = {
      status: "ready",
      uri: uriFor(proxyPath),
      mimeType: "video/mp4",
      codec: "h264",
      pixelFormat: "yuv420p",
      fastStart: true,
      maxDimension: 1280,
      maxBitRate: 1500000,
      gopSeconds: 1,
      byteSize: proxyStat.size,
      durationSeconds: actualDurationSeconds,
      requestedDurationSeconds: need.duration,
      width: Number(stream.width || 0),
      height: Number(stream.height || 0),
      frameRate: stream.avg_frame_rate || "30/1",
      sourcePath: need.sourcePath,
      fingerprint,
    };
    cache[need.sourcePath] = { fingerprint, proxy: need.proxy };
    stats.transcoded += 1;
  } catch (error) {
    stats.failed += 1;
    need.proxy = { status: "failed", uri: "", error: String(error.message || error).slice(0, 500) };
  }
});

const needByPath = new Map([...sourceNeeds.values()].map((need) => [need.sourcePath, need]));
let dearPapaRuntimeBytes = 0;
const dearPapaRuntimeUris = new Set();
for (const entry of projects) {
  const project = entry.payload.music_video_project || entry.payload;
  const manifestItems = [];
  project.timeline = (project.timeline || []).map((shot, index) => {
    const originalUri = String(shot.media_uri || "");
    const duration = Math.max(0.1, Number(shot.end_sec || 0) - Number(shot.start_sec || 0));
    const originalType = !originalUri || shot.media_id === "none" ? "generated-visualizer" : imagePattern.test(originalUri) ? "image" : "video";
    const need = originalType === "video" ? needByPath.get(resolveUri(originalUri)) : null;
    const proxy = need?.proxy || null;
    const failedVideo = originalType === "video" && proxy?.status === "failed";
    const type = failedVideo ? "generated-visualizer" : originalType;
    const runtimeUri = originalType === "video" && proxy?.status === "ready" ? proxy.uri : failedVideo ? "" : originalUri;
    const contract = {
      schemaVersion: "hapa.echo.playback-media.v2",
      type,
      originalUri,
      runtimeUri,
      sourceInSeconds: 0,
      sourceOutSeconds: duration,
      actualDurationSeconds: proxy?.durationSeconds ?? null,
      playbackMode: originalType === "video" ? "loop" : "not-applicable",
      mimeType: type === "video" ? "video/mp4" : type === "image" ? `image/${path.extname(originalUri).slice(1).replace("jpg", "jpeg")}` : "application/x-hapa-visualizer",
      dimensions: proxy ? { maxDimension: proxy.maxDimension } : null,
      contentHash: proxy?.fingerprint || null,
      proxy: proxy || { status: originalType === "video" ? "pending" : "not-applicable", uri: runtimeUri },
      fallback: failedVideo ? { status: "active", mode: shot.media_thumbnail ? "poster-then-ivf" : "ivf", reason: proxy?.error || "proxy-build-failed" } : { status: "standby", mode: shot.media_thumbnail ? "poster-then-ivf" : "ivf" },
      posterUri: shot.media_thumbnail || "",
      keyframeIntervalSeconds: proxy?.gopSeconds ?? null,
      byteSize: proxy?.byteSize ?? null,
      preloadPriority: index === 0 ? "current" : index <= 2 ? "lookahead" : "lazy",
      durationCoverage: originalType === "video" ? {
        status: proxy?.status === "ready" && Number(proxy.durationSeconds || 0) >= duration - .08 ? "verified" : proxy?.status === "failed" ? "fallback" : "pending",
        cueSeconds: duration,
        sourceSeconds: proxy?.durationSeconds ?? null,
        toleranceSeconds: .08,
      } : { status: "not-applicable", cueSeconds: duration },
    };
    manifestItems.push({ shotIndex: index, mediaId: shot.media_id, ...contract });
    if (project.song_id === "dear-papa-song-dear-papa" && runtimeUri && !dearPapaRuntimeUris.has(runtimeUri)) {
      dearPapaRuntimeUris.add(runtimeUri);
      dearPapaRuntimeBytes += Number(proxy?.byteSize || 0);
    }
    return { ...shot, runtime_media_uri: runtimeUri, media_contract: contract };
  });
  project.media_manifest = { schemaVersion: "hapa.echo.playback-media-manifest.v2", songId: project.song_id, items: manifestItems };
}

async function commitPlaybackProjection(entry) {
  const filePath = path.join(projectRoot, entry.file);
  const latestText = await fs.readFile(filePath, "utf8");
  const latestPayload = JSON.parse(latestText);
  const latestProject = latestPayload.music_video_project || latestPayload;
  const preparedProject = entry.payload.music_video_project || entry.payload;
  let conflicts = 0;
  const preparedByIdentity = new Map((preparedProject.timeline || []).map((shot, index) => [
    `${shot.shot_index ?? index}:${shot.media_id || ""}:${shot.media_uri || ""}:${Number(shot.start_sec || 0).toFixed(3)}:${Number(shot.end_sec || 0).toFixed(3)}`,
    shot,
  ]));
  latestProject.timeline = (latestProject.timeline || []).map((shot, index) => {
    const identity = `${shot.shot_index ?? index}:${shot.media_id || ""}:${shot.media_uri || ""}:${Number(shot.start_sec || 0).toFixed(3)}:${Number(shot.end_sec || 0).toFixed(3)}`;
    const prepared = preparedByIdentity.get(identity);
    if (!prepared) { conflicts += 1; return shot; }
    return { ...shot, runtime_media_uri: prepared.runtime_media_uri, media_contract: prepared.media_contract };
  });
  latestProject.media_manifest = {
    schemaVersion: "hapa.echo.playback-media-manifest.v2",
    songId: latestProject.song_id,
    items: latestProject.timeline.map((shot, index) => ({ shotIndex: index, mediaId: shot.media_id, ...(shot.media_contract || {}) })),
  };
  const mergedText = `${JSON.stringify(latestPayload, null, 2)}\n`;
  const changed = mergedText !== latestText;
  if (apply && changed) await fs.writeFile(filePath, mergedText);
  return { changed, conflicts };
}

const playbackCommits = [];
await mapLimit(projects, 12, async (entry) => { playbackCommits.push(await commitPlaybackProjection(entry)); });
stats.projectsWritten = playbackCommits.filter((result) => result.changed).length;
stats.projectMergeConflicts = playbackCommits.reduce((sum, result) => sum + result.conflicts, 0);
const failures = selectedNeeds.filter((need) => need.proxy?.status === "failed").map((need) => ({ sourcePath: need.sourcePath, requiredDurationSeconds: need.duration, error: need.proxy.error, refs: need.refs }));
const report = { schemaVersion: "hapa.echo.playback-media-report.v2", ok: stats.failed === 0 && stats.projectMergeConflicts === 0, mode: apply ? "apply" : "dry-run", stats, failures, dearPapa: { runtimeBytes: dearPapaRuntimeBytes, runtimeMiB: Number((dearPapaRuntimeBytes / 1048576).toFixed(3)), uniqueRuntimeUris: dearPapaRuntimeUris.size }, generatedAt: new Date().toISOString() };
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
