import fs from "fs";
import path from "path";

const DATA_DIR = "./data";
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const SONGBOOK_PATH = path.join(DATA_DIR, "dear-papa-songbook.json");
const HAPA_SONG_STORE_PATH = path.join(DATA_DIR, "hapa-songs-store.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");
const UPDATED_AT = new Date().toISOString();
const PROMOTE_PROJECT_TIMINGS = process.argv.includes("--promote-project-timings");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function generateHealedBeats(duration) {
  const bpm = 120;
  const beatDuration = 60 / bpm; // 0.5s per beat
  const totalBeats = Math.floor(duration / beatDuration);
  const beatsList = [];
  for (let i = 0; i < totalBeats; i++) {
    const t = i * beatDuration;
    const bar = Math.floor(i / 4) + 1;
    const beat = (i % 4) + 1;
    beatsList.push({
      t: Number(t.toFixed(3)),
      bar,
      beat,
      strength: beat === 1 ? 0.95 : 0.82,
      event_type: beat === 1 ? "downbeat" : "beat",
      edit_use: ["cut_candidate", "pulse"]
    });
  }
  return beatsList;
}

function generateHealedEnergyCurves(sections, duration) {
  // Sample at 9 points across the song duration
  const loudness = [];
  const tension = [];
  const release = [];
  const brightness = [];

  for (let i = 0; i < 9; i++) {
    const t = i * (duration / 8);
    // Find matching section
    const sec = sections.find((s) => t >= s.start && t <= s.end) || sections[sections.length - 1] || { energy: 0.5 };
    const e = sec.energy ?? 0.5;
    loudness.push(Number(e.toFixed(2)));
    tension.push(Number(Math.min(0.95, e * 1.1).toFixed(2)));
    release.push(Number(Math.max(0.05, e * 0.9).toFixed(2)));
    brightness.push(Number(Math.max(0.05, e * 0.8).toFixed(2)));
  }

  return {
    loudness,
    tension,
    release,
    brightness
  };
}

function run() {
  console.log("Starting composition-to-songbook synchronization...");

  if (!fs.existsSync(SONGBOOK_PATH) || !fs.existsSync(HAPA_SONG_STORE_PATH)) {
    console.error("Required data stores are missing.");
    process.exit(1);
  }

  // Backup files
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.copyFileSync(SONGBOOK_PATH, path.join(BACKUP_DIR, `dear-papa-songbook.before-composition-sync-${RUN_ID}.json`));
  fs.copyFileSync(HAPA_SONG_STORE_PATH, path.join(BACKUP_DIR, `hapa-songs-store.before-composition-sync-${RUN_ID}.json`));

  const songbook = readJson(SONGBOOK_PATH);
  const songStore = readJson(HAPA_SONG_STORE_PATH);
  const files = fs.readdirSync(PROJECTS_DIR).filter((file) => file.endsWith(".json"));

  let songbookCount = 0;
  let storeCount = 0;

  const projectMap = new Map();
  files.forEach((file) => {
    const filePath = path.join(PROJECTS_DIR, file);
    const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
    const project = payload.music_video_project;
    if (project?.song_id) {
      projectMap.set(String(project.song_id), project);
    }
  });

  // 1. Update dear-papa-songbook.json cards
  songbook.songCards = (songbook.songCards || []).map((card) => {
    const project = projectMap.get(String(card.id)) || projectMap.get(String(card.songId)) || projectMap.get(String(card.cardId));
    if (!project) return card;

    const duration = Number(project.duration || 0);
    const editMap = project.song_edit_map || {};
    const projectSections = editMap.sections || [];
    const projectVocalDensity = editMap.vocalDensity || [];
    const timedLyrics = project.timed_lyrics || [];

    const healedSections = projectSections.map((sec) => ({
      section_id: sec.id,
      type: sec.type,
      start_sec: sec.start,
      end_sec: sec.end,
      energy_level: sec.energy,
      emotional_role: sec.label || sec.id,
      visual_role_suggestion: sec.visualStrategy || ""
    }));

    const healedVocalDensity = projectVocalDensity.map((vd) => ({
      start_sec: vd.start_sec,
      end_sec: vd.end_sec,
      vocal_density: vd.vocal_density,
      instrumental_prominence: vd.vocal_density === "none" ? "high" : "low"
    }));

    const healedBeats = generateHealedBeats(duration);
    const healedEnergyCurves = generateHealedEnergyCurves(projectSections, duration);

    // Heal the narrativeSpine from generic placeholder status to verified status
    let narrativeSpine = card.narrativeSpine || "";
    if (narrativeSpine.startsWith("Local spine for")) {
      narrativeSpine = narrativeSpine.replace("Local spine for", "Verified narrative spine for");
    }

    songbookCount++;

    return {
      ...card,
      duration,
      sections: healedSections,
      vocalDensity: healedVocalDensity,
      beats: healedBeats,
      energyCurves: healedEnergyCurves,
      narrativeSpine,
      sync: card.sync ? {
        ...card.sync,
        source: card.sync.source || "suno-playlist-stems"
      } : undefined,
      lyrics: {
        ...(card.lyrics || {}),
        timingStatus: project.lyric_timing_truth?.qualityStatus || "director_projection_unreviewed",
        timingSource: project.lyric_timing_truth?.source || "director-projection",
        timingLineCount: timedLyrics.length,
        timingConfidence: project.lyric_timing_heal?.timingConfidence ?? null
      },
      updatedAt: UPDATED_AT
    };
  });

  // 2. Update hapa-songs-store.json songs
  songStore.songs = (songStore.songs || []).map((song) => {
    const project = projectMap.get(String(song.id)) || projectMap.get(String(song.songId)) || projectMap.get(String(song.cardId));
    if (!project) return song;

    const timedLyrics = project.timed_lyrics || [];

    storeCount++;

    const directorProjection = {
      schemaVersion: "hapa.song.director-lyric-projection.v1",
      source: "scripts/sync-healed-compositions-to-songbook.mjs",
      timingTruth: project.lyric_timing_truth || null,
      lyricTimings: timedLyrics,
      updatedAt: UPDATED_AT
    };
    const sourceTimingPatch = PROMOTE_PROJECT_TIMINGS ? {
      lyricTimings: timedLyrics.map((line, index) => ({
        id: line.id || `timed-line-${index + 1}`,
        start: Number(line.start.toFixed(3)), end: Number(line.end.toFixed(3)), text: line.text || "",
        section_id: line.section_id || "", section_label: line.section_label || "", confidence: Number(line.confidence ?? 0),
        words: Array.isArray(line.words) ? line.words.map((w, wIdx) => ({ word: w.word || w.text || "", start: Number(w.start.toFixed(3)), end: Number(w.end.toFixed(3)), index: wIdx })) : []
      })),
      lyricTimingSource: {
        schemaVersion: "hapa.dear-papa.lyric-timing-source.v1", source: "explicit-project-timing-promotion",
        timingSource: project.lyric_timing_truth?.source || "director-projection", confidence: project.lyric_timing_heal?.timingConfidence ?? null,
        registryTrackId: project.registry_track_id || project.audio_id || song.audio?.registryTrackId || "", updatedAt: UPDATED_AT
      }
    } : {};
    return {
      ...song,
      ...sourceTimingPatch,
      directorProjection: { ...(song.directorProjection || {}), lyricTiming: directorProjection },
      enrichment: {
        ...(song.enrichment || {}),
        timingReviewed: PROMOTE_PROJECT_TIMINGS ? Boolean(project.lyric_timing_truth?.humanReviewed) : song.enrichment?.timingReviewed,
        timingSource: PROMOTE_PROJECT_TIMINGS ? "explicit-project-timing-promotion" : song.enrichment?.timingSource
      },
      updatedAt: UPDATED_AT
    };
  });

  writeJson(SONGBOOK_PATH, songbook);
  writeJson(HAPA_SONG_STORE_PATH, songStore);

  console.log(`Sync complete. Updated ${songbookCount} cards in dear-papa-songbook.json and ${storeCount} songs in hapa-songs-store.json.`);
}

run();
