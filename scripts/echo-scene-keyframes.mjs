#!/usr/bin/env node
/**
 * Read-only-first Echo Scene Keyframe audit and four-count planner.
 *
 * This deliberately does not call an image or video provider.  It only turns
 * existing source-audio telemetry into a claimable planning surface.  A later
 * queue worker owns prompt/image claims and media-card registration.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { resolveEchoSceneKeyframeGeneratedRoot } from "../server/avatar-runtime-paths.mjs";

export const DEFAULTS = Object.freeze({
  projects: "data/music-video-projects",
  telemetryRoot: path.join(os.homedir(), "Desktop/hapa-song-registry/data/audio_telemetry/latest"),
  runtimeRoot: "data/echo-scene-keyframes",
  pilotRoot: "artifacts/echo-scene-keyframes/pilot",
  generatedRoot: resolveEchoSceneKeyframeGeneratedRoot(),
});

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, places = 3) {
  const parsed = number(value);
  return parsed === null ? null : Number(parsed.toFixed(places));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function stableStringify(value, spaces = 2) {
  const normalize = (input) => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.keys(input).sort().map((key) => [key, normalize(input[key])]));
    }
    return input;
  };
  return JSON.stringify(normalize(value), null, spaces);
}

export function atomicWriteJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomUUID()}.tmp`,
  );
  try {
    fs.writeFileSync(temporary, `${stableStringify(value)}\n`, "utf8");
    fs.renameSync(temporary, filePath);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function readJsonIfPresent(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return null;
  try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return null; }
}

function listJsonFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((file) => file.endsWith(".json"))
    .sort()
    .map((file) => path.join(directory, file));
}

function projectBody(payload) {
  return payload?.music_video_project || payload?.project || payload || {};
}

export function parseArgs(argv) {
  const options = { ...DEFAULTS, apply: false, song: null };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) { positional.push(token); continue; }
    const [rawKey, inline] = token.slice(2).split("=", 2);
    if (rawKey === "apply") { options.apply = true; continue; }
    if (rawKey === "help") { options.help = true; continue; }
    const value = inline ?? argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Missing value for --${rawKey}`);
    const key = rawKey.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!(key in options)) throw new Error(`Unknown option --${rawKey}`);
    options[key] = value;
    if (inline === undefined) index += 1;
  }
  return { command: positional[0] || "audit", options };
}

function humanBytes(bytes) {
  const units = ["B", "KiB", "MiB", "GiB"];
  let value = Math.max(0, Number(bytes || 0));
  let unit = units[0];
  for (let index = 1; index < units.length && value >= 1024; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value.toFixed(unit === "B" ? 0 : 1)} ${unit}`;
}

function countBy(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return Object.fromEntries([...result.entries()].sort(([a], [b]) => String(a).localeCompare(String(b))));
}

function resolvePaths(options) {
  const root = process.cwd();
  const resolve = (value) => path.resolve(root, value);
  return {
    projects: resolve(options.projects),
    telemetryRoot: path.resolve(options.telemetryRoot),
    runtimeRoot: resolve(options.runtimeRoot),
    pilotRoot: resolve(options.pilotRoot),
    generatedRoot: resolve(options.generatedRoot),
  };
}

export function loadProjects(projectsDir, songFilter = null) {
  const seen = new Map();
  const duplicateFiles = [];
  for (const filePath of listJsonFiles(projectsDir)) {
    const project = projectBody(readJsonIfPresent(filePath));
    const songId = String(project.song_id || "").trim();
    if (!songId || (songFilter && songId !== songFilter)) continue;
    if (seen.has(songId)) {
      duplicateFiles.push({ songId, kept: path.basename(seen.get(songId).filePath), ignored: path.basename(filePath) });
      continue;
    }
    seen.set(songId, { filePath, project });
  }
  return { projects: [...seen.values()].sort((a, b) => a.project.song_id.localeCompare(b.project.song_id)), duplicateFiles };
}

function usableBeatEvents(telemetry) {
  const candidates = (telemetry?.timeline?.events || [])
    .filter((event) => event?.type === "beat" && number(event.start) !== null)
    .map((event) => ({ ...event, start: number(event.start) }))
    .sort((a, b) => a.start - b.start);
  const beats = [];
  for (const event of candidates) {
    if (beats.length && event.start <= beats.at(-1).start) continue;
    beats.push(event);
  }
  return beats;
}

export function assessTelemetry(telemetry) {
  if (!telemetry) return { ready: false, state: "needs_timing_truth", reason: "telemetry_missing", beats: [] };
  if (telemetry.status !== "complete") return { ready: false, state: "needs_timing_truth", reason: `telemetry_status_${telemetry.status || "missing"}`, beats: [] };
  const duration = number(telemetry.duration);
  if (duration === null || duration <= 0) return { ready: false, state: "needs_timing_truth", reason: "telemetry_duration_missing", beats: [] };
  const beats = usableBeatEvents(telemetry);
  if (beats.length < 4) return { ready: false, state: "needs_timing_truth", reason: "usable_beat_events_missing", beats: [] };
  const sources = [...new Set(beats.map((beat) => String(beat.source || "unknown")))].sort();
  const confidence = beats.map((beat) => number(beat.confidence)).filter((value) => value !== null);
  return {
    ready: true,
    state: "timing_ready",
    beats,
    duration,
    sources,
    confidence: {
      telemetry: number(telemetry.confidence),
      tempo: number(telemetry?.summary?.tempoConfidence ?? telemetry?.rhythm?.tempoConfidence),
      beatMean: confidence.length ? round(confidence.reduce((total, value) => total + value, 0) / confidence.length) : null,
    },
  };
}

function lyricLines(project) {
  return (Array.isArray(project.timed_lyrics) ? project.timed_lyrics : [])
    .map((line, index) => ({
      lineId: line.id || line.line_id || `${line.section_id || "lyric"}-${index + 1}`,
      text: String(line.text || line.lyric || "").trim(),
      startSeconds: number(line.start ?? line.start_sec),
      endSeconds: number(line.end ?? line.end_sec),
      sectionId: line.section_id || null,
    }))
    .filter((line) => line.text && line.startSeconds !== null && line.endSeconds !== null && line.endSeconds >= line.startSeconds);
}

function lyricOverlap(lines, startSeconds, endSeconds) {
  return lines.filter((line) => line.startSeconds < endSeconds && line.endSeconds > startSeconds)
    .map((line) => ({ ...line, excerpt: line.text.slice(0, 240) }));
}

export function buildFourCountWindows({ songId, telemetry, project }) {
  const assessment = assessTelemetry(telemetry);
  if (!assessment.ready) return { assessment, windows: [] };
  const lines = lyricLines(project);
  const windows = [];
  for (let beatStart = 0, ordinal = 1; beatStart < assessment.beats.length; beatStart += 4, ordinal += 1) {
    const beatEndExclusive = Math.min(beatStart + 4, assessment.beats.length);
    const partialFinalCount = beatEndExclusive - beatStart < 4;
    const startSeconds = assessment.beats[beatStart].start;
    const endSeconds = beatEndExclusive < assessment.beats.length
      ? assessment.beats[beatEndExclusive].start
      : assessment.duration;
    if (endSeconds <= startSeconds) continue;
    const windowBeats = assessment.beats.slice(beatStart, beatEndExclusive);
    windows.push({
      id: `${songId}-count-${String(ordinal).padStart(4, "0")}`,
      songId,
      ordinal,
      kind: partialFinalCount ? "partial-final-count" : "four-count",
      beatStart,
      beatEndExclusive,
      startSeconds: round(startSeconds),
      endSeconds: round(endSeconds),
      timing: {
        truthStatus: "measured-source-audio",
        telemetryStatus: telemetry.status,
        telemetryRunId: telemetry.runId || null,
        eventSources: [...new Set(windowBeats.map((beat) => String(beat.source || "unknown")))].sort(),
        confidence: {
          telemetry: assessment.confidence.telemetry,
          tempo: assessment.confidence.tempo,
          beatMean: round(windowBeats.map((beat) => number(beat.confidence)).filter((value) => value !== null).reduce((total, value, _, items) => total + value / items.length, 0)),
        },
      },
      lyricOverlap: lyricOverlap(lines, startSeconds, endSeconds),
    });
  }
  return { assessment, windows };
}

function readPilotCounts(pilotRoot) {
  const pilots = [];
  if (!fs.existsSync(pilotRoot)) return pilots;
  for (const child of fs.readdirSync(pilotRoot).sort()) {
    const plan = readJsonIfPresent(path.join(pilotRoot, child, "plan.json"));
    if (!plan) continue;
    for (const count of Array.isArray(plan.counts) ? plan.counts : []) {
      pilots.push({
        id: count.id,
        songId: count.songId || plan.songId || null,
        ordinal: number(count.ordinal),
        promptStatus: count.prompt?.status || "missing",
        imageStatus: count.image?.status || "missing",
        videoStatus: count.video?.status || "missing",
        keyframePath: count.image?.retrievalHandle || null,
        keyframeExists: count.image?.status === "keyframe_exists" && Boolean(count.image?.retrievalHandle && fs.existsSync(count.image.retrievalHandle)),
        videoHeld: count.video?.quest?.status === "held",
      });
    }
  }
  return pilots;
}

function generatedStorage(generatedRoot) {
  if (!fs.existsSync(generatedRoot)) return { pairs: 0, bytes: 0, averagePairBytes: 0, files: [] };
  const entries = fs.readdirSync(generatedRoot).filter((file) => /\.png$/iu.test(file));
  const pairs = [];
  for (const file of entries.filter((entry) => !entry.includes(".director-1920x1080"))) {
    const director = file.replace(/\.png$/iu, ".director-1920x1080.png");
    if (!entries.includes(director)) continue;
    const nativePath = path.join(generatedRoot, file);
    const directorPath = path.join(generatedRoot, director);
    pairs.push({ nativePath, directorPath, bytes: fs.statSync(nativePath).size + fs.statSync(directorPath).size });
  }
  const bytes = pairs.reduce((total, pair) => total + pair.bytes, 0);
  return { pairs: pairs.length, bytes, averagePairBytes: pairs.length ? Math.round(bytes / pairs.length) : 0, files: pairs };
}

function auditProject(entry, paths, pilotByCount) {
  const project = entry.project;
  const songId = String(project.song_id || "");
  const registryTrackId = String(project.registry_track_id || "").trim();
  const telemetryPath = registryTrackId ? path.join(paths.telemetryRoot, `${registryTrackId}.json`) : null;
  const telemetry = readJsonIfPresent(telemetryPath);
  const { assessment, windows } = buildFourCountWindows({ songId, telemetry, project });
  const pilotCounts = windows
    .map((window) => pilotByCount.get(`${songId}:${window.ordinal}`))
    .filter(Boolean);
  const timingReason = assessment.ready ? null : assessment.reason;
  return {
    songId,
    songTitle: String(project.song_title || songId),
    projectFile: path.basename(entry.filePath),
    registryTrackId: registryTrackId || null,
    durationSeconds: number(project.duration) ?? number(telemetry?.duration),
    directorContext: {
      avatarName: project.avatar_name || null,
      perspective: project.perspective || null,
      localSpine: project.local_spine || null,
      outputProfile: project.output_profile || null,
      canonAffordanceGraph: project.canon_affordance_graph || null,
      songEditMap: project.song_edit_map || null,
      lyricStyle: project.lyric_style || null,
    },
    timing: assessment.ready ? {
      state: "timing_ready",
      telemetryPath,
      telemetryRunId: telemetry.runId || null,
      durationSeconds: assessment.duration,
      beatCount: assessment.beats.length,
      timingSources: assessment.sources,
      confidence: assessment.confidence,
    } : {
      state: "needs_timing_truth",
      reason: timingReason,
      telemetryPath,
      registryTrackId: registryTrackId || null,
    },
    lyricTiming: {
      lines: lyricLines(project).length,
      provenance: project.lyric_timing_heal?.timingSource || "project-timed-lyrics-unlabeled",
    },
    readiness: assessment.ready ? "ready_for_prompt_planning" : "blocked_by_timing",
    windows,
    existingPilotCounts: pilotCounts,
  };
}

export function buildAudit(options) {
  const paths = resolvePaths(options);
  const { projects, duplicateFiles } = loadProjects(paths.projects, options.song);
  const pilotCounts = readPilotCounts(paths.pilotRoot);
  const pilotByCount = new Map(pilotCounts.map((count) => [`${count.songId}:${count.ordinal}`, count]));
  const songs = projects.map((entry) => auditProject(entry, paths, pilotByCount));
  const allWindows = songs.flatMap((song) => song.windows);
  const storage = generatedStorage(paths.generatedRoot);
  const pilotKeyframes = pilotCounts.filter((count) => count.keyframeExists).length;
  const existingKeyframes = Math.max(pilotKeyframes, storage.pairs);
  const heldVideoQuests = Math.max(
    pilotCounts.filter((count) => count.videoHeld).length,
    existingKeyframes,
  );
  const storageEstimateBytes = Math.max(0, allWindows.length - existingKeyframes) * storage.averagePairBytes;
  const blockedSongs = songs.filter((song) => song.readiness !== "ready_for_prompt_planning");
  return {
    schemaVersion: "hapa.echo.scene-keyframe-audit.v1",
    generatedAt: new Date().toISOString(),
    mutationMode: "read-only-unless-apply",
    noVideoGeneration: true,
    paths,
    summary: {
      uniqueSongs: songs.length,
      duplicateProjectFilesIgnored: duplicateFiles.length,
      readySongs: songs.length - blockedSongs.length,
      blockedSongs: blockedSongs.length,
      exactSourceBackedFourCounts: allWindows.length,
      partialFinalCounts: allWindows.filter((window) => window.kind === "partial-final-count").length,
      promptPlanningEligibleCounts: allWindows.length,
      timingTruthQuestCount: blockedSongs.length,
      pilotPromptReadyCounts: pilotCounts.filter((count) => count.promptStatus === "ready").length,
      existingKeyframes,
      heldVideoQuests,
      imageGenerationRemaining: Math.max(0, allWindows.length - existingKeyframes),
      storage: {
        observedPairs: storage.pairs,
        observedPairBytes: storage.bytes,
        observedPairBytesHuman: humanBytes(storage.bytes),
        averagePairBytes: storage.averagePairBytes,
        averagePairBytesHuman: humanBytes(storage.averagePairBytes),
        remainingEstimateBytes: storageEstimateBytes,
        remainingEstimateHuman: humanBytes(storageEstimateBytes),
        fullAlbumEstimateBytes: allWindows.length * storage.averagePairBytes,
        fullAlbumEstimateHuman: humanBytes(allWindows.length * storage.averagePairBytes),
      },
    },
    duplicateFiles,
    blockedSongs: blockedSongs.map((song) => ({ songId: song.songId, songTitle: song.songTitle, ...song.timing })),
    songs,
  };
}

export function buildPlan(audit) {
  return {
    schemaVersion: "hapa.echo.scene-keyframe-plan.v1",
    generatedAt: audit.generatedAt,
    sourceAuditHash: `sha256:${sha256(stableStringify({ summary: audit.summary, songs: audit.songs.map((song) => ({ songId: song.songId, timing: song.timing, windows: song.windows })) }))}`,
    executionPolicy: {
      prompt: "codex-lyric-grounded-prompt-v1",
      image: "built-in-gpt-image-claimed-v1",
      video: "hold-video-generation-v1",
      providerCallsAllowed: false,
    },
    noVideoGeneration: true,
    songs: audit.songs.map((song) => ({
      songId: song.songId,
      songTitle: song.songTitle,
      readiness: song.readiness,
      timing: song.timing,
      counts: song.windows.map((window) => ({
        ...window,
        state: {
          aggregate: "missing_prompt",
          prompt: { artifact: "missing", quest: "open" },
          image: { artifact: "missing", quest: "blocked_by_prompt" },
          video: { artifact: "missing", quest: "blocked_by_keyframe", executionPolicy: "hold-video-generation-v1" },
        },
      })),
    })),
  };
}

function compact(report) {
  return {
    ok: true,
    command: report.command,
    dryRun: report.dryRun,
    applied: report.applied,
    runtimeFile: report.runtimeFile || null,
    noVideoGeneration: true,
    summary: report.audit.summary,
  };
}

export function run(argv = process.argv.slice(2), cwd = process.cwd()) {
  const { command, options } = parseArgs(argv);
  if (options.help) return { help: true };
  if (!["audit", "status", "plan"].includes(command)) throw new Error(`Unknown command: ${command}. Use audit, status, or plan.`);
  const previousCwd = process.cwd();
  process.chdir(cwd);
  try {
    const paths = resolvePaths(options);
    if (command === "status") {
      const persisted = readJsonIfPresent(path.join(paths.runtimeRoot, "audit.json"));
      if (persisted) return { command, dryRun: true, applied: false, runtimeFile: path.join(paths.runtimeRoot, "audit.json"), audit: persisted, persisted: true };
    }
    const audit = buildAudit(options);
    const report = { command, dryRun: !options.apply, applied: false, audit, persisted: false };
    if (options.apply) {
      const fileName = command === "plan" ? "plan.json" : "audit.json";
      const payload = command === "plan" ? buildPlan(audit) : audit;
      const runtimeFile = path.join(paths.runtimeRoot, fileName);
      atomicWriteJson(runtimeFile, payload);
      report.applied = true;
      report.dryRun = false;
      report.runtimeFile = runtimeFile;
    }
    return report;
  } finally {
    process.chdir(previousCwd);
  }
}

function usage() {
  return `Usage: node scripts/echo-scene-keyframes.mjs <audit|status|plan> [--apply] [--song <song-id>]\n\nDefault is dry-run. --apply writes only data/echo-scene-keyframes/{audit,plan}.json. This command never generates images or video.\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = run();
    if (report.help) process.stdout.write(usage());
    else process.stdout.write(`${stableStringify(compact(report))}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}${os.EOL}`);
    process.exitCode = 1;
  }
}
