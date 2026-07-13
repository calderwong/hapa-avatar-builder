const STOP = new Set(["the", "and", "for", "with", "from", "this", "that", "video", "scene", "card", "media", "shot", "into", "over", "under"]);

function tokens(values) {
  return [...new Set((Array.isArray(values) ? values : [values]).flatMap((value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/)).filter((value) => value.length > 2 && !STOP.has(value)))];
}

function overlap(wanted, offered) {
  if (!wanted.length || !offered.length) return null;
  const offeredSet = new Set(offered);
  return wanted.filter((value) => offeredSet.has(value)).length / wanted.length;
}

export function prepareSemanticMediaCandidate(asset, parent = {}) {
  const technical = asset.metadata?.echosTechnicalAffordance || {};
  const semantic = asset.metadata?.echosSemanticAffordance || {};
  const fieldValues = Object.values(semantic.fields || {}).flatMap((field) => Array.isArray(field?.value) ? field.value : [field?.value]);
  return {
    id: String(asset.id || asset.uri),
    title: String(asset.title || asset.name || parent.title || asset.id || "Untitled media"),
    uri: String(asset.uri || ""),
    posterUri: String(technical.posterUri || asset.thumbnailUri || ""),
    technical,
    semantic,
    tokens: tokens([asset.title, asset.name, parent.title, parent.name, fieldValues]),
    objects: tokens(semantic.fields?.objects?.value || asset.metadata?.objects || []),
    actions: tokens(semantic.fields?.actions?.value || asset.metadata?.actions || []),
    motion: semantic.fields?.motion?.value || asset.metadata?.motion || null,
    shotType: semantic.fields?.shotType?.value || asset.metadata?.shotType || null,
    flowType: asset.metadata?.flowType || null,
    truthStatus: technical.status === "verified-source-file" ? "technical-verified-semantic-inferred" : "unverified",
  };
}

export function rankSemanticMediaCandidates({ slot, candidates, canon = {}, contextPacket = null, lyricText = "", previous = [], pins = [], bans = [], topK = 5 }) {
  const wanted = tokens([slot.sectionLabel, slot.sectionType, lyricText, (canon.motifs || []).map((item) => item.token || item), canon.character?.avatarName]);
  const actionWanted = tokens([slot.sectionType, slot.editReason, lyricText]);
  const contextNodes = contextPacket ? [contextPacket.song, ...(contextPacket.allowedCharacters || []), ...(contextPacket.cards || []), ...(contextPacket.scenes || [])].filter(Boolean) : [];
  const contextTokens = tokens(contextNodes.flatMap((node) => [node.title, node.summary, node.tags]));
  const pinSet = new Set(pins);
  const banSet = new Set(bans);
  const previousSet = new Set(previous.slice(-6));
  const ranked = candidates.map((candidate) => {
    const hardFilters = [];
    if (!candidate.uri) hardFilters.push("missing-runtime-uri");
    if (banSet.has(candidate.id)) hardFilters.push("operator-ban");
    if (previousSet.has(candidate.id) && !pinSet.has(candidate.id)) hardFilters.push("recent-repeat-window");
    const motif = overlap(wanted, candidate.tokens);
    const objectAction = overlap(actionWanted, [...candidate.objects, ...candidate.actions]);
    const technicalTruth = candidate.technical?.status === "verified-source-file" ? 1 : 0;
    const exactContextNodes = contextNodes.filter((node) => (node.mediaAttachPack || []).some((media) => media.id === candidate.id));
    const contextOverlap = overlap(contextTokens, candidate.tokens);
    const contextValue = exactContextNodes.length ? 1 : contextOverlap;
    const contextEvidence = exactContextNodes.length
      ? exactContextNodes.map((node) => `${node.kind}:${node.id}:${node.source?.file || "source-unavailable"}${node.source?.linkPaths?.[0] || ""}`)
      : contextValue === null ? [] : contextNodes.filter((node) => tokens([node.title, node.summary, node.tags]).some((token) => candidate.tokens.includes(token))).slice(0, 4).map((node) => `${node.kind || "context"}:${node.id}:${node.source?.file || "source-unavailable"}${node.source?.linkPaths?.[0] || ""}`);
    const aspect = candidate.technical?.width && candidate.technical?.height
      ? (slot.preferredAspect === "portrait" ? candidate.technical.height > candidate.technical.width : candidate.technical.width >= candidate.technical.height) ? 1 : 0
      : null;
    const motion = slot.energy === null || slot.energy === undefined || !candidate.motion
      ? null
      : slot.energy >= 0.65 ? /continuous|progressive|motion/.test(candidate.motion) ? 1 : 0.25 : /loop|hold|still/.test(candidate.motion) ? 1 : 0.5;
    const components = {
      characterCanon: { value: contextValue, weight: 0.16, status: contextValue === null ? "unmeasured" : exactContextNodes.some((node) => node.humanVerified) ? "measured" : "inferred", evidence: contextEvidence },
      lyricMotif: { value: motif, weight: 0.25, status: motif === null ? "unmeasured" : "inferred", evidence: wanted.filter((value) => candidate.tokens.includes(value)) },
      emotion: { value: null, weight: 0.12, status: "unmeasured", evidence: [] },
      objectAction: { value: objectAction, weight: 0.15, status: objectAction === null ? "unmeasured" : "inferred", evidence: actionWanted.filter((value) => candidate.objects.includes(value) || candidate.actions.includes(value)) },
      shotRoleAspect: { value: aspect, weight: 0.10, status: aspect === null ? "unmeasured" : "measured", evidence: aspect === null ? [] : [`${candidate.technical.width}x${candidate.technical.height}`] },
      motionEnergy: { value: motion, weight: 0.10, status: motion === null ? "unmeasured" : "inferred", evidence: candidate.motion ? [candidate.motion] : [] },
      flowContinuity: { value: candidate.flowType ? 0.5 : null, weight: 0.04, status: candidate.flowType ? "inferred" : "unmeasured", evidence: candidate.flowType ? [candidate.flowType] : [] },
      technicalTruth: { value: technicalTruth, weight: 0.08, status: technicalTruth ? "measured" : "missing", evidence: technicalTruth ? [`sha256:${candidate.technical.contentHash?.value || "missing"}`] : [] },
    };
    const measured = Object.values(components).filter((component) => component.value !== null);
    const weight = measured.reduce((sum, component) => sum + component.weight, 0);
    const utility = weight ? measured.reduce((sum, component) => sum + component.value * component.weight, 0) / weight : null;
    const semanticStatuses = measured.filter((component) => component.status === "inferred");
    const confidence = utility === null ? null : Math.min(semanticStatuses.length ? 0.55 : 0.7, 0.25 + weight * 0.45);
    return {
      mediaId: candidate.id,
      title: candidate.title,
      uri: candidate.uri,
      posterUri: candidate.posterUri,
      eligible: hardFilters.length === 0 || pinSet.has(candidate.id),
      pinned: pinSet.has(candidate.id),
      hardFilters,
      utility: utility === null ? null : Number(utility.toFixed(4)),
      confidence: confidence === null ? null : Number(confidence.toFixed(3)),
      confidenceBasis: semanticStatuses.length ? "capped-inferred-unreviewed-semantic-metadata" : "measured-technical-only",
      components,
      evidenceArtifact: candidate.semantic?.artifactId || null,
      semanticTruth: candidate.semantic?.status || "unmeasured",
    };
  }).sort((left, right) => Number(right.pinned) - Number(left.pinned) || Number(right.eligible) - Number(left.eligible) || Number(right.utility ?? -1) - Number(left.utility ?? -1) || left.mediaId.localeCompare(right.mediaId));
  const eligible = ranked.filter((item) => item.eligible).slice(0, topK);
  return { schemaVersion: "hapa.echo.semantic-media-ranking.v2", selected: eligible[0] || null, alternatives: eligible.slice(1), rejected: ranked.filter((item) => !item.eligible).slice(0, topK), pins, bans, hardContinuityFilters: ["runtime-uri-required", "operator-bans", "six-shot-repeat-window"], confidenceRule: "Inferred-unreviewed semantic metadata is capped at 0.55 and never becomes verified truth." };
}
