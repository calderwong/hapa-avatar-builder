export const TAROT_KREA2_REQUEST_SCHEMA = "hapa.krea2_identity_edit.request.v2";
export const TAROT_KREA2_RESULT_CARD_SCHEMA = "hapa.tarot-krea2-edit-result-card.v1";

export const TAROT_KREA2_FEATURED_PRESET_IDS = Object.freeze([
  "avatar_builder_portrait_quality",
  "avatar_builder_restyle_quality",
  "avatar_builder_character_quality",
  "avatar_builder_outfit_change_quality",
  "avatar_builder_pose_activity_quality",
  "comic_panel_restyle_quality",
  "avatar_builder_two_character_first_insert",
  "avatar_builder_two_character_preserving_insert"
]);

export function enabledTarotKrea2Presets(catalog = {}) {
  return (Array.isArray(catalog.presets) ? catalog.presets : []).filter((preset) => preset?.enabled);
}

export function chooseTarotKrea2Preset(catalog = {}, currentPresetId = "") {
  const enabled = enabledTarotKrea2Presets(catalog);
  if (enabled.some((preset) => preset.id === currentPresetId)) return currentPresetId;
  const featured = TAROT_KREA2_FEATURED_PRESET_IDS.find((id) => enabled.some((preset) => preset.id === id));
  return featured || (enabled.some((preset) => preset.id === catalog.default_preset) ? catalog.default_preset : enabled[0]?.id || "");
}

export function tarotKrea2PresetGroups(catalog = {}) {
  const enabled = enabledTarotKrea2Presets(catalog);
  const featuredIds = new Set(TAROT_KREA2_FEATURED_PRESET_IDS);
  return {
    featured: enabled.filter((preset) => featuredIds.has(preset.id)),
    other: enabled.filter((preset) => !featuredIds.has(preset.id))
  };
}

export function tarotKrea2AssetReference(asset = null) {
  if (!asset?.asset_id || !asset?.sha256) return null;
  return {
    asset_id: String(asset.asset_id),
    sha256: String(asset.sha256),
    media_type: String(asset.media_type || "image/png"),
    width: Number(asset.width || 0),
    height: Number(asset.height || 0)
  };
}

export function buildTarotKrea2EditRequest({
  sourceAsset,
  subjectAsset = null,
  instruction,
  preset,
  seed = 42,
  avatarId = "local-operator",
  sourceCard = null,
  subjectCard = null,
  requestId,
  consentEventId,
  realPerson = false
} = {}) {
  const source = tarotKrea2AssetReference(sourceAsset);
  const subject = tarotKrea2AssetReference(subjectAsset);
  const prompt = String(instruction || "").trim();
  const presetId = String(preset || "").trim();
  const cleanRequestId = String(requestId || "").trim();
  const cleanConsentId = String(consentEventId || "").trim();
  if (!source) throw new Error("Krea 2 requires a source image asset.");
  if (!prompt) throw new Error("Krea 2 requires a bounded edit instruction.");
  if (!presetId) throw new Error("Choose a Krea 2 edit preset.");
  if (!cleanRequestId || !cleanConsentId) throw new Error("Krea 2 request and consent event IDs are required.");

  return {
    schema: TAROT_KREA2_REQUEST_SCHEMA,
    source_image: source,
    subject_image: subject,
    instruction: prompt,
    preset: presetId,
    seed: Math.max(0, Math.round(Number(seed) || 0)),
    idempotency_key: `hapa-avatar-builder:tarot-draw:${cleanRequestId}`,
    client_context: {
      app_id: "hapa-avatar-builder-tarot-draw",
      request_id: cleanRequestId,
      flow_id: `tarot-krea2:${sourceCard?.id || "selected-card"}`,
      return_to: `card:${sourceCard?.id || "krea2-candidate"}`
    },
    use_assertion: {
      basis: "self_or_subject_consented",
      asserted_by: String(avatarId || "local-operator"),
      purpose: `Local Tarot Draw image proposal: ${prompt}`,
      real_person: Boolean(realPerson),
      minor: false,
      sexual_context: false,
      deceptive_presentation: false,
      ai_disclosure_acknowledged: true,
      event_id: cleanConsentId
    },
    hapa_context: {
      source_card: sourceCard?.id ? {
        card_id: String(sourceCard.id),
        revision_id: String(sourceCard.revisionId || sourceCard.cardRevisionId || sourceCard.revision || "runtime-projection"),
        record_digest: String(sourceCard.recordDigest || sourceCard.digest || source.sha256),
        origin_node_id: String(sourceCard.originNodeId || sourceCard.sourceNode || "hapa-avatar-builder")
      } : undefined,
      subject_card: subjectCard?.id ? {
        card_id: String(subjectCard.id),
        revision_id: String(subjectCard.revisionId || subjectCard.cardRevisionId || subjectCard.revision || "runtime-projection"),
        record_digest: String(subjectCard.recordDigest || subjectCard.digest || subject?.sha256 || ""),
        origin_node_id: String(subjectCard.originNodeId || subjectCard.sourceNode || "hapa-avatar-builder")
      } : null,
      session_id: `tarot-draw:${sourceCard?.id || "runtime"}`,
      session_event_id: cleanRequestId,
      formation_digest: source.sha256,
      consent_event_id: cleanConsentId,
      gate_id: "tarot-krea2-demo",
      timecode_ms: 0,
      return_card_id: `krea2-candidate-${cleanRequestId}`
    }
  };
}

export function buildTarotKrea2ResultCard({ task = {}, sourceCard = null, subjectCard = null, preset = null, instruction = "" } = {}) {
  const artifact = (task.artifacts || []).find((item) => item?.uri && item?.media_type?.startsWith("image/")) || (task.artifacts || []).find((item) => item?.uri);
  if (!task.task_id || !artifact?.uri) return null;
  const title = sourceCard?.title || sourceCard?.name || "Selected Card";
  const presetLabel = preset?.label || task.provenance?.preset || "Krea 2 Edit";
  const createdAt = new Date().toISOString();
  return {
    schemaVersion: TAROT_KREA2_RESULT_CARD_SCHEMA,
    id: `tarot-krea2-${String(task.task_id).replace(/[^a-zA-Z0-9_-]/g, "-")}`,
    title: `${title} / ${presetLabel}`,
    subtitle: "Krea 2 / Flux proposal · human review required",
    archetype: "Identity-aware Image Edit",
    meaning: String(instruction || "A local Krea 2 image-edit proposal created from a selected Tarot visual."),
    summary: `Generated from ${title} with ${presetLabel}. The source Card is unchanged.`,
    sourceKind: "tarot-krea2-image-edit",
    kind: "tarot-krea2-image-edit",
    cardType: "reference_card",
    tarotMainType: "krea2_image_edit_proposal",
    status: "draft",
    highResImageUri: artifact.uri,
    imageUri: artifact.uri,
    posterUri: artifact.uri,
    keywords: ["krea2", "flux", "image-edit", "proposal", "human-review"],
    tags: ["tarot-krea2-image-edit", preset?.id || task.provenance?.preset || "krea2-edit", "unminted"],
    assets: [{
      id: artifact.asset_id || `${task.task_id}-output`,
      type: "image",
      mimeType: artifact.media_type || "image/png",
      uri: artifact.uri,
      source: "hapa-krea2-identity-node",
      tags: ["krea2", "generated-proposal"],
      metadata: {
        tarotMediaRole: "primary_image",
        sha256: artifact.sha256 || "",
        taskId: task.task_id,
        preset: preset?.id || task.provenance?.preset || ""
      }
    }],
    enrichment: {
      status: "proposal",
      method: "hapa-krea2-identity-node",
      media: {
        krea2Edit: {
          schemaVersion: "hapa.tarot-krea2-edit.v1",
          taskId: task.task_id,
          preset: preset?.id || task.provenance?.preset || "",
          presetLabel,
          instruction: String(instruction || ""),
          sourceCardId: sourceCard?.id || "",
          subjectCardId: subjectCard?.id || "",
          artifactId: artifact.asset_id || "",
          artifactSha256: artifact.sha256 || "",
          identityTruth: false,
          humanReviewRequired: true
        }
      }
    },
    lineage: {
      source: "Hapa Krea 2 Identity Node via Avatar Builder Tarot Draw",
      sourceCardId: sourceCard?.id || "",
      subjectCardId: subjectCard?.id || "",
      taskId: task.task_id,
      generatedOutputIsIdentityTruth: false,
      sourceCardUnchanged: true
    },
    createdAt,
    updatedAt: createdAt
  };
}
