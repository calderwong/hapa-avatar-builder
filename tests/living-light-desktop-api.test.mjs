import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {createServer} from 'node:net';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
const {resolveBuilderLocalUiUrl}=createRequire(import.meta.url)('../electron/builder-local-ui.cjs');
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {runLivingLightCLI} from '../cli/living-light.mjs';
const role='living-light-desktop-api-fixture';
if(process.env.HAPA_AVATAR_PROCESS_OWNER===role)throw Error('Fixture child cannot re-enter the test orchestrator');
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const processTable=()=>execFileSync('/bin/ps',['-axo','pid=,ppid=,command='],{encoding:'utf8',timeout:2000,shell:false,env:{PATH:process.env.PATH||'/usr/bin:/bin'}}).trim().split('\n').map(line=>{const match=line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);return match&&{pid:Number(match[1]),parent:Number(match[2]),command:match[3]};}).filter(Boolean);
const roleProcesses=()=>processTable().filter(row=>row.command.includes('server/api.mjs')&&row.command.includes('--local-ui-port')&&row.command.includes('--static')&&row.command.includes('living-light-desktop-fixture-'));
async function freePort(){const server=createServer();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}
async function provePortReleased(port){const server=createServer();try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});}finally{await new Promise(resolve=>server.close(resolve));}}
async function stopChild(child){if(!child||child.exitCode!==null||child.signalCode!==null)return;child.kill('SIGTERM');for(let i=0;i<40&&child.exitCode===null&&child.signalCode===null;i++)await pause(50);if(child.exitCode===null&&child.signalCode===null){child.kill('SIGKILL');for(let i=0;i<40&&child.exitCode===null&&child.signalCode===null;i++)await pause(50);}assert(child.exitCode!==null||child.signalCode!==null,'owned API child did not exit after bounded cleanup');assert.throws(()=>process.kill(child.pid,0),e=>e.code==='ESRCH');}
async function waitFor(url,child,output){for(let i=0;i<200&&child.exitCode===null&&child.signalCode===null;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(300)})).ok)return;}catch{}await pause(50);}throw Error('Isolated API did not become ready: '+output.slice(-3000));}
test('desktop keeps Phone HTTP while local UI can save/reopen with strict session and agent attribution',{timeout:35000},async()=>{
 const before=roleProcesses().map(row=>row.pid),root=await fs.mkdtemp(path.join(os.tmpdir(),'living-light-desktop-fixture-'));
 const [port,localPort,overcardPort]=await Promise.all([freePort(),freePort(),freePort()]);assert.equal(new Set([port,localPort,overcardPort]).size,3);
 const api=`http://127.0.0.1:${port}`,ui=`http://127.0.0.1:${localPort}`,staticRoot=path.join(root,'ui'),store=path.join(root,'authoring.sqlite3');let child,output='';
 const samples=Buffer.alloc(16000*4);for(let i=0;i<16000;i++)samples.writeFloatLE(Math.sin(i*.17)*.3,i*4);
 const header=Buffer.alloc(44);header.write('RIFF');header.writeUInt32LE(36+samples.length,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(3,20);header.writeUInt16LE(1,22);header.writeUInt32LE(16000,24);header.writeUInt32LE(64000,28);header.writeUInt16LE(4,32);header.writeUInt16LE(32,34);header.write('data',36);header.writeUInt32LE(samples.length,40);
 const source=path.join(root,'stem.wav'),sourceBytes=Buffer.concat([header,samples]);await fs.writeFile(source,sourceBytes);
 const fixtures={avatar:{avatars:[],teams:[]},scene:{places:[],scenes:[],timelines:[]},item:{cards:[],agents:[],auditRuns:[],audit:{}},song:{songs:[{id:'fixture:song',title:'Isolated Living Light fixture',audio:{localPath:source},stems:[{id:'guitar-a',stemType:'Guitar',localPath:source},{id:'guitar-b',stemType:'Guitar',localPath:source}]},{id:'fixture:target',title:'Isolated target fixture'}]},tarot:{cards:[],decks:[],sets:[]}};
 const env={PATH:process.env.PATH||'/usr/bin:/bin',HOME:process.env.HOME,TMPDIR:os.tmpdir(),LANG:'en_US.UTF-8',NODE_OPTIONS:'',HAPA_AVATAR_PROCESS_OWNER:role,HAPA_AVATAR_ADMIN_TOKEN:'isolated-fixture-agent-only',HAPA_AVATAR_OVERWIND_SUBSCRIBER_SYNC:'0',HAPA_OVERWIND_WARM_FULL:'0',HAPA_LIVING_LIGHT_AUTHORING_STORE:store,HAPA_AVATAR_OVERCARD_DATA_ROOT:path.join(root,'overcard'),HAPA_OVERCARD_HOST_URL:`http://127.0.0.1:${overcardPort}`,HAPA_AVATAR_CARD_CUSTODY_ROOT:path.join(root,'custody'),HAPA_OVERWIND_DIR:path.join(root,'overwind'),HAPA_AVATAR_OVERWIND_OUTBOX:path.join(root,'overwind/outbox.sqlite3'),HAPA_AVATAR_OVERWIND_SUBSCRIBER_DB:path.join(root,'overwind/subscriber.sqlite3'),HAPA_SUBSCRIBER_DIR:path.join(root,'subscribers'),HAPA_SONG_CARD_MINT_ROOT:path.join(root,'mint'),HAPA_SONG_CARD_EXPORT_ROOT:path.join(root,'exports'),HAPA_RECORD_GARDEN_ACCEPTANCE_ROOT:root,HAPA_ECHO_RECORD_GARDEN_RECORDING_TRANSACTION_ROOT:path.join(root,'recording'),HAPA_PHONE_BRIDGE_INVITE_DIR:path.join(root,'phone'),HAPA_ECHO_SONG_INGEST_ROOT:path.join(root,'ingest'),HAPA_ECHO_REFERENCE_MINING_ROOT:path.join(root,'references'),HAPA_AVATAR_CONTEXT_GENERATION_ROOT:path.join(root,'contexts'),HAPA_AVATAR_WISDOM_COUNCIL_ROOT:path.join(root,'councils'),HAPA_AVATAR_PROPOSAL_REVIEW_ROOT:path.join(root,'proposals'),HAPA_AVATAR_MEDIA_COMMENT_ROOT:path.join(root,'comments'),HAPA_ECHO_KANBAN_STATE_ROOT:path.join(root,'echo-board'),HAPA_AVATAR_PUBLIC_HOST:'192.0.2.10'};
 const mapping={avatar:'HAPA_AVATAR_STORE',scene:'HAPA_SCENE_STORE',item:'HAPA_ITEM_STORE',song:'HAPA_SONG_STORE',tarot:'HAPA_TAROT_STORE'};
 env.HAPA_ECHO_PERFORMANCE_CACHE_ROOT=path.join(root,'performance-cache');env.HAPA_ECHO_ANALYSIS_CACHE_ROOT=path.join(root,'analysis-cache');env.HAPA_ECHO_PLAYBACK_CACHE_ROOT=path.join(root,'playback-cache');env.HAPA_ECHO_PREPARATION_JOB_ROOT=path.join(root,'preparation-jobs');
 const args=['server/api.mjs','--host','0.0.0.0','--port',String(port),'--static',staticRoot,'--https-port','0','--local-ui-port',String(localPort)];
 const headers={origin:ui,'sec-fetch-site':'same-origin','x-hapa-first-party-intent':'living-light'};
 const call=(base,suffix,options={})=>fetch(base+'/api/echos/living-light'+suffix,{...options,signal:AbortSignal.timeout(2500)});
 const start=async()=>{output='';child=spawn(process.execPath,args,{cwd:process.cwd(),env,shell:false,detached:false,stdio:['ignore','pipe','pipe']});child.stdout.on('data',bytes=>{output=(output+String(bytes)).slice(-12000);});child.stderr.on('data',bytes=>{output=(output+String(bytes)).slice(-12000);});await waitFor(api+'/api/health',child,output);};
 try{
  await fs.mkdir(staticRoot);await fs.writeFile(path.join(staticRoot,'index.html'),'<!doctype html><title>Hapa Avatar Builder isolated listener fixture</title>');
  for(const [key,value]of Object.entries(fixtures)){env[mapping[key]]=path.join(root,key+'.json');await fs.writeFile(env[mapping[key]],JSON.stringify(value));}
  await start();assert.equal(processTable().filter(row=>row.parent===child.pid).length,0,'API must not start analysis/render worker children');
  const redirect=await fetch(api+'/?view=echos&song=fixture%3Asong',{redirect:'manual'});assert.equal(redirect.status,302);assert.equal(redirect.headers.get('location'),ui+'/?view=echos&song=fixture%3Asong');
  assert.match(await (await fetch(ui+'/')).text(),/isolated listener fixture/);
  assert.equal(await resolveBuilderLocalUiUrl(api+'/?view=echos'),ui+'/?view=echos');
  assert.equal((await fetch(api+'/phone-card',{redirect:'manual'})).status,200);
  const info=await (await fetch(api+'/api/phone-bridge/info')).json();assert.equal(JSON.stringify(info).includes(`192.0.2.10:${localPort}`),false,'Phone projection must not advertise the local UI listener');
  const discovery=await (await call(api,'/local-ui')).json();assert.equal(discovery.state,'listening');assert.equal(discovery.origin,ui);assert.equal(JSON.stringify(discovery).includes('secret'),false);
  assert.equal((await call(api,'/session',{method:'POST',headers:{...headers,origin:api,'x-builder-listener-bind':'127.0.0.1'}})).status,403);
  assert.equal((await call(ui,'/session',{method:'POST',headers:{...headers,'x-hapa-first-party-intent':'other'}})).status,403);
  assert.equal((await call(ui,'/session',{method:'POST',headers:{...headers,origin:api}})).status,403);
  assert.equal((await call(ui,'/session',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}'})).status,403);
  const session=await call(ui,'/session',{method:'POST',headers});assert.equal(session.status,201);const setCookie=session.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/SameSite=Strict/);const cookie=setCookie.split(';')[0],secret=cookie.split('=')[1];assert(secret.length>=40);assert.equal((await session.text()).includes(secret),false);
  const browserHeaders={...headers,cookie,'content-type':'application/json'};
  const things=await call(ui,'/things',{headers:browserHeaders});assert.equal(things.status,200);assert.equal((await things.json()).total,50);await assert.rejects(fs.access(store),'list must not create authoring storage');
  const noteRequest={target:{kind:'thing',thingId:'ll109:tunnel:continuous:cathedral',observedRevisionId:'ll109-source-r1'},body:'Synthetic fixture: preserve this note across process restart',expectedRevision:null,idempotencyKey:'fixture:browser-note'};
  const saved=await call(ui,'/notes',{method:'POST',headers:browserHeaders,body:JSON.stringify(noteRequest)});assert.equal(saved.status,201);const note=(await saved.json()).note;assert.equal(note.actor.kind,'human');assert.equal(note.actor.actorId,'human:local-operator');
  const forged=await call(ui,'/notes',{method:'POST',headers:browserHeaders,body:JSON.stringify({...noteRequest,idempotencyKey:'fixture:forged',actor:{kind:'agent'}})});assert.equal(forged.status,422);
  assert.equal((await call(api,'/things',{headers:{...browserHeaders,origin:api}})).status,403,'same cookie cannot bypass wildcard bind');
  assert.equal((await call(ui,'/things',{headers:{...browserHeaders,'sec-fetch-site':'cross-site'}})).status,401);
  const bearer={authorization:'Bearer isolated-fixture-agent-only','content-type':'application/json'};
  const thing=createLivingLightRegistry().entries.find(row=>row.source.moduleId==='cathedral'),journey={schemaVersion:'hapa.living-light.journey.v1',title:'Synthetic source-unresolved recipe',songId:'fixture:song',sourceBindingRef:null,state:'draft-unresolved',mode:'continuous',seed:109,instances:[{instanceId:'instance:fixture',thingRef:{thingId:thing.thingId,revisionId:thing.revisionId},parameters:{intensity:.61},bindings:{}}],schedule:[{instanceId:'instance:fixture',startUs:0,endUs:20000000}],actorTreatment:'none',mediaSlots:[]};
  const recipe=await call(api,'/journeys',{method:'POST',headers:bearer,body:JSON.stringify({journey,expectedRevision:null,idempotencyKey:'fixture:agent-journey'})});assert.equal(recipe.status,201);const pinned=await recipe.json();assert.equal(pinned.actor.kind,'agent');assert.equal(pinned.journey.songId,'fixture:song');assert.equal(pinned.custody.state,'verified');
  const forkOptions={sourceRevisionId:pinned.journey.revisionId,targetSongId:'fixture:target',title:'Synthetic cross-song fork',durationUs:40000000,timingPolicy:'reset-schedule'},forkBase='/journeys/'+encodeURIComponent(pinned.journey.journeyId)+'/fork';
  const previewResponse=await call(api,forkBase+'/preview',{method:'POST',headers:bearer,body:JSON.stringify(forkOptions)});assert.equal(previewResponse.status,200);const preview=await previewResponse.json();assert.equal(preview.target.timelineVerification,'authored-plan-only');
  const forkRequest={...forkOptions,previewDigest:preview.previewDigest,idempotencyKey:'fixture:fork'},forkResponse=await call(api,forkBase,{method:'POST',headers:bearer,body:JSON.stringify(forkRequest)});assert.equal(forkResponse.status,201);const fork=await forkResponse.json();assert.equal(fork.actor.kind,'agent');assert.equal(fork.journey.songId,'fixture:target');assert.deepEqual(fork.journey.schedule,preview.journey.schedule);assert.equal(fork.lineage.journeyId,pinned.journey.journeyId);assert.equal(fork.lineage.revisionId,pinned.journey.revisionId);assert.equal(fork.custody.state,'verified');assert.equal(fork.noteCount,0);
  await stopChild(child);await start();assert.equal((await call(ui,'/things',{headers:browserHeaders})).status,401,'old process cookie must not authorize a restarted process');
  const reopened=await (await call(api,'/journeys/'+encodeURIComponent(pinned.journey.journeyId),{headers:bearer})).json();assert.equal(reopened.currentHead,pinned.currentHead);assert.deepEqual(reopened.journey,pinned.journey);assert.deepEqual(reopened.custody.rootReceipt,pinned.custody.rootReceipt);
  const forkRetryResponse=await call(api,forkBase,{method:'POST',headers:bearer,body:JSON.stringify(forkRequest)});assert.equal(forkRetryResponse.status,200);const forkRetry=await forkRetryResponse.json();assert.equal(forkRetry.idempotentReplay,true);assert.deepEqual(forkRetry.journey,fork.journey);assert.deepEqual(forkRetry.custody.rootReceipt,fork.custody.rootReceipt);
  const notes=await (await call(api,'/notes?target='+encodeURIComponent(JSON.stringify(noteRequest.target)),{headers:bearer})).json();assert.equal(notes.notes.length,1);assert.equal(notes.notes[0].note.revisionId,note.revisionId);
  const catalog=await (await call(ui,'/catalog?songId='+encodeURIComponent('fixture:song'))).json();assert.equal(catalog.songs.length,1);assert.deepEqual(catalog.songs[0].stems.map(row=>[row.assetId,row.state]),[['guitar-a','available'],['guitar-b','available']]);
  for(const assetId of ['guitar-a','guitar-b']){
   const response=await fetch(ui+'/api/echos/playback-audio/prepare?'+new URLSearchParams({songId:'fixture:song',assetId,requestId:'fixture-audition-'+assetId}),{method:'POST',signal:AbortSignal.timeout(2500)});let job=await response.json();assert.equal(response.status,202,JSON.stringify(job));
   await waitForJob();
   async function waitForJob(){const deadline=Date.now()+5000;while(['queued','running'].includes(job.status)){assert(Date.now()<deadline,'bounded stem preparation timeout');await pause(20);job=await(await fetch(ui+'/api/echos/music-performance/prepare?jobId='+job.id,{signal:AbortSignal.timeout(1000)})).json();}}
   assert.equal(job.status,'ready',job.message);assert.equal(job.result.sourceSelection.assetId,assetId);assert.equal(job.result.pcmSha256,createHash('sha256').update(samples).digest('hex'));
   assert.equal(JSON.stringify(job).includes(root),false,'public playback evidence must not disclose native source/cache paths');
   assert.equal(job.result.durationSeconds,1);assert.equal(job.result.sourceSelection.clock,'source-local');
   const streamed=await fetch(ui+'/api/echos/playback-audio?jobId='+job.id,{headers:{range:'bytes=0-15'},signal:AbortSignal.timeout(1000)});assert.equal(streamed.status,206);assert.equal(Buffer.from(await streamed.arrayBuffer()).subarray(0,4).toString(),'RIFF');
   assert.equal((await fetch(ui+'/api/echos/music-performance/prepare?jobId='+job.id,{method:'DELETE',signal:AbortSignal.timeout(1000)})).status,200);
   assert.equal((await fetch(ui+'/api/echos/playback-audio?jobId='+job.id,{signal:AbortSignal.timeout(1000)})).status,409);
  }
  const policyQuery=new URLSearchParams({songId:'fixture:song',sourcePolicy:'living-light-assets-v1'}),preparedUrl=ui+'/api/echos/music-performance/prepare?'+policyQuery;
  assert.equal((await fetch(preparedUrl,{method:'POST',signal:AbortSignal.timeout(2500)})).status,401,'exact preparation rejects unauthenticated mutations');
  const preparation=await fetch(preparedUrl,{method:'POST',headers:bearer,signal:AbortSignal.timeout(2500)});let exactJob=await preparation.json();assert.equal(preparation.status,202,JSON.stringify(exactJob));
  const exactDeadline=Date.now()+10000;while(['queued','running'].includes(exactJob.status)){assert(Date.now()<exactDeadline,'bounded exact preparation timeout');await pause(20);exactJob=await(await fetch(ui+'/api/echos/music-performance/prepare?jobId='+exactJob.id,{signal:AbortSignal.timeout(1000)})).json();}
  const protectedRead=await fetch(ui+'/api/echos/living-light/performance?songId=fixture%3Asong',{headers:bearer,signal:AbortSignal.timeout(2500)});assert.equal(protectedRead.status,200);assert.equal((await protectedRead.json()).performance.buses.length,3);
  const cliEnv={HAPA_AVATAR_ADMIN_TOKEN:env.HAPA_AVATAR_ADMIN_TOKEN,HAPA_AVATAR_API_URL:ui};
  const cliSignals=await runLivingLightCLI(['signals','--song','fixture:song'],{env:cliEnv});assert.deepEqual(cliSignals.performance.buses.slice(1).map(bus=>bus.assetId),['guitar-a','guitar-b']);assert.equal(JSON.stringify(cliSignals).includes(root),false);
  assert.equal((await runLivingLightCLI(['signals-status','--song','fixture:song','--job-id',exactJob.id],{env:cliEnv})).status,'ready');
  assert.equal((await runLivingLightCLI(['capabilities'],{env:cliEnv})).preparedSignals.assetLimit,32);
  assert.equal((await fetch(ui+'/api/echos/living-light/performance?songId=fixture%3Asong',{signal:AbortSignal.timeout(2500)})).status,401);
  assert.equal(exactJob.status,'ready',exactJob.message);assert.equal(exactJob.outputTail,'');assert.equal(JSON.stringify(exactJob).includes(root),false);
  const exactResponse=await fetch(ui+'/api/echos/music-performance?'+policyQuery,{headers:bearer,signal:AbortSignal.timeout(2500)}),exact=await exactResponse.json();assert.equal(exactResponse.status,200,JSON.stringify(exact));assert.deepEqual(exact.performance.buses.slice(1).map(bus=>bus.assetId),['guitar-a','guitar-b']);assert.equal(JSON.stringify(exact).includes(root),false);assert.equal(exact.sourceValidation.analysisExecuted,false);assert.equal(exact.audioUri,'hapa-master:fixture%3Asong');assert.equal(exact.performance.buses[1].decodedAnalysis.frameCount,8000);
  assert.deepEqual(await fs.readFile(source),sourceBytes);assert.equal((await fs.readdir(env.HAPA_ECHO_PREPARATION_JOB_ROOT)).length,3);
  assert.equal(processTable().filter(row=>row.parent===child.pid).length,0);assert.equal(await fs.readFile(env.HAPA_SONG_STORE,'utf8'),JSON.stringify(fixtures.song));
 }finally{
  await stopChild(child);for(const p of [port,localPort,overcardPort])await provePortReleased(p);await fs.rm(root,{recursive:true,force:true});await assert.rejects(fs.access(root));assert.deepEqual(roleProcesses().map(row=>row.pid),before);
 }
});
