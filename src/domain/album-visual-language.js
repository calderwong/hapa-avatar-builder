import { contextHash } from "./song-context-packet.js";

export function buildAlbumVisualBible(songCards = []) {
  const phases = ["threshold", "descent", "signal", "confrontation", "return"];
  const songs = songCards.map((song, index) => ({ songId: song.id, identityId: `song-identity:${contextHash({ id: song.id, title: song.title, mood: song.mood }).slice(0, 16)}`, phase: phases[Math.min(phases.length - 1, Math.floor(index / Math.max(1, songCards.length / phases.length)))], performanceAvatarId: song.performancePerspective?.avatar_id || null, palette: { primary: song.performancePerspective?.team_color || "violet", evolutionIndex: Number((index / Math.max(1, songCards.length - 1)).toFixed(4)) }, visualizerFamily: index % 3 === 0 ? "signal-fields" : index % 3 === 1 ? "memory-surfaces" : "threshold-geometry", cameraSignature: index % 2 ? "patient-roi-drift" : "close-crop-release", reservedHeroMediaSlot: `hero:${song.id}`, albumMotifIds: [`album-motif:${phases[Math.min(phases.length - 1, Math.floor(index / Math.max(1, songCards.length / phases.length)))]}`, `character:${song.performancePerspective?.avatar_id || "unassigned"}`] }));
  const base = { schemaVersion: "hapa.director.album-visual-bible.v1", albumId: "dear-papa-album", principles: ["character truth before spectacle", "IVF expresses stems and phrase structure", "camera movement follows subject ROI", "callbacks require motif IDs", "hero media is reserved per song"], paletteArc: phases.map((phase, index) => ({ phase, lightness: Number((.18 + index * .11).toFixed(2)), saturation: Number((.78 - index * .07).toFixed(2)) })), phases, songs, departureRule: "A song may override inherited fields only with an explicit human-readable reason." };
  return { ...base, bibleHash: contextHash(base) };
}

export function inheritAlbumVisualBible(bible, songId, departures = []) {
  const inherited = bible.songs.find((song) => song.songId === songId);
  if (!inherited) throw new Error(`Song ${songId} is not in album bible`);
  for (const departure of departures) if (!departure.field || !String(departure.reason || "").trim()) throw new Error("Album departures require field and reason");
  const overrides = Object.fromEntries(departures.map((departure) => [departure.field, departure.value]));
  return { schemaVersion: "hapa.director.song-album-inheritance.v1", bibleHash: bible.bibleHash, songId, inherited, departures, effective: { ...inherited, ...overrides } };
}

function count(map, key, songId) { if (!key) return; const row = map.get(key) || { key, count: 0, songIds: [] }; row.count += 1; if (!row.songIds.includes(songId)) row.songIds.push(songId); map.set(key, row); }

export function buildAlbumFatigueLedger({ bible, graphs = {}, contextPackets = {}, setlist = bible.songs.map((song) => song.songId) } = {}) {
  const categories = Object.fromEntries(["clips", "cards", "scenes", "visualizerFamilies", "transitions", "signatureMoves"].map((key) => [key, new Map()]));
  const heroSchedule = [];
  for (const [position, songId] of setlist.entries()) {
    const graph = graphs[songId] || {}; const context = contextPackets[songId] || {}; const direction = bible.songs.find((song) => song.songId === songId);
    for (const card of (graph.tracks || []).flatMap((track) => track.cards || [])) { if (card.media?.id && card.media.id !== "none") count(categories.clips, card.media.id, songId); count(categories.transitions, card.transition, songId); count(categories.signatureMoves, card.parameters?.motion || card.cameraKeyframes?.[0]?.motion, songId); count(categories.visualizerFamilies, card.visualization ? direction?.visualizerFamily : null, songId); }
    for (const card of context.cards || []) count(categories.cards, card.id, songId);
    for (const scene of context.scenes || []) count(categories.scenes, scene.id, songId);
    heroSchedule.push({ position, songId, heroSlot: direction?.reservedHeroMediaSlot, consumedByOwnSongOnly: true, earliestAllowedPosition: position, exhaustedBeforeSong: false });
  }
  const ledger = Object.fromEntries(Object.entries(categories).map(([key, map]) => [key, [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))]));
  const fatigue = Object.fromEntries(Object.entries(ledger).map(([key, rows]) => [key, { reusedAcrossSongs: rows.filter((row) => row.songIds.length > 1).length, maximumReuse: Math.max(0, ...rows.map((row) => row.count)), top: rows.slice(0, 12) }]));
  return { schemaVersion: "hapa.director.album-fatigue-ledger.v1", bibleHash: bible.bibleHash, setlist, songIdentityIds: Object.fromEntries(setlist.map((songId) => [songId, bible.songs.find((song) => song.songId === songId)?.identityId])), heroSchedule, ledger, fatigue, heroMomentsExhaustedEarly: heroSchedule.some((row) => row.exhaustedBeforeSong) };
}
