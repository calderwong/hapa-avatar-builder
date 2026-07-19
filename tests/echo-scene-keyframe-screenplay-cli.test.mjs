import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createEchoSceneKeyframeProcess, deriveEchoSongVisualScreenplayAuthoringProvenanceHash, deriveEchoSongVisualScreenplayContentHash, deriveEchoSongVisualScreenplayPromptHash, pauseEchoSceneKeyframeProcess } from "../src/domain/echo-scene-keyframe-process.js";
import { run } from "../scripts/echo-scene-keyframe-screenplay.mjs";

const at = "2026-07-18T12:00:00.000Z";
function sourceCount(ordinal) { return { songId: "song-a", countOrdinal: ordinal, beatStart: ordinal * 4, beatEndExclusive: ordinal * 4 + 4, startSeconds: ordinal * 2, endSeconds: ordinal * 2 + 2, timingStatus: "ready", inputHash: `source-${ordinal}` }; }
function screenplay(process) {
  const counts = process.counts.map((count) => ({
    countId: count.id, ordinal: count.countOrdinal,
    window: { beatStart: count.beatStart, beatEndExclusive: count.beatEndExclusive, startSeconds: count.startSeconds, endSeconds: count.endSeconds, timingTruthStatus: "measured-source-audio" },
    semanticExtraction: { nouns: ["signal"], verbs: ["observe"], visibleActions: ["turns"], concepts: ["care"], teachings: ["attention"], symbols: ["light"], emotionalMovement: "curious", wordplayCues: [], explicitReferences: [], hiddenReferenceCandidates: [], metaphor: "signal", teachingOrQuestion: "what remains", lyricCitations: [{ lineId: `line-${count.countOrdinal}`, excerpt: "lyric", startSeconds: count.startSeconds, endSeconds: count.endSeconds }], referenceMechanics: [], explicitNoReferenceApplies: true },
    shot: { location: `room-${count.countOrdinal}`, action: "turns", primaryMotif: `light-${count.countOrdinal}`, camera: "medium", composition: "center", lighting: "blue", energy: `rise-${count.countOrdinal}`, intentionalHold: false },
    prompt: { status: "approved", executionMode: "stage_only", sceneText: `scene ${count.countOrdinal}`, gptImagePrompt: `image ${count.countOrdinal}`, negativePrompt: "no text", justification: "lyric", promptHash: "pending" },
    imageActivation: { status: "not_requested" }, disposition: "candidate_direction_only",
  }));
  const result = { schemaVersion: "hapa.echo.full-song-visual-screenplay.v1", songId: "song-a", sourceRevision: { songContextHash: "sha256:context", lyricsHash: "sha256:lyrics", timingHash: "sha256:timing", seedSetHash: "sha256:seed", promptPolicyHash: "sha256:policy" }, semanticMining: { songThesis: "test", emotionalArc: [], teachingOrQuestion: "test", motifLexicon: [], referencePolicy: { rule: "mechanic", literalDepictionAllowed: false } }, avatarContinuity: { seedAssets: [{ avatarId: "blue", assetId: "seed", contentHash: "sha256:seed", retrievalHandle: "/seed.png" }], globalInvariants: ["face"], allowedVariation: ["camera"] }, sequencePlan: [{ id: "sequence", counts, diversityGate: { maxAdjacentDuplicateVisualTuples: 2, requireActionOrStateChange: true, intentionalHoldRequiresReason: true } }], generationPolicy: { promptImportMode: "stage_only", imageActivationRequired: true, providerPolicy: "codex-built-in-gpt-image-only", videoPolicy: "held-until-separately-enabled" }, review: { status: "approved-for-selective-activation" }, authoringProvenance: { method: "direct_llm_analysis", requestedModel: "gpt-5.6-terra", agentTaskName: "cli-test-author", sourcePacketHash: "sha256:source", instructionHash: "sha256:instructions", startedAt: "2026-07-18T11:00:00.000Z", completedAt: at, promptAuthoringPolicy: "no-deterministic-scene-generation", heuristicGeneratorUsed: false, artifactHash: "pending", attestation: { type: "authoring-provenance-v1", artifactHash: "pending", attestedBy: "cli-test-author", attestedAt: at } }, provenance: { contentHash: "sha256:screenplay", createdAt: at } };
  result.authoringProvenance.artifactHash = deriveEchoSongVisualScreenplayAuthoringProvenanceHash(result.authoringProvenance);
  result.authoringProvenance.attestation.artifactHash = result.authoringProvenance.artifactHash;
  counts.forEach((entry, index) => { entry.prompt.promptHash = deriveEchoSongVisualScreenplayPromptHash(result, entry, { previous: process.counts[index - 1] || null, next: process.counts[index + 1] || null }); });
  result.provenance.contentHash = deriveEchoSongVisualScreenplayContentHash(result);
  return result;
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-screenplay-cli-"));
  const state = pauseEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1)] }), { at });
  const processPath = path.join(root, "process.json"); const screenplayPath = path.join(root, "screenplay.json"); const approvalPath = path.join(root, "approval.json"); const events = path.join(root, "events.ndjson");
  const screenplayDocument = screenplay(state);
  fs.writeFileSync(processPath, JSON.stringify(state)); fs.writeFileSync(screenplayPath, JSON.stringify(screenplayDocument)); fs.writeFileSync(approvalPath, JSON.stringify({ id: "review-1", status: "approved", reviewType: "independent_screenplay_review", reviewedBy: "cli-independent-reviewer", reviewedAt: "2026-07-18T12:30:00.000Z", screenplayHash: screenplayDocument.provenance.contentHash, authoringArtifactHash: screenplayDocument.authoringProvenance.artifactHash }));
  return { processPath, screenplayPath, approvalPath, events };
}

test("screenplay CLI validates read-only then imports and activates image quests without unpausing or calling a provider", () => {
  const files = fixture();
  const before = fs.readFileSync(files.processPath, "utf8");
  const validate = run(["validate", "--process", files.processPath, "--events", files.events, "--screenplay", files.screenplayPath]);
  assert.equal(validate.readOnly, true); assert.equal(validate.providerCalls, 0); assert.equal(fs.readFileSync(files.processPath, "utf8"), before);
  assert.throws(() => run(["import-approved", "--process", files.processPath, "--screenplay", files.screenplayPath, "--approval", files.approvalPath]), /pass --apply/u);
  const imported = run(["import-approved", "--apply", "--process", files.processPath, "--events", files.events, "--screenplay", files.screenplayPath, "--approval", files.approvalPath]);
  assert.equal(imported.process.status, "paused");
  let state = JSON.parse(fs.readFileSync(files.processPath, "utf8"));
  assert.ok(state.counts.every((count) => count.lanes.prompt.artifact.state === "ready" && count.lanes.image.quest.status === "blocked_by_prompt" && count.lanes.video.quest.status === "blocked_by_keyframe"));
  const activated = run(["activate-images", "--apply", "--process", files.processPath, "--events", files.events, "--screenplay", files.screenplayPath, "--count-ids", state.counts[0].id]);
  assert.equal(activated.process.status, "paused");
  state = JSON.parse(fs.readFileSync(files.processPath, "utf8"));
  assert.equal(state.counts[0].lanes.image.quest.status, "open");
  assert.equal(state.counts[1].lanes.image.quest.status, "blocked_by_prompt");
  assert.ok(state.counts.every((count) => count.lanes.video.quest.status === "blocked_by_keyframe"));
  assert.match(fs.readFileSync(files.events, "utf8"), /song-screenplay-images-activated/);
});

test("screenplay write commands fail closed when process is not paused or approval is absent", () => {
  const files = fixture();
  const live = JSON.parse(fs.readFileSync(files.processPath, "utf8")); live.status = "running"; fs.writeFileSync(files.processPath, JSON.stringify(live));
  assert.throws(() => run(["import-approved", "--apply", "--process", files.processPath, "--screenplay", files.screenplayPath, "--approval", files.approvalPath]), /paused process/u);
  fs.writeFileSync(files.processPath, JSON.stringify(pauseEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1)] }), { at })));
  assert.throws(() => run(["import-approved", "--apply", "--process", files.processPath, "--screenplay", files.screenplayPath]), /requires --approval/u);
});

test("read-only screenplay validator keeps a short two-count screenplay practical", () => {
  const files = fixture();
  const document = JSON.parse(fs.readFileSync(files.screenplayPath, "utf8"));
  document.semanticMining.referencePolicy.rule = "reference-as-mechanic-not-copy";
  document.sequencePlan[0].diversityGate.repetitionReviewRequired = true;
  document.provenance.contentHash = deriveEchoSongVisualScreenplayContentHash(document);
  fs.writeFileSync(files.screenplayPath, JSON.stringify(document));
  const output = execFileSync(process.execPath, ["scripts/validate-echo-visual-screenplay.mjs", "--file", files.screenplayPath], {
    cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8",
  });
  assert.match(output, /OK/u);
});

test("read-only screenplay validator reports missing authoring provenance for a candidate", () => {
  const files = fixture();
  const document = JSON.parse(fs.readFileSync(files.screenplayPath, "utf8"));
  document.semanticMining.referencePolicy.rule = "reference-as-mechanic-not-copy";
  document.sequencePlan[0].diversityGate.repetitionReviewRequired = true;
  delete document.authoringProvenance;
  fs.writeFileSync(files.screenplayPath, JSON.stringify(document));
  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-echo-visual-screenplay.mjs", "--file", files.screenplayPath], {
    cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8", stdio: "pipe",
  }), /authoringProvenance is required/u);
});
