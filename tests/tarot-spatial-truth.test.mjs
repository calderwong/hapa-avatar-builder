import test from "node:test";
import assert from "node:assert/strict";

import {
  buildTarotSpatialTruthResultCard,
  projectTarotSpatialTruthEvent,
  publicSpatialTruthShowcaseEvents,
  TAROT_SPATIAL_TRUTH_TYPES
} from "../src/domain/tarot-spatial-truth.js";

test("all supported spatial families require a verified, attributable, digested event", () => {
  const events = publicSpatialTruthShowcaseEvents();
  assert.equal(events.length, Object.keys(TAROT_SPATIAL_TRUTH_TYPES).length);
  const projected = events.map(projectTarotSpatialTruthEvent);
  assert.equal(projected.every((item) => item.ok), true);
  assert.deepEqual(new Set(projected.map((item) => item.cue.family)), new Set([
    "placement", "gate", "peer", "communication", "consent", "comment", "build", "council", "proposal", "mint"
  ]));
});

test("unverified, unattributed, undigested, and unsupported events never receive a visual cue", () => {
  const valid = publicSpatialTruthShowcaseEvents()[0];
  const cases = [
    [{ ...valid, truthStatus: "proposed_unminted" }, "event_not_verified"],
    [{ ...valid, eventId: "" }, "missing_event_identity"],
    [{ ...valid, sourceNode: "" }, "missing_source_identity"],
    [{ ...valid, payloadDigest: "not-a-digest" }, "invalid_payload_digest"],
    [{ ...valid, observedAt: "someday" }, "invalid_observation_time"],
    [{ ...valid, type: "mint.maybe" }, "unsupported_event_type"]
  ];
  cases.forEach(([input, reason]) => {
    const result = projectTarotSpatialTruthEvent(input);
    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.equal(result.cue, null);
  });
});

test("Spatial Truth Result Card seals accepted receipts and reports rejected attempts without mint authority", async () => {
  const accepted = publicSpatialTruthShowcaseEvents().slice(0, 4).map(projectTarotSpatialTruthEvent);
  const rejected = [projectTarotSpatialTruthEvent({ type: "card.minted", truthStatus: "planned_requirement" })];
  const card = await buildTarotSpatialTruthResultCard({ accepted, rejected, gateCommitment: "sha256:public-fixture-gate" });
  assert.match(card.id, /^hapa-card:result:spatial-truth:[a-f0-9]{40}$/);
  assert.match(card.cardRecordDigest, /^[a-f0-9]{64}$/);
  assert.equal(card.truthState, "proposed_unminted");
  assert.equal(card.spatialTruth.accepted.length, 4);
  assert.equal(card.spatialTruth.rejected.length, 1);
  assert.match(card.spatialTruth.truthBoundary, /Visuals are projections, not authority/);
});
