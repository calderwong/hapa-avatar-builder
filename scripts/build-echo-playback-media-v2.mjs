#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { prepareEchoPlaybackProxy } from "../server/echo-playback-proxy.mjs";
const root = path.resolve(import.meta.dirname, "..");
const argument = (name, fallback) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3) || fallback;
const mediaRoot = path.resolve(argument('media-root', path.join(root, "data", "media")));
const projectRoot = path.resolve(argument('project-root', path.join(root, "data", "music-video-projects")));
const proxyRoot = path.join(mediaRoot, "echo-proxies-v2");
const reportRoot = path.resolve(argument('report-root', path.join(root, 'artifacts/echo-playback-media-v2')));
const reportPath = path.join(reportRoot, 'report.json');
const cachePath = path.join(reportRoot, 'cache.json');
const backupRoot = path.resolve(argument('backup-root', path.join(root, 'data/backups')), `echo-playback-${crypto.randomUUID()}`);
const apply = process.argv.includes("--apply");
const concurrency = Math.max(1, Math.min(4, Math.trunc(Number(process.env.HAPA_PROXY_CONCURRENCY) || 4)));
const onlyDearPapa = process.argv.includes("--dear-papa-only");
const onlySongId = process.argv.find((value) => value.startsWith("--song="))?.slice("--song=".length) || "";
if (onlySongId && (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(onlySongId) || path.basename(onlySongId) !== onlySongId)) throw new Error('Unsafe song ID');
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

const requestedSong = onlySongId || (onlyDearPapa ? 'dear-papa-song-dear-papa' : '');
const files = (await fs.readdir(projectRoot)).filter(file => file.endsWith('-video-project.json') && (!requestedSong || file === `${requestedSong}-video-project.json`)).sort();
if (requestedSong && files.length !== 1) throw new Error(`Requested project is unavailable: ${requestedSong}`);
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

await mapLimit(selectedNeeds, concurrency, async (need) => {
  try {
    const prepared = await prepareEchoPlaybackProxy({ sourcePath: need.sourcePath, proxyRoot, maximumDurationSeconds: need.duration });
    need.sourceDurationSeconds = prepared.sourceDurationSeconds;
    need.outputDurationSeconds = prepared.durationSeconds;
    need.fingerprint = prepared.key;
    need.proxyPath = prepared.path;
    const { cached, path: preparedPath, ...proxy } = prepared;
    need.proxy = proxy;
    cache[need.sourcePath] = { fingerprint: prepared.key, proxy };
    if (cached) stats.cacheHits += 1; else stats.transcoded += 1;
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
      sourceOutSeconds: originalType === "video" ? Math.min(duration, Number(proxy?.durationSeconds || duration)) : duration,
      actualDurationSeconds: proxy?.durationSeconds ?? null,
      playbackMode: originalType === "video" ? "once" : "not-applicable",
      mimeType: type === "video" ? "video/mp4" : type === "image" ? `image/${path.extname(originalUri).slice(1).replace("jpg", "jpeg")}` : "application/x-hapa-visualizer",
      dimensions: proxy ? { maxDimension: proxy.maxDimension } : null,
      contentHash: proxy?.sha256 || null,
      proxy: proxy || { status: originalType === "video" ? "pending" : "not-applicable", uri: runtimeUri },
      fallback: failedVideo ? { status: "active", mode: shot.media_thumbnail ? "poster-then-ivf" : "ivf", reason: proxy?.error || "proxy-build-failed" } : { status: "standby", mode: shot.media_thumbnail ? "poster-then-ivf" : "ivf" },
      posterUri: shot.media_thumbnail || "",
      keyframeIntervalSeconds: proxy?.gopSeconds ?? null,
      byteSize: proxy?.byteSize ?? null,
      preloadPriority: index === 0 ? "current" : index <= 8 ? "lookahead" : "lazy",
      durationCoverage: originalType === "video" ? {
        status: proxy?.status === "ready" && Number(proxy.durationSeconds || 0) >= duration - .08
          ? "verified"
          : proxy?.status === "ready" ? "short-source-held-no-repeat" : proxy?.status === "failed" ? "fallback" : "pending",
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
  if (apply && changed && conflicts === 0) {
    await fs.mkdir(backupRoot, { recursive: true });
    await fs.writeFile(path.join(backupRoot, entry.file), latestText, { flag: 'wx' });
    const temporary = `${filePath}.${crypto.randomUUID()}.tmp`;
    try {
      await fs.writeFile(temporary, mergedText, { flag: 'wx' });
      if (await fs.readFile(filePath, 'utf8') !== latestText) return { changed: false, conflicts: 1 };
      await fs.rename(temporary, filePath);
    } finally { await fs.rm(temporary, { force: true }); }
  }
  return { changed, conflicts, written: apply && changed && conflicts === 0 };
}

const playbackCommits = [];
await mapLimit(projects, 12, async (entry) => { playbackCommits.push(await commitPlaybackProjection(entry)); });
stats.projectsWritten = playbackCommits.filter((result) => result.written).length;
stats.projectsWouldChange = playbackCommits.filter((result) => result.changed).length;
stats.projectMergeConflicts = playbackCommits.reduce((sum, result) => sum + result.conflicts, 0);
const failures = selectedNeeds.filter((need) => need.proxy?.status === "failed").map((need) => ({ sourcePath: need.sourcePath, requiredDurationSeconds: need.duration, error: need.proxy.error, refs: need.refs }));
const report = { schemaVersion: "hapa.echo.playback-media-report.v2", ok: stats.failed === 0 && stats.projectMergeConflicts === 0, mode: apply ? "apply" : "dry-run", requestedSong: requestedSong || null, backupRoot: stats.projectsWritten ? backupRoot : null, stats, failures, dearPapa: { runtimeBytes: dearPapaRuntimeBytes, runtimeMiB: Number((dearPapaRuntimeBytes / 1048576).toFixed(3)), uniqueRuntimeUris: dearPapaRuntimeUris.size }, generatedAt: new Date().toISOString() };
await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`);
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
