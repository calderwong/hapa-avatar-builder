import test from 'node:test';import assert from 'node:assert/strict';
import {deriveNotes,queryNotes} from '../server/audio-atlas-notes.mjs';
import {PITCH_PACKAGES} from '../server/audio-atlas-pitch.mjs';
import {buildAtlasContract} from '../server/audio-atlas-contract.mjs';
function fixture(){
 const a={id:'master',role:'Master',status:'ready',source_sha256:'a'.repeat(64),timeline_id:'t',sample_rate_hz:16000,sample_count:1600,channels:2};
 const p={status:'candidate',method:'librosa-pyin-source-contour.v1',source_asset_id:'master',source_sha256:a.source_sha256,timeline_id:'t',source_channel:0,source_channel_count:2,source_sample_rate_hz:16000,source_sample_count:1600,analysis_sample_rate_hz:16000,analysis_sample_count:1600,hop_samples:160,window_samples:1024,centered:true,first_frame_sample:0,pad_mode:'constant zero',normalization:'none',time_map:{numerator:16000,denominator:16000,offset_samples:0,rounding:'nearest-half-up',target:'own decoded source timeline'},frequency_units:'Hz',cents_reference_hz:440,cents_units:'1200 * log2(f0_hz / 440)',resolution_cents:10,quality_qualified:false,polyphonic_separation:false,parameters:{fmin:50,fmax:1100,frame_length:1024,hop_length:160,center:true,pad_mode:'constant',resolution:.1,n_thresholds:100,beta_parameters:[2,18],boltzmann_parameter:2,max_transition_rate:35.92,switch_prob:.01,no_trough_prob:.01},voicing_policy:{minimum_score:.1,minimum_rms_dbfs:-70},chunking:{core_samples:480000,context_samples:16000},chunks:[{index:0,core_start_analysis_sample:0,core_end_analysis_sample:1600,context_start_analysis_sample:0,context_end_analysis_sample:1600}],frame_count:10,voiced_frame_count:9,analysis_input_sha256:'b'.repeat(64),runtime:{network:'disabled',packages:PITCH_PACKAGES,ffmpeg_sha256:'c'.repeat(64),worker_sha256:'d'.repeat(64),helper_sha256:'e'.repeat(64)}};
 p.frames=Array.from({length:10},(_,i)=>({analysis_center_sample:i*160,center_sample:i*160,support_start_sample:Math.max(0,i*160-512),support_end_sample:Math.min(1600,i*160+512),chunk_index:0,voiced:i!==0,raw_voiced:true,voicing_score:i===0?.01:.9,rms_dbfs:-10,raw_f0_hz:220,f0_hz:i===0?null:220,cents_from_a4:i===0?null:-1200,abstention_reason:i===0?'low_voicing_score':null}));
 return {assets:[a],observations:[],pitch_analysis:p,coverage:{pitch:{state:'candidate'}},elapsed_seconds:1};
}

function sequence(parts,{rate=16000}={}){
 const r=fixture();r.run_id='synthetic-notes';r.song_id='synthetic-song';const p=r.pitch_analysis,frames=[];let i=0;
 for(const [hz,count] of parts)for(let j=0;j<count;j++,i++){
  const h=typeof hz==='function'?hz(j):hz,at=i*160,center=Math.floor((at*rate+8000)/16000),voiced=h!==null;
  frames.push({analysis_center_sample:at,center_sample:center,support_start_sample:Math.max(0,Math.floor((at-512)*rate/16000)),support_end_sample:Math.ceil((at+512)*rate/16000),chunk_index:Math.floor(at/480000),raw_f0_hz:h,raw_voiced:voiced,voiced,voicing_score:voiced?.9:0,rms_dbfs:voiced?-10:null,f0_hz:h,cents_from_a4:voiced?1200*Math.log2(h/440):null,abstention_reason:voiced?null:'below_energy_floor'});
 }
 const count=Math.round(i*160*rate/16000);for(const f of frames)f.support_end_sample=Math.min(count,f.support_end_sample);
 Object.assign(r.assets[0],{sample_rate_hz:rate,sample_count:count});Object.assign(p,{source_sample_rate_hz:rate,source_sample_count:count,analysis_sample_count:i*160,frames,frame_count:i,voiced_frame_count:frames.filter(f=>f.voiced).length,time_map:{...p.time_map,numerator:rate},chunks:[]});
 for(let start=0,index=0;start<i*160;start+=480000,index++)p.chunks.push({index,core_start_analysis_sample:start,core_end_analysis_sample:Math.min(i*160,start+480000),context_start_analysis_sample:Math.max(0,start-16000),context_end_analysis_sample:Math.min(i*160,start+496000)});
 return r;
}
test('stable notes retain raw Hz, source spans, uncertainty and no source mutations',()=>{
 const r=sequence([[220,50],[null,10],[246.9416506,50]],{rate:44100}),before=JSON.stringify(r),n=deriveNotes(r);
 assert.equal(n.notes.length,2);assert.equal(n.notes[0].display_note,'A3');assert.equal(n.notes[0].median_hz,220);assert.equal(n.notes[0].start_sample,0);assert.equal(n.notes[0].end_sample,22050);assert.equal(n.notes[1].start_sample,26460);assert.equal(n.notes[0].acoustic_uncertainty_samples,null);assert.equal(n.quality_qualified,false);assert.equal(JSON.stringify(r),before);
 const q=queryNotes(r,r.assets[0],{start:22050,end:26460});assert.equal(q.notes.length,0);assert.ok(q.frames.every(f=>f.f0_hz===null));assert.equal(q.window_complete,true);
});
test('hysteresis separates sustained pitch changes, rejects short blips and retains bends',()=>{
 const r=sequence([[220,50],[246.9416506,50],[null,10],[220,3],[null,10],[j=>220*2**((35*Math.sin(j*.3))/1200),100]]),n=deriveNotes(r);
 assert.equal(n.notes.length,3);assert.equal(n.notes[1].display_note,'B3');assert.equal(n.rejected_span_count,1);assert.equal(n.notes[2].bend_candidate,true);assert.ok(n.notes[2].variation_cents_p90_p10>40);
});
test('abstentions and independent decoding chunks never become one held note',()=>{
 const n=deriveNotes(sequence([[220,3100]]));assert.equal(n.notes.length,2);assert.equal(n.notes[0].end_sample,480000);assert.equal(n.notes[1].start_sample,480000);
 const silent=deriveNotes(sequence([[null,100]]));assert.equal(silent.notes.length,0);assert.equal(silent.state,'candidate');assert.equal(silent.quality_qualified,false);
});
test('transposed patterns and low register lines preserve original note references',()=>{
 const n=deriveNotes(sequence([[110,50],[123.4708253,50],[130.8127827,50],[null,100],[220,50],[246.9416506,50],[261.6255653,50]]));
 assert.equal(n.motifs.length,1);assert.deepEqual(n.motifs[0].intervals_semitones,[2,1]);assert.equal(n.motifs[0].occurrences.length,2);assert.equal(n.bass_lines.length,1);assert.equal(n.bass_lines[0].note_refs.length,3);assert.equal(n.bass_lines[0].basis,'register_only_not_instrument_identity');
 const ids=new Set(n.notes.map(v=>v.id));for(const o of n.motifs[0].occurrences)assert.ok(o.note_refs.every(id=>ids.has(id)));
});
test('source mismatch, absent evidence and malformed pitch fail truthfully',()=>{
 const r=sequence([[220,50]]);assert.equal(queryNotes(r,{id:'stem-2'},{start:0,end:1}).state,'not_available');
 assert.throws(()=>queryNotes(r,r.assets[0],{start:-1,end:10}),/valid source/);const long=sequence([[220,3100]]);assert.throws(()=>queryNotes(long,long.assets[0],{start:0,end:31*16000}),/30 seconds/);
 r.pitch_analysis.frames[1].center_sample++;assert.throws(()=>deriveNotes(r),/coordinates/);delete r.pitch_analysis;assert.equal(deriveNotes(r).state,'not_available');
});
test('derived contract is separate from immutable execution coverage and contains provenance',()=>{
 const r=sequence([[220,50]]),c=buildAtlasContract(r),n=deriveNotes(r);assert.equal(c.derived_views.notes.method,n.method);assert.equal(c.derived_views.notes.note_count,1);assert.equal(c.derived_views.notes.notes,undefined);assert.equal(c.derived_views.notes.provenance.pitch_evidence_sha256,n.provenance.pitch_evidence_sha256);
});
