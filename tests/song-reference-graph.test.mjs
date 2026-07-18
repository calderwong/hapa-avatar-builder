import test from "node:test";
import assert from "node:assert/strict";
import {
  ECHO_SEMANTIC_TRAVERSAL_SCHEMA,
  SONG_REFERENCE_CATALOG_SCHEMA,
  SONG_REFERENCE_GRAPH_EDGE_SCHEMA,
  normalizeEchoSemanticTraversal,
  normalizeSongReferenceCatalog,
  normalizeSongReferenceConnectors,
  normalizeSongReferenceGraphEdges,
  referenceCatalogIndex
} from "../src/domain/song-reference-graph.js";

test("reference catalog deduplicates IDs and keeps source provenance", () => {
  const catalog = normalizeSongReferenceCatalog([
    { id: "guardians", title: "Guardians", mechanics: ["crew"], signalLexicon: { phonetic: ["guard-ee-ans"] }, source: { url: "https://www.marvel.com/gotgvol2" } },
    { id: "guardians", title: "Duplicate" }
  ]);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].schemaVersion, SONG_REFERENCE_CATALOG_SCHEMA);
  assert.equal(referenceCatalogIndex(catalog).get("guardians").source.url, "https://www.marvel.com/gotgvol2");
  assert.deepEqual(catalog[0].mechanics, ["crew"]);
  assert.deepEqual(catalog[0].signalLexicon.phonetic, ["guard-ee-ans"]);
});

test("reference connector normalization keeps lyric evidence separate from inference", () => {
  const [connector] = normalizeSongReferenceConnectors([{
    referenceId: "guardians",
    referenceTitle: "Guardians",
    target: { songId: "song-one", lineStart: 8, lyricText: "Found a crew", matchedText: "crew" },
    semanticEffect: { withContext: "Chosen family becomes available.", traversalEdges: ["crew", "found-family"] },
    evidence: { classification: "candidate-multisignal", score: 0.72, channels: ["phonetic", "mechanical"], caveat: "Needs review." }
  }]);
  assert.equal(connector.id, "song-one:guardians:line-8");
  assert.equal(connector.target.lyricText, "Found a crew");
  assert.equal(connector.semanticEffect.withContext, "Chosen family becomes available.");
  assert.equal(connector.provenance.reviewStatus, "assistant-analyzed-pending-human-review");
  assert.equal(connector.evidence.classification, "candidate-multisignal");
  assert.equal(connector.evidence.score, 0.72);
  assert.deepEqual(connector.evidence.channels, ["phonetic", "mechanical"]);
});

test("cross-reference edges preserve comparative evidence without asserting canon", () => {
  const [edge] = normalizeSongReferenceGraphEdges([{
    fromReferenceId: "farseer",
    toReferenceId: "ff8",
    relationType: "bond-memory-fate",
    score: 0.69,
    sharedMechanics: ["memory", "bond"],
    rationale: "Both connect identity to memory and relationship."
  }]);
  assert.equal(edge.schemaVersion, SONG_REFERENCE_GRAPH_EDGE_SCHEMA);
  assert.equal(edge.evidenceClass, "source-backed-comparative");
  assert.equal(edge.score, 0.69);
  assert.deepEqual(edge.sharedMechanics, ["memory", "bond"]);
});

test("semantic traversal preserves layered readings without promoting canon", () => {
  const traversal = normalizeEchoSemanticTraversal({
    thesis: "Meaning grows as context is loaded.",
    expositionModel: [{ stage: "surface", reading: "Care remains audible." }],
    traversalRules: ["Keep evidence distinct from inference."],
    contextAnchors: [{ id: "asante", label: "Asante", summary: "A shared gratitude key." }]
  });
  assert.equal(traversal.schemaVersion, ECHO_SEMANTIC_TRAVERSAL_SCHEMA);
  assert.equal(traversal.contextAnchors[0].reviewStatus, "conversation-grounded-soft-context");
  assert.equal(traversal.reviewStatus, "assistant-analyzed-pending-human-review");
});
