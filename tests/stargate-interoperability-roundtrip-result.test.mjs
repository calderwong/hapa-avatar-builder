import assert from "node:assert/strict";
import test from "node:test";

import { buildStargateInteroperabilityRoundTripResult, STARGATE_INTEROPERABILITY_RESULT_SCHEMA } from "../src/domain/stargate-interoperability-roundtrip-result.js";

const cardId = "hapa-card:v1:aGFwYS1hdmF0YXItYnVpbGRlcg:dGFyb3Qtc3RhcmdhdGUtY29udGV4dDpkZW1v";
const exact = (extra = {}) => ({ cardId, revision: 1, ...extra });
const input = () => ({
  cardId,
  revision: 1,
  localCardId: "tarot-stargate-context:demo",
  origin: exact({ eventId: "event-1", ledgerPosition: 7 }),
  catalog: exact({ syncMode: "rebuild", subscriberCursor: 7 }),
  deck: exact({ deckId: "deck-1", deckRevisionId: "deck-r1", deckRevisionCreated: 1 }),
  returnResolution: exact({ connected: false }),
  peerResolution: exact({ joined: true, peerCount: 2, proofId: "proof-1", proofDigest: "abc123" }),
  observedAt: "2026-07-18T00:00:00.000Z"
});

test("presses a deterministic truth-bounded Result Card for one exact Card route", () => {
  const first = buildStargateInteroperabilityRoundTripResult(input());
  const second = buildStargateInteroperabilityRoundTripResult(input());
  assert.equal(first.id, second.id);
  assert.equal(first.stargateInteroperabilityResult.schemaVersion, STARGATE_INTEROPERABILITY_RESULT_SCHEMA);
  assert.equal(first.stargateInteroperabilityResult.route.length, 6);
  assert.equal(first.stargateInteroperabilityResult.invariants.oneStableCardIdentity, true);
  assert.equal(first.stargateInteroperabilityResult.invariants.catalogRequiredForP2p, false);
  assert.equal(JSON.stringify(first).includes("gatePassToken"), false);
});

test("fails closed when any stage changes the Card ID or revision", () => {
  const mismatched = input();
  mismatched.catalog.revision = 2;
  assert.throws(() => buildStargateInteroperabilityRoundTripResult(mismatched), /Catalog projection did not preserve/);
});

test("requires a disconnected return and observed two-peer arrival", () => {
  const connected = input();
  connected.returnResolution.connected = true;
  assert.throws(() => buildStargateInteroperabilityRoundTripResult(connected), /must be disconnected/);
  const noPeer = input();
  noPeer.peerResolution.joined = false;
  assert.throws(() => buildStargateInteroperabilityRoundTripResult(noPeer), /Two-peer arrival/);
});
