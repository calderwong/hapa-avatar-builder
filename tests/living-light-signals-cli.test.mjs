import test from 'node:test';
import assert from 'node:assert/strict';
import {runLivingLightCLI} from '../cli/living-light.mjs';
import {createLivingLightPerformancePort} from '../server/living-light-performance-port.mjs';
import {handleLivingLight} from '../server/living-light-routes.mjs';
test('CLI signal operations share the protected owner, retained request IDs and exact cancellation',async()=>{
 const jobs=[],calls=[];let starts=0;
 const performance=createLivingLightPerformancePort({readSongStore:async()=>({songs:[{id:'song:exact',audio:{localPath:'/fixture/master.wav'},stems:[]}]}),preparation:{findRequest:id=>jobs.find(j=>j.requestId===id),get:id=>jobs.find(j=>j.id===id),latest:song=>jobs.find(j=>j.songId===song),start:input=>{const job={...input,id:'fixture-job',status:'queued'};starts++;jobs.push(job);return job;},cancel:id=>{const job=jobs.find(j=>j.id===id);job.status='cancelled';return job;}},preparedStore:{load:async()=>({performance:{songId:'song:exact',buses:[{id:'master',provenance:[]}],sourcePolicy:'living-light-assets-v1'}})}});
 const env={HAPA_AVATAR_ADMIN_TOKEN:'test-only'},fetcher=async(url,options)=>{calls.push({url,options});let reply;await handleLivingLight({req:{method:options.method},res:{},url:new URL(url),service:{capabilities:()=>({ok:true})},authorize:()=>options.headers.authorization==='Bearer test-only'?{actor:{kind:'agent'}}:null,performance,readBody:async()=>JSON.parse(options.body||'{}'),sendJson:(res,status,value)=>{reply=new Response(JSON.stringify(value),{status});}});return reply;},run=args=>runLivingLightCLI(args,{env,fetcher});
 const args=['--song','song:exact','--request-id','retained-request-0001'];
 assert.equal((await run(['prepare-signals',...args])).status,'queued');await run(['prepare-signals',...args]);assert.equal(starts,1);
 assert.equal((await run(['signals-status',...args])).status,'queued');assert.equal((await run(['signals','--song','song:exact'])).performance.songId,'song:exact');
 assert.equal((await run(['capabilities'])).preparedSignals.assetLimit,32);
 assert.equal((await run(['cancel-signals',...args])).status,'cancelled');assert.equal(calls.at(-1).options.method,'DELETE');
 const before=calls.length;for(const command of [['prepare-signals','--song','song:exact'],['cancel-signals','--song','song:exact'],['prepare-signals',...args,'--dry-run'],['cancel-signals',...args,'--dry-run'],['signals',...args],['signals-status',...args,'--job-id','fixture-job']])await assert.rejects(run(command));assert.equal(calls.length,before);
 await assert.rejects(run(['cancel-signals','--song','song:other','--job-id','fixture-job']),{code:'living_light_job_mismatch'});assert.equal(jobs[0].status,'cancelled');
 let attempts=0;await assert.rejects(runLivingLightCLI(['prepare-signals',...args],{env,fetcher:async()=>{attempts++;throw Error('private transport detail');}}),e=>e.code==='transport_unresolved'&&!e.message.includes('private transport detail'));assert.equal(attempts,1);
});
test('CLI accepts a multi-MiB signal publication but retains the smaller metadata bound',async()=>{
 const data={ok:true,padding:'x'.repeat(4194304)},fetcher=async()=>new Response(JSON.stringify(data)),env={HAPA_AVATAR_ADMIN_TOKEN:'test-only'};
 assert.equal((await runLivingLightCLI(['signals','--song','song:exact'],{env,fetcher})).padding.length,4194304);
 await assert.rejects(runLivingLightCLI(['capabilities'],{env,fetcher}),{code:'response_too_large'});
});
