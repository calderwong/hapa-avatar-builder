#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import {
  ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
  normalizeEchoPersistentShaderSlots,
} from "../src/domain/echo-persistent-shader-slots.js";
import { generateEchoHyperframeScript } from "../src/domain/echo-hyperframe-script.js";

const ROOT = path.resolve(import.meta.dirname, "..");
const argv = new Set(process.argv.slice(2));
const apply = argv.has("--apply");
const projectsRoot = path.join(ROOT, "data/music-video-projects");
const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupRoot = path.join(ROOT, "data/backups", `echo-persistent-shader-slots-${timestamp}`);
const reportPath = path.join(ROOT, "data/merge-reports", `echo-persistent-shader-slots-${timestamp}.json`);

const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const files = fs.readdirSync(projectsRoot)
  .filter((name) => name.endsWith(".json"))
  .sort();
const rows = [];

for (const name of files) {
  const filePath = path.join(projectsRoot, name);
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const project = payload.music_video_project || payload;
  const persistentShaderSlots = normalizeEchoPersistentShaderSlots(project);
  const candidate = {
    ...project,
    persistent_shader_slots_schema: ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
    persistent_shader_slots: persistentShaderSlots,
  };
  candidate.hyperframe_script = generateEchoHyperframeScript(candidate);
  const changed = project.persistent_shader_slots_schema !== ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA
    || !same(project.persistent_shader_slots, persistentShaderSlots)
    || project.hyperframe_script !== candidate.hyperframe_script;
  rows.push({
    file: name,
    songId: String(project.song_id || ""),
    changed,
    enabledSlots: persistentShaderSlots.filter((slot) => slot.enabled).length,
    slotIds: persistentShaderSlots.map((slot) => slot.id),
  });
  if (!apply || !changed) continue;
  fs.mkdirSync(backupRoot, { recursive: true });
  fs.copyFileSync(filePath, path.join(backupRoot, name));
  candidate.updated_at = new Date().toISOString();
  const nextPayload = payload.music_video_project
    ? { ...payload, music_video_project: candidate }
    : candidate;
  fs.writeFileSync(filePath, `${JSON.stringify(nextPayload, null, 2)}\n`);
}

const report = {
  schemaVersion: "hapa.echo.persistent-shader-slot-backfill-report.v1",
  generatedAt: new Date().toISOString(),
  mode: apply ? "apply" : "dry-run",
  projectCount: rows.length,
  changedCount: rows.filter((row) => row.changed).length,
  unchangedCount: rows.filter((row) => !row.changed).length,
  backupRoot: apply && rows.some((row) => row.changed) ? backupRoot : null,
  rows,
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  mode: report.mode,
  projectCount: report.projectCount,
  changedCount: report.changedCount,
  backupRoot: report.backupRoot,
  reportPath,
}, null, 2));
