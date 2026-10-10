#!/usr/bin/env node
import { createHash } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  deriveEchoDirectionVariantProject,
  echoDirectionVariantFingerprint,
  pickEchoDirectionVariantProjectPatch,
} from "../src/domain/echo-direction-variants.js";
import {
  discoverDirectionVariantIndexRows,
  mergeDirectionVariantIndexRows,
} from "../src/domain/echo-direction-variant-index.js";
import { selectLatestEchoDirectionScriptVariant } from "../src/domain/echo-record-garden.js";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";
import {
  applyEchoHorizontalPortraitCameraDoctrine,
  ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINE_SCHEMA,
  ECHO_PORTRAIT_SCAN_DEFAULT_DOCTRINE_ID,
  resolveEchoHorizontalPortraitCameraDoctrine,
} from "../src/domain/echo-horizontal-portrait-camera-doctrine.js";
import {
  resolveEchoEnrichmentVariantPath,
  validateEchoEnrichmentSongId,
} from "../src/domain/echo-enrichment-path-safety.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const COMPILER = "hapa-echo-horizontal-portrait-camera-doctrine-v2";
const VARIANT_SCHEMA = "hapa.echo.direction-script-variant.v1";
const VARIATION_SET = Object.freeze({
  id: "echo-horizontal-portrait-full-height-scan-v2",
  label: "Echo Horizontal Cuts · Full-Height Portrait Scan V2",
  appendOnly: true,
});

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clone(value) {
  if (value === undefined) return undefined;
  return typeof structuredClone === "function"
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function option(argv, name, fallback = "") {
  const exact = argv.indexOf(name);
  if (exact >= 0 && argv[exact + 1] && !argv[exact + 1].startsWith("--")) return argv[exact + 1];
  const prefixed = argv.find((argument) => argument.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1) : fallback;
}

function parseArguments(argv = process.argv.slice(2)) {
  const songId = text(option(argv, "--song-id"));
  if (songId) validateEchoEnrichmentSongId(songId);
  const expectedProjectCount = Number(option(argv, "--expected-project-count", songId ? "1" : "196"));
  if (!Number.isInteger(expectedProjectCount) || expectedProjectCount < 1) {
    throw new Error("--expected-project-count must be a positive integer.");
  }
  const variantsDirectory = path.resolve(option(
    argv,
    "--variants",
    path.join(ROOT, "data/music-video-project-variants"),
  ));
  // One alternating full-height scan cut per landscape song unless doctrines are named.
  const doctrines = text(option(argv, "--doctrines", ECHO_PORTRAIT_SCAN_DEFAULT_DOCTRINE_ID))
    .split(",").map((id) => resolveEchoHorizontalPortraitCameraDoctrine(id.trim()));
  return {
    apply: argv.includes("--apply"),
    doctrines,
    songId,
    expectedProjectCount,
    projectsDirectory: path.resolve(option(
      argv,
      "--projects",
      path.join(ROOT, "data/music-video-projects"),
    )),
    variantsDirectory,
    indexPath: path.resolve(option(argv, "--index", path.join(variantsDirectory, "index.json"))),
    backupsDirectory: path.resolve(option(argv, "--backups", path.join(ROOT, "data/backups"))),
    reportPath: path.resolve(option(
      argv,
      "--report-out",
      path.join(ROOT, "artifacts/echo-horizontal-portrait-camera-doctrine/report.json"),
    )),
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

async function discoverProjects(directory, songId = "") {
  const rows = [];
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .filter((candidate) => candidate.isFile() && candidate.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const filePath = path.join(directory, entry.name);
    const bytes = await readFile(filePath);
    const payload = JSON.parse(bytes.toString("utf8"));
    const project = payload.music_video_project || payload;
    const id = validateEchoEnrichmentSongId(text(project.song_id || project.songId));
    if (songId && id !== songId) continue;
    if (!(Number(project.output_profile?.width) > Number(project.output_profile?.height))) continue;
    rows.push({ songId: id, filePath, bytes, project });
  }
  return rows;
}

async function readSongVariants(variantsDirectory, songId) {
  const directory = resolveEchoEnrichmentVariantPath(variantsDirectory, songId);
  const variants = [];
  for (const entry of (await readdir(directory, { withFileTypes: true }))
    .filter((candidate) => candidate.isFile() && candidate.name.endsWith(".json"))
    .sort((left, right) => left.name.localeCompare(right.name))) {
    const filePath = path.join(directory, entry.name);
    const bytes = await readFile(filePath);
    variants.push({ filePath, bytes, variant: JSON.parse(bytes.toString("utf8")) });
  }
  return variants;
}

function sourceVariantForProject(rows, project) {
  const candidates = rows.map((row) => row.variant).filter((variant) => (
    variant.lineage?.kind !== "append-only-horizontal-portrait-camera-doctrine"
    && !text(variant.id).startsWith("horizontal-portrait-camera-")
  ));
  const latest = selectLatestEchoDirectionScriptVariant({
    ...project,
    direction_script_variants: candidates,
  });
  const source = candidates.find((variant) => text(variant.id) === latest?.id);
  if (!source) throw new Error(`${project.song_id} has no ready non-legacy source Director cut.`);
  return source;
}

function sourceProject(baseProject, sourceVariant) {
  const patch = clone(sourceVariant.project_patch || sourceVariant.projectPatch || {});
  return {
    ...clone(baseProject),
    ...patch,
    timeline: clone(Array.isArray(sourceVariant.timeline) ? sourceVariant.timeline : baseProject.timeline || []),
    visualizer_timeline: clone(
      Array.isArray(sourceVariant.visualizer_timeline) ? sourceVariant.visualizer_timeline
        : Array.isArray(sourceVariant.visualizerTimeline) ? sourceVariant.visualizerTimeline
          : baseProject.visualizer_timeline || [],
    ),
    persistent_shader_slots: clone(
      Array.isArray(sourceVariant.persistent_shader_slots) ? sourceVariant.persistent_shader_slots
        : Array.isArray(patch.persistent_shader_slots) ? patch.persistent_shader_slots
          : baseProject.persistent_shader_slots || [],
    ),
  };
}

function timestampAfter(sourceVariant, offsetMilliseconds) {
  const milliseconds = Math.max(
    Date.parse(text(sourceVariant.updatedAt || sourceVariant.updated_at)) || 0,
    Date.parse(text(sourceVariant.createdAt || sourceVariant.created_at)) || 0,
    Date.parse("2026-01-01T00:00:00.000Z"),
  );
  return new Date(milliseconds + offsetMilliseconds).toISOString();
}

function compileVariant({ projectRow, sourceVariant, doctrine }) {
  const parentProject = sourceProject(projectRow.project, sourceVariant);
  const result = applyEchoHorizontalPortraitCameraDoctrine({
    project: parentProject,
    timeline: parentProject.timeline,
    doctrine,
    contractMode: "compact",
  });
  const parentFingerprint = echoDirectionVariantFingerprint(sourceVariant);
  const parentProjectSha256 = sha256(projectRow.bytes);
  const semanticDigest = sha256(json({
    compiler: COMPILER,
    doctrine: doctrine.id,
    songId: projectRow.songId,
    parentVariantId: sourceVariant.id,
    parentFingerprint,
    timeline: result.timeline,
  }));
  const createdAt = timestampAfter(sourceVariant, doctrine.cutOrdinal);
  const projectPatch = pickEchoDirectionVariantProjectPatch(parentProject);
  const projectedProject = {
    ...clone(parentProject),
    ...clone(projectPatch),
    timeline: result.timeline,
  };
  const variant = {
    schemaVersion: VARIANT_SCHEMA,
    id: `horizontal-portrait-camera-${doctrine.id}-${semanticDigest.slice(0, 12)}`,
    title: `${text(projectRow.project.song_title, projectRow.songId)} · ${doctrine.label}`,
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    contentSha256: semanticDigest,
    parent: {
      songId: projectRow.songId,
      projectSha256: parentProjectSha256,
      variantId: sourceVariant.id,
      variantFingerprint: parentFingerprint,
      immutableLegacyProject: true,
      immutableParentVariant: true,
    },
    lineage: {
      kind: "append-only-horizontal-portrait-camera-doctrine",
      compiler: COMPILER,
      parentVariantId: sourceVariant.id,
      parentVariantFingerprint: parentFingerprint,
      doctrineSchemaVersion: ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINE_SCHEMA,
      doctrineId: doctrine.id,
      appendOnly: true,
    },
    variationSet: clone(VARIATION_SET),
    cut: { ordinal: doctrine.cutOrdinal, label: doctrine.label },
    sourcePolicy: {
      mode: "camera-only-horizontal-portrait-reframe",
      mediaSelectionPreserved: true,
      timingPreserved: true,
      outputScope: "landscape-only",
      portraitVideoPolicy: doctrine.alternate ? "full-height-cover-scan-alternating" : `full-height-cover-${doctrine.firstMotion}`,
      tallSourceThreshold: "cover crop hides at least 35% of source height",
      certifiedAtomicTransitionsPreserved: true,
    },
    preservation: {
      baseProjectMutated: false,
      sourceVariantMutated: false,
      timing: true,
      sections: true,
      stems: true,
      audioBindings: true,
      mediaSelection: true,
      visualizers: true,
      persistentShaders: true,
      camera: false,
    },
    timeline: result.timeline,
    visualizer_timeline: clone(parentProject.visualizer_timeline || []),
    persistent_shader_slots: clone(parentProject.persistent_shader_slots || []),
    project_patch: projectPatch,
    telemetry: {
      ...result.telemetry,
      selectionMode: "camera-only-horizontal-portrait-reframe",
      replacementShots: 0,
      mediaBearingShots: result.timeline.filter((shot) => text(shot.media_uri)).length,
      uniqueMedia: new Set(result.timeline.map((shot) => text(shot.media_id)).filter(Boolean)).size,
      sourceVariantId: sourceVariant.id,
    },
    hyperframe_script: generateEchoHyperframeScript(projectedProject),
  };
  variant.fingerprint = echoDirectionVariantFingerprint(variant);
  deriveEchoDirectionVariantProject(projectRow.project, variant);
  return variant;
}

function indexRows(payload) {
  return Array.isArray(payload) ? payload : Array.isArray(payload?.variants) ? payload.variants : [];
}

async function atomicWrite(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporary, json(payload), { flag: "wx" });
  await rename(temporary, filePath);
}

async function appendVariant(filePath, variant) {
  await mkdir(path.dirname(filePath), { recursive: true });
  try {
    const handle = await open(filePath, "wx");
    try {
      await handle.writeFile(json(variant));
    } finally {
      await handle.close();
    }
    return "created";
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    const existing = await readFile(filePath, "utf8");
    if (existing !== json(variant)) throw new Error(`Append-only conflict at ${filePath}.`);
    return "existing-identical";
  }
}

async function backupIndex(indexPath, backupsDirectory, digest) {
  const bytes = await readFile(indexPath);
  await mkdir(backupsDirectory, { recursive: true });
  const backupPath = path.join(
    backupsDirectory,
    `music-video-project-variants-index-before-horizontal-portrait-${digest.slice(0, 12)}.json`,
  );
  try {
    await writeFile(backupPath, bytes, { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST" || sha256(await readFile(backupPath)) !== sha256(bytes)) throw error;
  }
  return backupPath;
}

async function snapshot(paths) {
  const rows = new Map();
  for (const filePath of paths) rows.set(filePath, sha256(await readFile(filePath)));
  return rows;
}

async function changed(snapshotRows) {
  const rows = [];
  for (const [filePath, digest] of snapshotRows) {
    if (sha256(await readFile(filePath)) !== digest) rows.push(filePath);
  }
  return rows;
}

export async function runHorizontalPortraitCameraDoctrinePass(options = parseArguments()) {
  const projects = await discoverProjects(options.projectsDirectory, options.songId);
  if (projects.length !== options.expectedProjectCount) {
    throw new Error(`Expected ${options.expectedProjectCount} landscape Echo projects; found ${projects.length}.`);
  }
  const existingIndex = await readJson(options.indexPath, { schemaVersion: "hapa.echo.direction-script-variant-index.v1", variants: [] });
  const diskRowsBefore = discoverDirectionVariantIndexRows({ variantsDirectory: options.variantsDirectory });
  mergeDirectionVariantIndexRows(indexRows(existingIndex), diskRowsBefore, []);
  const projectSnapshot = await snapshot(projects.map((row) => row.filePath));
  const generated = [];
  const immutableVariantPaths = [];
  for (const projectRow of projects) {
    const rows = await readSongVariants(options.variantsDirectory, projectRow.songId);
    immutableVariantPaths.push(...rows.map((row) => row.filePath));
    const sourceVariant = sourceVariantForProject(rows, projectRow.project);
    for (const doctrine of options.doctrines) {
      const variant = compileVariant({ projectRow, sourceVariant, doctrine });
      const variantPath = resolveEchoEnrichmentVariantPath(
        options.variantsDirectory,
        `${projectRow.songId}/${variant.id}.json`,
      );
      const prior = await readJson(variantPath, null);
      if (prior && json(prior) !== json(variant)) throw new Error(`Append-only conflict at ${variantPath}.`);
      generated.push({
        songId: projectRow.songId,
        sourceVariantId: sourceVariant.id,
        doctrineId: doctrine.id,
        variant,
        variantPath,
        disposition: prior ? "existing-identical" : "pending-create",
      });
    }
  }
  const immutableVariantSnapshot = await snapshot(immutableVariantPaths);
  if (generated.length !== projects.length * options.doctrines.length) {
    throw new Error("One-cut-per-doctrine-per-landscape-video coverage invariant failed.");
  }
  const report = {
    schemaVersion: "hapa.echo.horizontal-portrait-camera-doctrine-report.v1",
    mode: options.apply ? "apply" : "dry-run",
    dryRun: !options.apply,
    compiler: COMPILER,
    variationSet: clone(VARIATION_SET),
    inputs: {
      projects: options.projectsDirectory,
      variants: options.variantsDirectory,
      index: options.indexPath,
      landscapeOnly: true,
    },
    coverage: {
      landscapeProjects: projects.length,
      doctrines: options.doctrines.map((doctrine) => doctrine.id),
      cuts: generated.length,
      exactlyOneCutPerDoctrinePerProject: generated.length === projects.length * options.doctrines.length,
      projectsWithPortraitVideoShots: new Set(generated
        .filter((row) => row.variant.telemetry.portraitVideoShots > 0)
        .map((row) => row.songId)).size,
      projectsWithoutPortraitVideoShots: [...new Set(generated
        .filter((row) => row.variant.telemetry.portraitVideoShots === 0)
        .map((row) => row.songId))].sort(),
      portraitVideoShotsPerDoctrine: Object.fromEntries(options.doctrines.map((doctrine) => [
        doctrine.id,
        generated.filter((row) => row.doctrineId === doctrine.id)
          .reduce((sum, row) => sum + row.variant.telemetry.portraitVideoShots, 0),
      ])),
      reframedShotsPerDoctrine: Object.fromEntries(options.doctrines.map((doctrine) => [
        doctrine.id,
        generated.filter((row) => row.doctrineId === doctrine.id)
          .reduce((sum, row) => sum + row.variant.telemetry.reframedShots, 0),
      ])),
      certifiedAtomicShotsPreservedPerDoctrine: Object.fromEntries(options.doctrines.map((doctrine) => [
        doctrine.id,
        generated.filter((row) => row.doctrineId === doctrine.id)
          .reduce((sum, row) => sum + row.variant.telemetry.certifiedAtomicShotsPreserved, 0),
      ])),
    },
    variants: {
      pendingCreate: generated.filter((row) => row.disposition === "pending-create").length,
      existingIdentical: generated.filter((row) => row.disposition === "existing-identical").length,
      cuts: generated.map((row) => ({
        songId: row.songId,
        sourceVariantId: row.sourceVariantId,
        doctrineId: row.doctrineId,
        variantId: row.variant.id,
        portraitVideoShots: row.variant.telemetry.portraitVideoShots,
        reframedShots: row.variant.telemetry.reframedShots,
        disposition: row.disposition,
      })),
    },
    validation: {
      baseProjectsMutated: 0,
      existingVariantsMutated: 0,
      indexMatchesDiskAfterApply: options.apply ? null : "pending-apply",
    },
    outputs: {
      report: options.apply ? options.reportPath : null,
      variantIndex: options.indexPath,
      backup: null,
    },
  };
  if (options.apply) {
    const batchDigest = sha256(json(generated.map((row) => [row.songId, row.variant.id])));
    report.outputs.backup = await backupIndex(options.indexPath, options.backupsDirectory, batchDigest);
    for (const row of generated) row.disposition = await appendVariant(row.variantPath, row.variant);
    const diskRowsAfter = discoverDirectionVariantIndexRows({ variantsDirectory: options.variantsDirectory });
    const mergedRows = mergeDirectionVariantIndexRows(indexRows(existingIndex), diskRowsAfter, []);
    const updatedAt = generated.map((row) => row.variant.updatedAt).sort().at(-1);
    await atomicWrite(options.indexPath, {
      ...existingIndex,
      schemaVersion: "hapa.echo.direction-script-variant-index.v1",
      variants: mergedRows,
      updatedAt,
      horizontalPortraitCameraDoctrineBatch: {
        schemaVersion: ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINE_SCHEMA,
        compiler: COMPILER,
        variationSetId: VARIATION_SET.id,
        projectCount: projects.length,
        cutCount: generated.length,
        batchDigest: `sha256:${batchDigest}`,
        appendOnly: true,
      },
    });
    const persisted = await readJson(options.indexPath);
    const persistedIds = new Set(indexRows(persisted).map((row) => text(row.id)));
    const diskIds = new Set(diskRowsAfter.map((row) => text(row.id)));
    report.validation.indexMatchesDiskAfterApply = persistedIds.size === diskIds.size
      && [...diskIds].every((id) => persistedIds.has(id));
    report.variants.pendingCreate = generated.filter((row) => row.disposition === "created").length;
    report.variants.existingIdentical = generated.filter((row) => row.disposition !== "created").length;
  }
  const changedProjects = await changed(projectSnapshot);
  const changedVariants = await changed(immutableVariantSnapshot);
  if (changedProjects.length) throw new Error(`Immutable base projects changed: ${changedProjects.join(", ")}.`);
  if (changedVariants.length) throw new Error(`Existing append-only variants changed: ${changedVariants.join(", ")}.`);
  report.validation.baseProjectsMutated = changedProjects.length;
  report.validation.existingVariantsMutated = changedVariants.length;
  if (options.apply) await atomicWrite(options.reportPath, report);
  return report;
}

export async function main(argv = process.argv.slice(2)) {
  const report = await runHorizontalPortraitCameraDoctrinePass(parseArguments(argv));
  process.stdout.write(json({ ok: true, ...report }));
  return report;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}
