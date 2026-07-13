#!/usr/bin/env node
import fs from "fs";
import path from "path";
import crypto from "node:crypto";

const ROOT = path.resolve(".");
const DATA_DIR = path.join(ROOT, "data");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const HAPA_SONG_STORE_PATH = path.join(DATA_DIR, "hapa-songs-store.json");
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const REPORT_DIR = path.join(DATA_DIR, "song-sync-reports");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "369daf97-0e07-4c49-a7a2-2a6f0b18353b";
const SUNO_LIBRARY_ROOT = process.env.HAPA_SUNO_LIBRARY_ROOT || "/Users/calderwong/Desktop/suno-library";
const PLAYLIST_ROOT = process.env.HAPA_DEAR_PAPA_PLAYLIST_ROOT || path.join(SUNO_LIBRARY_ROOT, "playlists", PLAYLIST_ID);
const MANIFEST_PATH = process.env.HAPA_DEAR_PAPA_MANIFEST || path.join(PLAYLIST_ROOT, "manifest.json");
const SCRIPT_NAME = "scripts/sync-dear-papa-lyric-timings.mjs";
const args = new Set(process.argv.slice(2));
const APPLY_MUTATIONS = args.has("--apply") || process.env.HAPA_DEAR_PAPA_TIMINGS_APPLY === "1";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const UPDATED_AT = new Date().toISOString();

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function timingQuality(lines = [], confidence = 0) {
  let overlaps = 0; let duplicateStarts = 0; let wordBounds = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]; const next = lines[index + 1];
    if (next && Number(line.end) > Number(next.start) + .03) overlaps += 1;
    if (next && Math.abs(Number(line.start) - Number(next.start)) < .01) duplicateStarts += 1;
    for (const word of line.words || []) if (Number(word.start) < Number(line.start) - .05 || Number(word.end) > Number(line.end) + .25) wordBounds += 1;
  }
  const qualityStatus = Number(confidence) < .6 || overlaps || duplicateStarts ? "source-aligned-needs-review" : "source-aligned";
  return { qualityStatus, confidence: Number(confidence || 0), overlaps, duplicateStarts, wordBounds, humanReviewed: false };
}

function lineWordCount(line = {}) {
  return Array.isArray(line.words) && line.words.length
    ? line.words.length
    : String(line.text || "").split(/\s+/).filter(Boolean).length;
}

function makeEditPulses(lines = []) {
  return lines.map((line, index) => ({
    t: Number(line.start),
    kind: index % 4 === 0 ? "lyric-downbeat-candidate" : "lyric-edit-pulse",
    strength: Number(Math.min(.92, Math.max(.55, .52 + lineWordCount(line) * .018)).toFixed(2)),
    source: "lyric-line-start"
  }));
}

function timedSectionType(label = "", index = 0, total = 1) {
  const token = String(label).toLowerCase();
  if (/\bintro\b|phone ui|screen recording|notification|playback click/.test(token)) return "intro";
  if (/\bchorus\b|hook|refrain/.test(token)) return "chorus";
  if (/\bbridge\b|breakdown|middle/.test(token)) return "bridge";
  if (/\boutro\b|ringout|ending|fade/.test(token)) return "outro";
  if (index === 0 && total > 1) return "intro";
  if (index === total - 1 && total > 2) return "outro";
  return "verse";
}

function sectionEnergy(type = "verse", density = 0) {
  const base = { intro: .2, verse: .48, chorus: .78, bridge: .58, outro: .18 }[type] ?? .42;
  return Number(Math.min(.95, base + Math.min(.15, density * .18)).toFixed(2));
}

function buildTimedSections(lines = [], duration = 0) {
  if (!lines.length) return [{ id: "full_song_1", type: "instrumental", label: "Full Song", start: 0, end: duration, lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: .35, visualStrategy: "instrumental full-duration treatment" }];
  const sections = [];
  const firstStart = Number(lines[0].start || 0);
  if (firstStart > .25) sections.push({ id: "intro_1", type: "intro", label: "Intro / Pre-vocal", start: 0, end: Number(firstStart.toFixed(2)), lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: .2, visualStrategy: "establish tone before first timed vocal" });
  const groups = [];
  let current = null;
  for (const line of lines) {
    const label = line.section_label || line.section_id || line.section || "Timed Vocal";
    const previousEnd = current?.lines?.at(-1)?.end ?? line.start;
    if (!current || current.label !== label || Number(line.start) - Number(previousEnd) > 10) {
      current = { label, lines: [] };
      groups.push(current);
    }
    current.lines.push(line);
  }
  const counts = {};
  groups.forEach((group, index) => {
    const type = timedSectionType(group.label, index, groups.length);
    counts[type] = (counts[type] || 0) + 1;
    const id = `${type}_${counts[type]}`;
    const start = Number(Math.min(...group.lines.map((line) => Number(line.start))).toFixed(2));
    const end = Number(Math.max(...group.lines.map((line) => Number(line.end))).toFixed(2));
    const wordCount = group.lines.reduce((sum, line) => sum + lineWordCount(line), 0);
    const density = group.lines.length / Math.max(1, end - start);
    const vocalDensity = density > .5 ? "high" : density > .22 ? "medium" : "low";
    sections.push({ id, type, label: group.label || id, start, end, lyricLineCount: group.lines.length, wordCount, vocalDensity, energy: sectionEnergy(type, density), visualStrategy: "registry-timed vocal section from Dear Papa playlist timing sidecar" });
  });
  const lastEnd = Number(lines.at(-1)?.end || 0);
  if (duration - lastEnd > .25) sections.push({ id: "outro_1", type: "outro", label: "Outro / Ringout", start: Number(lastEnd.toFixed(2)), end: Number(duration.toFixed(2)), lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: .18, visualStrategy: "ringout after final timed vocal" });
  return sections;
}

function normalizeTimingLines(lines = []) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line, index) => {
      const start = Number(line.start ?? line.startTime ?? line.t0 ?? 0);
      const end = Number(line.end ?? line.endTime ?? line.t1 ?? start);
      const words = Array.isArray(line.words)
        ? line.words.map((word, wordIndex) => ({
            word: String(word.word || word.text || word.token || ""),
            start: Number(word.start ?? word.startTime ?? start),
            end: Number(word.end ?? word.endTime ?? end),
            matched: word.matched ?? undefined,
            index: Number(word.index ?? wordIndex)
          })).filter((word) => word.word)
        : [];
      return {
        id: line.id || `timed-line-${index + 1}`,
        start: Number(start.toFixed(3)),
        end: Number(end.toFixed(3)),
        text: line.text || line.line || line.lyric || "",
        section: line.section || line.section_label || "",
        section_id: line.section_id || line.sectionId || "",
        section_label: line.section_label || line.sectionLabel || line.section || "",
        confidence: Number(line.confidence ?? 0),
        words
      };
    })
    .filter((line) => line.text && Number.isFinite(line.start) && Number.isFinite(line.end) && line.end >= line.start);
}

function readTimingForManifestSong(song = {}) {
  const candidates = [
    song.lyricTimingPath,
    song.localDir ? path.join(song.localDir, "lyric-timing.json") : "",
    song.id ? path.join(PLAYLIST_ROOT, "lyric_timings", `${song.id}.json`) : ""
  ].filter(Boolean);
  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const timing = readJson(filePath);
    const lines = normalizeTimingLines(timing.lines || []);
    if (!lines.length) continue;
    return {
      registryTrackId: song.id,
      title: song.title || timing.title || "",
      path: filePath,
      sttPath: filePath.replace(/\.json$/, ".stt.json"),
      duration: Number(timing.duration || song.duration || 0),
      confidence: Number(timing.confidence ?? 0),
      stats: timing.stats || {},
      provenance: timing.provenance || {},
      source: timing.source || timing.provenance?.sttInput || "",
      lines,
      timingSha256: sha256(lines),
      quality: timingQuality(lines, timing.confidence)
    };
  }
  return null;
}

function registryIdForSong(song = {}) {
  return song.audio?.registryTrackId
    || song.registryTrackId
    || song.lineage?.registryTrackId
    || song.attribution?.songRegistryTrackId
    || "";
}

if (!fs.existsSync(MANIFEST_PATH)) {
  console.error(`Dear Papa playlist manifest not found: ${MANIFEST_PATH}`);
  process.exit(1);
}
if (!fs.existsSync(HAPA_SONG_STORE_PATH) || !fs.existsSync(SONGBOOK_PATH)) {
  console.error("Expected data/dear-papa-songbook.json and data/hapa-songs-store.json to exist.");
  process.exit(1);
}

const manifest = readJson(MANIFEST_PATH);
const timingByRegistryId = new Map();
for (const song of manifest.songs || []) {
  const timing = readTimingForManifestSong(song);
  if (timing?.registryTrackId) timingByRegistryId.set(timing.registryTrackId, timing);
}

const store = readJson(HAPA_SONG_STORE_PATH);
const songbook = readJson(SONGBOOK_PATH);
let storeUpdated = 0;
let songbookUpdated = 0;
let duplicateExactTimingKeys = 0;
let projectsUpdated = 0;
const touched = [];

for (const song of store.songs || []) {
  const registryTrackId = registryIdForSong(song);
  const timing = timingByRegistryId.get(registryTrackId);
  if (!timing) continue;
  const previousCount = Array.isArray(song.lyricTimings) ? song.lyricTimings.length : 0;
  song.lyricTimings = timing.lines;
  song.lyricTimingSource = {
    schemaVersion: "hapa.dear-papa.lyric-timing-source.v1",
    source: SCRIPT_NAME,
    timingSource: "dear-papa-playlist-lyric-timing",
    registryTrackId,
    playlistId: PLAYLIST_ID,
    path: timing.path,
    sttPath: fs.existsSync(timing.sttPath) ? timing.sttPath : "",
    confidence: timing.confidence,
    stats: timing.stats,
    timingSha256: timing.timingSha256,
    quality: timing.quality,
    updatedAt: UPDATED_AT
  };
  song.enrichment = {
    ...(song.enrichment || {}),
    timingReviewed: false,
    timingSource: "dear-papa-playlist-lyric-timing"
  };
  song.lineage = {
    ...(song.lineage || {}),
    lyricTimingPath: timing.path,
    lyricTimingRegistryTrackId: registryTrackId,
    lyricTimingSha256: timing.timingSha256
  };
  song.updatedAt = UPDATED_AT;
  storeUpdated++;
  touched.push({
    songId: song.songId || song.id,
    cardId: song.cardId || song.id,
    title: song.title,
    registryTrackId,
    previousCount,
    lineCount: timing.lines.length,
    confidence: timing.confidence
  });
}

const seenTimingKeys = new Set();
for (const card of songbook.songCards || []) {
  const registryTrackId = card.registryTrackId || card.lineage?.registryTrackId || "";
  const timing = timingByRegistryId.get(registryTrackId);
  if (!timing) continue;
  const exactKey = `${registryTrackId}:${timing.path}`;
  if (seenTimingKeys.has(exactKey)) duplicateExactTimingKeys++;
  seenTimingKeys.add(exactKey);
  card.lyrics = {
    ...(card.lyrics || {}),
    timingStatus: timing.quality.qualityStatus,
    timingSource: "dear-papa-playlist-lyric-timing",
    timingPath: timing.path,
    timingLineCount: timing.lines.length,
    timingConfidence: timing.confidence,
    timingSha256: timing.timingSha256,
    timingQuality: timing.quality
  };
  card.sync = {
    ...(card.sync || {}),
    lyricTimingPath: timing.path,
    lyricTimingLineCount: timing.lines.length,
    lyricTimingConfidence: timing.confidence,
    updatedAt: UPDATED_AT
  };
  card.updatedAt = UPDATED_AT;
  songbookUpdated++;
}

store.audit = {
  ...(store.audit || {}),
  withTimings: (store.songs || []).filter((song) => (song.lyricTimings || []).length > 0).length,
  lyricTimingSource: "dear-papa-playlist-lyric-timing",
  lyricTimingSyncedAt: UPDATED_AT
};
store.updatedAt = UPDATED_AT;
songbook.sync = {
  ...(songbook.sync || {}),
  lyricTimingSource: "dear-papa-playlist-lyric-timing",
  lyricTimingSyncedAt: UPDATED_AT,
  lyricTimingMatched: songbookUpdated
};
songbook.updatedAt = UPDATED_AT;

const timingByProjectId = new Map();
for (const song of store.songs || []) {
  const registryTrackId = registryIdForSong(song); const timing = timingByRegistryId.get(registryTrackId);
  if (timing) [song.id, song.cardId, song.songId].filter(Boolean).forEach((id) => timingByProjectId.set(String(id), { timing, registryTrackId }));
}
const projectWrites = [];
if (fs.existsSync(PROJECTS_DIR)) for (const file of fs.readdirSync(PROJECTS_DIR).filter((name) => name.endsWith("-video-project.json"))) {
  const filePath = path.join(PROJECTS_DIR, file); const payload = readJson(filePath); const project = payload.music_video_project || payload;
  const match = timingByProjectId.get(String(project.song_id)); if (!match) continue;
  const { timing, registryTrackId } = match; const previousHash = sha256(project.timed_lyrics || []);
  project.timed_lyrics = timing.lines;
  if (project.song_edit_map) {
    const duration = Number(project.duration || project.song_edit_map.audioTelemetry?.duration_sec || timing.duration || 0);
    const sections = buildTimedSections(timing.lines, duration);
    const wordCount = timing.lines.reduce((sum, line) => sum + lineWordCount(line), 0);
    project.song_edit_map.timedLyrics = timing.lines;
    project.song_edit_map.editPulses = makeEditPulses(timing.lines);
    project.song_edit_map.sections = sections;
    project.song_edit_map.vocalDensity = sections.map((section) => ({ start_sec: section.start, end_sec: section.end, vocal_density: section.vocalDensity, source: "dear-papa-playlist-lyric-timing" }));
    project.song_edit_map.energyCurves = { source: "dear-papa-playlist-lyric-timing", points: sections.map((section) => ({ t: section.start, section_id: section.id, energy: section.energy })) };
    project.song_edit_map.audioTelemetry = {
      ...(project.song_edit_map.audioTelemetry || {}),
      lyricLineCount: timing.lines.length,
      lyricBlockCount: sections.filter((section) => section.lyricLineCount > 0).length,
      wordCount,
      wordsPerMinute: Number((wordCount / Math.max(1, duration / 60)).toFixed(1)),
      lyricTimingSource: "dear-papa-playlist-lyric-timing",
      lyricTimingPath: timing.path,
      lyricTimingConfidence: timing.confidence
    };
    project.song_edit_map.provenance = { ...(project.song_edit_map.provenance || {}), lyricSource: "dear-papa-playlist-lyric-timing", lyricTimingSource: "dear-papa-playlist-lyric-timing", lyricTimingStrategy: "source-sidecar-by-registry-track", lyricTimingPath: timing.path, lyricTimingRegistryTrackId: registryTrackId, timingSourceSha256: timing.timingSha256, activeTimingSha256: timing.timingSha256 };
  }
  project.lyric_timing_truth = { schemaVersion: "hapa.echo.lyric-timing-truth.v2", source: "dear-papa-playlist-lyric-timing", sourcePath: timing.path, registryTrackId, timingSourceSha256: timing.timingSha256, activeTimingSha256: timing.timingSha256, sourceMatchesActive: true, ...timing.quality };
  project.lyric_timing_heal = { ...(project.lyric_timing_heal || {}), source: SCRIPT_NAME, strategy: "source-sidecar-by-registry-track", timingSource: "dear-papa-playlist-lyric-timing", timingPath: timing.path, timingConfidence: timing.confidence, registryTrackId, timingSourceSha256: timing.timingSha256, activeTimingSha256: timing.timingSha256, generatedAt: UPDATED_AT, lineCount: timing.lines.length, lastLyricEnd: timing.lines.at(-1)?.end || 0 };
  project.hyperframe_script_stale = true; project.updated_at = UPDATED_AT;
  projectWrites.push({ filePath, payload, songId: project.song_id, previousHash, timingSha256: timing.timingSha256 }); projectsUpdated += 1;
}

const report = {
  schemaVersion: "hapa.dear-papa-lyric-timing-sync-report.v1",
  runId: RUN_ID,
  mode: APPLY_MUTATIONS ? "apply" : "dry-run",
  updatedAt: UPDATED_AT,
  playlistId: PLAYLIST_ID,
  manifestPath: MANIFEST_PATH,
  timingFilesFound: timingByRegistryId.size,
  storeSongsUpdated: storeUpdated,
  songbookCardsUpdated: songbookUpdated,
  projectsUpdated,
  duplicateExactTimingKeys,
  touched
};

if (APPLY_MUTATIONS) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.copyFileSync(HAPA_SONG_STORE_PATH, path.join(BACKUP_DIR, `hapa-songs-store.before-lyric-timing-sync-${RUN_ID}.json`));
  fs.copyFileSync(SONGBOOK_PATH, path.join(BACKUP_DIR, `dear-papa-songbook.before-lyric-timing-sync-${RUN_ID}.json`));
  for (const entry of projectWrites) {
    const backupDir = path.join(BACKUP_DIR, `music-video-projects.before-lyric-timing-sync-${RUN_ID}`); fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(entry.filePath, path.join(backupDir, path.basename(entry.filePath))); writeJson(entry.filePath, entry.payload);
  }
  writeJson(HAPA_SONG_STORE_PATH, store);
  writeJson(SONGBOOK_PATH, songbook);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  writeJson(path.join(REPORT_DIR, `dear-papa-lyric-timing-sync-${RUN_ID}.json`), report);
  writeJson(path.join(REPORT_DIR, "latest-dear-papa-lyric-timing-sync.json"), report);
} else {
  console.log("Dry run only. Use --apply or HAPA_DEAR_PAPA_TIMINGS_APPLY=1 to write timing sync updates.");
}

console.log(JSON.stringify(report, null, 2));
