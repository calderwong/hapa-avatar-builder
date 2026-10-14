import {createEchoLivingLightOfflineRenderer} from '../../src/living-light/director-offline.js';
import {createLivingLightRegistry} from '../../src/living-light/registry.js';
import {useJourneyPassage} from '../../src/domain/living-light-journey.js';
import {livingLightCutMedia,LIVING_LIGHT_MEDIA_SCHEMA} from '../../src/domain/living-light-media.js';
import {createEchoLivingLightCue} from '../../src/domain/echo-living-light-editor.js';
const registry=createLivingLightRegistry(),ref=thing=>({thingId:thing.thingId,revisionId:thing.revisionId});
const draft=useJourneyPassage(null,{mode:'new',songId:'fixture:song',durationUs:20e6,title:'Offline painted tour',fromRef:ref(registry.entries.find(t=>t.source.moduleId==='solar-reliquary')),toRef:ref(registry.entries.find(t=>t.source.moduleId==='tidal-observatory')),passageRef:ref(registry.entries.find(t=>t.source.moduleId==='media-weave'))},registry).draft;
const sources=livingLightCutMedia({song_id:'fixture:song',active_direction_script_variant:{id:'fixture:cut'},timeline:[{id:'fixture:shot',media_id:'fixture:clip',media_uri:'/media/echo-proxies-v2/ee53fbdd5413889fddfafa1d.mp4'}]});
draft.mediaSlots=[['portal',0],['wall-left',1]].map(([surfaceId,index])=>({schemaVersion:LIVING_LIGHT_MEDIA_SCHEMA,enabled:true,surfaceRef:{instanceId:draft.instances[index].instanceId,surfaceId},mediaRef:sources[0].ref,trim:{inUs:0,outUs:2e6},loopPolicy:'loop',brightness:1}));
const journey={...draft,journeyId:'fixture:journey',revisionId:'fixture:revision',parentRevisionId:null};
const cues=[createEchoLivingLightCue({journey,cueId:'fixture:scene',startUs:2e6,journeyWindow:{startUs:0,endUs:6e6}}),createEchoLivingLightCue({journey,cueId:'fixture:passage',role:'transition',startUs:10e6,journeyWindow:{startUs:6e6,endUs:14e6}})];
const output=document.querySelector('#output'),status=document.querySelector('#status');let renderer;
const hash=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
const make=(width,height)=>createEchoLivingLightOfflineRenderer({width,height,fps:30,songId:'fixture:song',durationUs:24e6,cues,resolveJourney:async()=>journey,resolveRegistry:async()=>registry,resolveMedia:async()=>sources});
document.querySelector('#run').onclick=async()=>{
 document.querySelector('#run').disabled=true;const evidence=[];
 try{
  for(const [width,height]of [[1920,1080],[1080,1920],[1080,1080]]){
   renderer?.dispose();renderer=make(width,height);output.width=width;output.height=height;const context=output.getContext('2d'),frames=[];
   for(const index of [120,390,120,270,390]){
    status.textContent=`Rendering ${width} × ${height}, frame ${index}…`;
    const receipt=await renderer.prepareFrame(index);context.fillStyle='#203040';context.fillRect(0,0,width,height);renderer.paintFrame(index,context);
    const pixels=context.getImageData(0,0,width,height).data;
    frames.push({receipt,sha256:await hash(pixels),colors:new Set(Array.from({length:100},(_,i)=>Array.from(pixels.slice(i*4*997,i*4*997+3)).join(','))).size});
   }
   evidence.push({width,height,frames,repeatMatches:frames[0].sha256===frames[2].sha256&&frames[1].sha256===frames[4].sha256,diagnostics:renderer.diagnostics()});
  }
  renderer.dispose();status.textContent=JSON.stringify({ok:evidence.every(row=>row.repeatMatches&&row.frames.every(f=>!f.receipt.active||f.colors>1)),profiles:evidence,disposed:renderer.diagnostics()},null,2);
 }catch(error){renderer?.dispose();status.textContent=JSON.stringify({ok:false,message:error.message,code:error.code,evidence},null,2);}
 finally{document.querySelector('#run').disabled=false;}
};
document.querySelector('#dispose').onclick=()=>{renderer?.dispose();status.textContent=JSON.stringify({disposed:renderer?.diagnostics()},null,2);};
if(import.meta.hot)import.meta.hot.dispose(()=>renderer?.dispose());
