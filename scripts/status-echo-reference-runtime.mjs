#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEchoReferenceMiningStore } from "../server/echo-reference-mining-store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function counts(values = []) {
  return Object.fromEntries([...values.reduce((map, value) => {
    const key = String(value || "unset");
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map()).entries()].sort(([left], [right]) => left.localeCompare(right)));
}

async function main() {
  const store = createEchoReferenceMiningStore({
    root: path.join(ROOT, "data/echo-reference-mining"),
    songStorePath: path.join(ROOT, "data/hapa-songs-store.json"),
    researchProjectionPath: path.join(ROOT, "data/echo-reference-research-loop/projected-run.json"),
    animatedMediaPath: path.join(ROOT, "data/echo-reference-animated-media.json"),
    previewFirstAuthorityPath: path.join(ROOT, "data/echo-reference-governance/preview-first-authority.json"),
  });
  const run = await store.currentRun();
  const mediaCards = list(run.cards).filter((card) => card.presentationMedia);
  console.log(JSON.stringify({
    ok: true,
    command: "reference-runtime-status",
    runId: run.runId,
    runHash: run.runHash,
    source: run.referenceRuntime?.source,
    authority: run.referenceRuntime?.authority,
    cards: {
      total: list(run.cards).length,
      reviewStatus: counts(list(run.cards).map((card) => card.authority?.reviewStatus)),
      evidenceClass: counts(list(run.cards).map((card) => card.authority?.evidenceClass)),
    },
    connections: {
      total: list(run.graph?.edges).length,
      status: counts(list(run.graph?.edges).map((edge) => edge.status)),
      resolution: counts(list(run.graph?.edges).map((edge) => edge.reviewResolution || "promoted-or-unchanged")),
    },
    unresolved: {
      total: list(run.unresolved).length,
      status: counts(list(run.unresolved).map((item) => item.status)),
    },
    researchUpdates: counts(list(run.contributions).map((entry) => entry.status)),
    media: {
      cards: mediaCards.length,
      images: mediaCards.filter((card) => card.presentationMedia?.image?.uri).length,
      loops: mediaCards.filter((card) => card.presentationMedia?.loopVideo?.uri).length,
      reviewStatus: counts(mediaCards.map((card) => card.presentationMedia?.custody?.reviewStatus)),
      previewVisibility: counts(mediaCards.map((card) => card.presentationMedia?.custody?.previewVisibility)),
      directorEligible: mediaCards.filter((card) => card.presentationMedia?.technical?.directorEligible === true).length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
