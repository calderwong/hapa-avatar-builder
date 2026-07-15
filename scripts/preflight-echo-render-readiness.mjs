#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import os from "node:os";
import crypto from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  deriveEchoDirectionVariantProject,
  echoDirectionVariantFingerprint,
  echoDirectionVariantId,
} from "../src/domain/echo-direction-variants.js";
import {
  projectEchoRuntimeShaderRepairProvenance,
  repairEchoRuntimeDirectionVariant,
  repairEchoRuntimeShaderGraph,
  repairEchoRuntimeVisualizerTimeline,
} from "../src/domain/echo-runtime-shader-repair.js";
import { preflightSongCardRenderReadiness } from "../src/domain/song-card-render-readiness.js";
import { reidentifyEchoCompiledShowGraph, validateEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";
import { repairEchoShowGraphStemBindings } from "../src/domain/echo-stem-binding-repair.js";
import { echoProjectAudioRoute } from "../src/domain/echo-audio-route.js";
import { preflightHyperFramesMedia } from "../src/domain/hyperframes-show-compiler.js";
import { contentHash } from "../src/domain/echo-director-v2.js";
import { EchoIsfAssetCatalog } from "../server/echo-isf-assets.mjs";
import { createEchoMintPlanCanonicalResolver } from "../server/echo-mint-plan-canonical-resolver.mjs";
import { echoExecutionPointerToken, publishEchoExecutionGraph } from "../server/echo-execution-graph-store.mjs";
import {
  inspectSongCardLocalRenderer,
  inspectSongCardRendererBuildIdentity,
  preflightSongCardSignalGraph,
  songCardRendererBuildSourceStatSignature,
} from "../server/song-card-local-renderer.mjs";
import {
  verifyEchoExecutionInputEvidence,
  verifyEchoExecutionVisualInputEvidence,
} from "../server/echo-director-show-graph-loader.mjs";
import {
  loadRenderVisualMediaProbeCache,
  preflightProxyAtlasImages,
  preflightResolvedVisualMedia,
  writeRenderVisualMediaProbeCache,
} from "../server/render-visual-media-preflight.mjs";
import {
  loadRenderAudioInputPreflightCache,
  preflightRenderAudioInputs,
  renderAudioInputsFromShowGraph,
  writeRenderAudioInputPreflightCache,
} from "../server/render-audio-input-preflight.mjs";
import { deriveRequiredStemTelemetryBindings, preflightStemTelemetryBundle } from "../server/stem-telemetry-preflight.mjs";
import { preflightStemRegistryLineage } from "../server/stem-registry-lineage-preflight.mjs";
import { resolveEchoRuntimeMediaUri } from "../server/echo-runtime-media-route.mjs";
import {
  echoDeliveryRuntimeBuildSourceStatSignature,
  inspectEchoDeliveryRuntimeBuildIdentity,
} from "../server/echo-delivery-runtime-build.mjs";
import {
  echoServerDeliverySourceStatSignature,
  inspectEchoServerDeliveryBuildIdentity,
} from "../server/echo-server-delivery-build.mjs";
import { acquireOwnedFileLock, releaseOwnedFileLock } from "../server/owned-file-lock.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
const execFile = promisify(execFileCallback);
const SCHEMA = "hapa.echo.album-render-readiness.v1";
export const ECHO_READINESS_CERTIFICATION_LOCK_SCHEMA = "hapa.echo.readiness-certification-lock.v1";
export const ECHO_READINESS_LEGACY_LOCK_STALE_MS = 5 * 60 * 1000;
const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const bodyOf = (payload = {}) => payload?.music_video_project || payload || {};
const variantOf = (payload = {}) => payload?.direction_script_variant || payload?.music_video_project_variant || payload?.variant || payload || {};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function stableFileSourceProof(filePath, label = "Source file") {
  const resolvedPath = path.resolve(filePath);
  const descriptor = fs.openSync(resolvedPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const before = fs.fstatSync(descriptor, { bigint: true });
    if (!before.isFile() || before.size <= 0n) throw new Error(`${label} is not a non-empty regular file: ${resolvedPath}`);
    const bytes = fs.readFileSync(descriptor);
    const after = fs.fstatSync(descriptor, { bigint: true });
    const statIdentity = (entry) => ({
      dev: String(entry.dev),
      ino: String(entry.ino),
      size: String(entry.size),
      mtimeNs: String(entry.mtimeNs),
      ctimeNs: String(entry.ctimeNs),
    });
    const beforeIdentity = statIdentity(before);
    const afterIdentity = statIdentity(after);
    if (JSON.stringify(beforeIdentity) !== JSON.stringify(afterIdentity)) {
      throw new Error(`${label} changed while it was being read: ${resolvedPath}`);
    }
    return {
      path: resolvedPath,
      bytes,
      sha256: `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`,
      statIdentity: afterIdentity,
    };
  } finally {
    fs.closeSync(descriptor);
  }
}

export function stableJsonSourceProof(filePath, label = "JSON source") {
  const proof = stableFileSourceProof(filePath, label);
  const value = JSON.parse(proof.bytes.toString("utf8"));
  const { bytes: _bytes, ...metadata } = proof;
  return { ...metadata, value };
}

export function assertFileSourceProofStatFresh(proof, label = "Source file") {
  if (!proof?.path || !proof?.statIdentity) throw new Error(`${label} proof is missing.`);
  const resolvedPath = path.resolve(proof.path);
  const descriptor = fs.openSync(resolvedPath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const current = fs.fstatSync(descriptor, { bigint: true });
    if (!current.isFile() || current.size <= 0n) throw new Error(`${label} is not a non-empty regular file: ${resolvedPath}`);
    const currentIdentity = {
      dev: String(current.dev),
      ino: String(current.ino),
      size: String(current.size),
      mtimeNs: String(current.mtimeNs),
      ctimeNs: String(current.ctimeNs),
    };
    if (JSON.stringify(currentIdentity) !== JSON.stringify(proof.statIdentity)) {
      throw new Error(`${label} changed after it was selected: ${resolvedPath}`);
    }
    return true;
  } finally {
    fs.closeSync(descriptor);
  }
}

function compactSourceProof(proof) {
  if (!proof) return null;
  const { bytes: _bytes, value: _value, ...metadata } = proof;
  return metadata;
}

const CERTIFIER_SOURCE_PROOF = stableFileSourceProof(SCRIPT_PATH, "Echo readiness certifier");

function assertJsonSourceProofFresh(proof, label = "JSON source") {
  if (!proof?.path || !proof?.sha256 || !proof?.statIdentity) throw new Error(`${label} proof is missing.`);
  const current = stableFileSourceProof(proof.path, label);
  if (current.sha256 !== proof.sha256 || JSON.stringify(current.statIdentity) !== JSON.stringify(proof.statIdentity)) {
    throw new Error(`${label} changed after it was selected: ${proof.path}`);
  }
  return true;
}

function assertFileSourceProofFresh(proof, label = "Source file") {
  const current = stableFileSourceProof(proof.path, label);
  if (current.sha256 !== proof.sha256 || JSON.stringify(current.statIdentity) !== JSON.stringify(proof.statIdentity)) {
    throw new Error(`${label} changed after this certifier process started: ${proof.path}`);
  }
  return true;
}

export function createScopedTelemetryAnalysisCache() {
  const payloads = new Map();
  const auditRecords = new Map();
  const compactRecord = (result = {}) => ({
    ok: result?.ok === true,
    origin: text(result?.cache?.origin) || null,
  });
  return {
    has(identitySha256) {
      return payloads.has(identitySha256);
    },
    get(identitySha256) {
      return payloads.get(identitySha256);
    },
    remember(identitySha256, result, { retainPayload = true } = {}) {
      if (retainPayload) payloads.set(identitySha256, result);
      const nextRecord = compactRecord(result);
      const previousRecord = auditRecords.get(identitySha256);
      // Preserve the first successful cache origin, matching the former
      // invocation-wide payload cache. A later success may replace a failure.
      if (!previousRecord || (!previousRecord.ok && nextRecord.ok)) {
        auditRecords.set(identitySha256, nextRecord);
      }
      return result;
    },
    releasePayloads() {
      payloads.clear();
    },
    summary() {
      const records = [...auditRecords.values()];
      return {
        uniqueAnalysisCount: records.length,
        successfulAnalysisCount: records.filter((entry) => entry.ok).length,
        failedAnalysisCount: records.filter((entry) => !entry.ok).length,
        persistentCacheHitCount: records.filter((entry) => entry.origin === "persistent").length,
        livePayloadCount: payloads.size,
      };
    },
  };
}

function jsonFiles(directory) {
  try {
    return fs.readdirSync(directory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json") && entry.name !== "index.json")
      .map((entry) => path.join(directory, entry.name))
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}

export function snapshotJsonCorpus(directory, { recursive = false } = {}) {
  const root = path.resolve(directory);
  const rows = [];
  const visit = (current, relativeDirectory = "") => {
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true })
        .sort((left, right) => left.name.localeCompare(right.name));
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Corpus membership cannot include a symbolic link: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        if (recursive) visit(absolutePath, relativePath);
        continue;
      }
      if (!entry.isFile() || !entry.name.endsWith(".json") || entry.name === "index.json") continue;
      const stat = fs.lstatSync(absolutePath, { bigint: true });
      rows.push({
        relativePath,
        statIdentity: {
          dev: String(stat.dev),
          ino: String(stat.ino),
          size: String(stat.size),
          mtimeNs: String(stat.mtimeNs),
          ctimeNs: String(stat.ctimeNs),
        },
      });
    }
  };
  visit(root);
  const normalizedRows = rows.sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  return {
    root,
    recursive,
    rows: normalizedRows,
    files: normalizedRows.map((row) => path.join(root, row.relativePath)),
    sha256: sha256Value({ recursive, rows: normalizedRows }),
  };
}

export function assertJsonCorpusSnapshotFresh(snapshot, label = "JSON corpus") {
  const current = snapshotJsonCorpus(snapshot.root, { recursive: snapshot.recursive });
  if (current.sha256 !== snapshot.sha256) {
    throw new Error(`${label} membership or file identity changed during the readiness sweep.`);
  }
  return true;
}

const ACTIVE_MINT_PLAN_CANDIDATE_STATUSES = new Set([
  "awaiting-approval",
  "approved",
  "queued",
  "rendering",
  "failed",
  "render-ready",
  "ready-for-mint-review",
  "minting",
]);
const ARCHIVAL_MINT_PLAN_CANDIDATE_STATUSES = new Set([
  "rejected",
  "canceled",
  "superseded",
  "minted",
  "completed",
  "up-to-date",
]);
const ARCHIVAL_MINT_PLAN_STATUSES = new Set([
  "completed",
  "minted",
  "superseded",
  "rejected",
  "canceled",
]);

function normalizedPlanId(value) {
  const candidate = text(value);
  if (!candidate) return "";
  return candidate.startsWith("plan:") ? candidate : `plan:${candidate}`;
}

export function assertRequestedMintPlanIdentity(plan, requestedPlanId) {
  const expected = text(requestedPlanId);
  const declaredPlanId = text(plan?.planId);
  const declaredId = text(plan?.id);
  if (
    !expected
    || declaredPlanId !== expected
    || declaredId && declaredId !== expected
  ) {
    throw new Error(`Requested mint plan identity does not match ${expected || "the requested plan"}.`);
  }
  return true;
}

function remintQueueCandidates(queue = {}) {
  if (Array.isArray(queue?.candidates)) return queue.candidates;
  if (queue?.candidates && typeof queue.candidates === "object") return Object.values(queue.candidates);
  return [];
}

function candidatePlanId(candidate = {}) {
  return normalizedPlanId(candidate.planId || candidate.plan_id || candidate.mintPlanId);
}

function isActiveMintPlanCandidate(candidate = {}) {
  const status = text(candidate?.status).toLowerCase();
  return ACTIVE_MINT_PLAN_CANDIDATE_STATUSES.has(status)
    || !ARCHIVAL_MINT_PLAN_CANDIDATE_STATUSES.has(status);
}

function planAuditPublicRow(entry, { reason, candidateRows = [] } = {}) {
  return {
    planId: entry.planId,
    path: entry.planPath,
    planStatus: text(entry.plan?.status).toLowerCase() || null,
    parseStatus: entry.parseError ? "invalid" : entry.loaded === false ? "not-loaded" : "parsed",
    reason,
    candidateIds: candidateRows.map((candidate) => text(candidate?.id)).filter(Boolean).sort(),
    candidateStatuses: [...new Set(candidateRows.map((candidate) => text(candidate?.status).toLowerCase() || "unknown"))].sort(),
  };
}

function reasonCounts(rows = []) {
  const counts = {};
  for (const row of rows) counts[row.reason] = Number(counts[row.reason] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

function candidateStatusCounts(rows = []) {
  const counts = {};
  for (const row of rows) {
    const status = text(row?.status).toLowerCase() || "unknown";
    counts[status] = Number(counts[status] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right)));
}

/**
 * Scope immutable saved plans to the remint attempts which can still render or
 * release. When the queue is absent (older installations and isolated fixture
 * runs), retain the historical behavior of auditing every non-terminal plan.
 */
export function loadSavedMintPlanAudit({ plansRoot, queuePath } = {}) {
  const resolvedPlansRoot = path.resolve(plansRoot || ".");
  const resolvedQueuePath = path.resolve(queuePath || path.join(path.dirname(resolvedPlansRoot), "remint-queue.json"));
  let queue = null;
  let queueProof = null;
  let queueStatus = "missing";
  let queueError = null;
  if (fs.existsSync(resolvedQueuePath)) {
    try {
      const fileProof = stableFileSourceProof(resolvedQueuePath, "Song Card remint queue");
      queueProof = compactSourceProof(fileProof);
      queue = JSON.parse(fileProof.bytes.toString("utf8"));
      if (!queue || typeof queue !== "object" || !Array.isArray(queue.candidates) && !(queue.candidates && typeof queue.candidates === "object")) {
        throw new Error("The remint queue does not contain a candidates collection.");
      }
      queueStatus = "loaded";
    } catch (error) {
      queue = null;
      queueStatus = "invalid-fallback";
      queueError = safeErrorMessage(error);
    }
  }

  const candidates = remintQueueCandidates(queue);
  const activeQueueCandidates = candidates.filter(isActiveMintPlanCandidate);
  const archivalQueueCandidates = candidates.filter((candidate) => !isActiveMintPlanCandidate(candidate));
  const activePlanIds = new Set(activeQueueCandidates.map(candidatePlanId).filter(Boolean));
  const planEntries = jsonFiles(resolvedPlansRoot).map((planPath) => {
    let plan = null;
    let sourceProof = null;
    let parseError = null;
    const basenameId = normalizedPlanId(path.basename(planPath, ".json"));
    const shouldParse = queueStatus === "missing" || activePlanIds.has(basenameId);
    if (shouldParse) {
      try {
        const parsedProof = stableJsonSourceProof(planPath, "Saved mint plan");
        plan = parsedProof.value;
        sourceProof = compactSourceProof(parsedProof);
        const declaredIds = [normalizedPlanId(plan?.id), normalizedPlanId(plan?.planId)].filter(Boolean);
        if (declaredIds.some((declaredId) => declaredId !== basenameId)) {
          parseError = `Saved mint plan identity does not match its immutable filename (${basenameId}).`;
        }
      } catch (error) {
        parseError = safeErrorMessage(error);
      }
    }
    const planId = basenameId;
    const aliases = new Set([
      planId,
      basenameId,
      normalizedPlanId(plan?.id),
      normalizedPlanId(plan?.planId),
    ].filter(Boolean));
    return { planPath, plan, sourceProof, planId, aliases, parseError, loaded: shouldParse };
  });

  const activeEntries = [];
  const archivalEntries = [];
  const missingActivePlans = [];
  const unboundActiveCandidates = [];
  const activeRows = [];
  const archivalRows = [];
  if (queueStatus === "missing") {
    for (const entry of planEntries) {
      const planStatus = text(entry.plan?.status).toLowerCase();
      if (planStatus && ARCHIVAL_MINT_PLAN_STATUSES.has(planStatus)) {
        archivalEntries.push(entry);
        archivalRows.push(planAuditPublicRow(entry, { reason: `terminal-plan-status:${planStatus}` }));
      } else {
        activeEntries.push(entry);
        activeRows.push(planAuditPublicRow(entry, {
          reason: entry.parseError ? "legacy-runnable-scan:invalid-plan" : "legacy-runnable-scan",
        }));
      }
    }
  } else if (queue) {
    const entriesByAlias = new Map();
    for (const entry of planEntries) {
      for (const alias of entry.aliases) {
        const matching = entriesByAlias.get(alias) || [];
        matching.push(entry);
        entriesByAlias.set(alias, matching);
      }
    }
    const candidatesByEntry = new Map(planEntries.map((entry) => [entry, []]));
    const activeCandidates = [];
    for (const candidate of candidates) {
      const status = text(candidate?.status).toLowerCase();
      const isActive = isActiveMintPlanCandidate(candidate);
      const planId = candidatePlanId(candidate);
      if (isActive) activeCandidates.push(candidate);
      if (!planId) {
        if (isActive) unboundActiveCandidates.push({
          candidateId: text(candidate?.id) || null,
          candidateStatus: status || "unknown",
          reason: "active-candidate-plan-id-missing",
        });
        continue;
      }
      for (const entry of entriesByAlias.get(planId) || []) candidatesByEntry.get(entry).push(candidate);
    }

    for (const entry of planEntries) {
      const candidateRows = candidatesByEntry.get(entry) || [];
      const activeCandidateRows = candidateRows.filter(isActiveMintPlanCandidate);
      if (activeCandidateRows.length) {
        const hasUnknownStatus = activeCandidateRows.some((candidate) => !ACTIVE_MINT_PLAN_CANDIDATE_STATUSES.has(text(candidate?.status).toLowerCase()));
        activeEntries.push(entry);
        activeRows.push(planAuditPublicRow(entry, {
          reason: hasUnknownStatus ? "unknown-candidate-status-fail-closed" : "active-candidate",
          candidateRows: activeCandidateRows,
        }));
      } else {
        archivalEntries.push(entry);
        archivalRows.push(planAuditPublicRow(entry, {
          reason: candidateRows.length ? "terminal-candidate" : "unreferenced-plan",
          candidateRows,
        }));
      }
    }

    const presentPlanIds = new Set(planEntries.flatMap((entry) => [...entry.aliases]));
    const missingByPlanId = new Map();
    for (const candidate of activeCandidates) {
      const planId = candidatePlanId(candidate);
      if (!planId || presentPlanIds.has(planId)) continue;
      const row = missingByPlanId.get(planId) || { planId, candidates: [] };
      row.candidates.push(candidate);
      missingByPlanId.set(planId, row);
    }
    for (const row of missingByPlanId.values()) {
      missingActivePlans.push({
        planId: row.planId,
        candidateIds: row.candidates.map((candidate) => text(candidate?.id)).filter(Boolean).sort(),
        candidateStatuses: [...new Set(row.candidates.map((candidate) => text(candidate?.status).toLowerCase() || "unknown"))].sort(),
        reason: "active-candidate-plan-file-missing",
      });
    }
  }

  const report = {
    schemaVersion: "hapa.echo.saved-mint-plan-audit.v1",
    mode: queue ? "queue-aware" : queueStatus === "invalid-fallback" ? "invalid-queue-fail-closed" : "legacy-runnable-plan-scan",
    queue: {
      path: resolvedQueuePath,
      status: queueStatus,
      schemaVersion: text(queue?.schemaVersion) || null,
      candidateCount: candidates.length,
      activeCandidateCount: activeQueueCandidates.length,
      archivalCandidateCount: archivalQueueCandidates.length,
      activeCandidateStatusCounts: candidateStatusCounts(activeQueueCandidates),
      archivalCandidateStatusCounts: candidateStatusCounts(archivalQueueCandidates),
      sourceSha256: queueProof?.sha256 || null,
      ...(queueError ? { error: queueError } : {}),
    },
    planFileCount: planEntries.length,
    activePlanCount: activeEntries.length,
    archivalPlanCount: archivalEntries.length,
    missingActivePlanCount: missingActivePlans.length,
    unboundActiveCandidateCount: unboundActiveCandidates.length,
    activePlans: activeRows,
    archivalPlans: archivalRows,
    missingActivePlans,
    unboundActiveCandidates,
    activeReasonCounts: reasonCounts(activeRows),
    archivalReasonCounts: reasonCounts(archivalRows),
  };
  return {
    report,
    activeEntries,
    archivalEntries,
    missingActivePlans,
    unboundActiveCandidates,
    planEntries,
    queueProof,
  };
}

function readableFile(filePath) {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size <= 0) return false;
    const descriptor = fs.openSync(filePath, "r");
    try {
      const firstByte = Buffer.alloc(1);
      return fs.readSync(descriptor, firstByte, 0, 1, 0) === 1;
    } finally {
      fs.closeSync(descriptor);
    }
  } catch {
    return false;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function sha256Value(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;
}

function fileStatIdentity(filePath) {
  try {
    const stat = fs.statSync(filePath);
    return {
      path: path.resolve(filePath),
      device: Number(stat.dev),
      inode: Number(stat.ino),
      size: Number(stat.size),
      mtimeMs: Number(stat.mtimeMs),
      ctimeMs: Number(stat.ctimeMs),
    };
  } catch {
    return { path: text(filePath) || null, missing: true };
  }
}

function exactFileSetStatSignature(filePaths = []) {
  const rows = [...new Set(list(filePaths).map((filePath) => path.resolve(text(filePath))).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => {
      try {
        const stat = fs.statSync(filePath, { bigint: true });
        return {
          path: filePath,
          stat: stat.isFile() ? {
            dev: String(stat.dev),
            ino: String(stat.ino),
            size: String(stat.size),
            mtimeNs: String(stat.mtimeNs),
            ctimeNs: String(stat.ctimeNs),
          } : null,
        };
      } catch {
        return { path: filePath, stat: null };
      }
    });
  return sha256Value(rows);
}

function shaderCatalogSourceFiles(catalog = {}) {
  return [
    catalog?.manifestPath,
    catalog?.runtime?.filePath,
    catalog?.pixelGatePath,
    ...list(catalog?.records).map((record) => record?.filePath),
  ].filter(Boolean);
}

function sha256File(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

export function executionVisualMediaPreflightInputs(mediaPreflight = {}, {
  runtimeRouteContext = {},
  resolveRuntimeUri = resolveEchoRuntimeMediaUri,
} = {}) {
  const sourceEntries = list(mediaPreflight?.entries);
  const runtimeEntries = [];
  const routeFailures = [];
  const seenRuntimeInputs = new Set();
  const seenRouteFailures = new Set();
  for (const entry of sourceEntries) {
    if (entry?.generated === true) continue;
    const runtimeUri = text(entry?.runtimeUri);
    if (!runtimeUri) continue;
    const route = resolveRuntimeUri(runtimeUri, runtimeRouteContext);
    if (!route?.ok || !text(route?.resolvedPath)) {
      const key = `${runtimeUri}\u0000${text(route?.reason)}`;
      if (seenRouteFailures.has(key)) continue;
      seenRouteFailures.add(key);
      routeFailures.push({
        ok: false,
        code: "visual-runtime-route-unverified",
        path: text(route?.resolvedPath) || null,
        kind: text(entry?.type) || "video",
        runtimeUri,
        route: text(route?.route) || null,
        reason: text(route?.reason) || "runtime-uri-unresolved",
        message: `The runtime visual route could not be verified: ${runtimeUri} (${text(route?.reason) || "unresolved"}).`,
      });
      continue;
    }
    const runtimePath = path.resolve(route.resolvedPath);
    const key = [
      runtimePath,
      text(entry?.type),
      entry?.allowBlank === true ? "allow-blank" : "visible-required",
      text(entry?.samplingPolicy),
    ].join("\u0000");
    if (seenRuntimeInputs.has(key)) continue;
    seenRuntimeInputs.add(key);
    runtimeEntries.push({
      ...entry,
      resolvedPath: runtimePath,
      runtimeRoute: text(route?.route) || null,
      executionInputRole: "runtime-visual",
    });
  }
  return {
    source: { ...mediaPreflight, entries: sourceEntries },
    runtime: {
      schemaVersion: "hapa.hyperframes.runtime-media-preflight-inputs.v1",
      ok: routeFailures.length === 0,
      entries: runtimeEntries,
      failures: routeFailures,
    },
  };
}

export async function preflightExecutionVisualMedia(mediaPreflight = {}, {
  concurrency = 4,
  runtimeRouteContext = {},
  resolveRuntimeUri = resolveEchoRuntimeMediaUri,
  preflight = preflightResolvedVisualMedia,
} = {}) {
  const inputs = executionVisualMediaPreflightInputs(mediaPreflight, { runtimeRouteContext, resolveRuntimeUri });
  // Keep one bounded decoder pool across source masters and browser-ready
  // runtime proxies. Launching a pool for each class would double the process
  // and memory ceiling for saved plans with distinct runtime materializations.
  const decoded = await preflight({
    schemaVersion: "hapa.hyperframes.execution-media-preflight-inputs.v1",
    entries: [...list(inputs.source?.entries), ...list(inputs.runtime?.entries)],
  }, { concurrency });
  const entriesByEvidence = new Map();
  for (const entry of [...list(decoded?.entries), ...list(inputs.runtime?.failures)]) {
    const key = text(entry?.evidence?.signatureKey) || [
      text(entry?.code),
      text(entry?.path),
      text(entry?.runtimeUri),
      text(entry?.reason),
    ].join("\u0000");
    if (!entriesByEvidence.has(key)) entriesByEvidence.set(key, entry);
  }
  const entries = [...entriesByEvidence.values()];
  const failures = entries.filter((entry) => entry?.ok !== true);
  return {
    schemaVersion: "hapa.song-card.execution-visual-media-decode-preflight.v1",
    ok: failures.length === 0,
    uniqueInputCount: entries.length,
    verifiedInputCount: entries.length - failures.length,
    blockedInputCount: failures.length,
    entries,
    failures,
    sourceInputCount: new Set(list(inputs.source?.entries).map((entry) => text(entry?.resolvedPath)).filter(Boolean)).size,
    runtimeInputCount: new Set(list(inputs.runtime?.entries).map((entry) => text(entry?.resolvedPath)).filter(Boolean)).size,
  };
}

export function visualExecutionInputEvidence(entries = [], category = "visual", mediaEntries = [], {
  runtimeRouteContext = {},
  resolveRuntimeUri = resolveEchoRuntimeMediaUri,
} = {}) {
  const routesByPath = new Map();
  for (const mediaEntry of list(mediaEntries)) {
    const effectiveUri = text(mediaEntry?.runtimeUri || mediaEntry?.originalUri);
    if (!effectiveUri) continue;
    const route = resolveRuntimeUri(effectiveUri, runtimeRouteContext);
    if (!route?.ok || !text(route?.resolvedPath)) continue;
    const key = path.resolve(route.resolvedPath);
    const rows = routesByPath.get(key) || [];
    if (!rows.some((row) => row.uri === effectiveUri)) rows.push({
      uri: effectiveUri,
      source: text(mediaEntry?.runtimeUri) ? "runtime-uri" : "original-uri",
      route: text(route?.route) || null,
    });
    routesByPath.set(key, rows);
  }
  const rows = [];
  const seen = new Set();
  for (const entry of list(entries)) {
    if (entry?.ok !== true) continue;
    const candidatePath = text(entry?.path);
    if (!candidatePath) continue;
    const resolvedPath = path.resolve(candidatePath);
    const identity = entry?.evidence?.fileIdentity || {};
    const signatureKey = text(entry?.evidence?.signatureKey);
    if (!resolvedPath || identity?.readable !== true || !signatureKey) continue;
    const routeBindings = category === "visual-media" ? (routesByPath.get(resolvedPath) || []) : [];
    const inputClass = category === "visual-media"
      ? routeBindings.length ? "visual-media" : "visual-media-source"
      : category;
    const statIdentityKey = [
      `hapa.echo.${inputClass}-input.v1`,
      resolvedPath,
      String(identity.dev),
      String(identity.ino),
      Number(identity.size),
      Number(identity.mtimeMs),
      Number(identity.ctimeMs),
    ].join("\u0000");
    const key = `${resolvedPath}\u0000${signatureKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      kind: text(entry?.kind) || category,
      inputClass,
      path: resolvedPath,
      signatureKey,
      statIdentityKey,
      routeBindings,
    });
  }
  return rows.sort((left, right) => `${left.kind}:${left.path}`.localeCompare(`${right.kind}:${right.path}`));
}

function assertExactStatEvidenceFresh(rows = [], label = "execution input") {
  for (const entry of list(rows)) {
    const identity = text(entry?.statIdentityKey).split("\u0000");
    const resolvedPath = path.resolve(text(entry?.path));
    if (identity.length !== 7 || !resolvedPath) throw new Error(`${label} evidence is malformed.`);
    const current = fs.statSync(resolvedPath);
    if (!current.isFile() || current.size <= 0) throw new Error(`${label} is no longer a readable file: ${resolvedPath}`);
    const currentKey = [
      identity[0],
      resolvedPath,
      String(current.dev),
      String(current.ino),
      Number(current.size),
      Number(current.mtimeMs),
      Number(current.ctimeMs),
    ].join("\u0000");
    if (currentKey !== entry.statIdentityKey) throw new Error(`${label} changed before execution graph activation: ${resolvedPath}`);
  }
}

function assertRuntimeRouteEvidenceFresh(rows = [], runtimeRouteContext = {}, label = "Runtime media") {
  for (const entry of list(rows)) {
    const resolvedPath = path.resolve(text(entry?.path));
    const routeBindings = list(entry?.routeBindings);
    if (!resolvedPath || !routeBindings.length) throw new Error(`${label} route evidence is malformed.`);
    for (const binding of routeBindings) {
      const route = resolveEchoRuntimeMediaUri(text(binding?.uri), runtimeRouteContext);
      if (!route?.ok) {
        throw new Error(`${label} runtime route is no longer resolvable: ${text(binding?.uri) || "(missing URI)"}.`);
      }
      if (text(binding?.route) && route.route !== text(binding.route)) {
        throw new Error(`${label} runtime route class changed before execution graph activation: ${text(binding?.uri)}.`);
      }
      if (path.resolve(route.resolvedPath) !== resolvedPath) {
        throw new Error(`${label} runtime route changed before execution graph activation: ${text(binding?.uri)}.`);
      }
    }
  }
}

export function safePathSegment(value) {
  const candidate = text(value);
  return candidate
    && candidate !== "."
    && candidate !== ".."
    && path.basename(candidate) === candidate
    && !candidate.includes("/")
    && !candidate.includes("\\")
    ? candidate
    : "";
}

function safeErrorMessage(error) {
  return text(error?.message || error || "Unknown error").replace(/\s+/gu, " ").slice(0, 500);
}

function invalidCutResult({
  songId = "unknown-song",
  songTitle = "Unreadable project",
  cutId = "base",
  cutTitle = "Base project",
  cutKind = "base",
  sourcePath = null,
  code = "render-readiness-input-invalid",
  stage = "input",
  message = "The cut could not be inspected.",
  details = null,
} = {}) {
  return {
    songId: text(songId) || "unknown-song",
    songTitle: text(songTitle) || "Unreadable project",
    cutId: text(cutId) || "base",
    cutTitle: text(cutTitle) || "Unreadable cut",
    cutKind: text(cutKind) || "base",
    sourcePath: sourcePath ? path.resolve(sourcePath) : null,
    ok: false,
    status: "blocked",
    fingerprint: null,
    master: { ok: false, registryId: null, path: null, reason: "not-inspected" },
    counts: {
      mediaDeclared: 0,
      mediaGenerated: 0,
      mediaResolved: 0,
      verifiedStems: 0,
      verifiedAudioInputs: 0,
      verifiedStemTelemetryResources: 0,
      verifiedVisualMediaInputs: 0,
      verifiedProxyAtlasInputs: 0,
      visualizerCues: 0,
      exactVisualizerCues: 0,
      semanticSamples: 0,
      proxyAssets: 0,
    },
    blockers: [{ code, stage, message, ...(details ? { details } : {}) }],
    checks: {},
  };
}

function variantPayloadRows(payload = {}) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  if (Array.isArray(payload.direction_script_variants)) return payload.direction_script_variants;
  return [variantOf(payload)];
}

export function loadSavedVariantRows({ baseProject = {}, projectPath, projectProof = null, variantsRoot, songId }) {
  const rows = [];
  const invalid = [];
  const byId = new Map();
  const add = ({ variant, sourcePath, sourceProof = null, sourceKind, ordinal, fallbackId = "" }) => {
    const id = echoDirectionVariantId(variant) || text(fallbackId);
    if (!variant || typeof variant !== "object" || !id) {
      invalid.push(invalidCutResult({
        songId,
        songTitle: text(baseProject.song_title),
        cutId: sourceKind === "embedded" ? `embedded-${ordinal + 1}` : path.basename(sourcePath || "invalid-cut", ".json"),
        cutTitle: "Invalid saved direction cut",
        cutKind: "saved-variant",
        sourcePath,
        code: "saved-cut-id-missing",
        stage: "variant-input",
        message: "A saved direction cut has no stable variant ID, so production cannot select it deterministically.",
      }));
      return;
    }
    if (byId.has(id)) {
      const existing = byId.get(id);
      if (existing.sourceKind === sourceKind) {
        invalid.push(invalidCutResult({
          songId,
          songTitle: text(baseProject.song_title),
          cutId: id,
          cutTitle: "Duplicate saved direction cut",
          cutKind: "saved-variant",
          sourcePath,
          code: "duplicate-saved-cut-id",
          stage: "variant-input",
          message: `More than one ${sourceKind} direction cut declares ID ${id}; production selection would be ambiguous.`,
          details: { firstSourcePath: existing.sourcePath, duplicateSourcePath: sourcePath },
        }));
      }
      return;
    }
    const normalizedVariant = sourceKind === "sidecar"
      ? {
        ...variant,
        id,
        variant_source: {
          ...(variant.variant_source || {}),
          kind: "append-only-project-variant",
          path: path.relative(ROOT, sourcePath),
          nonDestructive: true,
        },
      }
      : variant;
    const row = { id, variant: normalizedVariant, sourcePath, sourceProof: compactSourceProof(sourceProof), sourceKind };
    byId.set(id, row);
    rows.push(row);
  };

  // Production indexes append-only sidecars first, then uses embedded cuts only
  // when their ID is not already represented by a sidecar.
  for (const variantPath of jsonFiles(path.join(variantsRoot, songId))) {
    try {
      const sourceProof = stableJsonSourceProof(variantPath, "Saved direction cut");
      const payload = sourceProof.value;
      const variants = variantPayloadRows(payload);
      if (!variants.length) throw new Error("The saved-cut file contains no direction variant.");
      const fileId = path.basename(variantPath, ".json");
      variants.forEach((variant, ordinal) => add({
        variant,
        sourcePath: variantPath,
        sourceProof,
        sourceKind: "sidecar",
        ordinal,
        fallbackId: `${fileId}${ordinal ? `-${ordinal + 1}` : ""}`,
      }));
    } catch (error) {
      invalid.push(invalidCutResult({
        songId,
        songTitle: text(baseProject.song_title),
        cutId: path.basename(variantPath, ".json"),
        cutTitle: "Unreadable saved direction cut",
        cutKind: "saved-variant",
        sourcePath: variantPath,
        code: "invalid-saved-cut-json",
        stage: "variant-input",
        message: safeErrorMessage(error),
      }));
    }
  }
  list(baseProject.direction_script_variants).forEach((variant, ordinal) => {
    add({ variant, sourcePath: projectPath, sourceProof: projectProof, sourceKind: "embedded", ordinal });
  });
  return { rows, invalid };
}

const VALUE_OPTIONS = new Set([
  "avatar-root",
  "projects",
  "variants",
  "album",
  "music-viz-root",
  "proxy-registry",
  "registry",
  "songbook",
  "report",
  "plans",
  "remint-queue",
  "visual-probe-cache",
  "audio-probe-cache",
  "telemetry-cache",
  "project",
  "variant",
  "plan",
]);
const BOOLEAN_OPTIONS = new Set(["apply-stem-repairs", "skip-mint-plans", "help"]);
const BOOLEAN_VALUES = new Map([
  ["1", true], ["true", true], ["yes", true], ["0", false], ["false", false], ["no", false],
]);
const SAFE_REQUESTED_PLAN_ID = /^plan:[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u;

function cliUsage() {
  return [
    "Usage: node scripts/preflight-echo-render-readiness.mjs [options]",
    "",
    "Audit and optionally publish certified Echo execution graphs.",
    "",
    "Selection: --project <file> [--variant <id>] | --plan <plan:id>",
    "Mutation:  --apply-stem-repairs [true|false] --skip-mint-plans [true|false]",
    "Paths:     --avatar-root, --projects, --variants, --album, --music-viz-root,",
    "           --proxy-registry, --registry, --songbook, --plans, --remint-queue, --report,",
    "           --visual-probe-cache, --audio-probe-cache, --telemetry-cache",
    "Help:      --help",
  ].join("\n");
}

export function parseEchoRenderReadinessArgs(argv = []) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = String(argv[index] || "");
    if (!arg.startsWith("--") || arg === "--") throw new Error(`Unexpected positional argument: ${arg || "(empty)"}.`);
    const separator = arg.indexOf("=");
    const name = separator >= 0 ? arg.slice(2, separator) : arg.slice(2);
    if (!VALUE_OPTIONS.has(name) && !BOOLEAN_OPTIONS.has(name)) throw new Error(`Unknown option: --${name || "(empty)"}.`);
    if (Object.hasOwn(options, name)) throw new Error(`Duplicate option: --${name}.`);
    if (VALUE_OPTIONS.has(name)) {
      const value = separator >= 0 ? arg.slice(separator + 1) : argv[++index];
      if (typeof value !== "string" || !value.trim() || value.startsWith("--")) {
        throw new Error(`Option --${name} requires a non-empty value.`);
      }
      options[name] = value;
      continue;
    }
    if (separator >= 0) {
      const normalized = arg.slice(separator + 1).trim().toLowerCase();
      if (!BOOLEAN_VALUES.has(normalized)) throw new Error(`Option --${name} requires true or false.`);
      options[name] = BOOLEAN_VALUES.get(normalized);
      continue;
    }
    const possibleBoolean = String(argv[index + 1] || "").trim().toLowerCase();
    if (BOOLEAN_VALUES.has(possibleBoolean)) {
      options[name] = BOOLEAN_VALUES.get(possibleBoolean);
      index += 1;
    } else {
      options[name] = true;
    }
  }
  if (options.plan && (options.project || options.variant)) {
    throw new Error("Option --plan cannot be combined with --project or --variant.");
  }
  if (options.plan && options["skip-mint-plans"] === true) {
    throw new Error("Option --plan cannot be combined with --skip-mint-plans=true.");
  }
  if (options.variant && !options.project) {
    throw new Error("Option --variant requires one explicit --project.");
  }
  if (options.plan && !SAFE_REQUESTED_PLAN_ID.test(options.plan)) {
    throw new Error(`Option --plan requires a safe plan identity; received ${options.plan}.`);
  }
  return options;
}

function atomicJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
    fs.renameSync(temporary, filePath);
  } finally {
    fs.rmSync(temporary, { force: true });
  }
}

export function acquireEchoReadinessCertificationLock({
  avatarRoot = ROOT,
  staleLegacyMs = ECHO_READINESS_LEGACY_LOCK_STALE_MS,
} = {}) {
  const lockPath = path.join(path.resolve(avatarRoot), "artifacts", "echo-render-readiness", ".certification.lock");
  let owner;
  try {
    owner = acquireOwnedFileLock({
      lockPath,
      schemaVersion: ECHO_READINESS_CERTIFICATION_LOCK_SCHEMA,
      staleLegacyMs,
    });
  } catch (error) {
    if (error?.code === "OWNED_FILE_LOCK_BUSY") {
      const ownerPid = Number(error?.details?.ownerPid || 0) || null;
      throw new Error(`Another render-readiness certification is already running${ownerPid ? ` (process ${ownerPid})` : ""} (${error?.details?.reason || "lock-busy"}).`);
    }
    if (error?.code === "OWNED_FILE_LOCK_PATH_INVALID") {
      throw new Error(`The readiness certification lock is not a regular file: ${safeErrorMessage(error)}`);
    }
    throw error;
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    releaseOwnedFileLock(owner);
  };
}

function registryMaster(project, graph, registryById, songbookBySongId, runtimeRouteContext = {}) {
  const selectedAudioRoute = echoProjectAudioRoute(project, graph);
  const selectedId = text(selectedAudioRoute.id);
  const resolvedRegistryId = songbookBySongId.get(selectedId) || selectedId;
  const song = registryById.get(resolvedRegistryId) || null;
  const filePath = text(song?.localPath);
  const absolute = Boolean(filePath && path.isAbsolute(filePath));
  const readable = Boolean(absolute && readableFile(filePath));
  const runtimeUri = text(selectedAudioRoute.uri);
  const runtimeRoute = resolveEchoRuntimeMediaUri(runtimeUri, runtimeRouteContext);
  const routeMatches = Boolean(
    runtimeRoute?.ok
    && runtimeRoute?.route === "song-registry-api"
    && filePath
    && path.resolve(runtimeRoute.resolvedPath) === path.resolve(filePath),
  );
  return {
    ok: readable && routeMatches,
    registryId: text(song?.id) || null,
    path: filePath || null,
    runtimeUri: runtimeUri || null,
    runtimeRoute: runtimeRoute?.route || null,
    runtimeRouteSource: selectedAudioRoute.source || null,
    reason: !readable
      ? filePath && !absolute ? "registry-master-path-not-absolute" : "registry-master-unavailable"
      : !runtimeUri ? "registry-master-runtime-uri-missing"
      : !runtimeRoute?.ok ? runtimeRoute?.reason || "registry-master-runtime-route-unresolved"
      : runtimeRoute?.route !== "song-registry-api" ? "registry-master-runtime-route-not-preview-safe"
      : !routeMatches ? "registry-master-runtime-route-mismatch"
      : "registry-master-readable-and-route-bound",
  };
}

function stemBindingRepairHealth(stemBindingRepair = null) {
  const receipt = stemBindingRepair?.receipt || stemBindingRepair;
  if (!receipt) return { ok: true, inspected: false, blockedCount: 0, unmeasuredCount: 0, status: "not-applicable" };
  const statuses = list(receipt.decisions).map((entry) => text(entry?.decision?.status || entry?.status));
  const blockedCount = Math.max(
    Number(receipt.blockedDecisionCount || 0),
    statuses.filter((status) => status.startsWith("blocked-") || status === "blocked").length,
  );
  const unmeasuredCount = statuses.filter((status) => status.includes("unmeasured") || status.includes("unverified")).length;
  const ok = receipt.status !== "blocked" && blockedCount === 0 && unmeasuredCount === 0;
  return { ok, inspected: true, blockedCount, unmeasuredCount, status: text(receipt.status) || null };
}

export function buildExecutionTelemetryEvidence({ analysis = null, analyzerScriptSha256 = null } = {}) {
  return {
    cacheIdentitySha256: analysis?.cache?.identitySha256 || null,
    bundleSha256: analysis?.cache?.bundleSha256 || null,
    analyzerScriptSha256,
    schemaVersion: analysis?.noOp
      ? "hapa.echo.no-stem-telemetry-proof.v1"
      : text(analysis?.telemetry?.schemaVersion) || null,
    analysisVersion: analysis?.noOp
      ? "not-required"
      : text(analysis?.telemetry?.analysisVersion) || null,
    truthStatus: analysis?.noOp
      ? "not-required-no-audio-reactive-stem-bindings"
      : text(analysis?.telemetry?.truthStatus) || null,
    fps: Number(analysis?.telemetry?.fps || 0),
    sampleRate: Number(analysis?.telemetry?.sampleRate || 0),
  };
}

function compactCutResult({ descriptor, project, graph, master, audio, stemTelemetry, stemBindingRepair, stemRegistryLineage, signal, media, visualMedia, proxyImages, readiness, rendererBuildSha256, proxyRegistrySha256, songRegistrySha256 }) {
  const stemBindingHealth = stemBindingRepairHealth(stemBindingRepair);
  const blockers = [
    ...(!master.ok ? [{ stage: "master-audio", code: master.reason }] : []),
    ...list(audio?.failures).map((failure) => ({
      stage: failure.kind === "master" ? "master-audio" : "stem-audio",
      code: failure.code,
      message: failure.message,
      details: { path: failure.path, id: failure.id, role: failure.role },
    })),
    ...list(stemTelemetry?.findings).map((finding) => ({
      stage: "stem-telemetry",
      code: finding.code,
      message: finding.message,
      details: { role: finding.role || null, signal: finding.signal || null },
    })),
    ...list(stemRegistryLineage?.findings).map((finding) => ({
      stage: "stem-registry-lineage",
      code: finding.code,
      message: finding.message,
      details: { path: finding.graphPath || finding.observedPath || null, stemId: finding.stemId || null, role: finding.role || null },
    })),
    ...(!stemBindingHealth.ok ? [{
      stage: "stem-binding-repair",
      code: "stem-binding-repair-not-publishable",
      message: "The repaired graph still contains blocked or unmeasured audio-reactive stem bindings.",
      details: stemBindingHealth,
    }] : []),
    ...list(visualMedia?.failures).map((failure) => ({
      stage: "visual-media-decode",
      code: failure.code,
      message: failure.message,
      details: { path: failure.path, kind: failure.kind },
    })),
    ...list(proxyImages?.failures).map((failure) => ({
      stage: "proxy-atlas-decode",
      code: failure.code,
      message: failure.message,
      details: { path: failure.path, width: failure.width, height: failure.height },
    })),
    ...list(readiness.blockers),
  ];
  const checks = readiness.ok ? {
    compiler: readiness.checks?.compiler || null,
    inspection: readiness.checks?.inspection || null,
    signalGraph: readiness.checks?.signalGraph || null,
    media: readiness.checks?.media || null,
    visualizers: readiness.checks?.visualizers || null,
    proxyAssets: {
      ok: readiness.checks?.proxyAssets?.ok === true,
      uniqueAssetCount: Number(readiness.checks?.proxyAssets?.uniqueAssetCount || 0),
      resolvedAssetCount: Number(readiness.checks?.proxyAssets?.resolvedAssetCount || 0),
    },
    runtime: {
      ok: readiness.checks?.runtime?.ok === true,
      sampleCount: Number(readiness.checks?.runtime?.sampleCount || 0),
      overlapSignatureCount: Number(readiness.checks?.runtime?.overlapSignatureCount || 0),
      evaluatedLayerCount: Number(readiness.checks?.runtime?.evaluatedLayerCount || 0),
    },
  } : readiness.checks || {};
  const certificateSha256 = sha256Value({
    schemaVersion: "hapa.echo.render-readiness-certificate.v1",
    readinessFingerprint: readiness.fingerprint || null,
    master: {
      registryId: master.registryId || null,
      path: master.path || null,
      contentSha256: audio?.entries?.find((entry) => entry.kind === "master")?.contentSha256 || null,
    },
    audio: list(audio?.entries).map((entry) => ({
      id: entry.id,
      role: entry.role,
      statIdentityKey: entry.cache?.statIdentityKey || null,
      contentSha256: entry.contentSha256 || null,
      producer: entry.producer?.id || null,
      durationValidation: entry.durationValidation || null,
      signalContract: entry.signalContract || null,
    })).sort((left, right) => `${left.role}:${left.id}`.localeCompare(`${right.role}:${right.id}`)),
    stemTelemetry: {
      identitySha256: stemTelemetry?.cache?.identitySha256 || null,
      bundleSha256: stemTelemetry?.cache?.bundleSha256 || null,
      requiredRoles: stemTelemetry?.bindings?.requiredRoles || [],
    },
    visualMedia: list(visualMedia?.entries).map((entry) => entry?.evidence?.signatureKey).filter(Boolean).sort(),
    proxyAtlases: list(proxyImages?.entries).map((entry) => entry?.evidence?.signatureKey).filter(Boolean).sort(),
    rendererBuildSha256: text(rendererBuildSha256) || null,
    proxyRegistrySha256: text(proxyRegistrySha256) || null,
    songRegistrySha256: text(songRegistrySha256) || null,
    mintPlanCompatibility: descriptor.mintPlanCompatibility || null,
  });
  return {
    songId: descriptor.songId,
    songTitle: text(project.song_title || graph?.song?.title) || descriptor.songTitle,
    cutId: descriptor.cutId,
    cutTitle: descriptor.cutTitle,
    cutKind: descriptor.cutKind,
    cutFingerprint: descriptor.cutFingerprint || null,
    sourcePath: descriptor.sourcePath,
    ok: blockers.length === 0,
    status: blockers.length ? "blocked" : "ready-no-known-blockers",
    fingerprint: certificateSha256,
    readinessFingerprint: readiness.fingerprint || null,
    certificateSha256,
    ...(descriptor.mintPlanCompatibility ? { mintPlanCompatibility: descriptor.mintPlanCompatibility } : {}),
    master,
    counts: {
      mediaDeclared: Number(media.declaredCount || 0),
      mediaGenerated: Number(media.generatedCount || 0),
      mediaResolved: Number(media.resolvedCount || 0),
      verifiedStems: Number(signal.verifiedStemCount || 0),
      verifiedAudioInputs: Number(audio?.verifiedUniqueInputCount || 0),
      verifiedStemTelemetryResources: stemTelemetry?.ok === true ? Number(stemTelemetry?.summary?.analyzedResourceCount || 0) : 0,
      verifiedVisualMediaInputs: Number(visualMedia?.verifiedInputCount || 0),
      verifiedProxyAtlasInputs: Number(proxyImages?.verifiedInputCount || 0),
      visualizerCues: Number(readiness.counts?.visualizerCueCount ?? signal.visualizerCount ?? 0),
      exactVisualizerCues: Number(readiness.counts?.exactVisualizerCueCount || 0),
      semanticSamples: Number(readiness.counts?.semanticSampleCount || 0),
      proxyAssets: Number(readiness.counts?.uniqueProxyAssetCount || 0),
    },
    blockers,
    checks: {
      ...checks,
      audio: audio ? {
        ok: audio.ok,
        expectedDurationSeconds: audio.expectedDurationSeconds,
        declaredInputCount: audio.declaredInputCount,
        uniqueInputCount: audio.uniqueInputCount,
        verifiedInputCount: audio.verifiedInputCount,
        verifiedUniqueInputCount: audio.verifiedUniqueInputCount,
        blockedInputCount: audio.blockedInputCount,
        ignoredInputCount: audio.ignoredInputCount,
        failures: audio.failures,
      } : { ok: false, declaredInputCount: 0, verifiedInputCount: 0, blockedInputCount: 1, failures: [] },
      stemTelemetry: stemTelemetry ? {
        ok: stemTelemetry.ok,
        cache: stemTelemetry.cache || null,
        requiredRoles: stemTelemetry.bindings?.requiredRoles || [],
        analyzedResourceCount: Number(stemTelemetry.summary?.analyzedResourceCount || 0),
        frameCount: Number(stemTelemetry.summary?.frameCount || 0),
        findings: stemTelemetry.findings || [],
      } : { ok: false, findings: [{ code: "stem-telemetry-not-inspected" }] },
      stemBindingRepair: stemBindingHealth,
      stemRegistryLineage: stemRegistryLineage ? {
        ok: stemRegistryLineage.ok,
        masterId: stemRegistryLineage.master?.id || null,
        graphStemCount: Number(stemRegistryLineage.graphStemCount || 0),
        verifiedStemCount: Number(stemRegistryLineage.verifiedStemCount || 0),
        findings: stemRegistryLineage.findings || [],
      } : { ok: false, findings: [{ code: "stem-registry-lineage-not-inspected" }] },
      visualMedia: visualMedia ? {
        ok: visualMedia.ok,
        uniqueInputCount: visualMedia.uniqueInputCount,
        verifiedInputCount: visualMedia.verifiedInputCount,
        blockedInputCount: visualMedia.blockedInputCount,
        failures: visualMedia.failures,
      } : { ok: true, uniqueInputCount: 0, verifiedInputCount: 0, blockedInputCount: 0, failures: [] },
      proxyImages: proxyImages ? {
        ok: proxyImages.ok,
        uniqueInputCount: proxyImages.uniqueInputCount,
        verifiedInputCount: proxyImages.verifiedInputCount,
        blockedInputCount: proxyImages.blockedInputCount,
        failures: proxyImages.failures,
      } : { ok: true, uniqueInputCount: 0, verifiedInputCount: 0, blockedInputCount: 0, failures: [] },
    },
  };
}

function visualAuditKey(entry = {}) {
  const policies = list(entry.samplingPolicies)
    .map((policy) => text(policy?.policyId || policy))
    .filter(Boolean)
    .sort();
  return [
    text(entry.path) || "unknown-visual-input",
    text(entry.kind),
    entry.allowBlank === true ? "allow-blank" : "visible-required",
    policies.join(","),
    Number(entry.expectedWidth || 0),
    Number(entry.expectedHeight || 0),
  ].join("\u0000");
}

function aggregate(cuts, environment) {
  const blockers = cuts.flatMap((cut) => cut.blockers.map((blocker) => ({
    songId: cut.songId,
    songTitle: cut.songTitle,
    cutId: cut.cutId,
    ...blocker,
  })));
  const blockerCounts = Object.fromEntries([...new Set(blockers.map((row) => row.code))].sort().map((code) => [
    code,
    blockers.filter((row) => row.code === code).length,
  ]));
  const rootCauseMap = new Map();
  for (const blocker of blockers) {
    const affectedPath = text(blocker?.details?.path || blocker?.details?.resolvedPath || blocker?.sourcePath) || null;
    const key = `${text(blocker.code) || "unknown-blocker"}\u0000${affectedPath || "no-path"}`;
    if (!rootCauseMap.has(key)) {
      rootCauseMap.set(key, {
        code: text(blocker.code) || "unknown-blocker",
        path: affectedPath,
        stage: text(blocker.stage) || null,
        message: text(blocker.message) || null,
        affectedCuts: [],
      });
    }
    const group = rootCauseMap.get(key);
    group.affectedCuts.push({ songId: blocker.songId, songTitle: blocker.songTitle, cutId: blocker.cutId });
  }
  const rootCauseGroups = [...rootCauseMap.values()]
    .map((group) => ({ ...group, affectedCutCount: group.affectedCuts.length }))
    .sort((left, right) => right.affectedCutCount - left.affectedCutCount || left.code.localeCompare(right.code) || String(left.path).localeCompare(String(right.path)));
  return {
    ok: environment.available && blockers.length === 0,
    status: !environment.available ? "environment-risk" : blockers.length ? "blocked" : "ready-no-known-blockers",
    projectCount: new Set(cuts.map((cut) => cut.songId)).size,
    cutCount: cuts.length,
    baseCutCount: cuts.filter((cut) => cut.cutKind === "base").length,
    savedVariantCount: cuts.filter((cut) => cut.cutKind === "saved-variant").length,
    savedMintPlanCount: cuts.filter((cut) => cut.cutKind === "saved-mint-plan").length,
    rehydratedSavedMintPlanCount: cuts.filter((cut) => cut.cutKind === "saved-mint-plan"
      && cut.mintPlanCompatibility?.action === "rehydrated-canonical-compiled-graph").length,
    currentSavedMintPlanCount: cuts.filter((cut) => cut.cutKind === "saved-mint-plan"
      && cut.mintPlanCompatibility?.action === "audited-current-graph").length,
    readyCutCount: cuts.filter((cut) => cut.ok).length,
    blockedCutCount: cuts.filter((cut) => !cut.ok).length,
    mediaDeclaredCount: cuts.reduce((sum, cut) => sum + cut.counts.mediaDeclared, 0),
    mediaGeneratedCount: cuts.reduce((sum, cut) => sum + cut.counts.mediaGenerated, 0),
    mediaResolvedCount: cuts.reduce((sum, cut) => sum + cut.counts.mediaResolved, 0),
    visualizerCueCount: cuts.reduce((sum, cut) => sum + cut.counts.visualizerCues, 0),
    exactVisualizerCueCount: cuts.reduce((sum, cut) => sum + cut.counts.exactVisualizerCues, 0),
    verifiedAudioInputReferenceCount: cuts.reduce((sum, cut) => sum + cut.counts.verifiedAudioInputs, 0),
    verifiedStemTelemetryResourceReferenceCount: cuts.reduce((sum, cut) => sum + Number(cut.counts.verifiedStemTelemetryResources || 0), 0),
    verifiedVisualMediaInputReferenceCount: cuts.reduce((sum, cut) => sum + Number(cut.counts.verifiedVisualMediaInputs || 0), 0),
    verifiedProxyAtlasInputReferenceCount: cuts.reduce((sum, cut) => sum + Number(cut.counts.verifiedProxyAtlasInputs || 0), 0),
    blockerCounts,
    rootCauseGroupCount: rootCauseGroups.length,
    rootCauseGroups,
  };
}

async function run(options = {}) {
  const avatarRoot = path.resolve(text(options["avatar-root"]) || ROOT);
  const projectsRoot = path.resolve(text(options.projects) || path.join(avatarRoot, "data/music-video-projects"));
  const variantsRoot = path.resolve(text(options.variants) || path.join(avatarRoot, "data/music-video-project-variants"));
  const albumRoot = path.resolve(text(options.album) || path.join(avatarRoot, "artifacts/echo-director-v2/album"));
  const musicVizRoot = path.resolve(text(options["music-viz-root"]) || process.env.HAPA_MUSIC_VIZ_ROOT || path.join(os.homedir(), "Desktop", "hapa-music-viz"));
  const proxyRegistryPath = path.resolve(text(options["proxy-registry"]) || process.env.HAPA_HYPERFRAMES_PROXY_REGISTRY || path.join(musicVizRoot, "web/isf/proxies/native-exact-proxies.json"));
  const registryPath = path.resolve(text(options.registry) || process.env.HAPA_SONG_REGISTRY_DATA || path.join(os.homedir(), "Desktop", "hapa-song-registry", "data", "registry.json"));
  const songbookPath = path.resolve(text(options.songbook) || path.join(avatarRoot, "data/dear-papa-songbook.json"));
  const reportPath = path.resolve(text(options.report) || path.join(avatarRoot, "artifacts/echo-render-readiness/report.json"));
  const plansRoot = path.resolve(text(options.plans) || path.join(avatarRoot, "data/song-card-mints/plans"));
  const remintQueuePath = path.resolve(text(options["remint-queue"]) || path.join(path.dirname(plansRoot), "remint-queue.json"));
  const visualProbeCachePath = path.resolve(text(options["visual-probe-cache"]) || path.join(avatarRoot, "artifacts/echo-render-readiness/visual-probe-cache.json"));
  const audioProbeCachePath = path.resolve(text(options["audio-probe-cache"]) || path.join(avatarRoot, "artifacts/echo-render-readiness/audio-probe-cache.json"));
  const telemetryCacheRoot = path.resolve(text(options["telemetry-cache"]) || path.join(avatarRoot, "artifacts/echo-render-readiness/stem-telemetry"));
  const applyStemRepairs = options["apply-stem-repairs"] === true
    || ["1", "true", "yes"].includes(text(options["apply-stem-repairs"]).toLowerCase());
  const telemetryAnalyzerPath = path.join(avatarRoot, "scripts/build-stem-telemetry-bundle.py");
  const stemRepairCodePath = path.join(avatarRoot, "src/domain/echo-stem-binding-repair.js");
  const telemetryAnalyzerSha256 = sha256File(telemetryAnalyzerPath);
  const stemRepairCodeSha256 = sha256File(stemRepairCodePath);
  const visualProbeCacheLoad = loadRenderVisualMediaProbeCache(visualProbeCachePath);
  const audioProbeCacheLoad = loadRenderAudioInputPreflightCache(audioProbeCachePath);
  const parsedProxyRegistryProof = stableJsonSourceProof(proxyRegistryPath, "HyperFrames proxy registry");
  const parsedSongRegistryProof = stableJsonSourceProof(registryPath, "Song registry");
  const parsedSongbookProof = stableJsonSourceProof(songbookPath, "Dear Papa songbook");
  const proxyRegistry = parsedProxyRegistryProof.value;
  const registry = parsedSongRegistryProof.value;
  const registryById = new Map(list(registry.songs).map((song) => [text(song.id), song]));
  const songbook = parsedSongbookProof.value;
  const songbookBySongId = new Map(list(songbook.songCards).flatMap((card) => {
    const songId = text(card.id || card.songId);
    const registryId = text(card.registryTrackId || card.lineage?.registryTrackId);
    return songId && registryId ? [[songId, registryId]] : [];
  }));
  let loadedShaderCatalog = await new EchoIsfAssetCatalog({ musicVizRoot, cacheCheckMs: 0 }).load();
  const shaderCatalog = loadedShaderCatalog.shaders;
  const shaderCatalogSha256 = sha256Value(shaderCatalog);
  const shaderCatalogSourceSha256 = sha256Value({
    manifest: loadedShaderCatalog.manifest,
    runtimeHash: loadedShaderCatalog.runtime?.sourceHash || null,
    records: list(loadedShaderCatalog.records).map((record) => ({
      id: record.id,
      hash: record.hash,
      fileSignature: record.fileSignature,
    })),
  });
  const activationShaderCatalogSourceFiles = shaderCatalogSourceFiles({
    ...loadedShaderCatalog,
    manifestPath: path.join(musicVizRoot, "web/isf/manifest.json"),
    pixelGatePath: path.join(musicVizRoot, "docs/ISF_ALL_SHADER_PIXEL_GATE_REPORT.json"),
  });
  const activationShaderCatalogSourceSignature = exactFileSetStatSignature(activationShaderCatalogSourceFiles);
  loadedShaderCatalog = null;
  const resolveMintPlanCompatibility = createEchoMintPlanCanonicalResolver({
    avatarRoot,
    musicVizRoot,
    projectsRoot,
    variantsRoot,
    albumRoot,
    shaderCatalog,
  });
  const environment = inspectSongCardLocalRenderer({ root: avatarRoot, refresh: true });
  const [rendererBuildIdentity, deliveryRuntimeBuildIdentity] = await Promise.all([
    inspectSongCardRendererBuildIdentity({ root: avatarRoot, refresh: true }),
    inspectEchoDeliveryRuntimeBuildIdentity({ root: avatarRoot, refresh: true }),
  ]);
  const serverDeliveryBuildIdentity = inspectEchoServerDeliveryBuildIdentity({ root: avatarRoot });
  const activationRendererSourceSignature = rendererBuildIdentity.sourceStatSignature;
  const activationDeliveryRuntimeSourceSignature = deliveryRuntimeBuildIdentity.sourceStatSignature;
  const activationServerDeliverySourceSignature = serverDeliveryBuildIdentity.sourceStatSignature;
  const proxyRegistryProof = compactSourceProof(parsedProxyRegistryProof);
  const songRegistryProof = compactSourceProof(parsedSongRegistryProof);
  const songbookProof = compactSourceProof(parsedSongbookProof);
  const proxyRegistrySha256 = proxyRegistryProof.sha256;
  const songRegistrySha256 = songRegistryProof.sha256;
  const songbookSha256 = songbookProof.sha256;
  const runtimeRouteContext = {
    root: avatarRoot,
    mediaDir: process.env.HAPA_MEDIA_DIR || path.join(avatarRoot, "data/media"),
    songRegistryPath: registryPath,
    songbookPath,
  };
  const requestedPlanId = text(options.plan);
  let requestedPlan = null;
  let requestedPlanPath = null;
  let requestedPlanProof = null;
  let requestedPlanSongId = null;
  if (requestedPlanId) {
    if (!SAFE_REQUESTED_PLAN_ID.test(requestedPlanId)) {
      throw new Error(`Requested mint plan ID is unsafe: ${requestedPlanId}.`);
    }
    const storageId = requestedPlanId.slice("plan:".length);
    requestedPlanPath = path.join(plansRoot, `${storageId}.json`);
    const parsedPlanProof = stableJsonSourceProof(requestedPlanPath, "Requested saved mint plan");
    requestedPlan = parsedPlanProof.value;
    requestedPlanProof = compactSourceProof(parsedPlanProof);
    assertRequestedMintPlanIdentity(requestedPlan, requestedPlanId);
    requestedPlanSongId = safePathSegment(requestedPlan?.input?.project?.song_id);
    if (!requestedPlanSongId) throw new Error(`Requested mint plan ${requestedPlanId} has no safe project song ID.`);
  }
  const fullCorpusSweep = !options.project && !options.variant && !requestedPlan;
  const corpusSnapshots = fullCorpusSweep
    ? {
      projects: snapshotJsonCorpus(projectsRoot),
      variants: snapshotJsonCorpus(variantsRoot, { recursive: true }),
      plans: snapshotJsonCorpus(plansRoot),
    }
    : null;
  const projectPaths = options.project
    ? [path.resolve(String(options.project))]
    : requestedPlan
      ? [path.join(projectsRoot, `${requestedPlanSongId}-video-project.json`)]
      : corpusSnapshots?.projects.files || jsonFiles(projectsRoot);
  const cuts = [];
  const audioValidationResults = new Map();
  const visualMediaProbeResults = new Map();
  const proxyImageProbeResults = new Map();
  const audioFailureCache = new Map();
  const projectSourceBySongId = new Map();
  const canonicalSourceBySongId = new Map();
  const telemetryAnalyses = createScopedTelemetryAnalysisCache();
  const masterContentHashes = new Map();

  const contentHashForMaster = (masterPath) => {
    const identity = fileStatIdentity(masterPath);
    const key = JSON.stringify(identity);
    if (!masterContentHashes.has(key)) masterContentHashes.set(key, sha256File(masterPath));
    return masterContentHashes.get(key);
  };

  const ensureStemTelemetry = async ({ songId, masterPath, showGraph }) => {
    const stemItems = list(showGraph?.stems?.items).filter((item) => {
      const role = text(item?.stemType || item?.role || item?.title || item?.id).toLowerCase().replace(/[^a-z0-9]+/gu, "-");
      return text(item?.audioPath) || !["archive-zip", "stem-archive", "stems-archive"].includes(role);
    });
    const identity = {
      schemaVersion: "hapa.echo.stem-telemetry-cache-input.v1",
      analysisScriptSha256: telemetryAnalyzerSha256,
      songId,
      durationSeconds: Number(showGraph?.song?.durationSeconds || 0),
      master: fileStatIdentity(masterPath),
      stems: stemItems.map((item) => ({
        id: text(item?.id) || null,
        role: text(item?.stemType || item?.role || item?.title || item?.id) || null,
        source: fileStatIdentity(item?.audioPath),
      })),
    };
    const identitySha256 = sha256Value(identity);
    if (telemetryAnalyses.has(identitySha256)) {
      const cached = telemetryAnalyses.get(identitySha256);
      return { ...cached, cache: { ...(cached.cache || {}), hit: true, origin: "invocation", identitySha256 } };
    }
    const key = identitySha256.replace(/^sha256:/u, "");
    const outputDirectory = path.join(telemetryCacheRoot, safePathSegment(songId) || "song", key);
    const graphPath = path.join(outputDirectory, "analysis-graph.json");
    const bundlePath = path.join(outputDirectory, "stem-telemetry.json");
    const analyzedGraphPath = path.join(outputDirectory, "analysis-graph-with-telemetry.json");
    const receiptPath = path.join(outputDirectory, "receipt.json");
    try {
      const receipt = readJson(receiptPath);
      const telemetry = readJson(bundlePath);
      if (
        receipt?.schemaVersion === "hapa.echo.stem-telemetry-cache-receipt.v1"
        && receipt?.ok === true
        && receipt?.identitySha256 === identitySha256
        && path.resolve(receipt?.bundlePath || "") === path.resolve(bundlePath)
        && receipt?.bundleSha256 === sha256File(bundlePath)
        && telemetry?.schemaVersion === "hapa.stem-telemetry-bundle.v1"
      ) {
        const result = { ok: true, telemetry, masterSha256: contentHashForMaster(masterPath), cache: { hit: true, origin: "persistent", identitySha256, bundlePath, bundleSha256: receipt.bundleSha256 } };
        telemetryAnalyses.remember(identitySha256, result);
        return result;
      }
    } catch { /* A missing or stale receipt triggers a fresh analysis. */ }
    fs.mkdirSync(outputDirectory, { recursive: true });
    atomicJson(graphPath, {
      schemaVersion: text(showGraph?.schemaVersion) || "hapa.music-viz.native-show-graph.v2",
      song: structuredClone(showGraph?.song || { id: songId }),
      stems: { items: structuredClone(stemItems) },
      tracks: [],
      directorV2: {},
    });
    let lastError = null;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      try {
        await execFile(process.env.HAPA_PYTHON || "python3", [
          path.join(avatarRoot, "scripts/build-stem-telemetry-bundle.py"),
          "--graph", graphPath,
          "--master", masterPath,
          "--output", bundlePath,
          "--graph-output", analyzedGraphPath,
        ], { cwd: avatarRoot, maxBuffer: 32 * 1024 * 1024, timeout: 20 * 60_000 });
        const telemetry = readJson(bundlePath);
        const bundleSha256 = sha256File(bundlePath);
        const result = { ok: true, telemetry, masterSha256: contentHashForMaster(masterPath), cache: { hit: false, origin: attempt === 1 ? "analyzed" : "analyzed-after-retry", identitySha256, bundlePath, bundleSha256 } };
        atomicJson(receiptPath, { schemaVersion: "hapa.echo.stem-telemetry-cache-receipt.v1", ok: true, identitySha256, identity, bundlePath, bundleSha256, generatedAt: new Date().toISOString() });
        telemetryAnalyses.remember(identitySha256, result);
        return result;
      } catch (error) {
        lastError = error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }
    return telemetryAnalyses.remember(identitySha256, {
      ok: false,
      telemetry: null,
      masterSha256: null,
      cache: { hit: false, origin: "analysis-failed-after-retry", identitySha256, bundlePath },
      error: safeErrorMessage(lastError),
    }, { retainPayload: false });
  };

  const auditDescriptor = async (descriptor) => {
    const expectedCurrentPointerSha256 = applyStemRepairs && ["base", "saved-variant", "saved-mint-plan"].includes(descriptor.cutKind)
      ? echoExecutionPointerToken({ albumRoot, songId: descriptor.songId, cutId: descriptor.cutId })
      : undefined;
    try {
      const master = registryMaster(descriptor.project, descriptor.graph, registryById, songbookBySongId, runtimeRouteContext);
      const structuralAudioInputs = renderAudioInputsFromShowGraph({
        masterPath: master.path,
        showGraph: descriptor.graph,
        // First prove every source structurally (full decode, duration, hash,
        // lineage) without making the stale editorial binding a prerequisite
        // for the telemetry needed to repair that binding.
        stemTelemetryBindings: [],
      });
      const structuralAudio = await preflightRenderAudioInputs({
        ...structuralAudioInputs,
        expectedDurationSeconds: Number(descriptor.graph?.song?.durationSeconds || 0),
      }, { concurrency: 2, root: avatarRoot, failureCache: audioFailureCache });
      const stemRegistryLineage = preflightStemRegistryLineage({
        registry,
        project: descriptor.project,
        showGraph: descriptor.graph,
        masterPath: master.path,
        masterRegistryId: master.registryId,
      });
      let graph = descriptor.graph;
      let analysis = null;
      let stemBindingRepair = null;
      const declaredStemTelemetryBindings = deriveRequiredStemTelemetryBindings({ showGraph: descriptor.graph });
      const stemTelemetryRequired = declaredStemTelemetryBindings.length > 0;
      if (master.ok && structuralAudio.ok && stemRegistryLineage.ok) {
        if (!stemTelemetryRequired) {
          const noOpBundleSha256 = sha256Value({
            schemaVersion: "hapa.echo.no-stem-binding-repair-proof.v1",
            songId: descriptor.songId,
            cutId: descriptor.cutId,
            cutFingerprint: descriptor.cutFingerprint,
            graphSha256: sha256Value(descriptor.graph),
          });
          analysis = {
            ok: true,
            noOp: true,
            telemetry: null,
            masterSha256: contentHashForMaster(master.path),
            cache: {
              hit: true,
              origin: "verified-not-required",
              identitySha256: noOpBundleSha256,
              bundleSha256: noOpBundleSha256,
            },
          };
          stemBindingRepair = {
            graph: descriptor.graph,
            receipt: {
              schemaVersion: "hapa.echo.runtime-stem-binding-repair.v1",
              status: "verified-no-change",
              policy: { id: "no-stem-binding-repair-required", version: 1 },
              decisionCount: 0,
              blockedDecisionCount: 0,
              repairedCardCount: 0,
              decisions: [],
              telemetry: {
                bundleSha256: noOpBundleSha256,
                truthStatus: "not-required-no-audio-reactive-stem-bindings",
              },
            },
          };
        } else {
          analysis = await ensureStemTelemetry({ songId: descriptor.songId, masterPath: master.path, showGraph: descriptor.graph });
        }
        if (analysis.ok && stemTelemetryRequired) {
          stemBindingRepair = repairEchoShowGraphStemBindings(descriptor.graph, {
            telemetry: analysis.telemetry,
            telemetrySha256: analysis.cache?.bundleSha256 || null,
            project: descriptor.project,
            scope: `${descriptor.cutKind}:${descriptor.cutId}`,
          });
          graph = stemBindingRepair.graph;
        }
      }
      const audio = master.ok && structuralAudio.ok && stemRegistryLineage.ok
        ? await preflightRenderAudioInputs({
          ...renderAudioInputsFromShowGraph({
            masterPath: master.path,
            showGraph: graph,
            stemTelemetryBindings: deriveRequiredStemTelemetryBindings({ showGraph: graph }),
          }),
          expectedDurationSeconds: Number(graph?.song?.durationSeconds || 0),
        }, { concurrency: 2, root: avatarRoot, failureCache: audioFailureCache })
        : structuralAudio;
      for (const entry of audio.entries) {
        const auditKey = [
          text(entry.path) || `${entry.id}:${entry.role}`,
          Number(entry?.durationValidation?.expectedDurationSeconds || audio.expectedDurationSeconds || 0),
          sha256Value(entry?.signalContract || null),
        ].join("\u0000");
        audioValidationResults.set(auditKey, entry);
      }
      let stemTelemetry;
      if (master.ok && structuralAudio.ok && stemRegistryLineage.ok) {
        stemTelemetry = analysis.ok && analysis.noOp
          ? {
            schemaVersion: "hapa.stem-telemetry-preflight.v1",
            ok: true,
            findings: [],
            bindings: { requiredRoles: [] },
            summary: { analyzedResourceCount: 0, frameCount: 0 },
            cache: analysis.cache,
            status: "verified-not-required",
          }
          : analysis.ok
          ? {
            ...preflightStemTelemetryBundle({
              telemetry: analysis.telemetry,
              showGraph: graph,
              expectedDurationSeconds: Number(graph?.song?.durationSeconds || 0),
              expectedMasterPath: master.path,
              expectedMasterSha256: analysis.masterSha256,
              expectedStemSources: audio.entries
                .filter((entry) => entry.kind === "stem" && entry.ok === true)
                .map((entry) => ({ role: entry.role, path: entry.path, sha256: entry.contentSha256 })),
            }),
            cache: analysis.cache,
          }
          : {
            schemaVersion: "hapa.stem-telemetry-preflight.v1",
            ok: false,
            findings: [{ code: "stem-telemetry-analysis-failed", severity: "blocker", message: analysis.error || "Stem analysis failed." }],
            bindings: { requiredRoles: [] },
            summary: { analyzedResourceCount: 0, frameCount: 0 },
            cache: analysis.cache,
          };
      } else {
        stemTelemetry = {
          schemaVersion: "hapa.stem-telemetry-preflight.v1",
          ok: false,
          findings: [{ code: "stem-telemetry-prerequisite-failed", severity: "blocker", message: "Real stem telemetry was not analyzed because the master, an audio input, or canonical stem lineage failed preflight." }],
          bindings: { requiredRoles: [] },
          summary: { analyzedResourceCount: 0, frameCount: 0 },
          cache: null,
        };
      }
      const signal = preflightSongCardSignalGraph({ project: descriptor.project, showGraph: graph });
      const resolutionProjectPath = descriptor.resolutionProjectPath || descriptor.sourcePath;
      const media = preflightHyperFramesMedia(graph, {
        project: descriptor.project,
        root: avatarRoot,
        projectPath: resolutionProjectPath,
        isFile: readableFile,
      });
      const readiness = preflightSongCardRenderReadiness({
        project: descriptor.project,
        showGraph: graph,
        proxyRegistry,
        proxyRegistryPath,
        root: avatarRoot,
        projectPath: resolutionProjectPath,
        signalPreflight: signal,
        mediaPreflight: media,
      });
      const [visualMedia, proxyImages] = await Promise.all([
        preflightExecutionVisualMedia(media, { concurrency: 4, runtimeRouteContext }),
        preflightProxyAtlasImages(readiness, { concurrency: 4 }),
      ]);
      for (const entry of visualMedia.entries) visualMediaProbeResults.set(visualAuditKey(entry), entry);
      for (const entry of proxyImages.entries) proxyImageProbeResults.set(visualAuditKey(entry), entry);
      const compact = compactCutResult({
        descriptor,
        project: descriptor.project,
        graph,
        master,
        audio,
        stemTelemetry,
        stemBindingRepair,
        stemRegistryLineage,
        signal,
        media,
        visualMedia,
        proxyImages,
        readiness,
        rendererBuildSha256: rendererBuildIdentity.sha256,
        proxyRegistrySha256,
        songRegistrySha256,
      });
      if (applyStemRepairs
        && ["base", "saved-variant", "saved-mint-plan"].includes(descriptor.cutKind)
        && stemBindingRepair?.receipt
        && stemBindingRepairHealth(stemBindingRepair).ok
        && compact.ok) {
        try {
          const parentGraphPath = descriptor.canonicalGraphPath || path.join(albumRoot, descriptor.songId, "native-show-graph.json");
          const parentGraphSha256 = text(descriptor.canonicalGraphSha256);
          const parentIdentity = descriptor.canonicalParentIdentity;
          if (!parentGraphSha256 || !parentIdentity || !descriptor.canonicalGraphProof) {
            throw new Error("The canonical Echo graph changed after this cut audit began; discard this result and run readiness again.");
          }
          assertFileSourceProofStatFresh(descriptor.canonicalGraphProof, "Canonical compiled Echo graph");
          if (!descriptor.sourceInputSha256 || !descriptor.sourceProof) {
            throw new Error("The base project or saved cut changed after this cut audit began; discard this result and run readiness again.");
          }
          assertFileSourceProofStatFresh(descriptor.sourceProof, "Selected project or saved cut");
          const executionGraph = structuredClone(graph);
          if (descriptor.cutKind === "saved-mint-plan") {
            const savedProjectHash = contentHash(descriptor.project);
            executionGraph.directorV2 = {
              ...(executionGraph.directorV2 || {}),
              source: {
                ...(executionGraph.directorV2?.source || {}),
                sourceProjectHash: savedProjectHash,
              },
              provenance: {
                ...(executionGraph.directorV2?.provenance || {}),
                sourceProjectHash: savedProjectHash,
              },
            };
          }
          executionGraph.directorV2 = {
            ...(executionGraph.directorV2 || {}),
            executionLineage: {
              schemaVersion: "hapa.echo.execution-graph-lineage.v1",
              kind: "derived-stem-binding-repair",
              parentIdentity,
              parentGraphSha256,
              telemetryBundleSha256: analysis?.cache?.bundleSha256 || null,
              policy: stemBindingRepair.receipt?.policy || null,
              repairReceiptSha256: sha256Value(stemBindingRepair.receipt),
              cutId: descriptor.cutId,
              cutKind: descriptor.cutKind,
              cutFingerprint: descriptor.cutFingerprint,
              nonDestructiveStoredEdit: true,
            },
          };
          const identifiedExecutionGraph = reidentifyEchoCompiledShowGraph(executionGraph);
          const visualInputs = visualExecutionInputEvidence(visualMedia?.entries, "visual-media", media?.entries, { runtimeRouteContext });
          const proxyInputs = visualExecutionInputEvidence(proxyImages?.entries, "proxy-atlas");
          if (
            visualInputs.length !== Number(visualMedia?.verifiedInputCount || 0)
            || proxyInputs.length !== Number(proxyImages?.verifiedInputCount || 0)
          ) {
            throw new Error("Verified visual or proxy inputs are missing immutable file-identity evidence.");
          }
          const evidence = {
            cut: {
              id: descriptor.cutId,
              kind: descriptor.cutKind,
              fingerprint: descriptor.cutFingerprint,
              certificateSha256: compact.certificateSha256,
              readinessFingerprint: compact.readinessFingerprint,
            },
            gate: {
              schemaVersion: "hapa.echo.execution-publication-gate.v1",
              ok: compact.ok === true,
              cutStatus: compact.status,
              certificateSha256: compact.certificateSha256,
              readinessFingerprint: compact.readinessFingerprint,
              repairReceiptSha256: sha256Value(stemBindingRepair.receipt),
            },
            parentGraphSha256,
            parentIdentity,
            repair: {
              policy: stemBindingRepair.receipt?.policy || null,
              codeSha256: stemRepairCodeSha256,
              receiptSha256: sha256Value(stemBindingRepair.receipt),
              decisionsSha256: sha256Value(stemBindingRepair.receipt?.decisions || []),
              receipt: stemBindingRepair.receipt,
            },
            telemetry: buildExecutionTelemetryEvidence({ analysis, analyzerScriptSha256: telemetryAnalyzerSha256 }),
            inputs: list(audio?.entries).filter((entry) => entry.ok === true).map((entry) => ({
              kind: entry.kind,
              inputClass: entry.kind === "master" ? "master-audio" : "stem-audio",
              id: entry.id,
              role: entry.role,
              path: entry.path,
              contentSha256: entry.contentSha256,
              statIdentityKey: entry.cache?.statIdentityKey || null,
              routeBindings: entry.kind === "master" ? [{
                uri: master.runtimeUri,
                source: master.runtimeRoute || "declared-master-runtime-uri",
                route: "song-registry-api",
              }] : [],
            })).sort((left, right) => `${left.kind}:${left.role}:${left.id}`.localeCompare(`${right.kind}:${right.role}:${right.id}`)),
            visualInputs,
            proxyInputs,
            visualInputSummary: {
              visualInputCount: visualInputs.length,
              proxyInputCount: proxyInputs.length,
            },
            registries: { songRegistrySha256, songbookSha256, proxyRegistrySha256, shaderCatalogSha256 },
            rendererBuildSha256: rendererBuildIdentity.sha256,
            deliveryRuntimeBuildSha256: deliveryRuntimeBuildIdentity.sha256,
            serverDeliveryBuildSha256: serverDeliveryBuildIdentity.sha256,
            certifier: {
              schemaVersion: "hapa.echo.readiness-certifier-source.v1",
              path: path.relative(avatarRoot, CERTIFIER_SOURCE_PROOF.path),
              sourceSha256: CERTIFIER_SOURCE_PROOF.sha256,
            },
            stemRegistryLineage: {
              masterId: stemRegistryLineage?.master?.id || null,
              verifiedStemCount: Number(stemRegistryLineage?.verifiedStemCount || 0),
            },
          };
          const [finalAudioInputs, finalVisualInputs] = await Promise.all([
            verifyEchoExecutionInputEvidence(evidence.inputs, { runtimeRouteContext }),
            verifyEchoExecutionVisualInputEvidence({ visualInputs, proxyInputs }, { runtimeRouteContext }),
          ]);
          if (!finalAudioInputs.ok) throw new Error(`Audio inputs changed after readiness: ${finalAudioInputs.reason}.`);
          if (!finalVisualInputs.ok) {
            const firstFinding = finalVisualInputs.findings?.[0] || {};
            const detail = [text(firstFinding.code), text(firstFinding.path)].filter(Boolean).join(": ");
            throw new Error(`Visual inputs changed after readiness: ${finalVisualInputs.reason}${detail ? ` (${detail})` : ""}.`);
          }
          assertFileSourceProofStatFresh(CERTIFIER_SOURCE_PROOF, "Echo readiness certifier");
          if (!(
            assertFileSourceProofStatFresh(songRegistryProof, "Song registry")
            && assertFileSourceProofStatFresh(songbookProof, "Dear Papa songbook")
            && assertFileSourceProofStatFresh(proxyRegistryProof, "HyperFrames proxy registry")
          )) {
            throw new Error("A registry changed after this cut audit began; discard this result and run readiness again.");
          }
          if (exactFileSetStatSignature(activationShaderCatalogSourceFiles) !== activationShaderCatalogSourceSignature) {
            throw new Error("The shader catalog changed after this cut audit began; discard this result and run readiness again.");
          }
          assertFileSourceProofStatFresh(descriptor.canonicalGraphProof, "Canonical compiled Echo graph");
          assertFileSourceProofStatFresh(descriptor.sourceProof, "Selected project or saved cut");
          const assertPublicationFresh = () => {
            if (songCardRendererBuildSourceStatSignature({ root: avatarRoot, refresh: true }) !== activationRendererSourceSignature) {
              throw new Error("The renderer source changed during execution graph publication.");
            }
            if (
              echoDeliveryRuntimeBuildSourceStatSignature({
                root: avatarRoot,
                files: deliveryRuntimeBuildIdentity.sourceFiles,
                refresh: true,
              }) !== activationDeliveryRuntimeSourceSignature
            ) {
              throw new Error("The delivery runtime changed during execution graph publication.");
            }
            if (echoServerDeliverySourceStatSignature({ root: avatarRoot, refresh: true }) !== activationServerDeliverySourceSignature) {
              throw new Error("The server delivery source changed during execution graph publication.");
            }
            assertFileSourceProofStatFresh(CERTIFIER_SOURCE_PROOF, "Echo readiness certifier");
            if (!(
              assertFileSourceProofStatFresh(songRegistryProof, "Song registry")
              && assertFileSourceProofStatFresh(songbookProof, "Dear Papa songbook")
              && assertFileSourceProofStatFresh(proxyRegistryProof, "HyperFrames proxy registry")
            )) {
              throw new Error("A registry changed during execution graph publication.");
            }
            if (exactFileSetStatSignature(activationShaderCatalogSourceFiles) !== activationShaderCatalogSourceSignature) {
              throw new Error("The shader catalog changed during execution graph publication.");
            }
            assertFileSourceProofStatFresh(descriptor.canonicalGraphProof, "Canonical compiled Echo graph");
            assertFileSourceProofStatFresh(descriptor.sourceProof, "Selected project or saved cut");
            assertExactStatEvidenceFresh(evidence.inputs, "Audio input");
            assertExactStatEvidenceFresh(visualInputs, "Visual media input");
            assertExactStatEvidenceFresh(proxyInputs, "Proxy atlas input");
            assertRuntimeRouteEvidenceFresh(
              visualInputs.filter((entry) => entry.inputClass === "visual-media"),
              runtimeRouteContext,
            );
            assertRuntimeRouteEvidenceFresh(
              evidence.inputs.filter((entry) => entry.inputClass === "master-audio"),
              runtimeRouteContext,
              "Master audio",
            );
          };
          const publication = publishEchoExecutionGraph({
            albumRoot,
            songId: descriptor.songId,
            cutId: descriptor.cutId,
            cutKind: descriptor.cutKind,
            cutFingerprint: descriptor.cutFingerprint,
            parentGraphPath,
            expectedParentGraphSha256: parentGraphSha256,
            expectedCurrentPointerSha256,
            graph: identifiedExecutionGraph,
            project: descriptor.cutKind === "saved-mint-plan"
              ? descriptor.project
              : descriptor.canonicalProject || descriptor.project,
            evidence,
            assertPublicationFresh,
          });
          compact.executionGraphPublication = {
            status: publication.status,
            cutId: descriptor.cutId,
            pointerPath: path.relative(avatarRoot, publication.pointerPath),
            graphPath: path.relative(avatarRoot, publication.graphPath),
            receiptPath: path.relative(avatarRoot, publication.receiptPath),
            parentGraphSha256: publication.pointer.parentGraphSha256,
            executionGraphSha256: publication.pointer.executionGraphSha256,
            variantId: publication.pointer.variantId,
          };
        } catch (error) {
          compact.ok = false;
          compact.status = "blocked";
          compact.blockers.push({
            stage: "execution-graph-publication",
            code: "stem-binding-execution-graph-publish-failed",
            message: safeErrorMessage(error),
          });
        }
      }
      cuts.push(compact);
    } catch (error) {
      cuts.push(invalidCutResult({
        songId: descriptor.songId,
        songTitle: descriptor.songTitle,
        cutId: descriptor.cutId,
        cutTitle: descriptor.cutTitle,
        cutKind: descriptor.cutKind,
        sourcePath: descriptor.sourcePath,
        code: "cut-readiness-exception",
        stage: "readiness",
        message: safeErrorMessage(error),
      }));
    }
  };

  if (!projectPaths.length) {
    cuts.push(invalidCutResult({
      songId: "album",
      songTitle: "Album source set",
      cutId: "base-projects",
      cutTitle: "Base projects",
      sourcePath: projectsRoot,
      code: "projects-directory-empty",
      stage: "project-input",
      message: "No music-video project JSON files were found, so there is nothing to certify.",
    }));
  }

  for (const projectPath of projectPaths) {
    let rawProject;
    let projectProof;
    try {
      const parsedProjectProof = stableJsonSourceProof(projectPath, "Base music-video project");
      rawProject = bodyOf(parsedProjectProof.value);
      projectProof = compactSourceProof(parsedProjectProof);
    } catch (error) {
      cuts.push(invalidCutResult({
        songId: path.basename(projectPath, ".json"),
        songTitle: "Unreadable base project",
        sourcePath: projectPath,
        code: "invalid-project-json",
        stage: "project-input",
        message: safeErrorMessage(error),
      }));
      continue;
    }
    const declaredSongId = text(rawProject.song_id);
    const songId = safePathSegment(declaredSongId);
    const songTitle = text(rawProject.song_title) || path.basename(projectPath, ".json");
    if (!songId) {
      cuts.push(invalidCutResult({
        songId: path.basename(projectPath, ".json"),
        songTitle,
        sourcePath: projectPath,
        code: declaredSongId ? "project-song-id-unsafe" : "project-song-id-missing",
        stage: "project-input",
        message: declaredSongId
          ? "The base project song_id is not a safe production path segment, so no external graph or cut path was inspected."
          : "The base project has no song_id, so compiled artifacts and saved cuts cannot be associated safely.",
      }));
      continue;
    }
    projectSourceBySongId.set(songId, projectPath);

    const saved = requestedPlan
      ? { rows: [], invalid: [] }
      : loadSavedVariantRows({ baseProject: rawProject, projectPath, projectProof, variantsRoot, songId });
    const selectedVariantRows = options.variant
      ? saved.rows.filter((row) => row.id === String(options.variant))
      : saved.rows;
    if (!options.variant) cuts.push(...saved.invalid);
    if (options.variant && !selectedVariantRows.length) {
      cuts.push(invalidCutResult({
        songId,
        songTitle,
        cutId: String(options.variant),
        cutTitle: "Requested saved direction cut",
        cutKind: "saved-variant",
        sourcePath: path.join(variantsRoot, songId),
        code: "saved-cut-not-found",
        stage: "variant-input",
        message: `No production-selectable saved cut has ID ${String(options.variant)}.`,
      }));
    }

    const compiledGraphPath = path.join(albumRoot, songId, "native-show-graph.json");
    let compiledGraph;
    let compiledGraphSha256;
    let compiledGraphProof;
    try {
      const parsedCompiledGraphProof = stableJsonSourceProof(compiledGraphPath, "Canonical compiled Echo graph");
      compiledGraphSha256 = parsedCompiledGraphProof.sha256;
      compiledGraph = parsedCompiledGraphProof.value;
      compiledGraphProof = compactSourceProof(parsedCompiledGraphProof);
    } catch (error) {
      const blockedDescriptors = [{
        id: "base",
        title: "Base project",
        kind: "base",
        sourcePath: projectPath,
      }, ...selectedVariantRows.map((row) => ({
        id: row.id,
        title: text(row.variant?.title || row.variant?.label || row.variant?.name) || "Saved direction cut",
        kind: "saved-variant",
        sourcePath: row.sourcePath,
      }))];
      for (const blocked of blockedDescriptors) {
        cuts.push(invalidCutResult({
          songId,
          songTitle,
          cutId: blocked.id,
          cutTitle: blocked.title,
          cutKind: blocked.kind,
          sourcePath: blocked.sourcePath,
          code: "compiled-show-graph-unavailable",
          stage: "compiled-input",
          message: safeErrorMessage(error),
          details: { compiledGraphPath },
        }));
      }
      continue;
    }
    const compiledValidation = validateEchoCompiledShowGraph({ project: rawProject, graph: compiledGraph });
    if (!compiledValidation.ok) {
      const blockedDescriptors = [{ id: "base", title: "Base project", kind: "base", sourcePath: projectPath }, ...selectedVariantRows.map((row) => ({
        id: row.id,
        title: text(row.variant?.title || row.variant?.label || row.variant?.name) || "Saved direction cut",
        kind: "saved-variant",
        sourcePath: row.sourcePath,
      }))];
      for (const blocked of blockedDescriptors) {
        cuts.push(invalidCutResult({
          songId,
          songTitle,
          cutId: blocked.id,
          cutTitle: blocked.title,
          cutKind: blocked.kind,
          sourcePath: blocked.sourcePath,
          code: "compiled-show-graph-invalid",
          stage: "compiled-input",
          message: `The compiled graph failed the production validation contract: ${compiledValidation.reasons.join(", ")}.`,
          details: compiledValidation,
        }));
      }
      continue;
    }

    const initialBaseGraphRepair = repairEchoRuntimeShaderGraph(compiledGraph, shaderCatalog, "project:director-show-graph");
    const baseTimelineRepair = repairEchoRuntimeVisualizerTimeline(rawProject.visualizer_timeline, shaderCatalog, "project:visualizer-timeline");
    const baseGraphRepair = {
      ...initialBaseGraphRepair,
      graph: projectEchoRuntimeShaderRepairProvenance(initialBaseGraphRepair.graph, baseTimelineRepair).graph,
    };
    const baseProject = {
      ...rawProject,
      visualizer_timeline: baseTimelineRepair.timeline,
      director_show_graph: baseGraphRepair.graph,
    };
    const canonicalParentIdentity = {
      runId: text(compiledGraph?.runId) || null,
      variantId: text(compiledGraph?.directorV2?.variantId) || null,
      variantHash: text(compiledGraph?.directorV2?.variantHash) || null,
    };
    canonicalSourceBySongId.set(songId, {
      projectPath,
      projectSha256: projectProof.sha256,
      projectProof,
      graphPath: compiledGraphPath,
      graphSha256: compiledGraphSha256,
      graphProof: compiledGraphProof,
      parentIdentity: canonicalParentIdentity,
    });
    const descriptors = [{
      songId,
      songTitle,
      cutId: "base",
      cutTitle: "Base project",
      cutKind: "base",
      sourcePath: projectPath,
      resolutionProjectPath: projectPath,
      project: baseProject,
      graph: baseGraphRepair.graph,
      canonicalProject: rawProject,
      canonicalGraph: compiledGraph,
      canonicalGraphPath: compiledGraphPath,
      canonicalGraphSha256: compiledGraphSha256,
      canonicalParentIdentity,
      cutFingerprint: compiledGraphSha256,
      sourceInputSha256: projectProof.sha256,
      sourceProof: projectProof,
      canonicalGraphProof: compiledGraphProof,
    }];
    for (const row of selectedVariantRows) {
      try {
        const repaired = repairEchoRuntimeDirectionVariant(row.variant, {
          catalog: shaderCatalog,
          sourceProfile: true,
          selected: true,
          baseProject,
        }).variant;
        const projected = deriveEchoDirectionVariantProject(baseProject, repaired, { identityVariant: row.variant });
        descriptors.push({
          songId,
          songTitle,
          cutId: echoDirectionVariantId(repaired) || row.id,
          cutTitle: text(repaired.title || repaired.label || repaired.name) || "Saved direction cut",
          cutKind: "saved-variant",
          sourcePath: row.sourcePath,
          resolutionProjectPath: projectPath,
          project: projected,
          graph: projected.director_show_graph,
          canonicalProject: rawProject,
          canonicalGraph: compiledGraph,
          canonicalGraphPath: compiledGraphPath,
          canonicalGraphSha256: compiledGraphSha256,
          canonicalParentIdentity,
          cutFingerprint: echoDirectionVariantFingerprint(row.variant),
          sourceInputSha256: row.sourceProof?.sha256 || null,
          sourceProof: row.sourceProof,
          canonicalGraphProof: compiledGraphProof,
        });
      } catch (error) {
        cuts.push(invalidCutResult({
          songId,
          songTitle,
          cutId: row.id,
          cutTitle: text(row.variant?.title || row.variant?.label || row.variant?.name) || "Saved direction cut",
          cutKind: "saved-variant",
          sourcePath: row.sourcePath,
          code: "saved-cut-hydration-failed",
          stage: "variant-hydration",
          message: safeErrorMessage(error),
        }));
      }
    }

    if (!requestedPlan) {
      try {
        for (const descriptor of descriptors) await auditDescriptor(descriptor);
      } finally {
        // Base and saved variants for one song share the same parsed telemetry
        // payload. Once that song is complete, retain only compact audit counts.
        telemetryAnalyses.releasePayloads();
      }
    }
  }

  let savedMintPlanAudit = {
    report: {
      schemaVersion: "hapa.echo.saved-mint-plan-audit.v1",
      mode: "selection-skipped",
      queue: { path: remintQueuePath, status: "not-read" },
      planFileCount: 0,
      activePlanCount: 0,
      archivalPlanCount: 0,
      missingActivePlanCount: 0,
      unboundActiveCandidateCount: 0,
      activePlans: [],
      archivalPlans: [],
      missingActivePlans: [],
      unboundActiveCandidates: [],
      activeReasonCounts: {},
      archivalReasonCounts: {},
    },
    activeEntries: [],
    archivalEntries: [],
    missingActivePlans: [],
    unboundActiveCandidates: [],
  };

  // Saved mint plans are immutable render inputs and can outlive the editor cut
  // that created them. The durable queue identifies which plans can still render
  // or release; historical and orphaned snapshots remain reported but cannot
  // block a current production run.
  if ((!options.project || requestedPlan) && !options.variant && options["skip-mint-plans"] !== true) {
    savedMintPlanAudit = requestedPlan
      ? {
        report: {
          schemaVersion: "hapa.echo.saved-mint-plan-audit.v1",
          mode: "targeted-exact-plan",
          queue: { path: remintQueuePath, status: "not-read-targeted-plan" },
          planFileCount: 1,
          activePlanCount: 1,
          archivalPlanCount: 0,
          missingActivePlanCount: 0,
          unboundActiveCandidateCount: 0,
          activePlans: [{
            planId: requestedPlanId,
            path: requestedPlanPath,
            planStatus: text(requestedPlan?.status).toLowerCase() || null,
            parseStatus: "parsed",
            reason: "targeted-exact-plan",
            candidateIds: [],
            candidateStatuses: [],
          }],
          archivalPlans: [],
          missingActivePlans: [],
          unboundActiveCandidates: [],
          activeReasonCounts: { "targeted-exact-plan": 1 },
          archivalReasonCounts: {},
        },
        activeEntries: [{
          planPath: requestedPlanPath,
          plan: requestedPlan,
          sourceProof: requestedPlanProof,
          planId: requestedPlanId,
          aliases: new Set([requestedPlanId]),
          parseError: null,
        }],
        archivalEntries: [],
        missingActivePlans: [],
        unboundActiveCandidates: [],
        planEntries: [],
        queueProof: null,
      }
      : loadSavedMintPlanAudit({ plansRoot, queuePath: remintQueuePath });
    if (!requestedPlan && savedMintPlanAudit.report.queue.status === "invalid-fallback") {
      cuts.push(invalidCutResult({
        songId: "saved-mint-plans",
        songTitle: "Saved mint plans",
        cutId: "remint-queue",
        cutTitle: "Song Card remint queue",
        cutKind: "saved-mint-plan",
        sourcePath: remintQueuePath,
        code: "remint-queue-invalid",
        stage: "mint-plan-selection",
        message: `The existing remint queue is invalid, so the Builder cannot prove which saved plans are active: ${savedMintPlanAudit.report.queue.error || "invalid queue"}`,
      }));
    }
    const selectedMissingPlans = requestedPlan
      ? savedMintPlanAudit.missingActivePlans.filter((row) => row.planId === requestedPlanId)
      : savedMintPlanAudit.missingActivePlans;
    const selectedUnboundCandidates = requestedPlan ? [] : savedMintPlanAudit.unboundActiveCandidates;
    const selectedActiveEntries = requestedPlan
      ? savedMintPlanAudit.activeEntries.filter((entry) => text(entry.plan?.planId) === requestedPlanId)
      : savedMintPlanAudit.activeEntries;
    if (requestedPlan && !selectedActiveEntries.length) {
      selectedActiveEntries.push({
        planPath: requestedPlanPath,
        plan: requestedPlan,
        sourceProof: requestedPlanProof,
        parseError: null,
      });
    }
    for (const missing of selectedMissingPlans) {
      cuts.push(invalidCutResult({
        songId: "saved-mint-plans",
        songTitle: "Saved mint plans",
        cutId: missing.planId,
        cutTitle: "Missing active saved mint plan",
        cutKind: "saved-mint-plan",
        sourcePath: plansRoot,
        code: "saved-mint-plan-file-missing",
        stage: "mint-plan-input",
        message: `The remint queue still references ${missing.planId}, but its immutable plan file is missing.`,
        details: missing,
      }));
    }
    for (const unbound of selectedUnboundCandidates) {
      cuts.push(invalidCutResult({
        songId: "saved-mint-plans",
        songTitle: "Saved mint plans",
        cutId: unbound.candidateId || "unbound-active-candidate",
        cutTitle: "Active remint candidate without a saved plan",
        cutKind: "saved-mint-plan",
        sourcePath: remintQueuePath,
        code: "saved-mint-plan-reference-missing",
        stage: "mint-plan-input",
        message: "An active remint candidate has no immutable plan ID and cannot be certified.",
        details: unbound,
      }));
    }
    for (const entry of selectedActiveEntries) {
      // Saved plans are independent immutable cuts. Never retain a prior plan's
      // parsed telemetry bundle while the next plan is being certified.
      telemetryAnalyses.releasePayloads();
      const { planPath, plan, parseError } = entry;
      if (parseError) {
        cuts.push(invalidCutResult({
          songId: "saved-mint-plans",
          songTitle: "Saved mint plans",
          cutId: path.basename(planPath, ".json"),
          cutTitle: "Unreadable saved mint plan",
          cutKind: "saved-mint-plan",
          sourcePath: planPath,
          code: "invalid-saved-mint-plan-json",
          stage: "mint-plan-input",
          message: parseError,
        }));
        continue;
      }
      const project = plan?.input?.project;
      const graph = plan?.input?.showGraph;
      const declaredSongId = text(project?.song_id || graph?.song?.id || plan.songId);
      const songId = safePathSegment(declaredSongId);
      const cutId = text(entry.planId || plan.planId || plan.id) || path.basename(planPath, ".json");
      if (!songId || !project || !Array.isArray(graph?.tracks)) {
        cuts.push(invalidCutResult({
          songId: songId || "saved-mint-plans",
          songTitle: text(project?.song_title || graph?.song?.title) || "Saved mint plan",
          cutId,
          cutTitle: "Saved mint plan snapshot",
          cutKind: "saved-mint-plan",
          sourcePath: planPath,
          code: !songId ? "saved-mint-plan-song-id-unsafe" : "saved-mint-plan-inputs-missing",
          stage: "mint-plan-input",
          message: "The saved mint plan does not contain a safe song ID plus complete project and Show Graph snapshots.",
        }));
        continue;
      }
      const compatibility = await resolveMintPlanCompatibility(plan);
      if (compatibility.status === "non-runnable") {
        cuts.push(invalidCutResult({
          songId,
          songTitle: text(project.song_title || graph.song?.title) || songId,
          cutId,
          cutTitle: `Saved mint plan (${text(plan.status) || "pending"})`,
          cutKind: "saved-mint-plan",
          sourcePath: planPath,
          code: compatibility.blocker?.code || "mint-plan-canonical-graph-unavailable",
          stage: "mint-plan-compatibility",
          message: compatibility.blocker?.message || "The saved mint plan is not safe to render.",
          details: {
            reasons: compatibility.reasons,
            graphInspection: compatibility.graphInspection,
          },
        }));
        continue;
      }
      const auditedInput = compatibility.status === "rehydrated" ? compatibility.input : plan.input;
      const canonical = canonicalSourceBySongId.get(songId);
      if (!canonical) {
        cuts.push(invalidCutResult({
          songId,
          songTitle: text(auditedInput.project?.song_title || auditedInput.showGraph?.song?.title) || songId,
          cutId,
          cutTitle: `Saved mint plan (${text(plan.status) || "pending"})`,
          cutKind: "saved-mint-plan",
          sourcePath: planPath,
          code: "saved-mint-plan-canonical-parent-missing",
          stage: "mint-plan-compatibility",
          message: "The active saved mint plan has no validated canonical album graph to bind its execution certificate.",
        }));
        continue;
      }
      let canonicalProject;
      let canonicalGraph;
      try {
        const currentProjectProof = stableJsonSourceProof(canonical.projectPath, "Canonical saved-plan project");
        const currentGraphProof = stableJsonSourceProof(canonical.graphPath, "Canonical saved-plan graph");
        if (
          currentProjectProof.sha256 !== canonical.projectSha256
          || JSON.stringify(currentProjectProof.statIdentity) !== JSON.stringify(canonical.projectProof.statIdentity)
          || currentGraphProof.sha256 !== canonical.graphSha256
          || JSON.stringify(currentGraphProof.statIdentity) !== JSON.stringify(canonical.graphProof.statIdentity)
        ) {
          throw new Error("The canonical parent changed after it was selected.");
        }
        canonicalProject = bodyOf(currentProjectProof.value);
        canonicalGraph = currentGraphProof.value;
      } catch (error) {
        cuts.push(invalidCutResult({
          songId,
          songTitle: text(auditedInput.project?.song_title || auditedInput.showGraph?.song?.title) || songId,
          cutId,
          cutTitle: `Saved mint plan (${text(plan.status) || "pending"})`,
          cutKind: "saved-mint-plan",
          sourcePath: planPath,
          code: "saved-mint-plan-canonical-parent-changed",
          stage: "mint-plan-compatibility",
          message: safeErrorMessage(error),
        }));
        continue;
      }
      const planFingerprint = entry.sourceProof?.sha256;
      if (!planFingerprint) {
        cuts.push(invalidCutResult({
          songId,
          songTitle: text(auditedInput.project?.song_title || auditedInput.showGraph?.song?.title) || songId,
          cutId,
          cutTitle: "Saved mint plan source proof",
          cutKind: "saved-mint-plan",
          sourcePath: planPath,
          code: "saved-mint-plan-source-proof-missing",
          stage: "mint-plan-input",
          message: "The saved mint plan was not read from one stable, immutable byte snapshot.",
        }));
        continue;
      }
      await auditDescriptor({
        songId,
        songTitle: text(auditedInput.project?.song_title || auditedInput.showGraph?.song?.title) || songId,
        cutId,
        cutTitle: `Saved mint plan (${text(plan.status) || "pending"})`,
        cutKind: "saved-mint-plan",
        sourcePath: planPath,
        resolutionProjectPath: projectSourceBySongId.get(songId) || planPath,
        project: auditedInput.project,
        graph: auditedInput.showGraph,
        canonicalProject,
        canonicalGraph,
        canonicalGraphPath: canonical.graphPath,
        canonicalGraphSha256: canonical.graphSha256,
        canonicalGraphProof: canonical.graphProof,
        canonicalParentIdentity: canonical.parentIdentity,
        cutFingerprint: planFingerprint,
        sourceInputSha256: planFingerprint,
        sourceProof: entry.sourceProof,
        mintPlanCompatibility: compatibility.receipt,
      });
    }
    telemetryAnalyses.releasePayloads();
  }

  try {
    assertJsonSourceProofFresh(proxyRegistryProof, "HyperFrames proxy registry");
    assertJsonSourceProofFresh(songRegistryProof, "Song registry");
    assertJsonSourceProofFresh(songbookProof, "Dear Papa songbook");
    assertFileSourceProofFresh(CERTIFIER_SOURCE_PROOF, "Echo readiness certifier");
    const [finalRendererBuild, finalDeliveryRuntimeBuild, finalShaderCatalog] = await Promise.all([
      inspectSongCardRendererBuildIdentity({ root: avatarRoot, refresh: true, strict: true }),
      inspectEchoDeliveryRuntimeBuildIdentity({ root: avatarRoot, refresh: true, strict: true }),
      new EchoIsfAssetCatalog({ musicVizRoot, cacheCheckMs: 0 }).load(),
    ]);
    const finalServerDeliveryBuild = inspectEchoServerDeliveryBuildIdentity({ root: avatarRoot });
    const finalShaderCatalogSourceSha256 = sha256Value({
      manifest: finalShaderCatalog.manifest,
      runtimeHash: finalShaderCatalog.runtime?.sourceHash || null,
      records: list(finalShaderCatalog.records).map((record) => ({
        id: record.id,
        hash: record.hash,
        fileSignature: record.fileSignature,
      })),
    });
    if (
      finalRendererBuild.sha256 !== rendererBuildIdentity.sha256
      || finalRendererBuild.sourceStatSignature !== rendererBuildIdentity.sourceStatSignature
      || finalDeliveryRuntimeBuild.sha256 !== deliveryRuntimeBuildIdentity.sha256
      || finalDeliveryRuntimeBuild.sourceStatSignature !== deliveryRuntimeBuildIdentity.sourceStatSignature
      || finalServerDeliveryBuild.sha256 !== serverDeliveryBuildIdentity.sha256
      || finalServerDeliveryBuild.sourceStatSignature !== serverDeliveryBuildIdentity.sourceStatSignature
      || sha256Value(finalShaderCatalog.shaders) !== shaderCatalogSha256
      || finalShaderCatalogSourceSha256 !== shaderCatalogSourceSha256
    ) {
      throw new Error("A renderer, delivery, server, or shader source changed during the readiness sweep.");
    }
  } catch (error) {
    cuts.push(invalidCutResult({
      songId: "album",
      songTitle: "Album global inputs",
      cutId: "global-input-cas",
      cutTitle: "Global registries, shader catalog, and delivery builds",
      sourcePath: avatarRoot,
      code: "readiness-global-input-changed",
      stage: "final-source-cas",
      message: `${safeErrorMessage(error)} Retry once the inputs are stable.`,
    }));
  }

  if (corpusSnapshots) {
    try {
      assertJsonCorpusSnapshotFresh(corpusSnapshots.projects, "Music-video project corpus");
      assertJsonCorpusSnapshotFresh(corpusSnapshots.variants, "Saved direction-cut corpus");
      assertJsonCorpusSnapshotFresh(corpusSnapshots.plans, "Saved mint-plan corpus");
      const queueStatus = savedMintPlanAudit.report.queue.status;
      if (savedMintPlanAudit.queueProof) {
        assertFileSourceProofFresh(savedMintPlanAudit.queueProof, "Song Card remint queue");
      } else if (queueStatus === "missing" && fs.existsSync(remintQueuePath)) {
        throw new Error("The Song Card remint queue appeared during the readiness sweep.");
      }
    } catch (error) {
      cuts.push(invalidCutResult({
        songId: "album",
        songTitle: "Album source set",
        cutId: "corpus-snapshot",
        cutTitle: "Whole-project source snapshot",
        sourcePath: avatarRoot,
        code: "readiness-corpus-changed",
        stage: "final-source-cas",
        message: `${safeErrorMessage(error)} Retry once the project and queue inputs are stable.`,
      }));
    }
  }

  if (!cuts.length) {
    cuts.push(invalidCutResult({
      songId: "album",
      songTitle: "Album render-readiness selection",
      cutId: "empty-selection",
      cutTitle: "No selected cuts",
      sourcePath: avatarRoot,
      code: "readiness-selection-empty",
      stage: "selection",
      message: "The requested selection resolved to zero cuts, so readiness cannot report success.",
    }));
  }

  const summary = aggregate(cuts, environment);
  const uniqueAudioInputs = [...audioValidationResults.values()];
  const audioInputAudit = {
    ok: uniqueAudioInputs.every((entry) => entry.ok),
    uniqueInputCount: uniqueAudioInputs.length,
    verifiedInputCount: uniqueAudioInputs.filter((entry) => entry.ok).length,
    blockedInputCount: uniqueAudioInputs.filter((entry) => !entry.ok).length,
    failures: uniqueAudioInputs.filter((entry) => !entry.ok),
  };
  const audioProbeCacheWrite = writeRenderAudioInputPreflightCache(audioProbeCachePath);
  const visualMediaInputs = [...visualMediaProbeResults.values()];
  const proxyImageInputs = [...proxyImageProbeResults.values()];
  const visualInputAudit = {
    visualMedia: {
      ok: visualMediaInputs.every((entry) => entry.ok),
      uniqueInputCount: visualMediaInputs.length,
      verifiedInputCount: visualMediaInputs.filter((entry) => entry.ok).length,
      blockedInputCount: visualMediaInputs.filter((entry) => !entry.ok).length,
      failures: visualMediaInputs.filter((entry) => !entry.ok),
    },
    proxyAtlases: {
      ok: proxyImageInputs.every((entry) => entry.ok),
      uniqueInputCount: proxyImageInputs.length,
      verifiedInputCount: proxyImageInputs.filter((entry) => entry.ok).length,
      blockedInputCount: proxyImageInputs.filter((entry) => !entry.ok).length,
      failures: proxyImageInputs.filter((entry) => !entry.ok),
    },
  };
  Object.assign(summary, {
    uniqueVerifiedAudioInputCount: audioInputAudit.verifiedInputCount,
    uniqueVerifiedVisualMediaInputCount: visualInputAudit.visualMedia.verifiedInputCount,
    uniqueVerifiedProxyAtlasInputCount: visualInputAudit.proxyAtlases.verifiedInputCount,
    activeSavedMintPlanCount: savedMintPlanAudit.report.activePlanCount,
    archivalSavedMintPlanCount: savedMintPlanAudit.report.archivalPlanCount,
    missingActiveSavedMintPlanCount: savedMintPlanAudit.report.missingActivePlanCount,
    unboundActiveMintCandidateCount: savedMintPlanAudit.report.unboundActiveCandidateCount,
  });
  const visualProbeCacheWrite = await writeRenderVisualMediaProbeCache(visualProbeCachePath);
  const telemetryAuditSummary = telemetryAnalyses.summary();
  const report = {
    schemaVersion: SCHEMA,
    generatedAt: new Date().toISOString(),
    truthBoundary: "No known deterministic graph, media-path, full audio/video decode, alpha-aware visual visibility sample, shader-atlas decode, proxy, or cue-runtime blocker. A final composition/encode can still fail if disk, memory, GPU/browser, or process state changes after this audit.",
    source: {
      avatarRoot,
      projectsRoot,
      variantsRoot,
      plansRoot,
      remintQueuePath,
      albumRoot,
      musicVizRoot,
      proxyRegistryPath,
      registryPath,
      visualProbeCachePath,
      audioProbeCachePath,
      telemetryCacheRoot,
      selection: requestedPlan ? {
        mode: "targeted-exact-plan",
        planId: requestedPlanId,
        planSha256: requestedPlanProof?.sha256 || null,
      } : options.project ? {
        mode: options.variant ? "targeted-project-variant" : "targeted-project",
        project: path.resolve(String(options.project)),
        variant: text(options.variant) || null,
      } : { mode: "whole-project" },
    },
    environment,
    rendererBuild: {
      schemaVersion: rendererBuildIdentity.schemaVersion,
      renderGateVersion: rendererBuildIdentity.renderGateVersion,
      sha256: rendererBuildIdentity.sha256,
      tools: rendererBuildIdentity.tools,
    },
    deliveryRuntimeBuild: {
      schemaVersion: deliveryRuntimeBuildIdentity.schemaVersion,
      contractVersion: deliveryRuntimeBuildIdentity.contractVersion,
      sha256: deliveryRuntimeBuildIdentity.sha256,
      sourceCount: deliveryRuntimeBuildIdentity.sources.length,
      servedBundleSha256: deliveryRuntimeBuildIdentity.servedBundle.sha256,
    },
    serverDeliveryBuild: {
      schemaVersion: serverDeliveryBuildIdentity.schemaVersion,
      sha256: serverDeliveryBuildIdentity.sha256,
      fileCount: serverDeliveryBuildIdentity.files.length,
    },
    shaderCatalogSourceSha256,
    savedMintPlanAudit: savedMintPlanAudit.report,
    corpusSnapshot: corpusSnapshots ? {
      status: cuts.some((cut) => cut.blockers?.some((blocker) => blocker.code === "readiness-corpus-changed")) ? "changed" : "stable",
      projectsSha256: corpusSnapshots.projects.sha256,
      variantsSha256: corpusSnapshots.variants.sha256,
      plansSha256: corpusSnapshots.plans.sha256,
    } : { status: "exact-source-scoped" },
    audioInputAudit,
    stemTelemetryAudit: telemetryAuditSummary,
    visualInputAudit,
    visualProbeCache: { load: visualProbeCacheLoad, write: visualProbeCacheWrite },
    audioProbeCache: { load: audioProbeCacheLoad, write: audioProbeCacheWrite },
    summary,
    rootCauseGroups: summary.rootCauseGroups,
    blockers: cuts.flatMap((cut) => cut.blockers.map((blocker) => ({ songId: cut.songId, songTitle: cut.songTitle, cutId: cut.cutId, ...blocker }))),
    cuts,
  };
  atomicJson(reportPath, report);
  process.stdout.write(`${JSON.stringify({ ...summary, report: reportPath }, null, 2)}\n`);
  process.exitCode = summary.ok ? 0 : summary.status === "environment-risk" ? 3 : 2;
}

async function runWithCertificationLock(options) {
  const avatarRoot = path.resolve(text(options["avatar-root"]) || ROOT);
  const release = acquireEchoReadinessCertificationLock({ avatarRoot });
  try {
    return await run(options);
  } finally {
    release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  let options;
  try {
    options = parseEchoRenderReadinessArgs(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`${safeErrorMessage(error)}\n\n${cliUsage()}\n`);
    process.exitCode = 64;
  }
  if (options?.help === true) {
    process.stdout.write(`${cliUsage()}\n`);
  } else if (options) runWithCertificationLock(options).catch((error) => {
    const avatarRoot = path.resolve(text(options["avatar-root"]) || ROOT);
    const reportPath = path.resolve(text(options.report) || path.join(avatarRoot, "artifacts/echo-render-readiness/report.json"));
    let selection = { mode: "whole-project" };
    const failedPlanId = text(options.plan);
    if (/^plan:[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/u.test(failedPlanId)) {
      try {
        const plansRoot = path.resolve(text(options.plans) || path.join(avatarRoot, "data/song-card-mints/plans"));
        const planProof = stableJsonSourceProof(path.join(plansRoot, `${failedPlanId.slice("plan:".length)}.json`), "Requested saved mint plan");
        assertRequestedMintPlanIdentity(planProof.value, failedPlanId);
        selection = { mode: "targeted-exact-plan", planId: failedPlanId, planSha256: planProof.sha256 };
      } catch { /* Keep a non-targeted failure report when the requested plan itself is unavailable. */ }
    }
    const cuts = [invalidCutResult({
      songId: "album",
      songTitle: "Album render-readiness inputs",
      cutId: "global-inputs",
      cutTitle: "Global registries and catalogs",
      sourcePath: avatarRoot,
      code: "global-readiness-input-unavailable",
      stage: "global-input",
      message: safeErrorMessage(error),
    })];
    const environment = {
      schemaVersion: "hapa.song-card.local-renderer-status.v1",
      available: true,
      configured: false,
      status: "not-inspected-after-global-input-failure",
    };
    const summary = aggregate(cuts, environment);
    const report = {
      schemaVersion: SCHEMA,
      generatedAt: new Date().toISOString(),
      truthBoundary: "The readiness sweep could not begin because a required global registry or catalog failed to load.",
      source: { avatarRoot, selection },
      environment,
      summary,
      blockers: cuts[0].blockers,
      cuts,
    };
    try {
      atomicJson(reportPath, report);
      process.stdout.write(`${JSON.stringify({ ...summary, report: reportPath }, null, 2)}\n`);
    } catch (reportError) {
      process.stderr.write(`Could not persist readiness failure report: ${safeErrorMessage(reportError)}\n`);
    }
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 2;
  });
}
