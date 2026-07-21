#!/usr/bin/env node
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTarotKrea2Adapter } from "../server/krea2-tarot-adapter.mjs";
import { buildTarotKrea2EditRequest } from "../src/domain/tarot-krea2-edit.js";

const root = process.cwd();
const manifestPath = path.join(root, "config", "codex-build-week-set.json");
const mediaRoot = path.join(root, "data", "media", "codex-build-week");
const sourceRoot = path.join(mediaRoot, "sources");
const outputRoot = path.join(mediaRoot, "cards");
const receiptPath = path.join(mediaRoot, "krea2-generation-receipt.json");
const force = process.argv.includes("--force");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const existingReceipt = await readJson(receiptPath, { cards: [] });
const existingById = new Map((existingReceipt.cards || []).map((card) => [card.cardId, card]));
const adapter = createTarotKrea2Adapter();
const node = await adapter.inspect();

if (!node.connected) throw new Error(node.error?.message || "Start the local Hapa Krea 2 Identity Node before generating Build Week art.");
const preset = (node.presets?.presets || []).find((candidate) => candidate.id === manifest.imageGeneration.preset && candidate.enabled);
if (!preset) throw new Error(`Krea 2 preset ${manifest.imageGeneration.preset} is unavailable.`);

await mkdir(outputRoot, { recursive: true });
const sourceAssets = new Map();
const results = [];

for (const card of manifest.cards) {
  const outputPath = path.join(outputRoot, `${card.id}.png`);
  const prior = existingById.get(card.id);
  if (!force && prior?.status === "succeeded" && await fileMatches(outputPath, prior.outputSha256)) {
    results.push({ ...prior, reused: true });
    process.stdout.write(`reuse ${card.number} ${card.title}\n`);
    continue;
  }
  if (!force && await exists(outputPath)) throw new Error(`Refusing to overwrite ${outputPath} without --force.`);

  let sourceAsset = sourceAssets.get(card.sourceFixture);
  if (!sourceAsset) {
    const sourcePath = path.join(sourceRoot, card.sourceFixture);
    const bytes = await readFile(sourcePath);
    sourceAsset = await adapter.uploadImage(bytes, { mimeType: "image/png", fileName: card.sourceFixture });
    sourceAssets.set(card.sourceFixture, sourceAsset);
  }

  const requestId = `codex-build-week-${card.id}-${randomUUID()}`;
  const consentEventId = `codex-build-week-consent-${randomUUID()}`;
  const request = buildTarotKrea2EditRequest({
    sourceAsset,
    instruction: card.instruction,
    preset: manifest.imageGeneration.preset,
    seed: card.seed,
    avatarId: "calder-wong",
    sourceCard: {
      id: `synthetic-fixture:${card.sourceFixture}`,
      revision: "cc0-v1",
      recordDigest: sourceAsset.sha256,
      originNodeId: "hapa-krea2-identity-node"
    },
    requestId,
    consentEventId,
    realPerson: false,
    identityUseBasis: "synthetic_nonhuman"
  });
  process.stdout.write(`queue ${card.number} ${card.title}\n`);
  let task = await adapter.submitEdit(request);
  task = await waitForTask(adapter, task.task_id);
  const artifact = (task.artifacts || []).find((candidate) => candidate.media_type?.startsWith("image/")) || task.artifacts?.[0];
  if (!artifact?.asset_id) throw new Error(`Krea 2 task ${task.task_id} succeeded without an image artifact.`);
  const content = await adapter.assetContent(artifact.asset_id);
  const outputSha256 = createHash("sha256").update(content.buffer).digest("hex");
  if (artifact.sha256 && artifact.sha256 !== outputSha256) throw new Error(`Artifact digest mismatch for ${card.id}.`);
  await writeFile(outputPath, content.buffer, { flag: force ? "w" : "wx" });
  const row = {
    cardId: card.id,
    number: card.number,
    title: card.title,
    status: "succeeded",
    sourceFixture: card.sourceFixture,
    sourceAssetId: sourceAsset.asset_id,
    sourceSha256: sourceAsset.sha256,
    taskId: task.task_id,
    preset: manifest.imageGeneration.preset,
    seed: card.seed,
    artifactId: artifact.asset_id,
    outputSha256,
    mediaType: content.contentType,
    width: artifact.width || preset.width || null,
    height: artifact.height || preset.height || null,
    identityUseBasis: "synthetic_nonhuman",
    identityTruth: false,
    humanReviewRequired: true,
    generatedAt: new Date().toISOString()
  };
  results.push(row);
  await writeReceipt(results);
  process.stdout.write(`done  ${card.number} ${outputSha256.slice(0, 12)}\n`);
}

await writeReceipt(results);
process.stdout.write(`${JSON.stringify({ ok: true, cards: results.length, preset: manifest.imageGeneration.preset, receipt: path.relative(root, receiptPath) }, null, 2)}\n`);

async function waitForTask(client, taskId) {
  const deadline = Date.now() + 12 * 60_000;
  let task;
  while (Date.now() < deadline) {
    task = await client.task(taskId);
    process.stdout.write(`  ${String(task.stage || task.status).padEnd(18)} ${Math.round(Number(task.progress || 0) * 100)}%\r`);
    if (task.status === "succeeded") {
      process.stdout.write("\n");
      return task;
    }
    if (["failed", "cancelled"].includes(task.status)) throw new Error(task.error?.message || task.recovery || `Krea 2 task ${taskId} ${task.status}.`);
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error(`Timed out waiting for Krea 2 task ${taskId}.`);
}

async function writeReceipt(cards) {
  await mkdir(path.dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, `${JSON.stringify({
    schemaVersion: "hapa.codex-build-week-krea2-generation-receipt.v1",
    setId: manifest.id,
    provider: manifest.imageGeneration.provider,
    preset: manifest.imageGeneration.preset,
    sourceBasis: "synthetic_nonhuman",
    sourceLicense: manifest.imageGeneration.sourceLicense,
    identityTruth: false,
    humanReviewRequired: true,
    updatedAt: new Date().toISOString(),
    cards
  }, null, 2)}\n`);
}

async function readJson(filePath, fallback) {
  try { return JSON.parse(await readFile(filePath, "utf8")); } catch (error) { if (error?.code === "ENOENT") return fallback; throw error; }
}

async function exists(filePath) {
  try { await stat(filePath); return true; } catch (error) { if (error?.code === "ENOENT") return false; throw error; }
}

async function fileMatches(filePath, digest) {
  if (!digest || !await exists(filePath)) return false;
  return createHash("sha256").update(await readFile(filePath)).digest("hex") === digest;
}
