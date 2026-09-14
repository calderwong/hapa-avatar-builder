import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const ECHO_REFERENCE_IMAGE_RUNS_ROOT = path.join(homedir(), "Library", "Application Support", "hapa-avatar-builder", "Echo Reference Image Runs");

function isInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function readEchoReferenceImageGenerationStatus() {
  try {
    const pointer = await readJson(path.join(ECHO_REFERENCE_IMAGE_RUNS_ROOT, "current-run.json"));
    const manifestPath = path.join(ECHO_REFERENCE_IMAGE_RUNS_ROOT, pointer.runId, "manifest.json");
    if (!isInside(ECHO_REFERENCE_IMAGE_RUNS_ROOT, manifestPath)) throw new Error("run path escaped the local runtime root");
    const manifest = await readJson(manifestPath);
    const counts = { total: manifest.jobs?.length || 0, held: 0, queued: 0, running: 0, completed: 0, failed: 0 };
    let estimatedCostUsd = 0;
    const jobs = (manifest.jobs || []).map((job) => {
      if (Object.hasOwn(counts, job.status)) counts[job.status] += 1;
      estimatedCostUsd += Number(job.usage?.estimatedCostUsd || 0);
      return {
        id: job.id,
        promptId: job.promptId,
        songId: job.songId,
        songTitle: job.songTitle,
        trackNumber: job.trackNumber,
        referenceId: job.referenceId,
        referenceTitle: job.referenceTitle,
        status: job.status,
        attemptCount: job.attemptCount || 0,
        requestDurationSeconds: Number(job.requestDurationSeconds || 0),
        error: job.error || "",
        usage: job.usage || null,
        feedback: job.feedback || null,
        hasOutput: Boolean(job.outputPath),
        outputHref: job.outputPath ? `/api/echos/reference-image-generation/assets/${encodeURIComponent(job.id)}` : "",
      };
    });
    return {
      ok: true,
      schemaVersion: manifest.schemaVersion,
      runId: manifest.runId,
      passId: manifest.passId,
      state: manifest.state,
      mode: manifest.mode,
      createdAt: manifest.createdAt,
      startedAt: manifest.startedAt,
      finishedAt: manifest.finishedAt,
      model: manifest.model,
      size: manifest.size,
      quality: manifest.quality,
      concurrency: manifest.concurrency,
      counts,
      usage: { estimatedCostUsd: Number(estimatedCostUsd.toFixed(6)), currency: "USD" },
      jobs,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: true, state: "not-started", counts: { total: 0, completed: 0 }, jobs: [], usage: { estimatedCostUsd: 0, currency: "USD" } };
    throw error;
  }
}

export async function resolveEchoReferenceImageAsset(jobId = "") {
  const statusPayload = await readEchoReferenceImageGenerationStatus();
  if (!statusPayload.runId || !jobId) return null;
  const manifestPath = path.join(ECHO_REFERENCE_IMAGE_RUNS_ROOT, statusPayload.runId, "manifest.json");
  const manifest = await readJson(manifestPath);
  const job = (manifest.jobs || []).find((item) => item.id === jobId);
  if (!job?.outputPath || !isInside(ECHO_REFERENCE_IMAGE_RUNS_ROOT, job.outputPath)) return null;
  const details = await stat(job.outputPath);
  if (!details.isFile()) return null;
  return { filePath: job.outputPath, mimeType: "image/png", size: details.size };
}
