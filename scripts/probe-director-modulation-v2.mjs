#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { evaluateDirectorModulationSequence } from "../src/domain/director-modulation-v2.js";

const value = (name) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : "";
};
const graphPath = path.resolve(value("graph"));
const outputPath = path.resolve(value("output"));
if (!graphPath || !outputPath) throw new Error("--graph and --output are required");
const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
const bindings = graph.directorV2?.modulationBindings || [];
const frames = Array.from({ length: 21 }, (_, index) => {
  const phase = index / 20;
  const stem = (offset) => ({ rms: Math.max(0, Math.sin((phase + offset) * Math.PI)), peak: index % 5 === 0 ? 0.9 : 0.25, bass: phase, mid: 1 - phase, beat: index % 4 === 0 ? 1 : 0, orbit: phase, canvas: 0 });
  return {
    atSeconds: index * 0.05,
    signals: {
      stems: { drums: stem(0), bass: stem(0.2), synth: stem(0.4), vocals: stem(0.1), master: stem(0.3) },
      master: { rms: 0.25 + phase * 0.5 },
      cues: { phrase_boundary: index === 10 ? 1 : 0 },
    },
  };
});
const preview = evaluateDirectorModulationSequence(bindings, frames);
const exported = evaluateDirectorModulationSequence(bindings, frames);
const mutedDrums = evaluateDirectorModulationSequence(bindings, frames, { mutedStems: ["drums"] });
const previewIds = new Set(preview.flatMap((frame) => frame.outputs.map((output) => output.id)));
const mutedIds = new Set(mutedDrums.flatMap((frame) => frame.outputs.map((output) => output.id)));
const removed = [...previewIds].filter((id) => !mutedIds.has(id));
const expectedRemoved = bindings.filter((binding) => binding.source?.kind === "stem_signal" && binding.source?.stemFocus === "drums").map((binding) => binding.id).sort();
const report = {
  schemaVersion: "hapa.echo.director-modulation-probe.v2",
  truthStatus: "deterministic-test-fixture-signals-not-song-telemetry",
  ok: JSON.stringify(preview) === JSON.stringify(exported) && JSON.stringify(removed.sort()) === JSON.stringify(expectedRemoved),
  graphPath,
  bindingCount: bindings.length,
  previewExportByteEqual: JSON.stringify(preview) === JSON.stringify(exported),
  masterMixBindings: bindings.filter((binding) => binding.source?.kind === "mix_signal").map((binding) => binding.id),
  mutedStem: "drums",
  removedBindings: removed.sort(),
  expectedRemovedBindings: expectedRemoved,
  retainedBindingCount: mutedIds.size,
  generatedAt: new Date().toISOString(),
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (!report.ok) process.exitCode = 1;
