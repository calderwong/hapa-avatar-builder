#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import {
  claimEchoSceneKeyframeQuests,
  completeEchoSceneKeyframeQuest,
  configureEchoSceneKeyframeProcess,
  createEchoSceneKeyframeProcess,
  echoSceneKeyframeProcessSummary,
  failEchoSceneKeyframeQuest,
  importEchoSceneKeyframeArtifacts,
  pauseEchoSceneKeyframeProcess,
  planEchoSceneKeyframeCounts,
  releaseExpiredEchoSceneKeyframeLeases,
  requestEchoSceneKeyframeStopAfterCurrent,
  resumeEchoSceneKeyframeProcess,
  startEchoSceneKeyframeProcess,
} from "../src/domain/echo-scene-keyframe-process.js";
import { resolveEchoSceneKeyframeGeneratedRoot } from "../server/avatar-runtime-paths.mjs";
import { DEFAULTS, atomicWriteJson, buildAudit, stableStringify } from "./echo-scene-keyframes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_ROOT = path.resolve(process.env.HAPA_ECHO_KEYFRAME_RUNTIME_ROOT || path.join(ROOT, "data/echo-scene-keyframes"));
const PROCESS_PATH = path.join(RUNTIME_ROOT, "process.json");
const AUDIT_PATH = path.join(RUNTIME_ROOT, "audit.json");
const EVENT_PATH = path.join(RUNTIME_ROOT, "events.ndjson");
const CLAIM_ROOT = path.join(RUNTIME_ROOT, "claims");
const PILOT_ROOT = path.resolve(process.env.HAPA_ECHO_KEYFRAME_PILOT_ROOT || path.join(ROOT, DEFAULTS.pilotRoot));
const GENERATED_ROOT = resolveEchoSceneKeyframeGeneratedRoot();
const MEDIA_CARDS_PATH = path.join(RUNTIME_ROOT, "media-cards.json");

const PROCESS_SETTINGS = Object.freeze({ concurrency: 3, perRunClaimLimit: 3, leaseMs: 45 * 60 * 1000, maxAttempts: 3 });

function now() { return new Date().toISOString(); }
function hashValue(value) { return `sha256:${crypto.createHash("sha256").update(typeof value === "string" ? value : stableStringify(value, 0)).digest("hex")}`; }
function hashFile(filePath) { return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`; }
function readJson(filePath, fallback = null) { try { return JSON.parse(fs.readFileSync(filePath, "utf8")); } catch { return fallback; } }
function writeProcess(next, prior = null) {
  fs.mkdirSync(RUNTIME_ROOT, { recursive: true });
  const priorEvents = Array.isArray(prior?.events) ? prior.events.length : 0;
  const additions = (next.events || []).slice(priorEvents);
  atomicWriteJson(PROCESS_PATH, next);
  if (additions.length) fs.appendFileSync(EVENT_PATH, additions.map((event) => `${JSON.stringify(event)}\n`).join(""));
}

function optionsFrom(argv) {
  const options = { command: "status", apply: false, lane: null, limit: null, runnerId: "codex-terra", runId: `run-${Date.now()}`, questId: null, result: null, localPath: null, error: null, retry: true, concurrency: null, perRunClaimLimit: null, leaseMs: null, maxAttempts: null };
  const args = [...argv];
  if (args[0] && !args[0].startsWith("--")) options.command = args.shift();
  while (args.length) {
    const token = args.shift();
    if (token === "--apply") { options.apply = true; continue; }
    if (token === "--no-retry") { options.retry = false; continue; }
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}`);
    const [raw, inline] = token.slice(2).split("=", 2);
    const key = raw.replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase());
    if (!(key in options)) throw new Error(`Unknown option: --${raw}`);
    const value = inline ?? args.shift();
    if (value === undefined) throw new Error(`Missing value: --${raw}`);
    options[key] = value;
  }
  if (options.limit !== null) options.limit = Number(options.limit);
  for (const key of ["concurrency", "perRunClaimLimit", "leaseMs", "maxAttempts"]) {
    if (options[key] !== null) options[key] = Number(options[key]);
  }
  return options;
}

function auditOptions() { return { ...DEFAULTS, apply: false, song: null }; }
function countInput(song, window) {
  const input = {
    songId: song.songId,
    countOrdinal: window.ordinal,
    beatStart: window.beatStart,
    beatEndExclusive: window.beatEndExclusive,
    startSeconds: window.startSeconds,
    endSeconds: window.endSeconds,
    timingStatus: "ready",
    sourceRevision: {
      telemetryRunId: song.timing.telemetryRunId,
      lyricTiming: song.lyricTiming,
      directorContext: song.directorContext,
      windowTiming: window.timing,
      lyricOverlap: window.lyricOverlap,
    },
  };
  return { ...input, id: window.id, inputHash: hashValue(input) };
}

function seedCatalog() {
  const catalog = new Map();
  if (!fs.existsSync(PILOT_ROOT)) return catalog;
  for (const child of fs.readdirSync(PILOT_ROOT)) {
    const plan = readJson(path.join(PILOT_ROOT, child, "plan.json"));
    for (const count of plan?.counts || []) for (const seed of count.seedAssets || []) {
      if (!seed.colorRole || !seed.retrievalHandle || !fs.existsSync(seed.retrievalHandle)) continue;
      catalog.set(seed.colorRole.toLowerCase(), seed);
    }
  }
  return catalog;
}

function importPilots(next, at) {
  if (!fs.existsSync(PILOT_ROOT)) return next;
  for (const child of fs.readdirSync(PILOT_ROOT).sort()) {
    const plan = readJson(path.join(PILOT_ROOT, child, "plan.json"));
    for (const count of plan?.counts || []) {
      const target = next.counts.find((candidate) => candidate.id === count.id)
        || next.counts.find((candidate) => candidate.songId === plan?.songId && candidate.countOrdinal === count.ordinal);
      if (!target) continue;
      if (count.prompt?.status !== "ready") continue;
      const imagePath = count.image?.retrievalHandle;
      const imageResult = count.image?.status === "keyframe_exists" && imagePath && fs.existsSync(imagePath)
        ? { ...count.image, localPath: imagePath, keyframeExists: true }
        : null;
      if (target.lanes?.image?.artifact?.state === "keyframe_exists") continue;
      next = importEchoSceneKeyframeArtifacts(next, target.id, { promptResult: count.prompt, imageResult, at });
    }
  }
  return next;
}

function initialize({ start = false } = {}) {
  const at = now();
  const audit = buildAudit(auditOptions());
  atomicWriteJson(AUDIT_PATH, audit);
  const inputs = audit.songs.flatMap((song) => song.windows.map((window) => countInput(song, window)));
  const prior = readJson(PROCESS_PATH);
  let next = prior
    ? planEchoSceneKeyframeCounts(prior, { counts: inputs, at })
    : createEchoSceneKeyframeProcess({ processId: "echo-state-album-four-count-keyframes", settings: PROCESS_SETTINGS, counts: inputs });
  next = importPilots(next, at);
  if (start) next = startEchoSceneKeyframeProcess(next, { at });
  writeProcess(next, prior);
  return report(next, audit, { initialized: true });
}

function evidenceFor(audit, claim, completedPrompt = null) {
  const song = audit.songs.find((candidate) => candidate.songId === claim.songId);
  const index = song?.windows.findIndex((window) => window.id === claim.countId) ?? -1;
  const window = index >= 0 ? song.windows[index] : null;
  const avatarColor = String(song?.directorContext?.avatarName || "").toLowerCase();
  const seeds = seedCatalog();
  const seed = seeds.get(avatarColor) || [...seeds.values()][Math.abs(Number(claim.countOrdinal || 0)) % Math.max(1, seeds.size)] || null;
  const promptSeeds = (completedPrompt?.seedUse || []).filter((candidate) => {
    if (!candidate?.retrievalHandle || !fs.existsSync(candidate.retrievalHandle)) return false;
    return !candidate.contentHash || candidate.contentHash === hashFile(candidate.retrievalHandle);
  });
  return {
    song: song ? { songId: song.songId, songTitle: song.songTitle, durationSeconds: song.durationSeconds, directorContext: song.directorContext } : null,
    count: window,
    continuity: song && index >= 0 ? { previous: song.windows[index - 1] || null, next: song.windows[index + 1] || null } : null,
    seedAssets: promptSeeds.length ? promptSeeds : seed ? [seed] : [],
    outputContract: {
      sceneText: "concise visible frame action",
      gptImagePrompt: "background/scene, subject, action, composition, lighting, palette, lens, energy, identity-preservation constraints",
      negativePrompt: "no readable text, logos, UI, identity/wardrobe drift, or malformed anatomy; supplemental seed-derived subjects are acceptable when they strengthen the lyric/context and do not displace the primary action",
      justification: "cite exact overlapping lyrics and explain contextual/reference transformation",
      evidence: "lyric citations plus cue/context/reference IDs where present",
      seedUse: "state what each supplied Avatar image contributes and preserves; keep identities distinct and stage only cast listed on-screen in completedPrompt.evidence.castAppearances",
      continuity: "state what carries in and what the next count needs",
      confidenceAndGaps: "explicitly separate verified evidence from interpretation",
      semanticDensity: "for lyric-bearing counts, make multiple mined elements visible: a concrete noun/symbol plus a verb/state change and the concept/teaching",
      acceptancePriority: "judge semantic attachment, visible lyric action, reference payoff, composition, and continuity before incidental subject exclusions; polished but generic imagery fails",
      workerProtocol: "docs/prompts/ECHO_GPT_IMAGE_KEYFRAME_WORKER.md",
    },
  };
}

function claim(options) {
  const prior = requireProcess();
  let recovered = releaseExpiredEchoSceneKeyframeLeases(prior, { at: now() });
  const { process: next, claims } = claimEchoSceneKeyframeQuests(recovered, {
    lane: options.lane,
    limit: options.limit || undefined,
    runnerId: options.runnerId,
    runId: options.runId,
    at: now(),
  });
  const audit = readJson(AUDIT_PATH) || buildAudit(auditOptions());
  const packet = {
    schemaVersion: "hapa.echo.scene-keyframe-codex-claim.v1",
    claimedAt: now(),
    processStatus: next.status,
    runnerId: options.runnerId,
    runId: options.runId,
    providerPolicy: "Codex built-in GPT Image only; OpenAI API disabled",
    videoPolicy: "held; do not generate video",
    claims: claims.map((entry) => {
      const count = next.counts.find((candidate) => candidate.id === entry.countId);
      const completedPrompt = entry.lane === "image" ? count?.lanes?.prompt?.artifact?.result || null : null;
      return {
        ...entry,
        evidencePacket: evidenceFor(audit, entry, completedPrompt),
        completedPrompt,
      };
    }),
  };
  fs.mkdirSync(CLAIM_ROOT, { recursive: true });
  const claimPath = path.join(CLAIM_ROOT, `${options.runId}.json`);
  if (claims.length) atomicWriteJson(claimPath, packet);
  writeProcess(next, prior);
  return { ...report(next, audit), claimPath: claims.length ? claimPath : null, claims: packet.claims };
}

function resultValue(raw) {
  if (!raw) throw new Error("--result is required");
  const filePath = path.resolve(raw);
  return fs.existsSync(filePath) ? readJson(filePath) : JSON.parse(raw);
}

function completePrompt(options) {
  const prior = requireProcess();
  const result = resultValue(options.result);
  for (const key of ["sceneText", "gptImagePrompt", "negativePrompt", "justification", "evidence", "seedUse", "continuity"]) {
    if (!result[key] || (typeof result[key] === "string" && !result[key].trim())) throw new Error(`Prompt result is missing ${key}`);
  }
  result.contentHash ||= hashValue(result);
  const next = completeEchoSceneKeyframeQuest(prior, options.questId, { result, runnerId: options.runnerId, at: now() });
  writeProcess(next, prior);
  return report(next, readJson(AUDIT_PATH), { completedQuestId: options.questId });
}

function dimensions(filePath) {
  const probe = spawnSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", filePath], { encoding: "utf8" });
  if (probe.status !== 0) throw new Error(`ffprobe failed for ${filePath}: ${probe.stderr || probe.stdout}`);
  const stream = JSON.parse(probe.stdout)?.streams?.[0];
  return { width: Number(stream?.width), height: Number(stream?.height) };
}

function installImage(options) {
  const prior = requireProcess();
  const found = prior.counts.flatMap((count) => ["prompt", "image"].map((lane) => ({ count, lane, quest: count.lanes[lane].quest }))).find((entry) => entry.quest.id === options.questId);
  if (!found || found.lane !== "image") throw new Error(`Claimed image quest not found: ${options.questId}`);
  if (found.quest.status !== "claimed") throw new Error(`Image quest is not claimed: ${options.questId}`);
  const source = path.resolve(options.localPath || "");
  if (!fs.existsSync(source) || !fs.statSync(source).size) throw new Error(`Generated image does not exist: ${source}`);
  fs.mkdirSync(GENERATED_ROOT, { recursive: true });
  const revision = found.quest.contentHash.slice(0, 12);
  const nativePath = path.join(GENERATED_ROOT, `${found.count.id}-${revision}.png`);
  const directorPath = path.join(GENERATED_ROOT, `${found.count.id}-${revision}.director-1920x1080.png`);
  const render = (args, target) => {
    const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args, target], { encoding: "utf8" });
    if (result.status !== 0) throw new Error(`ffmpeg image install failed: ${result.stderr || result.stdout}`);
  };
  render(["-i", source, "-frames:v", "1"], nativePath);
  render(["-i", source, "-frames:v", "1", "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=black"], directorPath);
  const promptArtifact = found.count.lanes.prompt.artifact;
  const promptResult = promptArtifact?.result || {};
  const result = {
    keyframeExists: true,
    localPath: directorPath,
    nativeOutput: { path: nativePath, contentHash: hashFile(nativePath), ...dimensions(nativePath) },
    contentHash: hashFile(directorPath),
    dimensions: dimensions(directorPath),
    provider: { model: "GPT Image", mode: "codex-built-in-imagegen", runnerId: options.runnerId, runId: found.quest.runId },
    conformance: { profileId: "landscape", status: "exact-director-derivative", derivation: "lanczos-fit-plus-pad-from-codex-native-output" },
    reviewStatus: "candidate-pending-human-review",
    eligibleForDirector: false,
    promptProvenance: {
      promptContentHash: promptArtifact?.contentHash || null,
      seedAssets: (promptResult.seedUse || []).map((seed) => ({ avatarId: seed.avatarId, assetId: seed.assetId, castRole: seed.castRole || null, species: seed.species || null, contentHash: seed.contentHash || null, retrievalHandle: seed.retrievalHandle || null })),
      castAppearances: promptResult.evidence?.castAppearances || [],
    },
    installedAt: now(),
  };
  const next = completeEchoSceneKeyframeQuest(prior, options.questId, { result, runnerId: options.runnerId, at: result.installedAt });
  const cards = readJson(MEDIA_CARDS_PATH, { schemaVersion: "hapa.echo.scene-keyframe-media-cards.v1", cards: [] });
  cards.cards = (cards.cards || []).filter((card) => card.questId !== options.questId);
  cards.cards.push({ id: `echo-scene-keyframe-card:${found.count.id}:${revision}`, questId: options.questId, songId: found.count.songId, countId: found.count.id, sourceGroup: "echo-scene-keyframe", ...result });
  atomicWriteJson(MEDIA_CARDS_PATH, cards);
  writeProcess(next, prior);
  return report(next, readJson(AUDIT_PATH), { completedQuestId: options.questId, installed: result });
}

function fail(options) {
  const prior = requireProcess();
  const next = failEchoSceneKeyframeQuest(prior, options.questId, { error: options.error || "worker_failed", runnerId: options.runnerId, retry: options.retry, at: now() });
  writeProcess(next, prior);
  return report(next, readJson(AUDIT_PATH), { failedQuestId: options.questId });
}

function requireProcess() {
  const value = readJson(PROCESS_PATH);
  if (!value) throw new Error(`Echo keyframe process is not initialized. Run init --apply first: ${PROCESS_PATH}`);
  return value;
}

function report(state, audit, extra = {}) {
  return {
    ok: true,
    processPath: PROCESS_PATH,
    process: echoSceneKeyframeProcessSummary(state),
    album: audit?.summary || null,
    controls: { start: "start", pause: "pause", resume: "resume", stopAfterCurrent: "stop-after-current", status: "status" },
    noOpenAIAPI: true,
    noVideoGeneration: true,
    ...extra,
  };
}

function control(command) {
  const prior = requireProcess();
  const at = now();
  const next = command === "start" ? startEchoSceneKeyframeProcess(prior, { at })
    : command === "pause" ? pauseEchoSceneKeyframeProcess(prior, { at })
      : command === "resume" ? resumeEchoSceneKeyframeProcess(prior, { at })
        : requestEchoSceneKeyframeStopAfterCurrent(prior, { at });
  writeProcess(next, prior);
  return report(next, readJson(AUDIT_PATH));
}

function configure(options) {
  const prior = requireProcess();
  const settings = Object.fromEntries(
    ["concurrency", "perRunClaimLimit", "leaseMs", "maxAttempts"]
      .filter((key) => options[key] !== null)
      .map((key) => [key, options[key]]),
  );
  if (!Object.keys(settings).length) throw new Error("configure requires at least one setting");
  const next = configureEchoSceneKeyframeProcess(prior, { settings, at: now() });
  writeProcess(next, prior);
  return report(next, readJson(AUDIT_PATH), { configured: true });
}

export function run(argv = process.argv.slice(2)) {
  const options = optionsFrom(argv);
  if (options.command === "init") {
    if (!options.apply) throw new Error("init is write-bearing; pass --apply");
    return initialize();
  }
  if (options.command === "run") {
    if (!options.apply) throw new Error("run is write-bearing; pass --apply");
    return initialize({ start: true });
  }
  if (["start", "pause", "resume", "stop-after-current"].includes(options.command)) return control(options.command);
  if (options.command === "configure") return configure(options);
  if (options.command === "status") return report(requireProcess(), readJson(AUDIT_PATH));
  if (options.command === "claim") return claim(options);
  if (options.command === "prompt-complete") return completePrompt(options);
  if (options.command === "image-complete") return installImage(options);
  if (options.command === "fail") return fail(options);
  if (options.command === "release-expired") {
    const prior = requireProcess();
    const next = releaseExpiredEchoSceneKeyframeLeases(prior, { at: now() });
    writeProcess(next, prior);
    return report(next, readJson(AUDIT_PATH));
  }
  throw new Error(`Unknown command: ${options.command}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.stdout.write(`${stableStringify(run())}\n`); }
  catch (error) { process.stderr.write(`${error.stack || error.message}${os.EOL}`); process.exitCode = 1; }
}
