import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createWriterCharactersHandler,createCharacterMemoryClient,projectWriterCharacter,writerScope,validateWriterLayers} from '../server/writer-characters.mjs';

const audit={sources:[{owner:'local-author',id:'fixture-notes',revision:'unversioned'}],provenance:{changeType:'edit',reason:'Fixture edit'}};
const empty={canon:'',memory:'',development:'',lore:''};
const avatar={id:'story-person',primaryName:'Example',updatedAt:'2026-01-01',mind:{selfKnowledge:[{id:'f1',classification:'rumor',value:'A reported account.'}]},assets:[{id:'portrait',type:'image',uri:'/media/portrait.png'}]};
function response(){const r=new EventEmitter();r.headers={};r.setHeader=(k,v)=>r.headers[k]=v;r.writeHead=(s,h)=>{r.status=s;Object.assign(r.headers,h);r.headersSent=true;};r.end=b=>{r.body=b?JSON.parse(b):null;r.writableEnded=true;};return r;}
function request(method,path,{cookie,body,origin='http://127.0.0.1:8795',site='same-origin',intent='writers-room',host='127.0.0.1:8795',peer='127.0.0.1',bearer}={}){const req=new PassThrough();req.method=method;req.url=path;req.socket={remoteAddress:peer};req.headers={host,origin,'sec-fetch-site':site,'x-hapa-first-party':intent,...(cookie?{cookie}:{}),...(bearer?{authorization:`Bearer ${bearer}`}:{})};if(body!==undefined)req.end(JSON.stringify(body));else req.end();return req;}
function harness(extra={}){let revision=0, layers={...empty}, saves=0;const memory=async(command,input)=>{if(command==='save'){saves++;if(input.expectedRevision!==revision)throw Object.assign(new Error('Changed'),{code:'memory_revision_conflict',statusCode:409,current:{revision}});if(!extra.dry)revision++;layers=input.layers;}return {ok:true,status:command==='save'?'saved':revision?'current':'uninitialized',character:{owner:'hapa-avatar-builder',avatarId:input.avatarId,scope:input.scope,revision,digest:revision?'a'.repeat(64):null,layers}};};const handler=createWriterCharactersHandler({getAvatars:async()=>[avatar],host:'127.0.0.1',port:8795,memoryClient:memory,...extra});return {handler,saves:()=>saves};}
async function call(h,method,path,options){const req=request(method,path,options),res=response();await h(req,res,new URL(path,'http://127.0.0.1:8795'));return res;}
async function session(h){const r=await call(h,'POST','/v1/writer-characters/session');assert.equal(r.status,201);return r.headers['Set-Cookie'].split(';')[0];}
test('scope and uncapped UTF-8 layers preserve exact classifications',()=>{assert.deepEqual(writerScope(),{projectId:'global',branchId:null,sceneId:null});assert.throws(()=>writerScope({projectId:'../private'}));assert.equal(validateWriterLayers({...empty,canon:'🌍'.repeat(100000)}).canon,'🌍'.repeat(100000));assert.throws(()=>validateWriterLayers({...empty,extra:''}));const p=projectWriterCharacter(avatar);assert.equal(p.sourceContext.fields.selfKnowledge[0].classification,'rumor');assert.equal(p.appearances[0].previewUrl,null);assert.equal(projectWriterCharacter(avatar).ownerRevision,p.ownerRevision);});
test('strict sessions reject missing or mismatched browser evidence and LAN bind',async()=>{const {handler}=harness();for(const options of [{origin:undefined},{origin:'http://evil.test'},{site:undefined},{site:'cross-site'},{intent:undefined},{host:'localhost:8795'},{peer:'192.168.1.2'}]){const corrected={...options};for(const k of Object.keys(corrected))if(corrected[k]===undefined)corrected[k]='';assert.equal((await call(handler,'POST','/v1/writer-characters/session',corrected)).status,403);}const lan=harness({host:'0.0.0.0'}).handler;assert.equal((await call(lan,'POST','/v1/writer-characters/session')).status,403);const r=await call(handler,'GET','/v1/writer-characters');assert.equal(r.status,401);assert.equal(r.body.preDispatch,true);const cookie=await session(handler);assert.match(cookie,/hapa_writer_character_8795=/);});
test('only authenticated bounded metadata lists; source context is not copied into layers',async()=>{const {handler}=harness();const cookie=await session(handler);const list=await call(handler,'GET','/v1/writer-characters?limit=1000',{cookie});assert.equal(list.body.limit,100);assert.deepEqual(Object.keys(list.body.characters[0]).sort(),['avatarId','label','ownerRevision','thumbnailUrl']);const detail=await call(handler,'GET','/v1/writer-characters/story-person',{cookie});assert.deepEqual(detail.body.memory.layers,empty);assert.equal(detail.body.memory.revision,0);assert.equal(detail.body.sourceContext.fields.selfKnowledge.length,1);});
test('owner and memory conflict cannot silently overwrite; sync is read-only',async()=>{const h=harness(),cookie=await session(h.handler);const get=await call(h.handler,'GET','/v1/writer-characters/story-person',{cookie});const payload={...audit,operationId:'operation-1',expectedOwnerRevision:get.body.ownerRevision,expectedMemoryRevision:0,expectedMemoryDigest:null,layers:{...empty,lore:'World lore'},scope:{projectId:'global',branchId:null,sceneId:null}};const stale=await call(h.handler,'PUT','/v1/writer-characters/story-person',{cookie,body:{...payload,expectedOwnerRevision:'wrong'}});assert.equal(stale.status,409);assert.equal(h.saves(),0);const saved=await call(h.handler,'PUT','/v1/writer-characters/story-person',{cookie,body:payload});assert.equal(saved.body.saved,true);assert.equal(saved.body.character.memory.layers.lore,'World lore');assert.equal((await call(h.handler,'PUT','/v1/writer-characters/story-person',{cookie,body:payload})).status,409);const before=h.saves();await call(h.handler,'POST','/v1/writer-characters/story-person/sync',{cookie,body:{scope:payload.scope}});assert.equal(h.saves(),before);});
test('unavailable memory stays unavailable and blocks saving; expiry is pre-dispatch',async()=>{let now=1000;const handler=harness({memoryClient:async()=>{throw new Error('offline');},now:()=>now}).handler;const cookie=await session(handler);const detail=await call(handler,'GET','/v1/writer-characters/story-person',{cookie});assert.equal(detail.body.memoryStatus,'unavailable');assert.equal(detail.body.memory,null);now+=21*60*1000;const denied=await call(handler,'GET','/v1/writer-characters/story-person',{cookie});assert.equal(denied.body.preDispatch,true);});
test('finite child config, split UTF-8, concurrency and awaited cleanup',async()=>{let child,options,args;const spawnImpl=(_exe,a,o)=>{args=a;options=o;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();child.kill=()=>{queueMicrotask(()=>child.emit('close',null));return true;};return child;};const client=createCharacterMemoryClient({python:'/usr/bin/python3',script:'/owner/character_memory.py',accessFile:'/private/access.json',spawnImpl,env:{PYTHONPATH:'/evil',HOME:'/user'}});const promise=client('read',{});await assert.rejects(()=>client('read',{}),e=>e.code==='memory_busy');const bytes=Buffer.from(JSON.stringify({ok:true,value:'🌍'}));for(const byte of bytes)child.stdout.write(Buffer.from([byte]));child.emit('close',0);assert.equal((await promise).value,'🌍');assert.deepEqual(args.slice(0,4),['-E','-s','-B','/owner/character_memory.py']);assert.equal(options.shell,false);assert.equal(options.env.HAPA_CHARACTER_MEMORY_WORKER,'1');assert.equal(options.env.PYTHONPATH,undefined);const pending=client('read',{});const rejected=assert.rejects(pending,e=>e.code==='request_aborted');await client.close();await rejected;await assert.rejects(()=>client('read',{}),e=>e.code==='memory_unavailable');});
test('bearer is distinct attribution and malicious media URL never escapes projection',async()=>{let actor;const base=harness({adminToken:'fixture-token',memoryClient:async(cmd,input)=>{if(cmd==='save')actor=input.actor;return{ok:true,status:'saved',character:{owner:'hapa-avatar-builder',avatarId:input.avatarId,scope:input.scope,revision:1,digest:'b'.repeat(64),layers:empty}};}});const d=await call(base.handler,'GET','/v1/writer-characters/story-person',{bearer:'fixture-token'});await call(base.handler,'PUT','/v1/writer-characters/story-person',{bearer:'fixture-token',body:{...audit,operationId:'op-1',expectedOwnerRevision:d.body.ownerRevision,expectedMemoryRevision:1,expectedMemoryDigest:'b'.repeat(64),layers:empty}});assert.equal(actor.actorId,'api-client');const p=projectWriterCharacter({...avatar,assets:[{id:'img',type:'image',uri:'file:///private/key'}]},{assetsEnabled:true});assert.equal(p.appearances[0].previewUrl,'/v1/writer-characters/story-person/assets/img?variant=preview');assert.equal(JSON.stringify(p).includes('/private/key'),false);});

test('private CLI credential loader refuses broad permissions and links',async()=>{
 const {mkdtemp,writeFile,chmod,symlink,rm}=await import('node:fs/promises');
 const os=await import('node:os');const path=await import('node:path');
 const {loadWriterApiToken}=await import('../server/writer-room-credentials.mjs');
 const dir=await mkdtemp(path.join(os.tmpdir(),'writer-credential-test-'));
 try{
  const token=path.join(dir,'token'),config=path.join(dir,'config.json');
  await writeFile(token,'x'.repeat(48),{mode:0o600});await writeFile(config,JSON.stringify({apiTokenFile:token}),{mode:0o600});
  assert.equal(await loadWriterApiToken({env:{},configPath:config}),'x'.repeat(48));
  await chmod(token,0o644);await assert.rejects(()=>loadWriterApiToken({env:{},configPath:config}));await chmod(token,0o600);
  const link=path.join(dir,'link');await symlink(token,link);await writeFile(config,JSON.stringify({apiTokenFile:link}));
  await assert.rejects(()=>loadWriterApiToken({env:{},configPath:config}));
 }finally{await rm(dir,{recursive:true,force:true});}
});

test('source context final byte gate remains bounded even for huge nested persona anchors',()=>{
 const group=Object.fromEntries(Array.from({length:24},(_,i)=>[`field-${i}`,'界'.repeat(4096)]));
 const huge={...avatar,mind:{personaAnchor:{one:group,two:group,three:group,four:group}}};
 const view=projectWriterCharacter(huge);
 assert.ok(Buffer.byteLength(JSON.stringify(view.sourceContext))<=128*1024);
 assert.deepEqual(view.sourceContext.fields,{});
 assert.match(view.sourceContext.omissions.join(' '),/native Mind/);
});

test('sources and restore provenance are required; text beyond former field caps reaches owner unchanged',async()=>{
 let savedInput;const long='A🌍\n'.repeat(25000),scope=writerScope();
 const handler=harness({memoryClient:async(command,input)=>{savedInput=input;return {ok:true,status:'saved',character:{owner:'hapa-avatar-builder',avatarId:input.avatarId,scope,revision:2,digest:'c'.repeat(64),layers:input.layers||empty}};}}).handler;
 const cookie=await session(handler);const view=projectWriterCharacter(avatar);
 const payload={...audit,scope,operationId:'large-edit',expectedOwnerRevision:view.ownerRevision,expectedMemoryRevision:1,expectedMemoryDigest:'b'.repeat(64),layers:{...empty,canon:long},actor:{actorId:'pretend-owner'},owner:'other'};
 const missing=await call(handler,'PUT','/v1/writer-characters/story-person',{cookie,body:{...payload,sources:[]}});assert.equal(missing.status,400);
 const badRestore=await call(handler,'PUT','/v1/writer-characters/story-person',{cookie,body:{...payload,provenance:{changeType:'restore',reason:'Return'}}});assert.equal(badRestore.status,400);
 const saved=await call(handler,'PUT','/v1/writer-characters/story-person',{cookie,body:payload});assert.equal(saved.status,200);assert.equal(savedInput.layers.canon,long);assert.equal(savedInput.owner,'hapa-avatar-builder');assert.equal(savedInput.actor.actorId,'local-operator');assert.equal(savedInput.sources[0].revision,'unversioned');assert.equal(savedInput.sources[1].digest,view.ownerRevision);
 const restore={changeType:'restore',reason:'Return to approved wording',restoreFrom:{revision:1,digest:'b'.repeat(64)}};
 assert.equal((await call(handler,'PUT','/v1/writer-characters/story-person',{cookie,body:{...payload,provenance:restore}})).status,200);assert.deepEqual(savedInput.provenance,restore);
});

test('historical selection is exact and history pagination never hydrates current layer text',async()=>{
 const calls=[],scope=writerScope();const memory=async(command,input)=>{calls.push({command,input});if(command==='history')return {ok:true,history:[{revision:2,digest:'b'.repeat(64)}],nextBeforeRevision:2,hasMore:true,currentHead:{revision:3,digest:'c'.repeat(64)}};if(input.revision===99)throw Object.assign(new Error('Missing'),{code:'revision_not_found',statusCode:404});return {ok:true,historical:true,currentHead:{revision:3,digest:'c'.repeat(64)},character:{owner:'hapa-avatar-builder',avatarId:input.avatarId,scope,revision:1,digest:'a'.repeat(64),layers:empty}};};
 const handler=harness({memoryClient:memory}).handler,cookie=await session(handler);
 const history=await call(handler,'GET','/v1/writer-characters/story-person/history?beforeRevision=3&limit=1',{cookie});assert.equal(history.status,200);assert.equal(calls.length,1);assert.equal(calls[0].command,'history');assert.equal(calls[0].input.beforeRevision,3);assert.equal(history.body.character,undefined);
 const historical=await call(handler,'GET','/v1/writer-characters/story-person/revisions/1',{cookie});assert.equal(historical.body.memory.revision,1);assert.equal(historical.body.currentMemoryHead.revision,3);assert.equal(historical.body.historical,true);assert.equal(historical.body.sourceContextState,'current-owner-projection');
 assert.equal((await call(handler,'GET','/v1/writer-characters/story-person/revisions/99',{cookie})).status,404);
 assert.equal((await call(handler,'GET','/v1/writer-characters/story-person?asOf=2026-10-04T00%3A00%3A00Z',{cookie})).status,200);assert.equal(calls.at(-1).input.asOf,'2026-10-04T00:00:00Z');
 assert.equal((await call(handler,'GET','/v1/writer-characters/story-person/revisions/1?asOf=2026-10-04T00%3A00%3A00Z',{cookie})).status,400);
 assert.equal((await call(handler,'GET','/v1/writer-characters/story-person/history?limit=101',{cookie})).status,400);
});

test('checkpoint routes preserve exact project snapshot and pins while deriving actor and owner',async()=>{
 const calls=[];const memory=async(command,input,options)=>{calls.push({command,input,options});return {ok:true,status:'saved',checkpoint:{key:{owner:input.owner,projectId:input.projectId,branchId:input.branchId},revision:1,digest:'a'.repeat(64),snapshotJson:input.snapshotJson}};};
 const handler=harness({memoryClient:memory,adminToken:'fixture-token'}).handler;
 const source={owner:'local-author',id:'draft-1',revision:'unversioned'};
 const payload={owner:'bad',projectId:'story',branchId:'draft-a',operationId:'cp-1',expectedRevision:0,expectedDigest:null,snapshotJson:'{\n "name": "Story🌍"\n}',characterRefs:[],songRefs:[],sources:[source],provenance:{changeType:'checkpoint',reason:'Save before rewriting'},actor:{actorId:'bad'}};
 const saved=await call(handler,'POST','/v1/writer-characters/checkpoints',{bearer:'fixture-token',body:payload});assert.equal(saved.status,200);assert.equal(saved.body.saved,true);assert.equal(calls[0].input.snapshotJson,payload.snapshotJson);assert.equal(calls[0].input.owner,'hapa-writers-room');assert.equal(calls[0].input.actor.actorId,'api-client');assert.equal(calls[0].options.apply,true);
 await call(handler,'GET','/v1/writer-characters/checkpoints?projectId=story&branchId=draft-a&beforeRevision=4&limit=2',{bearer:'fixture-token'});assert.equal(calls[1].command,'checkpoint-history');assert.equal(calls[1].input.beforeRevision,4);
 await call(handler,'GET','/v1/writer-characters/checkpoints/1?projectId=story&branchId=draft-a',{bearer:'fixture-token'});assert.equal(calls[2].command,'checkpoint-read');assert.equal(calls[2].input.revision,1);
});

test('extensions cannot bypass session or origin checks and receive derived actor',async()=>{
 const events=[];const handler=harness({handleExtension:async(req,res,context)=>{events.push(context);res.writeHead(200,{});res.end(JSON.stringify({ok:true}));return true;}}).handler;
 assert.equal((await call(handler,'GET','/v1/writer-characters/echo/albums')).status,401);assert.equal(events.length,0);
 const cookie=await session(handler);assert.equal((await call(handler,'POST','/v1/writer-characters/echo/pins',{cookie,origin:'http://evil.test'})).status,401);assert.equal(events.length,0);
 assert.equal((await call(handler,'GET','/v1/writer-characters/echo/albums',{cookie})).status,200);assert.equal(events[0].actor.actorId,'local-operator');assert.equal(events[0].actor.instanceId,events[0].instanceId);
});

test('configured transfer rejection precedes owner invocation and advertises no author cap',async()=>{
 let calls=0;const handler=harness({requestLimitBytes:512,outputLimitBytes:2048,memoryClient:async()=>{calls++;throw new Error('Unexpected owner invocation');}}).handler,cookie=await session(handler);
 const cap=await call(handler,'GET','/v1/writer-characters/capabilities',{cookie});assert.equal(cap.body.layerLengthLimit,null);assert.equal(cap.body.transferLimits.requestBytes,512);assert.equal(cap.body.limits.layerBytes,undefined);
 const rejected=await call(handler,'PUT','/v1/writer-characters/story-person',{cookie,body:{...audit,layers:{...empty,canon:'a'.repeat(2048)}}});assert.equal(rejected.status,413);assert.equal(rejected.body.error,'request_transport_limit');assert.equal(calls,0);
 const malformed=request('PUT','/v1/writer-characters/story-person',{cookie}); const raw=new PassThrough();raw.method=malformed.method;raw.url=malformed.url;raw.headers=malformed.headers;raw.socket=malformed.socket;raw.end(Buffer.concat([Buffer.from('{\"canon\":\"'),Buffer.from([0xff]),Buffer.from('\"}')]));const bad=response();await handler(raw,bad,new URL(raw.url,'http://127.0.0.1:8795'));assert.equal(bad.status,400);assert.equal(bad.body.error,'invalid_json');assert.equal(calls,0);
});

test('owner child gets configurable budgets and typed historical, conflict and transfer errors',async()=>{
 let child,args;const client=createCharacterMemoryClient({python:'/usr/bin/python3',script:'/owner/character_memory.py',accessFile:'/private/access.json',requestLimitBytes:4096,outputLimitBytes:8192,spawnImpl:(_exe,a)=>{args=a;child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.stdin=new PassThrough();return child;}});
 for(const [command,code,expected,status]of [['read','revision_not_found','revision_not_found',404],['checkpoint-save','revision_conflict','checkpoint_revision_conflict',409],['save','output_transport_limit','output_transport_limit',413],['save','operation_id_conflict','operation_id_conflict',409]]){
  const promise=client(command,{});const check=assert.rejects(promise,error=>error.code===expected&&error.statusCode===status);child.stdout.write(JSON.stringify({ok:false,error:{code}}));child.emit('close',1);await check;
 }
 assert.equal(args[args.indexOf('--request-limit-bytes')+1],'4096');assert.equal(args[args.indexOf('--output-limit-bytes')+1],'8192');await client.close();
});
