export const ECHO_TRUTH_STATUS = Object.freeze({
  VERIFIED: "verified",
  INFERRED: "inferred",
  GENERATED_PLACEHOLDER: "generated_placeholder",
  MISSING: "missing",
});

export const ECHO_PLACEHOLDER_TAGS = Object.freeze([
  "digital-isolation",
  "cyber-operator",
  "simulation-framework",
  "camera-push-in",
  "glitch-lines",
  "browser-playback",
]);

const GENERATED_OBJECT_SETS = [
  ["neon sign", "field coat", "avatar frame"],
  ["hologram emitter", "control panel", "cyber deck"],
  ["rain-slicked street", "trench coat", "cybernetic eye"],
  ["quantum core", "lens flare", "floating console"],
];

const GENERATED_ACTION_SETS = [
  ["glitching", "standing", "shimmering"],
  ["flickering", "typing", "rotating"],
  ["reflecting", "walking", "scanning"],
  ["humming", "floating", "pulsing"],
];

const DEFAULT_SECTION_SIGNATURE = [
  "intro:0:12",
  "verse_1:12:45",
  "chorus_1:45:75",
  "verse_2:75:108",
  "chorus_2:108:138",
  "bridge:138:168",
  "chorus_3:168:198",
  "outro:198:218",
  "ringout:218:230",
];

const DEFAULT_VOCAL_DENSITY_SIGNATURE = [
  "0:12:none",
  "12:138:high",
  "138:168:low",
  "168:198:high",
  "198:230:none",
];

const DEFAULT_ENERGY_CURVES = {
  loudness: [0.1, 0.4, 0.8, 0.45, 0.85, 0.5, 0.9, 0.3, 0.05],
  tension: [0.2, 0.3, 0.7, 0.5, 0.8, 0.9, 0.95, 0.4, 0.1],
  release: [0.1, 0.1, 0.8, 0.2, 0.8, 0.1, 0.9, 0.8, 0.9],
  brightness: [0.3, 0.4, 0.6, 0.4, 0.7, 0.3, 0.8, 0.2, 0.1],
};

const GENERATED_SUMMARY_PATTERNS = [
  /\bclassic cyber-operator look\b/i,
  /\bmodern isolation\b/i,
  /\bnever-ending simulation loop\b/i,
  /\bpersistent simulation cycle\b/i,
  /\bdigital containment\b/i,
  /\bexact hex color coordinates\b/i,
  /\b768 pixels in width and 1168 pixels in height\b/i,
  /\bconstant bitrate of 2500 kbps\b/i,
  /\bfuchsia glitch lines\b/i,
];

function list(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function lowerSet(values) {
  return new Set(list(values).map((value) => String(value).toLowerCase()));
}

function sameNumber(a, b) {
  return Math.abs(Number(a) - Number(b)) < 0.001;
}

function arraysMatch(a = [], b = []) {
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return a.every((value, index) => sameNumber(value, b[index]));
}

function containsAll(sourceValues = [], requiredValues = []) {
  const source = lowerSet(sourceValues);
  return requiredValues.every((value) => source.has(String(value).toLowerCase()));
}

function matchesAnyGeneratedSet(values = [], generatedSets = []) {
  return generatedSets.some((generatedSet) => containsAll(values, generatedSet));
}

function sectionSignature(sections = []) {
  return list(sections).map((section) => [
    section.section_id || section.id || section.type || "",
    Number(section.start_sec ?? section.start ?? 0),
    Number(section.end_sec ?? section.end ?? 0),
  ].join(":"));
}

function vocalDensitySignature(rows = []) {
  return list(rows).map((row) => [
    Number(row.start_sec ?? row.start ?? 0),
    Number(row.end_sec ?? row.end ?? 0),
    row.vocal_density || row.vocalDensity || "",
  ].join(":"));
}

function isDefaultBeatGrid(beats = []) {
  const rows = list(beats);
  return rows.length === 48 && rows.every((beat, index) => (
    sameNumber(beat.t, index * 2.5) &&
    Number(beat.bar) === Math.floor(index / 4) + 1 &&
    Number(beat.beat) === (index % 4) + 1
  ));
}

function isDefaultEnergyCurves(curves = {}) {
  return Object.entries(DEFAULT_ENERGY_CURVES).every(([key, values]) => arraysMatch(curves?.[key], values));
}

export function detectEchoPlaceholderMetadata(input = {}) {
  const metadata = input.metadata || {};
  const tags = list(input.tags || metadata.tags);
  const objects = list(metadata.objects || metadata.nouns || input.objects);
  const actions = list(metadata.actions || metadata.verbs || input.actions);
  const text = [
    metadata.narrativeSummary,
    metadata.objectiveSummary,
    input.narrativeSummary,
    input.objectiveSummary,
    tags.join(" "),
  ].filter(Boolean).join("\n");

  const signals = [];
  const placeholderTagCount = ECHO_PLACEHOLDER_TAGS.filter((tag) => tags.includes(tag)).length;
  if (placeholderTagCount >= 4) signals.push("placeholder-tag-set");
  if (matchesAnyGeneratedSet(objects, GENERATED_OBJECT_SETS)) signals.push("generated-object-set");
  if (matchesAnyGeneratedSet(actions, GENERATED_ACTION_SETS)) signals.push("generated-action-set");

  for (const pattern of GENERATED_SUMMARY_PATTERNS) {
    if (pattern.test(text)) signals.push(`summary:${pattern.source}`);
  }

  if (metadata.echosTruth?.status === ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER) {
    signals.push("explicit-generated-placeholder-truth");
  }

  return {
    isPlaceholder: signals.length > 0,
    signals,
  };
}

function fieldStatus(present, placeholder, inferred = false) {
  if (!present) return ECHO_TRUTH_STATUS.MISSING;
  if (placeholder) return ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER;
  return inferred ? ECHO_TRUTH_STATUS.INFERRED : ECHO_TRUTH_STATUS.VERIFIED;
}

function truthOverrideStatus(status) {
  if (status === ECHO_TRUTH_STATUS.VERIFIED || status === "technical_verified" || status === "verified") {
    return ECHO_TRUTH_STATUS.VERIFIED;
  }
  if (status === ECHO_TRUTH_STATUS.INFERRED || status === "source_inferred" || status === "inferred") {
    return ECHO_TRUTH_STATUS.INFERRED;
  }
  return null;
}

function scoreStatuses(statuses = {}) {
  const values = Object.values(statuses);
  if (!values.length) return 0;
  const score = values.reduce((total, status) => {
    if (status === ECHO_TRUTH_STATUS.VERIFIED) return total + 1;
    if (status === ECHO_TRUTH_STATUS.INFERRED) return total + 0.55;
    if (status === ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER) return total + 0.15;
    return total;
  }, 0);
  return Math.round((score / values.length) * 100);
}

export function scoreEchoSongReadiness(song = {}) {
  const sections = list(song.sections);
  const beats = list(song.beats);
  const vocalDensity = list(song.vocalDensity);
  const energyCurves = song.energyCurves || {};
  const sourceAnchors = list(song.sourceAnchors);
  const sourceAnchorVerified = sourceAnchors.some((anchor) => (
    anchor.confidence === "hard" ||
    anchor.registryTrackId ||
    anchor.kind === "suno-playlist-track"
  ));
  const generatedSections = sectionSignature(sections).join("|") === DEFAULT_SECTION_SIGNATURE.join("|");
  const generatedBeats = isDefaultBeatGrid(beats);
  const generatedVocalDensity = vocalDensitySignature(vocalDensity).join("|") === DEFAULT_VOCAL_DENSITY_SIGNATURE.join("|");
  const generatedEnergyCurves = isDefaultEnergyCurves(energyCurves);
  const generatedNarrativeSpine = /^Local spine for ".+": Narrative journey tracing motifs from /i.test(song.narrativeSpine || "");

  const checklist = {
    hasSections: sections.length > 0,
    hasBeats: beats.length > 0,
    hasVocalDensity: vocalDensity.length > 0,
    hasEnergyCurves: Object.keys(energyCurves).length > 0,
    hasStems: Boolean(song.sync && Number(song.sync.stemCount) > 0),
    hasNarrativeSpine: Boolean(song.narrativeSpine || (song.lore && song.lore.summary && !/recovered/i.test(song.lore.summary))),
    hasCanonLinks: sourceAnchors.length > 0,
  };

  const truth = {
    sections: fieldStatus(checklist.hasSections, generatedSections),
    beats: fieldStatus(checklist.hasBeats, generatedBeats),
    vocalDensity: fieldStatus(checklist.hasVocalDensity, generatedVocalDensity),
    energyCurves: fieldStatus(checklist.hasEnergyCurves, generatedEnergyCurves),
    stems: fieldStatus(checklist.hasStems, false, !song.sync?.source && !song.sync?.stemManifestPath),
    narrativeSpine: fieldStatus(checklist.hasNarrativeSpine, generatedNarrativeSpine),
    canonLinks: fieldStatus(checklist.hasCanonLinks, false, !sourceAnchorVerified),
  };

  const placeholderSignals = [
    generatedSections ? "default-section-map" : "",
    generatedBeats ? "default-48-beat-grid" : "",
    generatedVocalDensity ? "default-vocal-density-map" : "",
    generatedEnergyCurves ? "default-energy-curves" : "",
    generatedNarrativeSpine ? "generic-local-spine" : "",
  ].filter(Boolean);

  return {
    score: scoreStatuses(truth),
    checklist,
    truth,
    truthStatus: placeholderSignals.length ? ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER : ECHO_TRUTH_STATUS.VERIFIED,
    placeholderSignals,
  };
}

export function getEchoMediaChecklist(asset = {}, parentObj = {}) {
  const metadata = asset.metadata || {};
  const tags = list(asset.tags || parentObj.tags);

  return {
    hasShotGrammar: Boolean(metadata.shotGrammar || metadata.shotType || parentObj.shotGrammar),
    hasMotionAffordances: Boolean(metadata.motion || metadata.motionAffordances || metadata.motionAffordance || metadata.loopPoints || parentObj.motionAffordances),
    hasEmotionalVectors: Boolean(metadata.emotion || metadata.emotionalVectors || metadata.emotionalIntensity || parentObj.emotionalVectors),
    hasRhythmicFlow: Boolean(metadata.rhythm || metadata.rhythmicFlow || parentObj.rhythmicFlow),
    hasContinuityTags: Boolean(tags.some((tag) => /era-|outfit-|version-/i.test(tag)) || parentObj.continuityTags),
    hasColorPalette: Boolean(metadata.colorPalette || metadata.colors || parentObj.colorPalette),
    hasObjects: Boolean(metadata.objects || metadata.nouns || parentObj.objects),
    hasActions: Boolean(metadata.actions || metadata.verbs || parentObj.actions),
    hasDuration: Boolean(metadata.duration !== undefined || metadata.length !== undefined || parentObj.duration !== undefined || asset.duration !== undefined),
    hasCharacters: Boolean(metadata.characterCount !== undefined || metadata.characters !== undefined || parentObj.characterCount !== undefined),
    hasNarrativeSummary: Boolean(metadata.narrativeSummary || parentObj.narrativeSummary),
    hasObjectiveSummary: Boolean(metadata.objectiveSummary || parentObj.objectiveSummary),
    hasFlowType: Boolean(metadata.flowType === "loop" || metadata.flowType === "progression" || parentObj.flowType === "loop" || parentObj.flowType === "progression"),
  };
}

export function scoreEchoVideoReadiness(asset = {}, parentObj = {}) {
  const metadata = asset.metadata || {};
  const checklist = getEchoMediaChecklist(asset, parentObj);
  const technicalAffordance = metadata.echosTechnicalAffordance || {};
  const truthFields = metadata.echosTruth?.fields || {};
  const placeholder = detectEchoPlaceholderMetadata({
    metadata,
    tags: asset.tags || parentObj.tags || [],
  });
  const placeholderAll = placeholder.isPlaceholder;

  const truth = Object.fromEntries(Object.entries(checklist).map(([key, present]) => [
    key,
    fieldStatus(present, placeholderAll),
  ]));
  if (asset.uri) truth.hasUri = ECHO_TRUTH_STATUS.VERIFIED;
  if (asset.thumbnailUri || asset.thumbnail?.uri) truth.hasThumbnail = ECHO_TRUTH_STATUS.VERIFIED;
  if (technicalAffordance.status === "verified") {
    if (technicalAffordance.durationSec || metadata.duration || asset.duration) truth.hasDuration = ECHO_TRUTH_STATUS.VERIFIED;
  }
  const fieldMap = {
    hasShotGrammar: "shotGrammar",
    hasMotionAffordances: "motionAffordances",
    hasObjects: "objects",
    hasActions: "actions",
    hasFlowType: "flowType",
  };
  for (const [checkKey, fieldKey] of Object.entries(fieldMap)) {
    const override = truthOverrideStatus(truthFields[fieldKey]);
    if (override && checklist[checkKey]) truth[checkKey] = override;
  }

  return {
    score: scoreStatuses(truth),
    checklist,
    truth,
    truthStatus: placeholderAll ? ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER : ECHO_TRUTH_STATUS.VERIFIED,
    placeholderSignals: placeholder.signals,
  };
}

function videoReport(asset, parentObj, source) {
  const readiness = scoreEchoVideoReadiness(asset, parentObj);
  const metadata = asset.metadata || {};
  return {
    id: asset.id || parentObj.id,
    title: asset.title || asset.name || parentObj.title || parentObj.name,
    source: source.kind,
    sourceId: source.id,
    uri: asset.uri,
    thumbnailUri: asset.thumbnailUri || asset.thumbnail?.uri || "",
    score: readiness.score,
    rawPresenceScore: Math.round((Object.values(readiness.checklist).filter(Boolean).length / Object.keys(readiness.checklist).length) * 100),
    checklist: readiness.checklist,
    truth: readiness.truth,
    truthStatus: readiness.truthStatus,
    placeholderSignals: readiness.placeholderSignals,
    colorPalette: metadata.colorPalette || [],
    objects: metadata.objects || [],
    actions: metadata.actions || [],
    duration: metadata.duration !== undefined ? metadata.duration : null,
    characterCount: metadata.characterCount !== undefined ? metadata.characterCount : null,
    narrativeSummary: metadata.narrativeSummary || "",
    objectiveSummary: metadata.objectiveSummary || "",
    flowType: metadata.flowType || "",
    tags: asset.tags || parentObj.tags || [],
  };
}

export function buildEchoGapsReport({ songbook = {}, itemStore = {}, sceneStore = {}, generatedAt = new Date().toISOString() } = {}) {
  const songCards = list(songbook.songCards);
  const songs = songCards.map((song) => {
    const readiness = scoreEchoSongReadiness(song);
    return {
      id: song.id,
      songId: song.songId,
      title: song.title,
      score: readiness.score,
      rawPresenceScore: Math.round((Object.values(readiness.checklist).filter(Boolean).length / Object.keys(readiness.checklist).length) * 100),
      checklist: readiness.checklist,
      truth: readiness.truth,
      truthStatus: readiness.truthStatus,
      placeholderSignals: readiness.placeholderSignals,
    };
  });

  const videos = [];
  let avatarCardVideos = 0;
  let sceneVideos = 0;

  for (const card of list(itemStore.cards)) {
    for (const asset of list(card.mediaAssets).filter((item) => item.type === "video")) {
      avatarCardVideos++;
      videos.push(videoReport(asset, card, { kind: "avatar_card", id: card.id }));
    }
  }

  for (const scene of list(sceneStore.scenes)) {
    for (const asset of list(scene.assets).filter((item) => item.type === "video")) {
      sceneVideos++;
      videos.push(videoReport(asset, scene, { kind: "scene", id: scene.id }));
    }
  }

  const average = (items) => items.length
    ? Math.round(items.reduce((sum, item) => sum + (Number(item.score) || 0), 0) / items.length)
    : 0;
  const averageRaw = (items) => items.length
    ? Math.round(items.reduce((sum, item) => sum + (Number(item.rawPresenceScore) || 0), 0) / items.length)
    : 0;

  const averageSongCompleteness = average(songs);
  const averageVideoCompleteness = average(videos);
  const placeholderSongs = songs.filter((song) => song.truthStatus === ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER).length;
  const placeholderVideos = videos.filter((video) => video.truthStatus === ECHO_TRUTH_STATUS.GENERATED_PLACEHOLDER).length;

  return {
    schemaVersion: "hapa.echos-gaps-report.v4",
    generatedAt,
    scoring: {
      contract: "hapa.echo.source-truth.v1",
      rule: "Scores distinguish verified/inferred data from generated placeholder metadata. rawPresenceScore preserves old checkbox completeness for comparison.",
      statuses: Object.values(ECHO_TRUTH_STATUS),
    },
    overallScore: Math.round((averageSongCompleteness + averageVideoCompleteness) / 2),
    rawPresenceOverallScore: Math.round((averageRaw(songs) + averageRaw(videos)) / 2),
    summary: {
      totalSongs: songCards.length,
      averageSongCompleteness,
      averageSongRawPresence: averageRaw(songs),
      placeholderSongs,
      totalVideos: videos.length,
      averageVideoCompleteness,
      averageVideoRawPresence: averageRaw(videos),
      placeholderVideos,
      verifiedVideos: videos.filter((video) => video.truthStatus === ECHO_TRUTH_STATUS.VERIFIED).length,
      avatarCardVideos,
      sceneVideos,
    },
    songs,
    videos,
  };
}
