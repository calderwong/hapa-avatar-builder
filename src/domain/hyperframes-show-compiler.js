import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getShowGraphCapability } from "./show-graph-capabilities.js";
import { canonicalSha256 } from "./native-visualizer-route.js";
import {
  VISUALIZER_RENDERER_TRUTH_SCHEMA,
  resolveVisualizerRendererTruth,
} from "./visualizer-renderer-capability.js";
export { evaluateHyperFramesVisualizers } from "./hyperframes-visualizer-runtime.js";

const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
};
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const safe = (value) => String(value || "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "asset";
const normalizedId = (value) => String(value || "").replace(/^isf:/i, "").toLowerCase();

function normalizeTelemetry(bundle, duration) {
  const fps = finite(bundle?.fps, 10);
  const limit = Math.max(1, Math.floor(duration * fps) + 1);
  const stems = (bundle?.stems || []).map((stem) => ({
    id: stem.id,
    role: stem.role || "other",
    title: stem.title || stem.role || "Stem",
    frames: (stem.frames || []).slice(0, limit).map((frame) => ({
      t: finite(frame.t), rms: finite(frame.rms), peak: finite(frame.peak), onset: finite(frame.onset),
      low: finite(frame.bands?.low ?? frame.low), mid: finite(frame.bands?.mid ?? frame.mid), high: finite(frame.bands?.high ?? frame.high),
    })),
  }));
  const master = bundle?.masterMix ? {
    id: "master", role: "master", title: "Master Mix",
    frames: (bundle.masterMix.frames || []).slice(0, limit).map((frame) => ({
      t: finite(frame.t), rms: finite(frame.rms), peak: finite(frame.peak), onset: finite(frame.onset),
      low: finite(frame.bands?.low ?? frame.low), mid: finite(frame.bands?.mid ?? frame.mid), high: finite(frame.bands?.high ?? frame.high),
    })),
  } : null;
  return { schemaVersion: "hapa.hyperframes.offline-stem-frames.v2", fps, duration, stems, master, sourceHash: hash(bundle) };
}

function text(value) {
  return String(value ?? "").trim();
}

function safeDecode(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function resolveHyperFramesLocalFileUri(value) {
  const reference = text(value);
  if (!reference) return null;
  try {
    const parsed = new URL(reference, "http://hapa.local");
    if (parsed.pathname !== "/api/local-file") return null;
    const candidate = safeDecode(text(parsed.searchParams.get("path")));
    return candidate && path.isAbsolute(candidate) ? path.normalize(candidate) : null;
  } catch {
    return null;
  }
}

function resolveFileUri(value) {
  const reference = text(value);
  if (!/^file:/iu.test(reference)) return null;
  try { return path.normalize(fileURLToPath(reference)); } catch { return null; }
}

function normalizedMediaReference(value) {
  const localFile = resolveHyperFramesLocalFileUri(value);
  if (localFile) return localFile.replaceAll("\\", "/");
  const fileUri = resolveFileUri(value);
  if (fileUri) return fileUri.replaceAll("\\", "/");
  const reference = safeDecode(text(value)).replaceAll("\\", "/");
  if (!reference) return "";
  return reference.split(/[?#]/u, 1)[0];
}

function mediaReferenceKeys(value) {
  const normalized = normalizedMediaReference(value);
  if (!normalized) return [];
  const basename = normalized.split("/").filter(Boolean).at(-1) || "";
  return [...new Set([
    `uri:${normalized}`,
    basename ? `basename:${basename}` : "",
  ].filter(Boolean))];
}

function normalizedContentHash(value) {
  const raw = text(value).toLowerCase();
  const match = raw.match(/(?:^|:)sha256:([a-f0-9]{64})$/u);
  if (match) return `sha256:${match[1]}`;
  return /^[a-f0-9]{64}$/u.test(raw) ? `sha256:${raw}` : raw;
}

function mediaIdentityKeys({ mediaId = null, contentHash = null } = {}) {
  const normalizedMediaId = text(mediaId).toLowerCase();
  const normalizedHash = normalizedContentHash(contentHash || normalizedMediaId);
  return [
    normalizedMediaId ? `media-id:${normalizedMediaId}` : "",
    normalizedHash ? `content-hash:${normalizedHash}` : "",
  ].filter(Boolean);
}

function mediaContractDescriptor(contract, shot, shotIndex) {
  const originalUri = text(contract.originalUri || contract.original_uri || shot.media_uri || shot.mediaUri);
  const runtimeUri = text(contract.runtimeUri || contract.runtime_uri || shot.runtime_media_uri || shot.runtimeMediaUri);
  const type = text(contract.type).toLowerCase() || null;
  const contentHash = text(contract.contentHash || contract.content_hash) || null;
  return {
    contract,
    identity: hash({ type, originalUri, runtimeUri, contentHash, mimeType: contract.mimeType || contract.mime_type || null }),
    summary: {
      shotIndex,
      mediaId: text(shot.media_id || shot.mediaId || contract.mediaId || contract.media_id) || null,
      title: text(shot.media_title || shot.mediaTitle || contract.title) || null,
      type,
      originalUri: originalUri || null,
      runtimeUri: runtimeUri || null,
      contentHash,
    },
  };
}

export function indexHyperFramesMediaContracts(project) {
  const body = project?.music_video_project || project || {};
  const timeline = Array.isArray(body.timeline) ? body.timeline : [];
  const mediaManifest = Array.isArray(body.media_manifest?.items)
    ? body.media_manifest.items
    : Array.isArray(body.mediaManifest?.items)
      ? body.mediaManifest.items
      : [];
  const byAlias = new Map();
  const conflictsByAlias = new Map();
  const recordCount = Math.max(timeline.length, mediaManifest.length);
  for (let shotIndex = 0; shotIndex < recordCount; shotIndex += 1) {
    const shot = timeline[shotIndex] || {};
    const manifestContract = mediaManifest[shotIndex] || {};
    const inlineContract = shot.media_contract || shot.mediaContract || {};
    const contract = Object.keys(inlineContract).length ? inlineContract : manifestContract;
    const descriptor = mediaContractDescriptor(contract, shot, shotIndex);
    const references = [
      contract.originalUri,
      contract.original_uri,
      contract.runtimeUri,
      contract.runtime_uri,
      shot.media_uri,
      shot.mediaUri,
      shot.runtime_media_uri,
      shot.runtimeMediaUri,
    ];
    const identityAliases = mediaIdentityKeys({
      mediaId: shot.media_id || shot.mediaId || contract.mediaId || contract.media_id,
      contentHash: contract.contentHash || contract.content_hash,
    });
    for (const alias of new Set([...identityAliases, ...references.flatMap(mediaReferenceKeys)])) {
      const existing = byAlias.get(alias);
      if (!existing) {
        byAlias.set(alias, descriptor);
        continue;
      }
      if (existing.identity === descriptor.identity) continue;
      const rows = conflictsByAlias.get(alias) || [existing];
      if (!rows.some((row) => row.identity === descriptor.identity)) rows.push(descriptor);
      conflictsByAlias.set(alias, rows);
    }
  }
  return {
    schemaVersion: "hapa.hyperframes.media-contract-index.v1",
    byAlias,
    ambiguousAliases: new Set(conflictsByAlias.keys()),
    conflictsByAlias,
  };
}

function resolveIndexedMediaContract(card, contractIndex) {
  const localPath = text(card.media?.localPath || card.media?.local_path);
  const referenceAliases = mediaReferenceKeys(localPath);
  const aliases = [
    ...referenceAliases.filter((alias) => alias.startsWith("uri:")),
    ...mediaIdentityKeys({
      mediaId: card.media?.id,
      contentHash: card.media?.contentHash || card.media?.content_hash,
    }),
    ...referenceAliases.filter((alias) => alias.startsWith("basename:")),
  ];
  for (const alias of aliases) {
    const conflicts = contractIndex?.conflictsByAlias?.get(alias) || [];
    if (conflicts.length) {
      return {
        status: "ambiguous",
        alias,
        conflicts: conflicts.map((row) => structuredClone(row.summary)),
      };
    }
    const match = contractIndex?.byAlias?.get(alias);
    if (match) return { status: "matched", alias, contract: match.contract, shotIndex: match.summary.shotIndex, conflicts: [] };
  }
  return { status: "unmatched", alias: null, contract: null, shotIndex: null, conflicts: [] };
}

function pathExtension(localPath, type) {
  const match = String(localPath || "").match(/\.[a-zA-Z0-9]{2,5}$/);
  return match ? match[0].toLowerCase() : type === "image" ? ".jpg" : ".mp4";
}

export function resolveHyperFramesMediaSource(card, contractIndex) {
  const localPath = text(card.media?.localPath || card.media?.local_path);
  const contractResolution = resolveIndexedMediaContract(card, contractIndex);
  const contract = contractResolution.status === "matched" ? contractResolution.contract : null;
  const mediaId = text(card.media?.id).toLowerCase();
  const declaredTypes = [
    contract?.type,
    card.media?.type,
    card.provenance?.rendererRoute,
    card.provenance?.renderer_route,
  ].map((value) => text(value).toLowerCase()).filter(Boolean);
  const legacyNone = mediaId === "none";
  let type;
  let classificationReason;
  if (legacyNone) {
    type = "generated-visualizer";
    classificationReason = "legacy-none-media-sentinel";
  } else if (card.knockedOut === true) {
    type = "generated-visualizer";
    classificationReason = "explicit-knocked-out-media";
  } else if (declaredTypes.includes("generated-visualizer")) {
    type = "generated-visualizer";
    classificationReason = "explicit-generated-visualizer-route";
  } else if (declaredTypes.includes("image")) {
    type = "image";
    classificationReason = "explicit-image-route";
  } else if (declaredTypes.includes("video")) {
    type = "video";
    classificationReason = "explicit-video-route";
  } else if (/\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/iu.test(localPath)) {
    type = "image";
    classificationReason = "legacy-image-extension";
  } else {
    type = "video";
    classificationReason = localPath ? "legacy-video-default" : "untyped-media-without-uri";
  }
  const declaredContentHash = text(contract?.contentHash || contract?.content_hash);
  const contentHash = declaredContentHash || hash({ localPath, id: card.media?.id }).slice(0, 24);
  const originalUri = text(contract?.originalUri || contract?.original_uri) || localPath || null;
  const runtimeUri = text(contract?.runtimeUri || contract?.runtime_uri) || null;
  return {
    type,
    originalPath: localPath || null,
    originalUri,
    runtimeUri,
    contentHash,
    assetName: type === "generated-visualizer" ? null : `${safe(declaredContentHash.slice(0, 24) || card.media?.id || hash(localPath).slice(0, 24))}${pathExtension(localPath, type)}`,
    fidelity: type === "generated-visualizer" ? "exact-deterministic-graph" : "source-media",
    classificationReason,
    contractResolution: {
      status: contractResolution.status,
      alias: contractResolution.alias,
      shotIndex: contractResolution.shotIndex,
      conflicts: contractResolution.conflicts,
    },
  };
}

function decodedCandidateReference(value) {
  const localFile = resolveHyperFramesLocalFileUri(value);
  if (localFile) return { kind: "local-file-api", path: localFile };
  const fileUri = resolveFileUri(value);
  if (fileUri) return { kind: "file-uri", path: fileUri };
  return { kind: "reference", path: safeDecode(text(value)) };
}

export function hyperFramesMediaSourceCandidates(instance, { root, projectPath } = {}) {
  const resolvedRoot = path.resolve(text(root) || ".");
  const resolvedProjectPath = path.resolve(text(projectPath) || path.join(resolvedRoot, "project.json"));
  const projectDataRoot = path.resolve(path.dirname(resolvedProjectPath), "..");
  const candidates = [];
  const append = (value, origin) => {
    const decoded = decodedCandidateReference(value);
    const reference = text(decoded.path);
    if (!reference) return;
    if (decoded.kind !== "reference") {
      candidates.push(reference);
      return;
    }
    const normalized = reference.replaceAll("\\", "/");
    if (normalized.startsWith("/media/")) {
      candidates.push(path.join(resolvedRoot, "data", normalized.replace(/^\/+/, "")));
      return;
    }
    if (path.isAbsolute(reference)) {
      candidates.push(path.normalize(reference));
      return;
    }
    candidates.push(origin === "runtime"
      ? path.resolve(projectDataRoot, reference)
      : path.resolve(resolvedRoot, reference));
  };
  append(instance?.source?.originalPath, "original");
  append(instance?.source?.runtimeUri, "runtime");
  append(instance?.source?.originalUri, "original");
  return [...new Set(candidates)];
}

function mediaPreflightRows(showOrGraph, project) {
  if (Array.isArray(showOrGraph)) return showOrGraph;
  if (Array.isArray(showOrGraph?.instances?.media)) return showOrGraph.instances.media;
  if (showOrGraph?.schemaVersion !== "hapa.music-viz.native-show-graph.v2") return [];
  const contractIndex = indexHyperFramesMediaContracts(project);
  return (showOrGraph.tracks || []).flatMap((track) => (track.cards || [])
    .filter((card) => !card.visualization)
    .map((card) => ({
      id: card.id,
      cueId: card.id,
      mediaId: card.media?.id || null,
      title: card.media?.title || null,
      trackId: track.id,
      start: finite(card.startSeconds),
      end: finite(card.endSeconds),
      source: resolveHyperFramesMediaSource(card, contractIndex),
    })));
}

export function preflightHyperFramesMedia(showOrGraph, {
  project = null,
  root,
  projectPath,
  isFile = () => false,
} = {}) {
  const rows = mediaPreflightRows(showOrGraph, project);
  const entries = rows.map((instance) => {
    const source = instance?.source || {};
    const generated = source.type === "generated-visualizer";
    const attemptedPaths = generated ? [] : hyperFramesMediaSourceCandidates(instance, { root, projectPath });
    let resolvedPath = null;
    if (!generated && source.contractResolution?.status !== "ambiguous") {
      resolvedPath = attemptedPaths.find((candidate) => {
        try { return isFile(candidate) === true; } catch { return false; }
      }) || null;
    }
    const reason = generated
      ? "generated-visualizer-no-file-required"
      : source.contractResolution?.status === "ambiguous"
        ? "ambiguous-media-contract-alias"
        : !attemptedPaths.length
          ? "media-source-uri-missing"
          : resolvedPath
            ? "media-source-resolved"
            : "media-source-file-unavailable";
    return {
      cueId: text(instance.cueId || instance.id) || null,
      mediaId: text(instance.mediaId) || null,
      title: text(instance.title) || null,
      trackId: text(instance.trackId) || null,
      start: finite(instance.start),
      end: finite(instance.end),
      type: text(source.type) || null,
      originalUri: text(source.originalUri || source.originalPath) || null,
      runtimeUri: text(source.runtimeUri) || null,
      attemptedPaths,
      resolvedPath,
      generated,
      ok: generated || Boolean(resolvedPath),
      reason,
      contractAlias: source.contractResolution?.alias || null,
      aliasConflicts: structuredClone(source.contractResolution?.conflicts || []),
    };
  });
  const unresolved = entries.filter((row) => !row.ok);
  return {
    schemaVersion: "hapa.hyperframes.media-preflight.v1",
    ok: unresolved.length === 0,
    declaredCount: entries.length,
    generatedCount: entries.filter((row) => row.generated).length,
    resolvedCount: entries.filter((row) => row.resolvedPath).length,
    unresolvedCount: unresolved.length,
    entries,
    unresolved,
  };
}

function registryProxyIndex(registry = {}) {
  return new Map((registry.proxies || []).map((proxy) => [normalizedId(proxy.id || proxy.shaderId), proxy]));
}

function normalizedProxy(candidate = null, visualizerId = "", sourceHash = "") {
  if (!candidate || typeof candidate !== "object") return { proxy: null, reason: "exact-proxy-undeclared" };
  const proxySourceHash = canonicalSha256(candidate.sourceHash);
  const requestedSourceHash = canonicalSha256(sourceHash);
  if (!proxySourceHash || !requestedSourceHash || proxySourceHash !== requestedSourceHash) return { proxy: null, reason: "exact-proxy-source-hash-mismatch" };
  const frameWidth = finite(candidate.width);
  const frameHeight = finite(candidate.height);
  const frameCount = Math.max(0, Math.floor(finite(candidate.frameCount)));
  const fps = finite(candidate.fps);
  if (!candidate.assetPath || !candidate.assetSha256 || frameWidth <= 0 || frameHeight <= 0 || frameCount <= 0 || fps <= 0) return { proxy: null, reason: "exact-proxy-declaration-invalid" };
  const assetSha256 = canonicalSha256(candidate.assetSha256);
  const frameTimes = Array.isArray(candidate.frameTimes) && candidate.frameTimes.length === frameCount
    ? candidate.frameTimes.map((value, index) => finite(value, index / fps))
    : Array.from({ length: frameCount }, (_, index) => index / fps);
  const frameMetrics = Array.isArray(candidate.frames) ? candidate.frames : [];
  const declaredFrameIndices = Array.from({ length: frameCount }, (_, index) => index);
  const nonBlankFrameIndices = declaredFrameIndices.filter((index) => frameMetrics[index]?.nonBlank !== false);
  const nonFlatFrameIndices = nonBlankFrameIndices.filter((index) => frameMetrics[index]?.nonFlat !== false);
  const playableFrameIndices = nonFlatFrameIndices.length
    ? nonFlatFrameIndices
    : nonBlankFrameIndices.length
      ? nonBlankFrameIndices
      : declaredFrameIndices;
  return {
    reason: "hash-bound-exact-proxy-instance-ready",
    proxy: {
      assetPath: String(candidate.assetPath),
      repositoryPath: String(candidate.repositoryPath || ""),
      assetSha256,
      sourceHash: proxySourceHash,
      assetName: `${safe(visualizerId)}-${assetSha256.replace(/^sha256:/, "").slice(0, 12)}.png`,
      compiledUri: null,
      width: frameWidth,
      height: frameHeight,
      frameWidth,
      frameHeight,
      atlasWidth: finite(candidate.atlasWidth, frameWidth * frameCount),
      atlasHeight: finite(candidate.atlasHeight, frameHeight),
      frameCount,
      fps,
      frameTimes,
      playableFrameIndices,
      omittedFrameIndices: declaredFrameIndices.filter((index) => !playableFrameIndices.includes(index)),
      frameSelectionPolicy: playableFrameIndices.length < frameCount ? "verified-nonblank-samples" : "declared-sampled-loop",
      durationSeconds: finite(candidate.durationSeconds, frameCount / fps),
      captureControls: candidate.controls && typeof candidate.controls === "object" ? structuredClone(candidate.controls) : {},
      imageInputs: Array.isArray(candidate.imageInputs) ? [...candidate.imageInputs] : [],
      fidelityBoundary: String(candidate.fidelityBoundary || "Hash-bound sampled browser-ISF pixels; interpolation beyond declared frames is not claimed."),
    },
  };
}

function proxyForCard(card, proxyById) {
  const portable = card.visualization?.card || {};
  const visualizerId = String(card.visualization?.sourceId || portable.id || "");
  const declaredSourceHash = String(portable.source?.hash || card.visualization?.sourceHash || card.visualization?.nativeRoute?.requested?.sourceHash || "");
  const registry = proxyById.get(normalizedId(visualizerId));
  const sourceHash = String(registry?.sourceHash || declaredSourceHash);
  const candidate = registry || portable.hyperframesProxy || card.visualization?.nativeRoute?.proxy || null;
  return { visualizerId, sourceHash, declaredSourceHash, ...normalizedProxy(candidate, visualizerId, sourceHash) };
}

function nativeRouteForProxy(card, proxyResolution) {
  if (!proxyResolution.proxy) return null;
  const portable = card.visualization?.card || {};
  return {
    schemaVersion: "hapa.music-viz.native-shader-route.v1",
    requested: {
      id: proxyResolution.visualizerId,
      title: String(portable.title || card.visualization?.title || proxyResolution.visualizerId),
      sourceHash: proxyResolution.sourceHash,
    },
    route: "hash-bound-exact-proxy",
    status: "exact",
    nativeKey: null,
    proxy: structuredClone(proxyResolution.proxy),
    fidelityLoss: [],
    reason: proxyResolution.reason,
    silentDefault: false,
  };
}

function audioSignals(portable = {}) {
  const declared = Array.isArray(portable.audioSignal) ? portable.audioSignal : portable.audioSignal ? [portable.audioSignal] : [];
  const mapped = Object.values(portable.audioMap || {}).map((entry) => typeof entry === "string" ? entry : entry?.signal);
  return [...new Set([...declared, ...mapped].map(String).filter((signal) => signal && signal !== "off"))];
}

export function hyperFramesPixelIdentity(instance = {}, frameIndex = 0) {
  return hash({
    visualizerId: instance.visualizerId,
    sourceHash: instance.sourceHash,
    assetSha256: instance.proxy?.assetSha256 || "unsupported",
    frameIndex,
    controls: instance.controls || {},
    audioMap: instance.audioMap || {},
    blendMode: instance.blendMode,
    target: instance.target,
  });
}

export function compileHyperFramesShow({ showGraph, telemetry, project, proxyRegistry = {}, fps = 30, visualizerMix = null } = {}) {
  if (showGraph?.schemaVersion !== "hapa.music-viz.native-show-graph.v2") throw new Error("HyperFrames compiler requires Native Show Graph v2");
  const duration = finite(showGraph.song?.durationSeconds, 60);
  const configuredVisualizerMix = visualizerMix == null
    ? (showGraph.directorV2?.recipe?.visualizerMix ?? 0.72)
    : visualizerMix;
  const resolvedVisualizerMix = Math.max(0, Math.min(1, finite(configuredVisualizerMix, 0.72)));
  const mediaContractIndex = indexHyperFramesMediaContracts(project);
  const proxyById = registryProxyIndex(proxyRegistry);
  const templates = {
    "media-window-v1": { kind: "media-window", persistentPlayers: 2, fullBrightCrossfade: true },
    "visualizer-proxy-layer-v2": { kind: "visualizer-proxy-layer", horizontalAtlas: true, perLayerStemSignal: true, unsupportedDiagnostic: true },
    "camera-envelope-v1": { kind: "camera-envelope", closeCropFirst: true },
    "lyric-phrase-window-v1": { kind: "lyric-layer", variant: "phrase-window", canonicalOnly: true },
  };
  const mediaInstances = [];
  const visualizerInstances = [];
  let layerOrder = 0;
  for (const track of showGraph.tracks || []) {
    for (const card of track.cards || []) {
      const base = {
        id: card.id,
        cueId: card.id,
        cueIndex: Number.isInteger(card.sourceCueIndex) ? card.sourceCueIndex : layerOrder,
        layerOrder,
        trackId: track.id,
        start: finite(card.startSeconds),
        end: finite(card.endSeconds),
        duration: finite(card.endSeconds) - finite(card.startSeconds),
      };
      const isVisualizerCue = Boolean(card.visualization && (track.role === "visualizer" || track.id === "track-b" || card.visualization.card?.schemaVersion === "hapa.visualizer-card.v2"));
      if (isVisualizerCue) {
        const portable = card.visualization.card || {};
        const proxyResolution = proxyForCard(card, proxyById);
        const execution = proxyResolution.proxy
          ? { mode: "offline-proxy-atlas", route: "hash-bound-exact-proxy", status: "exact", drawable: true, reason: proxyResolution.reason, silentDefault: false }
          : { mode: "visible-diagnostic", route: "unsupported", status: "unsupported", drawable: false, reason: proxyResolution.reason, silentDefault: false };
        const truthCard = { ...card, visualization: { ...card.visualization, nativeKey: null } };
        const rendererTruth = resolveVisualizerRendererTruth(truthCard, "hyperframes", {
          declaration: execution.drawable
            ? { route: "hash-bound-exact-proxy", reason: "hash-bound-exact-proxy-instance-ready", unsupported: [], fidelityLoss: [] }
            : { route: "unsupported", reason: execution.reason, unsupported: ["requested-shader-not-presented"], fidelityLoss: ["requested-shader-not-presented"] },
        });
        const baseOpacity = Math.max(0, Math.min(1, finite(portable.layer?.opacity, 1)));
        const opacity = Math.max(0, Math.min(1, finite(card.parameters?.opacity, baseOpacity)));
        const controls = { ...(portable.controls || {}), ...(card.parameters?.visualizerControls || {}) };
        const audioMap = { ...(portable.audioMap || {}), ...(card.parameters?.visualizerMappings || {}) };
        const instance = {
          ...base,
          templateId: "visualizer-proxy-layer-v2",
          visualizerId: proxyResolution.visualizerId,
          sourceHash: proxyResolution.sourceHash,
          declaredSourceHash: proxyResolution.declaredSourceHash,
          nativeKey: null,
          nativeRoute: nativeRouteForProxy(card, proxyResolution),
          rendererTruth,
          execution,
          proxy: proxyResolution.proxy,
          fidelity: rendererTruth.status,
          rendererRoute: rendererTruth.route,
          unsupported: rendererTruth.fidelityLoss,
          stemFocus: String(portable.stemFocus || "master"),
          audioSignal: audioSignals(portable),
          inputs: structuredClone(portable.inputs || []),
          controls,
          audioMap,
          baseOpacity,
          opacity,
          visualizerMix: resolvedVisualizerMix,
          effectiveOpacity: opacity * resolvedVisualizerMix,
          blendMode: String(portable.layer?.blend || card.parameters?.blendMode || "screen"),
          target: String(portable.layer?.target || card.parameters?.target || "program"),
          transition: String(portable.layer?.transition || card.transition || "crossfade"),
        };
        instance.pixelIdentitySeed = hyperFramesPixelIdentity(instance, 0);
        visualizerInstances.push(instance);
        layerOrder += 1;
      } else if (!card.visualization) {
        mediaInstances.push({ ...base, templateId: "media-window-v1", mediaId: card.media?.id, title: card.media?.title, source: resolveHyperFramesMediaSource(card, mediaContractIndex), transition: card.transition || "crossfade", cameraKeyframes: card.cameraKeyframes || [] });
      }
    }
  }
  visualizerInstances.sort((left, right) => left.start - right.start || left.end - right.end || left.cueIndex - right.cueIndex || left.id.localeCompare(right.id));
  const lyrics = (showGraph.song?.lyricOverlay?.lines || []).map((line, index) => ({ index, start: finite(line.start), end: finite(line.end), text: line.text, words: line.words || [] }));
  const stemFrames = normalizeTelemetry(telemetry, duration);
  const manifest = {
    schemaVersion: "hapa.hyperframes.executable-show.v2",
    title: showGraph.song?.title || "Hapa Show",
    duration,
    fps,
    source: { showGraphHash: hash(showGraph), telemetryHash: stemFrames.sourceHash, treatmentId: showGraph.directorV2?.treatmentId, variantHash: showGraph.directorV2?.variantHash },
    deterministicPolicy: { runtimeDecisionCalls: false, runtimeAudioAnalysis: false, randomCalls: false, wallClockCalls: false, networkCalls: false, creativeInputsPinned: true },
    adapterCapability: getShowGraphCapability("hyperframes"),
    templates,
    instances: {
      media: mediaInstances,
      visualizers: visualizerInstances,
      lyrics: [{ templateId: "lyric-phrase-window-v1", lines: lyrics }],
      accents: structuredClone(showGraph.directorV2?.accentTrack?.events || []),
    },
    automation: {
      camera: structuredClone(showGraph.directorV2?.cameraKeyframes || []),
      modulationBindings: structuredClone(showGraph.directorV2?.modulationBindings || []),
      timeModulation: structuredClone(showGraph.directorV2?.timeModulation || []),
      visualTimeTrack: structuredClone(showGraph.directorV2?.visualTimeTrack || null),
      accentTrack: structuredClone(showGraph.directorV2?.accentTrack || null),
    },
    stemFrames,
    visualizerCoverage: {
      sourceCueCount: visualizerInstances.length,
      exactProxyCount: visualizerInstances.filter((layer) => layer.execution.route === "hash-bound-exact-proxy").length,
      unsupportedCount: visualizerInstances.filter((layer) => layer.execution.route === "unsupported").length,
      silentDefaultCount: visualizerInstances.filter((layer) => layer.execution.silentDefault !== false).length,
      firstStart: visualizerInstances[0]?.start ?? null,
      lastEnd: visualizerInstances.at(-1)?.end ?? null,
    },
    validation: { lint: "pending", inspect: "pending", goldenTimestamps: "pending", mediaOffline: "pending", showcaseReady: false },
  };
  manifest.showHash = hash(manifest);
  return manifest;
}

function clippedWindow(row, duration, startKey = "start", endKey = "end") {
  const start = finite(row?.[startKey]);
  const end = Math.min(duration, finite(row?.[endKey]));
  return start < duration && end > start ? { ...structuredClone(row), [startKey]: start, [endKey]: end, duration: end - start } : null;
}

function visualizerCoverage(rows = []) {
  return {
    sourceCueCount: rows.length,
    exactProxyCount: rows.filter((layer) => layer.execution.route === "hash-bound-exact-proxy").length,
    unsupportedCount: rows.filter((layer) => layer.execution.route === "unsupported").length,
    silentDefaultCount: rows.filter((layer) => layer.execution.silentDefault !== false).length,
    firstStart: rows[0]?.start ?? null,
    lastEnd: rows.at(-1)?.end ?? null,
  };
}

export function clipHyperFramesShow(show, requestedDuration) {
  const duration = Math.max(0, Math.min(finite(requestedDuration, show?.duration), finite(show?.duration)));
  if (!(duration > 0)) throw new Error("HyperFrames clip duration must be positive");
  const clipped = structuredClone(show);
  const sourceDuration = finite(show.duration);
  clipped.duration = duration;
  clipped.source = { ...clipped.source, sourceDurationSeconds: sourceDuration, boundedDemo: duration < sourceDuration, boundedDemoDurationSeconds: duration };
  clipped.instances.media = (clipped.instances.media || []).map((row) => clippedWindow(row, duration)).filter(Boolean);
  clipped.instances.visualizers = (clipped.instances.visualizers || []).map((row) => clippedWindow(row, duration)).filter(Boolean);
  clipped.instances.lyrics = (clipped.instances.lyrics || []).map((track) => ({
    ...track,
    lines: (track.lines || []).filter((line) => finite(line.start) < duration && finite(line.end) > finite(line.start)).map((line) => ({ ...line, end: Math.min(duration, finite(line.end)) })),
  }));
  clipped.instances.accents = (clipped.instances.accents || []).filter((event) => finite(event.atSeconds ?? event.startSeconds) < duration).map((event) => ({
    ...event,
    endSeconds: Math.min(duration, finite(event.endSeconds, finite(event.atSeconds ?? event.startSeconds))),
  }));
  clipped.automation.camera = (clipped.automation.camera || []).filter((row) => finite(row.atSeconds) <= duration);
  if (clipped.automation.visualTimeTrack) {
    clipped.automation.visualTimeTrack.events = (clipped.automation.visualTimeTrack.events || [])
      .filter((event) => finite(event.startSeconds) < duration)
      .map((event) => ({ ...event, endSeconds: Math.min(duration, finite(event.endSeconds)) }));
    clipped.automation.visualTimeTrack.eventCount = clipped.automation.visualTimeTrack.events.length;
  }
  if (clipped.automation.accentTrack) {
    clipped.automation.accentTrack.events = (clipped.automation.accentTrack.events || [])
      .filter((event) => finite(event.atSeconds ?? event.startSeconds) < duration)
      .map((event) => ({ ...event, endSeconds: Math.min(duration, finite(event.endSeconds, finite(event.atSeconds ?? event.startSeconds))) }));
    clipped.automation.accentTrack.eventCount = clipped.automation.accentTrack.events.length;
  }
  clipped.stemFrames.duration = duration;
  clipped.stemFrames.stems = (clipped.stemFrames.stems || []).map((stem) => ({ ...stem, frames: (stem.frames || []).filter((frame) => finite(frame.t) <= duration) }));
  if (clipped.stemFrames.master) clipped.stemFrames.master.frames = (clipped.stemFrames.master.frames || []).filter((frame) => finite(frame.t) <= duration);
  clipped.visualizerCoverage = visualizerCoverage(clipped.instances.visualizers);
  clipped.showHash = hash({ ...clipped, showHash: undefined });
  return clipped;
}

export function inspectHyperFramesShow(show) {
  const serialized = JSON.stringify(show);
  const errors = [];
  if (show.schemaVersion !== "hapa.hyperframes.executable-show.v2") errors.push("schema");
  if (/Math\.random|Date\.now|AudioContext|getUserMedia|fetch\(|https?:\/\//.test(serialized)) errors.push("runtime-nondeterminism-or-network");
  if (!show.stemFrames?.stems?.length) errors.push("missing-offline-stems");
  if (!show.instances?.media?.length || !show.instances?.visualizers?.length) errors.push("missing-layer-family");
  let previous = null;
  for (const layer of show.instances?.visualizers || []) {
    if (!(Number.isFinite(layer.start) && Number.isFinite(layer.end) && layer.end > layer.start)) errors.push(`invalid-window:${layer.id}`);
    if (previous && (layer.start < previous.start || (layer.start === previous.start && layer.cueIndex < previous.cueIndex))) errors.push(`unstable-order:${layer.id}`);
    previous = layer;
    if (Object.keys(layer.audioMap || {}).some((name) => !(layer.inputs || []).some((input) => (input.NAME || input.name) === name) && !(name in (layer.controls || {})))) errors.push(`unhydrated-input:${layer.id}`);
    if (!layer.stemFocus || !Array.isArray(layer.audioSignal)) errors.push(`missing-stem-wiring:${layer.id}`);
    if (!Array.isArray(layer.unsupported)) errors.push(`implicit-unsupported:${layer.id}`);
    if (layer.rendererTruth?.schemaVersion !== VISUALIZER_RENDERER_TRUTH_SCHEMA || layer.rendererTruth?.rendererId !== "hyperframes") errors.push(`renderer-truth-missing:${layer.id}`);
    if (layer.rendererTruth?.visible !== true || layer.rendererTruth?.silentDefault !== false) errors.push(`renderer-truth-hidden:${layer.id}`);
    if (!layer.execution || layer.execution.silentDefault !== false) errors.push(`execution-truth-missing:${layer.id}`);
    if (layer.execution?.drawable) {
      if (layer.execution.route !== "hash-bound-exact-proxy" || layer.rendererTruth.status !== "exact") errors.push(`drawable-route-mismatch:${layer.id}`);
      if (!layer.proxy?.assetPath || !layer.proxy?.assetSha256 || layer.proxy?.sourceHash !== layer.sourceHash) errors.push(`proxy-truth-missing:${layer.id}`);
      if (!(layer.proxy?.frameCount > 0 && layer.proxy?.fps > 0 && layer.proxy?.frameWidth > 0 && layer.proxy?.frameHeight > 0)) errors.push(`proxy-frames-invalid:${layer.id}`);
    } else if (layer.execution?.route !== "unsupported" || layer.rendererTruth.status !== "unsupported" || layer.proxy) {
      errors.push(`unsupported-not-visible:${layer.id}`);
    }
  }
  const visualizers = show.instances?.visualizers || [];
  if (show.visualizerCoverage?.sourceCueCount !== visualizers.length) errors.push("visualizer-cue-count-mismatch");
  if (show.visualizerCoverage?.exactProxyCount + show.visualizerCoverage?.unsupportedCount !== visualizers.length) errors.push("visualizer-route-count-mismatch");
  if (show.visualizerCoverage?.silentDefaultCount !== 0) errors.push("visualizer-silent-default");
  const expandedEstimate = ((show.instances?.media || []).length + visualizers.length) * JSON.stringify(show.templates || {}).length;
  return {
    ok: errors.length === 0,
    errors,
    templateCount: Object.keys(show.templates || {}).length,
    instanceCount: (show.instances?.media || []).length + visualizers.length,
    visualizerCoverage: show.visualizerCoverage,
    deduplication: { manifestBytes: Buffer.byteLength(serialized), expandedTemplateEstimateBytes: expandedEstimate, repeatedSceneStructuresTemplated: true },
    offlineFrameCount: (show.stemFrames?.stems || []).reduce((sum, stem) => sum + stem.frames.length, 0),
  };
}
