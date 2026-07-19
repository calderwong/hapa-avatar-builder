#!/usr/bin/env node
/**
 * Read-only Echo full-song screenplay authoring queue projection.
 * The sole write path is an explicitly requested queue report via --out --apply.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  inspectEchoScreenplayArtifact,
  inspectEchoScreenplaySourcePacketArtifact,
  projectEchoScreenplayAuthoringQueue,
} from "../src/domain/echo-screenplay-authoring-queue.js";
import { atomicWriteJson, stableStringify } from "./echo-scene-keyframes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = Object.freeze({
  process: "data/echo-scene-keyframes/process.json",
  screenplayRoot: "data/echo-scene-keyframes/song-screenplays",
  finalizedRoot: "data/echo-scene-keyframes/screenplays",
  out: null,
  apply: false,
  help: false,
});

const resolve = (value) => path.resolve(root, value);
const readText = (file) => fs.readFileSync(file, "utf8");
const readJson = (file, label) => {
  try { return JSON.parse(readText(file)); }
  catch (error) { throw new Error(`${label} must be readable JSON: ${error.message}`); }
};

export function parseArgs(argv) {
  const options = { ...defaults };
  const args = [...argv];
  while (args.length) {
    const token = args.shift();
    if (token === "--apply") { options.apply = true; continue; }
    if (token === "--help" || token === "-h") { options.help = true; continue; }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [raw, inline] = token.slice(2).split("=", 2);
    const key = raw.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!(key in options)) throw new Error(`Unknown option: --${raw}`);
    const value = inline ?? args.shift();
    if (!value || value.startsWith("--")) throw new Error(`Missing value: --${raw}`);
    options[key] = value;
  }
  return options;
}

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...jsonFiles(file));
    else if (entry.isFile() && entry.name.endsWith(".json")) files.push(file);
  }
  return files.sort();
}

function inferSongId(text, file, songIds) {
  const match = text.match(/"songId"\s*:\s*"([^"]+)"/u) || text.match(/"id"\s*:\s*"(dear-papa-song-[^"]+)"/u);
  if (match && songIds.includes(match[1])) return match[1];
  const base = path.basename(file);
  return [...songIds].sort((left, right) => right.length - left.length).find((songId) => base.startsWith(`${songId}.`)) || null;
}

function countIdsFromRaw(text, songId) {
  if (!songId) return [];
  const matches = [...text.matchAll(/"countId"\s*:\s*"([^"]+)"/gu)].map((match) => match[1]);
  return [...new Set(matches.filter((id) => id.startsWith(`${songId}-count-`)))];
}

function classifyPayload(payload, file) {
  const packet = payload?.packet || payload;
  if (packet?.schemaVersion === "hapa.echo.screenplay-source-packet.v1") return { kind: "packet", payload: packet, songId: packet.song?.id || null };
  if (payload?.schemaVersion === "hapa.echo.full-song-visual-screenplay.v1") return { kind: "screenplay", payload, songId: payload.songId || null };
  if (payload?.nonCandidateStatus === "incomplete-direct-llm-authoring-draft" && payload?.schemaTarget === "hapa.echo.full-song-visual-screenplay.v1") {
    return { kind: "screenplay", payload, songId: payload.songId || null, draft: true, validationError: "explicit incomplete direct-LLM authoring draft" };
  }
  if (payload?.status === "approved" && payload?.reviewType === "independent_screenplay_review") return { kind: "approval", payload, songId: payload.songId || null };
  if (payload?.candidatePath || /review/iu.test(path.basename(file))) return { kind: "review", payload, songId: payload.songId || null };
  return { kind: "other", payload, songId: payload?.songId || null };
}

function countIdsFromPayload(payload, songId) {
  const found = [];
  const visit = (value) => {
    if (!value || typeof value !== "object") return;
    if (typeof value.countId === "string" && (!songId || value.countId.startsWith(`${songId}-count-`))) found.push(value.countId);
    if (Array.isArray(value)) for (const item of value) visit(item);
    else for (const child of Object.values(value)) visit(child);
  };
  visit(payload);
  return [...new Set(found)];
}

export function discoverEchoScreenplayArtifacts(processState, screenplayRoot) {
  const songIds = [...new Set((processState.counts || []).filter((count) => count.timingStatus === "ready").map((count) => count.songId))];
  return jsonFiles(screenplayRoot).map((file) => {
    const text = readText(file);
    const stat = fs.statSync(file);
    const common = { file, relativeFile: path.relative(root, file), modifiedAt: stat.mtime.toISOString(), readable: true };
    try {
      const classified = classifyPayload(JSON.parse(text), file);
      const songId = classified.songId || inferSongId(text, file, songIds);
      const inspected = inspectEchoScreenplayArtifact(processState,
        inspectEchoScreenplaySourcePacketArtifact({ ...common, ...classified, songId }));
      return { ...inspected, countIds: inspected.kind === "packet"
        ? (inspected.payload?.fourCounts || []).map((count) => count.id).filter(Boolean)
        : inspected.kind === "screenplay"
          ? countIdsFromPayload(inspected.payload, songId)
          : [] };
    } catch (error) {
      const songId = inferSongId(text, file, songIds);
      const looksLikePacket = /\.packet\.json$/u.test(file);
      const looksLikeScreenplay = /screenplay.*\.json$/u.test(file);
      return {
        ...common,
        kind: looksLikePacket ? "packet" : looksLikeScreenplay ? "screenplay" : "unreadable",
        songId,
        readable: false,
        readError: error.message,
        validationError: error.message,
        payload: null,
        countIds: countIdsFromRaw(text, songId),
      };
    }
  });
}

export function run(argv = process.argv.slice(2), { generatedAt = new Date().toISOString() } = {}) {
  const options = parseArgs(argv);
  if (options.help) return { help: true };
  if (options.out && !options.apply) throw new Error("--out requires --apply; default operation is read-only stdout.");
  if (options.apply && !options.out) throw new Error("--apply requires --out <queue-report.json>.");
  const processPath = resolve(options.process);
  const screenplayRoot = resolve(options.screenplayRoot);
  const finalizedRoot = resolve(options.finalizedRoot);
  const out = options.out ? resolve(options.out) : null;
  if (out === processPath) throw new Error("Queue report output must not overwrite process state.");
  const state = readJson(processPath, "process state");
  const artifacts = [
    ...discoverEchoScreenplayArtifacts(state, screenplayRoot),
    ...(finalizedRoot === screenplayRoot ? [] : discoverEchoScreenplayArtifacts(state, finalizedRoot)),
  ];
  if (out && artifacts.some((artifact) => artifact.file === out)) {
    throw new Error("Queue report output must not overwrite a screenplay packet, candidate, or review artifact.");
  }
  const report = projectEchoScreenplayAuthoringQueue({ process: state, artifacts, generatedAt });
  const result = {
    ok: true,
    applied: false,
    output: null,
    providerCalls: 0,
    processMutated: false,
    report,
  };
  if (options.apply) {
    result.applied = true;
    result.output = out;
    atomicWriteJson(out, result);
  }
  return result;
}

function usage() {
  return [
    "Usage: node scripts/echo-screenplay-authoring-queue.mjs [--process <process.json>] [--screenplay-root <dir>] [--finalized-root <dir>] [--out <report.json> --apply]",
    "",
    "Default is a read-only stdout projection. --out and --apply must be paired and write only the queue report. This command never calls providers, authors scenes, claims quests, resumes the process, activates images, or touches video state.",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = run();
    process.stdout.write(result.help ? `${usage()}\n` : `${stableStringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}${os.EOL}${usage()}${os.EOL}`);
    process.exitCode = 1;
  }
}
