#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEchoReferenceMiningStore } from "../server/echo-reference-mining-store.mjs";
import { projectEchoReferenceRunReceipt } from "../src/domain/echo-reference-mining.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

function option(name, fallback = "") {
  const inline = args.find((entry) => entry.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : fallback;
}

function numberOption(name, fallback) {
  const value = Number(option(name, fallback));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

const apply = args.includes("--apply");
const songIds = args
  .filter((entry) => entry.startsWith("--song="))
  .map((entry) => entry.slice("--song=".length))
  .concat(option("--song") ? [option("--song")] : [])
  .filter(Boolean);
const store = createEchoReferenceMiningStore({
  root: option("--root", path.join(root, "data/echo-reference-mining")),
  songStorePath: option("--store", path.join(root, "data/hapa-songs-store.json")),
});

const result = await store.run({
  apply,
  songIds,
  maxPairs: numberOption("--max-pairs", Number.MAX_SAFE_INTEGER),
  maxCandidatesPerSong: numberOption("--max-candidates-per-song", 8),
  allowExternalResearch: false,
});

console.log(JSON.stringify(projectEchoReferenceRunReceipt(result, apply ? store : {}), null, 2));
