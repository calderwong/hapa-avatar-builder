/** Identity-only catalog and feature admission. Listing never reads/decodes media. */
import {LivingLightValidationError, LL_SCHEMAS} from './living-light-contracts.js';
const reject=(code,path,message)=>{throw new LivingLightValidationError(code,path,message);};
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const names={'lead-vocal':'lead-vocals','lead-vocals':'lead-vocals','vocals':'lead-vocals','backing-vocal':'backing-vocals','backing-vocals':'backing-vocals','background-vocals':'backing-vocals','keys':'keyboard','keyboards':'keyboard','keyboard':'keyboard','fx':'other','effects':'other'};
const known=new Set(['bass','drums','guitar','synth','strings','percussion','brass','woodwinds','other']);
export function canonicalLivingLightRole(value){const role=String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');return names[role]|| (known.has(role)?role:null);}
/** Preserve declaration indices across archive filtering so fallback identities
 * agree between the catalog, inventory checks and exact playback selection. */
export function livingLightStemDeclarations(song){
 return (song.stems||[]).map((stem,index)=>({stem,assetId:stem.id||`${song.id}:declared:${index}`}))
  .filter(({stem})=>stem.kind!=='archive-zip'&&!/\.zip(?:$|\?)/i.test(stem.localPath||stem.uri||''));
}
export function buildLivingLightSongCatalog(songs,{inventoryById={},assetInventoryBySongId={}}={}) {
  if(!Array.isArray(songs))reject('invalid_catalog','songs','Songs must be an array');const ids=new Set();
  return songs.map(song=>{if(!song?.id||ids.has(song.id))reject('duplicate_song','songId','Missing or duplicate exact Song ID');ids.add(song.id);const inventory=inventoryById[song.id];
    const assets=livingLightStemDeclarations(song);
    return {songId:song.id,title:song.title||song.id,ownerRef:{kind:'song',entityId:song.id},audioRouteId:song.id,master:{state:inventory?.mp3?.state||'unresolved',verification:inventory?.verification||'unresolved',decodeVerified:inventory?.decode_verified===true,sourceHash:null},
      stems:assets.map(({stem,assetId})=>{const declaredRole=stem.stemType||stem.kind||stem.title||stem.id||'unknown';const role=canonicalLivingLightRole(declaredRole);const inspected=inventory?.mp3_stems?.roles?.find(r=>String(r.role).toLowerCase()===String(declaredRole).toLowerCase());const asset=assetInventoryBySongId[song.id]?.[assetId];return {assetId,declaredRole,canonicalRole:role,mapping:role==='other'&&/^(fx|effects)$/i.test(declaredRole)?'explicit-fx-to-other-v1':role?'canonical-role-v1':'unmapped',state:asset?.state||'unresolved',roleAvailability:inspected?.state||'unresolved',verification:asset?'asset-readable-header-only':'asset-not-inspected',sourceHash:null,timeMap:null,alignmentState:'alignment-unverified'};}),
      bindingState:'unresolved',featuresState:'unavailable',analysisOnList:false};
  });
}
export function validateSourceBinding(binding){
  if(!binding||binding.schemaVersion!==LL_SCHEMAS.source)reject('unsupported_schema','sourceBinding','Unsupported source binding');
  if(!binding.songId||!binding.bindingId||!binding.revisionId)reject('invalid_identity','sourceBinding','Exact identities required');
  if(!['unresolved','bytes-verified','decoded','alignment-unverified','ready','missing','stale'].includes(binding.state))reject('invalid_state','state','Unknown source state');
  if(!Array.isArray(binding.stems))reject('invalid_stems','stems','Stem assets must be an array');
  if(['bytes-verified','decoded','alignment-unverified','ready'].includes(binding.state)&&!sha(binding.master?.sourceHash))reject('unverified_source','master.sourceHash','Selected source bytes must be fingerprinted');
  if(['decoded','alignment-unverified','ready'].includes(binding.state)){
    const d=binding.master.decoded;if(!d||!sha(d.digest)||!Number.isSafeInteger(d.sampleRate)||d.sampleRate<1||!Number.isSafeInteger(d.frameCount)||d.frameCount<1||!Number.isFinite(d.durationSeconds)||Math.abs(d.durationSeconds-d.frameCount/d.sampleRate)>1/d.sampleRate)reject('invalid_decoded_timeline','master.decoded','Valid decoded timeline identity required');
  }
  const ids=new Set();for(const stem of binding.stems){if(!stem.assetId||ids.has(stem.assetId))reject('duplicate_asset','stems','Unique asset IDs required');ids.add(stem.assetId);if(!['unresolved','available','silent','missing','invalid','unreadable'].includes(stem.state))reject('invalid_state','stems.state','Unknown availability');if(stem.timeMap){let previous=-1;for(const segment of stem.timeMap){for(const k of ['songStartUs','songEndUs','sourceStartUs','sourceEndUs'])if(!Number.isSafeInteger(segment[k])||segment[k]<0)reject('invalid_time_map','timeMap','Nonnegative integer coordinates required');if(segment.songEndUs<=segment.songStartUs||segment.sourceEndUs<=segment.sourceStartUs||segment.songStartUs<previous)reject('invalid_time_map','timeMap','Ordered nonempty segments required');if(segment.songEndUs-segment.songStartUs!==segment.sourceEndUs-segment.sourceStartUs)reject('implicit_time_stretch','timeMap','Phase 1 maps may offset/pad but never stretch');previous=segment.songEndUs;}if(stem.alignmentState!=='verified'||!stem.alignmentEvidenceRef)reject('unverified_alignment','timeMap','Owner evidence required for synchronized stems');}}
  return binding;
}
export function admitLivingLightFeatures(bundle,binding){
  validateSourceBinding(binding);
  if(!bundle||bundle.schemaVersion!==LL_SCHEMAS.features)reject('unsupported_schema','features','Unsupported feature bundle');
  if(bundle.songId!==binding.songId||bundle.sourceHash!==binding.master?.sourceHash||!sha(bundle.sourceHash))reject('source_mismatch','features','Features must match exact Song ID and selected source bytes');
  if(!binding.master?.decoded||bundle.decodedDigest!==binding.master.decoded.digest||bundle.durationUs!==Math.round(binding.master.decoded.durationSeconds*1e6))reject('timeline_mismatch','features','Feature timeline differs from decoded source');
  if(!sha(bundle.configDigest)||!bundle.extractor?.id||!bundle.extractor?.version||!Array.isArray(bundle.features))reject('invalid_analysis','features','Analysis revision and configuration required');
  for(const feature of bundle.features){if(!['exact-compatible','transformed','unavailable'].includes(feature.compatibility))reject('unknown_compatibility','features','Feature semantics need admission');if(feature.compatibility==='transformed'&&!feature.transformation?.version)reject('unversioned_transform','features','Transformation evidence required');if(feature.compatibility==='unavailable')continue;
    if(!feature.name||!feature.units||!Number.isFinite(feature.sampleRateHz)||feature.sampleRateHz<=0||!Number.isSafeInteger(feature.originUs)||feature.originUs<0||!['linear','nearest'].includes(feature.interpolation)||!['present','silent'].includes(feature.availability)||!Array.isArray(feature.range)||feature.range.length!==2||!feature.range.every(Number.isFinite)||feature.range[1]<feature.range[0])reject('invalid_feature_metadata','features','Rates, units, range, origin and availability required');
    const values=feature.values;if(!values||!Number.isSafeInteger(values.length)||values.length<1||!Array.from(values).every(v=>Number.isFinite(v)&&v>=feature.range[0]&&v<=feature.range[1]))reject('invalid_feature_values','features','Finite bounded samples required');
    if(feature.name==='onset'&&feature.derivedFrom==='rms'&&feature.compatibility==='exact-compatible')reject('invented_semantics','features','RMS is not an exact onset measurement');
  }return bundle;
}
