import test from "node:test";
import assert from "node:assert/strict";
import { buildSongContextPacket, diffSongContextPackets } from "../src/domain/song-context-packet.js";
import { rankSemanticMediaCandidates } from "../src/domain/semantic-media-ranker-v2.js";

const song = { id: "song-1", title: "One", loreStatus: "soft_canon", performancePerspective: { avatar_id: "avatar-red", relationship_focus: ["protection"] } };
const avatar = { id: "avatar-red", primaryName: "Red", summary: "Lead", slots: [{ id: "face", requirementId: "portrait", assetId: "asset-red" }] };
const scene = { id: "scene-1", title: "Scene", linkedSongIds: ["song-1"], canonStatus: "soft_canon", mediaSlots: [{ id: "clip", assetId: "clip-1", requirementId: "scene-video" }] };

test("packet preserves exact IDs, source paths, truth, constraints, and attach packs", () => {
  const packet = buildSongContextPacket({ song, avatars: [avatar], scenes: [scene] });
  assert.equal(packet.allowedCharacters[0].id, "avatar-red");
  assert.equal(packet.relationships[0].relationship, "protection");
  assert.equal(packet.scenes[0].source.linkPaths[0], "/linkedSongIds/0");
  assert.equal(packet.scenes[0].mediaAttachPack[0].id, "clip-1");
  assert.equal(packet.rankingStatus, "proposed-pending-human-blind-review");
  assert.equal(packet.negativeConstraints.length, 3);
});

test("casting ranker cites the exact context node and remains confidence-capped", () => {
  const packet = buildSongContextPacket({ song, avatars: [avatar], scenes: [scene] });
  const ranking = rankSemanticMediaCandidates({ slot: { sectionType: "verse" }, contextPacket: packet, candidates: [{ id: "clip-1", title: "Scene clip", uri: "/clip.mp4", tokens: ["scene"], objects: [], actions: [], technical: {}, semantic: {} }] });
  assert.equal(ranking.selected.components.characterCanon.value, 1);
  assert.match(ranking.selected.components.characterCanon.evidence[0], /scene:scene-1:data\/scene-store\.json\/linkedSongIds\/0/);
  assert.ok(ranking.selected.confidence <= .55);
});

test("unrelated records do not invalidate a packet and linked edits invalidate only affected families", () => {
  const before = buildSongContextPacket({ song, avatars: [avatar, { id: "other", primaryName: "Other" }], scenes: [scene] });
  const unrelated = buildSongContextPacket({ song, avatars: [avatar, { id: "other", primaryName: "Changed" }], scenes: [scene] });
  assert.equal(before.packetHash, unrelated.packetHash);
  const changed = buildSongContextPacket({ song, avatars: [{ ...avatar, summary: "Changed lead" }], scenes: [scene] });
  const invalidation = diffSongContextPackets(before, changed);
  assert.equal(invalidation.changed, true);
  assert.deepEqual(invalidation.changedDecisionFamilies, ["characters"]);
  assert.ok(invalidation.unaffectedDecisionFamilies.includes("scenes"));
});
