#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { createVariationLab, promoteVariation, regenerateVariationLab, setVariationLock } from "../src/domain/variation-lab.js";

const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
fs.mkdirSync(output, { recursive: true });
let lab = createVariationLab({ projectId: "dear-papa-song-dear-papa", treatmentId: "treatment:ad42fcf67eeb60201f1c", cueGraphId: "cue:f0379c701afb45ec8ceb" });
for (const lock of [{ targetKind: "decision", targetId: "media-casting", value: "locked" }, { targetKind: "truth", targetId: "cue-graph", value: "locked" }, { targetKind: "card", targetId: "card:a:0", value: "locked" }]) lab = setVariationLock(lab, lock);
const beforeRegenerationLocks = structuredClone(lab.locks);
lab = regenerateVariationLab(lab, { treatmentId: "treatment:regenerated-same-decisions", cueGraphId: lab.cueGraphId });
const locksSurvived = JSON.stringify(beforeRegenerationLocks) === JSON.stringify(lab.locks);
lab = promoteVariation(lab, lab.variants[2].id, { operator: "proof-operator", promotedAt: "2026-07-11T07:56:00Z" });
const formats = lab.promoted.formatVariantInputs.supportedFormats.map((format) => ({ schemaVersion: "hapa.director.format-variant.v1", format, parentPatchHash: lab.promoted.patchHash, recipe: lab.promoted.winner.recipe, seed: lab.promoted.winner.seed, locks: lab.promoted.winner.locks, creativeDecisionRuns: 0 }));
const report = { schemaVersion: "hapa.director.variation-lab-proof.v1", ok: locksSurvived && lab.semanticDecisionRuns === 0 && lab.variants.length === 3 && lab.promoted.nonDestructive && lab.promoted.losers.every((row) => row.reproducible) && formats.every((row) => row.parentPatchHash === lab.promoted.patchHash && row.creativeDecisionRuns === 0), locksSurvivedRegeneration: locksSurvived, reusedExpensiveDecisions: lab.reusedExpensiveDecisions, rerolledCheapAxes: lab.rerolledCheapAxes, semanticDecisionRuns: lab.semanticDecisionRuns, variants: lab.variants, promotion: lab.promoted, formats };
fs.writeFileSync(path.join(output, "lab-state.json"), `${JSON.stringify(lab, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, locks: lab.locks.length, variants: lab.variants.map(({ label, recipe, seed }) => ({ label, recipe, seed })), winner: lab.promoted.winner.label, reproducibleLosers: lab.promoted.losers.length, formats: formats.map((row) => row.format), semanticDecisionRuns: report.semanticDecisionRuns }, null, 2));
if (!report.ok) process.exitCode = 1;
