import {
  isStargateContextCard,
  restoreStargateContextCard,
  stargateContextEnvelopeFromCard
} from "../src/domain/tarot-stargate-context-card.js";

export const STARGATE_CONTEXT_RETURN_RESOLUTION_SCHEMA = "hapa.stargate-context-return-resolution.v1";

const FORBIDDEN_KEY = /(?:cohort.?secret|rendezvous.?topic|raw.?invite|invitation.?token|(?:^|[^a-z])gate.?pass(?:$|[^a-z])|private.?key|bearer.?token|credential|profile.?path)/i;
const FULL_GATE_ADDRESS = /hapa-gate:v[1-9][0-9]*:[a-z2-7]{52}/i;
const LOCAL_PATH = /^(?:file:\/\/|\/Users\/|\/var\/folders\/|[A-Za-z]:\\)/;

function text(value) { return String(value || "").trim(); }

// cardIdFor emits four segments, with the local id in the last segment.
function decodeCardId(cardId = "") {
  const parts = text(cardId).split(":");
  if (parts.length !== 4 || parts[0] !== "hapa-card" || parts[1] !== "v1") return null;
  try {
    const originNode = Buffer.from(parts[2], "base64url").toString("utf8");
    const originLocalId = Buffer.from(parts[3], "base64url").toString("utf8");
    return originNode && originLocalId ? { cardId: text(cardId), originNode, originLocalId } : null;
  } catch {
    return null;
  }
}

function assertPortable(value, trail = "$") {
  if (Array.isArray(value)) return value.forEach((entry, index) => assertPortable(entry, `${trail}[${index}]`));
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEY.test(key) && child !== null && child !== "" && child !== false) throw new TypeError(`Unsafe return Card field: ${trail}.${key}`);
      assertPortable(child, `${trail}.${key}`);
    }
    return;
  }
  if (typeof value === "string" && (FULL_GATE_ADDRESS.test(value) || LOCAL_PATH.test(value))) throw new TypeError(`Unsafe return Card value: ${trail}`);
}

export class StargateContextReturnResolver {
  constructor({ origin, subscriber } = {}) {
    if (!origin || typeof origin.exactRevision !== "function") throw new TypeError("Avatar Builder origin resolver is required");
    if (!subscriber || typeof subscriber.exactRevision !== "function") throw new TypeError("Avatar Builder subscriber resolver is required");
    this.origin = origin;
    this.subscriber = subscriber;
  }

  async resolve({ cardId = "", expectedRevision = 0, sourceNode = "hapa-avatar-builder" } = {}) {
    const identity = decodeCardId(cardId);
    const pinnedRevision = Number(expectedRevision || 0);
    const requestedSource = text(sourceNode) || "hapa-avatar-builder";
    if (!identity || identity.originNode !== requestedSource || requestedSource !== "hapa-avatar-builder") {
      throw Object.assign(new Error("The return handoff must name a valid Hapa Avatar Builder Card identity."), { code: "invalid_stargate_return_identity", statusCode: 422 });
    }
    if (!Number.isSafeInteger(pinnedRevision) || pinnedRevision < 1) {
      throw Object.assign(new Error("The return handoff must pin a positive immutable Card revision."), { code: "invalid_stargate_return_revision", statusCode: 422 });
    }

    const local = this.origin.exactRevision(identity.cardId, pinnedRevision);
    let resolution = local ? {
      ok: true,
      card: local.card,
      revision: local.revision,
      headRevision: Number(local.head?.revision || local.revision),
      source: "origin-outbox-exact",
      offline: true,
      truthState: local.durableAcknowledgement ? "overwind-acknowledged" : "origin-staged",
      newerRevisionAvailable: Number(local.head?.revision || 0) > pinnedRevision,
      eventId: local.eventId,
      eventDigest: local.eventDigest,
      ledgerPosition: local.ledgerPosition
    } : await this.subscriber.exactRevision(identity.cardId, pinnedRevision);

    if (!resolution?.ok || !resolution.card) {
      throw Object.assign(new Error(resolution?.newerRevisionAvailable
        ? `Pinned revision ${pinnedRevision} is unavailable; revision ${resolution.headRevision} is visible but was not substituted.`
        : `Pinned revision ${pinnedRevision} is not available from local Avatar Builder custody or Overwind.`), {
        code: resolution?.newerRevisionAvailable ? "stargate_return_revision_unavailable" : "stargate_return_not_found",
        statusCode: resolution?.newerRevisionAvailable ? 409 : 404,
        detail: resolution || null
      });
    }
    if (!isStargateContextCard(resolution.card)) {
      throw Object.assign(new Error("The resolved Card is not a Stargate Context Card."), { code: "not_stargate_context", statusCode: 422 });
    }
    assertPortable(resolution.card);
    const restore = restoreStargateContextCard(resolution.card);
    const context = stargateContextEnvelopeFromCard(resolution.card);
    const result = {
      ok: true,
      schemaVersion: STARGATE_CONTEXT_RETURN_RESOLUTION_SCHEMA,
      card: resolution.card,
      identity: {
        globalCardId: identity.cardId,
        originNode: identity.originNode,
        originLocalId: identity.originLocalId,
        pinnedRevision,
        sourceHeadRevision: Number(resolution.headRevision || pinnedRevision),
        newerRevisionAvailable: Boolean(resolution.newerRevisionAvailable)
      },
      custody: {
        resolver: resolution.source,
        truthState: resolution.truthState || "local-stale",
        offline: Boolean(resolution.offline),
        eventId: resolution.eventId || null,
        eventDigest: resolution.eventDigest || null,
        ledgerPosition: Number(resolution.ledgerPosition || 0) || null,
        catalogRequired: false
      },
      restore: {
        ...restore,
        intent: "restore_disconnected",
        formationCount: context.formation.members.length,
        autoConnect: false,
        passRequested: false,
        localConsentRecorded: false
      },
      newerRevision: resolution.newerRevisionAvailable ? {
        available: true,
        revision: Number(resolution.headRevision || 0),
        selected: false,
        choiceRequired: true
      } : { available: false, revision: null, selected: false, choiceRequired: false },
      effects: { catalog_contacted: false, p2p_joined: false, pass_requested: false, external_writes: 0 }
    };
    assertPortable(result);
    return result;
  }
}
