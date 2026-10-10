import {validateStructureEvidence} from '../server/audio-atlas-contract.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {buildAtlasContract,validatePayload,validateCoverage,validateDependencies,validateTimeMap,mapPoint,mapSpan} from '../server/audio-atlas-contract.mjs';
function fixture(){
 const source='a'.repeat(64),pcm='b'.repeat(64),run='run-one';
 const asset={id:'master',role:'Master',source_sha256:source,decoded_sha256:pcm,status:'ready',sample_rate_hz:48000,sample_count:48000,channels:2,timeline_id:`pcm:${pcm}:48000:2`,decoder_delay_policy:'skip/discard metadata; no additional trim',features:{hop_samples:4800,window_samples:4800,centered:false,first_frame_sample:0,normalization:'none',channel_axis:'source order',frames:[{start_sample:0,end_sample:4800,rms:[.1,.2],peak:[.2,.3],minimum:[-.2,-.3],maximum:[.2,.3],onset_strength:.1,spectral_centroid_hz:null}]}};
 const obs={id:'master:word:0',kind:'hapa.audio.word_candidate',claim_type:'model_inferred',subject_id:'master',timeline_id:asset.timeline_id,reference_sample_rate_hz:48000,start_sample:100,end_sample:200,shape:'interval',payload:{text:'hello',model_score:.8,score_semantics:'uncalibrated Whisper probability'},provenance:{run_id:run,source_sha256:source,evidence_asset_id:'master',analysis_view:{sample_rate_hz:16000,channels:1,map_numerator:48000,map_denominator:16000,offset_samples:0,rounding:'nearest'}},confidence:null,timing_uncertainty_samples:null,review_state:'unreviewed'};
 return {run_id:run,song_id:'song-a',schema_version:'hapa.audio-atlas.measurements.v1',runtime:{ffmpeg:'fixture',ffmpeg_sha256:'c'.repeat(64)},assets:[asset],observations:[obs],coverage:{word_timing:{state:'candidate'},phonemes:{state:'unsupported'},notes:{state:'failed'}}};
}
function affine(){return {id:'map',source_id:'view',target_timeline_id:'timeline',kind:'affine',rounding:'nearest_ties_even',measured_delay_samples:null,segment:{source_start:0,source_end:100,scale:{numerator:'3',denominator:'2'},offset:{numerator:'-1',denominator:'2'}}};}
test('exact rational transforms preserve rounding, negative offsets and large integer products',()=>{
 const m=affine();assert.equal(mapPoint(m,0).sample,0);assert.equal(mapPoint(m,2).sample,2);assert.deepEqual(mapPoint(m,2).exact,{numerator:'5',denominator:'2'});
 m.rounding='nearest_ties_away';assert.equal(mapPoint(m,0).sample,-1);assert.equal(mapPoint(m,2).sample,3);
 m.rounding='floor';assert.equal(mapPoint(m,0).sample,-1);m.rounding='ceil';assert.equal(mapPoint(m,0).sample,0);
 m.segment.source_end=Number.MAX_SAFE_INTEGER;m.segment.scale={numerator:'9007199254740991',denominator:'9007199254740991'};m.segment.offset={numerator:'0',denominator:'1'};assert.equal(mapPoint(m,Number.MAX_SAFE_INTEGER-1).sample,Number.MAX_SAFE_INTEGER-1);
 assert.throws(()=>mapPoint(m,Number.MAX_SAFE_INTEGER),/outside map/);
 m.segment.scale.denominator='0';assert.throws(()=>validateTimeMap(m),/denominator/);
});
test('piecewise edits preserve disjoint target fragments and refuse unmapped source gaps',()=>{
 const m=affine();m.kind='piecewise';m.segments=[{...m.segment,source_end:10,scale:{numerator:1,denominator:1},offset:{numerator:0,denominator:1}},{source_start:10,source_end:20,scale:{numerator:1,denominator:1},offset:{numerator:90,denominator:1}}];delete m.segment;
 assert.deepEqual(mapSpan(m,8,12).map(f=>[f.start.sample,f.end.sample]),[[8,10],[100,102]]);assert.equal(mapPoint(m,10).sample,100);
 m.segments[1].source_start=11;assert.throws(()=>mapSpan(m,8,12),/unmapped gap/);assert.throws(()=>mapPoint(m,10),/unmapped gap/);
 m.segments[1].source_start=9;assert.throws(()=>validateTimeMap(m),/overlapping/);
});
test('composition, registered recording, source bytes, PCM and transformed views stay distinct',()=>{
 const r=fixture(),before=JSON.stringify(r),c=buildAtlasContract(r);assert.equal(JSON.stringify(r),before);assert.equal(c.composition.composition_id,null);assert.equal(c.composition.owner_ref,'song-a');
 assert.notEqual(c.recording.id,c.assets[0].source_bytes_id);assert.notEqual(c.assets[0].source_bytes_id,c.timelines[0].decoded_content_id);assert.notEqual(c.analysis_views[0].id,c.timelines[0].id);
 const v=c.analysis_views[0],map=c.time_maps[0];assert.equal(map.source_id,v.id);assert.equal(mapPoint(map,100).sample,300);assert.equal(map.measured_delay_samples,null);assert.equal(v.sample_count,null);
 assert.equal(c.observations[0].assessment.confidence_kind,'uncalibrated_model_score');assert.equal(c.observations[0].assessment.timing_uncertainty_samples,null);
 const upgraded=structuredClone(r);upgraded.run_id='upgrade';upgraded.observations[0].provenance.run_id='upgrade';assert.equal(buildAtlasContract(upgraded).recording.id,c.recording.id);
 const transcode=structuredClone(r);transcode.assets[0].source_sha256='d'.repeat(64);transcode.observations[0].provenance.source_sha256='d'.repeat(64);assert.notEqual(buildAtlasContract(transcode).recording.id,c.recording.id);assert.equal(buildAtlasContract(transcode).timelines[0].decoded_content_id,c.timelines[0].decoded_content_id);
});
test('crop maps exclude right padding, source clocks and provenance fail closed',()=>{
 const r=fixture();r.observations[0].provenance.analysis_view={sample_rate_hz:48000,map_numerator:48000,map_denominator:48000,crop_start_sample:40000,valid_samples:8000,right_padding:'zero to ten seconds'};
 const c=buildAtlasContract(r);assert.equal(mapPoint(c.time_maps[0],0).sample,40000);assert.throws(()=>mapPoint(c.time_maps[0],8000),/outside map/);
 for(const mutate of [r=>r.observations[0].timeline_id='other',r=>r.observations[0].reference_sample_rate_hz=44100,r=>r.observations[0].provenance.source_sha256='bad',r=>r.observations[0].start_sample=-1,r=>r.observations.push({...r.observations[0]})]){const x=fixture();mutate(x);assert.throws(()=>buildAtlasContract(x));}
});
test('typed emitted payloads reject bad units/scores, unsupported kinds and impossible shapes',()=>{
 assert.throws(()=>validatePayload('hapa.audio.word_candidate',{text:'hi',model_score:1.2,score_semantics:'probability'},'interval'),/score/);
 assert.throws(()=>validatePayload('hapa.audio.transient',{strength:NaN},'instant'),/strength/);
 assert.throws(()=>validatePayload('hapa.audio.beat_candidate',{text:'beat',method:'fixture'},'interval'),/shape/);
 assert.throws(()=>validatePayload('hapa.audio.semantic_candidate',{text:'sound',score_semantics:'cosine',ranked_concepts:[{concept:'bell',cosine_similarity:2}]},'interval'),/concept/);
 assert.throws(()=>validatePayload('hapa.audio.phoneme',{},'interval'),/unregistered/);
 assert.doesNotThrow(()=>validatePayload('hapa.audio.downbeat_candidate',{text:'downbeat',method:'fixture'},'instant'));
});
test('execution, presence and review stay independent; missing candidates never imply absence',()=>{
 const c=buildAtlasContract(fixture());assert.deepEqual(c.coverage.find(c=>c.capability==='word_timing').result_state,'present');assert.equal(c.coverage.find(c=>c.capability==='phonemes').execution_state,'unsupported');assert.equal(c.coverage.find(c=>c.capability==='phonemes').result_state,'unknown');
 const r=fixture();r.observations=[];assert.equal(buildAtlasContract(r).coverage.find(c=>c.capability==='word_timing').result_state,'unknown');
 assert.throws(()=>validateCoverage({execution_state:'failed',result_state:'absent',review_state:'unreviewed'}),/absence/);
 assert.doesNotThrow(()=>validateCoverage({execution_state:'complete',result_state:'absent',review_state:'needs_review',absence_evidence_ref:'manual-evaluation'}));
});
test('dense arrays preserve per-channel units, nulls and actual last-frame bounds',()=>{
 const r=fixture(),c=buildAtlasContract(r),f=c.feature_arrays[0];assert.equal(f.units.spectral_centroid_hz,'Hz');assert.equal(f.channel_axis.count,2);assert.equal(f.normalization,'none');assert.equal(f.missing_value_encoding,'null; no interpolation');
 r.assets[0].features.frames[0].rms=[.1];assert.throws(()=>buildAtlasContract(r),/channel axis/);
 r.assets[0].features.frames[0].rms=[.1,Infinity];assert.throws(()=>buildAtlasContract(r),/channel axis/);
});
test('uncertainty needs a defensible bracket and dependencies reject missing references and cycles',()=>{
 const r=fixture();r.observations[0].timing_uncertainty_samples={meaning:'synthetic bracket',start_earliest:90,start_latest:110,end_earliest:190,end_latest:210};assert.doesNotThrow(()=>buildAtlasContract(r));r.observations[0].timing_uncertainty_samples.start_latest=99;assert.throws(()=>buildAtlasContract(r),/bracket/);
 assert.throws(()=>validateDependencies([{id:'a',depends_on:['b']}]),/missing/);assert.throws(()=>validateDependencies([{id:'a',depends_on:['b']},{id:'b',depends_on:['a']}]),/cyclic/);
 assert.doesNotThrow(()=>validateDependencies([{id:'a',depends_on:[]},{id:'b',depends_on:['a']}]));
});


test('feature units, grid and raw amplitude semantics are validated',()=>{
 for(const mutate of [f=>f.units={rms:'dB'},f=>f.hop_samples=0,f=>f.normalization='presentation-normalized',f=>f.frames[0].rms=[-.1,.2]]){const r=fixture();mutate(r.assets[0].features);assert.throws(()=>buildAtlasContract(r));}
 const r=fixture();r.assets[0].features.frames.push({...r.assets[0].features.frames[0],start_sample:2400,end_sample:7200});assert.doesNotThrow(()=>buildAtlasContract(r));
});


test('acoustic structure payloads preserve unknown musical function and validate change evidence',()=>{
 const region={text:'Region 1',method:'test',functional_label:null,mean_rms_dbfs:-12,boundary_evidence:'synthetic novelty'};
 validatePayload('hapa.audio.section_candidate',region,'interval');
 assert.throws(()=>validatePayload('hapa.audio.section_candidate',{...region,functional_label:'chorus'},'interval'),/functional/);
 assert.throws(()=>validatePayload('hapa.audio.section_boundary_candidate',{text:'Boundary',method:'test',novelty:NaN,threshold:.012},'instant'),/novelty/);
 const evidence={kind:'energy_drop_candidate',start_sample:0,end_sample:100,boundary_sample:50,before_rms_dbfs:-10,after_rms_dbfs:-20,delta_db:-10,meaning:'synthetic'};
 validatePayload('hapa.audio.transition_candidate',{text:'Drop candidate',method:'test',transition_kind:evidence.kind,evidence},'interval');
 assert.throws(()=>validatePayload('hapa.audio.transition_candidate',{text:'Drop',method:'test',transition_kind:'chorus',evidence},'interval'),/kind/);
});


test('structure summaries reject wrong source, broken partitions, foreign repeats and nonfinite curves',()=>{
 const asset={id:'master',status:'ready',source_sha256:'a'.repeat(64),timeline_id:'t',sample_rate_hz:100,sample_count:1000};
 const region={id:'region',start_sample:0,end_sample:1000,functional_label:null};
 const r={assets:[asset],observations:[{...region,subject_id:'master',kind:'hapa.audio.section_candidate'}],musical_structure:{source_asset_id:'master',source_sha256:asset.source_sha256,timeline_id:'t',sample_rate_hz:100,sample_count:1000,quality_qualified:false,method:'fixture',regions:[region],boundaries:[],repeats:[],transitions:[],frames:[{sample:0,novelty:0,rms_dbfs:-12}],raw_evidence:'fixture.json',raw_evidence_sha256:'b'.repeat(64)}};
 validateStructureEvidence(r);
 for(const mutate of [s=>s.source_sha256='c'.repeat(64),s=>s.regions[0].end_sample=999,s=>s.repeats.push({left_id:'region',right_id:'missing',similarity:1,duration_ratio:1,score_semantics:'fixture'}),s=>s.frames[0].novelty=NaN,s=>s.quality_qualified=true]){
  const bad=structuredClone(r);mutate(bad.musical_structure);assert.throws(()=>validateStructureEvidence(bad));
 }
});
