import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {buildDirectorV2Artifacts,compileDirectorVariant} from '../src/domain/echo-director-v2.js';
import {createEchoNarrativeRecut} from '../src/domain/echo-narrative-recut.js';
import {projectToEditorGraph} from '../src/domain/multitrack-editor.js';
import {NARRATIVE_VARIANT_RECIPES} from '../src/domain/echo-director-recipes.js';
import {buildAccentEventTrack,validateAccentEventTrack} from '../src/domain/accent-event-track.js';
import {validateVisualTimeTrack} from '../src/domain/visual-time-track.js';
import {applyEchoRecutTreatment,applyEchoRecutExecutionToGraph} from '../src/domain/echo-recipe-recut-treatment.js';
import {buildEchoDirectionForkRequest,createEchoDirectionWorkingFork,deriveEchoDirectionVariantProject} from '../src/domain/echo-direction-variants.js';

function fixture(){
 const source={song_id:'recipe-fixture',song_title:'Recipe',duration:24,audio_uri:'/master.mp3',audio_id:'master',stems_available:['Vocals','Drums','Bass'],
  timed_lyrics:[{start:6,end:8,text:'Keep my words',confidence:.4}],
  song_edit_map:{sections:[{id:'verse',type:'verse',start:0,end:12},{id:'hook',type:'chorus',start:12,end:24}],
   audioTelemetry:{beatTimes:Array.from({length:48},(_,i)=>i*.5)},editPulses:Array.from({length:22},(_,i)=>({t:i+1,kind:'lyric-edit-pulse',strength:.8,source:'fixture-only'}))},
  timeline:Array.from({length:8},(_,i)=>({start_sec:i*3,end_sec:i*3+3,media_id:'m'+i,media_uri:'/media/m'+i+'.mp4',camera_motion:'static',camera_intensity:.2})),
  visualizer_timeline:Array.from({length:4},(_,i)=>({start_sec:i*6,end_sec:i*6+6,visualizer_id:'isf:fixture',visualizer_title:'Fixture',opacity:.6}))};
 const manifest={shaders:[{id:'isf:fixture',title:'Fixture',source:'/fixture.fs',inputs:[{NAME:'gain',TYPE:'float',DEFAULT:.25,MIN:0,MAX:1}],audioMap:{gain:{signal:'rms',depth:.4}}}]};
 const registry={stems:['Vocals','Drums','Bass'].map(stemType=>({id:stemType,parentId:'master',stemType,localPath:'/tmp/'+stemType+'.mp3',duration:24}))};
 const artifacts=buildDirectorV2Artifacts({project:source,manifest,registry,seed:'A',recipe:'conservative'});
 return {source,artifacts,project:{...source,active_direction_script_variant:{id:'parent'},director_show_graph:artifacts.showGraph}};
}
const recut=(project,extra={})=>createEchoNarrativeRecut({project,recipeId:'performance-kinetic',seed:'A',range:{startSeconds:0,endSeconds:24},...extra});
const visualizers=graph=>graph.tracks.filter(track=>track.role==='visualizer').flatMap(track=>track.cards);

test('all five recuts execute the same opacity, stem-depth, accent, visual-time and lyric rules as the full compiler',()=>{
 const {source,artifacts,project}=fixture(),before=JSON.stringify(project);
 for(const recipeId of Object.keys(NARRATIVE_VARIANT_RECIPES)){
  const direct=compileDirectorVariant({treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:source,recipe:recipeId,seed:'A'});
  const candidate=recut(project,{recipeId}),actual=projectToEditorGraph(candidate.project);
  assert.deepEqual(visualizers(actual).map(card=>card.parameters.opacity),visualizers(direct).map(card=>card.parameters.opacity),recipeId);
  assert.deepEqual(actual.directorV2.modulationBindings,direct.directorV2.modulationBindings,recipeId);
  const {mergedSectionAdmission,...actualAccentTrack}=actual.directorV2.accentTrack;
  assert.deepEqual(actualAccentTrack,direct.directorV2.accentTrack,recipeId);
  assert.deepEqual(mergedSectionAdmission.preservedViolations,[]);
  assert.ok(mergedSectionAdmission.decisions.every(row=>row.accepted));
  assert.deepEqual(actual.directorV2.visualTimeTrack,direct.directorV2.visualTimeTrack,recipeId);
  assert.equal(actual.tracks.find(track=>track.role==='accent').cards.length,direct.tracks.find(track=>track.role==='accent').cards.length);
  for(const field of ['templateId','motionIntensity','enabled','reducedMotion','fontFamily','fontScale','textColor'])assert.equal(actual.song.lyricOverlay[field],direct.song.lyricOverlay[field]);
  assert.deepEqual(candidate.project.timed_lyrics,source.timed_lyrics);assert.equal(candidate.project.audio_uri,source.audio_uri);
  assert.ok(validateAccentEventTrack(actual.directorV2.accentTrack).ok);
  assert.ok(validateVisualTimeTrack(actual.directorV2.visualTimeTrack).ok);
 }
 assert.equal(JSON.stringify(project),before);
});

test('repeated recipes do not compound opacity and manual opacity edits become the new baseline',()=>{
 const {project}=fixture();const one=recut(project),two=recut(one.project);
 assert.deepEqual(two.project.visualizer_timeline,one.project.visualizer_timeline);
 assert.deepEqual(projectToEditorGraph(two.project).directorV2.accentTrack,projectToEditorGraph(one.project).directorV2.accentTrack);
 const edited=structuredClone(one.project);edited.visualizer_timeline[0].opacity=.8;
 const three=recut(edited);assert.equal(three.project.visualizer_timeline[0].opacity,.416);
 assert.equal(three.project.visualizer_timeline[0].recipe_treatment.baseOpacity,.8);
});

test('ranged treatment preserves boundary-crossing shaders, outside effects and global controls',()=>{
 const {project}=fixture(),before=projectToEditorGraph(project);
 const next=recut(project,{range:{startSeconds:6,endSeconds:18}}),after=projectToEditorGraph(next.project);
 assert.equal(next.project.visualizer_timeline[0],project.visualizer_timeline[0]);assert.equal(next.project.visualizer_timeline[3],project.visualizer_timeline[3]);
 assert.equal(next.project.visualizer_timeline[1].opacity,.312);
 assert.deepEqual(after.directorV2.modulationBindings,before.directorV2.modulationBindings);
 assert.deepEqual(after.song.lyricOverlay,before.song.lyricOverlay);
 const outside=event=>(event.atSeconds??event.startSeconds)<6||event.endSeconds>18;
 for(const field of ['accentTrack','visualTimeTrack'])assert.deepEqual(after.directorV2[field].events.filter(outside),before.directorV2[field].events.filter(outside));
 assert.ok(next.receipt.treatment.limitations.includes('global-stem-depth-and-lyric-style-preserved-for-ranged-recut'));
 const projected=applyEchoRecutExecutionToGraph(after,next.project);
 assert.deepEqual(projected.directorV2.accentTrack,after.directorV2.accentTrack,'reprojection does not accumulate accents');
});

test('explicit treatment locks and disabled/reduced-motion lyrics survive recipe changes',()=>{
 const {project}=fixture();project.lyrics={enabled:false,reducedMotion:true,templateId:'orbit-caption-v1',motionIntensity:.12,fontFamily:'serif',fontScale:1.4,textColor:'#f97316'};
 const locks=['shader-treatment','accents','visual-time','lyric-style','camera'].map(targetId=>({targetId}));
 const candidate=recut(project,{locks}),before=projectToEditorGraph(project),after=projectToEditorGraph(candidate.project);
 assert.deepEqual(candidate.project.visualizer_timeline,project.visualizer_timeline);assert.deepEqual(candidate.project.lyrics,project.lyrics);
 assert.deepEqual(after.directorV2.accentTrack,before.directorV2.accentTrack);assert.deepEqual(after.directorV2.visualTimeTrack,before.directorV2.visualTimeTrack);
 assert.deepEqual(after.directorV2.modulationBindings,before.directorV2.modulationBindings);
 const unlocked=projectToEditorGraph(recut(project).project);assert.equal(unlocked.song.lyricOverlay.enabled,false);assert.equal(unlocked.song.lyricOverlay.reducedMotion,true);
 assert.ok(!unlocked.directorV2.accentTrack.events.some(event=>['flicker','shutter','glitch'].includes(event.kind)));
});

test('append-only fork payload and saved-cut projection preserve executable recipe assignments',()=>{
 const {project}=fixture(),candidate=recut(project),working=createEchoDirectionWorkingFork(project,{id:'parent',timeline:project.timeline});
 const request=buildEchoDirectionForkRequest(working,candidate.project);
 assert.deepEqual(request.projectPatch.director_patch_lineage.recipeExecution,candidate.project.director_patch_lineage.recipeExecution);
 const restored=deriveEchoDirectionVariantProject(project,{...request,id:'saved-child',project_patch:request.projectPatch});
 const expected=projectToEditorGraph(candidate.project),actual=projectToEditorGraph(restored);
 assert.deepEqual(actual.directorV2.accentTrack,expected.directorV2.accentTrack);
 assert.deepEqual(visualizers(actual).map(card=>card.parameters.opacity),visualizers(expected).map(card=>card.parameters.opacity));
});

test('browser-compatible accent hashing preserves the original SHA-256 IDs including Unicode',()=>{
 const cue={id:'声🎵',atSeconds:1,approved:true,eligibleActions:['accent'],kind:'stem_onset',confidence:.8};
 const [event]=buildAccentEventTrack({cues:[cue],density:1,durationSeconds:3}).events;
 const expected=crypto.createHash('sha256').update(JSON.stringify([cue.id,event.kind,0])).digest('hex').slice(0,16);
 assert.equal(event.id,'accent:'+expected);
});

test('a partial first recipe cannot create effects outside its assigned window',()=>{
 const graph={song:{durationSeconds:24},tracks:[],directorV2:{cueGraph:{cues:Array.from({length:20},(_,i)=>({id:'cue'+i,atSeconds:i,approved:true,kind:'stem_onset',eligibleActions:['effect','accent']}))}}};
 const source={duration:24,director_show_graph:graph};
 const result=applyEchoRecutTreatment(source,{recipe:NARRATIVE_VARIANT_RECIPES['performance-kinetic'],windows:[{startSeconds:6,endSeconds:12}]});
 const projected=applyEchoRecutExecutionToGraph(graph,result.project);
 for(const field of ['accentTrack','visualTimeTrack'])assert.ok(projected.directorV2[field].events.every(event=>(event.atSeconds??event.startSeconds)>=6&&event.endSeconds<=12));
});

test('successive ranged recipes retain earlier intervals and keep flash density within the shared bound',()=>{
 const {project}=fixture();
 const one=recut(project,{range:{startSeconds:0,endSeconds:12}}).project;
 const two=recut(one,{recipeId:'letter-intimate',range:{startSeconds:12,endSeconds:24}}).project;
 const before=projectToEditorGraph(one),after=projectToEditorGraph(two);
 for(const field of ['accentTrack','visualTimeTrack'])assert.deepEqual(after.directorV2[field].events.filter(event=>event.endSeconds<=12),before.directorV2[field].events.filter(event=>event.endSeconds<=12));
 assert.ok(validateAccentEventTrack(after.directorV2.accentTrack).ok);
 assert.equal(two.director_patch_lineage.recipeExecution.accentWindows.length,2);
 // Persistence and another edit must retain the decisions already made, even
 // if a later quiet recipe would have admitted a different first-window set.
 const reloaded=JSON.parse(JSON.stringify(two));
 assert.deepEqual(projectToEditorGraph(reloaded).directorV2.accentTrack,after.directorV2.accentTrack);
 const three=recut(reloaded,{recipeId:'ambient-instrumental',range:{startSeconds:12,endSeconds:24}}).project;
 assert.deepEqual(projectToEditorGraph(three).directorV2.accentTrack.events.filter(event=>event.endSeconds<=12),before.directorV2.accentTrack.events.filter(event=>event.endSeconds<=12));
 assert.equal(JSON.stringify(two),JSON.stringify(reloaded));

 const tampered=structuredClone(two);tampered.director_patch_lineage.recipeExecution.accentWindows[0].recipe.accentDensity=NaN;
 assert.throws(()=>projectToEditorGraph(tampered),/supported versioned recipe/);
});

test('whole-song persistent shader mix is idempotent and partial selections preserve it',()=>{
 const {project}=fixture();project.persistent_shader_slots=[{id:'persistent-shader-1',enabled:true,shader_id:'isf:fixture',opacity:.4}];
 const one=recut(project).project,two=recut(one).project;
 assert.equal(one.persistent_shader_slots[0].opacity,.208);
 assert.deepEqual(two.persistent_shader_slots,one.persistent_shader_slots);
 const partial=recut(one,{recipeId:'letter-intimate',range:{startSeconds:6,endSeconds:18}});
 assert.deepEqual(partial.project.persistent_shader_slots,one.persistent_shader_slots);
 assert.ok(partial.receipt.treatment.limitations.includes('persistent-shader-mix-needs-whole-song-window'));
});

test('whole-song treatment covers a short authored ringout without extending the media timeline',()=>{
 const {project}=fixture();project.duration=24.04;project.visualizer_timeline.at(-1).end_sec=24.04;
 const result=recut(project,{range:{startSeconds:0,endSeconds:24.04}}),graph=projectToEditorGraph(result.project);
 assert.deepEqual(result.receipt.treatment.windows,[{startSeconds:0,endSeconds:24.04}]);
 assert.equal(result.project.timeline.at(-1).end_sec,24);
 assert.equal(result.project.visualizer_timeline.at(-1).opacity,.312);
 assert.equal(graph.directorV2.recipe.id,'performance-kinetic');
 assert.equal(graph.song.lyricOverlay.templateId,'kinetic-word-burst-v1');
});

test('locking an already-applied recipe retains its current modulation rather than reverting to the original graph',()=>{
 const {project}=fixture();const one=recut(project).project;
 const two=recut(one,{recipeId:'letter-intimate',locks:[{targetId:'accents'},{targetId:'shader-treatment'}]}).project;
 const before=projectToEditorGraph(one),after=projectToEditorGraph(two);
 const kinds=new Set(['edit_permission','visualizer_uniform']);
 assert.deepEqual(after.directorV2.modulationBindings.filter(row=>kinds.has(row.target.kind)),before.directorV2.modulationBindings.filter(row=>kinds.has(row.target.kind)));
 assert.deepEqual(after.directorV2.accentTrack,before.directorV2.accentTrack);
});

test('full compiler honors global operator locks against the current editable graph',()=>{
 const {source,artifacts,project}=fixture();
 project.lyrics={templateId:'orbit-caption-v1',motionIntensity:.12,reducedMotion:true};
 const locks=['shader-treatment','accents','visual-time','lyric-style','camera','media-casting'].map(targetId=>({targetId}));
 const before=projectToEditorGraph(project),input=JSON.stringify(project);
 const direct=compileDirectorVariant({treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:project,recipe:'performance-kinetic',seed:'different',locks});
 assert.deepEqual(visualizers(direct).map(c=>c.parameters.opacity),visualizers(before).map(c=>c.parameters.opacity));
 for(const field of ['accentTrack','visualTimeTrack','modulationBindings'])assert.deepEqual(direct.directorV2[field],before.directorV2[field],field);
 for(const field of ['templateId','motionIntensity','reducedMotion'])assert.equal(direct.song.lyricOverlay[field],before.song.lyricOverlay[field],field);
 assert.deepEqual(direct.tracks[0].cards.map(c=>c.media.id),source.timeline.map(c=>c.media_id));
 assert.deepEqual(direct.directorV2.cameraKeyframes.map(c=>c.motion),before.directorV2.cameraKeyframes.map(c=>c.motion));
 assert.ok(locks.every(lock=>direct.directorV2.locks.some(row=>row.targetId===lock.targetId)));
 assert.equal(JSON.stringify(project),input);
});

test('full compiler retains current locked recipe values instead of reapplying the authored baseline',()=>{
 const {project,artifacts}=fixture(),one=recut(project).project;
 const before=projectToEditorGraph(one),locks=[{target:'shader-treatment'},{target:'accents'},{target:'visual-time'},{target:'lyric-style'}];
 const options={treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:one,recipe:'letter-intimate',seed:'B',locks};
 const direct=compileDirectorVariant(options);
 assert.deepEqual(visualizers(direct).map(c=>c.parameters.opacity),visualizers(before).map(c=>c.parameters.opacity));
 for(const field of ['accentTrack','visualTimeTrack'])assert.deepEqual(direct.directorV2[field],before.directorV2[field]);
 assert.deepEqual(direct.directorV2.modulationBindings.filter(b=>b.target.kind!=='camera'),before.directorV2.modulationBindings.filter(b=>b.target.kind!=='camera'));
 assert.equal(direct.song.lyricOverlay.templateId,before.song.lyricOverlay.templateId);
 assert.equal(direct.directorV2.variantHash,compileDirectorVariant(options).directorV2.variantHash);
});

test('full compiler preserves individual authored shader, event and binding locks while changing unlocked treatment',()=>{
 const {project,artifacts}=fixture();
 project.visualizer_timeline[0]={...project.visualizer_timeline[0],id:'keep-first',opacity:.83,locked:true};
 const event=project.director_show_graph.directorV2.accentTrack.events[0];
 assert.ok(event,'fixture must expose a real event');event.opacity=.123;event.locked=true;
 const binding=project.director_show_graph.directorV2.modulationBindings[0];binding.envelope.depth=.713;
 project.director_show_graph.directorV2.locks.push({targetKind:'binding',targetId:binding.id});
 const before=projectToEditorGraph(project);
 const direct=compileDirectorVariant({treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:project,recipe:'performance-kinetic',seed:'A'});
 assert.equal(visualizers(direct)[0].parameters.opacity,.83);
 assert.equal(visualizers(direct)[1].parameters.opacity,.312);
 assert.deepEqual(direct.directorV2.modulationBindings.find(b=>b.id===binding.id),before.directorV2.modulationBindings.find(b=>b.id===binding.id));
 assert.deepEqual(direct.directorV2.accentTrack.events.find(e=>e.id===event.id),before.directorV2.accentTrack.events.find(e=>e.id===event.id));
 assert.ok(validateAccentEventTrack(direct.directorV2.accentTrack).ok);
});

test('compiler and recut inherit camera and casting locks from the saved cut',()=>{
 const {project,artifacts}=fixture();
 project.director_show_graph.directorV2.locks.push({target:'camera'},{target:'media-casting'});
 const direct=compileDirectorVariant({treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:project,recipe:'ensemble-response',seed:'new'});
 const after=recut(project,{recipeId:'ensemble-response',seed:'new'}).project;
 assert.deepEqual(direct.tracks[0].cards.map(c=>c.media.id),project.timeline.map(c=>c.media_id));
 assert.deepEqual(after.timeline.map(c=>[c.media_id,c.camera_motion,c.camera_intensity]),project.timeline.map(c=>[c.media_id,c.camera_motion,c.camera_intensity]));
 assert.ok(direct.directorV2.cameraKeyframes.every(c=>c.motion==='static'&&c.intensity===.2));
});

test('a locked accent cannot reintroduce source media excluded by the current constraints',()=>{
 const {project,artifacts}=fixture();
 const cards=project.director_show_graph.tracks.find(t=>t.role==='accent').cards;
 const protectedCard=cards[0];assert.ok(protectedCard,'fixture requires an accent card');
 protectedCard.media.id='locked-accent-only';
 const locks=[{targetId:protectedCard.id,targetKind:'event'}];
 assert.throws(()=>compileDirectorVariant({treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:project,recipe:'performance-kinetic',seed:'A',locks,mediaConstraints:{bans:[protectedCard.media.id]}}),error=>error.code==='echo_media_constraints_unsatisfied'&&error.result.stage==='director-locked-accent'&&error.result.reasons.includes('operator-ban'));
});

test('locked compilation keeps patched opacity, current controls and persistent opacity',()=>{
 const {project}=fixture();
 project.persistent_shader_slots=[{id:'always-on-shader-1',enabled:true,shader_id:'isf:fixture',opacity:.7,locked:true}];
 // A new treatment includes the real persistent slot; the current graph projector
 // supplies the same controls that the operator sees, including row-carried edits.
 const {treatment,cueGraph}=buildDirectorV2Artifacts({project,manifest:{shaders:[{id:'isf:fixture',source:'/fixture.fs',inputs:[{NAME:'gain',TYPE:'float',DEFAULT:.25,MIN:0,MAX:1}],audioMap:{gain:{signal:'rms',depth:.4}}}]},recipe:'conservative',seed:'A'});
 project.director_show_graph_patches=[{operation:{kind:'set-opacity',cardId:'card:b:0',opacity:.91}}];
 project.director_show_graph.tracks.find(t=>t.role==='visualizer').cards[0].parameters.visualizerControls={gain:.77};
 const before=projectToEditorGraph(project);
 const options={treatment,cueGraph,sourceProject:project,recipe:'performance-kinetic',seed:'A',locks:[{targetId:'shader-treatment'}]};
 const direct=compileDirectorVariant(options);
 assert.equal(visualizers(direct).find(c=>c.persistentSlotId==='always-on-shader-1').parameters.opacity,.7);
 assert.deepEqual(visualizers(direct).filter(c=>!c.persistentSlotId).map(c=>c.parameters.opacity),[.91,.6,.6,.6]);
 assert.deepEqual(visualizers(direct)[0].parameters.visualizerControls,visualizers(before)[0].parameters.visualizerControls);
 assert.equal(direct.directorV2.variantHash,compileDirectorVariant(options).directorV2.variantHash);
});


test('binding-level locked flags survive compiler and recut treatment changes',()=>{
 const {project,artifacts}=fixture();
 const binding=project.director_show_graph.directorV2.modulationBindings[0];binding.locked=true;binding.envelope.depth=.731;
 const direct=compileDirectorVariant({treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:project,recipe:'performance-kinetic'});
 const after=projectToEditorGraph(recut(project).project);
 for(const graph of [direct,after])assert.deepEqual(graph.directorV2.modulationBindings.find(b=>b.id===binding.id),binding);
});


test('locked current timeline rows match their position after the projector replaces a shader template',()=>{
 const {project}=fixture();
 project.visualizer_timeline[0]={...project.visualizer_timeline[0],visualizer_id:'isf:new',visualizer_title:'New',opacity:.82};
 const artifacts=buildDirectorV2Artifacts({project,manifest:{shaders:[{id:'isf:new',title:'New',source:'/new.fs',inputs:[]},{id:'isf:fixture',title:'Fixture',source:'/fixture.fs',inputs:[]}]}});
 const baseline=projectToEditorGraph(project);
 assert.match(visualizers(baseline)[0].id,/^projected:/);
 const actual=compileDirectorVariant({treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:project,recipe:'performance-kinetic',locks:[{targetId:'shader-treatment'}]});
 assert.equal(visualizers(actual)[0].parameters.opacity,.82);
});

test('a treatment lock cannot silently transfer controls across different shader sources',()=>{
 const {project,artifacts}=fixture();
 project.visualizer_timeline[0].visualizer_id='isf:operator-selected';
 assert.throws(()=>compileDirectorVariant({treatment:artifacts.treatment,cueGraph:artifacts.cueGraph,sourceProject:project,recipe:'performance-kinetic',locks:[{targetId:'shader-treatment'}]}),error=>error.code==='echo_locked_shader_source_changed'&&error.result.currentSourceId==='isf:operator-selected');
});

test('saved legacy generated bindings declare mapped signal space without reinterpreting authored or locked values', async () => {
  const { project } = fixture();
  const { buildPortableVisualizerCard } = await import('../src/domain/portable-visualizer-card.js');
  for (const card of project.director_show_graph.tracks.filter(t=>t.role==='visualizer').flatMap(t=>t.cards)) card.visualization.card = buildPortableVisualizerCard({ id: 'isf:fixture', source: 'void main() { gl_FragColor = vec4(1.); }', sourceHash: 'sha256:' + crypto.createHash('sha256').update('void main() { gl_FragColor = vec4(1.); }').digest('hex'), inputs: [{NAME:'gain',TYPE:'float',MIN:0,MAX:1,DEFAULT:.25}], audioMap: { gain: { signal: 'rms', depth: .4 } } });
  const bindings = project.director_show_graph.directorV2.modulationBindings;
  const generated = bindings.filter(b => b.target.kind === 'visualizer_uniform');
  for (const binding of generated) { delete binding.target.valueSpace; delete binding.target.referenceDepth; }
  generated[1].locked = true;
  generated[2].envelope.baseValue = .713;
  project.director_show_graph.directorV2.locks.push({ targetKind: 'binding', targetId: generated[3].id });
  const original = JSON.stringify(project);
  const graph = projectToEditorGraph(project);
  const after = graph.directorV2.modulationBindings.filter(b => b.target.kind === 'visualizer_uniform');
  assert.equal(after[0].target.valueSpace, 'mapped-signal-v1', JSON.stringify({binding:after[0],locks:graph.directorV2.locks,cards:graph.tracks.filter(t=>t.role==='visualizer').flatMap(t=>t.cards).map(c=>({id:c.id,cueId:c.cueId,map:c.visualization?.card?.audioMap}))}));
  assert.equal(after[0].target.referenceDepth, .4);
  for (let i = 1; i < 4; i++) assert.deepEqual(after[i], generated[i]);
  assert.equal(JSON.stringify(project), original);
  const reloaded = projectToEditorGraph(JSON.parse(JSON.stringify({ ...project, director_show_graph: graph })));
  assert.deepEqual(reloaded.directorV2.modulationBindings, graph.directorV2.modulationBindings);
});


test('whole-song legacy recuts install section budgets before camera projection; partial edits preserve the policy',()=>{
 const {project}=fixture();delete project.director_show_graph.directorV2.visualBudgetPolicy;
 const before=JSON.stringify(project);
 const partial=recut(project,{range:{startSeconds:6,endSeconds:12}}).project;
 assert.equal(projectToEditorGraph(partial).directorV2.visualBudgetPolicy,undefined);
 const whole=recut(project).project,graph=projectToEditorGraph(whole);
 assert.equal(graph.directorV2.visualBudgetPolicy.schemaVersion,'hapa.echo.section-visual-budget.v1');
 assert.ok(graph.directorV2.mediaRoleCamera.every(path=>path.sectionMotionBudget));
 assert.deepEqual(projectToEditorGraph(JSON.parse(JSON.stringify(whole))).directorV2.cameraKeyframes,graph.directorV2.cameraKeyframes);
 const ranged=recut(whole,{recipeId:'letter-intimate',range:{startSeconds:12,endSeconds:24}}).project;
 assert.deepEqual(projectToEditorGraph(ranged).directorV2.visualBudgetPolicy,graph.directorV2.visualBudgetPolicy);
 const locked=recut(project,{locks:[{target:'shader-treatment'}]}).project;
 assert.equal(projectToEditorGraph(locked).directorV2.visualBudgetPolicy,undefined);
 assert.equal(JSON.stringify(project),before);
});
