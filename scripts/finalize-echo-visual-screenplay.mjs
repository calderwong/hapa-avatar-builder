#!/usr/bin/env node
/**
 * Metadata-only finalizer for an LLM-authored Echo full-song screenplay.
 *
 * This command never calls a provider, claims a quest, activates an image, or
 * changes process state. It only derives prompt hashes, explicit authoring
 * provenance/attestation, and the canonical screenplay content hash. A write
 * requires --apply, a distinct --output path, and a paused process with no
 * active claims.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  finalizeEchoSongVisualScreenplayMetadata,
  validateEchoSongVisualScreenplay,
} from "../src/domain/echo-scene-keyframe-process.js";
import {
  validateEchoScreenplayLyricCitationCoverage,
  validateEchoScreenplayReferenceCoverage,
  validateEchoScreenplaySeedBinding,
  validateEchoScreenplaySourcePacket,
} from "../src/domain/echo-screenplay-source-packet.js";
import { atomicWriteJson, stableStringify } from "./echo-scene-keyframes.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = Object.freeze({
  process: "data/echo-scene-keyframes/process.json",
  screenplay: null,
  sourcePacket: null,
  output: null,
  requestedModel: null,
  agentTaskName: null,
  sourcePacketHash: null,
  instructionHash: null,
  startedAt: null,
  completedAt: null,
  attestedBy: null,
  attestedAt: null,
  createdBy: null,
  createdAt: null,
  apply: false,
  help: false,
});

const resolve = (value) => path.resolve(root, value);
const readJson = (file, label) => {
  if (!file) throw new Error(`${label} is required.`);
  try { return JSON.parse(fs.readFileSync(file, "utf8")); }
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

function activeClaimIds(state) {
  return (state.counts || []).flatMap((count) => Object.values(count.lanes || {})
    .map((lane) => lane?.quest)
    .filter((quest) => quest?.status === "claimed")
    .map((quest) => quest.id));
}

function requirePausedIdleProcess(state) {
  if (state?.status !== "paused") throw new Error(`Screenplay finalization requires a paused process; current status is ${state?.status || "missing"}.`);
  const claims = activeClaimIds(state);
  if (claims.length) throw new Error(`Screenplay finalization requires zero active claims; found ${claims.length}.`);
}

function metadata(options) {
  return {
    requestedModel: options.requestedModel,
    agentTaskName: options.agentTaskName,
    sourcePacketHash: options.sourcePacketHash,
    instructionHash: options.instructionHash,
    startedAt: options.startedAt,
    completedAt: options.completedAt,
    attestedBy: options.attestedBy,
    attestedAt: options.attestedAt,
    createdBy: options.createdBy,
    createdAt: options.createdAt,
  };
}

function contentOutsideFinalizerAuthority(screenplay) {
  const content = structuredClone(screenplay);
  delete content.authoringProvenance;
  delete content.provenance;
  for (const sequence of content.sequencePlan || []) {
    for (const count of sequence.counts || []) {
      if (count.prompt && typeof count.prompt === "object") delete count.prompt.promptHash;
    }
  }
  return content;
}

export function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return { help: true };
  const processPath = resolve(options.process);
  const screenplayPath = resolve(options.screenplay);
  const sourcePacketPath = resolve(options.sourcePacket);
  const state = readJson(processPath, "process state");
  const candidate = readJson(screenplayPath, "screenplay candidate");
  const sourcePacketPayload = readJson(sourcePacketPath, "source packet");
  const sourcePacket = sourcePacketPayload.packet || sourcePacketPayload;
  requirePausedIdleProcess(state);
  const packetValidation = validateEchoScreenplaySourcePacket(sourcePacket);
  if (!packetValidation.ok) throw new Error(`Source packet validation failed: ${packetValidation.errors.join(", ")}`);
  if (candidate.songId !== sourcePacket.song.id) throw new Error(`Screenplay songId ${candidate.songId} does not match source packet songId ${sourcePacket.song.id}.`);
  if (options.sourcePacketHash !== sourcePacket.packetHash) throw new Error("--source-packet-hash does not match the supplied immutable source packet.");
  for (const key of ["songContextHash", "lyricsHash", "timingHash", "referenceGraphHash", "seedSetHash", "directorTreatmentHash", "promptPolicyHash"]) {
    if (candidate.sourceRevision?.[key] !== sourcePacket.sourceRevision?.[key]) throw new Error(`Screenplay sourceRevision.${key} does not match the immutable source packet.`);
  }
  const authoredCounts = (candidate.sequencePlan || []).flatMap((sequence) => sequence?.counts || []);
  const referenceCoverage = validateEchoScreenplayReferenceCoverage(authoredCounts, sourcePacket);
  if (!referenceCoverage.ok) throw new Error(`Reference coverage failed: ${referenceCoverage.errors.join("; ")}`);
  const lyricCitationCoverage = validateEchoScreenplayLyricCitationCoverage(authoredCounts, sourcePacket);
  if (!lyricCitationCoverage.ok) throw new Error(`Lyric citation coverage failed: ${lyricCitationCoverage.errors.join("; ")}`);
  const seedBinding = validateEchoScreenplaySeedBinding(candidate, sourcePacket);
  if (!seedBinding.ok) throw new Error(`Avatar seed binding failed: ${seedBinding.errors.join("; ")}`);
  const protectedBefore = stableStringify(contentOutsideFinalizerAuthority(candidate));
  const finalized = finalizeEchoSongVisualScreenplayMetadata(candidate, metadata(options));
  if (stableStringify(contentOutsideFinalizerAuthority(finalized)) !== protectedBefore) {
    throw new Error("Finalizer invariant failed: content outside mechanical metadata changed.");
  }
  const validation = validateEchoSongVisualScreenplay(state, finalized);
  const outputPath = options.output ? resolve(options.output) : null;
  if (options.apply) {
    if (!outputPath) throw new Error("--apply requires --output <finalized-screenplay.json>.");
    if (outputPath === screenplayPath) throw new Error("Finalizer refuses to overwrite the LLM-authored candidate; choose a distinct --output path.");
    atomicWriteJson(outputPath, finalized);
  }
  return {
    ok: true,
    operation: "metadata-only-screenplay-finalization",
    applied: options.apply,
    providerCalls: 0,
    processStatus: state.status,
    activeClaims: 0,
    inputPath: screenplayPath,
    sourcePacketPath,
    outputPath: options.apply ? outputPath : null,
    songId: validation.songId,
    countTotal: validation.counts.length,
    promptHashesFinalized: validation.counts.length,
    authoringArtifactHash: finalized.authoringProvenance.artifactHash,
    screenplayHash: validation.screenplayHash,
    sceneOrSemanticTextChanged: false,
    referenceCoverage,
    lyricCitationCoverage,
    seedBinding,
    imageActivation: "not-performed",
    videoGeneration: "held-not-touched",
    finalized,
  };
}

function usage() {
  return [
    "Usage: node scripts/finalize-echo-visual-screenplay.mjs --screenplay <candidate.json> --source-packet <immutable.packet.json> --process <process.json> [--output <final.json> --apply] \\",
    "  --requested-model <model> --agent-task-name <task> --source-packet-hash <sha256:...> --instruction-hash <sha256:...> \\",
    "  --started-at <ISO> --completed-at <ISO> --attested-by <actor> --attested-at <ISO> --created-by <actor> --created-at <ISO>",
    "",
    "Dry-run is the default. --apply writes only a distinct output screenplay. The process must be paused with zero active claims. No provider, image activation, process mutation, media install, or video work occurs.",
  ].join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = run();
    const { finalized: _finalized, ...report } = result;
    process.stdout.write(result.help ? `${usage()}\n` : `${stableStringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}${os.EOL}${usage()}${os.EOL}`);
    process.exitCode = 1;
  }
}
