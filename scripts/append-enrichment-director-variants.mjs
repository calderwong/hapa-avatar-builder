#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  ECHO_ENRICHMENT_DIRECTOR_REPORT_SCHEMA,
  ECHO_VIDEO_ENRICHMENT_EXPECTED_SCHEMA,
  buildEchoVideoEnrichmentCatalog,
  compileEchoEnrichmentDirectorVariant,
  echoEnrichmentDirectorVariantIndexRow,
  selectLatestEnrichmentParentVariant,
  stableEchoEnrichmentStringify,
} from "../src/domain/echo-enrichment-director-variant.js";
import {
  discoverDirectionVariantIndexRows,
  mergeDirectionVariantIndexRows,
} from "../src/domain/echo-direction-variant-index.js";
import { validateEchoEnrichmentCatalogIntegrity } from "../src/domain/echo-enrichment-catalog-integrity.js";
import {
  resolveEchoEnrichmentVariantPath,
  validateEchoEnrichmentSongId,
} from "../src/domain/echo-enrichment-path-safety.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DEFAULT_ARTIFACTS = path.join(ROOT, "artifacts/echo-video-enrichment-v1");

function list(value) {
  return Array.isArray(value) ? value.filter((entry) => entry !== null && entry !== undefined) : [];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Bytes(value) {
  return createHash("sha256").update(value).digest("hex");
}

function option(argv, names, fallback = "") {
  for (const name of names) {
    const exactIndex = argv.indexOf(name);
    if (exactIndex >= 0 && argv[exactIndex + 1] && !argv[exactIndex + 1].startsWith("--")) return argv[exactIndex + 1];
    const prefixed = argv.find((argument) => argument.startsWith(`${name}=`));
    if (prefixed) return prefixed.slice(name.length + 1);
  }
  return fallback;
}

function hasFlag(argv, name) {
  return argv.includes(name);
}

function resolveOption(argv, names, fallback) {
  return path.resolve(option(argv, names, fallback));
}

export function parseEnrichmentDirectorArguments(argv = process.argv.slice(2)) {
  const apply = hasFlag(argv, "--apply");
  const songId = text(option(argv, ["--song-id"], ""));
  if (songId) validateEchoEnrichmentSongId(songId);
  const expectedDefault = songId ? 1 : 157;
  const expectedSongCount = Number(option(argv, ["--expected-song-count"], String(expectedDefault)));
  if (!Number.isInteger(expectedSongCount) || expectedSongCount < 1) throw new Error("--expected-song-count must be a positive integer.");
  const variantsDirectory = resolveOption(argv, ["--variants", "--variants-dir"], path.join(ROOT, "data/music-video-project-variants"));
  return {
    apply,
    songId,
    expectedSongCount,
    enrichmentsPath: resolveOption(argv, ["--enrichments"], path.join(DEFAULT_ARTIFACTS, "enrichments.ndjson")),
    chainGraphPath: resolveOption(argv, ["--chain-graph"], path.join(DEFAULT_ARTIFACTS, "chain-graph.json")),
    enrichmentReportPath: resolveOption(argv, ["--enrichment-report", "--source-report"], path.join(DEFAULT_ARTIFACTS, "report.json")),
    songsPath: resolveOption(argv, ["--songs", "--songs-store"], path.join(ROOT, "data/hapa-songs-store.json")),
    projectsDirectory: resolveOption(argv, ["--projects", "--projects-dir"], path.join(ROOT, "data/music-video-projects")),
    variantsDirectory,
    indexPath: resolveOption(argv, ["--index", "--variant-index"], path.join(variantsDirectory, "index.json")),
    reportPath: resolveOption(argv, ["--report-out"], path.join(ROOT, "artifacts/echo-enrichment-director-variants/report.json")),
    backupsDirectory: resolveOption(argv, ["--backups"], path.join(ROOT, "data/backups")),
  };
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== undefined) return fallback;
    throw new Error(`Cannot read JSON ${filePath}: ${error.message}`, { cause: error });
  }
}

export async function readEnrichmentNdjson(filePath) {
  let source;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    throw new Error(`Cannot read enrichment NDJSON ${filePath}: ${error.message}`, { cause: error });
  }
  const rows = [];
  for (const [index, line] of source.split(/\r?\n/u).entries()) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (!row || typeof row !== "object" || Array.isArray(row)) throw new Error("row is not a JSON object");
      rows.push(row);
    } catch (error) {
      throw new Error(`Invalid enrichment NDJSON at ${filePath}:${index + 1}: ${error.message}`, { cause: error });
    }
  }
  if (!rows.length) throw new Error(`Enrichment NDJSON has no rows: ${filePath}`);
  return rows;
}

async function atomicWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, typeof payload === "string" ? payload : json(payload), "utf8");
  await rename(temporary, filePath);
}

async function exclusiveWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const handle = await open(filePath, "wx");
  try {
    await handle.writeFile(typeof payload === "string" || Buffer.isBuffer(payload) ? payload : json(payload));
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function exists(filePath) {
  return Boolean(await stat(filePath).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  }));
}

async function acquireIndexLock(lockPath, attempts = 250) {
  await mkdir(path.dirname(lockPath), { recursive: true });
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx");
      await handle.writeFile(json({ pid: process.pid, acquiredAt: new Date().toISOString() }), "utf8");
      await handle.sync();
      return handle;
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
  throw new Error(`Timed out waiting for serialized Direction Variant index lock: ${lockPath}`);
}

async function withIndexLock(indexPath, operation) {
  const lockPath = `${indexPath}.enrichment.lock`;
  const handle = await acquireIndexLock(lockPath);
  try {
    return await operation();
  } finally {
    await handle.close();
    await unlink(lockPath).catch((error) => {
      if (error?.code !== "ENOENT") throw error;
    });
  }
}

function unwrapProject(payload = {}) {
  return payload.music_video_project || payload.musicVideoProject || payload.project || payload;
}

async function discoverProjects(directory, targetSongId = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const projects = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(directory, entry.name);
    const bytes = await readFile(filePath);
    let payload;
    try {
      payload = JSON.parse(bytes.toString("utf8"));
    } catch (error) {
      throw new Error(`Cannot parse Echo project ${filePath}: ${error.message}`, { cause: error });
    }
    const project = unwrapProject(payload);
    const rawSongId = text(project.song_id || project.songId);
    const songId = rawSongId ? validateEchoEnrichmentSongId(rawSongId) : "";
    if (!songId || (targetSongId && songId !== targetSongId)) continue;
    projects.push({ filePath, fileName: entry.name, bytes, payload, project, songId });
  }
  return projects;
}

function songLookup(songsPayload = {}) {
  const lookup = new Map();
  for (const song of list(songsPayload.songs || songsPayload.records || songsPayload)) {
    for (const id of [song.id, song.cardId, song.card_id, song.songId, song.song_id].filter(Boolean)) {
      if (!lookup.has(String(id))) lookup.set(String(id), song);
    }
  }
  return lookup;
}

async function readSongVariants(variantsDirectory, songId) {
  const directory = resolveEchoEnrichmentVariantPath(
    variantsDirectory,
    validateEchoEnrichmentSongId(songId),
  );
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const variants = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const filePath = path.join(directory, entry.name);
    const bytes = await readFile(filePath);
    try {
      variants.push({ filePath, bytes, variant: JSON.parse(bytes.toString("utf8")) });
    } catch (error) {
      throw new Error(`Cannot parse Direction Variant ${filePath}: ${error.message}`, { cause: error });
    }
  }
  return variants;
}

async function snapshotExistingVariants(variantsDirectory) {
  const snapshots = new Map();
  let songDirectories;
  try {
    songDirectories = await readdir(variantsDirectory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return snapshots;
    throw error;
  }
  for (const songDirectory of songDirectories) {
    if (!songDirectory.isDirectory()) continue;
    const directory = resolveEchoEnrichmentVariantPath(
      variantsDirectory,
      validateEchoEnrichmentSongId(songDirectory.name),
    );
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const filePath = path.join(directory, entry.name);
      snapshots.set(filePath, sha256Bytes(await readFile(filePath)));
    }
  }
  return snapshots;
}

async function changedSnapshots(snapshots) {
  const changed = [];
  for (const [filePath, before] of snapshots) {
    const current = await readFile(filePath).catch((error) => {
      if (error?.code === "ENOENT") return null;
      throw error;
    });
    if (!current || sha256Bytes(current) !== before) changed.push(filePath);
  }
  return changed;
}

function indexPayloadRows(payload = {}) {
  return list(payload.variants || payload.rows);
}

function indexStablePayload(payload = {}) {
  return {
    schemaVersion: payload.schemaVersion,
    variants: indexPayloadRows(payload),
    enrichmentDirectorBatch: payload.enrichmentDirectorBatch || null,
  };
}

async function backupIndex(indexPath, backupsDirectory, batchFingerprint) {
  if (!await exists(indexPath)) return "";
  const bytes = await readFile(indexPath);
  const digest = sha256Bytes(bytes);
  const directory = path.join(backupsDirectory, `echo-enrichment-director-${batchFingerprint.slice(0, 16)}`);
  const target = path.join(directory, `direction-variant-index-before-${digest.slice(0, 16)}.json`);
  if (await exists(target)) return target;
  try {
    await exclusiveWrite(target, bytes);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
  }
  return target;
}

async function appendVariantReplaySafe(filePath, variant) {
  try {
    await exclusiveWrite(filePath, variant);
    return "created";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await readJson(filePath);
    if (text(existing.contentSha256) === variant.contentSha256) return "replayed-identical";
    throw new Error(`Append-only conflict at ${filePath}: the content-derived ID exists with different content.`);
  }
}

function assertIndexParity(index, diskRows) {
  const diskIds = diskRows.map((row) => row.id).sort();
  const indexIds = indexPayloadRows(index).map((row) => row.id).sort();
  if (new Set(indexIds).size !== indexIds.length) throw new Error("Direction Variant index contains duplicate IDs.");
  if (stableEchoEnrichmentStringify(diskIds) !== stableEchoEnrichmentStringify(indexIds)) {
    throw new Error(`Direction Variant index parity failed: disk=${diskIds.length}, index=${indexIds.length}.`);
  }
  return { diskRows: diskIds.length, indexRows: indexIds.length, exactIdParity: true };
}

export async function runEnrichmentDirectorVariantPass(options = parseEnrichmentDirectorArguments()) {
  const [enrichments, chainGraph, enrichmentReport, songsPayload, projects] = await Promise.all([
    readEnrichmentNdjson(options.enrichmentsPath),
    readJson(options.chainGraphPath),
    readJson(options.enrichmentReportPath),
    readJson(options.songsPath),
    discoverProjects(options.projectsDirectory, options.songId),
  ]);
  if (projects.length !== options.expectedSongCount) {
    throw new Error(`Expected exactly ${options.expectedSongCount} Echo projects; found ${projects.length}.`);
  }
  const uniqueProjectIds = new Set(projects.map((row) => row.songId));
  if (uniqueProjectIds.size !== projects.length) throw new Error("Echo project directory contains duplicate song IDs.");
  const catalog = buildEchoVideoEnrichmentCatalog({ enrichments, chainGraph, report: enrichmentReport });
  const catalogIntegrity = validateEchoEnrichmentCatalogIntegrity({ catalog, report: enrichmentReport });
  const songs = songLookup(songsPayload);
  const projectSnapshots = new Map(projects.map((project) => [project.filePath, sha256Bytes(project.bytes)]));
  const variantSnapshots = await snapshotExistingVariants(options.variantsDirectory);
  const existingIndex = await readJson(options.indexPath, {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [],
  });
  const diskRowsBefore = discoverDirectionVariantIndexRows({ variantsDirectory: options.variantsDirectory });
  mergeDirectionVariantIndexRows(indexPayloadRows(existingIndex), diskRowsBefore, []);
  const generated = [];
  for (const projectRow of projects) {
    const song = songs.get(projectRow.songId);
    if (!song) throw new Error(`Canonical Hapa song card missing for ${projectRow.songId}.`);
    const variantRows = await readSongVariants(options.variantsDirectory, projectRow.songId);
    const parentVariant = selectLatestEnrichmentParentVariant(variantRows.map((row) => row.variant));
    if (!parentVariant) throw new Error(`${projectRow.songId} has no ready non-legacy parent Director cut.`);
    const variant = compileEchoEnrichmentDirectorVariant({
      song,
      baseProject: projectRow.project,
      parentVariant,
      parentProjectSha256: sha256Bytes(projectRow.bytes),
      catalog,
      enrichments,
      chainGraph,
      report: enrichmentReport,
    });
    const variantPath = resolveEchoEnrichmentVariantPath(
      options.variantsDirectory,
      `${validateEchoEnrichmentSongId(projectRow.songId)}/${variant.id}.json`,
    );
    const prior = await readJson(variantPath, null);
    if (prior && text(prior.contentSha256) !== variant.contentSha256) {
      throw new Error(`Append-only conflict at ${variantPath}: the content-derived ID exists with different content.`);
    }
    generated.push({
      songId: projectRow.songId,
      projectPath: projectRow.filePath,
      parentVariantId: parentVariant.id,
      variantPath,
      variant,
      disposition: prior ? "existing-identical" : "pending-create",
    });
  }
  if (generated.length !== options.expectedSongCount) throw new Error("One-cut-per-song coverage invariant failed.");
  const variantIds = new Set(generated.map((row) => `${row.songId}:${row.variant.id}`));
  if (variantIds.size !== generated.length) throw new Error("Generated cut IDs are not unique per song.");
  const incomingRows = generated.map((row) => echoEnrichmentDirectorVariantIndexRow(row.songId, row.variant));
  const previewIndexRows = mergeDirectionVariantIndexRows(indexPayloadRows(existingIndex), diskRowsBefore, incomingRows);
  const effectiveTimestamp = generated.map((row) => row.variant.createdAt).sort().at(-1);
  const batchMetadata = {
    schemaVersion: "hapa.echo.enrichment-director-batch.v1",
    batchFingerprint: `sha256:${catalog.batchFingerprint}`,
    variationSetId: generated[0]?.variant.variationSet?.id || null,
    cutCount: generated.length,
    songCount: generated.length,
    generatedAt: effectiveTimestamp,
    appendOnly: true,
  };
  const report = {
    schemaVersion: ECHO_ENRICHMENT_DIRECTOR_REPORT_SCHEMA,
    mode: options.apply ? "apply" : "dry-run",
    dryRun: !options.apply,
    batch: batchMetadata,
    inputs: {
      enrichments: options.enrichmentsPath,
      chainGraph: options.chainGraphPath,
      enrichmentReport: options.enrichmentReportPath,
      songs: options.songsPath,
      projects: options.projectsDirectory,
      variants: options.variantsDirectory,
      expectedSchema: ECHO_VIDEO_ENRICHMENT_EXPECTED_SCHEMA,
    },
    enrichment: {
      rows: catalog.rows.length,
      playableRows: catalog.rows.filter((row) => row.uri && row.playable !== false).length,
      rowsMissingSemanticText: catalog.rows.filter((row) => row.missing.includes("semantic-text")).length,
      chainEdges: catalog.edges.length,
      computedFingerprint: `sha256:${catalog.computedFingerprint}`,
      declaredFingerprint: catalog.declaredFingerprint ? `sha256:${catalog.declaredFingerprint}` : null,
      integrity: catalogIntegrity,
    },
    variants: {
      songs: generated.length,
      generated: generated.length,
      newFiles: generated.filter((row) => row.disposition === "pending-create").length,
      existingIdentical: generated.filter((row) => row.disposition === "existing-identical").length,
      parentCuts: Object.fromEntries(generated.map((row) => [row.songId, row.parentVariantId])),
      cuts: generated.map((row) => ({
        songId: row.songId,
        variantId: row.variant.id,
        contentSha256: row.variant.contentSha256,
        shots: row.variant.timeline.length,
        replacementShots: row.variant.telemetry.replacementShots,
        lowPriorSelections: row.variant.telemetry.lowPriorSelections,
        lyricsUnavailableShots: row.variant.telemetry.lyricsUnavailableShots,
      })),
    },
    index: {
      beforeRows: indexPayloadRows(existingIndex).length,
      diskRowsBefore: diskRowsBefore.length,
      previewRowsAfter: previewIndexRows.length,
      serializedRebuild: options.apply ? "pending" : "dry-run-only",
    },
    validation: {
      exactSongCoverage: generated.length === options.expectedSongCount,
      oneCutPerSong: variantIds.size === generated.length,
      allCutsReady: generated.every((row) => row.variant.status === "ready" && row.variant.validation?.ok),
      baseProjectsMutated: 0,
      existingVariantsMutated: 0,
      indexMatchesDiskAfterApply: options.apply ? null : "pending-apply",
    },
    outputs: {
      report: options.apply ? options.reportPath : null,
      variantIndex: options.indexPath,
    },
  };

  if (options.apply) {
    report.index.backup = await backupIndex(options.indexPath, options.backupsDirectory, catalog.batchFingerprint);
    for (const row of generated) row.disposition = await appendVariantReplaySafe(row.variantPath, row.variant);
    await withIndexLock(options.indexPath, async () => {
      const lockedIndex = await readJson(options.indexPath, {
        schemaVersion: "hapa.echo.direction-script-variant-index.v1",
        variants: [],
      });
      const diskRows = discoverDirectionVariantIndexRows({ variantsDirectory: options.variantsDirectory });
      const rows = mergeDirectionVariantIndexRows(indexPayloadRows(lockedIndex), diskRows, incomingRows);
      const nextIndex = {
        ...lockedIndex,
        schemaVersion: "hapa.echo.direction-script-variant-index.v1",
        variants: rows,
        updatedAt: effectiveTimestamp,
        enrichmentDirectorBatch: batchMetadata,
      };
      if (stableEchoEnrichmentStringify(indexStablePayload(lockedIndex)) !== stableEchoEnrichmentStringify(indexStablePayload(nextIndex))) {
        await atomicWrite(options.indexPath, nextIndex);
      }
      report.index.serializedRebuild = "complete";
    });
  }

  const changedProjects = [];
  for (const [filePath, before] of projectSnapshots) {
    if (sha256Bytes(await readFile(filePath)) !== before) changedProjects.push(filePath);
  }
  const changedVariants = await changedSnapshots(variantSnapshots);
  if (changedProjects.length) throw new Error(`Immutable base projects changed: ${changedProjects.join(", ")}`);
  if (changedVariants.length) throw new Error(`Existing append-only variants changed: ${changedVariants.join(", ")}`);
  report.validation.baseProjectsMutated = changedProjects.length;
  report.validation.existingVariantsMutated = changedVariants.length;

  if (options.apply) {
    const diskRowsAfter = discoverDirectionVariantIndexRows({ variantsDirectory: options.variantsDirectory });
    const persistedIndex = await readJson(options.indexPath);
    const parity = assertIndexParity(persistedIndex, diskRowsAfter);
    report.validation.indexMatchesDiskAfterApply = parity.exactIdParity;
    report.index.diskRowsAfter = parity.diskRows;
    report.index.persistedRowsAfter = parity.indexRows;
    report.variants.newFiles = generated.filter((row) => row.disposition === "created").length;
    report.variants.existingIdentical = generated.filter((row) => row.disposition !== "created").length;
    await atomicWrite(options.reportPath, report);
  }
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const report = await runEnrichmentDirectorVariantPass(parseEnrichmentDirectorArguments(argv));
  process.stdout.write(json({ ok: true, ...report }));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
