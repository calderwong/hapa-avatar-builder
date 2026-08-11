#!/usr/bin/env node
/**
 * Builds a derived Echo enrichment catalog that carries pending-human optical
 * descriptions and frame palettes into an append-only Director proposal pass.
 * It never edits the source catalog or human enrichment store.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const outputDirectory = path.join(root, "artifacts", "echo-optical-proposal-director-pass");
const reviewPath = path.join(root, "data", "human-video-agent-reviews.json");
const sourceDirectory = path.join(root, "artifacts", "echo-video-enrichment-v1");
const sourceRowsPath = path.join(sourceDirectory, "enrichments.ndjson");
const sourceChainPath = path.join(sourceDirectory, "chain-graph.json");
const sourceReportPath = path.join(sourceDirectory, "report.json");

const [reviewStore, sourceRows, chainGraph, sourceReport] = await Promise.all([
  readJson(reviewPath),
  readNdjson(sourceRowsPath),
  readJson(sourceChainPath),
  readJson(sourceReportPath),
]);
const reviews = (reviewStore.reviews || []).filter((review) => (
  review?.status === "pending-human"
  && review?.proposal?.description
  && ["first", "mid", "last"].every((role) => (
    (review.evidence?.frames || []).some((frame) => frame.role === role && (frame.palette?.colors || []).length >= 3)
  ))
));
const byUri = new Map(reviews.map((review) => [normalizeUri(review.videoIdentity?.uri), review]));
if (byUri.size !== reviews.length || [...byUri.keys()].some((key) => !key)) {
  throw new Error("Optical proposal review URIs must be non-empty and unique before building a Director overlay.");
}

let matched = 0;
const derivedRows = sourceRows.flatMap((row) => {
  const review = byUri.get(normalizeUri(mediaUri(row)));
  if (!review) return [];
  matched += 1;
  return [{
    ...row,
    opticalProposal: {
      authority: "pending-human optical proposal; not human-authored direction",
      reviewId: review.id,
      reviewStatus: review.status,
      description: review.proposal.description,
      frames: review.evidence.frames.map((frame) => ({
        role: frame.role,
        sha256: frame.sha256,
        palette: (frame.palette?.colors || []).map((color) => color.hex),
      })),
    },
  }];
});
const report = {
  schemaVersion: "hapa.echo.video-enrichment-report.v1",
  complete: true,
  generatedAt: new Date().toISOString(),
  batchFingerprint: "",
  counts: {
    enrichmentRows: derivedRows.length,
    chainEdges: 0,
    manifestVideos: derivedRows.length,
    pendingHumanOpticalReviews: reviews.length,
    matchedOpticalProposals: matched,
  },
  source: {
    enrichmentCatalog: sourceRowsPath,
    sourceBatchFingerprint: sourceReport.batchFingerprint || "",
    opticalReviewStore: reviewPath,
  },
  truthBoundary: "This derived catalog exposes pending-human optical descriptions and frame palettes to an append-only Director proposal pass. It is not human validation or production direction authority.",
};
const derivedChainGraph = {
  ...chainGraph,
  // This proposal pass does not mint transition authority from pending-human
  // optical evidence. Existing, validated parent transition decisions remain
  // inherited by the Director compiler.
  declaredTransitions: [],
  declared_transitions: [],
};

// The compiler verifies this against its own normalized catalog fingerprint.
const { buildEchoVideoEnrichmentCatalog } = await import("../src/domain/echo-enrichment-director-variant.js");
const catalog = buildEchoVideoEnrichmentCatalog({ enrichments: derivedRows, chainGraph: derivedChainGraph, report: { ...report, batchFingerprint: sourceReport.batchFingerprint || "sha256:0000000000000000000000000000000000000000000000000000000000000000" } });
report.batchFingerprint = `sha256:${catalog.computedFingerprint}`;
report.counts.chainEdges = catalog.edges.length;

const summary = {
  mode: apply ? "apply" : "dry-run",
  sourceRows: sourceRows.length,
  eligiblePendingHumanReviews: reviews.length,
  matchedOpticalProposals: matched,
  unmatchedOpticalProposals: reviews.length - matched,
  outputDirectory,
  catalogFingerprint: report.batchFingerprint,
};
if (!apply) {
  console.log(JSON.stringify(summary, null, 2));
  process.exit(0);
}
await mkdir(outputDirectory, { recursive: true });
await writeAtomic(path.join(outputDirectory, "enrichments.ndjson"), `${derivedRows.map((row) => JSON.stringify(row)).join("\n")}\n`);
await writeAtomic(path.join(outputDirectory, "chain-graph.json"), `${JSON.stringify(derivedChainGraph, null, 2)}\n`);
await writeAtomic(path.join(outputDirectory, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
await writeAtomic(path.join(outputDirectory, "overlay-report.json"), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));

function normalizeUri(value) {
  return String(value || "").toLowerCase().replace(/[?#].*$/u, "").replace(/^\/media\//u, "/").replace(/[^a-z0-9]/gu, "");
}

function mediaUri(row = {}) {
  return row.runtimeUri || row.runtimeMediaUri || row.mediaUri || row.media?.uri || row.asset?.uri || row.video?.uri || row.mediaContract?.runtimeUri || row.mediaContract?.originalUri || "";
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readNdjson(filePath) {
  return (await readFile(filePath, "utf8")).split(/\r?\n/u).filter(Boolean).map(JSON.parse);
}

async function writeAtomic(filePath, contents) {
  const temporary = `${filePath}.${process.pid}.${Date.now()}.${createHash("sha256").update(filePath).digest("hex").slice(0, 8)}.tmp`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, filePath);
}
