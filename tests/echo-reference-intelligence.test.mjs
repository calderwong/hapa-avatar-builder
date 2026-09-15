import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

test("the local prompt normalizer removes meta filler but leaves visual instructions intact", () => {
  const result = service.sanitizeLocalPrompt("A Hapa figure carries ten visible wooden wands. The image is complete and ready. Copper light divides the frame.");
  assert.equal(result.prompt, "A Hapa figure carries ten visible wooden wands. Copper light divides the frame.");
  assert.deepEqual(result.removed, ["the image is complete"]);
});

test("local JSON parsing accepts raw objects and fenced objects but rejects incomplete output", () => {
  assert.deepEqual(service.parseLocalJson('{"ok":true}'), { ok: true });
  assert.deepEqual(service.parseLocalJson('```json\n{"ok":true}\n```'), { ok: true });
  assert.throws(() => service.parseLocalJson('{"ok":'), /complete JSON object|Unexpected end/);
});

test("local prompt stabilization restores exact Tarot, count, symbols, and Hapa continuity mechanically", () => {
  const stabilized = service.stabilizeLocalPrompt(concept({
    characterUse: "one original adult",
    symbols: [
      { symbol: "cup", source: "Tarot", meaning: "feeling", placement: "foreground" },
      { symbol: "tide mark", source: "lyric", meaning: "choice", placement: "cup wall" },
      { symbol: "open door", source: "lesson", meaning: "exit", placement: "background" },
    ],
    imagePrompt: Array.from({ length: 14 }, () => "An adult watches weather score a ceramic surface while speech changes its waterline through a visible domestic action.").join(" "),
  }), { packet: { tarotConnections: [{ cardTitle: "Ten of Cups" }] } });
  assert.match(stabilized.imagePrompt, /Tarot card Ten of Cups/);
  assert.match(stabilized.imagePrompt, /Exactly ten separately readable cups/);
  assert.match(stabilized.imagePrompt, /original Hapa character/);
  assert.equal(service.localPromptAssessment(stabilized, { packet: { tarotConnections: [{ cardTitle: "Ten of Cups" }] } }).gateReasons.length, 0);
});

test("local blueprint stabilization preserves ideas while restoring connection and Minor Arcana objects", () => {
  const stabilized = service.stabilizeLocalBlueprint({
    connectionKey: "wrong",
    seeds: [{ title: "Signal", heroObject: "a radio", tarotTransformation: "The signal opens a channel." }],
  }, { packet: { sourceConnections: [{ connectionKey: "exact-key" }], tarotConnections: [{ cardTitle: "Three of Cups" }] } });
  assert.equal(stabilized.connectionKey, "exact-key");
  assert.match(stabilized.seeds[0].heroObject, /three separately readable cups/i);
  assert.match(stabilized.seeds[0].tarotTransformation, /Exactly three separately readable cups/);
  assert.equal(stabilized.localBlueprintStabilization.applied, true);
});

test("local prompt stabilization removes exclusion padding and bounds overlong prompts without a model retry", () => {
  const long = concept({
    characterUse: "object-led",
    imagePrompt: `${Array.from({ length: 52 }, () => "The Fool places cup, tide mark, and open door into a visible causal mechanism with ceramic weather and salt light.").join(" ")} No cliffs, towers, paths, fog, moons, mirrors, harbors, backpacks, armor.`,
  });
  const stabilized = service.stabilizeLocalPrompt(long, { packet: { tarotConnections: [{ cardTitle: "The Fool" }] } });
  assert.ok(stabilized.imagePrompt.split(/\s+/).length <= 500);
  assert.doesNotMatch(stabilized.imagePrompt, /No cliffs/);
  assert.equal(service.localPromptAssessment(stabilized, { packet: { tarotConnections: [{ cardTitle: "The Fool" }] } }).gateReasons.length, 0);
});

test("local prompt gates reject exclusion padding and preserve a substantial positive visual brief", () => {
  const padded = concept({
    characterUse: "object-led",
    imagePrompt: `The Tarot card The Fool places a cup and tide mark beside an open door. ${"Visible ceramic salt light repeats across the grounded tabletop. ".repeat(9)} No cliffs, towers, paths, fog, moons, mirrors, harbors, backpacks, armor.`,
  });
  const assessment = service.localPromptAssessment(padded, { packet: { tarotConnections: [{ cardTitle: "The Fool" }] } });
  assert.match(assessment.gateReasons.join(" "), /positive-prompt-words/);
  assert.match(assessment.gateReasons.join(" "), /exclusion-items/);
  const alternatePrefix = service.localPromptAssessment({ ...padded, imagePrompt: padded.imagePrompt.replace("No cliffs", "Exclude: cliffs") }, { packet: { tarotConnections: [{ cardTitle: "The Fool" }] } });
  assert.match(alternatePrefix.gateReasons.join(" "), /positive-prompt-words/);
  assert.match(alternatePrefix.gateReasons.join(" "), /exclusion-items/);
});

test("local prompt gates reject named Hapa characters whose reusable identity is hidden or replaced", () => {
  const genericGreen = concept({
    characterUse: "Hapa Green as a conductor",
    imagePrompt: `${"Hapa Green operates a blank ledger, iron key, and tide mark in a Tarot card of The Fool, using a visible railway gap to turn limited knowledge into an ethical offer. ".repeat(11)} Hapa Green wears a conductor cap and the face is obscured by shadow.`,
  });
  const assessment = service.localPromptAssessment(genericGreen, { packet: { tarotConnections: [{ cardTitle: "The Fool" }] } });
  assert.match(assessment.gateReasons.join(" "), /hapa-identity-markers:green/);
  assert.match(assessment.gateReasons.join(" "), /hapa-identity-obscured:green/);
});

test("an exact attached Major Arcana title satisfies Tarot visibility without redundant category prose", () => {
  const exactCard = concept({
    characterUse: "object-led",
    imagePrompt: `${"The Fool steps from a blank ledger onto an iron key spanning a rail gap while a tide mark records the ethical choice in visible salt light. ".repeat(13)} No text or logos.`,
  });
  const assessment = service.localPromptAssessment(exactCard, { packet: { tarotConnections: [{ cardTitle: "The Fool" }] } });
  assert.doesNotMatch(assessment.gateReasons.join(" "), /missing-visible-tarot-language|missing-attached-tarot-title/);
});

test("local repair retries current-policy failures through only the qualified loopback Qwen route and does not read the OpenAI credential", async () => {
  const userDataPath = await mkdtemp(path.join(tmpdir(), "echo-local-intelligence-"));
  const runId = "local-resume-fixture";
  const runsRoot = path.join(userDataPath, "Echo Reference Intelligence Runs");
  const runRoot = path.join(runsRoot, runId);
  await mkdir(runRoot, { recursive: true });
  const packet = {
    songId: "song-local",
    songTitle: "Song Local",
    trackNumber: 1,
    lyrics: "A cup records the tide when someone speaks.",
    sourceConnections: [{ connectionKey: "local-r1", sourceKind: "reference", referenceId: "R1", referenceTitle: "Tidal memory", evidenceClass: "S", lyricCue: "records the tide", existingLesson: "Attention changes what can be remembered." }],
  };
  const manifest = {
    schemaVersion: service.SCHEMA_VERSION,
    runId,
    mode: "full",
    state: "complete-with-errors",
    model: "gpt-5.2",
    reasoningEffort: "high",
    concurrency: 12,
    jobs: [{ id: "job-local", songId: packet.songId, songTitle: packet.songTitle, trackNumber: 1, sourceDigest: "sha256:test", packet, status: "failed", attempts: 1, error: "quality gate", plan: null, localRetryPolicyVersion: service.LOCAL_RETRY_POLICY_VERSION }],
  };
  await writeFile(path.join(runRoot, "manifest.json"), `${JSON.stringify(manifest)}\n`);
  await writeFile(path.join(runsRoot, "current-run.json"), `${JSON.stringify({ runId })}\n`);
  const calls = [];
  const fetchImpl = async (input) => {
    const url = String(input);
    calls.push(url);
    assert.match(url, /^http:\/\/127\.0\.0\.1:8001\/v1\//);
    if (url.endsWith("/models")) return new Response(JSON.stringify({ data: [{ id: service.LOCAL_OMLX_MODEL }] }), { status: 200, headers: { "content-type": "application/json" } });
    if (calls.filter((item) => item.endsWith("/responses")).length === 1) {
      const blueprint = { connectionKey: "local-r1", sourceMechanism: "Memory responds to attention.", songSpecificRecognition: "Speech changes a literal tide line.", seeds: [{ title: "The speaking cup", lyricAnchor: "records the tide", centralAction: "A cup rises as someone speaks.", referenceMechanism: "Attention changes stored state.", lessonPayoff: "Listening makes memory observable.", tarotTransformation: "A cup becomes a visible consent gauge.", heroObject: "A chipped cup", avatarRole: "object-led", symbolNames: ["cup", "tide mark", "open door"], antiGeneric: "Domestic macro still life.", distinctFromOtherSeeds: "Only supported seed." }, { title: "The door tide", lyricAnchor: "records the tide", centralAction: "A door opens at the water line.", referenceMechanism: "Memory creates reversible passage.", lessonPayoff: "Withdrawal remains visible.", tarotTransformation: "A cup pours the threshold line.", heroObject: "An open door", avatarRole: "object-led", symbolNames: ["cup", "tide mark", "open door"], antiGeneric: "Threshold mechanism, no fantasy travel.", distinctFromOtherSeeds: "Architecture-led rather than object macro." }] };
      return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(blueprint) }] }], usage: { input_tokens: 20, output_tokens: 100, total_tokens: 120 } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    const localConcept = concept({ imagePrompt: Array.from({ length: 12 }, () => "Compose a 2:3 Hapa Tarot card where a ceramic cup, tide mark, and open door visibly transform the Cups archetype through speech, choice, salt light, and grounded material detail.").join(" ") });
    const compactConcept = { blueprintSeedTitle: calls.filter((item) => item.endsWith("/responses")).length === 2 ? "The speaking cup" : "The door tide", title: localConcept.title, memoryHook: localConcept.memoryHook, scene: localConcept.scene, symbols: localConcept.symbols, palette: localConcept.palette, visualSignature: localConcept.visualSignature, retrievalTags: localConcept.retrievalTags, imagePrompt: localConcept.imagePrompt, qualityAssessment: localConcept.qualityAssessment };
    const raw = { songFoundation: { literalSituation: "A cup changes with speech." }, connection: { connectionKey: "local-r1", conceptualBridge: "The cup makes memory observable.", evidenceUsed: ["lyrics", "R1"], concepts: [compactConcept, { ...compactConcept, blueprintSeedTitle: "The door tide", title: "The door tide" }] } };
    return new Response(JSON.stringify({ id: "local-response", output: [{ content: [{ type: "output_text", text: JSON.stringify(raw) }] }], usage: { input_tokens: 50, output_tokens: 500, total_tokens: 550 } }), { status: 200, headers: { "content-type": "application/json", "x-request-id": "local-request" } });
  };
  const runner = service.createEchoReferenceIntelligence({
    userDataPath,
    credentialStore: { read: async () => { throw new Error("OpenAI credential must not be read"); } },
    fetchImpl,
    concurrency: 9,
  });
  await runner.resumeLocal({ limit: 1, repair: true });
  await runner._active();
  const status = await runner.status();
  assert.equal(status.authoringProvider, service.LOCAL_OMLX_PROVIDER);
  assert.equal(status.model, service.LOCAL_OMLX_MODEL);
  assert.equal(status.concurrency, 1);
  assert.equal(status.counts.completed, 1);
  assert.equal(status.counts.sourceConnections, 1);
  assert.equal(status.counts.missingConnections, 0);
  assert.equal(status.jobs[0].plan.author.provider, service.LOCAL_OMLX_PROVIDER);
  assert.deepEqual(calls, [`${service.LOCAL_OMLX_BASE_URL}/models`, `${service.LOCAL_OMLX_BASE_URL}/responses`, `${service.LOCAL_OMLX_BASE_URL}/responses`]);
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
