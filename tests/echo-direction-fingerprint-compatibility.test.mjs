import test from "node:test";
import assert from "node:assert/strict";
import { echoDirectionVariantFingerprint } from "../src/domain/echo-direction-variants.js";

// Independent reference for the published content-v2 identity. Optimizing it
// must not invalidate existing saved-cut locks, forks or render receipts.
function legacyIdentity(value) {
  const stable = row => Array.isArray(row) ? row.map(stable) : row && typeof row === "object"
    ? Object.fromEntries(Object.keys(row).sort().map(key => [key, stable(row[key])])) : row;
  const input=JSON.stringify(stable(value));
  const lanes=[0x811c9dc5,0x9e3779b9,0x85ebca6b,0xc2b2ae35,0x27d4eb2f,0x165667b1,0xd3a2646c,0xfd7046c5];
  const multipliers=[0x01000193,0x85ebca6b,0xc2b2ae35,0x27d4eb2f,0x165667b1,0xd3a2646c,0xfd7046c5,0x9e3779b1];
  for(let index=0;index<input.length;index++)for(let lane=0;lane<8;lane++)lanes[lane]=Math.imul(lanes[lane]^(input.charCodeAt(index)+index+lane*131),multipliers[lane])>>>0;
  return 'content-v2:'+lanes.map(n=>n.toString(16).padStart(8,'0')).join('');
}

test("optimized saved-cut fingerprints preserve the existing UTF-16 identity",()=>{
  const fixtures=[{}, {id:"cut:1",title:"Dear Papa"},
    {id:"unicode",title:"爸爸 · café · 👨‍👧‍👦",timeline:[{words:["a","b"],start:0,end:1.25}]},
    {id:"long",timeline:Array.from({length:1024},(_,i)=>({shot_index:i,media_uri:`/media/${i}.mp4`,text:"音🎵é".repeat(32),camera:{y:i/1024,x:1-i/1024}}))}];
  for(const value of fixtures){
    const before=structuredClone(value);
    assert.equal(echoDirectionVariantFingerprint(value),legacyIdentity(value));
    assert.deepEqual(value,before);
  }
});
