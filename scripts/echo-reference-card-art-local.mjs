#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  createHapaMediaReferenceArtAdapter,
  hapaMediaReferenceArtErrorPayload,
} from "../server/hapa-media-reference-art-adapter.mjs";
import {
  buildEchoReferenceCardSvg,
  buildEchoReferenceKreaFinishHandoff,
  buildEchoReferenceLocalArtQueue,
  mergeEchoReferenceLocalArtQueue,
  reviewEchoReferenceLocalCandidate,
} from "../src/domain/echo-reference-local-art.js";

const root = process.cwd();
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "plan";
const runtimeRoot = path.join(root, "data", "echo-reference-local-art");
const queuePath = path.resolve(option("--queue", path.join(runtimeRoot, "queue.json")));
const latestRunPath = path.resolve(option("--run", path.join(root, "data", "echo-reference-mining", "latest.json")));
const artifactRoot = path.resolve(option("--output-root", path.join(root, "data", "media", "echo-reference-local-cards")));

function option(name, fallback = "") {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

function options(name) {
  return [
    ...args.filter((arg) => arg.startsWith(`${name}=`)).map((arg) => arg.slice(name.length + 1)),
    ...(args.includes(name) && option(name) ? [option(name)] : []),
  ].filter(Boolean);
}

function integerOption(name, fallback) {
  const value = Number(option(name, fallback));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function safeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "reference";
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

async function atomicWrite(filePath, value, encoding = null) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, value, encoding ? { encoding, mode: 0o600 } : { mode: 0o600 });
  await rename(temporary, filePath);
}

async function atomicWriteJson(filePath, value) {
  await atomicWrite(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fileDigest(filePath) {
  try {
    const info = await stat(filePath);
    return info.isFile() ? sha256(await readFile(filePath)) : "";
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function summarize(queue = {}) {
  const jobStatuses = {};
  const candidateStatuses = {};
  for (const job of queue.jobs || []) {
    jobStatuses[job.status] = (jobStatuses[job.status] || 0) + 1;
    for (const candidate of job.candidates || []) {
      candidateStatuses[candidate.status] = (candidateStatuses[candidate.status] || 0) + 1;
    }
  }
  return {
    schemaVersion: queue.schemaVersion,
    queueHash: queue.queueHash,
    sourceRunId: queue.sourceRunId,
    provider: queue.provider,
    model: queue.model,
    dimensions: `${queue.width || 0}x${queue.height || 0}`,
    jobs: queue.jobs?.length || 0,
    candidates: (queue.jobs || []).reduce((sum, job) => sum + (job.candidates?.length || 0), 0),
    jobStatuses,
    candidateStatuses,
    queuePath,
    artifactRoot,
  };
}

function updateJobStatus(job) {
  const candidates = job.candidates || [];
  if (job.selectedCandidateId) return "candidate-accepted";
  if (candidates.some((candidate) => candidate.status === "review-required")) return "review-required";
  if (candidates.some((candidate) => ["submitting", "generating"].includes(candidate.status))) return "generating";
  if (candidates.every((candidate) => candidate.status === "rejected")) return "candidates-rejected";
  if (candidates.some((candidate) => candidate.status === "failed")) return "partially-failed";
  return "planned";
}

async function persist(queue) {
  queue.jobs = (queue.jobs || []).map((job) => ({ ...job, status: updateJobStatus(job) }));
  await atomicWriteJson(queuePath, queue);
}

async function plan() {
  const run = await readJson(latestRunPath);
  const previous = await readJson(queuePath, { jobs: [] });
  const planned = buildEchoReferenceLocalArtQueue(run, {
    width: integerOption("--width", 1152),
    height: integerOption("--height", 1536),
    candidateCount: integerOption("--candidates", 3),
    cardIds: options("--card"),
  });
  const queue = mergeEchoReferenceLocalArtQueue(previous, planned);
  const apply = args.includes("--apply");
  if (apply) await persist(queue);
  console.log(JSON.stringify({
    ok: true,
    command: "plan",
    applied: apply,
    providerCalls: 0,
    ...summarize(queue),
    counts: planned.counts,
    boundary: {
      exactReferenceNamesSentToGenerator: false,
      exactLyricsSentToGenerator: false,
      layoutGeneratedByModel: false,
      previewVisibility: "visible-before-review",
      approvalControlsAuthorityNotVisibility: true,
      humanReviewRequired: true,
    },
  }, null, 2));
}

async function status() {
  const queue = await readJson(queuePath);
  console.log(JSON.stringify({ ok: true, command: "status", providerCalls: 0, ...summarize(queue) }, null, 2));
}

async function waitForTask(adapter, taskId, timeoutMs, onPoll = () => {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const task = await adapter.task(taskId);
    onPoll();
    if (task?.status === "succeeded") return task;
    if (task?.status === "failed" || task?.status === "cancelled") {
      throw Object.assign(new Error(task?.error?.message || `Hapa Media task ${taskId} ${task.status}.`), {
        code: "hapa_media_generation_failed",
        statusCode: 502,
        details: task,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, integerOption("--poll-ms", 1_500)));
  }
  throw Object.assign(new Error(`Timed out waiting for Hapa Media task ${taskId}.`), {
    code: "hapa_media_generation_timeout",
    statusCode: 504,
  });
}

async function writeArtifact(filePath, bytes, expectedDigest) {
  const existing = await fileDigest(filePath);
  if (existing && existing !== expectedDigest) {
    throw Object.assign(new Error(`Refusing to overwrite a different artifact at ${filePath}.`), {
      code: "hapa_media_artifact_collision",
      statusCode: 409,
    });
  }
  if (!existing) await atomicWrite(filePath, bytes);
}

async function runCandidates() {
  if (!args.includes("--apply")) {
    throw new Error("Local Reference art execution requires --apply. Planning and status remain side-effect free.");
  }
  const queue = await readJson(queuePath);
  const adapter = createHapaMediaReferenceArtAdapter();
  const inspection = await adapter.inspect();
  const cardIds = new Set(options("--card"));
  const jobLimit = integerOption("--limit", 1);
  const candidateLimit = integerOption("--candidate-limit", 2);
  const jobs = (queue.jobs || [])
    .filter((job) => !cardIds.size || cardIds.has(job.source.cardId))
    .filter((job) => (job.candidates || []).some((candidate) => ["planned", "failed", "generating", "submitting"].includes(candidate.status)))
    .slice(0, jobLimit);
  const results = [];
  let providerCalls = 2;

  for (const selected of jobs) {
    const jobIndex = queue.jobs.findIndex((job) => job.id === selected.id);
    const candidateIds = selected.candidates
      .filter((candidate) => ["planned", "failed", "generating", "submitting"].includes(candidate.status))
      .slice(0, candidateLimit)
      .map((candidate) => candidate.id);

    for (const candidateId of candidateIds) {
      let candidateIndex = queue.jobs[jobIndex].candidates.findIndex((candidate) => candidate.id === candidateId);
      let candidate = queue.jobs[jobIndex].candidates[candidateIndex];
      try {
        if (!candidate.nodeReceipt?.taskId) {
          candidate = {
            ...candidate,
            status: "submitting",
            attempt: Number(candidate.attempt || 0) + 1,
            lastError: null,
          };
          queue.jobs[jobIndex].candidates[candidateIndex] = candidate;
          await persist(queue);
          const submission = await adapter.submit(queue.jobs[jobIndex], candidate);
          providerCalls += 1;
          candidate = {
            ...candidate,
            status: "generating",
            nodeReceipt: {
              provider: queue.provider,
              model: queue.model,
              taskId: submission.taskId,
              submittedAt: submission.submittedAt,
            },
          };
          queue.jobs[jobIndex].candidates[candidateIndex] = candidate;
          await persist(queue);
        }

        const task = await waitForTask(
          adapter,
          candidate.nodeReceipt.taskId,
          integerOption("--timeout-ms", 12 * 60_000),
          () => { providerCalls += 1; },
        );
        const assetId = String(task?.result?.asset_id || task?.result?.assetId || "");
        if (!assetId) throw new Error("Completed Hapa Media task did not return an asset ID.");
        const delivery = await adapter.download(assetId);
        providerCalls += 1;
        const rawSha256 = sha256(delivery.buffer);
        const extension = delivery.contentType === "image/jpeg" ? "jpg" : delivery.contentType === "image/webp" ? "webp" : "png";
        const directory = path.join(artifactRoot, safeSegment(queue.jobs[jobIndex].source.cardId));
        const stem = `${String(candidate.ordinal).padStart(2, "0")}-${safeSegment(candidate.candidateHash.slice(-16))}`;
        const rawPath = path.join(directory, `${stem}-raw.${extension}`);
        const svgPath = path.join(directory, `${stem}-reference-card.svg`);
        await writeArtifact(rawPath, delivery.buffer, rawSha256);
        const svg = buildEchoReferenceCardSvg({
          imageBytes: delivery.buffer,
          imageMediaType: delivery.contentType,
          title: queue.jobs[jobIndex].source.title,
          context: queue.jobs[jobIndex].scene.thesis,
          citationUrl: queue.jobs[jobIndex].source.citationUrl,
          cardId: queue.jobs[jobIndex].source.cardId,
          candidateId,
          imageSha256: rawSha256,
          palette: queue.jobs[jobIndex].scene.palette,
        });
        const svgBytes = Buffer.from(svg);
        const svgSha256 = sha256(svgBytes);
        await writeArtifact(svgPath, svgBytes, svgSha256);
        candidateIndex = queue.jobs[jobIndex].candidates.findIndex((item) => item.id === candidateId);
        candidate = queue.jobs[jobIndex].candidates[candidateIndex];
        queue.jobs[jobIndex].candidates[candidateIndex] = {
          ...candidate,
          status: "review-required",
          rawArtifact: {
            localPath: rawPath,
            sha256: rawSha256,
            mediaType: delivery.contentType,
            width: queue.jobs[jobIndex].generation.width,
            height: queue.jobs[jobIndex].generation.height,
            fullBleed: true,
            modelGeneratedLayout: false,
            previewVisibility: "visible-before-review",
          },
          assembledArtifact: {
            localPath: svgPath,
            sha256: svgSha256,
            mediaType: "image/svg+xml",
            deterministicAssembly: true,
            exactTextAddedAfterGeneration: true,
          },
          nodeReceipt: {
            ...candidate.nodeReceipt,
            assetId,
            completedAt: new Date().toISOString(),
            taskStatus: task.status,
          },
          lastError: null,
        };
        await persist(queue);
        results.push({ cardId: selected.source.cardId, candidateId, status: "review-required", rawPath, svgPath });
      } catch (error) {
        candidateIndex = queue.jobs[jobIndex].candidates.findIndex((item) => item.id === candidateId);
        const current = queue.jobs[jobIndex].candidates[candidateIndex];
        queue.jobs[jobIndex].candidates[candidateIndex] = {
          ...current,
          status: "failed",
          lastError: {
            code: String(error?.code || "local_reference_art_failed"),
            message: String(error?.message || error),
            at: new Date().toISOString(),
          },
        };
        await persist(queue);
        results.push({ cardId: selected.source.cardId, candidateId, status: "failed", error: queue.jobs[jobIndex].candidates[candidateIndex].lastError });
      }
    }
  }

  console.log(JSON.stringify({
    ok: results.every((result) => result.status !== "failed"),
    command: "run",
    providerCalls,
    inspection,
    results,
    ...summarize(queue),
  }, null, 2));
  if (results.some((result) => result.status === "failed")) process.exitCode = 1;
}

async function review() {
  if (!args.includes("--apply")) throw new Error("Candidate review requires --apply.");
  const decision = args.includes("--accept") ? "accepted" : args.includes("--reject") ? "rejected" : "";
  const queue = reviewEchoReferenceLocalCandidate(await readJson(queuePath), {
    candidateId: option("--candidate"),
    reviewer: option("--reviewer"),
    rationale: option("--rationale"),
    decision,
  });
  await persist(queue);
  console.log(JSON.stringify({ ok: true, command: "review", providerCalls: 0, decision, ...summarize(queue) }, null, 2));
}

async function finishPlan() {
  if (!args.includes("--apply")) throw new Error("Krea finish handoff creation requires --apply.");
  const queue = await readJson(queuePath);
  const handoff = buildEchoReferenceKreaFinishHandoff(queue, { jobId: option("--job") });
  const handoffPath = path.join(path.dirname(queuePath), "krea-finish", `${safeSegment(handoff.source.jobId)}.json`);
  await atomicWriteJson(handoffPath, handoff);
  console.log(JSON.stringify({
    ok: true,
    command: "finish-plan",
    providerCalls: 0,
    handoffPath,
    handoff,
    note: "This records an optional Krea2 handoff; it does not invoke the finisher.",
  }, null, 2));
}

try {
  if (command === "plan") await plan();
  else if (command === "status") await status();
  else if (command === "run") await runCandidates();
  else if (command === "review") await review();
  else if (command === "finish-plan") await finishPlan();
  else throw new Error(`Unknown command ${command}. Expected plan, status, run, review, or finish-plan.`);
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    command,
    error: error?.name === "HapaMediaReferenceArtError"
      ? hapaMediaReferenceArtErrorPayload(error)
      : {
        code: String(error?.code || "echo_reference_local_art_failed"),
        message: String(error?.message || error),
        statusCode: Number(error?.statusCode || 500),
        details: error?.details || null,
      },
  }, null, 2));
  process.exitCode = 1;
}
