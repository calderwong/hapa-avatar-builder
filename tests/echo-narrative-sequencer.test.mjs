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
