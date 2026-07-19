import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  claimEchoSceneKeyframeQuests,
  createEchoSceneKeyframeProcess,
  deriveEchoSongVisualScreenplayContentHash,
  pauseEchoSceneKeyframeProcess,
  startEchoSceneKeyframeProcess,
  validateEchoSongVisualScreenplay,
} from "../src/domain/echo-scene-keyframe-process.js";
import { run } from "../scripts/finalize-echo-visual-screenplay.mjs";

const at = "2026-07-18T14:00:00.000Z";
const hash = (character) => `sha256:${character.repeat(64)}`;
const sourceCount = (ordinal) => ({
  songId: "song-finalizer",
  countOrdinal: ordinal,
  beatStart: ordinal * 4,
  beatEndExclusive: ordinal * 4 + 4,
  startSeconds: ordinal * 2,
  endSeconds: ordinal * 2 + 2,
  timingStatus: "ready",
  inputHash: `source-${ordinal}`,
});

function candidateFor(state) {
  const counts = state.counts.map((count) => ({
    countId: count.id,
    ordinal: count.countOrdinal,
    window: { beatStart: count.beatStart, beatEndExclusive: count.beatEndExclusive, startSeconds: count.startSeconds, endSeconds: count.endSeconds, timingTruthStatus: "measured-source-audio" },
    semanticExtraction: {
      nouns: [`pane-${count.countOrdinal}`], verbs: ["turns"], visibleActions: ["turns a rain-lit pane"], concepts: ["uncertain knowing"], teachings: ["a trace is not proof"], symbols: [`route-${count.countOrdinal}`],
      emotionalMovement: `curiosity becomes restraint ${count.countOrdinal}`, wordplayCues: [], explicitReferences: [], hiddenReferenceCandidates: [], metaphor: "a reflection splits into routes", teachingOrQuestion: "Can a trace remain open?",
      lyricCitations: [{ lineId: `line-${count.countOrdinal}`, excerpt: "If I pause it, I might know", startSeconds: count.startSeconds, endSeconds: count.endSeconds }], referenceMechanics: [], explicitNoReferenceApplies: true,
    },
    shot: { location: `rain room ${count.countOrdinal}`, action: `Blue turns the pane ${count.countOrdinal}`, primaryMotif: `split route ${count.countOrdinal}`, camera: `lens ${count.countOrdinal}`, composition: `profile ${count.countOrdinal}`, lighting: `rain light ${count.countOrdinal}`, energy: `measured ${count.countOrdinal}`, intentionalHold: false },
    prompt: { status: "staged", executionMode: "stage_only", sceneText: `Blue studies a rain pane ${count.countOrdinal}.`, gptImagePrompt: `Cinematic original frame ${count.countOrdinal}, Blue studies a rain pane while its reflection divides into unresolved routes.`, negativePrompt: "No text, logos, copied characters, or extra people.", justification: `The divided pane externalizes the cited lyric at count ${count.countOrdinal}.`, promptHash: "pending" },
    imageActivation: { status: "not_requested" },
    disposition: "candidate_direction_only",
  }));
  return {
    schemaVersion: "hapa.echo.full-song-visual-screenplay.v1",
    songId: "song-finalizer",
    sourceRevision: { songContextHash: hash("1"), lyricsHash: hash("2"), timingHash: hash("3"), referenceGraphHash: null, seedSetHash: hash("4"), directorTreatmentHash: null, promptPolicyHash: hash("5") },
    semanticMining: { songThesis: "A trace can be held without becoming a verdict.", emotionalArc: [], teachingOrQuestion: "What can a frame prove?", motifLexicon: [], referencePolicy: { rule: "reference-as-mechanic-not-copy", literalDepictionAllowed: false } },
    avatarContinuity: { seedAssets: [{ avatarId: "blue", colorRole: "blue", assetId: "seed-blue", contentHash: hash("6"), retrievalHandle: "/approved/blue.png", identityInvariants: ["face"], visualContribution: "Blue" }], globalInvariants: ["face"], allowedVariation: ["camera"], cleanReferenceRequired: true },
    sequencePlan: [{ id: "sequence-1", label: "phrase", purpose: "test", counts, diversityGate: { maxAdjacentDuplicateVisualTuples: 2, tupleFields: ["location", "camera", "composition", "primaryMotif", "action", "energy"], requireActionOrStateChange: true, intentionalHoldRequiresReason: true, repetitionReviewRequired: true } }],
    generationPolicy: { promptImportMode: "stage_only", imageActivationRequired: true, providerPolicy: "codex-built-in-gpt-image-only", videoPolicy: "held-until-separately-enabled", allowedPromptStatesForActivation: ["staged", "approved"] },
    review: { status: "staged", reviewNotes: [] },
    authoringProvenance: { method: "direct_llm_analysis", artifactHash: "pending" },
    provenance: { createdAt: at, createdBy: "pending", contentHash: "pending" },
  };
}

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "echo-finalizer-"));
  const state = pauseEchoSceneKeyframeProcess(createEchoSceneKeyframeProcess({ counts: [sourceCount(0), sourceCount(1)] }), { at });
  const processPath = path.join(directory, "process.json");
  const candidatePath = path.join(directory, "candidate.json");
  const outputPath = path.join(directory, "finalized.json");
  fs.writeFileSync(processPath, JSON.stringify(state));
  fs.writeFileSync(candidatePath, JSON.stringify(candidateFor(state)));
  return { directory, state, processPath, candidatePath, outputPath };
}

function args(files, extras = []) {
  return [
    "--process", files.processPath,
    "--screenplay", files.candidatePath,
    "--output", files.outputPath,
    "--requested-model", "gpt-5.6-terra",
    "--agent-task-name", "/root/full-song-author",
    "--source-packet-hash", hash("a"),
    "--instruction-hash", hash("b"),
    "--started-at", "2026-07-18T13:00:00.000Z",
    "--completed-at", "2026-07-18T13:45:00.000Z",
    "--attested-by", "/root/full-song-author",
    "--attested-at", "2026-07-18T13:46:00.000Z",
    "--created-by", "screenplay-metadata-finalizer",
    "--created-at", "2026-07-18T13:47:00.000Z",
    ...extras,
  ];
}

const protectedContent = (document) => document.sequencePlan.flatMap((sequence) => sequence.counts.map((count) => ({ semanticExtraction: count.semanticExtraction, shot: count.shot, prompt: { ...count.prompt, promptHash: undefined } })));

test("finalizer dry-runs then writes only hashes and explicit provenance without provider or process mutation", () => {
  const files = fixture();
  const processBefore = fs.readFileSync(files.processPath, "utf8");
  const candidateBefore = fs.readFileSync(files.candidatePath, "utf8");
  const dry = run(args(files));
  assert.equal(dry.applied, false);
  assert.equal(dry.providerCalls, 0);
  assert.equal(dry.sceneOrSemanticTextChanged, false);
  assert.equal(fs.existsSync(files.outputPath), false);
  assert.equal(fs.readFileSync(files.processPath, "utf8"), processBefore);
  assert.equal(fs.readFileSync(files.candidatePath, "utf8"), candidateBefore);

  const applied = run(args(files, ["--apply"]));
  assert.equal(applied.applied, true);
  assert.equal(applied.processStatus, "paused");
  assert.equal(applied.activeClaims, 0);
  assert.equal(applied.promptHashesFinalized, 2);
  assert.equal(fs.readFileSync(files.processPath, "utf8"), processBefore);
  assert.equal(fs.readFileSync(files.candidatePath, "utf8"), candidateBefore);
  const original = JSON.parse(candidateBefore);
  const finalized = JSON.parse(fs.readFileSync(files.outputPath, "utf8"));
  assert.deepEqual(protectedContent(finalized), protectedContent(original));
  assert.ok(finalized.sequencePlan[0].counts.every((count) => /^sha256:[a-f0-9]{64}$/u.test(count.prompt.promptHash)));
  assert.equal(finalized.authoringProvenance.requestedModel, "gpt-5.6-terra");
  assert.equal(finalized.authoringProvenance.heuristicGeneratorUsed, false);
  assert.equal(finalized.provenance.contentHash, deriveEchoSongVisualScreenplayContentHash(finalized));
  assert.equal(validateEchoSongVisualScreenplay(files.state, finalized).screenplayHash, finalized.provenance.contentHash);
});

test("finalized screenplay fails validation after non-hash content is changed", () => {
  const files = fixture();
  run(args(files, ["--apply"]));
  const finalized = JSON.parse(fs.readFileSync(files.outputPath, "utf8"));
  finalized.semanticMining.songThesis = "changed after finalization";
  assert.throws(() => validateEchoSongVisualScreenplay(files.state, finalized), /contentHash does not match canonical screenplay content/u);
  fs.writeFileSync(files.outputPath, JSON.stringify(finalized));
  assert.throws(() => execFileSync(process.execPath, ["scripts/validate-echo-visual-screenplay.mjs", "--file", files.outputPath], {
    cwd: path.resolve(import.meta.dirname, ".."), encoding: "utf8", stdio: "pipe",
  }), /provenance\.contentHash does not match canonical screenplay content/u);
});

test("finalizer refuses a running process, active claims, candidate overwrite, and incomplete metadata", () => {
  const files = fixture();
  const running = startEchoSceneKeyframeProcess(files.state, { at });
  fs.writeFileSync(files.processPath, JSON.stringify(running));
  assert.throws(() => run(args(files)), /requires a paused process/u);

  const claimed = claimEchoSceneKeyframeQuests(running, { runnerId: "terra", runId: "run", at }).process;
  const pausedClaimed = pauseEchoSceneKeyframeProcess(claimed, { at });
  fs.writeFileSync(files.processPath, JSON.stringify(pausedClaimed));
  assert.throws(() => run(args(files)), /requires zero active claims/u);

  fs.writeFileSync(files.processPath, JSON.stringify(files.state));
  const overwriteArgs = args(files, ["--apply"]);
  overwriteArgs[overwriteArgs.indexOf(files.outputPath)] = files.candidatePath;
  assert.throws(() => run(overwriteArgs), /refuses to overwrite/u);
  assert.throws(() => run(args(files).filter((value, index, list) => value !== "--requested-model" && list[index - 1] !== "--requested-model")), /requestedModel/u);
});
