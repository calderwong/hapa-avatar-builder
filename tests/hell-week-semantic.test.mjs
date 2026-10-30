import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {createHellWeekGeneration}=require('../electron/hell-week-generation.cjs');
const {createHellWeekStorage,treeBytes}=require('../electron/hell-week-storage.cjs');
const {createSourceReader}=require('../electron/hell-week-source.cjs');
const grammar=require('../electron/hell-week-json-stream.cjs');
const png=Buffer.alloc(30);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.writeUInt32BE(1024,16);png.writeUInt32BE(1536,20);
function design(key,extra={}){return{title:key,concept_key:key,duplicate_of:null,kind:'skill',summary:'Preserve a distinct idea.',facts:[],desires:[],uncertainties:[],lore:'A branching garden.',skills:[{name:'Trace',type:'Active',description:'Keep evidence.'}],evidence_quote_ids:['excerpt-1'],visual_thesis:'A seed vault',image_prompt:'A seed vault unfolds into a vast branching landscape.',tags:['memory'],...extra};}
async function fixture(t,extra={}){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'hw-semantic-')));t.after(()=>fs.rm(root,{recursive:true,force:true}));const input=path.join(root,'notes.md');await fs.writeFile(input,extra.text||'Seeds survive. Keep the original seed archive.');let online=true;
 const mediaStore=createHellWeekStorage({config:{mount:root,volumeUUID:'fixture',directory:'external',storeId:'fixture',maxBytes:64*1024**2,maxObjectBytes:2*1024**2},probeImpl:async()=>{if(!online)throw Error('registered drive offline')}});
 const calls=[],registered=new Map();let hook=extra.hook;
 const options={userDataPath:path.join(root,'private'),mediaStore,credentialStore:{read:async()=> 'fixture-key'},registerCard:async data=>{registered.set(data.card.id,data);return{cardId:data.card.id,uri:data.card.image.storage.path}},...extra.options,fetchImpl:async(url,opts)=>{
  const body=opts.body instanceof FormData?opts.body:JSON.parse(opts.body);calls.push({url,body});if(hook)await hook({url,body,calls});
  if(url.includes('/images/'))return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));
  const input=JSON.parse(body.input);const value=input.chunks?{set_name:'Seed Archive',summary:'Retain the source',yarn:'Grow without erasure',preparation:Object.fromEntries(input.chunks.map(c=>[c.chunk_id,{focus:'Seeds',why_it_matters:'Continuity',continuity:'Keep identities',sections:[{title:'Seeds',purpose:'Preservation',relationship_to_other_sections:'Distinct source section'}]}]))}:extra.page?extra.page(input):{cards:[design('seed preservation'),design('experiment records')],has_more:false,coverage_note:'Two distinct useful ideas.'};
  return new Response(JSON.stringify({id:'response-'+calls.length,status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
 }};
 const engine=createHellWeekGeneration(options);
 async function prepare(){const r=await engine.create({filePath:input,name:'notes.md',maxCards:1});await engine._active();return engine.status({id:r.id});}
 return{root,input,mediaStore,calls,registered,options,engine,prepare,setOnline:v=>{online=v},setHook:v=>{hook=v}};
}
async function execute(engine,id,options={}){await engine.start({id,...options});await engine._active();return engine.status({id});}
test('one source section yields multiple paged Cards; image cap pauses only artwork and two resumes reuse designs',async t=>{
 const f=await fixture(t,{page:i=>({cards:i.page===0?[design('seeds'),design('records')]:[design('branching')],has_more:i.page===0,coverage_note:'Distinct ideas, continued across pages.'})});const prepared=await f.prepare();assert.equal(prepared.totalCards,0);assert.equal(prepared.sectionCount,1);assert.equal(f.calls.length,0);
 let r=await execute(f.engine,prepared.id,{imageLimit:1});assert.equal(r.state,'paused');assert.equal(r.pauseReason,'image-budget');assert.equal(r.totalCards,3);assert.equal(r.savedCards,1);assert.equal(r.analysisComplete,true);assert.equal(f.calls.filter(c=>c.url.includes('/images/')).length,1);assert.ok(f.calls.slice(0,3).every(c=>c.url.endsWith('/responses')));
 for(let n=2;n<=3;n++){const resumed=createHellWeekGeneration(f.options);r=await execute(resumed,prepared.id,{imageLimit:1});assert.equal(r.savedCards,n);}
 assert.equal(r.state,'complete');assert.equal(f.calls.length,6);assert.equal(f.registered.size,3);assert.equal((await f.engine.status({id:r.id,offset:1,limit:1})).cards.length,1);
});
test('zero-Card sections finish honestly without image requests',async t=>{
 const f=await fixture(t,{page:()=>({cards:[],has_more:false,coverage_note:'This section contains repetition only; no useful distinct Card.'})});const p=await f.prepare(),r=await execute(f.engine,p.id);assert.equal(r.state,'complete');assert.equal(r.totalCards,0);assert.equal(f.calls.length,2);assert.equal(f.registered.size,0);
});
test('repeated concepts across sections retain source occurrences without duplicate images',async t=>{
 const f=await fixture(t,{text:('Seeds survive in the archive.\n\n').repeat(600),page:()=>({cards:[design('seed preservation')],has_more:false,coverage_note:'One repeated concept with another source occurrence.'})});const p=await f.prepare();assert.ok(p.sectionCount>1);const r=await execute(f.engine,p.id);assert.equal(r.totalCards,1);assert.equal(r.duplicateOccurrences,p.sectionCount-1);assert.equal(f.calls.filter(c=>c.url.includes('/images/')).length,1);assert.equal([...f.registered.values()][0].card.relatedSourceCount,p.sectionCount-1);
});
test('large UTF-8 source exceeds the old byte and 96-Card ceilings; import resumes twice without copying source payloads',async t=>{
 let clock=0;const source=('A meaningful original paragraph 🙂.\n\n').repeat(40000);const f=await fixture(t,{text:source,options:{now:()=>++clock,importLeaseMs:1}});let r=await f.prepare();assert.equal(r.state,'preparation-paused');const first=r.importOffset;
 await f.engine.prepareMore({id:r.id});await f.engine._active();r=await f.engine.status({id:r.id});assert.ok(r.importOffset>first);
 const resumed=createHellWeekGeneration({...f.options,importLeaseMs:1000000});await resumed.prepareMore({id:r.id});await resumed._active();r=await resumed.status({id:r.id});assert.equal(r.state,'prepared');assert.ok(r.sectionCount>96);assert.equal(r.importOffset,Buffer.byteLength(source));assert.equal(f.calls.length,0);
 const folder=path.join(f.mediaStore.root,'runs-v2',r.id,'sections');const names=(await fs.readdir(folder)).sort();assert.equal(names.length,r.sectionCount);const plan=JSON.parse(await fs.readFile(path.join(f.root,'private','Hell Week Runs',r.id,'source.json')));const reader=createSourceReader();let rebuilt='';for(const name of names)rebuilt+=(await reader.chunk(plan.source,JSON.parse(await fs.readFile(path.join(folder,name))))).text;assert.equal(rebuilt,source);assert.ok(await treeBytes(f.mediaStore.root)<Buffer.byteLength(source)/2);
});
test('streaming JSON survives boundaries and restarts, preserves raw branches, and refuses invalid trailing structure',async t=>{
 const text=JSON.stringify({mapping:{a:{parent:null,message:{author:{role:'user'},content:{parts:['A "quoted" branch 🙂. '.repeat(4000)]}}},b:{parent:'a',message:{content:{parts:['Different answer']}}}}});const f=await fixture(t,{text});const file=path.join(f.root,'conversation.json');await fs.rename(f.input,file);const r=await f.engine.create({filePath:file});await f.engine._active();const done=await f.engine.status({id:r.id});assert.equal(done.state,'prepared');assert.ok(done.sectionCount>1);
 const s=grammar.initial();for(let i=0;i<text.length;i+=17)grammar.feed(s,text.slice(i,i+17),i+17>=text.length);assert.equal(s.root,'done');for(const bad of ['{"a":1,}','[true,]','{"a":"bad\\q"}','{}{}'])assert.throws(()=>grammar.feed(grammar.initial(),bad,true));
});
test('source changes stop before spend; completed designs can be illustrated without rereading moved source',async t=>{
 const f=await fixture(t);const p=await f.prepare();const r=await execute(f.engine,p.id,{mode:'design'});assert.equal(r.state,'designed');await fs.rename(f.input,f.input+'.moved');const done=await execute(createHellWeekGeneration(f.options),p.id);assert.equal(done.state,'complete');
 const g=await fixture(t);const q=await g.prepare();await fs.appendFile(g.input,'Changed');const held=await execute(g.engine,q.id);assert.equal(held.state,'blocked');assert.equal(g.calls.length,0);assert.match(held.error,/changed|moved/);
});
test('accepted discovery receipts replay across two cursor interruptions with no duplicate paid calls or Card identities',async t=>{
 const f=await fixture(t);const p=await f.prepare();const file=path.join(f.root,'private','Hell Week Runs',p.id,'run.json');const initial=JSON.parse(await fs.readFile(file));const r=await execute(f.engine,p.id,{mode:'design'});const ids=r.cards.map(c=>c.id);const calls=f.calls.length;
 for(let i=0;i<2;i++){const cursor=JSON.parse(await fs.readFile(file));Object.assign(cursor,{chunkCursor:0,pageCursor:0,totalCards:0,processedSections:0,analysisComplete:false,phase:'analysis',state:'interrupted',recent:[],duplicateOccurrences:0,continuity:initial.continuity});await fs.writeFile(file,JSON.stringify(cursor));const resumed=createHellWeekGeneration(f.options);const result=await execute(resumed,p.id,{mode:'design'});assert.deepEqual(result.cards.map(c=>c.id),ids);assert.equal(f.calls.length,calls);}
});
test('ambiguous paid request never replays automatically; explicit recovery is one step and pauses',async t=>{
 let fail=true;const f=await fixture(t,{hook:()=>{if(fail)throw Error('connection lost')}});const p=await f.prepare();let r=await execute(f.engine,p.id);assert.equal(r.calls['leo-0'].state,'unknown');fail=false;r=await execute(createHellWeekGeneration(f.options),p.id);assert.equal(f.calls.length,1);
 await assert.rejects(()=>f.engine.start({id:p.id,retryUnknownCallId:'leo-0'}),/Acknowledge/);r=await execute(createHellWeekGeneration(f.options),p.id,{retryUnknownCallId:'leo-0',acknowledgePossibleDuplicateCharge:true});assert.equal(r.state,'paused');assert.equal(f.calls.length,2);assert.equal(r.totalCards,0);r=await execute(createHellWeekGeneration(f.options),p.id,{mode:'design'});assert.equal(r.state,'designed');assert.equal(f.calls.length,3);
});
test('offline external store preserves catalog status and holds new work; insufficient lease dispatches nothing',async t=>{
 const f=await fixture(t);const p=await f.prepare();await execute(f.engine,p.id,{mode:'design'});f.setOnline(false);const r=await f.engine.status({id:p.id});assert.equal(r.totalCards,2);assert.match(r.storageError,/offline/);await assert.rejects(()=>f.engine.start({id:p.id}),/offline/);assert.equal(f.calls.length,2);
 const g=await fixture(t,{options:{leaseMs:100}});const q=await g.prepare();const held=await execute(g.engine,q.id);assert.equal(held.state,'yielded');assert.equal(g.calls.length,0);
});
test('saved image survives an uncertain cursor and repeated recovery without another provider request',async t=>{
 const f=await fixture(t,{page:()=>({cards:[design('only concept')],has_more:false,coverage_note:'One concept.'})});const p=await f.prepare();let r=await execute(f.engine,p.id);const original=r.cards[0].image.sha256;assert.equal(f.calls.length,3);
 const runFile=path.join(f.root,'private','Hell Week Runs',p.id,'run.json');const external=path.join(f.mediaStore.root,'runs-v2',p.id);const cardFile=path.join(external,'cards','000000000000.json');
 for(let n=0;n<2;n++){const card=JSON.parse(await fs.readFile(cardFile));delete card.image;delete card.registration;card.state='designed';await fs.writeFile(cardFile,JSON.stringify(card));const cursor=JSON.parse(await fs.readFile(runFile));Object.assign(cursor,{state:'interrupted',phase:'artwork',imageCursor:0,imageCount:0,savedCards:0,calls:{'image-0':{...JSON.parse(await fs.readFile(path.join(external,'image-0.receipt.json'))),state:'submitted'}}});await fs.writeFile(runFile,JSON.stringify(cursor));r=await execute(createHellWeekGeneration(f.options),p.id);assert.equal(r.state,'complete');assert.equal(r.cards[0].image.sha256,original);assert.equal(f.calls.length,3);assert.equal(f.registered.size,1);}
});
test('non-advancing discovery holds after two empty continuation pages and resume buys nothing',async t=>{
 const f=await fixture(t,{page:()=>({cards:[],has_more:true,coverage_note:'No new concepts yet.'})});const p=await f.prepare();let r=await execute(f.engine,p.id);assert.equal(r.state,'blocked');assert.match(r.error,/continued twice/);assert.equal(f.calls.length,3);r=await execute(createHellWeekGeneration(f.options),p.id);assert.equal(r.state,'blocked');assert.equal(f.calls.length,3);
});
test('full external storage keeps saved designs readable and refuses dispatch',async t=>{
 const f=await fixture(t);const p=await f.prepare();await execute(f.engine,p.id,{mode:'design'});const handle=await fs.open(path.join(f.mediaStore.root,'quota-fixture'),'w');await handle.truncate(63*1024**2);await handle.close();const r=await f.engine.status({id:p.id});assert.equal(r.storageError,null);assert.equal(r.cards.length,2);await assert.rejects(()=>f.engine.start({id:p.id}),/byte ceiling/);assert.equal(f.calls.length,2);
});
test('semantic discovery carries Avatar profiles, uses only chosen image pixels and registers both offered and used lineage',async t=>{
 let pixelReads=0;
 const foundations=[{avatarId:'red',name:'Red',context:{persona:'A seedkeeper'},snapshotHash:'red-profile',image:{sha256:'fixture-image',bytes:png.length,mimeType:'image/png'}},{avatarId:'blue',name:'Blue',context:{persona:'A strategist'},snapshotHash:'blue-profile',image:null}];
 const refs={snapshot:async selections=>{assert.deepEqual(selections.map(s=>s.avatarId),['red','blue']);return foundations;},readImages:async images=>{pixelReads++;assert.equal(images.length,1);return[{bytes:png,mimeType:'image/png',fileName:'red.png'}]}};
 const f=await fixture(t,{options:{avatarReferences:refs},page:()=>({cards:[design('seedkeeper',{avatar_uses:[{avatar_id:'red',role:'gardener',reason:'Protects the archive'}]})],has_more:false,coverage_note:'One useful concept.'}),hook:({url,body})=>{if(url.endsWith('/responses')){assert.equal(JSON.parse(body.input).foundational_avatars.length,2);assert.ok(!body.instructions.includes('Forge one useful Hapa Card'));}}});
 const p=await f.engine.create({filePath:f.input,avatarSelections:[{avatarId:'red'},{avatarId:'blue',assetId:null}]});await f.engine._active();const r=await execute(f.engine,p.id);assert.equal(r.state,'complete');assert.equal(pixelReads,1);const image=f.calls.find(c=>c.url.includes('/images/'));assert.ok(image.url.endsWith('/images/edits'));assert.equal(image.body.getAll('image[]').length,1);assert.deepEqual(Buffer.from(await image.body.get('image[]').arrayBuffer()),png);const card=[...f.registered.values()][0].card;assert.equal(card.avatarLineage.foundations.length,2);assert.equal(card.avatarLineage.used.length,1);assert.equal(card.avatarLineage.used[0].avatarId,'red');assert.equal(card.sourceSpans[0].offsetUnit,'utf8-byte');
});
test('one section can discover 105 distinct Cards through continuation pages without images or the legacy ceiling',async t=>{
 const f=await fixture(t,{page:i=>({cards:Array.from({length:i.page<13?8:1},(_,n)=>design(`Distinct archive technique ${i.page*8+n}`)),has_more:i.page<13,coverage_note:'Each technique has a distinct purpose; continue until exhausted.'})});const p=await f.prepare();assert.equal(p.sectionCount,1);const r=await execute(f.engine,p.id,{mode:'design'});assert.equal(r.state,'designed');assert.equal(r.totalCards,105);assert.equal(r.cards.length,24);const tail=await f.engine.status({id:p.id,offset:96,limit:24});assert.equal(tail.cards.length,9);assert.equal(tail.page.hasMore,false);assert.equal(f.calls.length,15);assert.ok(f.calls.every(c=>c.url.endsWith('/responses')));assert.equal(f.registered.size,0);
});
test('shared private-control cap holds before paid dispatch and resumes when temporary pressure clears',async t=>{
 const f=await fixture(t);const p=await f.prepare();const controls=path.join(f.root,'private','Hell Week Runs');const pressure=path.join(controls,'test-only-pressure');const h=await fs.open(pressure,'w');await h.truncate(128*1024**2);await h.close();await assert.rejects(()=>f.engine.start({id:p.id}),/shared storage ceiling/);assert.equal(f.calls.length,0);assert.equal((await f.engine.status({id:p.id})).state,'prepared');await fs.unlink(pressure);const r=await execute(createHellWeekGeneration(f.options),p.id,{mode:'design'});assert.equal(r.state,'designed');assert.equal(f.calls.length,2);
});
