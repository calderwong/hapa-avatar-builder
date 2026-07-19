import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";

export const AVATAR_MEDIA_COMMENT_EVENT_SCHEMA = "hapa.avatar-builder.media-comment-event.v1";
export const AVATAR_MEDIA_COMMENT_CAPTURE_SCHEMA = "hapa.avatar-builder.media-comment-capture.v1";
export const AVATAR_MEDIA_COMMENT_LIST_SCHEMA = "hapa.avatar-builder.media-comment-list.v1";
export const AVATAR_MEDIA_COMMENT_MAX_BYTES = 24 * 1024 * 1024;

const DIGEST = /^[a-f0-9]{64}$/;
const MIME_EXTENSIONS = new Map([
  ["video/webm", ".webm"],
  ["video/mp4", ".mp4"],
  ["video/quicktime", ".mov"],
]);
const DEVICE_KINDS = new Set(["browser_webcam", "physical_phone"]);

function clone(value) {
  return structuredClone(value);
}

function typedError(message, { code = "media_comment_rejected", statusCode = 400 } = {}) {
  return Object.assign(new Error(message), { code, statusCode });
}

function requiredText(value, label, max = 240) {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) throw typedError(`${label} is required`);
  if (normalized.length > max) throw typedError(`${label} is too long`);
  return normalized;
}

function requiredDigest(value, label) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!DIGEST.test(normalized)) throw typedError(`${label} must be a lowercase SHA-256 digest`);
  return normalized;
}

function finiteNumber(value, label, minimum = 0) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < minimum) throw typedError(`${label} must be at least ${minimum}`);
  return Object.is(normalized, -0) ? 0 : normalized;
}

function normalizeActor(value = {}) {
  const actor = {
    actorId: requiredText(value.actorId, "actor.actorId"),
    actorType: requiredText(value.actorType || "human", "actor.actorType"),
    displayName: requiredText(value.displayName, "actor.displayName", 100),
  };
  if (actor.actorType !== "human") throw typedError("Comment capture consent authority must be a human actor");
  return actor;
}

function normalizeDevice(value = {}) {
  const device = {
    kind: requiredText(value.kind, "device.kind"),
    deviceId: requiredText(value.deviceId, "device.deviceId"),
    displayLabel: requiredText(value.displayLabel, "device.displayLabel", 100),
  };
  if (!DEVICE_KINDS.has(device.kind)) throw typedError("device.kind is unsupported");
  return device;
}

function normalizeSourceCard(value = {}) {
  const snapshot = clone(value);
  const sourceRef = {
    cardId: requiredText(snapshot.cardId || snapshot.id, "sourceCard.cardId"),
    revisionId: requiredText(snapshot.cardRevisionId || snapshot.revisionId || snapshot.semanticVersion || snapshot.revision, "sourceCard.revisionId"),
    cardCoreKey: requiredDigest(snapshot.cardCoreKey || snapshot.hypercore?.key || snapshot.custody?.cardCoreKey, "sourceCard.cardCoreKey"),
    recordDigest: requiredDigest(snapshot.cardRecordDigest || snapshot.recordDigest || snapshot.custody?.recordDigest, "sourceCard.recordDigest"),
  };
  return {
    snapshot,
    sourceRef,
    snapshotDigest: sha256(snapshot),
  };
}

function normalizeContext(value = {}) {
  const startSeconds = finiteNumber(value.timecode?.startSeconds ?? 0, "context.timecode.startSeconds");
  const endSeconds = finiteNumber(value.timecode?.endSeconds ?? startSeconds, "context.timecode.endSeconds");
  if (endSeconds < startSeconds || endSeconds - startSeconds > 300) throw typedError("Comment timecode must be ordered and span at most five minutes");
  return {
    timecode: { startSeconds, endSeconds },
    formationDigest: requiredDigest(value.formationDigest, "context.formationDigest"),
    gateCommitment: requiredDigest(value.gateCommitment, "context.gateCommitment"),
    redactedAddress: requiredText(value.redactedAddress || "withheld", "context.redactedAddress", 120),
  };
}

function mediaType(value = "") {
  const mimeType = String(value).split(";")[0].trim().toLowerCase();
  const extension = MIME_EXTENSIONS.get(mimeType);
  if (!extension) throw typedError("Only WebM, MP4, and QuickTime Comment videos are accepted", { code: "unsupported_comment_media", statusCode: 415 });
  return { mimeType, extension };
}

function parseEvents(text = "") {
  return String(text).split(/\r?\n/).filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`media Comment event line ${index + 1} is invalid JSON: ${error.message}`);
    }
  });
}

async function readOptional(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return "";
    throw error;
  }
}

function unsignedEvent(event) {
  const { eventHash: _eventHash, ...unsigned } = event;
  return unsigned;
}

export function verifyAvatarMediaCommentEvents(events = []) {
  let previousHash = null;
  const ids = new Set();
  events.forEach((event, index) => {
    if (event.schemaVersion !== AVATAR_MEDIA_COMMENT_EVENT_SCHEMA) throw new Error(`media Comment event ${index + 1} has an unsupported schema`);
    if (event.sequence !== index + 1) throw new Error(`media Comment event ${index + 1} breaks sequence`);
    if (!event.eventId || ids.has(event.eventId)) throw new Error(`media Comment event ${index + 1} has an invalid eventId`);
    if (event.previousEventHash !== previousHash) throw new Error(`media Comment event ${index + 1} breaks append-only history`);
    if (sha256(unsignedEvent(event)) !== event.eventHash) throw new Error(`media Comment event ${index + 1} failed hash verification`);
    ids.add(event.eventId);
    previousHash = event.eventHash;
  });
  return true;
}

function projectEvents(events = []) {
  verifyAvatarMediaCommentEvents(events);
  const captures = new Map();
  const cards = new Map();
  for (const event of events) {
    if (event.type === "capture.invited") {
      captures.set(event.captureId, {
        schemaVersion: AVATAR_MEDIA_COMMENT_CAPTURE_SCHEMA,
        captureId: event.captureId,
        status: "invited",
        createdAt: event.ts,
        expiresAt: event.payload.expiresAt,
        actor: clone(event.actor),
        device: clone(event.payload.device),
        sourceCard: clone(event.payload.sourceCard),
        sourceRef: clone(event.payload.sourceRef),
        sourceSnapshotDigest: event.payload.sourceSnapshotDigest,
        context: clone(event.payload.context),
        inviteTokenHash: event.payload.inviteTokenHash,
        consent: null,
        finalized: null,
        excludedFromCardTruth: true,
        excludedFromGateIdentity: true,
      });
    } else if (event.type === "consent.granted") {
      const capture = captures.get(event.captureId);
      if (capture) {
        capture.status = "consented";
        capture.consent = { ...clone(event.payload.consent), eventId: event.eventId, eventHash: event.eventHash, grantedAt: event.ts };
      }
    } else if (event.type === "capture.finalized") {
      const capture = captures.get(event.captureId);
      if (capture) {
        capture.status = "finalized";
        capture.finalized = { ...clone(event.payload.manifest), eventId: event.eventId, eventHash: event.eventHash };
      }
      for (const card of event.payload.cards || []) cards.set(card.id || card.cardId, clone(card));
    } else if (event.type === "consent.revoked") {
      const capture = captures.get(event.captureId);
      if (capture) capture.status = "revoked";
    }
  }
  return { captures: [...captures.values()], cards: [...cards.values()] };
}

function commentCardImage({ title, sourceTitle, deviceKind }) {
  const safe = (value) => String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152"><defs><radialGradient id="a"><stop stop-color="#f6c96d" stop-opacity=".72"/><stop offset=".48" stop-color="#271429"/><stop offset="1" stop-color="#020617"/></radialGradient><linearGradient id="b"><stop stop-color="#00f3ff"/><stop offset=".48" stop-color="#f6c96d"/><stop offset="1" stop-color="#ff6df2"/></linearGradient></defs><rect width="768" height="1152" rx="44" fill="#020617"/><rect x="22" y="22" width="724" height="1108" rx="32" fill="url(#a)" stroke="url(#b)" stroke-width="8"/><circle cx="384" cy="390" r="238" fill="none" stroke="#f6c96d" stroke-width="7" stroke-dasharray="16 12"/><circle cx="384" cy="390" r="170" fill="#020617" stroke="#00f3ff" stroke-width="6"/><path d="M310 330h148v120H310zM337 306l29 24h64l28-24" fill="none" stroke="#f8f3e7" stroke-width="18" stroke-linejoin="round"/><circle cx="384" cy="390" r="34" fill="none" stroke="#ff6df2" stroke-width="12"/><path d="M164 712h440" stroke="url(#b)" stroke-width="6"/><text x="52" y="78" font-family="monospace" font-size="26" font-weight="900" letter-spacing="6" fill="#f6c96d">HAPA COMMENT CARD</text><text x="384" y="808" text-anchor="middle" font-family="system-ui" font-size="46" font-weight="900" fill="#f8f3e7">${safe(title)}</text><text x="384" y="874" text-anchor="middle" font-family="monospace" font-size="22" fill="#00f3ff">COMMENTS ON</text><text x="384" y="918" text-anchor="middle" font-family="system-ui" font-size="28" font-weight="700" fill="#f6c96d">${safe(sourceTitle).slice(0, 34)}</text><text x="384" y="1000" text-anchor="middle" font-family="monospace" font-size="20" fill="#9fb5c9">${deviceKind === "physical_phone" ? "PHYSICAL PHONE" : "BUILDER WEBCAM"} · PROPOSED</text><text x="384" y="1044" text-anchor="middle" font-family="monospace" font-size="18" fill="#45f2c8">SOURCE UNCHANGED · CONSENT SEALED</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function buildCards({ capture, media, consentEvent, createdAt }) {
  const identity = sha256({
    sourceRef: capture.sourceRef,
    sourceSnapshotDigest: capture.sourceSnapshotDigest,
    context: capture.context,
    actor: capture.actor,
    device: capture.device,
    mediaSha256: media.sha256,
    consentEventHash: consentEvent.eventHash,
  });
  const id = `hapa-card:media-comment:${identity.slice(0, 40)}`;
  const revisionId = "proposed-r1";
  const title = `${capture.actor.displayName} · Video Comment`;
  const imageUri = commentCardImage({ title, sourceTitle: capture.sourceCard.title || capture.sourceRef.cardId, deviceKind: capture.device.kind });
  const sourceLocator = `hapa-card://${capture.sourceRef.cardId}/${capture.sourceRef.revisionId}`;
  const consentLocator = `hapa-event://avatar-media-comments/${consentEvent.eventId}`;
  const card = {
    id,
    cardId: id,
    cardType: "comment_card",
    tarotMainType: "comment_card",
    title,
    subtitle: "Separate, consented, append-only observation",
    summary: `A bounded ${media.durationSeconds.toFixed(1)} second ${capture.device.kind === "physical_phone" ? "phone" : "webcam"} comment on ${capture.sourceCard.title || capture.sourceRef.cardId}. The source Card is unchanged.`,
    revisionId,
    cardRevisionId: revisionId,
    cardCoreKey: sha256(`hapa.comment.core\0${identity}`),
    imageUri,
    posterUri: imageUri,
    videoUri: `/api/media-comments/assets/${media.sha256}`,
    mediaUri: `/api/media-comments/assets/${media.sha256}`,
    videoSources: [{ uri: `/api/media-comments/assets/${media.sha256}`, posterUri: imageUri, label: "Consented Comment capture" }],
    truthStatus: "human_observation",
    lifecycleStatus: "proposed_unminted",
    status: "proposed_unminted",
    proposed: true,
    minted: false,
    createdAt,
    createdBy: clone(capture.actor),
    contentRefs: [{ mediaType: media.mimeType, sha256: media.sha256, bytes: media.bytes, locator: `hapa-media://sha256/${media.sha256}`, consentEvidenceRefs: [consentLocator] }],
    sourceRefs: [
      { kind: "card", locator: sourceLocator, revisionId: capture.sourceRef.revisionId, recordDigest: capture.sourceRef.recordDigest, snapshotDigest: capture.sourceSnapshotDigest, truthStatus: "verified_selected_source_state" },
      { kind: "formation", locator: `hapa-formation://sha256/${capture.context.formationDigest}`, recordDigest: capture.context.formationDigest, truthStatus: "observed_runtime_result" },
      { kind: "gate", locator: `hapa-gate://commitment/${capture.context.gateCommitment}`, recordDigest: capture.context.gateCommitment, truthStatus: "observed_runtime_result" },
      { kind: "consent", locator: consentLocator, recordDigest: consentEvent.eventHash, truthStatus: "human_authority" },
    ],
    relationships: [{ relation: "comments_on", target: clone(capture.sourceRef), scope: "Exact source revision and bounded time range", evidenceRefs: [sourceLocator, consentLocator] }],
    relationshipEdges: [{ edgeId: `${id}:comments-on`, relation: "comments_on", target: clone(capture.sourceRef), scope: "Exact source revision and bounded time range", assertedBy: capture.actor.actorId, truthStatus: "human_observation", evidenceRefs: [sourceLocator, consentLocator] }],
    attributionEdges: [{ edgeId: `${id}:attribution:${capture.actor.actorId}`, lane: "epistemic", role: "comment-author-and-capture-authority", actor: clone(capture.actor), scope: "Authored the comment and granted bounded capture consent; source ownership is unchanged", evidenceRefs: [consentLocator, `hapa-media://sha256/${media.sha256}`], truthStatus: "human_observation" }],
    consentPolicy: { visibility: "session", replication: "session", reuse: "explicit_approval", training: "prohibited", capture: "explicit_consent_required", revocable: true, authorityIds: [capture.actor.actorId], evidenceRefs: [consentLocator] },
    authority: { originActorId: capture.actor.actorId, revisionMode: "origin_only", revisionAuthorityIds: [capture.actor.actorId], mintMode: "human_explicit", mintAuthorityIds: [capture.actor.actorId], releaseMode: "human_explicit", releaseAuthorityIds: [capture.actor.actorId] },
    comment: { schemaVersion: "hapa.video-comment-card.v1", sourceCardRef: clone(capture.sourceRef), sourceSnapshotDigest: capture.sourceSnapshotDigest, timecode: clone(capture.context.timecode), formationDigest: capture.context.formationDigest, gateCommitment: capture.context.gateCommitment, redactedAddress: capture.context.redactedAddress, consentEventId: consentEvent.eventId, device: clone(capture.device), media: clone(media), excludedFromGateIdentity: true },
    keywords: ["comment", "consent", "attribution", "append-only", capture.device.kind],
    tags: ["hapa-comment-card", "proposed-unminted", "source-unchanged", "build-week"],
    accent: "#f6c96d",
    tarotNumber: "CM",
  };
  card.cardRecordDigest = sha256(card);
  card.recordDigest = card.cardRecordDigest;

  const lessonId = `hapa-card:lesson:consented-comment:${identity.slice(0, 32)}`;
  const lessonCard = {
    id: lessonId,
    cardId: lessonId,
    cardType: "lesson_card",
    title: "Lesson · Comments remain separate",
    subtitle: "Consent + attribution + immutable source",
    summary: "Bind a bounded observation to an exact Card revision, record consent append-only, credit the comment author, and create a new proposed Card instead of rewriting the source.",
    truthStatus: "observed_runtime_result",
    lifecycleStatus: "proposed_unminted",
    proposed: true,
    minted: false,
    createdAt,
    learnedFrom: [id, sourceLocator, consentLocator],
    relationships: [{ relation: "learned_from", target: { cardId: id, revisionId } }],
    keywords: ["lesson", "consent", "attribution", "source custody"],
  };
  lessonCard.cardRevisionId = "proposed-r1";
  lessonCard.cardCoreKey = sha256(`hapa.lesson.core\0${lessonId}`);
  lessonCard.cardRecordDigest = sha256(lessonCard);

  const resultId = `hapa-card:result:consented-comment:${identity.slice(0, 32)}`;
  const resultCard = {
    id: resultId,
    cardId: resultId,
    cardType: "result_card",
    title: "Result · Consented Comment captured",
    subtitle: "Exact source preserved",
    summary: "One separate proposed video Comment Card and one reusable Lesson Card were created from an append-only, consented capture.",
    truthStatus: "verified_local_result",
    lifecycleStatus: "proposed_unminted",
    proposed: true,
    minted: false,
    createdAt,
    results: { sourceUnchanged: true, consentRecorded: true, attributionRecorded: true, commentCardId: id, lessonCardId: lessonId, mediaSha256: media.sha256 },
    relationships: [{ relation: "records_result_for", target: { cardId: id, revisionId } }],
    keywords: ["result", "comment", "source unchanged", "append-only"],
  };
  resultCard.cardRevisionId = "proposed-r1";
  resultCard.cardCoreKey = sha256(`hapa.result.core\0${resultId}`);
  resultCard.cardRecordDigest = sha256(resultCard);
  return { card, lessonCard, resultCard, identity };
}

export class AvatarMediaCommentService {
  constructor({ root, events = [], now = () => new Date().toISOString(), inviteTtlMs = 12 * 60 * 1000 } = {}) {
    this.root = path.resolve(root);
    this.assetRoot = path.join(this.root, "assets");
    this.eventTape = path.join(this.root, "events.ndjson");
    this.events = events.map(clone);
    verifyAvatarMediaCommentEvents(this.events);
    this.now = now;
    this.inviteTtlMs = inviteTtlMs;
    this.appendQueue = Promise.resolve();
  }

  projection() {
    return projectEvents(this.events);
  }

  capture(captureId) {
    return this.projection().captures.find((capture) => capture.captureId === captureId) || null;
  }

  async appendEvent({ type, captureId, cardId = null, actor, payload }) {
    let result;
    const operation = async () => {
      const unsigned = {
        schemaVersion: AVATAR_MEDIA_COMMENT_EVENT_SCHEMA,
        eventId: `avatar-comment:${type}:${randomBytes(12).toString("hex")}`,
        sequence: this.events.length + 1,
        ts: this.now(),
        type,
        captureId,
        cardId,
        actor: clone(actor),
        payload: clone(payload),
        previousEventHash: this.events.at(-1)?.eventHash || null,
      };
      const event = { ...unsigned, eventHash: sha256(unsigned) };
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      await appendFile(this.eventTape, `${canonicalJson(event)}\n`, { encoding: "utf8", mode: 0o600 });
      this.events.push(event);
      verifyAvatarMediaCommentEvents(this.events);
      result = clone(event);
    };
    this.appendQueue = this.appendQueue.then(operation, operation);
    await this.appendQueue;
    return result;
  }

  async createCapture({ sourceCard, context, actor, device }) {
    const source = normalizeSourceCard(sourceCard);
    const normalizedContext = normalizeContext(context);
    const normalizedActor = normalizeActor(actor);
    const normalizedDevice = normalizeDevice(device);
    const captureId = `capture-${randomBytes(16).toString("hex")}`;
    const inviteToken = normalizedDevice.kind === "physical_phone" ? randomBytes(32).toString("base64url") : null;
    const createdAt = this.now();
    const expiresAt = new Date(Date.parse(createdAt) + this.inviteTtlMs).toISOString();
    await this.appendEvent({
      type: "capture.invited",
      captureId,
      actor: normalizedActor,
      payload: {
        sourceCard: source.snapshot,
        sourceRef: source.sourceRef,
        sourceSnapshotDigest: source.snapshotDigest,
        context: normalizedContext,
        device: normalizedDevice,
        expiresAt,
        inviteTokenHash: inviteToken ? sha256(inviteToken) : null,
        transient: true,
        excludedFromCardTruth: true,
        excludedFromGateIdentity: true,
      },
    });
    return { ...this.capture(captureId), inviteToken };
  }

  captureByCredential(captureId, inviteToken = null) {
    const capture = this.capture(captureId);
    if (!capture) throw typedError("Comment capture was not found", { code: "capture_not_found", statusCode: 404 });
    if (Date.now() >= Date.parse(capture.expiresAt)) throw typedError("Comment capture expired", { code: "capture_expired", statusCode: 410 });
    if (capture.status === "revoked") throw typedError("Comment capture consent was revoked", { code: "capture_revoked", statusCode: 410 });
    if (capture.device.kind === "physical_phone") {
      if (!inviteToken || sha256(inviteToken) !== capture.inviteTokenHash) throw typedError("Phone capture capability is invalid", { code: "phone_capture_unauthorized", statusCode: 401 });
    }
    return capture;
  }

  async grantConsent(captureId, { authorityId, allowAudio = true, evidenceNote = "" } = {}, { inviteToken = null } = {}) {
    const capture = this.captureByCredential(captureId, inviteToken);
    if (capture.consent) return capture;
    if (requiredText(authorityId, "consent.authorityId") !== capture.actor.actorId) throw typedError("Consent authority does not match the named human actor", { code: "consent_authority_mismatch", statusCode: 403 });
    const consent = {
      granted: true,
      authorityId: capture.actor.actorId,
      scope: "record_bounded_comment",
      allowVideo: true,
      allowAudio: Boolean(allowAudio),
      evidenceNote: String(evidenceNote || "").replace(/\s+/g, " ").trim().slice(0, 300) || null,
    };
    await this.appendEvent({ type: "consent.granted", captureId, actor: capture.actor, payload: { consent } });
    return this.capture(captureId);
  }

  async finalizeCapture(captureId, { bytes, mimeType, durationSeconds, width, height, actorId, deviceId, expectedSha256 = null, inviteToken = null } = {}) {
    if (!Buffer.isBuffer(bytes) || !bytes.length) throw typedError("Comment capture media must be non-empty binary data");
    if (bytes.length > AVATAR_MEDIA_COMMENT_MAX_BYTES) throw typedError("Comment capture exceeds 24 MiB", { code: "comment_media_too_large", statusCode: 413 });
    const capture = this.captureByCredential(captureId, inviteToken);
    if (!capture.consent || capture.status !== "consented") throw typedError("Explicit consent is required before Comment media finalization", { code: "capture_consent_required", statusCode: 409 });
    if (requiredText(actorId, "actorId") !== capture.actor.actorId) throw typedError("Comment actor does not match consent authority", { code: "capture_actor_mismatch", statusCode: 403 });
    if (requiredText(deviceId, "deviceId") !== capture.device.deviceId) throw typedError("Comment device does not match capture scope", { code: "capture_device_mismatch", statusCode: 403 });
    const sourceDigestBefore = sha256(capture.sourceCard);
    if (sourceDigestBefore !== capture.sourceSnapshotDigest) throw new Error("Stored source snapshot failed digest verification before finalization");
    const type = mediaType(mimeType);
    const mediaSha256 = sha256(bytes);
    if (expectedSha256 && requiredDigest(expectedSha256, "expectedSha256") !== mediaSha256) throw typedError("Comment media does not match its declared digest", { code: "media_digest_mismatch", statusCode: 409 });
    const media = {
      sha256: mediaSha256,
      bytes: bytes.length,
      mimeType: type.mimeType,
      durationSeconds: finiteNumber(durationSeconds, "durationSeconds", 0.05),
      width: Math.round(finiteNumber(width, "width", 1)),
      height: Math.round(finiteNumber(height, "height", 1)),
      locator: `hapa-media://sha256/${mediaSha256}`,
    };
    if (media.durationSeconds > 45) throw typedError("Comment capture may be at most 45 seconds");
    await mkdir(this.assetRoot, { recursive: true, mode: 0o700 });
    const assetPath = path.join(this.assetRoot, `${mediaSha256}${type.extension}`);
    try {
      const existing = await readFile(assetPath);
      if (sha256(existing) !== mediaSha256) throw new Error("Existing Comment asset failed content-addressed verification");
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
      const temporary = path.join(this.assetRoot, `.${mediaSha256}.${randomBytes(6).toString("hex")}.tmp`);
      await writeFile(temporary, bytes, { mode: 0o600, flag: "wx" });
      await rename(temporary, assetPath);
    }
    const consentEvent = this.events.find((event) => event.eventId === capture.consent.eventId && event.eventHash === capture.consent.eventHash);
    if (!consentEvent) throw new Error("Verified append-only consent event is unavailable");
    const createdAt = this.now();
    const { card, lessonCard, resultCard, identity } = buildCards({ capture, media, consentEvent, createdAt });
    const sourceDigestAfter = sha256(capture.sourceCard);
    if (sourceDigestAfter !== sourceDigestBefore) throw new Error("Source Card changed during Comment finalization");
    const manifest = {
      schemaVersion: "hapa.avatar-builder.media-comment-manifest.v1",
      captureId,
      commentIdentity: identity,
      cardId: card.id,
      lessonCardId: lessonCard.id,
      resultCardId: resultCard.id,
      media,
      sourceDigestBefore,
      sourceDigestAfter,
      originUnchanged: true,
      proposed: true,
      minted: false,
      physicalDeviceClaim: capture.device.kind === "physical_phone" ? "device-declared; independent physical-device demo evidence required" : "not_applicable",
    };
    const event = await this.appendEvent({ type: "capture.finalized", captureId, cardId: card.id, actor: capture.actor, payload: { manifest, cards: [card, lessonCard, resultCard] } });
    return { ...manifest, eventId: event.eventId, eventHash: event.eventHash, card, lessonCard, resultCard };
  }

  async revokeConsent({ captureId, authorityId, reason = "Consent withdrawn" } = {}, { inviteToken = null } = {}) {
    const capture = this.captureByCredential(captureId, inviteToken);
    if (requiredText(authorityId, "authorityId") !== capture.actor.actorId) throw typedError("Only the consent authority may revoke this capture", { code: "consent_authority_mismatch", statusCode: 403 });
    const event = await this.appendEvent({ type: "consent.revoked", captureId, cardId: capture.finalized?.cardId || null, actor: capture.actor, payload: { consentEventId: capture.consent?.eventId || null, reason: requiredText(reason, "reason", 300) } });
    return { ok: true, captureId, eventId: event.eventId, eventHash: event.eventHash };
  }

  list() {
    const projection = this.projection();
    return {
      schemaVersion: AVATAR_MEDIA_COMMENT_LIST_SCHEMA,
      captureCount: projection.captures.length,
      cardCount: projection.cards.length,
      captures: projection.captures,
      cards: projection.cards,
      headEventHash: this.events.at(-1)?.eventHash || null,
      truthBoundary: "Phone/Webcam presence is transient and excluded from Card/Gate identity. Only finalized, explicitly consented media creates a separate proposed Comment Card. The exact source snapshot remains unchanged. Physical-device claims require independent demo evidence. Nothing is automatically minted.",
    };
  }

  async asset(mediaSha256) {
    const digest = requiredDigest(mediaSha256, "mediaSha256");
    const card = this.projection().cards.find((candidate) => candidate.contentRefs?.some((ref) => ref.sha256 === digest));
    if (!card) throw typedError("Comment media is not referenced by verified append-only history", { code: "comment_asset_not_found", statusCode: 404 });
    const ref = card.contentRefs.find((candidate) => candidate.sha256 === digest);
    const type = mediaType(ref.mediaType);
    const filePath = path.join(this.assetRoot, `${digest}${type.extension}`);
    const info = await stat(filePath);
    return { filePath, mimeType: type.mimeType, size: info.size, sha256: digest };
  }
}

export async function openAvatarMediaCommentService({ root, now, inviteTtlMs } = {}) {
  const resolved = path.resolve(root);
  const events = parseEvents(await readOptional(path.join(resolved, "events.ndjson")));
  return new AvatarMediaCommentService({ root: resolved, events, now, inviteTtlMs });
}
