// Fixed-step Campfire frame source for a future Echo export adapter. It owns a
// separate GPU device/stage and never touches the interactive player's state.
// It does not encode, mux, save, publish, or claim full-song acceptance.
import { createScoreChoreography } from './score-choreography.js';
import { initGPU } from '../gpu.js';
import { FireSim } from '../sim.js';
import { Renderer } from '../renderer.js';
import { Sparks } from '../sparks.js';
import { makeNoiseTexture, makeCurlTexture } from '../noise.js';
import { buildCampfire, packLogs, packStones } from '../scene.js';
import { FireDust } from './fire-dust.js';
import { prepareEchoScorePlayback } from './vendor/echo-visual-score.js';
import { createScoreDustPerformance } from './vendor/echo-score-dust-performance.js';
import { readSavedCampfireDirection } from './saved-campfire-direction.js';
import { createThirstyCampfireDirection } from './thirsty-campfire-direction.js';
import { withReadablePhraseLead } from './stage-lyric-playback.js';
import { createSongExposure } from './song-exposure.js';
import { directedCamera, directedYaw, createPhraseTargets, createSongStageLighting } from './stage-presentation.js';
import { CampfireStageCheckpoint, serializeStageCheckpoint, importStageCheckpoint } from './stage-checkpoint.js';
import { preparePictureTargets } from './picture-targets.js';
import { prepareCampfireSongStart } from './song-start.js';

export async function createOfflineCampfireStage({packet,spectrum,width,height,fps=30,key,reducedMotion=false,includeCaptions=true,requirePictureDigest=true,signal=null}={}) {
  signal?.throwIfAborted();
  if(!packet?.score?.fingerprint||!packet.timeline?.source?.sourceSha256||spectrum?.masterSha256!==packet.timeline.source.sourceSha256)throw Error('Score, spectrum and exact master identity are required.');
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>3840||height>2160||![24,30,60].includes(fps)||typeof key!=='string'||!key)throw Error('A bounded size, supported frame rate and reproducibility key are required.');
  const saved=readSavedCampfireDirection(packet);
  if(saved.status==='invalid')throw Error(saved.error);
  const base=saved.status==='saved'?saved.direction:createThirstyCampfireDirection(packet);
  const stage=base?createScoreChoreography(packet,base):null;
  if(!stage)throw Error('A compatible Campfire direction is required for export.');
  const frameCount=Math.ceil(packet.timeline.durationSeconds*fps),canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('webgpu');
  if(!ctx)throw Error('Offscreen WebGPU is unavailable.');
  const {device}=await initGPU();
  let closed=false,deviceDestroyed=false,phraseTargets,pictures;
  const close=()=>{closed=true;phraseTargets?.clear();pictures?.clear();signal?.removeEventListener('abort',close);if(!deviceDestroyed){deviceDestroyed=true;device.destroy();}};
  const assertOpen=()=>{if(closed||signal?.aborted)throw Error('Offline Campfire stage is closed.');};
  signal?.addEventListener('abort',close,{once:true});
  try {
    if(signal?.aborted)close();assertOpen();
    const format=navigator.gpu.getPreferredCanvasFormat();ctx.configure({device,format,alphaMode:'opaque'});
    const scene=buildCampfire(7),logs=packLogs(scene.logs),noise=makeNoiseTexture(device,128,1),curl=makeCurlTexture(device,noise,128);
    const sim=new FireSim(device,{res:[64,96,64],size:[1.2,1.8,1.2],logs,noiseTex:noise,curlTex:curl,vcycles:1});
    const renderer=new Renderer(device,{sim,scene,noiseTex:noise,curlTex:curl,logsF32:logs,stonesF32:packStones(scene.stones),format});
    Object.assign(renderer.params,{stepMul:1,exposure:8.5,bloomK:.045,smokeScat:.14,grain:.008,vignette:.55,moon:.55,sootEmit:6.5});renderer.surfScale=.6;renderer.resize(width,height,.5);
    const sparks=new Sparks(device,{count:4096,stableSpawn:true,sim,renderer,curlTex:curl});
    const playback=prepareEchoScorePlayback(packet.score,packet.timeline,{pulse:packet.playSettings.pulse});
    const bandOut=new Float32Array(32),bandsAt=t=>{const x=Math.max(0,Math.min(spectrum.frames.length-1,t/spectrum.hopSeconds)),i=Math.floor(x),a=spectrum.frames[i],b=spectrum.frames[Math.min(i+1,spectrum.frames.length-1)];for(let k=0;k<32;k++)bandOut[k]=a[k]+(b[k]-a[k])*(x-i);return bandOut;};
    const swarm=new FireDust({device,sim,renderer,sparks,playback,sampleBands:bandsAt,count:12000,seed:packet.playSettings.seed,reduced:reducedMotion});swarm.stageDirectionAt=stage.at;
    phraseTargets=createPhraseTargets(packet);pictures=await preparePictureTargets({score:packet.score,count:12000,seed:packet.playSettings.seed,phraseTargets,requireDigest:requirePictureDigest,signal});assertOpen();
    const visualPlayback=withReadablePhraseLead(playback,0.94,stage,packet.lyricLines);swarm.visualStateAt=t=>visualPlayback.stateAt(t);
    const performance=createScoreDustPerformance({playback:visualPlayback,settings:{...packet.playSettings,reducedMotion},count:12000,phraseTargets,targetsFor:pictures.targetsFor,createSwarm:()=>swarm});
    swarm.presentationAt=(t,state)=>({yaw:directedYaw(performance,t,state,swarm),palette:performance.style(t,state).palette,style:performance.style(t,state)});
    await prepareCampfireSongStart({device,sim,swarm,renderer,performance,bandsAt,shouldStop:()=>closed||signal?.aborted});assertOpen();
    const exposureAt=createSongExposure(packet.score.phrases,{normal:8.5,reading:7.8,tauSeconds:.7}),stageLightingAt=createSongStageLighting(packet.score.cues,stage),composite=new OffscreenCanvas(width,height),g=composite.getContext('2d',{alpha:false});
    let nextFrame=0,busy=false;
    const assertIdle=()=>{if(closed||busy)throw Error('Offline Campfire stage is closed or busy.');};
    return {
      frameCount,fps,width,height,key,pictureWarnings:pictures.warnings,
      async renderFrame(index){
        assertIdle();if(!Number.isSafeInteger(index)||index!==nextFrame||index>=frameCount)throw Error('Frames must be rendered sequentially in the declared range.');busy=true;
        try{
          const t=index/fps,state=playback.stateAt(t);performance.advanceTo(t,{bandsAt});
          renderer.setCamera(directedCamera(performance,swarm,stage,t,state,width/height));renderer.params.smokeScat=.04+.16*(stage.at(t).smoke??1);renderer.params.exposure=exposureAt(t);
          Object.assign(renderer.params,stageLightingAt(t));
          renderer.uploadParams(t,Math.floor(t*60),[0,0]);
          const enc=device.createCommandEncoder();renderer.renderHDR(enc);sparks.draw(enc,1/120);swarm.draw(enc);renderer.temporal(enc,.6);renderer.bloom(enc,true);renderer.final(enc,ctx.getCurrentTexture().createView(),format,true);device.queue.submit([enc.finish()]);await device.queue.onSubmittedWorkDone();
          assertOpen();
          g.drawImage(canvas,0,0);const line=packet.lyricLines?.find(l=>t>=l.start&&t<l.end),particleReading=state.phrase&&!state.phrase.burst;
          if(includeCaptions&&line&&!particleReading){const fontSize=Math.max(15,Math.min(34,width*.018)),text=line.text;g.font=`500 ${fontSize}px system-ui,sans-serif`;g.textAlign='center';g.textBaseline='middle';const box=Math.min(width*.8,g.measureText(text).width+28),y=height*.82;g.fillStyle='rgba(3,6,12,.78)';g.fillRect((width-box)/2,y-fontSize*.8,box,fontSize*1.6);g.fillStyle='#fff';g.fillText(text,width/2,y,box-24);}
          nextFrame++;return {canvas:composite,index,timeSeconds:t};
        }finally{busy=false;}
      },
      async checkpoint(){assertIdle();busy=true;let snapshot;try{snapshot=await CampfireStageCheckpoint.capture({device,sim,swarm,sparks,renderer,performance,key});assertOpen();return {nextFrame,stage:snapshot};}catch(error){snapshot?.destroy();throw error;}finally{busy=false;}},
      async checkpointPayload(){assertIdle();busy=true;let snapshot;try{snapshot=await CampfireStageCheckpoint.capture({device,sim,swarm,sparks,renderer,performance,key});assertOpen();const payload=await serializeStageCheckpoint(snapshot);assertOpen();return {nextFrame,payload};}finally{snapshot?.destroy();busy=false;}},
      async restorePayload(saved){assertIdle();const n=saved?.nextFrame,step=n===0?0:Math.floor(((n-1)/fps)*60+1e-6);
        if(!Number.isSafeInteger(n)||n<0||n>frameCount||saved?.payload?.metadata?.control?.simulated!==step)throw Error('Invalid serialized checkpoint frame or score time.');
        busy=true;let snapshot;try{snapshot=await importStageCheckpoint({payload:saved.payload,device,sim,swarm,sparks,renderer,performance,key});assertOpen();await snapshot.restore({device,sim,swarm,sparks,renderer,performance,key});assertOpen();nextFrame=n;}finally{snapshot?.destroy();busy=false;}
      },
      async restore(savedCheckpoint){assertIdle();
        const n=savedCheckpoint?.nextFrame,step=n===0?0:Math.floor(((n-1)/fps)*60+1e-6);
        if(!Number.isSafeInteger(n)||n<0||n>frameCount||savedCheckpoint?.stage?.control?.simulated!==step)throw Error('Invalid offline checkpoint frame or score time.');
        busy=true;try{await savedCheckpoint.stage.restore({device,sim,swarm,sparks,renderer,performance,key});assertOpen();nextFrame=n;}finally{busy=false;}
      },
      get position(){return nextFrame;},
      get constructionNotice(){return swarm.constructionNotice||null;},
      close,
    };
  } catch(error){close();throw error;}
}
