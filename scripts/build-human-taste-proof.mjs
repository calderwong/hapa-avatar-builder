#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { appendTasteEvidence, applyTastePriors, createTasteMemory, evaluateTastePromotion, resetTasteScope, setTasteEvidenceEnabled, TASTE_SCOPES } from "../src/domain/human-taste-memory.js";

const output = path.resolve(process.argv.find((row) => row.startsWith("--output="))?.slice(9));
let memory = createTasteMemory({ workspaceId: "hapa-echo-local" });
const context = { shot: "card:a:0", song: "dear-papa-song-dear-papa", album: "dear-papa-album", character: "red-reaper", "visualizer-family": "isf:fluid", global: "*" };
for (const [index, scope] of TASTE_SCOPES.entries()) memory = appendTasteEvidence(memory, { scope, scopeId: context[scope], actionEventId: `shot-review:proof:${index}`, action: index % 3 === 0 ? "pin" : index % 3 === 1 ? "reject" : "trim", operator: "proof-reviewer", feature: index % 2 ? "camera:roi-push" : "media:hero", targetId: "candidate-a", songId: context.song, cardId: "card:a:0", mediaId: "candidate-a", recordedAt: `2026-07-11T09:4${index}:00Z` });
const scored = applyTastePriors([{ id: "candidate-a", score: .6 }, { id: "candidate-b", score: .7 }], memory, context);
const disabledId = memory.events.find((row) => row.scope === "global").id;
const disabled = setTasteEvidenceEnabled(memory, disabledId, false, { operator: "proof-reviewer", at: "2026-07-11T09:50:00Z" });
const reset = resetTasteScope(disabled, "song", context.song, { operator: "proof-reviewer", at: "2026-07-11T09:51:00Z" });
const blockedPromotion = evaluateTastePromotion({ blindReview: { status: "awaiting-human-blind-scores" }, safety: { status: "pass", receiptHash: "export-safety" }, performance: { status: "pass", receiptHash: "production-playback" }, evidenceCount: memory.events.length });
const passingFixture = evaluateTastePromotion({ blindReview: { status: "pass", receiptHash: "blind-review-receipt" }, safety: { status: "pass", receiptHash: "export-safety" }, performance: { status: "pass", receiptHash: "production-playback" }, evidenceCount: memory.events.length });
const report = { schemaVersion: "hapa.director.human-taste-proof.v1", ok: memory.events.length === 6 && scored[0].tastePriorContributions.length === 6 && scored.every((row) => row.baseScoreUnchanged === row.score) && disabled.events.length === 7 && reset.events.length === 8 && !blockedPromotion.promoted && passingFixture.promoted, localOnly: memory.localOnly, transparentPriorsOnly: memory.transparentPriorsOnly, scopes: TASTE_SCOPES, memory, scoredCandidates: scored, historyControls: { disabledEventId: disabledId, resetScope: "song", eventCountAfterDisable: disabled.events.length, eventCountAfterReset: reset.events.length, historyDeleted: false }, actualPromotion: blockedPromotion, passingContractFixture: passingFixture };
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
fs.writeFileSync(path.join(output, "taste-memory.json"), `${JSON.stringify(memory, null, 2)}\n`);
fs.writeFileSync(path.join(output, "proof.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ ok: report.ok, output, scopes: report.scopes, evidence: memory.events.length, contributions: scored[0].tastePriorContributions.length, historyDeleted: report.historyControls.historyDeleted, actualPromotion: report.actualPromotion, passingFixture: report.passingContractFixture.promoted }, null, 2));
if (!report.ok) process.exitCode = 1;
