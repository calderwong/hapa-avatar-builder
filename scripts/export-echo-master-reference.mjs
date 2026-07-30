#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ECHO_CONDENSED_REFERENCE_MAX_BYTES,
  buildEchoAlbumCondensedReference,
  buildEchoAlbumMasterReference,
} from "../src/domain/echo-master-reference-export.js";
import { buildEchoReferenceObservability } from "../src/domain/echo-reference-mining.js";
import { createEchoReferenceMiningStore } from "../server/echo-reference-mining-store.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function parseOptions(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    if (inlineValue !== undefined) {
      options[rawKey] = inlineValue;
    } else if (argv[index + 1] && !argv[index + 1].startsWith("--")) {
      options[rawKey] = argv[index + 1];
      index += 1;
    } else {
      options[rawKey] = true;
    }
  }
  return options;
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== null && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

function help() {
  return `Export the Echo Album Master Reference File.

Usage:
  npm run echo:master-reference
  npm run echo:master-reference -- --out /path/to/echo-album-master-reference.md
  npm run echo:master-reference -- --condensed --out /path/to/echo-album-lyrics-and-main-references.md
  npm run echo:master-reference -- --stdout

Options:
  --out <file>            Markdown destination.
  --stdout                Print Markdown instead of writing a file.
  --condensed             Keep lyrics and curated/main references under 3 MB.
  --max-bytes <n>         Condensed profile byte limit (default: 3000000).
  --songbook <file>       Dear Papa songbook JSON source.
  --song-store <file>     Builder Hapa song-store JSON source.
  --reference-run <file>  Reference Atlas run JSON source.
  --observability <file>  Reference Atlas observability JSON source.
  --generated-at <iso>    Override export timestamp for reproducible fixtures.
`;
}

export async function runEchoMasterReferenceExport(options = {}) {
  const paths = {
    songbook: path.resolve(options.songbook || path.join(ROOT, "data/dear-papa-songbook.json")),
    songStore: path.resolve(options["song-store"] || path.join(ROOT, "data/hapa-songs-store.json")),
    referenceRun: path.resolve(options["reference-run"] || path.join(ROOT, "data/echo-reference-mining/latest.json")),
    observability: path.resolve(options.observability || path.join(ROOT, "data/echo-reference-mining/artifacts/observability.json")),
  };
  const [songbook, songStore] = await Promise.all([
    readJson(paths.songbook),
    readJson(paths.songStore),
  ]);
  let referenceRun;
  let observability;
  if (options["reference-run"]) {
    [referenceRun, observability] = await Promise.all([
      readJson(paths.referenceRun, {}),
      readJson(paths.observability, {}),
    ]);
  } else {
    const referenceRoot = path.join(ROOT, "data/echo-reference-mining");
    const referenceStore = createEchoReferenceMiningStore({
      root: referenceRoot,
      songStorePath: paths.songStore,
      researchProjectionPath: path.join(ROOT, "data/echo-reference-research-loop/projected-run.json"),
      animatedMediaPath: path.join(ROOT, "data/echo-reference-animated-media.json"),
      previewFirstAuthorityPath: path.join(ROOT, "data/echo-reference-governance/preview-first-authority.json"),
    });
    const [currentRun, contributionEvents] = await Promise.all([
      referenceStore.currentRun(),
      referenceStore.contributions(),
    ]);
    referenceRun = currentRun;
    observability = options.observability
      ? await readJson(paths.observability, {})
      : buildEchoReferenceObservability(currentRun, { contributionEvents });
  }
  const condensed = options.condensed === true;
  const exportInputs = { songbook, songStore, referenceRun, observability };
  const result = condensed
    ? buildEchoAlbumCondensedReference(exportInputs, {
      generatedAt: options["generated-at"],
      maxBytes: Number(options["max-bytes"] || ECHO_CONDENSED_REFERENCE_MAX_BYTES),
    })
    : buildEchoAlbumMasterReference(exportInputs, { generatedAt: options["generated-at"] });
  const bytes = Buffer.byteLength(result.markdown);
  const sha256 = createHash("sha256").update(result.markdown).digest("hex");
  const destination = path.resolve(options.out || path.join(
    ROOT,
    condensed
      ? "data/exports/echo-album-lyrics-and-main-references.md"
      : "data/exports/echo-album-master-reference.md"
  ));

  if (options.stdout === true) {
    process.stdout.write(result.markdown);
    return { ...result.manifest, destination: "stdout", bytes, sha256 };
  }

  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.tmp`;
  await writeFile(temporary, result.markdown, "utf8");
  await rename(temporary, destination);
  return { ...result.manifest, destination, bytes, sha256 };
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help || options.h) {
    process.stdout.write(help());
    return;
  }
  const receipt = await runEchoMasterReferenceExport(options);
  if (options.stdout !== true) process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  });
}
