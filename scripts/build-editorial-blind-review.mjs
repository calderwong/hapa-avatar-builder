#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildDirectorV2Artifacts, compileDirectorVariant } from "../src/domain/echo-director-v2.js";
import { createBlindEditorialPacket, EDITORIAL_QUALITY_RUBRIC, evaluateVariantGraduation } from "../src/domain/editorial-quality-review.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9) || path.join(root, "artifacts/editorial-blind-review"));
const manifest = JSON.parse(fs.readFileSync("/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json", "utf8"));
const registryPath = "/Users/calderwong/Desktop/hapa-song-registry/data/registry.json";
const registry = fs.existsSync(registryPath) ? JSON.parse(fs.readFileSync(registryPath, "utf8")) : null;
const fixtures = [
  ["dear-papa-song-dear-papa", "Dear Papa"],
  ["dear-papa-song-catch-the-rabbit", "Catch the Rabbit"],
  ["dear-papa-song-3-a-m-emoji-pain", "3 a.m. Emoji Pain"],
];
fs.mkdirSync(output, { recursive: true });
fs.mkdirSync(path.join(output, ".sealed"), { recursive: true });

const songs = [];
for (const [songId, title] of fixtures) {
  const projectPath = path.join(root, "data/music-video-projects", `${songId}-video-project.json`);
  const payload = JSON.parse(fs.readFileSync(projectPath, "utf8"));
  const project = payload.music_video_project || payload;
  const base = buildDirectorV2Artifacts({ project: payload, manifest, registry, duration: Number(project.duration), recipe: "conservative", seed: `blind:${songId}:base`, avatarRoot: root });
  const candidates = [{ pipelineId: "current", graph: projectToEditorGraph(project) }];
  for (const recipe of ["conservative", "kinetic", "visualizer-forward"]) candidates.push({ pipelineId: recipe, graph: compileDirectorVariant({ treatment: base.treatment, cueGraph: base.cueGraph, recipe, seed: `blind:${songId}:${recipe}`, sourceProject: payload }) });
  const songDir = path.join(output, "graphs", songId);
  fs.mkdirSync(songDir, { recursive: true });
  for (const candidate of candidates) {
    const graphRef = `graphs/${songId}/${candidate.pipelineId}.native-show-graph.json`;
    fs.writeFileSync(path.join(output, graphRef), `${JSON.stringify(candidate.graph, null, 2)}\n`);
    candidate.graphRef = graphRef;
    candidate.gates = { safety: "pending-export", playback: "pending-export" };
  }
  songs.push({ songId, title, stemTruth: (project.stems_available || []).length ? "registry-stems-declared" : "no-isolated-stems", candidates });
}

const { packet, answerKey } = createBlindEditorialPacket({ songs, createdAt: "2026-07-11T08:20:00Z" });
fs.mkdirSync(path.join(output, "review-graphs"), { recursive: true });
for (const comparison of packet.comparisons) for (const candidate of comparison.candidates) {
  const answer = answerKey.answers.find((row) => row.comparisonId === comparison.comparisonId && row.anonymousId === candidate.anonymousId);
  fs.copyFileSync(path.join(output, answer.graphRef), path.join(output, candidate.graphRef));
}
fs.writeFileSync(path.join(output, "review-packet.json"), `${JSON.stringify(packet, null, 2)}\n`);
fs.writeFileSync(path.join(output, ".sealed/answer-key.json"), `${JSON.stringify(answerKey, null, 2)}\n`);
const baseline = Object.fromEntries(EDITORIAL_QUALITY_RUBRIC.map((row) => [row.id, 3]));
const passing = { ...baseline, "musical-alignment": 4, "motion-intent": 4 };
const graduationProof = {
  passFixture: evaluateVariantGraduation({ baselineScores: baseline, candidateScores: passing, targetDimensions: ["musical-alignment", "motion-intent"], gates: { safety: "pass", playback: "pass" } }),
  safetyBlockedFixture: evaluateVariantGraduation({ baselineScores: baseline, candidateScores: passing, targetDimensions: ["musical-alignment"], gates: { safety: "pending-export", playback: "pass" } }),
  regressionBlockedFixture: evaluateVariantGraduation({ baselineScores: baseline, candidateScores: { ...passing, "lyric-legibility": 2 }, targetDimensions: ["musical-alignment"], gates: { safety: "pass", playback: "pass" } }),
};
const publicText = JSON.stringify(packet).replaceAll("<", "\\u003c");
const html = `<!doctype html><meta charset="utf-8"><title>Echo Blind Editorial Review</title><style>body{font:14px system-ui;background:#060a12;color:#eef6ff;margin:24px;max-width:1200px}.song,.cut,.rubric{border:1px solid #28425e;padding:14px;margin:12px 0;background:#0a1220}.cuts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.timeline{height:18px;background:linear-gradient(90deg,#17485d,#69407b,#9a5d38,#17485d);margin:8px 0}label{display:block;margin:6px 0}select,input{background:#050912;color:white;border:1px solid #52718e;padding:5px}input{width:60%}button{padding:10px 16px;background:#18d5df;border:0;font-weight:700}.anchor{font-size:11px;color:#a9bdd0}</style><h1>Echo blind editorial quality review</h1><p>Pipeline identities are sealed. Score each anonymous cut from 1–5 and attach a playback timestamp plus a concrete note. Current exports remain ineligible for graduation until safety and playback gates pass.</p><button onclick="download()">Export timestamped review</button><div id="app"></div><script>const packet=${publicText};const scores=[];const app=document.getElementById('app');for(const song of packet.comparisons){const section=document.createElement('section');section.className='song';section.innerHTML='<h2>'+song.title+'</h2><p>'+song.stemTruth+'</p><div class="cuts"></div>';const cuts=section.querySelector('.cuts');for(const cut of song.candidates){const el=document.createElement('article');el.className='cut';el.innerHTML='<h3>'+cut.anonymousId.split(':').at(-1)+'</h3><div class="timeline"></div><p>'+cut.summary.cardCount+' cards · '+cut.summary.visualizerCards+' IVF/ISF · gates '+cut.gates.safety+'/'+cut.gates.playback+'</p>';for(const d of packet.rubric){const row=document.createElement('label');row.innerHTML=d.label+' <select><option value="">–</option>'+[1,2,3,4,5].map(n=>'<option>'+n+'</option>').join('')+'</select> @ <input type="number" min="0" step="0.01" placeholder="seconds"> <input placeholder="timestamped note"><div class="anchor">1: '+d.anchors[1]+' · 3: '+d.anchors[3]+' · 5: '+d.anchors[5]+'</div>';const [select,time,note]=row.querySelectorAll('select,input');const save=()=>{if(!select.value||!time.value||!note.value.trim())return;const entry={comparisonId:song.comparisonId,anonymousId:cut.anonymousId,dimensionId:d.id,score:Number(select.value),atSeconds:Number(time.value),note:note.value.trim(),recordedAt:new Date().toISOString()};const i=scores.findIndex(x=>x.comparisonId===entry.comparisonId&&x.anonymousId===entry.anonymousId&&x.dimensionId===entry.dimensionId);if(i>=0)scores[i]=entry;else scores.push(entry)};select.onchange=save;time.onchange=save;note.onchange=save;el.appendChild(row)}cuts.appendChild(el)}app.appendChild(section)}function download(){const blob=new Blob([JSON.stringify({schemaVersion:'hapa.director.editorial-blind-votes.v1',scores},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='echo-editorial-blind-review.json';a.click()}</script>`;
fs.writeFileSync(path.join(output, "index.html"), html);
const report = { schemaVersion: "hapa.director.editorial-blind-review-proof.v1", ok: packet.blinded && packet.comparisons.length === 3 && packet.comparisons.every((row) => row.candidates.length === 4) && packet.rubric.every((row) => Object.keys(row.anchors).length === 5) && graduationProof.passFixture.graduated && !graduationProof.safetyBlockedFixture.graduated && !graduationProof.regressionBlockedFixture.graduated, reviewStatus: "awaiting-human-blind-scores", comparisons: packet.comparisons.map((row) => ({ songId: row.comparisonId, title: row.title, stemTruth: row.stemTruth, anonymousCuts: row.candidates.map((cut) => cut.anonymousId) })), rubricDimensions: packet.rubric.map((row) => row.id), timestampedNotesRequired: true, identitiesSealedOutsidePacket: true, gates: graduationProof };
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, songs: report.comparisons.length, cuts: report.comparisons.length * 4, dimensions: report.rubricDimensions.length, status: report.reviewStatus }, null, 2));
if (!report.ok) process.exitCode = 1;
