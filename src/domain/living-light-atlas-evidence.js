/** Read projection only. Atlas proposals never become applied Living Light maps. */
import {LivingLightValidationError} from './living-light-contracts.js';
const fail=(code,message)=>{throw new LivingLightValidationError(code,'atlasEvidence',message);};
const digest=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function projectLivingLightAtlasEvidence(result,{songId,currentSources}={}) {
 if(!result||result.song_id!==songId||!result.run_id||!Array.isArray(result.assets)||result.assets.length>25)fail('atlas_identity_mismatch','Owner result must identify the exact Song and bounded assets');
 if(!Array.isArray(currentSources)||currentSources.length>100||currentSources.some(s=>!s.assetId||!digest(s.sourceHash)))fail('invalid_current_sources','Exact current asset IDs and byte hashes required');
 const master=result.assets.find(a=>a.id==='master');
 const masterRefs=currentSources.filter(s=>s.kind==='master'&&s.sourceHash===master?.source_sha256);
 const masterMatched=masterRefs.length>0;
 const assets=result.assets.map(asset=>{
  const refs=currentSources.filter(s=>s.kind===(asset.id==='master'?'master':'stem')&&s.sourceHash===asset.source_sha256);
  const decoded=asset.status==='ready'&&digest(asset.decoded_sha256)&&Number.isSafeInteger(asset.sample_rate_hz)&&asset.sample_rate_hz>0&&Number.isSafeInteger(asset.sample_count)&&asset.sample_count>0&&typeof asset.timeline_id==='string';
  const e=asset.alignment_evidence;
  const boundProposal=asset.id!=='master'&&e?.source_asset_id===asset.id&&e.source_sha256===asset.source_sha256&&e.master_sha256===master?.source_sha256&&e.source_timeline_id===asset.timeline_id&&e.master_timeline_id===master?.timeline_id;
  const reasons=[];
  if(!refs.length)reasons.push('Selected canonical assets do not match these analyzed bytes');
  if(!masterMatched)reasons.push('Analyzed master differs from the selected canonical master');
  if(!decoded)reasons.push('No valid owner decoded timeline');
  if(asset.id!=='master')reasons.push(boundProposal?'Per-stem owner evidence is an unreviewed, unapplied proposal':'No exact per-stem alignment evidence; reconstruction lag cannot verify this stem');
  return {analysisAssetId:asset.id,declaredRole:asset.role,currentAssetIds:refs.map(r=>r.assetId),sourceHash:digest(asset.source_sha256)?asset.source_sha256:null,
   state:!refs.length||!masterMatched?'stale':decoded?'decoded':'unavailable',
   decoded:decoded?{digest:asset.decoded_sha256,timelineId:asset.timeline_id,sampleRate:asset.sample_rate_hz,frameCount:asset.sample_count,durationSeconds:asset.sample_count/asset.sample_rate_hz}:null,
   alignment:{state:asset.id==='master'?'own-source-timeline':boundProposal?'candidate-not-applied':'alignment-unverified',ownerRunId:result.run_id,evidenceRef:`atlas:${result.run_id}:${asset.id}`,status:boundProposal?e.status:null,proposedMap:boundProposal?structuredClone(e.proposed_map||null):null,timeMap:null,applied:false,qualityQualified:false},reasons};
 });
 return {schemaVersion:'hapa.living-light.atlas-evidence.v1',songId,ownerRunId:result.run_id,masterMatched,assets,analysisExecuted:false,
  synchronization:'unqualified',reconstructionIsIndividualAlignment:false,notice:'Byte identity and decoded source evidence are separate from alignment quality. No Atlas proposal is applied.'};
}
export function compareLivingLightPrototypeSources(scores,currentSources) {
 if(!Array.isArray(scores)||scores.length>100||!Array.isArray(currentSources))fail('invalid_source_comparison','Bounded inventories required');
 return scores.map(score=>{
  if(!score.id||!digest(score.mixSha256))fail('invalid_prototype_source','Prototype audition identity and digest required');
  const matches=currentSources.filter(s=>s.kind==='master'&&s.sourceHash===score.mixSha256);
  return {prototypeId:score.id,title:score.title,durationSeconds:score.duration,sourceHash:score.mixSha256,canonicalMasterMatches:matches.map(s=>({songId:s.songId,assetId:s.assetId})),
   bindingState:matches.length===1?'bytes-match-needs-decoded-timeline':matches.length?'ambiguous-byte-aliases':'no-byte-match',analysisReusable:false,
   reason:matches.length?'Equal bytes do not alone qualify decoded coordinates and feature semantics':'Reconstructed audition is not a selected canonical master; title and duration do not authorize reuse'};
 });
}
