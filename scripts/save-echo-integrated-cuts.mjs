#!/usr/bin/env node
// Saves approved integrated performance plans as append-only Director cuts (IP-11).
//
// Foreground and in-process: no workers, renders or analysis jobs. For each song
// it reads one treatment's plan.json / project.json / hyperframe.html from a
// compile-echo-integrated-performances output, refuses a plan whose song project
// changed since it was compiled, derives the cut exactly as the Director will
// (and checks all five layers plus the cut's own telemetry), then writes one new
// cut file. Existing cuts and song projects are never changed. Dry run unless
// --apply; --apply needs the operator approval (--approved-by and --request).
//
//   node scripts/save-echo-integrated-cuts.mjs --plans=DIR [--treatment=dust-chorus] [--songs=a,b]
//     [--apply --approved-by=NAME --request=TEXT]
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { buildEchoIntegratedPerformanceCut, echoIntegratedPerformanceCutId } from "../src/domain/echo-integrated-performance.js";
import { deriveEchoDirectionVariantProject, echoDirectionVariantFingerprint } from "../src/domain/echo-direction-variants.js";
import {
  projectEchoRuntimeShaderRepairProvenance, repairEchoRuntimeDirectionVariant, repairEchoRuntimeShaderGraph, repairEchoRuntimeVisualizerTimeline,
} from "../src/domain/echo-runtime-shader-repair.js";
import { EchoIsfAssetCatalog } from "../server/echo-isf-assets.mjs";

const root = path.resolve(import.meta.dirname, "..");
const data = path.join(root, "data");
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const APPLY = process.argv.includes("--apply");
const plansDir = arg("plans") ? path.resolve(arg("plans")) : null;
const treatment = arg("treatment") || "dust-chorus";
const onlySongs = arg("songs") ? new Set(arg("songs").split(",")) : null;
const approval = { approvedBy: arg("approved-by") || "", request: arg("request") || "" };
if (!plansDir || !fs.existsSync(plansDir)) throw new Error("--plans=DIR must name a compile-echo-integrated-performances output.");
if (APPLY && (!approval.approvedBy.trim() || !approval.request.trim())) throw new Error("--apply needs --approved-by and --request: the operator approval is part of the cut's lineage.");

const startedAt = new Date().toISOString();
const projectsDir = path.join(data, "music-video-projects");
const albumDir = path.join(root, "artifacts/echo-director-v2/album");
const musicVizRoot = arg("music-viz-root") || path.join(process.env.HOME || "", "Desktop/hapa-music-viz");
const shaderCatalog = (await new EchoIsfAssetCatalog({ musicVizRoot, cacheCheckMs: 0 }).load()).shaders;
const variantsDir = path.join(data, "music-video-project-variants");
const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

/**
 * What certification will publish for this cut: the same base graph, runtime
 * shader repair and derive the readiness preflight uses, measured.
 */
function deriveEvidence(rawProject, songId, cut, relativePath) {
  const compiledGraph = readJson(path.join(albumDir, songId, "native-show-graph.json"));
  const graphRepair = repairEchoRuntimeShaderGraph(compiledGraph, shaderCatalog, "project:director-show-graph");
  const timelineRepair = repairEchoRuntimeVisualizerTimeline(rawProject.visualizer_timeline, shaderCatalog, "project:visualizer-timeline");
  const baseProject = { ...rawProject, visualizer_timeline: timelineRepair.timeline, director_show_graph: projectEchoRuntimeShaderRepairProvenance(graphRepair.graph, timelineRepair).graph };
  const saved = { ...cut, variant_source: { kind: "append-only-project-variant", path: relativePath } };
  const repaired = repairEchoRuntimeDirectionVariant(saved, { catalog: shaderCatalog, sourceProfile: true, selected: true, baseProject }).variant;
  const derived = deriveEchoDirectionVariantProject(baseProject, repaired, { identityVariant: saved });
  const graph = derived.director_show_graph;
  const tracks = graph.tracks || [];
  const cards = tracks.filter((t) => t.role !== "accent").flatMap((t) => t.cards || []);
  const keys = new Set(cards.flatMap((c) => [c.id, c.cueId].filter(Boolean)));
  const bindings = graph.directorV2?.modulationBindings || [];
  const uniforms = bindings.filter((b) => b.target?.kind === "visualizer_uniform");
  const slotCards = tracks.filter((t) => t.id.startsWith("track-shader-always-on-")).flatMap((t) => t.cards || []);
  const evidence = {
    validation: derived.active_direction_script_variant?.projectionValidation?.ok === true,
    mediaShots: tracks.filter((t) => t.role === "media" || t.role === "foundation").flatMap((t) => t.cards || []).length,
    shaderCards: cards.filter((c) => c.visualization && !String(c.cueId || "").startsWith("visualizer:persistent:")).length,
    alwaysOnSlots: slotCards.length,
    livingLightCues: (graph.livingLight?.cues || []).length,
    scoreDust: graph.scoreDust?.status || null,
    ownShaderBindings: uniforms.filter((b) => keys.has(b.target.visualizerId)).length,
    danglingBindings: uniforms.filter((b) => !keys.has(b.target.visualizerId)).length,
    slotOpacityBindings: bindings.filter((b) => b.target?.kind === "visualizer_opacity").length,
    sectionEnergy: graph.directorV2?.cutModulation?.sectionEnergy || null,
  };
  const gaps = [];
  if (!evidence.validation) gaps.push("projection-validation");
  if (!evidence.mediaShots) gaps.push("media");
  if (!evidence.shaderCards) gaps.push("shaders");
  if (!evidence.alwaysOnSlots) gaps.push("always-on");
  if (!evidence.livingLightCues) gaps.push("living-light");
  if (!evidence.scoreDust) gaps.push("score-dust");
  if (!evidence.ownShaderBindings) gaps.push("shader-telemetry");
  if (evidence.danglingBindings) gaps.push("dangling-bindings");
  if (evidence.slotOpacityBindings !== evidence.alwaysOnSlots) gaps.push("slot-opacity");
  return { ...evidence, gaps };
}

const songs = fs.readdirSync(plansDir).filter((song) => fs.existsSync(path.join(plansDir, song, treatment, "plan.json"))).sort()
  .filter((song) => !onlySongs || onlySongs.has(song));
const rows = [];
const backupManifest = {};
for (const [index, songId] of songs.entries()) {
  const t0 = Date.now();
  const row = { songId, status: null };
  try {
    const dir = path.join(plansDir, songId, treatment);
    const plan = readJson(path.join(dir, "plan.json"));
    const project = readJson(path.join(dir, "project.json"));
    const projectPath = path.join(projectsDir, `${songId}-video-project.json`);
    const projectBytes = fs.readFileSync(projectPath);
    const parentProjectSha256 = sha256(projectBytes);
    if (plan.compiled?.livingLightResolved !== true) throw Object.assign(new Error("The plan's Living Light cues were not resolved against the saved Journey. Recompile the plan."), { code: "unresolved-living-light" });
    if (plan.compiled?.sourceProjectSha256 !== parentProjectSha256) throw Object.assign(new Error("The song project changed after this plan was compiled. Recompile the plan."), { code: "stale-plan" });
    const raw = JSON.parse(projectBytes.toString("utf8"));
    const baseProject = raw.music_video_project || raw.project || raw;
    const id = echoIntegratedPerformanceCutId(plan);
    const relativePath = `${songId}/${id}.json`;
    const cutPath = path.join(variantsDir, relativePath);
    const existing = fs.existsSync(cutPath) ? readJson(cutPath) : null;
    const cut = buildEchoIntegratedPerformanceCut({ plan, project, hyperframeScript: fs.readFileSync(path.join(dir, "hyperframe.html"), "utf8"), parentProjectSha256,
      approval: existing ? existing.lineage.approval : APPLY ? { ...approval, approvedAt: startedAt } : { approvedBy: "(dry run)", request: "(dry run)", approvedAt: startedAt }, createdAt: existing ? existing.createdAt : startedAt });
    Object.assign(row, { cutId: id, planId: plan.planId, fingerprint: cut.fingerprint });
    if (existing) {
      if (echoDirectionVariantFingerprint(existing) !== cut.fingerprint) throw Object.assign(new Error(`A different cut already uses ${relativePath}.`), { code: "append-only-conflict" });
      row.status = "already-saved";
    } else {
      row.evidence = deriveEvidence(baseProject, songId, cut, relativePath);
      if (row.evidence.gaps.length) throw Object.assign(new Error(`The derived cut is missing ${row.evidence.gaps.join(", ")}.`), { code: "incomplete-cut" });
      if (APPLY) {
        const songDir = path.join(variantsDir, songId);
        backupManifest[songId] = fs.existsSync(songDir) ? fs.readdirSync(songDir).filter((f) => f.endsWith(".json")).sort().map((f) => ({ file: f, sha256: sha256(fs.readFileSync(path.join(songDir, f))) })) : [];
        fs.mkdirSync(songDir, { recursive: true });
        fs.writeFileSync(cutPath, `${JSON.stringify(cut, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
        row.status = "saved";
      } else row.status = "would-save";
    }
  } catch (error) {
    Object.assign(row, { status: "refused", code: error.code || "error", message: error.message });
  }
  row.seconds = Number(((Date.now() - t0) / 1000).toFixed(1));
  rows.push(row);
  const e = row.evidence;
  console.log(`[${index + 1}/${songs.length}] ${songId} ${row.status}${row.cutId ? ` ${row.cutId}` : ""}${e ? ` · shots ${e.mediaShots} · shaders ${e.shaderCards} · slots ${e.alwaysOnSlots} (opacity ${e.slotOpacityBindings}) · LL ${e.livingLightCues} · dust ${e.scoreDust} · bindings ${e.ownShaderBindings}` : ""}${row.message ? ` · ${row.message}` : ""} · ${row.seconds}s`);
}

const counts = rows.reduce((acc, row) => ({ ...acc, [row.status]: (acc[row.status] || 0) + 1 }), {});
const runId = `echo-integrated-cuts-${treatment}-${startedAt.replace(/[:.]/g, "-")}`;
const report = { schemaVersion: "hapa.echo.integrated-cut-save-report.v1", runId, mode: APPLY ? "apply" : "dry-run", treatment, plans: path.relative(root, plansDir), startedAt, finishedAt: new Date().toISOString(),
  approval: APPLY ? approval : null, counts, validation: { appendOnly: true, existingCutsMutated: 0, songProjectsMutated: 0 }, rows };
if (APPLY && Object.keys(backupManifest).length) {
  // Saves only add files; the manifest records every existing cut file before the write.
  const backupDir = path.join(data, "backups", runId);
  fs.mkdirSync(backupDir, { recursive: true });
  fs.writeFileSync(path.join(backupDir, "variant-files-before.json"), `${JSON.stringify(backupManifest, null, 2)}\n`);
  report.backup = path.relative(root, backupDir);
}
const reportPath = path.join(data, "merge-reports", `${runId}${APPLY ? "" : "-dry-run"}.json`);
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ mode: report.mode, songs: rows.length, counts, report: path.relative(root, reportPath) }));
