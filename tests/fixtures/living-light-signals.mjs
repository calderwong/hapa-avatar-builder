const a='a'.repeat(64),b='b'.repeat(64),c='c'.repeat(64),d='d'.repeat(64),e='e'.repeat(64);
export function fixture(count=2){
 const receipt={sourceHash:a,pcmSha256:b,channels:2,fidelity:'source-equivalent-ffmpeg-decoded-float32',sampleRate:48000,durationSeconds:2};
 const frames=()=>Array.from({length:20},(_,i)=>({t:i/10,rms:.5,peak:.5,rawRms:.25,rawPeak:.25,silence:false,low:.1,mid:.2,high:.3,onsetEnvelope:0}));
 const base={originStatus:'verified',originSeconds:0,sourceSampleRate:48000,sourceChannels:2,analysisSampleRate:8000,durationSeconds:2,analyzer:{envelopeFps:10,sampleRate:8000,version:'hapa.stem-telemetry.numpy-rfft-events-cache.v6'},normalization:{method:'per-input-p99-clamp',rmsP99:.5,peakP99:.5,onsetDeltaP99:.1,bandP99:{low:1,mid:2,high:3}},frames:frames()};
 const buses=[{...structuredClone(base),id:'master',role:'master',audioHash:a}];
 const stems=[];
 for(let i=0;i<count;i++){
  const assetId='exact-asset-'+i,sourceHash=i?e:d;
  buses.push({...structuredClone(base),id:'stem:'+assetId,assetId,declaredRole:i?'mystery texture':'Drums',role:i?'mysterytexture':'drums',identityPolicy:'living-light-assets-v1',featureAvailability:{energy:true,peak:true,low:true,mid:true,high:true,onset:true},audioHash:sourceHash,originStatus:'analysis-zero-not-verified-alignment',decodedAnalysis:{digest:c,frameCount:16000,sampleRate:8000,channels:1,domain:'ffmpeg-analysis-mono-f32le'}});
  stems.push({assetId,sourceHash,declaredRole:i?'mystery texture':'Drums',canonicalRole:i?null:'drums',state:'available',alignmentState:'verified',alignmentEvidenceRef:'fixture:synthetic-reviewed-map',timeMap:[{songStartUs:500000,songEndUs:1500000,sourceStartUs:0,sourceEndUs:1000000}],paddingIntervals:[{startUs:0,endUs:500000},{startUs:1500000,endUs:2000000}]});
 }
 return {songId:'fixture-song',playbackReceipt:receipt,performance:{schemaVersion:'hapa.echo.music-performance.v1',version:'absolute-song-time-1',sourceSchemaVersion:'hapa.stem-telemetry-bundle.v1',sourcePolicy:'living-light-assets-v1',songId:'fixture-song',masterAudioHash:a,fingerprint:'sha256:'+c,durationSeconds:2,timebase:{origin:'selected-master-presentation-zero',unit:'seconds'},buses},sourceBinding:{schemaVersion:'hapa.living-light.source-binding.v1',songId:'fixture-song',bindingId:'fixture-binding',revisionId:'fixture-r1',state:'ready',master:{sourceHash:a,decoded:{digest:b,sampleRate:48000,frameCount:96000,durationSeconds:2}},stems}};
}
