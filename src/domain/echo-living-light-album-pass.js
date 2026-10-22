import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {newJourneyDraft,editJourneyDraft} from './living-light-journey.js';
import {livingLightCutMedia,livingLightMediaSurfaces} from './living-light-media.js';
import {validateEchoLivingLightCues,validateEchoLivingLightSavedReferences} from './echo-living-light-cues.js';
import {pickEchoDirectionVariantProjectPatch,echoDirectionVariantFingerprint,deriveEchoDirectionVariantProject} from './echo-direction-variants.js';
import {editableJourney} from './living-light-journey.js';
import {suggestLivingLightMusicResponse} from './living-light-music-response.js';
import {livingLightPreparedBinding,livingLightTimelineWithinSource} from './living-light-prepared-binding.js';
import {createLivingLightFeatureBank} from './living-light-features.js';

export const ALBUM_PASS_ID='living-light-album-pass-v1';
export const MUSIC_PASS_ID='living-light-music-response-v1';
const hash=value=>bytesToHex(sha256(new TextEncoder().encode(value)));
const ref=thing=>({thingId:thing.thingId,revisionId:thing.revisionId});
// Editorial proposals, not inferred beats, emotion scores or measured audio.
export function planLivingLightAlbumSong(project,registry){
 const durationUs=Math.round(project.duration*1e6);
 if(!Number.isSafeInteger(durationUs)||durationUs<40000000)throw Error('A song of at least 40 seconds is required for this tour treatment.');
 if(project.living_light_cues?.length)return {existing:true,cues:project.living_light_cues};
 const seed=parseInt(hash(project.song_id).slice(0,8),16);
 const thing=id=>{const result=registry.entries.find(t=>t.source.moduleId===id&&t.variantKind==='destination');if(!result)throw Error('Missing Location '+id);return result;};
 const start=thing(seed%2?'tidal-observatory':'solar-reliquary');
 const destinations=['resonance-vault','lumen-arcade','tidal-observatory','solar-reliquary'];
 const middle=thing(destinations[seed%destinations.length]),end=thing(destinations[(seed+1)%destinations.length]);
 const passages=['fractal-loom','silken-current'].map(id=>registry.entries.find(t=>t.source.moduleId===id&&t.capabilities.bridge));
 if(passages.some(p=>!p))throw Error('Missing qualified painted passage.');
 let journey=newJourneyDraft({songId:project.song_id,title:`${project.song_title} · Living Light album tour`,durationUs,thing:start,mode:'tour',seed},registry);
 journey=editJourneyDraft(journey,{type:'add',thingRef:ref(middle),bridgeRef:ref(passages[seed%2])},registry);
 journey=editJourneyDraft(journey,{type:'add',thingRef:ref(end),bridgeRef:ref(passages[(seed+1)%2])},registry);
 const boundaries=[...new Set((project.timeline||[]).map(s=>Math.round(Number(s.start_sec)*1e6)).filter(Number.isSafeInteger))];
 const nearest=(fraction,min,max)=>boundaries.filter(t=>t>=min&&t<=max).sort((a,b)=>Math.abs(a-durationUs*fraction)-Math.abs(b-durationUs*fraction))[0]??Math.round(durationUs*fraction);
 const a=nearest(.32,10000000,durationUs*.43),b=nearest(.7,a+12000000,durationUs-10000000);
 const edges=[0,a,a+8000000,b,b+8000000,durationUs];
 journey.schedule=journey.schedule.map((row,i)=>({...row,startUs:edges[i],endUs:edges[i+1]}));
 const media=livingLightCutMedia(project),first=media[0],second=media.find(m=>m.ref.mediaId!==first?.ref.mediaId)||first;
 const painted=[journey.instances[0],journey.instances[1]];
 journey.mediaSlots=painted.flatMap((instance,i)=>{
  const source=[first,second][i],surface=livingLightMediaSurfaces(registry.resolveThing(instance.thingRef))[0];
  return source&&surface?[{schemaVersion:'hapa.living-light.media-placement.v1',enabled:true,surfaceRef:{instanceId:instance.instanceId,surfaceId:surface},mediaRef:source.ref,trim:{inUs:0,outUs:null},loopPolicy:'loop',brightness:1}]:[];
 });
 // Keep the established cut visible between six modular native uses.
 const dwell=journey.schedule.filter((_,i)=>i%2===0);
 const scene=(row,at,end)=>({role:'scene',startUs:at,endUs:end,journeyStartUs:at});
 const windows=[scene(dwell[0],0,Math.min(10000000,a)),
  {role:'transition',startUs:a,endUs:a+8000000,journeyStartUs:a},
  scene(dwell[1],a+8000000,Math.min(a+18000000,b)),
  {role:'transition',startUs:b,endUs:b+8000000,journeyStartUs:b},
  scene(dwell[2],b+8000000,Math.min(b+18000000,durationUs))];
 if(durationUs-b>28000000)windows.push(scene(dwell[2],durationUs-8000000,durationUs));
 return {existing:false,journey,windows,editorialBasis:'Existing shot boundaries nearest 32% and 70%; authored 8-second passages; no inferred beats or new analysis',paintedSources:journey.mediaSlots.length};
}

export function buildLivingLightAlbumVariant({base,parent,project,plan,journey,createdAt,musicResponse=false}){
 const id=musicResponse?MUSIC_PASS_ID:ALBUM_PASS_ID;
 const cues=plan.existing?structuredClone(plan.cues):plan.windows.map((window,i)=>({schemaVersion:'hapa.echo.living-light-cue.v1',cueId:`ll-cue:album-${i+1}`,role:window.role,songId:project.song_id,journeyRef:{journeyId:journey.journeyId,revisionId:journey.revisionId},sourceBindingRef:null,window:{startUs:window.startUs,endUs:window.endUs},journeyWindow:{startUs:window.journeyStartUs,endUs:window.journeyStartUs+window.endUs-window.startUs},clock:'echo-song',mapping:'offset-1x',outputProfile:'project',locks:{timing:false,journey:false}}));
 validateEchoLivingLightCues(cues,{songId:project.song_id,durationUs:Math.round(project.duration*1e6)});
 const patch={...pickEchoDirectionVariantProjectPatch(project),living_light_cues:cues};
 const variant={schemaVersion:'hapa.echo.direction-script-variant.v1',id,title:'Living Light · Album Pass',status:'ready',createdAt,updatedAt:createdAt,selectionMode:'living-light-album-director',variationSet:{id:'living-light-album',label:'Living Light'},cut:{ordinal:1,label:'Album Pass',kind:'agent-director'},timeline:structuredClone(project.timeline),visualizer_timeline:structuredClone(project.visualizer_timeline||[]),project_patch:patch,director_show_graph:structuredClone(project.director_show_graph),parent:{songId:project.song_id,variantId:parent.id,variantFingerprint:echoDirectionVariantFingerprint(parent),immutableParent:true},lineage:{kind:'append-only-living-light-album-pass',parentVariantId:parent.id,nonDestructive:true},sourcePolicy:{...(parent.sourcePolicy||{}),livingLight:{motion:plan.existing?'preserved-existing-cues':'authored-neutral',timingBasis:plan.editorialBasis||'preserved-existing-cues',analysisCalls:0,renderCalls:0}},hyperframe_script:''};
 if(musicResponse){variant.title='Living Light · Music Response';variant.cut={ordinal:2,label:'Music Response',kind:'agent-director'};variant.lineage.kind='append-only-living-light-music-response';variant.sourcePolicy.livingLight={motion:'exact-source-native-articulation',timingBasis:'qualified visual-envelope maps; explicit master fallback; no certified beats',analysisCalls:0,renderCalls:0,coverage:structuredClone(plan.coverage)};}
 variant.fingerprint=echoDirectionVariantFingerprint(variant);
 const projected=deriveEchoDirectionVariantProject(base,variant);
 if(!plan.existing)validateEchoLivingLightSavedReferences(projected,()=>({journey}));
 return {variant,projected};
}

/** Preserve placements/media and fork only unlocked recipes. The owning script
 * saves these drafts and replaces their temporary cue references with exact
 * returned revisions. Source validation happens before any authoring write. */
export function planLivingLightMusicResponse({project,registry,resolveJourney,performance,playbackReceipt}){
 if(!livingLightTimelineWithinSource(Math.round(playbackReceipt?.durationSeconds*1e6),Math.round(project.duration*1e6),playbackReceipt?.sampleRate))throw Error('Director timeline exceeds prepared playback; review the source timeline before authoring.');
 const songId=project.song_id,sourceBinding=livingLightPreparedBinding({songId,performance,playbackReceipt});
 const bank=createLivingLightFeatureBank({songId,performance,playbackReceipt,sourceBinding});bank.dispose();
 const bindingRef={bindingId:sourceBinding.bindingId,revisionId:sourceBinding.revisionId},response=suggestLivingLightMusicResponse(performance);
 const original=planLivingLightAlbumSong(project,registry),drafts=[],byRef=new Map(),preserved=[];
 let cues;
 if(original.existing){
  validateEchoLivingLightSavedReferences(project,ref=>resolveJourney(ref));
  cues=structuredClone(original.cues);
  for(const cue of cues){
   const key=JSON.stringify(cue.journeyRef),record=resolveJourney(cue.journeyRef),source=record.journey||record;
   if(cue.locks.journey||source.instances.some(i=>i.locked)){preserved.push(cue.cueId);continue;}
   if(!byRef.has(key)){const draft=editableJourney(source);draft.title=(draft.title+' · Music Response').slice(0,160);draft.sourceBindingRef=bindingRef;draft.instances.forEach(i=>i.musicResponse=structuredClone(response));const item={key:'response-'+drafts.length,lineage:structuredClone(cue.journeyRef),journey:draft};drafts.push(item);byRef.set(key,item);}
   const item=byRef.get(key);cue.journeyRef={journeyId:item.key,revisionId:'planned'};cue.sourceBindingRef=bindingRef;
  }
 }else{
  const draft=original.journey;draft.sourceBindingRef=bindingRef;draft.instances.forEach(i=>i.musicResponse=structuredClone(response));
  drafts.push({key:'response-0',lineage:null,journey:draft});
  cues=original.windows.map((window,i)=>({schemaVersion:'hapa.echo.living-light-cue.v1',cueId:'ll-cue:music-'+(i+1),role:window.role,songId,journeyRef:{journeyId:'response-0',revisionId:'planned'},sourceBindingRef:bindingRef,window:{startUs:window.startUs,endUs:window.endUs},journeyWindow:{startUs:window.journeyStartUs,endUs:window.journeyStartUs+window.endUs-window.startUs},clock:'echo-song',mapping:'offset-1x',outputProfile:'project',locks:{timing:false,journey:false}}));
 }
 validateEchoLivingLightCues(cues,{songId,durationUs:Math.round(project.duration*1e6)});
 const coverage=cues.map(cue=>{
  if(preserved.includes(cue.cueId))return {cueId:cue.cueId,status:'preserved-locked-choice',responseVerified:false};
  const roles=Object.entries(response.roles).map(([role,binding])=>{
   const stem=sourceBinding.stems.find(s=>s.assetId===binding.sourceRefs[0].assetId),mappedUs=(stem?.timeMap||[]).reduce((n,m)=>n+Math.max(0,Math.min(cue.window.endUs,m.songEndUs)-Math.max(cue.window.startUs,m.songStartUs)),0);
   return {role,sourceRefs:binding.sourceRefs,qualifiedStemUs:mappedUs,masterResponseUs:cue.window.endUs-cue.window.startUs-mappedUs};
  });
  return {cueId:cue.cueId,status:'source-bound-response',preset:response.preset,window:cue.window,journeyWindow:cue.journeyWindow,clock:'echo-song / offset-1x',roles,qualifiedStemRoles:roles.filter(r=>r.qualifiedStemUs>0).map(r=>r.role),masterFallbackExplicit:true};
 });
 return {existing:true,cues,drafts,coverage,performanceFingerprint:performance.fingerprint,playbackReceipt:structuredClone(playbackReceipt),bindingRef,editorialBasis:'Preserved existing placements; exact source-bound movement proposal',paintedSources:drafts.reduce((n,d)=>n+d.journey.mediaSlots.filter(s=>s.enabled).length,0)};
}

export function resolveLivingLightMusicPlan(plan,saved){
 const result=structuredClone(plan);result.cues=result.cues.map(cue=>{
  const journey=saved.get(cue.journeyRef.journeyId);return journey?{...cue,journeyRef:{journeyId:journey.journeyId,revisionId:journey.revisionId},sourceBindingRef:structuredClone(journey.sourceBindingRef)}:cue;
 });return result;
}
