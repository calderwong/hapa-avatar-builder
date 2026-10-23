// A consumer qualification of Atlas evidence for display envelopes only. It
// does not approve Atlas's affine proposal, stretch audio or certify acoustics.
export const ATLAS_VISUAL_TIMING='atlas-constant-offset-visual-v1';
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const finite=Number.isFinite,integer=Number.isSafeInteger;
const median=values=>{const v=[...values].sort((a,b)=>a-b),m=Math.floor(v.length/2);return v.length%2?v[m]:(v[m-1]+v[m])/2;};
const rejected=(assetId,reason)=>({assetId,state:'unqualified',reason,timeMap:[],paddingIntervals:[]});

export function qualifyAtlasVisualTiming({result,resultSha256,performance}){
 if(!hash(resultSha256)||result?.song_id!==performance?.songId||!result.run_id||!Array.isArray(result.assets)||!Array.isArray(performance.buses)||performance.sourcePolicy!=='living-light-assets-v1')throw Error('Exact owner result and prepared Song required');
 const masters=result.assets.filter(a=>a.id==='master'),master=masters[0];
 const ready=a=>a?.status==='ready'&&hash(a.source_sha256)&&hash(a.decoded_sha256)&&typeof a.timeline_id==='string'&&integer(a.sample_rate_hz)&&a.sample_rate_hz>=8000&&integer(a.sample_count)&&a.sample_count>0;
 const masterMatches=masters.length===1&&ready(master)&&master.source_sha256===performance.masterAudioHash&&finite(performance.durationSeconds)&&Math.abs(master.sample_count/master.sample_rate_hz-performance.durationSeconds)<=1/8000;
 const rows=performance.buses.filter(b=>b.id!=='master').map(bus=>{
  const reject=reason=>rejected(bus.assetId,reason);
  if(!masterMatches)return reject('owner-master-mismatch');
  if(!bus.frames?.length||!hash(bus.audioHash))return reject('source-measurements-unavailable');
  const matches=result.assets.filter(a=>a.id!=='master'&&a.source_sha256===bus.audioHash);
  if(matches.length!==1)return reject('owner-asset-not-unique');
  const asset=matches[0],e=asset.alignment_evidence,d=bus.decodedAnalysis;
  if(!ready(asset)||!d||!hash(d.digest)||!integer(d.frameCount)||d.frameCount<=0||!integer(d.sampleRate)||d.sampleRate<4000||Math.abs(asset.sample_count/asset.sample_rate_hz-d.frameCount/d.sampleRate)>1/d.sampleRate)return reject('decoded-duration-mismatch');
  if(e?.schema_version!=='hapa.audio-atlas.stem-alignment.v1'||e.source_asset_id!==asset.id||e.source_sha256!==asset.source_sha256||e.master_sha256!==master.source_sha256||e.source_timeline_id!==asset.timeline_id||e.master_timeline_id!==master.timeline_id||e.source_rate_hz!==asset.sample_rate_hz||e.master_rate_hz!==master.sample_rate_hz||e.source_sample_count!==asset.sample_count||e.master_sample_count!==master.sample_count)return reject('owner-evidence-identity-mismatch');
  if(e.status!=='affine_alignment_candidate'||e.lag_convention!=='positive places stem samples later on the master clock'||e.analysis_rate_hz!==8000||!Array.isArray(e.windows)||e.windows.length>24||!finite(e.drift_ppm))return reject('no-bounded-offset-candidate');
  // Re-evaluate each observation instead of treating a candidate or usable flag
  // as acceptance. A constant offset must fit all admitted windows within 3 ms.
  const good=e.windows.filter(w=>w.status==='measured'&&w.atSearchBoundary===false&&finite(w.correlation)&&w.correlation>=.18&&w.correlation<=1&&finite(w.peakMargin)&&w.peakMargin>=.04&&finite(w.lagSeconds)&&Math.abs(w.lagSeconds)<=2&&integer(w.source_start_sample)&&integer(w.source_end_sample)&&w.source_start_sample>=0&&w.source_end_sample>w.source_start_sample&&w.source_end_sample<=asset.sample_count);
  if(good.length<4)return reject('insufficient-measured-windows');
  const windows=[...good].sort((a,b)=>a.source_start_sample-b.source_start_sample);
  if(windows.some((w,i)=>i&&w.source_start_sample<windows[i-1].source_end_sample))return reject('overlapping-evidence-windows');
  const start=windows[0].source_start_sample/asset.sample_rate_hz,end=windows.at(-1).source_end_sample/asset.sample_rate_hz;
  const span=(end-start)/(asset.sample_count/asset.sample_rate_hz);
  if(span<.5)return reject('insufficient-observed-span');
  const offset=median(good.map(w=>w.lagSeconds)),residual=Math.max(...good.map(w=>Math.abs(w.lagSeconds-offset)));
  if(residual>.003||Math.abs(e.drift_ppm)*1e-6*(end-start)>.003)return reject('offset-needs-stretch-or-is-inconsistent');
  const offsetUs=Math.round(offset*1e6),sourceStartUs=Math.max(Math.ceil(start*1e6),-offsetUs,0);
  const sourceEndUs=Math.min(Math.floor(end*1e6),Math.floor(d.frameCount/d.sampleRate*1e6),Math.floor(master.sample_count/master.sample_rate_hz*1e6)-offsetUs,Math.floor(performance.durationSeconds*1e6)-offsetUs);
  if(sourceEndUs<=sourceStartUs)return reject('empty-source-intersection');
  return {assetId:bus.assetId,state:'qualified',scope:'visual-envelope-constant-offset',sourceHash:bus.audioHash,masterHash:master.source_sha256,analysisAssetId:asset.id,sourceDecodedDigest:d.digest,ownerRunId:result.run_id,ownerResultSha256:resultSha256,evidenceRef:`atlas-visual-offset:${resultSha256}:${asset.id}`,offsetUs,measuredWindowCount:good.length,observedSpanFraction:span,maxObservedResidualSeconds:residual,
   timeMap:[{sourceStartUs,sourceEndUs,songStartUs:sourceStartUs+offsetUs,songEndUs:sourceEndUs+offsetUs}],paddingIntervals:[],
   limitations:['Constant-offset interpolation between sampled windows; no qualification outside the observed span','Not acoustic quality, semantic beat, decoder-delay or missing-content certification','Source audio and Atlas proposal remain unchanged']};
 });
 return {schemaVersion:'hapa.audio-atlas.visual-timing.v1',policy:ATLAS_VISUAL_TIMING,songId:performance.songId,masterHash:performance.masterAudioHash,ownerRunId:result.run_id,ownerResultSha256:resultSha256,rows,sourceAudioChanged:false,atlasProposalApplied:false};
}

export function applyAtlasVisualTiming(binding,performance){
 const t=performance.visualTiming;if(!t)return binding;
 const fail=()=>{throw Object.assign(Error('Prepared visual timing does not match the exact source bank.'),{code:'visual_timing_identity_mismatch'});};
 if(performance.stemSelectionPolicy!=='coherent-stems-v1'||t.schemaVersion!=='hapa.audio-atlas.visual-timing.v1'||t.policy!==ATLAS_VISUAL_TIMING||t.songId!==binding.songId||t.masterHash!==binding.master.sourceHash||!hash(t.ownerResultSha256)||!t.ownerRunId||t.sourceAudioChanged!==false||t.atlasProposalApplied!==false||!Array.isArray(t.rows)||t.rows.length!==binding.stems.length||new Set(t.rows.map(r=>r.assetId)).size!==t.rows.length)fail();
 for(const stem of binding.stems){
  const row=t.rows.find(r=>r.assetId===stem.assetId),bus=performance.buses.find(b=>b.assetId===stem.assetId);if(!row||!['qualified','unqualified'].includes(row.state))fail();
  if(row.state!=='qualified'){if(row.timeMap?.length||row.paddingIntervals?.length)fail();continue;}
  if(row.scope!=='visual-envelope-constant-offset'||row.sourceHash!==stem.sourceHash||row.masterHash!==binding.master.sourceHash||row.sourceDecodedDigest!==bus?.decodedAnalysis?.digest||row.ownerRunId!==t.ownerRunId||row.ownerResultSha256!==t.ownerResultSha256||row.evidenceRef!==`atlas-visual-offset:${t.ownerResultSha256}:${row.analysisAssetId}`||!integer(row.offsetUs)||Math.abs(row.offsetUs)>2e6||!integer(row.measuredWindowCount)||row.measuredWindowCount<4||row.measuredWindowCount>24||!finite(row.observedSpanFraction)||row.observedSpanFraction<.5||row.observedSpanFraction>1.0001||!finite(row.maxObservedResidualSeconds)||row.maxObservedResidualSeconds<0||row.maxObservedResidualSeconds>.003||row.timeMap?.length!==1||row.paddingIntervals?.length!==0)fail();
  const map=row.timeMap[0];if(!['sourceStartUs','sourceEndUs','songStartUs','songEndUs'].every(k=>integer(map[k])&&map[k]>=0)||map.sourceEndUs<=map.sourceStartUs||map.sourceEndUs>Math.floor(bus.decodedAnalysis.frameCount/bus.decodedAnalysis.sampleRate*1e6)||map.songEndUs>Math.floor(performance.durationSeconds*1e6)||map.songStartUs-map.sourceStartUs!==row.offsetUs||map.songEndUs-map.sourceEndUs!==row.offsetUs)fail();
  Object.assign(stem,{alignmentState:'verified',alignmentScope:row.scope,alignmentEvidenceRef:row.evidenceRef,timeMap:structuredClone(row.timeMap),paddingIntervals:[]});
 }
 return binding;
}
