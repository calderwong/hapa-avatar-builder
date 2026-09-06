import test from 'node:test';
import assert from 'node:assert/strict';
import {createEchoObservedContentRanker} from '../src/domain/semantic-media-ranker-v2.js';
import {inspectStoredShotDecision} from '../src/domain/shot-decision-inspector.js';
import {createEchoNarrativeRecut} from '../src/domain/echo-narrative-recut.js';
const sha='a'.repeat(64);
const frame=(text,confidence,pointSeconds=.5)=>({schemaVersion:'hapa.echo.catalog-observation.v1',status:'inferred-limited',sourceByteStatus:'bytes-verified',sourceSha256:sha,revision:'b'.repeat(64),frameId:'frame:'+pointSeconds,pointSeconds,provider:'fixture',labels:[{text,confidence}],textLines:[],recognitionFrameBinding:'fixture-perceptual'});
function asset(id,frames,extra={}){return {id,uri:'/media/'+id+'.mp4',sourceKind:'local-video',title:'flame',contentEvidence:{schemaVersion:'hapa.echo.prepared-content-evidence.v1',status:'prepared-inferred-limited',sourceSha256:sha,sourceDurationSeconds:10,revision:'snapshot',boundRuntimeUri:'/media/'+id+'.mp4',boundMediaId:id,observations:frames},...extra};}
const slot={startSeconds:3,endSeconds:6,sectionStartSeconds:0,sectionEndSeconds:9,sectionLabel:'Verse'};
const lyrics=[{id:'phrase',start:3,end:6,text:'flame'}];

test('phrase and section score confidence-bearing in-window observations without using titles or later frames',()=>{
 const ranker=createEchoObservedContentRanker({lyricCues:[{start:0,end:3,text:'water'},...lyrics]});
 const matching=ranker.score(asset('match',[frame('flame',.427)]),slot);
 const titleOnly=ranker.score(asset('title-only',[frame('water',.9)]),slot);
 const later=ranker.score(asset('later',[frame('flame',1,8)]),slot);
 assert.equal(matching.phrase.value,.427);assert.equal(matching.semanticConfidence,null);
 assert.equal(titleOnly.phrase.value,0);assert.ok(titleOnly.section.value>0);
 assert.equal(later.phrase.value,null);assert.equal(later.reason,'no-sampled-evidence-in-source-window');
 assert.equal(matching.frames[0].pointSeconds,.5);assert.deepEqual(matching.sourceWindow,{sourceSha256:sha,startSeconds:0,endSeconds:3});
 assert.ok(matching.limitations.includes('no-depicted-identity-action-or-emotion-inference'));
});

test('the existing word-confidence policy restricts words only when their alignment is supported',()=>{
 const line={start:0,end:6,text:'water flame',words:[{word:'water',start:0,end:3,confidence:.9},{word:'flame',start:3,end:6,confidence:.9}]};
 const ranker=createEchoObservedContentRanker({lyricCues:[line],timingSource:'forced-alignment'});
 const current=ranker.score(asset('m',[frame('flame',.8)]),slot);assert.equal(current.phrase.value,.8);assert.equal(current.phrases[0].mode,'word');
 const unverified=createEchoObservedContentRanker({lyricCues:[{...line,words:line.words.map(({confidence,...word})=>word)}]}).score(asset('m',[frame('flame',.8)]),slot);
 assert.equal(unverified.phrase.value,.4);assert.equal(unverified.phrases[0].mode,'phrase');assert.equal(unverified.phrases[0].reason,'word-confidence-missing');
});

test('duplicate observations never amplify confidence and unknown confidence stays unmeasured',()=>{
 const ranker=createEchoObservedContentRanker({lyricCues:lyrics}),one=frame('flame',.4);
 const result=ranker.score(asset('m',[one,one,frame('flame',.5,1)]),slot);
 assert.equal(result.phrase.value,.5);assert.equal(result.frameCount,2);
 assert.equal(ranker.score(asset('m',[frame('flame',null)]),slot).phrase.value,null);
 assert.equal(ranker.score(asset('m',[one],{uri:'/media/unverified-proxy.mp4'}),slot).reason,'runtime-media-binding-changed-or-unverified');
 const conflicting={...one,revision:'c'.repeat(64)};
 assert.equal(ranker.score(asset('m',[one,conflicting]),slot).phrase.value,null);
});

test('Unicode spelling is retained and input budgets fail explicitly',()=>{
 for(const value of ['京都','서울','Слава','cafe\u0301','ＦＬＡＭＥ']){
  const result=createEchoObservedContentRanker({lyricCues:[{start:3,end:6,text:value}]}).score(asset('m',[frame(value,.8)]),slot);
  assert.equal(result.phrase.value,.8);assert.equal(result.phrase.matches[0].token,value.normalize('NFKC').toLowerCase());
 }
 assert.throws(()=>createEchoObservedContentRanker({lyricCues:Array(4097).fill({})}),/cue budget/);
 const ranker=createEchoObservedContentRanker({lyricCues:lyrics});
 const oversized=asset('m',Array.from({length:65},(_,i)=>frame('flame',1,i/100)));
 assert.equal(ranker.score(oversized,slot).reason,'source-observation-budget-exceeded');
});

function project(){
 const choices=[asset('opening',[frame('nothing',.8)]),asset('water',[frame('water',.8)]),asset('flame',[frame('flame',.8)]),asset('last',[frame('nothing',.8)])];
 return {song_id:'fixture',duration:12,timed_lyrics:lyrics,timeline:choices.map((source,i)=>({media_id:source.id,media_uri:source.uri,media_title:source.title,contentEvidence:source.contentEvidence,start_sec:i*3,end_sec:i*3+3,section_id:'verse',section_label:'Verse',camera_motion:'static'}))};
}
const recut=p=>createEchoNarrativeRecut({project:p,recipeId:'performance-kinetic',seed:'same-input',range:{startSeconds:3,endSeconds:6}});
test('the real recut uses current phrase evidence, preserves inputs and hard favorite/exclusion constraints',()=>{
 const p=project(),before=JSON.stringify(p),result=recut(p);
 assert.equal(result.project.timeline[1].media_id,'flame');
 assert.equal(result.project.timeline[1].decision_evidence.observedContent.phrase.value,.8);
 assert.equal(result.receipt.modelCalls,0);assert.equal(result.receipt.analysisCalls,0);
 assert.equal(JSON.stringify(p),before);assert.deepEqual(result,recut(p));
 const pinned=structuredClone(p);pinned.timeline[1].locks=['media'];assert.equal(recut(pinned).project.timeline[1].media_id,'water');
 const banned=structuredClone(p);banned.timeline[1].mediaConstraints={bans:['flame']};assert.notEqual(recut(banned).project.timeline[1].media_id,'flame');
});

test('distinct trims of one source remain candidates for their actual destination source windows',()=>{
 const p=project(),source=asset('same',[frame('water',1,.5),frame('flame',1,5.5)]);
 p.timeline[1]={...p.timeline[1],media_id:'same',media_uri:source.uri,contentEvidence:source.contentEvidence,media_contract:{sourceInSeconds:0,sourceOutSeconds:3}};
 p.timeline[2]={...p.timeline[2],media_id:'same',media_uri:source.uri,contentEvidence:source.contentEvidence,media_contract:{sourceInSeconds:5,sourceOutSeconds:8}};
 const result=recut(p).project.timeline[1];assert.equal(result.media_contract.sourceInSeconds,5);assert.equal(result.decision_evidence.observedContent.sourceWindow.startSeconds,5);
});

test('the inspector exposes only consumed evidence and never promotes annotation confidence to cut confidence',()=>{
 const shot=recut(project()).project.timeline[1],before=JSON.stringify(shot);
 const inspector=inspectStoredShotDecision(shot);
 assert.equal(inspector.scoreLabel,'Recipe + lyric evidence');
 assert.equal(inspector.selectedScore.confidence,null);assert.equal(inspector.selectedScore.semanticTruth,'inferred-limited');
 assert.equal(inspector.observedContent.phrase.matches[0].confidence,.8);
 assert.equal(inspector.observedContent.sourceWindow.startSeconds,0);
 assert.equal(inspector.lyricCanonMediaEvidence.find(row=>row.dimension==='observedPhrase').weight,4);
 assert.equal(inspector.lyricCanonMediaEvidence.find(row=>row.dimension==='observedPhrase').rawValue,.8);
 assert.ok(inspector.missingData.includes('no-calibrated-cut-confidence'));assert.equal(JSON.stringify(shot),before);
 const unavailable=structuredClone(shot);unavailable.decision_evidence.observedContent={...unavailable.decision_evidence.observedContent,status:'unavailable',reason:'no-sampled-evidence-in-source-window',phrase:{value:null},section:{value:null}};
 assert.equal(inspectStoredShotDecision(unavailable).scoreLabel,'Recipe preference');
 assert.ok(inspectStoredShotDecision(unavailable).missingData.includes('no-sampled-evidence-in-source-window'));
 const noStored=structuredClone(shot);delete noStored.decision_evidence.observedContent;
 assert.equal(inspectStoredShotDecision(noStored).observedContent,null);
});

test('pinned source casting history cannot override the current narrative decision in the inspector',()=>{
 const p=project();p.timeline[1].locks=['media'];p.timeline[1].semantic_casting={selectionStatus:'old-casting',selected:{utility:999,confidence:.99},alternatives:[{mediaId:'old-alternative'}]};
 const shot=recut(p).project.timeline[1],inspector=inspectStoredShotDecision(shot);
 assert.equal(shot.semantic_casting.selected.confidence,.99);
 assert.equal(inspector.selectedScore.confidence,null);assert.notEqual(inspector.selectedScore.utility,999);
 assert.equal(inspector.reviewStatus,'recipe-proposal-pending-human-review');
 assert.equal(inspector.observedContent.phrase.value,0);assert.equal(inspector.alternativeCount,0);
});
