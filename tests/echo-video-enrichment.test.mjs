import test from "node:test";
import assert from "node:assert/strict";

import {
  CHAIN_EDGE_WEIGHTS,
  DIRECTOR_CANDIDATE_WEIGHTS,
  INTRINSIC_QUALITY_WEIGHTS,
  LOOP_CLASSIFICATION_WEIGHTS,
  SOURCE_PRIORS,
  TRANSITION_CLASSIFICATION_WEIGHTS,
  classifyLoop,
  classifySourcePrior,
  classifyTransition,
  normalizeCanonicalTag,
  normalizeCanonicalTags,
  scoreChainEdge,
  scoreDirectorCandidate,
  scoreIntrinsicQuality,
  sourcePriorFor,
} from "../src/domain/echo-video-enrichment.js";

function close(actual, expected, epsilon = 0.00001) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `${actual} should be within ${epsilon} of ${expected}`);
}

test("canonical tags are namespaced, slugged, aliased, unique, and deterministic", () => {
  assert.equal(normalizeCanonicalTag("Character: Réd O’Reaper"), "char:red-oreaper");
  assert.equal(normalizeCanonicalTag({ namespace: "Lighting", value: "Sunset Glow" }), "light:sunset-glow");
  assert.equal(normalizeCanonicalTag({ tag: "Character: Blue" }), "char:blue");
  assert.equal(normalizeCanonicalTag("Camera Pan Up"), "tag:camera-pan-up");
  assert.equal(normalizeCanonicalTag(""), "");
  assert.deepEqual(
    normalizeCanonicalTags(["Motif: Memory Surface", "motifs:memory surface", "action:Open Door", null]),
    ["action:open-door", "motif:memory-surface"],
  );
});

test("rubric weights remain complete and fixed", () => {
  for (const weights of [
    INTRINSIC_QUALITY_WEIGHTS,
    LOOP_CLASSIFICATION_WEIGHTS,
    TRANSITION_CLASSIFICATION_WEIGHTS,
    CHAIN_EDGE_WEIGHTS,
    DIRECTOR_CANDIDATE_WEIGHTS,
  ]) {
    close(Object.values(weights).reduce((sum, value) => sum + value, 0), 1);
  }
});

test("source prior recognizes each explicit high-trust class", () => {
  const attachment = classifySourcePrior({ provenance: { sourceClass: "verified attachment" } });
  assert.equal(attachment.sourceClass, "verified-attachment");
  assert.equal(attachment.prior, 1.1);

  const reference = classifySourcePrior({
    provenance: { sourceSystem: "echo-reference-atlas", reviewStatus: "approved" },
  });
  assert.equal(reference.sourceClass, "approved-reference");
  assert.equal(reference.prior, 1.05);

  const ordinary = classifySourcePrior({ technical: { status: "verified-source-file" } });
  assert.equal(ordinary.sourceClass, "verified-ordinary");
  assert.equal(ordinary.prior, 1);
  assert.equal(sourcePriorFor({ verifiedSource: true }), SOURCE_PRIORS.verifiedOrdinary);
});

test("source prior recognizes only explicit low-prior provenance", () => {
  const ltx = classifySourcePrior({ generator: { model: "dgrauet/ltx-2.3-mlx" } });
  assert.equal(ltx.sourceClass, "ltx-2.3");
  assert.equal(ltx.prior, 0.15);
  assert.equal(ltx.flags.ltx23, true);

  const devProto = classifySourcePrior({
    provenance: { sourcePath: "/Users/calderwong/comics/reviclips/clip-001.mp4" },
  });
  assert.equal(devProto.sourceClass, "hapa-dev-proto");
  assert.equal(devProto.prior, 0.1);

  const hellWeek = classifySourcePrior({ origin: { sourceNode: "Hell Week" } });
  assert.equal(hellWeek.sourceClass, "hell-week");
  assert.equal(hellWeek.prior, 0.1);

  assert.equal(classifySourcePrior({ provenance: { sourceClass: "hell-week" } }).prior, 0.1);
  assert.equal(classifySourcePrior("hapa-dev-proto").prior, 0.1);
  assert.equal(classifySourcePrior([{ generatorModel: "ltx-2.3" }]).prior, 0.15);
  assert.equal(classifySourcePrior({ enrichment: { media: { drawForge: { loopModel: "LTX 2.3 MLX bf16" } } } }).prior, 0.15);
});

test("multiple explicit low-prior sources use the minimum instead of multiplying", () => {
  const result = classifySourcePrior(
    { provenance: { sourceRepo: "hapa-dev-proto" } },
    { generator: { promptVersion: "hapa-ltx-2.3-card-loop-v1-no-camera" } },
  );
  assert.equal(result.prior, 0.1);
  assert.equal(result.sourceClass, "hapa-dev-proto");
  assert.equal(result.flags.hapaDevProto, true);
  assert.equal(result.flags.ltx23, true);
});

test("Hell Week, dev-proto, and LTX words in descriptive media fields never affect provenance", () => {
  const result = classifySourcePrior({
    title: "A Hell Week story rendered with LTX 2.3",
    name: "hapa-dev-proto retrospective",
    tags: ["hell-week", "ltx-2.3", "hapa-dev-proto"],
    description: "Imported from hapa-dev-proto during Hell Week",
    synopsis: "An LTX 2.3 experiment",
    transcript: "hell week",
    lyrics: "hapa dev proto",
    metadata: {
      ocr: "HELL WEEK",
      ocrText: "hapa-dev-proto LTX-2.3",
      labels: ["hell-week"],
    },
  });
  assert.equal(result.sourceClass, "unknown");
  assert.equal(result.prior, 0.7);
  assert.deepEqual(
    { ltx23: result.flags.ltx23, hapaDevProto: result.flags.hapaDevProto, hellWeek: result.flags.hellWeek },
    { ltx23: false, hapaDevProto: false, hellWeek: false },
  );
});

test("descriptive Hell Week text cannot override verified ordinary provenance", () => {
  const result = classifySourcePrior({
    title: "Hell Week",
    tags: ["hell-week"],
    metadata: { ocrText: "HELL WEEK", technical: { status: "verified-source-file" } },
  });
  assert.equal(result.sourceClass, "verified-ordinary");
  assert.equal(result.prior, 1);
  assert.equal(result.flags.hellWeek, false);
});

test("intrinsic quality applies the fixed 20/15/25/15/10/10/5 rubric", () => {
  const result = scoreIntrinsicQuality({
    visualCraftTechnicalFidelity: 80,
    temporalCoherenceMotionQuality: 60,
    hapaAestheticWorldAlignment: { score: 90, confidence: 80, rationale: "Strong sovereign-memory visual language." },
    narrativeSemanticLegibility: 70,
    characterCanonIntegrity: 100,
    compositionEditorialUtility: 50,
    libraryDistinctiveness: 40,
  });
  assert.equal(result.score, 75);
  assert.equal(result.normalizedScore, 0.75);
  assert.equal(result.tier, "strong");
  assert.equal(result.coverage, 1);
  assert.equal(result.confidence, 0.95);
  assert.match(result.rationale, /sovereign-memory/);
  assert.equal(result.sourceIndependent, true);
});

test("missing quality dimensions contribute zero and lower confidence without NaN", () => {
  const partial = scoreIntrinsicQuality({ hapaAesthetic: 100 });
  assert.equal(partial.score, 25);
  assert.equal(partial.coverage, 0.25);
  assert.equal(partial.confidence, 0.25);
  assert.equal(partial.tier, "provisional");

  const empty = scoreIntrinsicQuality();
  assert.equal(empty.score, 0);
  assert.equal(empty.coverage, 0);
  assert.equal(empty.confidence, 0);
  assert.equal(empty.tier, "unscored");
});

test("loop classification honors both score thresholds and one-way-state hard rejection", () => {
  const loop = classifyLoop(Object.fromEntries(Object.keys(LOOP_CLASSIFICATION_WEIGHTS).map((key) => [key, 0.8])));
  assert.equal(loop.score, 0.8);
  assert.equal(loop.classification, "loop");
  assert.equal(loop.eligible, true);

  const candidate = classifyLoop(Object.fromEntries(Object.keys(LOOP_CLASSIFICATION_WEIGHTS).map((key) => [key, 0.65])));
  assert.equal(candidate.classification, "loop-candidate");

  const rejected = classifyLoop({
    ...Object.fromEntries(Object.keys(LOOP_CLASSIFICATION_WEIGHTS).map((key) => [key, 1])),
    oneWayStateChange: true,
  });
  assert.equal(rejected.score, 1);
  assert.equal(rejected.classification, "not-loop");
  assert.equal(rejected.eligible, false);
  assert.deepEqual(rejected.reasons, ["irreversible-one-way-state-change"]);

  assert.equal(classifyLoop().classification, "insufficient-evidence");
});

test("transition classification uses directed state-change evidence and the 0.65 threshold", () => {
  const transition = classifyTransition(
    Object.fromEntries(Object.keys(TRANSITION_CLASSIFICATION_WEIGHTS).map((key) => [key, 0.65])),
  );
  assert.equal(transition.score, 0.65);
  assert.equal(transition.classification, "transition");
  assert.equal(transition.eligible, true);

  const weak = classifyTransition({ stateChange: 1, endpointLegibility: 1 });
  assert.equal(weak.score, 0.45);
  assert.equal(weak.classification, "not-transition");
  assert.equal(classifyTransition().classification, "insufficient-evidence");
});

test("declared keyframe transitions remain mapped without overstating visual validation", () => {
  const declared = classifyTransition({
    stateChange: 0.5,
    endpointLegibility: 0.8,
    declaredTransition: true,
    declaredEvidence: [{ type: "source-kind", value: "vibes-transition" }],
    declaredEndpoints: {
      first: { cardId: "reference:first", uri: "/media/first.png" },
      last: { cardId: "reference:last", uri: "/media/last.png" },
    },
  });
  assert.equal(declared.classification, "declared-transition");
  assert.equal(declared.visualClassification, "not-transition");
  assert.equal(declared.visuallyValidated, false);
  assert.equal(declared.declaredTransition, true);
  assert.equal(declared.eligible, true);
  assert.equal(declared.truthBoundary, "declared-directed-transition-awaiting-visual-validation");
  assert.deepEqual(declared.declaredEvidence, [{ type: "source-kind", value: "vibes-transition" }]);
  assert.equal(declared.declaredEndpoints.first.cardId, "reference:first");
  assert.equal(declared.declaredEndpoints.last.cardId, "reference:last");
});

test("loop and transition roles are independent and may both be true", () => {
  const loop = classifyLoop(Object.fromEntries(Object.keys(LOOP_CLASSIFICATION_WEIGHTS).map((key) => [key, 0.9])));
  const transition = classifyTransition(Object.fromEntries(Object.keys(TRANSITION_CLASSIFICATION_WEIGHTS).map((key) => [key, 0.9])));
  assert.equal(loop.eligible, true);
  assert.equal(transition.eligible, true);
});

test("chain edge scoring replaces the semantic placeholder with entity, canon, and motif evidence", () => {
  const result = scoreChainEdge({
    appearance: 1,
    subjectRoi: 0.8,
    palette: 0.6,
    motionDirection: 0.4,
    aspect: 1,
    entityAction: 0.9,
    characterCanon: 0.7,
    motifStory: 0.5,
  });
  assert.equal(result.score, 0.745);
  assert.equal(result.classification, "viable-chain");
  assert.equal(result.coverage, 1);
  assert.equal(result.components.entityActionContinuity.score, 0.9);
  assert.equal(result.components.characterCanonContinuity.score, 0.7);
  assert.equal(result.components.motifStoryContinuity.score, 0.5);

  const sparse = scoreChainEdge({ appearance: 1, entity: 1, canon: 1, motif: 1 });
  assert.equal(sparse.score, 0.55);
  assert.equal(sparse.coverage, 0.55);
  assert.equal(sparse.confidenceAdjustedScore, 0.3025);
});

test("Director score applies source prior and fatigue after the fixed base rubric", () => {
  const fullComponents = Object.fromEntries(Object.keys(DIRECTOR_CANDIDATE_WEIGHTS).map((key) => [key, 1]));
  const result = scoreDirectorCandidate({
    ...fullComponents,
    provenance: { sourceClass: "verified-attachment" },
    fatigueMultiplier: 0.8,
  });
  assert.equal(result.baseScore, 1);
  assert.equal(result.sourcePrior, 1.1);
  assert.equal(result.fatigueMultiplier, 0.8);
  assert.equal(result.finalScore, 0.88);
  assert.equal(result.formula, "baseScore * eligibilityGate * sourcePrior * fatigueMultiplier");

  const ltx = scoreDirectorCandidate({
    ...fullComponents,
    provenance: { generator: { model: "ltx-2.3-mlx" } },
  });
  assert.equal(ltx.sourcePrior, 0.15);
  assert.equal(ltx.finalScore, 0.15);
});

test("Director eligibility is a hard gate and missing data is deterministic", () => {
  const blocked = scoreDirectorCandidate({
    lyricFit: 1,
    sourcePrior: 1.1,
    hardFilters: ["missing-runtime-uri"],
  });
  assert.equal(blocked.baseScore, 0.19);
  assert.equal(blocked.eligibilityGate, 0);
  assert.equal(blocked.finalScore, 0);

  const empty = scoreDirectorCandidate();
  assert.equal(empty.baseScore, 0);
  assert.equal(empty.finalScore, 0);
  assert.equal(empty.sourcePrior, 0.7);
  assert.equal(empty.coverage, 0);
  assert.equal(Number.isNaN(empty.finalScore), false);

  assert.equal(classifyLoop(null).classification, "insufficient-evidence");
  const malformedClassification = scoreDirectorCandidate({
    lyricFit: 1,
    sourceClassification: { sourceClass: "missing-prior" },
  });
  assert.equal(malformedClassification.sourcePrior, 0.7);
  assert.equal(malformedClassification.finalScore, 0.133);
});
