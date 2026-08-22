const list = (value) => Array.isArray(value) ? value.filter(Boolean) : [];
const text = (value) => String(value || "").trim();
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function decisionFor(video = {}) {
  const decision = video.quickSortDecision || null;
  return decision?.state === "accepted" ? decision : null;
}

function physicalIdentity(video = {}) {
  return text(video.humanVideoKey)
    || (text(video.contentFingerprint) && `fingerprint:${text(video.contentFingerprint)}`)
    || (text(video.uri) && `uri:${text(video.uri)}`)
    || (text(video.sourcePath) && `path:${text(video.sourcePath)}`)
    || "";
}

function sha256For(video = {}) {
  const fingerprint = text(video.contentFingerprint || physicalIdentity(video).replace(/^fingerprint:/, ""));
  return fingerprint.replace(/^sha256:/, "").toLowerCase().match(/^[a-f0-9]{64}$/)?.[0] || "";
}

function primaryRelationship(video = {}) {
  const priority = ["avatar", "scene", "item", "tarot", "song", "library"];
  const relationships = list(video.relationships);
  const rank = (ownerType) => {
    const index = priority.indexOf(ownerType);
    return index < 0 ? priority.length : index;
  };
  return relationships.slice().sort((a, b) => rank(a.ownerType) - rank(b.ownerType))[0] || {
    ownerType: video.ownerType || "library",
    ownerId: video.ownerId || "system-media",
    ownerName: video.ownerName || "System Media Library",
  };
}

function motionRole(video = {}) {
  const haystack = [video.name, video.role, video.documentKind, ...list(video.tags)].join(" ").toLowerCase();
  if (/\b(loop|idle|hold|ambient)\b/.test(haystack)) return "loop";
  if (/\b(transition|morph|bridge|connector|wipe|cut)\b/.test(haystack)) return "transition";
  return "neutral";
}

function cardKind(ownerType = "") {
  if (["avatar", "scene", "item", "tarot", "song"].includes(ownerType)) return ownerType;
  return "media";
}

function cardRefFor(relationship = {}) {
  const roots = {
    avatar: "data/avatar-store.json#avatars",
    scene: "data/scene-store.json#scenes",
    item: "data/item-manager-store.json#cards",
    tarot: "data/tarot-store.json#cards",
    song: "data/hapa-songs-store.json#songs",
  };
  const root = roots[relationship.ownerType];
  return root && relationship.ownerId ? `${root}/${relationship.ownerId}` : "data/media-library.json#records";
}

/**
 * Join machine-derived visual telemetry (palette + description) from the
 * human-accepted visual enrichment store onto a video. `index` is the
 * alias → record map from `buildVisualEnrichmentAliasIndex`; the video's own
 * key is tried first, then each of its aliases. Returns `null` when the video
 * has no stored visual enrichment.
 */
export function visualEnrichmentForVideo(index, video = {}) {
  if (!(index instanceof Map) || index.size === 0) return null;
  const aliases = [
    text(video.humanVideoKey),
    ...list(video.humanVideoAliases),
    ...list(video.identityAliases),
    video.contentFingerprint && `fingerprint:${text(video.contentFingerprint)}`,
    video.uri && `uri:${text(video.uri)}`,
    video.sourcePath && `path:${text(video.sourcePath)}`,
    video.id,
  ].filter(Boolean);
  for (const alias of aliases) {
    const record = index.get(String(alias).toLowerCase());
    if (record && (record.palette || record.description)) return record;
  }
  return null;
}

/**
 * Compact director-facing copy of a stored palette: the color profile plus the
 * top swatches, without the extraction provenance block (the director only
 * consumes color, not ffmpeg bookkeeping).
 */
function directorPalette(palette = null) {
  if (!palette || !Array.isArray(palette.swatches) || !palette.swatches.length) return null;
  return {
    methodVersion: text(palette.methodVersion) || "local-median-cut-v1",
    swatches: palette.swatches.map((swatch) => ({ hex: text(swatch.hex), share: Number(swatch.share) || 0 })),
    luminance: Number(palette.luminance) || 0,
    saturation: Number(palette.saturation) || 0,
    hueHistogram: Array.isArray(palette.hueHistogram) && palette.hueHistogram.length === 12
      ? palette.hueHistogram.map((bin) => Number(bin) || 0)
      : new Array(12).fill(0),
    warmth: Number(palette.warmth) || 0,
    chromaShare: Number(palette.chromaShare) || 0,
    frameSource: text(palette.source?.frameSource) || "video-file",
  };
}

export function buildHumanAcceptedDirectorCandidates(videos = [], options = {}) {
  const byIdentity = new Map();
  for (const video of list(videos)) {
    const decision = decisionFor(video);
    const identity = physicalIdentity(video);
    if (!decision || video.mediaType !== "video" || !text(video.uri) || !identity) continue;
    if (typeof options.isReadable === "function" && !options.isReadable(video)) continue;
    const relationship = primaryRelationship(video);
    const role = motionRole(video);
    const sha256 = sha256For(video);
    const aliases = [...new Set([identity, ...list(video.humanVideoAliases), ...list(video.identityAliases)].map(text).filter(Boolean))];
    const candidate = {
      id: `human-accepted:${video.id || identity}`,
      mediaLibraryId: video.id || identity,
      cardId: relationship.ownerId || video.ownerId || "system-media",
      cardKind: cardKind(relationship.ownerType),
      cardRef: cardRefFor(relationship),
      cardTitle: relationship.ownerName || video.ownerName || "System Media Library",
      ownerId: relationship.ownerId || video.ownerId || "system-media",
      ownerTitle: relationship.ownerName || video.ownerName || "System Media Library",
      title: video.name || video.id || identity,
      uri: video.uri,
      runtimeUri: video.runtimeUri || video.uri,
      posterUri: video.posterUri || video.thumbnailUri || video.asset?.thumbnailUri || "",
      sourcePath: video.sourcePath || "",
      sha256,
      technicalIdentity: identity,
      duration: finite(video.duration),
      width: finite(video.width),
      height: finite(video.height),
      fps: finite(video.fps || video.frameRate),
      sourceGroup: "human-accepted",
      cohort: "human-enricher-accepted",
      analyzerRole: role === "loop" ? "loop" : "transition",
      motionRole: role,
      analyzerConfidence: "human-enricher-decision",
      authoredUse: role === "loop" ? "hold" : "connector",
      authoredRoles: [],
      semanticTags: [...new Set(list(video.tags))],
      tags: list(video.tags),
      routeOrder: byIdentity.size,
      editorialMotionWeight: 1,
      autoEligible: true,
      acceptedByHumanEnricher: true,
      humanAcceptedIdentity: {
        videoKey: identity,
        aliases,
        decisionId: decision.id || "",
        decisionState: decision.state,
        decisionRevision: finite(decision.revision),
        actorId: decision.actorId || "",
        origin: decision.origin || "",
        decidedAt: decision.updatedAt || decision.createdAt || "",
        humanEnrichmentRevision: finite(video.humanEnrichment?.revision),
      },
      origin: {
        sourceSystem: "hapa-avatar-builder-human-enricher",
        sourceStore: "data/human-video-quick-sort-decisions.json",
        recordId: decision.id || identity,
        authority: "human-media-triage-only",
      },
      technical: {
        status: "human-enricher-accepted",
        shortEdge: Math.min(finite(video.width), finite(video.height)),
        identityBasis: sha256 ? "sha256" : identity.split(":", 1)[0],
      },
    };
    const enrichment = visualEnrichmentForVideo(options.visualEnrichmentIndex, video);
    if (enrichment?.palette) candidate.visualPalette = directorPalette(enrichment.palette);
    if (enrichment?.description?.text) candidate.visualDescription = {
      text: enrichment.description.text,
      sourceClass: text(enrichment.description.sourceClass) || "unknown",
    };
    if (!byIdentity.has(identity)) byIdentity.set(identity, candidate);
  }
  return [...byIdentity.values()];
}

export function summarizeHumanAcceptedDirectorCandidates(candidates = []) {
  const rows = list(candidates);
  return {
    candidates: rows.length,
    withFingerprint: rows.filter((row) => Boolean(row.sha256)).length,
    withHumanEnrichmentRevision: rows.filter((row) => row.humanAcceptedIdentity?.humanEnrichmentRevision > 0).length,
    withPalette: rows.filter((row) => Boolean(row.visualPalette)).length,
    withDescription: rows.filter((row) => Boolean(row.visualDescription)).length,
    byOwnerKind: Object.fromEntries([...new Set(rows.map((row) => row.cardKind))].sort().map((kind) => [kind, rows.filter((row) => row.cardKind === kind).length])),
    byMotionRole: Object.fromEntries(["loop", "transition", "neutral"].map((role) => [role, rows.filter((row) => row.motionRole === role).length])),
  };
}
