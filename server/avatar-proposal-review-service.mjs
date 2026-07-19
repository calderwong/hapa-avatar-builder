import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import { canonicalJson, sha256 } from "./stargate-p2p-canonical.mjs";
import { StargateCatalogProjectionClient } from "./stargate-context-mint-service.mjs";
import { runCardOriginAnnouncementProof } from "./card-origin-announcement-proof.mjs";

export const PROPOSAL_REVIEW_EVENT_SCHEMA = "hapa.avatar-builder.proposal-review-event.v1";
export const PROPOSAL_REVIEW_SCHEMA = "hapa.avatar-builder.proposal-review.v1";
export const PROPOSAL_DECISION_SCHEMA = "hapa.avatar-builder.proposal-decision.v1";
export const MINT_GATE_RESULT_CARD_SCHEMA = "hapa.avatar-builder.mint-gate-result-card.v1";
export const PROPOSAL_REVIEW_LIST_SCHEMA = "hapa.avatar-builder.proposal-review-list.v1";

const DECISIONS = Object.freeze(["revise", "reject", "defer", "approve"]);
const DIGEST = /^[a-f0-9]{64}$/;

function clone(value) { return structuredClone(value); }
function clean(value) { return String(value ?? "").trim(); }
function typedError(message, code = "proposal_review_rejected", statusCode = 422) { return Object.assign(new Error(message), { code, statusCode }); }
function requireText(value, label, max = 4_000) { const result = clean(value); if (!result) throw typedError(`${label} is required`); if (result.length > max) throw typedError(`${label} is too long`); return result; }
function normalizeDigest(value, label) { const result = clean(value).toLowerCase().replace(/^sha256:/, ""); if (!DIGEST.test(result)) throw typedError(`${label} must be a lowercase SHA-256 digest`); return result; }
function human(value = {}) { const actor = { actorId: requireText(value.actorId, "actor.actorId", 160), actorType: clean(value.actorType || "human"), displayName: clean(value.displayName || value.actorId) }; if (actor.actorType !== "human") throw typedError("Only an explicit human actor may review or decide a proposal", "human_authority_required", 403); return actor; }
function withoutRecordDigests(card) { const copy = clone(card); delete copy.cardRecordDigest; delete copy.recordDigest; return copy; }
function cardDigest(card) { return normalizeDigest(card?.cardRecordDigest || card?.recordDigest || sha256(withoutRecordDigests(card)), "proposal Card digest"); }
function unsignedEvent(event) { const { eventHash: _eventHash, ...unsigned } = event; return unsigned; }

function parseEvents(raw = "") {
  return String(raw).split(/\r?\n/).filter(Boolean).map((line, index) => {
    try { return JSON.parse(line); }
    catch (error) { throw new Error(`Proposal review event line ${index + 1} is invalid JSON: ${error.message}`); }
  });
}

export function verifyProposalReviewEvents(events = []) {
  let previousEventHash = null;
  events.forEach((event, index) => {
    if (event.schemaVersion !== PROPOSAL_REVIEW_EVENT_SCHEMA || event.sequence !== index + 1 || event.previousEventHash !== previousEventHash || sha256(unsignedEvent(event)) !== event.eventHash) throw new Error(`Proposal review event ${index + 1} failed append-only verification`);
    previousEventHash = event.eventHash;
  });
  return true;
}

function stateFor(origin = {}, catalog = null) {
  if (catalog?.state === "catalog_indexed") return "peer_announced";
  if (catalog?.state === "revision_mismatch") return "revision_mismatch";
  if (origin.durableAcknowledgement) return catalog ? "catalog_pending" : "overwind_acknowledged";
  return origin.state === "pending" ? "origin_staged" : "approved_pending_origin";
}

function resultArtwork({ state, decision, peerAnnounced }) {
  const safeState = clean(state).replaceAll("_", " ").toUpperCase();
  const safeDecision = clean(decision).toUpperCase();
  const glow = peerAnnounced ? "#45f2c8" : "#f6c96d";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="768" height="1152" viewBox="0 0 768 1152"><defs><radialGradient id="bg"><stop stop-color="${glow}" stop-opacity=".34"/><stop offset=".46" stop-color="#061d32" stop-opacity=".7"/><stop offset="1" stop-color="#020617"/></radialGradient><filter id="b"><feGaussianBlur stdDeviation="12"/></filter></defs><rect width="768" height="1152" rx="46" fill="#020617"/><path d="M44 18h680l26 26v1064l-26 26H44l-26-26V44z" fill="url(#bg)" stroke="#f6c96d" stroke-width="9"/><text x="384" y="104" text-anchor="middle" fill="#f6c96d" font-family="monospace" font-size="23" letter-spacing="7">MINT GATE RESULT</text><circle cx="384" cy="450" r="224" fill="none" stroke="#f6c96d" stroke-width="7" stroke-dasharray="25 12"/><circle cx="384" cy="450" r="174" fill="none" stroke="#00f3ff" stroke-width="5"/><circle cx="384" cy="450" r="112" fill="none" stroke="${glow}" stroke-width="10" filter="url(#b)"/><path d="M146 450h476M384 212v476" stroke="#f6c96d" stroke-opacity=".34" stroke-width="4"/><path d="m300 451 52 52 124-132" fill="none" stroke="${glow}" stroke-width="26" stroke-linecap="round" stroke-linejoin="round"/><g font-family="monospace" font-size="17" fill="#8ef7ff" text-anchor="middle"><text x="114" y="760">HUMAN</text><text x="294" y="760">ORIGIN</text><text x="474" y="760">CATALOG</text><text x="654" y="760">PEER</text></g><path d="M114 718h540" stroke="${glow}" stroke-width="6"/><g fill="${glow}"><circle cx="114" cy="718" r="15"/><circle cx="294" cy="718" r="15"/><circle cx="474" cy="718" r="15"/><circle cx="654" cy="718" r="15"/></g><text x="384" y="880" text-anchor="middle" fill="#fff" font-family="system-ui" font-size="48" font-weight="800">${safeDecision}</text><text x="384" y="940" text-anchor="middle" fill="${glow}" font-family="monospace" font-size="21" letter-spacing="3">${safeState}</text><text x="384" y="1042" text-anchor="middle" fill="#9bd8e7" font-family="monospace" font-size="15">APPEND ONLY · HUMAN AUTHORITY · EXACT RECEIPTS</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export function buildMintGateResultCard({ proposalCard, review, decision, origin, catalog, peer, state, observedAt = new Date().toISOString() } = {}) {
  const peerAnnounced = peer?.status === "passed" && peer?.effects?.peerAnnounced === true;
  const material = {
    schemaVersion: MINT_GATE_RESULT_CARD_SCHEMA,
    source: { proposalCardId: proposalCard.id, proposalCardDigest: review.proposalCardDigest, proposalLifecycle: review.lifecycleStatus, proposalType: proposalCard.tarotMainType || proposalCard.cardType || "unknown" },
    humanDecision: { decisionId: decision.decisionId, decisionDigest: decision.decisionDigest, decision: decision.decision, actor: clone(decision.actor), rationale: decision.rationale, decidedAt: decision.decidedAt, explicitHumanApproval: true },
    origin: { cardId: origin.cardId, revision: origin.revision, eventId: origin.eventId, eventDigest: origin.eventDigest, originSequence: origin.originSequence, durableAcknowledgement: origin.durableAcknowledgement, ledgerPosition: origin.ledgerPosition || null },
    catalog: catalog ? { state: catalog.state, indexedRevision: Number(catalog.indexed_revision || 0) || null, subscriberCursor: Number(catalog.subscriber_cursor || 0) || null, sourceOnly: catalog.commerce?.source_only !== false, sellable: catalog.commerce?.sellable === true } : null,
    peer: peer ? { status: peer.status, proofId: peer.proofId, proofDigest: peer.proofDigest, distinctStableNodeIds: peer.isolation?.distinctStableNodeIds === true, hyperswarmConnectionObserved: peer.transport?.hyperswarmConnectionObserved === true, noiseEncryptedStreamObserved: peer.transport?.noiseEncryptedStreamObserved === true, exactReceiverCopyStored: peer.announcement?.exactReceiverCopyStored === true, geographicallyRemotePeerClaimed: false } : null,
    state,
    observedAt,
    boundaries: { onlyHumanApprovalMints: true, siblingProposalMutated: false, sourceProposalRewritten: false, secondMintedCardHeadCreated: false, peerAnnouncementIsPresenceAuthority: false, commerceEligibility: "not_inferred", sourceOnly: true },
    truthBoundary: "The selected proposal crossed an explicit local human approval gate, created one origin Card head, and records bounded Overwind, Catalog, and local two-process peer receipts. The peer proof does not claim internet-wide or geographically remote delivery."
  };
  const recordDigest = sha256(material);
  return {
    id: `hapa-card:mint-gate-result:${recordDigest.slice(0, 32)}`,
    cardId: `hapa-card:mint-gate-result:${recordDigest.slice(0, 32)}`,
    title: "Mint Gate Result",
    subtitle: "Human → Origin → Catalog → Peer",
    summary: peerAnnounced ? "One human-approved proposal crossed the Mint Gate and its exact origin event reached a distinct local Hapa peer." : "One human-approved proposal crossed the Mint Gate; bounded custody receipts remain visible.",
    cardType: "result_experience",
    tarotMainType: "mint_gate_result_card",
    lifecycleStatus: "verified_local_evidence",
    status: "verified_local_evidence",
    minted: false,
    proposed: false,
    truthStatus: peerAnnounced ? "observed_human_origin_catalog_peer_chain" : "observed_partial_mint_chain",
    mintGateResult: material,
    imageUri: resultArtwork({ state, decision: decision.decision, peerAnnounced }),
    tags: ["mint-gate", "human-authority", "origin", "catalog", "peer-announcement", "append-only", "build-week"],
    lineage: { sourceCardId: proposalCard.id, sourceCardDigest: review.proposalCardDigest, sourceReviewDigest: review.reviewDigest, humanDecisionDigest: decision.decisionDigest, sourceOriginEventId: origin.eventId, recordOwner: "hapa-avatar-builder" },
    createdAt: observedAt,
    updatedAt: observedAt,
    cardRecordDigest: recordDigest,
    recordDigest
  };
}

function project(events = []) {
  verifyProposalReviewEvents(events);
  const reviews = events.filter((event) => event.type === "proposal.review.opened").map((event) => clone(event.payload.review));
  const decisions = events.filter((event) => event.type === "proposal.decision.recorded").map((event) => clone(event.payload.decision));
  const mints = events.filter((event) => event.type === "proposal.mint.completed").map((event) => clone(event.payload.result));
  const failures = events.filter((event) => event.type === "proposal.mint.failed").map((event) => clone(event.payload.failure));
  return { reviews, decisions, mints, failures };
}

export class AvatarProposalReviewService {
  constructor({ root, events = [], proposalSource, origin, readStore, writeStore, catalogClient = new StargateCatalogProjectionClient(), uploadFetch = fetch, peerAnnouncer, peerProfileRoot, peerTimeoutMs = 45_000, now = () => new Date().toISOString() } = {}) {
    if (typeof proposalSource !== "function") throw new TypeError("proposalSource is required");
    if (!origin || typeof origin.commitCardMint !== "function") throw new TypeError("origin adapter is required");
    if (typeof readStore !== "function" || typeof writeStore !== "function") throw new TypeError("Tarot store read/write functions are required");
    this.root = path.resolve(root); this.eventTape = path.join(this.root, "events.ndjson"); this.events = events.map(clone); verifyProposalReviewEvents(this.events);
    this.proposalSource = proposalSource; this.origin = origin; this.readStore = readStore; this.writeStore = writeStore; this.catalogClient = catalogClient; this.uploadFetch = uploadFetch; this.peerProfileRoot = path.resolve(peerProfileRoot || path.join(this.root, "peer-proof"));
    this.peerTimeoutMs = Math.max(5_000, Number(peerTimeoutMs) || 45_000);
    this.peerAnnouncer = peerAnnouncer || ((input) => runCardOriginAnnouncementProof({ profileRoot: this.peerProfileRoot, timeoutMs: this.peerTimeoutMs, ...input }));
    this.now = now; this.appendQueue = Promise.resolve();
  }

  list() { return { schemaVersion: PROPOSAL_REVIEW_LIST_SCHEMA, ...project(this.events), decisions: [...DECISIONS], truthBoundary: "Review and decision history is append-only. Only explicit human approval may create one origin Card head; all other decisions leave the proposal unminted." }; }

  async appendEvent({ type, proposalCardId, actor, payload }) {
    let result;
    const operation = async () => {
      const unsigned = { schemaVersion: PROPOSAL_REVIEW_EVENT_SCHEMA, eventId: `avatar-proposal:${type}:${randomBytes(12).toString("hex")}`, sequence: this.events.length + 1, previousEventHash: this.events.at(-1)?.eventHash || null, ts: this.now(), type, proposalCardId, actor: clone(actor), payload: clone(payload) };
      result = { ...unsigned, eventHash: sha256(unsigned) };
      await mkdir(this.root, { recursive: true });
      await appendFile(this.eventTape, `${JSON.stringify(result)}\n`, { encoding: "utf8", mode: 0o600 });
      this.events.push(result);
    };
    this.appendQueue = this.appendQueue.then(operation, operation); await this.appendQueue; return clone(result);
  }

  resolveProposal(cardId) {
    const source = this.proposalSource();
    const cards = Array.isArray(source) ? source : source?.cards || [];
    const card = cards.find((candidate) => candidate?.id === cardId || candidate?.cardId === cardId);
    if (!card) throw typedError(`Proposal Card not found: ${cardId || "missing"}`, "proposal_card_not_found", 404);
    if (card.minted === true || card.lifecycleStatus !== "proposed_unminted") throw typedError("Only an unminted proposal may enter human review", "proposal_not_unminted", 409);
    return clone(card);
  }

  async review({ cardId, actor = {} } = {}) {
    const reviewer = human(actor);
    const card = this.resolveProposal(requireText(cardId, "cardId", 480));
    const openedAt = this.now();
    const reviewMaterial = { schemaVersion: PROPOSAL_REVIEW_SCHEMA, reviewId: `proposal-review:${randomBytes(16).toString("hex")}`, proposalCardId: card.id, proposalCardDigest: cardDigest(card), lifecycleStatus: card.lifecycleStatus, openedAt, reviewer, availableDecisions: [...DECISIONS], mintAuthority: "explicit_human_approve_only", sourceMutationAllowed: false, siblingProposalMutationAllowed: false, truthBoundary: "Opening review does not approve, mint, revise, reject, defer, publish, or announce this proposal." };
    const review = { ...reviewMaterial, reviewDigest: sha256(reviewMaterial) };
    await this.appendEvent({ type: "proposal.review.opened", proposalCardId: card.id, actor: reviewer, payload: { review } });
    return { ok: true, review, card };
  }

  reviewByDigest(reviewDigest) {
    const normalized = normalizeDigest(reviewDigest, "reviewDigest");
    const event = [...this.events].reverse().find((candidate) => candidate.type === "proposal.review.opened" && candidate.payload?.review?.reviewDigest === normalized);
    if (!event) throw typedError("Proposal review was not found", "proposal_review_not_found", 404);
    return clone(event.payload.review);
  }

  async decide({ cardId, reviewDigest, decision, actor = {}, rationale = "", revisionInstruction = "" } = {}) {
    const decider = human(actor);
    const selectedDecision = requireText(decision, "decision", 32).toLowerCase();
    if (!DECISIONS.includes(selectedDecision)) throw typedError(`decision must be one of ${DECISIONS.join(", ")}`);
    const review = this.reviewByDigest(reviewDigest);
    if (review.proposalCardId !== cardId) throw typedError("Review and proposal Card do not match", "proposal_review_card_mismatch", 409);
    if (this.events.some((event) => event.type === "proposal.decision.recorded" && event.payload?.decision?.reviewDigest === review.reviewDigest)) throw typedError("This exact review already has an append-only decision; open a new review for any later decision", "proposal_review_already_decided", 409);
    const card = this.resolveProposal(cardId);
    if (cardDigest(card) !== review.proposalCardDigest) throw typedError("Proposal Card changed after review; open a fresh review", "proposal_review_stale", 409);
    const decidedAt = this.now();
    const decisionMaterial = { schemaVersion: PROPOSAL_DECISION_SCHEMA, decisionId: `proposal-decision:${randomBytes(16).toString("hex")}`, reviewId: review.reviewId, reviewDigest: review.reviewDigest, proposalCardId: card.id, proposalCardDigest: review.proposalCardDigest, decision: selectedDecision, actor: decider, rationale: requireText(rationale || `${selectedDecision} selected by explicit human control`, "rationale", 2_000), revisionInstruction: selectedDecision === "revise" ? requireText(revisionInstruction, "revisionInstruction", 2_000) : null, decidedAt, explicitHumanControl: true, mintAuthorized: selectedDecision === "approve", truthBoundary: selectedDecision === "approve" ? "This explicit human approval authorizes one exact origin Card head; no sibling proposal is accepted or changed." : "This append-only human decision does not mint, publish, announce, or mutate the proposal Card." };
    const proposalDecision = { ...decisionMaterial, decisionDigest: sha256(decisionMaterial) };
    await this.appendEvent({ type: "proposal.decision.recorded", proposalCardId: card.id, actor: decider, payload: { decision: proposalDecision } });
    if (selectedDecision !== "approve") return { ok: true, state: `${selectedDecision}_unminted`, minted: false, card, review, decision: proposalDecision, resultCard: null };
    return this.mintApproved({ card, review, decision: proposalDecision });
  }

  async mintApproved({ card, review, decision }) {
    try {
      const mintedAt = this.now();
      const approved = withoutRecordDigests(card);
      Object.assign(approved, {
        revisionId: "minted-r1", cardRevisionId: "minted-r1", lifecycleStatus: "minted_origin_staged", status: "minted_origin_staged", proposed: false, minted: true, updatedAt: mintedAt,
        authority: { ...(approved.authority || {}), outputDisposition: "human_approved_mint", acceptanceAuthority: true, autoMint: false, mintMode: "human_explicit", approvedBy: clone(decision.actor) },
        mintApproval: { schemaVersion: "hapa.avatar-builder.proposal-mint-approval.v1", reviewId: review.reviewId, reviewDigest: review.reviewDigest, decisionId: decision.decisionId, decisionDigest: decision.decisionDigest, actor: clone(decision.actor), method: "explicit-human-proposal-review-control", approvedAt: decision.decidedAt }
      });
      approved.cardRecordDigest = sha256(approved); approved.recordDigest = approved.cardRecordDigest;
      const store = await this.readStore();
      const nextStore = { ...store, cards: [...(store.cards || []).filter((candidate) => candidate.id !== approved.id), approved], updatedAt: mintedAt };
      const staged = await this.origin.commitCardMint("tarot", approved, () => this.writeStore(nextStore));
      const eventId = staged.event?.event_id;
      const upload = eventId ? await this.origin.upload(this.uploadFetch, [eventId]) : { ok: false, sent: 0, acknowledged: 0, error: "origin_event_missing" };
      const origin = this.origin.statusForRecord("tarot", approved);
      const contentDigest = staged.event?.payload?.card?.content?.digest || origin.event?.payload?.card?.content?.digest || `sha256:${approved.cardRecordDigest}`;
      let catalog = null; let catalogSync = null; let catalogError = null;
      if (origin.durableAcknowledgement) {
        try { catalogSync = (await this.catalogClient.sync()) || null; catalog = (await this.catalogClient.status(origin.cardId, origin.revision)) || null; }
        catch (error) { catalogError = { code: error?.code || "catalog_subscriber_unavailable", message: error?.message || String(error) }; }
      }
      let peer = null; let peerError = null;
      if (origin.eventId && origin.eventDigest) {
        try { peer = await this.peerAnnouncer({ origin: { ...origin, contentDigest }, decisionDigest: decision.decisionDigest }); }
        catch (error) { peerError = { code: error?.code || "peer_announcement_failed", message: error?.message || String(error) }; }
      }
      const state = peer?.status === "passed" ? "peer_announced" : stateFor(origin, catalog);
      const resultCard = buildMintGateResultCard({ proposalCard: approved, review, decision, origin, catalog, peer, state, observedAt: this.now() });
      const completedStore = await this.readStore();
      await this.writeStore({ ...completedStore, cards: [...(completedStore.cards || []).filter((candidate) => candidate.id !== resultCard.id), resultCard], updatedAt: resultCard.createdAt });
      const result = { ok: true, schemaVersion: "hapa.avatar-builder.proposal-mint-result.v1", state, minted: true, card: approved, review, decision, origin, upload: upload || null, catalog, catalogSync, catalogError, peer, peerError, resultCard, truthBoundary: resultCard.mintGateResult.truthBoundary };
      await this.appendEvent({ type: "proposal.mint.completed", proposalCardId: card.id, actor: decision.actor, payload: { result } });
      return result;
    } catch (error) {
      const failure = { proposalCardId: card.id, reviewDigest: review.reviewDigest, decisionDigest: decision.decisionDigest, failedAt: this.now(), code: error?.code || "proposal_mint_failed", message: error?.message || String(error), decisionRemainsAppendOnly: true, mintCompletionRecorded: false };
      await this.appendEvent({ type: "proposal.mint.failed", proposalCardId: card.id, actor: decision.actor, payload: { failure } });
      throw error;
    }
  }
}

export async function openAvatarProposalReviewService(options = {}) {
  const root = path.resolve(options.root);
  let raw = "";
  try { raw = await readFile(path.join(root, "events.ndjson"), "utf8"); }
  catch (error) { if (error?.code !== "ENOENT") throw error; }
  return new AvatarProposalReviewService({ ...options, root, events: parseEvents(raw) });
}
