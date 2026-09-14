import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const ECHO_REFERENCE_LOOP_RUNS_ROOT = path.join(homedir(), "Library", "Application Support", "hapa-avatar-builder", "Echo Reference Loop Runs");

function isInside(parentPath, candidatePath) {
  const relative = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== "..");
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export async function readEchoReferenceLoopGenerationStatus() {
  try {
    const pointer = await readJson(path.join(ECHO_REFERENCE_LOOP_RUNS_ROOT, "current-run.json"));
    const manifestPath = path.join(ECHO_REFERENCE_LOOP_RUNS_ROOT, pointer.runId, "manifest.json");
    if (!isInside(ECHO_REFERENCE_LOOP_RUNS_ROOT, manifestPath)) throw new Error("run path escaped the local runtime root");
    const manifest = await readJson(manifestPath);
    const counts = { total: manifest.jobs?.length || 0, held: 0, queued: 0, active: 0, completed: 0, failed: 0 };
    const activeStates = new Set(["claimed", "uploading", "submitted", "in_queue", "running", "downloading"]);
    let estimatedCostUsd = 0;
    const jobs = (manifest.jobs || []).map((job) => {
      if (job.status === "held") counts.held += 1;
      else if (job.status === "queued") counts.queued += 1;
      else if (job.status === "completed") counts.completed += 1;
      else if (job.status === "failed") counts.failed += 1;
      else if (activeStates.has(job.status)) counts.active += 1;
      estimatedCostUsd += Number(job.usage?.estimatedCostUsd || 0);
      return {
        id: job.id,
        sourceJobId: job.sourceJobId,
        songId: job.songId,
        songTitle: job.songTitle,
        trackNumber: job.trackNumber,
        referenceId: job.referenceId,
        referenceTitle: job.referenceTitle,
        status: job.status,
        error: job.error || "",
        usage: job.usage || null,
        hasOutput: Boolean(job.outputPath),
        outputHref: job.outputPath ? `/api/echos/reference-loop-generation/assets/${encodeURIComponent(job.id)}` : "",
      };
    });
    return {
      ok: true,
      schemaVersion: manifest.schemaVersion,
      runId: manifest.runId,
      sourceImageRunId: manifest.sourceImageRunId,
      state: manifest.state,
      mode: manifest.mode,
      startedAt: manifest.startedAt,
      finishedAt: manifest.finishedAt,
      model: manifest.model,
      durationSeconds: manifest.durationSeconds,
      resolution: manifest.resolution,
      localConcurrency: manifest.localConcurrency,
      budget: manifest.budget || null,
      counts,
      usage: { estimatedCostUsd: Number(estimatedCostUsd.toFixed(4)), currency: "USD" },
      jobs,
    };
  } catch (error) {
    if (error?.code === "ENOENT") return { ok: true, state: "not-started", counts: { total: 0, completed: 0 }, jobs: [], usage: { estimatedCostUsd: 0, currency: "USD" } };
    throw error;
  }
}

export async function resolveEchoReferenceLoopAsset(jobId = "") {
  const statusPayload = await readEchoReferenceLoopGenerationStatus();
  if (!statusPayload.runId || !jobId) return null;
  const manifestPath = path.join(ECHO_REFERENCE_LOOP_RUNS_ROOT, statusPayload.runId, "manifest.json");
  const manifest = await readJson(manifestPath);
  const job = (manifest.jobs || []).find((item) => item.id === jobId);
  if (!job?.outputPath || !isInside(ECHO_REFERENCE_LOOP_RUNS_ROOT, job.outputPath)) return null;
  const details = await stat(job.outputPath);
  if (!details.isFile()) return null;
  return { filePath: job.outputPath, mimeType: "video/mp4", size: details.size };
}
