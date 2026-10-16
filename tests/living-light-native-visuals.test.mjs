import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {installLivingLightNativeVisuals,LIVING_LIGHT_VISUAL_HOOKS} from '../src/living-light/native-visuals.js';
import {createNativeNamespace} from '../src/living-light/native.generated.js';

test('the native host retains the supplied app visual order with only the explicit no-figure substitution',async()=>{
 const app=await fs.readFile(new URL('../src/living-light/vendor/app.js',import.meta.url),'utf8');
 const sourceOrder=[...app.matchAll(/(Hapa\w+(?:Visuals|Renderer))\(next\)/g)].map(m=>m[1]);
 assert.deepEqual(LIVING_LIGHT_VISUAL_HOOKS,sourceOrder.map(name=>name==='HapaReliquaryVisuals'?'HapaOctaveVisuals':name));
 const native=createNativeNamespace();for(const name of LIVING_LIGHT_VISUAL_HOOKS)assert.equal(typeof native[name],'function',name);
});
test('missing visual modules refuse before any hook installs, rather than accepting generic geometry',()=>{
 const calls=[],renderer={programs:{}},native=Object.fromEntries(LIVING_LIGHT_VISUAL_HOOKS.map(name=>[name,r=>{assert.equal(r,renderer);calls.push(name);} ]));
 native.HapaRenderer={program:()=>({p:{}})};native.HapaShaders={vertex:'fixture'};native.HapaReliquaryShaders={focus:'fixture'};
 delete native.HapaStageVisuals;
 assert.throws(()=>installLivingLightNativeVisuals(native,renderer),/Missing.*HapaStageVisuals/);assert.deepEqual(calls,[]);
 native.HapaStageVisuals=r=>{assert.equal(r,renderer);calls.push('HapaStageVisuals');};
 installLivingLightNativeVisuals(native,renderer);assert.deepEqual(calls,LIVING_LIGHT_VISUAL_HOOKS);
});

import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {livingLightThingStudy} from '../src/domain/living-light-stills.js';
import {createLivingLightRuntime} from '../src/living-light/runtime.js';
test('Celestial figure destination refuses before GPU acquisition and preserves the recipe',()=>{
 const registry=createLivingLightRegistry(),thing=registry.entries.find(t=>t.source.moduleId==='celestial-reliquary');
 const {journey}=livingLightThingStudy({thing,registry,songId:'fixture:celestial',durationUs:20e6}),before=JSON.stringify(journey);
 const runtime=createLivingLightRuntime({canvas:{getContext(){throw Error('Unexpected GPU acquisition');}},registry});
 try{assert.throws(()=>runtime.prepare({journeyRevision:journey,sourceBinding:{songId:journey.songId,durationUs:20e6},generation:1,neutralStudy:true}),/figure and texture renderer/);assert.equal(JSON.stringify(journey),before);assert.equal(runtime.diagnostics().prepared,false);}finally{runtime.dispose();}
});
test('the retained UMD dynamics kernel is visible to private native consumers without global leakage',()=>{
 const n=createNativeNamespace(),score={id:'fixture:dynamics',duration:1,fps:30,stems:[],master:'AA==',travel:[],shots:[{start:0,end:1,rig:'portrait',locks:{}}]};
 const cache=new n.HapaCore.FeatureCache(score),state=n.HapaCore.initialState(score);state.reliquary=n.HapaReliquary.defaults();
 const result=n.HapaDynamics.evaluate(cache,state,0);assert.equal(result.stats.source,score.id);assert.equal(result.solver.tick,0);assert.equal(globalThis.HapaDynamicsKernel,undefined);
});
