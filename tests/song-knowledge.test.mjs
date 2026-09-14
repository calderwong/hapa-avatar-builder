import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHapaSong, attachSongMedia } from "../src/domain/song.js";
import { addSongKnowledgeEntry, markSongResearchReference } from "../src/domain/song-knowledge.js";
import { buildSongContextPacket } from "../src/domain/song-context-packet.js";

test("song knowledge preserves free notes, anecdotes, lessons, and marked research URLs", () => {
  let song = normalizeHapaSong({ id: "song-one", title: "One" });
  song = addSongKnowledgeEntry(song, "understanding", { body: "The rain is evidence, not a verdict." });
  song = addSongKnowledgeEntry(song, "note", { body: "Keep the pause before the last refrain." });
  song = addSongKnowledgeEntry(song, "anecdote", { body: "The first demo was recorded during a rainstorm." });
  song = addSongKnowledgeEntry(song, "lesson", { body: "Listening is an action.", futureUse: "Use this in a future dialogue mechanic.", relatedFeature: "relationship-memory" });
  song = markSongResearchReference(song, { label: "Rain as memory", url: "https://example.com/rain", notes: "Compare visual language later." });
  assert.equal(song.knowledge.notes.length, 1);
  assert.equal(song.knowledge.understandings[0].kind, "understanding");
  assert.equal(song.knowledge.anecdotes[0].kind, "anecdote");
  assert.equal(song.knowledge.lessons[0].futureUse, "Use this in a future dialogue mechanic.");
  assert.equal(song.knowledge.researchReferences[0].status, "marked-for-research");
  assert.deepEqual(normalizeHapaSong(song).knowledge, song.knowledge);
});

test("creative anchors and explicitly linked avatars/cards reach agent context packets", () => {
  let song = normalizeHapaSong({
    id: "song-one",
    title: "One",
    attachments: {
      avatarLinks: [{ avatarId: "avatar-one", avatarName: "One" }],
      cardLinks: [{ cardId: "echo-tarot:M00", cardTitle: "The Fool", role: "tarot-song-correspondence", reason: "A reversible first step." }],
    },
    knowledge: { lessons: [{ body: "Begin as a learner." }] },
  });
  song = attachSongMedia(song, { id: "anchor-one", name: "moon.jpg", uri: "/media/moon.jpg", type: "image" }, {
    role: "creative-visual-anchor",
    creativeAnchor: { toneNotes: "Quiet silver-blue threshold." },
  });
  const packet = buildSongContextPacket({ song, avatars: [{ id: "avatar-one", primaryName: "One" }] });
  assert.equal(packet.allowedCharacters[0].id, "avatar-one");
  assert.equal(packet.cards[0].id, "echo-tarot:M00");
  assert.equal(packet.knowledge.lessons[0].body, "Begin as a learner.");
  assert.equal(packet.song.mediaAttachPack[0].id, "anchor-one");
  assert.ok(packet.decisionFamilyHashes.knowledge);
});
