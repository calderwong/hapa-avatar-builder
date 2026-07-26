import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

import {
  HAPA_REFERENCE_CARD_SCHEMA,
  HAPA_REFERENCE_DECISION_SCHEMA,
  HAPA_REFERENCE_EDGE_SCHEMA,
  REFERENCE_EDGE_TYPES,
  REFERENCE_NODE_TYPES,
  normalizeHapaReferenceCard,
  normalizeHapaReferenceDecision,
  normalizeHapaReferenceEdge,
  projectPublicHapaReferenceCard,
  validateHapaReferenceCard
} from "../src/domain/hapa-reference-card.js";

const fixtureUrl = new URL("../fixtures/echo-reference-cards/valid-approved.json", import.meta.url);
const invalidFixtureUrl = new URL("../fixtures/echo-reference-cards/invalid-canon-without-approval.json", import.meta.url);
const schemaUrl = new URL("../docs/contracts/hapa-reference-card.v1.schema.json", import.meta.url);

async function fixture(url) {
  return JSON.parse(await fs.readFile(url, "utf8"));
}

test("Reference Card contract preserves evidence, interpretations, pointers, rights, and authority independently", async () => {
  const input = await fixture(fixtureUrl);
  const result = validateHapaReferenceCard(input);
  assert.equal(result.ok, true, result.errors.join(", "));
  assert.equal(result.card.schemaVersion, HAPA_REFERENCE_CARD_SCHEMA);
  assert.equal(result.card.occurrences[0].songId, "save-point");
  assert.equal(result.card.claims[1].kind, "inference");
  assert.equal(result.card.interpretations.length, 2);
  assert.equal(result.card.authority.reviewStatus, "approved");
  assert.equal(result.card.authority.canonStatus, "non-canon");
  assert.equal(result.card.rightsAndPrivacy.licenseStatus, "reference-only");
});

test("Reference Cards keep competing interpretations instead of collapsing them", async () => {
  const card = normalizeHapaReferenceCard(await fixture(fixtureUrl));
  assert.deepEqual(card.interpretations.map((item) => item.id), [
    "interpretation-save-point-memory",
    "interpretation-save-point-party"
  ]);
  assert.notEqual(card.interpretations[0].readingLayers.operationalMechanic, card.interpretations[1].readingLayers.operationalMechanic);
});

test("canon cannot be inferred from a candidate or approval-free card", async () => {
  const result = validateHapaReferenceCard(await fixture(invalidFixtureUrl));
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes("canon-requires-approved-review"));
  assert.ok(result.errors.includes("canonized-by"));
});

test("public projection fails closed for private clues and strips unresolved private work", async () => {
  const input = await fixture(fixtureUrl);
  const publicCard = projectPublicHapaReferenceCard(input);
  assert.ok(publicCard);
  assert.deepEqual(publicCard.unresolved, []);
  assert.equal(publicCard.provenance.model, "");

  input.rightsAndPrivacy.containsPrivateClues = true;
  assert.equal(projectPublicHapaReferenceCard(input), null);
});

test("graph ontology preserves direction, evidence, derivation, and human approval independently", () => {
  const edge = normalizeHapaReferenceEdge({
    fromId: "song:save-point",
    fromType: "song",
    toId: "reference:litrpg",
    toType: "reference-card",
    relationType: "imports-mechanic",
    direction: "directed",
    weight: 0.72,
    confidence: 0.68,
    evidenceClass: "comparative",
    status: "approved",
    support: {
      sharedSongIds: ["save-point"],
      sharedThemes: ["memory"],
      sharedMechanics: ["checkpoint"],
      reasonCodes: ["shared-mechanic"],
      lineProximity: [{ songId: "save-point", leftLine: 3, rightLine: 5, distance: 2 }],
      channelCount: 2
    },
    derived: true,
    humanApproved: true,
    provenance: { method: "human-reviewed-cross-corpus-comparison", decisionIds: ["decision-1"] }
  });
  assert.equal(edge.schemaVersion, HAPA_REFERENCE_EDGE_SCHEMA);
  assert.equal(edge.fromType, "song");
  assert.equal(edge.toType, "reference-card");
  assert.equal(edge.relationType, "imports-mechanic");
  assert.equal(edge.derived, true);
  assert.equal(edge.humanApproved, true);
  assert.deepEqual(edge.support.sharedMechanics, ["checkpoint"]);
  assert.ok(REFERENCE_NODE_TYPES.includes(edge.toType));
  assert.ok(REFERENCE_EDGE_TYPES.includes(edge.relationType));
});

test("append-only decisions retain target revision and supersession lineage", () => {
  const decision = normalizeHapaReferenceDecision({
    id: "decision-2",
    targetId: "reference:litrpg",
    targetRevisionId: "reference:litrpg:r3",
    action: "reweight",
    reason: "New direct lyric evidence narrows the comparative claim.",
    actor: "human-reviewer",
    authority: "reviewer",
    evidenceIds: ["claim-litrpg-direct"],
    supersedesDecisionId: "decision-1"
  });
  assert.equal(decision.schemaVersion, HAPA_REFERENCE_DECISION_SCHEMA);
  assert.equal(decision.targetRevisionId, "reference:litrpg:r3");
  assert.equal(decision.supersedesDecisionId, "decision-1");
});

test("machine-readable JSON Schema stays aligned with the executable ontology", async () => {
  const schema = await fixture(schemaUrl);
  const normalized = normalizeHapaReferenceCard(await fixture(fixtureUrl));
  assert.equal(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
  assert.equal(schema.properties.schemaVersion.const, HAPA_REFERENCE_CARD_SCHEMA);
  assert.deepEqual(schema.$defs.nodeType.enum, REFERENCE_NODE_TYPES);
  assert.deepEqual(schema.$defs.edgeType.enum, REFERENCE_EDGE_TYPES);
  for (const field of schema.required) {
    assert.ok(Object.hasOwn(normalized, field), `normalized card is missing required schema field ${field}`);
  }
});
