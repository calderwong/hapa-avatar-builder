#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildSongContextPacket, diffSongContextPackets } from "../src/domain/song-context-packet.js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9) || path.join(root, "artifacts/song-context-packets"));
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const songbook = read("data/dear-papa-songbook.json");
const avatarStore = read("data/avatar-store.json");
const itemStore = read("data/item-manager-store.json");
const tarotStore = read("data/tarot-store.json");
const sceneStore = read("data/scene-store.json");
const songsByExactValue = new Map();
for (const song of songbook.songCards || []) for (const value of [song.id, song.title]) {
  const ids = songsByExactValue.get(value) || [];
  ids.push(song.id);
  songsByExactValue.set(value, ids);
}
function buildExactLinkIndex(records) {
  const index = new Map();
  function visit(value, pointer, hits) {
    if (typeof value === "string" && songsByExactValue.has(value)) for (const songId of songsByExactValue.get(value)) (hits.get(songId) || (hits.set(songId, []), hits.get(songId))).push(pointer || "/");
    else if (Array.isArray(value)) value.forEach((item, position) => visit(item, `${pointer}/${position}`, hits));
    else if (value && typeof value === "object") Object.entries(value).forEach(([key, item]) => visit(item, `${pointer}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`, hits));
  }
  for (const record of records) {
    const hits = new Map();
    visit(record, "", hits);
    for (const [songId, paths] of hits) {
      const rows = index.get(songId) || [];
      rows.push({ record, paths: [...new Set(paths)] });
      index.set(songId, rows);
    }
  }
  return index;
}
const itemLinkIndex = buildExactLinkIndex(itemStore.cards || []);
const tarotLinkIndex = buildExactLinkIndex(tarotStore.cards || []);
const sceneLinkIndex = buildExactLinkIndex(sceneStore.scenes || []);
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, "packets"), { recursive: true });
const rows = [];
for (const song of songbook.songCards || []) {
  const packet = buildSongContextPacket({ song, avatars: avatarStore.avatars || [], prelinked: { itemCards: itemLinkIndex.get(song.id) || [], tarotCards: tarotLinkIndex.get(song.id) || [], scenes: sceneLinkIndex.get(song.id) || [] } });
  fs.writeFileSync(path.join(output, "packets", `${song.id}.json`), `${JSON.stringify(packet, null, 2)}\n`);
  rows.push({ songId: song.id, title: song.title, packetHash: packet.packetHash, bytes: Buffer.byteLength(JSON.stringify(packet)), allowedCharacters: packet.allowedCharacters.length, relationships: packet.relationships.length, cards: packet.cards.length, scenes: packet.scenes.length, mediaAttachAssets: [packet.song, ...packet.cards, ...packet.scenes].flatMap((node) => node.mediaAttachPack || []).length, gaps: packet.gaps });
}
const sampleSong = songbook.songCards.find((song) => song.id === "dear-papa-song-dear-papa") || songbook.songCards[0];
const performerId = sampleSong.performancePerspective?.avatar_id;
const samplePrelinked = { itemCards: itemLinkIndex.get(sampleSong.id) || [], tarotCards: tarotLinkIndex.get(sampleSong.id) || [], scenes: sceneLinkIndex.get(sampleSong.id) || [] };
const before = buildSongContextPacket({ song: sampleSong, avatars: avatarStore.avatars || [], prelinked: samplePrelinked });
const unrelatedAvatars = (avatarStore.avatars || []).map((avatar) => avatar.id === performerId ? avatar : { ...avatar, operatorNotes: `${avatar.operatorNotes || ""} unrelated-proof-edit` });
const afterUnrelated = buildSongContextPacket({ song: sampleSong, avatars: unrelatedAvatars, prelinked: samplePrelinked });
const linkedAvatars = (avatarStore.avatars || []).map((avatar) => avatar.id === performerId ? { ...avatar, summary: `${avatar.summary || ""} linked-proof-edit` } : avatar);
const afterLinked = buildSongContextPacket({ song: sampleSong, avatars: linkedAvatars, prelinked: samplePrelinked });
const invalidationProof = { unrelatedEdit: diffSongContextPackets(before, afterUnrelated), linkedEdit: diffSongContextPackets(before, afterLinked) };
const report = { schemaVersion: "hapa.director.song-context-packet-report.v1", ok: rows.length === 79 && rows.every((row) => row.bytes < 200000) && rows.every((row) => row.relationships > 0) && !invalidationProof.unrelatedEdit.changed && invalidationProof.linkedEdit.changed && invalidationProof.linkedEdit.changedDecisionFamilies.includes("characters"), rankingStatus: "proposed-pending-human-blind-review", sourceCounts: { songs: songbook.songCards?.length || 0, avatars: avatarStore.avatars?.length || 0, itemCards: itemStore.cards?.length || 0, tarotCards: tarotStore.cards?.length || 0, scenes: sceneStore.scenes?.length || 0 }, packetCount: rows.length, totalBytes: rows.reduce((sum, row) => sum + row.bytes, 0), maxPacketBytes: Math.max(...rows.map((row) => row.bytes)), linkedCounts: { allowedCharacters: rows.reduce((sum, row) => sum + row.allowedCharacters, 0), relationships: rows.reduce((sum, row) => sum + row.relationships, 0), cards: rows.reduce((sum, row) => sum + row.cards, 0), scenes: rows.reduce((sum, row) => sum + row.scenes, 0), mediaAttachAssets: rows.reduce((sum, row) => sum + row.mediaAttachAssets, 0) }, songsWithGaps: rows.filter((row) => row.gaps.length).length, invalidationProof, packets: rows };
fs.writeFileSync(path.join(output, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, packets: report.packetCount, totalBytes: report.totalBytes, maxPacketBytes: report.maxPacketBytes, linkedCounts: report.linkedCounts, songsWithGaps: report.songsWithGaps, unrelatedInvalidated: report.invalidationProof.unrelatedEdit.changed, linkedFamilies: report.invalidationProof.linkedEdit.changedDecisionFamilies }, null, 2));
if (!report.ok) process.exitCode = 1;
