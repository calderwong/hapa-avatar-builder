#!/usr/bin/env node
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildReferenceDirectorCandidates } from "../src/domain/builder-direction-candidates.js";
import {
  recastBalancedEchoDirectorProject,
  validateBalancedDirectorRevision,
} from "../src/domain/echo-media-recast.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CATALOG_PATH = path.join(ROOT, "data", "echo-reference-animated-media.json");
const MEDIA_DIR = path.join(ROOT, "data", "media");
const PROJECTS_DIR = path.join(ROOT, "data", "music-video-projects");
const VARIANT_ID = "reference-atlas-adaptive-eligibility-proof-v1";
const REPORT_PATH = path.join(ROOT, "artifacts", "reference-atlas-adaptive-loops", "director-eligibility-audit.json");
const APPLY = process.argv.slice(2).includes("--apply");

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

async function discoverMediaFiles(directory = MEDIA_DIR, relative = "") {
  const rows = new Set();
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const nextRelative = relative ? `${relative}/${entry.name}` : entry.name;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      for (const value of await discoverMediaFiles(absolute, nextRelative)) rows.add(value);
    } else if ((await stat(absolute).catch(() => null))?.size > 0) {
      rows.add(nextRelative);
    }
  }
  return rows;
}

async function main() {
  const [catalog, availableMediaFiles] = await Promise.all([
    readFile(CATALOG_PATH, "utf8").then(JSON.parse),
    discoverMediaFiles(),
  ]);
  const candidates = buildReferenceDirectorCandidates(catalog, {
    minShortEdge: 512,
    minDurationSeconds: 2.5,
    requireVerifiedTechnical: true,
    requireBrowserSafePixelFormat: true,
    availableMediaFiles,
  });
  if (!candidates.length) throw new Error("No Reference Atlas Director candidates passed the technical gate.");
  const projectFiles = (await readdir(PROJECTS_DIR))
    .filter((file) => file.endsWith("-video-project.json"))
    .sort();
  const sharedUsageCounts = new Map();
  const sharedCardUsageCounts = new Map();
  const proofs = [];
  for (const fileName of projectFiles) {
    const payload = JSON.parse(await readFile(path.join(PROJECTS_DIR, fileName), "utf8"));
    const project = payload.music_video_project || payload;
    if (!project?.song_id) continue;
    const variant = recastBalancedEchoDirectorProject(project, candidates, {
      variantId: VARIANT_ID,
      title: "Reference Atlas · Adaptive Default Eligibility Proof",
      seed: `${project.song_id}:${VARIANT_ID}`,
      createdAt: "deterministic-audit",
      allowedSourceGroups: ["reference"],
      sourcePattern: ["reference"],
      rotateSourcePattern: false,
      sharedUsageCounts,
      sharedCardUsageCounts,
    });
    const validation = validateBalancedDirectorRevision(variant);
    if (!validation.ok) throw new Error(`Reference Atlas direction proof failed for ${project.song_id}`);
    proofs.push({
      songId: project.song_id,
      replacementShots: validation.replacementShots,
      uniqueMedia: variant.telemetry.uniqueMedia,
    });
  }
  const usedCandidates = candidates.filter((candidate) => (
    Number(sharedUsageCounts.get(candidate.technicalIdentity) || 0) > 0
  ));
  const report = {
    schemaVersion: "hapa.echo-reference-director-eligibility-audit.v1",
    ok: true,
    sourceCatalog: CATALOG_PATH,
    patternId: catalog.patternId,
    candidates: {
      total: candidates.length,
      distinctCards: new Set(candidates.map((candidate) => candidate.cardId)).size,
      contentHashed: candidates.every((candidate) => /^[a-f0-9]{64}$/.test(candidate.sha256)),
      localMediaAvailable: candidates.every((candidate) => availableMediaFiles.has(candidate.uri.replace(/^\/media\//, ""))),
      minimumShortEdge: Math.min(...candidates.map((candidate) => candidate.technical.shortEdge)),
      minimumDurationSeconds: Math.min(...candidates.map((candidate) => candidate.duration)),
      browserSafe: candidates.every((candidate) => candidate.technical.pixelFormat === "yuv420p"),
      sourceGroup: [...new Set(candidates.map((candidate) => candidate.sourceGroup))],
    },
    albumProof: {
      projects: proofs.length,
      replacementShots: proofs.reduce((sum, proof) => sum + proof.replacementShots, 0),
      candidatesSelectedAtLeastOnce: usedCandidates.length,
      everyCandidateSelectedAtLeastOnce: usedCandidates.length === candidates.length,
      sample: list(proofs).slice(0, 5),
    },
    custody: catalog.custody,
    generatedAt: new Date().toISOString(),
  };
  if (APPLY) {
    await mkdir(path.dirname(REPORT_PATH), { recursive: true });
    await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(`${JSON.stringify({ ...report, reportPath: APPLY ? REPORT_PATH : null }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
