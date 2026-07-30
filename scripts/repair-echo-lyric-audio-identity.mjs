#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";
import { evaluateEchoLyricTimingPromotion } from "../src/domain/echo-lyric-promotion.js";

const ROOT = path.resolve(".");
const PROJECTS_DIR = path.join(ROOT, "data/music-video-projects");
const LIBRARY_ROOT = process.env.HAPA_SUNO_LIBRARY_ROOT || "/Users/calderwong/Desktop/suno-library";
const APPLY = process.argv.includes("--apply");
const REPORT_PATH = path.join(ROOT, "artifacts/echo-lyric-quality-v4/audio-identity-repair.json");
const at = new Date().toISOString();

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const writeJson = (filePath, value) => fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
const sha256 = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const lineWordCount = (line) => Array.isArray(line.words) && line.words.length
  ? line.words.length
  : String(line.text || "").split(/\s+/u).filter(Boolean).length;

function timingSidecar(registryTrackId) {
  const playlistsRoot = path.join(LIBRARY_ROOT, "playlists");
  if (!fs.existsSync(playlistsRoot)) return "";
  for (const playlist of fs.readdirSync(playlistsRoot).sort()) {
    const candidate = path.join(playlistsRoot, playlist, "lyric_timings", `${registryTrackId}.json`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return "";
}

function normalizeLines(lines = []) {
  return lines.map((line, index) => ({
    id: line.id || `timed-line-${index + 1}`,
    start: Number(Number(line.start || 0).toFixed(3)),
    end: Number(Number(line.end || 0).toFixed(3)),
    text: String(line.text || ""),
    section: String(line.section || line.section_label || ""),
    section_id: String(line.section_id || ""),
    section_label: String(line.section_label || line.section || ""),
    confidence: Number(line.confidence || 0),
    words: (line.words || []).map((word, wordIndex) => ({
      word: String(word.word || word.text || ""),
      start: Number(Number(word.start || 0).toFixed(3)),
      end: Number(Number(word.end || 0).toFixed(3)),
      matched: word.matched ?? undefined,
      index: Number(word.index ?? wordIndex),
    })),
  }));
}

function timedSections(lines = [], duration = 0) {
  const groups = [];
  for (const line of lines) {
    const label = line.section_label || line.section || "Measured Vocal";
    const current = groups.at(-1);
    if (!current || current.label !== label || line.start - current.lines.at(-1).end > 10) groups.push({ label, lines: [line] });
    else current.lines.push(line);
  }
  const sections = [];
  if (lines[0]?.start > .25) sections.push({ id: "intro_1", type: "intro", label: "Intro / Pre-vocal", start: 0, end: lines[0].start, lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: .2, visualStrategy: "measured pre-vocal window" });
  groups.forEach((group, index) => {
    const start = group.lines[0].start;
    const end = group.lines.at(-1).end;
    const wordCount = group.lines.reduce((sum, line) => sum + lineWordCount(line), 0);
    sections.push({
      id: `measured_${index + 1}`,
      type: /chorus|hook|refrain/iu.test(group.label) ? "chorus" : /bridge/iu.test(group.label) ? "bridge" : "verse",
      label: group.label,
      start,
      end,
      lyricLineCount: group.lines.length,
      wordCount,
      vocalDensity: group.lines.length / Math.max(1, end - start) > .5 ? "high" : "medium",
      energy: .58,
      visualStrategy: "audio-identity-bound measured vocal section",
    });
  });
  if (duration - (lines.at(-1)?.end || 0) > .25) sections.push({ id: "outro_1", type: "outro", label: "Outro / Ringout", start: lines.at(-1).end, end: duration, lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: .18, visualStrategy: "measured post-vocal ringout" });
  return sections;
}

const repairs = [];
for (const file of fs.readdirSync(PROJECTS_DIR).filter((name) => name.endsWith(".json")).sort()) {
  const filePath = path.join(PROJECTS_DIR, file);
  const payload = readJson(filePath);
  const project = payload.music_video_project || payload;
  const registryTrackId = String(project.registry_track_id || project.audio_id || "");
  const timingRegistryTrackId = String(project.lyric_timing_truth?.registryTrackId || project.lyric_timing_heal?.registryTrackId || project.song_edit_map?.provenance?.lyricTimingRegistryTrackId || "");
  if (!registryTrackId || !timingRegistryTrackId || registryTrackId === timingRegistryTrackId) continue;
  const timingPath = timingSidecar(registryTrackId);
  if (!timingPath) {
    repairs.push({ file, songId: project.song_id, registryTrackId, previousTimingRegistryTrackId: timingRegistryTrackId, status: "blocked", reason: "matching-timing-sidecar-missing" });
    continue;
  }
  const timing = readJson(timingPath);
  const lines = normalizeLines(timing.lines || []);
  const sttPath = timingPath.replace(/\.json$/u, ".stt.json");
  const promotion = evaluateEchoLyricTimingPromotion(timing, {
    sourcePathExists: true,
    sttPathExists: fs.existsSync(sttPath),
  });
  if (!promotion.accepted || !lines.length) {
    repairs.push({ file, songId: project.song_id, registryTrackId, previousTimingRegistryTrackId: timingRegistryTrackId, status: "blocked", reason: promotion.reasons?.join(",") || "timing-lines-missing" });
    continue;
  }
  const timingHash = sha256(lines);
  const confidence = Number(timing.confidence || 0);
  const duration = Number(project.duration || timing.duration || 0);
  project.timed_lyrics = lines;
  project.lyrics = {
    ...(project.lyrics || {}),
    enabled: true,
    timingSource: "dear-papa-playlist-lyric-timing",
    timingSourcePath: timingPath,
    timingHash,
    confidence,
  };
  project.lyric_timing_truth = {
    schemaVersion: "hapa.echo.lyric-timing-truth.v2",
    source: "dear-papa-playlist-lyric-timing",
    sourcePath: timingPath,
    registryTrackId,
    timingSourceSha256: timingHash,
    activeTimingSha256: timingHash,
    sourceMatchesActive: true,
    status: confidence >= .6 ? "verified_source_content" : "source_aligned_needs_review",
    qualityStatus: confidence >= .6 ? "source-aligned" : "source-aligned-needs-review",
    confidence,
    overlaps: 0,
    duplicateStarts: 0,
    wordBounds: 0,
    humanReviewed: false,
  };
  project.lyric_timing_heal = {
    ...(project.lyric_timing_heal || {}),
    source: "scripts/repair-echo-lyric-audio-identity.mjs",
    strategy: "registry-audio-identity-sidecar",
    timingSource: "dear-papa-playlist-lyric-timing",
    timingPath,
    registryTrackId,
    timingSourceSha256: timingHash,
    activeTimingSha256: timingHash,
    timingConfidence: confidence,
    generatedAt: at,
    lineCount: lines.length,
    lastLyricEnd: lines.at(-1).end,
  };
  if (project.song_edit_map) {
    const wordCount = lines.reduce((sum, line) => sum + lineWordCount(line), 0);
    const sections = timedSections(lines, duration);
    project.song_edit_map.timedLyrics = lines;
    project.song_edit_map.editPulses = lines.map((line, index) => ({ t: line.start, kind: index % 4 === 0 ? "lyric-downbeat-candidate" : "lyric-edit-pulse", strength: Number(Math.min(.92, .52 + lineWordCount(line) * .018).toFixed(2)), source: "lyric-line-start" }));
    project.song_edit_map.sections = sections;
    project.song_edit_map.vocalDensity = sections.map((section) => ({ start_sec: section.start, end_sec: section.end, vocal_density: section.vocalDensity, source: "dear-papa-playlist-lyric-timing" }));
    project.song_edit_map.energyCurves = { source: "dear-papa-playlist-lyric-timing", points: sections.map((section) => ({ t: section.start, section_id: section.id, energy: section.energy })) };
    project.song_edit_map.audioTelemetry = { ...(project.song_edit_map.audioTelemetry || {}), lyricLineCount: lines.length, lyricBlockCount: sections.filter((section) => section.lyricLineCount > 0).length, wordCount, wordsPerMinute: Number((wordCount / Math.max(1, duration / 60)).toFixed(1)), lyricTimingSource: "dear-papa-playlist-lyric-timing", lyricTimingPath: timingPath, lyricTimingConfidence: confidence };
    project.song_edit_map.provenance = { ...(project.song_edit_map.provenance || {}), lyricSource: "dear-papa-playlist-lyric-timing", lyricTimingSource: "dear-papa-playlist-lyric-timing", lyricTimingStrategy: "registry-audio-identity-sidecar", lyricTimingPath: timingPath, lyricTimingRegistryTrackId: registryTrackId, timingSourceSha256: timingHash, activeTimingSha256: timingHash };
  }
  project.updated_at = at;
  project.hyperframe_script = generateEchoHyperframeScript(project);
  project.hyperframe_script_stale = false;
  repairs.push({ file, songId: project.song_id, registryTrackId, previousTimingRegistryTrackId: timingRegistryTrackId, timingPath, timingHash, lineCount: lines.length, confidence, status: "repaired" });
  if (APPLY) writeJson(filePath, payload);
}

const report = {
  schemaVersion: "hapa.echo.lyric-audio-identity-repair.v1",
  generatedAt: at,
  mode: APPLY ? "apply" : "dry-run",
  ok: repairs.every((repair) => repair.status === "repaired"),
  mismatchCount: repairs.length,
  repairedCount: repairs.filter((repair) => repair.status === "repaired").length,
  blockedCount: repairs.filter((repair) => repair.status === "blocked").length,
  repairs,
};
fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
writeJson(REPORT_PATH, report);
process.stdout.write(`${JSON.stringify({ ok: report.ok, reportPath: REPORT_PATH, mismatchCount: report.mismatchCount, repairedCount: report.repairedCount, blockedCount: report.blockedCount, mode: report.mode }, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
