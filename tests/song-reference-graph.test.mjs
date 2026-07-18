import test from "node:test";
import assert from "node:assert/strict";
import {
  ECHO_SEMANTIC_TRAVERSAL_SCHEMA,
  SONG_REFERENCE_CATALOG_SCHEMA,
  normalizeEchoSemanticTraversal,
  normalizeSongReferenceCatalog,
  normalizeSongReferenceConnectors,
  referenceCatalogIndex
} from "../src/domain/song-reference-graph.js";

test("reference catalog deduplicates IDs and keeps source provenance", () => {
  const catalog = normalizeSongReferenceCatalog([
    { id: "guardians", title: "Guardians", source: { url: "https://www.marvel.com/gotgvol2" } },
    { id: "guardians", title: "Duplicate" }
  ]);
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].schemaVersion, SONG_REFERENCE_CATALOG_SCHEMA);
  assert.equal(referenceCatalogIndex(catalog).get("guardians").source.url, "https://www.marvel.com/gotgvol2");
});

test("reference connector normalization keeps lyric evidence separate from inference", () => {
  const [connector] = normalizeSongReferenceConnectors([{
    referenceId: "guardians",
    referenceTitle: "Guardians",
    target: { songId: "song-one", lineStart: 8, lyricText: "Found a crew", matchedText: "crew" },
    semanticEffect: { withContext: "Chosen family becomes available.", traversalEdges: ["crew", "found-family"] }
  }]);
  assert.equal(connector.id, "song-one:guardians:line-8");
  assert.equal(connector.target.lyricText, "Found a crew");
  assert.equal(connector.semanticEffect.withContext, "Chosen family becomes available.");
  assert.equal(connector.provenance.reviewStatus, "assistant-analyzed-pending-human-review");
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
