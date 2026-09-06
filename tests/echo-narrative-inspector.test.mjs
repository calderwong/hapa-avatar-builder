import test from 'node:test';
import assert from 'node:assert/strict';
import {inspectStoredShotDecision} from '../src/domain/shot-decision-inspector.js';
import {sequenceEchoNarrative} from '../src/domain/echo-narrative-sequencer.js';
import {NARRATIVE_VARIANT_RECIPES} from '../src/domain/echo-director-recipes.js';

test('recipe inspection exposes actual component scores, missing data and bounded alternatives without semantic confidence',()=>{
 const media=id=>({id,uri:`/media/${id}.mp4`,sourceKind:'local-video'});
 const candidates=Array.from({length:40},(_,i)=>media('m'+i));
 const result=sequenceEchoNarrative({slots:[{id:'0',startSeconds:0,endSeconds:3,locks:['timing'],candidateMedia:candidates,camera:{},media:candidates[0]}],recipe:NARRATIVE_VARIANT_RECIPES['letter-intimate'],seed:'fixture'});
 const decision=result.receipt.decisions[0];
 const shot={media_id:decision.selectedMediaId,start_sec:0,end_sec:3,decision_evidence:decision};
 const before=JSON.stringify(shot),inspector=inspectStoredShotDecision(shot);
 assert.equal(inspector.selectedScore.utility,Object.values(decision.scoreComponents).reduce((sum,row)=>sum+row.value,0));
 assert.equal(inspector.selectedScore.confidence,null);
 assert.equal(inspector.selectedScore.semanticTruth,'unmeasured');
 assert.equal(inspector.scoreLabel,'Recipe preference');
 assert.ok(inspector.missingData.includes('missing-palette'));
 assert.ok(inspector.missingData.includes('source-bytes-unverified'));
 assert.equal(inspector.alternatives.length,32);assert.equal(inspector.alternativeCount,39);
 assert.equal(inspector.reviewStatus,'recipe-proposal-pending-human-review');
 assert.equal(JSON.stringify(shot),before);
});

test('sequence rejections and their stored reasons reach the inspector',()=>{
 const panels=[0,1].map(panelIndex=>({id:'p'+panelIndex,uri:`/p${panelIndex}.png`,sourceKind:'local-photo',comicId:'book',panelIndex}));
 const result=sequenceEchoNarrative({slots:[0,1].map(index=>({id:String(index),startSeconds:index*3,endSeconds:index*3+3,media:panels[index],candidateMedia:panels,camera:{},locks:index===0?['media']:[]})),recipe:NARRATIVE_VARIANT_RECIPES['comic-journey'],seed:'fixture'});
 const decision=result.receipt.decisions[1],inspector=inspectStoredShotDecision({media_id:decision.selectedMediaId,decision_evidence:decision});
 assert.deepEqual(inspector.rejected,[{mediaId:'p0',reasons:['narrative-sequence-exhausted']}]);
 assert.ok(inspector.continuityRisks.includes('narrative-sequence-exhausted'));
 assert.equal(inspector.rejectedCount,1);
});

test('existing measured casting and legacy inspection remain distinct from recipe preference',()=>{
 const shot={media_id:'source',semantic_casting:{selected:{mediaId:'source',utility:.7,confidence:.4,confidenceBasis:'stored-analysis',semanticTruth:'inferred',components:{motion:{value:.5,weight:.2,status:'inferred',evidence:['source-observation']}}},alternatives:[{mediaId:'alternative',utility:.6}],rejected:[{mediaId:'excluded',hardFilters:['operator-ban']}]}};
 const result=inspectStoredShotDecision(shot);
 assert.equal(result.scoreLabel,'Score');assert.equal(result.selectedScore.utility,.7);
 assert.equal(result.selectedScore.confidence,.4);assert.equal(result.selectedScore.semanticTruth,'inferred');
 assert.equal(result.alternatives[0].mediaId,'alternative');assert.equal(result.rejected[0].mediaId,'excluded');
 assert.equal(inspectStoredShotDecision({media_id:'legacy'}).selectedScore.utility,null);
});
