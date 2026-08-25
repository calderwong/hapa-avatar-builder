// Avatar Likeness Director Cast (L5) — the Director consumption layer.
//
// Standing guardrail: acceptance is the boundary; likeness is the placement.
// The Director never infers Avatar identity from a raw likeness score, a
// description, a palette, or a prior selection. A shot receives a typed cast
// only when a durable human decision receipt (origin "avatar-likeness",
// state "accepted") covers the placed media. Media without an accepted
// decision stays untyped — an honest state, not an error.

const text = (value) => String(value || "").trim();
const list = (value) => (Array.isArray(value) ? value.filter(Boolean) : []);
const finite = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const lower = (value) => text(value).toLowerCase();

export const AVATAR_LIKENESS_CAST_SCHEMA = "hapa.echo.avatar-likeness-cast.v1";
export const AVATAR_LIKENESS_VARIANT_ID = "avatar-likeness-v1";
export const LIKENESS_EVIDENCE_BASIS = "likeness-accepted-v1";
export const LIKENESS_DECISION_ORIGIN = "avatar-likeness";
export const LIKENESS_CAST_AUTHORITY = "human-likeness-acceptance-only";
export const LIKENESS_SEED_BASIS = "identity-class-samples-v1";
export const LIKENESS_CAST_NARRATIVE =
  "On-screen presence accepted through the Human Likeness gate; likeness similarity, not face identification.";

function maxText(value, length) {
  return text(value).slice(0, length);
}

function aliasCandidates(video = {}) {
  const hex = text(video.contentFingerprint || "").replace(/^sha256:/, "");
  const out = [
    text(video.humanVideoKey),
    text(video.videoKey),
    ...list(video.humanVideoAliases),
    ...list(video.identityAliases),
    ...list(video.aliases),
    video.id,
    video.videoId,
  ];
  if (hex) out.push(`fingerprint:${hex}`, `sha256:${hex}`, hex);
  if (video.uri) out.push(`uri:${text(video.uri)}`);
  if (video.sourcePath) out.push(`path:${text(video.sourcePath)}`);
  return [...new Set(out.filter(Boolean))];
}

/**
 * Map of alias -> accepted likeness decision. Only durable receipts with
 * origin "avatar-likeness" and state "accepted" enter the index; proposals
 * (unresolved verdicts) and rejections never cross the Director boundary.
 */
export function buildAvatarLikenessDecisionIndex(decisions = []) {
  const index = new Map();
  for (const decision of list(decisions)) {
    if (!decision || typeof decision !== "object") continue;
    if (text(decision.origin || decision.decisionOrigin) !== LIKENESS_DECISION_ORIGIN) continue;
    if (text(decision.state) !== "accepted") continue;
    const keys = aliasCandidates(decision).filter(Boolean);
    for (const key of keys) {
      const normalized = lower(key);
      if (!normalized) continue;
      if (!index.has(normalized)) index.set(normalized, decision);
    }
  }
  return index;
}

/** Resolve an accepted likeness decision for a video (or candidate) by any of its identities. */
export function avatarLikenessDecisionForVideo(index, video = {}) {
  if (!(index instanceof Map) || index.size === 0) return null;
  for (const alias of aliasCandidates(video)) {
    const decision = index.get(lower(alias));
    if (decision) return decision;
  }
  return null;
}

function mediaRecordIndex(records = []) {
  const index = new Map();
  for (const record of list(records)) {
    if (!record || typeof record !== "object") continue;
    for (const key of [text(record.id), text(record.uri), text(record.sourcePath), text(record.contentFingerprint)]) {
      const normalized = lower(key);
      if (normalized && !index.has(normalized)) index.set(normalized, record);
    }
  }
  return index;
}

function normalizedSeed(avatarId, asset = {}, record = null) {
  const contentHash = text(record?.contentFingerprint) || text(record?.sha256) || "";
  const retrievalHandle = text(record?.sourcePath) || text(record?.uri) || text(asset.fileName) || "";
  return {
    assetId: text(asset.assetId) || text(record?.id),
    avatarId,
    contentHash,
    retrievalHandle,
    fileName: text(asset.fileName) || text(record?.name) || "",
    weight: finite(asset.weight, 1),
    resolved: Boolean(record && (record.sourcePath || record.uri)),
  };
}

/**
 * Deterministic seed selection: the Avatar profile's identity-class source
 * assets (weight 1.0 = cleanest identity signal) in stored order, capped,
 * resolved against the media library. v1 ranks by class priority and stable
 * stored order — per-asset pixel ranking against the shot's signature is a
 * v2 extension (profiles store merged media, not per-asset signatures).
 */
export function selectLikenessSeedAssets(profile = null, mediaLibraryIndex = null, options = {}) {
  const max = Math.max(1, Math.min(8, Math.trunc(finite(options.max, 3) || 3)));
  const avatarId = text(options.avatarId || profile?.avatarId);
  const records = mediaLibraryIndex instanceof Map ? mediaLibraryIndex : mediaRecordIndex(mediaLibraryIndex);
  const seeds = [];
  for (const asset of list(profile?.sourceAssets)) {
    if (seeds.length >= max) break;
    if (finite(asset?.weight, 1) !== 1) continue; // identity class only
    if (text(asset?.status) && text(asset.status) !== "signed") continue;
    const assetId = text(asset.assetId);
    if (!assetId) continue;
    const record = records.get(lower(assetId)) || null;
    seeds.push(normalizedSeed(avatarId, asset, record));
  }
  return seeds;
}

function scoreReceiptFromDecision(decision = null) {
  const receipt = decision?.receipt && typeof decision.receipt === "object" ? decision.receipt : null;
  if (!receipt) return null;
  const gate = receipt.gate && typeof receipt.gate === "object" ? receipt.gate : null;
  const primary = receipt.primary && typeof receipt.primary === "object" ? receipt.primary : null;
  const secondary = receipt.secondary && typeof receipt.secondary === "object" ? receipt.secondary : null;
  return {
    schemaVersion: AVATAR_LIKENESS_CAST_SCHEMA,
    runId: maxText(receipt.runId, 160),
    verdict: maxText(receipt.verdict, 40),
    reasons: list(receipt.reasons).map((value) => maxText(value, 80)).slice(0, 8),
    score: primary ? Number(finite(primary.score).toFixed(4)) : null,
    secondaryScore: secondary ? Number(finite(secondary.score).toFixed(4)) : null,
    gate: gate
      ? {
          assignedScore: Number(finite(gate.assignedScore).toFixed(4)),
          assignedMargin: Number(finite(gate.assignedMargin).toFixed(4)),
          secondaryScore: Number(finite(gate.secondaryScore).toFixed(4)),
        }
      : null,
    contentFingerprint: maxText(receipt.contentFingerprint, 80),
    staleSignature: Boolean(receipt.staleSignature),
    matchedAt: maxText(receipt.matchedAt, 80) || null,
  };
}

/**
 * Build the typed cast block for one placed media. Returns `{ cast, reason }`:
 * cast is null when the acceptance gate is not met (the honest untyped state)
 * and reason names why. Never throws on missing evidence.
 */
export function buildAvatarLikenessCast(context = {}) {
  const decision = context.decision || null;
  if (!decision) return { cast: null, reason: "no-accepted-likeness-decision" };
  if (text(decision.origin || decision.decisionOrigin) !== LIKENESS_DECISION_ORIGIN) {
    return { cast: null, reason: `decision-origin-not-${LIKENESS_DECISION_ORIGIN}` };
  }
  if (text(decision.state) !== "accepted") return { cast: null, reason: `decision-state-${text(decision.state)}` };
  const avatarId = text(decision.decisionAvatarId);
  if (!avatarId) return { cast: null, reason: "decision-has-no-avatar" };
  const avatar = context.avatars?.[avatarId] || context.avatar || null;
  const avatarName = text(decision.decisionAvatarName) || text(avatar?.name) || "";
  if (!avatar && !avatarName) return { cast: null, reason: `avatar-unresolvable:${avatarId}` };

  const profile = context.profiles?.[avatarId] || null;
  const mediaLibraryIndex = context.mediaLibraryIndex || null;
  const seeds = profile ? selectLikenessSeedAssets(profile, mediaLibraryIndex, { avatarId, max: context.maxSeedAssets ?? 3 }) : [];
  const seedBasis = profile ? LIKENESS_SEED_BASIS : "no-avatar-profile";
  const castAppearances = seeds.map((seed) => ({
    avatarId,
    seedAssetId: seed.assetId,
    retrievalHandle: seed.retrievalHandle,
    contentHash: seed.contentHash,
    presence: "on_screen",
    narrativeFunction: LIKENESS_CAST_NARRATIVE,
    evidenceBasis: LIKENESS_EVIDENCE_BASIS,
  }));

  const cast = {
    schemaVersion: AVATAR_LIKENESS_CAST_SCHEMA,
    evidenceBasis: LIKENESS_EVIDENCE_BASIS,
    authority: LIKENESS_CAST_AUTHORITY,
    truthStatus: "human-accepted-likeness-v1",
    cast: {
      avatarId,
      avatarName,
      castClass: "additional",
      presence: "on_screen",
      narrativeFunction: LIKENESS_CAST_NARRATIVE,
      profiled: Boolean(profile),
    },
    castAppearances,
    seedAssets: seeds,
    seedBasis,
    decision: {
      id: maxText(decision.id, 5_000),
      state: "accepted",
      revision: Math.max(1, Math.trunc(finite(decision.revision, 1))),
      actorId: maxText(decision.actorId, 180) || "local-human-operator",
      origin: LIKENESS_DECISION_ORIGIN,
      decidedAt: maxText(decision.updatedAt || decision.createdAt, 80) || null,
    },
    scoreReceipt: scoreReceiptFromDecision(decision),
  };
  return { cast, reason: "ok" };
}

/**
 * Attach typed casts onto Director candidates. Candidates without an
 * accepted decision are returned unchanged (no cast field) so the recast
 * engine and the audit can treat "untyped" as the default honest state.
 */
export function attachAvatarLikenessCast(candidates = [], context = {}) {
  const index = context.decisionIndex || buildAvatarLikenessDecisionIndex(context.decisions || []);
  return list(candidates).map((candidate) => {
    const syntheticVideo = {
      humanVideoKey: text(candidate.technicalIdentity),
      humanVideoAliases: list(candidate.humanAcceptedIdentity?.aliases),
      identityAliases: [],
      id: candidate.mediaLibraryId || candidate.id,
      uri: candidate.uri,
      sourcePath: candidate.sourcePath,
      contentFingerprint: candidate.sha256 || "",
    };
    const decision = avatarLikenessDecisionForVideo(index, syntheticVideo);
    if (!decision) return candidate;
    const { cast, reason } = buildAvatarLikenessCast({
      ...context,
      decisionIndex: index,
      decision,
      video: syntheticVideo,
      avatars: context.avatars,
    });
    if (!cast) return { ...candidate, avatarLikenessGap: reason };
    return { ...candidate, avatarLikeness: cast };
  });
}

function castLabelFor(candidate = {}, cast = null) {
  if (!cast) return "";
  const cardKind = text(candidate.media_card_kind || candidate.cardKind || "avatar");
  const label = cardKind === "avatar" ? "Avatar Card" : text(cardKind) || "Media";
  return `${label} | ${text(cast.cast?.avatarName) || cast.cast?.avatarId || "Unknown Avatar"}`;
}

/**
 * After the recast engine places candidates, inject the typed cast into each
 * media-bearing shot's decision evidence. Shots whose candidate carried a
// cast get `decision_evidence.avatarLikeness` + a display `media_cast_label`
 * (the EDL upgrade from "Avatar Card | untyped" to "Avatar Card | <name>").
 * Untyped shots are left exactly as the engine produced them.
 */
export function injectAvatarLikenessCastIntoVariant(variant = {}, candidates = []) {
  // The recast engine writes `media_id` from candidate.mediaLibraryId but
  // keeps candidate.id in decision_evidence, so key both identifiers.
  const castByKey = new Map();
  const labelByKey = new Map();
  for (const candidate of list(candidates)) {
    if (!candidate.avatarLikeness) continue;
    const label = castLabelFor(candidate, candidate.avatarLikeness);
    for (const key of [candidate.id, candidate.mediaLibraryId]) {
      const normalized = String(key || "");
      if (!normalized) continue;
      if (!castByKey.has(normalized)) castByKey.set(normalized, candidate.avatarLikeness);
      if (label && !labelByKey.has(normalized)) labelByKey.set(normalized, label);
    }
  }
  const timeline = list(variant.timeline).map((shot) => {
    const keys = [shot?.media_id, shot?.decision_evidence?.candidateId].map((value) => String(value || ""));
    const cast = keys.map((key) => castByKey.get(key)).find(Boolean) || null;
    if (!cast) return shot;
    const label = keys.map((key) => labelByKey.get(key)).find(Boolean) || "";
    return {
      ...shot,
      ...(label ? { media_cast_label: label } : {}),
      decision_evidence: {
        ...(shot.decision_evidence || {}),
        avatarLikeness: cast,
      },
    };
  });
  const mediaShots = timeline.filter((shot) => shot?.media_id && shot.media_id !== "none" && shot.media_uri);
  const typedShots = timeline.filter((shot) => shot.decision_evidence?.avatarLikeness);
  const byAvatar = {};
  for (const shot of typedShots) {
    const avatarId = text(shot.decision_evidence.avatarLikeness.cast?.avatarId);
    if (avatarId) byAvatar[avatarId] = (byAvatar[avatarId] || 0) + 1;
  }
  return {
    ...variant,
    timeline,
    avatarLikenessCast: {
      schemaVersion: AVATAR_LIKENESS_CAST_SCHEMA,
      evidenceBasis: LIKENESS_EVIDENCE_BASIS,
      authority: LIKENESS_CAST_AUTHORITY,
      guardrail: "Acceptance is the boundary; likeness is the placement.",
      mediaShots: mediaShots.length,
      typedShots: typedShots.length,
      untypedMediaShots: Math.max(0, mediaShots.length - typedShots.length),
      byAvatar,
    },
  };
}

/**
 * Post-run audit: every typed shot must resolve back to the accepted likeness
 * decision set (id + state + origin + revision), and every appearance/seed
 * must agree with the cast. Same audit posture as the Human-Accepted pass:
 * fail closed when a typed shot has no durable receipt behind it.
 */
export function auditAvatarLikenessVariant(variant = {}, options = {}) {
  const index = options.decisionIndex || buildAvatarLikenessDecisionIndex(options.decisions || []);
  const decisionById = new Map();
  for (const decision of list(options.decisions || [])) {
    if (decision && typeof decision === "object" && text(decision.id)) decisionById.set(text(decision.id), decision);
  }
  const timeline = list(variant.timeline);
  const failures = [];
  let typedShots = 0;
  let untypedMediaShots = 0;
  let visualizerOnlyShots = 0;
  const byAvatar = {};
  timeline.forEach((shot, indexPosition) => {
    const hasMedia = Boolean(
      shot?.media_uri || shot?.runtime_media_uri || shot?.media_contract?.originalUri || (shot?.media_id && shot.media_id !== "none"),
    ) && shot?.media_id !== "none";
    if (!hasMedia) {
      visualizerOnlyShots += 1;
      if (shot.decision_evidence?.avatarLikeness) failures.push(`shot ${indexPosition} is visualizer-only but carries a likeness cast`);
      return;
    }
    const cast = shot.decision_evidence?.avatarLikeness || null;
    if (!cast) {
      untypedMediaShots += 1;
      return;
    }
    typedShots += 1;
    const avatarId = text(cast.cast?.avatarId);
    if (avatarId) byAvatar[avatarId] = (byAvatar[avatarId] || 0) + 1;
    if (cast.evidenceBasis !== LIKENESS_EVIDENCE_BASIS) {
      failures.push(`shot ${indexPosition} cast evidenceBasis is ${cast.evidenceBasis || "missing"}`);
    }
    const receipt = cast.decision || {};
    const source = decisionById.get(text(receipt.id)) || index.get(lower(text(receipt.id))) || null;
    if (!source) {
      failures.push(`shot ${indexPosition} typed cast has no durable decision receipt (${receipt.id || "missing id"})`);
    } else if (text(source.state) !== "accepted" || text(source.origin || source.decisionOrigin) !== LIKENESS_DECISION_ORIGIN) {
      failures.push(`shot ${indexPosition} decision receipt is not an accepted likeness decision`);
    } else if (finite(source.revision, 0) !== finite(receipt.revision, 0)) {
      failures.push(`shot ${indexPosition} decision revision ${receipt.revision} does not match stored ${source.revision}`);
    }
    if (text(receipt.state) !== "accepted" || text(receipt.origin) !== LIKENESS_DECISION_ORIGIN) {
      failures.push(`shot ${indexPosition} cast.decision is not an accepted likeness receipt`);
    }
    if (!avatarId) failures.push(`shot ${indexPosition} cast has no avatarId`);
    for (const appearance of list(cast.castAppearances)) {
      if (text(appearance.evidenceBasis) !== LIKENESS_EVIDENCE_BASIS) {
        failures.push(`shot ${indexPosition} appearance evidenceBasis is ${appearance.evidenceBasis || "missing"}`);
      }
      if (avatarId && text(appearance.avatarId) !== avatarId) {
        failures.push(`shot ${indexPosition} appearance avatar ${appearance.avatarId || "missing"} disagrees with cast ${avatarId}`);
      }
      if (!text(appearance.presence)) failures.push(`shot ${indexPosition} appearance is missing presence`);
    }
    for (const seed of list(cast.seedAssets)) {
      if (avatarId && text(seed.avatarId) !== avatarId) {
        failures.push(`shot ${indexPosition} seed asset ${seed.assetId || "missing"} belongs to avatar ${seed.avatarId || "?"} not ${avatarId}`);
      }
      if (!text(seed.assetId)) failures.push(`shot ${indexPosition} seed asset is missing its assetId`);
    }
  });
  return {
    schemaVersion: AVATAR_LIKENESS_CAST_SCHEMA,
    ok: failures.length === 0,
    evidenceBasis: LIKENESS_EVIDENCE_BASIS,
    guardrail: "Acceptance is the boundary; likeness is the placement.",
    timelineShots: timeline.length,
    mediaShots: timeline.length - visualizerOnlyShots,
    typedShots,
    untypedMediaShots,
    visualizerOnlyShots,
    byAvatar,
    receiptsChecked: typedShots,
    failures,
  };
}

/**
 * Density-mask safety against the engine's no-immediate-repeat contract.
 * The recast engine tracks the last selected media identity for the whole
 * variant (it throws when a selection equals it), so a single-candidate
 * pool can place at most ONE media shot per variant; the rest of the mask
 * falls through to the visualizer. Pools of 2+ candidates are returned
 * unchanged: the bag's non-repeating filter keeps alternating identities,
 * the same guarantee the Human-Accepted pass relies on.
 */
export function safeMediaShotMask(mask = [], timeline = [], poolSize = 0) {
  const shots = Array.isArray(timeline) ? timeline : [];
  const indices = [...new Set((Array.isArray(mask) ? mask : []).filter((index) => Number.isInteger(index) && index >= 0 && index < shots.length))].sort((a, b) => a - b);
  if (poolSize > 1) return indices;
  return indices.slice(0, 1);
}

/** Report-facing summary of the candidate pool's typed coverage. */
export function summarizeAvatarLikenessCast(candidates = []) {
  const rows = list(candidates);
  const withCast = rows.filter((row) => row.avatarLikeness);
  const byAvatar = {};
  for (const row of withCast) {
    const avatarId = text(row.avatarLikeness.cast?.avatarId);
    if (avatarId) byAvatar[avatarId] = (byAvatar[avatarId] || 0) + 1;
  }
  return {
    candidates: rows.length,
    withTypedCast: withCast.length,
    withoutCast: rows.length - withCast.length,
    castGaps: rows.filter((row) => row.avatarLikenessGap).map((row) => row.avatarLikenessGap),
    byAvatar,
    avatarsCasted: Object.keys(byAvatar).length,
  };
}
