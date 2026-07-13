import fs from "fs";
import path from "path";

const DATA_DIR = "./data";
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const HAPA_SONG_STORE_PATH = path.join(DATA_DIR, "hapa-songs-store.json");
const GAPS_REPORT_PATH = path.join(DATA_DIR, "echos-gaps-report.json");
const SCRIPT_NAME = "scripts/heal-echos-director-motion-lyrics.mjs";
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const UPDATED_AT = new Date().toISOString();
const args = new Set(process.argv.slice(2));
const APPLY_MUTATIONS = args.has("--apply") || process.env.HAPA_ECHOS_APPLY === "1";
const REFRESH_CAMERA = args.has("--refresh-camera") || args.has("--force-camera") || process.env.HAPA_ECHOS_REFRESH_CAMERA === "1";
const MIN_EXACT_TIMING_COVERAGE = 0.9;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function getLyricText(song) {
  return song?.lyrics?.text || song?.lyricsText || "";
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

function cleanToken(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9'\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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

function labelForSection(type, seenCounts) {
  seenCounts[type] = (seenCounts[type] || 0) + 1;
  if (type === "intro" || type === "outro" || type === "bridge") {
    return seenCounts[type] === 1 ? type.replace(/^./, (c) => c.toUpperCase()) : `${type.replace(/^./, (c) => c.toUpperCase())} ${seenCounts[type]}`;
  }
  return `${type.replace(/^./, (c) => c.toUpperCase())} ${seenCounts[type]}`;
}

function normalizeTimedWords(words = [], lineStart, lineEnd) {
  if (!Array.isArray(words)) return [];
  return words
    .map((word, index) => ({
      word: String(word.word || word.text || word.token || ""),
      start: Number(Number(word.start ?? lineStart).toFixed(3)),
      end: Number(Number(word.end ?? lineEnd).toFixed(3)),
      matched: word.matched ?? undefined,
      index: Number(word.index ?? index)
    }))
    .filter((word) => word.word && Number.isFinite(word.start) && Number.isFinite(word.end));
}

function normalizeExternalTimedLyrics(timings = [], duration = 0) {
  if (!Array.isArray(timings)) return [];
  return timings
    .map((line, index) => {
      const start = Number(line.start ?? line.startTime ?? line.t0 ?? 0);
      const end = Number(line.end ?? line.endTime ?? line.t1 ?? start);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
      const clampedStart = Number(clamp(start, 0, duration || Math.max(end, start)).toFixed(3));
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

function sectionEnergy(type, lineDensity, index, total) {
  const base = { intro: 0.28, verse: 0.5, chorus: 0.84, bridge: 0.64, outro: 0.24 };
  const arc = total > 1 ? (index / (total - 1)) * 0.1 : 0;
  return Number(clamp((base[type] ?? 0.5) + lineDensity * 0.12 + arc, 0.12, 0.95).toFixed(2));
}

function buildSectionsFromTimedLyrics(timedLyrics = [], duration = 0) {
  const sections = [];
  const lines = timedLyrics.filter((line) => Number.isFinite(Number(line.start)) && Number.isFinite(Number(line.end)));
  if (!lines.length) {
    return [{ id: "full_song_1", type: "instrumental", label: "Full Song", start: 0, end: duration, lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: 0.35, visualStrategy: "instrumental full-duration treatment" }];
  }

  const firstStart = Number(lines[0].start || 0);
  if (firstStart > 0.25) {
    sections.push({ id: "intro_1", type: "intro", label: "Intro / Pre-vocal", start: 0, end: Number(firstStart.toFixed(2)), lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: 0.2, visualStrategy: "establish tone before first timed vocal" });
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

  const seen = {};
  groups.forEach((group, index) => {
    const type = typeForTimedSection(group.label, index, groups.length);
    seen[type] = (seen[type] || 0) + 1;
    const id = `${type}_${seen[type]}`;
    const start = Number(Math.min(...group.lines.map((line) => Number(line.start))).toFixed(2));
    const end = Number(Math.max(...group.lines.map((line) => Number(line.end))).toFixed(2));
    const wordCount = group.lines.reduce((sum, line) => sum + (line.words?.length || String(line.text || "").split(/\s+/).filter(Boolean).length), 0);
    const lineDensity = group.lines.length / Math.max(1, end - start);
    const vocalDensity = lineDensity > 0.5 ? "high" : lineDensity > 0.22 ? "medium" : "low";
    sections.push({
      id,
      type,
      label: group.label || labelForSection(type, seen),
      start,
      end,
      lyricLineCount: group.lines.length,
      wordCount,
      vocalDensity,
      energy: sectionEnergy(type, lineDensity, index, groups.length),
      visualStrategy: "registry-timed vocal section from Dear Papa playlist timing sidecar"
    });
    group.lines.forEach((line) => {
      line.section_id = line.section_id || id;
      line.section_label = line.section_label || group.label || id;
    });
  });

  const lastEnd = Number(lines[lines.length - 1].end || 0);
  if (duration - lastEnd > 0.25) {
    sections.push({ id: "outro_1", type: "outro", label: "Outro / Ringout", start: Number(lastEnd.toFixed(2)), end: Number(duration.toFixed(2)), lyricLineCount: 0, wordCount: 0, vocalDensity: "none", energy: 0.18, visualStrategy: "ringout after final timed vocal" });
  }
  return sections;
}

function makeEditPulses(timedLyrics = []) {
  return timedLyrics.map((line, index) => ({
    t: line.start,
    kind: index % 4 === 0 ? "lyric-downbeat-candidate" : "lyric-edit-pulse",
    strength: Number(clamp(0.52 + (line.words?.length || 1) * 0.018, 0.55, 0.92).toFixed(2)),
    source: "lyric-line-start"
  }));
}

function timedLyricsWordCount(timedLyrics = []) {
  return timedLyrics.reduce((sum, line) => sum + (line.words?.length || String(line.text || "").split(/\s+/).filter(Boolean).length), 0);
}

function timedLyricsLastEnd(timedLyrics = []) {
  return timedLyrics.reduce((max, line) => Math.max(max, Number(line.end ?? line.end_sec ?? line.t1 ?? 0) || 0), 0);
}

function exactTimingRejectReason(timedLyrics = [], duration = 0, songMetadata = null, project = null) {
  const timingPath = String(songMetadata?.lyricTimingPath || songMetadata?.lyricTimingSource?.path || "").trim();
  if (!timingPath) {
    return {
      reason: "missing-timing-source-path",
      timingPath: ""
    };
  }
  const expectedRegistryTrackId = String(project?.registry_track_id || project?.audio_id || songMetadata?.registryTrackId || "").trim();
  const timingRegistryTrackId = String(songMetadata?.lyricTimingRegistryTrackId || songMetadata?.lyricTimingSource?.registryTrackId || "").trim();
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
  const coverage = duration > 0 ? lastEnd / duration : 1;
  if (duration > 0 && coverage < MIN_EXACT_TIMING_COVERAGE) {
    return {
      reason: "partial-exact-timing-coverage",
      coverage: Number(coverage.toFixed(3)),
      lastLyricEnd: Number(lastEnd.toFixed(3)),
      duration: Number(duration.toFixed(3)),
      minimumCoverage: MIN_EXACT_TIMING_COVERAGE,
      expectedRegistryTrackId,
      timingRegistryTrackId,
      timingPath: songMetadata?.lyricTimingPath || songMetadata?.lyricTimingSource?.path || ""
    };
  }
  return null;
}

function buildHealedLyrics(song, project, songMetadata = null) {
  const duration = Number(project.duration || 0);
  const externalTimedLyrics = normalizeExternalTimedLyrics(songMetadata?.lyricTimings || [], duration);
  if (externalTimedLyrics.length) {
    const rejectExactTiming = exactTimingRejectReason(externalTimedLyrics, duration, songMetadata, project);
    if (!rejectExactTiming) {
      const timingRegistryTrackId = songMetadata?.lyricTimingRegistryTrackId || songMetadata?.lyricTimingSource?.registryTrackId || "";
      return {
        lines: externalTimedLyrics,
        source: "dear-papa-playlist-lyric-timing",
        strategy: "exact-registry-track-lyric-timing",
        timingPath: songMetadata?.lyricTimingPath || songMetadata?.lyricTimingSource?.path || "",
        timingConfidence: songMetadata?.lyricTimingSource?.confidence ?? null,
        timingRegistryTrackId,
        rejectedExactTiming: null
      };
    }
    songMetadata = {
      ...(songMetadata || {}),
      rejectedExactTiming: rejectExactTiming
    };
  }

  const blocks = parseLyricBlocks(song);
  if (!duration || !blocks.length) {
    return {
      lines: Array.isArray(project.timed_lyrics) ? project.timed_lyrics : [],
      source: "existing-project-timed-lyrics",
      strategy: "existing-project-timed-lyrics",
      timingPath: "",
      timingConfidence: null
    };
  }

  const singingStart = Number(Math.min(6, duration * 0.035).toFixed(2));
  const singingEnd = Number(Math.max(
    singingStart + 1,
    Math.min(duration - 0.5, Math.max(duration * 0.985, duration - 3))
  ).toFixed(2));
  const singingDuration = Math.max(1, singingEnd - singingStart);
  const blockWeights = blocks.map((lines) => lines.reduce((sum, line) => (
    sum + Math.max(1, line.split(/\s+/).filter(Boolean).length)
  ), 0));
  const totalBlockWeight = blockWeights.reduce((sum, weight) => sum + weight, 0) || 1;
  const seenCounts = {};
  const timed = [];
  let cursor = singingStart;

  blocks.forEach((lines, blockIndex) => {
    const type = sectionTypeForBlock(lines, blockIndex, blocks.length, project.song_title || "");
    const label = labelForSection(type, seenCounts);
    const sectionId = `${type}_${seenCounts[type]}`;
    const blockDuration = blockIndex === blocks.length - 1
      ? singingEnd - cursor
      : singingDuration * (blockWeights[blockIndex] / totalBlockWeight);
    const blockStart = cursor;
    const blockEnd = Number(Math.min(singingEnd, blockStart + blockDuration).toFixed(2));
    const lineWeights = lines.map((text) => {
      const count = text.split(/\s+/).filter(Boolean).length;
      const pauseLift = /[,;:!?…)]$/.test(text.trim()) ? 1.2 : 0;
      return clamp(count + pauseLift, 2.5, 12);
    });
    const totalLineWeight = lineWeights.reduce((sum, weight) => sum + weight, 0) || 1;
    let lineCursor = blockStart;

    lines.forEach((text, lineIndex) => {
      const lineSlot = lineIndex === lines.length - 1
        ? Math.max(0.45, blockEnd - lineCursor)
        : Math.max(0.45, (blockEnd - blockStart) * (lineWeights[lineIndex] / totalLineWeight));
      const lineStart = Number(lineCursor.toFixed(2));
      const lineEnd = Number(Math.min(blockEnd, lineCursor + Math.max(0.45, lineSlot * 0.92)).toFixed(2));
      const words = text.split(/\s+/).filter(Boolean).map((word, wordIdx, wordArr) => {
        const wordDuration = Math.max(0.08, (lineEnd - lineStart) / Math.max(1, wordArr.length));
        const wordStart = lineStart + wordIdx * wordDuration;
        return {
          word,
          start: Number(wordStart.toFixed(2)),
          end: Number(Math.min(lineEnd, wordStart + wordDuration * 0.92).toFixed(2))
        };
      });
      timed.push({
        text,
        start: lineStart,
        end: lineEnd,
        section_id: sectionId,
        section_label: label,
        words
      });
      lineCursor = Math.min(blockEnd, lineCursor + lineSlot);
    });
    cursor = blockEnd;
  });

  return {
    lines: timed,
    source: "synthetic-weighted-lyric-heal",
    strategy: songMetadata?.rejectedExactTiming
      ? "weighted-phrase-split-full-song-arc-after-exact-timing-rejected"
      : "weighted-phrase-split-full-song-arc",
    timingPath: "",
    timingConfidence: null,
    rejectedExactTiming: songMetadata?.rejectedExactTiming || null
  };
}

function chooseCameraMotion(shot, shotIdx, video) {
  if (shot.camera_motion && !REFRESH_CAMERA) {
    return {
      camera_motion: shot.camera_motion,
      camera_intensity: Number(shot.camera_intensity ?? 1),
      camera_speed: Number(shot.camera_speed ?? 1.35)
    };
  }
  if (!shot.media_id || shot.media_id === "none" || !video) {
    return { camera_motion: "static", camera_intensity: 0, camera_speed: 1 };
  }
  const tags = video.tags || [];
  const text = [video.id, video.title, video.flowType, video.objectiveSummary, video.narrativeSummary, ...tags].filter(Boolean).join(" ").toLowerCase();
  const sectionLabel = String(shot.section_label || "");
  const sectionType = String(shot.section_type || "");
  const cameraSpeed = Number(clamp(1.2 + ((shotIdx * 13 + sectionLabel.length) % 8) * 0.12 + (sectionType === "chorus" ? 0.22 : 0), 1.15, 2.2).toFixed(2));
  if (/vertical|portrait|tarot|portrait-framing/.test(text)) {
    const verticalSequence = ["pan-down", "pan-up", "pan-down-left", "pan-up-right", "pan-down", "pan-up-left", "pan-up", "pan-down-right"];
    return {
      camera_motion: verticalSequence[shotIdx % verticalSequence.length],
      camera_intensity: 1.25,
      camera_speed: Math.min(2.25, Number((cameraSpeed + 0.15).toFixed(2)))
    };
  }
  if (sectionType === "chorus") {
    return {
      camera_motion: ["pan-down", "pan-up", "pan-down-right", "pan-up-left"][shotIdx % 4],
      camera_intensity: 1.35,
      camera_speed: cameraSpeed
    };
  }
  if (sectionType === "bridge") return { camera_motion: shotIdx % 2 === 0 ? "pan-up-right" : "pan-down-left", camera_intensity: 1.05, camera_speed: cameraSpeed };
  const sequence = ["pan-down", "pan-up", "pan-up-left", "pan-down-right", "slow-push-in", "pan-up-right", "pan-down-left", "handheld-float"];
  return {
    camera_motion: sequence[shotIdx % sequence.length],
    camera_intensity: Number((1.0 + ((shotIdx + sectionLabel.length) % 4) * 0.12).toFixed(1)),
    camera_speed: cameraSpeed
  };
}

function generateHyperframesScript(project) {
  const songId = project.song_id;
  const audioId = project.audio_id || project.registry_track_id || songId;
  const duration = project.duration;
  let html = `<!-- Hapa x HyperFrames Video Project Script -->\n`;
  html += `<!-- Song: ${project.song_title} (${songId}) -->\n`;
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
  html += `    window.HAPA_LYRIC_TIMING = ${JSON.stringify({ lines: project.timed_lyrics || [] }, null, 2).split("\n").join("\n    ")};\n`;
  html += `  </script>\n\n`;
  html += `  <!-- Directed Shot Timeline -->\n`;
  (project.timeline || []).forEach((shot, idx) => {
    const isVideo = shot.media_id !== "none";
    html += `  <!-- Section: ${shot.section_label} (Shot ${shot.shot_index + 1}) -->\n`;
    if (isVideo) {
      html += `  <video id="shot-${idx + 1}"\n`;
      html += `         src="${shot.media_uri}"\n`;
      html += `         data-start="${shot.start_sec}"\n`;
      html += `         data-duration="${(shot.end_sec - shot.start_sec).toFixed(1)}"\n`;
      html += `         data-transition="${shot.transition}"\n`;
      html += `         data-stems="${(shot.active_stems || []).join(",")}"\n`;
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
      html += `       data-stems="${(shot.active_stems || []).join(",")}"\n`;
      html += `       style="width: 100%; height: 100%; position: absolute; top: 0; left: 0; background: #000;"></div>\n`;
    }
  });
  html += `\n  <!-- Parallel Visualizer Shader Timeline -->\n`;
  (project.visualizer_timeline || []).forEach((vis, idx) => {
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
  html += `       data-variant="${project.lyric_variant || "phrase-window"}"\n`;
  html += `       data-position="${project.lyric_position || "bottom-center"}"\n`;
  html += `       data-style="${project.lyric_style || "neon-cyan"}"\n`;
  html += `       style="position: absolute; bottom: 80px; width: 100%; text-align: center; z-index: 10;"></div>\n`;
  html += `</div>\n`;
  return html;
}

if (!fs.existsSync(PROJECTS_DIR)) {
  console.error(`Director projects not found at ${PROJECTS_DIR}`);
  process.exit(1);
}

const songbook = fs.existsSync(SONGBOOK_PATH)
  ? JSON.parse(fs.readFileSync(SONGBOOK_PATH, "utf8"))
  : { songCards: [] };
const songsById = new Map((songbook.songCards || []).map((song) => [song.id, song]));
const songsStore = fs.existsSync(HAPA_SONG_STORE_PATH)
  ? JSON.parse(fs.readFileSync(HAPA_SONG_STORE_PATH, "utf8"))
  : { songs: [] };
const songMetadataByKey = new Map();
(songsStore.songs || songsStore.songCards || []).forEach((song) => {
  const registryTrackId = song.audio?.registryTrackId || song.registryTrackId || song.lineage?.registryTrackId || "";
  const metadata = {
    id: song.id || song.cardId || song.songId,
    cardId: song.cardId || song.id,
    songId: song.songId,
    title: song.title,
    albumId: song.albumId,
    registryTrackId,
    duration: Number(song.audio?.duration || song.duration || 0),
    stems: Array.isArray(song.stems) ? song.stems : [],
    lyricTimings: Array.isArray(song.lyricTimings) ? song.lyricTimings : [],
    lyricTimingSource: song.lyricTimingSource || null,
    lyricTimingRegistryTrackId: song.lyricTimingSource?.registryTrackId || song.lineage?.lyricTimingRegistryTrackId || "",
    lyricTimingPath: song.lineage?.lyricTimingPath || song.lyricTimingSource?.path || ""
  };
  [registryTrackId, song.id, song.cardId, song.songId].filter(Boolean).forEach((key) => {
    songMetadataByKey.set(String(key), metadata);
  });
});

function findSongMetadata(song = {}, project = {}) {
  const expectedRegistryTrackId = project.registry_track_id
    || project.audio_id
    || song.registryTrackId
    || song.lineage?.registryTrackId
    || "";
  const keys = [
    expectedRegistryTrackId,
    song.registryTrackId,
    song.lineage?.registryTrackId,
    song.id,
    song.cardId,
    song.songId
  ].filter(Boolean);
  for (const key of keys) {
    const metadata = songMetadataByKey.get(String(key));
    if (!metadata) continue;
    if (expectedRegistryTrackId && metadata.registryTrackId && metadata.registryTrackId !== expectedRegistryTrackId) continue;
    return metadata;
  }
  return null;
}
const gapsReport = fs.existsSync(GAPS_REPORT_PATH)
  ? JSON.parse(fs.readFileSync(GAPS_REPORT_PATH, "utf8"))
  : { videos: [] };
const videoMap = new Map((gapsReport.videos || []).map((video) => [video.id, video]));

if (APPLY_MUTATIONS) {
  const backupDir = path.join(DATA_DIR, "backups", `echos-director-motion-lyrics-${RUN_ID}`);
  fs.mkdirSync(path.dirname(backupDir), { recursive: true });
  fs.cpSync(PROJECTS_DIR, backupDir, { recursive: true });
  console.log(`Backed up existing director projects to: ${backupDir}`);
} else {
  console.log("Dry run only. Use --apply or HAPA_ECHOS_APPLY=1 to write healed director projects.");
}

const files = fs.readdirSync(PROJECTS_DIR).filter((file) => file.endsWith(".json"));
let updated = 0;
let lyricLinesBefore = 0;
let lyricLinesAfter = 0;
let cameraShots = 0;
let exactTimingProjects = 0;
let syntheticTimingProjects = 0;

files.forEach((file) => {
  const filePath = path.join(PROJECTS_DIR, file);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const project = payload.music_video_project;
  if (!project?.song_id) return;
  const song = songsById.get(project.song_id);
  const songMetadata = song ? findSongMetadata(song, project) : null;
  const previousLyricCount = Array.isArray(project.timed_lyrics) ? project.timed_lyrics.length : 0;
  const healed = song ? buildHealedLyrics(song, project, songMetadata) : {
    lines: project.timed_lyrics || [],
    source: "existing-project-timed-lyrics",
    strategy: "existing-project-timed-lyrics"
  };
  const healedLyrics = healed.lines;
  if (healed.source === "dear-papa-playlist-lyric-timing") exactTimingProjects++;
  else syntheticTimingProjects++;
  lyricLinesBefore += previousLyricCount;
  lyricLinesAfter += healedLyrics.length;

  project.timed_lyrics = healedLyrics;
  if (project.song_edit_map) {
    const sections = buildSectionsFromTimedLyrics(healedLyrics, Number(project.duration || 0));
    project.song_edit_map.timedLyrics = healedLyrics;
    project.song_edit_map.sections = sections;
    project.song_edit_map.editPulses = makeEditPulses(healedLyrics);
    project.song_edit_map.vocalDensity = sections.map((section) => ({
      start_sec: section.start,
      end_sec: section.end,
      vocal_density: section.vocalDensity,
      source: healed.source
    }));
    project.song_edit_map.energyCurves = {
      source: healed.source,
      points: sections.map((section) => ({
        t: section.start,
        section_id: section.id,
        energy: section.energy
      }))
    };
    project.song_edit_map.provenance = {
      ...(project.song_edit_map.provenance || {}),
      lyricTimingSource: healed.source,
      lyricTimingStrategy: healed.strategy,
      lyricTimingPath: healed.timingPath || "",
      lyricTimingRejectedExact: healed.rejectedExactTiming || null,
      lyricTimingRegistryTrackId: healed.timingRegistryTrackId
        || songMetadata?.lyricTimingRegistryTrackId
        || songMetadata?.lyricTimingSource?.registryTrackId
        || songMetadata?.registryTrackId
        || project.registry_track_id
        || project.audio_id
        || ""
    };
    if (project.song_edit_map.audioTelemetry) {
      project.song_edit_map.audioTelemetry.lyricLineCount = healedLyrics.length;
      project.song_edit_map.audioTelemetry.wordCount = timedLyricsWordCount(healedLyrics);
      project.song_edit_map.audioTelemetry.lyricTimingSource = healed.source;
      project.song_edit_map.audioTelemetry.lyricTimingPath = healed.timingPath || "";
    }
    project.song_edit_map.lyricTimingHeal = {
      schemaVersion: "hapa.echos.lyric-timing-heal.v1",
      source: SCRIPT_NAME,
      strategy: healed.strategy,
      timingSource: healed.source,
      timingPath: healed.timingPath || "",
      timingConfidence: healed.timingConfidence,
      rejectedExactTiming: healed.rejectedExactTiming || null,
      updatedAt: UPDATED_AT
    };
  }

  project.timeline = (project.timeline || []).map((shot, shotIdx) => {
    const camera = chooseCameraMotion(shot, shotIdx, videoMap.get(shot.media_id));
    if (shot.media_id && shot.media_id !== "none") cameraShots++;
    return {
      ...shot,
      camera_motion: camera.camera_motion,
      camera_intensity: camera.camera_intensity,
      camera_speed: camera.camera_speed,
      camera_focus: shot.camera_focus || "center"
    };
  });
  project.lyric_position = project.lyric_position || "bottom-center";
  project.lyric_style = project.lyric_style || "neon-cyan";
  project.lyric_timing_heal = {
    schemaVersion: "hapa.echos.lyric-timing-heal.v1",
    source: SCRIPT_NAME,
    strategy: healed.strategy,
    timingSource: healed.source,
    timingPath: healed.timingPath || "",
    timingConfidence: healed.timingConfidence,
    rejectedExactTiming: healed.rejectedExactTiming || null,
    registryTrackId: healed.timingRegistryTrackId
      || songMetadata?.lyricTimingRegistryTrackId
      || songMetadata?.lyricTimingSource?.registryTrackId
      || songMetadata?.registryTrackId
      || project.registry_track_id
      || project.audio_id
      || "",
    previousLyricCount,
    healedLyricCount: healedLyrics.length,
    lastLyricEnd: healedLyrics.length ? healedLyrics[healedLyrics.length - 1].end : 0,
    updatedAt: UPDATED_AT
  };
  project.hyperframe_script = generateHyperframesScript(project);
  project.hyperframe_script_stale = false;
  project.updated_at = UPDATED_AT;

  if (APPLY_MUTATIONS) {
    fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
  updated++;
});

console.log(JSON.stringify({
  schemaVersion: "hapa.echos.director-motion-lyrics-heal.report.v1",
  mode: APPLY_MUTATIONS ? "apply" : "dry-run",
  projectsSeen: files.length,
  projectsUpdated: updated,
  lyricLinesBefore,
  lyricLinesAfter,
  cameraShots,
  exactTimingProjects,
  syntheticTimingProjects,
  updatedAt: UPDATED_AT
}, null, 2));
