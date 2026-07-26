import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  ECHO_EXPANSION_CONTEXT_PACK_VERSION,
  ECHO_EXPANSION_CONTEXT_REFERENCES,
} from "../src/domain/echo-expansion-context-pack.js";
import {
  buildEchoReferenceMiningPacket,
  detectEchoCatalogActivations,
  runEchoReferenceMining,
} from "../src/domain/echo-reference-mining.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Expansion UI context pack is source-labeled, unique, and mechanically useful", () => {
  assert.equal(ECHO_EXPANSION_CONTEXT_PACK_VERSION, "echo-expansion-context-pack.v1");
  assert.ok(ECHO_EXPANSION_CONTEXT_REFERENCES.length >= 20);
  assert.equal(
    new Set(ECHO_EXPANSION_CONTEXT_REFERENCES.map((reference) => reference.id)).size,
    ECHO_EXPANSION_CONTEXT_REFERENCES.length
  );
  for (const reference of ECHO_EXPANSION_CONTEXT_REFERENCES) {
    assert.ok(reference.title);
    assert.ok(reference.publicContext);
    assert.ok(reference.themes.length);
    assert.ok(reference.source?.label);
    assert.ok(Object.values(reference.signalLexicon || {}).flat().length);
  }
});

test("Expansion UI context activates dense public clusters and the private playlist clue without canon promotion", () => {
  const store = JSON.parse(fs.readFileSync(path.join(ROOT, "data/hapa-songs-store.json"), "utf8"));
  const byId = new Map((store.referenceCatalog || []).map((reference) => [reference.id, reference]));
  for (const reference of ECHO_EXPANSION_CONTEXT_REFERENCES) byId.set(reference.id, reference);
  const packet = buildEchoReferenceMiningPacket({
    ...store,
    referenceCatalog: [...byId.values()],
  });
  const result = detectEchoCatalogActivations(packet);
  const ids = new Set(result.activations.map((activation) => activation.referenceId));
  for (const referenceId of [
    "smallville-save-me",
    "fray-i-found-you-playlist-origin",
    "hbo-game-of-thrones-watch",
    "ready-player-one-gunter-reversal",
    "wsdot-tacoma-narrows-sturdy-gertie",
    "one-piece-crew-and-ships",
    "sword-art-online-mothers-rosario",
    "frank-jackson-marys-room",
    "mortal-kombat-johnny-cage-goro",
    "system-of-a-down",
    "age-of-empires-ii-lan",
  ]) {
    assert.equal(ids.has(referenceId), true, referenceId);
  }
  assert.ok(result.activations.every((activation) => (
    ["direct", "source-backed-candidate"].includes(activation.evidenceClass)
    && activation.occurrences.length > 0
    && activation.occurrences.every((occurrence) => occurrence.status === "proposed")
  )));
  const run = runEchoReferenceMining({
    ...store,
    referenceCatalog: [...byId.values()],
  }, { generatedAt: "2026-07-25T00:00:00.000Z" });
  const playlist = run.cards.find((card) => card.id === "reference:fray-i-found-you-playlist-origin");
  assert.equal(playlist.rightsAndPrivacy.visibility, "private");
  assert.equal(playlist.rightsAndPrivacy.containsPrivateClues, true);
  assert.equal(playlist.authority.canonStatus, "non-canon");
});

test("base connector refresh preserves enrichment and context-pack layers", () => {
  const result = spawnSync(process.execPath, ["scripts/ingest-echo-reference-connectors.mjs"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.ok(report.counts.catalogReferences >= 76);
  assert.ok(report.counts.connectors >= 136);
  assert.equal(report.unmatchedCatalogEntries.includes("smallville-save-me"), true);
});
