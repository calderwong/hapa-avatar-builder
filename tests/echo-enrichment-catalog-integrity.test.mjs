import test from "node:test";
import assert from "node:assert/strict";

import {
  ECHO_ENRICHMENT_CATALOG_INTEGRITY_RECEIPT_SCHEMA,
  ECHO_VIDEO_ENRICHMENT_REPORT_SCHEMA,
  EchoEnrichmentCatalogIntegrityError,
  validateEchoEnrichmentCatalogIntegrity,
} from "../src/domain/echo-enrichment-catalog-integrity.js";

const digest = "a".repeat(64);

function fixture() {
  return {
    catalog: {
      computedFingerprint: digest,
      rows: [{ id: "video-a" }, { id: "video-b" }],
      edges: [{ from: "video-a", to: "video-b" }],
    },
    report: {
      schemaVersion: ECHO_VIDEO_ENRICHMENT_REPORT_SCHEMA,
      complete: true,
      batchFingerprint: `sha256:${digest}`,
      counts: {
        manifestVideos: 2,
        enrichmentRows: 2,
        chainEdges: 1,
      },
    },
  };
}

function assertIntegrityError(operation, code) {
  assert.throws(operation, (error) => (
    error instanceof EchoEnrichmentCatalogIntegrityError && error.code === code
  ));
}

test("returns a compact deterministic receipt for a coherent complete catalog batch", () => {
  const input = fixture();
  const receipt = validateEchoEnrichmentCatalogIntegrity(input);

  assert.deepEqual(receipt, {
    schemaVersion: ECHO_ENRICHMENT_CATALOG_INTEGRITY_RECEIPT_SCHEMA,
    verified: true,
    batchFingerprint: `sha256:${digest}`,
    enrichmentRows: 2,
    chainEdges: 1,
    manifestVideos: 2,
  });
  assert.equal(Object.isFrozen(receipt), true);
  assert.deepEqual(validateEchoEnrichmentCatalogIntegrity(input), receipt);
});
test("normalizes an optional SHA-256 prefix on either fingerprint", () => {
  const input = fixture();
  input.catalog.computedFingerprint = `SHA256:${digest.toUpperCase()}`;
  input.report.batchFingerprint = digest.toUpperCase();

  assert.equal(validateEchoEnrichmentCatalogIntegrity(input).batchFingerprint, `sha256:${digest}`);
});

test("rejects an unexpected report schema and any report not explicitly complete", () => {
  const wrongSchema = fixture();
  wrongSchema.report.schemaVersion = "hapa.echo.video-enrichment-report.v0";
  assertIntegrityError(
    () => validateEchoEnrichmentCatalogIntegrity(wrongSchema),
    "unexpected-report-schema",
  );

  for (const complete of [false, null, "true", undefined]) {
    const input = fixture();
    input.report.complete = complete;
    assertIntegrityError(
      () => validateEchoEnrichmentCatalogIntegrity(input),
      "incomplete-report",
    );
  }
});

test("rejects missing, malformed, and mismatched fingerprints", () => {
  for (const batchFingerprint of [undefined, "", "sha256:not-a-digest", "b".repeat(63)]) {
    const input = fixture();
    input.report.batchFingerprint = batchFingerprint;
    assertIntegrityError(
      () => validateEchoEnrichmentCatalogIntegrity(input),
      "invalid-declared-fingerprint",
    );
  }

  const malformedComputed = fixture();
  malformedComputed.catalog.computedFingerprint = "not-a-digest";
  assertIntegrityError(
    () => validateEchoEnrichmentCatalogIntegrity(malformedComputed),
    "invalid-computed-fingerprint",
  );

  const mismatch = fixture();
  mismatch.report.batchFingerprint = `sha256:${"b".repeat(64)}`;
  assertIntegrityError(
    () => validateEchoEnrichmentCatalogIntegrity(mismatch),
    "fingerprint-mismatch",
  );
});

test("requires exact global row, edge, and manifest counts", () => {
  const rowMismatch = fixture();
  rowMismatch.report.counts.enrichmentRows = 1;
  assertIntegrityError(
    () => validateEchoEnrichmentCatalogIntegrity(rowMismatch),
    "enrichment-row-count-mismatch",
  );

  const edgeMismatch = fixture();
  edgeMismatch.report.counts.chainEdges = 2;
  assertIntegrityError(
    () => validateEchoEnrichmentCatalogIntegrity(edgeMismatch),
    "chain-edge-count-mismatch",
  );

  const manifestMismatch = fixture();
  manifestMismatch.report.counts.manifestVideos = 1;
  assertIntegrityError(
    () => validateEchoEnrichmentCatalogIntegrity(manifestMismatch),
    "manifest-enrichment-count-mismatch",
  );
});

test("rejects absent, coerced, negative, or fractional global counts", () => {
  for (const invalid of [undefined, "2", -1, 1.5, Number.NaN]) {
    const input = fixture();
    input.report.counts.enrichmentRows = invalid;
    assertIntegrityError(
      () => validateEchoEnrichmentCatalogIntegrity(input),
      "invalid-report-count",
    );
  }
});
