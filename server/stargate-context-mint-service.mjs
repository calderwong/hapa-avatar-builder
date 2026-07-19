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

function resultArtwork(state = "origin_staged") {
  const indexed = state === "catalog_indexed";
  const label = String(state).replaceAll("_", " ").replaceAll("-", " ").toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152"><defs><radialGradient id="g"><stop stop-color="${indexed ? "#00f3ff" : "#f6c96d"}" stop-opacity=".42"/><stop offset="1" stop-color="#020617"/></radialGradient></defs><rect width="768" height="1152" rx="42" fill="#020617"/><path d="M42 18h684l24 24v1068l-24 24H42l-24-24V42z" fill="url(#g)" stroke="${indexed ? "#00f3ff" : "#f6c96d"}" stroke-width="10"/><text x="384" y="112" text-anchor="middle" fill="#8ef7ff" font-family="monospace" font-size="24" letter-spacing="7">HAPA CUSTODY RECEIPT</text><circle cx="384" cy="455" r="210" fill="none" stroke="#f6c96d" stroke-width="9" stroke-dasharray="22 12"/><circle cx="384" cy="455" r="150" fill="none" stroke="#00f3ff" stroke-width="6"/><path d="m300 455 52 52 122-134" fill="none" stroke="${indexed ? "#45f2c8" : "#f6c96d"}" stroke-width="24" stroke-linecap="round" stroke-linejoin="round"/><text x="384" y="760" text-anchor="middle" fill="#f8f3e7" font-family="system-ui" font-size="42" font-weight="800">Stargate Catalog</text><text x="384" y="816" text-anchor="middle" fill="#f8f3e7" font-family="system-ui" font-size="42" font-weight="800">Sync Result Card</text><text x="384" y="900" text-anchor="middle" fill="${indexed ? "#00f3ff" : "#f6c96d"}" font-family="monospace" font-size="23" letter-spacing="4">${label}</text><text x="384" y="1018" text-anchor="middle" fill="#9bd8e7" font-family="monospace" font-size="16">SOURCE ONLY · NO OFFER · NO JOIN AUTHORITY</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildStargateCatalogSyncResultCard({ sourceCard, state, origin = {}, catalog = null, catalogError = null, observedAt = new Date().toISOString() } = {}) {
  const sourceId = cleanText(sourceCard?.id);
  if (!sourceId) throw new TypeError("Sync Result Card requires a source Card ID");
  const stableReference = cleanText(origin.cardId);
  const eventId = cleanText(origin.eventId);
  const suffix = cleanText(origin.eventDigest).replace(/^sha256:/, "").slice(0, 16) || cleanText(sourceCard?.stargateContext?.contextDigest).slice(0, 16) || "pending";
  const result = {
    schemaVersion: "hapa.stargate-catalog-sync-result.v1",
    state: cleanText(state) || "origin_staged",
    source: { localCardId: sourceId, globalCardId: stableReference || null, sourceRevisionId: cleanText(sourceCard?.stargateContext?.revisionId) || null, overwindRevision: Number(origin.revision || 0) || null },
    origin: { eventId: eventId || null, eventDigest: cleanText(origin.eventDigest) || null, originSequence: Number(origin.originSequence || 0) || null, durableAcknowledgement: origin.durableAcknowledgement === true, ledgerPosition: Number(origin.ledgerPosition || 0) || null },
    catalog: catalog ? { state: cleanText(catalog.state), indexedRevision: Number(catalog.indexed_revision || 0) || null, subscriberCursor: Number(catalog.subscriber_cursor || 0) || null, secondCardHeadCreated: catalog.identity?.second_card_head_created === true, sourceOnly: catalog.commerce?.source_only !== false, sellable: catalog.commerce?.sellable === true, offerCount: Number(catalog.commerce?.offer_count || 0) } : null,
    exception: catalogError ? { code: cleanText(catalogError.code) || "subscriber_unavailable" } : null,
    boundaries: { joinAuthorityIncluded: false, commerceEligibility: "not_inferred", sourceOnly: true, secondReturnCardHeadCreated: false },
    observedAt
  };
  return {
    id: `stargate-catalog-sync-result:${sourceId}:${suffix}`,
    title: "Stargate Catalog Sync Result",
    cardType: "reference_card",
    tarotMainType: "stargate_catalog_sync_result",
    status: state === "catalog_indexed" ? "verified_local_evidence" : "bounded_status_evidence",
    truthStatus: result.state,
    summary: `Exact Return Card custody result: ${result.state.replaceAll("_", " ")}.`,
    tags: ["stargate", "catalog-sync", "custody-receipt", "source-only", result.state],
    imageUri: resultArtwork(result.state),
    stargateCatalogSyncResult: result,
    enrichment: { needsReview: false, tags: ["build-week", "protocol-evidence"], media: { stargateCatalogSyncResult: result } },
    lineage: { sourceCardId: sourceId, sourceGlobalCardId: stableReference || null, sourceEventId: eventId || null, recordOwner: "hapa-avatar-builder", projectionOwner: ".hapaCatalog" },
    createdAt: observedAt,
    updatedAt: observedAt
  };
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
    const observedAt = new Date().toISOString();
    const syncResultCard = buildStargateCatalogSyncResultCard({ sourceCard: nextCard, state, origin, catalog, catalogError, observedAt });
    const completedStore = await this.readStore();
    await this.writeStore({
      ...completedStore,
      cards: [...(completedStore.cards || []).filter((candidate) => candidate.id !== syncResultCard.id), syncResultCard],
      updatedAt: observedAt
    });
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
      syncResultCard,
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
