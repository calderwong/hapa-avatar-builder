import test from "node:test";
import assert from "node:assert/strict";
import {
  TAROT_KREA2_REQUEST_SCHEMA,
  buildTarotKrea2EditRequest,
  buildTarotKrea2ResultCard,
  chooseTarotKrea2Preset,
  tarotKrea2PresetGroups,
} from "../src/domain/tarot-krea2-edit.js";

const digest = "a".repeat(64);

test("Tarot Krea 2 promotes this week's Avatar Builder presets ahead of the synthetic node default", () => {
  const catalog = {
    default_preset: "build_week_fast",
    presets: [
      { id: "build_week_fast", label: "Build Week Fast", enabled: true },
      { id: "avatar_builder_portrait_quality", label: "Avatar Builder Portrait Quality", enabled: true },
      { id: "raw_removal", label: "Raw Removal", enabled: false },
    ]
  };
  assert.equal(chooseTarotKrea2Preset(catalog), "avatar_builder_portrait_quality");
  const groups = tarotKrea2PresetGroups(catalog);
  assert.deepEqual(groups.featured.map((preset) => preset.id), ["avatar_builder_portrait_quality"]);
  assert.deepEqual(groups.other.map((preset) => preset.id), ["build_week_fast"]);
});

test("Tarot Krea 2 request preserves ordered references, consent event, and Card context", () => {
  const request = buildTarotKrea2EditRequest({
    sourceAsset: { asset_id: `sha256:${digest}`, sha256: digest, media_type: "image/png", width: 1152, height: 768 },
    subjectAsset: { asset_id: `sha256:${"b".repeat(64)}`, sha256: "b".repeat(64), media_type: "image/png", width: 768, height: 1152 },
    instruction: "Insert Red into the open left side while preserving the scene.",
    preset: "avatar_builder_two_character_first_insert",
    seed: 77,
    avatarId: "calder",
    sourceCard: { id: "scene-card", revision: 3 },
    subjectCard: { id: "red-card", revision: 8 },
    requestId: "request-1",
    consentEventId: "consent-1",
    realPerson: false,
  });
  assert.equal(request.schema, TAROT_KREA2_REQUEST_SCHEMA);
  assert.equal(request.source_image.sha256, digest);
  assert.equal(request.subject_image.sha256, "b".repeat(64));
  assert.equal(request.hapa_context.source_card.card_id, "scene-card");
  assert.equal(request.hapa_context.subject_card.card_id, "red-card");
  assert.equal(request.use_assertion.event_id, request.hapa_context.consent_event_id);
  assert.equal(request.client_context.app_id, "hapa-avatar-builder-tarot-draw");
});

test("successful Krea task becomes an unminted result Card without replacing its source", () => {
  const card = buildTarotKrea2ResultCard({
    task: {
      task_id: "kidtask_demo",
      artifacts: [{ asset_id: `sha256:${digest}`, sha256: digest, media_type: "image/png", uri: `/api/tarot/krea2/assets/${encodeURIComponent(`sha256:${digest}`)}/content` }],
      provenance: { preset: "avatar_builder_portrait_quality" }
    },
    sourceCard: { id: "red-card", title: "Red" },
    preset: { id: "avatar_builder_portrait_quality", label: "Avatar Builder Portrait Quality" },
    instruction: "Restage as a Tarot portrait."
  });
  assert.equal(card.status, "draft");
  assert.equal(card.lineage.sourceCardId, "red-card");
  assert.equal(card.lineage.sourceCardUnchanged, true);
  assert.equal(card.enrichment.media.krea2Edit.identityTruth, false);
  assert.match(card.subtitle, /human review required/i);
});
