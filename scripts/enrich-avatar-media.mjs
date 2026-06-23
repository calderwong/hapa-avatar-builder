#!/usr/bin/env node
import { execFile as execFileCallback } from "node:child_process";
import { constants as fsConstants } from "node:fs";
import { access, copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  createVideoStaticImageMatchQueue,
  pairVideoFirstFrameWithStaticImage,
  normalizeAvatarCard
} from "../src/domain/avatar.js";
import {
  createCharacterSheetScaffold,
  createMediaIntelligenceRecord
} from "../src/domain/characterSheet.js";
import { normalizeAvatarTeams } from "../src/domain/avatarTeams.js";
import { normalizeTarotStore } from "../src/domain/tarot.js";

const execFile = promisify(execFileCallback);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const STORE_PATH = process.env.HAPA_AVATAR_STORE || path.join(ROOT, "data/avatar-store.json");
const TAROT_STORE_PATH = process.env.HAPA_TAROT_STORE || path.join(ROOT, "data/tarot-store.json");
const KANBAN_PATH = process.env.HAPA_KANBAN_STORE || path.join(ROOT, "data/kanban.json");
const MEDIA_DIR = process.env.HAPA_MEDIA_DIR || path.join(ROOT, "data/media");
const TOOL_PATH = path.join(ROOT, "artifacts/tools/vision-ocr");
const SWIFT_SOURCE = path.join(ROOT, "scripts/vision-ocr.swift");
const REPORT_PATH = path.join(ROOT, "artifacts/enrichment/avatar-media-enrichment-report.json");
const DRY_RUN = process.argv.includes("--dry-run");
const AUTO_PAIR = !process.argv.includes("--no-auto-pair");

await main();

async function main() {
  await ensureVisionTool();
  const store = await readAvatarStore();
  const tarotStore = await readTarotStore();
  const jobs = collectVisionJobs(store.avatars);
  const vision = await runVision(jobs.map((job) => job.path));
  const byAsset = groupJobsByAsset(jobs, vision);
  const report = {
    schemaVersion: "hapa.avatar-media-enrichment-report.v1",
    dryRun: DRY_RUN,
    autoPair: AUTO_PAIR,
    avatars: 0,
    assets: 0,
    imageJobs: jobs.filter((job) => job.kind === "asset-image").length,
    frameJobs: jobs.filter((job) => job.kind === "video-frame").length,
    enrichedAssets: 0,
    ocrAssets: 0,
    ocrLines: 0,
    pairCandidates: 0,
    autoPaired: 0,
    gaps: 0,
    generatedAt: new Date().toISOString(),
    avatarSummaries: []
  };

  const nextAvatars = [];
  for (const rawAvatar of store.avatars || []) {
    let avatar = normalizeAvatarCard(rawAvatar);
    report.avatars += 1;
    const avatarSummary = {
      avatarId: avatar.id,
      primaryName: avatar.primaryName,
      assets: avatar.assets.length,
      enrichedAssets: 0,
      ocrAssets: 0,
      ocrLines: 0,
      pairCandidates: 0,
      autoPaired: 0,
      gaps: 0
    };

    avatar.assets = avatar.assets.map((asset) => {
      const enriched = enrichAsset(asset, byAsset.get(asset.id) || []);
      if (enriched.metadata?.intelligence) {
        avatarSummary.enrichedAssets += 1;
        report.enrichedAssets += 1;
        const lineCount = enriched.metadata.intelligence.ocr?.lineCount || 0;
        if (lineCount > 0) {
          avatarSummary.ocrAssets += 1;
          avatarSummary.ocrLines += lineCount;
          report.ocrAssets += 1;
          report.ocrLines += lineCount;
        }
      }
      return enriched;
    });

    let pairingQueue = createVideoStaticImageMatchQueue(avatar, { threshold: 0.9 });
    avatarSummary.pairCandidates = pairingQueue.length;
    report.pairCandidates += pairingQueue.length;
    if (AUTO_PAIR) {
      for (const candidate of pairingQueue.filter((item) => item.score >= 0.94).slice(0, 24)) {
        avatar = pairVideoFirstFrameWithStaticImage(avatar, candidate, {
          status: "auto-paired",
          reason: candidate.reason,
          note: "High-confidence retroactive image-to-image match from avatar media enrichment."
        });
        avatarSummary.autoPaired += 1;
        report.autoPaired += 1;
      }
      pairingQueue = createVideoStaticImageMatchQueue(avatar, { threshold: 0.9 });
    }

    avatar.characterSheet = createCharacterSheetScaffold(avatar, { tarotStore });
    avatar.characterSheet.mediaIntelligence.matching = {
      schemaVersion: "hapa.avatar-video-static-pairing.v1",
      queue: pairingQueue.slice(0, 32),
      autoPaired: avatarSummary.autoPaired,
      lastRunAt: new Date().toISOString()
    };
    avatarSummary.gaps = avatar.characterSheet.gaps.length;
    report.gaps += avatarSummary.gaps;
    avatar.updatedAt = new Date().toISOString();
    report.assets += avatar.assets.length;
    report.avatarSummaries.push(avatarSummary);
    nextAvatars.push(avatar);
  }

  const nextStore = {
    ...store,
    avatars: nextAvatars,
    teams: normalizeAvatarTeams(store.teams || [], nextAvatars),
    updatedAt: new Date().toISOString()
  };

  if (!DRY_RUN) {
    await backupFile(STORE_PATH);
    await writeFile(STORE_PATH, `${JSON.stringify(nextStore, null, 2)}\n`, "utf8");
    await writeReport(report);
    await updateKanbanBoard({
      "card-sheet-domain-contract": "done",
      "card-sheet-builder-ui": "done",
      "card-tarot-avatar-media-scaffold": "done",
      "card-avatar-vision-schema": "done",
      "card-avatar-ocr-all-known-images": report.imageJobs || report.frameJobs ? "done" : "blocked",
      "card-character-dossier-kit-extraction": report.ocrAssets ? "done" : "in_progress",
      "card-video-static-pairing-flow": "done",
      "card-retro-pairing-heal": report.pairCandidates || report.autoPaired ? "done" : "in_progress",
      "card-sheet-gap-templating": "done"
    });
  } else {
    await writeReport(report);
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    reportPath: REPORT_PATH,
    ...report
  }, null, 2));
}

async function ensureVisionTool() {
  let needsBuild = true;
  try {
    const [toolStat, sourceStat] = await Promise.all([stat(TOOL_PATH), stat(SWIFT_SOURCE)]);
    needsBuild = sourceStat.mtimeMs > toolStat.mtimeMs;
  } catch {
    needsBuild = true;
  }
  if (!needsBuild) return;
  await mkdir(path.dirname(TOOL_PATH), { recursive: true });
  await execFile("swiftc", [SWIFT_SOURCE, "-o", TOOL_PATH], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024 });
}

async function readAvatarStore() {
  const store = JSON.parse(await readFile(STORE_PATH, "utf8"));
  const avatars = (store.avatars || []).map((avatar) => normalizeAvatarCard(avatar));
  return {
    ...store,
    avatars,
    teams: normalizeAvatarTeams(store.teams || [], avatars)
  };
}

async function readTarotStore() {
  try {
    return normalizeTarotStore(JSON.parse(await readFile(TAROT_STORE_PATH, "utf8")));
  } catch {
    return normalizeTarotStore({});
  }
}

function collectVisionJobs(avatars = []) {
  const jobs = [];
  const seen = new Set();
  const add = (job) => {
    if (!job.path || seen.has(job.path)) return;
    seen.add(job.path);
    jobs.push(job);
  };

  for (const avatar of avatars) {
    for (const asset of avatar.assets || []) {
      if (asset.type === "image") {
        const filePath = mediaPathForAsset(asset);
        if (filePath) add({ kind: "asset-image", avatarId: avatar.id, assetId: asset.id, path: filePath });
      }
      if (asset.type === "video") {
        for (const frame of asset.metadata?.frames || asset.state?.keyframes || []) {
          const filePath = mediaPathForUri(frame.uri);
          if (filePath) add({ kind: "video-frame", avatarId: avatar.id, assetId: asset.id, frame: frame.marker, path: filePath });
        }
      }
    }
  }
  return jobs;
}

async function runVision(paths) {
  const results = new Map();
  const existingPaths = [];
  for (const filePath of paths) {
    try {
      await access(filePath, fsConstants.R_OK);
      existingPaths.push(filePath);
    } catch {
      results.set(filePath, { path: filePath, ok: false, textLines: [], labels: [], error: "missing" });
    }
  }

  const chunks = chunkArray(existingPaths, 48);
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    console.error(`[avatar-enrich] Vision chunk ${index + 1}/${chunks.length} (${chunk.length} images)`);
    const { stdout } = await execFile(TOOL_PATH, chunk, { cwd: ROOT, maxBuffer: 120 * 1024 * 1024 });
    for (const line of stdout.split("\n").filter(Boolean)) {
      const result = JSON.parse(line);
      results.set(result.path, result);
    }
  }
  return results;
}

function groupJobsByAsset(jobs, vision) {
  const grouped = new Map();
  for (const job of jobs) {
    if (!grouped.has(job.assetId)) grouped.set(job.assetId, []);
    grouped.get(job.assetId).push({ ...job, result: vision.get(job.path) || null });
  }
  return grouped;
}

function enrichAsset(asset, jobs = []) {
  if (asset.type === "image") {
    const result = jobs.find((job) => job.kind === "asset-image")?.result || null;
    if (!result) return asset;
    const intelligence = createMediaIntelligenceRecord(asset, result, {
      source: "avatar-builder-retroactive-image-pass"
    });
    return withAssetIntelligence(asset, intelligence, result.fingerprint || null);
  }

  if (asset.type === "video") {
    const frameResults = jobs
      .filter((job) => job.kind === "video-frame")
      .map((job) => ({
        marker: job.frame,
        path: job.path,
        ok: Boolean(job.result?.ok),
        width: job.result?.width || null,
        height: job.result?.height || null,
        textLines: job.result?.textLines || [],
        labels: job.result?.labels || []
      }));
    if (!frameResults.length) return asset;
    const aggregateVision = {
      ok: frameResults.some((frame) => frame.ok),
      textLines: frameResults.flatMap((frame) => frame.textLines || []),
      labels: dedupeLabels(frameResults.flatMap((frame) => frame.labels || [])).slice(0, 24)
    };
    const intelligence = createMediaIntelligenceRecord(asset, aggregateVision, {
      source: "avatar-builder-video-frame-pass"
    });
    return withAssetIntelligence(asset, intelligence, null, frameResults);
  }

  return asset;
}

function withAssetIntelligence(asset, intelligence, fingerprint = null, frameResults = null) {
  return {
    ...asset,
    tags: unique([
      ...(asset.tags || []),
      "vision-ocr",
      intelligence.ocr?.lineCount ? "ocr-text" : null,
      intelligence.classifications?.documentKind,
      ...(intelligence.classifications?.palette || []).map((color) => `palette-${color}`),
      ...(intelligence.classifications?.activity || []),
      ...((intelligence.gaps || []).length ? ["needs-review"] : [])
    ]),
    metadata: {
      ...(asset.metadata || {}),
      ...(fingerprint ? { fingerprint } : {}),
      ...(frameResults ? { frameIntelligence: frameResults } : {}),
      intelligence
    }
  };
}

async function updateKanbanBoard(statuses) {
  try {
    const board = JSON.parse(await readFile(KANBAN_PATH, "utf8"));
    for (const lane of board.lanes || []) {
      for (const card of lane.cards || []) {
        if (statuses[card.id]) card.status = statuses[card.id];
      }
    }
    await writeFile(KANBAN_PATH, `${JSON.stringify(board, null, 2)}\n`, "utf8");
  } catch {
    // Keep enrichment usable even if the board file is being edited.
  }
}

async function writeReport(report) {
  await mkdir(path.dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

async function backupFile(filePath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(ROOT, "data/backups", `${path.basename(filePath)}.avatar-enrichment-${timestamp}.json`);
  await mkdir(path.dirname(backupPath), { recursive: true });
  await copyFile(filePath, backupPath);
}

function mediaPathForAsset(asset) {
  if (!asset?.uri) return null;
  return mediaPathForUri(asset.uri);
}

function mediaPathForUri(uri) {
  if (!uri) return null;
  if (uri.startsWith("/media/")) return path.join(MEDIA_DIR, uri.slice("/media/".length));
  if (uri.startsWith("file://")) return new URL(uri).pathname;
  if (path.isAbsolute(uri)) return uri;
  return null;
}

function dedupeLabels(labels = []) {
  const byId = new Map();
  for (const label of labels) {
    const identifier = label.identifier || label.label;
    if (!identifier) continue;
    const existing = byId.get(identifier);
    if (!existing || Number(label.confidence || 0) > Number(existing.confidence || 0)) byId.set(identifier, label);
  }
  return [...byId.values()].sort((a, b) => Number(b.confidence || 0) - Number(a.confidence || 0));
}

function chunkArray(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function unique(items = []) {
  return [...new Set(items.filter(Boolean).map((item) => String(item).trim()).filter(Boolean))];
}
