#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assignVibesTransitionJobsToSongs,
  buildVibesTransitionDirectorVariant,
  vibesTransitionBatchIdentity,
  vibesTransitionVariantFingerprint,
} from "../src/domain/vibes-transition-director-scripts.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DATA_DIR = path.join(ROOT, "data");
const PROJECTS_DIR = path.join(DATA_DIR, "music-video-projects");
const VARIANTS_DIR = path.join(DATA_DIR, "music-video-project-variants");
const VARIANT_INDEX_PATH = path.join(VARIANTS_DIR, "index.json");
const QUEUE_PATH = path.join(DATA_DIR, "vibes-transition-links", "queue.json");
const APPROVED_SCRIPTS_PATH = path.join(DATA_DIR, "echo-reference-mining", "artifacts", "director-scripts-approved.json");
const EXPLORATORY_SCRIPTS_PATH = path.join(DATA_DIR, "echo-reference-mining", "artifacts", "director-scripts-exploratory.json");
const REPORTS_DIR = path.join(DATA_DIR, "merge-reports");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");
const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply");
const STARTED_AT = new Date().toISOString();

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function hashBytes(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(filePath, fallback = undefined) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (fallback !== undefined && error?.code === "ENOENT") return fallback;
    throw error;
  }
}

async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, typeof value === "string" ? value : json(value), "utf8");
  await rename(tempPath, filePath);
}

async function loadProjects() {
  const rows = new Map();
  for (const fileName of (await readdir(PROJECTS_DIR)).filter((name) => name.endsWith("-video-project.json")).sort()) {
    const projectPath = path.join(PROJECTS_DIR, fileName);
    const bytes = await readFile(projectPath);
    const payload = JSON.parse(bytes.toString("utf8"));
    const project = payload.music_video_project || payload;
    if (!project?.song_id) continue;
    rows.set(project.song_id, {
      project,
      projectPath,
      fileName,
      sha256: hashBytes(bytes),
    });
  }
  return rows;
}

async function main() {
  const [queue, projects, existingIndex, approvedScripts, exploratoryScripts] = await Promise.all([
    readJson(QUEUE_PATH),
    loadProjects(),
    readJson(VARIANT_INDEX_PATH, { schemaVersion: "hapa.echo.direction-script-variant-index.v1", variants: [] }),
    readJson(APPROVED_SCRIPTS_PATH, { scripts: [] }),
    readJson(EXPLORATORY_SCRIPTS_PATH, { scripts: [] }),
  ]);
  const assignment = assignVibesTransitionJobsToSongs(queue, {
    projectSongIds: [...projects.keys()],
    directorScriptAlbums: [approvedScripts, exploratoryScripts],
  });
  if (!assignment.jobs.length) throw new Error("No ready Vibes transition videos are available.");
  if (assignment.unassignedJobIds.length) {
    throw new Error(`Ready Vibes transition jobs could not be assigned: ${assignment.unassignedJobIds.join(", ")}`);
  }

  const batch = vibesTransitionBatchIdentity(assignment.jobs);
  const runId = `vibes-transition-director-scripts-${batch.fingerprint.slice(0, 12)}`;
  const generated = [];
  for (const [songId, jobs] of [...assignment.assignments].sort(([a], [b]) => a.localeCompare(b))) {
    const source = projects.get(songId);
    if (!source) throw new Error(`Assigned Echo Album project is missing: ${songId}`);
    const variant = buildVibesTransitionDirectorVariant(source.project, jobs, {
      batchIdentity: batch,
      albumJobs: assignment.jobs,
      parentProjectHash: source.sha256,
      createdAt: STARTED_AT,
      fallbackSongId: assignment.fallbackSongId,
    });
    const variantPath = path.join(VARIANTS_DIR, songId, `${variant.id}.json`);
    const existing = await readJson(variantPath, null);
    if (existing && vibesTransitionVariantFingerprint(existing) !== vibesTransitionVariantFingerprint(variant)) {
      throw new Error(`Append-only conflict at ${variantPath}; the existing Director Script has different content.`);
    }
    generated.push({ songId, source, jobs, variant, variantPath, existing: Boolean(existing) });
  }

  const coveredReadyJobIds = new Set(generated.flatMap((row) => row.jobs.map((job) => job.id)));
  const missingReadyJobIds = assignment.jobs.map((job) => job.id).filter((jobId) => !coveredReadyJobIds.has(jobId));
  if (missingReadyJobIds.length) throw new Error(`Ready videos are missing from the Director Script batch: ${missingReadyJobIds.join(", ")}`);

  const indexRows = generated.map(({ songId, source, variant }) => ({
    id: `${songId}:${variant.id}`,
    songId,
    variantId: variant.id,
    title: variant.title,
    relativePath: `${songId}/${variant.id}.json`,
    parentProjectSha256: source.sha256,
    sourcePolicy: variant.sourcePolicy,
    replacementShots: variant.telemetry.replacementShots,
    sourceSelections: { "vibes-transition-link": variant.telemetry.assignedReadyVideos },
    uniqueMedia: variant.telemetry.uniqueMedia,
    updatedAt: STARTED_AT,
  }));
  const incomingIds = new Set(indexRows.map((row) => row.id));
  const nextIndex = {
    schemaVersion: "hapa.echo.direction-script-variant-index.v1",
    variants: [...indexRows, ...list(existingIndex.variants).filter((row) => !incomingIds.has(row.id))],
    updatedAt: STARTED_AT,
  };
  const report = {
    schemaVersion: "hapa.vibes-transition-director-script-report.v1",
    runId,
    mode: APPLY ? "apply" : "dry-run",
    batch: {
      fingerprint: batch.fingerprint,
      variantId: batch.variantId,
      readyVideos: assignment.jobs.length,
    },
    assignment: {
      directorScripts: generated.length,
      songs: generated.map((row) => ({
        songId: row.songId,
        title: row.variant.title,
        videoCount: row.jobs.length,
        jobIds: row.jobs.map((job) => job.id),
      })),
      fallbackShowcaseSongId: assignment.fallbackSongId,
      fallbackJobIds: assignment.fallbackJobIds,
      unassignedJobIds: assignment.unassignedJobIds,
    },
    validation: {
      allReadyVideosCovered: missingReadyJobIds.length === 0,
      readyVideosCovered: coveredReadyJobIds.size,
      legacyProjectsMutated: 0,
      existingDirectionScriptsMutated: 0,
      appendOnly: true,
    },
    outputs: {
      variantsRoot: VARIANTS_DIR,
      variantIndex: VARIANT_INDEX_PATH,
    },
    generatedAt: STARTED_AT,
  };

  if (APPLY) {
    const backupDirectory = path.join(BACKUPS_DIR, runId);
    await mkdir(backupDirectory, { recursive: true });
    if (await stat(VARIANT_INDEX_PATH).catch(() => null)) {
      await copyFile(VARIANT_INDEX_PATH, path.join(backupDirectory, "index.json"));
    }
    for (const row of generated.filter((entry) => !entry.existing)) {
      await atomicWrite(row.variantPath, row.variant);
    }
    await atomicWrite(VARIANT_INDEX_PATH, nextIndex);
    report.outputs.backupDirectory = backupDirectory;
  }

  await mkdir(REPORTS_DIR, { recursive: true });
  const reportPath = path.join(REPORTS_DIR, `${runId}${APPLY ? "" : "-dry-run"}.json`);
  await atomicWrite(reportPath, report);
  report.outputs.report = reportPath;
  console.log(json(report));
}

await main();
