import test from 'node:test';
import assert from 'node:assert/strict';
import {reflowEchoCueBoundaries} from '../src/domain/echo-cue-reflow.js';
import {NARRATIVE_VARIANT_RECIPES} from '../src/domain/echo-director-recipes.js';
import {createEchoNarrativeRecut} from '../src/domain/echo-narrative-recut.js';
import {buildDirectorV2Artifacts,compileDirectorVariant} from '../src/domain/echo-director-v2.js';
import {projectToEditorGraph} from '../src/domain/multitrack-editor.js';
import {compileHyperFramesShow} from '../src/domain/hyperframes-show-compiler.js';

const cue=(atSeconds,extra={})=>({id:'cue:'+atSeconds,atSeconds,kind:'edit_pulse',source:'authored-edit-map',approved:true,toleranceSeconds:.1,eligibleActions:['cut'],...extra});
const slots=()=>Array.from({length:4},(_,i)=>({id:'slot-'+i,startSeconds:i*3,endSeconds:i*3+3,locks:[]}));
const graph=(cues=[cue(3.08),cue(6.06),cue(9.08)])=>({schemaVersion:'hapa.echo.cue-graph.v2',cueGraphId:'cue:fixture',cues,lyricCues:[],sections:[{id:'song',startSeconds:0,endSeconds:12}]});
const reflow=(extra={})=>reflowEchoCueBoundaries({slots:slots(),cueGraph:graph(),recipe:NARRATIVE_VARIANT_RECIPES['performance-kinetic'],mode:'supported-cues',seed:'A',...extra});

test('reflow uses approved cut-enabled cues and the tighter declared tolerance, with exact shared boundaries',()=>{
  const source=slots(),before=JSON.stringify(source);
  const result=reflow({slots:source,cueGraph:graph([cue(3.001,{approved:false}),cue(3.002,{eligibleActions:['accent']}),cue(3.03,{toleranceSeconds:.01}),cue(3.08),cue(6.3,{toleranceSeconds:.5}),cue(9.08)])});
  assert.deepEqual(result.receipt.movedBoundaries.map(x=>x.toSeconds),[3.08,9.08]);
  assert.equal(result.slots[0].startSeconds,0);assert.equal(result.slots.at(-1).endSeconds,12);
  for(let i=1;i<4;i++)assert.equal(result.slots[i-1].endSeconds,result.slots[i].startSeconds);
  assert.equal(JSON.stringify(source),before);
  assert.deepEqual(reflow(),reflow());
  assert.deepEqual(reflow({cueGraph:graph([...graph().cues].reverse())}),reflow());
});

test('phrase windows, section locks, cut locks, hard media intervals and existing gaps remain protected',()=>{
  const protectedGraph=graph();protectedGraph.lyricCues=[{id:'phrase',startSeconds:2.8,endSeconds:3.3}];protectedGraph.sections=[{id:'first',startSeconds:0,endSeconds:6},{id:'last',startSeconds:6,endSeconds:12}];
  assert.deepEqual(reflow({cueGraph:protectedGraph}).receipt.movedBoundaries.map(x=>x.toSeconds),[9.08]);
  assert.equal(reflow({cueGraph:protectedGraph,locks:[{targetKind:'section',targetId:'last'}]}).receipt.movedBoundaries.length,0);
  assert.equal(reflow({locks:[{targetId:'timing'}]}).receipt.movedBoundaries.length,0);
  const fixed=slots();fixed[1].locks=['cut'];fixed[3].mediaConstraints={requiredCharacterIds:['lead']};
  assert.equal(reflow({slots:fixed}).receipt.movedBoundaries.length,0);
  const gap=slots();gap[0].endSeconds=2.9;
  assert.equal(reflow({slots:gap}).slots[1].startSeconds,3);
  assert.equal(reflow({locks:[{targetKind:'cut',targetId:'slot-1'}]}).receipt.movedBoundaries.length,1);
});

test('short shots, missing cue permission, malformed intervals and bounded work are handled explicitly',()=>{
  const short=[{id:'a',startSeconds:0,endSeconds:.8},{id:'b',startSeconds:.8,endSeconds:1.6}];
  assert.equal(reflow({slots:short,cueGraph:graph([cue(.9)])}).receipt.movedBoundaries.length,0);
  assert.equal(reflow({cueGraph:{...graph(),schemaVersion:'unknown'}}).receipt.movedBoundaries.length,0);
  assert.match(reflow({cueGraph:null}).receipt.limitations[0],/No approved/);
  assert.throws(()=>reflow({slots:[{startSeconds:NaN,endSeconds:1}]}),/finite/);
  assert.throws(()=>reflow({recipe:{timing:{maxShiftSeconds:Infinity}}}),/finite/);
  assert.throws(()=>reflow({cueGraph:graph(Array.from({length:20001},()=>cue(3)))}),/bounded/);
  assert.deepEqual(reflow({mode:'preserve'}).slots,slots());
});

test('an existing mid-phrase cut can move to a supported edge while an explicit phrase lock forbids that edit',()=>{
  const source=slots();source[0].endSeconds=3.04;source[1].startSeconds=3.04;
  const cues=graph([cue(3)]);cues.lyricCues=[{id:'lyric:0',startSeconds:3,endSeconds:3.5}];
  const repaired=reflow({slots:source,cueGraph:cues});
  assert.equal(repaired.slots[1].startSeconds,3);
  assert.deepEqual(repaired.receipt.movedBoundaries[0].phraseBoundaryRepairs,['lyric:0']);
  assert.equal(reflow({slots:source,cueGraph:cues,locks:[{targetKind:'phrase',targetId:'lyric:0'}]}).slots[1].startSeconds,3.04);
});

function project(){return {song_id:'reflow',song_title:'Reflow',duration:12,audio_uri:'/master.mp3',timed_lyrics:[],
  song_edit_map:{sections:[{id:'song',start:0,end:12}],editPulses:[3.08,6.06,9.08].map(t=>({t,kind:'edit_pulse',source:'authored-edit-map'}))},
  timeline:slots().map((slot,i)=>({start_sec:slot.startSeconds,end_sec:slot.endSeconds,media_id:'m'+i,media_uri:'/media/'+i+'.mp4',camera_motion:'static',locks:[]})),visualizer_timeline:[]};}

test('UI recut and Director compiler apply the same reflow to executable media cards and keep lyrics/audio immutable',()=>{
  const source=project(),recipe='performance-kinetic';
  const built=buildDirectorV2Artifacts({project:source,manifest:{shaders:[]},recipe,seed:'A',timingMode:'supported-cues'});
  source.director_show_graph=built.showGraph;
  const before=JSON.stringify(source);
  const recut=createEchoNarrativeRecut({project:source,recipeId:recipe,seed:'A',timingMode:'supported-cues',range:{startSeconds:0,endSeconds:12}});
  const times=recut.project.timeline.map(s=>[s.start_sec,s.end_sec]);
  const cards=built.showGraph.tracks[0].cards;
  assert.deepEqual(times,cards.map(s=>[s.startSeconds,s.endSeconds]));
  assert.equal(built.showGraph.directorV2.narrativeSequence.cueReflow.movedBoundaries.length,3);
  assert.equal(JSON.stringify(source),before);
  assert.deepEqual(recut.project.timed_lyrics,source.timed_lyrics);assert.equal(recut.project.audio_uri,source.audio_uri);
  const editor=projectToEditorGraph(recut.project);
  const editorCards=editor.tracks.find(t=>['media','foundation'].includes(t.role)).cards;
  assert.deepEqual(editorCards.map(s=>[s.startSeconds,s.endSeconds]),times);
  assert.doesNotThrow(()=>compileHyperFramesShow({project:recut.project,showGraph:editor,telemetry:{}}));
  const again=buildDirectorV2Artifacts({project:project(),manifest:{shaders:[]},recipe,seed:'A',timingMode:'supported-cues'});
  assert.equal(again.showGraph.directorV2.variantHash,built.showGraph.directorV2.variantHash);
  const locked=compileDirectorVariant({treatment:built.treatment,cueGraph:built.cueGraph,recipe,seed:'A',sourceProject:project(),timingMode:'supported-cues',locks:[{targetId:'timing'}]});
  assert.deepEqual(locked.tracks[0].cards.map(s=>[s.startSeconds,s.endSeconds]),slots().map(s=>[s.startSeconds,s.endSeconds]));
});

test('selected ranges and percentage budgets preserve all unselected timing including transition boundaries',()=>{
  const source=project();source.director_show_graph={directorV2:{cueGraph:graph()}};
  const run=options=>createEchoNarrativeRecut({project:source,recipeId:'performance-kinetic',seed:'A',timingMode:'supported-cues',range:{startSeconds:3,endSeconds:9},...options});
  const full=run({});assert.equal(full.receipt.cueReflow.movedBoundaries.length,1);
  assert.deepEqual(full.project.timeline[0],source.timeline[0]);assert.deepEqual(full.project.timeline[3],source.timeline[3]);
  assert.equal(full.project.timeline[1].start_sec,3);assert.equal(full.project.timeline[2].end_sec,9);
  assert.equal(run({changeAmount:.5}).receipt.cueReflow.movedBoundaries.length,0);
  source.timeline[1].locks=['timing'];assert.equal(run({}).receipt.cueReflow.movedBoundaries.length,0);
});

test('compact UI graphs retain phrase protection and cue identity when captions are hidden',()=>{
  const source=project();source.timed_lyrics=[{start:2.8,end:3.3,text:'Protected vocal phrase'}];source.lyrics_enabled=false;
  source.director_show_graph={directorV2:{cueGraph:{...graph(),id:'cue:compact',cueGraphId:undefined,lyricCues:undefined}}};
  const result=createEchoNarrativeRecut({project:source,recipeId:'performance-kinetic',seed:'A',timingMode:'supported-cues',range:{startSeconds:0,endSeconds:12}});
  assert.equal(result.receipt.cueReflow.cueGraphId,'cue:compact');assert.equal(result.project.timeline[1].start_sec,3);
  assert.equal(result.receipt.cueReflow.movedBoundaries.length,2);
});
