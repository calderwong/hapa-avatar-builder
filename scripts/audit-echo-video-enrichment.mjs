#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditEchoVideoEnrichments,
  auditIntentionalDirectorVariants,
  buildSourceBiasFeedback,
} from "../src/domain/echo-enrichment-audit.js";
import { validateEchoEnrichmentCatalogIntegrity } from "../src/domain/echo-enrichment-catalog-integrity.js";
import { buildEchoVideoEnrichmentCatalog } from "../src/domain/echo-enrichment-director-variant.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = path.resolve(process.argv.find((arg) => arg.startsWith("--output="))?.slice(9) || path.join(ROOT, "artifacts/echo-video-enrichment-v1"));
const VARIANTS = path.join(ROOT, "data/music-video-project-variants");
const APPLY = process.argv.includes("--apply");

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    if (fallback !== null && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function readNdjson(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").split(/\r?\n/u).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid NDJSON at ${file}:${index + 1}: ${error.message}`, { cause: error });
    }
  });
}

function songRows(payload = {}) {
  return payload.songs || payload.songCards || payload.records || [];
}

function enrichmentIds(rows = []) {
  return rows.map((row) => row.id || row.mediaId || row.canonicalMediaId).filter(Boolean);
}

function playableEnrichmentIds(rows = []) {
  return rows.filter((row) => row.playable === true && row.decodeStatus === "decoded" && row.mediaKind === "video")
    .map((row) => row.id || row.mediaId || row.canonicalMediaId).filter(Boolean);
}

function chainEdges(graph = {}) {
  return graph.edges || graph.candidates || graph.transitions || [];
}

function isIntentionalEnrichmentVariant(variant = {}) {
  return Boolean(
    variant.enrichmentLineage
      || String(variant.variationSet?.id || "").startsWith("echo-video-enrichment-")
      || String(variant.sourcePolicy?.mode || "").includes("semantic-quality-continuity"),
  );
}

function readIntentionalVariants() {
  if (!fs.existsSync(VARIANTS)) return [];
  const currentReport = readJson(path.join(ROOT, "artifacts/echo-enrichment-director-variants/report.json"), {});
  const currentIds = new Set((currentReport?.variants?.cuts || []).map((cut) => cut?.variantId).filter(Boolean));
  const rows = [];
  for (const directory of fs.readdirSync(VARIANTS, { withFileTypes: true })) {
    if (!directory.isDirectory() || directory.isSymbolicLink()) continue;
    const absolute = path.join(VARIANTS, directory.name);
    for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
      if (!entry.isFile() || entry.isSymbolicLink() || !entry.name.endsWith(".json")) continue;
      const variant = readJson(path.join(absolute, entry.name));
      if (isIntentionalEnrichmentVariant(variant) && (!currentIds.size || currentIds.has(variant.id))) rows.push(variant);
    }
  }
  return rows;
}

function selectionsFromVariants(variants = []) {
  return variants.flatMap((variant) => (variant.timeline || []).flatMap((shot) => {
    const evidence = shot.decision_evidence || shot.decisionEvidence || shot.enrichmentDecision || shot.hapa?.shotDecisionEvidence || {};
    const applied = {
      songId: variant.parent?.songId || variant.songId,
      variantId: variant.id,
      mediaId: evidence.selectedMediaId || evidence.enrichmentId || evidence.mediaId || evidence.enrichment?.mediaId || evidence.enrichment?.enrichmentId,
      sourcePrior: evidence.sourcePrior || evidence.enrichment?.sourcePrior,
      selectionKind: "post-prior",
    };
    const counterfactual = evidence.sourceBiasCounterfactual?.selectedCandidate || null;
    return [applied, counterfactual ? {
      songId: applied.songId,
      variantId: applied.variantId,
      mediaId: counterfactual.mediaId || counterfactual.enrichmentId,
      selectionKind: "intrinsic-counterfactual",
    } : null].filter((row) => row?.mediaId);
  }));
}

function writeJson(file, payload) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

export function verifyPersistedEchoVideoEnrichmentCatalog({ enrichments = [], graph = {}, sourceReport = {} } = {}) {
  const catalog = buildEchoVideoEnrichmentCatalog({ enrichments, chainGraph: graph, report: sourceReport });
  return validateEchoEnrichmentCatalogIntegrity({ catalog, report: sourceReport });
}

export function buildIntegrityCheckedEchoVideoEnrichmentAudit({
  manifest = [],
  enrichments = [],
  graph = {},
  sourceReport = {},
  songs = [],
  variants = [],
  output = "",
  generatedAt = new Date().toISOString(),
} = {}) {
  // This gate intentionally runs before any audit can construct an `ok` claim.
  // A stale or mixed persisted generation throws and produces no audit receipt.
  const catalogIntegrity = verifyPersistedEchoVideoEnrichmentCatalog({ enrichments, graph, sourceReport });
  const videoAudit = auditEchoVideoEnrichments({ manifest, enrichments, chainEdges: chainEdges(graph) });
  const directorAudit = auditIntentionalDirectorVariants({
    songs,
    variants,
    enrichmentIds: enrichmentIds(enrichments),
    playableEnrichmentIds: playableEnrichmentIds(enrichments),
  });
  const selections = selectionsFromVariants(variants);
  const sourceBias = buildSourceBiasFeedback({ enrichments, selections });
  return {
    report: {
      schemaVersion: "hapa.echo.video-enrichment-full-audit.v1",
      generatedAt,
      ok: catalogIntegrity.verified === true && videoAudit.ok && directorAudit.ok,
      output,
      catalogIntegrity,
      videoAudit,
      directorAudit,
      sourceBiasSummary: sourceBias.totals,
      claims: {
        canonPromotion: false,
        mint: false,
        publicActivation: false,
        prototypeStage: true,
      },
    },
    sourceBias,
  };
}

function main() {
  const manifest = readNdjson(path.join(OUTPUT, "manifest.ndjson"));
  const enrichments = readNdjson(path.join(OUTPUT, "enrichments.ndjson"));
  const graph = readJson(path.join(OUTPUT, "chain-graph.json"), {});
  const sourceReport = readJson(path.join(OUTPUT, "report.json"));
  const songs = songRows(readJson(path.join(ROOT, "data/hapa-songs-store.json"), {}));
  const variants = readIntentionalVariants();
  const { report, sourceBias } = buildIntegrityCheckedEchoVideoEnrichmentAudit({
    manifest,
    enrichments,
    graph,
    sourceReport,
    songs,
    variants,
    output: OUTPUT,
  });

  if (APPLY) {
    writeJson(path.join(OUTPUT, "audit-report.json"), report);
    writeJson(path.join(OUTPUT, "source-bias-feedback.json"), sourceBias);
  }

  console.log(JSON.stringify({
    ok: report.ok,
    apply: APPLY,
    output: OUTPUT,
    catalogIntegrity: report.catalogIntegrity,
    video: report.videoAudit.totals,
    director: report.directorAudit.totals,
    sourceBias: sourceBias.totals,
    reportsWritten: APPLY ? ["audit-report.json", "source-bias-feedback.json"] : [],
  }, null, 2));
  if (!report.ok) process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
