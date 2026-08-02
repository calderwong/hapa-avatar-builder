import { randomUUID, createHash } from "node:crypto";
import { link, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export const ECHO_RECORD_GARDEN_RECORDING_TRANSACTION_SCHEMA = "hapa.echo-record-garden.recording-transaction.v1";

const HEX_64 = /^[a-f0-9]{64}$/u;
const TRANSACTION_STEPS = ["accepted", "prepared", "media", "custody", "tarot", "subscriber", "complete"];
const REQUEST_FIELDS = [
  "sessionId",
  "title",
  "songId",
  "songTitle",
  "cutId",
  "cutTitle",
  "weatherPhase",
  "rightsStatus",
  "durationSeconds",
  "width",
  "height",
  "fps",
  "videoTracks",
  "audioTracks",
  "mimeType",
  "contentType",
  "videoCodecs",
  "audioCodecs",
  "sizeBytes",
  "contentHash",
];

function transactionError(code, message, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new TypeError(`${label} is required.`);
  return text;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function clone(value) {
  return structuredClone(value);
}

export function echoRecordGardenRecordingRequestSnapshot(recording = {}, { actorId = "" } = {}) {
  const snapshot = {};
  for (const field of REQUEST_FIELDS) {
    const value = recording[field];
    snapshot[field] = Array.isArray(value) ? [...value] : value;
  }
  snapshot.actorId = requiredText(actorId, "actorId").slice(0, 120);
  if (!snapshot.sessionId || !HEX_64.test(snapshot.contentHash || "")) {
    throw new TypeError("A normalized Record Garden recording is required for transaction custody.");
  }
  return snapshot;
}

export function echoRecordGardenRecordingRequestFingerprint(recording = {}, options = {}) {
  return sha256(canonicalJson(echoRecordGardenRecordingRequestSnapshot(recording, options)));
}

function validateTransaction(record, expectedSessionId = "") {
  if (!record || record.schemaVersion !== ECHO_RECORD_GARDEN_RECORDING_TRANSACTION_SCHEMA) {
    throw transactionError(
      "record_garden_recording_transaction_corrupt",
      "The durable Record Garden transaction ledger entry is missing or invalid.",
      500,
    );
  }
  if (expectedSessionId && record.sessionId !== expectedSessionId) {
    throw transactionError(
      "record_garden_recording_transaction_corrupt",
      "The durable Record Garden transaction ledger entry belongs to a different capture session.",
      500,
    );
  }
  if (!HEX_64.test(record.requestFingerprint || "") || !record.steps?.accepted?.at) {
    throw transactionError(
      "record_garden_recording_transaction_corrupt",
      "The durable Record Garden transaction ledger entry has no verified request fingerprint.",
      500,
    );
  }
  return record;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    if (error instanceof SyntaxError) {
      throw transactionError(
        "record_garden_recording_transaction_corrupt",
        "The durable Record Garden transaction ledger entry is not valid JSON.",
        500,
      );
    }
    throw error;
  }
}

async function atomicReplaceJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await rename(temporary, filePath);
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

async function createJsonExclusively(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", flag: "wx", mode: 0o600 });
    await link(temporary, filePath);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    throw error;
  } finally {
    await rm(temporary, { force: true }).catch(() => {});
  }
}

export class EchoRecordGardenRecordingTransactionLedger {
  constructor({ root, now = () => new Date().toISOString() } = {}) {
    this.root = path.resolve(requiredText(root, "root"));
    this.now = now;
  }

  transactionPath(sessionId) {
    return path.join(this.root, `${sha256(requiredText(sessionId, "sessionId"))}.json`);
  }

  async get(sessionId) {
    const record = await readJson(this.transactionPath(sessionId));
    return record ? clone(validateTransaction(record, sessionId)) : null;
  }

  async begin({ recording, actorId, cardId, mediaUri } = {}) {
    const request = echoRecordGardenRecordingRequestSnapshot(recording, { actorId });
    const requestFingerprint = sha256(canonicalJson(request));
    const sessionId = requiredText(request.sessionId, "recording.sessionId");
    const acceptedAt = this.now();
    const transaction = {
      schemaVersion: ECHO_RECORD_GARDEN_RECORDING_TRANSACTION_SCHEMA,
      transactionId: `record-garden-transaction-${sha256(sessionId).slice(0, 32)}`,
      sessionId,
      idempotencyKey: `record-garden:${sessionId}`,
      requestFingerprint,
      request,
      cardId: requiredText(cardId, "cardId"),
      mediaUri: requiredText(mediaUri, "mediaUri"),
      cardCreatedAt: acceptedAt,
      subscriberEventId: `subscriber-record-garden-${sha256(`${sessionId}:${requestFingerprint}`).slice(0, 32)}`,
      subscriberOccurredAt: acceptedAt,
      steps: { accepted: { at: acceptedAt } },
      updatedAt: acceptedAt,
    };
    const filePath = this.transactionPath(sessionId);
    const created = await createJsonExclusively(filePath, transaction);
    const durable = created ? transaction : validateTransaction(await readJson(filePath), sessionId);
    if (durable.requestFingerprint !== requestFingerprint) {
      throw transactionError(
        "record_garden_recording_idempotency_conflict",
        "This Record Garden capture session is already bound to a different complete request fingerprint.",
      );
    }
    if (durable.cardId !== transaction.cardId || durable.mediaUri !== transaction.mediaUri) {
      throw transactionError(
        "record_garden_recording_idempotency_conflict",
        "This Record Garden capture session is already bound to different Card or media identity.",
      );
    }
    return { created, transaction: clone(durable) };
  }

  async checkpoint({ sessionId, requestFingerprint, step, details = {} } = {}) {
    const stepIndex = TRANSACTION_STEPS.indexOf(step);
    if (stepIndex <= 0) throw new TypeError(`Unsupported Record Garden transaction checkpoint: ${step}`);
    const filePath = this.transactionPath(sessionId);
    const current = validateTransaction(await readJson(filePath), sessionId);
    if (current.requestFingerprint !== requestFingerprint) {
      throw transactionError(
        "record_garden_recording_idempotency_conflict",
        "The Record Garden transaction checkpoint does not match its durable request fingerprint.",
      );
    }
    const priorStep = TRANSACTION_STEPS[stepIndex - 1];
    if (!current.steps?.[priorStep]) {
      throw transactionError(
        "record_garden_recording_transaction_step_invalid",
        `Record Garden transaction step ${step} cannot precede ${priorStep}.`,
        500,
      );
    }
    const normalizedDetails = details && typeof details === "object" && !Array.isArray(details) ? clone(details) : {};
    const existing = current.steps[step];
    if (existing) {
      const existingDetails = { ...existing };
      delete existingDetails.at;
      if (canonicalJson(existingDetails) !== canonicalJson(normalizedDetails)) {
        throw transactionError(
          "record_garden_recording_transaction_step_conflict",
          `Record Garden transaction step ${step} is already bound to different durable evidence.`,
        );
      }
      return clone(current);
    }
    const updatedAt = this.now();
    const next = {
      ...current,
      steps: {
        ...current.steps,
        [step]: { at: updatedAt, ...normalizedDetails },
      },
      updatedAt,
    };
    await atomicReplaceJson(filePath, next);
    return clone(next);
  }
}

export function openEchoRecordGardenRecordingTransactionLedger(options = {}) {
  return new EchoRecordGardenRecordingTransactionLedger(options);
}
