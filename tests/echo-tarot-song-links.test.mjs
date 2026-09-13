import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { buildEchoTarotSongConnections, compactEchoTarotEditionCards, projectEchoTarotSongConnections } from "../src/domain/echo-tarot-song-links.js";

const source = {
  edition_id: "edition-one",
  title: "Echoes",
  status: "editorial_proposal",
  track_index: [{ track_id: "E033", track_no: 33, title: "Backwards Cap" }],
  cards: [{
    id: "M00", title: "The Fool", arcana: "Major", suit: "Major Arcana", rank: "0", number: 0,
    inherited: { casting: "Calder" },
    canon_source: { source_id: "TAROT", start_line: 83, end_line: 103 },
    hapa_edition: {
      edition_subtitle: "The Trainee at the Unwritten Gate",
      thematic_synthesis: "Begin as a learner.",
      songs: [{ track_id: "E033", track_no: 33, title: "Backwards Cap", role: "Primary", argument: "The traveler calls himself a trainee.", evidence: [{ source_id: "LYRICS", line: 3131, excerpt: "just a trainee" }], mapping_status: "proposed_editorial_correspondence" }],
    },
  }],
};
const songs = [{ id: "dear-papa-song-backwards-cap", songId: "backwards-cap", title: "Backwards Cap", trackNumber: 33 }];

test("tarot edition projection retains source IDs, evidence, status, and pairing logic", () => {
  const [connection] = buildEchoTarotSongConnections(source, songs);
  assert.equal(connection.songId, songs[0].id);
  assert.equal(connection.cardId, "echo-tarot:M00");
  assert.equal(connection.logic, "The traveler calls himself a trainee.");
  assert.equal(connection.evidence[0].line, 3131);
  assert.equal(connection.mappingStatus, "proposed_editorial_correspondence");
  assert.equal(connection.source.resourcePath, "resources/echo-album/hapa-tarot-echoes-v1.json");
  assert.equal(projectEchoTarotSongConnections(source, songs, songs[0].id).length, 1);
  assert.equal(compactEchoTarotEditionCards(source)[0].subtitle, "The Trainee at the Unwritten Gate");
});

test("the bundled Hapa Tarot Echoes edition captures the complete supplied mapping", async () => {
  const edition = JSON.parse(await readFile(new URL("../resources/echo-album/hapa-tarot-echoes-v1.json", import.meta.url), "utf8"));
  const cards = compactEchoTarotEditionCards(edition);
  const connections = buildEchoTarotSongConnections(edition, edition.track_index.map((track) => ({
    id: `echo-song-${track.track_id.toLowerCase()}`,
    title: track.title,
    trackNumber: track.track_no,
  })));

  assert.equal(cards.length, 78);
  assert.equal(connections.length, 167);
  assert.ok(connections.every((connection) => connection.logic));
  assert.ok(connections.every((connection) => connection.mappingStatus === "proposed_editorial_correspondence"));
  assert.ok(connections.some((connection) => connection.evidence.length > 0));
  assert.ok(connections.every((connection) => connection.source.resourcePath === "resources/echo-album/hapa-tarot-echoes-v1.json"));
});
