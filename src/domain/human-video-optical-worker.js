import { assertHumanVideoOpticalTextBoundary } from "./human-video-optical-boundary.js";

export const HUMAN_VIDEO_OPTICAL_DIRECT_RECEIPT_SCHEMA = "hapa.human-video-optical-direct-receipt.v3";

const TOP_LEVEL_OUTPUT_KEYS = new Set([
  "description",
  "palettes",
  // Optional transport bindings are accepted when a dispatcher wraps the minimal payload.
  "schemaVersion",
  "receiptId",
  "jobId",
  "videoKey",
  "videoId",
  "videoName",
  "frameDigest",
]);
const PALETTE_KEYS = new Set(["first", "middle", "last"]);
const ROLE_TO_PALETTE_KEY = Object.freeze({ first: "first", mid: "middle", last: "last" });

export function createHumanVideoOpticalReviewFromClaim(job = {}, rawInput = {}, scheduler = {}) {
  const raw = unwrap(rawInput);
  assertAllowedWorkerShape(raw);
  assertOptionalRawBinding(raw, job, scheduler);
  const frameSet = normalizeClaimFrames(job.frames);
  const description = multiline(raw.description, 1_200);
  if (description.length < 80) {
    throw workerError("optical_worker_description_required", "The minimal optical result requires one specific overall visual description of at least 80 characters.");
  }
  assertHumanVideoOpticalTextBoundary({ description });

  const palettes = raw.palettes;
  const frames = frameSet.map((claimedFrame) => {
    const paletteKey = ROLE_TO_PALETTE_KEY[claimedFrame.role];
    return {
      timestampSeconds: claimedFrame.timestampSeconds,
      normalizedPosition: claimedFrame.normalizedPosition,
      imagePath: claimedFrame.imagePath,
      imageUri: claimedFrame.imageUri || "",
      sha256: claimedFrame.sha256,
      observation: "",
      palette: {
        colors: normalizePalette(palettes[paletteKey], paletteKey).map((hex) => ({ hex })),
      },
    };
  });

  return {
    videoKey: job.videoKey,
    videoId: job.videoId,
    videoName: job.videoName,
    status: "pending-human",
    expectedRevision: 0,
    reviewer: {
      agentId: text(scheduler.workerId || job.lease?.workerId, 240),
      taskId: text(scheduler.taskId || scheduler.workerId || job.lease?.workerId, 500),
      model: text(scheduler.model || scheduler.configuration?.model || "gpt-5.6-terra", 240),
      reasoningEffort: text(scheduler.reasoningEffort || scheduler.configuration?.reasoningEffort || "low", 80),
      parameters: scheduler.parameters || {},
      opticalInspectionConfirmed: true,
      attestation: "Minimal receipt accepted for the claimed First, Middle, and Last frame packet.",
      fieldNormalization: [],
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
        accounting: {
          status: text(job.schedulerTelemetry?.status, 80),
          source: text(job.schedulerTelemetry?.source, 360),
          pass: "optical",
          packetRecords: 3,
          inputTokens: integer(job.schedulerTelemetry?.inputTokens, 0),
          cachedInputTokens: integer(job.schedulerTelemetry?.cachedInputTokens, 0),
          outputTokens: integer(job.schedulerTelemetry?.outputTokens, 0),
          totalTokens: integer(job.schedulerTelemetry?.totalTokens, 0),
          wallClockMs: integer(job.schedulerTelemetry?.wallClockMs, 0),
          stopReason: text(job.schedulerTelemetry?.stopReason, 80),
          budgetExceeded: job.schedulerTelemetry?.budgetExceeded === true,
        },
      },
    },
    evidence: { requiredFrameCount: 3, frames },
    proposal: { description },
    knowledgeComparisons: [],
  };
}

export function createHumanVideoOpticalWorkerOutputContract(job = {}) {
  const frameSet = normalizeClaimFrames(job.frames);
  return {
    schemaVersion: HUMAN_VIDEO_OPTICAL_DIRECT_RECEIPT_SCHEMA,
    inspection: {
      exactFrameCount: 3,
      order: ["first", "middle", "last"],
      frames: frameSet.map((frame) => ({ role: frame.role === "mid" ? "middle" : frame.role, imagePath: frame.imagePath, sha256: frame.sha256 })),
      externalContextAllowed: false,
    },
    outputShape: {
      description: "80–1200 character overall visual description grounded only in the three supplied frames",
      palettes: {
        first: ["3–5 uppercase #RRGGBB strings"],
        middle: ["3–5 uppercase #RRGGBB strings"],
        last: ["3–5 uppercase #RRGGBB strings"],
      },
    },
    requiredTopLevel: ["description", "palettes"],
    forbiddenOutput: [
      "quality", "score", "signalOutcome", "referenceSignals", "visibleSignals", "categories", "tags",
      "strengths", "issues", "uncertainty", "confidence", "directorNotes", "references", "relationships",
      "cards", "examples", "calibration", "frame observations", "palette labels or explanations",
    ],
    truthBoundary: "Inspect exactly the claimed First, Middle, and Last images. Return only one overall description and one concise hex palette for each frame.",
  };
}

export function assertAllowedWorkerShape(raw = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw workerError("optical_worker_output_invalid", "The minimal optical result must be a JSON object.");
  }
  assertKnownKeys(raw, TOP_LEVEL_OUTPUT_KEYS, "result");
  if (!raw.palettes || typeof raw.palettes !== "object" || Array.isArray(raw.palettes)) {
    throw workerError("optical_worker_palettes_required", "The minimal optical result requires palettes.first, palettes.middle, and palettes.last.");
  }
  assertKnownKeys(raw.palettes, PALETTE_KEYS, "palettes");
  for (const key of PALETTE_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(raw.palettes, key)) {
      throw workerError("optical_worker_palettes_required", `The minimal optical result is missing palettes.${key}.`);
    }
  }
}

export function assertNoForbiddenReferenceFields(raw = {}) {
  assertAllowedWorkerShape(raw);
}

function normalizeClaimFrames(input = []) {
  const frames = Array.isArray(input) ? input : [];
  if (frames.length !== 3) {
    throw workerError("optical_worker_claim_frames_required", "The minimal optical contract requires exactly three claimed frames.");
  }
  const byRole = new Map();
  for (const frame of frames) {
    const role = normalizedRole(frame.role);
    if (!ROLE_TO_PALETTE_KEY[role] || byRole.has(role)) {
      throw workerError("optical_worker_claim_frames_required", "The minimal optical contract requires one unique First, Middle, and Last frame.");
    }
    if (!frame.imagePath || !frame.sha256) {
      throw workerError("optical_worker_frame_binding_required", `The claimed ${role} frame requires imagePath and sha256 bindings.`);
    }
    byRole.set(role, { ...frame, role });
  }
  if (!["first", "mid", "last"].every((role) => byRole.has(role))) {
    throw workerError("optical_worker_claim_frames_required", "The minimal optical contract requires one unique First, Middle, and Last frame.");
  }
  return [byRole.get("first"), byRole.get("mid"), byRole.get("last")];
}

function normalizePalette(input, role) {
  if (!Array.isArray(input)) {
    throw workerError("optical_worker_palette_array_required", `palettes.${role} must be an array of uppercase #RRGGBB strings.`);
  }
  const colors = input.map((value) => String(value || "").trim().toUpperCase());
  if (colors.some((hex) => !/^#[A-F0-9]{6}$/.test(hex))) {
    throw workerError("optical_worker_palette_hex_invalid", `palettes.${role} contains an invalid #RRGGBB value.`);
  }
  const unique = [...new Set(colors)];
  if (unique.length < 3 || unique.length > 5 || unique.length !== colors.length) {
    throw workerError("optical_worker_palette_count_invalid", `palettes.${role} requires 3–5 distinct colors.`);
  }
  return unique;
}

function assertOptionalRawBinding(raw, job, scheduler) {
  const expected = {
    schemaVersion: HUMAN_VIDEO_OPTICAL_DIRECT_RECEIPT_SCHEMA,
    receiptId: scheduler.receiptId,
    jobId: job.id,
    videoKey: job.videoKey,
    videoId: job.videoId,
    videoName: job.videoName,
    frameDigest: job.frameDigest,
  };
  for (const [field, value] of Object.entries(expected)) {
    if (raw[field] == null || raw[field] === "") continue;
    if (value == null || value === "") {
      throw workerError("optical_worker_receipt_binding_context_missing", `The worker returned ${field}, but the claim did not provide an expected binding value.`);
    }
    if (String(raw[field]) !== String(value)) {
      throw workerError("optical_worker_receipt_binding_mismatch", `The worker receipt ${field} does not match the claimed video and lease.`);
    }
  }
}

function normalizedRole(value) {
  const role = String(value || "").trim().toLowerCase();
  if (role === "middle") return "mid";
  return role;
}

function assertKnownKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) {
      throw workerError("optical_worker_output_field_forbidden", `Minimal optical output contains unsupported field ${path}.${key}.`);
    }
  }
}

function unwrap(input) { return input?.rawWorkerResult || input?.result || input || {}; }
function integer(value, fallback) { const parsed = Number(value); return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback; }
function text(value, max) { return String(value || "").replace(/\0/g, "").trim().slice(0, max); }
function multiline(value, max = 2_000) { return String(value || "").replace(/\0/g, "").replace(/\r\n?/g, "\n").trim().slice(0, max); }
function workerError(code, message, statusCode = 400) { const error = new Error(message); error.code = code; error.statusCode = statusCode; return error; }
