import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEchoReferenceConstellationEdges,
  buildEchoReferenceConstellations,
} from "../src/domain/echo-reference-mining.js";

function occurrence(id, songId, line) {
  return {
    id,
    songId,
    songTitle: songId,
    confidence: 0.8,
    lyricSpan: { lineStart: line, lineEnd: line, lyricText: id },
  };
}

function card(id, { songs = [], themes = [], mechanics = [] } = {}) {
  return {
    id: `reference:${id}`,
    title: id,
    themes,
    mechanics,
    occurrences: songs.map(([songId, line], index) => occurrence(`${id}-${index}`, songId, line)),
  };
}

test("reference constellation edges require shared-song support plus recurrence or semantics", () => {
  const cards = [
    card("watch", { songs: [["one", 10], ["two", 4]], themes: ["duty"], mechanics: ["demobilization"] }),
    card("winter", { songs: [["one", 12]], themes: ["duty"], mechanics: ["demobilization"] }),
    card("bridge", { songs: [["one", 40], ["two", 20]], themes: ["repair"] }),
    card("unrelated", { songs: [["three", 1]], themes: ["duty"], mechanics: ["demobilization"] }),
    card("motif", { songs: [["one", 11]], themes: ["duty"], mechanics: ["demobilization"] }),
  ];
  cards.at(-1).id = "reference-card:motif";

  const result = buildEchoReferenceConstellationEdges(cards, {
    maxConnectionsPerCard: 10,
    maxLineDistance: 4,
    runId: "run",
    packetHash: "packet",
  });

  assert.equal(result.edges.some((edge) => (
    [edge.fromId, edge.toId].includes("reference:watch")
    && [edge.fromId, edge.toId].includes("reference:winter")
  )), true);
  assert.equal(result.edges.some((edge) => (
    [edge.fromId, edge.toId].includes("reference:watch")
    && [edge.fromId, edge.toId].includes("reference:bridge")
  )), true, "two shared songs support a bounded recurrence connection");
  assert.equal(result.edges.some((edge) => [edge.fromId, edge.toId].includes("reference:unrelated")), false);
  assert.equal(result.edges.some((edge) => [edge.fromId, edge.toId].includes("reference-card:motif")), false);

  const watchWinter = result.edges.find((edge) => (
    [edge.fromId, edge.toId].includes("reference:watch")
    && [edge.fromId, edge.toId].includes("reference:winter")
  ));
  assert.equal(watchWinter.relationType, "co-activated-with");
  assert.deepEqual(watchWinter.support.sharedSongIds, ["one"]);
  assert.deepEqual(watchWinter.support.sharedThemes, ["duty"]);
  assert.deepEqual(watchWinter.support.sharedMechanics, ["demobilization"]);
  assert.equal(watchWinter.support.lineProximity[0].distance, 2);
  assert.equal(watchWinter.support.channelCount >= 3, true);
  assert.equal(watchWinter.humanApproved, false);
});

test("reference constellation projection groups connected source-backed cards without promoting them", () => {
  const cards = [
    card("a", { songs: [["one", 1]], themes: ["crew"], mechanics: ["board"] }),
    card("b", { songs: [["one", 2]], themes: ["crew"], mechanics: ["board"] }),
    card("c", { songs: [["one", 3]], themes: ["crew"], mechanics: ["board"] }),
  ];
  const { edges } = buildEchoReferenceConstellationEdges(cards);
  const constellations = buildEchoReferenceConstellations(cards, edges);

  assert.equal(constellations.length, 1);
  assert.deepEqual(constellations[0].cardIds, ["reference:a", "reference:b", "reference:c"]);
  assert.equal(constellations[0].status, "proposed");
  assert.equal(constellations[0].humanApproved, false);
  assert.match(constellations[0].explanation, /reviewable/u);
});
