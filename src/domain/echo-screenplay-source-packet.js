import crypto from "node:crypto";

export const ECHO_SCREENPLAY_SOURCE_PACKET_SCHEMA = "hapa.echo.screenplay-source-packet.v1";

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}

function hash(value) { return `sha256:${crypto.createHash("sha256").update(stable(value)).digest("hex")}`; }
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

function authoringInstruction(song, avatar, approvedSeeds, resolvedReferences, reservoir) {
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
      secondCharacterRule: "The Avatar seed is identity and continuity evidence, not a ban on every incidental seed-derived figure or animal. Additional subjects may remain when they strengthen the lyric or established Avatar ecology; reject them when they displace the count's primary action, create an unsupported relationship, or make the frame generic.",
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

export function buildEchoScreenplaySourcePacket({ song, project, telemetry, windows, avatar = null, approvedSeeds = [], process = null, mediaCards = null, graphEdges = [], referenceCatalog = [], albumConnectors = [] } = {}) {
  if (!song?.id) throw new Error("A canonical song record is required.");
  const index = processIndex(process, mediaCards);
  const allAssets = [...(avatar?.assets || []), ...(avatar?.mediaAssets || [])].map(compactAsset);
  const suppliedSeeds = approvedSeeds.map((seed) => ({
    id: seed.assetId || seed.id || null,
    name: seed.colorRole ? `${seed.colorRole}-approved-seed` : seed.name || null,
    type: "image",
    uri: seed.uri || null,
    localPath: seed.retrievalHandle || seed.localPath || null,
    requirementId: seed.sourceLineage?.role || seed.requirementId || null,
    tags: ["approved-seed", ...(seed.colorRole ? [seed.colorRole] : [])],
    confidence: seed.sourceLineage?.review === "existing-avatar-source" ? "direct" : "contextual",
    visualContribution: seed.visualContribution || null,
    sourceLineage: seed.sourceLineage || null,
  }));
  const seeds = (suppliedSeeds.length ? suppliedSeeds : allAssets.filter((asset) => asset.type === "image" || asset.type === "image/png" || asset.localPath)).slice(0, 24);
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
    authoringInstruction: authoringInstruction(song, avatar, seeds, resolvedSongReferences, albumContextReservoir),
    qualityPolicy: {
      lyricGrounding: "Every scene must cite local lyric overlap or a source-backed director affordance.",
      imageryDensity: "Every lyric-bearing count must make multiple mined elements visible: concrete nouns/symbols, an active verb or state change, and the count's concept/teaching. Do not substitute a generic mood portrait.",
      evidenceBoundary: "Do not promote reservoir context or candidate connectors into confirmed references.",
      referenceTranslation: "Read resolved references and the album reservoir for functional cues. Extract mechanics into original visual behavior, material rules, camera grammar, or causality; avoid protected source imagery and textual identifiers.",
      referenceDiversity: "A reference cue earns its place only when it materially changes the frame. Repeated mechanics must evolve rather than reproduce the same tableau.",
      continuity: "Carry forward the prior count's resolved visual state and leave a deliberate opening for the next count.",
      identity: "Preserve approved Avatar seed identity and wardrobe traits; use only authorized additional subjects.",
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
      "Extract a reference mechanic into original visual behavior; do not copy franchise-specific characters, logos, quotes, or distinctive designs.",
      "No process mutation: no claim, resume, provider call, image install, or media-card update.",
    ],
  };
  return { ...packet, packetHash: hash(packet) };
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
  if (!Array.isArray(packet?.approvedAvatarSeeds?.assets)) errors.push("approvedAvatarSeeds.assets");
  for (const row of packet?.referenceEvidence || []) if (!['direct', 'candidate', 'contextual'].includes(row.confidence)) errors.push("referenceEvidence.confidence");
  for (const window of packet?.fourCounts || []) if (!window.id || !window.continuity?.current) errors.push(`fourCounts:${window?.id || "unknown"}`);
  return { ok: errors.length === 0, errors };
}
