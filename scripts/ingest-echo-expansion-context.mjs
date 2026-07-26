import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ECHO_EXPANSION_CONTEXT_PACK_VERSION,
  ECHO_EXPANSION_CONTEXT_REFERENCES,
} from "../src/domain/echo-expansion-context-pack.js";
import { auditHapaSongStore } from "../src/domain/song.js";
import { normalizeSongReferenceCatalog } from "../src/domain/song-reference-graph.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STORE_PATH = path.join(ROOT, "data/hapa-songs-store.json");
const BACKUP_DIR = path.join(ROOT, "data/backups");
const REPORT_DIR = path.join(ROOT, "data/merge-reports");
const APPLY = process.argv.includes("--apply");
const GENERATED_AT = new Date().toISOString();
const RUN_ID = GENERATED_AT.replaceAll(":", "-").replaceAll(".", "-");

function mergeById(existing = [], additions = []) {
  const next = [...existing];
  const index = new Map(next.map((item, itemIndex) => [item.id, itemIndex]));
  for (const addition of additions) {
    const currentIndex = index.get(addition.id);
    if (currentIndex === undefined) {
      index.set(addition.id, next.length);
      next.push(addition);
    } else {
      next[currentIndex] = addition;
    }
  }
  return next;
}

const store = JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
const references = normalizeSongReferenceCatalog(ECHO_EXPANSION_CONTEXT_REFERENCES);
const nextStore = {
  ...store,
  referenceCatalog: mergeById(store.referenceCatalog, references),
  updatedAt: GENERATED_AT,
};
nextStore.audit = auditHapaSongStore(nextStore.songs);

const report = {
  schemaVersion: "hapa.echo-expansion-context-ingestion-report.v1",
  contextPackVersion: ECHO_EXPANSION_CONTEXT_PACK_VERSION,
  mode: APPLY ? "apply" : "dry-run",
  generatedAt: GENERATED_AT,
  storePath: STORE_PATH,
  referencesAddedOrUpdated: references.length,
  referenceIds: references.map((reference) => reference.id),
  catalogSizeBefore: store.referenceCatalog?.length || 0,
  catalogSizeAfter: nextStore.referenceCatalog.length,
  audit: nextStore.audit,
};

if (APPLY) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const backupPath = path.join(BACKUP_DIR, `hapa-songs-store.before-expansion-context.${RUN_ID}.json`);
  const reportPath = path.join(REPORT_DIR, `echo-expansion-context.${RUN_ID}.json`);
  fs.copyFileSync(STORE_PATH, backupPath);
  fs.writeFileSync(STORE_PATH, `${JSON.stringify(nextStore, null, 2)}\n`);
  fs.writeFileSync(reportPath, `${JSON.stringify({ ...report, backupPath, reportPath }, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ ...report, backupPath, reportPath }, null, 2)}\n`);
} else {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}
