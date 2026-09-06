import test from 'node:test';
import assert from 'node:assert/strict';
import {buildDirectorV2Artifacts} from '../src/domain/echo-director-v2.js';
import {ECHO_DIRECTOR_RECIPES} from '../src/domain/echo-director-recipes.js';
import {evaluateEchoMediaEligibility,inspectEchoTimelineMediaEligibility} from '../src/domain/echo-media-eligibility.js';
import {buildAvatarDirectorCandidates} from '../src/domain/builder-direction-candidates.js';
import {recastBalancedEchoDirectorProject,recastEchoDirectorProject,convertShotToVisualizerOnly} from '../src/domain/echo-media-recast.js';
import {createEchoNarrativeRecut} from '../src/domain/echo-narrative-recut.js';
import {compileHyperFramesShow} from '../src/domain/hyperframes-show-compiler.js';
const evidence={characterIds:['red'],sceneIds:['garden'],canonicalMediaIds:['canonical'],identityEvidence:{status:'canonical-declarations',revision:'fixture'},availability:{exists:true,bytes:100},cropCoverage:{minWidth:1920,minHeight:1080,protectedRegionsSafe:true},origin:{sourceSystem:'hapa-avatar-builder'},provenance:{creator:'fixture-author'}};
const shot=extra=>({start_sec:0,end_sec:4,media_id:'alias',media_uri:'/media/a.mp4',...evidence,...extra});
const project=timeline=>({song_id:'eligibility-parity',duration:4,timed_lyrics:[],timeline,visualizer_timeline:[]});
const compile=(source,recipe,mediaConstraints={})=>buildDirectorV2Artifacts({project:source,manifest:{shaders:[]},recipe,seed:'fixed',mediaConstraints});
const rejects=(run,reason)=>assert.throws(run,error=>error.code==='echo_media_constraints_unsatisfied'&&error.result.reasons.includes(reason)&&error.result.selected===null&&error.result.alternatives.every(row=>row.action));

test('every current recipe applies the same hard filters to locked/pinned source media',()=>{
 for(const recipe of Object.keys(ECHO_DIRECTOR_RECIPES))for(const [extra,constraints,reason] of [
  [{},{bans:['canonical']},'operator-ban'],
  [{media_uri:''},{},'missing-runtime-uri'],
  [{availability:{exists:false,bytes:0}},{},'missing-source-bytes'],
  [{sourceAllowed:false},{},'invalid-source-policy'],
  [{},{requiredCharacterIds:['blue']},'required-character'],
  [{},{requiredSceneIds:['ship']},'required-scene'],
  [{cropCoverage:{minWidth:400,minHeight:300}},{outputProfile:{width:1920,height:1080}},'incompatible-output-crop'],
 ])rejects(()=>compile(project([shot(extra)]),recipe,{...constraints,pins:['alias']}),reason);
});

test('legacy recipe preferences choose only eligible alternatives and preserve source evidence into executable graph cards',()=>{
 const source=project([shot({end_sec:2}),shot({start_sec:2,media_id:'banned',media_uri:'/media/b.mp4',canonicalMediaIds:['banned']})]);
 const before=JSON.stringify(source);
 for(const recipe of ['conservative','visualizer-forward','kinetic']){
  const result=compile(source,recipe,{bans:['banned'],requiredCharacterIds:['red'],requireVerifiedPolicyForBans:true});
  const media=result.showGraph.tracks.find(track=>track.id==='track-a').cards;
  assert.ok(media.every(card=>card.media.id==='alias'));
  assert.deepEqual(media[1].media.canonicalMediaIds,['canonical']);assert.deepEqual(media[1].media.provenance,{creator:'fixture-author'});
  assert.equal(evaluateEchoMediaEligibility({...media[1].media,uri:media[1].media.localPath},{bans:['canonical']}).eligible,false);
 }
 assert.equal(JSON.stringify(source),before);
});

test('generated intervals cannot impersonate required characters in any current recipe',()=>{
 for(const recipe of Object.keys(ECHO_DIRECTOR_RECIPES))rejects(()=>compile(project([shot({media_id:'none',media_uri:''})]),recipe,{requiredCharacterIds:['red']}),'required-character');
});

test('Builder candidate normalization and both recast paths replace old identities with the chosen source evidence',()=>{
 const asset={id:'asset',uri:'/media/a.mp4',type:'video',...evidence,metadata:{width:1920,height:1080,duration:8,echosTechnicalAffordance:{availability:evidence.availability,contactFrames:Array(1000).fill('/fixture-frame.png')}}};
 const [built]=buildAvatarDirectorCandidates({avatars:[{id:'owner',primaryName:'Owner',unrelatedPayload:'unrelated-note'.repeat(10000),assets:[asset]}]});
 assert.deepEqual(built.owner,{id:'owner',kind:'avatar',title:'Owner'});assert.equal(built.technical.contactFrames,undefined);assert.deepEqual(built.technical.availability,evidence.availability);assert.ok(JSON.stringify(built).length<4000,'candidate evidence must not duplicate the owner asset list or analysis frames');
 assert.deepEqual(built.characterIds,['red']);assert.deepEqual(built.canonicalMediaIds,['canonical']);assert.deepEqual(built.availability,evidence.availability);assert.deepEqual(built.provenance,evidence.provenance);
 assert.equal(evaluateEchoMediaEligibility(built,{bans:['asset'],pins:[built.id]}).eligible,false,'the resulting media-library ID is also an exclusion alias');
 const selected={...built,cohort:'root',sourceGroup:'avatar'};
 const original=project([shot({characterIds:['old'],sceneIds:['old-scene'],canonicalMediaIds:['old-id'],provenance:{creator:'old-author'},mediaConstraints:{requiredCharacterIds:['red'],bans:['old-id']}})]);
 for(const recast of [recastEchoDirectorProject,recastBalancedEchoDirectorProject]){
  const result=recast(original,[selected],{allowedSourceGroups:['avatar'],createdAt:'fixture-time'});
  assert.deepEqual(result.timeline[0].characterIds,['red']);assert.deepEqual(result.timeline[0].media_contract.characterIds,['red']);
  assert.deepEqual(result.timeline[0].provenance,{creator:'fixture-author'});assert.ok(inspectEchoTimelineMediaEligibility(result.timeline).every(row=>row.eligible));
  assert.deepEqual(original.timeline[0].characterIds,['old']);
 }
});

test('recasts cannot preserve a generated gap inside a required media interval',()=>{
 const source=project([shot({media_id:'none',media_uri:'',mediaConstraints:{requiredCharacterIds:['red']}})]);
 const candidate={id:'a',uri:'/media/a.mp4',duration:8,sourceGroup:'avatar',cohort:'root',...evidence};
 for(const recast of [recastEchoDirectorProject,recastBalancedEchoDirectorProject])rejects(()=>recast(source,[candidate],{allowedSourceGroups:['avatar']}),'required-character');
 const generated=convertShotToVisualizerOnly(shot());assert.equal(generated.characterIds,undefined);assert.equal(generated.identityEvidence,undefined);
});

test('canonical aliases survive UI recuts and graph-only HyperFrames compilation',()=>{
 const source={...project([shot()]),active_direction_script_variant:{id:'parent'}};
 rejects(()=>createEchoNarrativeRecut({project:source,recipeId:'letter-intimate',seed:'A',locks:[],range:{startSeconds:0,endSeconds:4},requiredCharacterIds:['blue']}),'required-character');
 rejects(()=>createEchoNarrativeRecut({project:{...source,timeline:[shot({media_uri:'',mediaConstraints:{pins:['alias']}})]},recipeId:'letter-intimate',seed:'A',range:{startSeconds:0,endSeconds:4}}),'missing-runtime-uri');
 const graph=compile(source,'conservative').showGraph;
 rejects(()=>compileHyperFramesShow({showGraph:graph,project:{mediaConstraints:{bans:['canonical']}},telemetry:{}}),'operator-ban');
 const scoped=compile({...source,timeline:[shot({mediaConstraints:{requiredCharacterIds:['red']}})]},'conservative').showGraph;
 assert.deepEqual(scoped.tracks[0].cards[0].mediaConstraints.requiredCharacterIds,['red']);
});
