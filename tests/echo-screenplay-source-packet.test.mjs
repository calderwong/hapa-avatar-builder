import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildEchoScreenplaySourcePacket,
  deriveEchoScreenplaySourcePacketHash,
  validateEchoScreenplayReferenceCoverage,
  validateEchoScreenplaySourcePacket,
} from "../src/domain/echo-screenplay-source-packet.js";
import { run } from "../scripts/build-echo-screenplay-source-packet.mjs";

const song = { id: "song-a", title: "Song A", lyrics: { status: "matched_exact", text: "hello" }, performancePerspective: { avatarId: "blue", avatarName: "Blue" }, referenceConnectors: [{ id: "direct", referenceId: "work", classification: "explicit", semanticEffect: { traversalEdges: ["memory-route"] } }], contextualLayers: [{ id: "layer", status: "soft" }] };
const windows = [{ id: "song-a-count-0001", ordinal: 1, lyricOverlap: [{ text: "hello" }] }, { id: "song-a-count-0002", ordinal: 2, lyricOverlap: [{ text: "world" }] }];

test("screenplay source packet retains evidence labels, seed provenance, and adjacent continuity without mutations", () => {
  const packet = buildEchoScreenplaySourcePacket({
    song,
    project: { canon_affordance_graph: { visual_affordances: ["pulse"] }, song_edit_map: { sections: [] } },
    telemetry: { status: "complete", runId: "t", duration: 2 },
    windows,
    avatar: { id: "blue", primaryName: "Blue", assets: [{ id: "seed", type: "image", uri: "/seed.png", metadata: { storage: { path: "/seed.png" }, intelligence: { confidence: "high" } } }] },
    approvedSeeds: [{ avatarId: "blue", assetId: "approved", colorRole: "blue", retrievalHandle: "/approved.png", contentHash: `sha256:${"a".repeat(64)}`, identityInvariants: ["Blue face"], visualContribution: "Preserve identity", sourceLineage: { review: "existing-avatar-source" } }],
    process: { counts: [{ id: "song-a-count-0001", lanes: { prompt: { artifact: { state: "ready", result: { sceneText: "first scene" }, contentHash: "p" }, quest: {} }, image: { artifact: { state: "keyframe_exists", result: { localPath: "/frame.png" }, contentHash: "i" }, quest: {} }, video: { artifact: {}, quest: { status: "held" } } } }] },
    mediaCards: { cards: [] },
    graphEdges: [{ sourceSongId: "song-a", classification: "candidate" }],
    referenceCatalog: [{ id: "work", title: "Work", kind: "book", themes: ["memory"], traversalTerms: ["return"], source: { label: "source" } }, { id: "other", title: "Other Work", kind: "game", themes: ["crew"], traversalTerms: ["party"], source: { label: "other-source" } }],
    albumConnectors: [{ sourceSongId: "other-song", referenceId: "other", confidence: "candidate", semanticEffect: { traversalEdges: ["return-route"] } }],
  });
  assert.equal(packet.mode, "read-only-source-packet");
  assert.equal(packet.packetHash, deriveEchoScreenplaySourcePacketHash(packet));
  assert.match(packet.sourceRevision.songContextHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(packet.sourceRevision.seedSetHash, /^sha256:[a-f0-9]{64}$/u);
  assert.match(packet.sourceRevision.promptPolicyHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(packet.evidenceSummary.direct, 1);
  assert.equal(packet.evidenceSummary.candidate, 2);
  assert.equal(packet.approvedAvatarSeeds.assets[0].localPath, "/approved.png");
  assert.equal(packet.approvedAvatarSeeds.assets[0].contentHash, `sha256:${"a".repeat(64)}`);
  assert.equal(packet.approvedAvatarSeeds.assets[0].avatarId, "blue");
  assert.deepEqual(packet.approvedAvatarSeeds.assets[0].identityInvariants, ["Blue face"]);
  assert.equal(packet.fourCounts[0].continuity.current.keyframe.state, "keyframe_exists");
  assert.equal(packet.fourCounts[1].continuity.previous.id, "song-a-count-0001");
  assert.equal(packet.resolvedSongReferences[0].referenceId, "work");
  assert.ok(packet.resolvedSongReferences[0].promptSafeMechanics.includes("memory-route"));
  assert.equal(packet.albumContextReservoir[0].evidenceStatus, "not-inherited-album-context");
  assert.match(packet.authoringInstruction.teaching, /trace/i);
  assert.match(packet.authoringInstruction.actionGrammar, /^Blue performs/u);
  assert.match(packet.authoringInstruction.miningRule, /direct LLM author/u);
  assert.match(packet.authoringInstruction.frameQualityFloor.concreteAnchors, /two mined lyric elements/u);
  assert.match(packet.qualityPolicy.referenceTranslation, /album reservoir/u);
  assert.match(packet.qualityPolicy.acceptancePriority, /semantic attachment/u);
  assert.deepEqual(validateEchoScreenplaySourcePacket(packet), { ok: true, errors: [] });
});

test("authoring grammar follows the selected Avatar instead of hard-coding a color role", () => {
  const packet = buildEchoScreenplaySourcePacket({
    song: { ...song, performancePerspective: { avatarId: "green", avatarName: "Green" } },
    windows,
    avatar: { id: "green", primaryName: "Green" },
  });
  assert.match(packet.authoringInstruction.actionGrammar, /^Green performs/u);
  assert.doesNotMatch(packet.authoringInstruction.actionGrammar, /^Blue performs/u);
});

test("source packet separates evergreen cast from explicitly attributed referenced Avatars", () => {
  const seed = (avatarId, castRole) => ({ avatarId, castRole, species: "human", baseCharacterId: avatarId, assetId: `${avatarId}-seed`, contentHash: `sha256:${avatarId.replace(/[^a-f0-9]/gu, "a").padEnd(64, "a").slice(0, 64)}`, retrievalHandle: `/${avatarId}.png`, identityInvariants: ["identity"], visualContribution: avatarId });
  const packet = buildEchoScreenplaySourcePacket({
    song,
    windows,
    avatar: { id: "blue", primaryName: "Blue" },
    approvedSeeds: [seed("blue", "primary")],
    evergreenCast: [{ avatarId: "avatar-39", name: "Thor", castClass: "evergreen", species: "cat", baseCharacterId: "avatar-39", evidenceStatus: "user-authorized-evergreen", seedAssets: [{ ...seed("avatar-39", "evergreen"), species: "cat" }] }],
    referencedAvatarCast: [{ avatarId: "pinokio-bella", name: "Bella", castClass: "referenced-avatar", species: "human", baseCharacterId: "pinokio-bella", evidenceStatus: "user-confirmed-song-avatar-binding", sourceAttribution: "explicit operator binding", seedAssets: [seed("pinokio-bella", "referenced")] }],
  });
  assert.equal(packet.castAttribution.primary.avatarId, "blue");
  assert.equal(packet.castAttribution.additional.find((member) => member.avatarId === "avatar-39").species, "cat");
  assert.equal(packet.castAttribution.additional.find((member) => member.avatarId === "pinokio-bella").castClass, "referenced-avatar");
  assert.match(packet.authoringInstruction.avatarConsistency.castSelectionRule, /smallest useful cast/u);
  assert.deepEqual(validateEchoScreenplaySourcePacket(packet), { ok: true, errors: [] });
});

test("validator rejects malformed evidence confidence and window continuity", () => {
  const content = { schemaVersion: "hapa.echo.screenplay-source-packet.v1", song: { id: "x" }, fourCounts: [{ id: "x" }], referenceEvidence: [{ confidence: "unsupported" }], approvedAvatarSeeds: { assets: [] } };
  const packet = { ...content, packetHash: deriveEchoScreenplaySourcePacketHash(content) };
  const result = validateEchoScreenplaySourcePacket(packet);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("referenceEvidence.confidence"));
  assert.ok(result.errors.includes("fourCounts:x"));
});

test("validator rejects a packet whose immutable content no longer matches its packet hash", () => {
  const packet = buildEchoScreenplaySourcePacket({ song, windows });
  packet.song.title = "tampered";
  const result = validateEchoScreenplaySourcePacket(packet);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("packetHash"));
});

test("validator rejects seed assets without immutable SHA-256 provenance", () => {
  const packet = buildEchoScreenplaySourcePacket({
    song,
    windows,
    avatar: { id: "blue", primaryName: "Blue" },
    approvedSeeds: [{ avatarId: "blue", assetId: "seed", retrievalHandle: "/seed.png", contentHash: "pending" }],
  });
  const result = validateEchoScreenplaySourcePacket(packet);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("approvedAvatarSeeds.contentHash:seed"));
});

test("reference coverage cannot be bypassed by explicitNoReferenceApplies on an overlapping lyric", () => {
  const packet = buildEchoScreenplaySourcePacket({
    song: { ...song, referenceConnectors: song.referenceConnectors.map((connector) => ({ ...connector, target: { lyricText: "hello", matchedText: "hello", songId: "song-a" } })) },
    windows,
    referenceCatalog: [{ id: "work", title: "Work", kind: "book" }],
  });
  const record = {
    countId: "song-a-count-0001",
    semanticExtraction: { referenceMechanics: [], explicitNoReferenceApplies: true },
  };
  const result = validateEchoScreenplayReferenceCoverage([record], packet);
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingConnectorIds, ["direct"]);
});

test("reference coverage accepts the packet connector and ignores future lyric connectors outside the tranche", () => {
  const packet = buildEchoScreenplaySourcePacket({
    song: {
      ...song,
      referenceConnectors: [
        ...song.referenceConnectors.map((connector) => ({ ...connector, target: { lyricText: "hello", matchedText: "hello", songId: "song-a" } })),
        { id: "future", referenceId: "future-work", classification: "candidate", target: { lyricText: "world", matchedText: "world", songId: "song-a" } },
      ],
    },
    windows,
    referenceCatalog: [{ id: "work", title: "Work", kind: "book" }, { id: "future-work", title: "Future", kind: "book" }],
  });
  const firstOnly = [{
    countId: "song-a-count-0001",
    semanticExtraction: { referenceMechanics: [{ connectorId: "direct" }], explicitNoReferenceApplies: false },
  }];
  const result = validateEchoScreenplayReferenceCoverage(firstOnly, packet);
  assert.equal(result.ok, true);
  assert.equal(result.applicableConnectors, 1);
  assert.equal(result.coveredConnectors, 1);
});

test("reference coverage does not attach a later connector through a generic fragment such as I said", () => {
  const packet = buildEchoScreenplaySourcePacket({
    song: {
      ...song,
      referenceConnectors: [{ id: "later", referenceId: "later-work", classification: "candidate", target: { lyricText: "I said I would take you there when you were born wild", matchedText: "born wild", songId: "song-a" } }],
    },
    windows: [{ id: "song-a-count-0001", ordinal: 1, lyricOverlap: [{ text: "I said" }] }],
    referenceCatalog: [{ id: "later-work", title: "Later", kind: "song" }],
  });
  const result = validateEchoScreenplayReferenceCoverage([{
    countId: "song-a-count-0001",
    semanticExtraction: { referenceMechanics: [], explicitNoReferenceApplies: true },
  }], packet);
  assert.equal(result.ok, true);
  assert.equal(result.applicableConnectors, 0);
});

test("reference coverage rejects connector ids invented outside the immutable packet", () => {
  const packet = buildEchoScreenplaySourcePacket({ song: { ...song, referenceConnectors: song.referenceConnectors.map((connector) => ({ ...connector, target: { lyricText: "hello", matchedText: "hello", songId: "song-a" } })) }, windows, referenceCatalog: [{ id: "work", title: "Work", kind: "book" }] });
  const result = validateEchoScreenplayReferenceCoverage([{
    countId: "song-a-count-0001",
    semanticExtraction: { referenceMechanics: [{ connectorId: "invented" }] },
  }], packet);
  assert.equal(result.ok, false);
  assert.deepEqual(result.unexpectedConnectorIds, ["invented"]);
});

test("read-only CLI builds a validated full-source packet and does not create output files", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-screenplay-packet-"));
  const projects = path.join(root, "projects");
  const telemetry = path.join(root, "telemetry");
  const write = (file, value) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
  write(path.join(root, "songs.json"), { songs: [song], referenceGraphEdges: [{ sourceSongId: "song-a", classification: "candidate" }] });
  write(path.join(root, "avatars.json"), { avatars: [{ id: "blue", primaryName: "Blue" }] });
  write(path.join(projects, "song.json"), { music_video_project: { song_id: "song-a", registry_track_id: "track-a", timed_lyrics: [{ text: "hello", start: 0, end: 1 }] } });
  write(path.join(telemetry, "track-a.json"), { status: "complete", duration: 4, timeline: { events: [0, 1, 2, 3].map((start) => ({ type: "beat", start, source: "fixture" })) } });
  write(path.join(root, "process.json"), { counts: [] });
  write(path.join(root, "cards.json"), { cards: [] });
  const outputBefore = fs.readdirSync(root).sort();
  const result = run(["--song", "song-a", "--songs", path.join(root, "songs.json"), "--avatars", path.join(root, "avatars.json"), "--projects", projects, "--telemetry-root", telemetry, "--process", path.join(root, "process.json"), "--media-cards", path.join(root, "cards.json"), "--pilot-root", path.join(root, "missing-pilots")]);
  assert.equal(result.validation.ok, true);
  assert.equal(result.packet.fourCounts.length, 1);
  assert.equal(result.packet.evidenceSummary.candidate, 2);
  assert.deepEqual(fs.readdirSync(root).sort(), outputBefore);
});

test("CLI materializes only its explicit packet artifact when --out and --apply are paired", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-screenplay-output-"));
  const songs = path.join(root, "songs.json");
  fs.writeFileSync(songs, JSON.stringify({ songs: [song] }));
  const out = path.join(root, "nested", "packet.json");
  assert.throws(() => run(["--song", "song-a", "--songs", songs, "--out", out]), /requires --apply/);
  const result = run(["--song", "song-a", "--songs", songs, "--out", out, "--apply", "--projects", path.join(root, "missing")]);
  assert.equal(result.applied, true);
  assert.equal(result.output, out);
  assert.equal(JSON.parse(fs.readFileSync(out, "utf8")).applied, true);
});
