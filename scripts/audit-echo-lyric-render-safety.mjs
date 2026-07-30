#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  benchmarkEchoLyricTemplateRuntime,
  inspectEchoLyricRenderSafety,
} from "../src/domain/echo-lyric-render-safety.js";
import { attachEchoLyricContract } from "../src/domain/echo-lyric-contract.js";

const ROOT = path.resolve(".");
const PROJECTS_DIR = path.join(ROOT, "data/music-video-projects");
const OUTPUT_PATH = path.join(ROOT, "artifacts/echo-lyric-quality-v4/render-safety.json");

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, "utf8"));
const projectBody = (value) => value?.music_video_project || value?.project || value || {};
const countBy = (values) => Object.fromEntries([...values.reduce(
  (map, value) => map.set(value, (map.get(value) || 0) + 1),
  new Map(),
)].sort());

const projects = fs.readdirSync(PROJECTS_DIR)
  .filter((file) => file.endsWith(".json"))
  .sort()
  .map((file) => {
    const project = attachEchoLyricContract(projectBody(readJson(path.join(PROJECTS_DIR, file))));
    const report = inspectEchoLyricRenderSafety({ project });
    return {
      file,
      songId: String(project.song_id || ""),
      title: String(project.song_title || project.song_id || ""),
      enabled: report.enabled,
      templateId: report.templateId,
      profileId: report.profileId,
      lineCount: report.lineCount,
      wordCount: report.wordCount,
      status: report.ok ? "verified" : "blocked",
      issues: report.issues,
      runtime: report.runtime,
    };
  });

const runtimeBenchmark = benchmarkEchoLyricTemplateRuntime();
const report = {
  schemaVersion: "hapa.echo.lyric-render-safety-audit.v1",
  generatedAt: new Date().toISOString(),
  mutationMode: "read-only",
  ok: projects.every((project) => project.status === "verified") && runtimeBenchmark.ok,
  summary: {
    projects: projects.length,
    statuses: countBy(projects.map((project) => project.status)),
    enabledProjects: projects.filter((project) => project.enabled).length,
    disabledProjects: projects.filter((project) => !project.enabled).length,
    issueCounts: countBy(projects.flatMap((project) => project.issues.map((issue) => issue.code))),
  },
  representativeProfiles: [
    { id: "landscape", aspectRatio: "16:9", width: 1920, height: 1080, status: "covered-by-domain-matrix" },
    { id: "vertical", aspectRatio: "9:16", width: 1080, height: 1920, status: "covered-by-domain-matrix" },
    { id: "square", aspectRatio: "1:1", width: 1080, height: 1080, status: "covered-by-domain-matrix" },
  ],
  runtimeBenchmark,
  projects,
};

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: report.ok, output: OUTPUT_PATH, summary: report.summary, runtimeBenchmark }, null, 2)}\n`);
if (!report.ok) process.exitCode = 1;
