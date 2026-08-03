/**
 * Pure scoring and normalization rules for the Echo video enrichment pass.
 *
 * No rule in this module reads files, clocks, random state, titles, OCR, or
 * descriptive text to infer provenance. Callers retain the evidence used to
 * create subjective inputs; this module only applies deterministic policy.
 */

export const ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION = "hapa.echo.video-enrichment.v1";

export const SOURCE_PRIORS = Object.freeze({
  verifiedAttachment: 1.1,
  approvedReference: 1.05,
  verifiedOrdinary: 1,
  unknown: 0.7,
  ltx23: 0.15,
  hapaDevProto: 0.1,
  hellWeek: 0.1,
});

export const INTRINSIC_QUALITY_WEIGHTS = Object.freeze({
  visualCraftTechnicalFidelity: 0.2,
  temporalCoherenceMotionQuality: 0.15,
  hapaAestheticWorldAlignment: 0.25,
  narrativeSemanticLegibility: 0.15,
  characterCanonIntegrity: 0.1,
  compositionEditorialUtility: 0.1,
  libraryDistinctiveness: 0.05,
});

export const LOOP_CLASSIFICATION_WEIGHTS = Object.freeze({
  endpointAppearance: 0.35,
  subjectRoiContinuity: 0.2,
  paletteLumaContinuity: 0.15,
  seamMotionContinuity: 0.15,
  semanticStateContinuity: 0.15,
});

export const TRANSITION_CLASSIFICATION_WEIGHTS = Object.freeze({
  directedStateChange: 0.25,
  entryExitKeyframeLegibility: 0.2,
  motionCoherence: 0.2,
  semanticBridgeUtility: 0.2,
  endpointDistinctness: 0.15,
});

export const CHAIN_EDGE_WEIGHTS = Object.freeze({
  endpointAppearance: 0.2,
  subjectRoiContinuity: 0.15,
  paletteContinuity: 0.1,
  motionDirectionContinuity: 0.15,
  aspectCropSafety: 0.05,
  entityActionContinuity: 0.15,
  characterCanonContinuity: 0.1,
  motifStoryContinuity: 0.1,
});

export const DIRECTOR_CANDIDATE_WEIGHTS = Object.freeze({
  lyricMomentSectionStemFit: 0.19,
  characterCanonReferenceFit: 0.16,
  objectActionSpecificity: 0.13,
  emotionalArcContribution: 0.1,
  intrinsicQuality: 0.12,
  chainContinuity: 0.09,
  transitionBridgeUtility: 0.15,
  cameraAspectSuitability: 0.025,
  technicalTruth: 0.025,
  noveltyRepetitionControl: 0.01,
});

const TAG_NAMESPACE_ALIASES = Object.freeze({
  character: "char",
  characters: "char",
  avatar: "char",
  avatars: "char",
  location: "place",
  locations: "place",
  setting: "place",
  settings: "place",
  object: "object",
  objects: "object",
  action: "action",
  actions: "action",
  motif: "motif",
  motifs: "motif",
  mechanic: "mechanic",
  mechanics: "mechanic",
  emotion: "emotion",
  emotions: "emotion",
  theme: "theme",
  themes: "theme",
  shot: "shot",
  shots: "shot",
  camera: "camera",
  motion: "motion",
  colour: "palette",
  color: "palette",
  palette: "palette",
  lighting: "light",
  light: "light",
  weather: "weather",
  time: "time",
  reference: "reference",
  references: "reference",
  source: "source",
  sources: "source",
  team: "team",
  teams: "team",
  world: "world",
  worlds: "world",
  role: "role",
  roles: "role",
  quality: "quality-tier",
  qualitytier: "quality-tier",
  "quality-tier": "quality-tier",
  review: "review",
});

const QUALITY_ALIASES = Object.freeze({
  visualCraftTechnicalFidelity: ["visualCraft", "technicalFidelity", "visualTechnical", "technical"],
  temporalCoherenceMotionQuality: ["temporalCoherence", "motionQuality", "temporalMotion"],
  hapaAestheticWorldAlignment: ["hapaAesthetic", "aestheticAlignment", "worldAlignment"],
  narrativeSemanticLegibility: ["narrativeLegibility", "semanticLegibility", "narrative"],
  characterCanonIntegrity: ["characterIntegrity", "canonIntegrity", "identityIntegrity"],
  compositionEditorialUtility: ["compositionUtility", "editorialUtility", "composition"],
  libraryDistinctiveness: ["distinctiveness", "novelty"],
});

const LOOP_ALIASES = Object.freeze({
  endpointAppearance: ["appearance", "endpointSimilarity", "appearanceSimilarity"],
  subjectRoiContinuity: ["subjectRoi", "roiContinuity", "subjectContinuity", "compositionContinuity"],
  paletteLumaContinuity: ["palette", "luma", "paletteContinuity", "lumaContinuity"],
  seamMotionContinuity: ["seamMotion", "motionContinuity", "velocityDirectionContinuity"],
  semanticStateContinuity: ["semanticState", "semanticContinuity", "stateContinuity"],
});

const TRANSITION_ALIASES = Object.freeze({
  directedStateChange: ["stateChange", "directedChange", "startEndStateChange"],
  entryExitKeyframeLegibility: ["entryExitLegibility", "keyframeLegibility", "endpointLegibility"],
  motionCoherence: ["motion", "transitionMotion"],
  semanticBridgeUtility: ["semanticBridge", "bridgeUtility", "semanticUtility"],
  endpointDistinctness: ["distinctness", "endpointDifference"],
});

const CHAIN_ALIASES = Object.freeze({
  endpointAppearance: ["appearance", "appearanceContinuity", "endpointSimilarity"],
  subjectRoiContinuity: ["subjectRoi", "roi", "subjectComposition", "composition"],
  paletteContinuity: ["palette", "paletteLuma"],
  motionDirectionContinuity: ["motionDirection", "motion", "velocityDirection"],
  aspectCropSafety: ["aspect", "cropSafety", "aspectSafety"],
  entityActionContinuity: ["entityAction", "entity", "action", "semanticEntityAction"],
  characterCanonContinuity: ["characterCanon", "character", "canon", "identityContinuity"],
  motifStoryContinuity: ["motifStory", "motif", "story", "storyContinuity"],
});

const DIRECTOR_ALIASES = Object.freeze({
  lyricMomentSectionStemFit: ["lyricFit", "momentFit", "sectionStemFit", "lyricMomentFit"],
  characterCanonReferenceFit: ["characterCanonReference", "characterFit", "canonReferenceFit"],
  objectActionSpecificity: ["objectAction", "actionSpecificity"],
  emotionalArcContribution: ["emotion", "emotionalArc", "arcContribution"],
  intrinsicQuality: ["quality", "qualityScore", "intrinsicQualityScore"],
  chainContinuity: ["chain", "chainScore", "continuity"],
  transitionBridgeUtility: ["transitionUtility", "motionEditorialUtility", "resolvedBridgeUtility"],
  cameraAspectSuitability: ["cameraAspect", "aspectSuitability", "cameraSuitability"],
  technicalTruth: ["technical", "technicalVerification"],
  noveltyRepetitionControl: ["novelty", "repetitionControl", "fatigueControl"],
});

const PROVENANCE_VALUE_KEYS = Object.freeze([
  "source",
  "sourceSystem",
  "cardSourceSystem",
  "adapterId",
  "sourceAdapter",
  "sourceRepo",
  "sourceRepository",
  "sourceNode",
  "sourceKind",
  "sourceFamily",
  "sourceClass",
  "priorClass",
  "sourceCatalog",
  "sourceManifest",
  "sourceReferenceRunId",
  "ingestSource",
  "originId",
  "originNode",
  "originSystem",
  "originType",
  "sourcePath",
  "targetPath",
  "originalPath",
  "rootPath",
  "relativePath",
  "repository",
  "repo",
  "provider",
  "pipeline",
  "model",
  "generatorModel",
  "modelId",
  "loopModel",
  "promptVersion",
  "loopPromptVersion",
  "generatorId",
  "generatorType",
]);

const PROVENANCE_CONTAINER_KEYS = Object.freeze([
  "origin",
  "provenance",
  "sourceProvenance",
  "cardOrigin",
  "hapaOrigin",
  "lineage",
  "records",
  "folderIngest",
  "storage",
  "custody",
  "generator",
  "attachment",
  "reference",
  "review",
  "metadata",
  "technical",
  "enrichment",
  "media",
  "assets",
  "artifacts",
  "sourceBenchmark",
  "drawForge",
  "processing",
  "source",
]);

const CLASSIFICATION_VALUE_KEYS = Object.freeze([
  "sourceClass",
  "priorClass",
  "classification",
  "verificationStatus",
  "sourceVerificationStatus",
  "custodyStatus",
  "reviewStatus",
  "approvalStatus",
  "mediaApprovalStatus",
  "attachmentStatus",
  "referenceStatus",
  "technicalStatus",
  "status",
]);

const CLASSIFICATION_BOOLEAN_KEYS = Object.freeze([
  "verifiedAttachment",
  "attachmentVerified",
  "isVerifiedAttachment",
  "exactAttachmentVerified",
  "approvedReference",
  "referenceApproved",
  "isApprovedReference",
  "verifiedSource",
  "sourceVerified",
  "custodyVerified",
  "isVerifiedSource",
  "verified",
]);

const HAPA_DEV_PROTO_MEDIA_ROOTS = Object.freeze([
  "/users/calderwong/comics/reviclips/",
  "/users/calderwong/comics/hapa-trains/",
]);

function finiteNumber(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function fixed(value, digits = 4) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : 0;
}

function toUnitScore(value) {
  const parsed = finiteNumber(value);
  if (parsed === null) return null;
  return fixed(clamp(parsed > 1 ? parsed / 100 : parsed));
}

function slug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

/** Normalize one tag into a stable namespace:value token. */
export function normalizeCanonicalTag(input, options = {}) {
  const fallbackNamespace = slug(options.defaultNamespace || options.defaultPrefix || "tag") || "tag";
  let namespace = "";
  let value = "";

  if (input && typeof input === "object" && !Array.isArray(input)) {
    namespace = input.namespace || input.prefix || input.category || input.type || "";
    value = input.value ?? input.tag ?? input.name ?? input.id ?? "";
    if (!namespace && String(value).includes(":")) {
      const separator = String(value).indexOf(":");
      namespace = String(value).slice(0, separator);
      value = String(value).slice(separator + 1);
    }
  } else {
    const raw = String(input ?? "").trim();
    const separator = raw.indexOf(":");
    if (separator >= 0) {
      namespace = raw.slice(0, separator);
      value = raw.slice(separator + 1);
    } else {
      value = raw;
    }
  }

  const normalizedValue = slug(value);
  if (!normalizedValue) return "";
  const rawNamespace = slug(namespace) || fallbackNamespace;
  const normalizedNamespace = TAG_NAMESPACE_ALIASES[rawNamespace] || rawNamespace;
  return `${normalizedNamespace}:${normalizedValue}`;
}

/** Normalize, remove blanks and duplicates, and sort for deterministic output. */
export function normalizeCanonicalTags(values, options = {}) {
  const list = Array.isArray(values) ? values.flat(Infinity) : [values];
  return [...new Set(list.map((value) => normalizeCanonicalTag(value, options)).filter(Boolean))].sort();
}

function primitiveEvidence(value, path, kind, output) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => primitiveEvidence(entry, `${path}[${index}]`, kind, output));
    return;
  }
  if (["string", "number", "boolean"].includes(typeof value)) {
    output.push({ path, kind, value: String(value) });
  }
}

function collectProvenanceEvidence(records) {
  const identity = [];
  const classification = [];
  const booleans = [];
  const roots = (Array.isArray(records) ? records.flat(Infinity) : [records]).filter((value) => value !== null && value !== undefined);
  const queue = [];
  roots.forEach((value, index) => {
    if (value && typeof value === "object") queue.push({ value, path: `$[${index}]` });
    else primitiveEvidence(value, `$[${index}]`, "identity", identity);
  });
  const visited = new Set();

  while (queue.length) {
    const { value, path } = queue.shift();
    if (!value || typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);

    for (const key of PROVENANCE_VALUE_KEYS) {
      if (!Object.hasOwn(value, key)) continue;
      primitiveEvidence(value[key], `${path}.${key}`, "identity", identity);
    }
    for (const key of CLASSIFICATION_VALUE_KEYS) {
      if (!Object.hasOwn(value, key)) continue;
      primitiveEvidence(value[key], `${path}.${key}`, "classification", classification);
    }
    for (const key of CLASSIFICATION_BOOLEAN_KEYS) {
      if (!Object.hasOwn(value, key) || typeof value[key] !== "boolean") continue;
      booleans.push({ path: `${path}.${key}`, kind: "boolean", value: value[key], key });
    }
    for (const key of PROVENANCE_CONTAINER_KEYS) {
      if (!Object.hasOwn(value, key)) continue;
      const nested = value[key];
      if (Array.isArray(nested)) {
        nested.forEach((entry, index) => {
          if (entry && typeof entry === "object") queue.push({ value: entry, path: `${path}.${key}[${index}]` });
          else primitiveEvidence(entry, `${path}.${key}[${index}]`, "identity", identity);
        });
      } else if (nested && typeof nested === "object") {
        queue.push({ value: nested, path: `${path}.${key}` });
      } else {
        primitiveEvidence(nested, `${path}.${key}`, "identity", identity);
      }
    }
  }

  const byPath = (left, right) => left.path.localeCompare(right.path) || left.value.localeCompare(right.value);
  identity.sort(byPath);
  classification.sort(byPath);
  booleans.sort((left, right) => left.path.localeCompare(right.path));
  return { identity, classification, booleans };
}

function normalizedEvidenceValue(value) {
  return String(value || "").trim().toLowerCase().replaceAll("\\", "/");
}

function isLtx23(value) {
  return /(?:^|[^a-z0-9])ltx[\s/_-]*v?2[.\s_-]+3(?:[^a-z0-9]|$)/i.test(value);
}

function isHapaDevProto(value) {
  const normalized = normalizedEvidenceValue(value);
  return normalized.includes("hapa-dev-proto")
    || HAPA_DEV_PROTO_MEDIA_ROOTS.some((root) => normalized.startsWith(root) || normalized.includes(root));
}

function isHellWeek(value) {
  return /(?:^|[^a-z0-9])hell[\s/_-]+week(?:[^a-z0-9]|$)/i.test(value);
}

function evidenceMatching(items, predicate) {
  return items.filter((item) => predicate(normalizedEvidenceValue(item.value)));
}

function booleanIsTrue(items, keys) {
  const wanted = new Set(keys);
  return items.some((item) => item.value === true && wanted.has(item.key));
}

/**
 * Classify source reputation from explicit provenance fields only.
 *
 * Descriptive title, OCR, transcript, synopsis and tag fields are deliberately
 * absent from the traversal above, so their words can never alter this result.
 */
export function classifySourcePrior(...records) {
  const evidence = collectProvenanceEvidence(records);
  const identityText = evidence.identity.map((item) => normalizedEvidenceValue(item.value));
  const classificationText = evidence.classification.map((item) => normalizedEvidenceValue(item.value));
  const allExplicitText = [...identityText, ...classificationText];

  const ltxEvidence = evidenceMatching(evidence.identity, isLtx23);
  const devProtoEvidence = evidenceMatching(evidence.identity, isHapaDevProto);
  const hellWeekEvidence = evidenceMatching(evidence.identity, isHellWeek);
  const lowFlags = [
    ltxEvidence.length ? { id: "ltx-2.3", prior: SOURCE_PRIORS.ltx23, evidence: ltxEvidence } : null,
    devProtoEvidence.length ? { id: "hapa-dev-proto", prior: SOURCE_PRIORS.hapaDevProto, evidence: devProtoEvidence } : null,
    hellWeekEvidence.length ? { id: "hell-week", prior: SOURCE_PRIORS.hellWeek, evidence: hellWeekEvidence } : null,
  ].filter(Boolean);

  const verifiedAttachment = booleanIsTrue(evidence.booleans, [
    "verifiedAttachment", "attachmentVerified", "isVerifiedAttachment", "exactAttachmentVerified",
  ]) || allExplicitText.some((value) => /(?:^|[^a-z])verified[-_\s]+attachment(?:[^a-z]|$)/.test(value));
  const referenceIdentity = identityText.some((value) => /reference[-_\s]+atlas|echo[-_\s]+reference/.test(value));
  const approvedReference = booleanIsTrue(evidence.booleans, [
    "approvedReference", "referenceApproved", "isApprovedReference",
  ]) || (referenceIdentity && classificationText.some((value) => /approved|verified/.test(value)));
  const verifiedOrdinary = booleanIsTrue(evidence.booleans, [
    "verifiedSource", "sourceVerified", "custodyVerified", "isVerifiedSource", "verified",
  ]) || classificationText.some((value) => /verified[-_\s]+source|source[-_\s]+verified|verified-source-file/.test(value));

  let sourceClass = "unknown";
  let prior = SOURCE_PRIORS.unknown;
  let selectedEvidence = [];

  if (lowFlags.length) {
    prior = Math.min(...lowFlags.map((flag) => flag.prior));
    const applied = lowFlags.filter((flag) => flag.prior === prior).map((flag) => flag.id).sort();
    sourceClass = applied.join("+");
    selectedEvidence = lowFlags.flatMap((flag) => flag.evidence);
  } else if (verifiedAttachment) {
    sourceClass = "verified-attachment";
    prior = SOURCE_PRIORS.verifiedAttachment;
    selectedEvidence = [...evidence.classification, ...evidence.booleans.filter((item) => item.value)];
  } else if (approvedReference) {
    sourceClass = "approved-reference";
    prior = SOURCE_PRIORS.approvedReference;
    selectedEvidence = [...evidence.identity.filter((item) => /reference/i.test(item.value)), ...evidence.classification];
  } else if (verifiedOrdinary) {
    sourceClass = "verified-ordinary";
    prior = SOURCE_PRIORS.verifiedOrdinary;
    selectedEvidence = [...evidence.classification, ...evidence.booleans.filter((item) => item.value)];
  }

  const flags = Object.freeze({
    ltx23: ltxEvidence.length > 0,
    hapaDevProto: devProtoEvidence.length > 0,
    hellWeek: hellWeekEvidence.length > 0,
    verifiedAttachment,
    approvedReference,
    verifiedOrdinary,
  });

  return {
    schemaVersion: `${ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION}.source-prior`,
    sourceClass,
    prior,
    flags,
    appliedRule: lowFlags.length
      ? "minimum-explicit-low-source-prior"
      : sourceClass,
    evidence: selectedEvidence.map(({ path, kind, value }) => ({ path, kind, value })),
    ignoredDescriptiveFields: ["title", "name", "ocr", "ocrText", "text", "tags", "description", "synopsis", "transcript", "lyrics"],
  };
}

export function sourcePriorFor(...records) {
  return classifySourcePrior(...records).prior;
}

function rootsFor(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return [{}];
  return [input, input.dimensions, input.components, input.scores, input.metrics].filter((value) => value && typeof value === "object" && !Array.isArray(value));
}

function componentAt(input, canonicalKey, aliases = []) {
  const keys = [canonicalKey, ...aliases];
  for (const root of rootsFor(input)) {
    for (const key of keys) {
      if (!Object.hasOwn(root, key)) continue;
      const raw = root[key];
      if (raw && typeof raw === "object" && !Array.isArray(raw)) {
        if (/unmeasured|missing|unknown/i.test(String(raw.status || ""))) continue;
        const score = toUnitScore(raw.score ?? raw.value ?? raw.rating ?? raw.percent);
        if (score === null) continue;
        return {
          score,
          confidence: toUnitScore(raw.confidence) ?? 1,
          rationale: String(raw.rationale || raw.reason || raw.notes || "").trim(),
          evidence: Array.isArray(raw.evidence) ? raw.evidence : [],
        };
      }
      const score = toUnitScore(raw);
      if (score !== null) return { score, confidence: 1, rationale: "", evidence: [] };
    }
  }
  return null;
}

function scoreWeightedRubric(input, weights, aliases) {
  const components = {};
  let score = 0;
  let coverage = 0;
  let confidence = 0;
  const rationales = [];

  for (const [key, weight] of Object.entries(weights)) {
    const measured = componentAt(input, key, aliases[key] || []);
    const componentScore = measured?.score ?? 0;
    const contribution = componentScore * weight;
    if (measured) {
      coverage += weight;
      confidence += weight * measured.confidence;
      if (measured.rationale) rationales.push(`${key}: ${measured.rationale}`);
    }
    score += contribution;
    components[key] = {
      score: fixed(componentScore),
      scorePercent: fixed(componentScore * 100, 2),
      weight,
      contribution: fixed(contribution),
      measured: Boolean(measured),
      confidence: fixed(measured?.confidence ?? 0),
      rationale: measured?.rationale || "",
      evidence: measured?.evidence || [],
    };
  }

  return {
    score: fixed(score),
    scorePercent: fixed(score * 100, 2),
    coverage: fixed(coverage),
    confidence: fixed(confidence),
    components,
    rationales,
  };
}

function qualityTier(score, coverage) {
  if (coverage === 0) return "unscored";
  if (coverage < 0.5) return "provisional";
  if (score >= 90) return "exceptional";
  if (score >= 80) return "excellent";
  if (score >= 70) return "strong";
  if (score >= 60) return "usable";
  if (score >= 45) return "mixed";
  return "weak";
}

/** Score source-independent quality on the fixed 100-point rubric. */
export function scoreIntrinsicQuality(input = {}) {
  const result = scoreWeightedRubric(input, INTRINSIC_QUALITY_WEIGHTS, QUALITY_ALIASES);
  const tier = qualityTier(result.scorePercent, result.coverage);
  return {
    schemaVersion: `${ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION}.intrinsic-quality`,
    score: result.scorePercent,
    normalizedScore: result.score,
    tier,
    qualityTier: tier,
    coverage: result.coverage,
    confidence: result.confidence,
    rationale: result.rationales.length
      ? result.rationales.join(" | ")
      : `Intrinsic quality ${result.scorePercent}/100 with ${fixed(result.coverage * 100, 1)}% rubric coverage.`,
    rationales: result.rationales,
    components: result.components,
    sourceIndependent: true,
  };
}

/** Classify a video's first-to-last seam as loop, candidate, or non-loop. */
export function classifyLoop(input = {}) {
  input = input && typeof input === "object" ? input : {};
  const result = scoreWeightedRubric(input, LOOP_CLASSIFICATION_WEIGHTS, LOOP_ALIASES);
  const oneWayStateChange = Boolean(
    input.oneWayStateChange
      ?? input.irreversibleStateChange
      ?? input.hasOneWayStateChange
      ?? input.constraints?.oneWayStateChange,
  );
  let classification = "not-loop";
  if (result.coverage === 0) classification = "insufficient-evidence";
  else if (oneWayStateChange) classification = "not-loop";
  else if (result.score >= 0.78) classification = "loop";
  else if (result.score >= 0.65) classification = "loop-candidate";

  return {
    schemaVersion: `${ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION}.loop-classification`,
    score: result.score,
    scorePercent: result.scorePercent,
    classification,
    eligible: classification === "loop" || classification === "loop-candidate",
    oneWayStateChange,
    coverage: result.coverage,
    confidence: result.confidence,
    components: result.components,
    thresholds: { loop: 0.78, candidate: 0.65 },
    reasons: oneWayStateChange ? ["irreversible-one-way-state-change"] : [],
  };
}

/** Classify a directed first-frame to last-frame state change. */
export function classifyTransition(input = {}) {
  const result = scoreWeightedRubric(input, TRANSITION_CLASSIFICATION_WEIGHTS, TRANSITION_ALIASES);
  const visualClassification = result.coverage === 0
    ? "insufficient-evidence"
    : result.score >= 0.65 ? "transition" : "not-transition";
  const declaredTransition = Boolean(
    input.declaredTransition
      ?? input.hasDeclaredTransition
      ?? input.constraints?.declaredTransition,
  );
  const declaredEvidence = (Array.isArray(input.declaredEvidence) ? input.declaredEvidence : [])
    .filter((entry) => entry !== null && entry !== undefined && entry !== "");
  const declaredEndpoints = input.declaredEndpoints && typeof input.declaredEndpoints === "object"
    ? input.declaredEndpoints
    : null;
  const classification = visualClassification === "transition"
    ? "transition"
    : declaredTransition ? "declared-transition" : visualClassification;
  return {
    schemaVersion: `${ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION}.transition-classification`,
    score: result.score,
    scorePercent: result.scorePercent,
    classification,
    visualClassification,
    visuallyValidated: visualClassification === "transition",
    declaredTransition,
    declaredEvidence,
    declaredEndpoints,
    eligible: classification === "transition" || classification === "declared-transition",
    coverage: result.coverage,
    confidence: result.confidence,
    components: result.components,
    threshold: 0.65,
    truthBoundary: declaredTransition && visualClassification !== "transition"
      ? "declared-directed-transition-awaiting-visual-validation"
      : visualClassification === "transition"
        ? "three-frame-visual-transition-classification"
        : "no-transition-claim",
  };
}

/** Score a possible last-frame -> first-frame chain edge. */
export function scoreChainEdge(input = {}) {
  const result = scoreWeightedRubric(input, CHAIN_EDGE_WEIGHTS, CHAIN_ALIASES);
  const confidenceAdjustedScore = fixed(result.score * result.confidence);
  const classification = result.coverage === 0
    ? "insufficient-evidence"
    : result.score >= 0.8 ? "strong-chain"
      : result.score >= 0.65 ? "viable-chain"
        : result.score >= 0.5 ? "weak-chain" : "poor-chain";
  return {
    schemaVersion: `${ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION}.chain-edge`,
    score: result.score,
    scorePercent: result.scorePercent,
    confidenceAdjustedScore,
    classification,
    coverage: result.coverage,
    confidence: result.confidence,
    components: result.components,
  };
}

function explicitPrior(input) {
  const raw = input?.sourcePrior;
  const parsed = finiteNumber(raw && typeof raw === "object" ? raw.prior : raw);
  return parsed === null ? null : fixed(clamp(parsed, 0, 2));
}

/**
 * Score Director utility, then apply eligibility, source reputation and
 * repetition fatigue without folding those modifiers into intrinsic quality.
 */
export function scoreDirectorCandidate(input = {}) {
  input = input && typeof input === "object" ? input : {};
  const result = scoreWeightedRubric(input, DIRECTOR_CANDIDATE_WEIGHTS, DIRECTOR_ALIASES);
  const suppliedClassificationPrior = finiteNumber(input.sourceClassification?.prior);
  const sourceClassification = input.sourceClassification && typeof input.sourceClassification === "object" && suppliedClassificationPrior !== null
    ? input.sourceClassification
    : classifySourcePrior(input);
  const sourcePrior = explicitPrior(input) ?? fixed(clamp(finiteNumber(sourceClassification.prior) ?? SOURCE_PRIORS.unknown, 0, 2));
  const fatigueMultiplier = toUnitScore(input.fatigueMultiplier ?? 1) ?? 1;
  const hardFilters = Array.isArray(input.hardFilters) ? input.hardFilters.filter(Boolean).map(String) : [];
  const eligible = input.eligibilityGate !== 0
    && input.eligibilityGate !== false
    && input.eligible !== false
    && input.disqualified !== true
    && hardFilters.length === 0;
  const eligibilityGate = eligible ? 1 : 0;
  const finalScore = fixed(result.score * eligibilityGate * sourcePrior * fatigueMultiplier);

  return {
    schemaVersion: `${ECHO_VIDEO_ENRICHMENT_SCHEMA_VERSION}.director-candidate`,
    baseScore: result.score,
    baseScorePercent: result.scorePercent,
    finalScore,
    finalScorePercent: fixed(finalScore * 100, 2),
    boundedFinalScore: fixed(clamp(finalScore)),
    eligibilityGate,
    eligible,
    hardFilters,
    sourcePrior,
    sourceClass: sourceClassification.sourceClass || "explicit-prior",
    sourceClassification,
    fatigueMultiplier,
    coverage: result.coverage,
    confidence: result.confidence,
    components: result.components,
    formula: "baseScore * eligibilityGate * sourcePrior * fatigueMultiplier",
  };
}

// Descriptive aliases make the domain API readable at each call site.
export const normalizeEnrichmentTag = normalizeCanonicalTag;
export const normalizeEnrichmentTags = normalizeCanonicalTags;
export const classifyEchoVideoSourcePrior = classifySourcePrior;
export const classifyVideoSourcePrior = classifySourcePrior;
export const scoreIntrinsicVideoQuality = scoreIntrinsicQuality;
export const classifyLoopCandidate = classifyLoop;
export const classifyTransitionCandidate = classifyTransition;
export const scoreVideoChainEdge = scoreChainEdge;
