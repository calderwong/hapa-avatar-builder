import test from 'node:test';
import assert from 'node:assert/strict';
import { ECHO_LIVING_LIGHT_CUE_SCHEMA, validateEchoLivingLightCues, compileEchoLivingLightTrack, validateEchoLivingLightSavedReferences, resolveEchoLivingLightCue, echoLivingLightCueAt } from '../src/domain/echo-living-light-cues.js';
import { prepareEchoProjectForPersistence } from '../server/echo-project-persistence.mjs';
import { pickEchoDirectionVariantProjectPatch, createEchoDirectionWorkingFork, buildEchoDirectionForkRequest, deriveEchoDirectionVariantProject } from '../src/domain/echo-direction-variants.js';
import { buildDirectorV2Artifacts } from '../src/domain/echo-director-v2.js';
import { validateEchoCompiledShowGraph, reidentifyEchoCompiledShowGraph } from '../src/domain/echo-compiled-show-graph.js';
import { compileHyperFramesShow } from '../src/domain/hyperframes-show-compiler.js';
import { projectToEditorGraph } from '../src/domain/multitrack-editor.js';

function cue(overrides = {}) {
  return { schemaVersion: ECHO_LIVING_LIGHT_CUE_SCHEMA, cueId: 'cue:light-1', role: 'scene', songId: 'song-fixture', journeyRef: { journeyId: 'journey:one', revisionId: 'revision:one' }, sourceBindingRef: null, window: { startUs: 8e6, endUs: 16e6 }, journeyWindow: { startUs: 0, endUs: 8e6 }, clock: 'echo-song', mapping: 'offset-1x', outputProfile: 'project', locks: { timing: false, journey: false }, ...overrides };
}
function project(cues = [cue()]) {
  return { song_id: 'song-fixture', song_title: 'Fixture', duration: 24, output_profile: 'vertical', timeline: [], visualizer_timeline: [], living_light_cues: cues };
}
function saved() {
  return { journeyId: 'journey:one', revisionId: 'revision:one', songId: 'song-fixture', sourceBindingRef: null, schedule: [{instanceId: 'a', startUs: 0, endUs: 8e6}, {instanceId: 'bridge',startUs:8e6,endUs:16e6,fromInstanceId:'a',toInstanceId:'b'}, {instanceId:'b',startUs:16e6,endUs:24e6}] };
}
const rejects = (fn, code) => assert.throws(fn, error => error.code === code);

test('cue windows are exact, bounded, half-open and never compressed or clipped', () => {
  assert.equal(validateEchoLivingLightCues([cue()],{songId:'song-fixture',durationUs:24e6}).length,1);
  assert.equal(echoLivingLightCueAt([cue()],8e6).journeyUs,0);
  assert.equal(echoLivingLightCueAt([cue()],12e6).journeyUs,4e6);
  assert.equal(echoLivingLightCueAt([cue()],16e6),null);
  rejects(()=>validateEchoLivingLightCues([cue({window:{startUs:8e6,endUs:10e6}})]),'living_light_cue_time_mapping');
  rejects(()=>validateEchoLivingLightCues([cue()],{durationUs:10e6}),'living_light_cue_duration');
  rejects(()=>validateEchoLivingLightCues([cue()],{songId:'another-song'}),'living_light_cue_song');
  rejects(()=>validateEchoLivingLightCues([cue({finalEncoding:'ready'})]),'living_light_cue_field');
  rejects(()=>validateEchoLivingLightCues([cue({window:{startUs:0.1,endUs:8e6}})]),'living_light_cue_window');
});

test('one native surface rejects overlapping cues and duplicate identities but allows adjacency', () => {
  rejects(()=>validateEchoLivingLightCues([cue(),cue()]),'living_light_cue_duplicate');
  rejects(()=>validateEchoLivingLightCues([cue(),cue({cueId:'other'})]),'living_light_cue_overlap');
  assert.equal(validateEchoLivingLightCues([cue(),cue({cueId:'other',window:{startUs:16e6,endUs:24e6}})]).length,2);
});

test('saved resolution requires exact revision and source, preserves old revisions, and refuses partial passages', () => {
  const options={resolveJourney:()=>({journey:saved()})};
  assert.deepEqual(resolveEchoLivingLightCue(cue(),options),saved());
  rejects(()=>resolveEchoLivingLightCue(cue(),{}),'living_light_journey_unavailable');
  rejects(()=>resolveEchoLivingLightCue(cue({journeyRef:{journeyId:'journey:one',revisionId:'revision:latest'}}),options),'living_light_journey_unavailable');
  rejects(()=>resolveEchoLivingLightCue(cue({sourceBindingRef:{bindingId:'binding:changed',revisionId:'revision:changed'}}),options),'living_light_journey_source_mismatch');
  rejects(()=>resolveEchoLivingLightCue(cue({journeyWindow:{startUs:20e6,endUs:28e6}}),options),'living_light_journey_window');
  rejects(()=>resolveEchoLivingLightCue(cue({journeyWindow:{startUs:4e6,endUs:12e6}}),options),'living_light_passage_truncated');
  rejects(()=>resolveEchoLivingLightCue(cue({role:'transition'}),options),'living_light_transition_window');
  assert.deepEqual(resolveEchoLivingLightCue(cue({role:'transition',journeyWindow:{startUs:8e6,endUs:16e6}}),options),saved());
});

test('save, fork request and reopen retain cues and locks without mutating parent', () => {
  const source=project([cue({locks:{timing:true,journey:true}})]), before=structuredClone(source);
  const persisted=prepareEchoProjectForPersistence({...source,director_show_graph:{transient:true}});
  assert.equal(persisted.director_show_graph,undefined);
  assert.deepEqual(persisted.living_light_cues,source.living_light_cues);
  assert.deepEqual(pickEchoDirectionVariantProjectPatch(source).living_light_cues,source.living_light_cues);
  const fork=createEchoDirectionWorkingFork(source,{id:'parent'});
  const request=buildEchoDirectionForkRequest(fork);
  const child=deriveEchoDirectionVariantProject(source,{id:'child',timeline:[],visualizer_timeline:[],project_patch:request.projectPatch});
  assert.deepEqual(child.living_light_cues,source.living_light_cues);
  assert.deepEqual(child.director_show_graph.livingLight.cues,source.living_light_cues);
  assert.deepEqual(source,before);
  rejects(()=>prepareEchoProjectForPersistence(project([cue({songId:'wrong'})])),'living_light_cue_song');
});

test('compiler binds cues, output shape and revision changes into graph identity', () => {
  const p=project(), options={project:p,manifest:{shaders:[]},duration:24};
  const graph=buildDirectorV2Artifacts(options).showGraph;
  assert.deepEqual(graph.livingLight.cues,p.living_light_cues);
  assert.equal(graph.livingLight.outputProfile.id,'vertical');
  assert.equal(graph.livingLight.readiness.finalEncoding,'unsupported');
  assert.equal(validateEchoCompiledShowGraph({project:p,graph}).ok,true);
  const changed=project([cue({journeyRef:{journeyId:'journey:one',revisionId:'revision:two'}})]);
  assert.notEqual(graph.directorV2.variantHash,buildDirectorV2Artifacts({...options,project:changed}).showGraph.directorV2.variantHash);
  const omitted=structuredClone(graph);delete omitted.livingLight;
  assert.ok(validateEchoCompiledShowGraph({project:p,graph:reidentifyEchoCompiledShowGraph(omitted)}).reasons.includes('living_light_cues_mismatch'));
});

test('editor removes stale inherited scenes when a child explicitly clears its cues', () => {
  const p=project(), graph=projectToEditorGraph(p);
  assert.equal(graph.livingLight.cues.length,1);
  assert.equal(projectToEditorGraph({...p,living_light_cues:[],director_show_graph:graph}).livingLight,undefined);
  const child=deriveEchoDirectionVariantProject({...p,director_show_graph:graph},{id:'clear',timeline:[],visualizer_timeline:[],project_patch:{living_light_cues:[]}});
  assert.equal(child.director_show_graph.livingLight,undefined);
});

test('final export refuses cues even when a stale or tampered graph omits them', () => {
  const p=project(), graph=buildDirectorV2Artifacts({project:p,manifest:{shaders:[]},duration:24}).showGraph;
  rejects(()=>compileHyperFramesShow({project:p,showGraph:graph}),'living_light_export_unsupported');
  const stale=structuredClone(graph);delete stale.livingLight;
  rejects(()=>compileHyperFramesShow({project:p,showGraph:stale}),'living_light_export_unsupported');
  rejects(()=>compileHyperFramesShow({project:project([]),showGraph:graph}),'living_light_export_unsupported');
});

test('legacy cuts stay free of Living Light declarations', () => {
  const p=project();delete p.living_light_cues;
  assert.equal(compileEchoLivingLightTrack(p),null);
  assert.equal(prepareEchoProjectForPersistence(p).living_light_cues,undefined);
  assert.equal(pickEchoDirectionVariantProjectPatch(p).living_light_cues,undefined);
  assert.equal(buildDirectorV2Artifacts({project:p,manifest:{shaders:[]},duration:24}).showGraph.livingLight,undefined);
});

test('owner validation resolves every cue before accepting a cut and does no work for ordinary cuts', () => {
  let calls = 0;
  const resolveJourney = ref => { calls++; assert.deepEqual(ref, cue().journeyRef); return {journey:saved()}; };
  assert.equal(validateEchoLivingLightSavedReferences(project(), resolveJourney).length,1);
  assert.equal(calls,1);
  validateEchoLivingLightSavedReferences(project([]), resolveJourney);
  assert.equal(calls,1);
  rejects(()=>validateEchoLivingLightSavedReferences(project(),()=>null),'living_light_journey_unavailable');
  rejects(()=>buildDirectorV2Artifacts({project:project(),manifest:{shaders:[]},duration:10}),'living_light_cue_duration');
});
