import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AvatarWisdomCouncilService,
  openAvatarWisdomCouncilService,
  verifyWisdomCouncilEvents,
} from "../server/avatar-wisdom-council-service.mjs";
import { sha256 } from "../server/stargate-p2p-canonical.mjs";

const foundationUrl = new URL("../fixtures/build-week/wisdom-foundation.json", import.meta.url);

function packetFixture() {
  const evidence = [0, 1, 2, 3].map((position) => ({
    position,
    sourceRef: { cardId: `hapa-card:demo:${position}`, cardRevisionId: "r1", cardCoreKey: sha256(`core-${position}`) },
    selectedEvidence: { title: `Demo Card ${position + 1}`, summary: `Exact selected evidence ${position + 1}` },
    selectedEvidenceDigest: sha256(`evidence-${position}`),
  }));
  const unsigned = { packetId: "context-packet:test", evidence };
  return { ...unsigned, packetDigest: sha256(unsigned) };
}

function providerFixture() {
  return {
    providerId: "ollama-local",
    providerVersion: "test-0.24.0",
    adapterId: "hapa-avatar-builder-ollama-wisdom-council",
    adapterVersion: "1.0.0",
    endpoint: "127.0.0.1:11434",
    endpointOrigin: "http://127.0.0.1:11434",
    modelId: "qwen3.5:2b",
    modelVersion: `sha256:${"a".repeat(64)}`,
  };
}

function completedSeat({ wisdomCard, role, packet, ordinal }) {
  const output = {
    claim: `Independent ${role} claim ${ordinal}`,
    scopeTargets: [`scope-${ordinal}`],
    goals: [`goal-${ordinal}`],
    evidenceUsed: [{ position: ordinal % packet.evidence.length, observation: `observation-${ordinal}` }],
    evidenceNeeded: [`needed-${ordinal}`],
    diagnosis: `diagnosis-${ordinal}`,
    scoreAnchor: `anchor-${ordinal}`,
    comparison: `comparison-${ordinal}`,
    boundedAction: `action-${ordinal}`,
    preserve: `preserve-${ordinal}`,
    successTest: `success-${ordinal}`,
    confidence: 0.7 + ordinal / 100,
    guardrailRisk: { present: true, guardrail: `protected-value-${ordinal}`, explanation: `tradeoff-${ordinal}` },
  };
  const invocationId = `invocation:${role}:${ordinal}`;
  const unsigned = {
    seatId: `seat:${role}:${ordinal}`,
    ordinal: ordinal + 1,
    role,
    status: "completed",
    cardId: wisdomCard.cardId,
    cardRevisionId: wisdomCard.cardRevisionId,
    cardRecordDigest: wisdomCard.cardRecordDigest,
    invocationId,
    provider: { ...providerFixture(), endpointOrigin: undefined },
    participant: { participantType: "provider-model", avatarParticipation: "not-invoked" },
    prompt: { digest: sha256(`prompt-${ordinal}`), exactText: `Only ${wisdomCard.cardId}; no sibling cards or outputs.` },
    output,
    outputDigest: sha256(output),
    responseDigest: sha256(`response-${ordinal}`),
    usage: { promptEvalCount: 100, evalCount: 40, totalDurationNs: 1000 },
    peerBlindness: { schemaVersion: "hapa.card-advocate-peer-blind.v1", visibleCardIds: [wisdomCard.cardId], peerOutputDigestsVisible: [], inputDigest: sha256({ packetDigest: packet.packetDigest, cardId: wisdomCard.cardId, role }), disclosure: "one-card-input-only-no-peer-output-before-council-seal" },
    authority: { proposalOnly: true, sourceMutation: false, acceptanceAuthority: false, canonMutation: false, autoMint: false },
  };
  delete unsigned.provider.endpointOrigin;
  return { ...unsigned, recordDigest: sha256(unsigned) };
}

async function setup(t, seatInvoker = async ({ wisdomCard, role, packet }) => completedSeat({ wisdomCard, role, packet, ordinal: ["primary", "companion", "sentinel"].indexOf(role) })) {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-wisdom-council-"));
  const foundation = JSON.parse(await readFile(foundationUrl, "utf8"));
  t.after(() => rm(root, { recursive: true, force: true }));
  return { root, foundation, service: new AvatarWisdomCouncilService({ root, foundation, now: () => "2026-07-19T00:00:00.000Z", receiptResolver: async () => providerFixture(), seatInvoker }) };
}

const actor = { actorId: "human:calder", actorType: "human", displayName: "Calder" };

test("three peer-blind seats seal atomically and preserve all five dissent classes", async (t) => {
  const { root, foundation, service } = await setup(t);
  const list = service.list();
  assert.equal(list.foundation.cards.length, 3);
  const packet = packetFixture();
  const result = await service.run({ packet, wisdomCardIds: list.foundation.cards.map((card) => card.cardId), instruction: "What should the Build Week demo preserve while increasing its visual force?", modelId: "qwen3.5:2b", actor });

  assert.equal(result.run.seal.sealed, true);
  assert.equal(result.run.seal.partialResultsAccepted, false);
  assert.equal(result.run.seatCount, 3);
  assert.deepEqual(result.run.roles, ["primary", "companion", "sentinel"]);
  assert.equal(result.run.concurrency.observedMaximumConcurrentSeats, 3);
  assert.ok(result.run.seats.every((seat) => seat.peerBlindness.visibleCardIds.length === 1 && seat.peerBlindness.visibleCardIds[0] === seat.cardId));
  assert.ok(result.run.seats.every((seat) => seat.peerBlindness.peerOutputDigestsVisible.length === 0 && seat.participant.avatarParticipation === "not-invoked"));
  assert.deepEqual(result.run.dissent.summary.countsByCategory, { scope: 3, goal: 3, evidence: 3, mechanism: 3, "true-tradeoff": 3 });
  assert.equal(result.run.dissent.summary.averagedVerdictProduced, false);
  assert.equal(result.run.dissent.summary.preferredActionSelected, false);
  assert.equal(result.run.dissent.creativeDirectorQueue.length, 3);
  assert.ok(result.run.dissent.disagreements.filter((item) => item.category === "true-tradeoff").every((item) => item.resolutionRoute === "human:creative-director"));
  for (const card of Object.values(result.cards)) {
    assert.equal(card.minted, false);
    assert.equal(card.lifecycleStatus, "proposed_unminted");
    assert.equal(card.authority.autoMint, false);
    assert.match(card.imageUri, /^data:image\/svg\+xml/);
  }

  const reopened = await openAvatarWisdomCouncilService({ root, foundation });
  const replay = reopened.list();
  assert.equal(replay.runs.length, 1);
  assert.equal(replay.cards.length, 2);
  assert.equal(replay.failures.length, 0);
  assert.equal(verifyWisdomCouncilEvents(reopened.events), true);
});

test("a failed seat appends no partial run, synthesis, Lesson Card, or Result Card", async (t) => {
  const seatInvoker = async ({ wisdomCard, role, packet }) => {
    if (role === "companion") throw Object.assign(new Error("simulated provider fault"), { code: "provider_fault" });
    return completedSeat({ wisdomCard, role, packet, ordinal: ["primary", "companion", "sentinel"].indexOf(role) });
  };
  const { service } = await setup(t, seatInvoker);
  const ids = service.list().foundation.cards.map((card) => card.cardId);
  await assert.rejects(service.run({ packet: packetFixture(), wisdomCardIds: ids, instruction: "Test atomic failure", modelId: "qwen3.5:2b", actor }), (error) => error.code === "wisdom_council_incomplete");
  const replay = service.list();
  assert.equal(replay.runs.length, 0);
  assert.equal(replay.cards.length, 0);
  assert.equal(replay.failures.length, 1);
  assert.equal(replay.failures[0].partialSeatOutputsAppended, false);
  assert.equal(replay.failures[0].synthesisAppended, false);
  assert.equal(replay.failures[0].resultCardsAppended, false);
});

test("one Wisdom Card is valid and cannot fabricate pairwise dissent", async (t) => {
  const { service } = await setup(t);
  const [card] = service.list().foundation.cards;
  const result = await service.run({ packet: packetFixture(), wisdomCardIds: [card.cardId], instruction: "Provide one independent lens", modelId: "qwen3.5:2b", actor });
  assert.equal(result.run.seatCount, 1);
  assert.equal(result.run.dissent.summary.pairCount, 0);
  assert.equal(result.run.dissent.summary.disagreementCount, 0);
  assert.equal(result.run.dissent.creativeDirectorQueue.length, 0);
});
