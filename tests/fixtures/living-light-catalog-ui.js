import {createLivingLightRegistry} from '../../src/living-light/registry.js';
import {livingLightThingStudy} from '../../src/domain/living-light-stills.js';
import {createLivingLightRuntime} from '../../src/living-light/runtime.js';

// One explicitly initiated, sequential run; no RAF, audio, worker, owner writes,
// retries or production readiness promotion. At most one renderer is owned.
const registry=createLivingLightRegistry(),canvas=document.querySelector('#output');
const select=document.querySelector('#definition'),status=document.querySelector('#status');
const report=document.querySelector('#report'),contact=document.querySelector('#contact');
const one=document.querySelector('#one'),all=document.querySelector('#all');
let running=false,stopped=false,results=[];
for(const thing of registry.entries){const option=document.createElement('option');option.value=thing.thingId;option.textContent=`${thing.variantKind}: ${thing.title}`;select.append(option);}
document.querySelector('#stop').onclick=()=>{stopped=true;status.textContent='Stopping after the current definition; completed evidence will remain.';};
function thumbnail(label){
 const copy=document.createElement('canvas');copy.width=240;copy.height=135;
 try{copy.getContext('2d').drawImage(canvas,0,0,240,135);const image=document.createElement('img');image.src=copy.toDataURL('image/jpeg',.8);image.width=240;image.height=135;image.alt=label;return image;}
 finally{copy.width=copy.height=0;}
}
function pixels(){
 const gl=canvas.getContext('webgl2'),data=new Uint8Array(canvas.width*canvas.height*4);
 gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,data);
 const error=gl.getError();if(error!==gl.NO_ERROR)throw Error(`Native pixel read failed: ${error}`);
 let low=255,high=0,lit=0;
 for(let i=0;i<data.length;i+=4){const light=Math.max(data[i],data[i+1],data[i+2]);low=Math.min(low,light);high=Math.max(high,light);if(light>8)lit++;}
 return {width:canvas.width,height:canvas.height,minChannel:low,maxChannel:high,range:high-low,litFraction:lit/(canvas.width*canvas.height),nonblank:high-low>8&&lit>64};
}
function publish(){report.textContent=JSON.stringify({schemaVersion:'hapa.living-light.catalog-native-proof.v1',state:running?'running':stopped?'stopped':'finished',definitions:registry.entries.length,completed:results.length,allAttempted:results.length===registry.entries.length,allAttemptedPassed:results.length===registry.entries.length&&results.every(r=>r.ok),qualification:'native-paint-and-cleanup-only; visual-review-and-album-acceptance-separate',results},null,2);}
async function run(things){
 if(running)return;running=true;stopped=false;results=[];contact.replaceChildren();one.disabled=all.disabled=select.disabled=true;
 try{
  for(const thing of things){
   if(stopped)break;
   status.textContent=`Checking ${results.length+1}/${things.length}: ${thing.title}`;publish();
   await new Promise(resolve=>setTimeout(resolve,0));
   const reference=livingLightThingStudy({thing,registry,songId:'fixture:catalog-independent',durationUs:20e6});
   const before=JSON.stringify(reference.journey),runtime=createLivingLightRuntime({canvas,registry});
   const record={thingId:thing.thingId,revision:thing.revisionId,source:thing.source,aliasOf:thing.aliasOf,context:reference.context,samples:[],ok:false,error:null};
   const figure=document.createElement('figure');figure.style.margin='0';const caption=document.createElement('figcaption');caption.textContent=thing.title;figure.append(caption);contact.append(figure);
   try{
    runtime.prepare({journeyRevision:reference.journey,sourceBinding:{songId:reference.journey.songId,durationUs:20e6},generation:1,neutralStudy:true});
    // Passage studies use 5–15s travel. Include both endpoints and both native
    // blend phases. Reverse evaluation must retain exact route evidence.
    const times=thing.capabilities.bridge?[0,5e6,6e6,10e6,14.999e6,15e6,20e6]:[0,10e6,20e6];
    const frames=[];
    for(const time of times){const packet=runtime.evaluate({timelineUs:time,viewport:{width:640,height:360}});if(!runtime.render(packet))throw Error('Native frame refused');frames.push(packet.frame);const sample={timeUs:time,frame:packet.frame,nativeScene:runtime.diagnostics().nativeScene,pixels:pixels()};record.samples.push(sample);if(!sample.pixels.nonblank)throw Error(`Blank native frame at ${time}us`);if(time===10e6)figure.append(thumbnail(`${thing.title} at 10 seconds`));}
    for(let i=times.length-1;i>=0;i--){const reverse=runtime.evaluate({timelineUs:times[i]});if(JSON.stringify(reverse.frame)!==JSON.stringify(frames[i]))throw Error(`Reverse route changed at ${times[i]}us`);}
    record.runtime=runtime.diagnostics();record.sourceUnchanged=JSON.stringify(reference.journey)===before;if(!record.sourceUnchanged)throw Error('Fixture recipe changed');record.ok=true;
   }catch(error){record.error=error.message;caption.textContent+=` — ${error.message}`;}
   finally{
    runtime.dispose();record.cleanup=runtime.diagnostics();
    if(record.cleanup.prepared||!record.cleanup.disposed||record.cleanup.canvasCount||record.cleanup.ownedAudioContexts||record.cleanup.ownedAnimationLoops||record.cleanup.media.length){record.ok=false;record.error=(record.error||'')+' Cleanup did not return to baseline.';}
   }
   results.push(record);publish();
  }
 }finally{running=false;one.disabled=all.disabled=select.disabled=false;status.textContent=`${stopped?'Stopped':'Finished'}: ${results.length} attempted, ${results.filter(r=>r.ok).length} native paint/cleanup passes. Visual and album review remain separate.`;publish();}
}
one.onclick=()=>run(registry.entries.filter(t=>t.thingId===select.value));
all.onclick=()=>run(registry.entries);
