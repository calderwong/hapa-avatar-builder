import { normalizeCanonicalTag } from "./echo-video-enrichment.js";

export const ECHO_VIDEO_CANON_MAPPING_SCHEMA = "hapa.echo.video-canon-mapping.v1";

const LIMITS = Object.freeze({
  tokensPerValue: 96,
  tags: 128,
  characterMatches: 32,
  referenceMatches: 12,
  songCandidates: 8,
  evidenceItems: 24,
  lyricLinesPerSong: 256,
  storyBeatsPerSong: 96,
});

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "had", "has", "have",
  "he", "her", "his", "i", "if", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or", "our",
  "she", "that", "the", "their", "them", "there", "they", "this", "to", "was", "we", "were", "what", "when",
  "where", "which", "who", "with", "you", "your", "image", "video", "scene", "frame", "shows", "showing",
  "person", "people", "someone", "camera", "view", "foreground", "background",
]);

const HAPA_AESTHETIC_SEEDS = Object.freeze([
  "artifact", "card", "celestial", "constellation", "crystal", "cyan", "flame", "garden", "glyph", "gold",
  "memory", "neon", "partnership", "phamiliar", "prism", "ritual", "signal", "sigil", "sovereign", "threshold",
  "world", "ship", "teal", "magenta", "relic", "mythic", "protocol", "light", "archive", "dream",
]);

const MEDIA_CONTAINER_KEYS = Object.freeze([
  "assets", "mediaAssets", "media", "videos", "images", "mediaSlots", "slots", "artifacts", "renditions", "original",
  "attachments", "preview", "loopVideo", "image", "assembledCard", "thumbnail", "poster", "asset",
]);

const MEDIA_ID_KEYS = Object.freeze([
  "id", "mediaId", "media_id", "assetId", "asset_id", "videoId", "video_id", "recordId", "record_id",
]);

const MEDIA_URI_KEYS = Object.freeze([
  "uri", "url", "src", "path", "runtimeUri", "runtime_uri", "mediaUri", "media_uri", "sourcePath", "originalPath",
]);

const RECORD_COLLECTION_KEYS = Object.freeze({
  songs: ["songs", "songCards", "records"],
  avatars: ["avatars", "cards", "records"],
  scenes: ["scenes", "cards", "records"],
  items: ["items", "cards", "records"],
  tarot: ["cards", "tarotCards", "records"],
  references: ["cards", "referenceCards", "records"],
  animatedReferences: ["records", "animatedRecords", "cards"],
});

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function list(value) {
  if (Array.isArray(value)) return value.filter((entry) => entry !== null && entry !== undefined);
  return value === null || value === undefined || value === "" ? [] : [value];
}

function text(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clone(value, depth = 0) {
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.slice(0, LIMITS.evidenceItems * 4).map((entry) => clone(entry, depth + 1));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().flatMap((key) => (
    value[key] === undefined ? [] : [[key, clone(value[key], depth + 1)]]
  )));
}

function finite(value) {
  if (typeof value === "boolean") return value ? 1 : 0;
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value));
}

function fixed(value, digits = 4) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(digits)) : 0;
}

function unit(value) {
  const parsed = finite(value);
  if (parsed === null) return null;
  return fixed(clamp(parsed > 1 ? parsed / 100 : parsed));
}

function phrase(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

function tokens(value, limit = LIMITS.tokensPerValue) {
  const seen = new Set();
  const output = [];
  for (const token of phrase(value).split(" ")) {
    if (!token || token.length < 3 || STOP_WORDS.has(token) || seen.has(token)) continue;
    seen.add(token);
    output.push(token);
    if (output.length >= limit) break;
  }
  return output;
}

function uniqueStrings(values, limit = LIMITS.evidenceItems * 4) {
  const seen = new Set();
  const output = [];
  for (const value of values.flat(Infinity)) {
    const normalized = text(String(value ?? ""));
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) continue;
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) break;
  }
  return output;
}

function scalarStrings(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return [];
  if (["string", "number"].includes(typeof value)) return text(String(value)) ? [String(value).trim()] : [];
  if (Array.isArray(value)) return value.slice(0, LIMITS.evidenceItems * 2).flatMap((entry) => scalarStrings(entry, depth + 1));
  if (typeof value !== "object") return [];
  const preferred = ["name", "label", "value", "text", "title", "description", "caption"]
    .flatMap((key) => Object.hasOwn(value, key) ? scalarStrings(value[key], depth + 1) : []);
  if (preferred.length) return preferred;
  return ["values", "labels", "colors", "items"].flatMap((key) => (
    Object.hasOwn(value, key) ? scalarStrings(value[key], depth + 1) : []
  ));
}

function firstText(...values) {
  for (const value of values) {
    const normalized = text(value);
    if (normalized) return normalized;
  }
  return "";
}

function valuesAtRoots(value, keys) {
  const roots = [value, value?.vision, value?.analysis, value?.recognition, value?.labels, value?.metrics, value?.quality]
    .filter((entry) => entry && typeof entry === "object" && !Array.isArray(entry));
  return uniqueStrings(roots.flatMap((root) => keys.flatMap((key) => (
    Object.hasOwn(root, key) ? scalarStrings(root[key]) : []
  ))));
}

function recordsFromStore(value, kind) {
  if (Array.isArray(value)) return value.filter((entry) => entry && typeof entry === "object");
  if (!value || typeof value !== "object") return [];
  for (const key of RECORD_COLLECTION_KEYS[kind] || []) {
    if (Array.isArray(value[key])) return value[key].filter((entry) => entry && typeof entry === "object");
  }
  return [];
}

function recordId(record) {
  return firstText(record?.id, record?.songId, record?.song_id, record?.cardId, record?.card_id, record?.avatarId, record?.sceneId);
}

function recordTitle(record) {
  return firstText(record?.title, record?.primaryName, record?.name, record?.label, recordId(record));
}

function overlap(left, right) {
  const a = new Set(Array.isArray(left) ? left : tokens(left));
  const b = new Set(Array.isArray(right) ? right : tokens(right));
  const matched = [...a].filter((token) => b.has(token)).sort();
  const union = new Set([...a, ...b]).size;
  const smaller = Math.max(1, Math.min(a.size, b.size));
  return {
    matched,
    count: matched.length,
    containment: fixed(matched.length / smaller),
    jaccard: fixed(union ? matched.length / union : 0),
    affinity: fixed(0.65 * (matched.length / smaller) + 0.35 * (union ? matched.length / union : 0)),
  };
}

function canonicalRole(value, fallback) {
  const normalized = phrase(value).replaceAll(" ", "-");
  if (/^(first|start|opening|begin)/.test(normalized)) return "first";
  if (/^(mid|middle|center)/.test(normalized)) return "middle";
  if (/^(last|end|ending|final)/.test(normalized)) return "last";
  return fallback;
}

const FRAME_FIELD_KEYS = Object.freeze({
  characters: ["characters", "people", "persons", "subjects", "detectedCharacters", "detected_characters"],
  settings: ["settings", "setting", "locations", "location", "places", "place", "environment"],
  objects: ["objects", "object", "items", "props", "detectedObjects", "detected_objects"],
  actions: ["actions", "action", "activities", "verbs", "detectedActions", "detected_actions"],
  emotions: ["emotions", "emotion", "mood", "affect"],
  motifs: ["motifs", "motif", "symbols", "symbol", "themes", "theme"],
  shotTypes: ["shotType", "shot_type", "shots", "composition", "framing"],
  camera: ["camera", "cameraMotion", "camera_motion", "cameraMovement", "camera_movement"],
  motion: ["motion", "motionType", "motion_type", "movement", "flow"],
  palette: ["palette", "colors", "colours", "dominantColors", "dominant_colors"],
  lighting: ["lighting", "light", "illumination"],
  weather: ["weather"],
  time: ["timeOfDay", "time_of_day", "daypart"],
  ocr: ["ocrText", "ocr_text", "text", "visibleText", "visible_text"],
});

function frameDescription(observation, fields) {
  const direct = firstText(
    observation?.synopsis,
    observation?.description,
    observation?.caption,
    observation?.visualDescription,
    observation?.visual_description,
    observation?.summary,
  );
  if (direct) return direct.slice(0, 480);
  const subject = firstText(fields.characters[0], fields.objects[0], "The frame");
  const action = firstText(fields.actions[0]);
  const setting = firstText(fields.settings[0]);
  const parts = [subject, action && `${action}`, setting && `in ${setting}`].filter(Boolean);
  return parts.length > 1 ? `${parts.join(" ")}.` : "";
}

function observationConfidence(observation) {
  return unit(
    observation?.confidence
      ?? observation?.visionConfidence
      ?? observation?.vision_confidence
      ?? observation?.analysis?.confidence,
  ) ?? 0.5;
}

/** Normalize exactly first, middle, and last observations without inventing extra frames. */
export function normalizeVisionObservations(observations = {}, media = {}) {
  const input = observations && typeof observations === "object" ? observations : {};
  const mediaId = firstText(media?.id, media?.mediaId, media?.recordId, "media");
  const supplied = Array.isArray(input)
    ? input.slice(0, 3)
    : Array.isArray(input.frames) ? input.frames.slice(0, 3)
      : [input.first, input.middle ?? input.mid, input.last];
  const fallbacks = ["first", "middle", "last"];
  const byRole = new Map();
  supplied.forEach((observation, index) => {
    if (!observation || typeof observation !== "object") return;
    const role = canonicalRole(observation.role ?? observation.marker ?? observation.position, fallbacks[index]);
    if (!byRole.has(role)) byRole.set(role, observation);
  });

  return fallbacks.map((role) => {
    const observation = byRole.get(role) || null;
    const fields = Object.fromEntries(Object.entries(FRAME_FIELD_KEYS).map(([key, keys]) => [
      key,
      observation ? valuesAtRoots(observation, keys) : [],
    ]));
    const description = observation ? frameDescription(observation, fields) : "";
    const metricKeys = [
      "visualCraft", "technicalFidelity", "sharpness", "clarity", "artifactFree",
      "temporalCoherence", "motionQuality", "stability", "motionConsistency",
      "composition", "editorialUtility", "framing", "subjectClarity",
    ];
    const metricRoots = [observation, observation?.metrics, observation?.quality, observation?.analysis, observation?.vision]
      .filter((value) => value && typeof value === "object");
    const metrics = Object.fromEntries(metricKeys.flatMap((key) => {
      for (const root of metricRoots) {
        const value = unit(root[key]);
        if (value !== null) return [[key, value]];
      }
      return [];
    }));
    return {
      role,
      frameId: firstText(observation?.frameId, observation?.frame_id, observation?.id, `${mediaId}:${role}`),
      timestampSeconds: finite(observation?.timestampSeconds ?? observation?.timestamp_seconds ?? observation?.timestamp),
      status: observation ? "vision-observed" : "missing",
      confidence: observation ? observationConfidence(observation) : 0,
      description,
      fields,
      metrics,
      tokens: tokens([description, ...Object.values(fields).flat()].join(" ")),
    };
  });
}

function stageSentence(frame) {
  if (frame.status === "missing") return `No ${frame.role}-frame Vision evidence.`;
  return frame.description || `The ${frame.role} frame has structured labels but no visual synopsis.`;
}

/** Produce an explicitly directed first -> middle -> last synopsis. */
export function buildDirectedVideoSynopsis({ media = {}, observations = {} } = {}) {
  const frames = normalizeVisionObservations(observations, media);
  const stages = frames.map((frame) => ({
    role: frame.role,
    frameId: frame.frameId,
    status: frame.status,
    confidence: frame.confidence,
    text: stageSentence(frame),
  }));
  const firstToMiddle = overlap(frames[0].tokens, frames[1].tokens);
  const middleToLast = overlap(frames[1].tokens, frames[2].tokens);
  return {
    synopsis: `First: ${stages[0].text} Middle: ${stages[1].text} Last: ${stages[2].text}`,
    stages,
    direction: "first-to-middle-to-last",
    continuity: {
      firstToMiddle: { affinity: firstToMiddle.affinity, matchedTokens: firstToMiddle.matched },
      middleToLast: { affinity: middleToLast.affinity, matchedTokens: middleToLast.matched },
    },
    evidenceFrameIds: frames.filter((frame) => frame.status !== "missing").map((frame) => frame.frameId),
  };
}

const TAG_FIELDS = Object.freeze({
  characters: "char",
  settings: "place",
  objects: "object",
  actions: "action",
  emotions: "emotion",
  motifs: "motif",
  shotTypes: "shot",
  camera: "camera",
  motion: "motion",
  palette: "palette",
  lighting: "light",
  weather: "weather",
  time: "time",
});

/** Build evidence-bearing namespaced tags from structured Vision fields. */
export function buildEvidenceTags({ media = {}, frames = [], observations = null } = {}) {
  const normalizedFrames = frames.length ? frames : normalizeVisionObservations(observations || {}, media);
  const byTag = new Map();
  const add = (tag, status, confidence, frameIds = [], evidence = []) => {
    const normalized = normalizeCanonicalTag(tag);
    if (!normalized) return;
    const current = byTag.get(normalized);
    const nextFrames = [...new Set([...(current?.supportingFrameIds || []), ...frameIds].filter(Boolean))].sort();
    const nextEvidence = uniqueStrings([...(current?.evidence || []), ...evidence], LIMITS.evidenceItems);
    const next = {
      tag: normalized,
      status: current?.status === "vision-observed" || status === "vision-observed" ? "vision-observed" : status,
      confidence: fixed(Math.max(current?.confidence || 0, confidence || 0), 3),
      supportingFrameIds: nextFrames,
      evidence: nextEvidence,
    };
    byTag.set(normalized, next);
  };

  for (const frame of normalizedFrames) {
    if (frame.status === "missing") continue;
    for (const [field, namespace] of Object.entries(TAG_FIELDS)) {
      for (const value of frame.fields[field] || []) {
        add({ namespace, value }, "vision-observed", frame.confidence, [frame.frameId], [`${frame.frameId}:${field}`]);
      }
    }
  }

  for (const rawTag of uniqueStrings([media.tags || [], media.keywords || [], media.motifs || []])) {
    const normalized = rawTag.includes(":")
      ? normalizeCanonicalTag(rawTag)
      : normalizeCanonicalTag({ namespace: "source", value: rawTag });
    const rawTokens = tokens(rawTag);
    const supporting = normalizedFrames.filter((frame) => overlap(rawTokens, frame.tokens).count > 0).map((frame) => frame.frameId);
    add(normalized, "source-declared", 0.7, supporting, ["media:declared-tags"]);
  }

  return [...byTag.values()].sort((left, right) => left.tag.localeCompare(right.tag)).slice(0, LIMITS.tags);
}

function normalizedIdentity(value) {
  const raw = text(String(value ?? ""));
  if (!raw) return "";
  return raw.toLowerCase().replace(/^sha256:/, "sha256:").replaceAll("\\", "/");
}

function hashValues(value) {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object") return [];
  return scalarStrings([value.value, value.sha256, value.digest, value.hash]);
}

function identitiesForAsset(asset, includeGenericId = true) {
  if (typeof asset === "string") return [normalizedIdentity(asset)].filter(Boolean);
  if (!asset || typeof asset !== "object") return [];
  const values = [
    ...(includeGenericId ? MEDIA_ID_KEYS.flatMap((key) => Object.hasOwn(asset, key) ? scalarStrings(asset[key]) : []) : []),
    ...MEDIA_URI_KEYS.flatMap((key) => Object.hasOwn(asset, key) ? scalarStrings(asset[key]) : []),
    ...hashValues(asset.sha256),
    ...hashValues(asset.contentHash),
    ...hashValues(asset.content_hash),
    ...hashValues(asset.contentFingerprint),
  ];
  return [...new Set(values.map(normalizedIdentity).filter(Boolean))];
}

function mediaIdentitySet(media) {
  return new Set(identitiesForAsset(media));
}

function attachmentPaths(record, wanted) {
  if (!record || typeof record !== "object" || !wanted.size) return [];
  const paths = [];
  const queue = [];
  for (const key of MEDIA_CONTAINER_KEYS) {
    if (Object.hasOwn(record, key)) queue.push({ value: record[key], path: `/${key}`, depth: 0 });
  }
  const visited = new Set();
  while (queue.length) {
    const { value, path, depth } = queue.shift();
    if (depth > 5 || value === null || value === undefined) continue;
    if (typeof value === "string") {
      if (wanted.has(normalizedIdentity(value))) paths.push(path);
      continue;
    }
    if (Array.isArray(value)) {
      value.slice(0, 256).forEach((entry, index) => queue.push({ value: entry, path: `${path}/${index}`, depth: depth + 1 }));
      continue;
    }
    if (typeof value !== "object" || visited.has(value)) continue;
    visited.add(value);
    const candidate = identitiesForAsset(value);
    if (candidate.some((identity) => wanted.has(identity))) paths.push(path);
    for (const key of MEDIA_CONTAINER_KEYS) {
      if (Object.hasOwn(value, key)) queue.push({ value: value[key], path: `${path}/${key}`, depth: depth + 1 });
    }
    for (const key of ["mediaIds", "media_ids", "assetIds", "asset_ids", "videoIds", "video_ids"]) {
      if (Object.hasOwn(value, key)) queue.push({ value: value[key], path: `${path}/${key}`, depth: depth + 1 });
    }
  }
  return [...new Set(paths)].sort().slice(0, LIMITS.evidenceItems);
}

function aliasesForAvatar(avatar) {
  return uniqueStrings([
    avatar.primaryName,
    avatar.name,
    avatar.title,
    avatar.secondName,
    avatar.alias,
    avatar.aliases || [],
    avatar.identity?.aliases || [],
    avatar.identity?.names || [],
  ], 16);
}

function linkedAvatarIds(record) {
  const values = [
    record.avatarId, record.avatar_id, record.ownerAvatarId, record.owner_avatar_id, record.characterId, record.character_id,
    record.avatarIds, record.avatar_ids, record.avatarLinks, record.attachments?.avatarLinks, record.links?.avatars,
  ];
  return uniqueStrings(values.flatMap((value) => {
    if (Array.isArray(value)) return value.flatMap((entry) => typeof entry === "object" ? [entry.avatarId, entry.avatar_id, entry.id] : [entry]);
    if (value && typeof value === "object") return [value.avatarId, value.avatar_id, value.id];
    return [value];
  }));
}

function entityMediaLinks(records, wanted, kind) {
  return records.flatMap((record) => {
    const paths = attachmentPaths(record, wanted);
    return paths.length ? [{ kind, id: recordId(record), record, paths }] : [];
  });
}

function directMediaCharacterIds(media) {
  return uniqueStrings([
    media.avatarId, media.avatar_id, media.ownerAvatarId, media.owner_avatar_id, media.characterId, media.character_id,
    media.provenance?.avatarId, media.origin?.avatarId,
  ]);
}

function visualAppearanceEvidence(avatar, frames) {
  const aliases = aliasesForAvatar(avatar).map((alias) => ({ raw: alias, phrase: phrase(alias), tokens: tokens(alias) })).filter((alias) => alias.phrase);
  const evidence = [];
  for (const frame of frames) {
    if (frame.status === "missing") continue;
    const labels = (frame.fields.characters || []).map((value) => phrase(value)).filter(Boolean);
    for (const alias of aliases) {
      const structured = labels.some((label) => label === alias.phrase || (` ${label} `).includes(` ${alias.phrase} `));
      const description = alias.tokens.length >= 2 && (` ${phrase(frame.description)} `).includes(` ${alias.phrase} `);
      if (!structured && !description) continue;
      evidence.push({
        frameId: frame.frameId,
        alias: alias.raw,
        basis: structured ? "structured-character-label" : "multi-token-description-phrase",
        confidence: fixed(clamp(frame.confidence * (structured ? 0.9 : 0.7), 0, structured ? 0.88 : 0.7), 3),
      });
    }
  }
  return evidence.sort((left, right) => left.frameId.localeCompare(right.frameId) || left.alias.localeCompare(right.alias));
}

/** Distinguish exact media attachment truth from unverified visual appearance. */
export function matchVideoCharacters({ media = {}, frames = [], observations = null, avatars = [], scenes = [], items = [], tarot = [] } = {}) {
  const normalizedFrames = frames.length ? frames : normalizeVisionObservations(observations || {}, media);
  const avatarRecords = recordsFromStore(avatars, "avatars");
  const wanted = mediaIdentitySet(media);
  const directIds = new Set(directMediaCharacterIds(media));
  const linkedEntities = [
    ...entityMediaLinks(recordsFromStore(scenes, "scenes"), wanted, "scene"),
    ...entityMediaLinks(recordsFromStore(items, "items"), wanted, "item"),
    ...entityMediaLinks(recordsFromStore(tarot, "tarot"), wanted, "tarot"),
  ];
  const entityAvatarEvidence = new Map();
  for (const entity of linkedEntities) {
    for (const avatarId of linkedAvatarIds(entity.record)) {
      const rows = entityAvatarEvidence.get(avatarId) || [];
      rows.push(`${entity.kind}:${entity.id}${entity.paths[0] || ""}`);
      entityAvatarEvidence.set(avatarId, rows);
    }
  }

  const matches = avatarRecords.flatMap((avatar) => {
    const avatarId = recordId(avatar);
    if (!avatarId) return [];
    const directPaths = attachmentPaths(avatar, wanted);
    const relationshipEvidence = [
      ...directPaths.map((path) => `avatar:${avatarId}${path}`),
      ...(directIds.has(avatarId) ? ["media:declared-avatar-id"] : []),
      ...(entityAvatarEvidence.get(avatarId) || []),
    ];
    const appearance = visualAppearanceEvidence(avatar, normalizedFrames);
    if (!relationshipEvidence.length && !appearance.length) return [];
    const exact = relationshipEvidence.length > 0;
    const sourceCanonStatus = firstText(avatar.canonStatus, avatar.loreStatus, avatar.status, "unverified");
    return [{
      avatarId,
      name: recordTitle(avatar),
      aliases: aliasesForAvatar(avatar),
      matchClass: exact ? "exact-media-attachment" : "appearance-candidate",
      truthStatus: exact ? "exact-relationship-not-visual-identity-proof" : "inferred-unverified-appearance",
      confidence: exact ? 1 : Math.max(...appearance.map((row) => row.confidence)),
      sourceCanonStatus,
      canonPromoted: false,
      identityInvariants: clone(avatar.identityInvariants || avatar.identity?.invariants || []),
      relationshipEvidence: relationshipEvidence.sort(),
      appearanceEvidence: appearance,
      supportingFrameIds: [...new Set(appearance.map((row) => row.frameId))].sort(),
    }];
  });

  return matches.sort((left, right) => (
    Number(right.matchClass === "exact-media-attachment") - Number(left.matchClass === "exact-media-attachment")
    || right.confidence - left.confidence
    || left.avatarId.localeCompare(right.avatarId)
  )).slice(0, LIMITS.characterMatches);
}

function referenceCardId(value) {
  return firstText(value?.cardId, value?.card_id, value?.referenceId, value?.reference_id, value?.id, value?.card?.id);
}

function referenceRevisionId(value) {
  return firstText(value?.revisionId, value?.revision_id, value?.card?.revisionId, value?.card?.revision_id);
}

function explicitReferenceIds(media) {
  const roots = [media, media.reference, media.provenance, media.origin, media.lineage].filter((value) => value && typeof value === "object");
  return new Set(uniqueStrings(roots.flatMap((root) => [
    root.referenceId, root.reference_id, root.referenceCardId, root.reference_card_id, root.referenceIds, root.reference_ids,
  ])));
}

function referenceTextFields(card) {
  const interpretations = list(card.interpretations || card.readings);
  const mechanics = uniqueStrings([
    card.mechanics || [], card.functionalMechanics || [], card.functional_mechanics || [], card.actions || [],
    card.semanticEffect || {}, card.mechanic || "", interpretations.flatMap((row) => [row.mechanic, row.functionalMechanic, row.behavior]),
  ].flatMap((value) => scalarStrings(value)), 64);
  const imagery = uniqueStrings([
    card.visualMotifs || [], card.visual_motifs || [], card.symbols || [], card.characters || [], card.distinctiveImagery || [],
    card.imagery || [], card.tags || [], interpretations.flatMap((row) => [row.imagery, row.symbols, row.motifs]),
  ].flatMap((value) => scalarStrings(value)), 64);
  const general = uniqueStrings([
    recordTitle(card), card.summary, card.description, card.meaning, card.evidence?.summary, card.evidence?.excerpt,
    card.layeredReadings || [], card.tags || [], mechanics, imagery,
  ].flatMap((value) => scalarStrings(value)), 96);
  return { mechanics, imagery, general };
}

function referenceAnimatedByCard(animatedRecords) {
  const map = new Map();
  for (const record of animatedRecords) {
    const id = referenceCardId(record);
    if (!id) continue;
    const rows = map.get(id) || [];
    rows.push(record);
    map.set(id, rows);
  }
  return map;
}

function caveatsForReference(card) {
  return uniqueStrings([
    card.caveats || [], card.constraints || [], card.uncertainty || [], card.review?.caveats || [], card.evidence?.caveats || [],
  ].flatMap((value) => scalarStrings(value)), LIMITS.evidenceItems);
}

/** Match Reference Atlas evidence while retaining every non-canon boundary. */
export function matchVideoReferences({ media = {}, frames = [], observations = null, referenceCards = [], animatedReferences = [] } = {}) {
  const normalizedFrames = frames.length ? frames : normalizeVisionObservations(observations || {}, media);
  const cards = recordsFromStore(referenceCards, "references");
  const animated = recordsFromStore(animatedReferences, "animatedReferences");
  const animatedByCard = referenceAnimatedByCard(animated);
  const wanted = mediaIdentitySet(media);
  const declaredIds = explicitReferenceIds(media);
  const visionTokens = tokens(normalizedFrames.flatMap((frame) => [frame.description, ...Object.values(frame.fields).flat()]).join(" "), 256);
  const results = [];

  const cardMap = new Map(cards.map((card) => [referenceCardId(card), card]).filter(([id]) => id));
  for (const record of animated) {
    const id = referenceCardId(record);
    if (id && !cardMap.has(id)) cardMap.set(id, record.card || record);
  }

  for (const [cardId, card] of [...cardMap.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const animatedMatches = (animatedByCard.get(cardId) || []).flatMap((record) => (
      attachmentPaths(record, wanted).map((path) => `${referenceRevisionId(record) || "unrevisioned"}${path}`)
    ));
    const explicit = declaredIds.has(cardId);
    const fields = referenceTextFields(card);
    const generalMatch = overlap(visionTokens, tokens(fields.general.join(" "), 192));
    const mechanicMatch = overlap(visionTokens, tokens(fields.mechanics.join(" "), 128));
    const imageryMatch = overlap(visionTokens, tokens(fields.imagery.join(" "), 128));
    const exact = animatedMatches.length > 0 || explicit;
    const candidate = generalMatch.count >= 3 && generalMatch.affinity >= 0.16;
    if (!exact && !candidate) continue;
    const sourceCanonStatus = firstText(card.canonStatus, card.canon_status, card.status, card.review?.canonStatus, "non-canon-reference");
    const reviewStatus = firstText(card.reviewStatus, card.review_status, card.review?.status, card.provenance?.reviewStatus, "unreviewed");
    const supportingFrameIds = normalizedFrames.filter((frame) => {
      const fullFrameTokens = tokens([
        frame.description,
        ...Object.values(frame.fields).flat(),
      ].join(" "), 256);
      return overlap(fullFrameTokens, generalMatch.matched).count > 0;
    }).map((frame) => frame.frameId);
    const hasVisualFrameCitation = supportingFrameIds.length > 0;
    const confidence = exact ? 1 : fixed(
      Math.min(0.75, 0.35 + generalMatch.affinity * 0.5 + generalMatch.count * 0.03)
        * (hasVisualFrameCitation ? 1 : 0.5),
      3,
    );
    results.push({
      cardId,
      revisionId: firstText(referenceRevisionId(card), referenceRevisionId((animatedByCard.get(cardId) || [])[0])) || null,
      title: recordTitle(card),
      matchClass: exact ? "exact-reference-media-attachment"
        : hasVisualFrameCitation ? "reference-interpretation-candidate" : "reference-textual-affinity-candidate",
      truthStatus: exact ? "exact-reference-relationship"
        : hasVisualFrameCitation ? "textual-visual-affinity-pending-review" : "textual-affinity-without-frame-citation-pending-review",
      confidence,
      supportingFrameIds: [...new Set(supportingFrameIds)].sort(),
      matchedTokens: generalMatch.matched,
      attachmentEvidence: [...new Set([...(explicit ? ["media:declared-reference-id"] : []), ...animatedMatches])].sort(),
      evidence: clone(card.evidence || card.evidenceRecord || card.sourceEvidence || null),
      reviewStatus,
      canonStatus: sourceCanonStatus,
      sourceCanonStatus,
      mappingCanonStatus: "reference-interpretation-not-promoted",
      canonPromoted: false,
      rights: clone(card.rights || card.rightsPrivacy || card.license || null),
      caveats: caveatsForReference(card),
      translationTruth: {
        mechanicAdaptationStatus: mechanicMatch.count
          ? "mechanic-overlap-candidate-original-adaptation-required"
          : "mechanic-adaptation-unmeasured",
        mechanicMatchedTokens: mechanicMatch.matched,
        imageryCopyStatus: imageryMatch.count && hasVisualFrameCitation
          ? "imagery-similarity-review-required-copy-not-established"
          : hasVisualFrameCitation ? "no-imagery-copy-claim" : "imagery-affinity-uncited-no-visual-claim",
        imageryMatchedTokens: imageryMatch.matched,
        rule: "Token affinity can propose a mechanic or imagery review; it cannot establish copied imagery or promote Reference interpretation to canon.",
      },
    });
  }

  return results.sort((left, right) => (
    Number(right.matchClass === "exact-reference-media-attachment") - Number(left.matchClass === "exact-reference-media-attachment")
    || right.confidence - left.confidence
    || left.cardId.localeCompare(right.cardId)
  )).slice(0, LIMITS.referenceMatches);
}

function explicitMediaSongIds(media) {
  const roots = [media, media.lineage, media.provenance, media.origin].filter((value) => value && typeof value === "object");
  return new Set(uniqueStrings(roots.flatMap((root) => [
    root.songId, root.song_id, root.parentSongId, root.parent_song_id, root.songIds, root.song_ids, root.linkedSongIds,
  ])));
}

function linkIds(value, keys) {
  return new Set(uniqueStrings(keys.flatMap((key) => list(value?.[key]).flatMap((entry) => (
    entry && typeof entry === "object"
      ? [entry.id, entry.avatarId, entry.avatar_id, entry.sceneId, entry.scene_id, entry.cardId, entry.card_id, entry.itemId]
      : [entry]
  )))));
}

function lyricRows(song) {
  const timed = [song.lyricTimings, song.lyric_timings, song.timedLyrics, song.timed_lyrics, song.lyrics?.lines]
    .find(Array.isArray);
  let rows = timed || [];
  if (!rows.length) {
    const raw = typeof song.lyrics === "string"
      ? song.lyrics
      : firstText(song.lyrics?.text, song.lyrics?.raw, song.lyrics?.plainText, song.lyricText);
    rows = raw ? raw.split(/\r?\n/).filter(Boolean).map((line) => ({ text: line })) : [];
  }
  return rows.slice(0, LIMITS.lyricLinesPerSong).flatMap((row, index) => {
    const line = typeof row === "string" ? { text: row } : object(row);
    const lineText = firstText(line.text, line.lyric, line.line, line.value);
    return lineText ? [{
      id: firstText(line.id, line.lineId, line.line_id, `lyric-line-${index + 1}`),
      text: lineText,
      startSeconds: finite(line.startSeconds ?? line.start ?? line.start_sec),
      endSeconds: finite(line.endSeconds ?? line.end ?? line.end_sec),
      section: firstText(line.section, line.sectionLabel, line.section_label) || null,
      sourcePath: `/songs/${recordId(song)}/lyricTimings/${index}`,
    }] : [];
  });
}

function storyRows(song) {
  return list(song.storyBeats || song.story_beats).slice(0, LIMITS.storyBeatsPerSong).flatMap((beat, index) => {
    const row = typeof beat === "string" ? { body: beat } : object(beat);
    const rowText = firstText(row.summary, row.body, row.text, row.description, row.title);
    return rowText ? [{
      id: firstText(row.id, row.beatId, row.beat_id, `story-beat-${index + 1}`),
      text: rowText,
      sceneId: firstText(row.sceneId, row.scene_id) || null,
      cardId: firstText(row.cardId, row.card_id) || null,
      sourcePath: `/songs/${recordId(song)}/storyBeats/${index}`,
    }] : [];
  });
}

function citedTextMatches(rows, visionTokens, kind) {
  return rows.flatMap((row) => {
    const match = overlap(visionTokens, tokens(row.text));
    if (match.count < 3 || match.affinity < 0.18) return [];
    return [{
      kind,
      id: row.id,
      text: row.text,
      startSeconds: row.startSeconds ?? null,
      endSeconds: row.endSeconds ?? null,
      section: row.section ?? null,
      sceneId: row.sceneId ?? null,
      cardId: row.cardId ?? null,
      matchedTokens: match.matched,
      affinity: match.affinity,
      sourcePath: row.sourcePath,
    }];
  }).sort((left, right) => right.affinity - left.affinity || left.id.localeCompare(right.id)).slice(0, 8);
}

function connectorReferenceId(connector) {
  return firstText(connector?.referenceId, connector?.reference_id, connector?.sourceReferenceId);
}

/** Return only song contexts backed by explicit relationships or cited text overlap. */
export function matchVideoSongContexts({
  media = {}, frames = [], observations = null, songs = [], avatars = [], scenes = [], items = [], tarot = [],
  characterMatches = [], referenceMatches = [],
} = {}) {
  const normalizedFrames = frames.length ? frames : normalizeVisionObservations(observations || {}, media);
  const songRecords = recordsFromStore(songs, "songs");
  const wanted = mediaIdentitySet(media);
  const declaredSongIds = explicitMediaSongIds(media);
  const exactAvatarIds = new Set(characterMatches.filter((match) => match.matchClass === "exact-media-attachment").map((match) => match.avatarId));
  const exactSceneIds = new Set(entityMediaLinks(recordsFromStore(scenes, "scenes"), wanted, "scene").map((row) => row.id));
  const exactItemIds = new Set(entityMediaLinks(recordsFromStore(items, "items"), wanted, "item").map((row) => row.id));
  const exactTarotIds = new Set(entityMediaLinks(recordsFromStore(tarot, "tarot"), wanted, "tarot").map((row) => row.id));
  const referenceIds = new Set(referenceMatches.map((match) => match.cardId));
  const visionTokens = tokens(normalizedFrames.flatMap((frame) => [frame.description, ...Object.values(frame.fields).flat()]).join(" "), 256);
  const output = [];

  for (const song of songRecords) {
    const songId = recordId(song);
    if (!songId) continue;
    const relationships = [];
    const directPaths = attachmentPaths(song, wanted);
    if (directPaths.length) relationships.push({ type: "exact-song-media-attachment", paths: directPaths });
    if (declaredSongIds.has(songId)) relationships.push({ type: "media-declared-song-id", paths: ["media:lineage/songId"] });

    const attachments = object(song.attachments);
    const avatarIds = linkIds(attachments, ["avatarLinks", "avatars"]);
    const performerId = firstText(song.performancePerspective?.avatarId, song.performancePerspective?.avatar_id);
    if (performerId) avatarIds.add(performerId);
    const sceneIds = linkIds(attachments, ["sceneLinks", "scenes"]);
    const cardIds = linkIds(attachments, ["cardLinks", "cards", "itemLinks", "tarotLinks"]);
    const linkedAvatars = [...avatarIds].filter((id) => exactAvatarIds.has(id));
    const linkedScenes = [...sceneIds].filter((id) => exactSceneIds.has(id));
    const linkedCards = [...cardIds].filter((id) => exactItemIds.has(id) || exactTarotIds.has(id));
    if (linkedAvatars.length) relationships.push({ type: "explicit-avatar-media-song-link", ids: linkedAvatars.sort() });
    if (linkedScenes.length) relationships.push({ type: "explicit-scene-media-song-link", ids: linkedScenes.sort() });
    if (linkedCards.length) relationships.push({ type: "explicit-card-media-song-link", ids: linkedCards.sort() });

    const connectors = list(song.referenceConnectors || song.reference_connectors)
      .filter((connector) => referenceIds.has(connectorReferenceId(connector)));
    if (connectors.length) relationships.push({
      type: "explicit-reference-connector",
      ids: connectors.map((connector) => firstText(connector.id, connectorReferenceId(connector))).sort(),
    });

    const lyricCitations = citedTextMatches(lyricRows(song), visionTokens, "lyric");
    const storyCitations = citedTextMatches(storyRows(song), visionTokens, "story-beat");
    for (const connector of connectors) {
      const lyricText = firstText(connector.target?.lyricText, connector.target?.matchedText);
      if (!lyricText) continue;
      lyricCitations.push({
        kind: "reference-connector-lyric",
        id: firstText(connector.id, `${songId}:${connectorReferenceId(connector)}`),
        text: lyricText,
        startSeconds: finite(connector.target?.startSeconds),
        endSeconds: finite(connector.target?.endSeconds),
        section: connector.target?.section || null,
        matchedTokens: overlap(visionTokens, tokens(lyricText)).matched,
        affinity: overlap(visionTokens, tokens(lyricText)).affinity,
        sourcePath: `/songs/${songId}/referenceConnectors`,
      });
    }

    if (!relationships.length && !lyricCitations.length && !storyCitations.length) continue;
    const direct = relationships.some((row) => ["exact-song-media-attachment", "media-declared-song-id"].includes(row.type));
    const relationshipConfidence = direct ? 1 : relationships.length ? 0.82 : 0;
    const textConfidence = Math.max(0, ...lyricCitations.map((row) => row.affinity), ...storyCitations.map((row) => row.affinity));
    output.push({
      songId,
      title: recordTitle(song),
      matchClass: direct ? "exact-song-relationship" : relationships.length ? "explicit-context-relationship" : "text-evidence-candidate",
      truthStatus: direct ? "exact-media-relationship" : "song-context-candidate-not-canon",
      confidence: fixed(Math.max(relationshipConfidence, Math.min(0.78, 0.4 + textConfidence * 0.5)), 3),
      relationshipEvidence: relationships,
      lyricCitations: lyricCitations.sort((left, right) => right.affinity - left.affinity || left.id.localeCompare(right.id)).slice(0, 8),
      storyCitations,
      matchedTokens: [...new Set([...lyricCitations, ...storyCitations].flatMap((row) => row.matchedTokens))].sort(),
      canonPromoted: false,
    });
  }

  return output.sort((left, right) => (
    Number(right.matchClass === "exact-song-relationship") - Number(left.matchClass === "exact-song-relationship")
    || right.confidence - left.confidence
    || left.songId.localeCompare(right.songId)
  )).slice(0, LIMITS.songCandidates);
}

function frameMetric(frames, keys) {
  const values = [];
  for (const frame of frames) {
    const raw = frame.raw || frame;
    const roots = [raw, raw?.metrics, raw?.quality, raw?.analysis, raw?.vision, frame?.metrics].filter((value) => value && typeof value === "object");
    for (const root of roots) for (const key of keys) {
      if (!Object.hasOwn(root, key)) continue;
      const value = unit(root[key]);
      if (value !== null) values.push(value);
    }
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function qualityComponent(score, confidence, rationale, evidenceFrameIds = [], status = "measured-inferred") {
  return {
    score: score === null ? null : fixed(clamp(score, 0, 100), 2),
    confidence: fixed(clamp(confidence || 0), 3),
    status: score === null ? "unmeasured" : status,
    rationale,
    evidence: [...new Set(evidenceFrameIds.filter(Boolean))].sort(),
  };
}

function canonLexicon(stores) {
  const values = [...HAPA_AESTHETIC_SEEDS];
  for (const records of stores) for (const record of records.slice(0, 512)) {
    values.push(...scalarStrings(record.tags), ...scalarStrings(record.motifs), ...scalarStrings(record.themes));
  }
  return tokens(values.join(" "), 256);
}

/** Derive seven source-independent inputs for the shared intrinsic-quality rubric. */
export function deriveIntrinsicQualityInputs({
  media = {}, frames = [], observations = null, characterMatches = [], referenceMatches = [],
  songs = [], avatars = [], scenes = [], items = [], tarot = [], referenceCards = [],
} = {}) {
  const normalizedFrames = frames.length ? frames : normalizeVisionObservations(observations || {}, media);
  const observed = normalizedFrames.filter((frame) => frame.status !== "missing");
  const frameIds = observed.map((frame) => frame.frameId);
  const visualTokens = tokens(observed.flatMap((frame) => [frame.description, ...Object.values(frame.fields).flat()]).join(" "), 256);
  const width = finite(media.width ?? media.metadata?.width ?? media.technical?.width);
  const height = finite(media.height ?? media.metadata?.height ?? media.technical?.height);
  const shortEdge = width && height ? Math.min(width, height) : null;

  const technicalMetric = frameMetric(observed, ["visualCraft", "technicalFidelity", "sharpness", "clarity", "artifactFree"]);
  const resolutionMetric = shortEdge === null ? null : shortEdge >= 1080 ? 1 : shortEdge >= 720 ? 0.85 : shortEdge >= 540 ? 0.7 : shortEdge >= 360 ? 0.5 : 0.3;
  const technicalEvidence = [technicalMetric, resolutionMetric].filter((value) => value !== null);
  const technicalScore = technicalEvidence.length
    ? clamp(technicalEvidence.reduce((sum, value) => sum + value, 0) / technicalEvidence.length) * 100
    : null;

  const temporalMetric = frameMetric(observed, ["temporalCoherence", "motionQuality", "stability", "motionConsistency"]);
  const pairAffinities = observed.length >= 2
    ? observed.slice(0, -1).map((frame, index) => overlap(frame.tokens, observed[index + 1].tokens).affinity)
    : [];
  const inferredTemporal = pairAffinities.length
    ? clamp(0.58 + (pairAffinities.reduce((sum, value) => sum + value, 0) / pairAffinities.length) * 0.3)
    : null;
  const temporalScore = (temporalMetric ?? inferredTemporal) === null ? null : (temporalMetric ?? inferredTemporal) * 100;

  const lexicon = canonLexicon([
    recordsFromStore(songs, "songs"), recordsFromStore(avatars, "avatars"), recordsFromStore(scenes, "scenes"),
    recordsFromStore(items, "items"), recordsFromStore(tarot, "tarot"), recordsFromStore(referenceCards, "references"),
  ]);
  const hapaMatches = overlap(visualTokens, lexicon).matched;
  const hapaScore = observed.length ? clamp(0.42 + Math.min(0.5, hapaMatches.length * 0.06)) * 100 : null;

  const descriptions = observed.filter((frame) => frame.description).length;
  const actions = uniqueStrings(observed.flatMap((frame) => frame.fields.actions));
  const objects = uniqueStrings(observed.flatMap((frame) => frame.fields.objects));
  const distinctStages = new Set(observed.map((frame) => phrase(frame.description)).filter(Boolean)).size;
  const narrativeScore = observed.length ? clamp(
    0.25 + 0.25 * (descriptions / 3) + (actions.length ? 0.2 : 0) + (objects.length ? 0.15 : 0) + (distinctStages > 1 ? 0.1 : 0),
  ) * 100 : null;

  const exactCharacters = characterMatches.filter((match) => match.matchClass === "exact-media-attachment");
  const candidateCharacters = characterMatches.filter((match) => match.matchClass === "appearance-candidate");
  const declaredCharacters = observed.flatMap((frame) => frame.fields.characters).length;
  const characterScore = exactCharacters.length ? 85 : candidateCharacters.length ? 70 : declaredCharacters ? 45 : null;

  const compositionMetric = frameMetric(observed, ["composition", "editorialUtility", "framingQuality", "roiQuality"]);
  const shotEvidence = observed.some((frame) => frame.fields.shotTypes.length);
  const cameraEvidence = observed.some((frame) => frame.fields.camera.length);
  const inferredComposition = observed.length
    ? clamp(0.45 + (shotEvidence ? 0.15 : 0) + (cameraEvidence ? 0.1 : 0) + (shortEdge ? 0.15 : 0) + 0.15 * (descriptions / 3))
    : null;
  const compositionScore = (compositionMetric ?? inferredComposition) === null ? null : (compositionMetric ?? inferredComposition) * 100;

  const specificity = new Set([
    ...observed.flatMap((frame) => frame.fields.objects),
    ...observed.flatMap((frame) => frame.fields.actions),
    ...observed.flatMap((frame) => frame.fields.motifs),
    ...referenceMatches.flatMap((match) => match.matchedTokens || []),
  ].flatMap(tokens)).size;
  const distinctivenessScore = observed.length ? clamp(0.38 + Math.min(0.54, specificity * 0.045)) * 100 : null;

  return {
    visualCraftTechnicalFidelity: qualityComponent(
      technicalScore,
      technicalScore === null ? 0 : technicalMetric !== null ? 0.75 : 0.55,
      technicalScore === null
        ? "No technical or visual-fidelity evidence was supplied."
        : "Resolution and explicit vision-quality metrics only; generic scene-label words are not treated as defect evidence.",
      frameIds,
    ),
    temporalCoherenceMotionQuality: qualityComponent(
      temporalScore,
      temporalScore === null ? 0 : temporalMetric !== null ? 0.72 : 0.5,
      temporalScore === null ? "Fewer than two usable observations and no temporal metric were supplied." : "Measured or inferred continuity across the ordered first, middle, and last observations.",
      frameIds,
    ),
    hapaAestheticWorldAlignment: qualityComponent(
      hapaScore,
      hapaScore === null ? 0 : hapaMatches.length ? 0.62 : 0.35,
      hapaScore === null ? "No visual evidence was supplied for aesthetic comparison." : `Matched ${hapaMatches.length} bounded Hapa canon/motif token(s): ${hapaMatches.slice(0, 12).join(", ") || "none"}.`,
      frameIds,
    ),
    narrativeSemanticLegibility: qualityComponent(
      narrativeScore,
      narrativeScore === null ? 0 : 0.65,
      narrativeScore === null ? "No ordered visual observations were supplied." : `${descriptions}/3 stages have descriptions, with ${actions.length} action(s), ${objects.length} object(s), and ${distinctStages} distinct stage state(s).`,
      frameIds,
    ),
    characterCanonIntegrity: qualityComponent(
      characterScore,
      characterScore === null ? 0 : exactCharacters.length ? 0.72 : 0.5,
      characterScore === null ? "No character identity evidence was supplied; absence is unmeasured rather than a failure." : `${exactCharacters.length} exact attachment relationship(s) and ${candidateCharacters.length} unverified appearance candidate(s); attachment does not itself prove depiction.`,
      characterMatches.flatMap((match) => match.supportingFrameIds || []),
    ),
    compositionEditorialUtility: qualityComponent(
      compositionScore,
      compositionScore === null ? 0 : compositionMetric !== null ? 0.72 : 0.5,
      compositionScore === null ? "No composition, dimensions, or frame observations were supplied." : `Composition uses ${shotEvidence ? "shot" : "no shot"} labels, ${cameraEvidence ? "camera" : "no camera"} labels, and ${shortEdge || "unknown"}px short-edge evidence.`,
      frameIds,
    ),
    libraryDistinctiveness: qualityComponent(
      distinctivenessScore,
      distinctivenessScore === null ? 0 : 0.48,
      distinctivenessScore === null ? "No visual evidence was supplied for distinctiveness." : `${specificity} distinct structured object/action/motif/reference token(s) support a provisional relative-distinctiveness input.`,
      frameIds,
    ),
  };
}

/** Build one deterministic, bounded canon-aware enrichment mapping. */
export function buildEchoVideoCanonMapping({
  media = {}, observations = {}, visionObservations = null,
  referenceCards = [], referenceAtlas = null, animatedReferences = [], referenceAnimatedRecords = null,
  songs = [], songStore = null, avatars = [], avatarStore = null, scenes = [], sceneStore = null,
  items = [], itemStore = null, tarot = [], tarotStore = null,
} = {}) {
  const effectiveObservations = visionObservations || observations || {};
  const effectiveReferences = referenceAtlas || referenceCards;
  const effectiveAnimated = referenceAnimatedRecords || animatedReferences;
  const effectiveSongs = songStore || songs;
  const effectiveAvatars = avatarStore || avatars;
  const effectiveScenes = sceneStore || scenes;
  const effectiveItems = itemStore || items;
  const effectiveTarot = tarotStore || tarot;
  const frames = normalizeVisionObservations(effectiveObservations, media);
  const directedSynopsis = buildDirectedVideoSynopsis({ media, observations: effectiveObservations });
  const tags = buildEvidenceTags({ media, frames });
  const characterMatches = matchVideoCharacters({
    media, frames, avatars: effectiveAvatars, scenes: effectiveScenes, items: effectiveItems, tarot: effectiveTarot,
  });
  const referenceMatches = matchVideoReferences({
    media, frames, referenceCards: effectiveReferences, animatedReferences: effectiveAnimated,
  });
  const songStoryCandidates = matchVideoSongContexts({
    media, frames, songs: effectiveSongs, avatars: effectiveAvatars, scenes: effectiveScenes, items: effectiveItems,
    tarot: effectiveTarot, characterMatches, referenceMatches,
  });
  const intrinsicQualityInputs = deriveIntrinsicQualityInputs({
    media, frames, characterMatches, referenceMatches, songs: effectiveSongs, avatars: effectiveAvatars,
    scenes: effectiveScenes, items: effectiveItems, tarot: effectiveTarot, referenceCards: effectiveReferences,
  });
  const mediaId = firstText(media.id, media.mediaId, media.recordId, media.uri, "unidentified-media");

  return {
    schemaVersion: ECHO_VIDEO_CANON_MAPPING_SCHEMA,
    mediaId,
    directedSynopsis,
    synopsis: directedSynopsis.synopsis,
    frames,
    tags,
    characterMatches,
    referenceMatches,
    songStoryCandidates,
    intrinsicQualityInputs,
    recognition: {
      synopsis: directedSynopsis.synopsis,
      arcSynopsis: directedSynopsis.synopsis,
      frames,
      tags,
    },
    semantic: {
      characters: characterMatches,
      references: referenceMatches,
      songContexts: songStoryCandidates,
    },
    quality: {
      sourceIndependent: true,
      inputs: intrinsicQualityInputs,
    },
    truthBoundary: {
      referenceInterpretation: "never-promoted-to-canon",
      appearanceMatches: "candidate-only-unless-an-exact-attachment-relationship-exists",
      attachmentMeaning: "an-exact-relationship-does-not-by-itself-prove-visible-character-identity",
      songContext: "requires-an-explicit-relationship-or-cited-text-overlap",
      sourcePriorExcludedFromIntrinsicQuality: true,
    },
    totals: {
      observedFrames: frames.filter((frame) => frame.status !== "missing").length,
      tags: tags.length,
      characterMatches: characterMatches.length,
      referenceMatches: referenceMatches.length,
      songStoryCandidates: songStoryCandidates.length,
      qualityComponents: Object.keys(intrinsicQualityInputs).length,
    },
  };
}

export const mapEchoVideoCanonContext = buildEchoVideoCanonMapping;
export const matchVideoStoryContexts = matchVideoSongContexts;
