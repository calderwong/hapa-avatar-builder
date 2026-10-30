import { createRequire } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createHellWeekAvatarReferences, bindAvatarUses, validateSelections } = require('../electron/hell-week-avatars.cjs');
const { createHellWeekGeneration } = require('../electron/hell-week-generation.cjs');
const { hash } = require('../electron/hell-week-contract.cjs');
const png = Buffer.alloc(30); Buffer.from('89504e470d0a1a0a','hex').copy(png); png.writeUInt32BE(1024,16); png.writeUInt32BE(1536,20);
async function fixture(t) {
 const root = await fs.mkdtemp(path.join(os.tmpdir(),'hw-avatar-')); t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.mkdir(path.join(root,'data/media'),{recursive:true}); await fs.writeFile(path.join(root,'data/media/ref.png'),png);
 const fetchImpl = async url => new Response(JSON.stringify(url.endsWith('/api/health') ? {service:'hapa-avatar-builder',store:path.join(await fs.realpath(root),'data/avatar-store.json')} : url.includes('/attach?') ? {avatarCardId:decodeURIComponent(url.split('/avatars/')[1].split('/')[0]),baseReferences:[{assetId:'portrait',role:'fullbody_backgroundless',uri:'/media/ref.png',type:'image',name:'Portrait'}],mind:{personaAnchor:{identityStatement:'A careful gardener'}}} : {avatars:['red','blue'].map(id=>({id,primaryName:id,summary:'Keeps seeds',aliases:[],updatedAt:'2026-10-30'})),hasMore:false}));
 return {root,refs:createHellWeekAvatarReferences({repositoryRoot:root,apiBase:'http://127.0.0.1:8797',fetchImpl})};
}
test('trusted owner selection snapshots profiles and exact existing pixels without media copies',async t=>{
 const {root,refs}=await fixture(t); const avatars=await refs.snapshot([{avatarId:'red'},{avatarId:'blue',assetId:null}]);
 assert.equal(avatars[0].image.sha256,hash(png));assert.equal(avatars[1].image,null);assert.equal(avatars[0].context.persona.identityStatement,'A careful gardener');
 assert.deepEqual((await refs.readImages([avatars[0].image]))[0].bytes,png);
 assert.deepEqual(await fs.readdir(path.join(root,'data/media')),['ref.png']);
 await fs.writeFile(path.join(root,'data/media/ref.png'),Buffer.concat([png,Buffer.from('changed')]));
 await assert.rejects(()=>refs.readImages([avatars[0].image]),/changed/);
 await assert.rejects(()=>refs.snapshot([{avatarId:'missing',assetId:'/private/secret'}]),/roster/);
});
test('selection and Thor usage reject duplicates and unknown identity, while abstract cards remain valid',()=>{
 assert.throws(()=>validateSelections([{avatarId:'a'},{avatarId:'a'}]),/once/);
 assert.throws(()=>validateSelections(Array.from({length:9},(_,i)=>({avatarId:String(i)}))),/eight/);
 assert.throws(()=>bindAvatarUses({avatars:[{avatarId:'red'}]},{avatar_uses:[{avatar_id:'unknown',role:'actor',reason:'fit'}]}),/unknown/);
 assert.deepEqual(bindAvatarUses({avatars:[{avatarId:'red'}]},{avatar_uses:[]}).avatar_uses,[]);
});
async function runFixture(t,{changeReference=false,textOnly=false,abstract=false}={}) {
 const {root,refs}=await fixture(t); const calls=[];let registration;let failRegistration=true;
 const options={legacyOnly:true,userDataPath:root,avatarReferences:refs,credentialStore:{read:async()=> 'fixture'},registerCard:async x=>{registration=x;if(failRegistration)throw Error('owner temporarily offline');return {cardId:x.card.id};},fetchImpl:async(url,options)=>{
 calls.push({url,body:options.body});
 if(url.includes('/images/')) return new Response(JSON.stringify({data:[{b64_json:png.toString('base64')}]}));
 const request=JSON.parse(options.body),input=JSON.parse(request.input);
 assert.equal(input.foundational_avatars.length,2);assert.ok(!options.body.includes('data/media'));
 let value;
 if(input.chunks) value={set_name:'Garden',summary:'Seeds survive',preparation:Object.fromEntries(input.chunks.map(c=>[c.chunk_id,{focus:'Seeds',why_it_matters:'Preserve',continuity:'Garden'}]))};
 else {value={title:'Seed',kind:'skill',summary:'Seeds survive.',facts:[],desires:[],uncertainties:[],lore:'A garden',skills:[],evidence_quote_ids:['excerpt-1'],visual_thesis:'A branching garden',image_prompt:'A gardener opens a seed vault.',tags:[],avatar_uses:abstract?[]:[{avatar_id:'red',role:'seedkeeper',reason:'Preserves the original seeds'}]};if(changeReference)await fs.writeFile(path.join(root,'data/media/ref.png'),'changed');}
 return new Response(JSON.stringify({status:'completed',output:[{content:[{type:'output_text',text:JSON.stringify(value)}]}]}));
 }};
 const engine=createHellWeekGeneration(options),run=await engine.create({name:'garden.md',text:'Seeds survive.',avatarSelections:[{avatarId:'red',...(textOnly?{assetId:null}:{})},{avatarId:'blue',assetId:null}]});
 assert.equal(calls.length,0);await engine.start({id:run.id});await engine._active();
 return {engine,run,root,calls,options,get registration(){return registration},allowRegistration(){failRegistration=false}};
}
test('multi-Avatar run sends only used image pixels as multipart, persists lineage, and resumes without reference reread or payment',async t=>{
 const f=await runFixture(t);assert.equal(f.calls.length,3);assert.ok(f.calls[2].url.endsWith('/images/edits'));
 const form=f.calls[2].body;assert.ok(form instanceof FormData);assert.equal(form.getAll('image[]').length,1);assert.equal(hash(Buffer.from(await form.get('image[]').arrayBuffer())),hash(png));assert.match(form.get('prompt'),/red: seedkeeper/);
 assert.equal(f.registration.card.avatarLineage.foundations.length,2);assert.equal(f.registration.card.avatarLineage.used.length,1);
 const folder=path.join(f.root,'Hell Week Runs',f.run.id);const saved=await fs.readFile(path.join(folder,'image-0.request.json'),'utf8');assert.ok(!saved.includes('base64'));assert.ok(saved.includes(hash(png)));
 // Simulate a crash after the image receipt but before its cursor update.
 const run=JSON.parse(await fs.readFile(path.join(folder,'run.json')));delete run.cards[0].image;run.calls['image-0'].state='submitted';await fs.writeFile(path.join(folder,'run.json'),JSON.stringify(run));
 await fs.unlink(path.join(f.root,'data/media/ref.png'));f.allowRegistration();const resumed=createHellWeekGeneration(f.options);await resumed.start({id:run.id});await resumed._active();assert.equal(f.calls.length,3);assert.equal((await resumed.status({id:run.id})).state,'complete');
});
test('changed reference blocks before any image dispatch or ambiguous paid receipt',async t=>{
 const f=await runFixture(t,{changeReference:true});const run=await f.engine.status({id:f.run.id});assert.equal(f.calls.length,2);assert.equal(run.attempts,2);assert.equal(run.calls['image-0'],undefined);assert.match(run.error,/changed/);
});
test('text-only and abstract choices use ordinary generation with truthful usage records',async t=>{
 for(const settings of [{textOnly:true},{abstract:true}]) {const f=await runFixture(t,settings);assert.ok(f.calls[2].url.endsWith('/images/generations'));assert.equal(f.registration.card.avatarLineage.used.length,settings.abstract?0:1);if(settings.textOnly)assert.equal(f.registration.card.avatarLineage.used[0].mode,'profile-only');}
});

test('reference admission rejects over-limit files and owner mismatches before reading pixels',async t=>{
 const {root,refs}=await fixture(t);const file=await fs.open(path.join(root,'data/media/ref.png'),'r+');await file.truncate(8*1024**2+1);await file.close();
 await assert.rejects(()=>refs.snapshot([{avatarId:'red'}]),/8 MiB/);
 await assert.rejects(()=>refs.readImages([{bytes:33*1024**2}]),/shared limit/);
 const wrong=createHellWeekAvatarReferences({repositoryRoot:root,apiBase:'http://127.0.0.1:8797',fetchImpl:async()=>new Response(JSON.stringify({service:'other-owner',store:'/elsewhere'}))});await assert.rejects(()=>wrong.catalog(),/owner check/);
});
