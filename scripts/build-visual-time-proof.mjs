#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildVisualTimeTrack, validateVisualTimeTrack } from "../src/domain/visual-time-track.js";

const arg = (name) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3);
const graphPath = path.resolve(arg("graph"));
const output = path.resolve(arg("output"));
fs.mkdirSync(output, { recursive: true });
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const normal = graph.directorV2.visualTimeTrack;
const cues = graph.directorV2.cueGraph.cues;
const reduced = buildVisualTimeTrack({ cues, density: graph.directorV2.recipe?.temporalModulation || 0.34, durationSeconds: graph.song.durationSeconds, reducedMotion: true });
const boundaries = cues.filter((cue) => cue.kind === "section_start").map((cue) => cue.atSeconds).sort((a, b) => a - b);
const countKinds = (track) => Object.fromEntries([...new Set(track.events.map((event) => event.kind))].sort().map((kind) => [kind, track.events.filter((event) => event.kind === kind).length]));
const unsupported = Object.fromEntries(["echoTarot", "hyperframes", "musicVizNative", "dearPapaNative"].map((renderer) => [renderer, [...new Set(normal.events.flatMap((event) => event.rendererSupport[renderer].unsupported || []))].sort()]));
const report = {
  schemaVersion: "hapa.director.visual-time-proof.v1",
  ok: validateVisualTimeTrack(normal, { sectionBoundaries: boundaries }).ok && validateVisualTimeTrack(reduced, { sectionBoundaries: boundaries }).ok,
  normal: { validation: validateVisualTimeTrack(normal, { sectionBoundaries: boundaries }), eventCount: normal.eventCount, kinds: countKinds(normal), canonicalAudioClock: normal.canonicalAudioClock, unsupportedByRenderer: unsupported, allEventsVisualOnly: normal.events.every((event) => event.target.clock === "visual-only"), allUnsupportedFailVisible: normal.events.every((event) => event.unsupportedBehavior.mode === "fail-visible") },
  reducedMotion: { validation: validateVisualTimeTrack(reduced, { sectionBoundaries: boundaries }), eventCount: reduced.eventCount, kinds: countKinds(reduced), disabledKinds: ["micro-reverse", "beat-stutter"], baseAudioClockUnchanged: JSON.stringify(normal.canonicalAudioClock) === JSON.stringify(reduced.canonicalAudioClock) },
};
fs.writeFileSync(path.join(output, "visual-time-track.json"), `${JSON.stringify(normal, null, 2)}\n`);
fs.writeFileSync(path.join(output, "reduced-motion-visual-time-track.json"), `${JSON.stringify(reduced, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, normal: report.normal.eventCount, reduced: report.reducedMotion.eventCount, kinds: report.normal.kinds }, null, 2));
if (!report.ok) process.exitCode = 1;
