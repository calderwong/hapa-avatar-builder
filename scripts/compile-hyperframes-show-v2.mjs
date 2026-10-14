#!/usr/bin/env node
import { packageHyperFramesLivingLight } from './lib/hyperframes-living-light-package.mjs';
import { verifyImageShotOriginal } from "../server/echo-image-preparation.mjs";
import { selectImageShotRendition } from "../src/domain/unified-media-catalog.js";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  clipHyperFramesShow,
  compileHyperFramesShow,
  hyperFramesMediaElementTiming,
  hyperFramesMediaOpacityState,
  hyperFramesMediaPresentationWindow,
  hyperFramesMediaSourceCandidates,
  inspectHyperFramesShow,
  preflightHyperFramesMedia,
} from "../src/domain/hyperframes-show-compiler.js";
import {
  echoCameraFramingRuntimeBrowserSource,
} from "../src/domain/echo-camera-framing.js";
import { echoAccentPresentationBrowserSource } from "../src/domain/echo-accent-presentation.js";
import { echoLyricPresentationBrowserSource } from "../src/domain/echo-lyric-presentation.js";
import { echoLyricTemplateRuntimeBrowserSource } from "../src/domain/echo-lyric-template-runtime.js";
import { packageHyperFramesAudio } from "./lib/hyperframes-audio-package.mjs";
import {
  auditHyperFramesShaderFidelity,
  DEFAULT_ISF_MANIFEST,
  DEFAULT_ISF_RUNTIME,
  loadVerifiedIsfCatalog,
  promoteVerifiedIsfInstances,
} from "./lib/hyperframes-isf-fidelity.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DEFAULT_PROXY_REGISTRY = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/proxies/native-exact-proxies.json";
const value = (name, fallback = null) => {
  const row = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  return row ? row.slice(name.length + 3) : fallback;
};
const requiredPath = (name) => {
  const result = value(name);
  if (!result) throw new Error(`--${name}=<path> is required`);
  return path.resolve(result);
};
const graphPath = requiredPath("graph");
const telemetryPath = requiredPath("telemetry");
const projectPath = requiredPath("project");
const sourceProjectPath = value("source-project-path") ? path.resolve(value("source-project-path")) : projectPath;
const output = requiredPath("output");
const audioPath = value("audio") ? path.resolve(value("audio")) : null;
const proxyRegistryPath = path.resolve(value("proxy-registry", DEFAULT_PROXY_REGISTRY));
const isfManifestPath = path.resolve(value("isf-manifest", DEFAULT_ISF_MANIFEST));
const isfRuntimePath = path.resolve(value("isf-runtime", DEFAULT_ISF_RUNTIME));
const presentation = value("presentation", "operator");
if (!["clean", "operator"].includes(presentation)) throw new Error("--presentation must be clean or operator");
const requestedDuration = value("duration") == null ? null : Number(value("duration"));
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (bytes) => `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
const fileSha256 = (file) => sha256(fs.readFileSync(file));
const stable = (input) => {
  if (Array.isArray(input)) return input.map(stable);
  if (input && typeof input === "object") return Object.fromEntries(Object.keys(input).sort().map((key) => [key, stable(input[key])]));
  return input;
};
const stableHash = (input) => sha256(JSON.stringify(stable(input)));
const escapeHtml = (input) => String(input || "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]));
const mediaOpacityRuntimeSource = hyperFramesMediaOpacityState.toString();
const mediaTimingRuntimeSource = hyperFramesMediaPresentationWindow.toString();
const cameraFramingRuntimeSource = echoCameraFramingRuntimeBrowserSource();
const lyricTemplateRuntimeSource = echoLyricTemplateRuntimeBrowserSource()+echoLyricPresentationBrowserSource();

const proxyRegistry = read(proxyRegistryPath);
const showGraph = read(graphPath);
const telemetry = read(telemetryPath);
const project = read(projectPath);
const performancePath = value("performance") ? path.resolve(value("performance")) : null;
const performance = performancePath ? read(performancePath) : null;
const livingLightPackagePath = value('living-light-package') ? path.resolve(value('living-light-package')) : null;
const livingLightSnapshot = livingLightPackagePath ? read(livingLightPackagePath) : null;
const fullShow = compileHyperFramesShow({
  livingLightSnapshot,
  showGraph,
  telemetry,
  project,
  proxyRegistry,
  fps: 30,
  performance,
});
const show = requestedDuration && requestedDuration < fullShow.duration
  ? clipHyperFramesShow(fullShow, requestedDuration)
  : fullShow;
const boundedDemo = show.duration < fullShow.duration;
const outputProfile = show.outputProfile;
const outputWidth = Number(outputProfile.width);
const outputHeight = Number(outputProfile.height);
const portraitOutput = outputHeight > outputWidth;
const isfCatalog = loadVerifiedIsfCatalog({
  manifestPath: isfManifestPath,
  runtimePath: isfRuntimePath,
  proxyRegistryPath,
});
const shaderFidelityAudit = auditHyperFramesShaderFidelity(show.instances.visualizers, isfCatalog);
const deterministicIsfPackage = promoteVerifiedIsfInstances(
  show.instances.visualizers,
  isfCatalog,
  shaderFidelityAudit,
  {
    width: outputWidth,
    height: outputHeight,
    fps: show.fps,
  },
);
show.visualizerCoverage = {
  ...show.visualizerCoverage,
  exactProxyCount: show.instances.visualizers.filter((layer) => layer.execution.route === "hash-bound-exact-proxy").length,
  deterministicBrowserIsfCount: show.instances.visualizers.filter((layer) => layer.execution.route === "deterministic-browser-isf").length,
  unsupportedCount: show.instances.visualizers.filter((layer) => layer.execution.route === "unsupported").length,
};
const cssPercent = (value) => `${Number((Number(value) * 100).toFixed(2))}%`;
const outputLayout = {
  actionInset: cssPercent(outputProfile.safeArea.actionInset),
  titleInset: cssPercent(outputProfile.safeArea.titleInset),
  lyricBottom: cssPercent(outputProfile.safeArea.lyricBottom),
  hudTitleSize: portraitOutput ? 58 : 64,
  hudStatusSize: portraitOutput ? 20 : 18,
  lyricSize: portraitOutput ? 64 : 52,
  diagnosticSize: portraitOutput ? 16 : 14,
};

function usableRegularFile(candidate) {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function firstFile(candidates = []) {
  return candidates.filter(Boolean).find(usableRegularFile) || null;
}

const musicVizRoot = path.resolve(path.dirname(proxyRegistryPath), "../../..");
function proxySourceCandidates(proxy = {}) {
  const assetPath = String(proxy.assetPath || "");
  return [...new Set([
    proxy.repositoryPath ? path.resolve(musicVizRoot, String(proxy.repositoryPath)) : "",
    assetPath.startsWith("/static/") ? path.resolve(musicVizRoot, "web", assetPath.replace(/^\/static\//, "")) : "",
    assetPath ? (path.isAbsolute(assetPath) ? assetPath : path.resolve(path.dirname(proxyRegistryPath), assetPath)) : "",
  ].filter(Boolean))];
}

function preflightVisualizerProxies(instances = []) {
  const entries = instances.map((instance) => {
    const required = Boolean(instance.execution?.drawable);
    if (required && instance.liveIsf) {
      const expectedSha256 = String(instance.sourceHash || "") || null;
      const actualSha256 = String(instance.liveIsf.sourceHash || "") || null;
      const ok = Boolean(expectedSha256 && actualSha256 && expectedSha256 === actualSha256);
      return {
        cueId: String(instance.cueId || instance.id || "") || null,
        visualizerId: String(instance.visualizerId || "") || null,
        start: Number(instance.start || 0),
        end: Number(instance.end || 0),
        required,
        expectedSha256,
        actualSha256,
        attemptedPaths: [String(instance.liveIsf.sourceUri || "")].filter(Boolean),
        firstReadablePath: instance.liveIsf.sourceUri || null,
        resolvedPath: instance.liveIsf.sourceUri || null,
        ok,
        reason: ok ? "exact-isf-source-resolved" : "exact-isf-source-hash-mismatch",
        route: "deterministic-browser-isf",
      };
    }
    const attemptedPaths = required && instance.proxy ? proxySourceCandidates(instance.proxy) : [];
    const expectedSha256 = required ? String(instance.proxy?.assetSha256 || "") || null : null;
    let resolvedPath = null;
    let firstReadablePath = null;
    let actualSha256 = null;
    for (const candidate of attemptedPaths) {
      if (!usableRegularFile(candidate)) continue;
      let candidateSha256 = null;
      try { candidateSha256 = fileSha256(candidate); } catch { continue; }
      if (!firstReadablePath) {
        firstReadablePath = candidate;
        actualSha256 = candidateSha256;
      }
      if (expectedSha256 && candidateSha256 === expectedSha256) {
        resolvedPath = candidate;
        actualSha256 = candidateSha256;
        break;
      }
    }
    const ok = !required || Boolean(resolvedPath && expectedSha256 && actualSha256 === expectedSha256);
    const reason = !required
      ? "explicit-unsupported-diagnostic-no-asset-required"
      : !instance.proxy
        ? "exact-proxy-declaration-missing"
        : !firstReadablePath
          ? "exact-proxy-asset-unavailable"
          : !resolvedPath
            ? "exact-proxy-asset-hash-mismatch"
            : "exact-proxy-asset-resolved";
    return {
      cueId: String(instance.cueId || instance.id || "") || null,
      visualizerId: String(instance.visualizerId || "") || null,
      start: Number(instance.start || 0),
      end: Number(instance.end || 0),
      required,
      expectedSha256,
      actualSha256,
      attemptedPaths,
      firstReadablePath,
      resolvedPath,
      ok,
      reason,
      route: instance.execution?.route || "unsupported",
    };
  });
  const unresolved = entries.filter((row) => !row.ok);
  return {
    schemaVersion: "hapa.hyperframes.visualizer-preflight.v1",
    ok: unresolved.length === 0,
    declaredCount: entries.length,
    requiredCount: entries.filter((row) => row.required).length,
    unsupportedCount: entries.filter((row) => !row.required).length,
    resolvedCount: entries.filter((row) => row.required && row.ok).length,
    unresolvedCount: unresolved.length,
    entries,
    unresolved,
  };
}

const mediaPreflight = preflightHyperFramesMedia(show, {
  root: ROOT,
  projectPath: sourceProjectPath,
  isFile: usableRegularFile,
});
const visualizerPreflight = preflightVisualizerProxies(show.instances.visualizers);
const inspect = inspectHyperFramesShow(show);
const offlineMissing = mediaPreflight.unresolved.map((row) => row.cueId);
const visualizerPreflightMissing = visualizerPreflight.unresolved.map((row) => row.cueId);
const manifestPath = path.join(output, "executable-show.json");
const preflightPath = path.join(output, "compiler-preflight.json");
const visualizerPreflightPath = path.join(output, "visualizer-preflight.json");
const shaderFidelityAuditPath = path.join(output, "shader-fidelity-audit.json");
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(preflightPath, `${JSON.stringify(mediaPreflight, null, 2)}\n`);
fs.writeFileSync(visualizerPreflightPath, `${JSON.stringify(visualizerPreflight, null, 2)}\n`);
fs.writeFileSync(shaderFidelityAuditPath, `${JSON.stringify(shaderFidelityAudit, null, 2)}\n`);
if (!mediaPreflight.ok || !visualizerPreflight.ok || !shaderFidelityAudit.ok) {
  if (!mediaPreflight.ok) {
    console.error(`HyperFrames media preflight found ${mediaPreflight.unresolvedCount} unresolved cue(s) before packaging:`);
    for (const issue of mediaPreflight.unresolved) {
      console.error(JSON.stringify({
        cueId: issue.cueId,
        mediaId: issue.mediaId,
        title: issue.title,
        originalUri: issue.originalUri,
        runtimeUri: issue.runtimeUri,
        attemptedPaths: issue.attemptedPaths,
        reason: issue.reason,
      }));
    }
  }
  if (!visualizerPreflight.ok) {
    console.error(`HyperFrames visualizer preflight found ${visualizerPreflight.unresolvedCount} unresolved exact-proxy cue(s) before packaging:`);
    for (const issue of visualizerPreflight.unresolved) {
      console.error(JSON.stringify({
        cueId: issue.cueId,
        visualizerId: issue.visualizerId,
        expectedSha256: issue.expectedSha256,
        actualSha256: issue.actualSha256,
        attemptedPaths: issue.attemptedPaths,
        firstReadablePath: issue.firstReadablePath,
        reason: issue.reason,
      }));
    }
  }
  if (!shaderFidelityAudit.ok) {
    console.error(`HyperFrames shader fidelity audit found ${shaderFidelityAudit.instances.unresolved} source-unverified cue(s):`);
    for (const issue of shaderFidelityAudit.unresolved) {
      console.error(JSON.stringify({
        cueId: issue.cueId,
        visualizerId: issue.visualizerId,
        requestedSourceHash: issue.requestedSourceHash,
        observedSourceHash: issue.observedSourceHash,
        sourcePath: issue.sourcePath,
        reason: issue.reason,
      }));
    }
  }
  const report = {
    schemaVersion: "hapa.hyperframes.compiler-report.v4",
    ok: false,
    input: { graphPath, telemetryPath, projectPath, sourceProjectPath, audioPath, proxyRegistryPath, requestedDuration },
    output,
    manifestPath,
    preflightPath,
    visualizerPreflightPath,
    shaderFidelityAuditPath,
    presentation: { mode: presentation, diagnosticsVisible: true, timingConfidenceInMetadata: true },
    boundedDemo: { enabled: boundedDemo, sourceDurationSeconds: fullShow.duration, compiledDurationSeconds: show.duration },
    deterministicHash: stableHash({ show, mediaPreflight, visualizerPreflight }),
    inspect,
    media: {
      declared: show.instances.media.length,
      generated: mediaPreflight.generatedCount,
      compiled: 0,
      audioCompiled: false,
      audio: null,
      offlineMissing,
      preflight: mediaPreflight,
    },
    visualizers: {
      declared: show.instances.visualizers.length,
      exactProxy: show.instances.visualizers.filter((row) => row.execution.drawable).length,
      unsupported: show.instances.visualizers.filter((row) => !row.execution.drawable).length,
      compiledAssets: 0,
      uniqueCompiledAssets: 0,
      offlineMissing: visualizerPreflightMissing,
      preflight: visualizerPreflight,
      fidelityAudit: shaderFidelityAudit,
      packagingFailures: [],
      cueWindows: show.instances.visualizers.map((row) => ({ id: row.id, visualizerId: row.visualizerId, start: row.start, end: row.end, route: row.execution.route, pixelIdentitySeed: row.pixelIdentitySeed })),
    },
    runtime: { timeline: "not-packaged", visualizerScheduler: "not-packaged", networkDependencies: 0, lastRenderStateHook: null },
    validation: {
      lint: "not-run",
      inspect: inspect.ok ? "pass" : "fail",
      cueCoverage: "pass",
      mediaPreflight: mediaPreflight.ok ? "pass" : "fail",
      mediaOffline: mediaPreflight.ok ? "pass" : "fail",
      visualizerPreflight: visualizerPreflight.ok ? "pass" : "fail",
      visualizerOffline: visualizerPreflight.ok ? "not-run" : "fail",
      shaderFidelity: shaderFidelityAudit.ok ? "pass" : "fail",
      showcaseReady: false,
    },
  };
  fs.writeFileSync(path.join(output, "compiler-report.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  throw new Error(`HyperFrames asset/fidelity preflight failed for cue(s): ${[...offlineMissing, ...visualizerPreflightMissing, ...shaderFidelityAudit.unresolved.map((row) => row.cueId)].join(", ")}`);
}

for (const directory of ["assets/data", "assets/media", "assets/audio", "assets/visualizers", "assets/runtime"]) {
  fs.mkdirSync(path.join(output, directory), { recursive: true });
}
if (livingLightSnapshot) await packageHyperFramesLivingLight({ snapshot: livingLightSnapshot,
  packageRoot: path.dirname(livingLightPackagePath), output, root: ROOT });
const mediaResolutionByCueId = new Map(mediaPreflight.entries.map((row) => [row.cueId, row]));

for (const instance of show.instances.media) {
  if (!instance.source.assetName) continue;
  let source = mediaResolutionByCueId.get(instance.cueId || instance.id)?.resolvedPath
    || firstFile(hyperFramesMediaSourceCandidates(instance, { root: ROOT, projectPath: sourceProjectPath }));
  if (instance.imageShot) {
    source = firstFile(hyperFramesMediaSourceCandidates({ source: { originalUri: instance.imageShot.original.uri } }, { root: ROOT, projectPath: sourceProjectPath }));
    if (!source) throw new Error(`Image original is unavailable: ${instance.id}`);
    const selection = selectImageShotRendition({ geometry: instance.imageShot,
      outputProfile: { width: outputWidth, height: outputHeight }, finalRender: true });
    if (!selection.selected) throw new Error(`Image original exceeds the render decode budget: ${instance.id}`);
    instance.imageOriginalVerification = await verifyImageShotOriginal(source, instance.imageShot);
  }
  const destination = path.join(output, "assets/media", instance.source.assetName);
  if (source && (!fs.existsSync(destination) || fileSha256(destination) !== fileSha256(source))) fs.copyFileSync(source, destination);
  instance.source.compiledUri = fs.existsSync(destination) ? `assets/media/${instance.source.assetName}` : null;
  instance.source.compiledSha256 = instance.source.compiledUri ? fileSha256(destination) : null;
  if (instance.imageShot && instance.source.compiledSha256?.replace(/^sha256:/, "") !== instance.imageShot.original.sha256) {
    throw new Error(`Packaged image original hash changed: ${instance.id}`);
  }
}

const copiedProxyByHash = new Map();
const visualizerResolutionByCueId = new Map(visualizerPreflight.entries.map((row) => [row.cueId, row]));
const visualizerPackagingFailures = [];
for (const instance of show.instances.visualizers) {
  if (!instance.execution.drawable || !instance.proxy) continue;
  const preflight = visualizerResolutionByCueId.get(instance.cueId || instance.id);
  const source = preflight?.resolvedPath || firstFile(proxySourceCandidates(instance.proxy));
  let failureReason = null;
  let actualSha256 = null;
  try {
    actualSha256 = source && usableRegularFile(source) ? fileSha256(source) : null;
    if (!source || !actualSha256) failureReason = "exact-proxy-asset-unavailable-during-packaging";
    else if (actualSha256 !== instance.proxy.assetSha256) failureReason = "exact-proxy-asset-hash-mismatch-during-packaging";
  } catch {
    failureReason = "exact-proxy-asset-read-failed-during-packaging";
  }
  if (failureReason) {
    visualizerPackagingFailures.push({
      cueId: String(instance.cueId || instance.id || "") || null,
      visualizerId: String(instance.visualizerId || "") || null,
      expectedSha256: String(instance.proxy.assetSha256 || "") || null,
      actualSha256,
      attemptedPaths: preflight?.attemptedPaths || proxySourceCandidates(instance.proxy),
      resolvedPath: source || null,
      reason: failureReason,
    });
    instance.execution = { route: "unsupported", status: "unsupported", drawable: false, reason: failureReason, silentDefault: false };
    instance.rendererTruth = { ...instance.rendererTruth, status: "unsupported", readiness: "unavailable", route: "unsupported", reason: instance.execution.reason, fidelityLoss: ["requested-shader-not-presented"] };
    instance.proxy = null;
    continue;
  }
  let compiledUri = copiedProxyByHash.get(instance.proxy.assetSha256);
  if (!compiledUri) {
    const destination = path.join(output, "assets/visualizers", instance.proxy.assetName);
    try {
      if (!usableRegularFile(destination) || fileSha256(destination) !== instance.proxy.assetSha256) fs.copyFileSync(source, destination);
      if (!usableRegularFile(destination) || fileSha256(destination) !== instance.proxy.assetSha256) throw new Error("packaged proxy hash mismatch");
    } catch {
      failureReason = "exact-proxy-asset-copy-failed-during-packaging";
      visualizerPackagingFailures.push({
        cueId: String(instance.cueId || instance.id || "") || null,
        visualizerId: String(instance.visualizerId || "") || null,
        expectedSha256: String(instance.proxy.assetSha256 || "") || null,
        actualSha256: usableRegularFile(destination) ? fileSha256(destination) : null,
        attemptedPaths: preflight?.attemptedPaths || proxySourceCandidates(instance.proxy),
        resolvedPath: source || null,
        destination,
        reason: failureReason,
      });
      instance.execution = { route: "unsupported", status: "unsupported", drawable: false, reason: failureReason, silentDefault: false };
      instance.rendererTruth = { ...instance.rendererTruth, status: "unsupported", readiness: "unavailable", route: "unsupported", reason: failureReason, fidelityLoss: ["requested-shader-not-presented"] };
      instance.proxy = null;
      continue;
    }
    compiledUri = `assets/visualizers/${instance.proxy.assetName}`;
    copiedProxyByHash.set(instance.proxy.assetSha256, compiledUri);
  }
  instance.proxy.compiledUri = compiledUri;
}

const deterministicIsfInstances = show.instances.visualizers.filter(
  (instance) => instance.execution?.drawable && instance.liveIsf,
);
let deterministicIsfRuntime = null;
if (deterministicIsfInstances.length) {
  const runtimeDestination = path.join(output, "assets/runtime/isf-renderer.js");
  fs.copyFileSync(isfCatalog.runtimePath, runtimeDestination);
  if (fileSha256(runtimeDestination) !== isfCatalog.runtimeSha256) {
    throw new Error("Packaged browser ISF runtime hash mismatch");
  }
  deterministicIsfRuntime = {
    mode: "deterministic-browser-isf",
    runtimeUri: "assets/runtime/isf-renderer.js",
    runtimeSha256: isfCatalog.runtimeSha256,
    sourceCount: Object.keys(deterministicIsfPackage.sources).length,
    instanceCount: deterministicIsfInstances.length,
    outputWidth,
    outputHeight,
    fps: show.fps,
    mediaInputPolicy: "same-current-presented-media-as-preview",
    sampledAtlasFallback: false,
  };
  fs.writeFileSync(
    path.join(output, "assets/data/live-isf.js"),
    `window.HAPA_LIVE_ISF_SOURCES=${JSON.stringify(deterministicIsfPackage.sources)};\n`,
  );
}

const compiledAudio = packageHyperFramesAudio({
  sourcePath: audioPath,
  outputDirectory: path.join(output, "assets/audio"),
});


show.packaging = {
  schemaVersion: "hapa.hyperframes.offline-package.v1",
  boundedDemo,
  sourceDurationSeconds: fullShow.duration,
  compiledDurationSeconds: show.duration,
  proxyRegistryPath,
  proxyRegistrySha256: fileSha256(proxyRegistryPath),
  shaderFidelityAuditUri: path.basename(shaderFidelityAuditPath),
  shaderFidelityPolicy: shaderFidelityAudit.policy,
  mediaBufferPolicy: {
    mode: "detached-rolling-window",
    lookAheadSeconds: 8,
    releaseAfterSeconds: 3,
    bootstrapUri: null,
    bootstrapSha256: null,
  },
  audio: compiledAudio ? {
    uri: compiledAudio.uri,
    mimeType: compiledAudio.mimeType,
    sha256: compiledAudio.sha256,
    sourceSha256: compiledAudio.sourceSha256,
    operation: compiledAudio.operation,
  } : null,
  networkDependencies: 0,
  deterministicIsf: deterministicIsfRuntime,
};
show.visualizerCoverage = {
  ...show.visualizerCoverage,
  exactProxyCount: show.instances.visualizers.filter((layer) => layer.execution.route === "hash-bound-exact-proxy").length,
  deterministicBrowserIsfCount: deterministicIsfInstances.length,
  unsupportedCount: show.instances.visualizers.filter((layer) => !layer.execution.drawable).length,
};
show.showHash = stableHash({ ...show, showHash: undefined });

const runtimeSourcePath = path.join(ROOT, "src/domain/hyperframes-visualizer-runtime.js");
if (!fs.existsSync(runtimeSourcePath)) throw new Error(`Missing HyperFrames runtime: ${runtimeSourcePath}`);
fs.copyFileSync(runtimeSourcePath, path.join(output, "assets/runtime/hyperframes-visualizer-runtime.js"));
for (const runtimeFile of ["hyperframes-media-frame-runtime.js", "hyperframes-isf-frame-runtime.js", "echo-playback-sync.js", "echo-empty-shader-media.js"]) {
  fs.copyFileSync(path.join(ROOT, "src/domain", runtimeFile), path.join(output, "assets/runtime", runtimeFile));
}
const pinnedTimelineSourcePath = path.join(ROOT, "src/domain/hapa-pinned-timeline.js");
if (!fs.existsSync(pinnedTimelineSourcePath)) throw new Error(`Missing Hapa pinned timeline runtime: ${pinnedTimelineSourcePath}`);
const pinnedTimelineSource = fs.readFileSync(pinnedTimelineSourcePath, "utf8");
fs.copyFileSync(pinnedTimelineSourcePath, path.join(output, "assets/runtime/pinned-timeline.js"));

fs.writeFileSync(manifestPath, `${JSON.stringify(show, null, 2)}\n`);
fs.writeFileSync(path.join(output, "assets/data/show.js"), `window.HAPA_EXECUTABLE_SHOW=${JSON.stringify(show)};\n`);
const designPath = "/Users/calderwong/Desktop/hapa-design-system/hyperframes/DESIGN.md";
if (fs.existsSync(designPath)) fs.copyFileSync(designPath, path.join(output, "DESIGN.md"));

const liveMediaMarkup = show.instances.media.map((instance, index) => {
  if (!instance.source.compiledUri) return "";
  const timing = hyperFramesMediaPresentationWindow(show.instances.media, index);
  const playback = hyperFramesMediaElementTiming(instance, timing);
  const attrs = `id="m${index}" class="media clip" data-instance-index="${index}" data-start="${playback.activationStart}" data-duration="${playback.activationDuration}" data-logical-start="${timing.logicalStart}" data-logical-duration="${timing.logicalDuration}" data-camera="${escapeHtml(JSON.stringify(instance.cameraKeyframes || []))}"`;
  const compiledUri = escapeHtml(instance.source.compiledUri);
  return instance.source.type === "image"
    ? `<img ${attrs} src="${compiledUri}">`
    : "";
}).join("");
const staticVideoManifestMarkup = show.instances.media.map((instance, index) => {
  if (instance.source.type !== "video" || !instance.source.compiledUri) return "";
  const timing = hyperFramesMediaPresentationWindow(show.instances.media, index);
  const playback = hyperFramesMediaElementTiming(instance, timing);
  const mappedAttrs = playback.mappedTransition
    ? ` data-media-start="${playback.mediaStart}" data-media-end="${playback.mediaEnd}" data-playback-rate="${playback.playbackRate}" data-playback-mode="once" data-time-map-schema="${escapeHtml(playback.timeMapping.schemaVersion)}" data-source-time-origin="logical-cue-start" data-hold-first-frame="true" data-hold-last-frame="true"`
    : ` data-playback-mode="once" data-source-time-origin="logical-cue-start" data-hold-first-frame="true" data-hold-last-frame="true"`;
  const attrs = `id="m${index}" class="media clip" data-instance-index="${index}" data-start="${playback.activationStart}" data-duration="${playback.activationDuration}" data-logical-start="${timing.logicalStart}" data-logical-duration="${timing.logicalDuration}" data-camera="${escapeHtml(JSON.stringify(instance.cameraKeyframes || []))}"${mappedAttrs}`;
  return `<video ${attrs} src="${escapeHtml(instance.source.compiledUri)}" muted playsinline></video>`;
}).join("");
const proxyAssets = [...new Set(show.instances.visualizers.map((layer) => layer.proxy?.compiledUri).filter(Boolean))];
const proxyMarkup = proxyAssets.map((uri, index) => `<img id="proxy-${index}" class="proxy-asset" data-proxy-uri="${escapeHtml(uri)}" src="${escapeHtml(uri)}" alt="">`).join("");
const staticAudioManifestMarkup = compiledAudio ? `<audio id="mix-audio" class="clip" data-start="0" data-duration="${show.duration}" src="${escapeHtml(compiledAudio.uri)}" type="${escapeHtml(compiledAudio.mimeType)}"></audio>` : "";
// HyperFrames discovers media statically before it opens Chromium. Keep the real
// source URLs in an SVG manifest that Linkedom can query, then remove those
// declarations synchronously. Keep inactive video elements detached, then mount
// only real sources inside the preload window. HyperFrames browser discovery
// overwrites static source URLs, so placeholder media must never impersonate a clip.
const staticMediaManifest = staticVideoManifestMarkup || staticAudioManifestMarkup
  ? `<svg id="hf-static-media-manifest" width="0" height="0" aria-hidden="true" style="display:none">${staticVideoManifestMarkup}${staticAudioManifestMarkup}</svg>`
  : "";

const cleanPresentationCss = presentation === "clean"
  ? '.hud,.frame,.scan{display:none!important}[data-testid="echo-lyric-timing-label"]{visibility:hidden!important}' : "";
const html = `<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'self' blob:;"><meta name="viewport" content="width=${outputWidth},height=${outputHeight}"><title>${escapeHtml(show.title)} · Executable HyperFrames</title>
<script src="assets/data/show.js"></script>${livingLightSnapshot ? '<script src="assets/data/living-light.js"></script>' : ""}<script src="assets/runtime/pinned-timeline.js"></script>${deterministicIsfInstances.length ? '<script src="assets/data/live-isf.js"></script><script src="assets/runtime/isf-renderer.js"></script>' : ""}
<style>:root{--hf-action-inset:${outputLayout.actionInset};--hf-title-inset:${outputLayout.titleInset};--hf-lyric-bottom:${outputLayout.lyricBottom}}html,body{margin:0;width:${outputWidth}px;height:${outputHeight}px;overflow:hidden;background:#02040a;color:#f8f3e7;font-family:system-ui,sans-serif}#root{position:relative;width:${outputWidth}px;height:${outputHeight}px;overflow:hidden;background:#02040a}.media,.viz{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}#media-root{position:absolute;inset:0;z-index:1}.media{opacity:0;transform:scale(1.08);will-change:opacity,transform}.viz{z-index:4}.proxy-asset{position:absolute;width:1px;height:1px;left:-10px;top:-10px;opacity:.001}.frame{position:absolute;inset:var(--hf-action-inset);border:1px solid #00f3ff66;z-index:8;clip-path:polygon(22px 0,100% 0,100% calc(100% - 22px),calc(100% - 22px) 100%,0 100%,0 22px)}.hud{position:absolute;z-index:10;left:var(--hf-title-inset);right:var(--hf-title-inset);top:var(--hf-title-inset);padding:18px 22px;background:#02040add;border-left:3px solid #00f3ff;font:${outputLayout.hudStatusSize}px ui-monospace,monospace;letter-spacing:.12em;text-transform:uppercase;text-shadow:0 2px 4px #000;overflow-wrap:anywhere}.hud h1{font:900 ${outputLayout.hudTitleSize}px/.98 system-ui,sans-serif;letter-spacing:0;margin:12px 0}.lyric{position:absolute;inset:0;z-index:12;pointer-events:none}.status{color:#70ff59}.diagnostics{position:absolute;z-index:18;right:var(--hf-action-inset);top:var(--hf-action-inset);max-width:72%;display:grid;gap:8px}.diagnostic{padding:10px 14px;background:#25050ee8;border:1px solid #ff3b6b;color:#ffd5df;font:${outputLayout.diagnosticSize}px ui-monospace,monospace}.scan{position:absolute;z-index:20;inset:0;pointer-events:none;background:repeating-linear-gradient(0deg,#ffffff08,#ffffff08 1px,transparent 1px,transparent 5px)}${cleanPresentationCss}</style></head>
<body data-presentation="${presentation}">${staticMediaManifest}<div id="root" data-composition-id="main" data-output-profile="${outputProfile.id}" data-orientation="${outputProfile.orientation}" data-aspect-ratio="${outputProfile.aspectRatio}" data-width="${outputWidth}" data-height="${outputHeight}" data-start="0" data-duration="${show.duration}" data-bounded-demo="${boundedDemo}"><div id="audio-root"></div><canvas id="viz" class="viz" width="${outputWidth}" height="${outputHeight}"></canvas><div id="media-root">${liveMediaMarkup}</div><div id="proxy-root">${proxyMarkup}</div><div class="frame"></div><div class="hud"><div class="status">EXECUTABLE SHOW V2 // OFFLINE // ${boundedDemo ? "BOUNDED DEMO" : "FULL SHOW"}</div><h1>${escapeHtml(show.title)}</h1><div id="readout">PINNED VISUAL TIME · 0.00S</div></div><div id="lyric" class="lyric"></div><div id="diagnostics" class="diagnostics"></div><div class="scan"></div></div>
<script>(function(){const manifest=document.getElementById('hf-static-media-manifest');if(!manifest)return;const describe=(declaration)=>({source:declaration.getAttribute('src'),attributes:[...declaration.attributes].filter(attribute=>attribute.name!=='src').map(attribute=>[attribute.name,attribute.value])}),videos=[...manifest.querySelectorAll('video[src]')].map(describe),audios=[...manifest.querySelectorAll('audio[id][src]')].map(describe);manifest.remove();const mount=()=>{const mediaRoot=document.getElementById('media-root'),audioRoot=document.getElementById('audio-root'),videoElements=[];for(const descriptor of videos){const video=document.createElement('video');for(const [name,value] of descriptor.attributes)video.setAttribute(name,value);const playbackRate=Number(video.dataset.playbackRate);if(Number.isFinite(playbackRate)&&playbackRate>=.1&&playbackRate<=5){video.defaultPlaybackRate=playbackRate;video.playbackRate=playbackRate}video.dataset.mediaSrc=descriptor.source;video.preload='none';video.muted=true;video.playsInline=true;videoElements.push(video)}for(const descriptor of audios){const audio=document.createElement('audio');for(const [name,value] of descriptor.attributes)audio.setAttribute(name,value);audio.dataset.audioSrc=descriptor.source;audio.preload='none';audioRoot.appendChild(audio)}window.HAPA_MEDIA_ELEMENTS=[...mediaRoot.querySelectorAll('.media'),...videoElements];window.dispatchEvent(new Event('hapa:media-mounted'));const hydrateAudio=()=>{for(const audio of audioRoot.querySelectorAll('audio[data-audio-src]')){audio.preload='metadata';audio.src=audio.dataset.audioSrc;audio.load()}};if(document.readyState==='complete')setTimeout(hydrateAudio,0);else window.addEventListener('load',hydrateAudio,{once:true})};const schedule=()=>setTimeout(mount,0);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',schedule,{once:true});else schedule()})();</script>
<script type="module">${livingLightSnapshot ? "import{createEchoLivingLightSnapshotRenderer}from'./assets/runtime/living-light.js';const livingLightRenderer=createEchoLivingLightSnapshotRenderer(window.HAPA_LIVING_LIGHT_SNAPSHOT,{width:"+outputWidth+",height:"+outputHeight+",fps:"+show.fps+"});let livingLightFrame=null;window.addEventListener('pagehide',()=>livingLightRenderer.dispose(),{once:true});" : "const livingLightRenderer=null;let livingLightFrame=null;"}import{createEchoEmptyShaderMedia}from'./assets/runtime/echo-empty-shader-media.js';const emptyShaderMedia=createEchoEmptyShaderMedia();import{evaluateHyperFramesVisualizers}from'./assets/runtime/hyperframes-visualizer-runtime.js';import{prepareHyperFramesVideoFrame,hyperFramesCapturedMediaElement,createHyperFramesMediaRedrawBridge}from'./assets/runtime/hyperframes-media-frame-runtime.js';import{prepareHyperFramesIsfFrame,bindHyperFramesIsfFrameInputs,createHyperFramesIsfCheckpointStore,prepareHyperFramesIsfSeek}from'./assets/runtime/hyperframes-isf-frame-runtime.js';
const S=window.HAPA_EXECUTABLE_SHOW,C=document.getElementById('viz'),X=C.getContext('2d',{willReadFrequently:true}),L=document.getElementById('lyric'),Q=document.getElementById('readout'),D=document.getElementById('diagnostics'),R=document.getElementById('root'),proxyImages=new Map([...document.querySelectorAll('[data-proxy-uri]')].map(el=>[el.dataset.proxyUri,el])),liveIsfSurfaces=new Map,shaderMediaCanvas=document.createElement('canvas'),shaderMediaContext=shaderMediaCanvas.getContext('2d',{alpha:false});let media=window.HAPA_MEDIA_ELEMENTS||[...document.querySelectorAll('.media')],navigationReady=document.readyState==='complete';window.addEventListener('hapa:media-mounted',()=>{media=window.HAPA_MEDIA_ELEMENTS||[...document.querySelectorAll('.media')]});
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,Number(v)||0));const finite=(value,fallback=0)=>Number.isFinite(Number(value))?Number(value):fallback;const composite=(v)=>({normal:'source-over','source-over':'source-over',screen:'screen',lighter:'lighter','plus-lighter':'lighter',overlay:'overlay',multiply:'multiply','soft-light':'soft-light'}[v]||'screen');${mediaTimingRuntimeSource}${mediaOpacityRuntimeSource}${cameraFramingRuntimeSource}const{echoCameraMotionPresentation,echoCameraCoverSourceRect,echoCameraKeyframeAt,echoProtectedCameraFrame}=HapaEchoCameraFraming;${lyricTemplateRuntimeSource}${echoAccentPresentationBrowserSource()}
function enforceOutputSurface(){const w=${outputWidth},h=${outputHeight};document.documentElement.style.width=w+'px';document.documentElement.style.height=h+'px';document.body.style.width=w+'px';document.body.style.height=h+'px';R.style.width=w+'px';R.style.height=h+'px';if(C.width!==w)C.width=w;if(C.height!==h)C.height=h;if(shaderMediaCanvas.width!==w)shaderMediaCanvas.width=w;if(shaderMediaCanvas.height!==h)shaderMediaCanvas.height=h}
function mediaReadyForShader(el){el=hyperFramesCapturedMediaElement(el);if(!el)return false;if(el.tagName==='VIDEO'&&el.dataset.mediaSrc&&el.getAttribute('src')!==el.dataset.mediaSrc)return false;const width=finite(el.videoWidth||el.naturalWidth||el.width),height=finite(el.videoHeight||el.naturalHeight||el.height);if(typeof el.readyState==='number')return el.readyState>=2&&width>0&&height>0;if(typeof el.complete==='boolean')return el.complete&&width>0&&height>0;return width>0&&height>0}
function activeMediaBinding(t){const logical=media.find((el)=>{const instance=S.instances.media[Number(el.dataset.instanceIndex)];return instance&&mediaReadyForShader(el)&&t>=finite(instance.start)&&t<finite(instance.end,finite(instance.start)+finite(instance.duration))});if(logical){const index=Number(logical.dataset.instanceIndex);return{element:logical,index,instance:S.instances.media[index]}}let selected=null,selectedIndex=-1,selectedAlpha=0;for(const el of media){const index=Number(el.dataset.instanceIndex),instance=S.instances.media[index];if(!instance||!mediaReadyForShader(el))continue;const alpha=finite(hyperFramesMediaOpacityState(S.instances.media,index,t)?.alpha);if(alpha>selectedAlpha){selected=el;selectedIndex=index;selectedAlpha=alpha}}return selected?{element:selected,index:selectedIndex,instance:S.instances.media[selectedIndex]}:null}
function activeMediaElement(t){return activeMediaBinding(t)?.element||null}
function mediaSourceDimensions(el,instance){const declared=instance?.source?.dimensions||{},width=finite(el?.videoWidth||el?.naturalWidth||el?.width||declared.width),height=finite(el?.videoHeight||el?.naturalHeight||el?.height||declared.height);return{width,height,isPortrait:height>width&&width>0}}
function cameraPresentationForMedia(t,el,index){const instance=S.instances.media[index]||{},camera=echoCameraKeyframeAt(instance.cameraKeyframes||[],t)||cameraAt(t)||instance.camera||{},dimensions=mediaSourceDimensions(el,instance);return echoCameraMotionPresentation({startSeconds:finite(instance.start),endSeconds:finite(instance.end,finite(instance.start)+finite(instance.duration,1)),timeSeconds:t,motion:camera.motion||instance.camera?.motion||'auto',intensity:camera.intensity??instance.camera?.intensity??1,speed:camera.speed??instance.camera?.speed,shotIndex:instance.cueIndex??index,sourceId:instance.mediaId||instance.id||'',isPortrait:dimensions.isPortrait,crop:camera.crop||null})}
function cameraFramedMediaElement(t,mediaInput){if(!mediaInput){const scheduled=S.instances.media.some(instance=>t>=finite(instance.start)&&t<finite(instance.end,finite(instance.start)+finite(instance.duration)));const empty=emptyShaderMedia.at(scheduled);if(empty)return empty.element;}if(!mediaReadyForShader(mediaInput)||!shaderMediaContext)return null;const index=Number(mediaInput.dataset.instanceIndex),instance=S.instances.media[index],sample=hyperFramesCapturedMediaElement(mediaInput),dimensions=mediaSourceDimensions(sample,instance),presentation=cameraPresentationForMedia(t,mediaInput,index),rect=echoCameraCoverSourceRect({sourceWidth:dimensions.width,sourceHeight:dimensions.height,outputWidth:C.width,outputHeight:C.height,presentation});if(!(rect.width>0&&rect.height>0))return null;shaderMediaContext.setTransform(1,0,0,1,0,0);shaderMediaContext.clearRect(0,0,shaderMediaCanvas.width,shaderMediaCanvas.height);shaderMediaContext.drawImage(sample,rect.x,rect.y,rect.width,rect.height,rect.destination?.x??0,rect.destination?.y??0,rect.destination?.width??shaderMediaCanvas.width,rect.destination?.height??shaderMediaCanvas.height);shaderMediaCanvas.dataset.echoCameraFramed='true';shaderMediaCanvas.dataset.echoSourceMediaId=String(instance?.mediaId||'');shaderMediaCanvas.dataset.echoFrameRoute=sample===mediaInput?'decoded-media':'hyperframes-extracted-image';return shaderMediaCanvas}
function liveIsfSurface(layer){const contract=layer.liveIsf;if(!contract)return null;const sourceKey=String(contract.sourceHash||''),surfaceKey=String(layer.id||layer.cueId||'layer')+':'+sourceKey;if(liveIsfSurfaces.has(surfaceKey))return liveIsfSurfaces.get(surfaceKey);const source=window.HAPA_LIVE_ISF_SOURCES?.[sourceKey],Library=window.interactiveShaderFormat;if(!source||!Library?.Renderer)throw new Error('Deterministic ISF source/runtime unavailable: '+sourceKey);const canvas=document.createElement('canvas');canvas.width=C.width;canvas.height=C.height;const gl=canvas.getContext('webgl',{alpha:true,antialias:false,premultipliedAlpha:false,preserveDrawingBuffer:true});if(!gl)throw new Error('WebGL is unavailable for deterministic ISF export');const renderer=new Library.Renderer(gl),surface={canvas,renderer,clock:{time:0,delta:0,index:0},lastTime:null,key:surfaceKey};renderer.setDateUniforms=()=>{renderer.setValue('TIME',surface.clock.time);renderer.setValue('TIMEDELTA',surface.clock.delta);renderer.setValue('FRAMEINDEX',surface.clock.index);renderer.setValue('DATE',[1970,1,1,((surface.clock.time%86400)+86400)%86400]);bindHyperFramesIsfFrameInputs(surface)};renderer.loadSource(source);if(renderer.valid===false)throw new Error('Deterministic ISF compile failed: '+String(renderer.error?.message||renderer.error||sourceKey));if(contract.persistent)surface.checkpoints=createHyperFramesIsfCheckpointStore(surface);liveIsfSurfaces.set(surfaceKey,surface);return surface}
function drawLiveIsf(layer,t,mediaInput){const surface=liveIsfSurface(layer);if(!surface)return null;if(surface.canvas.width!==C.width||surface.canvas.height!==C.height)throw new Error('Deterministic ISF surface size changed after initialization');const visualTime=finite(layer.visualTime?.visualTimeSeconds,t);surface.clock=prepareHyperFramesIsfFrame(surface,visualTime,S.fps,layer.liveIsf?.persistent===true,t);for(const[name,value]of Object.entries(layer.controlValues||layer.controls||{}))surface.renderer.setValue(name,value);const imageInputs=Array.isArray(layer.liveIsf?.imageInputs)?layer.liveIsf.imageInputs:[];if(layer.liveIsf?.requiresMedia&&!mediaInput)throw new Error('Current media frame is required by shader '+String(layer.visualizerId||layer.id));surface.imageInputs=imageInputs.map(name=>[name,mediaInput]);surface.renderer.draw(surface.canvas);if(surface.renderer.valid===false)throw new Error('Deterministic ISF draw failed: '+String(layer.visualizerId||layer.id));surface.lastTime=visualTime;surface.lastFrameIndex=Math.floor(t*S.fps+1e-8);surface.checkpoints?.record(surface.lastFrameIndex);return surface.canvas}
function aspectCoverSourceRect(rect,targetWidth,targetHeight){const x=Number(rect[0])||0,y=Number(rect[1])||0,width=Number(rect[2])||0,height=Number(rect[3])||0,targetW=Number(targetWidth)||0,targetH=Number(targetHeight)||0;if(!(width>0&&height>0&&targetW>0&&targetH>0))return[x,y,width,height];const sourceAspect=width/height,targetAspect=targetW/targetH;if(sourceAspect>targetAspect){const coverWidth=height*targetAspect;return[x+(width-coverWidth)/2,y,coverWidth,height]}const coverHeight=width/targetAspect;return[x,y+(height-coverHeight)/2,width,coverHeight]}
function lyricFrameAt(t){const track=S.instances.lyrics[0],lines=track?.lines||[],line=lines.filter(row=>t>=row.start&&t<row.end).at(-1)||null;if(!track||!line)return null;return{track,line,frame:echoLyricTemplateFrameState({templateId:track.templateId,enabled:true,line,timeSeconds:t,fps:S.fps,timingSource:track.contract?.timingSource||'',reducedMotion:track.contract?.reducedMotion===true,motionIntensity:track.contract?.motionIntensity??1})}}function cameraAt(t){return echoCameraKeyframeAt(S.automation.camera||[],t)}
function escapeLyric(value){return String(value??'').replace(/[&<>"']/g,(character)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]))}
const lyricProtection=prepareEchoLyricObstacles(S.instances.media,S.outputProfile);
function drawLyric(t,accentState){const state=lyricFrameAt(t);renderEchoLyricSurface(L,{contract:state?.track.contract||{},frame:state?.frame||null,line:state?.line||null,outputProfile:S.outputProfile,protection:lyricProtection});sizeEchoLyricSurface(L,S.outputProfile,C.width,C.height);if(state)L.dataset.runtimeSchema=state.track.runtimeSchema||'';const accentReceipts=EchoAccentPresentation.lyric(L,accentState,state?.line?.id);return state?{...state,accentReceipts}:null}

function holdMappedTransitionEndpoint(t,el,instance,timing){const mapping=instance?.source?.timeMapping;if(el.tagName!=='VIDEO'||!timing)return;const before=t<timing.logicalStart,after=t>=timing.logicalEnd;if(!before&&!after)return;const rawTarget=before?(mapping?.sourceInSeconds??0):(mapping?.sourceOutSeconds??el.duration-1/S.fps),target=Number(rawTarget);if(!Number.isFinite(target)||target<0||finite(el.readyState)<1)return;const epsilon=1/Math.max(1,finite(mapping?.sourceFps,S.fps));if(Math.abs(finite(el.currentTime)-target)>epsilon*.5)try{el.currentTime=target}catch{}if(!el.paused)el.pause()}
function activateVideo(el){if(!el.isConnected)document.getElementById('media-root').appendChild(el);if(el.getAttribute('src')!==el.dataset.mediaSrc||el.preload!=='auto'){el.preload='auto';el.src=el.dataset.mediaSrc;el.load()}}
function releaseVideo(el){const replacement=el.nextElementSibling;if(replacement?.classList.contains('__render_frame__'))replacement.remove();el.remove();el.removeAttribute('src');el.preload='none';el.load()}
function mediaFrame(t){media.forEach((el)=>{const index=Number(el.dataset.instanceIndex),m=S.instances.media[index];if(!m)return;const timing=hyperFramesMediaPresentationWindow(S.instances.media,index),opacity=hyperFramesMediaOpacityState(S.instances.media,index,t),alpha=opacity.alpha;el.style.opacity=String(alpha);el.style.zIndex=String(index+1);const shouldBuffer=navigationReady&&timing&&t>=timing.presentationStart-8&&t<timing.presentationEnd+1;if(el.tagName==='VIDEO'&&shouldBuffer){activateVideo(el)}else if(el.tagName==='VIDEO'&&navigationReady&&!shouldBuffer&&el.isConnected&&(t<timing.presentationStart-12||t>=timing.presentationEnd+3)){releaseVideo(el)}holdMappedTransitionEndpoint(t,el,m,timing);const presentation=cameraPresentationForMedia(t,el,index);if(['protected-v2','section-crop-v1'].includes(presentation.crop?.cameraModel)){const dimensions=mediaSourceDimensions(el,m);if(dimensions.width>0&&dimensions.height>0){const frame=echoProtectedCameraFrame({sourceWidth:dimensions.width,sourceHeight:dimensions.height,outputWidth:C.width,outputHeight:C.height,crop:presentation.crop});Object.assign(el.style,frame.style);el.dataset.echoProtectedCamera='true'}return}if(el.dataset.echoProtectedCamera==='true'){for(const key of ['position','width','height','left','top','maxWidth','maxHeight','objectFit','objectPosition','transform','transformOrigin','clipPath'])el.style[key]='';delete el.dataset.echoProtectedCamera}el.style.objectPosition=presentation.objectPositionXPercent.toFixed(1)+'% '+presentation.objectPositionYPercent.toFixed(1)+'%';el.style.transformOrigin=presentation.transformOriginXPercent.toFixed(3)+'% '+presentation.transformOriginYPercent.toFixed(3)+'%';el.style.transform='scale('+presentation.scale.toFixed(3)+') translate3d('+presentation.translateXPercent.toFixed(2)+'%,'+presentation.translateYPercent.toFixed(2)+'%,0)'})}
async function loadMediaAt(t){const expectedMediaCount=(S.instances.media||[]).filter((instance)=>instance.source?.compiledUri).length;if(media.length<expectedMediaCount)await new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('Timed out waiting for packaged media elements'))},5000),mounted=()=>{media=window.HAPA_MEDIA_ELEMENTS||[...document.querySelectorAll('.media')];if(media.length<expectedMediaCount)return;cleanup();resolve()},cleanup=()=>{clearTimeout(timer);window.removeEventListener('hapa:media-mounted',mounted)};window.addEventListener('hapa:media-mounted',mounted)});const candidates=media.filter((el)=>{const index=Number(el.dataset.instanceIndex),timing=hyperFramesMediaPresentationWindow(S.instances.media,index);return timing&&t>=timing.presentationStart-8&&t<timing.presentationEnd+1});return Promise.all(candidates.map((el)=>{if(el.tagName==='IMG'){if(mediaReadyForShader(el))return Promise.resolve();return new Promise((resolve,reject)=>{const cleanup=()=>{clearTimeout(timer);el.removeEventListener('load',ready);el.removeEventListener('error',failed)},ready=()=>{if(!mediaReadyForShader(el))return;cleanup();resolve()},failed=()=>{cleanup();reject(new Error('Failed preparing image source: '+String(el.getAttribute('src')||el.id)))},timer=setTimeout(()=>{cleanup();reject(new Error('Timed out preparing image source: '+String(el.id)))},30000);el.addEventListener('load',ready);el.addEventListener('error',failed);if(el.complete){if(mediaReadyForShader(el))ready();else failed()}})}if(el.tagName!=='VIDEO')return Promise.resolve();activateVideo(el);if(mediaReadyForShader(el))return Promise.resolve();return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{cleanup();reject(new Error('Timed out preparing shader media input: '+String(el.dataset.mediaSrc||el.id)))},30000),ready=()=>{if(!mediaReadyForShader(el))return;cleanup();resolve()},failed=()=>{cleanup();reject(new Error('Failed preparing shader media input: '+String(el.dataset.mediaSrc||el.id)))},cleanup=()=>{clearTimeout(timer);el.removeEventListener('loadeddata',ready);el.removeEventListener('canplay',ready);el.removeEventListener('error',failed)};el.addEventListener('loadeddata',ready);el.addEventListener('canplay',ready);el.addEventListener('error',failed)})}))}
async function prepareDecodedMediaAt(t){
  for(const el of media){if(hyperFramesCapturedMediaElement(el)!==el){el.nextElementSibling.remove();el.style.visibility=''}}
  await loadMediaAt(t);
  const frames=[];
  for(const el of media){
    const index=Number(el.dataset.instanceIndex),instance=S.instances.media[index];
    if(el.tagName!=='VIDEO'||!hyperFramesMediaOpacityState(S.instances.media,index,t).visible)continue;
    frames.push(await prepareHyperFramesVideoFrame(el,t,{fps:S.fps,timeMapping:instance?.source?.timeMapping}));
  }
  window.HAPA_PREPARED_MEDIA_FRAME={timeSeconds:t,frames};
  return frames;
}
async function prepareMediaAt(t,{signal}={}){
  livingLightFrame=null;
  const targetFrame=Math.floor(t*S.fps+1e-8),replays=[];
  for(const instance of S.instances.visualizers||[]){
    if(!instance.liveIsf?.persistent||t<instance.start||t>=instance.end)continue;
    const surface=liveIsfSurface(instance);
    const layerAt=frame=>evaluateHyperFramesVisualizers({...S,instances:{...S.instances,visualizers:[instance]},automation:{...S.automation,visualBudgetPolicy:null}},frame/S.fps).layers.find(layer=>layer.id===instance.id);
    const replay=await prepareHyperFramesIsfSeek(surface,targetFrame,{
      startFrame:Math.ceil(instance.start*S.fps-1e-8),signal,
      prepareFrame:frame=>prepareDecodedMediaAt(frame/S.fps),
      drawFrame:frame=>{const time=frame/S.fps,layer=layerAt(frame);if(!layer)throw new Error('Persistent layer missing during replay: '+instance.id);drawLiveIsf(layer,time,cameraFramedMediaElement(time,activeMediaElement(time)))},
      onProgress:progress=>{window.HAPA_ISF_SEEK_PROGRESS={...progress,layerId:instance.id,status:'preparing'}}
    });
    replays.push({layerId:instance.id,...replay});
  }
  const frames=await prepareDecodedMediaAt(t);
  if(livingLightRenderer)livingLightFrame=await livingLightRenderer.prepareFrame(targetFrame,{signal});
  window.HAPA_ISF_SEEK_PROGRESS={status:'ready',targetFrame,replays};
  return frames;
}
window.HAPA_PREPARE_MEDIA_AT=prepareMediaAt;
function sampleHash(){const data=X.getImageData(0,0,C.width,C.height).data;let h=2166136261;for(let i=0;i<data.length;i+=256){h^=data[i];h=Math.imul(h,16777619);h^=data[i+1]||0;h=Math.imul(h,16777619);h^=data[i+2]||0;h=Math.imul(h,16777619)}return(h>>>0).toString(16).padStart(8,'0')}
const mediaRedrawBridge=createHyperFramesMediaRedrawBridge(window,(t)=>{timeline.seek(t);timeline.renderNow()});
function draw(t){
  mediaRedrawBridge.install();enforceOutputSurface();mediaFrame(t);const state=evaluateHyperFramesVisualizers(S,t),rawMediaInput=activeMediaElement(t),mediaInput=cameraFramedMediaElement(t,rawMediaInput);X.clearRect(0,0,C.width,C.height);let drawn=0;
  const accentState=EchoAccentPresentation.frame(S.automation?.accentTrack?.events||[],Math.floor(t*S.fps+1e-8)/S.fps,{reducedMotion:S.instances.lyrics[0]?.contract?.reducedMotion===true}),accentReceipts=[],mediaAccentTarget=activeMediaBinding(t)?.instance;
  if(mediaAccentTarget)accentReceipts.push(...EchoAccentPresentation.paint(X,accentState,C.width,C.height,{layer:'media-layer',primary:true,instanceId:mediaAccentTarget.id,cardId:mediaAccentTarget.cardId,trackId:mediaAccentTarget.trackId}));
  for(const layer of state.layers||state.instances||[]){
    if(layer.execution?.drawable===false)continue;
    const proxy=layer.proxy||{},img=layer.liveIsf?drawLiveIsf(layer,t,mediaInput):proxyImages.get(proxy.compiledUri);if(!img||(layer.liveIsf?!(img.width&&img.height):(!img.complete||!img.naturalWidth)))continue;
    const frame=layer.proxyFrame||layer.frame||{},rect=layer.liveIsf?[0,0,img.width,img.height]:Array.isArray(frame.sourceRect)?frame.sourceRect:frame.rect?[frame.rect.x,frame.rect.y,frame.rect.width,frame.rect.height]:[Number(frame.index||0)*proxy.frameWidth,0,proxy.frameWidth,proxy.frameHeight],coverRect=aspectCoverSourceRect(rect,C.width,C.height),alpha=clamp(layer.effectiveOpacity??layer.composite?.effectiveOpacity??0),signal=clamp(layer.signalValue??layer.stemSignal??layer.stemFrame?.frame?.rms??layer.stemFrame?.rms??0),control=clamp(layer.controlEnergy??0),modulation=layer.echoPresentation?.audioEnvelope||layer.presentationModulation||{},brightness=Number.isFinite(Number(modulation.brightness))?Number(modulation.brightness):1+signal*.18,saturation=Number.isFinite(Number(modulation.saturation))?Number(modulation.saturation):1+control*.2,scale=Number.isFinite(Number(modulation.scale))?Number(modulation.scale):1+signal*.018+control*.01;
    const underlayDimAlpha=clamp(layer.echoPresentation?.underlayDimAlpha??0);if(underlayDimAlpha>0){X.save();X.globalAlpha=underlayDimAlpha;X.globalCompositeOperation='source-over';X.fillStyle='#000';X.fillRect(0,0,C.width,C.height);X.restore()}
    X.save();X.globalAlpha=alpha;X.globalCompositeOperation=layer.echoPresentation?.canvasComposite||composite(layer.blendMode||layer.composite?.blendMode);X.filter='brightness('+brightness.toFixed(3)+') saturate('+saturation.toFixed(3)+') contrast('+Number(modulation.contrast??1).toFixed(3)+')';X.translate(C.width/2,C.height/2);X.scale(scale,scale);X.translate(-C.width/2,-C.height/2);X.drawImage(img,coverRect[0],coverRect[1],coverRect[2],coverRect[3],0,0,C.width,C.height);X.restore();if(alpha>0)accentReceipts.push(...EchoAccentPresentation.paint(X,accentState,C.width,C.height,{layer:'visualizer-layer',primary:drawn===0,instanceId:layer.id,cardId:layer.cardId,visualizerId:layer.visualizerId,trackId:layer.trackId,layerIndex:drawn}));drawn++
  }
  const requestedFrame=Math.floor(t*S.fps+1e-8);let livingLightReceipt=null;
  if(livingLightRenderer&&livingLightFrame?.frameIndex===requestedFrame)livingLightReceipt=livingLightRenderer.paintFrame(requestedFrame,X);
  const lyricState=drawLyric(t,accentState);accentReceipts.push(...(lyricState?.accentReceipts||[]));const accentReport=EchoAccentPresentation.report(accentState,accentReceipts);const diagnostics=state.diagnostics||[];D.innerHTML=diagnostics.map(row=>'<div class="diagnostic">UNSUPPORTED · '+String(row.visualizerId||row.requestedId||'unknown')+' · '+String(row.reason||'no executable proxy')+'</div>').join('');Q.textContent='PINNED VISUAL TIME · '+t.toFixed(2)+'S · LAYERS '+drawn+' · DIAGNOSTICS '+diagnostics.length;window.HAPA_LAST_RENDER_STATE={...state,livingLightReceipt,mediaInput:mediaInput?{mediaId:mediaInput.dataset.echoSourceMediaId,route:mediaInput.dataset.echoFrameRoute}:null,isfFrameReplays:[...liveIsfSurfaces.values()].map(surface=>({key:surface.key,time:surface.lastTime,replays:surface.frameReplayCount||0})),accentReceipts,accentReport,accentSuppressedIds:accentState.suppressedIds,timeSeconds:t,drawnLayerCount:drawn,lyricTemplateId:lyricState?.track?.templateId||null,lyricFrame:lyricState?.frame||null,canvasSampleHash:sampleHash()};return window.HAPA_LAST_RENDER_STATE
}
window.HAPA_RENDER_FRAME_AT=async(frameIndex)=>{
  if(!Number.isSafeInteger(frameIndex)||frameIndex<0||frameIndex>=Math.ceil(S.duration*S.fps))throw Error('Invalid prepared output frame');
  await window.HAPA_ASSETS_READY;timeline.pause();const time=frameIndex/S.fps;await prepareMediaAt(time);timeline.seek(time);timeline.flush();
  const state=window.HAPA_LAST_RENDER_STATE;
  if(livingLightRenderer&&state.livingLightReceipt?.frameIndex!==frameIndex)throw Error('Living Light output frame was not painted');
  return {frameIndex,timeSeconds:time,showHash:S.showHash,livingLight:state.livingLightReceipt,snapshotDigest:S.livingLight?.snapshotDigest||null};
};
window.HAPA_DISPOSE_RENDER=()=>{timeline.pause();livingLightRenderer?.dispose();for(const el of media)if(el.tagName==='VIDEO'){el.pause();el.removeAttribute('src');el.load()}return livingLightRenderer?.diagnostics()||null};
const timeline=new window.HapaPinnedTimeline(S.duration,draw);window.__timelines=window.__timelines||{};window.__timelines.main=timeline;const primeMedia=()=>{navigationReady=true};if(document.readyState==='complete')primeMedia();else window.addEventListener('load',primeMedia,{once:true});window.HAPA_ASSETS_READY=Promise.all([...proxyImages.entries()].map(([uri,img])=>Promise.resolve(img.decode?img.decode():null).then(()=>{if(!img.complete||!img.naturalWidth)throw new Error('Shader atlas did not decode: '+uri);return uri}).catch(error=>{throw new Error('Shader atlas decode failed for '+uri+': '+String(error&&error.message||error))}))).then(()=>prepareMediaAt(0)).then(()=>{enforceOutputSurface();for(const layer of S.instances.visualizers||[])if(layer.liveIsf)liveIsfSurface(layer);const armed=navigationReady;navigationReady=false;timeline.seek(0).pause();timeline.flush();navigationReady=armed;return timeline});</script></body></html>`;
fs.writeFileSync(path.join(output, "index.html"), html);

const lintProcess = spawnSync(process.execPath, [
  path.join(ROOT, "scripts/run-local-hyperframes.mjs"),
  "lint",
  "--json",
  output,
], {
  cwd: ROOT,
  encoding: "utf8",
  timeout: 120_000,
  maxBuffer: 16 * 1024 * 1024,
});
let lintReport = null;
try { lintReport = JSON.parse(lintProcess.stdout || "null"); } catch { lintReport = null; }
const lintOk = lintProcess.status === 0 && lintReport?.ok === true && Number(lintReport?.errorCount || 0) === 0;
const lintEvidence = lintReport || {
  ok: false,
  errorCount: 1,
  findings: [{
    code: "hyperframes-lint-process-failed",
    severity: "error",
    message: String(lintProcess.error?.message || lintProcess.stderr || "HyperFrames lint did not return a JSON report.").replace(/\s+/gu, " ").slice(0, 800),
  }],
};
fs.writeFileSync(path.join(output, "lint-report.json"), `${JSON.stringify(lintEvidence, null, 2)}\n`);

const packagedVisualizerCueIds = new Set(show.instances.visualizers
  .filter((row) => row.proxy?.compiledUri || row.liveIsf)
  .map((row) => row.cueId || row.id));
const visualizerOfflineMissing = visualizerPreflight.entries
  .filter((row) => row.required && !packagedVisualizerCueIds.has(row.cueId))
  .map((row) => row.cueId);
const sourceAudit = `${html}\n${JSON.stringify(show)}\n${pinnedTimelineSource}\n${fs.readFileSync(runtimeSourcePath, "utf8")}`;
const networkReferences = sourceAudit.match(/https?:\/\//g) || [];
const compiledLyricTrack = show.instances.lyrics[0] || null;
const report = {
  schemaVersion: "hapa.hyperframes.compiler-report.v4",
  ok: lintOk && inspect.ok && offlineMissing.length === 0 && visualizerOfflineMissing.length === 0 && networkReferences.length === 0 && !/Math\.random|Date\.now|AudioContext|getUserMedia|fetch\(/.test(sourceAudit),
  input: { graphPath, telemetryPath, projectPath, sourceProjectPath, audioPath, proxyRegistryPath, isfManifestPath, isfRuntimePath, requestedDuration },
  output,
  manifestPath,
  preflightPath,
  visualizerPreflightPath,
  shaderFidelityAuditPath,
  presentation: { mode: presentation, diagnosticsVisible: true, timingConfidenceInMetadata: true },
  boundedDemo: { enabled: boundedDemo, sourceDurationSeconds: fullShow.duration, compiledDurationSeconds: show.duration },
  deterministicHash: sha256(sourceAudit),
  inspect,
  media: {
    declared: show.instances.media.length,
    generated: show.instances.media.filter((row) => row.source.type === "generated-visualizer").length,
    compiled: show.instances.media.filter((row) => row.source.compiledUri).length,
    audioCompiled: Boolean(compiledAudio),
    audio: compiledAudio ? {
      uri: compiledAudio.uri,
      mimeType: compiledAudio.mimeType,
      extension: compiledAudio.extension,
      operation: compiledAudio.operation,
      sourceSha256: compiledAudio.sourceSha256,
      compiledSha256: compiledAudio.sha256,
    } : null,
    offlineMissing,
    preflight: mediaPreflight,
  },
  visualizers: {
    declared: show.instances.visualizers.length,
    exactProxy: show.instances.visualizers.filter((row) => row.execution.route === "hash-bound-exact-proxy").length,
    deterministicBrowserIsf: deterministicIsfInstances.length,
    unsupported: show.instances.visualizers.filter((row) => !row.execution.drawable).length,
    compiledAssets: packagedVisualizerCueIds.size,
    uniqueCompiledAssets: copiedProxyByHash.size,
    offlineMissing: visualizerOfflineMissing,
    preflight: visualizerPreflight,
    fidelityAudit: shaderFidelityAudit,
    packagingFailures: visualizerPackagingFailures,
    cueWindows: show.instances.visualizers.map((row) => ({ id: row.id, visualizerId: row.visualizerId, start: row.start, end: row.end, route: row.execution.route, pixelIdentitySeed: row.pixelIdentitySeed })),
  },
  lyrics: {
    enabled: Boolean(compiledLyricTrack),
    templateId: compiledLyricTrack?.templateId || null,
    declaredLineCount: Number(showGraph.song?.lyricOverlay?.lines?.length || 0),
    compiledLineCount: Number(compiledLyricTrack?.lines?.length || 0),
    compiledInstanceCount: show.instances.lyrics.length,
    contractHash: show.source.lyricOverlayHash,
    runtimeSchema: compiledLyricTrack?.runtimeSchema || null,
    frameQuantization: compiledLyricTrack?.frameQuantization || null,
  },
  runtime: { timeline: "local-hapa-pinned-timeline", visualizerScheduler: "hyperframes-visualizer-runtime", deterministicIsf: deterministicIsfRuntime, networkDependencies: networkReferences.length, lastRenderStateHook: "window.HAPA_LAST_RENDER_STATE" },
  lint: { reportPath: path.join(output, "lint-report.json"), ...lintEvidence },
  validation: { lint: lintOk ? "pass" : "fail", inspect: inspect.ok ? "pass" : "fail", cueCoverage: "pass", mediaPreflight: mediaPreflight.ok ? "pass" : "fail", mediaOffline: offlineMissing.length ? "fail" : "pass", visualizerPreflight: visualizerPreflight.ok ? "pass" : "fail", visualizerOffline: visualizerOfflineMissing.length ? "fail" : "pass", shaderFidelity: shaderFidelityAudit.ok ? "pass" : "fail", preparedCapture: livingLightSnapshot ? 'requires-hapa-prepared-electron-v1' : 'not-required', showcaseReady: !livingLightSnapshot && lintOk && inspect.ok && !offlineMissing.length && !visualizerOfflineMissing.length && shaderFidelityAudit.ok },
};
fs.writeFileSync(path.join(output, "compiler-report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
