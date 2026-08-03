import assert from "node:assert/strict";
import test from "node:test";

import {
  buildIntegrityCheckedEchoVideoEnrichmentAudit,
} from "../scripts/audit-echo-video-enrichment.mjs";
import {
  ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
  buildEchoVideoEnrichmentCatalog,
} from "../src/domain/echo-enrichment-director-variant.js";

const hash = "a".repeat(64);
const mediaId = `hapa-media:sha256:${hash}`;

function fixture() {
  const enrichment = {
    schemaVersion: "hapa.echo.video-enrichment.v1",
    id: mediaId,
    mediaId,
    contentHash: { algorithm: "sha256", value: hash },
    runtimeUri: "/media/video-a.mp4",
    playable: true,
    mediaKind: "video",
    decodeStatus: "decoded",
    recognition: {
      synopsis: "A figure crosses a luminous garden.",
      arcSynopsis: "Stillness becomes motion and resolves at a gate.",
      tags: ["place:garden"],
      frames: ["first", "mid", "last"].map((marker) => ({
        marker,
        evaluationStatus: "ready",
        available: true,
      })),
    },
    quality: { score: 87, percentile: 94 },
    sourcePrior: { sourceClass: "verified-ordinary", prior: 1 },
    flow: {
      loop: { classification: "loop-candidate" },
      transition: { classification: "not-transition" },
    },
  };
  const graph = { edges: [] };
  const catalog = buildEchoVideoEnrichmentCatalog({ enrichments: [enrichment], chainGraph: graph, report: {} });
  const sourceReport = {
    schemaVersion: "hapa.echo.video-enrichment-report.v1",
    complete: true,
    batchFingerprint: `sha256:${catalog.computedFingerprint}`,
    counts: { manifestVideos: 1, enrichmentRows: 1, chainEdges: 0 },
  };
  const variant = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id: "intentional-a",
    parent: { songId: "song-a" },
    lineage: { kind: "append-only-intentional-enrichment" },
    timeline: [{
      decision_evidence: {
        schemaVersion: ECHO_ENRICHMENT_SHOT_EVIDENCE_SCHEMA,
        selectedMediaId: mediaId,
        enrichmentId: mediaId,
        lyrics: { status: "lyrics-unavailable", explicitLyricsUnavailable: true },
        rationale: "The luminous garden supplies the documented visual beat.",
      },
    }],
  };
  return {
    manifest: [{ id: mediaId }],
    enrichments: [enrichment],
    graph,
    sourceReport,
    songs: [{ id: "song-a" }],
    variants: [variant],
    output: "/fixture/catalog",
    generatedAt: "2026-08-02T00:00:00.000Z",
  };
}

test("a coherent persisted generation can emit ok with a verified catalog receipt", () => {
  const result = buildIntegrityCheckedEchoVideoEnrichmentAudit(fixture());

  assert.equal(result.report.ok, true);
  assert.equal(result.report.catalogIntegrity.verified, true);
  assert.equal(result.report.catalogIntegrity.enrichmentRows, 1);
  assert.equal(result.report.catalogIntegrity.chainEdges, 0);
  assert.equal(result.report.catalogIntegrity.manifestVideos, 1);
});
test("a stale persisted report fingerprint cannot emit an audit result", () => {
  const input = fixture();
  input.sourceReport.batchFingerprint = `sha256:${"b".repeat(64)}`;

  assert.throws(
    () => buildIntegrityCheckedEchoVideoEnrichmentAudit(input),
    (error) => error?.code === "fingerprint-mismatch",
  );
});

test("mixed persisted graph/count generations cannot emit an audit result", () => {
  const input = fixture();
  input.graph.edges.push({
    sourceMediaId: mediaId,
    targetMediaId: mediaId,
    score: 0.8,
    kind: "last-to-first",
  });

  assert.throws(
    () => buildIntegrityCheckedEchoVideoEnrichmentAudit(input),
    (error) => ["fingerprint-mismatch", "chain-edge-count-mismatch"].includes(error?.code),
  );
});
