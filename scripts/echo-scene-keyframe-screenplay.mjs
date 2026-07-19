#!/usr/bin/env node
/**
 * Explicit screenplay gate for Echo keyframes.
 * It never claims work or calls an image/video provider. Default validation is
 * read-only; import and image activation write only process.json + its event log.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  activateEchoSongVisualScreenplayImages,
  echoSceneKeyframeProcessSummary,
  importApprovedEchoSongVisualScreenplay,
  validateEchoSongVisualScreenplay,
} from "../src/domain/echo-scene-keyframe-process.js";
import { atomicWriteJson, stableStringify } from "./echo-scene-keyframes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = Object.freeze({ command: "validate", process: "data/echo-scene-keyframes/process.json", events: "data/echo-scene-keyframes/events.ndjson", screenplay: null, approval: null, song: null, screenplayHash: null, countIds: null, runnerId: "codex-terra", runId: `screenplay-${Date.now()}`, apply: false });
const read = (file) => { try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return null; } };
const resolve = (value) => path.resolve(root, value);
const now = () => new Date().toISOString();

export function parseArgs(argv) {
  const options = { ...defaults };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("--")) options.command = args.shift();
  while (args.length) {
    const token = args.shift();
    if (token === "--apply") { options.apply = true; continue; }
    if (token === "--help") { options.help = true; continue; }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [raw, inline] = token.slice(2).split("=", 2);
    const key = raw.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!(key in options)) throw new Error(`Unknown option: --${raw}`);
    const value = inline ?? args.shift();
    if (!value) throw new Error(`Missing value: --${raw}`);
    options[key] = value;
  }
  if (!["validate", "import-approved", "activate-images"].includes(options.command)) throw new Error(`Unknown command: ${options.command}`);
  return options;
}

function requireJson(value, label) {
  if (!value) throw new Error(`${label} is required and must be valid JSON.`);
  return value;
}
function requirePaused(state) {
  if (state.status !== "paused") throw new Error(`Screenplay operations require a paused process; current status is ${state.status}.`);
}
function approvalReceipt(file) {
  const receipt = requireJson(read(file), "approval receipt");
  if (typeof receipt.id !== "string" || !receipt.id.trim()) throw new Error("approval receipt requires a non-empty id.");
  return receipt;
}
function writeProcess(processPath, eventPath, next, prior) {
  const priorEvents = Array.isArray(prior?.events) ? prior.events.length : 0;
  const additions = (next.events || []).slice(priorEvents);
  atomicWriteJson(processPath, next);
  if (additions.length) {
    fs.mkdirSync(path.dirname(eventPath), { recursive: true });
    fs.appendFileSync(eventPath, additions.map((event) => `${JSON.stringify(event)}\n`).join(""));
  }
}
function report(command, state, validation, extra = {}) {
  return { ok: true, command, readOnly: command === "validate", providerCalls: 0, videoGeneration: "held", process: echoSceneKeyframeProcessSummary(state), validation: { songId: validation.songId, screenplayHash: validation.screenplayHash, stagedCountIds: validation.stagedCountIds, preservedCountIds: validation.preservedCountIds, countTotal: validation.counts.length }, ...extra };
}

export function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return { help: true };
  const processPath = resolve(options.process);
  const eventPath = resolve(options.events);
  const prior = requireJson(read(processPath), "process state");
  const screenplay = requireJson(read(options.screenplay), "screenplay");
  const requireApproval = options.command !== "validate";
  const validation = validateEchoSongVisualScreenplay(prior, screenplay, { requireApproval });
  if (options.command === "validate") return report(options.command, prior, validation, { applied: false, processPath });
  if (!options.apply) throw new Error(`${options.command} is write-bearing; pass --apply.`);
  requirePaused(prior);

  if (options.command === "import-approved") {
    if (!options.approval) throw new Error("import-approved requires --approval <receipt.json>.");
    const next = importApprovedEchoSongVisualScreenplay(prior, screenplay, { approvalReceipt: approvalReceipt(resolve(options.approval)), runnerId: options.runnerId, runId: options.runId, at: now() });
    if (next.status !== "paused") throw new Error(`Screenplay import must preserve paused process state; got ${next.status}.`);
    writeProcess(processPath, eventPath, next, prior);
    return report(options.command, next, validation, { applied: true, processPath });
  }

  const requestedSong = options.song || validation.songId;
  if (requestedSong !== validation.songId) throw new Error("--song must match screenplay.songId.");
  const requestedHash = options.screenplayHash || validation.screenplayHash;
  if (requestedHash !== validation.screenplayHash) throw new Error("--screenplay-hash must match the validated screenplay hash.");
  const countIds = options.countIds ? options.countIds.split(",").map((value) => value.trim()).filter(Boolean) : null;
  const next = activateEchoSongVisualScreenplayImages(prior, { songId: requestedSong, screenplayHash: requestedHash, countIds, at: now() });
  if (next.status !== "paused") throw new Error(`Image activation must preserve paused process state; got ${next.status}.`);
  writeProcess(processPath, eventPath, next, prior);
  return report(options.command, next, validation, { applied: true, processPath, activatedCountIds: countIds });
}

function usage() {
  return "Usage: node scripts/echo-scene-keyframe-screenplay.mjs <validate|import-approved|activate-images> --screenplay <file> [--apply]\n\nvalidate is read-only. import-approved requires --approval and --apply; activate-images requires --apply. Both write only the supplied process state and event log, require it to be paused, never call a provider, and leave video held.\n";
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = run(); process.stdout.write(result.help ? usage() : `${stableStringify(result)}\n`); }
  catch (error) { process.stderr.write(`${error.stack || error.message}${os.EOL}`); process.exitCode = 1; }
}
