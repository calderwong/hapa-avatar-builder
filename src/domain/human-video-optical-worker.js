import { assertHumanVideoOpticalTextBoundary } from "./human-video-optical-boundary.js";

const FORBIDDEN_OUTPUT_KEYS = new Set([
  "avatarrelationships",
  "knowledgecomparisons",
  "matches",
  "referencematches",
  "references",
  "relationships",
]);

const TOP_LEVEL_PALETTE_KEYS = new Set(["palette", "overallpalette", "videopalette"]);
const PREVALENCE = new Set(["dominant", "supporting", "accent"]);
const TOP_LEVEL_OUTPUT_KEYS = normalizedKeys([
  "frames", "perFrame", "per_frame", "description", "overallDescription", "overall_description", "quality", "qualityExplanation", "quality_explanation",
  "categories", "tags", "referenceSignals", "visibleReferenceSignals", "observedSignals", "directorNotes", "director_notes", "strengths", "issues",
  "technicalArtisticIssues", "uncertainty", "confidence", "reviewerAttestation", "attestation", "reviewer_attestation",
]);
const FRAME_OUTPUT_KEYS = normalizedKeys(["role", "label", "frame", "ordinal", "observation", "literalObservation", "literal_observation", "visualObservation", "description", "palette", "dominantPalette", "dominant_palette", "colors"]);
const PALETTE_OUTPUT_KEYS = normalizedKeys(["colors", "uncertainty"]);
const COLOR_OUTPUT_KEYS = normalizedKeys(["hex", "value", "label", "name", "prevalence", "role", "explanation", "evidence", "whereSeen", "uncertainty"]);
const QUALITY_OUTPUT_KEYS = normalizedKeys(["value", "score", "grade", "explanation", "technicalUsability", "visualCraft", "narrativeValue", "identityConfidence"]);

export function createHumanVideoOpticalReviewFromClaim(job = {}, rawInput = {}, scheduler = {}) {
  const raw = unwrap(rawInput);
  assertNoForbiddenReferenceFields(raw);
  assertAllowedWorkerShape(raw);
  assertHumanVideoOpticalTextBoundary(raw);
  const frameSet = Array.isArray(job.frames) ? job.frames : [];
  if (frameSet.length < 3) throw workerError("optical_worker_claim_frames_required", "The claimed optical job does not contain three registered frames.");
  const sourceFrames = frameRows(raw);
  if (sourceFrames.length !== frameSet.length) {
    throw workerError("optical_worker_frame_count_mismatch", `The worker returned ${sourceFrames.length} frame rows for a ${frameSet.length}-frame claim.`);
  }
  const matchedFrames = matchWorkerFrames(sourceFrames, frameSet);
  const fieldNormalization = [];
  const frames = frameSet.map((claimedFrame, index) => {
    const role = claimedFrame.role || roleAt(index, frameSet.length);
    const source = matchedFrames[index];
    const observation = multiline(source.observation || source.literalObservation || source.literal_observation || source.visualObservation || source.description);
    if (!observation) throw workerError("optical_worker_frame_observation_required", `The ${role} frame is missing a literal visual observation.`);
    if (!source.observation && (source.literalObservation || source.literal_observation || source.visualObservation || source.description)) fieldNormalization.push(`frames.${role}.observation`);
    const paletteInput = source.palette || source.dominantPalette || source.dominant_palette || source.colors;
    if (!source.palette && paletteInput) fieldNormalization.push(`frames.${role}.palette`);
    return {
      timestampSeconds: claimedFrame.timestampSeconds,
      normalizedPosition: claimedFrame.normalizedPosition,
      imagePath: claimedFrame.imagePath,
      imageUri: claimedFrame.imageUri || "",
      sha256: claimedFrame.sha256,
      observation,
      palette: normalizePalette(paletteInput, role, fieldNormalization),
    };
  });
  const qualityInput = raw.quality && typeof raw.quality === "object" ? raw.quality : { value: raw.quality };
  const qualityValue = integer(qualityInput.value ?? qualityInput.score ?? qualityInput.grade, NaN);
  if (!Number.isInteger(qualityValue) || qualityValue < 1 || qualityValue > 5) throw workerError("optical_worker_quality_required", "The worker must return one explained Quality grade from 1 to 5.");
  if (qualityInput.value == null && (qualityInput.score != null || qualityInput.grade != null)) fieldNormalization.push("quality.value");
  const qualityExplanation = multiline(qualityInput.explanation || raw.qualityExplanation || raw.quality_explanation);
  if (!qualityExplanation) throw workerError("optical_worker_quality_explanation_required", "The worker must explain its Quality grade.");
  const description = multiline(raw.description || raw.overallDescription || raw.overall_description);
  if (!description) throw workerError("optical_worker_description_required", "The worker must return an overall visual description.");
  if (!raw.description) fieldNormalization.push("description");
  const attestation = multiline(raw.reviewerAttestation || raw.attestation || raw.reviewer_attestation);
  if (!attestation) throw workerError("optical_worker_attestation_required", "The worker must attest that it personally inspected every claimed frame.");
  const reviewer = {
    agentId: text(scheduler.workerId || job.lease?.workerId, 240),
    taskId: text(scheduler.taskId || scheduler.workerId || job.lease?.workerId, 500),
    model: text(scheduler.model || scheduler.configuration?.model || "gpt-5.6-terra", 240),
    reasoningEffort: text(scheduler.reasoningEffort || scheduler.configuration?.reasoningEffort || "medium", 80),
    parameters: scheduler.parameters || {},
    opticalInspectionConfirmed: true,
    attestation,
    fieldNormalization: [...new Set(fieldNormalization)],
    schedulerReceipt: {
      campaignId: text(scheduler.campaignId || scheduler.configuration?.campaignId, 500),
      jobId: text(job.id, 600),
      attempt: integer(job.attempt, 0),
      frameDigest: text(job.frameDigest, 240),
      claimedAt: text(job.lease?.claimedAt, 80) || null,
      submittedAt: text(scheduler.submittedAt, 80) || null,
      telemetryStatus: text(scheduler.telemetryStatus || job.schedulerTelemetry?.status || "", 80),
      telemetrySource: text(scheduler.telemetrySource || job.schedulerTelemetry?.source || "", 360),
      sessionId: text(scheduler.sessionId || job.schedulerTelemetry?.sessionId || "", 500),
      completionToken: text(scheduler.completionToken, 500),
      resultDigest: text(scheduler.resultDigest, 240),
    },
  };
  return {
    videoKey: job.videoKey,
    videoId: job.videoId,
    videoName: job.videoName,
    status: "pending-human",
    expectedRevision: 0,
    reviewer,
    evidence: { requiredFrameCount: frameSet.length, frames },
    proposal: {
      description,
      quality: {
        value: qualityValue,
        explanation: qualityExplanation,
        technicalUsability: score(qualityInput.technicalUsability),
        visualCraft: score(qualityInput.visualCraft),
        narrativeValue: score(qualityInput.narrativeValue),
        identityConfidence: score(qualityInput.identityConfidence),
      },
      categories: strings(raw.categories),
      tags: strings(raw.tags),
      referenceSignals: strings(raw.referenceSignals || raw.visibleReferenceSignals || raw.observedSignals),
      directorNotes: multiline(raw.directorNotes || raw.director_notes),
      strengths: strings(raw.strengths),
      issues: strings(raw.issues || raw.technicalArtisticIssues),
      uncertainty: multiline(Array.isArray(raw.uncertainty) ? raw.uncertainty.join("\n") : raw.uncertainty),
      confidence: score(raw.confidence),
      avatarRelationships: [],
      references: [],
    },
    knowledgeComparisons: [],
  };
}

export function assertNoForbiddenReferenceFields(rawInput = {}) {
  const visit = (value, path = []) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      const normalized = key.toLowerCase().replace(/[^a-z]/g, "");
      if (FORBIDDEN_OUTPUT_KEYS.has(normalized) && (Array.isArray(child) ? child.length : child && typeof child === "object" ? Object.keys(child).length : Boolean(child))) {
        throw workerError("optical_worker_reference_fields_forbidden", `Vision-only worker output may not populate ${[...path, key].join(".")}; send visible clues through referenceSignals for the separate Reference Pass.`);
      }
      if (path.length === 0 && TOP_LEVEL_PALETTE_KEYS.has(normalized) && child) throw workerError("optical_worker_whole_video_palette_forbidden", "Vision-only worker output must attach a separate palette to each claimed frame, never one whole-video palette.");
      visit(child, [...path, key]);
    }
  };
  visit(rawInput);
}

export function assertAllowedWorkerShape(raw = {}) {
  assertKnownKeys(raw, TOP_LEVEL_OUTPUT_KEYS, "result");
  const frames = frameRows(raw);
  frames.forEach((frame, index) => {
    assertKnownKeys(frame, FRAME_OUTPUT_KEYS, `frames[${index}]`);
    const palette = frame?.palette || frame?.dominantPalette || frame?.dominant_palette || frame?.colors;
    if (palette && typeof palette === "object" && !Array.isArray(palette)) {
      assertKnownKeys(palette, PALETTE_OUTPUT_KEYS, `frames[${index}].palette`);
      (Array.isArray(palette.colors) ? palette.colors : []).forEach((color, colorIndex) => {
        if (color && typeof color === "object" && !Array.isArray(color)) assertKnownKeys(color, COLOR_OUTPUT_KEYS, `frames[${index}].palette.colors[${colorIndex}]`);
      });
    }
  });
  if (raw.quality && typeof raw.quality === "object" && !Array.isArray(raw.quality)) assertKnownKeys(raw.quality, QUALITY_OUTPUT_KEYS, "quality");
}

function normalizePalette(input, role, fieldNormalization) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw workerError("optical_worker_palette_object_required", `The ${role} frame palette must be a worker-authored object with colors and uncertainty.`);
  const source = Array.isArray(input.colors) ? input.colors : [];
  const colors = source.slice(0, 8).map((color, index) => {
    if (!color || typeof color !== "object" || Array.isArray(color)) throw workerError("optical_worker_palette_evidence_required", `The ${role} frame color ${index + 1} must include worker-authored label, prevalence, and visible evidence.`);
    const row = color;
    const hex = String(row.hex || row.value || "").trim().toUpperCase();
    if (!/^#[A-F0-9]{6}$/.test(hex)) throw workerError("optical_worker_palette_hex_invalid", `The ${role} frame contains an invalid #RRGGBB palette value.`);
    const label = text(row.label || row.name, 180);
    if (!label) throw workerError("optical_worker_palette_label_required", `The ${role} frame color ${hex} is missing a worker-authored label.`);
    const prevalenceInput = text(row.prevalence || row.role, 80).toLowerCase();
    if (!PREVALENCE.has(prevalenceInput)) throw workerError("optical_worker_palette_prevalence_required", `The ${role} frame color ${hex} requires dominant, supporting, or accent prevalence.`);
    const explanation = multiline(row.explanation || row.evidence || row.whereSeen);
    if (!explanation) throw workerError("optical_worker_palette_explanation_required", `The ${role} frame color ${hex} is missing worker-authored visible evidence.`);
    return {
      hex,
      label,
      prevalence: prevalenceInput,
      explanation,
      uncertainty: multiline(row.uncertainty),
    };
  });
  const unique = [...new Map(colors.map((color) => [color.hex, color])).values()];
  if (unique.length < 3 || unique.length > 8) throw workerError("optical_worker_palette_count_invalid", `The ${role} frame requires 3–8 distinct visually estimated colors.`);
  const uncertainty = multiline(input.uncertainty);
  if (!uncertainty) throw workerError("optical_worker_palette_uncertainty_required", `The ${role} frame palette requires worker-authored uncertainty.`);
  return { colors: unique, uncertainty };
}

function frameRows(raw) {
  const frames = raw.frames || raw.perFrame || raw.per_frame;
  return Array.isArray(frames) ? frames : [];
}

function matchWorkerFrames(frames, claimedFrames) {
  const rows = frames.map((frame, index) => ({
    frame,
    index,
    roleInput: text(frame.role || frame.label || frame.frame, 80),
    role: normalizedRole(frame.role || frame.label || frame.frame),
    hasOrdinal: frame.ordinal !== undefined && frame.ordinal !== null && String(frame.ordinal).trim() !== "",
    ordinal: integer(frame.ordinal, 0),
  }));
  const hasRoleMetadata = rows.some((row) => row.roleInput);
  const hasOrdinalMetadata = rows.some((row) => row.hasOrdinal);
  const recognizedRoles = rows.every((row) => new Set(["first", "mid", "last"]).has(row.role));
  const ordinalRows = rows.filter((row) => row.ordinal >= 1 && row.ordinal <= claimedFrames.length);
  const completeOrdinals = ordinalRows.length === rows.length && new Set(ordinalRows.map((row) => row.ordinal)).size === rows.length;
  if (hasRoleMetadata && hasOrdinalMetadata) {
    if (!recognizedRoles || !completeOrdinals) {
      throw workerError("optical_worker_frame_mapping_invalid", "When role and ordinal metadata are both present, each must form one complete unique mapping of the claimed frames.");
    }
    const expectedOrdinal = new Map(claimedFrames.map((claimed, index) => [claimed.role || roleAt(index, claimedFrames.length), index + 1]));
    if (rows.some((row) => row.ordinal !== expectedOrdinal.get(row.role))) {
      throw workerError("optical_worker_frame_mapping_invalid", "Frame role labels and ordinals contradict one another; both mappings must identify the same claimed frame.");
    }
  }
  if (hasRoleMetadata) {
    if (!recognizedRoles) {
      throw workerError("optical_worker_frame_mapping_invalid", "Frame role metadata is partial or unknown; return one unique First/Mid/Last role for every row.");
    }
    return claimedFrames.map((claimed, index) => {
      const role = claimed.role || roleAt(index, claimedFrames.length);
      const matches = rows.filter((row) => row.role === role);
      if (matches.length !== 1) throw workerError("optical_worker_frame_mapping_invalid", `The worker must return exactly one uniquely labeled ${role} frame row.`);
      return matches[0].frame;
    });
  }
  if (hasOrdinalMetadata && completeOrdinals) {
    return claimedFrames.map((_, index) => rows.find((row) => row.ordinal === index + 1).frame);
  }
  if (hasOrdinalMetadata) {
    throw workerError("optical_worker_frame_mapping_invalid", "Frame mapping metadata is partial or contradictory. Return one unique First/Mid/Last role for every row, one complete unique 1..N ordinal set, or omit mapping metadata and retain claimed order.");
  }
  return rows.sort((left, right) => left.index - right.index).map((row) => row.frame);
}

function normalizedRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role.includes("first") || role.includes("start")) return "first";
  if (role.includes("mid") || role.includes("middle")) return "mid";
  if (role.includes("last") || role.includes("end")) return "last";
  return role;
}

function roleAt(index, length) { return index === 0 ? "first" : index === length - 1 ? "last" : "mid"; }
function normalizedKeys(values) { return new Set(values.map((value) => normalizedKey(value))); }
function normalizedKey(value) { return String(value || "").toLowerCase().replace(/[^a-z]/g, ""); }
function assertKnownKeys(value, allowed, path) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  for (const key of Object.keys(value)) {
    if (!allowed.has(normalizedKey(key))) throw workerError("optical_worker_output_field_forbidden", `Vision-only worker output contains unsupported field ${path}.${key}; Reference Pass and unregistered fields are forbidden.`);
  }
}
function unwrap(input) { return input?.rawWorkerResult || input?.result || input?.review || input || {}; }
function strings(input) { return [...new Set((Array.isArray(input) ? input : String(input || "").split(/[,\n]+/)).map((value) => text(value, 1_000)).filter(Boolean))]; }
function score(value) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.max(0, Math.min(1, parsed)) : 0; }
function integer(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback; }
function text(value, max) { return String(value || "").replace(/\0/g, "").trim().slice(0, max); }
function multiline(value) { return String(value || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, 12_000); }
function workerError(code, message, statusCode = 400) { const error = new Error(message); error.code = code; error.statusCode = statusCode; return error; }
