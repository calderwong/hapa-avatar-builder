#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  analyzeEchoLyricTiming,
  compareLyricText,
  isSourceDeclaredInstrumental,
  lyricIssuePriority,
} from "../src/domain/echo-lyric-quality.js";
import { evaluateEchoLyricTimingPromotion } from "../src/domain/echo-lyric-promotion.js";

const ROOT = path.resolve(".");
const PROJECTS_DIR = path.join(ROOT, "data/music-video-projects");
const SONG_STORE_PATH = path.join(ROOT, "data/hapa-songs-store.json");
const OLD_BASELINE_PATH = path.join(ROOT, "artifacts/echo-director-v2/baseline.json");
const PLAYLIST_MANIFEST_PATH = process.env.HAPA_DEAR_PAPA_MANIFEST
  || "/Users/calderwong/Desktop/suno-library/playlists/903148b6-5709-4511-9cfd-d34b23799da6/manifest.hapa-avatar-builder.json";
const OUTPUT_DIR = path.join(ROOT, "artifacts/echo-lyric-quality-v4");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(value) {
  return crypto.createHash("sha256").update(typeof value === "string" ? value : JSON.stringify(value)).digest("hex");
}

function projectBody(value) {
  return value?.music_video_project || value?.project || value || {};
}

function registryIdForSong(song = {}) {
  return String(song.audio?.registryTrackId || song.registryTrackId || song.lineage?.registryTrackId || "");
}

function countBy(values = []) {
  return Object.fromEntries([...values.reduce((map, value) => map.set(value, (map.get(value) || 0) + 1), new Map())].sort());
}

function canonicalTextFor(song = {}, manifestSong = null, project = {}) {
  const candidates = [
    project.lyrics?.sourcePath,
    project.lyric_source?.sourcePath,
    song.lyrics?.sourcePath,
    manifestSong?.lyricsPath,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const text = fs.readFileSync(candidate, "utf8").trim();
    if (text) return { text, path: candidate, kind: "source-file" };
  }
  const embedded = typeof song.lyrics === "string"
    ? song.lyrics
    : song.lyrics?.text
      || song.lyricText
      || project.lyrics?.text
      || project.lyric_source?.text
      || "";
  return embedded
    ? { text: embedded, path: "", kind: String(song.lyrics?.sourceKind || "song-store-embedded") }
    : { text: "", path: "", kind: "missing" };
}

function sourceMetadataFor(manifestSong = null) {
  const metadataPath = String(manifestSong?.metadataPath || "");
  if (!metadataPath || !fs.existsSync(metadataPath)) return {};
  try {
    return readJson(metadataPath);
  } catch {
    return {};
  }
}

function measuredPerformanceCanonicalFor(timingPath = "") {
  if (!timingPath || !fs.existsSync(timingPath)) return null;
  try {
    const timing = readJson(timingPath);
    const promotion = evaluateEchoLyricTimingPromotion(timing, {
      sourcePathExists: true,
      sttPathExists: fs.existsSync(timingPath.replace(/\.json$/i, ".stt.json")),
    });
    if (!promotion.accepted) return null;
    const text = (timing.lines || [])
      .map((line) => String(line?.text || "").trim())
      .filter(Boolean)
      .join("\n");
    if (!text) return null;
    return {
      text,
      path: timingPath,
      kind: "measured-performance-variant",
      sourceReference: {
        path: String(timing.provenance?.lyricsPath || ""),
        sha256: String(timing.provenance?.lyricsSha256 || ""),
      },
      timingStats: timing.stats || {},
      promotion,
    };
  } catch {
    return null;
  }
}

const store = readJson(SONG_STORE_PATH);
const manifest = fs.existsSync(PLAYLIST_MANIFEST_PATH) ? readJson(PLAYLIST_MANIFEST_PATH) : { songs: [] };
const oldBaseline = fs.existsSync(OLD_BASELINE_PATH) ? readJson(OLD_BASELINE_PATH) : { projects: [] };
const oldSongIds = new Set((oldBaseline.projects || []).map((project) => String(project.songId || "")));
const storeSongs = Array.isArray(store.songs) ? store.songs : [];
const songById = new Map();
for (const song of storeSongs) {
  for (const id of [song.id, song.songId, song.cardId, registryIdForSong(song)].filter(Boolean)) songById.set(String(id), song);
}
const manifestById = new Map((manifest.songs || []).map((song) => [String(song.id), song]));

const files = fs.readdirSync(PROJECTS_DIR).filter((file) => file.endsWith(".json")).sort();
const projects = files.map((file) => {
  const filePath = path.join(PROJECTS_DIR, file);
  const project = projectBody(readJson(filePath));
  const songId = String(project.song_id || "");
  const registryTrackId = String(project.registry_track_id || project.audio_id || "");
  const song = songById.get(songId) || songById.get(registryTrackId) || {};
  const resolvedRegistryTrackId = registryTrackId || registryIdForSong(song);
  const manifestSong = manifestById.get(resolvedRegistryTrackId) || null;
  const sourceMetadata = sourceMetadataFor(manifestSong);
  const sourceDeclaredInstrumental = isSourceDeclaredInstrumental(sourceMetadata);
  const sourceCanonical = canonicalTextFor(song, manifestSong, project);
  const lines = Array.isArray(project.timed_lyrics) ? project.timed_lyrics : [];
  const timing = analyzeEchoLyricTiming(lines, project.duration);
  const recent = oldSongIds.size > 0 ? !oldSongIds.has(songId) : String(song.createdAt || "") >= "2026-07-12";
  const timingTruth = project.lyric_timing_truth || {};
  const heal = project.lyric_timing_heal || {};
  const timingSource = String(
    timingTruth.timingSource
      || project.song_edit_map?.provenance?.lyricTimingSource
      || heal.timingSource
      || "missing",
  );
  const sourcePath = String(
    timingTruth.timingSourcePath
      || project.song_edit_map?.provenance?.lyricTimingPath
      || heal.timingPath
      || "",
  );
  const performanceCanonical = measuredPerformanceCanonicalFor(sourcePath);
  const canonical = performanceCanonical || sourceCanonical;
  const text = compareLyricText(lines, canonical.text);
  const confidence = Number(timingTruth.confidence ?? heal.timingConfidence ?? 0);
  const activeTimingSha256 = sha256(lines);
  const declaredActiveHash = String(timingTruth.activeTimingSha256 || heal.activeTimingSha256 || "");
  const hasCanonicalText = Boolean(canonical.text.trim());
  const lyricsEnabled = project.lyrics?.enabled !== false && project.lyrics_enabled !== false;
  const sourceKind = timingSource.includes("synthetic") ? "synthetic" : sourcePath ? "source-linked" : timingSource;
  const issues = [];
  if (sourceDeclaredInstrumental) {
    if (lyricsEnabled) issues.push("instrumental-lyrics-enabled");
    if (timing.lineCount) issues.push("instrumental-has-active-lyric-timing");
  } else {
    if (!hasCanonicalText) issues.push("canonical-text-missing");
    if (hasCanonicalText && !timing.lineCount) issues.push("timed-lyrics-missing");
    if (sourceKind === "synthetic") issues.push("synthetic-timing-active");
    if (!sourcePath) issues.push("timing-source-path-missing");
    if (!confidence) issues.push("timing-confidence-unmeasured");
    else if (confidence < 0.6 && !performanceCanonical?.promotion?.adjudicationAccepted) issues.push("timing-confidence-low");
    if (declaredActiveHash && declaredActiveHash !== activeTimingSha256) issues.push("active-timing-hash-mismatch");
    if (timing.structuralIssueCount) issues.push("timing-structure-invalid");
    const measuredMultilingualInterpolation = performanceCanonical?.timingStats
      ?.multilingualAnchorMode === true;
    if (timing.syntheticCadenceLikely && !measuredMultilingualInterpolation) {
      issues.push("uniform-word-cadence-likely-synthetic");
    }
    if (timing.metadataLines) issues.push("metadata-lines-active");
    if (hasCanonicalText && text.similarity < 0.75) issues.push("canonical-text-mismatch");
    else if (hasCanonicalText && text.similarity < 0.9) issues.push("canonical-text-review");
  }
  const vocalStem = manifestSong?.stems?.find((stem) => /^vocals?$/i.test(String(stem.stemType || ""))) || null;
  const masterPath = String(manifestSong?.songPath || song.audio?.localPath || "");
  const alignmentSource = sourceDeclaredInstrumental
    ? { kind: "not-applicable-instrumental", path: masterPath, exists: Boolean(masterPath && fs.existsSync(masterPath)) }
    : vocalStem?.localPath && fs.existsSync(vocalStem.localPath)
    ? { kind: "lead-vocals", path: vocalStem.localPath, exists: true }
    : { kind: "master-mix-fallback", path: masterPath, exists: Boolean(masterPath && fs.existsSync(masterPath)) };
  const priorityScore = sourceDeclaredInstrumental
    ? (recent ? 30 : 0) + (lyricsEnabled ? 80 : 0) + (timing.lineCount ? 80 : 0)
    : lyricIssuePriority({ recent, timing, text, sourceKind, hasCanonicalText });
  return {
    file,
    songId,
    title: String(project.song_title || song.title || songId),
    registryTrackId: resolvedRegistryTrackId,
    recent,
    durationSeconds: Number(project.duration || song.audio?.duration || 0),
    canonicalText: {
      status: sourceDeclaredInstrumental ? "not-applicable-instrumental" : hasCanonicalText ? "available" : "missing",
      kind: canonical.kind,
      path: canonical.path,
      sha256: hasCanonicalText ? sha256(canonical.text) : "",
      sourceReference: performanceCanonical?.sourceReference || {
        path: sourceCanonical.path,
        sha256: sourceCanonical.text ? sha256(sourceCanonical.text) : "",
      },
    },
    sourceDeclaration: {
      instrumental: sourceDeclaredInstrumental,
      metadataPath: String(manifestSong?.metadataPath || ""),
    },
    activeLyrics: {
      sha256: activeTimingSha256,
      declaredActiveHash,
      timingSource,
      timingSourcePath: sourcePath,
      confidence,
      sourceKind,
      adjudicationAccepted: Boolean(performanceCanonical?.promotion?.adjudicationAccepted),
      variant: String(project.lyric_variant || "missing"),
      enabled: lyricsEnabled,
    },
    alignmentSource,
    timing,
    text,
    issues,
    priorityScore,
    status: issues.length === 0 ? "verified" : issues.some((issue) => [
      "timed-lyrics-missing",
      "synthetic-timing-active",
      "canonical-text-mismatch",
      "instrumental-lyrics-enabled",
      "instrumental-has-active-lyric-timing",
      "timing-structure-invalid",
      "active-timing-hash-mismatch",
    ].includes(issue)) ? "repair-required" : "review-required",
  };
}).sort((left, right) => right.priorityScore - left.priorityScore || left.title.localeCompare(right.title));

const summary = {
  projects: projects.length,
  oldBaselineProjects: oldSongIds.size,
  recentProjects: projects.filter((project) => project.recent).length,
  statuses: countBy(projects.map((project) => project.status)),
  issueCounts: countBy(projects.flatMap((project) => project.issues)),
  projectsWithCanonicalText: projects.filter((project) => project.canonicalText.status === "available").length,
  sourceDeclaredInstrumentals: projects.filter((project) => project.sourceDeclaration.instrumental).length,
  instrumentalsWithLyricsDisabled: projects.filter((project) => project.sourceDeclaration.instrumental && !project.activeLyrics.enabled).length,
  projectsWithTimedLyrics: projects.filter((project) => project.timing.lineCount > 0).length,
  projectsWithSyntheticTiming: projects.filter((project) => project.activeLyrics.sourceKind === "synthetic").length,
  projectsWithLeadVocalAlignmentSource: projects.filter((project) => project.alignmentSource.kind === "lead-vocals" && project.alignmentSource.exists).length,
  projectsWithMasterFallback: projects.filter((project) => project.alignmentSource.kind === "master-mix-fallback" && project.alignmentSource.exists).length,
  projectsMissingAlignmentAudio: projects.filter((project) => !project.alignmentSource.exists).length,
  recentRepairRequired: projects.filter((project) => project.recent && project.status === "repair-required").length,
  recentReviewRequired: projects.filter((project) => project.recent && project.status === "review-required").length,
  verified: projects.filter((project) => project.status === "verified").length,
};

const report = {
  schemaVersion: "hapa.echo.lyric-quality-baseline.v4",
  mutationMode: "read-only",
  generatedAt: new Date().toISOString(),
  sources: {
    projects: PROJECTS_DIR,
    songStore: SONG_STORE_PATH,
    oldBaseline: OLD_BASELINE_PATH,
    playlistManifest: PLAYLIST_MANIFEST_PATH,
  },
  recentDefinition: oldSongIds.size > 0
    ? "song ID absent from the preserved 79-project Echo Director baseline"
    : "song store createdAt on or after 2026-07-12",
  summary,
  recentQueue: projects.filter((project) => project.recent),
  projects,
};

const markdown = `# Echo Lyric Quality v4 Baseline

This is a read-only audit of the live Director projects. It does not treat
schema validity or the older 79-project completion claim as evidence of audible
alignment quality.

## Scope

- Live projects: ${summary.projects}
- Preserved older baseline: ${summary.oldBaselineProjects}
- Recent projects: ${summary.recentProjects}
- Canonical lyric text available: ${summary.projectsWithCanonicalText}
- Source-declared instrumentals: ${summary.sourceDeclaredInstrumentals}
- Instrumentals with Lyrics correctly disabled: ${summary.instrumentalsWithLyricsDisabled}
- Timed lyric payloads present: ${summary.projectsWithTimedLyrics}

## Truth

- Verified: ${summary.verified}
- Repair required: ${summary.statuses["repair-required"] || 0}
- Review required: ${summary.statuses["review-required"] || 0}
- Synthetic timing active: ${summary.projectsWithSyntheticTiming}
- Lead-vocal alignment source available: ${summary.projectsWithLeadVocalAlignmentSource}
- Master-mix fallback available: ${summary.projectsWithMasterFallback}
- Missing local alignment audio: ${summary.projectsMissingAlignmentAudio}

## Recent-song queue

- Repair required: ${summary.recentRepairRequired}
- Review required: ${summary.recentReviewRequired}

## Highest-priority projects

${projects.slice(0, 30).map((project) => `- ${project.recent ? "**RECENT** " : ""}${project.title}: ${project.status}; score ${project.priorityScore}; ${project.issues.join(", ") || "no issues"}`).join("\n")}
`;

fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUTPUT_DIR, "baseline.json"), `${JSON.stringify(report, null, 2)}\n`);
fs.writeFileSync(path.join(OUTPUT_DIR, "baseline.md"), markdown);
process.stdout.write(`${JSON.stringify({ ok: true, outputDir: OUTPUT_DIR, summary }, null, 2)}\n`);
