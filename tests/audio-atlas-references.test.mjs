import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {timingReferenceTargets,validateTimingReference,timingEvaluation} from '../src/domain/audio-atlas-references.js';
import {createAudioAtlas} from '../server/audio-atlas.mjs';
import {handleAudioAtlas} from '../server/audio-atlas-routes.mjs';
const result=()=>({run_id:'fixture',assets:[{id:'master',role:'Vocals',status:'ready',source_sha256:'a'.repeat(64),timeline_id:'t',sample_rate_hz:1000,sample_count:10000,channels:1}],observations:[0,1].map((i)=>({id:`master:aligned-word:${i}`,subject_id:'master',kind:'hapa.audio.word_candidate',shape:'interval',start_sample:1000+i*1000,end_sample:1400+i*1000,payload:{text:'go',model_score:null,score_semantics:'synthetic fixture'}})),forced_alignment:{source_asset_id:'master',supplied_tokens:[{text:'go'},{text:'go'},{text:'A'}]}});
// Every label in this file is an isolated synthetic test fixture, including
// explicit human-origin cases that exercise separation. None enter real runs.
const input=(extra={})=>({asset_id:'master',source_sha256:'a'.repeat(64),timeline_id:'t',target_id:'master:aligned-word:0',text:'go',label_origin:'synthetic',label:'present',start_sample:900,end_sample:1450,uncertainty_samples:10,reviewer:'synthetic test fixture',note:'Not an actual listening reference',...extra});
const history=(refs=[],events=[])=>({revision:refs.length+events.length,reference_events:refs,events});
test('unlabelled targets keep repeated words and unresolved tokens; accuracy stays unknown',()=>{
 const r=result(),targets=timingReferenceTargets(r,'master');assert.equal(targets.length,3);assert.notEqual(targets[0].id,targets[1].id);assert.equal(targets[2].start_sample,null);
 const report=timingEvaluation(r,history(),'master');assert.equal(report.human.original.onset.count,0);assert.equal(report.human.original.onset.medianMs,null);assert.equal(report.human.original.offset.p95Ms,null);assert.equal(report.quality_qualified,false);
});
test('source, timeline, exact target/text and all boundary fields are validated',()=>{
 for(const extra of [{asset_id:'missing'},{source_sha256:'b'.repeat(64)},{timeline_id:'wrong'},{target_id:'missing'},{text:'GO'},{label_origin:'model'},{label:'accepted'}, {start_sample:NaN},{end_sample:10001},{end_sample:900},{uncertainty_samples:-1},{uncertainty_samples:1001},{reviewer:''},{note:''},{label:'uncertain'}])assert.throws(()=>validateTimingReference(result(),input(extra)));
 assert.equal(validateTimingReference(result(),input()).status,'operator_entered_reference');
});
test('known errors use absolute median/nearest-rank p95 with signed bias and separate origins',()=>{
 const refs=[input(),input({target_id:'master:aligned-word:1',start_sample:2020,end_sample:2340}),input({label_origin:'human',start_sample:950,end_sample:1400})];
 const r=timingEvaluation(result(),history(refs),'master');assert.deepEqual(r.synthetic.original.onset,{count:2,medianMs:60,p95Ms:100,signedBiasMs:40});assert.equal(r.synthetic.original.offset.medianMs,55);assert.equal(r.human.original.onset.medianMs,50);assert.equal(r.targets[0].reference.label_origin,'human');assert.equal(r.targets[0].synthetic_reference.label_origin,'synthetic');
 // A later synthetic entry cannot replace a human reference.
 const next=timingEvaluation(result(),history([...refs,input({start_sample:1000})]),'master');assert.equal(next.human.original.onset.medianMs,50);assert.equal(next.synthetic.original.onset.medianMs,10);
});
test('uncertain, omitted and retracted labels never manufacture boundary accuracy',()=>{
 const untimed=label=>{const r=input({label});delete r.start_sample;delete r.end_sample;delete r.uncertainty_samples;return r;};
 for(const label of ['uncertain','not_performed','retracted']){const r=timingEvaluation(result(),history([input(),untimed(label)]),'master');assert.equal(r.synthetic.original.onset.count,0);assert.equal(r.synthetic.maximumDeclaredUncertaintyMs,null);assert.equal(r.synthetic.labelled_targets,label==='retracted'?0:1);}
 const r=timingEvaluation(result(),history([input({target_id:'master:aligned-word:2',text:'A'})]),'master');assert.equal(r.synthetic.present,1);assert.equal(r.synthetic.original.onset.count,0);
});
test('accepted corrections use the same reference; proposals, rejection and changed text stay explicit',()=>{
 const ref=input({label_origin:'human'}),proposal={observation_id:ref.target_id,state:'needs_review',correction:{start_sample:910,end_sample:1460,text:'go'}};
 let r=timingEvaluation(result(),history([ref],[proposal]),'master');assert.equal(r.human.effective.onset.medianMs,100);
 const accepted={...proposal,state:'accepted_by_human'};r=timingEvaluation(result(),history([ref],[accepted,proposal]),'master');assert.equal(r.human.effective.onset.medianMs,10);assert.equal(r.human.original.onset.medianMs,100);
 r=timingEvaluation(result(),history([ref],[{...accepted,correction:{...accepted.correction,text:'gone'}}]),'master');assert.equal(r.human.effective.onset.count,0);assert.equal(r.targets[0].effective_exclusion,'corrected_text_differs_from_reference');
 r=timingEvaluation(result(),history([ref],[{...accepted,state:'rejected'}]),'master');assert.equal(r.targets[0].effective_exclusion,'candidate_rejected');
 const stale={...ref,source_sha256:'stale'};assert.equal(timingEvaluation(result(),history([stale]),'master').excluded.length,1);
});
test('owner and authenticated API persist references with shared revision, preserving review and result bytes',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hapa-atlas-reference-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));fs.mkdirSync(path.join(root,'data'));fs.mkdirSync(path.join(root,'scripts'));
 for(const name of ['audio-atlas-worker.py','echo_audio_analysis_cache.py','echo_reconstruction_alignment.py','audio_atlas_stem_alignment.py','audio_atlas_structure.py','audio_atlas_spectrogram.py','audio_atlas_technical.py','audio_atlas_harmony.py'])fs.writeFileSync(path.join(root,'scripts',name),'fixture');
 const audio=path.join(root,'source.wav');fs.writeFileSync(audio,Buffer.concat([Buffer.from('RIFF0000WAVE'),Buffer.alloc(100)]));fs.writeFileSync(path.join(root,'data/hapa-songs-store.json'),JSON.stringify({songs:[{id:'test',title:'Test',audio:{localPath:audio},stems:[]}]}));
 const atlas=createAudioAtlas({root,runner:async(_root,manifest)=>{const m=JSON.parse(fs.readFileSync(manifest)),r=result();r.run_id=m.id;r.song_id='test';r.assets[0].source_sha256=m.sources[0].sha256;for(const o of r.observations)Object.assign(o,{timeline_id:'t',reference_sample_rate_hz:1000,claim_type:'derived',confidence:null,review_state:'unreviewed',provenance:{run_id:m.id,source_sha256:m.sources[0].sha256,evidence_asset_id:'master',analysis_view:{stride:1}}});fs.writeFileSync(path.join(path.dirname(manifest),'result.json'),JSON.stringify(r));}});t.after(()=>atlas.close());
 const job=await atlas.start('test');const status=await atlas.wait(job.id);assert.equal(status.state,'complete',status.error);const file=path.join(root,'data/audio-atlas/runs',job.id,'result.json'),bytes=fs.readFileSync(file),ref=input({source_sha256:atlas.result(job.id).assets[0].source_sha256,revision:0});
 let response,called=0;const route={res:{},atlas,requireAdmin:()=>true,readBody:async()=>{called++;return ref;},sendJson:(_r,status,body)=>response={status,body},url:new URL(`http://127.0.0.1/api/echos/audio-atlas/jobs/${job.id}/reference`)};
 await handleAudioAtlas({...route,req:{method:'POST',headers:{}},requireAdmin:()=>false});assert.equal(called,0);
 await handleAudioAtlas({...route,req:{method:'POST',headers:{origin:'https://bad.example',host:'127.0.0.1'}}});assert.equal(response.status,403);assert.equal(called,0);
 await handleAudioAtlas({...route,req:{method:'POST',headers:{}}});assert.equal(response.status,202);assert.equal(response.body.revision,1);
 assert.throws(()=>atlas.reference(job.id,ref),/conflict/);
 atlas.review(job.id,{revision:1,observation_id:ref.target_id,state:'needs_review',reviewer:'fixture',note:'synthetic'});assert.equal(atlas.reviews(job.id).reference_events.length,1);
 atlas.reference(job.id,{...ref,revision:2,start_sample:920});assert.equal(atlas.reviews(job.id).events.length,1);assert.equal(atlas.reviews(job.id).reference_events.length,2);
 const restored=createAudioAtlas({root});t.after(()=>restored.close());assert.equal(restored.query(job.id,{op:'timing-evaluation'}).synthetic.original.onset.medianMs,80);assert.deepEqual(fs.readFileSync(file),bytes);
 await handleAudioAtlas({...route,req:{method:'GET',headers:{}},url:new URL(`http://127.0.0.1/api/echos/audio-atlas/jobs/${job.id}/query?op=timing-evaluation`)});assert.equal(response.body.revision,3);assert.equal(response.body.human.labelled_targets,0);
});
