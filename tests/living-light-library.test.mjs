import test from 'node:test';
import assert from 'node:assert/strict';
import {livingLightLibraryCards,filterLivingLightLibrary} from '../src/domain/living-light-library.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
const registry=createLivingLightRegistry();
test('metadata library reconciles every source definition and retains alias identity',()=>{
 const cards=livingLightLibraryCards({things:registry.entries});
 assert.equal(cards.length,50);assert.equal(new Set(cards.map(card=>card.key)).size,50);
 assert.equal(filterLivingLightLibrary(cards,{kind:'tunnel'}).length,27);
 assert.equal(filterLivingLightLibrary(cards,{kind:'location'}).length,23);
 for(const thing of registry.entries.filter(thing=>thing.aliasOf)){
  assert(cards.some(card=>card.thing.thingId===thing.thingId));assert(cards.some(card=>card.thing.thingId===thing.aliasOf.thingId));
 }
 assert.equal(filterLivingLightLibrary(cards,{readiness:'preview-ready'}).length,0);
});
test('exact Journey identities remain distinct under matching titles and filters do not promote qualification',()=>{
 const make=(id,songId,mode='continuous')=>({journey:{journeyId:id,revisionId:'revision:'+id,title:'Same title',songId,mode,instances:[{thingRef:{thingId:'exact:thing'}}],schedule:[{endUs:20000000}],state:'preview-ready'},noteCount:2,actor:{kind:'agent',displayName:'Fixture agent'}});
 const cards=livingLightLibraryCards({things:registry.entries,journeys:[make('one','first:song'),make('two','second:song','tour')]});
 assert.equal(filterLivingLightLibrary(cards,{kind:'journey',search:'same title'}).length,2);
 assert.equal(filterLivingLightLibrary(cards,{kind:'journey',search:'second:song'})[0].row.journey.journeyId,'two');
 assert.equal(filterLivingLightLibrary(cards,{kind:'journey',tag:'tour'}).length,1);
 assert.equal(filterLivingLightLibrary(cards,{kind:'journey',readiness:'preview-ready'}).length,0);
 assert.equal(filterLivingLightLibrary(cards,{kind:'journey',readiness:'awaiting'}).length,2);
 assert.equal(filterLivingLightLibrary(cards,{kind:'journey',search:'Fixture agent'})[0].source,'Agent: Fixture agent');
 assert.equal(cards.at(-1).noteCount,2);
});
test('used-in links and source tags retain exact metadata without mutating owner records',()=>{
 const thing=registry.entries[0],usedIn=[{journeyId:'saved:recipe',revisionId:'exact:revision',title:'Pinned recipe',songId:'song:one'}],rows={[thing.thingId]:{noteCount:3,usedIn,visibility:{archived:true}}},before=JSON.stringify(rows);
 const cards=livingLightLibraryCards({things:[thing],thingRows:rows});
 assert.equal(cards[0].noteCount,3);assert.deepEqual(cards[0].usedIn,usedIn);assert.equal(cards[0].archived,true);assert.equal(cards[0].source,thing.source.attribution);
 assert.equal(filterLivingLightLibrary(cards,{tag:thing.tags[0]}).length,1);
 assert.equal(filterLivingLightLibrary(cards,{search:thing.source.attribution.toUpperCase()}).length,1);
 assert.equal(JSON.stringify(rows),before);
});
