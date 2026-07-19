import crypto from "node:crypto";

export const ECHO_SCREENPLAY_SOURCE_PACKET_SCHEMA = "hapa.echo.screenplay-source-packet.v1";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value) { return `sha256:${crypto.createHash("sha256").update(stable(value)).digest("hex")}`; }
export function deriveEchoScreenplaySourcePacketHash(packet) {
  const content = structuredClone(packet || {});
  delete content.packetHash;
  return hash(content);
}
function compactAsset(asset) {
  const storage = asset?.metadata?.storage || asset?.storage || {};
  return {
    id: asset?.id || null,
    name: asset?.name || null,
    type: asset?.type || null,
    uri: asset?.uri || null,
    localPath: storage.path || null,
    requirementId: asset?.requirementId || null,
    tags: Array.isArray(asset?.tags) ? asset.tags : [],
    confidence: asset?.metadata?.intelligence?.confidence || "unverified",
  };
}

function confidence(row, fallback = "candidate") {
  const raw = String(row?.confidence || row?.classification || row?.truthStatus || row?.status || fallback).toLowerCase();
  if (/(direct|explicit|verified|hard)/u.test(raw)) return "direct";
  if (/(candidate|comparative|proposed|soft)/u.test(raw)) return "candidate";
  return "contextual";
}

function connectorEvidence(song) {
  return [
    ...(song?.referenceConnectors || []).map((row) => ({ ...row, source: "song.referenceConnectors", confidence: confidence(row) })),
    ...(song?.contextualLayers || []).map((row) => ({ ...row, source: "song.contextualLayers", confidence: confidence(row, "contextual") })),
  ];
}

function graphEvidence(songId, graphEdges = []) {
  return graphEdges
    .filter((edge) => JSON.stringify(edge).includes(songId))
    .map((edge) => ({ ...edge, source: "songStore.referenceGraphEdges", confidence: confidence(edge) }));
}

function unique(values) { return [...new Set(values.filter(Boolean))]; }

function normalizeLyricCoverageText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
}

const LYRIC_COVERAGE_STOPWORDS = new Set([
  "a", "an", "and", "are", "be", "been", "but", "for", "he", "her", "his", "i", "in", "is", "it", "my", "of", "on", "our", "said", "say", "she", "so", "that", "the", "their", "then", "they", "this", "to", "was", "we", "with", "you", "your",
]);

function distinctiveCoverageTokens(value) {
  return normalizeLyricCoverageText(value).split(" ").filter((token) => token.length >= 3 && !LYRIC_COVERAGE_STOPWORDS.has(token));
}

function packetLyricLineNumbers(packet) {
  const master = String(packet?.song?.lyricMaster?.text || "").split(/\r?\n/u)
    .map((text, index) => ({ lineNumber: index + 1, text: normalizeLyricCoverageText(text) }))
    .filter((line) => line.text);
  const timeline = [...new Map((packet?.fourCounts || []).flatMap((count) => count?.lyricOverlap || [])
    .filter((line) => line?.lineId)
    .sort((left, right) => (left.startSeconds ?? Number.MAX_SAFE_INTEGER) - (right.startSeconds ?? Number.MAX_SAFE_INTEGER))
    .map((line) => [line.lineId, line])).values()];
  const result = new Map();
  let masterIndex = 0;
  let cursor = 0;
  for (const line of timeline) {
    const text = normalizeLyricCoverageText(line?.text || line?.excerpt);
    if (!text) continue;
    let found = null;
    for (let index = masterIndex; index < master.length; index += 1) {
      const startAt = index === masterIndex ? cursor : 0;
      const position = master[index].text.indexOf(text, startAt);
      if (position >= 0) { found = { index, cursor: position + text.length }; break; }
    }
    if (!found) continue;
    masterIndex = found.index;
    cursor = found.cursor;
    result.set(line.lineId, master[masterIndex].lineNumber);
  }
  return result;
}

function countOverlapsConnector(count, connector, lineNumberById = new Map()) {
  const targetText = normalizeLyricCoverageText(connector?.target?.lyricText);
  const matchedText = normalizeLyricCoverageText(connector?.target?.matchedText);
  if (!targetText && !matchedText) return false;
  const lineStart = Number(connector?.target?.lineStart);
  const lineEnd = Number(connector?.target?.lineEnd ?? connector?.target?.lineStart);
  const mappedLines = (count?.lyricOverlap || []).map((overlap) => lineNumberById.get(overlap?.lineId)).filter(Number.isFinite);
  if (mappedLines.length && Number.isFinite(lineStart) && Number.isFinite(lineEnd)) {
    return mappedLines.some((lineNumber) => lineNumber >= lineStart && lineNumber <= lineEnd);
  }
  return (count?.lyricOverlap || []).some((overlap) => {
    const text = normalizeLyricCoverageText(overlap?.text || overlap?.excerpt);
    if (text.length < 4) return false;
    const distinctive = distinctiveCoverageTokens(text);
    if (!distinctive.length) return false;
    const matchedMatch = matchedText && (matchedText.includes(text) || text.includes(matchedText));
    const targetMatch = distinctive.length >= 2 && targetText && (targetText.includes(text) || text.includes(targetText));
    return Boolean(targetMatch || matchedMatch);
  });
}

/**
 * Fail closed when an authored tranche reaches a lyric-backed reference but
 * never records that connector in any overlapping count. This prevents
 * `explicitNoReferenceApplies` from bypassing the source packet.
 */
export function validateEchoScreenplayReferenceCoverage(records, packet) {
  const authoredById = new Map((records || []).map((record) => [record?.countId, record]));
  const packetCounts = new Map((packet?.fourCounts || []).map((count) => [count?.id, count]));
  const songConnectorEvidence = (packet?.referenceEvidence || []).filter((row) => row?.source === "song.referenceConnectors"
    && row?.id
    && (!row?.target?.songId || row.target.songId === packet?.song?.id));
  const knownConnectorIds = new Set(songConnectorEvidence.map((row) => row.id));
  const connectorById = new Map(songConnectorEvidence.map((row) => [row.id, row]));
  const lineNumberById = packetLyricLineNumbers(packet);
  const mechanics = (records || []).flatMap((record) => (record?.semanticExtraction?.referenceMechanics || [])
    .map((mechanic) => ({ countId: record.countId, connectorId: mechanic?.connectorId || null, evidenceStatus: mechanic?.evidenceStatus || "" })));
  const unexpectedConnectorIds = unique(mechanics.map((row) => row.connectorId).filter((id) => id && !knownConnectorIds.has(id)));
  const promotedCandidateMechanics = mechanics.filter((row) => {
    const confidence = connectorById.get(row.connectorId)?.confidence;
    if (!['candidate', 'contextual'].includes(confidence)) return false;
    return /\b(verified|confirmed|direct|explicit|canon|canonical)\b/u.test(String(row.evidenceStatus).toLowerCase());
  });
  const required = songConnectorEvidence.map((connector) => {
    const applicableCountIds = [...authoredById.keys()].filter((countId) => countOverlapsConnector(packetCounts.get(countId), connector, lineNumberById));
    const coveredCountIds = applicableCountIds.filter((countId) => (authoredById.get(countId)?.semanticExtraction?.referenceMechanics || [])
      .some((mechanic) => mechanic?.connectorId === connector.id));
    return {
      connectorId: connector.id,
      referenceId: connector.referenceId || null,
      confidence: connector.confidence || "contextual",
      applicableCountIds,
      coveredCountIds,
      covered: applicableCountIds.length === 0 || coveredCountIds.length > 0,
    };
  }).filter((row) => row.applicableCountIds.length > 0);
  const missingConnectorIds = required.filter((row) => !row.covered).map((row) => row.connectorId);
  const errors = [
    ...missingConnectorIds.map((id) => `missing overlapping reference mechanic: ${id}`),
    ...unexpectedConnectorIds.map((id) => `reference mechanic is not in the immutable song packet: ${id}`),
    ...promotedCandidateMechanics.map((row) => `candidate/contextual connector was promoted by evidenceStatus in ${row.countId}: ${row.connectorId}`),
  ];
  return {
    ok: errors.length === 0,
    authoredCountRecords: authoredById.size,
    applicableConnectors: required.length,
    coveredConnectors: required.filter((row) => row.covered).length,
    missingConnectorIds,
    unexpectedConnectorIds,
    promotedCandidateMechanics,
    connectorCoverage: required,
    errors,
  };
}

function normalizedSeed(seed) {
  return {
    assetId: seed?.assetId || seed?.id || null,
    avatarId: seed?.avatarId || null,
    contentHash: seed?.contentHash || null,
    retrievalHandle: seed?.retrievalHandle || seed?.localPath || null,
  };
}

/** Bind every runtime seed and cast record to the packet's approved assets. */
export function validateEchoScreenplaySeedBinding(screenplay, packet) {
  const primaryAvatarId = packet?.approvedAvatarSeeds?.avatarId || packet?.castAttribution?.primary?.avatarId || null;
  const packetSeeds = [
    ...(packet?.approvedAvatarSeeds?.assets || []),
    ...(packet?.castAttribution?.additional || []).flatMap((member) => member?.seedAssets || []),
  ].map(normalizedSeed);
  const approvedByAssetId = new Map(packetSeeds.map((seed) => [seed.assetId, seed]));
  const screenplaySeeds = (screenplay?.avatarContinuity?.seedAssets || []).map(normalizedSeed);
  const errors = [];
  for (const seed of screenplaySeeds) {
    const approved = approvedByAssetId.get(seed.assetId);
    if (!approved) errors.push(`unapproved screenplay seed assetId: ${seed.assetId || "missing"}`);
    else for (const key of ["avatarId", "contentHash", "retrievalHandle"]) {
      if (seed[key] !== approved[key]) errors.push(`screenplay seed ${seed.assetId} ${key} does not match packet`);
    }
  }
  if (!screenplaySeeds.some((seed) => seed.avatarId === primaryAvatarId && approvedByAssetId.has(seed.assetId))) {
    errors.push(`screenplay is missing an approved primary Avatar seed for ${primaryAvatarId || "unknown"}`);
  }
  const packetCast = new Map((packet?.castAttribution?.additional || []).map((member) => [member.avatarId, member]));
  for (const member of screenplay?.avatarContinuity?.castAttribution || []) {
    const approved = packetCast.get(member?.avatarId);
    if (!approved) errors.push(`screenplay cast member is not attributed by packet: ${member?.avatarId || "missing"}`);
    else for (const key of ["castClass", "species", "baseCharacterId"]) {
      if (member?.[key] !== approved?.[key]) errors.push(`screenplay cast ${member.avatarId} ${key} does not match packet`);
    }
  }
  return {
    ok: errors.length === 0,
    primaryAvatarId,
    approvedSeedCount: packetSeeds.length,
    screenplaySeedCount: screenplaySeeds.length,
    errors,
  };
}

/** Ensure authored lyric citations are local packet evidence, not invented text. */
export function validateEchoScreenplayLyricCitationCoverage(records, packet) {
  const packetCounts = new Map((packet?.fourCounts || []).map((count) => [count?.id, count]));
  const errors = [];
  let lyricBearingCounts = 0;
  for (const record of records || []) {
    const source = packetCounts.get(record?.countId);
    if (!source) { errors.push(`authored count is not in packet: ${record?.countId || "missing"}`); continue; }
    const overlaps = source.lyricOverlap || [];
    const citations = record?.semanticExtraction?.lyricCitations || [];
    if (!overlaps.length) {
      if (citations.length) errors.push(`instrumental count cites lyrics absent from packet: ${record.countId}`);
      continue;
    }
    lyricBearingCounts += 1;
    if (!citations.length) { errors.push(`lyric-bearing count has no packet citation: ${record.countId}`); continue; }
    for (const citation of citations) {
      const candidates = overlaps.filter((overlap) => overlap?.lineId === citation?.lineId);
      if (!candidates.length) { errors.push(`citation lineId is not local to ${record.countId}: ${citation?.lineId || "missing"}`); continue; }
      const cited = normalizeLyricCoverageText(citation?.excerpt);
      const matches = candidates.some((overlap) => {
        const text = normalizeLyricCoverageText(overlap?.text || overlap?.excerpt);
        return cited && distinctiveCoverageTokens(cited).length > 0 && (text.includes(cited) || cited.includes(text));
      });
      if (!matches) errors.push(`citation excerpt does not match packet lyric in ${record.countId}: ${citation?.lineId || "missing"}`);
    }
  }
  return { ok: errors.length === 0, authoredCountRecords: (records || []).length, lyricBearingCounts, errors };
}

function promptSafeReference(reference, connectors = [], edges = []) {
  const connectorEffects = connectors.map((connector) => connector.semanticEffect || {});
  const relatedEdges = edges.filter((edge) => edge.fromReferenceId === reference.id || edge.toReferenceId === reference.id);
  return {
    referenceId: reference.id,
    title: reference.title || reference.id,
    kind: reference.kind || "unknown",
    publicContext: reference.publicContext || "",
    themes: unique([...(reference.themes || []), ...connectorEffects.flatMap((effect) => effect.traversalEdges || [])]),
    traversalTerms: reference.traversalTerms || [],
    promptSafeMechanics: unique([
      ...connectorEffects.flatMap((effect) => effect.traversalEdges || []),
      ...relatedEdges.flatMap((edge) => edge.sharedMechanics || []),
    ]),
    connectorClaims: connectors.map((connector) => ({
      id: connector.id,
      confidence: connector.confidence,
      lyricTarget: connector.target || null,
      semanticEffect: connector.semanticEffect || null,
      provenance: connector.provenance || null,
    })),
    graphConnections: relatedEdges.map((edge) => ({
      id: edge.id,
      relationType: edge.relationType,
      sharedMechanics: edge.sharedMechanics || [],
      sharedThemes: edge.sharedThemes || [],
      traversalEffect: edge.traversalEffect || null,
      evidenceClass: edge.evidenceClass || "contextual",
      provenance: edge.provenance || null,
    })),
    sourceProvenance: reference.source || null,
    catalogStatus: reference.reviewStatus || reference.canonStatus || "unverified",
    visualPolicy: "Use themes/mechanics as original visual behavior only; never copy named characters, logos, distinctive props, maps, costume silhouettes, or quoted text.",
  };
}

function authoringInstruction(song, avatar, approvedSeeds, resolvedReferences, reservoir, castAttribution) {
  const text = String(song?.lyrics?.text || "").toLowerCase();
  const picks = (items) => items.filter((item) => text.includes(item));
  const nouns = picks(["notification", "scroll", "static", "frame", "books", "paint", "skin", "trace", "map", "nodes", "stream", "screens", "timestamp", "hearts", "signals", "playlist", "emoji", "code", "glance", "layers", "lock"]);
  const verbs = picks(["watch", "post", "freeze", "pause", "know", "feel", "zoom", "map", "hide", "see", "repeat", "save", "play", "grow", "write", "meet", "run", "disconnect", "choose"]);
  const avatarName = avatar?.primaryName || song?.performancePerspective?.avatarName || "the approved Avatar";
  return {
    compactBrief: "Analyze the complete song first. Build every four-count from its local nouns, verbs, action, concept, teaching, symbols, wordplay, and evidence-bounded reference mechanics. Make those sources visible in the frame rather than reducing the song to a repeated mood or portrait.",
    miningRule: "The noun/verb hints below are non-exhaustive lexical cues only. The direct LLM author must independently mine the complete lyric master and full reference packet; it may not use these hints as a deterministic scene generator.",
    nouns,
    verbs,
    actionGrammar: `${avatarName} performs a lyric-grounded verb on or through concrete lyric nouns; the action changes an object, environment, relationship, camera condition, or carried material before the count ends.`,
    concepts: ["uncertain knowing", "provenance versus proof", "parallel connection", "choice under constraint", "semantic traces"],
    teaching: "A frame can hold a trace without becoming a verdict; a signal can imply relation without entitlement.",
    symbols: picks(["11:23", "frame", "trace", "map", "node", "stream", "signal", "parallel", "lock"]),
    referenceUse: {
      songEvidenceCount: resolvedReferences.length,
      reservoirCount: reservoir.length,
      rule: "Song-resolved references may guide an original mechanic at their recorded confidence. Reservoir entries are album context only and never evidence that this song references that work.",
      diversityRule: "Read the available reference works as functional scene vocabulary. When a reference or reservoir mechanic materially clarifies the count, translate it into an original action, spatial rule, material behavior, camera grammar, or consequence. Do not add a decorative franchise label, and do not force a reference where none improves the lyric.",
      evolutionRule: "Do not reuse one reference mechanic as the same tableau throughout a sequence. If it recurs, evolve its consequence, scale, material, or relationship so the graph visibly accumulates meaning.",
    },
    avatarConsistency: {
      avatarId: avatar?.id || song?.performancePerspective?.avatarId || null,
      identityRule: "Keep the supplied avatar's face, hair, recognizable wardrobe silhouette, and approved seed traits stable while varying location, shot, scale, lighting, and one symbolic transformation.",
      approvedSeedContributions: approvedSeeds.map((seed) => seed.visualContribution).filter(Boolean),
      secondCharacterRule: "The primary Red/Blue/Green Avatar remains the director anchor. A resolved referenced Avatar may join only in counts where lyric/reference evidence supports that presence. Evergreen cast may join any song when their action materially strengthens the scene. Never turn a name-only lyric match into a new embodied person, invent a relationship, or replace the primary Avatar by accident.",
      castSelectionRule: "For each count, choose the smallest useful cast. Record every on-screen Avatar in castAppearances, bind each one to its own approved seed, and state the visible action that earns its presence. A referenced Avatar is additional cast on top of the primary anchor, not a costume for the primary Avatar.",
      evergreenVariationRule: "Thorsun, Little Toe, Calder, and Bo are alternate styled embodiments of the same approved character base as Red/Blue/Green. Thor is a cat, Leo is a dog, and Falka/Mimi is a cyber-engineer/captain Avatar. Use them as optional evergreen supporting cast for visual variety, but preserve their registered styling/species and do not add them as generic decoration.",
      resolvedCast: castAttribution.map((member) => ({
        avatarId: member.avatarId,
        name: member.name,
        castClass: member.castClass,
        species: member.species || "human",
        baseCharacterId: member.baseCharacterId || member.avatarId,
        evidenceStatus: member.evidenceStatus,
        appearanceRule: member.appearanceRule,
      })),
    },
    frameQualityFloor: {
      concreteAnchors: "For lyric-bearing counts, make at least two mined lyric elements materially visible, normally a noun/symbol plus a verb/state change. Instrumental counts must instead use source-backed section, energy, continuity, and reference mechanics.",
      cinematicSpecificity: "Name a specific location, subject action, affected object/material, composition, lens or camera position, light source, palette, and energy. The image should still be distinguishable from adjacent counts if the Avatar were removed.",
      semanticPayoff: "The justification must explain why this exact image belongs at this exact four-count and what contextual layer changes the viewer's reading.",
      antiSameness: "Do not default to a standing Avatar in the same forest/corridor/background. Change location, scale, material, physical verb, lens, or spatial mechanic whenever the lyric/reference context supports it.",
    },
  };
}

function processIndex(process, mediaCards) {
  const counts = new Map((process?.counts || []).map((count) => [count.id, count]));
  const cards = new Map((mediaCards?.cards || []).map((card) => [card.countId, card]));
  return { counts, cards };
}

function countState(window, index) {
  const count = index.counts.get(window.id);
  const card = index.cards.get(window.id);
  const prompt = count?.lanes?.prompt?.artifact?.result || null;
  const image = count?.lanes?.image?.artifact?.result || card || null;
  return {
    prompt: { state: count?.lanes?.prompt?.artifact?.state || "missing", sceneText: prompt?.sceneText || null, contentHash: count?.lanes?.prompt?.artifact?.contentHash || null },
    keyframe: { state: count?.lanes?.image?.artifact?.state || (card?.keyframeExists ? "keyframe_exists" : "missing"), localPath: image?.localPath || null, contentHash: count?.lanes?.image?.artifact?.contentHash || card?.contentHash || null },
    video: { state: count?.lanes?.video?.artifact?.state || "missing", quest: count?.lanes?.video?.quest?.status || "held" },
  };
}

export function buildEchoScreenplaySourcePacket({ song, project, telemetry, windows, avatar = null, approvedSeeds = [], evergreenCast = [], referencedAvatarCast = [], process = null, mediaCards = null, graphEdges = [], referenceCatalog = [], albumConnectors = [] } = {}) {
  if (!song?.id) throw new Error("A canonical song record is required.");
  const index = processIndex(process, mediaCards);
  const allAssets = [...(avatar?.assets || []), ...(avatar?.mediaAssets || [])].map(compactAsset);
  const suppliedSeeds = approvedSeeds.map((seed) => ({
    id: seed.assetId || seed.id || null,
    avatarId: seed.avatarId || avatar?.id || song?.performancePerspective?.avatarId || null,
    colorRole: seed.colorRole || null,
    castRole: seed.castRole || "primary",
    species: seed.species || "human",
    baseCharacterId: seed.baseCharacterId || seed.avatarId || avatar?.id || song?.performancePerspective?.avatarId || null,
    name: seed.colorRole ? `${seed.colorRole}-approved-seed` : seed.name || null,
    type: "image",
    uri: seed.uri || null,
    localPath: seed.retrievalHandle || seed.localPath || null,
    contentHash: seed.contentHash || null,
    requirementId: seed.sourceLineage?.role || seed.requirementId || null,
    tags: ["approved-seed", ...(seed.colorRole ? [seed.colorRole] : [])],
    confidence: seed.sourceLineage?.review === "existing-avatar-source" ? "direct" : "contextual",
    identityInvariants: Array.isArray(seed.identityInvariants) ? seed.identityInvariants : [],
    visualContribution: seed.visualContribution || null,
    sourceLineage: seed.sourceLineage || null,
  }));
  const seeds = (suppliedSeeds.length ? suppliedSeeds : allAssets.filter((asset) => asset.type === "image" || asset.type === "image/png" || asset.localPath)).slice(0, 24);
  const castAttribution = [...evergreenCast, ...referencedAvatarCast].map((member) => ({
    avatarId: member.avatarId,
    name: member.name,
    aliases: member.aliases || [],
    castClass: member.castClass,
    species: member.species || "human",
    baseCharacterId: member.baseCharacterId || member.avatarId,
    evidenceStatus: member.evidenceStatus || (member.castClass === "evergreen" ? "user-authorized-evergreen" : "unresolved"),
    sourceAttribution: member.sourceAttribution || null,
    connectorIds: member.connectorIds || [],
    appearanceRule: member.appearanceRule || (member.castClass === "evergreen"
      ? "May appear when the count-level action materially benefits from this cast member; never required."
      : "May appear only where the song evidence supports this Avatar identity or role."),
    relationshipBounds: member.relationshipBounds || ["Do not infer romance, kinship, ownership, or identity equivalence from a shared name."],
    seedAssets: (member.seedAssets || []).map((seed) => ({ ...seed })),
  }));
  const evidence = [...connectorEvidence(song), ...graphEvidence(song.id, graphEdges)];
  const catalogById = new Map(referenceCatalog.map((reference) => [reference.id, reference]));
  const songConnectors = song?.referenceConnectors || [];
  const resolvedSongReferences = [...new Map(songConnectors.filter((connector) => catalogById.has(connector.referenceId)).map((connector) => [connector.referenceId, connector])).keys()]
    .map((referenceId) => promptSafeReference(catalogById.get(referenceId), songConnectors.filter((connector) => connector.referenceId === referenceId), graphEdges));
  const songReferenceIds = new Set(resolvedSongReferences.map((reference) => reference.referenceId));
  const albumReferenceIds = new Set(albumConnectors.map((connector) => connector.referenceId).filter(Boolean));
  const albumContextReservoir = referenceCatalog
    .filter((reference) => albumReferenceIds.has(reference.id) && !songReferenceIds.has(reference.id))
    .map((reference) => ({
      ...promptSafeReference(reference, albumConnectors.filter((connector) => connector.referenceId === reference.id), graphEdges),
      evidenceStatus: "not-inherited-album-context",
      reservoirRule: "This is a discovery lens from other Echo songs. It is not evidence that the current song alludes to this work.",
    }));
  const packet = {
    schemaVersion: ECHO_SCREENPLAY_SOURCE_PACKET_SCHEMA,
    mode: "read-only-source-packet",
    mutationPolicy: "This packet reads project, song, process, and media-card state. It cannot claim, resume, install, or generate.",
    song: {
      id: song.id,
      title: song.title || null,
      lyricMaster: song.lyrics || null,
      performancePerspective: song.performancePerspective || null,
      sourceConfidence: song.lyrics?.status === "matched_exact" ? "direct" : "contextual",
    },
    directorContext: {
      projectFileRole: project ? "matching-music-video-project" : "missing",
      canonAffordanceGraph: project?.canon_affordance_graph || null,
      songEditMap: project?.song_edit_map || null,
      localSpine: project?.local_spine || null,
      perspective: project?.perspective || null,
      visualAffordances: project?.visual_affordances || project?.canon_affordance_graph?.visual_affordances || [],
    },
    timing: {
      telemetryStatus: telemetry?.status || "missing",
      telemetryRunId: telemetry?.runId || null,
      durationSeconds: telemetry?.duration ?? project?.duration ?? null,
      windowCount: windows.length,
      truthStatus: telemetry?.status === "complete" ? "measured-source-audio" : "needs_timing_truth",
    },
    referenceEvidence: evidence,
    resolvedSongReferences,
    albumContextReservoir,
    evidenceSummary: {
      direct: evidence.filter((row) => row.confidence === "direct").length,
      candidate: evidence.filter((row) => row.confidence === "candidate").length,
      contextual: evidence.filter((row) => row.confidence === "contextual").length,
      rule: "Candidate/contextual connectors are prompts for review, not confirmed source intent or licensed visual direction.",
    },
    approvedAvatarSeeds: {
      avatarId: avatar?.id || song.performancePerspective?.avatarId || null,
      avatarName: avatar?.primaryName || song.performancePerspective?.avatarName || null,
      assets: seeds,
      rule: "Use only explicitly supplied/approved seed assets. Do not invent a second embodied character from a reference hypothesis.",
    },
    castAttribution: {
      primary: {
        avatarId: avatar?.id || song.performancePerspective?.avatarId || null,
        name: avatar?.primaryName || song.performancePerspective?.avatarName || null,
        castClass: "primary-director-avatar",
        seedAssets: seeds,
      },
      additional: castAttribution,
      rule: "Primary Red/Blue/Green identity anchors the song. Referenced Avatars and evergreen cast are additional, count-selected embodiments with distinct seed provenance.",
    },
    authoringInstruction: authoringInstruction(song, avatar, seeds, resolvedSongReferences, albumContextReservoir, castAttribution),
    qualityPolicy: {
      lyricGrounding: "Every scene must cite local lyric overlap or a source-backed director affordance.",
      imageryDensity: "Every lyric-bearing count must make multiple mined elements visible: concrete nouns/symbols, an active verb or state change, and the count's concept/teaching. Do not substitute a generic mood portrait.",
      evidenceBoundary: "Do not promote reservoir context or candidate connectors into confirmed references.",
      referenceTranslation: "Read resolved references and the album reservoir for functional cues. Extract mechanics into original visual behavior, material rules, camera grammar, or causality; avoid protected source imagery and textual identifiers.",
      referenceDiversity: "A reference cue earns its place only when it materially changes the frame. Repeated mechanics must evolve rather than reproduce the same tableau.",
      continuity: "Carry forward the prior count's resolved visual state and leave a deliberate opening for the next count.",
      identity: "Preserve each approved Avatar's identity, wardrobe/species traits, and seed provenance. Keep the primary director Avatar anchored while allowing authorized additional cast to perform lyric-backed actions.",
      acceptancePriority: "Review semantic attachment, visible lyric action, reference payoff, composition, and continuity before incidental subject exclusions. Seed-derived animals/figures are acceptable when coherent and non-displacing.",
    },
    fourCounts: windows.map((window, position) => ({
      ...window,
      continuity: {
        previous: position ? { id: windows[position - 1].id, ...countState(windows[position - 1], index) } : null,
        current: countState(window, index),
        next: position < windows.length - 1 ? { id: windows[position + 1].id, ...countState(windows[position + 1], index) } : null,
      },
    })),
    constraints: [
      "Do not treat a candidate connector as confirmed canon.",
      "Do not embody a referenced Avatar from name similarity alone; require an explicit cast attribution record.",
      "Every on-screen additional Avatar must have a count-level castAppearance and a supplied seed asset.",
      "Extract a reference mechanic into original visual behavior; do not copy franchise-specific characters, logos, quotes, or distinctive designs.",
      "No process mutation: no claim, resume, provider call, image install, or media-card update.",
    ],
  };
  const sourceRevision = {
    songContextHash: hash({ song: packet.song, directorContext: packet.directorContext }),
    lyricsHash: hash(packet.song.lyricMaster),
    timingHash: hash({ timing: packet.timing, windows: packet.fourCounts.map(({ continuity: _continuity, ...window }) => window) }),
    referenceGraphHash: hash({ evidence: packet.referenceEvidence, resolved: packet.resolvedSongReferences, reservoir: packet.albumContextReservoir }),
    seedSetHash: hash({ primary: packet.approvedAvatarSeeds.assets, additional: packet.castAttribution.additional.map((member) => ({ avatarId: member.avatarId, seedAssets: member.seedAssets })) }),
    directorTreatmentHash: hash(packet.directorContext),
    promptPolicyHash: hash({ authoringInstruction: packet.authoringInstruction, qualityPolicy: packet.qualityPolicy, constraints: packet.constraints }),
  };
  const revisionedPacket = { ...packet, sourceRevision };
  return { ...revisionedPacket, packetHash: deriveEchoScreenplaySourcePacketHash(revisionedPacket) };
}

export function validateEchoScreenplaySourcePacket(packet) {
  const errors = [];
  if (packet?.schemaVersion !== ECHO_SCREENPLAY_SOURCE_PACKET_SCHEMA) errors.push("schemaVersion");
  if (!packet?.song?.id) errors.push("song.id");
  if (!Array.isArray(packet?.fourCounts)) errors.push("fourCounts");
  if (!Array.isArray(packet?.referenceEvidence)) errors.push("referenceEvidence");
  if (!Array.isArray(packet?.resolvedSongReferences)) errors.push("resolvedSongReferences");
  if (!Array.isArray(packet?.albumContextReservoir)) errors.push("albumContextReservoir");
  if (!packet?.authoringInstruction || !packet?.qualityPolicy) errors.push("authoringInstruction/qualityPolicy");
  for (const key of ["songContextHash", "lyricsHash", "timingHash", "referenceGraphHash", "seedSetHash", "directorTreatmentHash", "promptPolicyHash"]) {
    if (!/^sha256:[a-f0-9]{64}$/u.test(String(packet?.sourceRevision?.[key] || ""))) errors.push(`sourceRevision.${key}`);
  }
  if (!Array.isArray(packet?.approvedAvatarSeeds?.assets)) errors.push("approvedAvatarSeeds.assets");
  for (const seed of packet?.approvedAvatarSeeds?.assets || []) {
    if (!seed?.id || !seed?.localPath) errors.push(`approvedAvatarSeeds.asset:${seed?.id || "missing"}`);
    if (!/^sha256:[a-f0-9]{64}$/u.test(String(seed?.contentHash || ""))) errors.push(`approvedAvatarSeeds.contentHash:${seed?.id || "missing"}`);
  }
  if (!packet?.castAttribution?.primary?.avatarId || !Array.isArray(packet?.castAttribution?.additional)) errors.push("castAttribution");
  const castIds = new Set();
  for (const member of packet?.castAttribution?.additional || []) {
    if (!member.avatarId || castIds.has(member.avatarId)) errors.push(`castAttribution:${member?.avatarId || "missing"}`);
    castIds.add(member.avatarId);
    if (!["evergreen", "referenced-avatar"].includes(member.castClass) || !member.species || !member.evidenceStatus) errors.push(`castAttribution.policy:${member.avatarId}`);
    if (!Array.isArray(member.seedAssets) || !member.seedAssets.length) errors.push(`castAttribution.seedAssets:${member.avatarId}`);
    for (const seed of member.seedAssets || []) {
      if (!/^sha256:[a-f0-9]{64}$/u.test(String(seed?.contentHash || ""))) errors.push(`castAttribution.seedContentHash:${member.avatarId}`);
    }
  }
  for (const row of packet?.referenceEvidence || []) if (!['direct', 'candidate', 'contextual'].includes(row.confidence)) errors.push("referenceEvidence.confidence");
  for (const window of packet?.fourCounts || []) if (!window.id || !window.continuity?.current) errors.push(`fourCounts:${window?.id || "unknown"}`);
  if (packet?.packetHash !== deriveEchoScreenplaySourcePacketHash(packet)) errors.push("packetHash");
  return { ok: errors.length === 0, errors };
}
