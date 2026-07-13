#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { buildAccentEventTrack, createAccentOverrideReceipt, validateAccentEventTrack } from "../src/domain/accent-event-track.js";

const arg = (name) => process.argv.find((row) => row.startsWith(`--${name}=`))?.slice(name.length + 3);
const graphPath = path.resolve(arg("graph"));
const output = path.resolve(arg("output"));
fs.mkdirSync(output, { recursive: true });
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const normal = graph.directorV2.accentTrack;
const reduced = buildAccentEventTrack({ cues: graph.directorV2.cueGraph.cues, density: graph.directorV2.recipe?.accentDensity || 0.58, durationSeconds: graph.song.durationSeconds, reducedMotion: true });
const sampleStrong = structuredClone(normal);
if (sampleStrong.events[0]) sampleStrong.events[0].safety.luminanceDelta = 0.28;
const override = createAccentOverrideReceipt({
  operator: "fixture-operator",
  reason: "Documentation-only stronger-treatment fixture; not approved for runtime",
  acknowledgedAt: "2026-07-11T07:24:00Z",
  eventIds: sampleStrong.events[0] ? [sampleStrong.events[0].id] : [],
});
const report = {
  schemaVersion: "hapa.director.accent-safety-proof.v1",
  ok: validateAccentEventTrack(normal).ok && validateAccentEventTrack(reduced).ok && !validateAccentEventTrack(sampleStrong).ok && validateAccentEventTrack(sampleStrong, { overrideReceipt: override }).ok,
  normal: { validation: validateAccentEventTrack(normal), eventCount: normal.eventCount, kinds: Object.fromEntries([...new Set(normal.events.map((event) => event.kind))].sort().map((kind) => [kind, normal.events.filter((event) => event.kind === kind).length])), maxFlashHz: Math.max(...normal.events.map((event) => event.safety.flashHz)), maxLuminanceDelta: Math.max(...normal.events.map((event) => event.safety.luminanceDelta)), maxFrameArea: Math.max(...normal.events.map((event) => event.safety.frameArea)) },
  reducedMotion: { validation: validateAccentEventTrack(reduced), eventCount: reduced.eventCount, kinds: [...new Set(reduced.events.map((event) => event.kind))].sort(), flashEvents: reduced.events.filter((event) => event.safety.flashCount > 0).length },
  strongerTreatmentFixture: { active: false, validationWithoutOverride: validateAccentEventTrack(sampleStrong), validationWithOverride: validateAccentEventTrack(sampleStrong, { overrideReceipt: override }), overrideReceipt: override },
};
fs.writeFileSync(path.join(output, "accent-track.json"), `${JSON.stringify(normal, null, 2)}\n`);
fs.writeFileSync(path.join(output, "reduced-motion-accent-track.json"), `${JSON.stringify(reduced, null, 2)}\n`);
fs.writeFileSync(path.join(output, "safety-proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, normalEvents: normal.eventCount, reducedEvents: reduced.eventCount, maxFlashHz: report.normal.maxFlashHz }, null, 2));
if (!report.ok) process.exitCode = 1;
