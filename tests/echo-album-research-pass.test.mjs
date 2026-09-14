import test from "node:test";
import assert from "node:assert/strict";
import { buildEchoAlbumResearchPass } from "../src/domain/echo-album-research-pass.js";

const songs = [
  { id: "song-one", title: "River Name", trackNumber: 1, lyrics: { text: "I row you across the river / I remember your name" } },
  { id: "song-two", title: "Copper Garden", trackNumber: 2, lyrics: { text: "Build a garden from a copper tool / leave the gate open" } },
];
const atlas = {
  created: "2026-09-13",
  references: [{ id: "R01", title: "The ethical ferry", load: "Load passage as freely offered labor.", reading: "The toll becomes an invitation.", caution: "Do not merge different funerary systems.", sources: ["S1"] }],
  sources: [{ id: "S1", title: "Primary source", url: "https://example.com/source" }],
  tracks: [
    { track_id: 1, title: "River Name", curated_reference_ids: ["R01"] },
    { track_id: 2, title: "Copper Garden", curated_reference_ids: [] },
  ],
  lyric_anchors: [{ reference_id: "R01", track_id: 1, evidence_class: "D", reason: "The ferryman is named.", text: "I row you across the river" }],
};
const tarotEdition = {
  cards: [
    { id: "M00", order: 0, title: "The Fool", inherited: { upright: "beginning and trust", shadow: "recklessness", essential_symbols: "threshold; pack" }, hapa_edition: { thematic_synthesis: "Begin honestly." } },
    { id: "S06", order: 1, title: "Six of Swords", inherited: { upright: "transition and recovery", shadow: "unresolved pain", essential_symbols: "boat; six swords" }, hapa_edition: { thematic_synthesis: "Cross with care." } },
  ],
};
const tarotConnections = [{ id: "existing", songId: "song-one", cardId: "echo-tarot:S06", editionCardId: "S06", cardTitle: "Six of Swords", logic: "The river crossing is literal and ethical.", evidence: [{ excerpt: "row you across" }], originalMeaning: { upright: "transition", shadow: "unresolved pain" } }];

test("album research pass fills every knowledge lane and only proposes missing Tarot links", () => {
  const pass = buildEchoAlbumResearchPass({ songs, atlas, tarotEdition, tarotConnections, timestamp: "2026-09-13T17:30:00.000Z", passId: "test-pass" });
  assert.equal(pass.counts.songs, 2);
  assert.equal(pass.counts.generatedTarotAssignments, 1);
  assert.equal(pass.counts.referenceImagePrompts, 2);
  assert.equal(pass.songs[0].tarot.assignmentType, "supplied");
  assert.equal(pass.songs[1].tarot.assignmentType, "agent-proposed");
  for (const song of pass.songs) {
    assert.equal(song.knowledge.understandings.length, 1);
    assert.equal(song.knowledge.notes.length, 1);
    assert.equal(song.knowledge.anecdotes.length, 1);
    assert.equal(song.knowledge.lessons.length, 1);
    assert.equal(song.knowledge.tarotRationales.length, 1);
    assert.ok(song.knowledge.songConnections.length >= 1);
    assert.match(song.knowledge.referenceImagePrompts[0].prompt, /SOURCE TRIANGLE/);
    assert.match(song.knowledge.referenceImagePrompts[0].generationPrompt, /TRANSLATED, NOT IMITATED/);
    assert.doesNotMatch(song.knowledge.referenceImagePrompts[0].generationPrompt, /The ethical ferry|River Name|Copper Garden/);
    assert.equal(song.knowledge.passProvenance[0].authorName, "OpenAI Codex");
  }
  assert.match(pass.songs[1].knowledge.understandings[0].body, /not selected in this pass/);
  assert.match(pass.songs[1].knowledge.anecdotes[0].body, /not a biographical claim/);
});
