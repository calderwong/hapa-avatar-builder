import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAvatarMind } from "../src/domain/avatar.js";
import {
  ECHO_SONG_CHOICE_SCHEMA,
  createEchoAlbumLineageFromSongStore,
  createEchoReferenceMindContextFromSongStore,
  hydrateEchoSongChoice
} from "../src/domain/avatarEchoGenesis.js";

const songStore = {
  schemaVersion: "hapa.songs.store.v1",
  album: {
    id: "dear-papa-album",
    title: "Dear Papa",
    aliases: ["Echo Album"],
    activeProjection: {
      id: "echo-album",
      title: "Echo Album",
      kind: "later-music-visualizer-projection"
    }
  },
  referenceCatalog: [{
    id: "star-fox",
    title: "Star Fox 64",
    kind: "game",
    themes: ["inherited guidance"],
    mechanics: ["controller muscle memory"],
    traversalTerms: ["barrel roll"]
  }],
  referenceGraphEdges: [{
    id: "star-fox:mentorship:crew",
    fromReferenceId: "star-fox",
    toReferenceId: "crew",
    relationType: "mentorship"
  }],
  semanticTraversal: {
    thesis: "Meaning grows as context is loaded.",
    traversalRules: ["Do not rewrite lyrics."]
  },
  songs: [{
    id: "dear-papa-song-route-light",
    cardId: "dear-papa-song-route-light",
    songId: "route-light",
    title: "Route Light",
    albumId: "dear-papa-album",
    albumTitle: "Dear Papa",
    author: "Calder",
    performancePerspective: { teamColor: "blue", avatarId: "blue", avatarName: "Blue" },
    lyrics: { sha256: "abc123" },
    lore: { mood: "protective longing", relationshipLens: "A mentor leaves a route home." },
    referenceConnectors: [{
      id: "route-light:star-fox:line-3",
      referenceId: "star-fox",
      referenceTitle: "Star Fox 64",
      target: { songId: "route-light", lineStart: 3, lyricText: "Roll left on Z", matchedText: "left on Z" },
      semanticEffect: {
        withoutContext: "A movement instruction.",
        withContext: "A mentor voice becomes available.",
        thematicShift: "Navigation becomes inherited care.",
        expositionFunction: "Import tactile game memory."
      }
    }],
    contextualLayers: [{
      id: "public-games",
      label: "Public games",
      referenceIds: ["star-fox"],
      connectorIds: ["route-light:star-fox:line-3"]
    }]
  }],
  updatedAt: "2026-07-18T23:00:00.000Z"
};

test("Echo lineage treats the later visualizer title as an alias, not a new song identity", () => {
  const lineage = createEchoAlbumLineageFromSongStore(songStore);
  assert.equal(lineage.sourceAlbum.title, "Dear Papa");
  assert.equal(lineage.activeProjection.title, "Echo Album");
  assert.deepEqual(lineage.aliases, ["Dear Papa", "Echo Album"]);
  assert.match(lineage.identityRule, /lyrics SHA-256 before album title/);
});

test("Echo hydration carries connectors, context layers, primitives, and graph provenance into a Song Choice", () => {
  const choice = hydrateEchoSongChoice({
    id: "blue-route-light",
    songId: "route-light",
    whySelected: "Blue follows the route light."
  }, songStore.songs[0], songStore, { graphHash: "graph123" });

  assert.equal(choice.schemaVersion, ECHO_SONG_CHOICE_SCHEMA);
  assert.equal(choice.lineageKey, "lyrics-sha256:abc123");
  assert.equal(choice.activeAlbumProjection.title, "Echo Album");
  assert.equal(choice.referenceConnectors[0].semanticEffect.withContext, "A mentor voice becomes available.");
  assert.equal(choice.contextualLayers[0].id, "public-games");
  assert.deepEqual(choice.semanticPrimitives.mechanics, ["controller muscle memory"]);
  assert.deepEqual(choice.semanticPrimitives.emotionalVectors, ["protective longing", "A mentor leaves a route home."]);
  assert.deepEqual(choice.referenceGraphSnapshot.referenceIds, ["star-fox"]);
  assert.deepEqual(choice.referenceGraphSnapshot.graphEdgeIds, ["star-fox:mentorship:crew"]);
  assert.equal(choice.referenceGraphSnapshot.graphHash, "graph123");
});

test("Avatar Mind normalization preserves the hydrated Echo graph instead of dropping it", () => {
  const choice = hydrateEchoSongChoice({ id: "blue-route-light", songId: "route-light" }, songStore.songs[0], songStore, { graphHash: "graph123" });
  const graph = createEchoReferenceMindContextFromSongStore(songStore, {
    graphHash: "graph123",
    ingestionRunId: "test-run",
    updatedAt: "2026-07-18T23:05:00.000Z"
  });
  const mind = normalizeAvatarMind({
    dearPapaSongContext: {
      albumTitle: "Dear Papa",
      albumAliases: ["Dear Papa", "Echo Album"],
      albumLineage: graph.albumLineage,
      echoReferenceGraph: graph,
      selectedSongCards: [choice]
    }
  }, { id: "blue", primaryName: "Blue" });

  assert.equal(mind.dearPapaSongContext.echoReferenceGraph.graphHash, "graph123");
  assert.equal(mind.dearPapaSongContext.selectedSongCards[0].referenceConnectors.length, 1);
  assert.equal(mind.dearPapaSongContext.selectedSongCards[0].referenceGraphSnapshot.graphHash, "graph123");
  assert.deepEqual(mind.dearPapaSongContext.selectedSongCards[0].albumAliases, ["Dear Papa", "Echo Album"]);
});
