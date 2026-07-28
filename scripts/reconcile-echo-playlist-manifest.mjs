#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeEchoPlaylistManifest } from "../src/domain/echo-playlist-manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PLAYLIST_ID = process.env.HAPA_DEAR_PAPA_PLAYLIST_ID || "903148b6-5709-4511-9cfd-d34b23799da6";
const PLAYLIST_ROOT = process.env.HAPA_DEAR_PAPA_PLAYLIST_ROOT
  || path.join(process.env.HAPA_SUNO_LIBRARY_ROOT || "/Users/calderwong/Desktop/suno-library", "playlists", PLAYLIST_ID);
const CURRENT_PATH = process.env.HAPA_ECHO_CURRENT_MANIFEST || path.join(PLAYLIST_ROOT, "manifest.json");
const OUTPUT_PATH = process.env.HAPA_DEAR_PAPA_MANIFEST || path.join(PLAYLIST_ROOT, "manifest.hapa-avatar-builder.json");
const REPORT_PATH = path.join(PLAYLIST_ROOT, "hapa-avatar-builder-reconciliation.json");

const readJson = async (filePath, fallback = {}) => {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return fallback;
    throw error;
  }
};

const currentManifest = await readJson(CURRENT_PATH);
const previousManifest = await readJson(OUTPUT_PATH);
const result = mergeEchoPlaylistManifest(currentManifest, previousManifest);

await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(result.manifest, null, 2)}\n`);
await fs.writeFile(REPORT_PATH, `${JSON.stringify(result.reconciliation, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  manifestPath: OUTPUT_PATH,
  reportPath: REPORT_PATH,
  ...result.reconciliation.counts
}, null, 2));
