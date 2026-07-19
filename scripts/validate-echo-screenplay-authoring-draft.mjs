#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { validateEchoScreenplayAuthoredCountTranche } from "../src/domain/echo-scene-keyframe-process.js";
import { inspectEchoScreenplayDraftArtifact } from "../src/domain/echo-screenplay-authoring-queue.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const defaults = {
  process: "data/echo-scene-keyframes/process.json",
  file: null,
};

function parseArgs(argv) {
  const options = { ...defaults };
  const args = [...argv];
  while (args.length) {
    const token = args.shift();
    if (token === "--help" || token === "-h") return { ...options, help: true };
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const key = token.slice(2);
    if (!(key in options)) throw new Error(`Unknown option: ${token}`);
    const value = args.shift();
    if (!value || value.startsWith("--")) throw new Error(`Missing value for ${token}`);
    options[key] = value;
  }
  return options;
}

function collectCountRecords(value, records = []) {
  if (!value || typeof value !== "object") return records;
  if (typeof value.countId === "string" && value.semanticExtraction && value.shot && value.prompt) records.push(value);
  if (Array.isArray(value)) for (const item of value) collectCountRecords(item, records);
  else for (const child of Object.values(value)) collectCountRecords(child, records);
  return records;
}

export function run(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) return { help: true };
  if (!options.file) throw new Error("--file <incomplete-screenplay.json> is required.");
  const processPath = path.resolve(root, options.process);
  const file = path.resolve(root, options.file);
  const processState = JSON.parse(fs.readFileSync(processPath, "utf8"));
  const payload = JSON.parse(fs.readFileSync(file, "utf8"));
  const records = collectCountRecords(payload.partialScreenplay);
  const artifact = inspectEchoScreenplayDraftArtifact(processState, {
    kind: "screenplay",
    draft: true,
    songId: payload.songId,
    file,
    payload,
    readable: true,
    countIds: records.map((record) => record.countId),
  });
  if (!artifact.draftIntegrity?.ok) throw new Error(artifact.validationError);
  const quality = validateEchoScreenplayAuthoredCountTranche(records, { enhanced: true });
  return {
    ok: true,
    mode: "read-only-draft-audit",
    providerCalls: 0,
    processMutated: false,
    file,
    songId: payload.songId,
    integrity: artifact.draftIntegrity,
    quality,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = run();
    if (result.help) process.stdout.write("Usage: node scripts/validate-echo-screenplay-authoring-draft.mjs --file <draft.json> [--process <process.json>]\n");
    else process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
