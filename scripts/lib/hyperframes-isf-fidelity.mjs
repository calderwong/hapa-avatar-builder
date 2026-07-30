import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const DEFAULT_MUSIC_VIZ_ROOT = "/Users/calderwong/Desktop/hapa-music-viz";
export const DEFAULT_ISF_MANIFEST = path.join(DEFAULT_MUSIC_VIZ_ROOT, "web/isf/manifest.json");
export const DEFAULT_ISF_RUNTIME = path.join(DEFAULT_MUSIC_VIZ_ROOT, "web/vendor/isf-renderer.js");
export const DEFAULT_ISF_PROXY_REGISTRY = path.join(DEFAULT_MUSIC_VIZ_ROOT, "web/isf/proxies/native-exact-proxies.json");

function sha256(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function usableRegularFile(candidate) {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function normalizedShaderId(value) {
  return String(value || "").replace(/^isf:/, "");
}

function canonicalSha256(value) {
  const hash = String(value || "").trim().toLowerCase();
  if (!hash) return "";
  return hash.startsWith("sha256:") ? hash : `sha256:${hash}`;
}

function inputName(input = {}) {
  return String(input.NAME || input.name || "");
}

function inputType(input = {}) {
  return String(input.TYPE || input.type || "").toLowerCase();
}

function resolveShaderSourcePath(manifestPath, source) {
  const manifestRoot = path.dirname(manifestPath);
  const sourcePath = String(source || "");
  if (!sourcePath) return "";
  if (path.isAbsolute(sourcePath) && !sourcePath.startsWith("/static/")) return sourcePath;
  if (sourcePath.startsWith("/static/")) {
    return path.resolve(manifestRoot, "..", sourcePath.replace(/^\/static\//, ""));
  }
  return path.resolve(manifestRoot, sourcePath);
}

function sourceCapabilities(source, shader = {}) {
  const declaredImageInputs = (shader.inputs || [])
    .filter((input) => inputType(input) === "image")
    .map(inputName)
    .filter(Boolean);
  const filterRequiresMedia = String(shader.shaderType || "").toLowerCase() === "filter";
  const imageInputs = filterRequiresMedia && declaredImageInputs.length === 0
    ? ["inputImage"]
    : declaredImageInputs;
  const multipass = /["']PASSES["']\s*:/.test(source);
  const persistent = /["'](?:PERSISTENT|persistent)["']\s*:\s*true/i.test(source);
  return {
    imageInputs,
    requiresMedia: imageInputs.length > 0 || filterRequiresMedia,
    multipass,
    persistent,
    timelineRequirement: persistent ? "sequential-from-cue-start" : "explicit-pinned-time",
  };
}

export function loadVerifiedIsfCatalog({
  manifestPath = DEFAULT_ISF_MANIFEST,
  runtimePath = DEFAULT_ISF_RUNTIME,
  proxyRegistryPath = DEFAULT_ISF_PROXY_REGISTRY,
} = {}) {
  if (!usableRegularFile(manifestPath)) throw new Error(`The ISF source manifest is unavailable: ${manifestPath}`);
  if (!usableRegularFile(runtimePath)) throw new Error(`The pinned browser ISF runtime is unavailable: ${runtimePath}`);
  if (!usableRegularFile(proxyRegistryPath)) throw new Error(`The browser ISF execution registry is unavailable: ${proxyRegistryPath}`);
  const manifestBytes = fs.readFileSync(manifestPath);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  const proxyRegistryBytes = fs.readFileSync(proxyRegistryPath);
  const proxyRegistry = JSON.parse(proxyRegistryBytes.toString("utf8"));
  const proxyById = new Map((proxyRegistry.proxies || []).map((entry) => [
    normalizedShaderId(entry.shaderId || entry.id),
    entry,
  ]));
  const failureById = new Map((proxyRegistry.failures || []).map((entry) => [
    normalizedShaderId(entry.shaderId || entry.id),
    entry,
  ]));
  const shaders = Array.isArray(manifest.shaders) ? manifest.shaders : [];
  const entries = shaders.map((shader) => {
    const shaderId = normalizedShaderId(shader.shaderId || shader.id);
    const sourcePath = resolveShaderSourcePath(manifestPath, shader.source);
    const sourceAvailable = usableRegularFile(sourcePath);
    const source = sourceAvailable ? fs.readFileSync(sourcePath, "utf8") : "";
    const declaredSourceHash = canonicalSha256(shader.sourceHash || shader.sourceSha256);
    const observedSourceHash = sourceAvailable ? sha256(source) : "";
    const sourceHashVerified = Boolean(
      sourceAvailable
      && declaredSourceHash
      && observedSourceHash === declaredSourceHash
    );
    const proxyEvidence = proxyById.get(shaderId) || null;
    const failureEvidence = failureById.get(shaderId) || null;
    const browserExecutable = Boolean(
      proxyEvidence
      && canonicalSha256(proxyEvidence.sourceHash) === observedSourceHash
      && proxyEvidence.verified === true
      && proxyEvidence.browserAttempt?.compileSucceeded === true
      && proxyEvidence.browserAttempt?.drawSucceeded === true
      && Number(proxyEvidence.frameCount || 0) > 0
    );
    const sourceVerified = Boolean(
      sourceHashVerified
      && browserExecutable
      && shader.enabled !== false
      && shader.directorEligible !== false
    );
    const capabilities = sourceCapabilities(source, shader);
    const reason = shader.enabled === false || shader.directorEligible === false
      ? "shader-disabled-or-quarantined"
      : !sourceAvailable
        ? "shader-source-unavailable"
        : !declaredSourceHash
          ? "shader-source-hash-missing"
          : observedSourceHash !== declaredSourceHash
            ? "shader-source-hash-mismatch"
            : !browserExecutable
              ? `browser-isf-source-not-executable:${String(failureEvidence?.reason || failureEvidence?.failurePhase || "no-browser-execution-evidence")}`
            : "hash-verified-browser-isf-source";
    return {
      shaderId,
      id: `isf:${shaderId}`,
      title: String(shader.title || shaderId),
      shaderType: String(shader.shaderType || ""),
      sourceUri: String(shader.source || ""),
      sourcePath,
      declaredSourceHash,
      observedSourceHash,
      sourceHashVerified,
      browserExecutable,
      browserEvidence: proxyEvidence ? {
        route: String(proxyEvidence.route || "hash-bound-exact-proxy"),
        sourceHash: canonicalSha256(proxyEvidence.sourceHash),
        compileSucceeded: proxyEvidence.browserAttempt?.compileSucceeded !== false,
        drawSucceeded: proxyEvidence.browserAttempt?.drawSucceeded !== false,
        playableFrameCount: Number(proxyEvidence.frameCount || 0),
      } : failureEvidence ? {
        route: "unsupported",
        reason: String(failureEvidence.reason || ""),
        failurePhase: String(failureEvidence.failurePhase || ""),
        error: String(failureEvidence.error || ""),
        compileSucceeded: failureEvidence.browserAttempt?.compileSucceeded === true,
        drawSucceeded: failureEvidence.browserAttempt?.drawSucceeded === true,
      } : null,
      sourceVerified,
      reason,
      source,
      inputs: Array.isArray(shader.inputs) ? structuredClone(shader.inputs) : [],
      ...capabilities,
    };
  });
  return {
    schemaVersion: "hapa.hyperframes.isf-source-catalog.v1",
    manifestPath,
    manifestSha256: sha256(manifestBytes),
    runtimePath,
    runtimeSha256: sha256(fs.readFileSync(runtimePath)),
    proxyRegistryPath,
    proxyRegistrySha256: sha256(proxyRegistryBytes),
    entries,
    byId: new Map(entries.map((entry) => [entry.shaderId, entry])),
  };
}

export function auditHyperFramesShaderFidelity(instances = [], catalog) {
  const entries = instances.map((instance) => {
    const shaderId = normalizedShaderId(instance.visualizerId);
    const source = catalog.byId.get(shaderId) || null;
    const requestedSourceHash = canonicalSha256(instance.sourceHash || instance.declaredSourceHash);
    const sourceHashMatches = Boolean(
      source?.sourceVerified
      && requestedSourceHash
      && requestedSourceHash === source.observedSourceHash
    );
    const priorRoute = String(instance.execution?.route || instance.rendererRoute || "unsupported");
    const atlas = instance.proxy || null;
    const priorDowngrade = priorRoute === "hash-bound-exact-proxy";
    const exactSourceReady = sourceHashMatches;
    return {
      cueId: String(instance.cueId || instance.id || ""),
      shaderId,
      visualizerId: String(instance.visualizerId || ""),
      title: source?.title || String(instance.rendererTruth?.requested?.title || shaderId),
      requestedSourceHash,
      observedSourceHash: source?.observedSourceHash || "",
      sourcePath: source?.sourcePath || "",
      sourceVerified: source?.sourceVerified === true,
      sourceHashMatches,
      imageInputs: source?.imageInputs || [],
      requiresMedia: source?.requiresMedia === true,
      multipass: source?.multipass === true,
      persistent: source?.persistent === true,
      timelineRequirement: source?.timelineRequirement || "unavailable",
      previewRoute: "browser-isf-source",
      priorExportRoute: priorRoute,
      priorAtlas: atlas ? {
        width: Number(atlas.frameWidth || atlas.width || 0),
        height: Number(atlas.frameHeight || atlas.height || 0),
        fps: Number(atlas.fps || 0),
        frameCount: Number(atlas.frameCount || 0),
        fidelityBoundary: String(atlas.fidelityBoundary || ""),
      } : null,
      priorDowngrade,
      fixedExportRoute: exactSourceReady ? "deterministic-browser-isf" : "unsupported-visible-failure",
      exactSourceReady,
      reason: exactSourceReady
        ? "requested-hash-matches-packaged-isf-source"
        : source?.reason || "shader-not-present-in-source-manifest",
    };
  });
  const uniqueShaderIds = new Set(entries.map((entry) => entry.shaderId));
  const uniqueExactShaderIds = new Set(entries.filter((entry) => entry.exactSourceReady).map((entry) => entry.shaderId));
  const uniqueDowngradedShaderIds = new Set(entries.filter((entry) => entry.priorDowngrade).map((entry) => entry.shaderId));
  const unresolved = entries.filter((entry) => !entry.exactSourceReady);
  return {
    schemaVersion: "hapa.hyperframes.shader-fidelity-audit.v1",
    ok: unresolved.length === 0,
    policy: "Export executes the same hash-verified ISF source at final resolution and output fps; sampled atlases are audit evidence only and are never accepted as Preview-parity output.",
    catalog: {
      manifestPath: catalog.manifestPath,
      manifestSha256: catalog.manifestSha256,
      runtimePath: catalog.runtimePath,
      runtimeSha256: catalog.runtimeSha256,
      proxyRegistryPath: catalog.proxyRegistryPath,
      proxyRegistrySha256: catalog.proxyRegistrySha256,
      declaredShaderCount: catalog.entries.length,
      hashVerifiedSourceCount: catalog.entries.filter((entry) => entry.sourceHashVerified).length,
      browserExecutableCount: catalog.entries.filter((entry) => entry.browserExecutable).length,
      verifiedSourceCount: catalog.entries.filter((entry) => entry.sourceVerified).length,
      imageInputCount: catalog.entries.filter((entry) => entry.imageInputs.length > 0).length,
      multipassCount: catalog.entries.filter((entry) => entry.multipass).length,
      persistentCount: catalog.entries.filter((entry) => entry.persistent).length,
    },
    instances: {
      declared: entries.length,
      uniqueShaders: uniqueShaderIds.size,
      exactSourceReady: entries.filter((entry) => entry.exactSourceReady).length,
      uniqueExactShaders: uniqueExactShaderIds.size,
      priorAtlasDowngrades: entries.filter((entry) => entry.priorDowngrade).length,
      uniquePriorAtlasDowngrades: uniqueDowngradedShaderIds.size,
      imageInputInstances: entries.filter((entry) => entry.imageInputs.length > 0).length,
      multipassInstances: entries.filter((entry) => entry.multipass).length,
      persistentInstances: entries.filter((entry) => entry.persistent).length,
      unresolved: unresolved.length,
    },
    entries,
    unresolved,
  };
}

export function promoteVerifiedIsfInstances(instances = [], catalog, audit, {
  width,
  height,
  fps,
} = {}) {
  const auditByCueId = new Map(audit.entries.map((entry) => [entry.cueId, entry]));
  const sources = {};
  let promoted = 0;
  for (const instance of instances) {
    const cueId = String(instance.cueId || instance.id || "");
    const evidence = auditByCueId.get(cueId);
    const source = evidence ? catalog.byId.get(evidence.shaderId) : null;
    if (!evidence?.exactSourceReady || !source) {
      instance.liveIsf = null;
      instance.proxy = null;
      instance.execution = {
        ...(instance.execution || {}),
        mode: "visible-diagnostic",
        route: "unsupported",
        status: "unsupported",
        drawable: false,
        reason: `exact-isf-source-required:${evidence?.reason || "missing-audit-evidence"}`,
        silentDefault: false,
      };
      instance.rendererTruth = {
        ...(instance.rendererTruth || {}),
        route: "unsupported",
        status: "unsupported",
        readiness: "unavailable",
        reason: instance.execution.reason,
        fidelityLoss: ["requested-shader-not-presented"],
        silentDefault: false,
      };
      continue;
    }
    sources[source.observedSourceHash] = source.source;
    instance.liveIsf = {
      schemaVersion: "hapa.hyperframes.deterministic-browser-isf.v2",
      shaderId: source.shaderId,
      sourceHash: source.observedSourceHash,
      runtimeSha256: catalog.runtimeSha256,
      sourceUri: source.sourceUri,
      imageInputs: [...source.imageInputs],
      requiresMedia: source.requiresMedia,
      multipass: source.multipass,
      persistent: source.persistent,
      timelineRequirement: source.timelineRequirement,
      clock: "pinned-show-time",
      frameRate: Number(fps),
      width: Number(width),
      height: Number(height),
    };
    instance.proxy = null;
    instance.execution = {
      ...(instance.execution || {}),
      mode: "offline-browser-isf",
      route: "deterministic-browser-isf",
      status: "exact",
      drawable: true,
      reason: "hash-bound-isf-source-executed-at-final-resolution-and-fps",
      silentDefault: false,
    };
    instance.nativeRoute = {
      ...(instance.nativeRoute || {}),
      route: "deterministic-browser-isf",
      status: "exact",
      proxy: null,
      fidelityLoss: [],
      reason: instance.execution.reason,
      silentDefault: false,
    };
    instance.rendererTruth = {
      ...(instance.rendererTruth || {}),
      route: "deterministic-browser-isf",
      status: "exact",
      readiness: "ready",
      reason: instance.execution.reason,
      fidelityLoss: [],
      silentDefault: false,
    };
    promoted += 1;
  }
  return { promoted, sources };
}
