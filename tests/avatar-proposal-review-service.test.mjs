import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  openAvatarProposalReviewService,
  verifyProposalReviewEvents
} from "../server/avatar-proposal-review-service.mjs";
import { sha256 } from "../server/stargate-p2p-canonical.mjs";

function fixtureProposal() {
  const card = {
    id: "hapa-card:wisdom-council-result:demo",
    cardId: "hapa-card:wisdom-council-result:demo",
    title: "Three voices, no false consensus",
    summary: "Dissent remains visible.",
    cardType: "result_experience",
    tarotMainType: "wisdom_council_result_card",
    lifecycleStatus: "proposed_unminted",
    status: "proposed_unminted",
    proposed: true,
    minted: false,
    authority: { proposalOnly: true, autoMint: false },
    createdAt: "2026-07-19T00:00:00.000Z"
  };
  card.cardRecordDigest = sha256(card);
  card.recordDigest = card.cardRecordDigest;
  return card;
}

function fakeOrigin() {
  let record = null;
  let event = null;
  let acknowledged = false;
  let commits = 0;
  return {
    get commits() { return commits; },
    async commitCardMint(_kind, next, writeSource) {
      commits += 1; record = structuredClone(next);
      event = { event_id: "origin-event-1", payload: { card: { content: { digest: `sha256:${next.cardRecordDigest}` } } } };
      await writeSource();
      return { ok: true, outcome: "origin_staged", event };
    },
    async upload() { acknowledged = true; return { ok: true, sent: 1, acknowledged: 1 }; },
    statusForRecord() {
      return { cardId: "hapa-card:v1:avatar:wisdom-result", revision: 1, originSequence: 1, eventId: event?.event_id || null, eventDigest: event ? `sha256:${"d".repeat(64)}` : null, state: acknowledged ? "acknowledged" : "pending", durableAcknowledgement: acknowledged, ledgerPosition: acknowledged ? 9 : null, card: record };
    }
  };
}

test("revise, reject, defer, and approve are append-only while only approval mints", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-proposal-review-"));
  const proposal = fixtureProposal();
  const origin = fakeOrigin();
  let store = { cards: [] };
  const service = await openAvatarProposalReviewService({
    root,
    proposalSource: () => [proposal],
    origin,
    readStore: async () => structuredClone(store),
    writeStore: async (next) => { store = structuredClone(next); },
    catalogClient: {
      async sync() { return { ok: true }; },
      async status() { return { state: "catalog_indexed", indexed_revision: 1, subscriber_cursor: 9, commerce: { source_only: true, sellable: false } }; }
    },
    peerAnnouncer: async ({ origin: announced }) => ({
      status: "passed", proofId: "proof-1", proofDigest: "e".repeat(64),
      isolation: { distinctStableNodeIds: true }, transport: { hyperswarmConnectionObserved: true, noiseEncryptedStreamObserved: true },
      announcement: { exactReceiverCopyStored: true }, effects: { peerAnnounced: true }, card: announced
    })
  });
  const actor = { actorId: "calder", actorType: "human", displayName: "Calder" };

  for (const decision of ["revise", "reject", "defer"]) {
    const opened = await service.review({ cardId: proposal.id, actor });
    const result = await service.decide({ cardId: proposal.id, reviewDigest: opened.review.reviewDigest, decision, actor, rationale: `${decision} with visible reason`, revisionInstruction: decision === "revise" ? "Preserve dissent and tighten the success test." : "" });
    assert.equal(result.minted, false);
    assert.equal(result.resultCard, null);
    assert.equal(origin.commits, 0);
  }

  const opened = await service.review({ cardId: proposal.id, actor });
  const approved = await service.decide({ cardId: proposal.id, reviewDigest: opened.review.reviewDigest, decision: "approve", actor, rationale: "I approve this exact proposal for one origin Card head." });
  assert.equal(origin.commits, 1);
  assert.equal(approved.minted, true);
  assert.equal(approved.state, "peer_announced");
  assert.equal(approved.card.mintApproval.reviewDigest, opened.review.reviewDigest);
  assert.equal(approved.resultCard.title, "Mint Gate Result");
  assert.equal(approved.resultCard.mintGateResult.peer.exactReceiverCopyStored, true);
  assert.equal(approved.resultCard.mintGateResult.boundaries.onlyHumanApprovalMints, true);
  assert.equal(approved.resultCard.mintGateResult.boundaries.secondMintedCardHeadCreated, false);
  assert.equal(store.cards.filter((card) => card.minted === true).length, 1);
  assert.equal(service.list().decisions.length, 4);
  assert.equal(verifyProposalReviewEvents(service.events), true);
});

test("a stale or already decided review fails closed", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-proposal-review-stale-"));
  const proposal = fixtureProposal();
  const origin = fakeOrigin();
  let store = { cards: [] };
  const service = await openAvatarProposalReviewService({ root, proposalSource: () => [proposal], origin, readStore: async () => store, writeStore: async (next) => { store = next; }, peerAnnouncer: async () => { throw new Error("must not run"); } });
  const actor = { actorId: "human-1", actorType: "human", displayName: "Human" };
  const opened = await service.review({ cardId: proposal.id, actor });
  await service.decide({ cardId: proposal.id, reviewDigest: opened.review.reviewDigest, decision: "defer", actor, rationale: "Wait for better evidence." });
  await assert.rejects(() => service.decide({ cardId: proposal.id, reviewDigest: opened.review.reviewDigest, decision: "approve", actor, rationale: "Changed my mind." }), (error) => error.code === "proposal_review_already_decided");
  assert.equal(origin.commits, 0);
});
