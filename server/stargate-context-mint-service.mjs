import { existsSync, readFileSync } from "node:fs";
import {
  approveStargateContextCardForMint,
  isStargateContextCard,
  stargateContextMintReview
} from "../src/domain/tarot-stargate-context-card.js";

export const STARGATE_CONTEXT_MINT_RESULT_SCHEMA = "hapa.stargate-context-mint-result.v1";
export const STARGATE_CONTEXT_SYNC_STATUS_SCHEMA = "hapa.stargate-context-sync-status.v1";

function cleanText(value) {
  return String(value || "").trim();
}

function safeCatalogToken(env = process.env) {
  const direct = cleanText(env.HAPA_CATALOG_TOKEN);
  if (direct) return direct;
  const file = cleanText(env.HAPA_CATALOG_TOKEN_FILE);
  if (file && existsSync(file)) return cleanText(readFileSync(file, "utf8"));
  return "";
}

function combineState(origin = {}, catalog = null) {
  if (catalog?.state === "revision_mismatch") return "revision_mismatch";
  if (catalog?.state === "catalog_indexed") return "catalog_indexed";
  if (catalog?.state === "local-stale") return "local-stale";
  if (origin.durableAcknowledgement) return catalog ? "catalog_pending" : "subscriber_unavailable";
  if (origin.state === "pending") return "origin_staged";
  if (origin.state === "acknowledged") return "overwind_acknowledged";
  return "proposed_unminted";
}

export class StargateCatalogProjectionClient {
  constructor({ baseUrl = process.env.HAPA_CATALOG_URL || "http://127.0.0.1:8770", token = safeCatalogToken() } = {}) {
    this.baseUrl = String(baseUrl).replace(/\/$/, "");
    this.token = token;
  }

  async request(pathname, { method = "GET", body } = {}) {
    if (!this.token) throw Object.assign(new Error("Catalog subscriber credential is not configured."), { code: "catalog_subscriber_unavailable" });
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        method,
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${this.token}`,
          "x-hapa-origin-node": "hapa-avatar-builder"
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error(data.message || data.error || `catalog_http_${response.status}`), { code: data.error || "catalog_request_failed", statusCode: response.status });
      return data;
    } finally {
      clearTimeout(timer);
    }
  }

  sync() {
    return this.request("/v1/overwind/subscriber/sync", { method: "POST", body: { reason: "stargate-context-origin-acknowledged" } });
  }

  status(cardId, revision) {
    const query = new URLSearchParams({ expected_revision: String(revision || 0) });
    return this.request(`/v1/overwind/cards/${encodeURIComponent(cardId)}/projection-status?${query}`);
  }
}

export class StargateContextMintService {
  constructor({ origin, readStore, writeStore, catalogClient = new StargateCatalogProjectionClient(), uploadFetch = fetch } = {}) {
    if (!origin || typeof origin.commitCardMint !== "function") throw new TypeError("origin adapter is required");
    if (typeof readStore !== "function" || typeof writeStore !== "function") throw new TypeError("Tarot store read/write functions are required");
    this.origin = origin;
    this.readStore = readStore;
    this.writeStore = writeStore;
    this.catalogClient = catalogClient;
    this.uploadFetch = uploadFetch;
  }

  async resolve(cardId, suppliedCard = null) {
    if (suppliedCard && isStargateContextCard(suppliedCard)) return suppliedCard;
    const store = await this.readStore();
    const card = (store.cards || []).find((candidate) => candidate.id === cardId);
    if (!card) throw Object.assign(new Error(`Stargate Context Card not found: ${cardId || "missing"}`), { code: "stargate_context_not_found", statusCode: 404 });
    if (!isStargateContextCard(card)) throw Object.assign(new Error("The selected Card is not a Stargate Context Card."), { code: "not_stargate_context", statusCode: 422 });
    return card;
  }

  async review({ cardId = "", card = null } = {}) {
    const resolved = await this.resolve(cardId, card);
    const review = stargateContextMintReview(resolved);
    const origin = this.origin.statusForRecord("tarot", resolved);
    return {
      ok: true,
      schemaVersion: "hapa.stargate-context-mint-review-response.v1",
      card: resolved,
      review,
      sync: {
        schemaVersion: STARGATE_CONTEXT_SYNC_STATUS_SCHEMA,
        state: combineState(origin),
        origin,
        catalog: null,
        stableCardReference: origin.cardId || null,
        expectedRevision: origin.revision || 1,
        joinAuthorityIncluded: false,
        commerceEligibility: "not_inferred"
      }
    };
  }

  async mint({ cardId = "", approval = {}, reviewDigest = "" } = {}) {
    const current = await this.resolve(cardId);
    const nextCard = approveStargateContextCardForMint(current, { ...approval, reviewDigest });
    const store = await this.readStore();
    const nextStore = {
      ...store,
      cards: (store.cards || []).map((candidate) => candidate.id === nextCard.id ? nextCard : candidate),
      updatedAt: new Date().toISOString()
    };
    const staged = await this.origin.commitCardMint("tarot", nextCard, () => this.writeStore(nextStore));
    const eventId = staged.event?.event_id;
    const upload = eventId ? await this.origin.upload(this.uploadFetch, [eventId]) : { ok: false, sent: 0, acknowledged: 0, error: "origin_event_missing" };
    const origin = this.origin.statusForRecord("tarot", nextCard);
    let catalog = null;
    let catalogSync = null;
    let catalogError = null;
    if (origin.durableAcknowledgement) {
      try {
        catalogSync = await this.catalogClient.sync();
        catalog = await this.catalogClient.status(origin.cardId, origin.revision);
      } catch (error) {
        catalogError = { code: error?.code || "catalog_subscriber_unavailable", message: error?.message || String(error) };
      }
    }
    const state = combineState(origin, catalog);
    return {
      ok: ["origin_staged", "overwind_acknowledged", "catalog_pending", "catalog_indexed", "subscriber_unavailable", "local-stale"].includes(state),
      schemaVersion: STARGATE_CONTEXT_MINT_RESULT_SCHEMA,
      state,
      card: nextCard,
      reviewDigest: nextCard.mintApproval?.reviewDigest || reviewDigest,
      origin,
      upload,
      catalog,
      catalogSync,
      catalogError,
      stableCardReference: origin.cardId || null,
      expectedRevision: origin.revision || 1,
      humanApproval: {
        decision: "approved",
        actorId: nextCard.mintApproval?.actorId || "",
        actorType: "human",
        identityAssurance: "locally-asserted-not-remotely-verified",
        method: nextCard.mintApproval?.method || "explicit-ui-control"
      },
      truthBoundary: {
        oneOriginEvent: true,
        secondCardHeadCreated: false,
        joinAuthorityIncluded: false,
        commerceEligibility: "not_inferred",
        sourceOnly: true
      }
    };
  }

  async status({ cardId = "" } = {}) {
    const card = await this.resolve(cardId);
    const origin = this.origin.statusForRecord("tarot", card);
    let catalog = null;
    let catalogError = null;
    if (origin.durableAcknowledgement) {
      try {
        catalog = await this.catalogClient.status(origin.cardId, origin.revision);
      } catch (error) {
        catalogError = { code: error?.code || "catalog_subscriber_unavailable", message: error?.message || String(error) };
      }
    }
    return {
      ok: true,
      schemaVersion: STARGATE_CONTEXT_SYNC_STATUS_SCHEMA,
      state: combineState(origin, catalog),
      cardId: card.id,
      stableCardReference: origin.cardId || null,
      expectedRevision: origin.revision || 1,
      origin,
      catalog,
      catalogError,
      joinAuthorityIncluded: false,
      commerceEligibility: "not_inferred"
    };
  }
}
