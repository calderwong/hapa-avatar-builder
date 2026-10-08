import {createLivingLightBasicMaster} from './living-light-basic-master.js';
import {validateSourceBinding} from './living-light-source-binding.js';
export const LIVING_LIGHT_FEATURE_VERSION='echo-source-assets-display-v1';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
const measured=['energy','peak','low','mid','high','onset'];
const fields={energy:'rms',peak:'peak',low:'low',mid:'mid',high:'high',onset:'onsetEnvelope'};
export const LIVING_LIGHT_FEATURE_COMPATIBILITY=Object.freeze({
 energy:{compatibility:'transformed',units:'per-input p99 normalized RMS',transformationVersion:LIVING_LIGHT_FEATURE_VERSION},
 peak:{compatibility:'transformed',units:'per-input p99 normalized peak',transformationVersion:LIVING_LIGHT_FEATURE_VERSION},
 low:{compatibility:'transformed',units:'p99 normalized mean FFT magnitude, 20–250 Hz',transformationVersion:LIVING_LIGHT_FEATURE_VERSION},
 mid:{compatibility:'transformed',units:'p99 normalized mean FFT magnitude, 250–2000 Hz',transformationVersion:LIVING_LIGHT_FEATURE_VERSION},
 high:{compatibility:'transformed',units:'p99 normalized mean FFT magnitude, 2000 Hz–analysis Nyquist',transformationVersion:LIVING_LIGHT_FEATURE_VERSION},
 onset:{compatibility:'transformed',units:'p99 normalized positive display RMS delta; no beat certification',transformationVersion:LIVING_LIGHT_FEATURE_VERSION},
 brightness:{compatibility:'unavailable'},width:{compatibility:'unavailable'},pan:{compatibility:'unavailable'},beat:{compatibility:'unavailable'},
});
/** Private copied arrays. Source-local measurements become song-time samples
 * only through explicit validated owner maps; missing alignment stays unknown.
 * Caller owns the binding receipt; this pure adapter cannot approve Atlas maps. */
export function createLivingLightFeatureBank({songId,performance,playbackReceipt,sourceBinding,maxBytes=128*1024**2}={}) {
 validateSourceBinding(sourceBinding);
 if(sourceBinding.master.decoded?.sampleRate!==playbackReceipt?.sampleRate||sourceBinding.master.decoded?.frameCount!==Math.round(playbackReceipt?.durationSeconds*playbackReceipt?.sampleRate)||Math.abs(sourceBinding.master.decoded?.durationSeconds-playbackReceipt?.durationSeconds)>1/playbackReceipt?.sampleRate)fail('feature_binding_timeline_mismatch','Selected binding differs from playback coordinates.');
 if(sourceBinding.songId!==songId||sourceBinding.master.sourceHash!==playbackReceipt?.sourceHash||sourceBinding.master.decoded?.digest!==playbackReceipt?.pcmSha256)fail('feature_binding_mismatch','Exact source binding and selected playback identity required.');
 if(performance?.sourcePolicy!=='living-light-assets-v1'||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>128*1024**2)fail('feature_policy_invalid','Exact asset preparation and a bounded feature budget required.');
 const master=createLivingLightBasicMaster({songId,performance,playbackReceipt});
 let disposed=false,bytes=master.identity.bytes;
 const assets=new Map(),durationUs=master.identity.durationUs;
 try {
  if(bytes>maxBytes)fail('feature_budget_exceeded','Master curve exceeds the resident feature budget.');
  const buses=performance.buses.filter(bus=>bus.id!=='master');
  if(buses.length!==sourceBinding.stems.length||buses.length>32||new Set(buses.map(bus=>bus.assetId)).size!==buses.length)fail('feature_asset_ambiguous','Exact one-to-one asset declarations required.');
  for(const bus of buses){
   const stem=sourceBinding.stems.find(stem=>stem.assetId===bus.assetId);
   if(!stem||bus.identityPolicy!=='living-light-assets-v1')fail('feature_asset_mismatch','Prepared asset is absent from selected source binding.');
   if(!bus.frames?.length){
    if(bus.audioHash||!['missing','unresolved','unreadable','invalid'].includes(stem.state))fail('feature_missing_state_invalid','Absent measurements cannot be marked available or silent.');
    assets.set(bus.assetId,{assetId:bus.assetId,state:stem.state,reason:'analysis-unavailable',curves:null});continue;
   }
   if(!hash(bus.audioHash)||bus.audioHash!==stem.sourceHash)fail('feature_asset_hash_mismatch','Prepared signals belong to different source bytes.');
   const d=bus.decodedAnalysis,fps=bus.analyzer?.envelopeFps,rate=bus.analysisSampleRate;
   if(!d||!hash(d.digest)||d.domain!=='ffmpeg-analysis-mono-f32le'||d.channels!==1||d.sampleRate!==rate||!Number.isSafeInteger(d.frameCount)||d.frameCount<1||!Number.isSafeInteger(rate)||rate<4000||rate>48000||!Number.isSafeInteger(fps)||fps<1||fps>60||bus.analyzer?.sampleRate!==rate||bus.analyzer.version!=='hapa.stem-telemetry.numpy-rfft-events-cache.v6')fail('feature_extractor_unknown','Known decoded analysis coordinates and extractor required.');
   const hop=Math.round(rate/fps)/rate,sourceDuration=d.frameCount/rate;
   if(sourceDuration>1800||!Number.isFinite(bus.durationSeconds)||Math.abs(sourceDuration-bus.durationSeconds)>1/rate||bus.frames.length>200000||bus.frames.length!==Math.ceil(sourceDuration/hop-1e-7))fail('feature_coverage_invalid','Complete bounded source-local regular samples required.');
   const norm=bus.normalization;
   if(norm?.method!=='per-input-p99-clamp'||!Number.isFinite(norm.rmsP99)||norm.rmsP99<=0||!Number.isFinite(norm.peakP99)||norm.peakP99<=0||!Number.isFinite(norm.onsetDeltaP99)||norm.onsetDeltaP99<=0||!['low','mid','high'].every(k=>Number.isFinite(norm.bandP99?.[k])&&norm.bandP99[k]>0))fail('feature_normalization_unknown','Known per-feature normalization is required.');
   if(!bus.featureAvailability||measured.some(name=>typeof bus.featureAvailability[name]!=='boolean')||!bus.featureAvailability.energy)fail('feature_capabilities_unknown','Explicit measured feature availability is required.');
   const available=measured.filter(name=>bus.featureAvailability[name]);
   const requiredBytes=bus.frames.length*(available.length*4+1);
   if(bytes+requiredBytes>maxBytes)fail('feature_budget_exceeded','Selected decoded feature arrays exceed the resident budget. Choose fewer assets.');
   const curves=Object.fromEntries(available.map(name=>[name,new Float32Array(bus.frames.length)])),valid=new Uint8Array(bus.frames.length);
   for(let i=0;i<bus.frames.length;i++){
    const f=bus.frames[i];
    if(!Number.isFinite(f.t)||Math.abs(f.t-i*hop)>1e-7||typeof f.silence!=='boolean'||!Number.isFinite(f.rawRms)||f.rawRms<0||!Number.isFinite(f.rawPeak)||f.rawPeak<0||!Number.isFinite(Math.fround(f.rawRms))||!Number.isFinite(Math.fround(f.rawPeak)))fail('feature_samples_invalid','Finite measured samples and explicit validity required.');
    for(const name of available){const value=f[fields[name]];if(!Number.isFinite(value)||value<0||value>1)fail('feature_samples_invalid','Measured feature samples must be finite and bounded.');curves[name][i]=value;}
    for(const [field,raw,scale]of [['rms','rawRms','rmsP99'],...(bus.featureAvailability.peak?[['peak','rawPeak','peakP99']]:[])])if(Math.abs(f[field]-Math.min(1,f[raw]/norm[scale]))>0.0000051+0.00000000051/norm[scale])fail('feature_normalization_mismatch','Prepared display values differ from declared normalization.');
    // The v6 producer marks silence only when both raw measurements are below -60 dBFS.
    // Rounded JSON values near the threshold cannot establish a contradiction.
    if((f.silence&&(f.rawRms>=.00100000051||f.rawPeak>=.00100000051))||(!f.silence&&f.rawRms<.00099999949&&f.rawPeak<.00099999949))fail('feature_silence_mismatch','Silence validity differs from measured source activity.');
    valid[i]=f.silence?2:1;
   }
   const timeMap=structuredClone(stem.timeMap||[]),padding=structuredClone(stem.paddingIntervals||[]);
   if(timeMap.some(s=>s.songEndUs>durationUs||s.sourceEndUs>Math.round(sourceDuration*1e6)))fail('feature_time_map_outside_source','Mapped intervals exceed selected source coordinates.');
   if(padding.length>64||padding.some((p,i)=>!Number.isSafeInteger(p.startUs)||!Number.isSafeInteger(p.endUs)||p.startUs<0||p.endUs<=p.startUs||p.endUs>durationUs||(i>0&&p.startUs<padding[i-1].endUs)||timeMap.some(s=>p.startUs<s.songEndUs&&p.endUs>s.songStartUs)))fail('feature_padding_invalid','Explicit ordered silence padding cannot overlap real mapped source.');
   if(padding.length&&(!timeMap.length||stem.alignmentState!=='verified'||!stem.alignmentEvidenceRef))fail('feature_padding_unverified','Padding needs an explicit verified alignment receipt.');
   bytes+=requiredBytes;
   assets.set(bus.assetId,{assetId:bus.assetId,declaredRole:stem.declaredRole,canonicalRole:stem.canonicalRole??null,sourceHash:bus.audioHash,decodedDigest:d.digest,state:timeMap.length?'mapped':'alignment-unverified',timeMap,padding,hop,sourceDuration,curves,valid,bytes:requiredBytes});
  }
 }catch(error){master.dispose();for(const a of assets.values()){for(const c of Object.values(a.curves||{}))c.fill(0);a.valid?.fill(0);}throw error;}
 const identity=Object.freeze({version:LIVING_LIGHT_FEATURE_VERSION,songId,sourceHash:playbackReceipt.sourceHash,decodedDigest:playbackReceipt.pcmSha256,bindingId:sourceBinding.bindingId,bindingRevision:sourceBinding.revisionId,performanceRevision:performance.fingerprint,durationUs,bytes,assetCount:assets.size,compatibility:LIVING_LIGHT_FEATURE_COMPATIBILITY});
 function assertSample(t){if(disposed)fail('feature_lease_disposed','Feature bank was released.');if(!Number.isSafeInteger(t)||t<0||t>durationUs)fail('feature_time_outside_source','Sample outside selected master.');}
 function sample(assetId,feature,timelineUs){
  assertSample(timelineUs);
  if(!measured.includes(feature))return {assetId,feature,value:null,availability:'unavailable',reason:'feature-semantics-unavailable'};
  if(assetId==='master')return feature==='energy'?{...master.sample(timelineUs),assetId,feature}: {assetId,feature,value:null,availability:'unavailable',reason:'master-basic-energy-only'};
  const a=assets.get(assetId);if(!a)fail('feature_asset_unknown','Select an exact prepared asset.');
  const empty=reason=>({assetId,feature,timelineUs,value:null,availability:'unknown',reason});
  if(!a.curves)return {...empty('analysis-unavailable'),availability:a.state};
  if(!a.curves[feature])return {...empty('feature-semantics-unavailable'),availability:'unavailable'};
  if(a.state!=='mapped')return empty('alignment-unverified');
  // The terminal master sample is permitted; mapped intervals remain half-open.
  const s=a.timeMap.find(s=>timelineUs>=s.songStartUs&&timelineUs<s.songEndUs);
  if(!s){if(a.padding.some(p=>timelineUs>=p.startUs&&timelineUs<p.endUs))return {assetId,feature,timelineUs,value:0,availability:'silent',validity:'explicit-padding',sourceHash:a.sourceHash};return empty('unmapped-song-interval');}
  const sourceUs=s.sourceStartUs+timelineUs-s.songStartUs,x=Math.min(a.valid.length-1,sourceUs/1e6/a.hop),i=Math.floor(x),j=Math.min(i+1,a.valid.length-1),u=x-i;
  const availability=a.valid[i]===2&&(u===0||a.valid[j]===2)?'silent':'present',curve=a.curves[feature];
  return {assetId,feature,timelineUs,sourceUs,value:availability==='silent'?0:curve[i]+(curve[j]-curve[i])*u,availability,validity:'measured',sourceHash:a.sourceHash,decodedDigest:a.decodedDigest,transformationVersion:LIVING_LIGHT_FEATURE_VERSION};
 }
 function aggregate({assetIds,feature,operation,weights},timelineUs){
  assertSample(timelineUs);
  if(!Array.isArray(assetIds)||!assetIds.length||assetIds.length>33||new Set(assetIds).size!==assetIds.length||!['max','mean','weighted-sum'].includes(operation))fail('feature_aggregation_invalid','Explicit bounded unique assets and aggregation required.');
  if(operation==='weighted-sum'&&(!Array.isArray(weights)||weights.length!==assetIds.length||weights.some(w=>!Number.isFinite(w)||w<0||w>1)||weights.reduce((s,w)=>s+w,0)>1+1e-12))fail('feature_weights_invalid','Weighted sum needs nonnegative explicit weights with total at most one.');
  const contributions=assetIds.map((id,i)=>({...sample(id,feature,timelineUs),weight:operation==='weighted-sum'?weights[i]:1}));
  const used=contributions.filter(c=>c.weight>0),unavailable=used.filter(c=>!['present','silent'].includes(c.availability));
  if(unavailable.length)return {feature,timelineUs,value:null,availability:'unknown',operation,contributions,reason:'selected-contribution-unavailable'};
  const value=!used.length?0:operation==='max'?Math.max(...used.map(c=>c.value)):operation==='mean'?used.reduce((s,c)=>s+c.value,0)/used.length:used.reduce((s,c)=>s+c.value*c.weight,0);
  return {feature,timelineUs,value,availability:used.every(c=>c.availability==='silent')?'silent':'present',operation,contributions};
 }
 return {identity,sample,aggregate,assets:()=>Array.from(assets.values(),a=>({assetId:a.assetId,declaredRole:a.declaredRole,canonicalRole:a.canonicalRole,state:a.state,bytes:a.bytes||0,sourceHash:a.sourceHash||null})),dispose(){if(disposed)return;disposed=true;master.dispose();for(const a of assets.values()){for(const c of Object.values(a.curves||{}))c.fill(0);a.valid?.fill(0);}assets.clear();}};
}
