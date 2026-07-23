#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildEchoReferenceDirectorScripts,
  buildEchoReferenceObservability,
  echoReferenceDigest,
} from "../src/domain/echo-reference-mining.js";
import { createEchoReferenceMiningStore } from "../server/echo-reference-mining-store.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const miningRoot = path.join(projectRoot, "data/echo-reference-mining");
const store = createEchoReferenceMiningStore({
  root: miningRoot,
  songStorePath: path.join(projectRoot, "data/hapa-songs-store.json"),
});
const run = await store.run({
  apply: true,
  allowExternalResearch: false,
  maxCandidatesPerSong: 8,
});
const migration = await store.migrateRunCards(run, {
  actor: "local-deterministic-miner",
  createdAt: run.generatedAt,
});
const approvedDirectorScripts = buildEchoReferenceDirectorScripts(run);
const exploratoryDirectorScripts = buildEchoReferenceDirectorScripts(run, {
  exploratoryDraft: true,
});
const observability = buildEchoReferenceObservability(run, {
  contributionEvents: await store.contributions(),
});
const reportCore = {
  schemaVersion: "hapa.echo-reference-album-materialization-report.v1",
  generatedAt: run.generatedAt,
  runId: run.runId,
  runHash: run.runHash,
  packetHash: run.packetHash,
  graphHash: run.graph.graphHash,
  scope: run.scope,
  songs: run.packet.album.songCount,
  pairs: run.audit.pairsCompared,
  legacyCatalogEntries: run.audit.legacyCatalogEntries,
  migratedLegacyCards: run.audit.migratedLegacyCards,
  unmappedLegacyReferenceIds: run.audit.unmappedLegacyReferenceIds,
  cards: run.audit.validCards,
  graphEdges: run.graph.counts.edges,
  unresolved: run.unresolved.length,
  invalidCards: run.audit.invalidCards,
  publicCards: run.audit.publicCards,
  canonCards: run.audit.canonCards,
  externalLookups: run.audit.externalLookups,
  revisionMigration: {
    total: migration.total,
    created: migration.created,
    replayed: migration.replayed,
    revisionIdsDigest: echoReferenceDigest(migration.revisionIds),
  },
  approvedDirectorScripts: approvedDirectorScripts.counts,
  exploratoryDirectorScripts: exploratoryDirectorScripts.counts,
  authority: {
    localFirst: true,
    paidExternalResearch: false,
    publicActivation: false,
    canonPromotion: false,
    exploratoryScriptsAreNonCanon: true,
  },
};
const report = {
  ...reportCore,
  reportHash: echoReferenceDigest(reportCore),
};
const artifacts = path.join(miningRoot, "artifacts");
await mkdir(artifacts, { recursive: true });
await Promise.all([
  writeFile(path.join(artifacts, "director-scripts-approved.json"), `${JSON.stringify(approvedDirectorScripts, null, 2)}\n`),
  writeFile(path.join(artifacts, "director-scripts-exploratory.json"), `${JSON.stringify(exploratoryDirectorScripts, null, 2)}\n`),
  writeFile(path.join(artifacts, "observability.json"), `${JSON.stringify(observability, null, 2)}\n`),
  writeFile(path.join(artifacts, "materialization-report.json"), `${JSON.stringify(report, null, 2)}\n`),
]);
console.log(JSON.stringify({
  ok: report.invalidCards.length === 0,
  ...report,
  paths: {
    revisions: store.revisionsPath,
    approvedDirectorScripts: path.join(artifacts, "director-scripts-approved.json"),
    exploratoryDirectorScripts: path.join(artifacts, "director-scripts-exploratory.json"),
    observability: path.join(artifacts, "observability.json"),
    report: path.join(artifacts, "materialization-report.json"),
  },
}, null, 2));
