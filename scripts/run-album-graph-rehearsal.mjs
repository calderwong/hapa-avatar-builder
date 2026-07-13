#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { simulateAlbumGraphPass } from "../src/domain/showcase-soak-rehearsal.js";

const value = (name) => path.resolve(process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3));
const projectsRoot = value("projects"); const output = value("output"); const contextRoot = value("contexts"); const biblePath = value("bible");
const bible = JSON.parse(fs.readFileSync(biblePath, "utf8"));
const projects = fs.readdirSync(projectsRoot).filter((file) => file.endsWith("-video-project.json")).sort().map((file) => { const payload = JSON.parse(fs.readFileSync(path.join(projectsRoot, file), "utf8")); return payload.music_video_project || payload; });
const setlist = bible.songs.map((row) => row.songId); const byId = new Map(projects.map((row) => [row.song_id, row])); const ordered = setlist.map((id) => byId.get(id)).filter(Boolean);
const contexts = new Map(fs.readdirSync(contextRoot).filter((file) => file.endsWith(".json")).map((file) => [file.replace(/\.json$/, ""), path.join(contextRoot, file)]));
const dependencyInventory = setlist.map((songId) => ({ songId, project: byId.has(songId) ? "ready" : "missing", contextPacket: contexts.has(songId) ? "ready" : "missing", releasePackage: songId === "dear-papa-song-dear-papa" ? "candidate-awaiting-creative-approval" : "not-exported" }));
const passes = [simulateAlbumGraphPass(ordered, { pass: 1, failureStride: 11 }), simulateAlbumGraphPass(ordered, { pass: 2, failureStride: 13 })];
const graphEvidencePass = ordered.length === 79 && dependencyInventory.every((row) => row.project === "ready" && row.contextPacket === "ready") && passes.every((pass) => pass.completedWithoutIndefiniteStall);
const report = { schemaVersion: "hapa.showcase.album-graph-rehearsal.v1", status: "verified-graph-rehearsal-awaiting-production", graphEvidencePass, scopeTruth: { setlistSongs: setlist.length, projectGraphs: projects.length, orderedGraphsExercised: ordered.length, renderedPlayback: false, audioPlayback: false, productionKiosk: false, physicalTelemetry: false }, dependencyInventory, passes, aggregate: { totalGraphPasses: passes.length, songTraversals: passes.reduce((sum, row) => sum + row.songs, 0), durationTraversedSeconds: passes.reduce((sum, row) => sum + row.totalDurationSeconds, 0), shotsTraversed: passes.reduce((sum, row) => sum + row.totalShots, 0), visualizerCuesTraversed: passes.reduce((sum, row) => sum + row.totalVisualizerCues, 0), injectedFailuresRecovered: passes.reduce((sum, row) => sum + row.fallbackCount, 0), invalidGraphs: passes.reduce((sum, row) => sum + row.invalidGraphCount, 0) }, productionAcceptance: { fullSetCompletesTwice: false, reason: "Two complete graph traversals are not rendered/audio production rehearsals.", missingReleasePackages: dependencyInventory.filter((row) => row.releasePackage === "not-exported").length, creativeApprovalMissing: true, thermalAudioDisplaySleepWakeTelemetryMissing: true } };
fs.mkdirSync(path.dirname(output), { recursive: true }); fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output, status: report.status, graphEvidencePass, scope: report.scopeTruth, aggregate: report.aggregate, productionAcceptance: report.productionAcceptance }, null, 2));
if (!graphEvidencePass) process.exitCode = 1;
