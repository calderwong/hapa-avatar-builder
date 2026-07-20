import { access, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import Hypercore from "hypercore";
import {
  applyCardCustodyReceipt,
  CARD_CUSTODY_RECEIPT_SCHEMA,
} from "../src/domain/card-custody.js";

export { applyCardCustodyReceipt, CARD_CUSTODY_RECEIPT_SCHEMA };
export const CARD_CORE_EVENT_SCHEMA = "hapa.card-core-event.v2";
export const CARD_CORE_REGISTRY_EVENT_SCHEMA = "hapa.card-core-registry-event.v1";

const REGISTRY_STORAGE_NAME = "origin-registry";
const DIGEST = /^[a-f0-9]{64}$/u;
const SAFE_STORAGE_NAME = /^[a-z0-9-]{8,80}$/u;

function canonicalValue(value, pointer = "$") {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError(`Non-finite number at ${pointer}`);
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry, index) => canonicalValue(entry, `${pointer}[${index}]`));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => {
      if (value[key] === undefined) throw new TypeError(`Undefined value at ${pointer}.${key}`);
      return [key, canonicalValue(value[key], `${pointer}.${key}`)];
    }));
  }
  throw new TypeError(`Unsupported ${typeof value} value at ${pointer}`);
}

function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

function sha256(value) {
  const bytes = typeof value === "string" ? value : canonicalJson(value);
  return createHash("sha256").update(bytes).digest("hex");
}

function hex(value) {
  return Buffer.from(value).toString("hex");
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new TypeError(`${label} is required`);
  return text;
}

function stringList(value, limit = 64) {
  return [...new Set((Array.isArray(value) ? value : []).map((entry) => String(entry || "").trim()).filter(Boolean))]
    .sort()
    .slice(0, limit);
}

function safeSourceRefs(value = []) {
  return (Array.isArray(value) ? value : []).slice(0, 32).map((entry) => {
    if (typeof entry === "string") return { kind: "opaque_source_ref", label: "source" };
    return {
      kind: String(entry?.kind || entry?.type || "source"),
      cardId: String(entry?.cardId || entry?.id || ""),
      revisionId: String(entry?.revisionId || ""),
      recordDigest: String(entry?.recordDigest || "").replace(/^sha256:/u, "").toLowerCase(),
      label: String(entry?.label || entry?.title || "").slice(0, 240),
      license: String(entry?.license || "").slice(0, 120),
    };
  });
}

function compactAttribution(card = {}) {
  const attribution = card.tarotAttribution || card.attribution || {};
  return {
    creator: String(attribution.creator || attribution.author || card.creatorProfile?.name || "").slice(0, 240),
    sponsor: String(attribution.sponsor || card.sponsorProfile?.name || card.sponsorProfile?.title || "").slice(0, 240),
    source: String(attribution.source || attribution.sourceLabel || card.sourceLabel || "").slice(0, 240),
    tool: String(attribution.tool || attribution.model || card.generation?.tool || "").slice(0, 240),
    license: String(attribution.license || card.license || "").slice(0, 120),
  };
}

export function createCardSemanticSnapshot(card = {}) {
  const cardId = requiredText(card.cardId || card.id, "card.cardId");
  if (card.liveCamera || card.isCameraCard || card.isPhoneCard || card.liveStream === true) {
    throw new TypeError("Live bridge material must be explicitly captured as a Card before custody is created");
  }
  return {
    schemaVersion: "hapa.card-semantic-snapshot.v1",
    sourceCardId: cardId,
    sourceRevision: String(card.cardRevisionId || card.revisionId || card.semanticVersion || card.revision || card.updatedAt || "unversioned"),
    title: String(card.title || "Untitled Card").slice(0, 500),
    summary: String(card.summary || card.meaning || card.description || "").slice(0, 8_000),
    cardType: String(card.cardType || card.tarotMainType || "card"),
    sourceKind: String(card.sourceKind || card.kind || "card"),
    keywords: stringList(card.keywords),
    tags: stringList(card.tags),
    attribution: compactAttribution(card),
    sourceRefs: safeSourceRefs(card.sourceRefs),
  };
}

function storageNameForCard(cardId) {
  return `card-${sha256(cardId).slice(0, 24)}`;
}

function storagePath(root, storageName) {
  if (!SAFE_STORAGE_NAME.test(storageName)) throw new TypeError("Unsafe Card custody storage name");
  return path.join(root, "cores", storageName);
}

async function exists(target) {
  try {
    await access(target);
    return true;
  } catch {
    return false;
  }
}

async function readBlocks(core) {
  const blocks = [];
  for (let index = 0; index < core.length; index += 1) blocks.push(await core.get(index));
  return blocks;
}

function eventDigest(event) {
  const { eventDigest: _ignored, ...unsigned } = event;
  return sha256(unsigned);
}

function verifyRegistryEvents(events, registryKey) {
  let previousDigest = null;
  const cardIds = new Set();
  const coreKeys = new Set();
  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (event?.schemaVersion !== CARD_CORE_REGISTRY_EVENT_SCHEMA || event?.eventType !== "card.core.registered") {
      throw new TypeError(`Unsupported Card custody registry event at ${index}`);
    }
    if (event.sequence !== index || event.previousEventDigest !== previousDigest) throw new TypeError(`Broken Card custody registry chain at ${index}`);
    if (!DIGEST.test(event.coreKey) || !DIGEST.test(event.eventDigest) || !DIGEST.test(event.initialRecordDigest)) throw new TypeError(`Invalid Card custody registry digest at ${index}`);
    if (eventDigest(event) !== event.eventDigest) throw new TypeError(`Card custody registry event digest mismatch at ${index}`);
    if (cardIds.has(event.cardId) || coreKeys.has(event.coreKey)) throw new TypeError(`Duplicate Card custody registry identity at ${index}`);
    if (event.eventId !== sha256({ registryKey, sequence: index, cardId: event.cardId, coreKey: event.coreKey })) throw new TypeError(`Card custody registry event ID mismatch at ${index}`);
    cardIds.add(event.cardId);
    coreKeys.add(event.coreKey);
    previousDigest = event.eventDigest;
  }
  return { registryKey, events, headEventDigest: previousDigest };
}

function verifyCreatedEvent(event, expectedCoreKey) {
  if (event?.schemaVersion !== CARD_CORE_EVENT_SCHEMA || event?.eventType !== "card.created" || event?.sequence !== 0 || event?.previousEventDigest !== null) {
    throw new TypeError("The Card core does not begin with one card.created event");
  }
  if (event.record?.cardCoreKey !== expectedCoreKey || event.cardId !== event.record?.cardId || event.revisionId !== event.record?.revisionId) {
    throw new TypeError("Card core identity does not match its first record");
  }
  const { recordDigest, ...unsignedRecord } = event.record || {};
  if (!DIGEST.test(recordDigest) || sha256(unsignedRecord) !== recordDigest || event.recordDigest !== recordDigest) {
    throw new TypeError("Card record digest does not match the canonical record");
  }
  if (!DIGEST.test(event.eventDigest) || eventDigest(event) !== event.eventDigest) throw new TypeError("Card core event digest mismatch");
  if (event.eventId !== sha256({ coreKey: expectedCoreKey, sequence: 0, cardId: event.cardId, eventType: event.eventType, recordDigest })) {
    throw new TypeError("Card core event ID mismatch");
  }
  return event;
}

function receiptFromCreatedEvent(event) {
  return {
    schemaVersion: CARD_CUSTODY_RECEIPT_SCHEMA,
    cardId: event.cardId,
    cardCoreKey: event.record.cardCoreKey,
    cardRevisionId: event.revisionId,
    cardRecordDigest: event.recordDigest,
    originPublicKey: event.record.originPublicKey,
    originNodeId: event.record.originNodeId,
    createdAt: event.occurredAt,
    headEventDigest: event.eventDigest,
    historyLength: 1,
    lifecycleStatus: "draft",
    custodyState: "origin_appended",
    replicationState: "origin_only",
    minted: false,
    catalogPublished: false,
    commerceEligible: false,
    canonical: false,
  };
}

export class AvatarCardCustodyService {
  constructor({ root, now = () => new Date().toISOString(), originNodeId = "hapa-avatar-builder" } = {}) {
    this.root = path.resolve(requiredText(root, "root"));
    this.now = now;
    this.originNodeId = originNodeId;
    this.queue = Promise.resolve();
  }

  async openRegistry() {
    await mkdir(path.join(this.root, "cores"), { recursive: true });
    const core = new Hypercore(storagePath(this.root, REGISTRY_STORAGE_NAME), { valueEncoding: "json" });
    await core.ready();
    return core;
  }

  async registryState({ create = false } = {}) {
    if (!create && !(await exists(storagePath(this.root, REGISTRY_STORAGE_NAME)))) return { registryKey: null, events: [], headEventDigest: null };
    const core = await this.openRegistry();
    try {
      return verifyRegistryEvents(await readBlocks(core), hex(core.key));
    } finally {
      await core.close().catch(() => {});
    }
  }

  async list() {
    const state = await this.registryState();
    return {
      schemaVersion: "hapa.card-custody-index.v1",
      cardCount: state.events.length,
      registryCoreKey: state.registryKey,
      registryHeadEventDigest: state.headEventDigest,
      receipts: state.events.map((event) => structuredClone(event.receipt)),
      startupPolicy: "registry-projection-only; Card cores open only for exact read or ensure",
    };
  }

  async get(cardIdInput) {
    const cardId = requiredText(cardIdInput, "cardId");
    const state = await this.registryState();
    const registration = state.events.find((event) => event.cardId === cardId);
    if (!registration) return null;
    const core = new Hypercore(storagePath(this.root, registration.storageName), { valueEncoding: "json" });
    try {
      await core.ready();
      const coreKey = hex(core.key);
      if (coreKey !== registration.coreKey) throw new TypeError(`Registered Card core ${cardId} has a different key`);
      if (core.length !== 1) throw new TypeError(`Card ${cardId} has unsupported history length ${core.length}; revision support is not yet enabled here`);
      const event = verifyCreatedEvent(await core.get(0), coreKey);
      if (event.eventDigest !== registration.headEventDigest) throw new TypeError(`Registered Card core ${cardId} head differs from its registry receipt`);
      return receiptFromCreatedEvent(event);
    } finally {
      await core.close().catch(() => {});
    }
  }

  ensure({ card, actorId = "local-operator", evidenceRef = "ui:explicit-create-card-core" } = {}) {
    const operation = this.queue.then(() => this.ensureUnlocked({ card, actorId, evidenceRef }));
    this.queue = operation.catch(() => {});
    return operation;
  }

  async ensureUnlocked({ card, actorId, evidenceRef }) {
    const snapshot = createCardSemanticSnapshot(card);
    const registered = await this.get(snapshot.sourceCardId);
    if (registered) return { created: false, receipt: registered, card: applyCardCustodyReceipt(card, registered) };

    const registryState = await this.registryState({ create: true });
    const storageName = storageNameForCard(snapshot.sourceCardId);
    const coreLocation = storagePath(this.root, storageName);
    if (await exists(coreLocation)) throw new TypeError(`Unregistered Card core storage already exists for ${snapshot.sourceCardId}; refusing to overwrite it`);

    const core = new Hypercore(coreLocation, { valueEncoding: "json" });
    let event;
    try {
      await core.ready();
      if (!core.writable || core.length !== 0) throw new TypeError("New Card custody core is not an empty writable origin");
      const cardCoreKey = hex(core.key);
      const originPublicKey = hex(core.keyPair.publicKey);
      const snapshotDigest = sha256(snapshot);
      const revisionId = `created-${snapshotDigest.slice(0, 16)}`;
      const occurredAt = this.now();
      const unsignedRecord = {
        schemaVersion: "hapa.card-origin-record.v1",
        cardId: snapshot.sourceCardId,
        revisionId,
        parentRevisionId: null,
        lifecycleStatus: "draft",
        originNodeId: this.originNodeId,
        originPublicKey,
        cardCoreKey,
        semanticSnapshot: snapshot,
        authorityState: {
          custodyCreated: true,
          minted: false,
          catalogPublished: false,
          commerceEligible: false,
          canonical: false,
        },
      };
      const record = { ...unsignedRecord, recordDigest: sha256(unsignedRecord) };
      const unsignedEvent = {
        schemaVersion: CARD_CORE_EVENT_SCHEMA,
        eventId: sha256({ coreKey: cardCoreKey, sequence: 0, cardId: record.cardId, eventType: "card.created", recordDigest: record.recordDigest }),
        eventType: "card.created",
        sequence: 0,
        cardId: record.cardId,
        revisionId,
        previousEventDigest: null,
        recordDigest: record.recordDigest,
        occurredAt,
        actor: { actorId: requiredText(actorId, "actorId"), actorType: "human_or_local_operator" },
        evidenceRefs: [requiredText(evidenceRef, "evidenceRef")],
        record,
      };
      event = { ...unsignedEvent, eventDigest: sha256(unsignedEvent) };
      await core.append(event);
      verifyCreatedEvent(await core.get(0), cardCoreKey);
    } finally {
      await core.close().catch(() => {});
    }

    const receipt = receiptFromCreatedEvent(event);
    const registry = await this.openRegistry();
    try {
      const latest = verifyRegistryEvents(await readBlocks(registry), hex(registry.key));
      if (latest.events.length !== registryState.events.length || latest.headEventDigest !== registryState.headEventDigest) {
        throw new TypeError("Card custody registry changed during core creation; manual recovery is required before retrying");
      }
      const unsignedRegistration = {
        schemaVersion: CARD_CORE_REGISTRY_EVENT_SCHEMA,
        eventId: sha256({ registryKey: latest.registryKey, sequence: latest.events.length, cardId: receipt.cardId, coreKey: receipt.cardCoreKey }),
        eventType: "card.core.registered",
        sequence: latest.events.length,
        cardId: receipt.cardId,
        storageName,
        coreKey: receipt.cardCoreKey,
        initialRecordDigest: receipt.cardRecordDigest,
        headEventDigest: receipt.headEventDigest,
        previousEventDigest: latest.headEventDigest,
        registeredAt: receipt.createdAt,
        registeredBy: requiredText(actorId, "actorId"),
        receipt,
      };
      await registry.append({ ...unsignedRegistration, eventDigest: sha256(unsignedRegistration) });
      verifyRegistryEvents(await readBlocks(registry), latest.registryKey);
    } finally {
      await registry.close().catch(() => {});
    }

    return { created: true, receipt, card: applyCardCustodyReceipt(card, receipt) };
  }
}

export function openAvatarCardCustodyService(options = {}) {
  return new AvatarCardCustodyService(options);
}
