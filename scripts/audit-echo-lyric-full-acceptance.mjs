#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { attachEchoLyricContract, echoLyricOverlayLines, normalizeEchoLyricContract } from "../src/domain/echo-lyric-contract.js";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";
import { inspectEchoLyricRenderSafety } from "../src/domain/echo-lyric-render-safety.js";
import { compileHyperFramesShow, hashEchoLyricOverlayExecutionContract } from "../src/domain/hyperframes-show-compiler.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";

const ROOT = path.resolve(".");
const PROJECTS_DIR = path.join(ROOT, "data/music-video-projects");
const QUALITY_PATH = path.join(ROOT, "artifacts/echo-lyric-quality-v4/baseline.json");
const SAFETY_PATH = path.join(ROOT, "artifacts/echo-lyric-quality-v4/render-safety.json");
const PARITY_PATH = path.join(ROOT, "artifacts/echo-lyric-quality-v4/rendered-parity/report.json");
const OUTPUT_PATH = path.join(ROOT, "artifacts/echo-lyric-quality-v4/final-acceptance.json");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const projectBody = (value) => value?.music_video_project || value?.project || value || {};
const countBy = (values) => Object.fromEntries([...values.reduce(
  (map, value) => map.set(value, (map.get(value) || 0) + 1),
  new Map(),
)].sort());

const quality = readJson(QUALITY_PATH);
const safety = readJson(SAFETY_PATH);
const renderedParity = readJson(PARITY_PATH);
const recentIds = new Set((quality.recentQueue || []).map((project) => String(project.songId || "")));
const qualityBySong = new Map((quality.projects || []).map((project) => [String(project.songId || ""), project]));
const safetyBySong = new Map((safety.projects || []).map((project) => [String(project.songId || ""), project]));

const projects = fs.readdirSync(PROJECTS_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => {
    const project = attachEchoLyricContract(projectBody(readJson(path.join(PROJECTS_DIR, file))));
    const contract = normalizeEchoLyricContract(project);
    const overlayLines = echoLyricOverlayLines(project);
    const fullGraph = projectToEditorGraph(project);
    const lyricGraph = {
      ...fullGraph,
      tracks: [],
      song: {
        ...fullGraph.song,
        lyricOverlay: { ...contract, lines: overlayLines },
      },
    };
    const duration = Math.max(.001, Number(project.duration || lyricGraph.song?.durationSeconds || 1));
    const telemetry = {
      duration,
      fps: 30,
      stems: [],
      masterMix: {
        id: "master",
        role: "master",
        frames: [
          { t: 0, rms: .2, peak: .3, onset: .1, low: .2, mid: .3, high: .2 },
          { t: duration, rms: .2, peak: .3, onset: .1, low: .2, mid: .3, high: .2 },
        ],
      },
    };
    const compiled = compileHyperFramesShow({ showGraph: lyricGraph, telemetry, project, proxyRegistry: {}, fps: 30 });
    const compiledTrack = compiled.instances.lyrics[0] || null;
    const script = generateEchoHyperframeScript(project);
    const expectedHash = hashEchoLyricOverlayExecutionContract(lyricGraph.song.lyricOverlay);
    const issues = [];
    if (compiled.source.lyricOverlayHash !== expectedHash) issues.push("compiler-lyric-contract-hash-mismatch");
    if (contract.enabled && !compiledTrack) issues.push("enabled-lyric-instance-missing");
    if (!contract.enabled && compiledTrack) issues.push("disabled-lyric-instance-unexpected");
    if (contract.enabled && compiledTrack?.lines?.length !== overlayLines.length) issues.push("compiled-line-count-mismatch");
    if (contract.enabled && compiledTrack?.templateId !== contract.templateId) issues.push("compiled-template-mismatch");
    if (!script.includes("window.HAPA_LYRIC_CONTRACT")) issues.push("hyperframes-contract-missing");
    if (!script.includes("window.HAPA_LYRIC_TIMING")) issues.push("hyperframes-timing-missing");
    if (contract.enabled !== script.includes('data-composition-id="hapa-lyric-layer"')) issues.push("hyperframes-enabled-state-mismatch");
    const qualityRow = qualityBySong.get(String(project.song_id || ""));
    const safetyRow = safetyBySong.get(String(project.song_id || ""));
    if (qualityRow?.status !== "verified") issues.push("quality-audit-not-verified");
    if (safetyRow?.status !== "verified") issues.push("render-safety-not-verified");
    const liveSafety = inspectEchoLyricRenderSafety({ project });
    if (!liveSafety.ok) issues.push(...liveSafety.issues.map((issue) => `live-safety:${issue.code}`));
    return {
      file,
      songId: String(project.song_id || ""),
      title: String(project.song_title || project.song_id || ""),
      recent: recentIds.has(String(project.song_id || "")),
      enabled: contract.enabled,
      templateId: contract.templateId,
      outputProfileId: compiled.outputProfile?.id || null,
      lineCount: overlayLines.length,
      wordCount: overlayLines.reduce((sum, line) => sum + Number(line.words?.length || 0), 0),
      contractHash: expectedHash,
      compiledHash: compiled.source.lyricOverlayHash,
      status: issues.length ? "blocked" : "verified",
      issues,
    };
  });

const representativeSample = [...projects]
  .sort((left, right) => (
    Number(right.recent) - Number(left.recent)
    || right.wordCount - left.wordCount
    || left.title.localeCompare(right.title)
  ))
  .slice(0, 24);
const report = {
  schemaVersion: "hapa.echo.lyric-full-album-acceptance.v1",
  generatedAt: new Date().toISOString(),
  mutationMode: "read-only",
  ok: projects.length === 157
    && projects.every((project) => project.status === "verified")
    && quality.summary?.verified === 157
    && safety.ok === true
    && renderedParity.ok === true,
  summary: {
    projects: projects.length,
    statuses: countBy(projects.map((project) => project.status)),
    enabledProjects: projects.filter((project) => project.enabled).length,
    disabledProjects: projects.filter((project) => !project.enabled).length,
    recentProjects: projects.filter((project) => project.recent).length,
    compiledLyricLines: projects.reduce((sum, project) => sum + project.lineCount, 0),
    compiledLyricWords: projects.reduce((sum, project) => sum + project.wordCount, 0),
    templates: countBy(projects.map((project) => project.templateId)),
    outputProfiles: countBy(projects.map((project) => project.outputProfileId)),
    issueCounts: countBy(projects.flatMap((project) => project.issues)),
  },
  sourceGates: {
    quality: { ok: quality.summary?.verified === 157, path: QUALITY_PATH, summary: quality.summary },
    safety: { ok: safety.ok === true, path: SAFETY_PATH, summary: safety.summary, runtimeBenchmark: safety.runtimeBenchmark },
    renderedParity: { ok: renderedParity.ok === true, path: PARITY_PATH, cases: renderedParity.cases },
  },
  representativeSamplePolicy: "24-project deterministic acceptance sample ordered recent-first, then densest word timing; all 157 remain machine-verified individually.",
  representativeSample,
  blocked: projects.filter((project) => project.status === "blocked"),
  projects,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: report.ok, output: OUTPUT_PATH, summary: report.summary, blocked: report.blocked.length }, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
