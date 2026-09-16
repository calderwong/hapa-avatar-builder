#!/usr/bin/env node
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildEchoReferenceMediaLibrary } from "../server/echo-reference-media-library.mjs";
import { buildReferenceLoopDirectorCandidates } from "../src/domain/echo-reference-loop-director.js";
import { recastBalancedEchoDirectorProject } from "../src/domain/echo-media-recast.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PROJECTS = path.join(ROOT, "data/music-video-projects");
const VARIANTS = path.join(ROOT, "data/music-video-project-variants");
const INDEX = path.join(VARIANTS, "index.json");
const REPORTS = path.join(ROOT, "artifacts/reference-loop-director");

function argument(name, fallback = "") {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length).trim() || fallback;
}
function json(value) { return `${JSON.stringify(value, null, 2)}\n`; }
function sha256(value) { return createHash("sha256").update(value).digest("hex"); }
function safeId(value) {
  const result = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  if (!result || path.basename(result) !== result) throw new Error(`Unsafe identifier: ${value}`);
  return result;
}
async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (fallback !== null && error?.code === "ENOENT") return fallback; throw error; }
}
async function atomicWrite(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(temporary, json(value), "utf8");
  await rename(temporary, filePath);
}

const sourceImageRunId = argument("image-run-id");
if (!sourceImageRunId) throw new Error("--image-run-id is required so the Director pass has immutable media provenance.");
const apply = process.argv.includes("--apply");
const targetSongId = argument("song-id");
const runSuffix = sourceImageRunId.split("-").at(-1).slice(0, 12);
const variantId = safeId(argument("variant-id", `reference-loops-${runSuffix}-v1`));
const now = new Date().toISOString();
const library = await buildEchoReferenceMediaLibrary({});
const candidates = buildReferenceLoopDirectorCandidates(library, { sourceImageRunId });
if (!candidates.length) throw new Error(`No completed local-H3 loops are attached to image run ${sourceImageRunId}; keep this pass queued until its loop manifest completes.`);
const imageJobs = library.items.filter((item) => item.source?.runId === sourceImageRunId);
if (candidates.length !== imageJobs.length) throw new Error(`Reference run ${sourceImageRunId} is not complete: ${candidates.length}/${imageJobs.length} card loops are attached.`);

const projectFiles = (await readdir(PROJECTS)).filter((name) => name.endsWith("-video-project.json")).sort();
const selected = [];
for (const fileName of projectFiles) {
  const bytes = await readFile(path.join(PROJECTS, fileName));
  const payload = JSON.parse(bytes.toString("utf8"));
  const project = payload.music_video_project || payload;
  if (!project?.song_id || (targetSongId && project.song_id !== targetSongId)) continue;
  const parentProjectSha256 = sha256(bytes);
  const variant = recastBalancedEchoDirectorProject(project, candidates, {
    variantId,
    title: "Gnow Her Reference Cards · local H3 loop recast",
    seed: `${project.song_id}:${variantId}:${sourceImageRunId}`,
    parentProjectHash: parentProjectSha256,
    createdAt: now,
    allowedSourceGroups: ["reference"],
    sourcePattern: ["reference"],
    rotateSourcePattern: false,
    requireAllSourceGroups: true,
    coveragePass: { strategy: "deterministic-shuffle-bag-across-one-immutable-reference-run", sourceImageRunId, candidateCount: candidates.length },
  });
  variant.sourcePolicy.referenceImageRunId = sourceImageRunId;
  variant.sourcePolicy.referenceLibraryDigest = library.digest;
  variant.sourcePolicy.referenceCardCount = candidates.length;
  selected.push({ project, parentProjectSha256, variant });
}
if (!selected.length) throw new Error(targetSongId ? `No Director project found for ${targetSongId}.` : "No Echo Director projects found.");

const existingIndex = await readJson(INDEX, { schemaVersion: "hapa.echo.direction-script-variant-index.v1", variants: [] });
const targetPaths = selected.map(({ project }) => path.join(VARIANTS, project.song_id, `${variantId}.json`));
for (const targetPath of targetPaths) if (await stat(targetPath).catch(() => null)) throw new Error(`Append-only conflict: ${targetPath} already exists. Choose a new --variant-id.`);
const indexRows = selected.map(({ project, parentProjectSha256, variant }) => ({
  id: `${project.song_id}:${variantId}`, songId: project.song_id, variantId, title: variant.title,
  relativePath: `${project.song_id}/${variantId}.json`, parentProjectSha256, sourcePolicy: variant.sourcePolicy,
  replacementShots: variant.telemetry.replacementShots, sourceSelections: variant.telemetry.selectionsBySource,
  uniqueMedia: variant.telemetry.uniqueMedia, mediaBearingShots: variant.telemetry.mediaBearingShots,
  visualizerOnlyShots: variant.telemetry.visualizerOnlyShots, updatedAt: now,
}));
const report = {
  schemaVersion: "hapa.echo.reference-loop-director-run.v1", mode: apply ? "apply" : "dry-run", generatedAt: now,
  sourceImageRunId, referenceLibraryDigest: library.digest, variantId,
  counts: { cards: candidates.length, songs: selected.length, variants: selected.length },
  cards: candidates.map((candidate) => ({ id: candidate.id, title: candidate.title, uri: candidate.uri, sha256: candidate.sha256 })), variants: indexRows,
};
if (apply) {
  const backupPath = path.join(ROOT, "data/backups", `music-video-project-variants-index.before-${variantId}-${now.replace(/[:.]/g, "-")}.json`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(INDEX, backupPath);
  for (let index = 0; index < selected.length; index += 1) await atomicWrite(targetPaths[index], selected[index].variant);
  await atomicWrite(INDEX, { ...existingIndex, variants: [...indexRows, ...(existingIndex.variants || [])], updatedAt: now });
  report.backupPath = backupPath;
}
await mkdir(REPORTS, { recursive: true });
const reportPath = path.join(REPORTS, `${variantId}-${apply ? "apply" : "dry-run"}.json`);
await atomicWrite(reportPath, report);
console.log(json({ ok: true, reportPath, ...report.counts, variantId, mode: report.mode }));
