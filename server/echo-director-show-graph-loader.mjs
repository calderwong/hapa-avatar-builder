import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { validateEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";
import { resolveEchoExecutionGraph } from "./echo-execution-graph-store.mjs";
import { resolveEchoRuntimeMediaUri } from "./echo-runtime-media-route.mjs";

const text = (value) => String(value ?? "").trim();
const SHA256 = /^sha256:[a-f0-9]{64}$/iu;
const executionInputProofCache = new Map();
const executionVisualInputProofCache = new Map();
const EXECUTION_INPUT_PROOF_CACHE_LIMIT = 256;

function within(root, candidate) {
  return candidate === root || candidate.startsWith(`${root}${path.sep}`);
}

function stableGraphValue(value) {
  if (Array.isArray(value)) return value.map(stableGraphValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stableGraphValue(value[key])]));
  }
  return value;
}

function stableGraphSha256(value) {
  return `sha256:${createHash("sha256").update(JSON.stringify(stableGraphValue(value))).digest("hex")}`;
}

export function guardEchoCertifiedGraphDelivery({ graphResult, shaderRepair, currentRegistries = {} } = {}) {
  if (graphResult?.receipt?.source !== "validated-derived-execution-graph") {
    return { graphResult, shaderRepair, ok: true, certified: false, reasons: [] };
  }
  const certifiedRegistries = graphResult.receipt?.executionGraph?.registries || {};
  const reasons = [];
  if (
    !graphResult?.graph
    || !shaderRepair?.graph
    || stableGraphSha256(shaderRepair.graph) !== stableGraphSha256(graphResult.graph)
    || (shaderRepair?.replacements || []).length
    || (shaderRepair?.hydrations || []).length
  ) reasons.push("certified-graph-requires-runtime-shader-repair");
  for (const [field, reason] of [
    ["shaderCatalogSha256", "shader-catalog-changed-after-certification"],
    ["proxyRegistrySha256", "proxy-registry-changed-after-certification"],
    ["songRegistrySha256", "song-registry-changed-after-certification"],
    ["songbookSha256", "songbook-changed-after-certification"],
  ]) {
    if (!SHA256.test(text(currentRegistries?.[field])) || certifiedRegistries?.[field] !== currentRegistries[field]) reasons.push(reason);
  }
  const certifiedRendererBuildSha256 = text(graphResult.receipt?.executionGraph?.rendererBuildSha256);
  if (
    !SHA256.test(text(currentRegistries?.rendererBuildSha256))
    || certifiedRendererBuildSha256 !== text(currentRegistries.rendererBuildSha256)
  ) reasons.push("renderer-build-changed-after-certification");
  const certifiedDeliveryRuntimeBuildSha256 = text(graphResult.receipt?.executionGraph?.deliveryRuntimeBuildSha256);
  if (
    !SHA256.test(text(currentRegistries?.deliveryRuntimeBuildSha256))
    || certifiedDeliveryRuntimeBuildSha256 !== text(currentRegistries.deliveryRuntimeBuildSha256)
  ) reasons.push("delivery-runtime-build-changed-after-certification");
  const certifiedServerDeliveryBuildSha256 = text(graphResult.receipt?.executionGraph?.serverDeliveryBuildSha256);
  if (
    !SHA256.test(text(currentRegistries?.serverDeliveryBuildSha256))
    || certifiedServerDeliveryBuildSha256 !== text(currentRegistries.serverDeliveryBuildSha256)
  ) reasons.push("server-delivery-build-changed-after-certification");
  if (!reasons.length) {
    return {
      graphResult,
      shaderRepair: { ...shaderRepair, graph: graphResult.graph },
      ok: true,
      certified: true,
      reasons: [],
    };
  }
  const blockedGraphResult = {
    graph: null,
    receipt: {
      ...(graphResult?.receipt || {}),
      status: "preparing",
      reason: "certified_execution_graph_inputs_changed",
      reasons,
    },
  };
  return {
    graphResult: blockedGraphResult,
    shaderRepair: { ...(shaderRepair || {}), graph: null },
    ok: false,
    certified: true,
    reasons,
  };
}

function streamSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(`sha256:${hash.digest("hex")}`));
  });
}

function rememberExecutionInputProof(cache, key, value) {
  if (cache.has(key)) cache.delete(key);
  cache.set(key, value);
  while (cache.size > EXECUTION_INPUT_PROOF_CACHE_LIMIT) cache.delete(cache.keys().next().value);
}

export async function verifyEchoExecutionInputEvidence(inputs = [], {
  cache = executionInputProofCache,
  hashFile = streamSha256,
  runtimeRouteContext = null,
  resolveRuntimeUri = resolveEchoRuntimeMediaUri,
} = {}) {
  const rows = Array.isArray(inputs) ? inputs : [];
  if (!rows.length) return { ok: false, reason: "execution-input-evidence-missing", findings: [] };
  const findings = [];
  const seen = new Set();
  for (const entry of rows) {
    const candidate = text(entry?.path);
    const expectedSha256 = text(entry?.contentSha256);
    const expectedStatKey = text(entry?.statIdentityKey);
    const identityParts = expectedStatKey.split("\u0000");
    const inputClass = text(entry?.inputClass);
    const routeBindings = Array.isArray(entry?.routeBindings) ? entry.routeBindings : [];
    if (
      !candidate
      || !inputClass
      || !SHA256.test(expectedSha256)
      || identityParts.length !== 7
      || (inputClass === "master-audio" && !routeBindings.length)
    ) {
      findings.push({ code: "execution-input-evidence-invalid", path: candidate || null });
      continue;
    }
    const resolvedPath = path.resolve(candidate);
    if (inputClass === "master-audio") {
      for (const binding of routeBindings) {
        const route = resolveRuntimeUri(text(binding?.uri), runtimeRouteContext || {});
        if (!route?.ok) {
          findings.push({ code: "execution-audio-runtime-route-unverified", path: resolvedPath, uri: text(binding?.uri) || null, reason: route?.reason || null });
          continue;
        }
        if (text(binding?.route) && route.route !== text(binding.route)) {
          findings.push({ code: "execution-audio-runtime-route-class-changed", path: resolvedPath, uri: text(binding?.uri) || null, expectedRoute: text(binding.route), observedRoute: route.route || null });
          continue;
        }
        if (path.resolve(route.resolvedPath) !== resolvedPath) {
          findings.push({ code: "execution-audio-runtime-route-changed", path: resolvedPath, uri: text(binding?.uri) || null, observedPath: path.resolve(route.resolvedPath) });
        }
      }
      if (findings.some((finding) => finding.path === resolvedPath)) continue;
    }
    if (seen.has(`${resolvedPath}\u0000${expectedSha256}`)) continue;
    seen.add(`${resolvedPath}\u0000${expectedSha256}`);
    try {
      const fileStat = await stat(resolvedPath);
      if (!fileStat.isFile() || fileStat.size <= 0) throw new Error("not-a-readable-file");
      const currentStatKey = [
        identityParts[0],
        resolvedPath,
        Number(fileStat.dev),
        Number(fileStat.ino),
        Number(fileStat.size),
        Number(fileStat.mtimeMs),
        Number(fileStat.ctimeMs),
      ].join("\u0000");
      // The release gate already hashed these exact bytes under this complete
      // dev/ino/size/mtime/ctime identity. An unchanged identity is the cheap
      // preview path; only drift requires a bounded streaming content proof.
      if (currentStatKey === expectedStatKey) continue;
      const proofKey = `${currentStatKey}\u0000${expectedSha256}`;
      let observedSha256 = cache.get(proofKey) || null;
      if (!observedSha256) {
        observedSha256 = await hashFile(resolvedPath);
        const afterStat = await stat(resolvedPath);
        const afterStatKey = [
          identityParts[0],
          resolvedPath,
          Number(afterStat.dev),
          Number(afterStat.ino),
          Number(afterStat.size),
          Number(afterStat.mtimeMs),
          Number(afterStat.ctimeMs),
        ].join("\u0000");
        if (afterStatKey !== currentStatKey) {
          findings.push({ code: "execution-input-changed-during-content-proof", path: resolvedPath });
          continue;
        }
        rememberExecutionInputProof(cache, proofKey, observedSha256);
      }
      if (observedSha256 !== expectedSha256) findings.push({ code: "execution-input-content-changed", path: resolvedPath });
    } catch {
      findings.push({ code: "execution-input-unreadable", path: resolvedPath });
    }
  }
  return { ok: findings.length === 0, reason: findings.length ? "execution-input-evidence-stale" : null, findings };
}

export async function verifyEchoExecutionVisualInputEvidence({ visualInputs, proxyInputs } = {}, {
  cache = executionVisualInputProofCache,
  runtimeRouteContext = null,
  resolveRuntimeUri = resolveEchoRuntimeMediaUri,
} = {}) {
  if (!Array.isArray(visualInputs) || !Array.isArray(proxyInputs)) {
    return { ok: false, reason: "execution-visual-input-evidence-missing", findings: [] };
  }
  const findings = [];
  const seen = new Set();
  for (const entry of [...visualInputs, ...proxyInputs]) {
    const candidate = text(entry?.path);
    const expectedStatKey = text(entry?.statIdentityKey);
    const signatureKey = text(entry?.signatureKey);
    const identityParts = expectedStatKey.split("\u0000");
    const inputClass = text(entry?.inputClass);
    const routeBindings = Array.isArray(entry?.routeBindings) ? entry.routeBindings : [];
    if (
      !candidate
      || !text(entry?.kind)
      || !inputClass
      || !signatureKey
      || identityParts.length !== 7
      || (inputClass === "visual-media" && !routeBindings.length)
    ) {
      findings.push({ code: "execution-visual-input-evidence-invalid", path: candidate || null });
      continue;
    }
    const resolvedPath = path.resolve(candidate);
    const proofKey = `${resolvedPath}\u0000${expectedStatKey}\u0000${signatureKey}`;
    if (seen.has(proofKey)) continue;
    seen.add(proofKey);
    if (inputClass === "visual-media") {
      for (const binding of routeBindings) {
        const route = resolveRuntimeUri(text(binding?.uri), runtimeRouteContext || {});
        if (!route?.ok) {
          findings.push({ code: "execution-visual-runtime-route-unverified", path: resolvedPath, uri: text(binding?.uri) || null, reason: route?.reason || null });
          continue;
        }
        if (path.resolve(route.resolvedPath) !== resolvedPath) {
          findings.push({ code: "execution-visual-runtime-route-changed", path: resolvedPath, uri: text(binding?.uri) || null, observedPath: path.resolve(route.resolvedPath) });
        }
      }
      if (findings.some((finding) => finding.path === resolvedPath)) continue;
    }
    try {
      const fileStat = await stat(resolvedPath);
      if (!fileStat.isFile() || fileStat.size <= 0) throw new Error("not-a-readable-file");
      const currentStatKey = [
        identityParts[0],
        resolvedPath,
        String(fileStat.dev),
        String(fileStat.ino),
        Number(fileStat.size),
        Number(fileStat.mtimeMs),
        Number(fileStat.ctimeMs),
      ].join("\u0000");
      if (currentStatKey !== expectedStatKey) {
        findings.push({ code: "execution-visual-input-stat-changed", path: resolvedPath });
        continue;
      }
      rememberExecutionInputProof(cache, proofKey, true);
    } catch {
      findings.push({ code: "execution-visual-input-unreadable", path: resolvedPath });
    }
  }
  return {
    ok: findings.length === 0,
    reason: findings.length ? "execution-visual-input-evidence-stale" : null,
    findings,
  };
}

/**
 * Shared API boundary for canonical versus certified execution graphs. A graph
 * with isolated-stem inputs fails closed until the exact requested cut has a
 * valid parent-bound execution pointer; stale/tampered pointers never fall
 * through to audio-reactive autoplay of the uncertified canonical graph.
 */
export async function readEchoDirectorShowGraphArtifact({
  albumRoot,
  root,
  project,
  canonicalProject = null,
  sourceProject = undefined,
  songId,
  cutId = "base",
  cutKind = null,
  cutFingerprint = null,
  cache = new Map(),
  validateGraph = validateEchoCompiledShowGraph,
  currentRendererBuildSha256 = null,
  currentDeliveryRuntimeBuildSha256 = null,
  currentServerDeliveryBuildSha256 = null,
  currentRegistries = null,
  runtimeRouteContext = null,
} = {}) {
  const resolvedAlbumRoot = path.resolve(albumRoot);
  const safeSongId = path.basename(text(songId));
  const graphPath = path.resolve(resolvedAlbumRoot, safeSongId, "native-show-graph.json");
  const sourcePath = path.relative(root, graphPath);
  const receiptBase = {
    schemaVersion: "hapa.echo.director-show-graph-receipt.v1",
    source: "compiled-director-v2-album",
    sourcePath,
    projectSongId: project?.song_id || safeSongId,
    cutId: text(cutId) || "base",
    cutKind: text(cutKind) || ((text(cutId) || "base") === "base" ? "base" : "saved-variant"),
    cutFingerprint: text(cutFingerprint) || null,
    currentRendererBuildSha256: SHA256.test(text(currentRendererBuildSha256)) ? text(currentRendererBuildSha256) : null,
    currentDeliveryRuntimeBuildSha256: SHA256.test(text(currentDeliveryRuntimeBuildSha256)) ? text(currentDeliveryRuntimeBuildSha256) : null,
    currentServerDeliveryBuildSha256: SHA256.test(text(currentServerDeliveryBuildSha256)) ? text(currentServerDeliveryBuildSha256) : null,
  };
  if (!safeSongId || safeSongId !== text(songId) || !within(resolvedAlbumRoot, graphPath)) {
    return { graph: null, receipt: { ...receiptBase, status: "invalid", reason: "compiled_graph_path_outside_album_root" } };
  }
  let cached;
  try {
    const fileStat = await stat(graphPath);
    const signature = `${fileStat.dev}:${fileStat.ino}:${fileStat.size}:${fileStat.mtimeMs}:${fileStat.ctimeMs}`;
    cached = cache.get(graphPath);
    if (!cached || cached.signature !== signature) {
      const bytes = await readFile(graphPath);
      cached = {
        signature,
        sourceBytes: bytes.byteLength,
        sourceHash: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
        graph: JSON.parse(bytes.toString("utf8")),
      };
      cache.set(graphPath, cached);
    }
  } catch (error) {
    if (error?.code === "ENOENT") return { graph: null, receipt: { ...receiptBase, status: "missing", reason: "compiled_graph_not_found" } };
    return {
      graph: null,
      receipt: {
        ...receiptBase,
        status: "invalid",
        reason: "compiled_graph_read_failed",
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }

  const canonicalGraph = cached.graph;
  const canonicalValidationProject = canonicalProject || project;
  const canonicalValidation = validateGraph({
    project: canonicalValidationProject,
    sourceProject: canonicalValidationProject,
    graph: canonicalGraph,
  });
  const requestedCutId = text(cutId) || "base";
  const requestedCutKind = text(cutKind) || (requestedCutId === "base" ? "base" : "saved-variant");
  const requestedCutFingerprint = requestedCutId === "base" ? cached.sourceHash : text(cutFingerprint);
  let execution = canonicalValidation.ok
    && requestedCutFingerprint
    ? resolveEchoExecutionGraph({
      albumRoot: resolvedAlbumRoot,
      songId: safeSongId,
      cutId: requestedCutId,
      cutKind: requestedCutKind,
      cutFingerprint: requestedCutFingerprint,
      parentGraphPath: graphPath,
      parentGraphSha256: cached.sourceHash,
      project,
      sourceProject,
      validateGraph,
    })
    : {
      ok: false,
      status: "skipped",
      reason: canonicalValidation.ok ? "cut-fingerprint-unavailable" : "canonical-graph-invalid",
    };
  if (execution.ok) {
    const certifiedRendererBuildSha256 = text(execution.receipt?.evidence?.rendererBuildSha256);
    if (
      !SHA256.test(text(currentRendererBuildSha256))
      || certifiedRendererBuildSha256 !== text(currentRendererBuildSha256)
    ) {
      execution = {
        ok: false,
        status: "rejected",
        reason: "execution-renderer-build-stale",
        expectedRendererBuildSha256: certifiedRendererBuildSha256 || null,
        observedRendererBuildSha256: text(currentRendererBuildSha256) || null,
      };
    }
  }
  if (execution.ok) {
    const certifiedServerDeliveryBuildSha256 = text(execution.receipt?.evidence?.serverDeliveryBuildSha256);
    if (
      !SHA256.test(text(currentServerDeliveryBuildSha256))
      || certifiedServerDeliveryBuildSha256 !== text(currentServerDeliveryBuildSha256)
    ) {
      execution = {
        ok: false,
        status: "rejected",
        reason: "execution-server-delivery-build-stale",
        expectedServerDeliveryBuildSha256: certifiedServerDeliveryBuildSha256 || null,
        observedServerDeliveryBuildSha256: text(currentServerDeliveryBuildSha256) || null,
      };
    }
  }
  if (execution.ok) {
    const certifiedDeliveryRuntimeBuildSha256 = text(execution.receipt?.evidence?.deliveryRuntimeBuildSha256);
    if (
      !SHA256.test(text(currentDeliveryRuntimeBuildSha256))
      || certifiedDeliveryRuntimeBuildSha256 !== text(currentDeliveryRuntimeBuildSha256)
    ) {
      execution = {
        ok: false,
        status: "rejected",
        reason: "execution-delivery-runtime-build-stale",
        expectedDeliveryRuntimeBuildSha256: certifiedDeliveryRuntimeBuildSha256 || null,
        observedDeliveryRuntimeBuildSha256: text(currentDeliveryRuntimeBuildSha256) || null,
      };
    }
  }
  if (execution.ok) {
    const certifiedRegistries = execution.receipt?.evidence?.registries || {};
    const registryFindings = [
      ["shaderCatalogSha256", "shader-catalog-changed-after-certification"],
      ["proxyRegistrySha256", "proxy-registry-changed-after-certification"],
      ["songRegistrySha256", "song-registry-changed-after-certification"],
      ["songbookSha256", "songbook-changed-after-certification"],
    ].flatMap(([field, code]) => {
      const expectedSha256 = text(certifiedRegistries?.[field]);
      const observedSha256 = text(currentRegistries?.[field]);
      return SHA256.test(expectedSha256)
        && SHA256.test(observedSha256)
        && expectedSha256 === observedSha256
        ? []
        : [{ code, field, expectedSha256: expectedSha256 || null, observedSha256: observedSha256 || null }];
    });
    if (registryFindings.length) {
      execution = {
        ok: false,
        status: "rejected",
        reason: "execution-registry-input-stale",
        findings: registryFindings,
      };
    }
  }
  if (execution.ok) {
    const inputFreshness = await verifyEchoExecutionInputEvidence(execution.receipt?.evidence?.inputs, { runtimeRouteContext });
    if (!inputFreshness.ok) {
      execution = {
        ok: false,
        status: "rejected",
        reason: inputFreshness.reason,
        findings: inputFreshness.findings,
      };
    }
  }
  if (execution.ok) {
    const visualInputFreshness = await verifyEchoExecutionVisualInputEvidence({
      visualInputs: execution.receipt?.evidence?.visualInputs,
      proxyInputs: execution.receipt?.evidence?.proxyInputs,
    }, { runtimeRouteContext });
    if (!visualInputFreshness.ok) {
      execution = {
        ok: false,
        status: "rejected",
        reason: visualInputFreshness.reason,
        findings: visualInputFreshness.findings,
      };
    }
  }
  const exactCutExecutionRequired = requestedCutId !== "base";
  const isolatedStemExecutionRequired = Boolean(
    canonicalValidation.visualizerCards > 0
    && Array.isArray(canonicalGraph?.stems?.items)
    && canonicalGraph.stems.items.some((stem) => text(stem?.audioPath)),
  );
  const executionRequired = exactCutExecutionRequired || isolatedStemExecutionRequired;
  const executionUnavailable = canonicalValidation.ok && executionRequired && !execution.ok;
  const executionUnavailableReason = exactCutExecutionRequired
    ? "exact_cut_execution_graph_not_ready"
    : "stem_execution_graph_not_ready";
  const graph = execution.ok ? execution.graph : canonicalGraph;
  const validation = execution.ok ? execution.validation : canonicalValidation;
  const reasons = executionUnavailable ? [executionUnavailableReason] : validation.reasons;
  const receipt = {
    ...receiptBase,
    cutFingerprint: requestedCutFingerprint || null,
    source: execution.ok ? "validated-derived-execution-graph" : receiptBase.source,
    sourcePath: execution.ok ? path.relative(root, execution.graphPath) : sourcePath,
    status: executionUnavailable ? "preparing" : reasons.length ? "invalid" : "ready",
    graphSchemaVersion: validation.graphSchemaVersion,
    graphSongId: validation.graphSongId,
    variantId: validation.variantId,
    variantHash: validation.variantHash,
    sourceHash: execution.ok ? execution.sourceHash : cached.sourceHash,
    sourceBytes: execution.ok ? execution.sourceBytes : cached.sourceBytes,
    visualizerCards: validation.visualizerCards,
    canonicalSource: {
      sourcePath,
      sourceHash: cached.sourceHash,
      sourceBytes: cached.sourceBytes,
      variantId: canonicalValidation.variantId,
      variantHash: canonicalValidation.variantHash,
    },
    executionGraph: execution.ok ? {
      status: "ready",
      pointer: execution.pointer,
      receiptSchemaVersion: execution.receipt?.schemaVersion || null,
      receiptSha256: execution.pointer?.receiptSha256 || null,
      parentGraphSha256: execution.receipt?.parent?.graphSha256 || null,
      outputGraphSha256: execution.receipt?.output?.graphSha256 || null,
      cutKind: execution.receipt?.cutKind || null,
      cutFingerprint: execution.receipt?.cutFingerprint || null,
      registries: execution.receipt?.evidence?.registries || null,
      rendererBuildSha256: execution.receipt?.evidence?.rendererBuildSha256 || null,
      deliveryRuntimeBuildSha256: execution.receipt?.evidence?.deliveryRuntimeBuildSha256 || null,
      serverDeliveryBuildSha256: execution.receipt?.evidence?.serverDeliveryBuildSha256 || null,
      certifierSourceSha256: execution.receipt?.evidence?.certifier?.sourceSha256 || null,
      visualInputCount: Number(execution.receipt?.evidence?.visualInputSummary?.visualInputCount || 0),
      proxyInputCount: Number(execution.receipt?.evidence?.visualInputSummary?.proxyInputCount || 0),
    } : {
      status: execution.status || "rejected",
      reason: execution.reason || "execution-graph-unavailable",
      ...(Array.isArray(execution.findings) ? { findings: execution.findings } : {}),
    },
    ...(reasons.length ? {
      reason: executionUnavailable ? executionUnavailableReason : "compiled_graph_validation_failed",
      reasons,
    } : {}),
  };
  return { graph: reasons.length ? null : graph, receipt };
}
