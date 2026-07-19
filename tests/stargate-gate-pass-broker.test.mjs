import assert from "node:assert/strict";
import test from "node:test";
import { StargateGatePassBroker } from "../server/stargate-gate-pass-broker.mjs";

test("Gate Pass request is explicit, transient, Catalog-independent, and never implies Join", () => {
  let now = Date.parse("2026-07-18T20:00:00.000Z");
  const broker = new StargateGatePassBroker({ ttlMs: 60_000, now: () => now });
  assert.throws(() => broker.request({ cardId: "hapa-card:v1:a:b", revision: 2, actorId: "calder" }), /Explicit receiving-node consent/);
  const receipt = broker.request({ cardId: "hapa-card:v1:a:b", revision: 2, actorId: "calder", consent: true, formationCommitment: "formation-safe", contextCommitment: "context-safe" });
  assert.equal(receipt.state, "awaiting_direct_peer_pass");
  assert.equal(receipt.delivery.catalogRequired, false);
  assert.equal(receipt.delivery.transportStarted, false);
  assert.deepEqual(receipt.pass, { present: false, verified: false, persisted: false });
  assert.equal(receipt.join.allowed, false);
  assert.equal(receipt.effects.p2p_joined, false);
  assert.deepEqual(broker.status(receipt.requestId), receipt);
  now += 61_000;
  assert.throws(() => broker.status(receipt.requestId), /unavailable or expired/);
});
