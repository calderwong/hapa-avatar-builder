import { execFile as execFileCallback, spawn as spawnChild, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { evaluateHyperFramesPixelAcceptance } from "../scripts/hyperframes-pixel-acceptance.mjs";
import { preflightHyperFramesMedia } from "../src/domain/hyperframes-show-compiler.js";
import { normalizeHyperFramesStemRole } from "../src/domain/hyperframes-visualizer-runtime.js";

const execFile = promisify(execFileCallback);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXECUTOR_ID = "hapa-avatar-builder:local-hyperframes";
const RELEASE_TRUTH_SCHEMA = "hapa.show.release-renderer-truth.v1";
const LOCAL_JOB_SCHEMA = "hapa.song-card.local-render-job.v1";
const LOCAL_CHECKPOINT_SCHEMA = "hapa.song-card.local-render-checkpoint.v1";
const REQUIRED_SCRIPTS = [
  "scripts/build-stem-telemetry-bundle.py",
  "scripts/compile-hyperframes-show-v2.mjs",
  "scripts/hyperframes-pixel-acceptance.mjs",
  "scripts/hyperframes-pixel-capture.cjs",
  "scripts/run-local-hyperframes.mjs",
];

function text(value) {
  return String(value || "").trim();
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

let inspectionCache = null;
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
    proxyRegistry: fs.existsSync(process.env.HAPA_HYPERFRAMES_PROXY_REGISTRY || "/Users/calderwong/Desktop/hapa-music-viz/web/isf/proxies/native-exact-proxies.json"),
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

export async function resolveSongCardMasterAudio({ songId, storedPlan, resolveRegistryMaster = null } = {}) {
  const input = storedPlan?.input || {};
  const direct = [
    input.song?.audioPath,
    input.project?.audioPath,
    input.project?.audio_path,
    input.showGraph?.song?.audioPath,
    input.showGraph?.song?.localAudioPath,
  ].map(existingAbsoluteRegularFile).find(Boolean);
  if (direct) return direct;

  const registry = await resolveRegistryMaster?.(songId, storedPlan);
  const registryCandidates = typeof registry === "string"
    ? [registry]
    : [registry?.masterPath, registry?.audioPath, registry?.path];
  const resolved = registryCandidates.map(existingAbsoluteRegularFile).find(Boolean);
  if (!resolved) {
    throw localRendererError("local_master_audio_missing", "The Builder could not resolve the selected song's verified local master audio.", 409, { songId });
  }
  return resolved;
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
  if (checkpoint?.schemaVersion !== LOCAL_CHECKPOINT_SCHEMA || checkpoint.identitySha256 !== identitySha256) return null;
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
    items: verified.length ? verified : [{
      id: "stem:verified-master-fallback",
      title: "Verified Master Mix",
      stemType: "master",
      audioPath: masterPath,
      truthStatus: "master-mix-fallback-no-isolated-stems",
    }],
    count: verified.length || 1,
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

async function probeRelease(masterPath, posterPath, expectedDuration = 0, { signal } = {}) {
  throwIfAborted(signal);
  const { stdout } = await execFile("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=index,codec_type,codec_name,width,height,duration",
    "-of", "json",
    masterPath,
  ], { maxBuffer: 8 * 1024 * 1024, signal });
  const probe = JSON.parse(stdout || "{}");
  const streams = Array.isArray(probe.streams) ? probe.streams : [];
  const video = streams.find((stream) => stream.codec_type === "video");
  const audio = streams.find((stream) => stream.codec_type === "audio");
  const duration = Number(probe.format?.duration || video?.duration || audio?.duration || 0);
  const tolerance = Math.max(0.15, Math.min(1, Number(expectedDuration || duration) * 0.0025));
  if (!video || !audio || !(duration > 0) || (expectedDuration > 0 && Math.abs(duration - expectedDuration) > tolerance)) {
    throw localRendererError("local_release_decode_failed", "The finished master did not pass full audio/video duration verification.", 409, {
      hasVideo: Boolean(video), hasAudio: Boolean(audio), duration, expectedDuration, tolerance,
    });
  }
  await execFile("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror",
    "-i", masterPath,
    "-map", "0:v:0", "-map", "0:a:0",
    "-f", "null", "-",
  ], { maxBuffer: 16 * 1024 * 1024, signal });
  throwIfAborted(signal);
  const posterProbe = await execFile("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height,codec_type", "-of", "json", posterPath], { maxBuffer: 2 * 1024 * 1024, signal });
  const poster = JSON.parse(posterProbe.stdout || "{}").streams?.[0];
  if (!poster || !(Number(poster.width) > 0) || !(Number(poster.height) > 0)) {
    throw localRendererError("local_release_poster_failed", "The finished poster did not decode as an image.");
  }
  return {
    executionStatus: "executed",
    status: "passed",
    ok: true,
    checks: ["full-master-video-decode", "full-master-audio-decode", "duration-match", "poster-image-decode", "renderer-truth"],
    durationSeconds: duration,
    expectedDurationSeconds: Number(expectedDuration || 0),
    video: { codec: video.codec_name || null, width: Number(video.width || 0), height: Number(video.height || 0) },
    audio: { codec: audio.codec_name || null },
    poster: { width: Number(poster.width), height: Number(poster.height) },
  };
}

async function defaultPipeline({ project, showGraph, outputDirectory, masterPath, report, signal, registerProcess }) {
  throwIfAborted(signal);
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
  const telemetryPath = path.join(inputDirectory, "stem-telemetry.json");
  const signalGraphPreflight = preflightSongCardSignalGraph({ project, showGraph });
  await writeJson(path.join(inputDirectory, "signal-graph-preflight.json"), signalGraphPreflight);
  if (!signalGraphPreflight.ok) throw createSongCardSignalGraphError(signalGraphPreflight);
  await Promise.all([
    writeJson(graphPath, filteredStemGraph(showGraph, masterPath)),
    writeJson(projectPath, project),
  ]);

  throwIfAborted(signal);
  report("media-preflight", 8, "Checking every real media cue before analysis or rendering.");
  const mediaPreflight = preflightSongCardLocalMedia({ project, showGraph, root: ROOT, projectPath });
  await writeJson(path.join(inputDirectory, "media-preflight.json"), mediaPreflight);
  if (!mediaPreflight.ok) throw createSongCardMediaPreflightError(mediaPreflight);

  report("stem-analysis", 12, "Analyzing the verified local stems.");
  await execFile(process.env.HAPA_PYTHON || "python3", [
    path.join(ROOT, "scripts/build-stem-telemetry-bundle.py"),
    "--graph", graphPath,
    "--output", telemetryPath,
    "--graph-output", analyzedGraphPath,
  ], { cwd: ROOT, maxBuffer: 32 * 1024 * 1024, signal });

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

  report("pixel-qa", 34, "Sampling real rendered pixels for every shader cue.");
  const electronPath = path.join(ROOT, "node_modules/.bin/electron");
  const pixelReportPath = path.join(qaDirectory, "pixel-capture-report.json");
  await fsp.rm(pixelReportPath, { force: true });
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
  const pixelReport = reevaluateSongCardPixelReport(capturedPixelReport);
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
  const rendererTruth = executedRendererTruth(showGraph, compilerReport, pixelReport);

  const renderedMasterPath = path.join(renderDirectory, "master.mp4");
  report("render", 40, "Rendering the final MP4 locally. This is the long step.");
  try {
    await runHyperFramesRender([
      path.join(ROOT, "scripts/run-local-hyperframes.mjs"),
      "render",
      `--output=${renderedMasterPath}`,
      "--fps=30",
      "--quality=high",
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
  return { masterPath: renderedMasterPath, posterPath, compilerReport, pixelReport, rendererTruth };
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
  pipeline = defaultPipeline,
  clock = () => new Date(),
} = {}) {
  if (!root || !controller || !remintStore) throw new Error("Local Song Card renderer requires root, controller, and remintStore");
  const jobs = new Map();
  const runtimes = new Map();
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

  async function runCandidate(candidateId, runtime) {
    let currentWork = null;
    const started = Date.now();
    const { signal } = runtime.controller;
    try {
      throwIfAborted(signal);
      const initialView = await remintStore.view();
      const initial = initialView.candidates.find((row) => row.id === candidateId);
      if (!initial) throw localRendererError("local_render_candidate_missing", "The selected render candidate no longer exists.", 404);
      const storedPlan = await controller.getPlan(initial.planId);
      const project = structuredClone(storedPlan.input?.project || {});
      const showGraph = structuredClone(storedPlan.input?.showGraph || {});
      if (!Array.isArray(showGraph.tracks)) throw localRendererError("local_render_show_graph_missing", "The exact saved Show Graph is missing from this mint plan.");
      const masterPath = await resolveMaster(initial, storedPlan);
      const sourceMasterSha256 = `sha256:${await sha256File(masterPath)}`;
      const identity = {
        candidateId,
        planId: initial.planId,
        sourceRevision: storedPlan.sourceRevision || null,
        projectSha256: `sha256:${sha256Bytes(JSON.stringify(project))}`,
        showGraphSha256: `sha256:${sha256Bytes(JSON.stringify(showGraph))}`,
        sourceMasterSha256,
      };
      const identitySha256 = `sha256:${sha256Bytes(JSON.stringify(identity))}`;
      const fingerprint = identitySha256.replace(/^sha256:/u, "");
      const outputDirectory = path.join(renderRoot, safeSegment(initial.songId), fingerprint.slice(0, 32));
      await fsp.mkdir(outputDirectory, { recursive: true, mode: 0o700 });
      const checkpointPath = path.join(outputDirectory, "local-render-checkpoint.json");
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

      const persistCheckpoint = async () => {
        checkpoint = {
          schemaVersion: LOCAL_CHECKPOINT_SCHEMA,
          identity,
          identitySha256,
          pipeline: checkpoint?.pipeline || null,
          rendererTruth: artifacts.rendererTruth,
          qa: artifacts.qa,
          createdAt: checkpoint?.createdAt || clock().toISOString(),
          updatedAt: clock().toISOString(),
        };
        await atomicJson(checkpointPath, checkpoint);
      };

      const ensurePipeline = async () => {
        throwIfAborted(signal);
        if (artifacts.pipeline && artifacts.rendererTruth) return;
        publish(candidateId, { status: "rendering", stage: "resume-check", percent: 8, message: "Rebuilding the verified render checkpoint before continuing." });
        const pipelineResult = await pipeline({
          candidate: (await remintStore.view()).candidates.find((row) => row.id === candidateId),
          storedPlan,
          project,
          showGraph,
          masterPath,
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
        if (!pipelineResult?.masterPath || !pipelineResult?.posterPath) throw localRendererError("local_render_artifacts_missing", "The local renderer did not produce both a master and poster.");
        if (!withinDirectory(outputDirectory, pipelineResult.masterPath) || !withinDirectory(outputDirectory, pipelineResult.posterPath)) {
          throw localRendererError("local_render_artifacts_unmanaged", "The local renderer produced artifacts outside its managed edition workspace.");
        }
        artifacts.rendererTruth = pipelineResult.rendererTruth || executedRendererTruth(showGraph, pipelineResult.compilerReport || { ok: true, visualizers: { declared: 0, exactProxy: 0, unsupported: 0 } }, pipelineResult.pixelReport || { ok: visualizerCards(showGraph).length === 0, frames: [] });
        const [master, poster] = await Promise.all([artifactProof(pipelineResult.masterPath), artifactProof(pipelineResult.posterPath)]);
        artifacts.pipeline = { ...pipelineResult, masterPath: master.path, posterPath: poster.path };
        artifacts.qa = null;
        checkpoint = { ...(checkpoint || {}), pipeline: { master, poster } };
        await persistCheckpoint();
      };

      const ensureQa = async () => {
        await ensurePipeline();
        if (artifacts.qa?.ok === true) return;
        artifacts.qa = await probeRelease(
          artifacts.pipeline.masterPath,
          artifacts.pipeline.posterPath,
          Number(showGraph.song?.durationSeconds || project.duration || 0),
          { signal },
        );
        await persistCheckpoint();
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

        const claim = await remintStore.claim({ activePlayback: false, candidateId });
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
          result = { ok: true, artifacts: [{ role: "hyperframes-package", path: outputDirectory }], receipt: { stage, ok: true, executorId: EXECUTOR_ID, rendererTruth: artifacts.rendererTruth, checkpointIdentity: identitySha256, resumed } };
        } else if (stage === "qa") {
          await ensureQa();
          publish(candidateId, { status: "rendering", stage: "release-qa", percent: 94, message: "Final audio, video, duration, poster, and shader truth passed." });
          result = { ok: true, artifacts: [{ role: "qa-report", checks: artifacts.qa.checks }], receipt: { stage, ...artifacts.qa, checkpointIdentity: identitySha256 } };
        } else if (stage === "release-export") {
          await ensureQa();
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
          result = { ok: true, artifacts: [`local:${stage}:${fingerprint.slice(0, 16)}`], receipt: { stage, ok: true, executorId: EXECUTOR_ID, exactPlanId: initial.planId } };
        }
        throwIfAborted(signal);
        const updatedView = await remintStore.recordResult(candidateId, work.jobId, { ...result, durationSeconds: Math.max(0, (Date.now() - started) / 1000) });
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
        activeProcessCount: [...runtimes.values()].reduce((total, runtime) => total + runtime.processes.size, 0),
        jobs: [...jobs.values()].map(publicJob),
      };
    },
    async start(candidateIdInput) {
      const candidateId = text(candidateIdInput);
      if (!candidateId) throw localRendererError("local_render_candidate_required", "Choose a render candidate first.", 400);
      const inspection = inspectSongCardLocalRenderer();
      if (!inspection.available && pipeline === defaultPipeline) throw localRendererError("local_renderer_unavailable", inspection.reason, 503, { missing: inspection.missing });
      const existing = jobs.get(candidateId);
      if (existing?.promise) return { started: false, resumed: false, job: publicJob(existing) };
      const durableView = await remintStore.view();
      const durableCandidate = durableView.candidates.find((row) => row.id === candidateId);
      if (!durableCandidate) throw localRendererError("local_render_candidate_missing", "The selected render candidate no longer exists.", 404);
      if (durableCandidate.status === "failed") await remintStore.retry(candidateId);
      if (["canceled", "superseded", "rejected"].includes(durableCandidate.status)) {
        throw localRendererError("local_render_candidate_inactive", `The render candidate is ${durableCandidate.status}.`, 409);
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
        failedAt: null,
        stoppedAt: null,
        completedAt: null,
      });
      const controller = new AbortController();
      const runtime = {
        candidateId,
        controller,
        abortMode: null,
        processes: new Map(),
        promise: null,
        registerProcess: null,
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
