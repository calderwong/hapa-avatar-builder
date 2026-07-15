import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getShowGraphCapability } from "./show-graph-capabilities.js";
import { canonicalSha256 } from "./native-visualizer-route.js";
import {
  VISUALIZER_RENDERER_TRUTH_SCHEMA,
  resolveVisualizerRendererTruth,
} from "./visualizer-renderer-capability.js";
import {
  VISUALIZER_AUDIO_HEADROOM_POLICY,
  VISUALIZER_AUDIO_REACTIVE_SIGNALS,
  inspectVisualizerAudioMappingEffect,
  normalizeVisualizerAudioInputValue,
  normalizeVisualizerAudioMapping,
} from "./hyperframes-visualizer-runtime.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";
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
  const visualContract = contract.visualContract || contract.visual_contract || {};
  const allowBlank = contract.allowBlank === true || contract.allow_blank === true || visualContract.allowBlank === true || visualContract.allow_blank === true;
  const samplingPolicy = text(contract.videoSamplingPolicy || contract.video_sampling_policy || contract.samplingPolicy || contract.sampling_policy || visualContract.samplingPolicy || visualContract.sampling_policy) || null;
  return {
    contract,
    identity: hash({ type, originalUri, runtimeUri, contentHash, mimeType: contract.mimeType || contract.mime_type || null, allowBlank, samplingPolicy }),
    summary: {
      shotIndex,
      mediaId: text(shot.media_id || shot.mediaId || contract.mediaId || contract.media_id) || null,
      title: text(shot.media_title || shot.mediaTitle || contract.title) || null,
      type,
      originalUri: originalUri || null,
      runtimeUri: runtimeUri || null,
      contentHash,
      allowBlank,
      samplingPolicy,
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
  const contractVisual = contract?.visualContract || contract?.visual_contract || {};
  const cardVisual = card.media?.visualContract || card.media?.visual_contract || {};
  const allowBlank = contract?.allowBlank === true
    || contract?.allow_blank === true
    || contractVisual.allowBlank === true
    || contractVisual.allow_blank === true
    || card.media?.allowBlank === true
    || card.media?.allow_blank === true
    || cardVisual.allowBlank === true
    || cardVisual.allow_blank === true;
  const samplingPolicy = text(
    contract?.videoSamplingPolicy
    || contract?.video_sampling_policy
    || contract?.samplingPolicy
    || contract?.sampling_policy
    || contractVisual.samplingPolicy
    || contractVisual.sampling_policy
    || card.media?.videoSamplingPolicy
    || card.media?.video_sampling_policy
    || card.media?.samplingPolicy
    || card.media?.sampling_policy
    || cardVisual.samplingPolicy
    || cardVisual.sampling_policy,
  ) || null;
  return {
    type,
    originalPath: localPath || null,
    originalUri,
    runtimeUri,
    contentHash,
    assetName: type === "generated-visualizer" ? null : `${safe(declaredContentHash.slice(0, 24) || card.media?.id || hash(localPath).slice(0, 24))}${pathExtension(localPath, type)}`,
    fidelity: type === "generated-visualizer" ? "exact-deterministic-graph" : "source-media",
    classificationReason,
    allowBlank,
    samplingPolicy,
    visualContract: { allowBlank, samplingPolicy },
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
      allowBlank: source.allowBlank === true,
      samplingPolicy: text(source.samplingPolicy) || null,
      visualContract: structuredClone(source.visualContract || {}),
      source: {
        type: text(source.type) || null,
        allowBlank: source.allowBlank === true,
        samplingPolicy: text(source.samplingPolicy) || null,
        visualContract: structuredClone(source.visualContract || {}),
      },
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
  const frameProofRows = declaredFrameIndices.map((index) => frameMetrics[index] || null);
  const playbackProof = {
    verified: candidate.verified === true,
    declaredFrameCount: frameCount,
    metricFrameCount: frameProofRows.filter(Boolean).length,
    nonBlankFrameCount: frameProofRows.filter((frame) => frame?.nonBlank === true).length,
    nonFlatFrameCount: frameProofRows.filter((frame) => frame?.nonFlat === true).length,
    playableFrameCount: frameProofRows.filter((frame) => frame?.playable === true).length,
    allFramesNonBlank: frameProofRows.length === frameCount && frameProofRows.every((frame) => frame?.nonBlank === true),
    allFramesNonFlat: frameProofRows.length === frameCount && frameProofRows.every((frame) => frame?.nonFlat === true),
    allFramesPlayable: frameProofRows.length === frameCount && frameProofRows.every((frame) => frame?.playable === true),
  };
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
      playbackProof,
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
  const mapped = Object.values(portable.audioMap || {}).map((entry) => typeof entry === "string" ? entry.split(":").at(-1) : entry?.signal);
  return [...new Set([...declared, ...mapped].map(String).filter((signal) => signal && signal !== "off"))];
}

const AUDIO_REACTIVE_SIGNALS = VISUALIZER_AUDIO_REACTIVE_SIGNALS;

function visualizerInputName(input = {}) {
  return String(input.NAME || input.name || "");
}

function normalizeAudioMapping(value, fallback = null, input = null) {
  return normalizeVisualizerAudioMapping(value, {
    fallback,
    input,
    generated: typeof value === "string",
    materializeDepth: true,
  });
}

function normalizedVisualizerAudioMap(portable = {}, parameterMappings = {}) {
  const portableMap = portable.audioMap && typeof portable.audioMap === "object" && !Array.isArray(portable.audioMap)
    ? portable.audioMap
    : {};
  const overrides = parameterMappings && typeof parameterMappings === "object" && !Array.isArray(parameterMappings)
    ? parameterMappings
    : {};
  const inputByName = new Map((portable.inputs || []).map((input) => [visualizerInputName(input), input]).filter(([name]) => name));
  const names = [...new Set([...Object.keys(portableMap), ...Object.keys(overrides)])].sort();
  return Object.fromEntries(names.flatMap((name) => {
    const input = inputByName.get(name) || null;
    const declared = normalizeAudioMapping(portableMap[name], null, input);
    const normalized = Object.hasOwn(overrides, name)
      ? normalizeAudioMapping(overrides[name], declared, input)
      : declared;
    return normalized ? [[name, normalized]] : [];
  }));
}

function visualizerModulationEffectiveness(portable = {}, controls = {}, audioMap = {}) {
  const inputByName = new Map((portable.inputs || []).map((input) => [visualizerInputName(input), input]).filter(([name]) => name));
  const entries = Object.entries(audioMap).sort(([left], [right]) => left.localeCompare(right)).flatMap(([uniform, mapping]) => {
    const input = inputByName.get(uniform);
    if (!input) return [];
    const declared = input.DEFAULT ?? input.default;
    const baseValue = normalizeVisualizerAudioInputValue(input, Object.hasOwn(controls, uniform) ? controls[uniform] : declared);
    const effect = inspectVisualizerAudioMappingEffect(input, baseValue, mapping);
    const enforced = AUDIO_REACTIVE_SIGNALS.has(String(mapping?.signal || "").toLowerCase())
      && String(mapping?.headroomPolicy || mapping?.headroom_policy || "") === VISUALIZER_AUDIO_HEADROOM_POLICY;
    return [{ uniform, signal: String(mapping?.signal || "off"), enforced, ...effect }];
  });
  return {
    schemaVersion: "hapa.hyperframes.modulation-effectiveness.v1",
    policy: "per-uniform-material-effect-v1",
    ok: entries.every((entry) => !entry.enforced || entry.material),
    entries,
  };
}

function audioReactiveSignals(audioMap = {}) {
  return [...new Set(Object.values(audioMap)
    .map((mapping) => String(mapping?.signal || "").toLowerCase())
    .filter((signal) => AUDIO_REACTIVE_SIGNALS.has(signal)))];
}

function presentationModulation(audioMap = {}) {
  const mappedSignals = audioReactiveSignals(audioMap);
  const primarySignal = mappedSignals.find((signal) => !["beat", "onset"].includes(signal)) || "rms";
  const accentSignal = mappedSignals.find((signal) => ["beat", "onset"].includes(signal)) || "beat";
  return {
    schemaVersion: "hapa.hyperframes.presentation-modulation.v1",
    mode: "audio-conditioned-proxy",
    source: mappedSignals.length ? "declared-audio-map" : "generic-rms-beat-fallback",
    primarySignal,
    accentSignal,
    primaryWeight: 0.7,
    accentWeight: 0.3,
    frameOffsetFrames: 3,
    brightnessDepth: 0.38,
    saturationDepth: 0.5,
    scaleDepth: 0.055,
    opacityDepth: 0.16,
  };
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

function drawableVisualRows(show = {}) {
  return [
    ...(show.instances?.media || [])
      .filter((layer) => layer?.source?.type !== "generated-visualizer")
      .map((layer) => ({ layer, kind: "media" })),
    ...(show.instances?.visualizers || [])
      .filter((layer) => layer?.execution?.drawable === true && Number(layer?.effectiveOpacity) > 0)
      .map((layer) => ({ layer, kind: "visualizer" })),
  ].sort((left, right) => (
    finite(left.layer?.start) - finite(right.layer?.start)
    || finite(left.layer?.end) - finite(right.layer?.end)
    || String(left.layer?.id || "").localeCompare(String(right.layer?.id || ""))
  ));
}

function setLayerWindow(layer, start, end, normalization) {
  layer.start = start;
  layer.end = end;
  layer.duration = end - start;
  layer.coverageNormalization = [
    ...(Array.isArray(layer.coverageNormalization) ? layer.coverageNormalization : []),
    normalization,
  ];
}

export function normalizeHyperFramesVisualCoverage(show, {
  toleranceSeconds = 1 / Math.max(1, Number(show?.fps) || 30) + 1e-6,
  tailToleranceSeconds = 0.050001,
} = {}) {
  const duration = Number(show?.duration);
  const rows = drawableVisualRows(show);
  const receipts = [];
  if (!(duration > 0) || !rows.length) return { normalized: false, toleranceSeconds, tailToleranceSeconds, receipts };

  const first = rows[0];
  const firstStart = finite(first.layer.start);
  if (firstStart > 0 && firstStart <= toleranceSeconds) {
    const receipt = { reason: "leading-frame-gap-extended", fromSeconds: firstStart, toSeconds: 0 };
    setLayerWindow(first.layer, 0, finite(first.layer.end), receipt);
    receipts.push({ cueId: first.layer.id || first.layer.cueId || null, ...receipt });
  }

  let coverageEnd = finite(rows[0].layer.end);
  let coverageOwner = rows[0].layer;
  for (const row of rows.slice(1)) {
    const start = finite(row.layer.start);
    const end = finite(row.layer.end);
    const gapSeconds = start - coverageEnd;
    if (gapSeconds > 0 && gapSeconds <= toleranceSeconds) {
      const receipt = { reason: "interior-frame-gap-extended", fromSeconds: coverageEnd, toSeconds: start, gapSeconds };
      setLayerWindow(coverageOwner, finite(coverageOwner.start), start, receipt);
      receipts.push({ cueId: coverageOwner.id || coverageOwner.cueId || null, ...receipt });
      coverageEnd = start;
    }
    if (end > coverageEnd) {
      coverageEnd = end;
      coverageOwner = row.layer;
    }
  }
  const tailGapSeconds = duration - coverageEnd;
  if (tailGapSeconds > 0 && tailGapSeconds <= tailToleranceSeconds) {
    const receipt = { reason: "tail-frame-gap-extended", fromSeconds: coverageEnd, toSeconds: duration, gapSeconds: tailGapSeconds };
    setLayerWindow(coverageOwner, finite(coverageOwner.start), duration, receipt);
    receipts.push({ cueId: coverageOwner.id || coverageOwner.cueId || null, ...receipt });
  }
  return { normalized: receipts.length > 0, toleranceSeconds, tailToleranceSeconds, receipts };
}

export function inspectHyperFramesVisualCoverage(show = {}, { toleranceSeconds = 1e-6 } = {}) {
  const duration = Number(show?.duration);
  const rows = drawableVisualRows(show);
  const gaps = [];
  let coverageEnd = 0;
  for (const row of rows) {
    const start = Number(row.layer?.start);
    const end = Number(row.layer?.end);
    if (!(Number.isFinite(start) && Number.isFinite(end) && end > start)) continue;
    if (start - coverageEnd > toleranceSeconds) {
      gaps.push({ startSeconds: coverageEnd, endSeconds: start, durationSeconds: start - coverageEnd });
    }
    coverageEnd = Math.max(coverageEnd, end);
  }
  if (Number.isFinite(duration) && duration - coverageEnd > toleranceSeconds) {
    gaps.push({ startSeconds: coverageEnd, endSeconds: duration, durationSeconds: duration - coverageEnd });
  }
  return {
    schemaVersion: "hapa.hyperframes.visual-coverage.v1",
    ok: Number.isFinite(duration) && duration > 0 && rows.length > 0 && gaps.length === 0,
    durationSeconds: Number.isFinite(duration) ? duration : null,
    drawableLayerCount: rows.length,
    mediaLayerCount: rows.filter((row) => row.kind === "media").length,
    visualizerLayerCount: rows.filter((row) => row.kind === "visualizer").length,
    coveredUntilSeconds: coverageEnd,
    gaps,
  };
}

export function hyperFramesMediaPresentationWindow(instances = [], instanceIndex = 0, {
  crossfadeSeconds = 0.45,
  seamToleranceSeconds = 0.050001,
} = {}) {
  const media = Array.isArray(instances) ? instances : [];
  const index = Number(instanceIndex);
  const current = media[index];
  if (!current) return null;
  const start = Number(current.start) || 0;
  const end = Number(current.end) || start;
  const duration = Math.max(0, end - start);
  const sameTrack = (candidate) => candidate
    && candidate?.source?.type !== "generated-visualizer"
    && String(candidate.trackId || "") === String(current.trackId || "");
  const previous = media.slice(0, index).reverse().find((candidate) => sameTrack(candidate) && Math.abs(Number(candidate.end) - start) <= seamToleranceSeconds);
  const previousDuration = previous ? Math.max(0, Number(previous.end) - Number(previous.start)) : duration;
  const incomingFade = previous ? Math.min(crossfadeSeconds, duration / 2, previousDuration / 2) : 0;
  return {
    logicalStart: start,
    logicalEnd: end,
    logicalDuration: duration,
    presentationStart: start - incomingFade,
    presentationEnd: end,
    presentationDuration: duration + incomingFade,
    incomingFadeSeconds: incomingFade,
    previousCueId: previous?.id || previous?.cueId || null,
  };
}

export function hyperFramesMediaOpacityState(instances = [], instanceIndex = 0, timeSeconds = 0, options = {}) {
  const media = Array.isArray(instances) ? instances : [];
  const current = media[Number(instanceIndex)];
  const window = hyperFramesMediaPresentationWindow(media, instanceIndex, options);
  if (!current || !window) return { visible: false, alpha: 0, localSeconds: 0, phase: "missing" };
  const time = Number(timeSeconds) || 0;
  const start = window.logicalStart;
  const end = window.logicalEnd;
  const incomingFade = window.incomingFadeSeconds;
  if (incomingFade > 0 && time >= start - incomingFade && time < start) {
    return {
      visible: true,
      alpha: Math.max(0, Math.min(1, (time - (start - incomingFade)) / incomingFade)),
      localSeconds: Math.max(0, time - (start - incomingFade)),
      phase: "incoming-crossfade",
    };
  }
  if (time >= start && time < end) {
    return {
      visible: true,
      alpha: 1,
      localSeconds: Math.max(0, time - start + incomingFade),
      phase: "active",
    };
  }
  return { visible: false, alpha: 0, localSeconds: Math.max(0, time - start), phase: "inactive" };
}

export function compileHyperFramesShow({ showGraph, telemetry, project, proxyRegistry = {}, fps = 30, visualizerMix = null } = {}) {
  if (showGraph?.schemaVersion !== "hapa.music-viz.native-show-graph.v2") throw new Error("HyperFrames compiler requires Native Show Graph v2");
  const projectBody = project?.music_video_project || project?.project || project || {};
  const projectProfileValue = projectBody.output_profile ?? projectBody.outputProfile;
  const graphProfileValue = showGraph.outputProfile ?? showGraph.output_profile;
  const directorProfileValue = showGraph.directorV2?.outputProfile ?? showGraph.directorV2?.output_profile;
  const projectProfileDeclared = projectProfileValue !== undefined && projectProfileValue !== null;
  const graphProfileDeclared = graphProfileValue !== undefined && graphProfileValue !== null;
  const directorProfileDeclared = directorProfileValue !== undefined && directorProfileValue !== null;
  const projectOutputProfile = resolveEchoOutputProfile(projectProfileValue);
  const graphOutputProfile = resolveEchoOutputProfile(graphProfileValue ?? directorProfileValue);
  if ((graphProfileDeclared && directorProfileDeclared
      && resolveEchoOutputProfile(graphProfileValue).id !== resolveEchoOutputProfile(directorProfileValue).id)
    || (projectProfileDeclared && projectOutputProfile.id !== graphOutputProfile.id)) {
    const error = new Error(`Echo output profile mismatch: project=${projectOutputProfile.id}, graph=${graphOutputProfile.id}. Recompile the canonical Show Graph before packaging.`);
    error.code = "echo_output_profile_mismatch";
    throw error;
  }
  const outputProfile = projectProfileDeclared ? projectOutputProfile : graphOutputProfile;
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
  const accentCards = [];
  const classificationErrors = [];
  let layerOrder = 0;
  for (const track of showGraph.tracks || []) {
    for (const card of track.cards || []) {
      const declaredStart = finite(card.startSeconds);
      const declaredEnd = finite(card.endSeconds);
      const tailRoundingOverrun = declaredEnd - duration;
      const normalizedEnd = tailRoundingOverrun > 0 && tailRoundingOverrun <= 0.050001
        ? duration
        : declaredEnd;
      const base = {
        id: card.id,
        cueId: card.id,
        cueIndex: Number.isInteger(card.sourceCueIndex) ? card.sourceCueIndex : layerOrder,
        layerOrder,
        trackId: track.id,
        start: declaredStart,
        end: normalizedEnd,
        duration: normalizedEnd - declaredStart,
        ...(normalizedEnd !== declaredEnd ? {
          windowNormalization: {
            reason: "tail-rounding-clamped",
            declaredEnd,
            resolvedEnd: normalizedEnd,
            overrunSeconds: tailRoundingOverrun,
          },
        } : {}),
      };
      const isAccentCue = track.role === "accent";
      const isVisualizerTrack = track.role === "visualizer" || track.id === "track-b";
      const hasPortableVisualizer = card.visualization?.card?.schemaVersion === "hapa.visualizer-card.v2";
      const isVisualizerCue = Boolean(card.visualization && (isVisualizerTrack || hasPortableVisualizer));
      if (isAccentCue) {
        accentCards.push(structuredClone(card));
      } else if (isVisualizerCue) {
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
        const audioMap = normalizedVisualizerAudioMap(portable, card.parameters?.visualizerMappings);
        const modulationEffectiveness = visualizerModulationEffectiveness(portable, controls, audioMap);
        const modulation = presentationModulation(audioMap);
        const declaredAudioSignals = audioSignals({ ...portable, audioMap });
        const reactiveAudioSignals = audioReactiveSignals(audioMap);
        const resolvedAudioSignals = [...new Set([
          ...declaredAudioSignals,
          ...(reactiveAudioSignals.length ? [] : ["rms", "beat"]),
          modulation.primarySignal,
          modulation.accentSignal,
        ])];
        const mappedStemFocuses = [...new Set(Object.values(audioMap)
          .map((mapping) => String(mapping?.stemFocus || "").trim())
          .filter(Boolean))];
        const instanceStemFocus = mappedStemFocuses.length === 1
          ? mappedStemFocuses[0]
          : String(portable.stemFocus || card.parameters?.stemFocus || "master");
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
          stemFocus: instanceStemFocus,
          audioSignal: resolvedAudioSignals,
          inputs: structuredClone(portable.inputs || []),
          controls,
          audioMap,
          modulationEffectiveness,
          presentationModulation: modulation,
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
      } else {
        classificationErrors.push({
          cueId: text(card.id) || null,
          trackId: text(track.id) || null,
          trackRole: text(track.role) || null,
          reason: "visualization-card-route-or-schema-invalid",
        });
      }
    }
  }
  mediaInstances.sort((left, right) => left.start - right.start || left.end - right.end || left.cueIndex - right.cueIndex || left.id.localeCompare(right.id));
  visualizerInstances.sort((left, right) => left.start - right.start || left.end - right.end || left.cueIndex - right.cueIndex || left.id.localeCompare(right.id));
  const declaredAccentEvents = Array.isArray(showGraph.directorV2?.accentTrack?.events)
    ? showGraph.directorV2.accentTrack.events
    : Array.isArray(showGraph.directorV2?.effects)
      ? showGraph.directorV2.effects
      : accentCards.map((card) => ({
        id: `effect:${card.id}`,
        cueId: card.provenance?.cueId || card.id,
        kind: "bounded-accent",
        startSeconds: finite(card.startSeconds),
        endSeconds: finite(card.endSeconds),
        opacity: finite(card.parameters?.opacity, 1),
      }));
  const compiledAccentTrack = showGraph.directorV2?.accentTrack
    ? structuredClone(showGraph.directorV2.accentTrack)
    : { schemaVersion: "hapa.director-v2.accent-track.v1", events: structuredClone(declaredAccentEvents), eventCount: declaredAccentEvents.length };
  const lyrics = (showGraph.song?.lyricOverlay?.lines || []).map((line, index) => ({ index, start: finite(line.start), end: finite(line.end), text: line.text, words: line.words || [] }));
  const stemFrames = normalizeTelemetry(telemetry, duration);
  const manifest = {
    schemaVersion: "hapa.hyperframes.executable-show.v2",
    title: showGraph.song?.title || "Hapa Show",
    outputProfile,
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
      accents: structuredClone(declaredAccentEvents),
    },
    automation: {
      camera: structuredClone(showGraph.directorV2?.cameraKeyframes || []),
      modulationBindings: structuredClone(showGraph.directorV2?.modulationBindings || []),
      timeModulation: structuredClone(showGraph.directorV2?.timeModulation || []),
      visualTimeTrack: structuredClone(showGraph.directorV2?.visualTimeTrack || null),
      accentTrack: compiledAccentTrack,
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
    classificationErrors,
    validation: { lint: "pending", inspect: "pending", goldenTimestamps: "pending", mediaOffline: "pending", showcaseReady: false },
  };
  manifest.visualCoverageNormalization = normalizeHyperFramesVisualCoverage(manifest);
  manifest.visualizerCoverage = visualizerCoverage(manifest.instances.visualizers);
  manifest.visualCoverage = inspectHyperFramesVisualCoverage(manifest);
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
  clipped.visualCoverageNormalization = normalizeHyperFramesVisualCoverage(clipped);
  clipped.visualizerCoverage = visualizerCoverage(clipped.instances.visualizers);
  clipped.visualCoverage = inspectHyperFramesVisualCoverage(clipped);
  clipped.showHash = hash({ ...clipped, showHash: undefined });
  return clipped;
}

export function inspectHyperFramesShow(show) {
  const serialized = JSON.stringify(show);
  const errors = [];
  if (show.schemaVersion !== "hapa.hyperframes.executable-show.v2") errors.push("schema");
  const duration = Number(show.duration);
  if (!(Number.isFinite(duration) && duration > 0)) errors.push("invalid-show-duration");
  if (/Math\.random|Date\.now|AudioContext|getUserMedia|fetch\(|https?:\/\//.test(serialized)) errors.push("runtime-nondeterminism-or-network");
  if (!show.stemFrames?.stems?.length) errors.push("missing-offline-stems");
  if (!show.instances?.media?.length && !show.instances?.visualizers?.length) errors.push("missing-visual-layer");
  for (const issue of show.classificationErrors || []) {
    errors.push(`invalid-visualization-route:${String(issue?.cueId || "unknown")}`);
  }
  const visualCoverage = inspectHyperFramesVisualCoverage(show);
  if (!visualCoverage.ok) errors.push("incomplete-visual-coverage");
  const cueIds = new Set();
  const windowTolerance = 1 / Math.max(1, Number(show.fps) || 30) + 1e-6;
  const inspectWindow = (layer, kind) => {
    const id = String(layer?.id || layer?.cueId || "").trim();
    if (!id) errors.push(`missing-cue-id:${kind}`);
    else if (cueIds.has(id)) errors.push(`duplicate-cue-id:${id}`);
    else cueIds.add(id);
    const start = Number(layer?.start);
    const end = Number(layer?.end);
    if (!(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start)) {
      errors.push(`invalid-window:${id || kind}`);
    } else if (Number.isFinite(duration) && duration > 0 && (start >= duration || end > duration + windowTolerance)) {
      errors.push(`window-outside-show:${id || kind}`);
    }
  };
  for (const layer of show.instances?.media || []) inspectWindow(layer, "media");
  let previous = null;
  for (const layer of show.instances?.visualizers || []) {
    inspectWindow(layer, "visualizer");
    if (previous && (layer.start < previous.start || (layer.start === previous.start && layer.cueIndex < previous.cueIndex))) errors.push(`unstable-order:${layer.id}`);
    previous = layer;
    if (Object.keys(layer.audioMap || {}).some((name) => !(layer.inputs || []).some((input) => (input.NAME || input.name) === name) && !(name in (layer.controls || {})))) errors.push(`unhydrated-input:${layer.id}`);
    for (const entry of layer.modulationEffectiveness?.entries || []) {
      if (entry.enforced && entry.material !== true) errors.push(`ineffective-audio-mapping:${layer.id}:${entry.uniform}`);
    }
    const audioSignals = Array.isArray(layer.audioSignal) ? layer.audioSignal.map((signal) => String(signal).toLowerCase()) : [];
    const mappedReactive = Object.values(layer.audioMap || {}).some((mapping) => {
      const signal = typeof mapping === "string" ? mapping.split(":").at(-1) : mapping?.signal;
      return AUDIO_REACTIVE_SIGNALS.has(String(signal || "").toLowerCase());
    });
    const presentationReactive = layer.presentationModulation?.mode === "audio-conditioned-proxy"
      && AUDIO_REACTIVE_SIGNALS.has(String(layer.presentationModulation?.primarySignal || "").toLowerCase())
      && AUDIO_REACTIVE_SIGNALS.has(String(layer.presentationModulation?.accentSignal || "").toLowerCase());
    if (!layer.stemFocus || !Array.isArray(layer.audioSignal) || audioSignals.length === 0) errors.push(`missing-stem-wiring:${layer.id}`);
    if (!audioSignals.some((signal) => AUDIO_REACTIVE_SIGNALS.has(signal)) || (!mappedReactive && !presentationReactive)) errors.push(`nonreactive-visualizer:${layer.id}`);
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
    visualCoverage,
    deduplication: { manifestBytes: Buffer.byteLength(serialized), expandedTemplateEstimateBytes: expandedEstimate, repeatedSceneStructuresTemplated: true },
    offlineFrameCount: (show.stemFrames?.stems || []).reduce((sum, stem) => sum + stem.frames.length, 0),
  };
}
