import { execFile as execFileCallback, spawn as spawnChild, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { evaluateHyperFramesPixelAcceptance } from "../scripts/hyperframes-pixel-acceptance.mjs";
import { preflightHyperFramesMedia } from "../src/domain/hyperframes-show-compiler.js";
import { normalizeHyperFramesStemRole } from "../src/domain/hyperframes-visualizer-runtime.js";
import { repairEchoShowGraphStemBindings } from "../src/domain/echo-stem-binding-repair.js";
import { reidentifyEchoCompiledShowGraph, validateEchoCompiledShowGraph } from "../src/domain/echo-compiled-show-graph.js";
import { echoOutputProfileCacheKey, resolveEchoOutputProfile } from "../src/domain/echo-output-profile.js";
import { preflightSongCardRenderReadiness } from "../src/domain/song-card-render-readiness.js";
import {
  loadRenderAudioInputPreflightCache,
  preflightRenderAudioInputs,
  renderDurationToleranceSeconds,
  renderAudioInputsFromShowGraph,
  writeRenderAudioInputPreflightCache,
} from "./render-audio-input-preflight.mjs";
import {
  loadRenderVisualMediaProbeCache,
  preflightProxyAtlasImages,
  preflightResolvedVisualMedia,
  writeRenderVisualMediaProbeCache,
} from "./render-visual-media-preflight.mjs";
import {
  createStemTelemetryPreflightError,
  deriveRequiredStemTelemetryBindings,
  preflightStemTelemetryBundle,
} from "./stem-telemetry-preflight.mjs";
import {
  createStemRegistryLineageError,
  preflightStemRegistryLineage,
} from "./stem-registry-lineage-preflight.mjs";

const execFile = promisify(execFileCallback);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTOR_ID = "hapa-avatar-builder:local-hyperframes";
const RELEASE_TRUTH_SCHEMA = "hapa.show.release-renderer-truth.v1";
const LOCAL_JOB_SCHEMA = "hapa.song-card.local-render-job.v1";
const LOCAL_CHECKPOINT_SCHEMA = "hapa.song-card.local-render-checkpoint.v5";
const LOCAL_RENDER_GATE_VERSION = "hapa.song-card.render-gate.canonical-source-snapshot.v6";
const SOURCE_SNAPSHOT_MANIFEST_SCHEMA = "hapa.song-card.source-snapshot-manifest.v2";
const RENDERER_BUILD_IDENTITY_SCHEMA = "hapa.song-card.renderer-build-identity.v1";
const DEFAULT_PROXY_REGISTRY = path.join(os.homedir(), "Desktop", "hapa-music-viz", "web", "isf", "proxies", "native-exact-proxies.json");
const DEFAULT_SONG_REGISTRY = path.join(os.homedir(), "Desktop", "hapa-song-registry", "data", "registry.json");
const VISUAL_PROBE_CACHE_PATH = path.join(ROOT, "artifacts/echo-render-readiness/visual-probe-cache.json");
const AUDIO_PROBE_CACHE_PATH = path.join(ROOT, "artifacts/echo-render-readiness/audio-probe-cache.json");
const REQUIRED_SCRIPTS = [
  "scripts/build-stem-telemetry-bundle.py",
  "scripts/compile-hyperframes-show-v2.mjs",
  "scripts/hyperframes-pixel-acceptance.mjs",
  "scripts/hyperframes-pixel-capture.cjs",
  "scripts/run-local-hyperframes.mjs",
  "scripts/preflight-echo-render-readiness.mjs",
];
const RENDERER_BUILD_FILES = [
  ...REQUIRED_SCRIPTS,
  "server/song-card-local-renderer.mjs",
  "server/render-audio-input-preflight.mjs",
  "server/render-visual-media-preflight.mjs",
  "server/stem-telemetry-preflight.mjs",
  "server/stem-registry-lineage-preflight.mjs",
  "server/echo-director-show-graph-loader.mjs",
  "server/echo-execution-graph-store.mjs",
  "server/echo-runtime-media-route.mjs",
  "server/echo-delivery-runtime-build.mjs",
  "scripts/lib/hyperframes-audio-package.mjs",
  "src/domain/song-card-render-readiness.js",
  "src/domain/echo-stem-binding-repair.js",
  "src/domain/echo-audio-route.js",
  "src/domain/echo-output-profile.js",
  "src/domain/echo-runtime-shader-repair.js",
  "src/domain/portable-visualizer-card.js",
  "src/domain/hyperframes-show-compiler.js",
  "src/domain/hyperframes-visualizer-runtime.js",
  "src/domain/native-visualizer-route.js",
  "src/domain/show-graph-capabilities.js",
  "src/domain/song-context-packet.js",
];

function text(value) {
  return String(value || "").trim();
}

export function resolveSongCardRenderOutputProfile({ project = {}, showGraph = {} } = {}) {
  // The saved project is the operator's orientation choice. A compiled graph
  // supplies the fallback for legacy/projectless calls, but must not silently
  // override a newer explicit project selection.
  const declaredProfile = project?.output_profile
    ?? project?.outputProfile
    ?? showGraph?.outputProfile
    ?? showGraph?.output_profile;
  return resolveEchoOutputProfile(declaredProfile);
}

function hyperFramesResolutionForOutputProfile(outputProfile) {
  return resolveEchoOutputProfile(outputProfile).orientation === "vertical" ? "portrait" : "landscape";
}

function safeSegment(value, fallback = "render") {
  return text(value)
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 120) || fallback;
}

function sha256Bytes(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function sha256File(filePath) {
  const digest = crypto.createHash("sha256");
  const stream = fs.createReadStream(filePath);
  for await (const chunk of stream) digest.update(chunk);
  return digest.digest("hex");
}

function commandAvailable(command, args = ["-version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] });
  return !result.error && result.status === 0;
}

function executablePath(command) {
  const requested = text(command);
  if (!requested) return null;
  const candidates = requested.includes(path.sep)
    ? [requested]
    : String(process.env.PATH || "").split(path.delimiter).filter(Boolean).map((directory) => path.join(directory, requested));
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return fs.realpathSync(candidate);
    } catch { /* Try the next PATH entry. */ }
  }
  return null;
}

function regularFileStatIdentity(filePath) {
  try {
    const stat = fs.statSync(filePath, { bigint: true });
    if (!stat.isFile()) return null;
    return {
      dev: Number(stat.dev),
      ino: Number(stat.ino),
      size: Number(stat.size),
      mtimeMs: Number(stat.mtimeMs),
      ctimeMs: Number(stat.ctimeMs),
      mtimeNs: String(stat.mtimeNs),
      ctimeNs: String(stat.ctimeNs),
    };
  } catch {
    return null;
  }
}

function commandBuildIdentity(command, args = ["-version"]) {
  const resolvedPath = executablePath(command);
  const beforeStat = resolvedPath ? regularFileStatIdentity(resolvedPath) : null;
  const result = spawnSync(resolvedPath || command, args, {
    encoding: "utf8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const versionOutput = `${result.stdout || ""}\n${result.stderr || ""}`
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find(Boolean) || null;
  const afterStat = resolvedPath ? regularFileStatIdentity(resolvedPath) : null;
  if (JSON.stringify(beforeStat) !== JSON.stringify(afterStat)) {
    throw new Error(`Renderer command changed while it was being identified: ${command}.`);
  }
  return {
    command: text(command),
    path: resolvedPath,
    available: !result.error && result.status === 0,
    version: versionOutput,
    executableStat: afterStat,
  };
}

function probeLocalHyperFrames(resolvedRoot) {
  const probe = spawnSync(process.execPath, [path.join(resolvedRoot, "scripts/run-local-hyperframes.mjs"), "--print-path"], {
    cwd: resolvedRoot,
    encoding: "utf8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  try {
    const parsed = JSON.parse(probe.stdout || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function pythonModulePath(command, moduleName) {
  const result = spawnSync(command, [
    "-c",
    `import pathlib, ${moduleName}; print(pathlib.Path(${moduleName}.__file__).resolve())`,
  ], { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "pipe"] });
  const candidate = text(result.stdout).split(/\r?\n/u).find(Boolean) || "";
  try {
    return candidate && fs.statSync(candidate).isFile() ? fs.realpathSync(candidate) : null;
  } catch {
    return null;
  }
}

function rendererResolutionEnvironment() {
  return {
    cwd: process.cwd(),
    PATH: String(process.env.PATH || ""),
    HAPA_PYTHON: String(process.env.HAPA_PYTHON || ""),
    PYTHONPATH: String(process.env.PYTHONPATH || ""),
    PYTHONHOME: String(process.env.PYTHONHOME || ""),
    VIRTUAL_ENV: String(process.env.VIRTUAL_ENV || ""),
    HYPERFRAMES_CLI: String(process.env.HYPERFRAMES_CLI || ""),
  };
}

function hyperframesResolution(probe) {
  return probe ? {
    cliPath: text(probe.cliPath) ? path.resolve(probe.cliPath) : null,
    packagePath: text(probe.packagePath) ? path.resolve(probe.packagePath) : null,
    version: text(probe.version) || null,
  } : null;
}

async function contentIdentity(filePath) {
  try {
    const before = regularFileStatIdentity(filePath);
    if (!before) return { path: path.resolve(filePath), missing: true };
    const sha256 = `sha256:${await sha256File(filePath)}`;
    const after = regularFileStatIdentity(filePath);
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      throw new Error(`Renderer dependency changed while it was being hashed: ${filePath}.`);
    }
    return {
      path: path.resolve(filePath),
      bytes: Number(after.size),
      sha256,
      statIdentity: after,
    };
  } catch (error) {
    if (!fs.existsSync(filePath)) return { path: path.resolve(filePath), missing: true };
    if (/changed while it was being hashed/iu.test(String(error?.message || ""))) throw error;
    return { path: path.resolve(filePath), missing: true };
  }
}

async function directoryContentIdentity(directory) {
  const root = path.resolve(directory);
  const enumerate = async () => {
    const files = [];
    async function visit(current) {
      const entries = await fsp.readdir(current, { withFileTypes: true });
      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (const entry of entries) {
        const absolute = path.join(current, entry.name);
        if (entry.isSymbolicLink()) throw new Error(`Renderer dependency directories may not contain symlinks: ${absolute}.`);
        if (entry.isDirectory()) await visit(absolute);
        else if (entry.isFile()) files.push(absolute);
      }
    }
    await visit(root);
    return files;
  };
  let files;
  try {
    files = await enumerate();
  } catch (error) {
    if (/may not contain symlinks/iu.test(String(error?.message || ""))) throw error;
    return { path: root, missing: true, files: [] };
  }
  const digest = crypto.createHash("sha256");
  const rows = [];
  for (const filePath of files) {
    const relativePath = path.relative(root, filePath).split(path.sep).join("/");
    const identity = await contentIdentity(filePath);
    if (identity.missing) throw new Error(`Renderer dependency disappeared while it was being hashed: ${filePath}.`);
    digest.update(`${relativePath}\0${identity.sha256}\0`);
    rows.push({ path: relativePath, sha256: identity.sha256, statIdentity: identity.statIdentity });
  }
  const afterFiles = await enumerate();
  if (JSON.stringify(afterFiles) !== JSON.stringify(files)) {
    throw new Error(`Renderer dependency directory changed while it was being hashed: ${root}.`);
  }
  for (let index = 0; index < files.length; index += 1) {
    if (JSON.stringify(regularFileStatIdentity(files[index])) !== JSON.stringify(rows[index].statIdentity)) {
      throw new Error(`Renderer dependency changed while its directory was being hashed: ${files[index]}.`);
    }
  }
  return {
    path: root,
    fileCount: rows.length,
    sha256: `sha256:${digest.digest("hex")}`,
    files: rows.map(({ path: relativePath, sha256 }) => ({ path: relativePath, sha256 })),
  };
}

const rendererBuildIdentityCache = new Map();
const rendererDependencySignatureCache = new Map();
const RENDERER_DEPENDENCY_SIGNATURE_TTL_MS = 250;

function rendererDirectoryStatRows(directory) {
  const resolvedDirectory = path.resolve(directory);
  const rows = [];
  const visit = (current) => {
    let entries;
    try { entries = fs.readdirSync(current, { withFileTypes: true }); } catch { return; }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const candidate = path.join(current, entry.name);
      if (entry.isDirectory()) visit(candidate);
      else if (entry.isFile()) rows.push({
        path: path.relative(resolvedDirectory, candidate).split(path.sep).join("/"),
        stat: regularFileStatIdentity(candidate),
      });
      else if (entry.isSymbolicLink()) throw new Error(`Renderer dependency directories may not contain symlinks: ${candidate}.`);
    }
  };
  visit(resolvedDirectory);
  return rows;
}

export function songCardRendererBuildSourceStatSignature({
  root = ROOT,
  dependencyFiles = null,
  dependencyDirectories = null,
  dependencyCommands = null,
  expectedHyperframes = undefined,
  expectedNumpyModulePath = undefined,
  refresh = false,
} = {}) {
  const resolvedRoot = path.resolve(root);
  const resolutionEnvironment = rendererResolutionEnvironment();
  const signatureCacheKey = `${resolvedRoot}\u0000${JSON.stringify(resolutionEnvironment)}`;
  const memo = rendererDependencySignatureCache.get(signatureCacheKey);
  if (!refresh && memo && Date.now() - memo.checkedAt < RENDERER_DEPENDENCY_SIGNATURE_TTL_MS) return memo.value;
  const cached = rendererBuildIdentityCache.get(resolvedRoot)?.value;
  const files = Array.isArray(dependencyFiles)
    ? dependencyFiles
    : Array.isArray(cached?.dependencyFiles)
      ? cached.dependencyFiles
      : RENDERER_BUILD_FILES.map((relativePath) => path.join(resolvedRoot, relativePath));
  const directories = Array.isArray(dependencyDirectories)
    ? dependencyDirectories
      : Array.isArray(cached?.dependencyDirectories) ? cached.dependencyDirectories : [];
  const commands = Array.isArray(dependencyCommands)
    ? dependencyCommands
    : Array.isArray(cached?.dependencyCommands) ? cached.dependencyCommands : [];
  const rows = [...new Set(files.map((filePath) => path.resolve(resolvedRoot, filePath)))]
    .sort((left, right) => left.localeCompare(right))
    .map((filePath) => ({
      path: path.relative(resolvedRoot, filePath).split(path.sep).join("/"),
      stat: regularFileStatIdentity(filePath),
    }));
  const directoryRows = [...new Set(directories.map((directory) => path.resolve(resolvedRoot, directory)))]
    .sort((left, right) => left.localeCompare(right))
    .map((directory) => ({
      path: path.relative(resolvedRoot, directory).split(path.sep).join("/"),
      entries: rendererDirectoryStatRows(directory),
    }));
  const commandRows = commands.map((command) => ({
    command,
    resolvedPath: executablePath(command),
  }));
  const hyperframes = cached || dependencyFiles || dependencyDirectories
    ? probeLocalHyperFrames(resolvedRoot)
    : null;
  const currentHyperframesResolution = hyperframesResolution(hyperframes);
  const pythonCommand = process.env.HAPA_PYTHON || "python3";
  const currentPythonPath = executablePath(pythonCommand);
  const currentNumpyModulePath = pythonModulePath(currentPythonPath || pythonCommand, "numpy");
  if (
    expectedHyperframes !== undefined
    && JSON.stringify(currentHyperframesResolution) !== JSON.stringify(hyperframesResolution(expectedHyperframes))
  ) {
    throw new Error("The resolved HyperFrames launcher changed across the renderer identity boundary.");
  }
  if (
    expectedNumpyModulePath !== undefined
    && path.resolve(currentNumpyModulePath || "") !== path.resolve(expectedNumpyModulePath || "")
  ) {
    throw new Error("The resolved NumPy module changed across the renderer identity boundary.");
  }
  const resolution = {
    environment: resolutionEnvironment,
    commands: commandRows,
    pythonModulePath: currentNumpyModulePath,
    hyperframes: currentHyperframesResolution,
  };
  const value = `sha256:${sha256Bytes(JSON.stringify({ files: rows, directories: directoryRows, resolution }))}`;
  rendererDependencySignatureCache.set(signatureCacheKey, { checkedAt: Date.now(), value });
  return value;
}

async function computeSongCardRendererBuildIdentity(resolvedRoot) {
  const hyperframes = probeLocalHyperFrames(resolvedRoot);
  const pythonCommand = process.env.HAPA_PYTHON || "python3";
  const resolvedPythonCommand = executablePath(pythonCommand);
  const numpyModulePath = pythonModulePath(resolvedPythonCommand || pythonCommand, "numpy");
  const electronCommand = path.join(resolvedRoot, "node_modules/.bin/electron");
  const dependencyCommands = ["ffmpeg", "ffprobe", pythonCommand, electronCommand];
  const dependencyFiles = [
    ...RENDERER_BUILD_FILES.map((relativePath) => path.join(resolvedRoot, relativePath)),
    fs.realpathSync(process.execPath),
    executablePath("ffmpeg"),
    executablePath("ffprobe"),
    executablePath(pythonCommand),
    numpyModulePath,
    path.join(resolvedRoot, "node_modules/electron/package.json"),
    executablePath(electronCommand),
    hyperframes?.packagePath,
  ].filter(Boolean);
  const dependencyDirectories = [
    hyperframes?.cliPath ? path.dirname(hyperframes.cliPath) : null,
    numpyModulePath ? path.dirname(numpyModulePath) : null,
  ].filter(Boolean);
  const preComputeSignature = songCardRendererBuildSourceStatSignature({
    root: resolvedRoot,
    dependencyFiles,
    dependencyDirectories,
    dependencyCommands,
    expectedHyperframes: hyperframes,
    expectedNumpyModulePath: numpyModulePath,
    refresh: true,
  });
  const codeFiles = await Promise.all(RENDERER_BUILD_FILES.map(async (relativePath) => ({
    relativePath,
    ...await contentIdentity(path.join(resolvedRoot, relativePath)),
  })));
  const hyperframesDist = hyperframes?.cliPath
    ? await directoryContentIdentity(path.dirname(hyperframes.cliPath))
    : { path: null, missing: true, files: [] };
  const hyperframesPackage = hyperframes?.packagePath
    ? await contentIdentity(hyperframes.packagePath)
    : { path: null, missing: true };
  const numpyPackage = numpyModulePath
    ? await directoryContentIdentity(path.dirname(numpyModulePath))
    : { path: null, missing: true, files: [] };
  const tools = {
    node: {
      command: process.execPath,
      path: fs.realpathSync(process.execPath),
      available: true,
      version: process.version,
      executableStat: regularFileStatIdentity(fs.realpathSync(process.execPath)),
    },
    ffmpeg: commandBuildIdentity("ffmpeg"),
    ffprobe: commandBuildIdentity("ffprobe"),
    python: commandBuildIdentity(pythonCommand, ["--version"]),
    numpy: {
      ...commandBuildIdentity(pythonCommand, ["-c", "import numpy; print(numpy.__version__)"]),
      modulePath: numpyModulePath,
      package: numpyPackage,
    },
    electron: {
      package: await contentIdentity(path.join(resolvedRoot, "node_modules/electron/package.json")),
      executable: commandBuildIdentity(electronCommand, ["--version"]),
    },
    hyperframes: {
      version: text(hyperframes?.version) || null,
      cliPath: text(hyperframes?.cliPath) || null,
      package: hyperframesPackage,
      dist: hyperframesDist,
    },
  };
  const payload = {
    schemaVersion: RENDERER_BUILD_IDENTITY_SCHEMA,
    renderGateVersion: LOCAL_RENDER_GATE_VERSION,
    codeFiles,
    tools,
  };
  const value = {
    ...payload,
    sha256: `sha256:${sha256Bytes(JSON.stringify(payload))}`,
    dependencyFiles: [
      ...codeFiles.map((entry) => entry.path),
      tools.node.path,
      tools.ffmpeg.path,
      tools.ffprobe.path,
      tools.python.path,
      tools.numpy.path,
      tools.numpy.modulePath,
      tools.electron.package.path,
      tools.electron.executable.path,
      tools.hyperframes.package.path,
    ].filter(Boolean),
    dependencyDirectories,
    dependencyCommands,
  };
  const postComputeSignature = songCardRendererBuildSourceStatSignature({
    root: resolvedRoot,
    dependencyFiles: value.dependencyFiles,
    dependencyDirectories: value.dependencyDirectories,
    dependencyCommands: value.dependencyCommands,
    expectedHyperframes: hyperframes,
    expectedNumpyModulePath: numpyModulePath,
    refresh: true,
  });
  if (preComputeSignature !== postComputeSignature) {
    throw new Error("The local renderer dependency graph changed while its content identity was being computed.");
  }
  value.sourceStatSignature = postComputeSignature;
  return value;
}

export async function inspectSongCardRendererBuildIdentity({ root = ROOT, refresh = false, strict = true } = {}) {
  const resolvedRoot = path.resolve(root);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const cached = rendererBuildIdentityCache.get(resolvedRoot);
    if (!refresh && cached) {
      const currentCachedSignature = songCardRendererBuildSourceStatSignature({ root: resolvedRoot, refresh: strict });
      if (cached.sourceStatSignature === currentCachedSignature) return structuredClone(cached.value);
    }
    const computed = await computeSongCardRendererBuildIdentity(resolvedRoot);
    const sourceStatSignature = computed.sourceStatSignature;
    const value = { ...computed, sourceStatSignature };
    rendererBuildIdentityCache.set(resolvedRoot, { sourceStatSignature, value });
    const afterSignature = songCardRendererBuildSourceStatSignature({ root: resolvedRoot, refresh: true });
    if (afterSignature !== sourceStatSignature) {
      rendererBuildIdentityCache.delete(resolvedRoot);
      continue;
    }
    return structuredClone(value);
  }
  throw new Error("The local renderer source changed while its build identity was being inspected; retry after the edit is stable.");
}

let inspectionCache = null;
let visualProbeCacheLoaded = false;
let audioProbeCacheLoaded = false;
function loadLocalRenderProbeCaches() {
  if (!visualProbeCacheLoaded) {
    loadRenderVisualMediaProbeCache(VISUAL_PROBE_CACHE_PATH);
    visualProbeCacheLoaded = true;
  }
  if (!audioProbeCacheLoaded) {
    loadRenderAudioInputPreflightCache(AUDIO_PROBE_CACHE_PATH);
    audioProbeCacheLoaded = true;
  }
}
export function inspectSongCardLocalRenderer({ root = ROOT, refresh = false } = {}) {
  if (inspectionCache && !refresh && inspectionCache.root === path.resolve(root)) return structuredClone(inspectionCache.value);
  const resolvedRoot = path.resolve(root);
  const scriptPaths = REQUIRED_SCRIPTS.map((relative) => path.join(resolvedRoot, relative));
  const hyperframesProbe = spawnSync(process.execPath, [path.join(resolvedRoot, "scripts/run-local-hyperframes.mjs"), "--print-path"], {
    cwd: resolvedRoot,
    encoding: "utf8",
    timeout: 15_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let hyperframes = null;
  try { hyperframes = JSON.parse(hyperframesProbe.stdout || "null"); } catch { hyperframes = null; }
  const checks = {
    ffmpeg: commandAvailable("ffmpeg"),
    ffprobe: commandAvailable("ffprobe"),
    pythonNumpy: commandAvailable(process.env.HAPA_PYTHON || "python3", ["-c", "import numpy"]),
    electron: fs.existsSync(path.join(resolvedRoot, "node_modules/.bin/electron")),
    scripts: scriptPaths.every((filePath) => fs.existsSync(filePath)),
    hyperframes: Boolean(hyperframes?.cliPath && fs.existsSync(hyperframes.cliPath)),
    proxyRegistry: fs.existsSync(process.env.HAPA_HYPERFRAMES_PROXY_REGISTRY || DEFAULT_PROXY_REGISTRY),
  };
  const missing = Object.entries(checks).filter(([, ok]) => !ok).map(([name]) => name);
  const value = {
    schemaVersion: "hapa.song-card.local-renderer-status.v1",
    available: missing.length === 0,
    configured: true,
    connected: missing.length === 0,
    releaseCapable: missing.length === 0,
    status: missing.length ? "unavailable" : "ready",
    executionModel: "builder-managed-local",
    executorId: EXECUTOR_ID,
    adapter: "hyperframes-local-release-v1",
    capabilities: missing.length ? [] : ["release-export", "exact-editor-input", "renderer-truth", "release-qa"],
    reason: missing.length
      ? `The Builder-managed finishing renderer is missing: ${missing.join(", ")}.`
      : `Builder-managed HyperFrames ${hyperframes.version || "local"} is ready.`,
    missing,
    checks,
    hyperframes: hyperframes ? { version: hyperframes.version || null } : null,
  };
  inspectionCache = { root: resolvedRoot, value };
  return structuredClone(value);
}

function localRendererError(code, message, statusCode = 409, details = {}) {
  const error = new Error(message);
  error.code = code;
  error.statusCode = statusCode;
  error.details = details;
  return error;
}

const COMPILE_FAILURE_CUE_PREVIEW_LIMIT = 6;

function compileFailureCueIds(value) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => text(entry)).filter(Boolean))];
}

function compileFailureCuePreview(cueIds) {
  const visible = cueIds.slice(0, COMPILE_FAILURE_CUE_PREVIEW_LIMIT);
  const remaining = cueIds.length - visible.length;
  return `${visible.join(", ")}${remaining > 0 ? `, +${remaining} more` : ""}`;
}

export function describeSongCardCompilerFailure(report = {}, { cause = null, reportPath = "" } = {}) {
  const mediaMissingCueIds = compileFailureCueIds(report?.media?.offlineMissing);
  const visualizerMissingCueIds = compileFailureCueIds(report?.visualizers?.offlineMissing);
  const mediaPreflightFailures = Array.isArray(report?.media?.preflight?.unresolved)
    ? report.media.preflight.unresolved
    : [];
  const visualizerPreflightFailures = [
    ...(Array.isArray(report?.visualizers?.preflight?.unresolved) ? report.visualizers.preflight.unresolved : []),
    ...(Array.isArray(report?.visualizers?.packagingFailures) ? report.visualizers.packagingFailures : []),
  ];
  const mediaMissingCount = mediaMissingCueIds.length;
  const visualizerMissingCount = visualizerMissingCueIds.length;
  const mediaDeclared = Math.max(0, Number(report?.media?.declared || 0));
  const mediaCompiled = Math.max(0, Number(report?.media?.compiled || 0));
  const visualizerDeclared = Math.max(0, Number(report?.visualizers?.declared || 0));
  const visualizerCompiled = Math.max(0, Number(report?.visualizers?.compiledAssets || report?.visualizers?.exactProxy || 0));
  const failedChecks = Object.entries(report?.validation || {})
    .filter(([, value]) => value === false || String(value).toLowerCase() === "fail")
    .map(([key]) => key);
  const code = mediaMissingCount && visualizerMissingCount
    ? "local_compile_assets_offline"
    : mediaMissingCount
      ? "local_compile_media_offline"
      : visualizerMissingCount
        ? "local_compile_visualizer_offline"
        : "local_compile_truth_failed";
  const blockers = [];
  if (mediaMissingCount) {
    const diagnosticCueIds = mediaPreflightFailures.slice(0, COMPILE_FAILURE_CUE_PREVIEW_LIMIT).map((row) => (
      `${text(row.cueId) || "unknown cue"}: ${text(row.reason) || "unresolved source"}`
    ));
    blockers.push(`${mediaMissingCount} media cue${mediaMissingCount === 1 ? "" : "s"} could not be packaged (${diagnosticCueIds.length ? diagnosticCueIds.join(", ") : compileFailureCuePreview(mediaMissingCueIds)}${mediaPreflightFailures.length > diagnosticCueIds.length ? `, +${mediaPreflightFailures.length - diagnosticCueIds.length} more` : ""})`);
  }
  if (visualizerMissingCount) {
    const diagnosticCueIds = visualizerPreflightFailures.slice(0, COMPILE_FAILURE_CUE_PREVIEW_LIMIT).map((row) => (
      `${text(row.cueId) || "unknown cue"}: ${text(row.reason) || "unresolved proxy"}`
    ));
    blockers.push(`${visualizerMissingCount} shader cue${visualizerMissingCount === 1 ? "" : "s"} could not be packaged (${diagnosticCueIds.length ? diagnosticCueIds.join(", ") : compileFailureCuePreview(visualizerMissingCueIds)}${visualizerPreflightFailures.length > diagnosticCueIds.length ? `, +${visualizerPreflightFailures.length - diagnosticCueIds.length} more` : ""})`);
  }
  if (!blockers.length) blockers.push(failedChecks.length ? `validation failed: ${failedChecks.join(", ")}` : "the offline truth check did not pass");
  const shaderSummary = visualizerDeclared
    ? ` Shaders packaged ${visualizerCompiled}/${visualizerDeclared}.`
    : "";
  return {
    code,
    message: `Offline show compilation failed: ${blockers.join("; ")}.${shaderSummary} The final MP4 did not start.`,
    retryable: true,
    stage: "compile",
    details: {
      stage: "compile",
      validation: structuredClone(report?.validation || {}),
      media: {
        declared: mediaDeclared,
        compiled: mediaCompiled,
        missingCount: mediaMissingCount,
        missingCueIds: mediaMissingCueIds,
        unresolved: structuredClone(mediaPreflightFailures),
      },
      visualizers: {
        declared: visualizerDeclared,
        compiled: visualizerCompiled,
        missingCount: visualizerMissingCount,
        missingCueIds: visualizerMissingCueIds,
        unresolved: structuredClone(visualizerPreflightFailures),
      },
      exitCode: Number.isInteger(cause?.code) ? cause.code : null,
      signal: text(cause?.signal) || null,
      reportPath: text(reportPath) || null,
    },
  };
}

export function createSongCardCompilerError(report, options = {}) {
  const failure = describeSongCardCompilerFailure(report, options);
  return localRendererError(failure.code, failure.message, 409, failure.details);
}

function usableLocalMediaFile(candidate) {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

export function preflightSongCardLocalMedia({ project, showGraph, root = ROOT, projectPath = "" } = {}) {
  return preflightHyperFramesMedia(showGraph, {
    project,
    root: path.resolve(root),
    projectPath: projectPath || path.join(path.resolve(root), "data", "music-video-projects", "selected-project.json"),
    isFile: usableLocalMediaFile,
  });
}

export function createSongCardMediaPreflightError(preflight = {}) {
  const unresolved = Array.isArray(preflight.unresolved) ? preflight.unresolved : [];
  const preview = unresolved.slice(0, COMPILE_FAILURE_CUE_PREVIEW_LIMIT).map((row) => (
    `${text(row.cueId) || "unknown cue"}: ${text(row.reason) || "unresolved source"}`
  ));
  const remaining = unresolved.length - preview.length;
  const suffix = remaining > 0 ? `; +${remaining} more` : "";
  return localRendererError(
    "local_media_preflight_failed",
    `Media preflight stopped the render before stem analysis: ${unresolved.length} real media cue${unresolved.length === 1 ? "" : "s"} could not be resolved (${preview.join("; ")}${suffix}). No media was substituted.`,
    409,
    {
      stage: "media-preflight",
      media: {
        declared: Number(preflight.declaredCount || 0),
        generated: Number(preflight.generatedCount || 0),
        resolved: Number(preflight.resolvedCount || 0),
        missingCount: Number(preflight.unresolvedCount || unresolved.length),
        missingCueIds: unresolved.map((row) => text(row.cueId)).filter(Boolean),
        unresolved: structuredClone(unresolved),
      },
    },
  );
}

export function createSongCardAudioInputPreflightError(preflight = {}) {
  const failures = Array.isArray(preflight.failures) ? preflight.failures : [];
  const preview = failures.slice(0, COMPILE_FAILURE_CUE_PREVIEW_LIMIT).map((row) => (
    `${text(row.role || row.id) || "audio"}: ${text(row.code) || "decode-failed"}`
  ));
  const remaining = failures.length - preview.length;
  return localRendererError(
    "local_audio_input_preflight_failed",
    `Audio preflight stopped the render before stem analysis: ${preview.join("; ") || "a required master or stem did not fully decode"}${remaining > 0 ? `; +${remaining} more` : ""}. The saved edit is intact and no MP4 work started.`,
    409,
    {
      stage: "audio-input-preflight",
      expectedDurationSeconds: Number(preflight.expectedDurationSeconds || 0),
      declaredInputCount: Number(preflight.declaredInputCount || 0),
      verifiedInputCount: Number(preflight.verifiedInputCount || 0),
      blockedInputCount: Number(preflight.blockedInputCount || failures.length),
      ignoredInputCount: Number(preflight.ignoredInputCount || 0),
      failures: structuredClone(failures),
    },
  );
}

function createDecodedInputPreflightError(preflight = {}, { kind = "visual-media" } = {}) {
  const failures = Array.isArray(preflight.failures) ? preflight.failures : [];
  const preview = failures.slice(0, COMPILE_FAILURE_CUE_PREVIEW_LIMIT).map((row) => (
    `${text(row.code) || "decode-failed"}: ${text(row.path) || "unknown file"}`
  ));
  const remaining = failures.length - preview.length;
  const proxy = kind === "proxy-atlas";
  return localRendererError(
    proxy ? "local_proxy_atlas_preflight_failed" : "local_visual_media_decode_preflight_failed",
    `${proxy ? "Shader atlas" : "Visual media"} preflight stopped the render before stem analysis: ${preview.join("; ") || "a required visual input did not decode"}${remaining > 0 ? `; +${remaining} more` : ""}. The saved edit is intact and no MP4 work started.`,
    409,
    {
      stage: proxy ? "proxy-atlas-preflight" : "visual-media-preflight",
      blockedInputCount: Number(preflight.blockedInputCount || failures.length),
      failures: structuredClone(failures),
    },
  );
}

function sameFileSnapshot(left, right) {
  return Boolean(left && right)
    && Number(left.dev) === Number(right.dev)
    && Number(left.ino) === Number(right.ino)
    && Number(left.size) === Number(right.size)
    && Number(left.mtimeMs) === Number(right.mtimeMs)
    && Number(left.ctimeMs) === Number(right.ctimeMs);
}

function fileSnapshotIdentity(stat) {
  if (!stat) return null;
  return {
    dev: Number(stat.dev),
    ino: Number(stat.ino),
    size: Number(stat.size),
    mtimeMs: Number(stat.mtimeMs),
    ctimeMs: Number(stat.ctimeMs),
  };
}

function normalizedContentSha256(value = "") {
  const hash = text(value).toLowerCase().replace(/^sha256:/u, "");
  return /^[a-f0-9]{64}$/u.test(hash) ? `sha256:${hash}` : "";
}

function sourceInputChangedError({
  stage = "source-snapshot",
  inputRole = "source",
  filePath = "",
  expectedContentSha256 = "",
  observedContentSha256 = "",
  expectedStatIdentity = null,
  observedStatIdentity = null,
  reason = "content-changed",
} = {}) {
  return localRendererError(
    "local_source_input_changed_during_render",
    `The ${inputRole} source changed after render readiness certified it. Retry to rebuild from one stable source snapshot.`,
    409,
    {
      stage,
      inputRole,
      filePath: text(filePath) || null,
      reason,
      expectedContentSha256: normalizedContentSha256(expectedContentSha256) || null,
      observedContentSha256: normalizedContentSha256(observedContentSha256) || null,
      expectedStatIdentity: expectedStatIdentity ? structuredClone(expectedStatIdentity) : null,
      observedStatIdentity: observedStatIdentity ? structuredClone(observedStatIdentity) : null,
    },
  );
}

async function stableSourceContentProof(filePath, {
  signal,
  stage = "source-snapshot",
  inputRole = "source",
  expectedContentSha256 = "",
  expectedStatIdentity = null,
} = {}) {
  const sourcePath = path.resolve(text(filePath));
  let resolvedPath = sourcePath;
  let handle = null;
  let before = null;
  let after = null;
  let pathAfter = null;
  const digest = crypto.createHash("sha256");
  let bytes = 0;
  try {
    throwIfAborted(signal);
    resolvedPath = await fsp.realpath(sourcePath);
    handle = await fsp.open(resolvedPath, "r");
    before = await handle.stat();
    if (!before.isFile() || before.size <= 0) throw new Error("source is not a nonempty regular file");
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    while (bytes < before.size) {
      throwIfAborted(signal);
      const length = Math.min(buffer.length, before.size - bytes);
      const { bytesRead } = await handle.read(buffer, 0, length, bytes);
      if (!(bytesRead > 0)) break;
      digest.update(buffer.subarray(0, bytesRead));
      bytes += bytesRead;
    }
    after = await handle.stat();
    pathAfter = await fsp.stat(resolvedPath);
  } catch (error) {
    throwIfAborted(signal);
    if (error?.code === "local_source_input_changed_during_render") throw error;
    throw sourceInputChangedError({
      stage,
      inputRole,
      filePath: sourcePath,
      expectedContentSha256,
      expectedStatIdentity,
      observedStatIdentity: fileSnapshotIdentity(after || before),
      reason: "unreadable-during-snapshot",
    });
  } finally {
    await handle?.close().catch(() => {});
  }
  const observedContentSha256 = `sha256:${digest.digest("hex")}`;
  const stable = bytes === Number(before.size)
    && sameFileSnapshot(before, after)
    && sameFileSnapshot(after, pathAfter);
  if (!stable) {
    throw sourceInputChangedError({
      stage,
      inputRole,
      filePath: resolvedPath,
      expectedContentSha256,
      observedContentSha256,
      expectedStatIdentity: expectedStatIdentity || fileSnapshotIdentity(before),
      observedStatIdentity: fileSnapshotIdentity(pathAfter || after),
      reason: "changed-during-content-hash",
    });
  }
  const expected = normalizedContentSha256(expectedContentSha256);
  if (expected && observedContentSha256 !== expected) {
    throw sourceInputChangedError({
      stage,
      inputRole,
      filePath: resolvedPath,
      expectedContentSha256: expected,
      observedContentSha256,
      expectedStatIdentity,
      observedStatIdentity: fileSnapshotIdentity(after),
      reason: "content-hash-mismatch",
    });
  }
  return {
    path: resolvedPath,
    sourcePath,
    bytes,
    contentSha256: observedContentSha256,
    statIdentity: fileSnapshotIdentity(after),
  };
}

async function stableSourceStatProof(filePath, {
  signal,
  stage = "source-snapshot-check",
  inputRole = "source",
  expectedContentSha256 = "",
  expectedStatIdentity = null,
} = {}) {
  const resolvedPath = path.resolve(text(filePath));
  let handle = null;
  let before = null;
  let after = null;
  let pathAfter = null;
  try {
    throwIfAborted(signal);
    handle = await fsp.open(resolvedPath, "r");
    before = await handle.stat();
    after = await handle.stat();
    pathAfter = await fsp.stat(resolvedPath);
  } catch (error) {
    throwIfAborted(signal);
    throw sourceInputChangedError({
      stage,
      inputRole,
      filePath: resolvedPath,
      expectedContentSha256,
      expectedStatIdentity,
      observedStatIdentity: fileSnapshotIdentity(after || before),
      reason: "unreadable-at-source-boundary",
    });
  } finally {
    await handle?.close().catch(() => {});
  }
  const observedStatIdentity = fileSnapshotIdentity(after);
  if (
    !before.isFile()
    || before.size <= 0
    || !sameFileSnapshot(before, after)
    || !sameFileSnapshot(after, pathAfter)
    || !sameFileSnapshot(expectedStatIdentity, observedStatIdentity)
  ) {
    throw sourceInputChangedError({
      stage,
      inputRole,
      filePath: resolvedPath,
      expectedContentSha256,
      expectedStatIdentity,
      observedStatIdentity,
      reason: "stat-identity-mismatch",
    });
  }
  return { path: resolvedPath, statIdentity: observedStatIdentity };
}

function readStableFileSnapshot(filePath, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    let descriptor;
    try {
      descriptor = fs.openSync(filePath, "r");
      const before = fs.fstatSync(descriptor);
      const bytes = fs.readFileSync(descriptor);
      const after = fs.fstatSync(descriptor);
      const pathStat = fs.statSync(filePath);
      if (before.isFile() && sameFileSnapshot(before, after) && sameFileSnapshot(after, pathStat)) {
        return { bytes, stat: after };
      }
    } finally {
      if (descriptor !== undefined) fs.closeSync(descriptor);
    }
  }
  throw localRendererError(
    "local_proxy_registry_changed_during_read",
    "The shader proxy registry changed while render readiness was reading it. Retry after the registry update finishes.",
    409,
    { stage: "render-readiness", filePath },
  );
}

function assertProxyRegistryIdentity(proxyRegistry, expectedContentSha256, stage = "render-readiness") {
  const expected = text(expectedContentSha256);
  if (!expected || proxyRegistry?.contentSha256 === expected) return;
  throw localRendererError(
    "local_proxy_registry_changed_during_render",
    "The shader proxy registry changed after this render was certified. Retry to rebuild from one consistent registry version.",
    409,
    {
      stage,
      expectedContentSha256: expected,
      observedContentSha256: text(proxyRegistry?.contentSha256) || null,
      filePath: text(proxyRegistry?.filePath) || null,
    },
  );
}

let proxyRegistryCache = null;
export function loadSongCardProxyRegistry({ filePath: filePathInput = "" } = {}) {
  const filePath = path.resolve(filePathInput || process.env.HAPA_HYPERFRAMES_PROXY_REGISTRY || DEFAULT_PROXY_REGISTRY);
  const snapshot = readStableFileSnapshot(filePath);
  const contentSha256 = `sha256:${sha256Bytes(snapshot.bytes)}`;
  const statIdentity = {
    dev: Number(snapshot.stat.dev),
    ino: Number(snapshot.stat.ino),
    size: Number(snapshot.stat.size),
    mtimeMs: Number(snapshot.stat.mtimeMs),
    ctimeMs: Number(snapshot.stat.ctimeMs),
  };
  const signature = `${statIdentity.dev}:${statIdentity.ino}:${statIdentity.size}:${statIdentity.mtimeMs}:${statIdentity.ctimeMs}:${contentSha256}`;
  if (!proxyRegistryCache || proxyRegistryCache.filePath !== filePath || proxyRegistryCache.contentSha256 !== contentSha256) {
    proxyRegistryCache = {
      filePath,
      signature,
      statIdentity,
      contentSha256,
      registry: JSON.parse(snapshot.bytes.toString("utf8")),
    };
  } else {
    proxyRegistryCache = { ...proxyRegistryCache, signature, statIdentity };
  }
  return proxyRegistryCache;
}

let songRegistryCache = null;
function loadSongCardStemRegistry({ filePath: filePathInput = "" } = {}) {
  const filePath = path.resolve(filePathInput || process.env.HAPA_SONG_REGISTRY_DATA || DEFAULT_SONG_REGISTRY);
  let snapshot;
  try {
    snapshot = readStableFileSnapshot(filePath);
  } catch (error) {
    throw localRendererError(
      "local_stem_registry_unavailable",
      "The canonical Hapa song/stem registry is unavailable, so isolated-stem lineage cannot be certified.",
      409,
      { stage: "stem-registry-lineage", filePath, cause: text(error?.message) },
    );
  }
  const contentSha256 = `sha256:${sha256Bytes(snapshot.bytes)}`;
  if (!songRegistryCache || songRegistryCache.filePath !== filePath || songRegistryCache.contentSha256 !== contentSha256) {
    songRegistryCache = {
      filePath,
      contentSha256,
      registry: JSON.parse(snapshot.bytes.toString("utf8")),
    };
  }
  return songRegistryCache;
}

export function createSongCardRenderReadinessError(preflight = {}) {
  const blockers = Array.isArray(preflight.blockers) ? preflight.blockers : [];
  const preview = blockers.slice(0, COMPILE_FAILURE_CUE_PREVIEW_LIMIT).map((row) => (
    `${text(row.code) || "unknown blocker"}${row.cueId ? ` at ${text(row.cueId)}` : ""}`
  ));
  const remaining = blockers.length - preview.length;
  return localRendererError(
    "local_render_readiness_failed",
    `Render readiness stopped the job before stem analysis: ${preview.join("; ") || "the exact cut did not pass deterministic checks"}${remaining > 0 ? `; +${remaining} more` : ""}. The saved edit is intact and no MP4 work started.`,
    409,
    {
      stage: "render-readiness",
      fingerprint: text(preflight.fingerprint) || null,
      blockerCount: blockers.length,
      blockers: structuredClone(blockers),
      counts: structuredClone(preflight.counts || {}),
    },
  );
}

export async function buildSongCardSourceSnapshotManifest({
  audio = {},
  visualMedia = {},
  proxyAtlases = {},
  proxyRegistry = null,
  songRegistry = null,
  additionalSources = [],
  signal,
} = {}) {
  const candidates = [
    ...(audio?.entries || []).filter((entry) => entry?.ok === true && text(entry?.path)).map((entry) => ({
      inputRole: entry.kind === "master" ? "master" : `stem:${text(entry.role || entry.id) || "unknown"}`,
      kind: entry.kind === "master" ? "master-audio" : "stem-audio",
      path: entry.path,
      expectedContentSha256: entry.contentSha256,
    })),
    ...(visualMedia?.entries || []).filter((entry) => entry?.ok === true && text(entry?.path)).map((entry) => ({
      inputRole: "visual-media",
      kind: text(entry.kind) || "visual-media",
      path: entry.path,
      expectedContentSha256: "",
    })),
    ...(proxyAtlases?.entries || []).filter((entry) => entry?.ok === true && text(entry?.path)).map((entry) => ({
      inputRole: "proxy-atlas",
      kind: "proxy-atlas",
      path: entry.path,
      expectedContentSha256: "",
    })),
    ...(proxyRegistry?.filePath ? [{
      inputRole: "proxy-registry",
      kind: "registry",
      path: proxyRegistry.filePath,
      expectedContentSha256: proxyRegistry.contentSha256,
    }] : []),
    ...(songRegistry?.filePath ? [{
      inputRole: "song-registry",
      kind: "registry",
      path: songRegistry.filePath,
      expectedContentSha256: songRegistry.contentSha256,
    }] : []),
    ...(Array.isArray(additionalSources) ? additionalSources : []).filter((entry) => text(entry?.path)).map((entry) => ({
      inputRole: text(entry.inputRole) || "execution-source",
      kind: text(entry.kind) || "execution-source",
      path: entry.path,
      expectedContentSha256: entry.expectedContentSha256,
    })),
  ];
  const grouped = new Map();
  for (const candidate of candidates) {
    const sourcePath = path.resolve(text(candidate.path));
    let canonicalPath = sourcePath;
    try {
      throwIfAborted(signal);
      canonicalPath = await fsp.realpath(sourcePath);
    } catch (error) {
      throwIfAborted(signal);
      throw sourceInputChangedError({
        stage: "source-input-preflight",
        inputRole: candidate.inputRole,
        filePath: sourcePath,
        expectedContentSha256: candidate.expectedContentSha256,
        reason: "source-realpath-unavailable",
      });
    }
    if (!grouped.has(canonicalPath)) grouped.set(canonicalPath, {
      ...candidate,
      path: canonicalPath,
      sourcePaths: [],
      inputRoles: [],
      kinds: [],
    });
    const row = grouped.get(canonicalPath);
    row.sourcePaths.push(sourcePath);
    row.inputRoles.push(candidate.inputRole);
    row.kinds.push(candidate.kind);
    const expected = normalizedContentSha256(candidate.expectedContentSha256);
    const currentExpected = normalizedContentSha256(row.expectedContentSha256);
    if (expected && currentExpected && expected !== currentExpected) {
      throw sourceInputChangedError({
        stage: "source-input-preflight",
        inputRole: candidate.inputRole,
        filePath: sourcePath,
        expectedContentSha256: currentExpected,
        observedContentSha256: expected,
        reason: "conflicting-preflight-content-proofs",
      });
    }
    if (expected) row.expectedContentSha256 = expected;
  }
  const entries = [];
  for (const candidate of [...grouped.values()].sort((left, right) => left.path.localeCompare(right.path))) {
    const inputRoles = [...new Set(candidate.inputRoles)].sort();
    const proof = await stableSourceContentProof(candidate.path, {
      signal,
      stage: "source-input-preflight",
      inputRole: inputRoles.join(","),
      expectedContentSha256: candidate.expectedContentSha256,
    });
    entries.push({
      path: proof.path,
      sourcePaths: [...new Set([...candidate.sourcePaths, proof.path])].sort(),
      inputRole: inputRoles.length === 1 ? inputRoles[0] : inputRoles.join(","),
      inputRoles,
      kinds: [...new Set(candidate.kinds)].sort(),
      bytes: proof.bytes,
      contentSha256: proof.contentSha256,
      statIdentity: proof.statIdentity,
    });
  }
  const payload = { schemaVersion: SOURCE_SNAPSHOT_MANIFEST_SCHEMA, entries };
  return {
    ...payload,
    sha256: `sha256:${sha256Bytes(JSON.stringify(payload))}`,
  };
}

function canonicalSourceAliasMap(manifest = {}) {
  const aliases = new Map();
  for (const entry of Array.isArray(manifest?.entries) ? manifest.entries : []) {
    const canonicalPath = path.resolve(text(entry?.path));
    if (!canonicalPath) continue;
    aliases.set(canonicalPath, canonicalPath);
    for (const sourcePath of Array.isArray(entry?.sourcePaths) ? entry.sourcePaths : []) {
      if (text(sourcePath)) aliases.set(path.resolve(text(sourcePath)), canonicalPath);
    }
  }
  return aliases;
}

function localFileReference(value) {
  const candidate = text(value);
  if (!candidate) return "";
  if (/^file:\/\//iu.test(candidate)) {
    try { return fileURLToPath(candidate); } catch { return ""; }
  }
  return path.isAbsolute(candidate) ? path.normalize(candidate) : "";
}

export function canonicalizeSongCardExecutionValue(value, manifest = {}, {
  root = ROOT,
  projectPath = "",
} = {}) {
  const aliases = canonicalSourceAliasMap(manifest);
  const resolvedRoot = path.resolve(root);
  const projectDataRoot = projectPath
    ? path.resolve(path.dirname(path.resolve(projectPath)), "..")
    : resolvedRoot;
  const visit = (current) => {
    if (Array.isArray(current)) return current.map(visit);
    if (current && typeof current === "object") {
      return Object.fromEntries(Object.entries(current).map(([key, child]) => [key, visit(child)]));
    }
    if (typeof current !== "string") return current;
    const candidates = [];
    const local = localFileReference(current);
    if (local) candidates.push(path.resolve(local));
    else if (current.includes("/") || current.includes("\\")) {
      candidates.push(path.resolve(resolvedRoot, current));
      candidates.push(path.resolve(projectDataRoot, current));
    }
    for (const candidate of candidates) {
      const canonicalPath = aliases.get(candidate);
      if (canonicalPath) return canonicalPath;
    }
    return current;
  };
  return visit(value);
}

export function canonicalizeSongCardProxyRegistry(registry = {}, manifest = {}) {
  const proxyTargetsByHash = new Map();
  for (const entry of Array.isArray(manifest?.entries) ? manifest.entries : []) {
    if (!Array.isArray(entry?.kinds) || !entry.kinds.includes("proxy-atlas")) continue;
    const sha256 = normalizedContentSha256(entry.contentSha256);
    if (sha256 && text(entry.path)) proxyTargetsByHash.set(sha256, path.resolve(entry.path));
  }
  const visit = (current) => {
    if (Array.isArray(current)) return current.map(visit);
    if (!current || typeof current !== "object") return current;
    const clone = Object.fromEntries(Object.entries(current).map(([key, child]) => [key, visit(child)]));
    const target = proxyTargetsByHash.get(normalizedContentSha256(clone.assetSha256));
    if (target) {
      clone.assetPath = target;
      clone.repositoryPath = target;
    }
    return clone;
  };
  return visit(registry);
}

export async function assertSongCardSourceSnapshotUnchanged(manifest = {}, {
  signal,
  stage = "source-snapshot-check",
} = {}) {
  const manifestPayload = { schemaVersion: manifest?.schemaVersion, entries: manifest?.entries || [] };
  const calculatedManifestSha256 = `sha256:${sha256Bytes(JSON.stringify(manifestPayload))}`;
  if (
    manifest?.schemaVersion !== SOURCE_SNAPSHOT_MANIFEST_SCHEMA
    || !normalizedContentSha256(manifest?.sha256)
    || manifest.sha256 !== calculatedManifestSha256
  ) {
    throw sourceInputChangedError({ stage, inputRole: "source-manifest", reason: "snapshot-manifest-invalid" });
  }
  for (const entry of manifest.entries || []) {
    await stableSourceStatProof(entry.path, {
      signal,
      stage,
      inputRole: text(entry.inputRole) || "source",
      expectedContentSha256: entry.contentSha256,
      expectedStatIdentity: entry.statIdentity,
    });
  }
  return {
    schemaVersion: "hapa.song-card.source-snapshot-check.v1",
    ok: true,
    stage,
    manifestSha256: manifest.sha256,
    checkedInputCount: Array.isArray(manifest.entries) ? manifest.entries.length : 0,
  };
}

function successfulInputEvidenceIdentity({ audio, visualMedia, proxyAtlases, readiness, proxyRegistry, stemRegistryLineage, stemBindingRepair, songRegistry, sourceSnapshotManifest } = {}) {
  const values = {
    gateVersion: LOCAL_RENDER_GATE_VERSION,
    readinessFingerprint: text(readiness?.fingerprint) || null,
    proxyRegistrySha256: text(proxyRegistry?.contentSha256) || null,
    songRegistrySha256: text(songRegistry?.contentSha256) || null,
    sourceSnapshotManifestSha256: text(sourceSnapshotManifest?.sha256) || null,
    stemRegistryMasterId: text(stemRegistryLineage?.master?.id) || null,
    stemRegistryIds: (stemRegistryLineage?.entries || []).map((entry) => text(entry?.id)).filter(Boolean).sort(),
    stemBindingRepairSha256: stemBindingRepair
      ? `sha256:${sha256Bytes(JSON.stringify(stemBindingRepair))}`
      : null,
    stemBindingTelemetrySha256: text(stemBindingRepair?.telemetry?.bundleSha256) || null,
    audio: (audio?.entries || []).map((entry) => text(entry?.cache?.statIdentityKey)).filter(Boolean).sort(),
    visualMedia: (visualMedia?.entries || []).map((entry) => text(entry?.evidence?.signatureKey)).filter(Boolean).sort(),
    proxyAtlases: (proxyAtlases?.entries || []).map((entry) => text(entry?.evidence?.signatureKey)).filter(Boolean).sort(),
  };
  return {
    ...values,
    sha256: `sha256:${sha256Bytes(JSON.stringify(values))}`,
  };
}

async function preflightSongCardLocalSourceInputs({ project, showGraph, masterPath, signal } = {}) {
  loadLocalRenderProbeCaches();
  throwIfAborted(signal);
  const declaredStemInputs = (Array.isArray(showGraph?.stems?.items) ? showGraph.stems.items : []).filter((stem) => text(stem?.audioPath));
  const songRegistry = loadSongCardStemRegistry();
  let stemRegistryLineage = {
    schemaVersion: "hapa.stem-registry-lineage-preflight.v1",
    ok: true,
    status: "not-applicable-no-isolated-stems",
    entries: [],
    findings: [],
    master: { id: null },
  };
  if (declaredStemInputs.length) {
    stemRegistryLineage = preflightStemRegistryLineage({ registry: songRegistry.registry, project, showGraph, masterPath });
    if (!stemRegistryLineage.ok) throw createStemRegistryLineageError(stemRegistryLineage);
  }
  const structuralAudio = await preflightRenderAudioInputs({
    ...renderAudioInputsFromShowGraph({
      masterPath,
      showGraph,
      stemTelemetryBindings: [],
    }),
    expectedDurationSeconds: Number(showGraph?.song?.durationSeconds || 0),
  }, { concurrency: 2, root: ROOT, signal });
  if (!structuralAudio.ok) throw createSongCardAudioInputPreflightError(structuralAudio);

  let executionShowGraph = showGraph;
  let stemBindingRepair = null;
  let repairedStemTelemetryPreflight = null;
  if (declaredStemInputs.length) {
    const repairDirectory = await fsp.mkdtemp(path.join(os.tmpdir(), "hapa-stem-binding-repair-"));
    const graphPath = path.join(repairDirectory, "show-graph.json");
    const telemetryPath = path.join(repairDirectory, "stem-telemetry.json");
    const analyzedGraphPath = path.join(repairDirectory, "show-graph-with-telemetry.json");
    try {
      await writeJson(graphPath, filteredStemGraph(showGraph, masterPath));
      await execFile(process.env.HAPA_PYTHON || "python3", [
        path.join(ROOT, "scripts/build-stem-telemetry-bundle.py"),
        "--graph", graphPath,
        "--master", masterPath,
        "--output", telemetryPath,
        "--graph-output", analyzedGraphPath,
      ], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, signal });
      const telemetry = await readJson(telemetryPath);
      const telemetrySha256 = `sha256:${await sha256File(telemetryPath)}`;
      stemBindingRepair = repairEchoShowGraphStemBindings(showGraph, {
        telemetry,
        telemetrySha256,
        project,
        scope: "song-card-checkpoint-input-preflight",
      });
      if (stemBindingRepair.reusedCertifiedExecutionGraph) {
        executionShowGraph = stemBindingRepair.graph;
      } else {
        const parentIdentity = {
          runId: text(showGraph?.runId) || null,
          variantId: text(showGraph?.directorV2?.variantId) || null,
          variantHash: text(showGraph?.directorV2?.variantHash) || null,
        };
        const repairedGraph = stemBindingRepair.graph;
        repairedGraph.directorV2 = {
          ...(repairedGraph.directorV2 || {}),
          executionLineage: {
            schemaVersion: "hapa.echo.execution-graph-lineage.v1",
            kind: "derived-stem-binding-repair",
            parentIdentity,
            telemetryBundleSha256: telemetrySha256,
            policy: stemBindingRepair.receipt?.policy || null,
            nonDestructiveStoredEdit: true,
          },
        };
        executionShowGraph = reidentifyEchoCompiledShowGraph(repairedGraph);
      }
      const masterEntry = structuralAudio.entries.find((entry) => entry.kind === "master" && entry.ok === true);
      repairedStemTelemetryPreflight = preflightStemTelemetryBundle({
        telemetry,
        showGraph: executionShowGraph,
        expectedDurationSeconds: Number(executionShowGraph?.song?.durationSeconds || 0),
        expectedMasterPath: masterPath,
        expectedMasterSha256: masterEntry?.contentSha256 || "",
        expectedStemSources: structuralAudio.entries
          .filter((entry) => entry.kind === "stem" && entry.ok === true)
          .map((entry) => ({ role: entry.role, path: entry.path, sha256: entry.contentSha256 })),
      });
      if (!repairedStemTelemetryPreflight.ok || stemBindingRepair.receipt?.status === "blocked") {
        throw createStemTelemetryPreflightError(repairedStemTelemetryPreflight);
      }
    } finally {
      await fsp.rm(repairDirectory, { recursive: true, force: true }).catch(() => {});
    }
  }

  const signalGraph = preflightSongCardSignalGraph({ project, showGraph: executionShowGraph });
  if (!signalGraph.ok) throw createSongCardSignalGraphError(signalGraph);
  const audio = await preflightRenderAudioInputs({
    ...renderAudioInputsFromShowGraph({
      masterPath,
      showGraph: executionShowGraph,
      stemTelemetryBindings: deriveRequiredStemTelemetryBindings({ showGraph: executionShowGraph }),
    }),
    expectedDurationSeconds: Number(executionShowGraph?.song?.durationSeconds || 0),
  }, { concurrency: 2, root: ROOT, signal });
  try { writeRenderAudioInputPreflightCache(AUDIO_PROBE_CACHE_PATH); } catch { /* Fresh evidence remains authoritative. */ }
  if (!audio.ok) throw createSongCardAudioInputPreflightError(audio);

  throwIfAborted(signal);
  const projectPath = path.join(ROOT, "data", "music-video-projects", "selected-project.json");
  const media = preflightSongCardLocalMedia({ project, showGraph: executionShowGraph, root: ROOT, projectPath });
  if (!media.ok) throw createSongCardMediaPreflightError(media);
  const visualMedia = await preflightResolvedVisualMedia(media, { concurrency: 4, signal });
  await writeRenderVisualMediaProbeCache(VISUAL_PROBE_CACHE_PATH).catch(() => {});
  if (!visualMedia.ok) throw createDecodedInputPreflightError(visualMedia, { kind: "visual-media" });

  throwIfAborted(signal);
  const proxyRegistry = loadSongCardProxyRegistry();
  const readiness = preflightSongCardRenderReadiness({
    project,
    showGraph: executionShowGraph,
    proxyRegistry: proxyRegistry.registry,
    proxyRegistryPath: proxyRegistry.filePath,
    root: ROOT,
    projectPath,
    signalGraphPreflight: signalGraph,
    mediaPreflight: media,
  });
  if (!readiness.ok) throw createSongCardRenderReadinessError(readiness);
  const proxyAtlases = await preflightProxyAtlasImages(readiness, { concurrency: 4, signal });
  await writeRenderVisualMediaProbeCache(VISUAL_PROBE_CACHE_PATH).catch(() => {});
  if (!proxyAtlases.ok) throw createDecodedInputPreflightError(proxyAtlases, { kind: "proxy-atlas" });
  const sourceSnapshotManifest = await buildSongCardSourceSnapshotManifest({
    audio,
    visualMedia,
    proxyAtlases,
    proxyRegistry,
    songRegistry,
    signal,
  });
  return {
    signalGraph,
    executionShowGraph,
    stemBindingRepair: stemBindingRepair?.receipt || null,
    stemTelemetry: repairedStemTelemetryPreflight,
    audio,
    media,
    visualMedia,
    readiness,
    proxyAtlases,
    stemRegistryLineage,
    proxyRegistry: structuredClone(proxyRegistry.registry),
    sourceResolutionProject: structuredClone(project),
    sourceResolutionProjectPath: projectPath,
    sourceSnapshotManifest,
    identity: successfulInputEvidenceIdentity({ audio, visualMedia, proxyAtlases, readiness, proxyRegistry, stemRegistryLineage, stemBindingRepair: stemBindingRepair?.receipt, songRegistry, sourceSnapshotManifest }),
  };
}

function publicRenderFailure(error, { stage = "failed", retryable = true } = {}) {
  const errorCode = typeof error?.code === "string" && error.code.trim()
    ? error.code.trim()
    : "local_render_failed";
  return {
    code: errorCode,
    message: error?.message || String(error || "Local render failed."),
    retryable: Boolean(retryable),
    stage: text(error?.details?.stage || stage) || "failed",
    details: error?.details && typeof error.details === "object" ? structuredClone(error.details) : {},
  };
}

function existingAbsoluteRegularFile(value) {
  const candidate = text(value);
  if (!candidate || !path.isAbsolute(candidate)) return null;
  try { return fs.statSync(candidate).isFile() ? path.resolve(candidate) : null; } catch { return null; }
}

function collectSongCardExecutionSources(values = [], {
  root = ROOT,
  projectPath = "",
} = {}) {
  const resolvedRoot = path.resolve(root);
  const projectDataRoot = projectPath
    ? path.resolve(path.dirname(path.resolve(projectPath)), "..")
    : resolvedRoot;
  const candidates = new Map();
  const append = (value, inputRole) => {
    if (typeof value !== "string") return;
    const direct = localFileReference(value);
    const possible = direct
      ? [direct]
      : value.includes("/") || value.includes("\\")
        ? [path.resolve(resolvedRoot, value), path.resolve(projectDataRoot, value)]
        : [];
    for (const candidate of possible) {
      let stat = null;
      try { stat = fs.statSync(candidate); } catch { /* Non-file strings are not render inputs. */ }
      if (!stat?.isFile() || !(stat.size > 0)) continue;
      const resolved = path.resolve(candidate);
      if (!candidates.has(resolved)) candidates.set(resolved, {
        inputRole,
        kind: "execution-source",
        path: resolved,
      });
    }
  };
  const visit = (value, inputRole) => {
    if (Array.isArray(value)) {
      value.forEach((child) => visit(child, inputRole));
    } else if (value && typeof value === "object") {
      Object.values(value).forEach((child) => visit(child, inputRole));
    } else {
      append(value, inputRole);
    }
  };
  for (const row of values) visit(row?.value, text(row?.inputRole) || "execution-source");
  return [...candidates.values()];
}

export async function resolveSongCardMasterAudio({ songId, storedPlan, resolveRegistryMaster = null } = {}) {
  const registry = await resolveRegistryMaster?.(songId, storedPlan);
  const registryCandidates = typeof registry === "string"
    ? [registry]
    : [registry?.masterPath, registry?.audioPath, registry?.path];
  const registryResolved = registryCandidates.map(existingAbsoluteRegularFile).find(Boolean);
  if (registryResolved) return registryResolved;
  throw localRendererError("local_master_audio_missing", "The Builder could not resolve the selected song's verified registry master audio. Editable plan paths are not accepted as song identity.", 409, { songId });
}

function abortError(signal, fallback = "The local render was stopped before completion.") {
  const reason = signal?.reason;
  if (reason instanceof Error) return reason;
  return localRendererError("local_render_canceled", text(reason) || fallback, 409);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function terminateProcessGroup(child, signal = "SIGTERM") {
  if (!child?.pid) return false;
  try {
    if (process.platform !== "win32") process.kill(-child.pid, signal);
    else child.kill(signal);
    return true;
  } catch {
    try { return child.kill(signal); } catch { return false; }
  }
}

function summarizeHyperFramesFailure(error) {
  const details = [error?.stderr, error?.stdout, error?.message].map((value) => String(value || "")).join("\n");
  const navigation = details.match(/Navigation timeout of ([0-9]+) ms exceeded/iu);
  if (navigation) {
    return `HyperFrames could not finish loading the offline composition before its ${Math.round(Number(navigation[1]) / 1000)}-second navigation limit.`;
  }
  if (/ENOSPC|No space left on device/iu.test(details)) return "The local render ran out of disk space before it could finish the MP4.";
  if (/ENOMEM|out of memory|heap limit/iu.test(details)) return "The local render ran out of memory before it could finish the MP4.";
  if (/killed|SIGKILL|SIGTERM/iu.test(details)) return "The local render process stopped before it could finish the MP4.";
  const finalLine = details.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).at(-1) || "HyperFrames could not finish the local MP4.";
  return finalLine.length <= 360 ? finalLine : "HyperFrames could not finish the local MP4. Retry to resume from the verified saved edit.";
}

function runHyperFramesRender(args, { cwd, report, signal, registerProcess = null }) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const child = spawnChild(process.execPath, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let settled = false;
    let killTimer = null;
    const terminate = () => {
      terminateProcessGroup(child, "SIGTERM");
      if (!killTimer) killTimer = setTimeout(() => terminateProcessGroup(child, "SIGKILL"), 5_000);
    };
    const unregister = typeof registerProcess === "function" ? registerProcess({ child, terminate }) : null;
    const cleanup = () => {
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener?.("abort", onAbort);
      if (typeof unregister === "function") unregister();
    };
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => terminate();
    signal?.addEventListener?.("abort", onAbort, { once: true });
    let outputTail = "";
    let lastReportedPercent = 39;
    const observe = (chunk) => {
      outputTail = `${outputTail}${String(chunk || "")}`.slice(-512 * 1024);
      const frames = [...outputTail.matchAll(/Streaming frame\s+([0-9]+)\/([0-9]+)/giu)].at(-1);
      if (frames) {
        const completed = Number(frames[1]);
        const total = Number(frames[2]);
        const percent = total > 0 ? Math.min(85, 45 + Math.floor((completed / total) * 40)) : 45;
        if (percent > lastReportedPercent) {
          lastReportedPercent = percent;
          report("render", percent, `Rendering frame ${completed.toLocaleString()} of ${total.toLocaleString()}.`, { completed, total });
        }
      } else if (/Assembling final video/iu.test(outputTail) && lastReportedPercent < 86) {
        lastReportedPercent = 86;
        report("assemble", 86, "Assembling audio and rendered frames into the final MP4.");
      } else {
        const preparation = [
          [/page\.goto complete/iu, 44, "The offline composition loaded; starting deterministic frame capture."],
          [/page\.goto start/iu, 43, "Opening the bounded offline composition."],
          [/Starting frame capture/iu, 42, "Starting the full-resolution capture worker."],
          [/Processing audio tracks/iu, 41, "Preparing the verified master audio track."],
          [/Extracting video frames/iu, 40, "Preparing the selected video sources for frame-accurate capture."],
        ].find(([pattern]) => pattern.test(outputTail));
        if (preparation && preparation[1] > lastReportedPercent) {
          lastReportedPercent = preparation[1];
          report("render-prepare", preparation[1], preparation[2]);
        }
      }
    };
    child.stdout.on("data", observe);
    child.stderr.on("data", observe);
    child.once("error", (error) => finish(error));
    child.once("close", (code, closeSignal) => {
      if (signal?.aborted) {
        finish(abortError(signal));
        return;
      }
      if (code === 0) {
        finish();
        return;
      }
      const error = new Error(`HyperFrames exited with ${closeSignal ? `signal ${closeSignal}` : `code ${code}`}.`);
      error.stdout = outputTail;
      error.stderr = outputTail;
      error.code = code ?? closeSignal ?? "local_hyperframes_failed";
      finish(error);
    });
    if (signal?.aborted) onAbort();
  });
}

function runPixelQaCapture(executable, args, { cwd, report, signal, registerProcess = null }) {
  return new Promise((resolve, reject) => {
    throwIfAborted(signal);
    const child = spawnChild(executable, args, {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let settled = false;
    let killTimer = null;
    let stdoutTail = "";
    let stderrTail = "";
    let stdoutLines = "";
    const terminate = () => {
      terminateProcessGroup(child, "SIGTERM");
      if (!killTimer) killTimer = setTimeout(() => terminateProcessGroup(child, "SIGKILL"), 5_000);
    };
    const unregister = typeof registerProcess === "function" ? registerProcess({ child, terminate }) : null;
    const cleanup = () => {
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener?.("abort", onAbort);
      if (typeof unregister === "function") unregister();
    };
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve();
    };
    const onAbort = () => terminate();
    const observeProgress = (chunk) => {
      const value = String(chunk || "");
      stdoutTail = `${stdoutTail}${value}`.slice(-512 * 1024);
      stdoutLines += value;
      const lines = stdoutLines.split(/\r?\n/u);
      stdoutLines = lines.pop() || "";
      for (const line of lines) {
        let progress;
        try { progress = JSON.parse(line); } catch { progress = null; }
        if (progress?.type !== "pixel-qa-progress") continue;
        const completed = Math.max(0, Number(progress.completed || 0));
        const total = Math.max(0, Number(progress.total || 0));
        const percent = total > 0 ? Math.min(39, 34 + Math.floor((completed / total) * 5)) : 34;
        const cueIds = Array.isArray(progress.cueIds) ? progress.cueIds.map(text).filter(Boolean) : [];
        const cueSummary = cueIds.length ? ` (${cueIds.slice(0, 2).join(", ")})` : "";
        report(
          "pixel-qa",
          percent,
          `Verifying shader cue ${completed.toLocaleString()} of ${total.toLocaleString()}${cueSummary}.`,
          { completed, total, timestamp: Number(progress.timestamp || 0), cueIds },
        );
      }
    };
    child.stdout.on("data", observeProgress);
    child.stderr.on("data", (chunk) => { stderrTail = `${stderrTail}${String(chunk || "")}`.slice(-512 * 1024); });
    child.once("error", (error) => finish(error));
    child.once("close", (code, closeSignal) => {
      if (signal?.aborted) {
        finish(abortError(signal));
        return;
      }
      if (code === 0) {
        finish();
        return;
      }
      const error = new Error(`Shader verification exited with ${closeSignal ? `signal ${closeSignal}` : `code ${code}`}.`);
      error.stdout = stdoutTail;
      error.stderr = stderrTail;
      error.code = code ?? closeSignal ?? "local_pixel_qa_failed";
      finish(error);
    });
    signal?.addEventListener?.("abort", onAbort, { once: true });
    if (signal?.aborted) onAbort();
  });
}

async function writeJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

async function readJson(filePath) {
  return JSON.parse(await fsp.readFile(filePath, "utf8"));
}

async function atomicJson(filePath, value) {
  await fsp.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  const temporary = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await fsp.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await fsp.rename(temporary, filePath);
  } finally {
    await fsp.rm(temporary, { force: true }).catch(() => {});
  }
}

function withinDirectory(root, candidate) {
  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  return resolvedCandidate === resolvedRoot || resolvedCandidate.startsWith(`${resolvedRoot}${path.sep}`);
}

async function artifactProof(filePath) {
  const stat = await fsp.stat(filePath);
  if (!stat.isFile() || stat.size <= 0) throw new Error(`Missing checkpoint artifact: ${filePath}`);
  return { path: path.resolve(filePath), bytes: stat.size, sha256: `sha256:${await sha256File(filePath)}` };
}

async function readLocalCheckpoint(checkpointPath, { identitySha256, outputDirectory } = {}) {
  let checkpoint;
  try { checkpoint = await readJson(checkpointPath); }
  catch { return null; }
  if (
    checkpoint?.schemaVersion !== LOCAL_CHECKPOINT_SCHEMA
    || checkpoint.identitySha256 !== identitySha256
    || checkpoint?.identity?.renderGateVersion !== LOCAL_RENDER_GATE_VERSION
    || checkpoint?.identity?.rendererBuildSchema !== RENDERER_BUILD_IDENTITY_SCHEMA
    || !text(checkpoint?.identity?.rendererBuildSha256)
    || echoOutputProfileCacheKey(checkpoint?.outputProfile) !== checkpoint?.identity?.outputProfileCacheKey
    || checkpoint?.sourceSnapshotManifest?.schemaVersion !== SOURCE_SNAPSHOT_MANIFEST_SCHEMA
    || checkpoint?.sourceSnapshotManifest?.sha256 !== checkpoint?.identity?.sourceSnapshotManifestSha256
  ) return null;
  const masterPath = text(checkpoint.pipeline?.master?.path);
  const posterPath = text(checkpoint.pipeline?.poster?.path);
  if (!masterPath || !posterPath || !withinDirectory(outputDirectory, masterPath) || !withinDirectory(outputDirectory, posterPath)) return null;
  try {
    const [master, poster] = await Promise.all([artifactProof(masterPath), artifactProof(posterPath)]);
    if (master.sha256 !== checkpoint.pipeline.master.sha256 || poster.sha256 !== checkpoint.pipeline.poster.sha256) return null;
    if (checkpoint.rendererTruth?.schemaVersion !== RELEASE_TRUTH_SCHEMA || checkpoint.rendererTruth?.executionStatus !== "executed" || checkpoint.rendererTruth?.ok !== true) return null;
    return { ...checkpoint, pipeline: { ...checkpoint.pipeline, master, poster } };
  } catch {
    return null;
  }
}

function isolatedStemRole(value = "") {
  const role = normalizeHyperFramesStemRole(value);
  return role && !["archivezip", "archive", "master"].includes(role) ? role : "";
}

function usableStemItem(item = {}) {
  const role = isolatedStemRole(item?.stemType || item?.role || item?.title || item?.id);
  const audioPath = text(item?.audioPath);
  if (!role || !audioPath) return null;
  try {
    return fs.statSync(audioPath).isFile() ? { item, role, audioPath } : null;
  } catch {
    return null;
  }
}

function mappingStemFocus(value) {
  if (typeof value === "string") {
    const separator = value.lastIndexOf(":");
    return separator > 0 ? value.slice(0, separator) : "";
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? value.stemFocus || value.stem_focus || value.stem || ""
    : "";
}

function visualizerRequestedStemRoles(card = {}) {
  const portable = card?.visualization?.card || {};
  const requests = [];
  const add = (value, source) => {
    const role = isolatedStemRole(value);
    if (role) requests.push({ role, requested: text(value), source });
  };
  add(portable.stemFocus, "portable-card.stemFocus");
  add(card?.visualization?.stemFocus, "visualization.stemFocus");
  add(card?.parameters?.stemFocus, "parameters.stemFocus");
  add(card?.provenance?.stemFocus, "provenance.stemFocus");
  for (const [uniform, mapping] of Object.entries(portable.audioMap || {})) {
    add(mappingStemFocus(mapping), `portable-card.audioMap.${uniform}`);
  }
  for (const [uniform, mapping] of Object.entries(card?.parameters?.visualizerMappings || {})) {
    add(mappingStemFocus(mapping), `parameters.visualizerMappings.${uniform}`);
  }
  for (const [index, binding] of (Array.isArray(portable.automation) ? portable.automation : []).entries()) {
    add(binding?.stemFocus, `portable-card.automation.${index}`);
  }
  return [...new Map(requests.map((request) => [`${request.role}\u0000${request.source}`, request])).values()];
}

export function preflightSongCardSignalGraph({ project = {}, showGraph = {} } = {}) {
  const stemItems = Array.isArray(showGraph?.stems?.items) ? showGraph.stems.items : [];
  const projectRoles = (Array.isArray(project?.stems_available) ? project.stems_available : [])
    .map(isolatedStemRole)
    .filter(Boolean);
  const graphRoles = stemItems.map((item) => isolatedStemRole(item?.stemType || item?.role || item?.title || item?.id)).filter(Boolean);
  const expectedStemRoles = [...new Set([...projectRoles, ...graphRoles])];
  const verifiedStems = stemItems.map(usableStemItem).filter(Boolean);
  const verifiedStemRoles = [...new Set(verifiedStems.map((entry) => entry.role))];
  const verifiedRoleSet = new Set(verifiedStemRoles);
  const shaderRows = visualizerCards(showGraph);
  const unresolvedStemBindings = shaderRows.flatMap(({ card }) => (
    visualizerRequestedStemRoles(card)
      .filter((request) => !verifiedRoleSet.has(request.role))
      .map((request) => ({
        cardId: text(card?.id),
        sourceId: text(card?.visualization?.sourceId || card?.visualization?.requestedSourceId || card?.visualization?.card?.id),
        requestedStemRole: request.role,
        requestedStemFocus: request.requested,
        bindingSource: request.source,
        reason: "visualizer-requested-stem-path-unverified",
      }))
  ));
  const detachedVisualizers = shaderRows.filter(({ card }) => (
    card?.visualization?.card?.schemaVersion !== "hapa.visualizer-card.v2"
    || !text(card?.visualization?.card?.id)
    || !text(card?.visualization?.card?.source?.hash)
  )).map(({ card }) => ({
    cardId: text(card?.id),
    sourceId: text(card?.visualization?.sourceId || card?.visualization?.requestedSourceId),
    reason: "portable-visualizer-card-missing-or-unbound",
  }));
  const errors = [];
  if (expectedStemRoles.length > 0 && verifiedStems.length === 0) errors.push("isolated-stem-paths-detached");
  if (unresolvedStemBindings.length > 0) errors.push("visualizer-stem-paths-detached");
  if (detachedVisualizers.length > 0) errors.push("portable-visualizer-truth-detached");
  return {
    schemaVersion: "hapa.song-card.signal-graph-preflight.v1",
    ok: errors.length === 0,
    errors,
    expectedStemRoles,
    verifiedStemRoles,
    unverifiedExpectedStemRoles: expectedStemRoles.filter((role) => !verifiedRoleSet.has(role)),
    verifiedStemCount: verifiedStems.length,
    visualizerCount: shaderRows.length,
    unresolvedStemBindings,
    detachedVisualizers,
  };
}

function createSongCardSignalGraphError(preflight) {
  return localRendererError(
    "local_signal_graph_detached",
    "The selected cut lost its isolated-stem paths or exact shader cards before compilation. The final MP4 did not start; re-save the repaired cut and retry.",
    409,
    { stage: "signal-graph-preflight", preflight },
  );
}

function filteredStemGraph(showGraph, masterPath) {
  const graph = structuredClone(showGraph);
  const sourceItems = Array.isArray(graph?.stems?.items) ? graph.stems.items : [];
  const verified = sourceItems.filter((item) => {
    const audioPath = text(item?.audioPath);
    const role = text(item?.stemType || item?.title || item?.id).toLowerCase();
    return audioPath && role !== "archive-zip" && fs.existsSync(audioPath) && fs.statSync(audioPath).isFile();
  });
  graph.stems = {
    ...(graph.stems || {}),
    items: verified,
    count: verified.length,
    authoritativeMaster: {
      audioPath: masterPath,
      truthStatus: "registry-master-used-for-playback-and-telemetry",
    },
  };
  return graph;
}

function visualizerCards(showGraph = {}) {
  return (showGraph.tracks || []).flatMap((track) => (track.cards || [])
    .filter((card) => Boolean(card?.visualization && (
      track.role === "visualizer"
      || track.id === "track-b"
      || card.visualization.card?.schemaVersion === "hapa.visualizer-card.v2"
    )))
    .map((card) => ({ card, track })));
}

export function reevaluateSongCardPixelReport(pixelReport = {}) {
  const frames = Array.isArray(pixelReport?.frames) ? pixelReport.frames : [];
  const evaluated = evaluateHyperFramesPixelAcceptance({
    frames,
    timelineReady: pixelReport?.acceptance?.timelineReady === true,
    networkAttemptCount: Number(pixelReport?.offline?.networkAttemptCount || 0),
    consoleErrorCount: Number(pixelReport?.consoleSummary?.errorCount ?? pixelReport?.consoleErrors?.length ?? 0),
  });
  return {
    ...structuredClone(pixelReport || {}),
    acceptance: evaluated.acceptance,
    acceptanceDiagnostics: evaluated.diagnostics,
    functionalOk: evaluated.functionalOk,
    ok: evaluated.ok,
  };
}

export function createSongCardPixelQaError(pixelReport = {}, { cause = null, reportPath = "" } = {}) {
  const refreshed = reevaluateSongCardPixelReport(pixelReport);
  const failedChecks = Object.entries(refreshed.acceptance || {})
    .filter(([, value]) => value === false)
    .map(([key]) => key);
  const mismatchedFrames = refreshed.acceptanceDiagnostics?.mismatchedFrames || [];
  const nonPositiveOpacityFrames = refreshed.acceptanceDiagnostics?.nonPositiveOpacityFrames || [];
  const blankShaderCanvasFrames = refreshed.acceptance?.blankShaderCanvasFrames || [];
  const blockers = [];
  if (mismatchedFrames.length) blockers.push(`${mismatchedFrames.length} cue identity mismatch${mismatchedFrames.length === 1 ? "" : "es"}`);
  if (nonPositiveOpacityFrames.length) blockers.push(`${nonPositiveOpacityFrames.length} invisible shader cue${nonPositiveOpacityFrames.length === 1 ? "" : "s"}`);
  if (blankShaderCanvasFrames.length) blockers.push(`${blankShaderCanvasFrames.length} blank shader frame${blankShaderCanvasFrames.length === 1 ? "" : "s"}`);
  if (!blockers.length && failedChecks.length) blockers.push(`failed checks: ${failedChecks.join(", ")}`);
  if (!blockers.length) blockers.push("the shader verification process stopped without a passing report");
  return localRendererError(
    "local_renderer_truth_failed",
    `Shader verification stopped before MP4 encoding: ${blockers.join("; ")}. The saved edit is intact and no edition was minted.`,
    409,
    {
      stage: "pixel-qa",
      failedChecks,
      frameCount: Array.isArray(refreshed.frames) ? refreshed.frames.length : 0,
      mismatchedFrames: structuredClone(mismatchedFrames),
      nonPositiveOpacityFrames: structuredClone(nonPositiveOpacityFrames),
      blankShaderCanvasFrames: structuredClone(blankShaderCanvasFrames),
      semanticAliasMatches: structuredClone(refreshed.acceptanceDiagnostics?.semanticAliasMatches || []),
      reportPath: text(reportPath) || null,
      exitCode: Number.isInteger(cause?.code) ? cause.code : null,
      signal: text(cause?.signal) || null,
    },
  );
}

function executedRendererTruth(showGraph, compilerReport, pixelReport) {
  const cues = visualizerCards(showGraph);
  const declared = Number(compilerReport?.visualizers?.declared || 0);
  const exact = Number(compilerReport?.visualizers?.exactProxy || 0);
  const unsupported = Number(compilerReport?.visualizers?.unsupported || 0);
  const verifiedPixelReport = reevaluateSongCardPixelReport(pixelReport);
  const pixelFrames = Array.isArray(verifiedPixelReport?.frames) ? verifiedPixelReport.frames : [];
  const pixelsPass = cues.length === 0 || (verifiedPixelReport?.ok === true
    && pixelFrames.length > 0
    && pixelFrames.every((frame) => frame?.metrics?.nonBlank === true && frame?.metrics?.nonFlat === true));
  if (cues.length && !pixelsPass) throw createSongCardPixelQaError(verifiedPixelReport);
  if (cues.length && (compilerReport?.ok !== true || declared !== cues.length || exact !== cues.length || unsupported !== 0)) {
    throw localRendererError("local_renderer_truth_failed", "The local render did not execute every requested shader cue with verified visible pixels.", 409, {
      stage: "compile",
      requestedCueCount: cues.length,
      declared,
      exact,
      unsupported,
      pixelReportOk: verifiedPixelReport?.ok === true,
      pixelFrameCount: pixelFrames.length,
    });
  }
  const receipts = cues.map(({ card, track }) => ({
    cueId: text(card.id),
    trackId: text(track.id),
    requestedId: text(card.visualization?.sourceId || card.visualization?.card?.id),
    executionStatus: "executed",
    status: "exact",
    ok: true,
    allStatesVisible: true,
    silentDefaultCount: 0,
  }));
  return {
    schemaVersion: RELEASE_TRUTH_SCHEMA,
    executionStatus: "executed",
    status: "verified",
    truthStatus: "verified-local-release-render",
    rendererId: "hyperframes",
    ok: true,
    allStatesVisible: true,
    silentDefaultCount: 0,
    cueReceiptCount: receipts.length,
    unresolvedRendererIds: [],
    receipts,
  };
}

export function inspectSongCardReleaseStreams(probe = {}, expectedDuration = 0) {
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration || video?.duration || audio?.duration || 0);
  const videoDuration = Number(video?.duration || 0);
  const audioDuration = Number(audio?.duration || 0);
  const tolerance = 0.1;
  const startTolerance = Math.min(0.1, tolerance || 0.1);
  const videoStart = Number(video?.start_time);
  const audioStart = Number(audio?.start_time);
  const startMismatch = !Number.isFinite(videoStart)
    || !Number.isFinite(audioStart)
    || Math.abs(videoStart) > startTolerance
    || Math.abs(audioStart) > startTolerance
    || Math.abs(videoStart - audioStart) > startTolerance;
  const durationMismatch = expectedDuration > 0 && (
    Math.abs(duration - expectedDuration) > tolerance
    || !(videoDuration > 0) || Math.abs(videoDuration - expectedDuration) > tolerance
    || !(audioDuration > 0) || Math.abs(audioDuration - expectedDuration) > tolerance
  );
  return {
    ok: Boolean(video && audio && duration > 0 && !durationMismatch && !startMismatch),
    video,
    audio,
    duration,
    videoDuration,
    audioDuration,
    expectedDuration,
    tolerance,
    durationMismatch,
    videoStartSeconds: Number.isFinite(videoStart) ? videoStart : null,
    audioStartSeconds: Number.isFinite(audioStart) ? audioStart : null,
    startToleranceSeconds: startTolerance,
    startMismatch,
  };
}

function releaseRational(value) {
  const match = text(value).match(/^(-?[0-9]+)\/([0-9]+)$/u);
  if (!match || Number(match[2]) === 0) return null;
  const result = Number(match[1]) / Number(match[2]);
  return Number.isFinite(result) && result > 0 ? result : null;
}

export function inspectSongCardReleaseVideoProfile(probe = {}, expectedDuration = 0, {
  expectedWidth = 1920,
  expectedHeight = 1080,
  expectedFps = 30,
} = {}) {
  const video = (Array.isArray(probe.streams) ? probe.streams : []).find((stream) => stream.codec_type === "video") || null;
  const width = Number(video?.width || 0);
  const height = Number(video?.height || 0);
  const averageFps = releaseRational(video?.avg_frame_rate);
  const nominalFps = releaseRational(video?.r_frame_rate);
  const fps = averageFps;
  const frameCount = Number(video?.nb_read_frames || video?.nb_frames || 0);
  const duration = Number(video?.duration || expectedDuration || probe?.format?.duration || 0);
  const expectedFrames = expectedFps * Number(expectedDuration || duration || 0);
  const frameTolerance = 3;
  const errors = [];
  if (width !== expectedWidth || height !== expectedHeight) errors.push("release-video-dimensions-mismatch");
  if (
    !(averageFps > 0)
    || !(nominalFps > 0)
    || Math.abs(averageFps - expectedFps) > 0.05
    || Math.abs(nominalFps - expectedFps) > 0.05
    || Math.abs(averageFps - nominalFps) > 0.01
  ) errors.push("release-video-frame-rate-mismatch");
  if (!(frameCount > 0) || !(expectedFrames > 0) || Math.abs(frameCount - expectedFrames) > frameTolerance) errors.push("release-video-frame-count-mismatch");
  return {
    schemaVersion: "hapa.song-card.release-video-profile.v2",
    ok: Boolean(video) && errors.length === 0,
    errors,
    width,
    height,
    fps,
    averageFps,
    nominalFps,
    frameCount,
    durationSeconds: duration,
    expectedWidth,
    expectedHeight,
    expectedFps,
    expectedFrameCount: expectedFrames,
    frameTolerance,
  };
}

export function inspectSongCardReleaseFrameCadence(probe = {}, expectedDuration = 0, {
  expectedFps = 30,
  maximumJitterSeconds = null,
} = {}) {
  const frames = (Array.isArray(probe?.frames) ? probe.frames : []).filter((frame) => !text(frame?.media_type) || frame.media_type === "video");
  const timestamps = frames.map((frame) => Number(
    frame?.best_effort_timestamp_time
    ?? frame?.pts_time
    ?? frame?.pkt_dts_time
  ));
  const invalidTimestampIndex = timestamps.findIndex((value) => !Number.isFinite(value));
  const expectedDeltaSeconds = 1 / expectedFps;
  const allowedJitterSeconds = maximumJitterSeconds !== null && maximumJitterSeconds !== undefined && Number.isFinite(Number(maximumJitterSeconds))
    ? Math.max(0, Number(maximumJitterSeconds))
    : Math.max(0.001, expectedDeltaSeconds * 0.05);
  const deltas = [];
  for (let index = 1; index < timestamps.length; index += 1) {
    if (Number.isFinite(timestamps[index]) && Number.isFinite(timestamps[index - 1])) deltas.push(timestamps[index] - timestamps[index - 1]);
  }
  const jitter = deltas.map((delta) => Math.abs(delta - expectedDeltaSeconds));
  const maximumObservedJitterSeconds = jitter.length ? Math.max(...jitter) : null;
  const minimumDeltaSeconds = deltas.length ? Math.min(...deltas) : null;
  const maximumDeltaSeconds = deltas.length ? Math.max(...deltas) : null;
  const expectedFrameCount = expectedDuration > 0 ? expectedDuration * expectedFps : null;
  const firstTimestampSeconds = timestamps.length && Number.isFinite(timestamps[0]) ? timestamps[0] : null;
  const lastTimestampSeconds = timestamps.length && Number.isFinite(timestamps.at(-1)) ? timestamps.at(-1) : null;
  const coveredDurationSeconds = Number.isFinite(lastTimestampSeconds) ? lastTimestampSeconds + expectedDeltaSeconds : null;
  const errors = [];
  if (invalidTimestampIndex >= 0 || timestamps.length < 2) errors.push("release-video-frame-timestamps-invalid");
  if (deltas.some((delta) => !(delta > 0))) errors.push("release-video-frame-timestamps-nonmonotonic");
  if (maximumObservedJitterSeconds === null || maximumObservedJitterSeconds > allowedJitterSeconds) errors.push("release-video-frame-cadence-uneven");
  if (expectedFrameCount !== null && Math.abs(timestamps.length - expectedFrameCount) > 3) errors.push("release-video-frame-count-mismatch");
  if (firstTimestampSeconds === null || Math.abs(firstTimestampSeconds) > 0.1) errors.push("release-video-frame-origin-mismatch");
  if (expectedDuration > 0 && (coveredDurationSeconds === null || Math.abs(coveredDurationSeconds - expectedDuration) > 0.1)) errors.push("release-video-frame-coverage-mismatch");
  return {
    schemaVersion: "hapa.song-card.release-frame-cadence.v1",
    ok: errors.length === 0,
    errors,
    expectedFps,
    expectedDeltaSeconds,
    allowedJitterSeconds,
    frameCount: timestamps.length,
    expectedFrameCount,
    firstTimestampSeconds,
    lastTimestampSeconds,
    coveredDurationSeconds,
    minimumDeltaSeconds,
    maximumDeltaSeconds,
    maximumObservedJitterSeconds,
    invalidTimestampIndex: invalidTimestampIndex >= 0 ? invalidTimestampIndex : null,
  };
}

function timedDetectorSpans(source, prefix, durationSeconds) {
  const events = [...String(source).matchAll(new RegExp(`${prefix}_(start|duration|end):\\s*([\\d.]+)`, "gu"))]
    .map((match) => ({ kind: match[1], value: Number(match[2]), index: match.index }))
    .filter((event) => Number.isFinite(event.value))
    .sort((left, right) => left.index - right.index);
  const spans = [];
  let open = null;
  for (const event of events) {
    if (event.kind === "start") {
      if (open) {
        const endSeconds = Math.max(open.startSeconds, event.value);
        spans.push({ startSeconds: open.startSeconds, endSeconds, durationSeconds: endSeconds - open.startSeconds, closedBy: "next-start" });
      }
      open = { startSeconds: event.value, declaredDurationSeconds: null };
    } else if (event.kind === "duration" && open) {
      open.declaredDurationSeconds = event.value;
    } else if (event.kind === "end" && open) {
      const endSeconds = Math.max(open.startSeconds, event.value);
      spans.push({
        startSeconds: open.startSeconds,
        endSeconds,
        durationSeconds: Number.isFinite(open.declaredDurationSeconds) ? open.declaredDurationSeconds : endSeconds - open.startSeconds,
        closedBy: "end-event",
      });
      open = null;
    }
  }
  if (open && Number(durationSeconds) > open.startSeconds) {
    const endSeconds = Number(durationSeconds);
    spans.push({ startSeconds: open.startSeconds, endSeconds, durationSeconds: endSeconds - open.startSeconds, closedBy: "decoded-eof" });
  }
  return { events, spans };
}

function mergedSpanDuration(spans = []) {
  const sorted = spans
    .map((span) => ({ start: Number(span.startSeconds), end: Number(span.endSeconds) }))
    .filter((span) => Number.isFinite(span.start) && Number.isFinite(span.end) && span.end > span.start)
    .sort((left, right) => left.start - right.start);
  let total = 0;
  let open = null;
  for (const span of sorted) {
    if (!open) open = { ...span };
    else if (span.start <= open.end) open.end = Math.max(open.end, span.end);
    else {
      total += open.end - open.start;
      open = { ...span };
    }
  }
  if (open) total += open.end - open.start;
  return total;
}

export function inspectSongCardReleaseCompositionLog(stderr = "", durationSeconds = 0, {
  silenceScanExecuted = false,
  blackLimitSeconds = 0.75,
  freezeLimitSeconds = 2,
  minimumActiveRatio = 0.1,
  intentionalBlackoutSpans = [],
  intentionalFreezeSpans = [],
} = {}) {
  const source = String(stderr || "");
  const blackDetection = timedDetectorSpans(source, "black", durationSeconds);
  const blackSpans = blackDetection.spans;
  const freezeDetection = timedDetectorSpans(source, "freeze", durationSeconds);
  const frozenSpans = freezeDetection.spans;
  const silenceDetection = timedDetectorSpans(source, "silence", durationSeconds);
  const silenceSpans = silenceDetection.spans;
  const volume = (name) => {
    const matches = [...source.matchAll(new RegExp(`${name}:\\s*(-?inf|-?[0-9.]+)\\s*dB`, "giu"))];
    const value = matches.at(-1)?.[1];
    return value == null ? null : /^-?inf$/iu.test(value) ? Number.NEGATIVE_INFINITY : Number(value);
  };
  const meanVolumeDb = volume("mean_volume");
  const maxVolumeDb = volume("max_volume");
  const safeDuration = Math.max(0, Number(durationSeconds || 0));
  const safeBlackLimit = Math.max(0.5, Number(blackLimitSeconds) || 0.75);
  const safeFreezeLimit = Math.max(0.5, Number(freezeLimitSeconds) || 2);
  const coveredByIntent = (span, intents) => (Array.isArray(intents) ? intents : []).some((intent) => (
    Number(span.startSeconds) >= Number(intent.startSeconds) - 0.25
    && Number(span.endSeconds) <= Number(intent.endSeconds) + 0.25
  ));
  const excessiveBlackSpans = blackSpans.filter((span) => span.durationSeconds >= safeBlackLimit && !coveredByIntent(span, intentionalBlackoutSpans));
  const excessiveFrozenSpans = frozenSpans.filter((span) => span.durationSeconds >= safeFreezeLimit && !coveredByIntent(span, intentionalFreezeSpans));
  const intentionalBlackSpans = blackSpans.filter((span) => span.durationSeconds >= safeBlackLimit && coveredByIntent(span, intentionalBlackoutSpans));
  const intentionalFrozenSpans = frozenSpans.filter((span) => span.durationSeconds >= safeFreezeLimit && coveredByIntent(span, intentionalFreezeSpans));
  const silentSeconds = Math.min(safeDuration, mergedSpanDuration(silenceSpans));
  const activeSeconds = Math.max(0, safeDuration - silentSeconds);
  const activeRatio = safeDuration > 0 ? activeSeconds / safeDuration : 0;
  const minimumActiveSeconds = Math.min(safeDuration, Math.max(1, safeDuration * Math.max(0, Number(minimumActiveRatio) || 0)));
  const errors = [];
  if (excessiveBlackSpans.length) errors.push("release-video-prolonged-black");
  if (excessiveFrozenSpans.length) errors.push("release-video-prolonged-freeze");
  if (maxVolumeDb === null || !(Number.isFinite(maxVolumeDb) && maxVolumeDb > -90)) errors.push("release-audio-silent-or-unmeasured");
  if (!silenceScanExecuted) errors.push("release-audio-active-coverage-unmeasured");
  else if (activeSeconds + 1e-6 < minimumActiveSeconds) errors.push("release-audio-active-coverage-insufficient");
  return {
    schemaVersion: "hapa.song-card.release-composition-qa.v1",
    ok: errors.length === 0,
    errors,
    durationSeconds: Number(durationSeconds || 0),
    blackLimitSeconds: safeBlackLimit,
    freezeLimitSeconds: safeFreezeLimit,
    blackSpans,
    frozenSpans,
    blackDetectionEvents: blackDetection.events,
    freezeDetectionEvents: freezeDetection.events,
    silenceSpans,
    excessiveBlackSpans,
    excessiveFrozenSpans,
    intentionalBlackSpans,
    intentionalFrozenSpans,
    declaredIntent: {
      blackoutSpans: structuredClone(Array.isArray(intentionalBlackoutSpans) ? intentionalBlackoutSpans : []),
      freezeSpans: structuredClone(Array.isArray(intentionalFreezeSpans) ? intentionalFreezeSpans : []),
    },
    audio: {
      meanVolumeDb,
      maxVolumeDb,
      nonSilent: Number.isFinite(maxVolumeDb) && maxVolumeDb > -90,
      silenceScanExecuted: silenceScanExecuted === true,
      silentSeconds,
      activeSeconds,
      activeRatio,
      minimumActiveSeconds,
    },
  };
}

function normalizedCompositionSpan(row = {}, { defaultDurationSeconds = 0, nextStartSeconds = null } = {}) {
  const startSeconds = Number(
    row?.startSeconds
    ?? row?.start
    ?? row?.start_sec
    ?? row?.atSeconds
    ?? row?.at_seconds
    ?? row?.at
  );
  const declaredEnd = Number(row?.endSeconds ?? row?.end ?? row?.end_sec);
  const declaredDuration = Number(row?.durationSeconds ?? row?.duration ?? row?.duration_sec);
  const inferredEnd = Number.isFinite(declaredEnd) && declaredEnd > startSeconds
    ? declaredEnd
    : Number.isFinite(declaredDuration) && declaredDuration > 0
      ? startSeconds + declaredDuration
      : Number.isFinite(nextStartSeconds) && Number(nextStartSeconds) > startSeconds
        ? Number(nextStartSeconds)
        : Number.isFinite(defaultDurationSeconds) && Number(defaultDurationSeconds) > startSeconds
          ? Number(defaultDurationSeconds)
          : Number.NaN;
  if (!(Number.isFinite(startSeconds) && Number.isFinite(inferredEnd) && inferredEnd > startSeconds)) return null;
  return { startSeconds, endSeconds: inferredEnd };
}

function mergeCompositionSpans(spans = []) {
  const sorted = spans
    .map((span) => ({
      ...span,
      startSeconds: Number(span?.startSeconds),
      endSeconds: Number(span?.endSeconds),
      cueIds: [...new Set([...(span?.cueIds || []), span?.cueId].map(text).filter(Boolean))],
      reasons: [...new Set([...(span?.reasons || []), span?.reason].map(text).filter(Boolean))],
    }))
    .filter((span) => Number.isFinite(span.startSeconds) && Number.isFinite(span.endSeconds) && span.endSeconds > span.startSeconds)
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);
  const merged = [];
  for (const span of sorted) {
    const previous = merged.at(-1);
    if (!previous || span.startSeconds > previous.endSeconds + 1e-6) {
      merged.push({ ...span });
      continue;
    }
    previous.endSeconds = Math.max(previous.endSeconds, span.endSeconds);
    previous.cueIds = [...new Set([...previous.cueIds, ...span.cueIds])];
    previous.reasons = [...new Set([...previous.reasons, ...span.reasons])];
  }
  return merged.map(({ cueId: _cueId, reason: _reason, ...span }) => span);
}

function staticCompositionIntentSpans(staticLayers = [], moving = []) {
  const layers = staticLayers
    .map((layer, index) => ({
      ...layer,
      layerSignature: text(layer?.layerSignature || layer?.cueId) || `anonymous-static-layer:${index}`,
    }))
    .filter((layer) => Number.isFinite(Number(layer.startSeconds)) && Number.isFinite(Number(layer.endSeconds)) && Number(layer.endSeconds) > Number(layer.startSeconds));
  const dynamic = mergeCompositionSpans(moving);
  const boundaries = [...new Set([
    ...layers.flatMap((layer) => [Number(layer.startSeconds), Number(layer.endSeconds)]),
    ...dynamic.flatMap((span) => [Number(span.startSeconds), Number(span.endSeconds)]),
  ].filter(Number.isFinite))].sort((left, right) => left - right);
  const spans = [];
  for (let index = 0; index < boundaries.length - 1; index += 1) {
    const startSeconds = boundaries[index];
    const endSeconds = boundaries[index + 1];
    if (!(endSeconds > startSeconds)) continue;
    const sample = startSeconds + ((endSeconds - startSeconds) / 2);
    const activeLayers = layers.filter((layer) => Number(layer.startSeconds) <= sample && Number(layer.endSeconds) > sample);
    const hasMovingLayer = dynamic.some((span) => Number(span.startSeconds) <= sample && Number(span.endSeconds) > sample);
    if (!activeLayers.length || hasMovingLayer) continue;
    const layerSignature = activeLayers.map((layer) => layer.layerSignature).sort().join("|");
    const cueIds = [...new Set(activeLayers.map((layer) => text(layer.cueId)).filter(Boolean))].sort();
    const reasons = [...new Set(activeLayers.map((layer) => text(layer.reason)).filter(Boolean))].sort();
    const previous = spans.at(-1);
    if (previous && Math.abs(previous.endSeconds - startSeconds) <= 1e-6 && previous.layerSignature === layerSignature) {
      previous.endSeconds = endSeconds;
    } else {
      spans.push({ startSeconds, endSeconds, layerSignature, cueIds, reasons });
    }
  }
  return spans;
}

export function deriveSongCardReleaseCompositionContracts(showGraph = {}) {
  const staticCandidates = [];
  const compositionWideStaticHolds = [];
  const blackoutCandidates = [];
  const compositionWideBlackouts = [];
  const movingSpans = [];
  const graphDurationSeconds = Math.max(
    Number(showGraph?.song?.durationSeconds || 0),
    ...(Array.isArray(showGraph?.tracks) ? showGraph.tracks : []).flatMap((track) => (
      (Array.isArray(track?.cards) ? track.cards : []).map((card) => Number(card?.endSeconds || 0))
    )),
  );
  const addMoving = (span, reason, cueId = null) => {
    if (span) movingSpans.push({ ...span, cueId, reason });
  };
  const motionIsActive = (value) => {
    const motion = text(value).toLowerCase();
    return Boolean(motion) && !/^(?:none|off|static|still|hold|locked|fixed)$/u.test(motion);
  };
  for (const track of Array.isArray(showGraph?.tracks) ? showGraph.tracks : []) {
    for (const card of Array.isArray(track?.cards) ? track.cards : []) {
      if (card?.knockedOut === true || card?.disabled === true) continue;
      const span = normalizedCompositionSpan(card);
      if (!span) continue;
      const { startSeconds, endSeconds } = span;
      const cueId = text(card?.id) || null;
      const media = card?.media || {};
      const source = text(media.localPath || media.path || media.uri || media.src);
      const declaredKind = text(media.kind || media.type || media.sourceKind || media.mimeType).toLowerCase();
      const opacity = Number(card?.parameters?.opacity ?? 1);
      const visiblyActive = !Number.isFinite(opacity) || opacity > 0.001;
      const animationCapableImage = /\.(?:gif|webp|avif)(?:$|[?#])/iu.test(source)
        || /(?:gif|webp|avif)/u.test(declaredKind);
      const staticImage = !animationCapableImage && (
        declaredKind.includes("image")
        || /\.(?:png|jpe?g|bmp|tiff?)(?:$|[?#])/iu.test(source)
      );
      const explicitStaticHold = card?.parameters?.intentionalStaticHold === true
        || card?.parameters?.allowStaticHold === true
        || media?.visualContract?.intentionalStaticHold === true;
      const compositionWideStatic = card?.parameters?.intentionalCompositionHold === true
        || card?.parameters?.allowCompositionHold === true
        || media?.visualContract?.intentionalCompositionHold === true;
      if (visiblyActive && (staticImage || explicitStaticHold || compositionWideStatic)) (compositionWideStatic ? compositionWideStaticHolds : staticCandidates).push({
        startSeconds,
        endSeconds,
        cueId,
        layerSignature: cueId || `${text(track?.id || track?.role) || "track"}:${text(media?.id || source) || `${startSeconds}:${endSeconds}`}`,
        reason: compositionWideStatic ? "explicit-composition-hold" : staticImage ? "declared-static-image-cue" : "explicit-layer-static-hold",
      });
      const blackout = card?.parameters?.intentionalBlackout === true
        || card?.parameters?.allowBlackout === true
        || media?.visualContract?.intentionalBlackout === true;
      const compositionWideBlackout = card?.parameters?.intentionalCompositionBlackout === true
        || card?.parameters?.allowCompositionBlackout === true
        || media?.visualContract?.intentionalCompositionBlackout === true;
      if (visiblyActive && (blackout || compositionWideBlackout)) (compositionWideBlackout ? compositionWideBlackouts : blackoutCandidates).push({
        startSeconds,
        endSeconds,
        cueId,
        reason: compositionWideBlackout ? "explicit-composition-blackout" : "explicit-layer-blackout",
      });

      const trackRole = text(track?.role || track?.kind || track?.id).toLowerCase();
      const visualizer = Boolean(card?.visualization) || trackRole.includes("visualizer") || text(track?.id) === "track-b";
      const video = declaredKind.includes("video")
        || /\.(?:mp4|m4v|mov|webm|mkv|avi|mpeg|mpg|ogv|gif|webp|avif)(?:$|[?#])/iu.test(source);
      const motion = text(
        card?.parameters?.motion
        || card?.parameters?.cameraMotion
        || card?.parameters?.camera_motion
        || card?.cameraMotion
      ).toLowerCase();
      const activeMotion = motionIsActive(motion)
        || (Array.isArray(card?.cameraKeyframes) && card.cameraKeyframes.some((keyframe) => motionIsActive(keyframe?.motion)));
      const dynamicTrack = /(?:accent|effect|camera|lyric|caption)/u.test(trackRole);
      if (visiblyActive && (visualizer || video || activeMotion || dynamicTrack)) {
        addMoving(span, visualizer ? "visualizer-layer" : video ? "moving-media" : activeMotion ? "camera-motion" : `${trackRole || "dynamic"}-layer`, cueId);
      }
    }
  }

  const timedRows = (rows, reason, { defaultDurationSeconds = graphDurationSeconds, pointDurationSeconds = 0 } = {}) => {
    const ordered = (Array.isArray(rows) ? rows : []).map((row) => ({ row, startSeconds: Number(row?.startSeconds ?? row?.start ?? row?.start_sec ?? row?.atSeconds ?? row?.at_seconds ?? row?.at) }))
      .filter(({ startSeconds }) => Number.isFinite(startSeconds))
      .sort((left, right) => left.startSeconds - right.startSeconds);
    ordered.forEach(({ row }, index) => {
      const nextStartSeconds = ordered[index + 1]?.startSeconds;
      const hasDeclaredRange = Number(row?.endSeconds ?? row?.end ?? row?.end_sec) > ordered[index].startSeconds
        || Number(row?.durationSeconds ?? row?.duration ?? row?.duration_sec) > 0;
      const span = hasDeclaredRange
        ? normalizedCompositionSpan(row)
        : pointDurationSeconds > 0
        ? { startSeconds: ordered[index].startSeconds, endSeconds: Math.min(defaultDurationSeconds, ordered[index].startSeconds + pointDurationSeconds) }
        : normalizedCompositionSpan(row, { defaultDurationSeconds, nextStartSeconds });
      addMoving(span, reason, text(row?.id) || null);
    });
  };
  timedRows(showGraph?.song?.lyricOverlay?.lines, "lyric-overlay", { defaultDurationSeconds: graphDurationSeconds });
  timedRows(showGraph?.directorV2?.accentTrack?.events, "accent-event", { defaultDurationSeconds: graphDurationSeconds, pointDurationSeconds: 0.25 });

  const globalCameraRows = (Array.isArray(showGraph?.directorV2?.cameraKeyframes) ? showGraph.directorV2.cameraKeyframes : [])
    .filter((row) => motionIsActive(row?.motion));
  const cameraRowsBySlot = new Map();
  const ungroupedCameraRows = [];
  for (const row of globalCameraRows) {
    const slotId = text(row?.slotId);
    if (!slotId) ungroupedCameraRows.push(row);
    else cameraRowsBySlot.set(slotId, [...(cameraRowsBySlot.get(slotId) || []), row]);
  }
  for (const [slotId, rows] of cameraRowsBySlot) {
    const times = rows.map((row) => Number(row?.atSeconds ?? row?.at_seconds ?? row?.at)).filter(Number.isFinite).sort((left, right) => left - right);
    if (times.length >= 2 && times.at(-1) > times[0]) addMoving({ startSeconds: times[0], endSeconds: times.at(-1) }, "camera-keyframe-motion", slotId);
  }
  timedRows(ungroupedCameraRows, "camera-keyframe-motion", { defaultDurationSeconds: graphDurationSeconds });

  const ordinaryStaticSpans = staticCompositionIntentSpans(staticCandidates, movingSpans);
  const explicitCompositionHolds = staticCompositionIntentSpans(compositionWideStaticHolds, []);
  const intentionalFreezeSpans = [
    ...ordinaryStaticSpans.filter((span) => !explicitCompositionHolds.some((hold) => hold.startSeconds <= span.startSeconds && hold.endSeconds >= span.endSeconds)),
    ...explicitCompositionHolds,
  ].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds);
  // A layer can request a black appearance without proving that it covers the
  // final program. Only an explicit composition-wide contract may excuse a
  // prolonged black interval in the encoded release.
  const intentionalBlackoutSpans = mergeCompositionSpans(compositionWideBlackouts);
  return {
    schemaVersion: "hapa.song-card.release-composition-contracts.v3",
    intentionalFreezeSpans,
    intentionalBlackoutSpans,
    dynamicCompositionSpans: mergeCompositionSpans(movingSpans),
    declaredLayerBlackoutSpans: mergeCompositionSpans(blackoutCandidates),
  };
}

function releaseAudioFingerprint(pcm, { sampleRate = 8_000, analysisFps = 50 } = {}) {
  const bytes = Buffer.isBuffer(pcm) ? pcm : Buffer.from(pcm || []);
  const samplesPerFrame = Math.max(1, Math.round(sampleRate / analysisFps));
  const sampleCount = Math.floor(bytes.length / 2);
  const frameCount = Math.floor(sampleCount / samplesPerFrame);
  const frames = [];
  const means = { rms: 0, zeroCrossingRate: 0, derivativeRatio: 0, crestFactor: 0 };
  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = frameIndex * samplesPerFrame;
    let sumSquares = 0;
    let derivativeSquares = 0;
    let peak = 0;
    let crossings = 0;
    let previous = 0;
    for (let offset = 0; offset < samplesPerFrame; offset += 1) {
      const sample = bytes.readInt16LE((start + offset) * 2) / 32768;
      sumSquares += sample * sample;
      peak = Math.max(peak, Math.abs(sample));
      if (offset > 0) {
        const difference = sample - previous;
        derivativeSquares += difference * difference;
        if ((sample >= 0) !== (previous >= 0)) crossings += 1;
      }
      previous = sample;
    }
    const rms = Math.sqrt(sumSquares / samplesPerFrame);
    const derivativeRms = Math.sqrt(derivativeSquares / Math.max(1, samplesPerFrame - 1));
    const frame = {
      rms,
      zeroCrossingRate: crossings / Math.max(1, samplesPerFrame - 1),
      derivativeRatio: derivativeRms / Math.max(1e-6, rms),
      crestFactor: peak / Math.max(1e-6, rms),
    };
    frames.push(frame);
    for (const key of Object.keys(means)) means[key] += frame[key];
  }
  for (const key of Object.keys(means)) means[key] = frameCount ? means[key] / frameCount : 0;
  return {
    schemaVersion: "hapa.song-card.release-audio-fingerprint.v1",
    sampleRate,
    analysisFps,
    sampleCount,
    frameCount,
    durationSeconds: sampleCount / sampleRate,
    featureMeans: means,
    frames,
  };
}

function releaseFeatureStats(frames, key) {
  const values = frames.map((frame) => Number(frame?.[key])).filter(Number.isFinite);
  if (!values.length) return { mean: 0, standardDeviation: 0 };
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return { mean, standardDeviation: Math.sqrt(variance) };
}

export function inspectSongCardReleaseAudioLineage(sourceFingerprint = {}, outputFingerprint = {}, {
  maximumLagSeconds = 0.5,
  allowedLagSeconds = 0.12,
  minimumDynamicCorrelation = 0.72,
  minimumStaticSimilarity = 0.65,
  minimumFlatSimilarity = 0.9,
} = {}) {
  const featureNames = ["rms", "zeroCrossingRate", "derivativeRatio", "crestFactor"];
  const sourceFrames = Array.isArray(sourceFingerprint.frames) ? sourceFingerprint.frames : [];
  const outputFrames = Array.isArray(outputFingerprint.frames) ? outputFingerprint.frames : [];
  const analysisFps = Number(sourceFingerprint.analysisFps || outputFingerprint.analysisFps || 0);
  const sameCadence = analysisFps > 0 && Number(outputFingerprint.analysisFps) === analysisFps;
  const stats = Object.fromEntries(featureNames.map((key) => [key, {
    source: releaseFeatureStats(sourceFrames, key),
    output: releaseFeatureStats(outputFrames, key),
  }]));
  const dynamicFeatures = featureNames.filter((key) => (
    stats[key].source.standardDeviation > 1e-4
    && stats[key].output.standardDeviation > 1e-4
  ));
  const floors = { rms: 0.01, zeroCrossingRate: 0.01, derivativeRatio: 0.08, crestFactor: 0.15 };
  const staticFeatureSimilarity = Object.fromEntries(featureNames.map((key) => {
    const left = stats[key].source.mean;
    const right = stats[key].output.mean;
    const scale = floors[key] + (Math.max(Math.abs(left), Math.abs(right)) * 0.25);
    return [key, 1 / (1 + (Math.abs(left - right) / scale))];
  }));
  const staticSimilarity = featureNames.reduce((sum, key) => sum + staticFeatureSimilarity[key], 0) / featureNames.length;
  const correlationAtLag = (lagFrames) => {
    if (!dynamicFeatures.length) return null;
    const sourceStart = lagFrames > 0 ? lagFrames : 0;
    const outputStart = lagFrames < 0 ? -lagFrames : 0;
    const count = Math.min(sourceFrames.length - sourceStart, outputFrames.length - outputStart);
    if (count < 10) return null;
    let sum = 0;
    let values = 0;
    for (let index = 0; index < count; index += 1) {
      const sourceFrame = sourceFrames[sourceStart + index];
      const outputFrame = outputFrames[outputStart + index];
      for (const key of dynamicFeatures) {
        sum += ((Number(sourceFrame[key]) - stats[key].source.mean) / stats[key].source.standardDeviation)
          * ((Number(outputFrame[key]) - stats[key].output.mean) / stats[key].output.standardDeviation);
        values += 1;
      }
    }
    return values ? sum / values : null;
  };
  const zeroLagCorrelation = sameCadence ? correlationAtLag(0) : null;
  let bestCorrelation = zeroLagCorrelation;
  let bestLagFrames = zeroLagCorrelation === null ? null : 0;
  if (sameCadence && dynamicFeatures.length) {
    const maximumLagFrames = Math.max(0, Math.round(maximumLagSeconds * analysisFps));
    for (let lagFrames = -maximumLagFrames; lagFrames <= maximumLagFrames; lagFrames += 1) {
      if (lagFrames === 0) continue;
      const correlation = correlationAtLag(lagFrames);
      if (correlation !== null && (bestCorrelation === null || correlation > bestCorrelation)) {
        bestCorrelation = correlation;
        bestLagFrames = lagFrames;
      }
    }
  }
  const bestLagSeconds = bestLagFrames === null || !analysisFps ? null : bestLagFrames / analysisFps;
  const sourceDuration = Number(sourceFingerprint.durationSeconds || 0);
  const outputDuration = Number(outputFingerprint.durationSeconds || 0);
  const durationTolerance = renderDurationToleranceSeconds(sourceDuration) || 0.15;
  const durationMatches = sourceDuration > 0 && outputDuration > 0 && Math.abs(sourceDuration - outputDuration) <= durationTolerance;
  const relativeVariation = (key) => stats[key].source.standardDeviation / Math.max(floors[key], Math.abs(stats[key].source.mean));
  const sourceFlatLike = relativeVariation("rms") <= 0.02
    && relativeVariation("derivativeRatio") <= 0.03
    && relativeVariation("zeroCrossingRate") <= 0.08;
  const dynamicMatch = dynamicFeatures.length >= 2
    && Number.isFinite(bestCorrelation)
    && bestCorrelation >= minimumDynamicCorrelation
    && Number.isFinite(bestLagSeconds)
    && Math.abs(bestLagSeconds) <= allowedLagSeconds
    && staticSimilarity >= minimumStaticSimilarity;
  const flatMatch = sourceFlatLike && staticSimilarity >= minimumFlatSimilarity;
  const errors = [];
  if (!sameCadence || !sourceFrames.length || !outputFrames.length) errors.push("release-audio-lineage-fingerprint-invalid");
  if (!durationMatches) errors.push("release-audio-lineage-duration-mismatch");
  if (!(dynamicMatch || flatMatch)) errors.push("release-audio-lineage-content-mismatch");
  return {
    schemaVersion: "hapa.song-card.release-audio-lineage.v1",
    ok: errors.length === 0,
    errors,
    decoder: "ffmpeg-s16le-mono-8000hz",
    analysisFps,
    sourceFrameCount: sourceFrames.length,
    outputFrameCount: outputFrames.length,
    sourceDurationSeconds: sourceDuration,
    outputDurationSeconds: outputDuration,
    durationToleranceSeconds: durationTolerance,
    durationMatches,
    dynamicFeatures,
    sourceFlatLike,
    zeroLagCorrelation,
    bestCorrelation,
    bestLagSeconds,
    allowedLagSeconds,
    minimumDynamicCorrelation,
    staticSimilarity,
    staticFeatureSimilarity,
    featureStats: stats,
    minimumStaticSimilarity: dynamicFeatures.length >= 2 ? minimumStaticSimilarity : minimumFlatSimilarity,
    matchMode: dynamicMatch ? "dynamic-correlation" : flatMatch ? "flat-spectral-proxy" : "none",
  };
}

async function decodeReleaseAudioFingerprint(filePath, { signal } = {}) {
  const decoded = await execFile("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-err_detect", "explode",
    "-i", filePath,
    "-map", "0:a:0", "-vn", "-sn", "-dn",
    "-ac", "1", "-ar", "8000", "-f", "s16le", "pipe:1",
  ], { encoding: null, maxBuffer: 128 * 1024 * 1024, signal });
  return releaseAudioFingerprint(decoded.stdout, { sampleRate: 8_000, analysisFps: 50 });
}

function releasePosterPixelEvidence(output = "") {
  const values = Object.fromEntries([...String(output).matchAll(/lavfi\.signalstats\.([A-Z]+)=(-?[0-9.]+)/gu)]
    .map((match) => [match[1], Number(match[2])]));
  const ranges = [values.YMAX - values.YMIN, values.UMAX - values.UMIN, values.VMAX - values.VMIN].filter(Number.isFinite);
  return {
    measured: Number.isFinite(values.YMIN) && Number.isFinite(values.YMAX),
    visible: Number.isFinite(values.YMAX) && values.YMAX > 24,
    nonFlat: ranges.some((value) => value >= 2),
    lumaMin: Number.isFinite(values.YMIN) ? values.YMIN : null,
    lumaMax: Number.isFinite(values.YMAX) ? values.YMAX : null,
    maximumRange: ranges.length ? Math.max(...ranges) : null,
  };
}

export async function probeSongCardRelease(masterPath, posterPath, expectedDuration = 0, {
  signal,
  sourceMasterPath = "",
  sourceMasterSha256 = "",
  compositionContracts = {},
  afterSourceMasterPredecodeProof = null,
  outputProfile = undefined,
} = {}) {
  throwIfAborted(signal);
  const releaseOutputProfile = resolveEchoOutputProfile(outputProfile);
  if (!text(sourceMasterPath)) {
    throw localRendererError("local_release_audio_lineage_source_missing", "The authoritative source master is unavailable for final output-audio comparison.", 409, { stage: "release-qa" });
  }
  const suppliedSourceMasterSha256 = text(sourceMasterSha256);
  const normalizedExpectedSourceMasterSha256 = normalizedContentSha256(suppliedSourceMasterSha256);
  if (suppliedSourceMasterSha256 && !normalizedExpectedSourceMasterSha256) {
    throw sourceInputChangedError({
      stage: "release-qa",
      inputRole: "master",
      filePath: sourceMasterPath,
      expectedContentSha256: suppliedSourceMasterSha256,
      reason: "expected-content-hash-invalid",
    });
  }
  const sourceMasterBeforeDecode = await stableSourceContentProof(sourceMasterPath, {
    signal,
    stage: "release-qa",
    inputRole: "master",
    expectedContentSha256: normalizedExpectedSourceMasterSha256,
  });
  const authoritativeSourceMasterSha256 = normalizedExpectedSourceMasterSha256 || sourceMasterBeforeDecode.contentSha256;
  if (typeof afterSourceMasterPredecodeProof === "function") {
    await afterSourceMasterPredecodeProof(structuredClone(sourceMasterBeforeDecode));
    throwIfAborted(signal);
  }
  const { stdout } = await execFile("ffprobe", [
    "-v", "error",
    "-count_frames",
    "-show_frames",
    "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,duration,duration_ts,time_base,avg_frame_rate,r_frame_rate,nb_frames,nb_read_frames,start_time:frame=media_type,best_effort_timestamp_time,pkt_duration_time",
    "-of", "json",
    masterPath,
  ], { maxBuffer: 32 * 1024 * 1024, signal });
  const releaseProbe = JSON.parse(stdout || "{}");
  const streamInspection = inspectSongCardReleaseStreams(releaseProbe, expectedDuration);
  const { video, audio, duration, videoDuration, audioDuration, tolerance } = streamInspection;
  if (!streamInspection.ok) {
    throw localRendererError("local_release_decode_failed", "The finished master did not pass full audio/video duration verification.", 409, {
      hasVideo: Boolean(video), hasAudio: Boolean(audio), duration, videoDuration, audioDuration, expectedDuration, tolerance,
      videoStartSeconds: streamInspection.videoStartSeconds,
      audioStartSeconds: streamInspection.audioStartSeconds,
      startToleranceSeconds: streamInspection.startToleranceSeconds,
      startMismatch: streamInspection.startMismatch,
    });
  }
  const videoProfile = inspectSongCardReleaseVideoProfile(releaseProbe, expectedDuration, {
    expectedWidth: releaseOutputProfile.width,
    expectedHeight: releaseOutputProfile.height,
    expectedFps: releaseOutputProfile.fps,
  });
  if (!videoProfile.ok) {
    throw localRendererError("local_release_video_profile_failed", "The finished master does not match the selected output profile's dimensions, frame rate, and full frame budget.", 409, { stage: "release-qa", outputProfile: releaseOutputProfile, videoProfile });
  }
  const frameCadence = inspectSongCardReleaseFrameCadence(releaseProbe, expectedDuration, {
    expectedFps: releaseOutputProfile.fps,
  });
  if (!frameCadence.ok) {
    throw localRendererError("local_release_video_cadence_failed", "The finished master does not maintain the selected output profile's frame-accurate timing from beginning to end.", 409, { stage: "release-qa", outputProfile: releaseOutputProfile, frameCadence });
  }
  const decoded = await execFile("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "info", "-xerror",
    "-i", masterPath,
    "-filter_complex", "[0:v:0]blackdetect=d=0.5:pix_th=0.03,freezedetect=n=-55dB:d=1.5[v];[0:a:0]silencedetect=n=-60dB:d=0.25,volumedetect[a]",
    "-map", "[v]", "-map", "[a]",
    "-f", "null", "-",
  ], { maxBuffer: 16 * 1024 * 1024, signal });
  const composition = inspectSongCardReleaseCompositionLog(decoded.stderr, duration, {
    silenceScanExecuted: true,
    intentionalBlackoutSpans: compositionContracts?.intentionalBlackoutSpans,
    intentionalFreezeSpans: compositionContracts?.intentionalFreezeSpans,
  });
  if (!composition.ok) {
    throw localRendererError("local_release_composition_failed", "The finished master contains prolonged blank/frozen output or missing audio signal.", 409, { stage: "release-qa", composition });
  }
  const [sourceFingerprint, outputFingerprint] = await Promise.all([
    decodeReleaseAudioFingerprint(sourceMasterPath, { signal }),
    decodeReleaseAudioFingerprint(masterPath, { signal }),
  ]);
  const sourceMasterAfterDecode = await stableSourceContentProof(sourceMasterPath, {
    signal,
    stage: "release-qa",
    inputRole: "master",
    expectedContentSha256: authoritativeSourceMasterSha256,
    expectedStatIdentity: sourceMasterBeforeDecode.statIdentity,
  });
  const audioLineage = {
    ...inspectSongCardReleaseAudioLineage(sourceFingerprint, outputFingerprint),
    sourceMasterSha256: authoritativeSourceMasterSha256,
    sourceMasterBeforeDecode,
    sourceMasterAfterDecode,
  };
  if (!audioLineage.ok) {
    throw localRendererError("local_release_audio_lineage_failed", "The finished video audio does not match the authoritative song master closely enough to mint safely.", 409, { stage: "release-qa", audioLineage });
  }
  throwIfAborted(signal);
  const posterProbe = await execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_type", "-of", "json", posterPath], { maxBuffer: 2 * 1024 * 1024, signal });
  const poster = JSON.parse(posterProbe.stdout || "{}").streams?.[0];
  if (!poster || !(Number(poster.width) > 0) || !(Number(poster.height) > 0)) {
    throw localRendererError("local_release_poster_failed", "The finished poster did not decode as an image.");
  }
  let posterDecode;
  try {
    posterDecode = await execFile("ffmpeg", [
      "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-err_detect", "explode",
      "-i", posterPath,
      "-vf", "signalstats,metadata=print:file=-",
      "-frames:v", "1", "-f", "null", "-",
    ], { maxBuffer: 8 * 1024 * 1024, signal });
  } catch (error) {
    throw localRendererError("local_release_poster_decode_failed", "The finished poster reports dimensions but cannot fully decode without errors.", 409, { stage: "release-qa", decoderMessage: text(error?.stderr || error?.message).replace(/\s+/gu, " ").slice(0, 500) });
  }
  const posterPixels = releasePosterPixelEvidence(`${posterDecode.stdout || ""}\n${posterDecode.stderr || ""}`);
  if (Number(poster.width) < 320 || Number(poster.height) < 180 || !posterPixels.measured || !posterPixels.visible || !posterPixels.nonFlat) {
    throw localRendererError("local_release_poster_visual_failed", "The finished poster is too small, blank, flat, or lacks decoded pixel evidence.", 409, { stage: "release-qa", poster: { width: Number(poster.width), height: Number(poster.height), pixels: posterPixels } });
  }
  return {
    executionStatus: "executed",
    status: "passed",
    ok: true,
    checks: ["full-master-video-decode", "full-master-audio-decode", "duration-and-stream-origin-match", "output-profile-dimensions-fps-frame-budget", "decoded-frame-cadence", "prolonged-black-freeze-scan", "output-audio-active-coverage", "source-output-audio-lineage", "poster-strict-full-frame-decode", "poster-visible-nonflat-pixels", "renderer-truth"],
    durationSeconds: duration,
    expectedDurationSeconds: Number(expectedDuration || 0),
    outputProfile: releaseOutputProfile,
    outputProfileCacheKey: echoOutputProfileCacheKey(releaseOutputProfile),
    video: { codec: video.codec_name || null, width: Number(video.width || 0), height: Number(video.height || 0), durationSeconds: videoDuration },
    audio: { codec: audio.codec_name || null, durationSeconds: audioDuration },
    poster: { width: Number(poster.width), height: Number(poster.height), pixels: posterPixels },
    videoProfile,
    frameCadence,
    composition,
    audioLineage,
  };
}

async function defaultPipeline({
  project,
  showGraph,
  sourceResolutionProject = project,
  proxyRegistrySource = null,
  sourceSnapshotManifest = null,
  outputDirectory,
  masterPath,
  expectedProxyRegistrySha256 = "",
  report,
  signal,
  registerProcess,
}) {
  throwIfAborted(signal);
  const outputProfile = resolveSongCardRenderOutputProfile({ project, showGraph });
  loadLocalRenderProbeCaches();
  const inspection = inspectSongCardLocalRenderer();
  if (!inspection.available) throw localRendererError("local_renderer_unavailable", inspection.reason, 503, { missing: inspection.missing });
  const inputDirectory = path.join(outputDirectory, "inputs");
  const packageDirectory = path.join(outputDirectory, "hyperframes-show");
  const qaDirectory = path.join(outputDirectory, "qa");
  const renderDirectory = path.join(outputDirectory, "renders");
  await Promise.all([inputDirectory, packageDirectory, qaDirectory, renderDirectory].map((directory) => fsp.mkdir(directory, { recursive: true, mode: 0o700 })));
  const graphPath = path.join(inputDirectory, "show-graph.json");
  const analyzedGraphPath = path.join(inputDirectory, "show-graph-with-telemetry.json");
  const projectPath = path.join(inputDirectory, "project.json");
  const sourceResolutionProjectPath = path.join(inputDirectory, "source-resolution-project.json");
  const canonicalProxyRegistryPath = path.join(inputDirectory, "proxy-registry.canonical.json");
  const telemetryPath = path.join(inputDirectory, "stem-telemetry.json");
  const signalGraphPreflight = preflightSongCardSignalGraph({ project, showGraph });
  await writeJson(path.join(inputDirectory, "signal-graph-preflight.json"), signalGraphPreflight);
  if (!signalGraphPreflight.ok) throw createSongCardSignalGraphError(signalGraphPreflight);
  await Promise.all([
    writeJson(graphPath, filteredStemGraph(showGraph, masterPath)),
    writeJson(projectPath, project),
    writeJson(sourceResolutionProjectPath, sourceResolutionProject || project),
  ]);

  throwIfAborted(signal);
  report("audio-input-preflight", 7, "Fully decoding the master and every selected stem before analysis or rendering.");
  const audioInputPreflight = await preflightRenderAudioInputs({
    ...renderAudioInputsFromShowGraph({
      masterPath,
      showGraph,
      stemTelemetryBindings: deriveRequiredStemTelemetryBindings({ showGraph }),
    }),
    expectedDurationSeconds: Number(showGraph?.song?.durationSeconds || 0),
  }, { concurrency: 2, root: ROOT, signal });
  await writeJson(path.join(inputDirectory, "audio-input-preflight.json"), audioInputPreflight);
  try { writeRenderAudioInputPreflightCache(AUDIO_PROBE_CACHE_PATH); } catch { /* Cache persistence never weakens fresh evidence. */ }
  if (!audioInputPreflight.ok) throw createSongCardAudioInputPreflightError(audioInputPreflight);

  throwIfAborted(signal);
  report("media-preflight", 9, "Checking every real media cue before analysis or rendering.");
  const mediaPreflight = preflightSongCardLocalMedia({ project, showGraph, root: ROOT, projectPath: sourceResolutionProjectPath });
  await writeJson(path.join(inputDirectory, "media-preflight.json"), mediaPreflight);
  if (!mediaPreflight.ok) throw createSongCardMediaPreflightError(mediaPreflight);

  throwIfAborted(signal);
  report("visual-media-preflight", 10, "Fully decoding each unique video and checking alpha-aware visibility samples for every visual input.");
  const visualMediaPreflight = await preflightResolvedVisualMedia(mediaPreflight, {
    concurrency: 4,
    signal,
    onProgress: (progress) => report("visual-media-preflight", 10, `Verifying visual input ${Number(progress.inputIndex || 0) + 1} of ${Number(progress.inputCount || 0)} (${progress.stage}).`, progress),
  });
  await writeJson(path.join(inputDirectory, "visual-media-decode-preflight.json"), visualMediaPreflight);
  await writeRenderVisualMediaProbeCache(VISUAL_PROBE_CACHE_PATH).catch(() => {});
  if (!visualMediaPreflight.ok) throw createDecodedInputPreflightError(visualMediaPreflight, { kind: "visual-media" });

  throwIfAborted(signal);
  report("render-readiness", 11, "Checking exact shader routes, stem semantics, overlaps, and proxy hashes.");
  const originalProxyRegistry = loadSongCardProxyRegistry();
  assertProxyRegistryIdentity(originalProxyRegistry, expectedProxyRegistrySha256);
  const proxyRegistry = canonicalizeSongCardProxyRegistry(
    proxyRegistrySource || originalProxyRegistry.registry,
    sourceSnapshotManifest || {},
  );
  await writeJson(canonicalProxyRegistryPath, proxyRegistry);
  const canonicalProxyRegistrySha256 = `sha256:${await sha256File(canonicalProxyRegistryPath)}`;
  const renderReadiness = preflightSongCardRenderReadiness({
    project,
    showGraph,
    proxyRegistry,
    proxyRegistryPath: canonicalProxyRegistryPath,
    root: ROOT,
    projectPath,
    signalGraphPreflight,
    mediaPreflight,
  });
  await writeJson(path.join(inputDirectory, "render-readiness.json"), renderReadiness);
  if (!renderReadiness.ok) throw createSongCardRenderReadinessError(renderReadiness);
  report("proxy-atlas-preflight", 12, "Decoding every unique shader atlas and checking its dimensions and pixel range.");
  const proxyAtlasPreflight = await preflightProxyAtlasImages(renderReadiness, {
    concurrency: 4,
    signal,
    onProgress: (progress) => report("proxy-atlas-preflight", 12, `Verifying shader atlas ${Number(progress.inputIndex || 0) + 1} of ${Number(progress.inputCount || 0)} (${progress.stage}).`, progress),
  });
  await writeJson(path.join(inputDirectory, "proxy-atlas-preflight.json"), proxyAtlasPreflight);
  await writeRenderVisualMediaProbeCache(VISUAL_PROBE_CACHE_PATH).catch(() => {});
  if (!proxyAtlasPreflight.ok) throw createDecodedInputPreflightError(proxyAtlasPreflight, { kind: "proxy-atlas" });

  report("stem-analysis", 14, "Analyzing the verified local stems.");
  await execFile(process.env.HAPA_PYTHON || "python3", [
    path.join(ROOT, "scripts/build-stem-telemetry-bundle.py"),
    "--graph", graphPath,
    "--master", masterPath,
    "--output", telemetryPath,
    "--graph-output", analyzedGraphPath,
  ], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, signal });

  throwIfAborted(signal);
  report("stem-telemetry-preflight", 20, "Verifying real stem frames, duration coverage, signal variation, and every shader-to-stem binding.");
  const telemetry = await readJson(telemetryPath);
  const stemTelemetryPreflight = preflightStemTelemetryBundle({
    telemetry,
    showGraph,
    expectedDurationSeconds: Number(showGraph?.song?.durationSeconds || 0),
    expectedMasterPath: masterPath,
    expectedMasterSha256: `sha256:${await sha256File(masterPath)}`,
    expectedStemSources: audioInputPreflight.entries
      .filter((entry) => entry.kind === "stem" && entry.ok === true)
      .map((entry) => ({ role: entry.role, path: entry.path, sha256: entry.contentSha256 })),
  });
  await writeJson(path.join(inputDirectory, "stem-telemetry-preflight.json"), stemTelemetryPreflight);
  if (!stemTelemetryPreflight.ok) throw createStemTelemetryPreflightError(stemTelemetryPreflight);

  throwIfAborted(signal);
  report("compile", 24, "Compiling the exact selected cut into an offline HyperFrames show.");
  const compilerReportPath = path.join(packageDirectory, "compiler-report.json");
  await fsp.rm(compilerReportPath, { force: true });
  let compileProcessError = null;
  try {
    await execFile(process.execPath, [
      path.join(ROOT, "scripts/compile-hyperframes-show-v2.mjs"),
      `--graph=${analyzedGraphPath}`,
      `--telemetry=${telemetryPath}`,
      `--project=${projectPath}`,
      `--source-project-path=${sourceResolutionProjectPath}`,
      `--proxy-registry=${canonicalProxyRegistryPath}`,
      `--output=${packageDirectory}`,
      `--audio=${masterPath}`,
    ], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024, signal });
  } catch (error) {
    if (signal?.aborted) throw abortError(signal);
    compileProcessError = error;
  }
  const compilerReport = await readJson(compilerReportPath).catch(() => null);
  if (compilerReport?.ok !== true && compilerReport) {
    throw createSongCardCompilerError(compilerReport, { cause: compileProcessError, reportPath: compilerReportPath });
  }
  if (compileProcessError) {
    throw localRendererError(
      "local_compile_process_failed",
      "Offline show compilation stopped before it could produce a validation report. The final MP4 did not start.",
      500,
      {
        stage: "compile",
        exitCode: Number.isInteger(compileProcessError?.code) ? compileProcessError.code : null,
        signal: text(compileProcessError?.signal) || null,
        reportPath: compilerReportPath,
      },
    );
  }
  if (compilerReport?.ok !== true || compilerReport?.validation?.showcaseReady !== true) {
    throw createSongCardCompilerError(compilerReport, { reportPath: compilerReportPath });
  }
  if (expectedProxyRegistrySha256) {
    const executableShow = await readJson(path.join(packageDirectory, "executable-show.json"));
    const compiledRegistrySha256 = text(executableShow?.packaging?.proxyRegistrySha256);
    if (compiledRegistrySha256 !== canonicalProxyRegistrySha256) {
      throw localRendererError(
        "local_proxy_registry_changed_during_compile",
        "The canonical shader proxy snapshot changed while the offline show was compiling. Retry to rebuild from one consistent registry version.",
        409,
        {
          stage: "compile",
          expectedContentSha256: canonicalProxyRegistrySha256,
          observedContentSha256: compiledRegistrySha256 || null,
        },
      );
    }
    assertProxyRegistryIdentity(loadSongCardProxyRegistry(), expectedProxyRegistrySha256, "compile");
  }

  const requestedVisualizerCueCount = visualizerCards(showGraph).length;
  const pixelReportPath = path.join(qaDirectory, "pixel-capture-report.json");
  await fsp.rm(pixelReportPath, { force: true });
  let pixelReport;
  if (requestedVisualizerCueCount === 0) {
    report("pixel-qa", 34, "No shader cues were requested; pixel verification is not applicable.");
    pixelReport = {
      schemaVersion: "hapa.hyperframes.pixel-capture.v2",
      status: "not-applicable",
      reason: "selected-cut-has-no-visualizer-cues",
      ok: true,
      functionalOk: true,
      frames: [],
      acceptance: { notApplicable: true },
      offline: { networkAttemptCount: 0 },
      consoleSummary: { errorCount: 0 },
    };
    await writeJson(pixelReportPath, pixelReport);
  } else {
    report("pixel-qa", 34, "Sampling real rendered pixels for every shader cue.");
    const electronPath = path.join(ROOT, "node_modules/.bin/electron");
    let pixelProcessError = null;
    try {
      await runPixelQaCapture(electronPath, [
        path.join(ROOT, "scripts/hyperframes-pixel-capture.cjs"),
        `--project=${packageDirectory}`,
        `--output=${qaDirectory}`,
      ], { cwd: ROOT, report, signal, registerProcess });
    } catch (error) {
      if (signal?.aborted) throw abortError(signal);
      pixelProcessError = error;
    }
    const capturedPixelReport = await readJson(pixelReportPath).catch(() => null);
    if (!capturedPixelReport) {
      throw localRendererError(
        "local_pixel_qa_process_failed",
        "Shader verification stopped before it produced a diagnostic report. The final MP4 did not start.",
        500,
        {
          stage: "pixel-qa",
          exitCode: Number.isInteger(pixelProcessError?.code) ? pixelProcessError.code : null,
          signal: text(pixelProcessError?.signal) || null,
        },
      );
    }
    pixelReport = reevaluateSongCardPixelReport(capturedPixelReport);
    await writeJson(pixelReportPath, pixelReport);
    if (pixelReport.ok !== true) throw createSongCardPixelQaError(pixelReport, { cause: pixelProcessError, reportPath: pixelReportPath });
    if (pixelProcessError) {
      throw localRendererError(
        "local_pixel_qa_process_failed",
        "Shader verification produced frames but its capture process did not finish cleanly. The final MP4 did not start.",
        500,
        {
          stage: "pixel-qa",
          exitCode: Number.isInteger(pixelProcessError?.code) ? pixelProcessError.code : null,
          signal: text(pixelProcessError?.signal) || null,
          reportPath: pixelReportPath,
        },
      );
    }
  }
  const rendererTruth = executedRendererTruth(showGraph, compilerReport, pixelReport);

  const renderedMasterPath = path.join(renderDirectory, "master.mp4");
  report("render", 40, "Rendering the final MP4 locally. This is the long step.");
  try {
    await runHyperFramesRender([
      path.join(ROOT, "scripts/run-local-hyperframes.mjs"),
      "render",
      `--output=${renderedMasterPath}`,
      `--fps=${outputProfile.fps}`,
      `--resolution=${hyperFramesResolutionForOutputProfile(outputProfile)}`,
      "--quality=high",
      "--strict",
      "--workers=1",
      "--low-memory-mode",
      "--browser-timeout=180",
      "--protocol-timeout=600000",
      "--player-ready-timeout=180000",
      packageDirectory,
    ], { cwd: ROOT, report, signal, registerProcess });
  } catch (error) {
    if (signal?.aborted) throw abortError(signal);
    throw localRendererError("local_hyperframes_render_failed", summarizeHyperFramesFailure(error), 500);
  }

  const posterPath = path.join(renderDirectory, "poster.jpg");
  report("poster", 88, "Creating the immutable Edition poster.");
  await execFile("ffmpeg", [
    "-hide_banner", "-loglevel", "error", "-y",
    "-i", renderedMasterPath,
    "-an", "-vf", "thumbnail=90,scale='min(1280,iw)':-2",
    "-frames:v", "1", "-q:v", "2",
    posterPath,
  ], { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, signal });
  return { masterPath: renderedMasterPath, posterPath, compilerReport, pixelReport, rendererTruth, outputProfile };
}

function publicJob(job) {
  if (!job) return null;
  const { promise: _promise, outputDirectory: _outputDirectory, ...row } = job;
  return structuredClone(row);
}

export function createSongCardLocalRenderBridge({
  root,
  controller,
  remintStore,
  resolveRegistryMaster = null,
  certifyStart = null,
  pipeline = defaultPipeline,
  clock = () => new Date(),
  certificationHeartbeatMs = 5_000,
} = {}) {
  if (!root || !controller || !remintStore) throw new Error("Local Song Card renderer requires root, controller, and remintStore");
  const requiresStartCertification = pipeline === defaultPipeline;
  if (requiresStartCertification && typeof certifyStart !== "function") {
    throw localRendererError(
      "local_render_start_certifier_required",
      "The production Song Card renderer cannot start without the exact-plan certification gate.",
      500,
      { stage: "render-start-certification" },
    );
  }
  const jobs = new Map();
  const runtimes = new Map();
  const preparations = new Map();
  const renderRoot = path.join(path.resolve(controller.managedRenderRoot || root), ".local-render-work");

  const publish = (candidateId, patch) => {
    const current = jobs.get(candidateId) || {
      schemaVersion: LOCAL_JOB_SCHEMA,
      candidateId,
      status: "queued",
      stage: "queued",
      percent: 0,
      message: "Queued for Builder-managed local rendering.",
      startedAt: clock().toISOString(),
      updatedAt: clock().toISOString(),
    };
    const next = { ...current, ...patch, updatedAt: clock().toISOString() };
    jobs.set(candidateId, next);
    return next;
  };

  async function resolveMaster(candidate, storedPlan) {
    return resolveSongCardMasterAudio({ songId: candidate.songId, storedPlan, resolveRegistryMaster });
  }

  async function recordPreclaimFailure(candidateId, failure, { cancelled = false } = {}) {
    const body = {
      ok: false,
      cancelled,
      message: failure.message,
      failure,
      retryable: failure.retryable,
      requiresExplicitRetry: !cancelled,
    };
    if (typeof remintStore.recordPreclaimFailure === "function") {
      return remintStore.recordPreclaimFailure(candidateId, body);
    }
    const view = await remintStore.view();
    const candidate = view.candidates.find((row) => row.id === candidateId);
    const job = candidate?.jobs?.find((row) => ["queued", "running", "awaiting-approval"].includes(row.status))
      || candidate?.jobs?.find((row) => !["done", "cached", "cancelled"].includes(row.status));
    if (!job || typeof remintStore.recordResult !== "function") {
      throw new Error(`Remint candidate ${candidateId} has no durable job available for its pre-claim failure`);
    }
    return remintStore.recordResult(candidateId, job.id, body);
  }

  async function runCandidate(candidateId, runtime) {
    let currentWork = null;
    let checkpointPathForFreshness = "";
    const started = Date.now();
    const { signal } = runtime.controller;
    try {
      throwIfAborted(signal);
      const initialView = await remintStore.view();
      const initial = initialView.candidates.find((row) => row.id === candidateId);
      if (!initial) throw localRendererError("local_render_candidate_missing", "The selected render candidate no longer exists.", 404);
      const startCertification = runtime.startCertification || null;
      if (startCertification && (
        text(startCertification.candidateId) !== candidateId
        || text(startCertification.planId) !== text(initial.planId)
      )) {
        throw localRendererError(
          "local_render_start_certificate_mismatch",
          "The render-start certificate belongs to a different candidate or saved plan.",
          409,
          { stage: "render-start-certification", candidateId, planId: initial.planId },
        );
      }
      const assertStartCertificationFresh = async (stage) => {
        throwIfAborted(signal);
        if (typeof startCertification?.assertFresh !== "function") {
          if (requiresStartCertification) {
            throw localRendererError(
              "local_render_start_certificate_incomplete",
              "The production render-start certificate cannot be refreshed while this job is running.",
              409,
              { stage, candidateId, planId: initial.planId },
            );
          }
          return true;
        }
        try {
          await startCertification.assertFresh({ stage, candidateId, planId: initial.planId });
        } catch (error) {
          if (checkpointPathForFreshness) {
            await fsp.rm(checkpointPathForFreshness, { force: true }).catch(() => {});
          }
          throw error;
        }
        throwIfAborted(signal);
        return true;
      };
      await assertStartCertificationFresh("before-source-preflight");
      const storedPlan = startCertification?.storedPlan
        ? structuredClone(startCertification.storedPlan)
        : await controller.getPlan(initial.planId);
      if (text(storedPlan?.planId) !== text(initial.planId)) {
        throw localRendererError(
          "local_render_start_plan_changed",
          "The saved render plan changed after certification. Retry to certify the current plan.",
          409,
          { stage: "render-start-certification", expectedPlanId: initial.planId, observedPlanId: storedPlan?.planId || null },
        );
      }
      const project = structuredClone(startCertification?.project || storedPlan.input?.project || {});
      let showGraph = structuredClone(startCertification?.showGraph || storedPlan.input?.showGraph || {});
      if (!Array.isArray(showGraph.tracks)) throw localRendererError("local_render_show_graph_missing", "The exact saved Show Graph is missing from this mint plan.");
      const masterPath = await resolveMaster(initial, storedPlan);
      const initialMasterProof = await stableSourceContentProof(masterPath, {
        signal,
        stage: "checkpoint-input-preflight",
        inputRole: "master",
      });
      const sourceMasterSha256 = initialMasterProof.contentSha256;
      const rendererBuildIdentity = await inspectSongCardRendererBuildIdentity({ root: ROOT, strict: true });
      if (
        text(startCertification?.rendererBuildSha256)
        && text(startCertification.rendererBuildSha256) !== text(rendererBuildIdentity.sha256)
      ) {
        throw localRendererError(
          "local_renderer_build_changed_after_start_certification",
          "The local renderer changed immediately after the render-start certificate was issued. Retry after the current build is stable.",
          409,
          {
            stage: "render-start-certification",
            expectedRendererBuildSha256: startCertification.rendererBuildSha256,
            observedRendererBuildSha256: rendererBuildIdentity.sha256,
          },
        );
      }
      let sourceInputPreflight = null;
      if (pipeline === defaultPipeline) {
        publish(candidateId, {
          status: "rendering",
          stage: "checkpoint-input-preflight",
          percent: 3,
          message: "Revalidating every master, stem, visual, shader atlas, and coverage window before checkpoint reuse.",
        });
        sourceInputPreflight = await preflightSongCardLocalSourceInputs({ project, showGraph, masterPath, signal });
        showGraph = structuredClone(sourceInputPreflight.executionShowGraph || showGraph);
      } else {
        const sourceResolutionProjectPath = path.join(ROOT, "data", "music-video-projects", "selected-project.json");
        const additionalSources = collectSongCardExecutionSources([
          { inputRole: "project-source", value: project },
          { inputRole: "show-graph-source", value: showGraph },
        ], { root: ROOT, projectPath: sourceResolutionProjectPath });
        const sourceSnapshotManifest = await buildSongCardSourceSnapshotManifest({
          audio: { entries: [{ ok: true, kind: "master", role: "master", path: masterPath, contentSha256: sourceMasterSha256 }] },
          additionalSources,
          signal,
        });
        sourceInputPreflight = {
          sourceResolutionProject: structuredClone(project),
          sourceResolutionProjectPath,
          sourceSnapshotManifest,
          identity: { sha256: sourceSnapshotManifest.sha256, sourceSnapshotManifestSha256: sourceSnapshotManifest.sha256 },
        };
      }
      const sourceSnapshotManifest = sourceInputPreflight.sourceSnapshotManifest;
      const manifestMaster = (sourceSnapshotManifest?.entries || []).find((entry) => (
        entry?.inputRole === "master" || entry?.inputRoles?.includes?.("master")
      ));
      if (!manifestMaster || manifestMaster.contentSha256 !== sourceMasterSha256) {
        throw sourceInputChangedError({
          stage: "checkpoint-input-preflight",
          inputRole: "master",
          filePath: masterPath,
          expectedContentSha256: sourceMasterSha256,
          observedContentSha256: manifestMaster?.contentSha256,
          expectedStatIdentity: initialMasterProof.statIdentity,
          observedStatIdentity: manifestMaster?.statIdentity,
          reason: manifestMaster ? "changed-during-input-preflight" : "master-missing-from-source-manifest",
        });
      }
      const canonicalizationOptions = {
        root: ROOT,
        projectPath: sourceInputPreflight?.sourceResolutionProjectPath || path.join(ROOT, "data", "music-video-projects", "selected-project.json"),
      };
      const executionProject = canonicalizeSongCardExecutionValue(project, sourceSnapshotManifest, canonicalizationOptions);
      const canonicalizedShowGraph = canonicalizeSongCardExecutionValue(showGraph, sourceSnapshotManifest, canonicalizationOptions);
      const executionShowGraph = reidentifyEchoCompiledShowGraph(canonicalizedShowGraph);
      const executionGraphValidation = validateEchoCompiledShowGraph({ project, graph: executionShowGraph });
      if (!executionGraphValidation.ok) {
        throw localRendererError(
          "local_render_execution_graph_invalid",
          `The exact canonicalized execution graph failed its compiled identity contract: ${executionGraphValidation.reasons.join(", ")}.`,
          409,
          { validation: executionGraphValidation },
        );
      }
      showGraph = executionShowGraph;
      const executionStoredPlan = canonicalizeSongCardExecutionValue(storedPlan, sourceSnapshotManifest, canonicalizationOptions);
      if (executionStoredPlan?.input && typeof executionStoredPlan.input === "object") {
        executionStoredPlan.input.showGraph = structuredClone(executionShowGraph);
        executionStoredPlan.input.stemBindingRepair = structuredClone(sourceInputPreflight?.stemBindingRepair || null);
      }
      const executionSourceResolutionProject = canonicalizeSongCardExecutionValue(
        sourceInputPreflight?.sourceResolutionProject || project,
        sourceSnapshotManifest,
        canonicalizationOptions,
      );
      const executionProxyRegistry = sourceInputPreflight?.proxyRegistry
        ? canonicalizeSongCardProxyRegistry(sourceInputPreflight.proxyRegistry, sourceSnapshotManifest)
        : null;
      const executionMasterPath = manifestMaster.path;
      const outputProfile = resolveSongCardRenderOutputProfile({
        project: executionProject,
        showGraph: executionShowGraph,
      });
      const outputProfileCacheKey = echoOutputProfileCacheKey(outputProfile);
      const declaredStartCertificateSha256 = text(startCertification?.summary?.certificateSha256).toLowerCase();
      const startCertificateSha256 = declaredStartCertificateSha256 || `sha256:${sha256Bytes(JSON.stringify({
        schemaVersion: "hapa.song-card.local-render-injected-certificate.v1",
        candidateId,
        candidateFingerprint: initial.fingerprint || null,
        planId: initial.planId,
        sourceRevision: storedPlan.sourceRevision || null,
        summary: startCertification?.summary || null,
      }))}`;
      const identity = {
        candidateId,
        planId: initial.planId,
        sourceRevision: storedPlan.sourceRevision || null,
        startCertificateSha256,
        renderGateVersion: LOCAL_RENDER_GATE_VERSION,
        rendererBuildSchema: rendererBuildIdentity.schemaVersion,
        rendererBuildSha256: rendererBuildIdentity.sha256,
        pipelineSha256: `sha256:${sha256Bytes(pipeline === defaultPipeline ? "default-hyperframes-pipeline" : Function.prototype.toString.call(pipeline))}`,
        outputProfile,
        outputProfileCacheKey,
        projectSha256: `sha256:${sha256Bytes(JSON.stringify(project))}`,
        showGraphSha256: `sha256:${sha256Bytes(JSON.stringify(executionShowGraph))}`,
        sourceMasterSha256,
        inputPreflightSha256: sourceInputPreflight?.identity?.sha256 || null,
        sourceSnapshotManifestSha256: sourceSnapshotManifest?.sha256 || null,
      };
      const identitySha256 = `sha256:${sha256Bytes(JSON.stringify(identity))}`;
      const fingerprint = identitySha256.replace(/^sha256:/u, "");
      const outputDirectory = path.join(renderRoot, safeSegment(initial.songId), fingerprint.slice(0, 32));
      await fsp.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
      const checkpointPath = path.join(outputDirectory, "local-render-checkpoint.json");
      checkpointPathForFreshness = checkpointPath;
      await assertStartCertificationFresh("before-source-snapshot-persistence");
      await atomicJson(path.join(outputDirectory, "source-input-snapshot.json"), sourceSnapshotManifest);
      let checkpoint = await readLocalCheckpoint(checkpointPath, { identitySha256, outputDirectory });
      const artifacts = { pipeline: null, qa: null, rendererTruth: null };
      if (checkpoint) {
        artifacts.pipeline = {
          masterPath: checkpoint.pipeline.master.path,
          posterPath: checkpoint.pipeline.poster.path,
        };
        artifacts.rendererTruth = checkpoint.rendererTruth;
        artifacts.qa = checkpoint.qa?.ok === true ? checkpoint.qa : null;
      }

      const persistCheckpoint = async (stage) => {
        await assertStartCertificationFresh(`before-${stage}-checkpoint-persistence`);
        checkpoint = {
          schemaVersion: LOCAL_CHECKPOINT_SCHEMA,
          identity,
          identitySha256,
          outputProfile,
          sourceSnapshotManifest,
          pipeline: checkpoint?.pipeline || null,
          rendererTruth: artifacts.rendererTruth,
          qa: artifacts.qa,
          createdAt: checkpoint?.createdAt || clock().toISOString(),
          updatedAt: clock().toISOString(),
        };
        await atomicJson(checkpointPath, checkpoint);
      };

      const assertRendererBuildUnchanged = async (stage) => {
        const currentBuildIdentity = await inspectSongCardRendererBuildIdentity({ root: ROOT });
        if (currentBuildIdentity.sha256 === rendererBuildIdentity.sha256) return;
        throw localRendererError(
          "local_renderer_build_changed_during_render",
          "The local renderer or one of its finishing tools changed during this job. Retry to rebuild with one consistent renderer version.",
          409,
          {
            stage,
            expectedRendererBuildSha256: rendererBuildIdentity.sha256,
            observedRendererBuildSha256: currentBuildIdentity.sha256,
          },
        );
      };

      const ensurePipeline = async () => {
        throwIfAborted(signal);
        if (artifacts.pipeline && artifacts.rendererTruth) {
          await assertStartCertificationFresh("before-checkpoint-reuse");
          await assertRendererBuildUnchanged("resume-check");
          return;
        }
        publish(candidateId, { status: "rendering", stage: "resume-check", percent: 8, message: "Rebuilding the verified render checkpoint before continuing." });
        await assertSongCardSourceSnapshotUnchanged(sourceSnapshotManifest, { signal, stage: "before-pipeline" });
        const currentCandidate = (await remintStore.view()).candidates.find((row) => row.id === candidateId);
        const pipelineResult = await pipeline({
          candidate: canonicalizeSongCardExecutionValue(currentCandidate, sourceSnapshotManifest, canonicalizationOptions),
          storedPlan: executionStoredPlan,
          project: executionProject,
          showGraph: executionShowGraph,
          outputProfile,
          sourceResolutionProject: executionSourceResolutionProject,
          proxyRegistrySource: executionProxyRegistry,
          sourceSnapshotManifest,
          masterPath: executionMasterPath,
          expectedProxyRegistrySha256: sourceInputPreflight?.identity?.proxyRegistrySha256 || "",
          outputDirectory,
          signal,
          registerProcess: runtime.registerProcess,
          report: (nextStage, percent, message, progress = {}) => publish(candidateId, {
            status: "rendering",
            stage: nextStage,
            percent,
            message,
            completed: Number(progress?.completed || 0),
            total: Number(progress?.total || 0),
            cueIds: Array.isArray(progress?.cueIds) ? progress.cueIds : [],
            ...structuredClone(progress || {}),
          }),
        });
        throwIfAborted(signal);
        await assertStartCertificationFresh("after-pipeline");
        await assertSongCardSourceSnapshotUnchanged(sourceSnapshotManifest, { signal, stage: "after-pipeline" });
        await assertRendererBuildUnchanged("render");
        if (!pipelineResult?.masterPath || !pipelineResult?.posterPath) throw localRendererError("local_render_artifacts_missing", "The local renderer did not produce both a master and poster.");
        if (!withinDirectory(outputDirectory, pipelineResult.masterPath) || !withinDirectory(outputDirectory, pipelineResult.posterPath)) {
          throw localRendererError("local_render_artifacts_unmanaged", "The local renderer produced artifacts outside its managed edition workspace.");
        }
        artifacts.rendererTruth = pipelineResult.rendererTruth || executedRendererTruth(showGraph, pipelineResult.compilerReport || { ok: true, visualizers: { declared: 0, exactProxy: 0, unsupported: 0 } }, pipelineResult.pixelReport || { ok: visualizerCards(showGraph).length === 0, frames: [] });
        const [master, poster] = await Promise.all([artifactProof(pipelineResult.masterPath), artifactProof(pipelineResult.posterPath)]);
        artifacts.pipeline = { ...pipelineResult, masterPath: master.path, posterPath: poster.path };
        artifacts.qa = null;
        checkpoint = { ...(checkpoint || {}), pipeline: { master, poster } };
        await persistCheckpoint("pipeline");
      };

      const ensureQa = async () => {
        await ensurePipeline();
        if (artifacts.qa?.ok === true) return;
        await assertStartCertificationFresh("before-release-qa");
        await assertSongCardSourceSnapshotUnchanged(sourceSnapshotManifest, { signal, stage: "before-qa" });
        artifacts.qa = await probeSongCardRelease(
          artifacts.pipeline.masterPath,
          artifacts.pipeline.posterPath,
          Number(showGraph.song?.durationSeconds || project.duration || 0),
          {
            signal,
            sourceMasterPath: executionMasterPath,
            sourceMasterSha256,
            compositionContracts: deriveSongCardReleaseCompositionContracts(showGraph),
            outputProfile,
          },
        );
        await assertRendererBuildUnchanged("release-qa");
        await persistCheckpoint("release-qa");
      };

      for (let iteration = 0; iteration < 32; iteration += 1) {
        throwIfAborted(signal);
        const view = await remintStore.view();
        const candidate = view.candidates.find((row) => row.id === candidateId);
        if (!candidate) throw localRendererError("local_render_candidate_missing", "The selected render candidate no longer exists.", 404);
        if (["render-ready", "ready-for-mint-review", "minted"].includes(candidate.status)) {
          publish(candidateId, { status: candidate.status, stage: candidate.status, percent: 100, message: candidate.status === "render-ready" ? "Final video verified; binding it to the mint plan." : "Local render complete.", completedAt: clock().toISOString(), durationSeconds: (Date.now() - started) / 1000 });
          return candidate;
        }
        if (["canceled", "superseded", "rejected"].includes(candidate.status)) throw localRendererError("local_render_candidate_inactive", `The render candidate is ${candidate.status}.`, 409);
        if (candidate.status === "approved") await remintStore.enqueue();
        if (candidate.status === "awaiting-approval") throw localRendererError("local_render_approval_required", "Render approval is required before local finishing can start.", 409);

        await assertStartCertificationFresh("before-job-claim");
        const claim = await remintStore.claim({
          activePlayback: false,
          candidateId,
          resultPersistenceGuard: {
            planId: initial.planId,
            candidateFingerprint: initial.fingerprint,
            startCertificateSha256,
            renderIdentitySha256: identitySha256,
          },
        });
        const work = (claim.claimed || []).find((row) => row.candidateId === candidateId);
        if (!work) {
          await new Promise((resolve) => setTimeout(resolve, 50));
          continue;
        }
        currentWork = work;
        const claimedView = await remintStore.view();
        const claimedCandidate = claimedView.candidates.find((row) => row.id === candidateId);
        const job = claimedCandidate?.jobs?.find((row) => row.id === work.jobId);
        const stage = job?.stage || "render";
        publish(candidateId, { status: "rendering", stage, percent: Math.max(2, Number(jobs.get(candidateId)?.percent || 0)), message: `Running ${stage.replace(/-/gu, " ")}…` });

        let result;
        if (stage === "hyperframes") {
          const resumed = Boolean(artifacts.pipeline && artifacts.rendererTruth);
          await ensurePipeline();
          result = { ok: true, artifacts: [{ role: "hyperframes-package", path: outputDirectory }], receipt: { stage, ok: true, executorId: EXECUTOR_ID, rendererTruth: artifacts.rendererTruth, checkpointIdentity: identitySha256, outputProfile, outputProfileCacheKey, resumed } };
        } else if (stage === "qa") {
          await ensureQa();
          publish(candidateId, { status: "rendering", stage: "release-qa", percent: 94, message: "Final audio, video, duration, poster, and shader truth passed." });
          result = { ok: true, artifacts: [{ role: "qa-report", checks: artifacts.qa.checks }], receipt: { stage, ...artifacts.qa, checkpointIdentity: identitySha256, outputProfile, outputProfileCacheKey } };
        } else if (stage === "release-export") {
          await ensureQa();
          await assertStartCertificationFresh("before-release-export");
          await assertSongCardSourceSnapshotUnchanged(sourceSnapshotManifest, { signal, stage: "before-export" });
          await assertRendererBuildUnchanged("release-export");
          const [masterSha256, posterSha256] = await Promise.all([sha256File(artifacts.pipeline.masterPath), sha256File(artifacts.pipeline.posterPath)]);
          if (`sha256:${masterSha256}` !== checkpoint?.pipeline?.master?.sha256 || `sha256:${posterSha256}` !== checkpoint?.pipeline?.poster?.sha256) {
            throw localRendererError("local_release_checkpoint_mismatch", "The rendered master or poster changed after verified QA.", 409);
          }
          const receipt = {
            ...(work.releaseReceiptContract || {}),
            executorId: EXECUTOR_ID,
            masterSha256: `sha256:${masterSha256}`,
            rendererTruth: artifacts.rendererTruth,
            qa: artifacts.qa,
            checkpointIdentity: identitySha256,
            outputProfile,
            outputProfileCacheKey,
            sourceMasterSha256,
            completedAt: clock().toISOString(),
          };
          result = {
            ok: true,
            artifacts: [
              { role: "master", path: artifacts.pipeline.masterPath, sha256: `sha256:${masterSha256}` },
              { role: "poster", path: artifacts.pipeline.posterPath, sha256: `sha256:${posterSha256}` },
            ],
            receipt,
          };
        } else {
          result = { ok: true, artifacts: [`local:${stage}:${fingerprint.slice(0, 16)}`], receipt: { stage, ok: true, executorId: EXECUTOR_ID, exactPlanId: initial.planId, outputProfile, outputProfileCacheKey } };
        }
        throwIfAborted(signal);
        if (!work.resultPersistenceGuard) {
          throw localRendererError(
            "local_render_result_guard_missing",
            "The claimed local render job is missing its atomic result-persistence guard.",
            409,
            { stage: "result-persistence", candidateId, jobId: work.jobId, planId: initial.planId },
          );
        }
        if (typeof remintStore.recordGuardedResult !== "function") {
          throw localRendererError(
            "local_render_guarded_result_store_required",
            "The local renderer cannot save success through an unguarded result store.",
            500,
            { stage: "result-persistence", candidateId, jobId: work.jobId, planId: initial.planId },
          );
        }
        const updatedView = await remintStore.recordGuardedResult(
          candidateId,
          work.jobId,
          { ...result, durationSeconds: Math.max(0, (Date.now() - started) / 1000) },
          {
            resultPersistenceGuard: work.resultPersistenceGuard,
            stage: `commit-${stage}-result`,
            assertFresh: ({ stage: commitStage }) => assertStartCertificationFresh(commitStage),
          },
        );
        currentWork = null;
        throwIfAborted(signal);
        const updatedCandidate = updatedView.candidates.find((row) => row.id === candidateId);
        if (updatedCandidate && ["render-ready", "ready-for-mint-review", "minted"].includes(updatedCandidate.status)) {
          publish(candidateId, {
            status: updatedCandidate.status,
            stage: updatedCandidate.status,
            percent: 100,
            message: updatedCandidate.status === "render-ready"
              ? "Final video verified; binding it to the mint plan."
              : "Local render complete.",
            completedAt: clock().toISOString(),
            durationSeconds: (Date.now() - started) / 1000,
          });
          return updatedCandidate;
        }
      }
      throw localRendererError("local_render_pipeline_stalled", "The local render pipeline did not reach a release-ready state.", 500);
    } catch (error) {
      const interruptedForShutdown = signal.aborted && runtime.abortMode === "shutdown";
      const canceled = signal.aborted && runtime.abortMode === "operator";
      const activeStage = text(jobs.get(candidateId)?.stage || currentWork?.stage || "failed") || "failed";
      const failure = publicRenderFailure(error, { stage: activeStage, retryable: !interruptedForShutdown && !canceled });
      if (currentWork && !interruptedForShutdown) {
        await remintStore.recordResult(candidateId, currentWork.jobId, {
          ok: false,
          cancelled: canceled,
          message: failure.message,
          failure,
          retryable: failure.retryable,
          requiresExplicitRetry: !canceled,
        }).catch(() => {});
      } else if (!interruptedForShutdown && !canceled) {
        await recordPreclaimFailure(candidateId, failure).catch(() => {});
      }
      publish(candidateId, {
        status: interruptedForShutdown ? "interrupted" : canceled ? "canceled" : "failed",
        stage: interruptedForShutdown ? "interrupted" : canceled ? "canceled" : failure.stage,
        message: interruptedForShutdown ? "Local render stopped for a safe Builder restart." : canceled ? "Local render canceled by the operator." : failure.message,
        error: failure,
        ...(interruptedForShutdown || canceled ? { stoppedAt: clock().toISOString() } : { failedAt: clock().toISOString() }),
      });
      throw error;
    }
  }

  return {
    inspect: () => inspectSongCardLocalRenderer(),
    status() {
      const inspection = inspectSongCardLocalRenderer();
      return {
        ...inspection,
        activeRenderCount: runtimes.size,
        preparingRenderCount: preparations.size,
        activeProcessCount: [...runtimes.values()].reduce((total, runtime) => total + runtime.processes.size, 0),
        jobs: [...jobs.values()].map(publicJob),
      };
    },
    async start(candidateIdInput) {
      const candidateId = text(candidateIdInput);
      if (!candidateId) throw localRendererError("local_render_candidate_required", "Choose a render candidate first.", 400);
      const existing = jobs.get(candidateId);
      if (existing?.promise) return { started: false, resumed: false, job: publicJob(existing) };
      const inFlightPreparation = preparations.get(candidateId);
      if (inFlightPreparation) {
        const shared = await inFlightPreparation;
        return { ...shared, started: false, sharedPreparation: true };
      }
      const prepareAndLaunch = async () => {
        let durableView = await remintStore.view();
        let durableCandidate = durableView.candidates.find((row) => row.id === candidateId);
        if (!durableCandidate) throw localRendererError("local_render_candidate_missing", "The selected render candidate no longer exists.", 404);
        if (["render-ready", "ready-for-mint-review", "minting", "minted"].includes(durableCandidate.status)) {
          const completedJob = publish(candidateId, {
            status: durableCandidate.status,
            stage: durableCandidate.status,
            percent: 100,
            message: "This render candidate has already finished local rendering.",
            completedAt: clock().toISOString(),
          });
          return { started: false, resumed: true, completed: true, job: publicJob(completedJob) };
        }
        if (["canceled", "superseded", "rejected"].includes(durableCandidate.status)) {
          throw localRendererError("local_render_candidate_inactive", `The render candidate is ${durableCandidate.status}.`, 409);
        }
        if (durableCandidate.status === "awaiting-approval") {
          throw localRendererError("local_render_approval_required", "Render approval is required before local finishing can start.", 409);
        }
        if (durableCandidate.status === "failed") {
          await remintStore.retry(candidateId);
          durableView = await remintStore.view();
          durableCandidate = durableView.candidates.find((row) => row.id === candidateId);
        }
        if (durableCandidate?.status === "approved") {
          await remintStore.enqueue();
          durableView = await remintStore.view();
          durableCandidate = durableView.candidates.find((row) => row.id === candidateId);
        }
        if (
          !durableCandidate
          || !["queued", "rendering"].includes(durableCandidate.status)
          || durableCandidate.renderWorkAuthorized !== true
          || !text(durableCandidate.approvedBy)
        ) {
          throw localRendererError(
            "local_render_candidate_not_runnable",
            `The render candidate is ${durableCandidate?.status || "missing"} and does not retain approved render authority.`,
            409,
          );
        }
        const latestExisting = jobs.get(candidateId);
        if (latestExisting?.promise) return { started: false, resumed: false, job: publicJob(latestExisting) };

        publish(candidateId, {
          status: "preparing",
          stage: "render-start-certification",
          percent: 0,
          message: "Certifying the exact saved cut and every current render dependency before work starts.",
          error: null,
          failedAt: null,
          stoppedAt: null,
          completedAt: null,
        });
        const certificationStartedAtMs = Date.now();
        const heartbeatIntervalMs = Math.max(0, Number(certificationHeartbeatMs) || 0);
        let certificationHeartbeat = null;
        const stopCertificationHeartbeat = () => {
          if (certificationHeartbeat) clearInterval(certificationHeartbeat);
          certificationHeartbeat = null;
        };
        if (heartbeatIntervalMs > 0) {
          certificationHeartbeat = setInterval(() => {
            const elapsedSeconds = Math.max(1, Math.floor((Date.now() - certificationStartedAtMs) / 1_000));
            publish(candidateId, {
              status: "preparing",
              stage: "render-start-certification",
              percent: 0,
              elapsedSeconds,
              message: `Still checking this exact saved cut (${elapsedSeconds}s). Verifying media, audio, shaders, and the current build before any render work starts.`,
            });
          }, heartbeatIntervalMs);
          certificationHeartbeat.unref?.();
        }
        let startCertification = null;
        try {
          const inspection = inspectSongCardLocalRenderer();
          if (!inspection.available && pipeline === defaultPipeline) {
            throw localRendererError("local_renderer_unavailable", inspection.reason, 503, { stage: "render-start-certification", missing: inspection.missing });
          }
          const storedPlan = await controller.getPlan(durableCandidate.planId);
          if (typeof certifyStart === "function") {
            startCertification = await certifyStart({
              candidate: structuredClone(durableCandidate),
              storedPlan: structuredClone(storedPlan),
            });
            if (!startCertification || startCertification.ok !== true) {
              throw localRendererError(
                "local_render_start_certificate_missing",
                "The exact saved cut did not produce a current render-start certificate.",
                409,
                { stage: "render-start-certification" },
              );
            }
            if (requiresStartCertification && (
              typeof startCertification.assertFresh !== "function"
              || !/^sha256:[a-f0-9]{64}$/u.test(text(startCertification?.summary?.certificateSha256))
            )) {
              throw localRendererError(
                "local_render_start_certificate_incomplete",
                "The exact-plan certificate is missing its immutable identity or live freshness assertion.",
                409,
                { stage: "render-start-certification" },
              );
            }
          }
          startCertification = startCertification
            ? { ...startCertification, storedPlan: startCertification.storedPlan || storedPlan }
            : null;
        } catch (error) {
          stopCertificationHeartbeat();
          const afterFailureView = await remintStore.view().catch(() => null);
          const afterFailureCandidate = afterFailureView?.candidates?.find((row) => row.id === candidateId) || null;
          if (
            !afterFailureCandidate
            || text(afterFailureCandidate.planId) !== text(durableCandidate.planId)
            || !["queued", "rendering"].includes(afterFailureCandidate.status)
            || afterFailureCandidate.renderWorkAuthorized !== true
            || !text(afterFailureCandidate.approvedBy)
          ) {
            const observedStatus = text(afterFailureCandidate?.status) || "missing";
            publish(candidateId, {
              status: ["canceled", "superseded", "rejected"].includes(observedStatus) ? observedStatus : "stopped",
              stage: "render-start-state-changed",
              percent: 0,
              message: `Render start stopped because the candidate became ${observedStatus} while its certificate was being checked.`,
              stoppedAt: clock().toISOString(),
            });
            throw localRendererError(
              "local_render_candidate_changed_during_certification",
              `The render candidate became ${observedStatus} while its exact certificate was being checked. No render work started.`,
              409,
              { stage: "render-start-certification", candidateId, observedStatus },
            );
          }
          const failure = publicRenderFailure(error, { stage: "render-start-certification", retryable: true });
          await recordPreclaimFailure(candidateId, failure).catch(() => {});
          publish(candidateId, {
            status: "failed",
            stage: failure.stage,
            message: failure.message,
            error: failure,
            failedAt: clock().toISOString(),
          });
          throw error;
        } finally {
          stopCertificationHeartbeat();
        }

        const certifiedView = await remintStore.view();
        const certifiedCandidate = certifiedView.candidates.find((row) => row.id === candidateId);
        const candidateChanged = !certifiedCandidate
          || text(certifiedCandidate.planId) !== text(durableCandidate.planId)
          || !["queued", "rendering"].includes(certifiedCandidate.status)
          || certifiedCandidate.renderWorkAuthorized !== true
          || !text(certifiedCandidate.approvedBy);
        if (candidateChanged) {
          const observedStatus = text(certifiedCandidate?.status) || "missing";
          publish(candidateId, {
            status: ["canceled", "superseded", "rejected"].includes(observedStatus) ? observedStatus : "stopped",
            stage: "render-start-state-changed",
            percent: 0,
            message: `Render start stopped because the candidate became ${observedStatus} while its certificate was being checked.`,
            stoppedAt: clock().toISOString(),
          });
          throw localRendererError(
            "local_render_candidate_changed_during_certification",
            `The render candidate became ${observedStatus} while its exact certificate was being checked. No render work started.`,
            409,
            {
              stage: "render-start-certification",
              candidateId,
              expectedPlanId: durableCandidate.planId,
              observedPlanId: certifiedCandidate?.planId || null,
              observedStatus,
            },
          );
        }

        const job = publish(candidateId, {
          status: "queued",
          stage: "queued",
          percent: 0,
          message: existing?.status === "failed" ? "Retrying the Builder-managed local render." : "Starting the Builder-managed local render.",
          error: null,
          completed: 0,
          total: 0,
          cueIds: [],
          certification: startCertification?.summary ? structuredClone(startCertification.summary) : null,
          failedAt: null,
          stoppedAt: null,
          completedAt: null,
        });
        const runtimeController = new AbortController();
        const runtime = {
          candidateId,
          controller: runtimeController,
          abortMode: null,
          processes: new Map(),
          promise: null,
          registerProcess: null,
          startCertification,
        };
        runtime.registerProcess = ({ child, terminate }) => {
          const key = child?.pid || crypto.randomUUID();
          runtime.processes.set(key, { child, terminate });
          return () => runtime.processes.delete(key);
        };
        runtimes.set(candidateId, runtime);
        const promise = runCandidate(candidateId, runtime).finally(() => {
          const current = jobs.get(candidateId);
          if (current?.promise === promise) jobs.set(candidateId, { ...current, promise: null });
          if (runtimes.get(candidateId) === runtime) runtimes.delete(candidateId);
        });
        runtime.promise = promise;
        jobs.set(candidateId, { ...job, promise });
        promise.catch(() => {});
        return { started: true, resumed: Boolean(existing), job: publicJob(jobs.get(candidateId)) };
      };
      const preparation = prepareAndLaunch();
      preparations.set(candidateId, preparation);
      try {
        return await preparation;
      } finally {
        if (preparations.get(candidateId) === preparation) preparations.delete(candidateId);
      }
    },
    async cancel(candidateIdInput, { reason = "operator-canceled-local-render" } = {}) {
      const candidateId = text(candidateIdInput);
      const runtime = runtimes.get(candidateId);
      if (!runtime) return { candidateId, stopped: false, reason: "no-active-local-render" };
      runtime.abortMode = "operator";
      runtime.controller.abort(localRendererError("local_render_canceled", text(reason) || "Local render canceled by the operator.", 409));
      for (const processEntry of runtime.processes.values()) processEntry.terminate();
      await runtime.promise?.catch(() => {});
      return { candidateId, stopped: true, reason: text(reason) || "operator-canceled-local-render" };
    },
    async shutdown({ reason = "builder-shutdown" } = {}) {
      const active = [...runtimes.values()];
      for (const runtime of active) {
        runtime.abortMode = "shutdown";
        runtime.controller.abort(localRendererError("local_render_interrupted", `Local render interrupted for ${reason}.`, 503));
        for (const processEntry of runtime.processes.values()) processEntry.terminate();
      }
      await Promise.allSettled(active.map((runtime) => runtime.promise));
      return { stopped: active.length, reason };
    },
  };
}
