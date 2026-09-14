import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import {
  assessEchoReferenceConcept,
  normalizeEchoReferenceIntelligencePlan,
  summarizeEchoReferenceIntelligence,
} from "../src/domain/echo-reference-intelligence.js";

const require = createRequire(import.meta.url);
const service = require("../electron/echo-reference-intelligence.cjs");
const imageGeneration = require("../electron/echo-reference-image-generation.cjs");

function concept(overrides = {}) {
  return {
    id: "concept-one",
    title: "The cup that records the tide",
    memoryHook: "A chipped cup fills only when its owner speaks freely.",
    foundationRationale: "The visible change binds the lyric, lesson, and inherited cup symbol.",
    lyricMechanic: "Speech changes the water level.",
    referenceMechanic: "The source contributes reversible passage.",
    lessonMechanic: "The cup stops filling when consent is withdrawn.",
    tarotMechanic: "The inherited cup becomes a consent gauge.",
    characterUse: "One original Hapa adult holds but does not control the cup.",
    scene: { subject: "cup", action: "fills", setting: "kitchen", camera: "macro", lightAndWeather: "rain light", materialLanguage: "ceramic and salt" },
    symbols: [
      { symbol: "cup", source: "Tarot", meaning: "feeling", placement: "foreground" },
      { symbol: "tide mark", source: "lyric", meaning: "choice", placement: "cup wall" },
      { symbol: "open door", source: "lesson", meaning: "exit", placement: "background" },
    ],
    palette: [{ color: "salt white", role: "evidence" }, { color: "storm blue", role: "pressure" }, { color: "coral", role: "choice" }],
    visualSignature: { subjectType: "object", shotScale: "macro", cameraAngle: "table height", settingType: "domestic", dominantGeometry: "cup circle", lighting: "rain window", materialLanguage: "ceramic" },
    retrievalTags: ["cup", "tide", "consent", "speech"],
    imagePrompt: Array.from({ length: 18 }, () => "Create a vertical illustrated playing-card image centered on a chipped ceramic cup whose tide line responds to speech through visible material change.").join(" "),
    qualityAssessment: Object.fromEntries([...service.SCORE_KEYS.map((key) => [key, 5]), ["strengths", ["specific"]], ["risks", []], ["evidenceSummary", "All four sources are visible."]]),
    ...overrides,
  };
}

test("quality assessment is an additive API-readiness gate, not a ranking", () => {
  const ready = assessEchoReferenceConcept(concept());
  assert.equal(ready.ready, true);
  assert.equal(ready.status, "ready-for-image-api");
  const held = assessEchoReferenceConcept(concept({ qualityAssessment: { ...concept().qualityAssessment, memorability: 3 } }));
  assert.equal(held.ready, false);
  assert.match(held.gateReasons.join(" "), /memorability/);
});

test("normalization retains every concept and summarizes reference and lyric-only prompts", () => {
  const plan = normalizeEchoReferenceIntelligencePlan({
    songFoundation: { literalSituation: "A promise changes hands." },
    connections: [
      { connectionKey: "r1", sourceKind: "reference", referenceId: "R1", referenceTitle: "Source", concepts: [concept(), concept({ title: "Second", memoryHook: "A second supported image." })] },
      { connectionKey: "lyric", sourceKind: "lyric-only", referenceId: "", referenceTitle: "Lyric", concepts: [concept({ title: "Third", memoryHook: "A third supported image." })] },
    ],
  }, { songId: "song", songTitle: "Song" });
  const summary = summarizeEchoReferenceIntelligence([plan]);
  assert.equal(summary.referenceConnections, 1);
  assert.equal(summary.lyricOnlyConnections, 1);
  assert.equal(summary.concepts, 3);
  assert.equal(summary.prompts, 3);
  assert.equal(summary.ready, 3);
});

test("the authoring contract explicitly retains concepts and disables competition", () => {
  assert.match(service.DEVELOPER_INSTRUCTIONS, /EVERY defensible/);
  assert.match(service.DEVELOPER_INSTRUCTIONS, /Concepts do not compete/);
  assert.match(service.DEVELOPER_INSTRUCTIONS, /Do not rank, eliminate, merge, or choose a winner/);
  assert.doesNotMatch(service.DEVELOPER_INSTRUCTIONS, /select the best|winner-take-all/i);
});

test("song packets preserve every staged source connection", () => {
  const packet = service.songPacket({
    id: "song-one",
    title: "Song One",
    trackNumber: 1,
    canonicalSource: { lyrics: "Complete lyric one. Complete lyric two." },
    knowledge: { referenceImagePrompts: [
      { id: "r1", referenceId: "R1", referenceTitle: "One", lyricCue: "first", existingSymbols: "legacy stock path and open hand", prompt: "legacy generated prompt" },
      { id: "r2", referenceId: "R2", referenceTitle: "Two", lyricCue: "second" },
    ] },
  });
  assert.deepEqual(packet.sourceConnections.map((item) => item.connectionKey), ["r1", "r2"]);
  assert.match(packet.lyrics, /Complete lyric two/);
  assert.equal(packet.sourceConnections[0].existingSymbols, undefined);
  assert.equal(packet.sourceConnections[0].reviewPrompt, undefined);
});

test("future image runs receive every ready intelligent prompt and retain weaker concepts outside the API queue", () => {
  const ready = concept();
  ready.qualityAssessment = { ...ready.qualityAssessment, ready: true, average: 5 };
  const held = concept({ id: "held", title: "Held", imagePrompt: "Revise me." });
  held.qualityAssessment = { ...held.qualityAssessment, ready: false, average: 3.75 };
  const jobs = imageGeneration.flattenIntelligenceJobs({
    runId: "intelligence-run",
    jobs: [{ songId: "song", songTitle: "Song", trackNumber: 1, plan: { planId: "plan", connections: [{ referenceId: "R1", referenceTitle: "Source", concepts: [ready, held] }] } }],
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].visualConceptTitle, ready.title);
  assert.equal(jobs[0].qualityAssessment.ready, true);
});

test("album assessment marks visual-signature collisions without deleting either concept", () => {
  const shared = concept();
  const manifest = { jobs: [
    { songId: "one", songTitle: "One", status: "completed", plan: { connections: [{ sourceKind: "lyric-only", concepts: [structuredClone(shared)] }] } },
    { songId: "two", songTitle: "Two", status: "completed", plan: { connections: [{ sourceKind: "lyric-only", concepts: [structuredClone(shared)] }] } },
  ] };
  service.applyCorpusQuality(manifest);
  const retained = manifest.jobs.flatMap((job) => job.plan.connections[0].concepts);
  assert.equal(retained.length, 2);
  assert.equal(retained[0].qualityAssessment.ready, false);
  assert.match(retained[0].qualityAssessment.gateReasons.join(" "), /visual-signature-collision/);
});

test("the Reference Atlas exposes additive foundations only through trusted Electron IPC", async () => {
  const [review, preload, main] = await Promise.all([
    readFile(new URL("../src/components/EchoReferenceImagePromptReview.jsx", import.meta.url), "utf8"),
    readFile(new URL("../electron/preload.cjs", import.meta.url), "utf8"),
    readFile(new URL("../electron/main.cjs", import.meta.url), "utf8"),
  ]);
  assert.match(preload, /hapaEchoReferenceIntelligence/);
  assert.match(preload, /hapa-echo-reference-intelligence:status/);
  assert.match(main, /createEchoReferenceIntelligence/);
  assert.match(main, /handleReferenceIntelligenceOperation/);
  assert.match(review, /Reasoning-authored foundations/);
  assert.match(review, /retained concepts/);
  assert.match(review, /Ready for image API/);
  assert.match(review, /Needs revision/);
  assert.match(review, /Meaning chain, symbols, assessment, and production prompt/);
  assert.doesNotMatch(preload, /hapaEchoReferenceIntelligence[\s\S]*credential/);
});
