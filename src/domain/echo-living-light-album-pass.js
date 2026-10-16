import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {newJourneyDraft,editJourneyDraft} from './living-light-journey.js';
import {livingLightCutMedia,livingLightMediaSurfaces} from './living-light-media.js';
import {validateEchoLivingLightCues,validateEchoLivingLightSavedReferences} from './echo-living-light-cues.js';
import {pickEchoDirectionVariantProjectPatch,echoDirectionVariantFingerprint,deriveEchoDirectionVariantProject} from './echo-direction-variants.js';

export const ALBUM_PASS_ID='living-light-album-pass-v1';
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

export function buildLivingLightAlbumVariant({base,parent,project,plan,journey,createdAt}){
 const id=ALBUM_PASS_ID;
 const cues=plan.existing?structuredClone(plan.cues):plan.windows.map((window,i)=>({schemaVersion:'hapa.echo.living-light-cue.v1',cueId:`ll-cue:album-${i+1}`,role:window.role,songId:project.song_id,journeyRef:{journeyId:journey.journeyId,revisionId:journey.revisionId},sourceBindingRef:null,window:{startUs:window.startUs,endUs:window.endUs},journeyWindow:{startUs:window.journeyStartUs,endUs:window.journeyStartUs+window.endUs-window.startUs},clock:'echo-song',mapping:'offset-1x',outputProfile:'project',locks:{timing:false,journey:false}}));
 validateEchoLivingLightCues(cues,{songId:project.song_id,durationUs:Math.round(project.duration*1e6)});
 const patch={...pickEchoDirectionVariantProjectPatch(project),living_light_cues:cues};
 const variant={schemaVersion:'hapa.echo.direction-script-variant.v1',id,title:'Living Light · Album Pass',status:'ready',createdAt,updatedAt:createdAt,selectionMode:'living-light-album-director',variationSet:{id:'living-light-album',label:'Living Light'},cut:{ordinal:1,label:'Album Pass',kind:'agent-director'},timeline:structuredClone(project.timeline),visualizer_timeline:structuredClone(project.visualizer_timeline||[]),project_patch:patch,director_show_graph:structuredClone(project.director_show_graph),parent:{songId:project.song_id,variantId:parent.id,variantFingerprint:echoDirectionVariantFingerprint(parent),immutableParent:true},lineage:{kind:'append-only-living-light-album-pass',parentVariantId:parent.id,nonDestructive:true},sourcePolicy:{...(parent.sourcePolicy||{}),livingLight:{motion:plan.existing?'preserved-existing-cues':'authored-neutral',timingBasis:plan.editorialBasis||'preserved-existing-cues',analysisCalls:0,renderCalls:0}},hyperframe_script:''};
 variant.fingerprint=echoDirectionVariantFingerprint(variant);
 const projected=deriveEchoDirectionVariantProject(base,variant);
 if(!plan.existing)validateEchoLivingLightSavedReferences(projected,()=>({journey}));
 return {variant,projected};
}
