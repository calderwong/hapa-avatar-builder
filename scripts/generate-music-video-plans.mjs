import fs from "fs";
import path from "path";

const DATA_DIR = "./data";
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const SCRIPT_NAME = "scripts/generate-music-video-plans.mjs";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const GENERATED_AT = new Date().toISOString();
const args = new Set(process.argv.slice(2));
const APPLY_MUTATIONS = args.has("--apply") || process.env.HAPA_ECHOS_APPLY === "1";

if (APPLY_MUTATIONS && fs.existsSync(PROJECTS_DIR)) {
  const backupDir = path.join(DATA_DIR, "backups", `music-video-projects-${RUN_ID}`);
  fs.mkdirSync(path.dirname(backupDir), { recursive: true });
  fs.cpSync(PROJECTS_DIR, backupDir, { recursive: true });
  console.log(`Backed up existing director projects to: ${backupDir}`);
}

if (APPLY_MUTATIONS && !fs.existsSync(PROJECTS_DIR)) {
  fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Load data sources
const songbookPath = path.join(DATA_DIR, "dear-papa-songbook.json");
const songsStorePath = path.join(DATA_DIR, "hapa-songs-store.json");
const gapsReportPath = path.join(DATA_DIR, "echos-gaps-report.json");
const manifestPath = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json";

if (!fs.existsSync(songbookPath)) {
  console.error(`Songbook not found at: ${songbookPath}`);
  process.exit(1);
}

const songbook = JSON.parse(fs.readFileSync(songbookPath, "utf-8"));
const gapsReport = fs.existsSync(gapsReportPath) ? JSON.parse(fs.readFileSync(gapsReportPath, "utf-8")) : { videos: [] };

// Load audio identity, duration, and stem metadata from Hapa Songs store.
let songMetadataByKey = {};
if (fs.existsSync(songsStorePath)) {
  try {
    const songsStore = JSON.parse(fs.readFileSync(songsStorePath, "utf-8"));
    const songs = songsStore.songs || songsStore.songCards || [];
    songs.forEach(s => {
      const metadata = {
        id: s.id || s.cardId || s.songId,
        cardId: s.cardId || s.id,
        songId: s.songId,
        registryTrackId: s.audio?.registryTrackId || s.registryTrackId,
        duration: Number(s.audio?.duration || s.duration || 0),
        audioUri: s.audio?.mp3Uri || (s.audio?.registryTrackId ? `/api/song-registry/audio/${encodeURIComponent(s.audio.registryTrackId)}` : ""),
        coverUri: s.audio?.coverUri || "",
        stems: Array.isArray(s.stems) ? s.stems : [],
        lyricTimings: Array.isArray(s.lyricTimings) ? s.lyricTimings : [],
        lyricTimingSource: s.lyricTimingSource || null,
        lyricTimingRegistryTrackId: s.lyricTimingSource?.registryTrackId || s.lineage?.lyricTimingRegistryTrackId || "",
        lyricTimingPath: s.lineage?.lyricTimingPath || s.lyricTimingSource?.path || "",
      };
      [s.id, s.cardId, s.songId, metadata.registryTrackId].filter(Boolean).forEach((key) => {
        songMetadataByKey[key] = metadata;
      });
    });
  } catch (e) {
    console.warn("Failed to load song metadata:", e);
  }
}

function findSongMetadata(song) {
  const expectedRegistryTrackId = song.registryTrackId || song.lineage?.registryTrackId || "";
  const keys = [
    expectedRegistryTrackId,
    song.id,
    song.cardId,
    song.songId,
  ].filter(Boolean);
  for (const key of keys) {
    const metadata = songMetadataByKey[key];
    if (!metadata) continue;
    if (expectedRegistryTrackId && metadata.registryTrackId && metadata.registryTrackId !== expectedRegistryTrackId) continue;
    return metadata;
  }
  return null;
}

// Load visualizers
let shaders = [];
if (fs.existsSync(manifestPath)) {
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    shaders = (manifest.shaders || []).filter((shader) => (
      shader?.enabled !== false && shader?.directorEligible !== false && shader?.id && shader?.source
    ));
  } catch (e) {
    console.warn("Failed to load visualizer manifest:", e);
  }
}

// Helper to hash string deterministically
function getSimpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function getLyricText(song) {
  return song.lyrics?.text || song.lyricsText || "";
}

function splitLyricLine(line) {
  const text = String(line || "").trim();
  if (!text) return [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length <= 8) return [text];

  const phraseParts = text
    .split(/(?<=[,;:!?…])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const phrases = phraseParts.length > 1 ? phraseParts : [text];
  const out = [];
  phrases.forEach((phrase) => {
    const phraseWords = phrase.split(/\s+/).filter(Boolean);
    if (phraseWords.length <= 8) {
      out.push(phrase);
      return;
    }
    for (let i = 0; i < phraseWords.length; i += 7) {
      out.push(phraseWords.slice(i, i + 7).join(" "));
    }
  });
  return out;
}

function parseLyricBlocks(song) {
  const rawText = getLyricText(song);
  const blocks = rawText
    .split(/\n\s*\n/g)
    .map((block) => block
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap(splitLyricLine))
    .filter((lines) => lines.length > 0);

  if (blocks.length) return blocks;

  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap(splitLyricLine);
  return lines.length ? [lines] : [];
}

function sectionTypeForBlock(lines, index, totalBlocks, title) {
  const normalizedLines = lines.map(cleanToken);
  const uniqueLineCount = new Set(normalizedLines).size;
  const titleToken = cleanToken(title);
  const repeatsTitle = titleToken && normalizedLines.filter((line) => line.includes(titleToken)).length >= 2;
  const shortRepeating = lines.length > 1 && uniqueLineCount <= Math.ceil(lines.length * 0.55);
  if (index === 0 && lines.length <= 4) return "intro";
  if (index === totalBlocks - 1 && lines.length <= 4) return "outro";
  if (repeatsTitle || shortRepeating || normalizedLines.some((line) => /\b(hook|chorus)\b/.test(line))) return "chorus";
  if (normalizedLines.some((line) => /\b(bridge|what if|but what if|and whatever)\b/.test(line))) return "bridge";
  return "verse";
}

function labelForSection(type, index, seenCounts) {
  seenCounts[type] = (seenCounts[type] || 0) + 1;
  if (type === "intro" || type === "outro" || type === "bridge") {
    return seenCounts[type] === 1 ? type.replace(/^./, (c) => c.toUpperCase()) : `${type.replace(/^./, (c) => c.toUpperCase())} ${seenCounts[type]}`;
  }
  return `${type.replace(/^./, (c) => c.toUpperCase())} ${seenCounts[type]}`;
}

function energyForSection(type, density, index, total) {
  const baseByType = {
    intro: 0.24,
    verse: 0.48,
    chorus: 0.82,
    bridge: 0.62,
    outro: 0.28,
  };
  const arcLift = total > 1 ? (index / (total - 1)) * 0.12 : 0;
  return Number(clamp((baseByType[type] ?? 0.5) + density * 0.18 + arcLift, 0.08, 0.95).toFixed(2));
}

function normalizeTimedWords(words = [], lineStart, lineEnd) {
  if (!Array.isArray(words)) return [];
  return words
    .map((word, index) => ({
      word: String(word.word || word.text || word.token || ""),
      start: Number(Number(word.start ?? word.startTime ?? lineStart).toFixed(3)),
      end: Number(Number(word.end ?? word.endTime ?? lineEnd).toFixed(3)),
      matched: word.matched ?? undefined,
      index: Number(word.index ?? index)
    }))
    .filter((word) => word.word && Number.isFinite(word.start) && Number.isFinite(word.end));
}

function normalizeExternalTimedLyrics(timings = [], duration = 0) {
  if (!Array.isArray(timings)) return [];
  return timings
    .map((line) => {
      const start = Number(line.start ?? line.startTime ?? line.t0 ?? 0);
      const end = Number(line.end ?? line.endTime ?? line.t1 ?? start);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      const maxDuration = duration || Math.max(end, start);
      const clampedStart = Number(clamp(start, 0, maxDuration).toFixed(3));
      const clampedEnd = Number(clamp(end, clampedStart, duration || end).toFixed(3));
      const text = String(line.text || line.line || line.lyric || "").trim();
      if (!text) return null;
      return {
        text,
        start: clampedStart,
        end: clampedEnd,
        section_id: line.section_id || line.sectionId || "",
        section_label: line.section_label || line.sectionLabel || line.section || "",
        confidence: Number(line.confidence ?? 0),
        timing_source: "dear-papa-playlist-lyric-timing",
        words: normalizeTimedWords(line.words, clampedStart, clampedEnd)
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function typeForTimedSection(label = "", index = 0, total = 1) {
  const normalized = cleanToken(label);
  if (/\bintro\b|phone ui|screen recording|notification|playback click/.test(normalized)) return "intro";
  if (/\bchorus\b|hook|refrain/.test(normalized)) return "chorus";
  if (/\bbridge\b|breakdown|middle/.test(normalized)) return "bridge";
  if (/\boutro\b|ringout|ending|fade/.test(normalized)) return "outro";
  if (index === 0 && total > 1) return "intro";
  if (index === total - 1 && total > 2) return "outro";
  return "verse";
}

function buildSectionsFromTimedLyrics(timedLyrics = [], duration = 0) {
  const sections = [];
  const lines = timedLyrics.filter((line) => Number.isFinite(Number(line.start)) && Number.isFinite(Number(line.end)));
  if (!lines.length) {
    return [{ id: "full_song_1", type: "instrumental", label: "Full Song", start: 0, end: duration, lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: 0.35, visualStrategy: "instrumental full-duration treatment" }];
  }

  const firstStart = Number(lines[0].start || 0);
  if (firstStart > 0.25) {
    sections.push({
      id: "intro_1",
      type: "intro",
      label: "Intro / Pre-vocal",
      start: 0,
      end: Number(firstStart.toFixed(2)),
      lyricLineCount: 0,
      wordCount: 0,
      vocalDensity: "none",
      energy: 0.2,
      visualStrategy: "establish tone before first timed vocal"
    });
  }

  const groups = [];
  let current = null;
  lines.forEach((line) => {
    const label = line.section_label || line.section_id || "Timed Vocal";
    const previousEnd = current?.lines?.[current.lines.length - 1]?.end ?? line.start;
    const shouldStart = !current || label !== current.label || line.start - previousEnd > 10;
    if (shouldStart) {
      current = { label, lines: [] };
      groups.push(current);
    }
    current.lines.push(line);
  });

  const seenCounts = {};
  groups.forEach((group, index) => {
    const type = typeForTimedSection(group.label, index, groups.length);
    seenCounts[type] = (seenCounts[type] || 0) + 1;
    const id = `${type}_${seenCounts[type]}`;
    const start = Number(Math.min(...group.lines.map((line) => Number(line.start))).toFixed(2));
    const end = Number(Math.max(...group.lines.map((line) => Number(line.end))).toFixed(2));
    const wordCount = group.lines.reduce((sum, line) => sum + (line.words?.length || String(line.text || "").split(/\s+/).filter(Boolean).length), 0);
    const lineDensity = group.lines.length / Math.max(1, end - start);
    const vocalDensity = lineDensity > 0.5 ? "high" : lineDensity > 0.22 ? "medium" : "low";
    sections.push({
      id,
      type,
      label: group.label || `${type.replace(/^./, (c) => c.toUpperCase())} ${seenCounts[type]}`,
      start,
      end,
      lyricLineCount: group.lines.length,
      wordCount,
      vocalDensity,
      energy: energyForSection(type, lineDensity, index, groups.length),
      visualStrategy: "registry-timed vocal section from Dear Papa playlist timing sidecar"
    });
    group.lines.forEach((line) => {
      line.section_id = line.section_id || id;
      line.section_label = line.section_label || group.label || id;
    });
  });

  const lastEnd = Number(lines[lines.length - 1].end || 0);
  if (duration - lastEnd > 0.25) {
    sections.push({
      id: "outro_1",
      type: "outro",
      label: "Outro / Ringout",
      start: Number(lastEnd.toFixed(2)),
      end: Number(duration.toFixed(2)),
      lyricLineCount: 0,
      wordCount: 0,
      vocalDensity: "none",
      energy: 0.18,
      visualStrategy: "ringout after final timed vocal"
    });
  }
  return sections;
}

function makeEditPulses(timedLyrics = []) {
  return timedLyrics.map((line, index) => ({
    t: line.start,
    kind: index % 4 === 0 ? "lyric-downbeat-candidate" : "lyric-edit-pulse",
    strength: Number(clamp(0.52 + (line.words?.length || String(line.text || "").split(/\s+/).filter(Boolean).length || 1) * 0.018, 0.55, 0.92).toFixed(2)),
    source: "lyric-line-start"
  }));
}

function timedLyricsWordCount(timedLyrics = []) {
  return timedLyrics.reduce((sum, line) => sum + (line.words?.length || String(line.text || "").split(/\s+/).filter(Boolean).length), 0);
}

function timedLyricsLastEnd(timedLyrics = []) {
  return timedLyrics.reduce((max, line) => Math.max(max, Number(line.end ?? line.end_sec ?? line.t1 ?? 0) || 0), 0);
}

function exactTimingRejectReason(timedLyrics = [], duration = 0, songMetadata = null, song = null) {
  const timingPath = String(
    songMetadata?.lyricTimingPath
    || songMetadata?.lyricTimingSource?.path
    || ""
  ).trim();
  if (!timingPath) {
    return {
      reason: "missing-timing-source-path",
      timingPath: ""
    };
  }
  const expectedRegistryTrackId = String(
    songMetadata?.registryTrackId
    || song?.registryTrackId
    || song?.lineage?.registryTrackId
    || ""
  ).trim();
  const timingRegistryTrackId = String(
    songMetadata?.lyricTimingRegistryTrackId
    || songMetadata?.lyricTimingSource?.registryTrackId
    || ""
  ).trim();
  if (expectedRegistryTrackId && timingRegistryTrackId && expectedRegistryTrackId !== timingRegistryTrackId) {
    return {
      reason: "registry-track-mismatch",
      expectedRegistryTrackId,
      timingRegistryTrackId,
      timingPath: songMetadata?.lyricTimingPath || songMetadata?.lyricTimingSource?.path || ""
    };
  }
  if (expectedRegistryTrackId && !timingRegistryTrackId) {
    return {
      reason: "missing-timing-registry-track-id",
      expectedRegistryTrackId,
      timingPath: songMetadata?.lyricTimingPath || songMetadata?.lyricTimingSource?.path || ""
    };
  }
  const lastEnd = timedLyricsLastEnd(timedLyrics);
  if (duration > 0 && lastEnd > duration + .25) {
    return {
      reason: "timing-outside-song-duration",
      lastLyricEnd: Number(lastEnd.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      expectedRegistryTrackId,
      timingRegistryTrackId,
      timingPath: songMetadata?.lyricTimingPath || songMetadata?.lyricTimingSource?.path || ""
    };
  }
  return null;
}

function buildExactTimedSongEditMap(song, songMetadata, duration, timedLyrics, stemKinds) {
  const sections = buildSectionsFromTimedLyrics(timedLyrics, duration);
  const wordCount = timedLyricsWordCount(timedLyrics);
  const lyricBlockCount = sections.filter((section) => section.lyricLineCount > 0).length;
  const timingPath = songMetadata?.lyricTimingPath || songMetadata?.lyricTimingSource?.path || "";
  const timingConfidence = songMetadata?.lyricTimingSource?.confidence ?? null;
  const registryTrackId = songMetadata?.lyricTimingRegistryTrackId || songMetadata?.lyricTimingSource?.registryTrackId || "";
  return {
    schemaVersion: "hapa.echos.song-edit-map.v1",
    provenance: {
      durationSource: songMetadata?.duration ? "hapa-songs-store.audio.duration" : "fallback-song-duration",
      lyricSource: "dear-papa-playlist-lyric-timing",
      lyricTimingSource: "dear-papa-playlist-lyric-timing",
      lyricTimingStrategy: "exact-registry-track-lyric-timing",
      lyricTimingPath: timingPath,
      lyricTimingRegistryTrackId: registryTrackId,
      lyricTimingRejectedExact: null,
      stemSource: stemKinds.length ? "hapa-songs-store.stems" : "none",
      confidence: stemKinds.length ? "registry_audio_stem_exact_timing" : "registry_audio_exact_timing_no_stems"
    },
    audioTelemetry: {
      duration_sec: Number(duration.toFixed(2)),
      lyricLineCount: timedLyrics.length,
      lyricBlockCount,
      wordCount,
      wordsPerMinute: Number((wordCount / Math.max(1, duration / 60)).toFixed(1)),
      stemCount: stemKinds.length,
      stemKinds,
      lyricTimingSource: "dear-papa-playlist-lyric-timing",
      lyricTimingPath: timingPath,
      lyricTimingConfidence: timingConfidence
    },
    sections,
    timedLyrics,
    editPulses: makeEditPulses(timedLyrics),
    vocalDensity: sections.map((section) => ({
      start_sec: section.start,
      end_sec: section.end,
      vocal_density: section.vocalDensity,
      source: "dear-papa-playlist-lyric-timing"
    })),
    energyCurves: {
      source: "dear-papa-playlist-lyric-timing",
      points: sections.map((section) => ({
        t: section.start,
        section_id: section.id,
        energy: section.energy
      }))
    }
  };
}

function buildSongEditMap(song, songMetadata, duration) {
  const lyricBlocks = parseLyricBlocks(song);
  const lyricLines = lyricBlocks.flat();
  const wordCount = lyricLines.reduce((sum, line) => sum + line.split(/\s+/).filter(Boolean).length, 0);
  const stemKinds = unique((songMetadata?.stems || []).map((stem) => stem.kind || stem.title || stem.id));
  const externalTimedLyrics = normalizeExternalTimedLyrics(songMetadata?.lyricTimings || [], duration);
  let rejectedExactTiming = null;
  if (externalTimedLyrics.length) {
    rejectedExactTiming = exactTimingRejectReason(externalTimedLyrics, duration, songMetadata, song);
    if (!rejectedExactTiming) {
      return buildExactTimedSongEditMap(song, songMetadata, duration, externalTimedLyrics, stemKinds);
    }
  }

  const singingStart = Number(Math.min(6, duration * 0.035).toFixed(2));
  const singingEnd = Number(Math.max(
    singingStart + 1,
    Math.min(duration - 0.5, Math.max(duration * 0.985, duration - 3))
  ).toFixed(2));
  const singingDuration = Math.max(1, singingEnd - singingStart);
  const seenCounts = {};

  const sections = [];
  const timedLyrics = [];
  let sectionCursor = singingStart;

  if (singingStart > 0.2) {
    sections.push({
      id: "intro_1",
      type: "intro",
      label: "Intro",
      start: 0,
      end: singingStart,
      lyricLineCount: 0,
      wordCount: 0,
      vocalDensity: "none",
      energy: 0.2,
      visualStrategy: "establish cover art, scene tone, and low-density shader"
    });
  }

  lyricBlocks.forEach((lines, blockIndex) => {
    const blockWords = lines.reduce((sum, line) => sum + line.split(/\s+/).filter(Boolean).length, 0);
    const weight = Math.max(1, blockWords);
    const totalWeight = lyricBlocks.reduce((sum, block) => (
      sum + Math.max(1, block.reduce((lineSum, line) => lineSum + line.split(/\s+/).filter(Boolean).length, 0))
    ), 0);
    const blockDuration = blockIndex === lyricBlocks.length - 1
      ? singingEnd - sectionCursor
      : singingDuration * (weight / totalWeight);
    const start = Number(sectionCursor.toFixed(2));
    const end = Number(Math.min(singingEnd, sectionCursor + blockDuration).toFixed(2));
    const type = sectionTypeForBlock(lines, blockIndex, lyricBlocks.length, song.title || "");
    const lineDensity = lines.length / Math.max(1, end - start);
    const vocalDensity = lineDensity > 0.5 ? "high" : lineDensity > 0.22 ? "medium" : "low";
    const label = labelForSection(type, blockIndex, seenCounts);
    const energy = energyForSection(type, lineDensity, blockIndex, lyricBlocks.length);

    sections.push({
      id: `${type}_${seenCounts[type]}`,
      type,
      label,
      start,
      end,
      lyricLineCount: lines.length,
      wordCount: blockWords,
      vocalDensity,
      energy,
      visualStrategy: type === "chorus"
        ? "repeatable hook treatment with higher motion and visualizer density"
        : type === "bridge"
          ? "symbolic bridge treatment with lyrical focus"
          : "lyric-led narrative coverage"
    });

    const lineWeights = lines.map((text) => {
      const count = text.split(/\s+/).filter(Boolean).length;
      const pauseLift = /[,;:!?…)]$/.test(text.trim()) ? 1.2 : 0;
      return clamp(count + pauseLift, 2.5, 12);
    });
    const totalLineWeight = lineWeights.reduce((sum, weight) => sum + weight, 0) || 1;
    let lineCursor = start;
    lines.forEach((text, lineIndex) => {
      const lineSlot = lineIndex === lines.length - 1
        ? Math.max(0.45, end - lineCursor)
        : Math.max(0.45, (end - start) * (lineWeights[lineIndex] / totalLineWeight));
      const lineStart = Number(lineCursor.toFixed(2));
      const lineEnd = Number(Math.min(end, lineCursor + Math.max(0.45, lineSlot * 0.92)).toFixed(2));
      const words = text.split(/\s+/).filter(Boolean).map((word, wordIdx, wordArr) => {
        const wordDuration = Math.max(0.1, (lineEnd - lineStart) / Math.max(1, wordArr.length));
        const wordStart = lineStart + (wordIdx * wordDuration);
        return {
          word,
          start: Number(wordStart.toFixed(2)),
          end: Number(Math.min(lineEnd, wordStart + wordDuration * 0.92).toFixed(2))
        };
      });
      timedLyrics.push({
        text,
        start: Number(lineStart.toFixed(1)),
        end: Number(lineEnd.toFixed(1)),
        section_id: `${type}_${seenCounts[type]}`,
        words
      });
      lineCursor = Math.min(end, lineCursor + lineSlot);
    });

    sectionCursor = end;
  });

  if (duration - singingEnd > 0.2) {
    sections.push({
      id: "outro_1",
      type: "outro",
      label: "Outro / Ringout",
      start: singingEnd,
      end: duration,
      lyricLineCount: 0,
      wordCount: 0,
      vocalDensity: "none",
      energy: 0.18,
      visualStrategy: "ringout decay and final continuity beat"
    });
  }

  if (!sections.length) {
    sections.push({ id: "full_song_1", type: "instrumental", label: "Full Song", start: 0, end: duration, lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: 0.35, visualStrategy: "instrumental full-duration treatment" });
  }

  const editPulses = timedLyrics.map((line, index) => ({
    t: line.start,
    kind: index % 4 === 0 ? "lyric-downbeat-candidate" : "lyric-edit-pulse",
    strength: Number(clamp(0.52 + (line.words?.length || 1) * 0.018, 0.55, 0.92).toFixed(2)),
    source: "lyric-line-start"
  }));

  return {
    schemaVersion: "hapa.echos.song-edit-map.v1",
    provenance: {
      durationSource: songMetadata?.duration ? "hapa-songs-store.audio.duration" : "fallback-song-duration",
      lyricSource: song.lyrics?.sourceKind || song.lyrics?.status || "songbook-lyrics",
      lyricTimingSource: "synthetic-weighted-lyric-heal",
      lyricTimingStrategy: rejectedExactTiming
        ? "weighted-phrase-split-full-song-arc-after-exact-timing-rejected"
        : "weighted-phrase-split-full-song-arc",
      lyricTimingPath: "",
      lyricTimingRegistryTrackId: songMetadata?.registryTrackId || song?.registryTrackId || "",
      lyricTimingRejectedExact: rejectedExactTiming,
      stemSource: stemKinds.length ? "hapa-songs-store.stems" : "none",
      confidence: songMetadata?.duration && lyricLines.length && stemKinds.length ? "registry_lyric_stem_inferred" : "partial_inferred"
    },
    audioTelemetry: {
      duration_sec: Number(duration.toFixed(2)),
      lyricLineCount: lyricLines.length,
      lyricBlockCount: lyricBlocks.length,
      wordCount,
      wordsPerMinute: Number((wordCount / Math.max(1, duration / 60)).toFixed(1)),
      stemCount: stemKinds.length,
      stemKinds
    },
    sections,
    timedLyrics,
    editPulses,
    vocalDensity: sections.map((section) => ({
      start_sec: section.start,
      end_sec: section.end,
      vocal_density: section.vocalDensity,
      source: "lyric-line-density"
    })),
    energyCurves: {
      source: "lyric-density-section-arc",
      points: sections.map((section) => ({
        t: section.start,
        section_id: section.id,
        energy: section.energy
      }))
    }
  };
}

function chooseActiveStems(section, stemKinds) {
  const available = new Set(stemKinds.map((stem) => stem.toLowerCase()));
  const pick = (...names) => names.filter((name) => available.has(name.toLowerCase()));
  if (section.type === "intro" || section.type === "outro") {
    return pick("Vocals", "Keyboard", "Synth", "Strings", "FX").slice(0, 3);
  }
  if (section.type === "chorus") {
    return pick("Vocals", "Backing Vocals", "Drums", "Bass", "Guitar", "Synth").slice(0, 5);
  }
  if (section.type === "bridge") {
    return pick("Vocals", "Backing Vocals", "Keyboard", "Strings", "FX").slice(0, 4);
  }
  return pick("Vocals", "Drums", "Bass", "Guitar", "Keyboard").slice(0, 4);
}

function chooseCameraMotion(section, shotIdx, video, isPureVisualizer) {
  if (isPureVisualizer || !video) {
    return { camera_motion: "static", camera_intensity: 0, camera_speed: 1 };
  }
  const tags = video.tags || [];
  const text = [video.id, video.title, video.flowType, video.objectiveSummary, video.narrativeSummary, ...tags].filter(Boolean).join(" ").toLowerCase();
  const cameraSpeed = Number(clamp(1.2 + ((shotIdx * 13 + section.label.length) % 8) * 0.12 + (section.type === "chorus" ? 0.22 : 0), 1.15, 2.2).toFixed(2));
  if (/vertical|portrait|tarot|portrait-framing/.test(text)) {
    const verticalSequence = ["pan-down", "pan-up", "pan-down-left", "pan-up-right", "pan-down", "pan-up-left", "pan-up", "pan-down-right"];
    return {
      camera_motion: verticalSequence[shotIdx % verticalSequence.length],
      camera_intensity: 1.25,
      camera_speed: Math.min(2.25, Number((cameraSpeed + 0.15).toFixed(2)))
    };
  }
  if (section.type === "chorus") {
    return {
      camera_motion: ["pan-down", "pan-up", "pan-down-right", "pan-up-left"][shotIdx % 4],
      camera_intensity: 1.35,
      camera_speed: cameraSpeed
    };
  }
  if (section.type === "bridge") {
    return { camera_motion: shotIdx % 2 === 0 ? "pan-up-right" : "pan-down-left", camera_intensity: 1.05, camera_speed: cameraSpeed };
  }
  const sequence = ["pan-down", "pan-up", "pan-up-left", "pan-down-right", "slow-push-in", "pan-up-right", "pan-down-left", "handheld-float"];
  return {
    camera_motion: sequence[shotIdx % sequence.length],
    camera_intensity: Number((1.0 + ((shotIdx + section.label.length) % 4) * 0.12).toFixed(1)),
    camera_speed: cameraSpeed
  };
}

function buildCanonAffordanceGraph(song, songMetadata, songEditMap, candidateVideos) {
  const perspective = song.performancePerspective || {};
  const lore = song.lore || {};
  const lyricText = getLyricText(song);
  const motifSource = [
    lore.summary,
    lore.learning_thing,
    lore.broad_game_mechanic,
    lore.relationship_lens,
    song.mood,
    lyricText
  ].filter(Boolean).join(" ");
  const stopWords = new Set([
    "the", "and", "you", "that", "with", "this", "from", "what", "dear", "papa", "your", "but", "for", "now", "are", "was", "have", "will", "our", "not", "all",
    "know", "tell", "than", "better", "didn", "don't", "dont", "when", "where", "there", "they", "them", "then", "were", "been", "being", "just", "like",
    "onto", "into", "away", "through", "some", "same", "come", "came", "goes", "going", "look", "looks", "said", "says", "make", "made", "need"
  ]);
  const motifCounts = new Map();
  cleanToken(motifSource).split(/\s+/).forEach((token) => {
    if (token.length < 5 || stopWords.has(token)) return;
    motifCounts.set(token, (motifCounts.get(token) || 0) + 1);
  });
  const motifs = [...motifCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 12)
    .map(([token, count]) => ({ token, count, source: "lyrics+lore" }));
  const sectionHooks = songEditMap.sections.map((section) => ({
    section_id: section.id,
    label: section.label,
    type: section.type,
    energy: section.energy,
    role: section.visualStrategy,
    lyricLines: section.lyricLineCount
  }));
  const visualAffordances = candidateVideos.slice(0, 12).map((video) => ({
    media_id: video.id,
    title: video.title,
    source: video.source,
    flowType: video.flowType || "unknown",
    truthStatus: video.truthStatus || "unknown",
    tags: (video.tags || []).slice(0, 8)
  }));

  return {
    schemaVersion: "hapa.echos.song-canon-affordance-graph.v1",
    character: {
      avatarId: perspective.avatar_id || perspective.avatarId || "",
      avatarName: perspective.avatar_name || perspective.avatarName || "The Operator",
      teamColor: perspective.team_color || perspective.teamColor || "",
      voiceFunction: perspective.voice_function || perspective.voiceFunction || "",
      relationshipFocus: perspective.relationship_focus || perspective.relationshipFocus || []
    },
    continuity: {
      albumId: song.albumId || "",
      trackNumber: song.trackNumber || null,
      registryTrackId: songMetadata?.registryTrackId || song.registryTrackId || "",
      loreStatus: song.loreStatus || "",
      authorship: song.authorship?.author || song.author || "",
      sourceAnchors: song.sourceAnchors || []
    },
    motifs,
    sectionHooks,
    visualAffordances,
    sceneHooks: motifs.slice(0, 6).map((motif, index) => ({
      id: `motif-scene-${index + 1}-${motif.token}`,
      motif: motif.token,
      prompt: `Use ${motif.token} as a scene continuity cue for ${song.title}.`,
      source: "lyrics+lore"
    })),
    journalPrompt: `${perspective.avatar_name || perspective.avatarName || "The Operator"} should pick scenes/cards/videos that preserve ${motifs.slice(0, 4).map((item) => item.token).join(", ") || "the recovered song lineage"} while citing registry track ${songMetadata?.registryTrackId || song.registryTrackId || "unknown"}.`
  };
}

function generateHyperframesScript(songId, songTitle, duration, timeline, visualizerTimeline, timedLyrics, lyricVariant = "phrase-window", audioId = songId, lyricPosition = "bottom-center", lyricStyle = "neon-cyan") {
  let html = `<!-- Hapa x HyperFrames Video Project Script -->\n`;
  html += `<!-- Song: ${songTitle} (${songId}) -->\n`;
  html += `<!-- Duration: ${duration} seconds -->\n\n`;
  html += `<div class="hyperframe-video-composition"\n`;
  html += `     data-width="1920"\n`;
  html += `     data-height="1080"\n`;
  html += `     data-duration="${duration}"\n`;
  html += `     style="width: 1920px; height: 1080px; position: relative; background: #020617; overflow: hidden;">\n\n`;

  html += `  <!-- Canonical Audio Track -->\n`;
  html += `  <audio src="/api/song-registry/audio/${encodeURIComponent(audioId)}"\n`;
  html += `         data-start="0"\n`;
  html += `         data-volume="1.0"></audio>\n\n`;

  html += `  <!-- Embed Lyric Timings -->\n`;
  html += `  <script>\n`;
  html += `    window.HAPA_LYRIC_TIMING = ${JSON.stringify({ lines: timedLyrics }, null, 2).split("\n").join("\n    ")};\n`;
  html += `  </script>\n\n`;

  html += `  <!-- Directed Shot Timeline -->\n`;
  timeline.forEach((shot, idx) => {
    const isVideo = shot.media_id !== "none";
    html += `  <!-- Section: ${shot.section_label} (Shot ${shot.shot_index + 1}) -->\n`;
    if (isVideo) {
      html += `  <video id="shot-${idx + 1}"\n`;
      html += `         src="${shot.media_uri}"\n`;
      html += `         data-start="${shot.start_sec}"\n`;
      html += `         data-duration="${(shot.end_sec - shot.start_sec).toFixed(1)}"\n`;
      html += `         data-transition="${shot.transition}"\n`;
      html += `         data-stems="${shot.active_stems.join(",")}"\n`;
      html += `         data-camera-motion="${shot.camera_motion || "auto"}"\n`;
      html += `         data-camera-intensity="${Number(shot.camera_intensity ?? 1).toFixed(1)}"\n`;
      html += `         data-camera-speed="${Number(shot.camera_speed ?? 1.35).toFixed(2)}"\n`;
      html += `         muted playsinline style="width: 100%; height: 100%; object-fit: cover; position: absolute; top: 0; left: 0;"></video>\n`;
    } else {
      html += `  <div id="shot-${idx + 1}"\n`;
      html += `       data-composition-id="hapa-empty-shot"\n`;
      html += `       data-start="${shot.start_sec}"\n`;
      html += `       data-duration="${(shot.end_sec - shot.start_sec).toFixed(1)}"\n`;
      html += `       data-transition="${shot.transition}"\n`;
      html += `       data-stems="${shot.active_stems.join(",")}"\n`;
      html += `       style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; background: #000;"></div>\n`;
    }
  });

  html += `\n  <!-- Parallel Visualizer Shader Timeline -->\n`;
  visualizerTimeline.forEach((vis, idx) => {
    html += `  <div id="vis-${idx + 1}"\n`;
    html += `       data-composition-id="hapa-visualizer"\n`;
    html += `       data-start="${vis.start_sec}"\n`;
    html += `       data-duration="${(vis.end_sec - vis.start_sec).toFixed(1)}"\n`;
    html += `       data-transition="${vis.transition}"\n`;
    html += `       data-shader-id="${vis.visualizer_id}"\n`;
    html += `       style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; pointer-events: none; z-index: 2;"></div>\n`;
  });

  html += `\n  <!-- Lyric Typography Layer -->\n`;
  html += `  <div class="hapa-lyric-layer"\n`;
  html += `       data-composition-id="hapa-lyric-layer"\n`;
  html += `       data-start="0"\n`;
  html += `       data-duration="${duration}"\n`;
  html += `       data-variant="${lyricVariant}"\n`;
  html += `       data-position="${lyricPosition}"\n`;
  html += `       data-style="${lyricStyle}"\n`;
  html += `       style="position: absolute; bottom: 80px; width: 100%; text-align: center; z-index: 10;"></div>\n`;

  html += `</div>\n`;
  return html;
}

const songCards = songbook.songCards || [];
let dbVideos = [];
try {
  const { DatabaseSync } = await import("node:sqlite");
  const dbPath = "/Users/calderwong/Library/Application Support/hapa-ag/persistence.db";
  if (fs.existsSync(dbPath)) {
    const db = new DatabaseSync(dbPath);
    const rows = db.prepare("SELECT id, name, parent_id, metadata_json FROM cards WHERE metadata_json LIKE '%representativeMediaLocalPath%'").all();
    for (const row of rows) {
      try {
        let current = row;
        let visited = new Set([current.id]);
        let hasValidParent = true;
        while (current.parent_id && current.parent_id !== "0" && current.parent_id !== "1" && !visited.has(current.parent_id)) {
          const parentRow = db.prepare("SELECT id, name, parent_id, metadata_json FROM cards WHERE id = ? AND is_deleted = 0").get(current.parent_id);
          if (parentRow) {
            visited.add(parentRow.id);
            current = parentRow;
          } else {
            hasValidParent = false;
            break;
          }
        }
        if (!hasValidParent) {
          continue;
        }

        const meta = JSON.parse(row.metadata_json);
        const videoPath = meta.representativeMediaLocalPath;
        if (videoPath && fs.existsSync(videoPath)) {
          let hashSum = 0;
          for (let i = 0; i < row.id.length; i++) {
            hashSum += row.id.charCodeAt(i);
          }
          const teamPool = hashSum % 3;
          let tags = ["hapa-dev-proto-card", "video"];
          let colorPalette = [];

          if (teamPool === 0) {
            tags.push("cyber-operator", "simulation-framework");
            colorPalette.push("#ff0055", "#990000");
          } else if (teamPool === 1) {
            tags.push("digital-isolation", "glitch-lines");
            colorPalette.push("#0055ff", "#002266");
          } else {
            tags.push("camera-push-in", "browser-playback");
            colorPalette.push("#10b981", "#06b6d4");
          }

          dbVideos.push({
            id: row.id,
            title: row.name || meta.name || row.id,
            source: "hapa_dev_proto_card",
            sourceId: row.id,
            uri: `/api/local-file?path=${encodeURIComponent(videoPath)}`,
            thumbnailUri: meta.thumbnail || "",
            duration: meta.duration || 6.0,
            tags: tags,
            colorPalette: colorPalette,
            truthStatus: "generated_placeholder",
            truth: {
              mediaPath: "verified_local_file",
              duration: meta.duration ? "source_declared" : "generated_default",
              tags: "generated_placeholder",
              colorPalette: "generated_placeholder",
              flowType: "generated_placeholder"
            },
            classificationSource: "deterministic-card-id-placeholder",
            flowType: "loop"
          });
        }
      } catch (e) {
        // ignore individual issues
      }
    }
    console.log(`Successfully loaded ${dbVideos.length} custom video cards from persistence.db`);
  }
} catch (e) {
  console.warn("Failed to load node:sqlite or query persistence.db:", e);
}

function isPlayableDirectorCandidate(video) {
  const tags = new Set((video?.tags || []).map((tag) => String(tag).toLowerCase()));
  if (!String(video?.uri || "").trim()) return false;
  if (tags.has("media-file-invalid") || tags.has("technical-ffprobe-failed") || tags.has("missing-source-file")) return false;
  return Number(video?.duration || 0) > 0;
}

const rejectedUnplayableVideos = [...(gapsReport.videos || []), ...dbVideos].filter((video) => !isPlayableDirectorCandidate(video));
const videos = [...(gapsReport.videos || []), ...dbVideos].filter(isPlayableDirectorCandidate);
if (rejectedUnplayableVideos.length) {
  console.warn(`Excluded ${rejectedUnplayableVideos.length} unplayable media candidates before director selection.`);
}
const plannedOutputs = [];

console.log(`Compiling music video plans for ${songCards.length} songs in ${APPLY_MUTATIONS ? "apply" : "dry-run"} mode...`);
if (!APPLY_MUTATIONS) {
  console.log("Dry run only. Use --apply or HAPA_ECHOS_APPLY=1 to write director project files.");
}

songCards.forEach((song, idx) => {
  const songId = song.id || `song_${idx}`;
  const songTitle = song.title || "Untitled Hapa Track";
  const songMetadata = findSongMetadata(song);
  const registryTrackId = songMetadata?.registryTrackId || song.registryTrackId || song.songId || songId;
  const audioId = registryTrackId || songId;
  const stemsAvailable = (songMetadata?.stems || []).map((stem) => stem.kind || stem.title || stem.id).filter(Boolean);
  const perspective = song.performancePerspective?.team_color || "red";
  const duration = songMetadata?.duration || Number(song.duration || song.audio?.duration || 0) || 180.0;
  const hash = getSimpleHash(songId);
  const songEditMap = buildSongEditMap(song, songMetadata, duration);
  const sections = songEditMap.sections;
  const timedLyrics = songEditMap.timedLyrics;

  // Current tags/colors are generated placeholders, so they are not semantic evidence.
  // Keep the full playable pool and mark the semantic dimension unmeasured.
  const candidateVideos = videos;

  const canonAffordanceGraph = buildCanonAffordanceGraph(song, songMetadata, songEditMap, candidateVideos);
  const localSpine = song.narrativeSpine
    || song.lore?.summary
    || `${canonAffordanceGraph.character.avatarName} carries ${songTitle} through ${canonAffordanceGraph.motifs.slice(0, 4).map((item) => item.token).join(", ") || "recovered Dear Papa continuity"}.`;

  // Build the timeline segment EDL (dense clip selection)
  const timeline = [];
  let timelineCursor = 0;
  sections.forEach((sec, secIdx) => {
    const secStart = timeline.length ? timelineCursor : Number(sec.start.toFixed(1));
    const secEnd = secIdx === sections.length - 1
      ? Number(duration.toFixed(1))
      : Math.max(secStart, Number(sec.end.toFixed(1)));
    let secTime = secStart;
    let shotIdx = 0;

    while (secTime < secEnd) {
      const secHash = getSimpleHash(`${songId}_${secIdx}_${shotIdx}`);
      let remainingTime = Number((secEnd - secTime).toFixed(1));
      if (remainingTime < 0.1) break;

      // 75% video, 25% pure visualizer
      const isPureVisualizer = (secHash % 4 === 0) && sec.type !== "intro" && sec.type !== "outro";

      // Modulate shot duration based on section energy to pick more videos and vary pacing
      const energyFactor = sec.energy || 0.5;
      const baseMin = 2.0 + (1.0 - energyFactor) * 3.5; // 2.0s (high energy) to 5.5s (low energy)
      const baseMax = 3.5 + (1.0 - energyFactor) * 5.0; // 3.5s (high energy) to 8.5s (low energy)
      const range = baseMax - baseMin;
      let durationSelected = baseMin + ((secHash % 100) / 100) * range;

      let mediaId = "none";
      let mediaTitle = "Visualizer Only";
      let mediaUri = "";
      let mediaThumbnail = "";
      let selectedVideo = null;

      if (!isPureVisualizer && candidateVideos.length > 0) {
        const videoIndex = secHash % candidateVideos.length;
        selectedVideo = candidateVideos[videoIndex];
        if (selectedVideo) {
          mediaId = selectedVideo.id;
          mediaTitle = selectedVideo.title;
          mediaUri = selectedVideo.uri || "";
          mediaThumbnail = selectedVideo.thumbnailUri || "";

          // CRITICAL: Ensure timeline shot duration never exceeds the video's actual length.
          const videoDuration = Number(selectedVideo.duration || 0);
          if (videoDuration > 0) {
            durationSelected = Math.min(durationSelected, videoDuration);
          }
        }
      }

      let shotDuration = Math.min(durationSelected, remainingTime);
      shotDuration = Number(shotDuration.toFixed(1));

      // Absorb small remainders if it doesn't violate video duration cap
      if (remainingTime - shotDuration < 1.0) {
        const videoDuration = selectedVideo ? Number(selectedVideo.duration || 0) : 0;
        if (!selectedVideo || videoDuration <= 0 || remainingTime <= videoDuration) {
          shotDuration = remainingTime;
        }
      }

      const shotEnd = Number((secTime + shotDuration).toFixed(1));

      // Choose transition
      let transition = "cut";
      if (secTime === 0) {
        transition = "fade-in";
      } else if (shotEnd >= duration - 0.5) {
        transition = "fade-out";
      } else if (secHash % 3 === 0) {
        transition = "crossfade";
      } else if (secHash % 3 === 1) {
        transition = "scanline-dissolve";
      }

      const activeStems = chooseActiveStems(sec, stemsAvailable);
      if (!activeStems.length) activeStems.push("Vocals");

      // Audio bindings
      const audioBindings = [];
      if (activeStems.includes("Bass")) {
        audioBindings.push({
          source: "bass_stem_energy",
          target: "distortion_level",
          curve: "ease_out"
        });
      }
      if (activeStems.includes("Vocals")) {
        audioBindings.push({
          source: "vocals_stem_energy",
          target: "vibe_intensity",
          curve: "linear"
        });
      }
      if (activeStems.includes("Drums")) {
        audioBindings.push({
          source: "drums_stem_energy",
          target: "pulse_frequency",
          curve: "ease_in"
        });
      }
      if (!audioBindings.length) {
        audioBindings.push({
          source: "section_energy",
          target: "visual_intensity",
          curve: "linear"
        });
      }

      const editReason = isPureVisualizer
        ? `Pure visualizer interval selected by deterministic cadence in ${sec.label}; musical-fit judgment is unmeasured. Active stems: ${activeStems.join(", ")}.`
        : `Use ${mediaTitle} in ${sec.label}; selection is deterministic from the available media pool, not a verified ${perspective} mood match. Apply transition: ${transition}.`;
      const cameraMove = chooseCameraMotion(sec, shotIdx, selectedVideo, isPureVisualizer);
      const rejectedAlternatives = candidateVideos
        .filter((video) => video.id !== mediaId)
        .slice(0, 4)
        .map((video) => ({ mediaId: video.id, title: video.title, reason: "not-selected-by-deterministic-variant-order; semantic preference unmeasured" }));

      timeline.push({
        section_id: sec.id,
        section_label: sec.label,
        section_type: sec.type,
        shot_index: shotIdx,
        start_sec: Number(secTime.toFixed(1)),
        end_sec: Number(shotEnd.toFixed(1)),
        media_id: mediaId,
        media_title: mediaTitle,
        media_uri: mediaUri,
        media_thumbnail: mediaThumbnail,
        transition: transition,
        camera_motion: cameraMove.camera_motion,
        camera_intensity: cameraMove.camera_intensity,
        camera_speed: cameraMove.camera_speed,
        camera_focus: "center",
        active_stems: activeStems,
        audio_bindings: audioBindings,
        edit_reason: editReason,
        confidence: null,
        confidence_basis: "unmeasured-no-human-or-semantic-evaluation",
        decision_evidence: {
          schemaVersion: "hapa.echo.shot-decision-evidence.v2",
          truthStatus: selectedVideo?.truthStatus || (isPureVisualizer ? "deterministic-visualizer-cadence" : "unmeasured"),
          scoreComponents: {
            sectionBoundary: { value: true, basis: `song_edit_map.sections:${sec.id}` },
            durationFit: { value: selectedVideo?.duration ? shotDuration <= Number(selectedVideo.duration) : null, basis: selectedVideo?.duration ? "source-declared-duration" : "unmeasured" },
            semanticMusicMatch: { value: null, basis: "unmeasured" },
            emotionalArc: { value: null, basis: "unmeasured" },
            continuity: { value: null, basis: "unmeasured" }
          },
          evidence: [`section:${sec.id}`, `transition:${transition}`, `active-stems:${activeStems.join("|") || "none"}`],
          rejectedAlternatives,
          confidence: { value: null, basis: "unmeasured-no-human-or-semantic-evaluation" }
        }
      });

      secTime = shotEnd;
      shotIdx++;
    }
    timelineCursor = timeline.length ? timeline[timeline.length - 1].end_sec : secEnd;
  });

  // Build parallel visualizer timeline (decoupled)
  const visualizerTimeline = [];
  let visTime = 0;
  let visIdx = 0;
  while (visTime < duration) {
    const visHash = hash + visIdx;
    let visDuration = 15.0 + (visHash % 15); // 15s to 30s blocks for visualizer continuity
    let remaining = duration - visTime;
    if (remaining < 0.1) break;

    let blockDuration = Math.min(visDuration, remaining);
    if (remaining - blockDuration < 5.0) {
      blockDuration = remaining; // Absorb short endings
    }
    blockDuration = Number(blockDuration.toFixed(1));
    const visEnd = Number((visTime + blockDuration).toFixed(1));

    // Choose visualizer id and title from shaders catalog
    let chosenShader = { id: "none", title: "None" };
    if (shaders.length > 0) {
      chosenShader = shaders[visHash % shaders.length];
    }

    let visTransition = "cut";
    if (visTime > 0) {
      visTransition = visHash % 2 === 0 ? "crossfade" : "scanline-dissolve";
    }

    visualizerTimeline.push({
      start_sec: Number(visTime.toFixed(1)),
      end_sec: Number(visEnd.toFixed(1)),
      visualizer_id: chosenShader.id || "none",
      visualizer_title: chosenShader.title || "None",
      transition: visTransition,
      edit_reason: `Maintain shader continuity with ${chosenShader.title || "preset"} visualizer layer across media boundaries.`
    });

    visTime = visEnd;
    visIdx++;
  }

  // Calculate scores
  const criticScores = {
    song_structure_alignment: null,
    emotional_arc: null,
    visual_variety: null,
    continuity: null,
    overcutting_risk: null
  };

  // Compile justification log paragraphs
  const localAvatar = song.performancePerspective?.avatar_name || "The Operator";
  const mainVideo = timeline.find(t => t.media_id !== "none")?.media_title || "Primary Clip";
  const mainShader = visualizerTimeline.find(t => t.visualizer_id !== "none")?.visualizer_title || "Visualizer Presets";

  const journalLog = [
    `Project Treatment: "${songTitle}" is cued from the ${perspective.toUpperCase()} perspective, sung by ${localAvatar} to explore the themes of ${song.lore?.summary || "recovered soft canon"}. The narrative is structured as ${sections.length} lyric/audio-derived sections across ${duration} seconds, using ${songEditMap.audioTelemetry.lyricLineCount} lyric lines and ${songEditMap.audioTelemetry.stemCount} registry stems.`,
    `Media Casting & Aesthetics: "${mainVideo}" is the current deterministic visual anchor. Existing source tags and color lanes are generated placeholders, so semantic music/motif fit remains unmeasured until media affordances or human judgment provide evidence.`,
    `Visualizer & Audio Reactivity: The visualizer "${mainShader}" was chosen to support the section energy curve. Active stem bindings are pulled from available registry stems (${stemsAvailable.slice(0, 8).join(", ") || "none listed"}), while lyric timing comes from ${songEditMap.provenance.lyricTimingSource === "dear-papa-playlist-lyric-timing" ? "the exact Dear Papa playlist timing sidecar for this registry track" : "the block/line fallback map rather than a fixed percentage template"}.`
  ];

  const totalVideos = timeline.filter(t => t.media_id !== "none").length;
  const totalVisualizers = visualizerTimeline.filter(t => t.visualizer_id !== "none").length;
  const videosPerSec = totalVideos / duration;
  const visualizersPerSec = totalVisualizers / duration;
  const mediaDensityTelemetry = {
    total_videos: totalVideos,
    total_visualizers: totalVisualizers,
    videos_per_sec: Number(videosPerSec.toFixed(4)),
    visualizers_per_sec: Number(visualizersPerSec.toFixed(4))
  };
  const lyricTimingProvenance = songEditMap.provenance || {};
  const lyricTimingStrategy = lyricTimingProvenance.lyricTimingStrategy || "weighted-phrase-split-full-song-arc";
  const lyricTimingSource = lyricTimingProvenance.lyricTimingSource || "weighted-phrase-split-full-song-arc";
  const lyricTimingPath = lyricTimingProvenance.lyricTimingPath || "";
  const lyricTimingRegistryTrackId = lyricTimingProvenance.lyricTimingRegistryTrackId || registryTrackId || audioId || "";

  const projectPlan = {
    music_video_project: {
      song_id: songId,
      song_title: songTitle,
      audio_id: audioId,
      registry_track_id: registryTrackId,
      audio_uri: songMetadata?.audioUri || `/api/song-registry/audio/${encodeURIComponent(audioId)}`,
      cover_uri: songMetadata?.coverUri || "",
      perspective: perspective,
      avatar_name: localAvatar,
      duration: duration,
      stems_available: stemsAvailable,
      local_spine: localSpine,
      song_edit_map: songEditMap,
      canon_affordance_graph: canonAffordanceGraph,
      lyric_variant: "phrase-window",
      lyric_position: "bottom-center",
      lyric_style: "neon-cyan",
      lyric_timing_heal: {
        schemaVersion: "hapa.echos.lyric-timing-heal.v1",
        source: SCRIPT_NAME,
        strategy: lyricTimingStrategy,
        timingSource: lyricTimingSource,
        timingPath: lyricTimingPath,
        registryTrackId: lyricTimingRegistryTrackId,
        rejectedExactTiming: lyricTimingProvenance.lyricTimingRejectedExact || null,
        generatedAt: GENERATED_AT,
        lineCount: timedLyrics.length,
        lastLyricEnd: timedLyrics.length ? timedLyrics[timedLyrics.length - 1].end : 0
      },
      media_density_telemetry: mediaDensityTelemetry,
      timeline: timeline,
      visualizer_timeline: visualizerTimeline,
      timed_lyrics: timedLyrics,
      critic_scores: criticScores,
      critic_assessment: {
        schemaVersion: "hapa.echo.critic-assessment.v2",
        status: "unmeasured",
        basis: "No measured critic fixture or recorded human judgment is attached; hashes are identity/cache tools only.",
        dimensions: Object.fromEntries(Object.keys(criticScores).map((dimension) => [dimension, { value: null, status: "unmeasured", basis: "no-measured-evidence" }]))
      },
      justification_log: journalLog,
      hyperframe_script: generateHyperframesScript(songId, songTitle, duration, timeline, visualizerTimeline, timedLyrics, "phrase-window", audioId, "bottom-center", "neon-cyan"),
      provenance: {
        status: "generated_placeholder",
        source: SCRIPT_NAME,
        runId: RUN_ID,
        generatedAt: GENERATED_AT,
        mutationMode: APPLY_MUTATIONS ? "apply" : "dry-run"
      },
      updated_at: GENERATED_AT
    }
  };

  const filePath = path.join(PROJECTS_DIR, `${songId}-video-project.json`);
  plannedOutputs.push({ filePath, songId, title: songTitle });
  if (APPLY_MUTATIONS) {
    fs.writeFileSync(filePath, JSON.stringify(projectPlan, null, 2), "utf-8");
  }
});

if (APPLY_MUTATIONS) {
  console.log(`Successfully generated plans for ${plannedOutputs.length} songs under: ${PROJECTS_DIR}`);
} else {
  console.log(`Dry run complete. Would generate ${plannedOutputs.length} plans under: ${PROJECTS_DIR}`);
  plannedOutputs.slice(0, 5).forEach((output) => {
    console.log(`- ${output.songId}: ${output.title}`);
  });
}
