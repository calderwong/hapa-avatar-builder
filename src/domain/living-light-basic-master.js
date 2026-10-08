/** A deliberately limited response to the existing Echo RMS envelope.
 * No prototype feature equivalence, stem signals, events or alignment invented.
 * The Echo playback/performance owners supply and verify the source identities.
 */
export const BASIC_MASTER_VERSION = 'echo-rms-display-to-host-offsets-1';
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = (code, message) => { throw Object.assign(new Error(message), {code}); };
export function createLivingLightBasicMaster({songId, performance, playbackReceipt} = {}) {
 const p = performance, r = playbackReceipt;
 if (!p || p.schemaVersion !== 'hapa.echo.music-performance.v1' || p.version !== 'absolute-song-time-1' || p.sourceSchemaVersion !== 'hapa.stem-telemetry-bundle.v1') fail('unsupported_performance', 'Prepared Echo performance is required.');
 if (!songId || p.songId !== songId || !hash(r?.sourceHash) || r.sourceHash !== p.masterAudioHash || !hash(r.pcmSha256) || r.fidelity !== 'source-equivalent-ffmpeg-decoded-float32') fail('master_identity_mismatch', 'Prepared signals must match the selected decoded master.');
 if (!/^sha256:[a-f0-9]{64}$/.test(p.fingerprint || '') || p.timebase?.origin !== 'selected-master-presentation-zero' || p.timebase?.unit !== 'seconds') fail('unverified_performance_revision', 'Exact prepared revision and master timebase required.');
 const masters = p.buses?.filter(bus => bus.id === 'master' && bus.role === 'master') || [];
 if (masters.length !== 1) fail('ambiguous_master', 'Exactly one prepared master is required.');
 const bus = masters[0], fps = bus.analyzer?.envelopeFps;
 if (bus.audioHash !== r.sourceHash || bus.originStatus !== 'verified' || bus.originSeconds !== 0 || bus.sourceSampleRate !== r.sampleRate || !Number.isInteger(r.channels) || r.channels<1 || r.channels>8 || bus.sourceChannels !== r.channels || bus.analyzer?.sampleRate !== bus.analysisSampleRate) fail('master_origin_unverified', 'Verified master presentation origin and source format required.');
 if (!Number.isFinite(r.durationSeconds) || r.durationSeconds <= 0 || r.durationSeconds > 1800 || !Number.isInteger(r.sampleRate) || r.sampleRate<8000 || r.sampleRate>192000 || !Number.isInteger(fps) || fps < 1 || fps > 120 || !Number.isInteger(bus.analysisSampleRate) || bus.analysisSampleRate < fps || bus.analysisSampleRate>192000) fail('invalid_master_timebase', 'Bounded duration and analysis cadence required.');
 const hopSeconds = Math.round(bus.analysisSampleRate / fps) / bus.analysisSampleRate;
 if (![p.durationSeconds, bus.durationSeconds].every(d => Number.isFinite(d) && Math.abs(d-r.durationSeconds) <= hopSeconds + 1/r.sampleRate)) fail('master_duration_mismatch', 'Prepared duration differs from selected playback.');
 const normalization = bus.normalization;
 if (normalization?.method !== 'per-input-p99-clamp' || !Number.isFinite(normalization.rmsP99) || normalization.rmsP99 <= 0 || bus.analyzer.version !== 'hapa.stem-telemetry.numpy-rfft-events-cache.v6') fail('unknown_rms_semantics', 'Known RMS extractor and normalization required.');
 const frames = bus.frames;
 if (!Array.isArray(frames) || !frames.length || frames.length > 200000 || frames.length !== Math.ceil(bus.durationSeconds/hopSeconds-1e-7)) fail('invalid_envelope_coverage', 'A complete bounded master envelope is required.');
 // Copy just this master curve; unrelated stems and large event banks are not retained.
 const values = new Float32Array(frames.length), raw = new Float32Array(frames.length), valid = new Uint8Array(frames.length);
 for (let i=0;i<frames.length;i++) {
  const f=frames[i];
  if (!Number.isFinite(f.t) || Math.abs(f.t-i*hopSeconds)>1e-7 || !Number.isFinite(f.rawRms) || !Number.isFinite(Math.fround(f.rawRms)) || f.rawRms<0 || !Number.isFinite(f.rms) || f.rms<0 || f.rms>1 || typeof f.silence!=='boolean') fail('invalid_rms_samples', 'Finite measured RMS and regular source coordinates required.');
  // The existing producer rounds raw RMS to 9 places and display RMS to 5.
  if (Math.abs(f.rms-Math.min(1,f.rawRms/normalization.rmsP99))>0.0000051+0.00000000051/normalization.rmsP99) fail('rms_normalization_mismatch', 'RMS values disagree with declared normalization.');
  values[i]=f.rms;raw[i]=f.rawRms;valid[i]=f.silence?2:1;
 }
 const identity=Object.freeze({version:BASIC_MASTER_VERSION,songId,sourceHash:r.sourceHash,decodedDigest:r.pcmSha256,performanceRevision:p.fingerprint,durationUs:Math.round(r.durationSeconds*1e6),analysisSampleRate:bus.analysisSampleRate,hopSeconds,extractor:bus.analyzer.version,normalization:Object.freeze({method:normalization.method,rmsP99:normalization.rmsP99}),compatibility:'transformed',semantics:'Master display-normalized RMS → authored emission and structural breath offsets; no stem energy/event substitution',stemFeatures:'unavailable',events:'unavailable',bytes:values.byteLength+raw.byteLength+valid.byteLength});
 let disposed=false;
 function sample(timelineUs) {
  if(disposed)fail('feature_lease_disposed','Basic master curve was released.');
  if(!Number.isSafeInteger(timelineUs)||timelineUs<0||timelineUs>identity.durationUs)fail('source_time_outside_master','Source time outside selected master.');
  const x=Math.min(values.length-1,timelineUs/1e6/hopSeconds),i=Math.floor(x),j=Math.min(i+1,values.length-1),u=x-i;
  const availability=valid[i]===2&&(u===0||valid[j]===2)?'silent':'present';
  const gain=availability==='silent'?0:values[i]+(values[j]-values[i])*u;
  return {timelineUs,value:gain,rawRms:raw[i]+(raw[j]-raw[i])*u,availability,sourceHash:identity.sourceHash,performanceRevision:identity.performanceRevision,transformationVersion:BASIC_MASTER_VERSION,offsets:{'material.emission':0.4*gain,'world.breath':0.05*gain}};
 }
 return {identity,sample,dispose(){if(disposed)return;disposed=true;values.fill(0);raw.fill(0);valid.fill(0);}};
}
