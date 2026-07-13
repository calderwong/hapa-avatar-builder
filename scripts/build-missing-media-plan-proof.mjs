#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildMissingMediaPlan, registerGeneratedMediaCandidate } from "../src/domain/missing-media-plan.js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
const projectsRoot = path.join(root, "data/music-video-projects");
const contextRoot = path.join(path.dirname(output), "song-context-packets/packets");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(path.join(output, "plans"), { recursive: true });
const plans = [];
for (const file of fs.readdirSync(projectsRoot).filter((name) => name.endsWith(".json")).sort()) {
  const payload = JSON.parse(fs.readFileSync(path.join(projectsRoot, file), "utf8"));
  const project = payload.music_video_project || payload;
  const contextPath = path.join(contextRoot, `${project.song_id}.json`);
  const contextPacket = fs.existsSync(contextPath) ? JSON.parse(fs.readFileSync(contextPath, "utf8")) : null;
  const plan = buildMissingMediaPlan(project, { contextPacket, maxRequests: 3, fps: 30 });
  fs.writeFileSync(path.join(output, "plans", `${project.song_id}.json`), `${JSON.stringify(plan, null, 2)}\n`);
  plans.push(plan);
}
const samplePlan = plans.find((plan) => plan.requests.length);
const candidateFixture = registerGeneratedMediaCandidate(samplePlan, samplePlan.requests[0].id, { contentHash: "d".repeat(64), path: "/local/hapa-mlx/proof-candidate.mp4", prompt: "bounded proof prompt", model: "local-proof", seed: "fixed" }, { sourceNodeId: "hapa-mlx-station", operator: "proof-reviewer", receivedAt: "2026-07-11T10:10:00Z" });
const requests = plans.flatMap((plan) => plan.requests);
const counts = Object.fromEntries(["required", "optional", "symbolic-substitute"].map((kind) => [kind, requests.filter((request) => request.gapKind === kind).length]));
const report = { schemaVersion: "hapa.director.missing-media-plan-proof.v1", ok: plans.length === 79 && plans.every((plan) => plan.requests.length <= 3 && plan.renderableWhilePending && plan.placeholderTreatment.neverSilentReplacement) && requests.every((request) => request.character && request.continuity && request.framing && request.motion && request.frameRange && request.sourceAnchors.length && request.intendedCue && request.status === "planned-human-approval-required") && candidateFixture.status === "candidate-pending-human-review", plans: plans.length, totalScoredGaps: plans.reduce((sum, plan) => sum + plan.totalScoredGaps, 0), boundedRequests: requests.length, counts, songsWithRequests: plans.filter((plan) => plan.requests.length).length, placeholderTreatment: plans[0].placeholderTreatment, generatedCandidateFixture: candidateFixture, paidOrRemoteGenerationStarted: false };
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, plans: report.plans, totalScoredGaps: report.totalScoredGaps, boundedRequests: report.boundedRequests, counts: report.counts, songsWithRequests: report.songsWithRequests, candidateStatus: candidateFixture.status, generationStarted: report.paidOrRemoteGenerationStarted }, null, 2));
if (!report.ok) process.exitCode = 1;
