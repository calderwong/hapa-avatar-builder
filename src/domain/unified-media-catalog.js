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

export const IMAGE_SHOT_GEOMETRY_SCHEMA = "hapa.echo.image-shot-geometry.v1";
const imageHash = value => /^[a-f0-9]{64}$/.test(String(value || ""));
const imageDimension = value => Number.isInteger(value) && value > 0;
function imageRegion(input, kind = "subject") {
  const r = input.rect || input;
  if (![r.x,r.y,r.width,r.height].every(Number.isFinite) || r.x < 0 || r.y < 0 || r.width <= 0 || r.height <= 0 || r.x+r.width > 1+1e-9 || r.y+r.height > 1+1e-9) throw new Error("invalid-image-region");
  return { id:String(input.id||""),kind:input.kind||kind,rect:{x:r.x,y:r.y,width:r.width,height:r.height},evidence:input.evidence||null };
}
export function createImageShotGeometry({ original, pageId = null, panelId = null, readingOrder = null,
  focalAnchors = [], protectedRegions = [], panels = [], provenance = [], depth = null, masks = [],
  readingSeconds = 2, protectionEvidence = null } = {}) {
  if (!imageHash(original?.sha256) || ![original?.width,original?.height].every(imageDimension) || !original.uri) throw new Error("image-original-reference-required");
  if (readingOrder !== null && (!Number.isInteger(readingOrder) || readingOrder < 0)) throw new Error("invalid-image-reading-order");
  if (!Number.isFinite(readingSeconds) || readingSeconds < 0 || readingSeconds > 120) throw new Error("invalid-image-reading-duration");
  if ([focalAnchors,protectedRegions,panels,masks].some(rows=>!Array.isArray(rows)||rows.length>256)) throw new Error("image-geometry-budget-exceeded");
  const normalizedPanels=panels.map(panel=>{
    if (!panel.id || !Number.isInteger(panel.readingOrder) || panel.readingOrder<0) throw new Error("invalid-image-panel");
    return {...imageRegion(panel,"panel"),readingOrder:panel.readingOrder};
  }).sort((a,b)=>a.readingOrder-b.readingOrder);
  if(new Set(normalizedPanels.map(p=>p.id)).size!==normalizedPanels.length || new Set(normalizedPanels.map(p=>p.readingOrder)).size!==normalizedPanels.length) throw new Error("duplicate-image-panel-order");
  if (panelId && !normalizedPanels.some(panel=>panel.id===panelId)) throw new Error("image-panel-reference-unavailable");
  const protectedRows=protectedRegions.map(r=>imageRegion(r));
  return {
    schemaVersion:IMAGE_SHOT_GEOMETRY_SCHEMA,
    original:{uri:original.uri,sha256:original.sha256,width:original.width,height:original.height},
    pageId,panelId,readingOrder,
    focalAnchors:focalAnchors.map(r=>imageRegion(r,"focal")),protectedRegions:protectedRows,panels:normalizedPanels,
    protectionStatus:protectedRows.length && protectionEvidence?.sourceHash === original.sha256 && protectionEvidence?.status === "source-bound"
      ? "source-bound" : protectedRows.length?"declared-pending-source-verification":"whole-page-fallback",
    readingSeconds,protectionEvidence:protectionEvidence?structuredClone(protectionEvidence):null,
    provenance:structuredClone(provenance),depth:depth?structuredClone(depth):null,masks:structuredClone(masks),
  };
}

export function selectImageShotRendition({ geometry, renditions = [], outputProfile,
  crop = {width:1,height:1}, fit = "cover", finalRender = false, maxTextureSize = 8192,maxDecodedBytes = 64*1024*1024 } = {}) {
  if(geometry?.schemaVersion!==IMAGE_SHOT_GEOMETRY_SCHEMA)throw new Error("image-geometry-required");
  if(![outputProfile?.width,outputProfile?.height].every(imageDimension)||![crop.width,crop.height].every(n=>Number.isFinite(n)&&n>0&&n<=1))throw new Error("invalid-image-decode-profile");
  if (![maxTextureSize,maxDecodedBytes].every(n=>Number.isSafeInteger(n)&&n>0)) throw new Error("invalid-image-decode-limits");
  const original=geometry.original;
  const scale=(fit==='contain'?Math.min:Math.max)(outputProfile.width/(original.width*crop.width),outputProfile.height/(original.height*crop.height));
  const required={width:Math.ceil(original.width*Math.min(1,scale)),height:Math.ceil(original.height*Math.min(1,scale))};
  const candidates=[{...original,sourceHash:original.sha256,original:true},...renditions.filter(r=>r.sourceHash===original.sha256&&imageHash(r.sha256)&&r.verified===true&&r.uri&&[r.width,r.height].every(imageDimension)&&Math.abs(r.width/r.height-original.width/original.height)<=1/Math.min(r.width,r.height))];
  const bounded=candidates.filter(r=>r.width<=maxTextureSize&&r.height<=maxTextureSize&&r.width*r.height*4<=maxDecodedBytes);
  if(finalRender){
    const withinBudget=bounded.some(r=>r.original);
    return {status:withinBudget?'ready-original':'blocked-original-decode-budget',selected:withinBudget?candidates[0]:null,required,insufficientResolution:scale>1,sourceHash:original.sha256};
  }
  const sufficient=bounded.filter(r=>r.width>=required.width&&r.height>=required.height).sort((a,b)=>a.width*a.height-b.width*b.height||String(a.uri).localeCompare(String(b.uri)));
  const selected=sufficient[0]||bounded.sort((a,b)=>b.width*b.height-a.width*a.height||String(a.uri).localeCompare(String(b.uri)))[0]||null;
  return {status:selected?sufficient.length?'ready-preview':'preview-resolution-fallback':'blocked-decode-budget',selected,required,insufficientResolution:scale>1||!sufficient.length,sourceHash:original.sha256};
}

/** Stable identity declarations only. Owning a file, naming it, or tagging its
 * parent does not establish who/what appears in it. Canonical declarations are
 * not visual verification and retain exact source-field provenance. */
export function declaredMediaIdentities(asset = {}, { avatarIds = new Set(), sceneIds = new Set(), source = null, sourceRevision = null } = {}) {
  const evidence = [], rejected = [];
  const fields = [
    ['characterIds', asset.characterIds, avatarIds, 'character'],
    ['cast.characterIds', asset.cast?.characterIds, avatarIds, 'character'],
    ['avatarId', asset.avatarId ? [asset.avatarId] : [], avatarIds, 'character'],
    ['metadata.avatarIds', asset.metadata?.avatarIds, avatarIds, 'character'],
    ['sceneIds', asset.sceneIds, sceneIds, 'scene'],
    ['cast.sceneIds', asset.cast?.sceneIds, sceneIds, 'scene'],
    ['metadata.sceneId', asset.metadata?.sceneId ? [asset.metadata.sceneId] : [], sceneIds, 'scene'],
  ];
  for (const [field, values, known, kind] of fields) for (const id of Array.isArray(values) ? values : []) {
    if (typeof id !== 'string' || !id || id.length > 240) continue;
    const row = { kind, id, field, source, sourceRevision };
    if (known.has(id)) evidence.push({ ...row, status: 'canonical-declaration', visualVerified: false });
    else rejected.push({ ...row, reason: 'identity-not-in-canonical-store' });
  }
  return { characterIds: unique(evidence.filter(row => row.kind === 'character').map(row => row.id)).sort(),
    sceneIds: unique(evidence.filter(row => row.kind === 'scene').map(row => row.id)).sort(), evidence, rejected };
}


/** Runtime declarations are a sidecar, not a rewrite of the certified cut.
 * Apply only allowed metadata after matching the exact source fingerprint and
 * every shot identity/time/URI. Media, camera, text and timing cannot change. */
export function isEchoMediaEvidenceProjectionCurrent(timeline = [], projection, sourceFingerprint) {
  if (projection?.schemaVersion !== "hapa.echo.media-evidence-projection.v1" || projection.sourceFingerprint !== sourceFingerprint
    || !Array.isArray(projection.timeline) || projection.timeline.length !== timeline.length || timeline.length > 4096) return false;
  const identity = shot => JSON.stringify([shot.media_id,shot.start_sec,shot.end_sec,shot.media_uri,shot.runtime_media_uri,shot.media_contract?.originalUri,shot.media_contract?.runtimeUri]);
  return !timeline.some((shot,index) => identity(shot) !== identity(projection.timeline[index]));
}

export function applyEchoMediaEvidenceProjection(timeline = [], projection, sourceFingerprint) {
  if (!isEchoMediaEvidenceProjectionCurrent(timeline,projection,sourceFingerprint)) return timeline;
  const fields = ["characterIds","sceneIds","cast","canonicalMediaIds","identityEvidence","sourceAllowed","availability","contentEvidence"];
  return timeline.map((shot,index) => {
    const source = projection.timeline[index];
    const metadata = Object.fromEntries(fields.filter(field => Object.hasOwn(source,field)).map(field => [field,structuredClone(source[field])]));
    return { ...shot,...metadata,media_contract:{...shot.media_contract,...metadata} };
  });
}
