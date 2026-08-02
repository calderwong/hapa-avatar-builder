#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  resolveEchoEnrichmentVariantPath,
  validateEchoEnrichmentSongId,
  validateEchoEnrichmentVariantId,
} from "../src/domain/echo-enrichment-path-safety.js";
import { preflightEchoDirectionCut } from "./preflight-echo-director-media.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const APPLY = process.argv.slice(2).includes("--apply");
const REPORT_PATH = path.join(ROOT, "artifacts/echo-enrichment-director-variants/report.json");
const OUTPUT_PATH = path.join(ROOT, "artifacts/echo-enrichment-director-variants/render-preflight.json");
const PROJECTS_ROOT = path.join(ROOT, "data/music-video-projects");
const VARIANTS_ROOT = path.join(ROOT, "data/music-video-project-variants");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function bodyOf(payload = {}) {
  return payload?.music_video_project || payload || {};
}

function jsonFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith(".json"))
    .map((entry) => path.join(directory, entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function atomicWrite(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, filePath);
}

export function preflightCurrentEnrichmentDirectorBatch({
  root = ROOT,
  reportPath = REPORT_PATH,
} = {}) {
  const report = readJson(reportPath);
  const cuts = Array.isArray(report?.variants?.cuts) ? report.variants.cuts : [];
  if (!cuts.length) throw new Error("The enrichment Director report does not declare a current cut batch.");
  const projectsRoot = path.join(root, "data/music-video-projects");
  const variantsRoot = path.join(root, "data/music-video-project-variants");
  const projects = new Map();
  for (const projectPath of jsonFiles(projectsRoot)) {
    const payload = readJson(projectPath);
    const project = bodyOf(payload);
    const songId = validateEchoEnrichmentSongId(project.song_id ?? project.songId);
    if (projects.has(songId)) {
      throw new Error(`Duplicate canonical Echo project song ID: ${songId}.`);
    }
    projects.set(songId, { project, projectPath });
  }
  const results = cuts.map((cut) => {
    const songId = validateEchoEnrichmentSongId(cut?.songId);
    const variantId = validateEchoEnrichmentVariantId(cut?.variantId);
    const base = projects.get(songId);
    if (!base) throw new Error(`Missing base project for enrichment cut ${songId}/${variantId}.`);
    const variantPath = resolveEchoEnrichmentVariantPath(variantsRoot, `${songId}/${variantId}.json`);
    const variant = bodyOf(readJson(variantPath));
    if (String(variant.id || "") !== variantId) throw new Error(`Variant identity mismatch at ${variantPath}.`);
    return preflightEchoDirectionCut({
      project: base.project,
      variant,
      sourcePath: variantPath,
      avatarRoot: root,
    });
  });
  const failures = results.flatMap((result) => result.failures || []);
  return {
    schemaVersion: "hapa.echo.enrichment-director-render-preflight.v1",
    generatedAt: new Date().toISOString(),
    batchFingerprint: report.batch?.batchFingerprint || null,
    variationSetId: report.batch?.variationSetId || null,
    ok: failures.length === 0 && results.length === cuts.length,
    cuts: results.length,
    declaredMediaReferences: results.reduce((sum, result) => sum + Number(result.declaredCount || 0), 0),
    resolvedMediaReferences: results.reduce((sum, result) => sum + Number(result.resolvedCount || 0), 0),
    unresolvedMediaReferences: failures.length,
    failures,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    const result = preflightCurrentEnrichmentDirectorBatch();
    if (APPLY) atomicWrite(OUTPUT_PATH, result);
    process.stdout.write(`${JSON.stringify({ ...result, failures: result.failures.slice(0, 20), report: APPLY ? OUTPUT_PATH : null }, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
