#!/usr/bin/env node

import { createHash, randomUUID } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const SCHEMA_VERSION = "hapa.echo-codex-live-media-pipeline.v1";
const RUN_ID = "echo-reference-codex-live-2026-09-14";
const root = process.cwd();
const args = process.argv.slice(2);
const command = args.find((arg) => !arg.startsWith("--")) || "status";
const userDataRoot = path.resolve(option("--user-data", path.join(os.homedir(), "Library", "Application Support", "hapa-avatar-builder")));
const intelligenceRoot = path.join(userDataRoot, "Echo Reference Intelligence Runs");
const imageRunsRoot = path.join(userDataRoot, "Echo Reference Image Runs");
const runRoot = path.join(imageRunsRoot, RUN_ID);
const manifestPath = path.join(runRoot, "manifest.json");
const currentPointerPath = path.join(imageRunsRoot, "current-run.json");

function option(name, fallback = "") {
  const inline = args.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] && !args[index + 1].startsWith("--") ? args[index + 1] : fallback;
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function slug(value = "") {
  return String(value || "untitled").normalize("NFKD").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 72) || "untitled";
}

async function readJson(filePath, fallback = null) {
  try { return JSON.parse(await readFile(filePath, "utf8")); }
  catch (error) { if (error?.code === "ENOENT" && fallback !== null) return fallback; throw error; }
}

async function atomicWriteJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporaryPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  await rename(temporaryPath, filePath);
}

async function exists(filePath) {
  try { await access(filePath, fsConstants.R_OK); return (await stat(filePath)).isFile(); }
  catch { return false; }
}

const AVATARS = Object.freeze([
  { name: "Red", avatarId: "red-reaper", assetId: "local-chatgpt-image-jun-10-2026-05-42-47-pm-1-png-1781138567794-2026856", sourcePath: path.join(root, "data/media/chatgpt-image-jun-10-2026-05-42-47-pm-1-source-88bbebd91cf51d88.png") },
  { name: "Blue", avatarId: "avatar-2", assetId: "local-chatgpt-image-may-24-2026-07-21-01-pm-1-png-1779675661282-2014333", sourcePath: path.join(root, "data/media/chatgpt-image-may-24-2026-07-21-01-pm-1-1781221375816-2014333.png") },
  { name: "Green", avatarId: "avatar-3", assetId: "local-chatgpt-image-may-24-2026-10-26-52-pm-1-png-1779686812633-2735317", sourcePath: path.join(root, "data/media/chatgpt-image-may-24-2026-10-26-52-pm-1-1781222050768-2735317.png") },
  { name: "Bella", avatarId: "pinokio-bella", assetId: "local-chatgpt-image-jun-13-2026-04-38-45-pm-2-png-1781393926208-2767902", sourcePath: path.join(root, "data/media/chatgpt-image-jun-13-2026-04-38-45-pm-2-1781794880804-2767902.png") },
  { name: "Domina", avatarId: "avatar-13", assetId: "local-0f9f392f-2582-4674-a38a-c5fb3487ce4e-png-1779703029046-2358318", sourcePath: path.join(root, "data/media/0f9f392f-2582-4674-a38a-c5fb3487ce4e-1781225210866-2358318.png") },
  { name: "Falka", avatarId: "avatar-8", assetId: "local-chatgpt-image-may-25-2026-02-33-46-am-1-png-1779701627007-2385334", sourcePath: path.join(root, "data/media/chatgpt-image-may-25-2026-02-33-46-am-1-1781224793118-2385334.png") },
]);

function deterministicIndex(value, length) {
  return createHash("sha256").update(String(value)).digest().readUInt32BE(0) % length;
}

async function avatarReferencesFor(concept, job) {
  const characterUse = String(concept.characterUse || "");
  const searchable = `${characterUse} ${concept.imagePrompt || ""} ${concept.title || ""}`;
  const explicit = AVATARS.filter((avatar) => {
    if (new RegExp(`\\bHapa\\s+${avatar.name}\\b`, "i").test(searchable)) return true;
    if (!["Red", "Blue", "Green"].includes(avatar.name) && new RegExp(`\\b${avatar.name}\\b`, "i").test(searchable)) return true;
    return new RegExp(`(?:^|[,/&+]\\s*)${avatar.name}(?:\\s|$)`, "i").test(characterUse);
  });
  let selected = explicit;
  if (!selected.length) {
    const first = deterministicIndex(concept.id || job.id, AVATARS.length);
    const wantsPair = /two figures|pair|couple|together|both characters|duo/i.test(searchable);
    selected = [AVATARS[first], ...(wantsPair ? [AVATARS[(first + 3) % AVATARS.length]] : [])];
  }
  const valid = [];
  for (const avatar of selected.slice(0, 2)) if (await exists(avatar.sourcePath)) valid.push({ ...avatar, requirementId: "character_dossier" });
  return valid;
}

function sourcePlans(intelligence) {
  const rows = [];
  for (const job of intelligence.jobs || []) {
    if (job.status === "completed" && job.plan) rows.push({ sourceJob: job, plan: job.plan, checkpoint: false });
    for (const partial of job.partialPlans || []) if (partial.plan) rows.push({ sourceJob: job, plan: partial.plan, checkpoint: true, checkpointAt: partial.completedAt || "" });
  }
  return rows;
}

function readyConcept(concept = {}) {
  return Boolean(concept.imagePrompt && (concept.qualityAssessment?.ready === true || concept.qualityAssessment?.status === "ready-for-image-api"));
}

async function completedPromptIds() {
  const ids = new Set();
  await mkdir(imageRunsRoot, { recursive: true, mode: 0o700 });
  for (const entry of await readdir(imageRunsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === RUN_ID) continue;
    const manifest = await readJson(path.join(imageRunsRoot, entry.name, "manifest.json"), { jobs: [] });
    for (const job of manifest.jobs || []) if (job.status === "completed" && job.outputPath && job.promptId) ids.add(job.promptId);
  }
  return ids;
}

function generationPrompt(sourcePrompt, concept, avatars) {
  const names = avatars.map((avatar) => avatar.name).join(" and ");
  const identity = avatars.length
    ? `The attached ${avatars.length === 1 ? "image is" : "images are"} the authoritative visual ${avatars.length === 1 ? "reference" : "references"} for ${names}. Preserve each character's recognizable face, complexion, body type, hair, silhouette, and defining wardrobe language. Keep identities separate, unduplicated, and compositionally meaningful; adapt clothing only when the authored scene requires it. Do not copy dossier layouts, labels, typography, UI, or source backgrounds.`
    : "No character reference is attached; preserve the authored subject, physical action, and symbols exactly.";
  return [
    "Use case: stylized-concept",
    "Asset type: Echo Album visual-reference playing card",
    "Primary request: Create one finished portrait 2:3 premium illustrated playing-card image in the established Hapa visual language.",
    `Input images: ${identity}`,
    "Source prompt — preserve its lyric/reference/lesson logic, specific physical action, causal symbols, palette, composition, and exclusions:",
    sourcePrompt,
    `Memory hook: ${concept.memoryHook || concept.title || "Echo Album reference card"}`,
    "Constraints: one coherent scene; immediate lyric-to-lesson legibility; distinctive context-specific materials; clean card-scale silhouette; no generic cosmic filler; no readable text, logos, watermarks, UI, copied franchise designs, or unrequested decorative border.",
  ].join("\n\n");
}

async function loadIntelligence() {
  const pointer = await readJson(path.join(intelligenceRoot, "current-run.json"));
  return readJson(path.join(intelligenceRoot, pointer.runId, "manifest.json"));
}

async function sync() {
  const intelligence = await loadIntelligence();
  const previous = await readJson(manifestPath, { jobs: [] });
  const externalCompleted = await completedPromptIds();
  const priorByPrompt = new Map((previous?.jobs || []).map((job) => [job.promptId, job]));
  const candidates = new Map();
  for (const { sourceJob, plan, checkpoint, checkpointAt } of sourcePlans(intelligence)) {
    for (const connection of plan.connections || []) {
      for (const [conceptIndex, concept] of (connection.concepts || []).entries()) {
        if (!readyConcept(concept) || externalCompleted.has(concept.id)) continue;
        const avatars = await avatarReferencesFor(concept, sourceJob);
        const sourcePrompt = concept.imagePrompt;
        const prompt = generationPrompt(sourcePrompt, concept, avatars);
        candidates.set(concept.id, {
          id: `codex-live:${sha256(concept.id).slice(-16)}`,
          promptId: concept.id,
          passId: "local-qwen38-flash-next-live-drain",
          songId: sourceJob.songId,
          songTitle: sourceJob.songTitle,
          trackNumber: Number(sourceJob.trackNumber || plan.trackNumber || 0),
          referenceId: connection.referenceId || "lyric-only",
          referenceTitle: connection.referenceTitle || "Lyric-only reference opportunity",
          evidenceClass: sourceJob.packet?.sourceConnections?.find((item) => item.connectionKey === connection.connectionKey)?.evidenceClass || "",
          intelligencePlanId: plan.planId,
          sourceConnectionKey: connection.connectionKey,
          visualConceptTitle: concept.title,
          memoryHook: concept.memoryHook,
          retrievalTags: concept.retrievalTags || [],
          qualityAssessment: concept.qualityAssessment || null,
          conceptOrdinal: conceptIndex + 1,
          sourcePrompt,
          prompt,
          promptHash: sha256(prompt),
          generationPrompt: prompt,
          generationPromptHash: sha256(prompt),
          avatarReferences: avatars,
          checkpointSource: checkpoint,
          checkpointAt,
          provider: "codex-image-generation-tool",
          apiKeyUsed: false,
          status: "queued",
          attemptCount: 0,
          outputPath: "",
          outputHash: "",
          usage: { billingLane: "Codex subscription built-in image generation; no OpenAI API key" },
          feedback: null,
          error: "",
        });
      }
    }
  }
  const jobs = [...candidates.values()].map((job) => {
    const prior = priorByPrompt.get(job.promptId);
    if (!prior) return job;
    if (prior.status === "completed") return prior;
    return {
      ...job,
      ...prior,
      prompt: job.prompt,
      promptHash: job.promptHash,
      generationPrompt: job.generationPrompt,
      generationPromptHash: job.generationPromptHash,
      avatarReferences: job.avatarReferences,
    };
  })
    .concat((previous?.jobs || []).filter((job) => !candidates.has(job.promptId) && ["completed", "running", "failed"].includes(job.status)))
    .sort((left, right) => left.trackNumber - right.trackNumber || left.promptId.localeCompare(right.promptId));
  const now = new Date().toISOString();
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    runId: RUN_ID,
    sourceIntelligenceRunId: intelligence.runId,
    state: jobs.some((job) => ["queued", "running"].includes(job.status)) ? "running" : "caught-up",
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    model: "Codex built-in GPT Image",
    provider: "codex-image-generation-tool",
    apiKeyUsed: false,
    policy: {
      pollSource: "Echo Reference Intelligence Runs/current-run.json",
      enqueueGate: "qualityAssessment.ready=true or ready-for-image-api",
      identityPool: AVATARS.map(({ name, avatarId, assetId }) => ({ name, avatarId, assetId })),
      downstream: "Each completed image is eligible for the incremental FAL reference-atlas loop run and the consolidated Reference Media index.",
      authority: "Generated proposal; human review required; not canon or publication approval.",
    },
    jobs,
  };
  await atomicWriteJson(manifestPath, manifest);
  await atomicWriteJson(currentPointerPath, { runId: RUN_ID, updatedAt: now });
  return manifest;
}

async function claim() {
  const manifest = await sync();
  const nowMs = Date.now();
  for (const job of manifest.jobs) {
    if (job.status === "running" && nowMs - Date.parse(job.startedAt || 0) > 45 * 60_000) {
      job.status = "queued";
      job.error = "Recovered expired Codex image-generation claim.";
    }
  }
  const job = manifest.jobs.find((candidate) => candidate.status === "queued");
  if (!job) return { manifest, job: null };
  job.status = "running";
  job.startedAt = new Date().toISOString();
  job.attemptCount = Number(job.attemptCount || 0) + 1;
  job.claimId = randomUUID();
  manifest.updatedAt = job.startedAt;
  await atomicWriteJson(manifestPath, manifest);
  return { manifest, job };
}

async function completeImage() {
  const jobId = option("--job");
  const sourcePath = path.resolve(option("--image"));
  if (!jobId || !await exists(sourcePath)) throw new Error("complete requires --job <id> and a readable --image <path>.");
  const manifest = await readJson(manifestPath);
  const job = manifest.jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Unknown live Codex media job ${jobId}.`);
  const bytes = await readFile(sourcePath);
  const signature = bytes.subarray(0, 12).toString("hex");
  const extension = signature.startsWith("89504e470d0a1a0a") ? "png" : signature.startsWith("ffd8ff") ? "jpg" : signature.startsWith("52494646") ? "webp" : "";
  if (!extension) throw new Error("Codex image import accepts PNG, JPEG, or WebP only.");
  const outputRoot = path.join(runRoot, "outputs");
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  const outputPath = path.join(outputRoot, `${String(job.trackNumber).padStart(3, "0")}-${slug(job.songTitle)}--${slug(job.referenceId)}--${job.id.slice(-12)}.${extension}`);
  if (!await exists(outputPath)) await copyFile(sourcePath, outputPath, fsConstants.COPYFILE_EXCL);
  else if (sha256(await readFile(outputPath)) !== sha256(bytes)) throw new Error(`Refusing to overwrite a different artifact for ${job.id}.`);
  Object.assign(job, {
    status: "completed",
    finishedAt: new Date().toISOString(),
    outputPath,
    outputHash: sha256(bytes),
    outputSha256: sha256(bytes),
    error: "",
  });
  job.requestDurationSeconds = Math.max(0, (Date.parse(job.finishedAt) - Date.parse(job.startedAt || job.finishedAt)) / 1000);
  manifest.updatedAt = job.finishedAt;
  manifest.state = manifest.jobs.some((candidate) => ["queued", "running"].includes(candidate.status)) ? "running" : "caught-up";
  await atomicWriteJson(manifestPath, manifest);
  await atomicWriteJson(currentPointerPath, { runId: RUN_ID, updatedAt: manifest.updatedAt });
  return { manifest, job };
}

async function failJob() {
  const jobId = option("--job");
  const manifest = await readJson(manifestPath);
  const job = manifest.jobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error(`Unknown live Codex media job ${jobId}.`);
  job.status = option("--retry", "true") === "false" ? "failed" : "queued";
  job.error = String(option("--reason", "Codex built-in image generation did not return an artifact.")).slice(0, 1000);
  job.finishedAt = new Date().toISOString();
  manifest.updatedAt = job.finishedAt;
  await atomicWriteJson(manifestPath, manifest);
  return { manifest, job };
}

function publicSummary(manifest, job = null) {
  const statuses = {};
  for (const item of manifest.jobs || []) statuses[item.status] = (statuses[item.status] || 0) + 1;
  return {
    ok: true,
    schemaVersion: manifest.schemaVersion,
    runId: manifest.runId,
    sourceIntelligenceRunId: manifest.sourceIntelligenceRunId,
    state: manifest.state,
    counts: { total: manifest.jobs?.length || 0, ...statuses },
    current: job ? {
      id: job.id,
      promptId: job.promptId,
      songId: job.songId,
      songTitle: job.songTitle,
      trackNumber: job.trackNumber,
      referenceId: job.referenceId,
      referenceTitle: job.referenceTitle,
      visualConceptTitle: job.visualConceptTitle,
      generationPrompt: job.generationPrompt,
      referencedImagePaths: job.avatarReferences.map((avatar) => avatar.sourcePath),
      avatarReferences: job.avatarReferences.map(({ sourcePath: _privatePath, ...avatar }) => avatar),
    } : null,
    manifestPath,
    nextAction: job
      ? "Call the Codex built-in image_gen tool once with generationPrompt and referencedImagePaths, then complete this exact job with the returned local image path."
      : statuses.queued
        ? `${statuses.queued} qualified prompt${statuses.queued === 1 ? " is" : "s are"} queued; use claim to take the next one.`
        : "No qualified prompt is waiting.",
  };
}

async function main() {
  if (command === "sync") return publicSummary(await sync());
  if (command === "claim" || command === "next") { const { manifest, job } = await claim(); return publicSummary(manifest, job); }
  if (command === "complete") { const { manifest, job } = await completeImage(); return publicSummary(manifest, job); }
  if (command === "fail") { const { manifest, job } = await failJob(); return publicSummary(manifest, job); }
  if (command === "status") return publicSummary(await sync());
  throw new Error("Use status, sync, claim, complete, or fail.");
}

main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
  process.stderr.write(`[Echo Codex Live Media] ${String(error?.message || error).replace(/\bsk-[a-zA-Z0-9_-]{8,}\b/g, "[redacted]")}\n`);
  process.exitCode = 1;
});
