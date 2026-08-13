#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const DATA = path.join(ROOT, "data");
const SONG_ID = "4b9f48b5-3ca9-416e-b88e-75fd223a1dca";
const TITLE = "LitRPG Life";
const PLAYLIST_ID = "903148b6-5709-4511-9cfd-d34b23799da6";
const NOW = new Date().toISOString();
const APPLY = process.argv.includes("--apply");
const downloadPath = "/Users/calderwong/Downloads/LitRPG Life.mp3";
const localDir = `/Users/calderwong/Desktop/suno-library/playlists/${PLAYLIST_ID}/songs/50 - LitRPG Life - 4b9f48b5`;
const localAudioPath = path.join(localDir, "song.mp3");
const lyricsPath = path.join(DATA, "lyrics", "suno-visible", `${SONG_ID}.txt`);
const lyricInputPath = process.env.HAPA_LITRPG_LYRICS_SOURCE || lyricsPath;
const songbookPath = path.join(DATA, "dear-papa-songbook.json");
const songStorePath = path.join(DATA, "hapa-songs-store.json");
const backupDir = path.join(DATA, "backups", `litrpg-life-before-import-${NOW.replace(/[:.]/g, "-")}`);
const reportPath = path.join(DATA, "song-sync-reports", "latest-litrpg-life-import.json");

if (!fs.existsSync(downloadPath)) throw new Error(`Downloaded MP3 not found: ${downloadPath}`);
if (!fs.existsSync(lyricInputPath)) throw new Error(`Visible Suno lyric source not found: ${lyricInputPath}`);
const lyrics = fs.readFileSync(lyricInputPath, "utf8").trim();
if (!lyrics) throw new Error(`Visible Suno lyric source is empty: ${lyricInputPath}`);
const sha256 = crypto.createHash("sha256").update(lyrics).digest("hex");
const cardId = "dear-papa-song-litrpg-life";
const songSlug = "litrpg-life";
const lyricSource = { status: "available", sourceKind: "suno-visible-lyrics", sourceId: SONG_ID, sourceTitle: TITLE, sourceTextType: "lyrics", text: lyrics, sha256, sourcePath: lyricsPath, sourceUrl: `https://suno.com/song/${SONG_ID}`, capturedAt: NOW, timingStatus: "source-captured-alignment-pending" };
const card = {
  id: cardId, schemaVersion: "hapa.foundation.song-lore-card.v1", cardType: "song_lore_card", albumId: "dear-papa-album", albumTitle: "Dear Papa", trackNumber: 50, songId: songSlug, registryTrackId: SONG_ID, sunoUrl: `https://suno.com/song/${SONG_ID}`, title: TITLE, author: "Calder",
  authorship: { author: "Calder", rightsStatus: "operator_authored_hapa_creative_commons", albumAttributionRule: "Attribute the entire Dear Papa album to Author Calder.", singerPerspectiveRule: "Avatar performance perspective does not change authorship." }, loreStatus: "hapa_lore_not_hard_canon",
  performancePerspective: { team_color: "", team_id: "", avatar_id: "red-reaper", avatar_name: "Red", voice_function: "lead-letter-bearer", relationship_focus: ["echo-album", "learning", "agency"] },
  lore: { summary: "LitRPG Life is a Suno Echo playlist track backed up locally with its displayed lyrics and MP3 master.", learning_thing: "Learning, work, agency, and shared knowledge are treated as a game-world progression loop.", broad_game_mechanic: "A song card can connect learning evidence, local media custody, and a Director project without inventing an unavailable stem or WAV asset.", relationship_lens: "Use the song to examine learning, work, and self-authorship." },
  lyrics: lyricSource, archiveVariants: [], mood: "reflective, aspirational", learningThing: "Learning, work, agency, and shared knowledge.", broadGameMechanic: "Progression through learning and self-authorship.", genesisUse: ["Echo Album source-backed track", "MP3-backed; WAV and stems remain unclaimed"], mediaPrompts: [],
  sourceAnchors: [{ id: `suno-playlist-${SONG_ID.slice(0, 8)}`, kind: "suno-playlist-track", title: TITLE, path: localDir, registryTrackId: SONG_ID, playlistId: PLAYLIST_ID, confidence: "hard" }],
  sync: { schemaVersion: "hapa.dear-papa-song-card-sync.v1", playlistId: PLAYLIST_ID, registryTrackId: SONG_ID, localPath: localAudioPath, coverPath: "", stemCount: 0, stemTypes: [], recoveredMergeContext: "Imported from operator-downloaded Suno MP3 with visible lyric source.", updatedAt: NOW },
  lineage: { registryTrackId: SONG_ID, playlistId: PLAYLIST_ID, playlistTrackNumber: 50, localDir, lyricsSourceId: SONG_ID, lyricsSourcePath: lyricsPath, lyricsSha256: sha256 }, createdAt: NOW, updatedAt: NOW,
};
const storeSong = { schemaVersion: "hapa.song-card.v1", id: cardId, cardId, songId: songSlug, albumId: "dear-papa-album", albumTitle: "Dear Papa", albumAliases: ["Dear Papa", "Echo Album"], trackNumber: 50, title: TITLE, author: "Calder", status: "active", loreStatus: "hapa_lore_not_hard_canon", lyrics: lyricSource, audio: { registryTrackId: SONG_ID, sourceNode: "suno", mp3Uri: "", wavUri: "", localPath: localAudioPath, coverUri: "", duration: 237, model: "v5.5", localAvailable: true }, stems: [], attribution: { author: "Calder", rightsStatus: "operator_authored_hapa_creative_commons", songRegistryTrackId: SONG_ID }, lineage: { registryTrackId: SONG_ID, lyricsSourceId: SONG_ID, lyricsSourcePath: lyricsPath, lyricsSha256: sha256 }, tags: ["echo-album", "suno", "litrpg", "learning", "agency"], createdAt: NOW, updatedAt: NOW };
const report = { ok: true, mode: APPLY ? "apply" : "dry-run", title: TITLE, registryTrackId: SONG_ID, audio: { source: downloadPath, destination: localAudioPath, mp3: true, wav: false, stems: false }, lyrics: { sourceUrl: lyricSource.sourceUrl, words: lyrics.split(/\s+/).length, sha256 }, projectGeneration: "run scripts/generate-music-video-plans.mjs --apply --registry-track-ids=" + SONG_ID };
if (APPLY) {
  const songbook = JSON.parse(fs.readFileSync(songbookPath, "utf8"));
  const store = JSON.parse(fs.readFileSync(songStorePath, "utf8"));
  if (songbook.songCards.some((item) => item.registryTrackId === SONG_ID) || store.songs.some((item) => item.audio?.registryTrackId === SONG_ID)) throw new Error(`${TITLE} is already registered`);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.copyFileSync(songbookPath, path.join(backupDir, "dear-papa-songbook.json"));
  fs.copyFileSync(songStorePath, path.join(backupDir, "hapa-songs-store.json"));
  fs.mkdirSync(localDir, { recursive: true });
  fs.copyFileSync(downloadPath, localAudioPath);
  fs.writeFileSync(path.join(localDir, "lyrics.txt"), `${lyrics}\n`);
  fs.writeFileSync(path.join(localDir, "suno_url.txt"), `${lyricSource.sourceUrl}\n`);
  fs.writeFileSync(path.join(localDir, "metadata.json"), `${JSON.stringify({ id: SONG_ID, title: TITLE, author: "Calder", duration: 237, model: "v5.5", backup: report.audio }, null, 2)}\n`);
  fs.mkdirSync(path.dirname(lyricsPath), { recursive: true });
  fs.writeFileSync(lyricsPath, `${lyrics}\n`);
  songbook.songCards.push(card); songbook.updatedAt = NOW;
  store.songs.push(storeSong); store.updatedAt = NOW;
  fs.writeFileSync(songbookPath, `${JSON.stringify(songbook, null, 2)}\n`);
  fs.writeFileSync(songStorePath, `${JSON.stringify(store, null, 2)}\n`);
}
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
