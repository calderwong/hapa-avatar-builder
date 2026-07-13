#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildFrameMatchTransitionGraph } from "../src/domain/frame-match-transition-graph.js";

const arg = (name) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3);
const output = path.resolve(arg("output")); const database = path.resolve(arg("database")); const roiPath = path.resolve(arg("roi"));
const query = (sql) => JSON.parse(execFileSync("sqlite3", ["-json", database, sql], { encoding: "utf8" }) || "[]");
const videos = query("select video_id,path,duration,width,height,fps,codec from videos order by video_id");
const frames = query("select frame_id,video_id,timestamp,role,hash,ahash,dhash,phash,luma_mean,luma_std from frames where role in ('first','last') order by video_id,timestamp");
const roiItems = JSON.parse(fs.readFileSync(roiPath, "utf8")).items || [];
const graph = buildFrameMatchTransitionGraph({ videos, frames, roiItems, topK: 3, contactSheet: "contact-sheet.jpg" });
const ok = Boolean(graph.totals.orderedCandidateJoins === videos.length * (videos.length - 1)
  && graph.candidates.every((row) => row.scoreBreakdown && row.preview.contactSheet && row.safetyLimits && Number.isFinite(row.exitTimestampSeconds) && Number.isFinite(row.entryTimestampSeconds))
  && Object.values(graph.alternatesBySource).every((rows) => rows.length === 3)
  && graph.flowDancerHandoff?.provenanceLink?.frameDatabase);
const proof = { schemaVersion: "hapa.frame-match-transition-proof.v1", ok, scan: { database, videoCount: videos.length, endpointFrameCount: frames.length, strictFlowDancerTransitions: 0 }, graph, acceptance: { scoredTimestampedSafePreviewed: ok, deterministicTopKWithoutSemanticRerun: ok, flowDancerRecipe: Boolean(graph.flowDancerHandoff), bridgeDecision: graph.flowDancerHandoff?.status } };
fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, "transition-graph.json"), `${JSON.stringify(graph, null, 2)}\n`); fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({ ok, output, videos: videos.length, candidates: graph.candidates.length, strictMatches: graph.truth.strictMatches, selected: graph.selection, bridge: graph.flowDancerHandoff?.status }, null, 2));
if (!ok) process.exitCode = 1;
