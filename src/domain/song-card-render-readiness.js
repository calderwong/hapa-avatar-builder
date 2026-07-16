import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  compileHyperFramesShow,
  inspectHyperFramesShow,
  preflightHyperFramesMedia,
} from "./hyperframes-show-compiler.js";
import {
  evaluateHyperFramesVisualizers,
  normalizeHyperFramesStemRole,
} from "./hyperframes-visualizer-runtime.js";
import { canonicalSha256 } from "./native-visualizer-route.js";
import { inspectPortableVisualizerAttachment } from "./portable-visualizer-card.js";

export const SONG_CARD_RENDER_READINESS_SCHEMA = "hapa.song-card.render-readiness.v1";

const ENGINE_VERSION = 1;
const MAX_DETAIL_ROWS = 12;
const SIGNAL_FIELDS = Object.freeze(["rms", "peak", "onset", "low", "mid", "high"]);

function text(value) {
  return String(value ?? "").trim();
}

function finite(value, fallback = 0) {
  return Number.isFinite(Number(value)) ? Number(value) : fallback;
}

function round(value, digits = 6) {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

function stableHash(value) {
  return `sha256:${crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex")}`;
}

function fileSha256(filePath) {
  return `sha256:${crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex")}`;
}

function usableRegularFile(candidate) {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function compact(values, limit = MAX_DETAIL_ROWS) {
  const rows = Array.isArray(values) ? values : [];
  return {
    values: rows.slice(0, limit),
    omittedCount: Math.max(0, rows.length - limit),
  };
}

function graphVisualizerCards(showGraph = {}) {
  return (showGraph.tracks || []).flatMap((track) => (track.cards || []).flatMap((card) => {
    const sourceId = text(card?.visualization?.sourceId || card?.visualization?.requestedSourceId || card?.visualization?.card?.id).toLowerCase();
    if (card?.disabled === true || card?.knockedOut === true || card?.knocked_out === true || sourceId === "none") return [];
    const requested = Boolean(card.visualization && (
      track.role === "visualizer"
      || track.id === "track-b"
      || card.visualization.card?.schemaVersion === "hapa.visualizer-card.v2"
    ));
    return requested ? [{ track, card }] : [];
  }));
}

function mappingStemFocus(value) {
  if (typeof value === "string") {
    const separator = value.lastIndexOf(":");
    return separator > 0 ? value.slice(0, separator) : "";
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value.stemFocus || value.stem_focus || value.stem || "";
  }
  return "";
}

function requestedStemRoles(showGraph = {}) {
  const roles = new Set();
  const add = (value) => {
    const role = normalizeHyperFramesStemRole(value);
    if (role && role !== "archivezip" && role !== "archive") roles.add(role);
  };
  for (const item of showGraph.stems?.items || []) add(item?.stemType || item?.role || item?.title || item?.id);
  for (const { card } of graphVisualizerCards(showGraph)) {
    const portable = card.visualization?.card || {};
    add(portable.stemFocus);
    add(card.visualization?.stemFocus);
    add(card.parameters?.stemFocus);
    add(card.provenance?.stemFocus);
    for (const mapping of Object.values(portable.audioMap || {})) add(mappingStemFocus(mapping));
    for (const mapping of Object.values(card.parameters?.visualizerMappings || {})) add(mappingStemFocus(mapping));
    for (const binding of Array.isArray(portable.automation) ? portable.automation : []) add(binding?.stemFocus);
  }
  roles.delete("master");
  return [...roles].sort();
}

function syntheticFrames(duration) {
  const end = Math.max(0.001, finite(duration, 1));
  return [
    { t: 0, rms: 0.23, peak: 0.41, onset: 0.17, low: 0.31, mid: 0.43, high: 0.53 },
    { t: round(end / 2, 9), rms: 0.67, peak: 0.82, onset: 0.74, low: 0.71, mid: 0.59, high: 0.47 },
    { t: round(end, 9), rms: 0.38, peak: 0.56, onset: 0.29, low: 0.42, mid: 0.51, high: 0.63 },
  ];
}

/**
 * Builds a deliberately small, deterministic signal bundle. It proves that the
 * compiled graph can bind every declared stem role without repeating real audio
 * analysis during a project-wide readiness scan.
 */
export function buildSongCardReadinessTelemetry(showGraph = {}) {
  const duration = Math.max(0.001, finite(showGraph.song?.durationSeconds, 1));
  const frames = syntheticFrames(duration);
  const roles = requestedStemRoles(showGraph);
  const syntheticRoles = roles.length ? roles : ["master"];
  return {
    schemaVersion: "hapa.song-card.synthetic-readiness-telemetry.v1",
    fps: 30,
    duration,
    stems: syntheticRoles.map((role) => ({
      id: `stem:readiness:${role}`,
      role,
      title: role,
      frames: structuredClone(frames),
    })),
    masterMix: {
      id: "master",
      role: "master",
      title: "Synthetic Master Mix",
      frames: structuredClone(frames),
    },
  };
}

function activeIn(instance, timeSeconds) {
  return Number.isFinite(Number(instance.start))
    && Number.isFinite(Number(instance.end))
    && timeSeconds >= Number(instance.start)
    && timeSeconds < Number(instance.end);
}

/**
 * Samples each cue at its midpoint and each distinct simultaneous-layer
 * signature at an interior point. Boundaries are intentionally avoided because
 * the runtime uses half-open intervals and transition opacity is zero at seams.
 */
export function songCardReadinessSampleTimes(visualizers = []) {
  const byTime = new Map();
  const append = (timeSeconds, kind, signature = "") => {
    if (!Number.isFinite(timeSeconds)) return;
    const time = round(timeSeconds, 9);
    const key = String(time);
    const current = byTime.get(key) || { timeSeconds: time, kinds: new Set(), overlapSignatures: new Set() };
    current.kinds.add(kind);
    if (signature) current.overlapSignatures.add(signature);
    byTime.set(key, current);
  };
  for (const instance of visualizers) {
    const start = Number(instance.start);
    const end = Number(instance.end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) append(start + ((end - start) / 2), "cue-midpoint");
  }

  const boundaries = [...new Set(visualizers.flatMap((instance) => [Number(instance.start), Number(instance.end)])
    .filter(Number.isFinite))].sort((left, right) => left - right);
  const seenSignatures = new Set();
  for (let index = 1; index < boundaries.length; index += 1) {
    const left = boundaries[index - 1];
    const right = boundaries[index];
    if (!(right > left)) continue;
    const midpoint = left + ((right - left) / 2);
    const signature = visualizers
      .filter((instance) => activeIn(instance, midpoint))
      .map((instance) => text(instance.cueId || instance.id))
      .sort()
      .join("+");
    if (!signature.includes("+") || seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);
    append(midpoint, "overlap-signature", signature);
  }
  return [...byTime.values()]
    .map((row) => ({
      timeSeconds: row.timeSeconds,
      kinds: [...row.kinds].sort(),
      overlapSignatures: [...row.overlapSignatures].sort(),
    }))
    .sort((left, right) => left.timeSeconds - right.timeSeconds);
}

function proxySourceCandidates(proxy = {}, proxyRegistryPath = "") {
  const registryPath = text(proxyRegistryPath) ? path.resolve(proxyRegistryPath) : "";
  const registryDirectory = registryPath ? path.dirname(registryPath) : "";
  const musicVizRoot = registryPath ? path.resolve(registryDirectory, "../../..") : "";
  const assetPath = text(proxy.assetPath);
  return [...new Set([
    proxy.repositoryPath && path.isAbsolute(text(proxy.repositoryPath))
      ? path.normalize(text(proxy.repositoryPath))
      : musicVizRoot && proxy.repositoryPath
        ? path.resolve(musicVizRoot, text(proxy.repositoryPath))
        : "",
    musicVizRoot && assetPath.startsWith("/static/")
      ? path.resolve(musicVizRoot, "web", assetPath.replace(/^\/static\//, ""))
      : "",
    assetPath
      ? path.isAbsolute(assetPath)
        ? path.normalize(assetPath)
        : registryDirectory
          ? path.resolve(registryDirectory, assetPath)
          : ""
      : "",
  ].filter(Boolean))];
}

function auditProxyAssets(visualizers, proxyRegistryPath, addBlocker) {
  const groups = new Map();
  for (const instance of visualizers) {
    if (!instance.proxy) continue;
    const key = stableHash({
      assetSha256: canonicalSha256(instance.proxy.assetSha256),
      repositoryPath: text(instance.proxy.repositoryPath),
      assetPath: text(instance.proxy.assetPath),
    });
    const group = groups.get(key) || { key, proxy: instance.proxy, cueIds: [], visualizerIds: [] };
    group.cueIds.push(text(instance.cueId || instance.id));
    group.visualizerIds.push(text(instance.visualizerId));
    groups.set(key, group);
  }

  const entries = [];
  for (const group of groups.values()) {
    const expectedSha256 = canonicalSha256(group.proxy.assetSha256);
    const attemptedPaths = proxySourceCandidates(group.proxy, proxyRegistryPath);
    let firstReadablePath = null;
    let firstReadableSha256 = null;
    let resolvedPath = null;
    for (const candidate of attemptedPaths) {
      if (!usableRegularFile(candidate)) continue;
      let actualSha256;
      try {
        actualSha256 = fileSha256(candidate);
      } catch {
        continue;
      }
      if (!firstReadablePath) {
        firstReadablePath = candidate;
        firstReadableSha256 = actualSha256;
      }
      if (expectedSha256 && actualSha256 === expectedSha256) {
        resolvedPath = candidate;
        break;
      }
    }
    const playbackProof = group.proxy.playbackProof || {};
    const playbackProofOk = playbackProof.verified === true
      && Number(playbackProof.declaredFrameCount) === Number(group.proxy.frameCount)
      && playbackProof.allFramesNonBlank === true
      && playbackProof.allFramesNonFlat === true
      && playbackProof.allFramesPlayable === true;
    const reason = !text(proxyRegistryPath)
      ? "proxy-registry-path-missing"
      : !attemptedPaths.length || !firstReadablePath
        ? "exact-proxy-asset-unavailable"
        : !resolvedPath
          ? "exact-proxy-asset-hash-mismatch"
          : !playbackProofOk
            ? "exact-proxy-playback-proof-invalid"
            : "exact-proxy-asset-resolved";
    const ok = reason === "exact-proxy-asset-resolved";
    const cueIds = [...new Set(group.cueIds)].sort();
    const visualizerIds = [...new Set(group.visualizerIds)].sort();
    const entry = {
      assetKey: group.key,
      expectedSha256: expectedSha256 || null,
      actualSha256: resolvedPath ? expectedSha256 : firstReadableSha256,
      resolvedPath,
      attemptedPaths,
      expectedWidth: Number(group.proxy.atlasWidth || 0),
      expectedHeight: Number(group.proxy.atlasHeight || 0),
      playbackProof,
      cueCount: cueIds.length,
      cueIds: cueIds.slice(0, MAX_DETAIL_ROWS),
      visualizerIds: visualizerIds.slice(0, MAX_DETAIL_ROWS),
      ok,
      reason,
    };
    entries.push(entry);
    if (!ok) {
      addBlocker({
        code: reason,
        stage: "proxy-assets",
        message: reason === "proxy-registry-path-missing"
          ? "The proxy registry path is required to resolve hash-bound shader assets."
          : reason === "exact-proxy-asset-hash-mismatch"
            ? "A shader proxy file exists, but its bytes do not match the declared SHA-256."
            : reason === "exact-proxy-playback-proof-invalid"
              ? "A shader proxy lacks verified nonblank, nonflat, playable metrics for every declared atlas frame."
            : "A declared exact shader proxy asset is not readable from the registry-anchored paths.",
        visualizerId: visualizerIds[0] || null,
        cueId: cueIds[0] || null,
        details: {
          expectedSha256: expectedSha256 || null,
          actualSha256: firstReadableSha256,
          cueCount: cueIds.length,
          attemptedPaths: attemptedPaths.slice(0, 4),
        },
      });
    }
  }
  entries.sort((left, right) => left.assetKey.localeCompare(right.assetKey));
  return {
    ok: entries.every((entry) => entry.ok),
    uniqueAssetCount: entries.length,
    resolvedAssetCount: entries.filter((entry) => entry.ok).length,
    entries,
  };
}

function compactPreflight(preflight, provided) {
  const errors = Array.isArray(preflight?.errors) ? preflight.errors.map(text).filter(Boolean) : [];
  const unresolved = Array.isArray(preflight?.unresolved) ? preflight.unresolved : [];
  return {
    provided,
    schemaVersion: text(preflight?.schemaVersion) || null,
    ok: preflight?.ok === true,
    errors: compact(errors),
    declaredCount: Number.isFinite(Number(preflight?.declaredCount)) ? Number(preflight.declaredCount) : null,
    unresolvedCount: Number.isFinite(Number(preflight?.unresolvedCount)) ? Number(preflight.unresolvedCount) : unresolved.length,
  };
}

function expectedLayerSummary(instance) {
  return {
    cueId: text(instance.cueId || instance.id),
    visualizerId: text(instance.visualizerId),
    stemFocus: text(instance.stemFocus || "master"),
    canonicalStemRole: normalizeHyperFramesStemRole(instance.stemFocus || "master") || "master",
  };
}

function actualLayerSummary(layer) {
  return {
    cueId: text(layer.cueId || layer.id),
    visualizerId: text(layer.visualizerId),
    stemFocus: text(layer.stemFocus || "master"),
    canonicalStemRole: normalizeHyperFramesStemRole(layer.stemFocus || "master") || "master",
    effectiveOpacity: Number.isFinite(Number(layer.effectiveOpacity)) ? Number(layer.effectiveOpacity) : null,
    frameIndex: Number.isInteger(Number(layer.proxyFrame?.frameIndex)) ? Number(layer.proxyFrame.frameIndex) : null,
  };
}

function sameExpectedLayer(actual, expected) {
  return text(actual.cueId || actual.id) === text(expected.cueId || expected.id)
    && text(actual.visualizerId) === text(expected.visualizerId)
    && normalizeHyperFramesStemRole(actual.stemFocus || "master") === normalizeHyperFramesStemRole(expected.stemFocus || "master");
}

function signalFrameFinite(resource) {
  const frame = resource?.frame;
  return Boolean(frame && SIGNAL_FIELDS.every((name) => Number.isFinite(Number(frame[name]))));
}

function proxyFrameInBounds(layer) {
  const proxy = layer.proxy || {};
  const frame = layer.proxyFrame || {};
  const frameIndex = Number(frame.frameIndex);
  const frameCount = Number(proxy.frameCount);
  const atlasWidth = Number(proxy.atlasWidth);
  const atlasHeight = Number(proxy.atlasHeight);
  const rect = Array.isArray(frame.sourceRect) ? frame.sourceRect.map(Number) : [];
  return Number.isInteger(frameIndex)
    && Number.isInteger(frameCount)
    && frameIndex >= 0
    && frameIndex < frameCount
    && rect.length === 4
    && rect.every(Number.isFinite)
    && rect[0] >= 0
    && rect[1] >= 0
    && rect[2] > 0
    && rect[3] > 0
    && Number.isFinite(atlasWidth)
    && Number.isFinite(atlasHeight)
    && rect[0] + rect[2] <= atlasWidth
    && rect[1] + rect[3] <= atlasHeight;
}

function runtimeAudit(show, addBlocker) {
  const visualizers = show.instances?.visualizers || [];
  const samples = songCardReadinessSampleTimes(visualizers);
  const failures = [];
  let evaluatedLayerCount = 0;
  for (const sample of samples) {
    const expected = visualizers.filter((instance) => activeIn(instance, sample.timeSeconds));
    const state = evaluateHyperFramesVisualizers(show, sample.timeSeconds);
    const actual = Array.isArray(state.layers) ? state.layers : [];
    evaluatedLayerCount += actual.length;
    const issues = [];
    const missing = expected.filter((instance) => !actual.some((layer) => sameExpectedLayer(layer, instance)));
    const unexpected = actual.filter((layer) => !expected.some((instance) => sameExpectedLayer(layer, instance)));
    if (missing.length) issues.push("active-layer-identity-mismatch");
    if (unexpected.length) issues.push("unexpected-active-layer");
    const receiptIds = [...new Set(state.receipt?.activeCandidateIds || [])].sort();
    const expectedIds = [...new Set(expected.map((instance) => text(instance.id)))].sort();
    if (JSON.stringify(receiptIds) !== JSON.stringify(expectedIds)) issues.push("active-candidate-receipt-mismatch");
    if ((state.diagnostics || []).length) issues.push("runtime-diagnostics-present");
    if (actual.some((layer) => (layer.diagnostics || []).length)) issues.push("layer-diagnostics-present");
    if (actual.some((layer) => !(Number(layer.effectiveOpacity) > 0))) issues.push("nonpositive-effective-opacity");
    if (actual.some((layer) => !proxyFrameInBounds(layer))) issues.push("proxy-frame-out-of-bounds");
    if (actual.some((layer) => (
      !Number.isFinite(Number(layer.stemSignal))
      || !Number.isFinite(Number(layer.signalValue))
      || !signalFrameFinite(layer.stemFrame)
      || !signalFrameFinite(layer.masterFrame)
      || (layer.presentationModulation && ["primaryValue", "accentValue", "energy"].some((name) => !Number.isFinite(Number(layer.presentationModulation[name]))))
    ))) issues.push("runtime-signal-nonfinite");
    if (actual.some((layer) => canonicalSha256(layer.proxyFrame?.assetSha256) !== canonicalSha256(layer.proxy?.assetSha256))) {
      issues.push("runtime-proxy-hash-detached");
    }
    if (!issues.length) continue;
    const failure = {
      timeSeconds: sample.timeSeconds,
      kinds: sample.kinds,
      issues: [...new Set(issues)].sort(),
      expected: expected.map(expectedLayerSummary),
      actual: actual.map(actualLayerSummary),
      runtimeDiagnosticCount: (state.diagnostics || []).length,
      layerDiagnosticCount: actual.reduce((sum, layer) => sum + (layer.diagnostics || []).length, 0),
      runtimeDiagnostics: (state.diagnostics || []).slice(0, MAX_DETAIL_ROWS),
      layerDiagnostics: [...new Set(actual.flatMap((layer) => layer.diagnostics || []))].sort().slice(0, MAX_DETAIL_ROWS),
    };
    failures.push(failure);
    for (const code of failure.issues) {
      addBlocker({
        code,
        stage: "runtime-semantics",
        message: `The deterministic shader runtime failed ${code} at ${sample.timeSeconds.toFixed(3)}s.`,
        sampleTimeSeconds: sample.timeSeconds,
        cueId: failure.expected[0]?.cueId || failure.actual[0]?.cueId || null,
        details: {
          expectedCueIds: failure.expected.map((row) => row.cueId).slice(0, MAX_DETAIL_ROWS),
          actualCueIds: failure.actual.map((row) => row.cueId).slice(0, MAX_DETAIL_ROWS),
          runtimeDiagnosticCount: failure.runtimeDiagnosticCount,
          layerDiagnosticCount: failure.layerDiagnosticCount,
          runtimeDiagnostics: failure.runtimeDiagnostics,
          layerDiagnostics: failure.layerDiagnostics,
        },
      });
    }
  }
  return {
    ok: failures.length === 0,
    sampleCount: samples.length,
    overlapSignatureCount: new Set(samples.flatMap((sample) => sample.overlapSignatures)).size,
    evaluatedLayerCount,
    failures: failures.slice(0, MAX_DETAIL_ROWS),
    omittedFailureCount: Math.max(0, failures.length - MAX_DETAIL_ROWS),
  };
}

function inputPreflightBlocker(kind, preflight, addBlocker) {
  const expectedSchema = kind === "media"
    ? "hapa.hyperframes.media-preflight.v1"
    : "hapa.song-card.signal-graph-preflight.v1";
  const errors = Array.isArray(preflight?.errors) ? preflight.errors.map(text).filter(Boolean) : [];
  const unresolved = Array.isArray(preflight?.unresolved) ? preflight.unresolved : [];
  const unresolvedStemBindings = Array.isArray(preflight?.unresolvedStemBindings) ? preflight.unresolvedStemBindings : [];
  const detachedVisualizers = Array.isArray(preflight?.detachedVisualizers) ? preflight.detachedVisualizers : [];
  const unresolvedCount = Number.isFinite(Number(preflight?.unresolvedCount))
    ? Number(preflight.unresolvedCount)
    : unresolved.length;
  const contractIssues = [
    ...(!preflight || typeof preflight !== "object" ? ["preflight-object-missing"] : []),
    ...(text(preflight?.schemaVersion) !== expectedSchema ? ["preflight-schema-mismatch"] : []),
    ...(preflight?.ok !== true ? ["preflight-not-ok"] : []),
    ...(errors.length ? ["preflight-errors-present"] : []),
    ...(unresolvedCount > 0 || unresolved.length ? ["preflight-unresolved-present"] : []),
    ...(kind === "signal-graph" && unresolvedStemBindings.length ? ["unresolved-stem-bindings-present"] : []),
    ...(kind === "signal-graph" && detachedVisualizers.length ? ["detached-visualizers-present"] : []),
  ];
  if (!contractIssues.length) return;
  const detachedVisualizerDetails = detachedVisualizers.slice(0, MAX_DETAIL_ROWS).map((row) => {
    const cardId = text(row?.cardId || row?.card);
    const sourceId = text(row?.sourceId || row?.source);
    const sourceTitle = text(row?.sourceTitle || row?.title);
    const startSeconds = row?.startSeconds ?? row?.start;
    const endSeconds = row?.endSeconds ?? row?.end;
    return {
      ...(cardId ? { cardId } : {}),
      ...(sourceId ? { sourceId } : {}),
      ...(sourceTitle ? { sourceTitle } : {}),
      ...(startSeconds !== null && startSeconds !== undefined && text(startSeconds) && Number.isFinite(Number(startSeconds))
        ? { startSeconds: Number(startSeconds) }
        : {}),
      ...(endSeconds !== null && endSeconds !== undefined && text(endSeconds) && Number.isFinite(Number(endSeconds))
        ? { endSeconds: Number(endSeconds) }
        : {}),
      ...(text(row?.reason) ? { reason: text(row.reason) } : {}),
    };
  });
  const firstDetachedVisualizer = detachedVisualizerDetails[0] || {};
  const cueIds = [
    ...unresolved.map((row) => text(row?.cueId || row?.cardId)),
    ...detachedVisualizerDetails.map((row) => text(row.cardId)),
  ].filter(Boolean);
  addBlocker({
    code: `${kind}-preflight-failed`,
    stage: `${kind}-preflight`,
    message: kind === "media"
      ? "One or more media cues cannot be resolved before local rendering."
      : detachedVisualizerDetails.length
        ? "One or more selected shaders are detached from their portable final-render cards."
        : "The selected cut has detached stem paths or portable visualizer bindings.",
    cueId: cueIds[0] || null,
    visualizerId: firstDetachedVisualizer.sourceId || null,
    details: {
      errors: errors.slice(0, MAX_DETAIL_ROWS),
      contractIssues,
      expectedSchema,
      actualSchema: text(preflight?.schemaVersion) || null,
      unresolvedCount,
      unresolvedStemBindingCount: unresolvedStemBindings.length,
      detachedVisualizerCount: detachedVisualizers.length,
      detachedVisualizers: detachedVisualizerDetails,
      cueIds: cueIds.slice(0, MAX_DETAIL_ROWS),
    },
  });
}

function emptyCounts(blockerCount = 0) {
  return {
    mediaCueCount: 0,
    visualizerCueCount: 0,
    exactVisualizerCueCount: 0,
    unsupportedVisualizerCueCount: 0,
    silentDefaultVisualizerCueCount: 0,
    semanticSampleCount: 0,
    overlapSignatureCount: 0,
    evaluatedLayerCount: 0,
    uniqueProxyAssetCount: 0,
    resolvedProxyAssetCount: 0,
    blockerCount,
  };
}

/**
 * Performs the deterministic, no-render portion of Song Card readiness. This
 * gate catches graph, stem-binding, media, proxy, and runtime-contract failures;
 * GPU pixel output and the final encoder remain bounded execution checks.
 */
export function preflightSongCardRenderReadiness({
  project = {},
  showGraph = {},
  proxyRegistry = {},
  proxyRegistryPath = "",
  root = ".",
  projectPath = "",
  signalPreflight = null,
  signalGraphPreflight = null,
  mediaPreflight = null,
} = {}) {
  const blockers = [];
  const blockerKeys = new Set();
  const addBlocker = (blocker) => {
    const normalized = {
      code: text(blocker.code) || "render-readiness-failed",
      stage: text(blocker.stage) || "readiness",
      message: text(blocker.message) || "The render readiness gate failed.",
      ...(blocker.cueId ? { cueId: text(blocker.cueId) } : {}),
      ...(blocker.visualizerId ? { visualizerId: text(blocker.visualizerId) } : {}),
      ...(Number.isFinite(Number(blocker.sampleTimeSeconds)) ? { sampleTimeSeconds: Number(blocker.sampleTimeSeconds) } : {}),
      ...(blocker.details ? { details: blocker.details } : {}),
    };
    const key = stableHash(normalized);
    if (!blockerKeys.has(key)) {
      blockerKeys.add(key);
      blockers.push(normalized);
    }
  };

  const effectiveSignalPreflight = signalGraphPreflight || signalPreflight;
  if (!effectiveSignalPreflight) {
    addBlocker({
      code: "signal-graph-preflight-missing",
      stage: "signal-graph-preflight",
      message: "Verified isolated-stem paths and portable visualizer bindings are required before render readiness can pass.",
    });
  } else {
    inputPreflightBlocker("signal-graph", effectiveSignalPreflight, addBlocker);
  }

  for (const { card } of graphVisualizerCards(showGraph)) {
    const attachment = inspectPortableVisualizerAttachment(card);
    if (attachment.ok) continue;
    addBlocker({
      code: "portable-visualizer-attachment-invalid",
      stage: "visualizer-contract",
      message: "A requested visualizer is not bound to a matching portable card with a canonical SHA-256 source identity.",
      cueId: text(card?.id),
      visualizerId: attachment.requestedSourceId || attachment.cardId,
      details: {
        errors: attachment.errors,
        requestedSourceIds: attachment.requestedSourceIds,
        portableCardId: attachment.cardId,
        sourceUri: attachment.sourceUri,
        sourceHash: attachment.sourceHash,
      },
    });
  }

  let show;
  let inspection;
  try {
    show = compileHyperFramesShow({
      showGraph,
      telemetry: buildSongCardReadinessTelemetry(showGraph),
      project,
      proxyRegistry,
      fps: 30,
    });
    inspection = inspectHyperFramesShow(show);
  } catch (error) {
    addBlocker({
      code: "show-compile-failed",
      stage: "compile",
      message: text(error?.message) || "The exact show graph could not be compiled.",
    });
    const checks = {
      compiler: { ok: false, showHash: null },
      inspection: { ok: false, rawOk: false, errors: ["show-not-compiled"], acceptedErrors: [] },
      signalGraph: compactPreflight(effectiveSignalPreflight, Boolean(effectiveSignalPreflight)),
      media: compactPreflight(mediaPreflight, Boolean(mediaPreflight)),
      visualizers: { ok: false },
      proxyAssets: { ok: false, uniqueAssetCount: 0, resolvedAssetCount: 0, entries: [] },
      runtime: { ok: false, sampleCount: 0, overlapSignatureCount: 0, evaluatedLayerCount: 0, failures: [], omittedFailureCount: 0 },
    };
    const fingerprint = stableHash({ schemaVersion: SONG_CARD_RENDER_READINESS_SCHEMA, engineVersion: ENGINE_VERSION, blockers, checks });
    return {
      schemaVersion: SONG_CARD_RENDER_READINESS_SCHEMA,
      status: "blocked",
      ok: false,
      fingerprint,
      blockers,
      counts: emptyCounts(blockers.length),
      checks,
    };
  }

  const mediaRows = show.instances?.media || [];
  const visualizers = show.instances?.visualizers || [];
  const acceptedInspectionErrors = [];
  const effectiveInspectionErrors = inspection.errors;
  for (const error of effectiveInspectionErrors) {
    const [code, cueId] = text(error).split(":", 2);
    addBlocker({
      code: `show-inspection-${code || "failed"}`,
      stage: "inspect",
      message: `The compiled show failed deterministic inspection: ${error}.`,
      cueId: cueId || null,
    });
  }

  const exactRows = [];
  for (const instance of visualizers) {
    const cueId = text(instance.cueId || instance.id);
    const visualizerId = text(instance.visualizerId);
    const exact = instance.execution?.route === "hash-bound-exact-proxy"
      && instance.execution?.status === "exact"
      && instance.execution?.drawable === true
      && instance.rendererTruth?.status === "exact"
      && instance.rendererTruth?.route === "hash-bound-exact-proxy"
      && instance.rendererTruth?.visible === true
      && instance.proxy;
    if (!exact) {
      addBlocker({
        code: "visualizer-route-not-exact",
        stage: "visualizer-contract",
        message: "A requested visualizer has no exact, drawable HyperFrames proxy route.",
        cueId,
        visualizerId,
        details: {
          route: instance.execution?.route || null,
          status: instance.execution?.status || null,
          reason: instance.execution?.reason || instance.rendererTruth?.reason || null,
        },
      });
    } else {
      exactRows.push(instance);
    }
    if (instance.execution?.silentDefault !== false || instance.rendererTruth?.silentDefault !== false) {
      addBlocker({
        code: "visualizer-silent-default",
        stage: "visualizer-contract",
        message: "A requested visualizer can silently fall back instead of failing visibly.",
        cueId,
        visualizerId,
      });
    }
    const declaredSha256 = canonicalSha256(instance.declaredSourceHash);
    const resolvedSha256 = canonicalSha256(instance.sourceHash);
    if (/^sha256:[a-f0-9]{64}$/.test(declaredSha256) && declaredSha256 !== resolvedSha256) {
      addBlocker({
        code: "visualizer-declared-source-hash-mismatch",
        stage: "visualizer-contract",
        message: "The registry proxy source hash does not match the portable visualizer card source hash.",
        cueId,
        visualizerId,
        details: { declaredSourceHash: declaredSha256, resolvedSourceHash: resolvedSha256 },
      });
    }
  }

  const resolvedMediaPreflight = mediaPreflight || preflightHyperFramesMedia(show, {
    project,
    root,
    projectPath,
    isFile: usableRegularFile,
  });
  inputPreflightBlocker("media", resolvedMediaPreflight, addBlocker);

  const proxyAssets = auditProxyAssets(exactRows, proxyRegistryPath, addBlocker);
  const runtime = runtimeAudit(show, addBlocker);
  blockers.sort((left, right) => (
    left.stage.localeCompare(right.stage)
    || left.code.localeCompare(right.code)
    || text(left.cueId).localeCompare(text(right.cueId))
    || finite(left.sampleTimeSeconds) - finite(right.sampleTimeSeconds)
  ));

  const checks = {
    compiler: { ok: true, showHash: show.showHash },
    inspection: {
      ok: effectiveInspectionErrors.length === 0,
      rawOk: inspection.ok,
      errors: effectiveInspectionErrors,
      acceptedErrors: acceptedInspectionErrors,
    },
    signalGraph: compactPreflight(effectiveSignalPreflight, Boolean(effectiveSignalPreflight)),
    media: compactPreflight(resolvedMediaPreflight, Boolean(mediaPreflight)),
    visualizers: {
      ok: exactRows.length === visualizers.length
        && visualizers.every((instance) => instance.execution?.silentDefault === false && instance.rendererTruth?.silentDefault === false),
      requestedCount: visualizers.length,
      exactCount: exactRows.length,
      unsupportedCount: visualizers.filter((instance) => instance.execution?.route === "unsupported").length,
      silentDefaultCount: visualizers.filter((instance) => instance.execution?.silentDefault !== false || instance.rendererTruth?.silentDefault !== false).length,
    },
    proxyAssets,
    runtime,
  };
  const ok = blockers.length === 0;
  const counts = {
    mediaCueCount: mediaRows.length,
    visualizerCueCount: visualizers.length,
    exactVisualizerCueCount: exactRows.length,
    unsupportedVisualizerCueCount: checks.visualizers.unsupportedCount,
    silentDefaultVisualizerCueCount: checks.visualizers.silentDefaultCount,
    semanticSampleCount: runtime.sampleCount,
    overlapSignatureCount: runtime.overlapSignatureCount,
    evaluatedLayerCount: runtime.evaluatedLayerCount,
    uniqueProxyAssetCount: proxyAssets.uniqueAssetCount,
    resolvedProxyAssetCount: proxyAssets.resolvedAssetCount,
    blockerCount: blockers.length,
  };
  const fingerprint = stableHash({
    schemaVersion: SONG_CARD_RENDER_READINESS_SCHEMA,
    engineVersion: ENGINE_VERSION,
    showHash: show.showHash,
    signalGraph: checks.signalGraph,
    media: checks.media,
    inspection: checks.inspection,
    visualizers: checks.visualizers,
    proxyAssets: proxyAssets.entries.map((entry) => ({
      assetKey: entry.assetKey,
      expectedSha256: entry.expectedSha256,
      actualSha256: entry.actualSha256,
      resolvedPath: entry.resolvedPath,
      ok: entry.ok,
    })),
    runtime: { sampleCount: runtime.sampleCount, overlapSignatureCount: runtime.overlapSignatureCount, failures: runtime.failures },
    blockers,
  });
  return {
    schemaVersion: SONG_CARD_RENDER_READINESS_SCHEMA,
    status: ok ? "ready" : "blocked",
    ok,
    fingerprint,
    blockers,
    counts,
    checks,
  };
}

export const SongCardRenderReadiness = Object.freeze({
  schemaVersion: SONG_CARD_RENDER_READINESS_SCHEMA,
  buildSongCardReadinessTelemetry,
  songCardReadinessSampleTimes,
  preflightSongCardRenderReadiness,
});
