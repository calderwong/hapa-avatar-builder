#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEchoSongIngestService } from "../server/echo-song-ingest.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const command = args.shift() || "status";
const options = Object.fromEntries(args.filter((arg) => arg.startsWith("--") && arg.includes("=")).map((arg) => {
  const index = arg.indexOf("=");
  return [arg.slice(2, index), arg.slice(index + 1)];
}));
const service = createEchoSongIngestService({ root: ROOT });

function inputPacket() {
  const metadataPath = options.metadata ? path.resolve(options.metadata) : "";
  const metadata = metadataPath ? JSON.parse(fs.readFileSync(metadataPath, "utf8")) : {};
  return {
    ...metadata,
    sourceDir: options["source-dir"] || metadata.sourceDir,
    songUrl: options["song-url"] || metadata.songUrl,
    title: options.title || metadata.title,
    author: options.author || metadata.author,
    trackNumber: options["track-number"] || metadata.trackNumber,
  };
}

try {
  let value;
  if (command === "inspect") value = service.inspect(inputPacket());
  else if (command === "register") value = service.register(options["run-id"] || "");
  else if (command === "status") value = options["run-id"] ? service.get(options["run-id"]) : { ok: true, runsRoot: service.runsRoot, current: service.get(), runs: service.listRuns().map((run) => ({ runId: run.runId, state: run.state, title: run.song?.title, updatedAt: run.updatedAt })) };
  else if (command === "record-images") {
    if (!options.status) throw new Error("record-images requires --status=/path/to/status.json");
    value = service.recordImageRun(options["run-id"] || "", JSON.parse(fs.readFileSync(path.resolve(options.status), "utf8")));
  } else if (command === "record-loops") {
    if (!options.status) throw new Error("record-loops requires --status=/path/to/status.json");
    value = service.recordLoopRun(options["run-id"] || "", JSON.parse(fs.readFileSync(path.resolve(options.status), "utf8")));
  } else throw new Error("Use inspect, register, status, record-images, or record-loops.");
  process.stdout.write(`${JSON.stringify({ ok: true, ...value }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${JSON.stringify({ ok: false, error: "echo_song_ingest_failed", message: error instanceof Error ? error.message : String(error) }, null, 2)}\n`);
  process.exitCode = 1;
}
