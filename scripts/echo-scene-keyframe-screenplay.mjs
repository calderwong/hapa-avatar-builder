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
  if (!["validate", "import-approved", "activate-images", "activate-staged"].includes(options.command)) throw new Error(`Unknown command: ${options.command}`);
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
  const countIds = options.countIds ? options.countIds.split(",").map((value) => value.trim()).filter(Boolean) : null;

  // Re-open an exact selection from prompts that were already imported through
  // the approved-screenplay gate. This keeps long-running queues operable even
  // when the original screenplay file has moved or belongs to an older schema;
  // the immutable approval receipt embedded in every staged prompt remains the
  // authorization source. It never broadens the selection or calls a provider.
  if (options.command === "activate-staged") {
    if (!options.apply) throw new Error("activate-staged is write-bearing; pass --apply.");
    requirePaused(prior);
    if (!options.song || !options.screenplayHash) throw new Error("activate-staged requires --song and --screenplay-hash.");
    if (!countIds?.length) throw new Error("activate-staged requires --count-ids with an explicit comma-separated selection.");
    for (const countId of countIds) {
      const count = prior.counts.find((candidate) => candidate.id === countId);
      const ref = count?.lanes?.prompt?.artifact?.screenplayRef;
      const receipt = ref?.approvalReceipt;
      if (!count || count.songId !== options.song || count.lanes.prompt.artifact.state !== "ready") throw new Error(`Count is not a staged prompt for ${options.song}: ${countId}`);
      if (ref.screenplayHash !== options.screenplayHash || ref.songId !== options.song) throw new Error(`Staged screenplay identity mismatch: ${countId}`);
      if (receipt?.status !== "approved" || receipt.songId !== options.song || receipt.screenplayHash !== options.screenplayHash || !receipt.id || !receipt.reviewedBy || !receipt.authoringArtifactHash) {
        throw new Error(`Staged prompt lacks a matching immutable approval receipt: ${countId}`);
      }
    }
    const next = activateEchoSongVisualScreenplayImages(prior, { songId: options.song, screenplayHash: options.screenplayHash, countIds, at: now() });
    writeProcess(processPath, eventPath, next, prior);
    return { ok: true, command: options.command, readOnly: false, providerCalls: 0, videoGeneration: "held", process: echoSceneKeyframeProcessSummary(next), applied: true, processPath, songId: options.song, screenplayHash: options.screenplayHash, activatedCountIds: countIds };
  }

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
  if (!countIds?.length) throw new Error("activate-images requires --count-ids with an explicit comma-separated selection.");
  const next = activateEchoSongVisualScreenplayImages(prior, { songId: requestedSong, screenplayHash: requestedHash, countIds, at: now() });
  if (next.status !== "paused") throw new Error(`Image activation must preserve paused process state; got ${next.status}.`);
  writeProcess(processPath, eventPath, next, prior);
  return report(options.command, next, validation, { applied: true, processPath, activatedCountIds: countIds });
}

function usage() {
  return "Usage: node scripts/echo-scene-keyframe-screenplay.mjs <validate|import-approved|activate-images|activate-staged> [options]\n\nvalidate is read-only. import-approved requires --screenplay, --approval, and --apply. activate-images requires --screenplay, --count-ids <id,...>, and --apply. activate-staged requires --song, --screenplay-hash, --count-ids <id,...>, and --apply. Write commands require a paused process, never call a provider, and leave video held.\n";
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { const result = run(); process.stdout.write(result.help ? usage() : `${stableStringify(result)}\n`); }
  catch (error) { process.stderr.write(`${error.stack || error.message}${os.EOL}`); process.exitCode = 1; }
}
