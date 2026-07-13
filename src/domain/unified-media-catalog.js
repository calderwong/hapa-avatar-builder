export const UNIFIED_MEDIA_CATALOG_SCHEMA = "hapa.media.discovery-catalog.v1";

function unique(values) { return [...new Set(values.filter(Boolean))]; }

export function createUnifiedMediaAsset({ contentHash, mediaType, original, renditions = [], analysis = null, relationships = [], rights = {}, provenance = [] } = {}) {
  if (!/^[a-f0-9]{64}$/.test(contentHash || "")) throw new Error("Unified media assets require a SHA-256 content hash");
  if (!original?.sourcePath && !original?.uri) throw new Error("Unified media assets require an archival original location");
  return {
    schemaVersion: "hapa.media.discovery-asset.v1",
    id: `hapa-media:sha256:${contentHash}`,
    contentHash: { algorithm: "sha256", value: contentHash },
    mediaType: mediaType || "unknown",
    original,
    renditions: unique(renditions.map((row) => JSON.stringify(row))).map((row) => JSON.parse(row)),
    analysis,
    relationships,
    rights: { licensingStatus: rights.licensingStatus || "unknown", consentStatus: rights.consentStatus || "unknown", source: rights.source || "source-record-unavailable" },
    provenance,
  };
}

export function mergeUnifiedMediaAssets(assets = []) {
  const byHash = new Map();
  for (const asset of assets) {
    const hash = asset.contentHash.value;
    const current = byHash.get(hash);
    if (!current) byHash.set(hash, asset);
    else byHash.set(hash, { ...current, renditions: [...current.renditions, ...asset.renditions].filter((row, index, all) => all.findIndex((item) => JSON.stringify(item) === JSON.stringify(row)) === index), relationships: [...current.relationships, ...asset.relationships].filter((row, index, all) => all.findIndex((item) => JSON.stringify(item) === JSON.stringify(row)) === index), provenance: [...current.provenance, ...asset.provenance].filter((row, index, all) => all.findIndex((item) => JSON.stringify(item) === JSON.stringify(row)) === index) });
  }
  return { schemaVersion: UNIFIED_MEDIA_CATALOG_SCHEMA, readOnly: true, identityRule: "hapa-media:sha256:<archival-original-sha256>", assets: [...byHash.values()].sort((a, b) => a.id.localeCompare(b.id)) };
}

export function queryUnifiedMediaCatalog(catalog, query = {}) {
  const relationshipIds = new Set(query.relationshipIds || []);
  const types = new Set(query.mediaTypes || []);
  return (catalog.assets || []).filter((asset) => (!types.size || types.has(asset.mediaType)) && (!relationshipIds.size || asset.relationships.some((row) => relationshipIds.has(row.ownerId))) && (!query.requireVerifiedTechnical || asset.analysis?.status === "verified-source-file")).map((asset) => ({ id: asset.id, contentHash: asset.contentHash, mediaType: asset.mediaType, technical: asset.analysis, original: asset.original, renditions: asset.renditions, relationships: asset.relationships, rights: asset.rights })).sort((a, b) => a.id.localeCompare(b.id));
}
