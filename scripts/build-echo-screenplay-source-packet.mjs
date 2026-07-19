#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { atomicWriteJson, buildFourCountWindows, stableStringify } from "./echo-scene-keyframes.mjs";
import { buildEchoScreenplaySourcePacket, validateEchoScreenplaySourcePacket } from "../src/domain/echo-screenplay-source-packet.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = Object.freeze({ song: null, songs: "data/hapa-songs-store.json", avatars: "data/avatar-store.json", projects: "data/music-video-projects", telemetryRoot: path.join(process.env.HOME || "", "Desktop/hapa-song-registry/data/audio_telemetry/latest"), process: "data/echo-scene-keyframes/process.json", mediaCards: "data/echo-scene-keyframes/media-cards.json", pilotRoot: "artifacts/echo-scene-keyframes/pilot", out: null, apply: false });
const read = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const resolve = (value) => path.resolve(root, value);

export function parseArgs(argv) {
  const options = { ...defaults };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help") return { help: true, options };
    if (token === "--apply") { options.apply = true; continue; }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [raw, inline] = token.slice(2).split("=", 2);
    const key = raw.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!(key in options)) throw new Error(`Unknown option: --${raw}`);
    const value = inline ?? argv[++index];
    if (!value) throw new Error(`Missing value: --${raw}`);
    options[key] = value;
  }
  return { help: false, options };
}

function matchingProject(dir, songId) {
  if (!fs.existsSync(dir)) return null;
  for (const name of fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort()) {
    const payload = read(path.join(dir, name));
    const project = payload?.music_video_project || payload?.project || payload;
    if (project?.song_id === songId) return { project, file: name };
  }
  return null;
}

function approvedSeeds(pilotRoot, avatarId, colorRole) {
  if (!fs.existsSync(pilotRoot)) return [];
  const seeds = [];
  for (const child of fs.readdirSync(pilotRoot).sort()) {
    const plan = read(path.join(pilotRoot, child, "plan.json"));
    for (const count of plan?.counts || []) for (const seed of count.seedAssets || []) {
      if (seed.avatarId === avatarId || String(seed.colorRole || "").toLowerCase() === String(colorRole || "").toLowerCase()) seeds.push(seed);
    }
  }
  return [...new Map(seeds.filter((seed) => seed.retrievalHandle).map((seed) => [seed.retrievalHandle, seed])).values()];
}

export function run(argv = process.argv.slice(2)) {
  const { help, options } = parseArgs(argv);
  if (help) return { help: true };
  if (!options.song) throw new Error("--song <canonical-song-id> is required");
  const store = read(resolve(options.songs));
  const song = (store?.songs || []).find((row) => row.id === options.song);
  if (!song) throw new Error(`Canonical song not found: ${options.song}`);
  const found = matchingProject(resolve(options.projects), song.id);
  const registryTrackId = found?.project?.registry_track_id;
  const telemetry = registryTrackId ? read(path.resolve(options.telemetryRoot, `${registryTrackId}.json`)) : null;
  const windows = buildFourCountWindows({ songId: song.id, telemetry, project: found?.project || {} }).windows;
  const avatars = read(resolve(options.avatars));
  const avatarId = song.performancePerspective?.avatarId || song.performancePerspective?.avatar_id;
  const avatar = (avatars?.avatars || []).find((row) => row.id === avatarId) || null;
  if (options.out && !options.apply) throw new Error("--out requires --apply; default mode is stdout-only.");
  if (options.apply && !options.out) throw new Error("--apply requires --out <path>.");
  const packet = buildEchoScreenplaySourcePacket({ song, project: found?.project, telemetry, windows, avatar, approvedSeeds: approvedSeeds(resolve(options.pilotRoot), avatarId, song.performancePerspective?.teamColor), process: read(resolve(options.process)), mediaCards: read(resolve(options.mediaCards)), graphEdges: store?.referenceGraphEdges || [], referenceCatalog: store?.referenceCatalog || [], albumConnectors: (store?.songs || []).flatMap((row) => (row.referenceConnectors || []).map((connector) => ({ ...connector, sourceSongId: row.id }))) });
  const validation = validateEchoScreenplaySourcePacket(packet);
  const result = { packet, validation, projectFile: found?.file || null, applied: false, output: null };
  if (options.apply) {
    const output = path.resolve(options.out);
    result.applied = true;
    result.output = output;
    atomicWriteJson(output, result);
  }
  return result;
}

function usage() { return "Usage: node scripts/build-echo-screenplay-source-packet.mjs --song <canonical-song-id> [source overrides] [--out <path> --apply]\n\nDefault is stdout-only. --out requires --apply and atomically materializes only the requested packet artifact; it never changes process state or calls a provider.\n"; }
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = run(); process.stdout.write(result.help ? usage() : `${stableStringify(result)}\n`); }
  catch (error) { process.stderr.write(`${error.stack || error.message}\n`); process.exitCode = 1; }
}
