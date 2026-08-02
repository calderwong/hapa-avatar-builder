export const ECHO_VIDEO_ENRICHMENT_REPORT_SCHEMA = "hapa.echo.video-enrichment-report.v1";
export const ECHO_ENRICHMENT_CATALOG_INTEGRITY_RECEIPT_SCHEMA = "hapa.echo.enrichment-catalog-integrity-receipt.v1";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;

export class EchoEnrichmentCatalogIntegrityError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "EchoEnrichmentCatalogIntegrityError";
    this.code = code;
  }
}
function fail(code, message) {
  throw new EchoEnrichmentCatalogIntegrityError(code, message);
}

function record(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid-object", `${label} must be an object.`);
  }
  return value;
}

function array(value, label) {
  if (!Array.isArray(value)) fail("invalid-catalog-collection", `${label} must be an array.`);
  return value;
}

function sha256(value, label, code) {
  if (typeof value !== "string" || !value.trim()) fail(code, `${label} is required.`);
  const normalized = value.trim().toLowerCase().replace(/^sha256:/u, "");
  if (!SHA256_PATTERN.test(normalized)) fail(code, `${label} must be a SHA-256 digest with an optional sha256: prefix.`);
  return normalized;
}

function count(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail("invalid-report-count", `${label} must be a non-negative safe integer.`);
  }
  return value;
}

/**
 * Verifies that an exported enrichment report describes exactly the catalog
 * material presented to a downstream Director compiler. Invalid or incomplete
 * inputs throw; no best-effort identity is synthesized.
 */
export function validateEchoEnrichmentCatalogIntegrity({ catalog, report } = {}) {
  const checkedCatalog = record(catalog, "catalog");
  const checkedReport = record(report, "report");

  if (checkedReport.schemaVersion !== ECHO_VIDEO_ENRICHMENT_REPORT_SCHEMA) {
    fail(
      "unexpected-report-schema",
      `report.schemaVersion must equal ${ECHO_VIDEO_ENRICHMENT_REPORT_SCHEMA}.`,
    );
  }
  if (checkedReport.complete !== true) {
    fail("incomplete-report", "report.complete must be true.");
  }

  const computedFingerprint = sha256(
    checkedCatalog.computedFingerprint,
    "catalog.computedFingerprint",
    "invalid-computed-fingerprint",
  );
  const declaredFingerprint = sha256(
    checkedReport.batchFingerprint,
    "report.batchFingerprint",
    "invalid-declared-fingerprint",
  );
  if (declaredFingerprint !== computedFingerprint) {
    fail("fingerprint-mismatch", "The report fingerprint does not match the computed catalog fingerprint.");
  }

  const rows = array(checkedCatalog.rows, "catalog.rows");
  const edges = array(checkedCatalog.edges, "catalog.edges");
  const counts = record(checkedReport.counts, "report.counts");
  const enrichmentRows = count(counts.enrichmentRows, "report.counts.enrichmentRows");
  const chainEdges = count(counts.chainEdges, "report.counts.chainEdges");
  const manifestVideos = count(counts.manifestVideos, "report.counts.manifestVideos");

  if (enrichmentRows !== rows.length) {
    fail("enrichment-row-count-mismatch", "The report enrichment row count does not match catalog.rows.");
  }
  if (chainEdges !== edges.length) {
    fail("chain-edge-count-mismatch", "The report chain edge count does not match catalog.edges.");
  }
  if (manifestVideos !== enrichmentRows) {
    fail("manifest-enrichment-count-mismatch", "The report manifest video count does not match its enrichment row count.");
  }

  return Object.freeze({
    schemaVersion: ECHO_ENRICHMENT_CATALOG_INTEGRITY_RECEIPT_SCHEMA,
    verified: true,
    batchFingerprint: `sha256:${computedFingerprint}`,
    enrichmentRows,
    chainEdges,
    manifestVideos,
  });
}
