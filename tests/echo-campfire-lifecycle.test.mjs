// File-based lifecycle contract check: one Node process, no workers/children,
// network, GPU, file writes or timers beyond the explicit bounded-close case.
import assert from 'node:assert/strict';
import {createCampfireClockAdapter,CLOCK_STAGE_LIMITS} from '../vendor/campfire-stage/src/echo/clock-stage-adapter.js';
const results=[],canvas=()=>({getContext:()=>({drawImage(){throw Error('A closed frame must not be painted.');}})});
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const options={packet:{},spectrum:{},width:640,height:360,fps:30,key:'lifecycle-fixture'};
{
 const entered=deferred(),frame=deferred();let closes=0,destroys=0,position=0;
 const stage={frameCount:8151,get position(){return position;},checkpoint:async()=>({nextFrame:0,stage:{destroy(){destroys++;}}}),renderFrame:async index=>{entered.resolve();await frame.promise;position=index+1;return {canvas:{},index};},close(){closes++;frame.resolve();}};
 const adapter=await createCampfireClockAdapter({...options,canvas:canvas(),createStage:async()=>stage});const request=adapter.request(200);await entered.promise;
 const closing=adapter.close();assert.equal(adapter.close(),closing,'Repeated closes must share one completion');await closing;await request;
 assert.equal(closes,1);assert.equal(destroys,1);assert.equal(adapter.status.closing,false);assert.throws(()=>adapter.request(0),/closed/);results.push({case:'close aborts active work before awaiting it; no late paint; repeat close shares result',ok:true});
}
{
 let closes=0;const adapter=await createCampfireClockAdapter({...options,canvas:canvas(),createStage:async()=>({frameCount:8151,position:0,checkpoint:async()=>({nextFrame:0,stage:{destroy(){}}}),close(){closes++;throw Error('cleanup fixture refused');}})});
 await assert.rejects(adapter.close(),/cleanup fixture refused/);await assert.rejects(adapter.close(),/cleanup fixture refused/);assert.equal(closes,1);results.push({case:'cleanup failure remains a failure for every replacement waiter',ok:true});
}
{
 let closes=0;await assert.rejects(createCampfireClockAdapter({...options,canvas:canvas(),createStage:async()=>({checkpoint:async()=>{throw Error('capture fixture failed');},close(){closes++;}})}),/capture fixture failed/);assert.equal(closes,1);results.push({case:'failed initial capture releases its stage',ok:true});
}
{
 let destroyed=0;const entered=deferred(),never=deferred(),adapter=await createCampfireClockAdapter({...options,canvas:canvas(),createStage:async()=>({frameCount:8151,position:0,checkpoint:async()=>({nextFrame:0,stage:{destroy(){destroyed++;}}}),renderFrame:async()=>{entered.resolve();return never.promise;},close(){}})});
 const request=adapter.request(1);await entered.promise;const started=performance.now();await assert.rejects(adapter.close(),/cleanup timed out/);assert.equal(destroyed,1);assert.ok(performance.now()-started<CLOCK_STAGE_LIMITS.closeMilliseconds+1000);never.resolve({canvas:{},index:0});await request;results.push({case:'non-cooperative frame does not hold cleanup indefinitely; snapshots still release',ok:true});
}
console.log(JSON.stringify({ok:true,scope:'adapter control-flow/resource contract; fake frame source, no GPU qualification',limits:CLOCK_STAGE_LIMITS,results},null,2));
