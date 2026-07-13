#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildAlbumFatigueLedger, buildAlbumVisualBible, inheritAlbumVisualBible } from "../src/domain/album-visual-language.js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
const songbook = JSON.parse(fs.readFileSync(path.join(root, "data/dear-papa-songbook.json"), "utf8"));
const bible = buildAlbumVisualBible(songbook.songCards);
const graphs = {}; const contextPackets = {};
const graphRoot = path.join(root, "artifacts/echo-director-v2/album");
const contextRoot = path.join(path.dirname(output), "song-context-packets/packets");
for (const song of songbook.songCards) {
  const graphPath = path.join(graphRoot, song.id, "native-show-graph.json");
  if (fs.existsSync(graphPath)) graphs[song.id] = JSON.parse(fs.readFileSync(graphPath, "utf8"));
  const contextPath = path.join(contextRoot, `${song.id}.json`);
  if (fs.existsSync(contextPath)) contextPackets[song.id] = JSON.parse(fs.readFileSync(contextPath, "utf8"));
}
const canonicalOrder = bible.songs.map((song) => song.songId);
const reverseOrder = [...canonicalOrder].reverse();
const phaseInterleave = [...canonicalOrder].sort((a, b) => { const aa = bible.songs.find((row) => row.songId === a); const bb = bible.songs.find((row) => row.songId === b); return aa.visualizerFamily.localeCompare(bb.visualizerFamily) || aa.songId.localeCompare(bb.songId); });
const ledgers = [canonicalOrder, reverseOrder, phaseInterleave].map((setlist) => buildAlbumFatigueLedger({ bible, graphs, contextPackets, setlist }));
const departure = inheritAlbumVisualBible(bible, "dear-papa-song-dear-papa", [{ field: "cameraSignature", value: "memorial-stillness-then-release", reason: "The title song needs a quieter opening before the album camera grammar returns." }]);
const identityStable = bible.songs.every((song) => ledgers.every((ledger) => ledger.songIdentityIds[song.songId] === song.identityId));
const report = { schemaVersion: "hapa.director.album-visual-language-proof.v1", ok: Boolean(bible.songs.length === 79 && Object.keys(graphs).length === 79 && ledgers.length === 3 && identityStable && ledgers.every((ledger) => !ledger.heroMomentsExhaustedEarly && ledger.heroSchedule.every((row) => row.consumedByOwnSongOnly)) && departure.departures[0].reason), bible: { hash: bible.bibleHash, principles: bible.principles, phases: bible.phases, paletteArc: bible.paletteArc, songCount: bible.songs.length, visualizerFamilies: [...new Set(bible.songs.map((song) => song.visualizerFamily))], cameraSignatures: [...new Set(bible.songs.map((song) => song.cameraSignature))], reservedHeroes: bible.songs.length }, departureFixture: departure, setlists: ledgers.map((ledger, index) => ({ id: ["canonical", "reverse", "family-interleave"][index], songCount: ledger.setlist.length, identityStable: bible.songs.every((song) => ledger.songIdentityIds[song.songId] === song.identityId), heroMomentsExhaustedEarly: ledger.heroMomentsExhaustedEarly, fatigue: ledger.fatigue })), canonicalLedger: ledgers[0] };
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "album-visual-bible.json"), `${JSON.stringify(bible, null, 2)}\n`);
fs.writeFileSync(path.join(output, "album-fatigue-ledger.json"), `${JSON.stringify(ledgers[0], null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, bible: report.bible, departure: report.departureFixture.departures[0], setlists: report.setlists.map(({ id, songCount, identityStable, heroMomentsExhaustedEarly }) => ({ id, songCount, identityStable, heroMomentsExhaustedEarly })), fatigueSummary: Object.fromEntries(Object.entries(report.canonicalLedger.fatigue).map(([key, value]) => [key, { reusedAcrossSongs: value.reusedAcrossSongs, maximumReuse: value.maximumReuse }])) }, null, 2));
if (!report.ok) process.exitCode = 1;
