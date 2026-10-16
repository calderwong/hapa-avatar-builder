import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {createLivingLightRegistryMemo,presetDefinition} from '../src/domain/living-light-preset.js';

const base=createLivingLightRegistry(),parent=base.entries[0];
const ref=thing=>({thingId:thing.thingId,revisionId:thing.revisionId});
const preset=(revision,speed)=>presetDefinition(parent,{
 derivedFrom:ref(parent),title:'Memo fixture',summary:'Retained settings',parameters:{speed}
},{thingId:'ll-preset:memo',revisionId:revision,implementations:base.implementations});

test('empty refreshes preserve the source registry and equivalent owner reads preserve the overlay',()=>{
 const memo=createLivingLightRegistryMemo();
 assert.equal(memo(base),base);
 assert.equal(memo(base,[],[],{hiddenThingIds:[]}),base);
 const original=preset('r1',1),overlay=memo(base,[original],[original]);
 assert.equal(memo(base,structuredClone([original]),structuredClone([original])),overlay);
 const nextBase=createLivingLightRegistry();
 assert.equal(memo(nextBase),nextBase);
});

test('new heads and historical pins invalidate the overlay without changing existing resolvers',()=>{
 const memo=createLivingLightRegistryMemo(),first=preset('r1',1),second=preset('r2',1.5);
 const old=memo(base,[first],[first]),current=memo(base,[second],[first,second]);
 assert.notEqual(current,old);
 assert.equal(current.resolveThing(ref(first)).parameters.speed.default,1);
 assert.equal(current.resolveThing(ref(second)).parameters.speed.default,1.5);
 assert.equal(old.resolveThing(ref(second)),null);
 const headOnly=memo(base,[second],[second]);
 assert.notEqual(headOnly,current);
 assert.equal(headOnly.resolveThing(ref(first)),null);
});

test('visibility refreshes affect listing while retained pins still resolve',()=>{
 const memo=createLivingLightRegistryMemo(),first=preset('r1',1);
 const shown=memo(base,[first],[first]);
 const hidden=memo(base,[first],[first],{hiddenThingIds:[first.thingId]});
 assert.notEqual(hidden,shown);
 assert(!hidden.entries.some(t=>t.thingId===first.thingId));
 assert.equal(hidden.resolveThing(ref(first)).parameters.speed.default,1);
 assert.equal(memo(base,[first],[first],{hiddenThingIds:[first.thingId]}),hidden);
 assert(memo(base,[first],[first]).entries.some(t=>t.thingId===first.thingId));
});

test('same-reference input corruption is revalidated and cannot poison the last valid overlay',()=>{
 const memo=createLivingLightRegistryMemo(),first=preset('r1',1),heads=[first];
 const good=memo(base,heads,[first]);
 first.parameters.speed.default=100;
 assert.throws(()=>memo(base,heads,[first]));
 first.parameters.speed.default=1;
 assert.equal(memo(base,heads,[first]),good);
 assert.equal(good.resolveThing(ref(first)).parameters.speed.default,1);
});
