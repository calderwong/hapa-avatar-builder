import test from "node:test";
import assert from "node:assert/strict";
import { sequenceEchoNarrative } from "../src/domain/echo-narrative-sequencer.js";
import { NARRATIVE_VARIANT_RECIPES } from "../src/domain/echo-director-recipes.js";

const media = (id, extra = {}) => ({ id, uri: `/media/${id}.mp4`, sourceKind: "local-video", ...extra });
const slot = (id, candidates, extra = {}) => ({ id, startSeconds: Number(id) * 3, endSeconds: Number(id) * 3 + 3, camera: { motion: "static", intensity: .1, speed: 1 }, media: candidates[0], candidateMedia: candidates, locks: ["timing"], ...extra });
const compile = (slots, recipe = "performance-kinetic", options = {}) => sequenceEchoNarrative({ slots, recipe: NARRATIVE_VARIANT_RECIPES[recipe], seed: "A", ...options });

test("generated sequence decisions cannot advertise inherited depicted cast", () => {
  const generated = media("none", { sourceKind: "pure-visualizer", characterIds: ["ghost"], sceneIds: ["ghost-scene"] });
  const result = compile([slot("0", [generated])], "ensemble-response");
  assert.deepEqual(result.slots[0].selectedMedia.characterIds, []);
  assert.deepEqual(result.slots[0].selectedMedia.sceneIds, []);
  assert.ok(result.receipt.decisions[0].limitations.includes("cast-identity-unverified"));
  assert.deepEqual(generated.characterIds, ["ghost"], "source metadata remains untouched");
});

test("five narrative grammars execute deterministically, change actual selections across seeds and preserve source time", () => {
  const candidates = Array.from({ length: 8 }, (_, index) => media(`m${index}`));
  const slots = Array.from({ length: 16 }, (_, index) => slot(String(index), candidates));
  const before = structuredClone(slots);
  for (const recipe of Object.keys(NARRATIVE_VARIANT_RECIPES)) {
    const a = compile(slots, recipe), again = compile(slots, recipe);
    assert.deepEqual(a, again);
    assert.deepEqual(a.slots.map(s => [s.startSeconds, s.endSeconds]), slots.map(s => [s.startSeconds, s.endSeconds]));
    const sequences = new Set(Array.from({ length: 8 }, (_, i) => compile(slots, recipe, { seed: `seed-${i}` }).slots.map(s => s.selectedMedia.id).join("|")));
    assert.ok(sequences.size > 1, recipe);
    assert.equal(a.receipt.modelCalls, 0);
    assert.ok(a.receipt.decisions.every(d => d.semanticConfidence === null));
  }
  assert.deepEqual(slots, before);
});

test("hard constraints reject locked, unavailable, wrong-cast and banned sources rather than weakening them", () => {
  for (const candidate of [media("banned"), media("missing", { availability: { exists: false } }), media("wrong", { characterIds: ["other"] })]) {
    assert.throws(() => compile([slot("0", [candidate], { locks: ["media", "timing"] })], "letter-intimate", {
      constraints: { bans: ["banned"], requiredCharacterIds: ["lead"] },
    }), error => error.statusCode === 422 && error.result.locked === true);
  }
  const generated = media("none", { uri: "", sourceKind: "pure-visualizer" });
  assert.throws(() => compile([slot("0", [generated])], "ambient-instrumental", { constraints: { bans: ["none"] } }), /operator-ban/);
  assert.throws(() => compile([slot("0", [generated])], "ambient-instrumental", { constraints: { requiredCharacterIds: ["lead"] } }), /required-character/);
  assert.equal(compile([slot("0", [generated])], "ambient-instrumental").slots[0].selectedMedia.id, "none");
});

test("slot cast and scene constraints strengthen global requirements; selection and camera locks survive", () => {
  const good = media("good", { characterIds: ["lead", "guest"], sceneIds: ["home"] });
  const partial = media("partial", { characterIds: ["guest"], sceneIds: ["home"] });
  const source = slot("0", [good, partial], { mediaConstraints: { requiredCharacterIds: ["guest"], requiredSceneIds: ["home"] }, locks: ["camera", "media", "timing"] });
  const result = compile([source], "ensemble-response", { constraints: { requiredCharacterIds: ["lead"] } });
  assert.equal(result.slots[0].selectedMedia.id, "good");
  assert.deepEqual(result.slots[0].camera, source.camera);
  assert.throws(() => compile([slot("0", [partial], { mediaConstraints: source.mediaConstraints })], "ensemble-response", { constraints: { requiredCharacterIds: ["lead"] } }), /required-character/);
});

test("ensemble uses declared identities, and comic grammar does not walk backward through known panels", () => {
  const cast = [media("lead", { characterIds: ["lead"] }), media("response", { characterIds: ["response"] })];
  const ensemble = compile(Array.from({ length: 6 }, (_, i) => slot(String(i), cast)), "ensemble-response");
  for (let i = 1; i < ensemble.slots.length; i++) assert.notEqual(ensemble.slots[i].selectedMedia.id, ensemble.slots[i - 1].selectedMedia.id);
  const panels = [0, 1, 2].map(index => media(`panel-${index}`, { sourceKind: "local-photo", comicId: "comic", panelIndex: index }));
  const comic = compile([slot("0", [panels[0]], { locks: ["media"] }), slot("1", [panels[1]]), slot("2", [panels[0], panels[2]])], "comic-journey");
  assert.deepEqual(comic.slots.map(s => s.selectedMedia.panelIndex), [0, 1, 2]);
  assert.throws(() => compile([slot("0", [panels[2]]), slot("1", [panels[0]])], "comic-journey"), /narrative-sequence-exhausted/);
});

test("metadata-free footage remains explicitly limited, and candidate order cannot change seeded output", () => {
  const candidates = [media("a"), media("b"), media("c")];
  const one = compile([slot("0", candidates)], "comic-journey");
  const shuffled = compile([slot("0", [...candidates].reverse())], "comic-journey");
  assert.equal(one.slots[0].selectedMedia.id, shuffled.slots[0].selectedMedia.id);
  assert.ok(one.receipt.decisions[0].limitations.includes("comic-panel-order-unavailable"));
  assert.ok(one.receipt.decisions[0].pendingEvidence.includes("source-bytes-unverified"));
});

test('generated candidates cannot reuse stale depicted identities and sequence exhaustion has repair actions', () => {
  const generated=media('none',{uri:'',sourceKind:'pure-visualizer',characterIds:['lead'],sceneIds:['home']});
  assert.throws(()=>compile([slot('0',[generated])],'ambient-instrumental',{constraints:{requiredCharacterIds:['lead'],requiredSceneIds:['home'],pins:['none']}}),error=>error.result.reasons.includes('required-character')&&error.result.reasons.includes('required-scene'));
  const panels=[media('last',{comicId:'comic',panelIndex:3}),media('earlier',{comicId:'comic',panelIndex:1})];
  assert.throws(()=>compile([slot('0',[panels[0]]),slot('1',[panels[1]])],'comic-journey'),error=>error.result.reasons.includes('narrative-sequence-exhausted')&&error.result.alternatives.every(row=>typeof row.action==='string'&&row.action.length>10));
});

test('bounded search keeps a less attractive panel when the greedy winner would exhaust the next cue', () => {
  const early=media('early',{comicId:'book',panelIndex:0,sourceKind:'local-photo'});
  const tempting=media('tempting',{comicId:'book',panelIndex:2,sourceKind:'local-photo',shotRoles:['establishing']});
  const next=media('next',{comicId:'book',panelIndex:1,sourceKind:'local-photo'});
  const input=[slot('0',[tempting,early]),slot('1',[next])];
  const before=structuredClone(input);
  const result=compile(input,'comic-journey');
  assert.deepEqual(result.slots.map(row=>row.selectedMedia.id),['early','next']);
  assert.equal(result.receipt.decisions[0].selectionBasis,'bounded-sequence-preference');
  assert.ok(result.receipt.decisions[0].alternatives[0].preferenceScore>result.receipt.decisions[0].preferenceScore);
  assert.ok(result.receipt.search.exhaustedBranches>0);
  assert.equal(result.receipt.search.globallyOptimal,false);
  assert.deepEqual(input,before);
});

test('future favorite locks remain exact and conflicting locked panel order is actionable', () => {
  const panels=[0,1,2].map(panelIndex=>media('panel'+panelIndex,{comicId:'book',panelIndex,sourceKind:'local-photo',shotRoles:panelIndex===2?['establishing']:[]}));
  const result=compile([slot('0',[panels[2],panels[0]]),slot('1',[panels[1]],{locks:['media','camera','timing']})],'comic-journey');
  assert.deepEqual(result.slots.map(row=>row.selectedMedia.id),['panel0','panel1']);
  assert.equal(result.receipt.decisions[1].locked,true);
  assert.throws(()=>compile([slot('0',[panels[2]],{locks:['media']}),slot('1',[panels[1]],{locks:['media']})],'comic-journey'),error=>error.statusCode===422&&error.result.locked===true&&error.result.search.globallyOptimal===false);
});

test('beam branch state and bounded explanation order survive candidate permutations', () => {
  const candidates=[0,1,2].flatMap(index=>['a','b'].map(comicId=>media(comicId+index,{sourceKind:'local-photo',comicId,panelIndex:index})));
  const input=Array.from({length:6},(_,i)=>slot(String(i),candidates));
  const original=compile(input,'comic-journey');
  const reversed=compile(input.map(row=>({...row,candidateMedia:[...row.candidateMedia].reverse()})),'comic-journey');
  assert.deepEqual(original.receipt,reversed.receipt);
  assert.deepEqual(original.slots.map(row=>row.selectedMedia),reversed.slots.map(row=>row.selectedMedia));
  for(const comicId of ['a','b']){
    const indices=original.slots.map(row=>row.selectedMedia).filter(row=>row.comicId===comicId).map(row=>row.panelIndex);
    assert.deepEqual(indices,[0,1,2]);
  }
  assert.ok(original.receipt.search.evaluatedBranches<=original.receipt.search.maximumBranchEvaluations);
});

test('large candidate explanations are capped without hiding their total counts', () => {
  const candidates=Array.from({length:90},(_,i)=>media(String(i),i<40?{sourceAllowed:false}:{}));
  const result=compile([slot('0',candidates)]);
  const decision=result.receipt.decisions[0];
  assert.equal(decision.alternatives.length,32);assert.equal(decision.alternativeCount,49);
  assert.equal(decision.rejected.length,32);assert.equal(decision.rejectedCount,40);
});

test('oversized direct callers fail before preparing candidate metadata', () => {
  assert.throws(()=>compile(Array.from({length:4097},()=>({}))),/bounded recut workspace/);
  const candidates=Array(201).fill(media('a'));
  assert.throws(()=>compile(Array.from({length:1000},(_,i)=>slot(String(i),candidates))),/recut work budget/);
});

test('a maximum-length sequence keeps a bounded receipt while retaining alternative totals',()=>{
 const candidates=Array.from({length:40},(_,i)=>media('source-'+i));
 const result=compile(Array.from({length:4096},(_,i)=>slot(String(i),candidates)),'ensemble-response');
 assert.ok(Buffer.byteLength(JSON.stringify(result.receipt))<17*1024*1024,'the complete stored receipt must remain below the artifact budget');
 assert.ok(result.receipt.decisions.every(row=>row.alternativeCount===39&&row.alternatives.length>0&&row.alternatives.length<row.alternativeCount));
 assert.equal(result.slots.length,4096);assert.ok(result.receipt.search.evaluatedBranches<=800000);
});
