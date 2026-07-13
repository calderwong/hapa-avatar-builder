#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(import.meta.dirname, "..");
const projectsDir = path.join(root, "data", "music-video-projects");
const outputDir = process.env.HAPA_PLAYBACK_HARDENING_OUTPUT
  || "/Users/calderwong/Documents/Codex/2026-07-10/re/outputs/dear-papa-director-v2-demo/playback-hardening";
const uiAcceptancePath = path.join(root, "artifacts", "smoke", "echos-album-playback-acceptance.json");
const proxyReportPath = path.join(root, "artifacts", "echo-playback-media-v2", "report.json");

function hash(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function increment(record, key) {
  record[key] = (record[key] || 0) + 1;
}

async function readOptionalJson(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); } catch { return null; }
}

const files = (await fs.readdir(projectsDir)).filter((file) => file.endsWith("-video-project.json")).sort();
const projects = [];
const timingStatuses = {};
const proxyStatuses = {};
const transitions = {};
const fallbackModes = {};
const durationCoverageStatuses = {};
const timingExceptions = [];
const timingReviewQueue = [];
const timelineExceptions = [];
const mediaExceptions = [];
let shots = 0;
let videoShots = 0;
let imageShots = 0;
let visualizerShots = 0;
let sourceTimingProjects = 0;
let sourceHashMatches = 0;

for (const file of files) {
  const payload = JSON.parse(await fs.readFile(path.join(projectsDir, file), "utf8"));
  const project = payload.music_video_project || payload;
  const timeline = Array.isArray(project.timeline) ? project.timeline : [];
  const manifest = Array.isArray(project.media_manifest?.items) ? project.media_manifest.items : [];
  const truth = project.lyric_timing_truth || {};
  const activeHash = hash(project.timed_lyrics || []);
  const citedHash = truth.timingSourceSha256 || project.lyric_timing_heal?.timingSourceSha256 || "";
  const sourcePath = truth.sourcePath || project.lyric_timing_heal?.timingPath || "";
  const timingStatus = truth.qualityStatus || truth.status || (sourcePath ? "source-unclassified" : "inferred-missing-source");
  const timingConfidence = Number(truth.confidence ?? project.lyric_timing_heal?.timingConfidence ?? 0);
  increment(timingStatuses, timingStatus);
  if (/needs-review/.test(timingStatus) || (sourcePath && timingConfidence < .6)) timingReviewQueue.push({ songId: project.song_id, title: project.song_title, confidence: timingConfidence, status: timingStatus, sourcePath });
  if (sourcePath) {
    sourceTimingProjects += 1;
    if (citedHash && activeHash === citedHash) sourceHashMatches += 1;
    else timingExceptions.push({ songId: project.song_id, file, reason: "active-timing-does-not-match-cited-source", citedHash, activeHash, sourcePath });
  }

  let cursor = 0;
  let ready = 0;
  let pending = 0;
  let failed = 0;
  for (let index = 0; index < timeline.length; index += 1) {
    const shot = timeline[index];
    const start = Number(shot.start_sec || 0);
    const end = Number(shot.end_sec || start);
    shots += 1;
    if (Math.abs(start - cursor) > .051 || end <= start) timelineExceptions.push({ songId: project.song_id, shotIndex: index, expectedStart: cursor, start, end });
    cursor = end;
    increment(transitions, shot.transition || "none");
    const contract = shot.media_contract || manifest[index] || {};
    const type = contract.type || (!shot.media_uri || shot.media_id === "none" ? "generated-visualizer" : "video");
    if (type === "generated-visualizer") visualizerShots += 1;
    else if (type === "image") imageShots += 1;
    else {
      videoShots += 1;
      const proxyStatus = contract.proxy?.status || "pending";
      increment(proxyStatuses, proxyStatus);
      increment(durationCoverageStatuses, contract.durationCoverage?.status || "unmeasured");
      if (proxyStatus === "ready") ready += 1;
      else if (proxyStatus === "failed") failed += 1;
      else pending += 1;
      const fallbackMode = contract.fallback?.mode || (contract.posterUri || shot.media_thumbnail ? "poster-then-ivf" : "ivf");
      increment(fallbackModes, fallbackMode);
      if (!contract.runtimeUri && proxyStatus !== "failed") mediaExceptions.push({ songId: project.song_id, shotIndex: index, reason: "video-without-runtime-uri", mediaId: shot.media_id });
      if (proxyStatus === "failed" && contract.fallback?.status !== "active") mediaExceptions.push({ songId: project.song_id, shotIndex: index, reason: "failed-proxy-without-active-fallback", mediaId: shot.media_id });
    }
  }
  if (Math.abs(cursor - Number(project.duration || 0)) > .11) timelineExceptions.push({ songId: project.song_id, reason: "timeline-does-not-cover-song", timelineEnd: cursor, duration: Number(project.duration || 0) });
  projects.push({
    songId: project.song_id,
    title: project.song_title,
    durationSeconds: Number(project.duration || 0),
    shots: timeline.length,
    timingStatus,
    timingConfidence,
    sourceTimingHashMatched: Boolean(sourcePath && citedHash && activeHash === citedHash),
    videoReadiness: { ready, pending, failed, fullyCompiled: ready > 0 && pending === 0 && failed === 0 }
  });
}

const uiAcceptance = await readOptionalJson(uiAcceptancePath);
const proxyReport = await readOptionalJson(proxyReportPath);
const assertionValues = Object.values(uiAcceptance?.assertions || {});
const report = {
  schemaVersion: "hapa.echo.playback-hardening-proof.v1",
  generatedAt: new Date().toISOString(),
  ok: timelineExceptions.length === 0 && mediaExceptions.length === 0 && timingExceptions.length === 0,
  album: {
    projects: projects.length,
    shots,
    videoShots,
    imageShots,
    visualizerShots,
    timelineExceptions: timelineExceptions.length,
    mediaExceptions: mediaExceptions.length,
    sourceTimingProjects,
    sourceHashMatches,
    timingExceptions: timingExceptions.length,
    timingReviewProjects: timingReviewQueue.length,
    fullyProxyCompiledSongs: projects.filter((project) => project.videoReadiness.fullyCompiled).length
  },
  timingStatuses,
  proxyStatuses,
  durationCoverageStatuses,
  fallbackModes,
  transitions,
  playerContract: {
    persistentDecoderSlots: 3,
    lookaheadVideoShots: 2,
    firstFrameGatedHandoff: true,
    staleCompletionGuarded: true,
    sourceEndGuarded: true,
    shortSourcesLoop: true,
    opaquePosterThenIvfFallback: true,
    cameraUpdateHz: 30,
    selectedSongCompileOnDemand: true
  },
  validation: {
    productionUi: uiAcceptance ? {
      path: uiAcceptancePath,
      generatedAt: uiAcceptance.generatedAt,
      ok: uiAcceptance.ok === true,
      assertionsPassed: assertionValues.filter(Boolean).length,
      assertionsTotal: assertionValues.length,
      initialPlaybackAdvanceSeconds: uiAcceptance.playback?.playbackAdvanceSeconds ?? null,
      pauseAudioDeltaSeconds: uiAcceptance.transportAndSongChange?.pause?.audioDeltaSeconds ?? null,
      pauseClockDeltaSeconds: uiAcceptance.transportAndSongChange?.pause?.clockDeltaSeconds ?? null,
      seekTargetSeconds: uiAcceptance.transportAndSongChange?.seek?.targetSeconds ?? null,
      resumeAdvanceSeconds: uiAcceptance.transportAndSongChange?.resume?.advanceSeconds ?? null,
      songChangeId: uiAcceptance.transportAndSongChange?.songChange?.songId ?? null,
      diagnostics: Object.fromEntries(Object.entries(uiAcceptance.diagnostics || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : value]))
    } : { path: uiAcceptancePath, ok: false, missing: true },
    albumProxyWarmRun: proxyReport ? { path: proxyReportPath, ok: proxyReport.ok === true, stats: proxyReport.stats, failures: proxyReport.failures || [] } : { path: proxyReportPath, ok: false, missing: true }
  },
  exceptions: { timing: timingExceptions, timeline: timelineExceptions, media: mediaExceptions },
  timingReviewQueue: timingReviewQueue.sort((a, b) => a.confidence - b.confidence || a.title.localeCompare(b.title)),
  projects
};

await fs.mkdir(outputDir, { recursive: true });
await fs.writeFile(path.join(outputDir, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ output: path.join(outputDir, "proof.json"), ok: report.ok, album: report.album, timingStatuses, proxyStatuses }, null, 2)}\n`);
