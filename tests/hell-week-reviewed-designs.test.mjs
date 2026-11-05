import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createHellWeekGeneration}=require('../electron/hell-week-generation.cjs');
const {createHellWeekStorage}=require('../electron/hell-week-storage.cjs');
const {hash}=require('../electron/hell-week-contract.cjs');
const {validate}=require('../electron/hell-week-reviewed-designs.cjs');
const png=Buffer.alloc(30);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1024,16);png.writeUInt32BE(1536,20);
function packet(request='art:fixture',model='fixture-model-a'){
 const cards=[0,1].map(n=>{const body={concept_id:'fixture.'+n,name:'Lens '+n,description:'A reviewed idea.',flavor_text:'Keep the source in the light.',abilities:[{name:'Trace',purpose:'Attribution',trigger:'Review',effect:'Follow evidence',limits:'No factual guarantee',implementation_status:'authored practice'}],parameters:[],no_parameters_reason:'Narrative only.',image_prompt:'Exact reviewed image prompt '+n+' — no additional aesthetic.'};const record_json=JSON.stringify({kind:'card_design',title:body.name,body,source_refs:['ev:fixture']});return{record:{id:'record:fixture-'+n,revision:1,digest:hash(record_json)},record_json,prompt_sha256:hash(body.image_prompt)};});
 return JSON.stringify({schema:'hapa.dreamer.builder-designs.v1',owner:'hapa-dreamer',request_id:request,name:'Reviewed set',set:{id:'record:set',revision:1,digest:'a'.repeat(64)},model,settings:{quality:'low',size:'1024x1536'},cards});
}
async function fixture(t){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'hw-reviewed-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));let online=true,failRegistration=0,unknown=false;const calls=[],registered=[];
 const mediaStore=createHellWeekStorage({config:{mount:root,volumeUUID:'fixture',directory:'external',storeId:'fixture',maxBytes:64*1024**2,maxObjectBytes:2*1024**2},probeImpl:async()=>{if(!online)throw Error('drive unavailable')}});
 const options={userDataPath:path.join(root,'private'),mediaStore,credentialStore:{read:async()=> 'fixture-key'},registerCard:async({card})=>{if(failRegistration-->0)throw Error('registration interrupted');registered.push(card);return{cardId:card.id,custody:{originCoreKey:'fixture-only'},reviewStatus:'candidate-pending-human-review'};},fetchImpl:async(url,opts)=>{calls.push({url,body:JSON.parse(opts.body)});assert.ok(url.includes('/images/'),'no LEO/Thor request');if(unknown)throw Error('uncertain fixture transport');return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));}};
 return{root,options,engine:createHellWeekGeneration(options),calls,registered,online:v=>online=v,fail:v=>failRegistration=v,unknown:v=>unknown=v};
}
async function execute(engine,id){await engine.start({id,mode:'images'});await engine._active();return engine.status({id});}
test('exact import is idempotent, preserves all six fields, and uses reviewed prompts without rediscovery',async t=>{
 const f=await fixture(t),raw=packet(),run=await f.engine.importDesigns(raw);assert.equal(f.calls.length,0);assert.equal(run.state,'designed');assert.equal(run.totalCards,2);
 assert.equal((await f.engine.importDesigns(raw)).id,run.id);await assert.rejects(()=>f.engine.importDesigns(packet('art:fixture','different-model')),/different packet/);
 const done=await execute(f.engine,run.id);assert.equal(done.state,'complete');assert.equal(f.calls.length,2);
 assert.equal(f.calls[0].body.prompt,JSON.parse(JSON.parse(raw).cards[0].record_json).body.image_prompt);
 assert.equal(f.registered[0].design.flavor_text,'Keep the source in the light.');assert.deepEqual(f.registered[0].design.parameters,[]);assert.equal(f.registered[0].reviewedDesign.recordJson,JSON.parse(raw).cards[0].record_json);
 const sibling=await f.engine.importDesigns(packet('art:comparison','fixture-model-b'));const second=await execute(f.engine,sibling.id);assert.equal(second.state,'complete');assert.equal(f.calls.length,4);assert.equal(f.calls[2].body.model,'fixture-model-b');assert.notEqual(second.id,done.id);assert.deepEqual(second.cards.map(c=>c.reviewedDesign.source),done.cards.map(c=>c.reviewedDesign.source));
});
test('two image-before-registration interruptions reuse accepted artwork without another paid call',async t=>{
 const f=await fixture(t),run=await f.engine.importDesigns(packet());f.fail(2);
 let r=await execute(f.engine,run.id);assert.equal(r.state,'blocked');assert.equal(f.calls.length,1);const image=r.cards[0].image.sha256;
 r=await execute(createHellWeekGeneration(f.options),run.id);assert.equal(r.state,'blocked');assert.equal(f.calls.length,1);assert.equal(r.cards[0].image.sha256,image);
 r=await execute(createHellWeekGeneration(f.options),run.id);assert.equal(r.state,'complete');assert.equal(f.calls.length,2);assert.equal(r.cards[0].image.sha256,image);
});
test('ambiguous image outcome does not automatically purchase a replay',async t=>{
 const f=await fixture(t),run=await f.engine.importDesigns(packet());f.unknown(true);let r=await execute(f.engine,run.id);assert.equal(r.state,'blocked');assert.equal(f.calls.length,1);
 f.unknown(false);r=await execute(createHellWeekGeneration(f.options),run.id);assert.equal(r.state,'blocked');assert.equal(f.calls.length,1);
});
test('invalid field, prompt digest, extra setting and unavailable drive refuse before artwork',async t=>{
 const f=await fixture(t);for(const edit of [p=>{p.cards[0].prompt_sha256='b'.repeat(64)},p=>{p.settings.seed=42},p=>{const r=JSON.parse(p.cards[0].record_json);delete r.body.flavor_text;p.cards[0].record_json=JSON.stringify(r);p.cards[0].record.digest=hash(p.cards[0].record_json)}]){const p=JSON.parse(packet());edit(p);assert.throws(()=>validate(JSON.stringify(p)));}
 f.online(false);await assert.rejects(()=>f.engine.importDesigns(packet()),/drive unavailable/);assert.equal(f.calls.length,0);
});
test('packet check reports absent, partial and complete imports with exact commitments',async t=>{
 const {inspectPacket}=require('../cli/hell-week-designs.cjs');const f=await fixture(t),raw=packet(),spec=validate(raw);
 assert.equal((await inspectPacket(f.engine,spec)).exists,false);
 const run=await f.engine.importDesigns(raw);let checked=await inspectPacket(f.engine,spec);assert.equal(checked.fresh,true);assert.equal(checked.cards.length,2);assert.equal(checked.nativeDispatch,false);assert.equal(f.calls.length,0);
 const file=path.join(f.engine.root,run.id,'run.json'),saved=JSON.parse(await fs.readFile(file,'utf8'));saved.phase='reviewed-design-import';saved.importCursor=1;await fs.writeFile(file,JSON.stringify(saved));
 checked=await inspectPacket(f.engine,spec);assert.equal(checked.fresh,false);
 await f.engine.importDesigns(raw);checked=await inspectPacket(f.engine,spec);assert.equal(checked.fresh,true);
 await assert.rejects(()=>inspectPacket(f.engine,validate(packet('art:fixture','another-model'))),/conflicts/);
});
test('two interrupted imports keep committed designs and never clear an owner pause',async t=>{
 const {prepareReviewed}=require('../electron/hell-week-reviewed-designs.cjs');const {atomic}=require('../electron/hell-week-generation.cjs');
 const f=await fixture(t),raw=packet(),spec=validate(raw),local=id=>path.join(f.engine.root,id),dir=id=>path.join(f.root,'external','runs-v2',id);let failAt=1;
 const opts={root:f.engine.root,atomic,local,dir,admission:async()=>{},read:async id=>({run:JSON.parse(await fs.readFile(path.join(local(id),'run.json'),'utf8'))}),save:async run=>{await atomic(path.join(local(run.id),'run.json'),run);if(run.importCursor===failAt){failAt++;throw Error('fixture checkpoint interruption');}}};
 await assert.rejects(()=>prepareReviewed(raw,opts),/checkpoint interruption/);const first=await fs.readFile(path.join(dir(spec.id),'cards','000000000000.json'));
 await assert.rejects(()=>prepareReviewed(raw,opts),/checkpoint interruption/);
 await atomic(path.join(local(spec.id),'control.json'),{pauseRequested:true});await assert.rejects(()=>prepareReviewed(raw,opts),/explicitly paused/);
 assert.deepEqual(await fs.readFile(path.join(dir(spec.id),'cards','000000000000.json')),first);assert.equal(JSON.parse(await fs.readFile(path.join(local(spec.id),'run.json'))).importCursor,2);
 // Fixture-only explicit owner control release; production import never clears it.
 await atomic(path.join(local(spec.id),'control.json'),{pauseRequested:false});const done=await prepareReviewed(raw,opts);assert.equal(done.state,'designed');assert.equal(f.calls.length,0);
});
