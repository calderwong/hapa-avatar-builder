import crypto from "node:crypto";
import { readFileSync, statSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const ECHO_REFERENCE_IMAGE_RUNS_ROOT = path.join(homedir(), "Library", "Application Support", "hapa-avatar-builder", "Echo Reference Image Runs");
export const ECHO_REFERENCE_LOOP_RUNS_ROOT = path.join(homedir(), "Library", "Application Support", "hapa-avatar-builder", "Echo Reference Loop Runs");

function text(value) {
  return String(value || "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function isInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function readRunManifests(root) {
  let entries = [];
  try {
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return { manifests: [], warnings: [] };
    throw error;
  }
  const settled = await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const manifestPath = path.join(root, entry.name, "manifest.json");
    if (!isInside(root, manifestPath)) return { warning: `${entry.name}: path escaped run root` };
    try {
      const manifest = await readJson(manifestPath);
      return manifest?.runId ? { manifest } : { warning: `${entry.name}: missing runId` };
    } catch (error) {
      return error?.code === "ENOENT" ? null : { warning: `${entry.name}: ${error.message}` };
    }
  }));
  return {
    manifests: settled.map((entry) => entry?.manifest).filter(Boolean),
    warnings: settled.map((entry) => entry?.warning).filter(Boolean),
  };
}

function generatedImageHref(runId, jobId) {
  return `/api/echos/reference-media/assets/image/${encodeURIComponent(runId)}/${encodeURIComponent(jobId)}`;
}

function generatedLoopHref(runId, jobId) {
  return `/api/echos/reference-media/assets/loop/${encodeURIComponent(runId)}/${encodeURIComponent(jobId)}`;
}

function legacyItem(item = {}) {
  return {
    id: `catalog:${item.id}`,
    referenceKey: text(item.id),
    atlasCardId: text(item.id),
    title: text(item.title) || text(item.id),
    referenceTitle: text(item.title) || text(item.id),
    summary: text(item.connection?.why || item.summary),
    songs: list(item.songs),
    image: { uri: text(item.image?.uri), hash: text(item.image?.hash) },
    loopVideo: item.loopVideo?.uri ? { uri: text(item.loopVideo.uri), hash: text(item.loopVideo.hash) } : null,
    connection: item.connection || {},
    memoryHook: "",
    retrievalTags: [],
    qualityAssessment: null,
    prompt: "",
    reviewPrompt: "",
    feedback: null,
    authority: item.authority || {},
    source: {
      kind: "catalog",
      lane: text(item.source?.lane),
      cohort: text(item.source?.cohort),
      generator: text(item.source?.generator) || "Reference Atlas media catalog",
      runId: text(item.source?.manifestHash || item.source?.cohort),
      jobId: text(item.source?.jobId),
      promptHash: text(item.source?.promptHash),
      createdAt: text(item.source?.createdAt),
    },
  };
}

function generatedItem(manifest, job, loop) {
  const codexBuiltIn = text(manifest.provider) === "codex-image-generation-tool"
    || text(manifest.mode).includes("codex-built-in");
  const referenceId = text(job.referenceId || job.promptId || job.id);
  const referenceTitle = text(job.referenceTitle) || referenceId;
  const conceptTitle = text(job.visualConceptTitle) || referenceTitle;
  const quality = job.qualityAssessment && typeof job.qualityAssessment === "object" ? job.qualityAssessment : null;
  return {
    id: `generation:${manifest.runId}:${job.id}`,
    referenceKey: `${text(job.songId) || "album"}:${referenceId}`,
    atlasCardId: "",
    title: conceptTitle,
    referenceTitle,
    summary: text(quality?.evidenceSummary || job.reviewPrompt || job.memoryHook || referenceTitle),
    songs: [{ id: text(job.songId), title: text(job.songTitle) || text(job.songId), trackNumber: Number(job.trackNumber || 0) || null }],
    image: { uri: generatedImageHref(manifest.runId, job.id), hash: text(job.outputSha256 || job.outputHash) },
    loopVideo: loop ? {
      uri: generatedLoopHref(loop.manifest.runId, loop.job.id),
      hash: text(loop.job.outputSha256),
      runId: text(loop.manifest.runId),
      provider: text(loop.manifest.provider) || (text(loop.manifest.model).startsWith("minimax/") ? "fal" : "unknown"),
      model: text(loop.manifest.model),
      mode: text(loop.manifest.mode),
      profileId: text(loop.manifest.profileId),
    } : null,
    connection: {
      why: text(job.reviewPrompt || quality?.evidenceSummary || job.memoryHook),
      lyricMoments: [],
      claims: [],
      interpretations: [],
      citations: [],
      themes: [],
      mechanics: [],
      emotions: [],
    },
    memoryHook: text(job.memoryHook),
    retrievalTags: list(job.retrievalTags).map(text).filter(Boolean),
    qualityAssessment: quality,
    prompt: text(job.generationPrompt || job.prompt),
    sourcePrompt: text(job.sourcePrompt || job.prompt),
    originalPrompt: text(job.originalPrompt),
    avatarReferences: list(job.avatarReferences).map((reference) => ({
      name: text(reference.name),
      avatarId: text(reference.avatarId),
      assetId: text(reference.assetId),
      requirementId: text(reference.requirementId),
    })).filter((reference) => reference.name || reference.avatarId),
    repairHistory: list(job.repairHistory),
    reviewPrompt: text(job.reviewPrompt),
    feedback: job.feedback || null,
    authority: { reviewStatus: text(job.feedback?.decision || "generated-candidate"), evidenceClass: text(job.evidenceClass || "generated") },
    source: {
      kind: codexBuiltIn ? "codex-run" : "api-run",
      lane: codexBuiltIn ? "codex-gpt-image" : "openai-gpt-image",
      cohort: text(manifest.passId || manifest.mode || "image-run"),
      generator: text(manifest.model) || "OpenAI image generation",
      runId: text(manifest.runId),
      jobId: text(job.id),
      promptHash: text(job.generationPromptHash || job.promptHash),
      sourcePromptHash: text(job.promptHash),
      apiKeyUsed: codexBuiltIn ? Boolean(manifest.apiKeyUsed) : true,
      createdAt: text(job.finishedAt || job.startedAt || manifest.createdAt),
      runCreatedAt: text(manifest.createdAt),
      state: text(manifest.state),
      conceptOrdinal: Number(job.conceptOrdinal || 0) || null,
      estimatedCostUsd: Number(job.usage?.estimatedCostUsd || 0),
    },
  };
}

export async function buildEchoReferenceMediaLibrary(legacyLibrary = {}, options = {}) {
  const imageRunsRoot = path.resolve(options.imageRunsRoot || ECHO_REFERENCE_IMAGE_RUNS_ROOT);
  const loopRunsRoot = path.resolve(options.loopRunsRoot || ECHO_REFERENCE_LOOP_RUNS_ROOT);
  const [imageRuns, loopRuns] = await Promise.all([
    readRunManifests(imageRunsRoot),
    readRunManifests(loopRunsRoot),
  ]);
  const loopBySourceJob = new Map();
  for (const manifest of loopRuns.manifests) {
    for (const job of list(manifest.jobs)) {
      if (job.status !== "completed" || !job.outputPath) continue;
      const key = `${text(manifest.sourceImageRunId)}:${text(job.sourceJobId)}`;
      const previous = loopBySourceJob.get(key);
      if (!previous || text(job.finishedAt).localeCompare(text(previous.job.finishedAt)) >= 0) loopBySourceJob.set(key, { manifest, job });
    }
  }

  const catalogItems = list(legacyLibrary.items).map(legacyItem).filter((item) => item.image.uri);
  const generatedItems = [];
  for (const manifest of imageRuns.manifests) {
    for (const job of list(manifest.jobs)) {
      if (job.status !== "completed" || !job.outputPath) continue;
      generatedItems.push(generatedItem(manifest, job, loopBySourceJob.get(`${manifest.runId}:${job.id}`)));
    }
  }
  const items = [...catalogItems, ...generatedItems].sort((left, right) => (
    text(right.source.createdAt).localeCompare(text(left.source.createdAt))
    || Number(left.songs?.[0]?.trackNumber || Number.MAX_SAFE_INTEGER) - Number(right.songs?.[0]?.trackNumber || Number.MAX_SAFE_INTEGER)
    || left.title.localeCompare(right.title)
  ));
  const imageRunSummaries = imageRuns.manifests.map((manifest) => ({
    id: text(manifest.runId),
    kind: text(manifest.provider) === "codex-image-generation-tool" || text(manifest.mode).includes("codex-built-in") ? "codex-run" : "api-run",
    generator: text(manifest.model),
    createdAt: text(manifest.createdAt),
    state: text(manifest.state),
    visuals: list(manifest.jobs).filter((job) => job.status === "completed" && job.outputPath).length,
  })).sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const digest = `sha256:${crypto.createHash("sha256").update(JSON.stringify({ items, warnings: [...imageRuns.warnings, ...loopRuns.warnings] })).digest("hex")}`;
  const uniqueReferences = new Set(items.map((item) => item.referenceKey).filter(Boolean)).size;
  const songs = new Set(items.flatMap((item) => item.songs || []).map((song) => song.id).filter(Boolean)).size;
  return {
    schemaVersion: "hapa.echo-reference-media-library.v1",
    generatedAt: new Date().toISOString(),
    digest,
    counts: {
      visuals: items.length,
      uniqueReferences,
      songs,
      loopReady: items.filter((item) => item.loopVideo?.uri).length,
      catalogVisuals: catalogItems.length,
      generatedVisuals: generatedItems.length,
      imageRuns: imageRunSummaries.length,
      loopRuns: loopRuns.manifests.length,
    },
    runs: [
      { id: "reference-atlas-media-catalog", kind: "catalog", generator: "Codex / GPT Image catalog", createdAt: text(legacyLibrary.generatedAt), state: "available", visuals: catalogItems.length },
      ...imageRunSummaries,
    ],
    warnings: [...imageRuns.warnings, ...loopRuns.warnings],
    policy: {
      allRetainedRuns: true,
      automaticRefresh: true,
      localPathsExposed: false,
      authority: "Visual availability does not imply approval, canon, publication, or reuse rights.",
    },
    items,
  };
}

function referenceAssetRequest(kind, runId, jobId, options) {
  const root = kind === "image"
    ? path.resolve(options.imageRunsRoot || ECHO_REFERENCE_IMAGE_RUNS_ROOT)
    : kind === "loop" ? path.resolve(options.loopRunsRoot || ECHO_REFERENCE_LOOP_RUNS_ROOT) : "";
  if (!root || !runId || !jobId || path.basename(runId) !== runId || [".", ".."].includes(runId)) return null;
  const manifestPath = path.join(root, runId, "manifest.json");
  return isInside(root, manifestPath) ? { root, manifestPath } : null;
}
function referenceAssetPath(request, manifest, runId, jobId) {
  if (!manifest || text(manifest.runId) !== text(runId)) return null;
  const job = list(manifest.jobs).find(candidate => text(candidate.id) === text(jobId));
  return job?.outputPath && isInside(request.root, job.outputPath) ? job.outputPath : null;
}
function referenceAssetResult(kind, filePath, details) {
  return details?.isFile() ? { filePath, mimeType: kind === "image" ? "image/png" : "video/mp4", size: details.size } : null;
}
export async function resolveEchoReferenceMediaAsset(kind, runId, jobId, options = {}) {
  const request = referenceAssetRequest(kind, runId, jobId, options);
  if (!request) return null;
  const manifest = await readJson(request.manifestPath).catch(() => null);
  const filePath = referenceAssetPath(request, manifest, runId, jobId);
  return filePath ? referenceAssetResult(kind, filePath, await stat(filePath).catch(() => null)) : null;
}
/** Offline compilation shares the serving owner's exact run/job lookup. No scan or network. */
export function resolveEchoReferenceMediaUriSync(uri, options = {}) {
  const match = String(uri || "").match(/^\/api\/echos\/reference-media\/assets\/(image|loop)\/([^/?#]+)\/([^/?#]+)$/u);
  if (!match) return null;
  try {
    const [, kind, encodedRun, encodedJob] = match;
    const runId = decodeURIComponent(encodedRun), jobId = decodeURIComponent(encodedJob);
    const request = referenceAssetRequest(kind, runId, jobId, options);
    if (!request) return null;
    const manifest = JSON.parse(readFileSync(request.manifestPath, "utf8"));
    const filePath = referenceAssetPath(request, manifest, runId, jobId);
    return filePath ? referenceAssetResult(kind, filePath, statSync(filePath)) : null;
  } catch { return null; }
}
