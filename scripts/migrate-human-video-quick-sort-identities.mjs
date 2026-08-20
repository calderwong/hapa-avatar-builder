#!/usr/bin/env node
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createSystemMediaDashboard } from "../src/domain/systemMedia.js";
import { createHumanVideoEnricherDashboard } from "../src/domain/human-video-enrichment.js";
import { migrateHumanVideoQuickSortStoreToVideos } from "../src/domain/human-video-quick-sort.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA = path.join(ROOT, "data");
const apply = process.argv.includes("--apply");
const now = new Date().toISOString();
const stamp = now.replace(/[:.]/g, "-");
const read = async (name, fallback = {}) => {
  try { return JSON.parse(await readFile(path.join(DATA, name), "utf8")); } catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
};

const [avatarStore, tarotStore, sceneGraph, mediaLibrary, itemStore, songStore, enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore] = await Promise.all([
  read("avatar-store.json", { avatars: [] }),
  read("tarot-store.json", { cards: [] }),
  read("scene-store.json", { scenes: [] }),
  read("media-library.json", { records: [] }),
  read("item-manager-store.json", { cards: [] }),
  read("hapa-songs-store.json", { songs: [] }),
  read("human-video-enrichments.json", { records: [] }),
  read("human-video-agent-reviews.json", { reviews: [] }),
  read("human-video-quick-sort-decisions.json", { schemaVersion: "hapa.human-video-quick-sort-store.v1", decisions: [] }),
  read("human-video-reference-reviews.json", { reviews: [] }),
]);
const mediaDashboard = createSystemMediaDashboard({ avatars: avatarStore.avatars || [], tarotStore, sceneGraph, mediaLibrary, itemStore, songStore });
const dashboard = createHumanVideoEnricherDashboard({ mediaDashboard, enrichmentStore, agentReviewStore, quickSortStore, referenceReviewStore });
const migration = migrateHumanVideoQuickSortStoreToVideos(quickSortStore, dashboard.videos, { now });
const report = { ...migration.report, mode: apply ? "apply" : "dry-run", canonicalVideos: dashboard.videos.length };

if (apply) {
  const storePath = path.join(DATA, "human-video-quick-sort-decisions.json");
  const eventPath = path.join(DATA, "human-video-quick-sort-events.ndjson");
  const backupDir = path.join(DATA, "backups", `human-video-quick-sort-identity-migration-${stamp}`);
  const reportPath = path.join(DATA, "merge-reports", `human-video-quick-sort-identity-migration-${stamp}.json`);
  await mkdir(backupDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });
  await copyFile(storePath, path.join(backupDir, path.basename(storePath)));
  try { await copyFile(eventPath, path.join(backupDir, path.basename(eventPath))); } catch (error) { if (error?.code !== "ENOENT") throw error; }
  const tempPath = `${storePath}.${process.pid}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(migration.store, null, 2)}\n`, "utf8");
  await rename(tempPath, storePath);
  await writeFile(reportPath, `${JSON.stringify({ ...report, backupDir, reportPath }, null, 2)}\n`, "utf8");
  Object.assign(report, { backupDir, reportPath });
}

console.log(JSON.stringify(report, null, 2));
