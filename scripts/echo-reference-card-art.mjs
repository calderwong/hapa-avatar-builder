#!/usr/bin/env node
import { createHash } from "node:crypto";
import { mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { createFlux2ReferenceArtAdapter, flux2ReferenceArtErrorPayload } from "../server/flux2-reference-art-adapter.mjs";
import {
  buildEchoReferenceArtQueue,
  mergeEchoReferenceArtQueue,
  reviewEchoReferenceArtJob,
} from "../src/domain/echo-reference-card-art.js";

const root = process.cwd();
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "plan";
const runtimeRoot = path.join(root, "data", "echo-reference-art");
const queuePath = path.join(runtimeRoot, "queue.json");
const latestRunPath = path.join(root, "data", "echo-reference-mining", "latest.json");
const artifactRoot = path.join(root, "data", "media", "echo-reference-cards");

function option(name, fallback = "") {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

function options(name) {
  return args
    .filter((arg) => arg.startsWith(`${name}=`))
    .map((arg) => arg.slice(name.length + 1))
    .concat(option(name) ? [option(name)] : [])
    .filter(Boolean);
}

function integerOption(name, fallback) {
  const value = Number(option(name, fallback));
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function safeSegment(value) {
  return String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || "reference";
}

async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && fallback !== null) return fallback;
    throw error;
  }
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(temporary, filePath);
}

function queueSummary(queue = {}) {
  const statuses = {};
  for (const job of queue.jobs || []) statuses[job.status] = (statuses[job.status] || 0) + 1;
  return {
    schemaVersion: queue.schemaVersion,
    queueHash: queue.queueHash,
    sourceRunId: queue.sourceRunId,
    sourceRunHash: queue.sourceRunHash,
    sourceGraphHash: queue.sourceGraphHash,
    provider: queue.provider,
    model: queue.model,
    dimensions: `${queue.width}x${queue.height}`,
    jobs: queue.jobs?.length || 0,
    statuses,
    queuePath: path.relative(root, queuePath),
    artifactRoot: path.relative(root, artifactRoot),
  };
}

async function plan() {
  const run = await readJson(latestRunPath);
  const previous = await readJson(queuePath, { jobs: [] });
  const planned = buildEchoReferenceArtQueue(run, {
    model: option("--model"),
    width: integerOption("--width", 1536),
    height: integerOption("--height", 2048),
    cardIds: options("--card"),
  });
  const queue = mergeEchoReferenceArtQueue(previous, planned);
  const apply = args.includes("--apply");
  if (apply) await atomicWriteJson(queuePath, queue);
  console.log(JSON.stringify({
    ok: true,
    command: "plan",
    applied: apply,
    providerCalls: 0,
    ...queueSummary(queue),
    counts: planned.counts,
    custody: {
      sourceCardsUnchanged: true,
      privateReferencesExcluded: true,
      publicActivation: false,
      canonPromotion: false,
      mint: false,
    },
  }, null, 2));
}

async function status() {
  const queue = await readJson(queuePath);
  console.log(JSON.stringify({ ok: true, command: "status", providerCalls: 0, ...queueSummary(queue) }, null, 2));
}

async function waitForReady(adapter, pollingUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await adapter.poll(pollingUrl);
    if (result.ready) return result;
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw Object.assign(new Error("Timed out waiting for FLUX.2 Reference Card art."), { code: "flux2_timeout", statusCode: 504 });
}

async function artifactExistsWithDigest(filePath, digest) {
  try {
    const info = await stat(filePath);
    if (!info.isFile()) return false;
    const actual = createHash("sha256").update(await readFile(filePath)).digest("hex");
    return actual === digest;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function exists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function runJobs() {
  if (!args.includes("--apply") || !args.includes("--confirm-cost")) {
    throw new Error("FLUX.2 execution requires both --apply and --confirm-cost. Planning remains provider-free.");
  }
  const queue = await readJson(queuePath);
  const adapter = createFlux2ReferenceArtAdapter();
  const inspection = adapter.inspect();
  if (!inspection.configured) throw new Error("BFL_API_KEY is not configured.");
  const limit = integerOption("--limit", 1);
  const requestedCardIds = new Set(options("--card"));
  const selectedIds = queue.jobs
    .filter((job) => ["planned", "failed", "generating"].includes(job.status))
    .filter((job) => !requestedCardIds.size || requestedCardIds.has(job.source.cardId))
    .slice(0, limit)
    .map((job) => job.id);
  const results = [];

  for (const jobId of selectedIds) {
    let index = queue.jobs.findIndex((job) => job.id === jobId);
    let job = queue.jobs[index];
    try {
      let submission = job.providerReceipt?.pollingUrl
        ? {
          requestId: job.providerReceipt.requestId,
          pollingUrl: job.providerReceipt.pollingUrl,
          submittedAt: job.providerReceipt.submittedAt,
          model: job.generation.model,
        }
        : null;
      if (!submission) {
        queue.jobs[index] = {
          ...job,
          status: "submitting",
          attempt: Number(job.attempt || 0) + 1,
          lastError: null,
        };
        await atomicWriteJson(queuePath, queue);
        submission = await adapter.submit(queue.jobs[index]);
        queue.jobs[index] = {
          ...queue.jobs[index],
          status: "generating",
          providerReceipt: {
            provider: queue.provider,
            model: submission.model,
            requestId: submission.requestId,
            pollingUrl: submission.pollingUrl,
            submittedAt: submission.submittedAt,
          },
        };
        await atomicWriteJson(queuePath, queue);
      }

      const ready = await waitForReady(adapter, submission.pollingUrl, integerOption("--timeout-ms", 12 * 60_000));
      const delivery = await adapter.download(ready.deliveryUrl);
      const sha256 = createHash("sha256").update(delivery.buffer).digest("hex");
      const extension = delivery.contentType === "image/jpeg" ? "jpg" : delivery.contentType === "image/webp" ? "webp" : "png";
      const directory = path.join(artifactRoot, safeSegment(job.source.cardId));
      const outputPath = path.join(directory, `${safeSegment(job.jobHash.replace("sha256:", ""))}.${extension}`);
      await mkdir(directory, { recursive: true });
      if (await exists(outputPath) && !await artifactExistsWithDigest(outputPath, sha256)) {
        throw Object.assign(new Error(`Refusing to overwrite a different artifact at ${path.relative(root, outputPath)}.`), {
          code: "flux2_artifact_collision",
          statusCode: 409,
        });
      }
      if (!await exists(outputPath)) {
        const temporary = `${outputPath}.${process.pid}.tmp`;
        await writeFile(temporary, delivery.buffer, { flag: "wx" });
        await rename(temporary, outputPath);
      }
      index = queue.jobs.findIndex((candidate) => candidate.id === jobId);
      job = queue.jobs[index];
      queue.jobs[index] = {
        ...job,
        status: "review-required",
        providerReceipt: {
          ...job.providerReceipt,
          pollingUrl: "",
          readyAt: new Date().toISOString(),
          deliveryHost: delivery.deliveryHost,
          providerResult: ready.providerResult,
        },
        artifact: {
          localPath: path.relative(root, outputPath),
          sha256,
          mediaType: delivery.contentType,
          width: job.generation.width,
          height: job.generation.height,
          generatedProposal: true,
          humanReviewRequired: true,
        },
        lastError: null,
      };
      await atomicWriteJson(queuePath, queue);
      results.push({ jobId, cardId: job.source.cardId, status: "review-required", sha256, outputPath: path.relative(root, outputPath) });
    } catch (error) {
      index = queue.jobs.findIndex((job) => job.id === jobId);
      queue.jobs[index] = {
        ...queue.jobs[index],
        status: "failed",
        providerReceipt: queue.jobs[index].providerReceipt
          ? { ...queue.jobs[index].providerReceipt, pollingUrl: "" }
          : null,
        lastError: flux2ReferenceArtErrorPayload(error),
      };
      await atomicWriteJson(queuePath, queue);
      results.push({ jobId, cardId: queue.jobs[index].source.cardId, status: "failed", error: queue.jobs[index].lastError });
    }
  }
  console.log(JSON.stringify({
    ok: results.every((result) => result.status === "review-required"),
    command: "run",
    providerCalls: results.length,
    results,
    ...queueSummary(queue),
  }, null, 2));
}

async function review() {
  const apply = args.includes("--apply");
  const queue = await readJson(queuePath);
  const next = reviewEchoReferenceArtJob(queue, {
    jobId: option("--job"),
    decision: args.includes("--accept") ? "accepted" : args.includes("--reject") ? "rejected" : "",
    reviewer: option("--reviewer"),
    rationale: option("--rationale"),
  });
  if (apply) await atomicWriteJson(queuePath, next);
  console.log(JSON.stringify({
    ok: true,
    command: "review",
    applied: apply,
    providerCalls: 0,
    ...queueSummary(next),
  }, null, 2));
}

if (command === "plan") await plan();
else if (command === "status") await status();
else if (command === "run") await runJobs();
else if (command === "review") await review();
else {
  throw new Error("Usage: echo-reference-card-art.mjs <plan|status|run|review>. Run requires --apply --confirm-cost; review requires --job, --accept|--reject, --reviewer, and optionally --apply.");
}
