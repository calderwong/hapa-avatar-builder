#!/usr/bin/env node
/**
 * Read-only operational validation for the full-song visual screenplay contract.
 * This intentionally does not import prompts, queue images, or touch process data.
 */
import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import process from "node:process";
import {
  deriveEchoSongVisualScreenplayContentHash,
  deriveEchoSongVisualScreenplayPromptHash,
} from "../src/domain/echo-scene-keyframe-process.js";

const SCHEMA_VERSION = "hapa.echo.full-song-visual-screenplay.v1";
const DEFAULT_DIRECTORY = "data/echo-scene-keyframes/screenplays";

function usage() {
  return [
    "Usage: node scripts/validate-echo-visual-screenplay.mjs [--file <screenplay.json>] [--dir <directory>]",
    "Read-only validation; it never creates runtime quests or provider requests.",
  ].join("\n");
}

function parseArgs(argv) {
  const options = { file: null, dir: DEFAULT_DIRECTORY, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") { options.help = true; continue; }
    if (value === "--file" || value === "--dir") {
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) throw new Error(`Missing value for ${value}`);
      options[value.slice(2)] = next;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${value}`);
  }
  return options;
}

function fail(errors, location, message) { errors.push(`${location}: ${message}`); }
function nonEmptyString(value) { return typeof value === "string" && value.trim().length > 0; }
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}
function hashValue(value) { return `sha256:${createHash("sha256").update(stableStringify(value)).digest("hex")}`; }
function hashMatches(declared, expected) { return declared === expected || declared === expected.replace(/^sha256:/u, "") || `sha256:${declared}` === expected; }
function normalizedVisualValue(value) { return String(value || "").trim().toLocaleLowerCase().replace(/\s+/gu, " "); }

function scaledDistinctMinimum(total, divisor, floor) {
  if (total <= 1) return 1;
  // Short phrase/proof sequences are governed by their local repetition
  // checks. Global diversity starts to matter after that, then scales with
  // the song length without weakening the album-sized threshold.
  if (total <= 3) return 1;
  if (total <= 8) return 2;
  return Math.min(total, Math.max(floor, Math.ceil(total / divisor)));
}

function functionalMechanicTerms(value) {
  const stopWords = new Set(["the", "and", "with", "from", "into", "that", "this", "through", "where", "when", "only", "like", "real", "story"]);
  return [...new Set(String(value || "").toLocaleLowerCase().match(/[\p{L}]{4,}/gu) || [])].filter((term) => !stopWords.has(term));
}

function validateAuthoringProvenance(provenance, errors) {
  if (!provenance || typeof provenance !== "object") { fail(errors, "document", "authoringProvenance is required"); return; }
  if (provenance.method === "legacy_heuristic" || provenance.method === "rejected") fail(errors, "document", `authoringProvenance.method=${provenance.method} is permanently unimportable`);
  if (provenance.method !== "direct_llm_analysis") fail(errors, "document", "authoringProvenance.method must be direct_llm_analysis");
  for (const field of ["requestedModel", "agentTaskName", "sourcePacketHash", "instructionHash", "startedAt", "completedAt", "artifactHash"]) {
    if (!nonEmptyString(provenance[field])) fail(errors, "document", `authoringProvenance.${field} is required`);
  }
  if (provenance.promptAuthoringPolicy !== "no-deterministic-scene-generation") fail(errors, "document", "authoringProvenance.promptAuthoringPolicy must prohibit deterministic scene generation");
  if (provenance.heuristicGeneratorUsed !== false) fail(errors, "document", "authoringProvenance.heuristicGeneratorUsed must be false");
  const startedAt = Date.parse(provenance.startedAt); const completedAt = Date.parse(provenance.completedAt);
  if (!Number.isFinite(startedAt) || !Number.isFinite(completedAt) || completedAt < startedAt) fail(errors, "document", "authoringProvenance timestamps must be valid and ordered");
  const expectedHash = hashValue({ method: provenance.method, requestedModel: provenance.requestedModel, agentTaskName: provenance.agentTaskName, sourcePacketHash: provenance.sourcePacketHash, instructionHash: provenance.instructionHash, startedAt: provenance.startedAt, completedAt: provenance.completedAt, promptAuthoringPolicy: provenance.promptAuthoringPolicy, heuristicGeneratorUsed: provenance.heuristicGeneratorUsed });
  if (!hashMatches(provenance.artifactHash, expectedHash)) fail(errors, "document", "authoringProvenance.artifactHash does not match authoring payload");
  const attestation = provenance.attestation;
  if (!attestation || typeof attestation !== "object" || attestation.type !== "authoring-provenance-v1" || !hashMatches(attestation.artifactHash, expectedHash) || !nonEmptyString(attestation.attestedBy) || !nonEmptyString(attestation.attestedAt)) {
    fail(errors, "document", "authoringProvenance.attestation must bind the authoring artifact hash");
  } else if (!Number.isFinite(Date.parse(attestation.attestedAt)) || Date.parse(attestation.attestedAt) < completedAt) {
    fail(errors, "document", "authoringProvenance.attestation.attestedAt must be valid and no earlier than completedAt");
  }
}

function promptSentenceSkeleton(count) {
  return authoredSurfaceSkeleton(count, count?.prompt?.gptImagePrompt);
}

function authoredSurfaceSkeleton(count, value) {
  let text = String(value || "").toLocaleLowerCase();
  const extraction = count?.semanticExtraction || {};
  const replacements = [
    ...Object.values(count?.shot || {}),
    ...["nouns", "verbs", "visibleActions", "concepts", "teachings", "symbols", "wordplayCues", "explicitReferences", "hiddenReferenceCandidates"]
      .flatMap((key) => Array.isArray(extraction[key]) ? extraction[key] : []),
    extraction.emotionalMovement,
    extraction.teachingOrQuestion,
    ...(extraction.lyricCitations || []).map((citation) => citation?.excerpt),
    ...(count?.castAppearances || []).flatMap((appearance) => [appearance?.narrativeFunction, appearance?.evidenceBasis]),
  ].filter((replacement) => typeof replacement === "string" && replacement.trim())
    .sort((left, right) => String(right).length - String(left).length);
  for (const replacement of replacements) {
    const escaped = String(replacement).replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
    if (escaped) text = text.replace(new RegExp(escaped, "gu"), "{slot}");
  }
  return text.replace(/\b\d+(?:[.:]\d+)*\b/gu, "{number}").replace(/\s+/gu, " ").trim();
}

function validateReservoirInspiration(count, location, errors) {
  const inspirations = count?.semanticExtraction?.nonInheritedReservoirInspiration;
  if (inspirations === undefined) return;
  if (!Array.isArray(inspirations)) {
    fail(errors, location, "nonInheritedReservoirInspiration must be an array");
    return;
  }
  for (const [index, inspiration] of inspirations.entries()) {
    const inspirationLocation = `${location}.nonInheritedReservoirInspiration[${index}]`;
    if (inspiration?.notEvidenceOfSongReference !== true) {
      fail(errors, inspirationLocation, "must declare notEvidenceOfSongReference: true");
    }
    const terms = functionalMechanicTerms(inspiration?.mechanicOnly);
    if (terms.length < 3) {
      fail(errors, inspirationLocation, "mechanicOnly must be a concrete functional phrase");
      continue;
    }
    const surfaces = [count?.shot?.action, count?.prompt?.sceneText, count?.prompt?.gptImagePrompt, count?.prompt?.justification]
      .map((value) => normalizedVisualValue(value));
    if (!surfaces.some((surface) => terms.filter((term) => surface.includes(term)).length >= 2)) {
      fail(errors, inspirationLocation, "mechanicOnly is decorative rather than materially explained in the scene");
    }
  }
}

function validateCast(document, counts, errors) {
  const seeds = new Map();
  for (const seed of document?.avatarContinuity?.seedAssets || []) {
    if (!nonEmptyString(seed?.avatarId) || !nonEmptyString(seed?.assetId) || !nonEmptyString(seed?.retrievalHandle)) fail(errors, "document", "each Avatar seed requires avatarId, assetId, and retrievalHandle");
    if (seeds.has(seed?.assetId)) fail(errors, "document", `duplicate Avatar seed assetId: ${seed?.assetId}`);
    seeds.set(seed?.assetId, seed);
  }
  const attribution = new Map();
  for (const member of document?.avatarContinuity?.castAttribution || []) {
    if (!nonEmptyString(member?.avatarId) || attribution.has(member?.avatarId)) fail(errors, "document", `invalid or duplicate cast attribution: ${member?.avatarId || "missing"}`);
    attribution.set(member?.avatarId, member);
    if (!Array.isArray(member?.seedAssetIds) || !member.seedAssetIds.length || member.seedAssetIds.some((id) => !seeds.has(id))) fail(errors, "document", `cast attribution requires registered seeds: ${member?.avatarId}`);
    if (member?.castClass === "referenced-avatar" && !/(confirmed|verified|resolved|explicit|user)/u.test(String(member?.evidenceStatus || "").toLowerCase())) fail(errors, "document", `referenced Avatar requires resolved attribution evidence: ${member?.avatarId}`);
  }
  const primaryAvatarId = document?.avatarContinuity?.castPolicy?.primaryAvatarId || document?.avatarContinuity?.seedAssets?.find((seed) => seed.castRole === "primary")?.avatarId || document?.avatarContinuity?.seedAssets?.[0]?.avatarId;
  for (const [index, count] of counts.entries()) {
    if (count.castAppearances === undefined) continue;
    const location = `count[${index}].castAppearances`;
    if (!Array.isArray(count.castAppearances) || !count.castAppearances.length) { fail(errors, location, "must be a non-empty array"); continue; }
    let primaryOnScreen = false; let additions = 0;
    const seen = new Set();
    for (const appearance of count.castAppearances) {
      if (!nonEmptyString(appearance?.avatarId) || seen.has(appearance?.avatarId)) fail(errors, location, `invalid or duplicate Avatar: ${appearance?.avatarId || "missing"}`);
      seen.add(appearance?.avatarId);
      if (appearance?.avatarId !== primaryAvatarId && !attribution.has(appearance?.avatarId)) fail(errors, location, `unattributed additional Avatar: ${appearance?.avatarId}`);
      if (!nonEmptyString(appearance?.narrativeFunction) || !nonEmptyString(appearance?.evidenceBasis)) fail(errors, location, `Avatar ${appearance?.avatarId} requires narrativeFunction and evidenceBasis`);
      if (appearance?.presence === "on_screen") {
        if (!Array.isArray(appearance.seedAssetIds) || !appearance.seedAssetIds.length) fail(errors, location, `on-screen Avatar ${appearance?.avatarId} requires seeds`);
        for (const id of appearance?.seedAssetIds || []) if (seeds.get(id)?.avatarId !== appearance.avatarId) fail(errors, location, `Avatar ${appearance.avatarId} has foreign or missing seed ${id}`);
        if (appearance.avatarId === primaryAvatarId) primaryOnScreen = true; else additions += 1;
      } else if (appearance?.seedAssetIds?.length) fail(errors, location, `non-visible Avatar ${appearance?.avatarId} must not add image seeds`);
    }
    if (additions && !primaryOnScreen) fail(errors, location, "additional cast must appear on top of the primary director Avatar");
    if (additions > 3) fail(errors, location, "at most three additional on-screen cast members are allowed");
  }
}

function validateEnhancedPromptLeadDiversity(document, counts, errors) {
  if (!document?.avatarContinuity?.castPolicy || counts.length < 6) return;
  const leads = new Map();
  for (const count of counts) {
    const lead = String(count?.prompt?.gptImagePrompt || "").split(/[.!?]/u, 1)[0].toLocaleLowerCase()
      .replace(/\b\d+(?:[.:]\d+)*\b/gu, "{number}").replace(/[“”"']/gu, "").replace(/\s+/gu, " ").trim();
    const key = lead.split(" ").slice(0, 8).join(" ");
    const rows = leads.get(key) || [];
    rows.push(count?.countId);
    leads.set(key, rows);
  }
  const maximumReuse = Math.max(2, Math.ceil(counts.length / 12));
  for (const [lead, rows] of leads) if (rows.length > maximumReuse) fail(errors, "document", `repeated enhanced prompt lead appears ${rows.length} times (maximum ${maximumReuse}): ${lead}`);
  const surfaces = [
    ["sceneText", (count) => count?.prompt?.sceneText],
    ["justification", (count) => count?.prompt?.justification],
    ["metaphor", (count) => count?.semanticExtraction?.metaphor],
  ];
  for (const [label, read] of surfaces) {
    const skeletons = new Map();
    for (const count of counts) {
      const skeleton = authoredSurfaceSkeleton(count, read(count));
      const rows = skeletons.get(skeleton) || [];
      rows.push(count?.countId);
      skeletons.set(skeleton, rows);
    }
    for (const [skeleton, rows] of skeletons) {
      if (rows.length > maximumReuse) fail(errors, "document", `repeated authored ${label} scaffold appears ${rows.length} times (maximum ${maximumReuse}): ${skeleton.slice(0, 180)}`);
    }
  }
}

function validateCount(count, location, errors) {
  if (!nonEmptyString(count?.countId)) fail(errors, location, "countId is required");
  const window = count?.window;
  const beatLength = Number(window?.beatEndExclusive) - Number(window?.beatStart);
  if (!window || (beatLength !== 4 && !(window.partialFinalCount === true && beatLength > 0 && beatLength < 4))) {
    fail(errors, location, "window must represent four beats, except an explicitly marked partial final count");
  }
  if (!(Number(window?.endSeconds) > Number(window?.startSeconds))) {
    fail(errors, location, "window endSeconds must be later than startSeconds");
  }
  const extraction = count?.semanticExtraction;
  const requiredLists = ["nouns", "verbs", "visibleActions", "concepts", "teachings", "symbols"];
  const evidenceLists = ["wordplayCues", "explicitReferences", "hiddenReferenceCandidates"];
  if (requiredLists.some((field) => !Array.isArray(extraction?.[field]) || !extraction[field].length)
    || evidenceLists.some((field) => !Array.isArray(extraction?.[field]))
    || !nonEmptyString(extraction?.emotionalMovement) || !nonEmptyString(extraction?.metaphor)) {
    fail(errors, location, "semantic extraction requires complete noun/action/concept/teaching/symbol/emotion/wordplay/reference mining");
  }
  if (!Array.isArray(extraction?.lyricCitations)) {
    fail(errors, location, "semantic extraction requires lyricCitations");
  } else if (!extraction.lyricCitations.length && extraction?.explicitNoLyricOverlap !== true) {
    fail(errors, location, "a count without lyric citations requires explicitNoLyricOverlap: true");
  }
  const mechanics = extraction?.referenceMechanics;
  if (!Array.isArray(mechanics)) {
    fail(errors, location, "semantic extraction requires referenceMechanics");
  } else if (!mechanics.length && extraction?.explicitNoReferenceApplies !== true) {
    fail(errors, location, "requires a reference mechanic or explicitNoReferenceApplies: true");
  }
  for (const [index, mechanic] of (mechanics || []).entries()) {
    if (!nonEmptyString(mechanic?.connectorId) || !nonEmptyString(mechanic?.mechanic)
      || !nonEmptyString(mechanic?.visualAffordance) || !nonEmptyString(mechanic?.nonLiteralTranslation)) {
      fail(errors, `${location}.referenceMechanics[${index}]`, "requires connectorId, mechanic, visualAffordance, and nonLiteralTranslation");
    }
  }
  validateReservoirInspiration(count, location, errors);
  const shot = count?.shot;
  for (const field of ["location", "action", "primaryMotif", "camera", "composition", "lighting", "energy"]) {
    if (!nonEmptyString(shot?.[field])) fail(errors, location, `shot.${field} is required`);
  }
  if (shot?.intentionalHold === true && !nonEmptyString(shot?.holdReason)) {
    fail(errors, location, "intentionalHold requires a holdReason");
  }
  const prompt = count?.prompt;
  if (prompt?.executionMode !== "stage_only") fail(errors, location, "prompt.executionMode must be stage_only");
  if (!["staged", "approved", "stale", "rejected", "missing"].includes(prompt?.status)) fail(errors, location, "invalid prompt status");
  if (["staged", "approved"].includes(prompt?.status)) {
    for (const field of ["sceneText", "gptImagePrompt", "negativePrompt", "justification", "promptHash"]) {
      if (!nonEmptyString(prompt?.[field])) fail(errors, location, `staged prompt requires ${field}`);
    }
  }
  const activation = count?.imageActivation;
  if (!activation || !nonEmptyString(activation.status)) fail(errors, location, "imageActivation.status is required");
  if (activation?.status !== "not_requested") {
    if (prompt?.status !== "approved") fail(errors, location, "image activation requires an approved prompt");
    if (!nonEmptyString(activation?.approvedPromptHash) || activation.approvedPromptHash !== prompt?.promptHash) {
      fail(errors, location, "activation must bind the current approved prompt hash");
    }
    if (!nonEmptyString(activation?.activationId) || !nonEmptyString(activation?.requestedBy)) {
      fail(errors, location, "activation requires activationId and requestedBy");
    }
  }
}

function tupleFor(count, fields) { return fields.map((field) => String(count.shot?.[field] || "")).join("\u001f"); }

function validateGlobalSceneDiversity(counts, errors) {
  const diversityCounts = counts.filter((count) => count?.shot?.intentionalHold !== true);
  const total = diversityCounts.length || 1;
  const policies = {
    composition: { minimum: scaledDistinctMinimum(total, 8, 3) },
    action: { minimum: scaledDistinctMinimum(total, 6, 4) },
    location: { minimum: scaledDistinctMinimum(total, 12, 3) },
    camera: { minimum: scaledDistinctMinimum(total, 10, 3) },
  };
  for (const [field, policy] of Object.entries(policies)) {
    const distinct = new Set(diversityCounts.map((count) => normalizedVisualValue(count?.shot?.[field]))).size || 1;
    if (distinct < policy.minimum) {
      fail(errors, "document", `global ${field} diversity is too low: ${distinct} distinct values; requires at least ${policy.minimum} across ${total} non-hold counts`);
    }
  }
  const skeletons = new Map();
  for (const count of counts) {
    const skeleton = promptSentenceSkeleton(count);
    const rows = skeletons.get(skeleton) || [];
    rows.push(count);
    skeletons.set(skeleton, rows);
  }
  const maximumSkeletonReuse = Math.max(2, Math.ceil(total / 18));
  for (const [skeleton, rows] of skeletons.entries()) {
    if (rows.length <= maximumSkeletonReuse) continue;
    const intentionalPhraseContinuity = rows.every((count) => count?.shot?.intentionalHold === true && nonEmptyString(count?.shot?.holdReason));
    if (!intentionalPhraseContinuity) {
      fail(errors, "document", `repeated prompt sentence skeleton appears ${rows.length} times (maximum ${maximumSkeletonReuse}) without intentional phrase continuity: ${rows.map((count) => count?.countId).join(", ")}`);
    }
  }
}

function validateDocument(document, filePath) {
  const errors = [];
  if (document?.schemaVersion !== SCHEMA_VERSION) fail(errors, "document", `schemaVersion must be ${SCHEMA_VERSION}`);
  if (!nonEmptyString(document?.songId)) fail(errors, "document", "songId is required");
  validateAuthoringProvenance(document?.authoringProvenance, errors);
  if (document?.generationPolicy?.promptImportMode !== "stage_only") fail(errors, "document", "promptImportMode must be stage_only");
  if (document?.generationPolicy?.imageActivationRequired !== true) fail(errors, "document", "imageActivationRequired must be true");
  if (document?.generationPolicy?.providerPolicy !== "codex-built-in-gpt-image-only") fail(errors, "document", "providerPolicy must be codex-built-in-gpt-image-only");
  if (document?.semanticMining?.referencePolicy?.rule !== "reference-as-mechanic-not-copy" || document?.semanticMining?.referencePolicy?.literalDepictionAllowed !== false) {
    fail(errors, "document", "reference policy must prohibit literal reference depiction");
  }
  if (!Array.isArray(document?.avatarContinuity?.seedAssets) || !document.avatarContinuity.seedAssets.length) {
    fail(errors, "document", "at least one Avatar seed is required");
  }
  const countIds = new Set();
  const allCounts = [];
  for (const [sequenceIndex, sequence] of (document?.sequencePlan || []).entries()) {
    const sequenceLocation = `sequencePlan[${sequenceIndex}]`;
    const gate = sequence?.diversityGate;
    if (!gate || gate.requireActionOrStateChange !== true || gate.intentionalHoldRequiresReason !== true || gate.repetitionReviewRequired !== true) {
      fail(errors, sequenceLocation, "requires the full diversity gate");
      continue;
    }
    const fields = gate.tupleFields || [];
    const max = Number(gate.maxAdjacentDuplicateVisualTuples);
    let lastTuple = null;
    let run = 0;
    for (const [countIndex, count] of (sequence?.counts || []).entries()) {
      const location = `${sequenceLocation}.counts[${countIndex}]`;
      validateCount(count, location, errors);
      if (countIds.has(count?.countId)) fail(errors, location, "countId must be unique across the screenplay");
      countIds.add(count?.countId);
      allCounts.push(count);
      const tuple = tupleFor(count || {}, fields);
      run = tuple === lastTuple ? run + 1 : 1;
      if (Number.isInteger(max) && run > max) fail(errors, location, `visual tuple repeats more than ${max} adjacent counts`);
      lastTuple = tuple;
    }
  }
  for (const [index, count] of allCounts.entries()) {
    const expectedPromptHash = deriveEchoSongVisualScreenplayPromptHash(document, count, {
      previous: index ? { id: allCounts[index - 1].countId } : null,
      next: index < allCounts.length - 1 ? { id: allCounts[index + 1].countId } : null,
    });
    if (!hashMatches(count?.prompt?.promptHash, expectedPromptHash)) {
      fail(errors, `count:${count?.countId || index}`, "promptHash does not match canonical runtime prompt content");
    }
  }
  validateCast(document, allCounts, errors);
  validateEnhancedPromptLeadDiversity(document, allCounts, errors);
  validateGlobalSceneDiversity(allCounts, errors);
  if (!nonEmptyString(document?.provenance?.contentHash)) {
    fail(errors, "document", "provenance.contentHash is required");
  } else {
    const expectedContentHash = deriveEchoSongVisualScreenplayContentHash(document);
    if (!hashMatches(document.provenance.contentHash, expectedContentHash)) {
      fail(errors, "document", "provenance.contentHash does not match canonical screenplay content");
    }
  }
  return errors;
}

function loadFiles(options) {
  if (options.file) return [path.resolve(options.file)];
  const directory = path.resolve(options.dir);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory).filter((name) => name.endsWith(".json")).sort().map((name) => path.join(directory, name));
}

try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) { console.log(usage()); process.exit(0); }
  const files = loadFiles(options);
  if (!files.length) {
    console.log(`No screenplay JSON files found; nothing to validate (${options.file ? path.resolve(options.file) : path.resolve(options.dir)}).`);
    process.exit(0);
  }
  let invalid = 0;
  for (const filePath of files) {
    let document;
    try { document = JSON.parse(fs.readFileSync(filePath, "utf8")); } catch (error) {
      invalid += 1;
      console.error(`FAIL ${filePath}: invalid JSON (${error.message})`);
      continue;
    }
    const errors = validateDocument(document, filePath);
    if (errors.length) {
      invalid += 1;
      console.error(`FAIL ${filePath}`);
      for (const error of errors) console.error(`  - ${error}`);
    } else {
      console.log(`OK ${filePath}`);
    }
  }
  process.exit(invalid ? 1 : 0);
} catch (error) {
  console.error(error.message);
  console.error(usage());
  process.exit(1);
}
