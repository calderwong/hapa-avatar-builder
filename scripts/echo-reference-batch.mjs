#!/usr/bin/env node
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createEchoReferenceBatchQueue } from "../server/echo-reference-batch-queue.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const action = args[0] || "preview";

function option(name, fallback = "") {
  const inline = args.find((entry) => entry.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--")
    ? args[index + 1]
    : fallback;
}

const queue = createEchoReferenceBatchQueue({
  root: option("--root", path.join(projectRoot, "data/echo-reference-mining/queue")),
  songStorePath: option("--store", path.join(projectRoot, "data/hapa-songs-store.json")),
});
const configuration = {
  maxPairs: Number(option("--max-pairs", 0)) || undefined,
  maxCandidatesPerSong: Number(option("--max-candidates-per-song", 8)),
  maxConcurrency: Number(option("--concurrency", 2)),
};
let result;
if (action === "preview") result = await queue.preview(configuration);
else if (action === "create") result = await queue.create(configuration);
else if (action === "status") result = await queue.load(option("--queue"));
else if (action === "run" || action === "resume") {
  result = await queue.process(option("--queue"), {
    ...configuration,
    maxSongs: Number(option("--max-songs", Number.MAX_SAFE_INTEGER)),
    apply: args.includes("--apply"),
  });
} else if (action === "retry") {
  result = await queue.retry(option("--queue"), {
    songIds: args.filter((entry) => entry.startsWith("--song=")).map((entry) => entry.slice(7)),
  });
} else {
  throw new Error(`Unknown action "${action}". Use preview, create, status, run, resume, or retry.`);
}

console.log(JSON.stringify(result, null, 2));
