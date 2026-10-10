import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {deriveActivity,queryActivity} from '../server/audio-atlas-activity.mjs';
import {createAudioAtlas} from '../server/audio-atlas.mjs';import {handleAudioAtlas} from '../server/audio-atlas-routes.mjs';
function fixture(levels,{channels=1,tail=100}={}){
 const count=(levels.length-1)*100+tail,a={id:'master',role:'Declared guitar',status:'ready',source_sha256:'a'.repeat(64),timeline_id:'pcm:fixture',sample_rate_hz:1000,sample_count:count,channels};
 const arr=v=>Array(channels).fill(v),frames=levels.map((v,i)=>({start_sample:i*100,end_sample:Math.min(count,(i+1)*100),rms_dbfs:Array.isArray(v)?v:arr(v),peak_dbfs:arr(-1),at_or_above_full_scale:arr(0),near_full_scale:arr(0),stereo_correlation:null}));
 a.technical={status:'complete',method:'hapa.pcm-technical.v1',source_asset_id:a.id,source_sha256:a.source_sha256,timeline_id:a.timeline_id,sample_rate_hz:1000,sample_count:count,channels,hop_samples:100,window_samples:100,centered:false,first_frame_sample:0,normalization:'none',time_map:{numerator:1,denominator:1,offset_samples:0,target:'own decoded source timeline'},thresholds:{at_or_above_full_scale:1,near_full_scale:.999},units:{rms_dbfs:'dBFS, RMS relative to amplitude 1',peak_dbfs:'dBFS, sample peak relative to amplitude 1'},frames,summary:{rms_dbfs:arr(-10),peak_dbfs:arr(-1),crest_db:arr(9),dc_offset:arr(0),at_or_above_full_scale:arr(0),near_full_scale:arr(0),stereo_correlation:null},quiet_level:{noise_floor_dbfs:null,rms_p10_dbfs:arr(-20),window_count:Math.floor(count/100),reason:'No noise reference'},loudness:{status:'failed',reason:'Synthetic fixture'}};
 a.features={frames:frames.map(f=>({start_sample:f.start_sample,end_sample:f.end_sample,spectral_centroid_hz:1000}))};
 return {run_id:'activity-test',song_id:'synthetic-song',title:'Synthetic',assets:[a],observations:[],coverage:{},supplied_lyrics:''};
}
const derive=r=>deriveActivity(r,r.assets[0]);
test('backdated confirmation and hysteresis preserve source spans and brief gaps',()=>{
 const r=fixture([null,-20,-20,-20,-62,-62,-20,-70,-70,-70]),before=JSON.stringify(r),v=derive(r);
 assert.equal(v.segment_count,1);assert.deepEqual([v.segments[0].start_sample,v.segments[0].end_sample],[100,700]);assert.equal(v.thresholds.entry_dbfs,-55);assert.equal(v.thresholds.exit_dbfs,-61);assert.equal(v.segments[0].below_exit_frame_count,2);assert.deepEqual(v.segments[0].onset_support_samples,[100,200]);assert.deepEqual(v.segments[0].offset_support_samples,[700,800]);assert.equal(v.segments[0].acoustic_uncertainty_samples,null);assert.equal(JSON.stringify(r),before);
});
test('silence, below-floor noise and short energy bursts do not imply an absent instrument',()=>{
 for(const levels of [Array(10).fill(null),Array(10).fill(-80),[null,-20,-20,null]]){
  const v=derive(fixture(levels));assert.equal(v.segment_count,0);assert.equal(v.acoustic_family.state,'unknown');assert.equal(v.declared_role.acoustically_verified,false);assert.ok(JSON.stringify(v));
 }
 assert.equal(derive(fixture([-20,-20])).rejected_spans.length,1);
});
test('source boundary includes partial final cell and cannot invent offset uncertainty',()=>{
 const v=derive(fixture([-20,-20,-20,-20],{tail:37}));assert.equal(v.segments[0].end_sample,337);assert.equal(v.active_sample_count,337);assert.equal(v.segments[0].ends_at_source_boundary,true);assert.equal(v.segments[0].offset_support_samples,null);
});
test('strongest-channel evidence survives cancellation while timbre remains unknown',()=>{
 const r=fixture([[-80,-20],[-80,-20],[-80,-20]],{channels:2});r.assets[0].features.frames.forEach(f=>f.spectral_centroid_hz=null);const v=derive(r);
 assert.equal(v.segment_count,1);assert.equal(v.segments[0].median_strongest_channel_dbfs,-20);assert.equal(v.segments[0].timbre.state,'unknown');assert.equal(v.segments[0].register.state,'unknown');assert.equal(v.declared_role.label,'Declared guitar');
});
test('complete window retains full overlapping spans and excludes half-open boundaries',()=>{
 const r=fixture([-20,-20,-20,null,null,null,-20,-20,-20]);const v=queryActivity(r,r.assets[0],{start:200,end:600});assert.equal(v.frames.length,4);assert.equal(v.segments.length,1);assert.equal(v.segments[0].start_sample,0);assert.equal(v.segments[0].end_sample,300);assert.equal(v.window_complete,true);
 const long=fixture(Array(310).fill(-20));assert.throws(()=>queryActivity(long,long.assets[0],{start:0,end:31000}),/30seconds/);
});
test('stale source measurements refuse; missing feature evidence does not become zero',()=>{
 const r=fixture([-20,-20,-20]);r.assets[0].source_sha256='b'.repeat(64);assert.throws(()=>derive(r),/identity mismatch/);r.assets[0].source_sha256='a'.repeat(64);delete r.assets[0].features;assert.equal(derive(r).segments[0].timbre.spectral_centroid_median_hz,null);delete r.assets[0].technical;assert.equal(derive(r).state,'not_available');
});
test('owner/API/export agree after reopen, preserve result bytes and never start inference',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'atlas-activity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const r=fixture([-20,-20,-20,null,null,null]),storage=path.join(root,'atlas'),dir=path.join(storage,'runs',r.run_id);fs.mkdirSync(dir,{recursive:true});fs.mkdirSync(path.join(storage,'jobs'));const bytes=JSON.stringify(r),sha=createHash('sha256').update(bytes).digest('hex');fs.writeFileSync(path.join(dir,'result.json'),bytes);fs.writeFileSync(path.join(storage,'jobs',r.run_id+'.json'),JSON.stringify({id:r.run_id,state:'complete',result_sha256:sha}));
 const atlas=createAudioAtlas({root,storage,runner:()=>{throw Error('Inference forbidden');}});t.after(()=>atlas.close());const q=atlas.query(r.run_id,{op:'activity',start:0,end:600});assert.equal(q.segment_count,1);assert.deepEqual(atlas.derived(r.run_id).activity[0].segments,q.segments);assert.equal(atlas.contract(r.run_id).derived_views.activity[0].segment_count,1);
 let response;const context={req:{method:'GET',headers:{}},res:{},url:new URL(`http://localhost/api/echos/audio-atlas/jobs/${r.run_id}/query?op=activity&start=0&end=600`),atlas,requireAdmin:()=>true,sendJson:(_r,status,body)=>response={status,body}};
 await handleAudioAtlas(context);assert.equal(response.status,200);assert.deepEqual(response.body.segments,q.segments);await handleAudioAtlas({...context,requireAdmin:()=>false});assert.equal(fs.readFileSync(path.join(dir,'result.json'),'utf8'),bytes);
 const reopened=createAudioAtlas({root,storage});assert.deepEqual(reopened.query(r.run_id,{op:'activity',start:0,end:600}),q);await reopened.close();
});
