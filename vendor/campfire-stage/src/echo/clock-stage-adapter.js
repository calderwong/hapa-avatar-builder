// Echo owns audio and transport; this adapter owns one offscreen GPU stage.
// Replacement waits for bounded initialization and cleanup, never two live stages.
import {createOfflineCampfireStage} from './offline-stage.js';
export const CLOCK_STAGE_LIMITS=Object.freeze({initializationMilliseconds:10000,closeMilliseconds:5000});
function bounded(work,milliseconds,message){let timer;return Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(message)),milliseconds);})]).finally(()=>clearTimeout(timer));}
export async function createCampfireClockAdapter({packet,spectrum,width,height,fps=30,key,canvas,reducedMotion=false,onStatus=()=>{},createStage=createOfflineCampfireStage}={}){
 if(!canvas?.getContext||typeof onStatus!=='function')throw Error('A preview canvas and status callback are required.');
 canvas.width=width;canvas.height=height;const context=canvas.getContext('2d',{alpha:false});if(!context)throw Error('Preview canvas is unavailable.');
 const aborter=new AbortController(),initializing=Promise.resolve().then(()=>createStage({packet,spectrum,width,height,fps,key,reducedMotion,includeCaptions:false,requirePictureDigest:false,signal:aborter.signal}));
 let stage;
 try{stage=await bounded(initializing,CLOCK_STAGE_LIMITS.initializationMilliseconds,'Campfire initialization timed out. Reload the preview before trying again.');}
 catch(error){aborter.abort(error);void initializing.then(late=>late.close()).catch(()=>{});throw error;}
 let closed=false,active=null,closing=null,cleanupSettled=false,requested=0,lastFrame=-1,failure=null;const checkpoints=[];
 const pendingInitial=Promise.resolve().then(()=>stage.checkpoint());let initial;
 try{initial=await bounded(pendingInitial,CLOCK_STAGE_LIMITS.initializationMilliseconds,'Campfire initial state timed out. Reload the preview before trying again.');}
 catch(error){
  aborter.abort(error);void pendingInitial.then(late=>late.stage.destroy()).catch(()=>{});
  try{await bounded(Promise.resolve().then(()=>stage.close()),CLOCK_STAGE_LIMITS.closeMilliseconds,'Campfire failed initialization and cleanup timed out. Reload before replacing it.');}
  catch(cleanupError){throw cleanupError;}
  throw error;
 }
 checkpoints.push(initial);
 function targetAt(seconds){if(!Number.isFinite(seconds)||seconds<0)throw Error('A nonnegative song time is required.');return Math.min(stage.frameCount-1,Math.max(0,Math.floor(seconds*fps)));}
 function state(status,extra={}){onStatus({status,requestedFrame:requested,presentedFrame:lastFrame,frameCount:stage.frameCount,pictureWarnings:stage.pictureWarnings||[],constructionNotice:stage.constructionNotice||null,...extra});}
 async function service(){
  try{
   while(!closed){
    const goal=requested;
    if(goal===lastFrame&&stage.position===goal+1){state('ready');break;}
    if(stage.position>goal){const suitable=checkpoints.filter(c=>c.nextFrame<=goal).sort((a,b)=>b.nextFrame-a.nextFrame)[0]||initial;await stage.restore(suitable);lastFrame=-1;if(closed)break;}
    state('catching-up');let batch=0,latest=null;
    while(!closed&&stage.position<=goal&&batch<30){
     const index=stage.position,frame=await stage.renderFrame(index);if(closed)break;latest=frame;
     if(stage.position%300===0&&!checkpoints.some(c=>c.nextFrame===stage.position)){
      while(checkpoints.length>=3){const old=checkpoints.splice(1,1)[0];old.stage.destroy();}
      const checkpoint=await stage.checkpoint();if(closed){checkpoint.stage.destroy();break;}checkpoints.push(checkpoint);
     }
     batch++;if(requested!==goal)break;
    }
    if(closed)break;
    if(latest){context.drawImage(latest.canvas,0,0,width,height);lastFrame=latest.index;}
    if(requested!==goal)continue;
    if(stage.position>goal&&lastFrame===goal){state('ready');break;}
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }catch(error){if(!closed){failure=error;state('error',{message:error.message});}throw error;}
  finally{active=null;}
 }
 return {
  get status(){return {requestedFrame:requested,presentedFrame:lastFrame,busy:!!active,closed,closing:!!closing&&!cleanupSettled};},
  request(seconds){if(closed)throw Error('Campfire preview is closed.');if(failure)throw failure;requested=targetAt(seconds);if(!active)active=Promise.resolve().then(service);return active;},
  close(){
   if(closing)return closing;closed=true;const inflight=active;
   closing=Promise.resolve().then(async()=>{
    let cleanupError=null,release;
    try{release=Promise.resolve(stage.close());}catch(error){cleanupError=error;release=Promise.resolve();}
    aborter.abort(Error('Campfire preview closed.'));
    try{const outcomes=await bounded(Promise.allSettled([inflight,release]),CLOCK_STAGE_LIMITS.closeMilliseconds,'Campfire cleanup timed out. Reload before replacing this stage.');if(outcomes[1].status==='rejected')cleanupError=outcomes[1].reason;}
    catch(error){cleanupError=error;}
    finally{for(const checkpoint of checkpoints.splice(0))try{checkpoint.stage.destroy();}catch(error){cleanupError??=error;}}
    if(cleanupError){state('error',{message:cleanupError.message});throw cleanupError;}
    state('closed');
   }).finally(()=>{cleanupSettled=true;});return closing;
  },
 };
}
