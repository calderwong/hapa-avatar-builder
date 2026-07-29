#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import {
  attachEchoLyricContract,
  ECHO_LYRIC_CONTRACT_SCHEMA,
} from "../src/domain/echo-lyric-contract.js";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";

const ROOT = path.resolve(".");
const PROJECTS_DIR = path.join(ROOT, "data/music-video-projects");
const BACKUPS_DIR = path.join(ROOT, "data/backups");
const REPORTS_DIR = path.join(ROOT, "data/merge-reports");
const APPLY = process.argv.includes("--apply");
const RUN_ID = new Date().toISOString().replace(/[:.]/g, "-");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function projectBody(payload) {
  return payload?.music_video_project || payload?.project || payload || {};
}

function replaceProjectBody(payload, project) {
  if (payload?.music_video_project) return { ...payload, music_video_project: project };
  if (payload?.project) return { ...payload, project };
  return project;
}

const files = fs.readdirSync(PROJECTS_DIR).filter((file) => file.endsWith(".json")).sort();
const planned = [];
for (const file of files) {
  const filePath = path.join(PROJECTS_DIR, file);
  const payload = readJson(filePath);
  const project = projectBody(payload);
  const normalized = attachEchoLyricContract(project);
  normalized.hyperframe_script = generateEchoHyperframeScript(normalized);
  normalized.hyperframe_script_stale = false;
  const nextPayload = replaceProjectBody(payload, normalized);
  const before = JSON.stringify(payload);
  const after = JSON.stringify(nextPayload);
  planned.push({
    file,
    filePath,
    changed: before !== after,
    enabled: normalized.lyrics.enabled,
    templateId: normalized.lyrics.templateId,
    lineCount: Array.isArray(normalized.timed_lyrics) ? normalized.timed_lyrics.length : 0,
    nextPayload,
  });
}

const changed = planned.filter((row) => row.changed);
const report = {
  schemaVersion: "hapa.echo.lyric-contract-backfill.v1",
  mutationMode: APPLY ? "apply" : "dry-run",
  runId: RUN_ID,
  contractSchema: ECHO_LYRIC_CONTRACT_SCHEMA,
  projects: planned.length,
  changed: changed.length,
  enabled: planned.filter((row) => row.enabled).length,
  disabled: planned.filter((row) => !row.enabled).length,
  templates: Object.fromEntries([...planned.reduce((map, row) => map.set(row.templateId, (map.get(row.templateId) || 0) + 1), new Map())].sort()),
  rows: planned.map(({ nextPayload, filePath, ...row }) => row),
};

if (APPLY && changed.length > 0) {
  const backupDir = path.join(BACKUPS_DIR, `echo-lyric-contract-${RUN_ID}`);
  fs.mkdirSync(backupDir, { recursive: true });
  for (const row of changed) {
    fs.copyFileSync(row.filePath, path.join(backupDir, row.file));
    fs.writeFileSync(row.filePath, `${JSON.stringify(row.nextPayload, null, 2)}\n`);
  }
  report.backupDir = backupDir;
}

fs.mkdirSync(REPORTS_DIR, { recursive: true });
const reportPath = path.join(REPORTS_DIR, `echo-lyric-contract-${RUN_ID}.json`);
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ok: true, reportPath, ...Object.fromEntries(Object.entries(report).filter(([key]) => key !== "rows")) }, null, 2)}\n`);
