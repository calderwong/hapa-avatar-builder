#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { deriveEchoDirectionVariantProject } from "../src/domain/echo-direction-variants.js";
import { preflightHyperFramesMedia } from "../src/domain/hyperframes-show-compiler.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");
export const ECHO_MEDIA_PREFLIGHT_SCHEMA = "hapa.echo.director-media-preflight.v1";

const text = (value) => String(value ?? "").trim();
const list = (value) => Array.isArray(value) ? value : [];
const bodyOf = (payload = {}) => payload?.music_video_project || payload || {};
const safeFile = (candidate) => {
  try {
    const stat = fs.statSync(candidate);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
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

function graphOf(project = {}) {
  const declared = project.director_show_graph || project.directorShowGraph;
  return declared?.tracks ? declared : projectToEditorGraph(project);
}

function compactCompilerReport(report = {}) {
  return {
    schemaVersion: report.schemaVersion,
    ok: Boolean(report.ok),
    declaredCount: Number(report.declaredCount || 0),
    generatedCount: Number(report.generatedCount || 0),
    resolvedCount: Number(report.resolvedCount || 0),
    unresolvedCount: Number(report.unresolvedCount || 0),
  };
}

function cutIdentity(project = {}, variant = null) {
  if (!variant) return { cutId: "base", cutTitle: "Base project", cutKind: "base" };
  return {
    cutId: text(variant.id || variant.variant_id || variant.variantId) || "unnamed-saved-cut",
    cutTitle: text(variant.title || variant.label || variant.name) || "Saved direction cut",
    cutKind: "saved-variant",
  };
}

function normalizeFailure(failure = {}, context = {}) {
  return {
    songId: context.songId,
    songTitle: context.songTitle,
    cutId: context.cutId,
    cutTitle: context.cutTitle,
    cutKind: context.cutKind,
    sourcePath: context.sourcePath,
    cueId: failure.cueId || null,
    mediaId: failure.mediaId || null,
    title: failure.title || null,
    originalUri: failure.originalUri || null,
    runtimeUri: failure.runtimeUri || null,
    attemptedPaths: list(failure.attemptedPaths),
    reason: failure.reason || "unresolved-media-source",
    conflicts: list(failure.conflicts),
    aliasConflicts: list(failure.aliasConflicts),
  };
}

function invalidInputFailure(context, reason, message) {
  return normalizeFailure({
    reason,
    title: message,
    attemptedPaths: context.sourcePath ? [context.sourcePath] : [],
  }, context);
}

/**
 * Validate one base project or one derived direction cut without copying,
 * hashing, transcoding, rendering, or silently selecting a replacement asset.
 */
export function preflightEchoDirectionCut({
  project,
  variant = null,
  sourcePath = "",
  avatarRoot = ROOT,
  isFile = safeFile,
} = {}) {
  const baseProject = bodyOf(project);
  const projected = variant ? deriveEchoDirectionVariantProject(baseProject, variant) : baseProject;
  const identity = cutIdentity(projected, variant);
  const context = {
    songId: text(projected.song_id || variant?.parent?.songId) || "unknown-song",
    songTitle: text(projected.song_title) || "Untitled song",
    ...identity,
    sourcePath: sourcePath ? path.resolve(sourcePath) : null,
  };
  try {
    const compilerReport = preflightHyperFramesMedia(graphOf(projected), {
      project: projected,
      root: path.resolve(avatarRoot),
      projectPath: context.sourcePath,
      isFile,
    });
    const compilerFailures = [...list(compilerReport.unresolved), ...list(compilerReport.aliasConflicts)];
    const failures = compilerFailures
      .filter((failure, index, rows) => rows.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(failure)) === index)
      .map((failure) => normalizeFailure(failure, context));
    return {
      ...context,
      ...compactCompilerReport(compilerReport),
      ok: Boolean(compilerReport.ok) && failures.length === 0,
      failures,
    };
  } catch (error) {
    const failure = invalidInputFailure(context, "media-preflight-exception", error?.message || String(error));
    return {
      ...context,
      ok: false,
      declaredCount: 0,
      generatedCount: 0,
      resolvedCount: 0,
      unresolvedCount: 1,
      failures: [failure],
    };
  }
}

function savedVariantsFor({ project, projectPath, variantsRoot }) {
  const baseProject = bodyOf(project);
  const songId = text(baseProject.song_id);
  const rows = list(baseProject.direction_script_variants).map((variant, index) => ({
    variant,
    sourcePath: projectPath,
    sourceKind: "embedded",
    sortKey: `0:${String(index).padStart(5, "0")}`,
  }));
  if (!songId || !variantsRoot) return rows;
  for (const variantPath of jsonFiles(path.join(path.resolve(variantsRoot), songId))) {
    try {
      const payload = readJson(variantPath);
      rows.push({
        variant: payload.direction_script_variant || payload.variant || payload,
        sourcePath: variantPath,
        sourceKind: "sidecar",
        sortKey: `1:${variantPath}`,
      });
    } catch (error) {
      rows.push({
        variant: null,
        sourcePath: variantPath,
        sourceKind: "sidecar-invalid-json",
        error,
        sortKey: `1:${variantPath}`,
      });
    }
  }
  return rows.sort((left, right) => left.sortKey.localeCompare(right.sortKey));
}

function summarizeCuts(cuts = []) {
  const failures = cuts.flatMap((cut) => cut.failures || []);
  return {
    ok: failures.length === 0 && cuts.every((cut) => cut.ok),
    cutCount: cuts.length,
    declaredCount: cuts.reduce((sum, cut) => sum + Number(cut.declaredCount || 0), 0),
    generatedCount: cuts.reduce((sum, cut) => sum + Number(cut.generatedCount || 0), 0),
    resolvedCount: cuts.reduce((sum, cut) => sum + Number(cut.resolvedCount || 0), 0),
    unresolvedCount: failures.length,
    failures,
  };
}

/** Validate a base project and every saved embedded/sidecar direction cut. */
export function preflightEchoProjectAndSavedCuts({
  payload,
  projectPath = "",
  avatarRoot = ROOT,
  variantsRoot = path.join(avatarRoot, "data/music-video-project-variants"),
  isFile = safeFile,
} = {}) {
  const baseProject = bodyOf(payload);
  const base = preflightEchoDirectionCut({
    project: baseProject,
    sourcePath: projectPath,
    avatarRoot,
    isFile,
  });
  const cuts = [base];
  for (const row of savedVariantsFor({ project: baseProject, projectPath, variantsRoot })) {
    if (row.error || !row.variant) {
      const context = {
        songId: text(baseProject.song_id) || "unknown-song",
        songTitle: text(baseProject.song_title) || "Untitled song",
        cutId: path.basename(row.sourcePath || "invalid-cut", ".json"),
        cutTitle: "Unreadable saved direction cut",
        cutKind: "saved-variant",
        sourcePath: row.sourcePath ? path.resolve(row.sourcePath) : null,
      };
      const failure = invalidInputFailure(context, "invalid-saved-cut-json", row.error?.message || "Saved cut is unreadable");
      cuts.push({ ...context, ok: false, declaredCount: 0, generatedCount: 0, resolvedCount: 0, unresolvedCount: 1, failures: [failure] });
      continue;
    }
    cuts.push(preflightEchoDirectionCut({
      project: baseProject,
      variant: row.variant,
      sourcePath: row.sourcePath,
      avatarRoot,
      isFile,
    }));
  }
  const summary = summarizeCuts(cuts);
  return {
    schemaVersion: ECHO_MEDIA_PREFLIGHT_SCHEMA,
    scope: "project-and-saved-cuts",
    songId: base.songId,
    songTitle: base.songTitle,
    projectPath: projectPath ? path.resolve(projectPath) : null,
    ...summary,
    cuts,
  };
}

/**
 * Validate all base projects and all sidecar direction cuts before an album
 * compiler starts its media-heavy artifact loop.
 */
export function preflightEchoAlbum({
  projectsRoot = path.join(ROOT, "data/music-video-projects"),
  variantsRoot = path.join(ROOT, "data/music-video-project-variants"),
  avatarRoot = ROOT,
  isFile = safeFile,
} = {}) {
  const resolvedProjectsRoot = path.resolve(projectsRoot);
  const projects = [];
  const inputCuts = [];
  const projectPaths = jsonFiles(resolvedProjectsRoot);
  if (!projectPaths.length) {
    const context = {
      songId: "album",
      songTitle: "Album source set",
      cutId: "base-projects",
      cutTitle: "Base projects",
      cutKind: "base",
      sourcePath: resolvedProjectsRoot,
    };
    const failure = invalidInputFailure(context, "projects-directory-empty", "No music-video project JSON files were found");
    inputCuts.push({ ...context, ok: false, declaredCount: 0, generatedCount: 0, resolvedCount: 0, unresolvedCount: 1, failures: [failure] });
  }
  for (const projectPath of projectPaths) {
    try {
      projects.push(preflightEchoProjectAndSavedCuts({
        payload: readJson(projectPath),
        projectPath,
        avatarRoot,
        variantsRoot,
        isFile,
      }));
    } catch (error) {
      const context = {
        songId: path.basename(projectPath, ".json"),
        songTitle: "Unreadable base project",
        cutId: "base",
        cutTitle: "Base project",
        cutKind: "base",
        sourcePath: projectPath,
      };
      const failure = invalidInputFailure(context, "invalid-project-json", error?.message || String(error));
      projects.push({
        schemaVersion: ECHO_MEDIA_PREFLIGHT_SCHEMA,
        scope: "project-and-saved-cuts",
        songId: context.songId,
        songTitle: context.songTitle,
        projectPath,
        ok: false,
        cutCount: 1,
        declaredCount: 0,
        generatedCount: 0,
        resolvedCount: 0,
        unresolvedCount: 1,
        failures: [failure],
        cuts: [{ ...context, ok: false, declaredCount: 0, generatedCount: 0, resolvedCount: 0, unresolvedCount: 1, failures: [failure] }],
      });
    }
  }
  const cuts = [...inputCuts, ...projects.flatMap((project) => project.cuts || [])];
  const summary = summarizeCuts(cuts);
  return {
    schemaVersion: ECHO_MEDIA_PREFLIGHT_SCHEMA,
    scope: "album-base-projects-and-saved-cuts",
    projectsRoot: resolvedProjectsRoot,
    variantsRoot: path.resolve(variantsRoot),
    projectCount: projects.length,
    ...summary,
    projects,
  };
}

export function formatEchoMediaPreflightFailure(report = {}, { limit = 20 } = {}) {
  const failures = list(report.failures);
  const header = `Echo media preflight failed: ${failures.length} unresolved cue${failures.length === 1 ? "" : "s"} across ${Number(report.cutCount || 0)} checked cut${Number(report.cutCount || 0) === 1 ? "" : "s"}.`;
  const lines = failures.slice(0, Math.max(1, Number(limit || 20))).map((failure) => {
    const declared = failure.runtimeUri || failure.originalUri || "(blank)";
    const attempted = list(failure.attemptedPaths).length ? failure.attemptedPaths.join(" | ") : "(none)";
    return `- ${failure.songTitle} [${failure.cutId}] cue ${failure.cueId || "unknown"}: ${failure.reason}; URI=${declared}; attempted=${attempted}`;
  });
  if (failures.length > lines.length) lines.push(`- … ${failures.length - lines.length} more failure(s); inspect the JSON preflight report for every cue.`);
  return [header, ...lines, "No media was substituted and rendering did not start."].join("\n");
}

export function assertEchoMediaPreflight(report = {}) {
  if (report.ok) return report;
  const error = new Error(formatEchoMediaPreflightFailure(report));
  error.code = "ECHO_MEDIA_PREFLIGHT_FAILED";
  error.report = report;
  throw error;
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith("--")) continue;
    const equalsIndex = key.indexOf("=");
    if (equalsIndex > 2) {
      const name = key.slice(2, equalsIndex);
      const value = key.slice(equalsIndex + 1);
      if (!value) throw new Error(`Missing value for --${name}`);
      options[name] = value;
      continue;
    }
    const name = key.slice(2);
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Missing value for --${name}`);
    options[name] = value;
    index += 1;
  }
  return options;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  fs.renameSync(tempPath, filePath);
}

function runCli() {
  const options = parseArgs(process.argv.slice(2));
  const avatarRoot = path.resolve(options["avatar-root"] || options.avatarRoot || ROOT);
  const projectsRoot = path.resolve(options.projects || path.join(avatarRoot, "data/music-video-projects"));
  const variantsRoot = path.resolve(options.variants || path.join(avatarRoot, "data/music-video-project-variants"));
  const reportPath = path.resolve(options.report || path.join(avatarRoot, "artifacts/echo-media-preflight/report.json"));
  const report = options.project
    ? preflightEchoProjectAndSavedCuts({
      payload: readJson(path.resolve(options.project)),
      projectPath: path.resolve(options.project),
      avatarRoot,
      variantsRoot,
    })
    : preflightEchoAlbum({ projectsRoot, variantsRoot, avatarRoot });
  const persisted = { ...report, generatedAt: new Date().toISOString() };
  writeJson(reportPath, persisted);
  process.stdout.write(`${JSON.stringify({
    ok: report.ok,
    report: reportPath,
    projectCount: report.projectCount ?? 1,
    cutCount: report.cutCount,
    declaredCount: report.declaredCount,
    generatedCount: report.generatedCount,
    resolvedCount: report.resolvedCount,
    unresolvedCount: report.unresolvedCount,
  }, null, 2)}\n`);
  if (!report.ok) {
    process.stderr.write(`${formatEchoMediaPreflightFailure(report)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    runCli();
  } catch (error) {
    process.stderr.write(`${error.stack || error.message}\n`);
    process.exitCode = 1;
  }
}
