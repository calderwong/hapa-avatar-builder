import test from "node:test";
import assert from "node:assert/strict";
import {materializeMultitrackProject,projectToEditorGraph,applyMultitrackOperation} from "../src/domain/multitrack-editor.js";
import {createEchoNarrativeRecut} from "../src/domain/echo-narrative-recut.js";
import {createEchoDirectionWorkingFork,buildEchoDirectionForkRequest,deriveEchoDirectionVariantProject} from "../src/domain/echo-direction-variants.js";
const fixture=()=>({song_id:"patch-song",song_title:"Patched",duration:24,active_direction_script_variant:{id:"parent"},
 timeline:Array.from({length:4},(_,i)=>({start_sec:i*6,end_sec:i*6+6,media_id:"m"+i,media_uri:"/m"+i+".mp4",camera_motion:"static",camera_intensity:1,media_contract:{type:"video",originalUri:"/m"+i+".mp4",dimensions:{width:1920,height:1080}}})),
 visualizer_timeline:[{start_sec:0,end_sec:24,visualizer_id:"shader",visualizer_title:"Shader",opacity:.8}],
});
function edit(project,operation){const {patch}=applyMultitrackOperation(projectToEditorGraph(project),operation);return {...project,director_show_graph_patches:[...(project.director_show_graph_patches || []),patch]}}
for(const operation of [
 {kind:"set-opacity",cardId:"legacy:media:1",opacity:.27},
 {kind:"set-blend",cardId:"legacy:media:1",blendMode:"screen"},
 {kind:"set-camera",cardId:"legacy:media:1",motion:"pan-left",intensity:.4},
 {kind:"trim-card",cardId:"legacy:media:1",startSeconds:6.2,endSeconds:11.7},
 {kind:"knock-card",cardId:"legacy:media:1"},
 {kind:"set-opacity",cardId:"legacy:ivf:0",opacity:.17},
 {kind:"set-stem-map",cardId:"legacy:ivf:0",stemMap:["master:rms"]},
])test("source materialization retains "+operation.kind+" on "+operation.cardId,()=>{
 const project=edit(fixture(),operation),before=JSON.stringify(project),result=materializeMultitrackProject(project);
 assert.equal(result.receipt.projectionPreserved,true);assert.equal(JSON.stringify(project),before);
 assert.equal(result.project.director_show_graph_patches.length,operation.kind==="set-stem-map"?1:0);
 assert.deepEqual(result.project.director_patch_lineage.trackEditMaterializations[0].patches,project.director_show_graph_patches);
 if(operation.kind!=="set-stem-map")assert.equal(materializeMultitrackProject(result.project).project,result.project);
});

test("edited shader opacity becomes recipe baseline and survives fork/save projection",()=>{
 const project=edit(fixture(),{kind:"set-opacity",cardId:"legacy:ivf:0",opacity:.17});
 const parent={id:"parent",timeline:project.timeline,visualizer_timeline:project.visualizer_timeline};
 const a=createEchoNarrativeRecut({project,recipeId:"performance-kinetic",seed:"A",range:{startSeconds:0,endSeconds:24}});
 assert.equal(a.project.visualizer_timeline[0].recipe_treatment.baseOpacity,.17);
 const request=buildEchoDirectionForkRequest(createEchoDirectionWorkingFork(project,parent),a.project);
 const saved=deriveEchoDirectionVariantProject(fixture(),{...request,id:"child",project_patch:request.projectPatch,visualizer_timeline:request.visualizerTimeline});
 assert.deepEqual(saved.director_patch_lineage.trackEditMaterializations,a.project.director_patch_lineage.trackEditMaterializations);
 assert.equal(projectToEditorGraph(saved).tracks[1].cards[0].parameters.opacity,projectToEditorGraph(a.project).tracks[1].cards[0].parameters.opacity);
 const next=createEchoNarrativeRecut({project:saved,recipeId:"letter-intimate",seed:"B",range:{startSeconds:0,endSeconds:24}});
 assert.equal(next.project.visualizer_timeline[0].recipe_treatment.baseOpacity,.17);
});

test("unsupported and missing patch targets fail without consuming edit history",()=>{
 const project=fixture();project.director_show_graph=projectToEditorGraph(project);
 project.director_show_graph.tracks.push({id:"accent",role:"accent",cards:[{id:"accent:1",startSeconds:0,endSeconds:4,media:{id:"m0"},parameters:{opacity:1}}]});
 const edited=edit(project,{kind:"set-opacity",cardId:"accent:1",opacity:.3}),before=JSON.stringify(edited);
 assert.throws(()=>materializeMultitrackProject(edited),/cannot yet be faithfully/);assert.equal(JSON.stringify(edited),before);
 assert.throws(()=>materializeMultitrackProject({...edited,director_show_graph:projectToEditorGraph(edited)}),/cannot yet be faithfully/);
 assert.throws(()=>materializeMultitrackProject({...project,director_show_graph_patches:[{operation:{kind:"set-opacity",cardId:"gone",opacity:.3}}]}),/missing card/);
});


test("replacement media becomes the recut pool source with its actual contract and no borrowed cast",()=>{
 const source=fixture();source.timeline[1].characterIds=["old-character"];
 const media=projectToEditorGraph(source).tracks[0].cards[2].media;
 const project=edit(source,{kind:"replace-card",cardId:"legacy:media:1",media});
 const result=materializeMultitrackProject(project);
 assert.equal(result.project.timeline[1].media_id,"m2");
 assert.equal(result.project.timeline[1].media_contract.originalUri,"/m2.mp4");
 assert.equal(result.project.timeline[1].characterIds,undefined);
 const locked=createEchoNarrativeRecut({project,recipeId:"performance-kinetic",seed:"A",range:{startSeconds:0,endSeconds:24},locks:[{targetId:"media-casting"}]});
 assert.equal(locked.project.timeline[1].media_id,"m2");
 assert.equal(projectToEditorGraph(locked.project).tracks[0].cards[1].media.id,"m2");
 assert.throws(()=>materializeMultitrackProject({...project,mediaConstraints:{bans:["m2"]}}),/operator-ban/);
});


test("stem-map fanout and persistent layer edits keep every affected layer through recuts",()=>{
 const source=fixture();source.persistent_shader_slots=[{id:"always-on-shader-1",enabled:true,shader_id:"persistent",shader_title:"Persistent",opacity:.25}];
 let project=edit(source,{kind:"set-stem-map",cardId:"legacy:ivf:0",stemMap:["master:rms"]});
 const id=projectToEditorGraph(project).tracks.find(t=>t.persistent).cards[0].id;
 project=edit(project,{kind:"set-opacity",cardId:id,opacity:.11});
 const result=materializeMultitrackProject(project);
 const graph=projectToEditorGraph(result.project);
 assert.deepEqual(graph.tracks.filter(t=>t.role==="visualizer"&&t.cards.length).map(t=>t.cards[0].parameters.stemMap),[["master:rms"],["master:rms"],["master:rms"]]);
 assert.equal(graph.tracks.find(t=>t.persistent).cards[0].parameters.opacity,.11);
 const recut=createEchoNarrativeRecut({project,recipeId:"performance-kinetic",seed:"A",range:{startSeconds:0,endSeconds:24},locks:[{targetId:"shader-treatment"}]});
 assert.equal(projectToEditorGraph(recut.project).tracks.find(t=>t.persistent).cards[0].parameters.opacity,.11);
});


test("already hydrated working graphs cannot hide source edits from saved-cut materialization",()=>{
 let project=edit(fixture(),{kind:"set-opacity",cardId:"legacy:media:1",opacity:.27});
 project={...project,director_show_graph:projectToEditorGraph(project)};
 const result=materializeMultitrackProject(project);
 assert.equal(result.project.timeline[1].opacity,.27);
 const parent={id:"parent",timeline:fixture().timeline};
 const request=buildEchoDirectionForkRequest(createEchoDirectionWorkingFork(fixture(),parent),result.project);
 const saved=deriveEchoDirectionVariantProject(fixture(),{...request,id:"child",project_patch:request.projectPatch,visualizer_timeline:request.visualizerTimeline});
 assert.equal(projectToEditorGraph(saved).tracks[0].cards[1].parameters.opacity,.27);
});


test("global stem mapping retains its patch owner across generated accent changes",()=>{
 const project=fixture();project.director_show_graph=projectToEditorGraph(project);
 project.director_show_graph.tracks.push({id:"accent",role:"accent",cards:[{id:"accent:1",startSeconds:0,endSeconds:4,media:{id:"m0"},visualization:{sourceId:"accent-shader"},parameters:{opacity:1}}]});
 const edited=edit(project,{kind:"set-stem-map",cardId:"legacy:ivf:0",stemMap:["master:rms"]});
 const materialized=materializeMultitrackProject(edited);
 assert.equal(materialized.project.director_show_graph_patches.length,1);
 assert.deepEqual(materialized.receipt.retainedPatchKinds,["set-stem-map"]);
 assert.deepEqual(projectToEditorGraph(materialized.project).tracks.at(-1).cards[0].parameters.stemMap,["master:rms"]);
});
