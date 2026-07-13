#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendShotPreferenceEvent, inspectStoredShotDecision } from "../src/domain/shot-decision-inspector.js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
const projectsRoot = path.join(root, "data/music-video-projects");
const rows = [];
for (const file of fs.readdirSync(projectsRoot).filter((name) => name.endsWith(".json")).sort()) {
  const payload = JSON.parse(fs.readFileSync(path.join(projectsRoot, file), "utf8"));
  const project = payload.music_video_project || payload;
  for (const shot of project.timeline || []) {
    const inspector = inspectStoredShotDecision(shot);
    rows.push({ songId: project.song_id, shotIndex: shot.shot_index, reviewStatus: inspector.reviewStatus, selectedMediaId: inspector.selectedMedia.id, evidenceDimensions: inspector.lyricCanonMediaEvidence.length, alternatives: inspector.alternatives.length, alternativesWithScores: inspector.alternatives.filter((row) => row.components && Number.isFinite(row.utility)).length, alternativesWithPreview: inspector.alternatives.filter((row) => row.uri || row.posterUri).length, rendererStatus: inspector.rendererTruth.schemaVersion || inspector.rendererTruth.status, confidence: inspector.selectedScore.confidence, confidenceBasis: inspector.selectedScore.confidenceBasis, sourceSnapshotHash: inspector.sourceSnapshotHash });
  }
}
const samplePayload = JSON.parse(fs.readFileSync(path.join(projectsRoot, "dear-papa-song-dear-papa-video-project.json"), "utf8"));
const sampleShot = (samplePayload.music_video_project || samplePayload).timeline[0];
const sampleInspector = inspectStoredShotDecision(sampleShot);
let preferences = [];
for (const [index, action] of ["pin", "ban", "replace"].entries()) preferences = appendShotPreferenceEvent(preferences, { inspector: sampleInspector, action, targetMediaId: action === "replace" ? sampleInspector.alternatives[0]?.mediaId : sampleInspector.selectedMedia.id, operator: "proof-reviewer", rationale: `Proof ${action} action from stored inspector evidence.`, at: `2026-07-11T09:2${index}:00Z` }).events;
const report = { schemaVersion: "hapa.director.shot-inspector-proof.v1", ok: rows.length === 4477 && rows.every((row) => row.evidenceDimensions > 0 && row.sourceSnapshotHash) && rows.filter((row) => row.alternatives > 0).every((row) => row.alternativesWithScores > 0 && row.alternativesWithPreview > 0) && preferences.length === 3 && preferences.every((event) => event.mutationPolicy === "append-only-source-shot-unchanged"), shots: rows.length, proposedPendingReview: rows.filter((row) => /pending/.test(row.reviewStatus)).length, legacyUnmeasured: rows.filter((row) => row.reviewStatus === "legacy-unmeasured").length, shotsWithAlternatives: rows.filter((row) => row.alternatives > 0).length, alternatives: rows.reduce((sum, row) => sum + row.alternatives, 0), alternativesWithDecomposedScores: rows.reduce((sum, row) => sum + row.alternativesWithScores, 0), alternativesWithPreviewAssets: rows.reduce((sum, row) => sum + row.alternativesWithPreview, 0), rendererContracts: rows.filter((row) => row.rendererStatus === "hapa.echo.playback-media.v2").length, confidenceAboveUnreviewedCap: rows.filter((row) => Number(row.confidence) > .55).length, preferenceEvents: preferences, rows };
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, shots: report.shots, pending: report.proposedPendingReview, alternatives: report.alternatives, scoredAlternatives: report.alternativesWithDecomposedScores, previewAlternatives: report.alternativesWithPreviewAssets, rendererContracts: report.rendererContracts, confidenceAboveCap: report.confidenceAboveUnreviewedCap, preferenceEvents: report.preferenceEvents.length }, null, 2));
if (!report.ok) process.exitCode = 1;
