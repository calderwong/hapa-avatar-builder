'use strict';
const path=require('node:path');
// Living Light and Score Dust layers each declare that they need browser-decoded frames.
function preparedComposites(show){
  return [show.livingLight,show.scoreDust].filter(row=>row&&row.captureRoute==='hapa-prepared-electron-v1'&&row.requiresPreparedFrames===true);
}
function encodingPlan(show,root,output){
  const {width,height}=show.outputProfile||{},fps=show.fps,duration=show.duration;
  if(!Number.isInteger(fps)||fps<1||fps>120||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=3840&&n%2===0)||!Number.isFinite(duration)||duration<=0||duration>1800)throw Error('Invalid prepared output timeline or profile');
  const audio=show.packaging?.audio;
  if(!audio||!/^assets\/audio\/[a-zA-Z0-9_.-]+$/.test(audio.uri)||!/^sha256:[a-f0-9]{64}$/.test(audio.sha256))throw Error('Prepared encoding requires one packaged master soundtrack');
  if(!preparedComposites(show).length)throw Error('Use the prepared encoder only for a declared Living Light or Score Dust composite');
  return {width,height,fps,duration,frameCount:Math.ceil(duration*fps),audio,
    args:['-hide_banner','-loglevel','error','-nostdin','-n','-threads','2','-f','image2pipe','-framerate',String(fps),'-vcodec','png','-i','pipe:0',
      '-i',path.join(root,audio.uri),'-map','0:v:0','-map','1:a:0','-frames:v',String(Math.ceil(duration*fps)),'-t',String(duration),
      '-c:v','libx264','-threads','2','-preset','fast','-crf','18','-pix_fmt','yuv420p','-c:a','aac','-ar','48000','-ac','2',
      '-map_metadata','-1','-map_chapters','-1','-movflags','+faststart',path.join(output,'cut.mp4')]};
}
function encoderEnvironment(parent){
  const env={...parent,HAPA_PREPARED_ENCODER_WORKER:'1'};
  delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
  return env;
}
function checkFrameReceipt(receipt,index,show){
  const songUs=Math.round(index*1e6/show.fps);
  if(receipt?.frameIndex!==index||receipt.showHash!==show.showHash)throw Error('Prepared frame receipt differs from the requested cut/frame');
  if(show.livingLight){
    if(receipt.snapshotDigest!==show.livingLight.snapshotDigest||receipt.livingLight?.frameIndex!==index||receipt.livingLight.songUs!==songUs)throw Error('Prepared frame receipt differs from the requested cut/frame');
    const cue=show.livingLight.cues.find(c=>receipt.livingLight.songUs>=c.window.startUs&&receipt.livingLight.songUs<c.window.endUs);
    if(receipt.livingLight.active!==!!cue||cue&&receipt.livingLight.cue?.cueId!==cue.cueId)throw Error('Prepared frame has the wrong Living Light cue');
  }
  if(show.scoreDust){
    const window=show.scoreDust.layer.window,active=songUs>=window.startUs&&songUs<window.endUs;
    if(receipt.scoreDust?.frameIndex!==index||receipt.scoreDust.songUs!==songUs)throw Error('Prepared frame receipt differs from the requested cut/frame');
    if(receipt.scoreDust.active!==active||active&&receipt.scoreDust.painted!==true)throw Error('Prepared frame has the wrong Score Dust layer state');
  }
}
function checkPreparedSoundtrack(snapshot,audio){
  if(!snapshot.preparedSource)return;
  const receipt=snapshot.preparedSource.playbackReceipt;
  const hash=String(audio.sha256||'').replace(/^sha256:/,'');
  if(![receipt?.sourceHash,receipt?.sha256].filter(Boolean).map(v=>String(v).replace(/^sha256:/,'')).includes(hash))throw Error('Prepared Living Light signals differ from the packaged soundtrack bytes');
}
module.exports={preparedComposites,encodingPlan,encoderEnvironment,checkFrameReceipt,checkPreparedSoundtrack};

function captureInvocation({executable,root,project,output,parentEnv}){
  if(![executable,root,project,output].every(path.isAbsolute))throw Error('Prepared capture paths must be absolute');
  const env={...parentEnv,HAPA_PREPARED_CAPTURE_WORKER:'1'};delete env.NODE_OPTIONS;delete env.ELECTRON_RUN_AS_NODE;
  return {executable,args:[path.join(root,'scripts/render-hyperframes-prepared.cjs'),'--project='+project,'--output='+output],options:{cwd:root,env,shell:false,detached:true,stdio:'inherit'}};
}
module.exports.captureInvocation=captureInvocation;

function assertLegacyCaptureRoute(args,cwd){
 if(args[0]!=='render')return;
 const fs=require('node:fs');
 for(const candidate of [cwd,...args.slice(1).filter(arg=>!arg.startsWith('-')).map(arg=>path.resolve(cwd,arg))]){
  const file=path.join(candidate,'executable-show.json');let show;
  try{show=JSON.parse(fs.readFileSync(file,'utf8'));}catch(error){if(['ENOENT','ENOTDIR'].includes(error.code))continue;throw error;}
  if(show.livingLight?.requiresPreparedFrames)throw Error('This Living Light package requires scripts/run-prepared-render.mjs; upstream capture does not await its native frames');
  if(show.scoreDust?.requiresPreparedFrames)throw Error('This Score Dust layer package requires scripts/run-prepared-render.mjs; upstream capture replaces its alpha video with opaque stills');
 }
}
module.exports.assertLegacyCaptureRoute=assertLegacyCaptureRoute;

function createCaptureCancellation({killGroup,setTimer=setTimeout,clearTimer=clearTimeout}){
 let reason=null,forceTimer=null;
 return {get reason(){return reason;},cancel(message){
  if(reason)return;reason=message;killGroup('SIGTERM');
  // Arm force termination now, not after waiting for the child to exit.
  forceTimer=setTimer(()=>killGroup('SIGKILL'),3000);
 },dispose(){if(forceTimer!==null)clearTimer(forceTimer);forceTimer=null;}};
}
module.exports.createCaptureCancellation=createCaptureCancellation;

function preparedPixelTimestamps(show,timestamps){
 if(!show.livingLight&&!show.scoreDust)return timestamps;
 const count=Math.ceil(show.duration*show.fps),indices=new Set(timestamps.map(t=>Math.min(count-1,Math.max(0,Math.floor(t*show.fps+1e-8)))));
 for(const cue of [...(show.livingLight?.cues||[]),...(show.scoreDust?[show.scoreDust.layer]:[])]){
  const first=Math.ceil(cue.window.startUs*show.fps/1e6),last=Math.min(count-1,Math.ceil(cue.window.endUs*show.fps/1e6)-1);
  if(first>last)continue;
  for(const i of [first-1,first,Math.floor((first+last)/2),last,last+1])if(i>=0&&i<count)indices.add(i);
 }
 return [...indices].sort((a,b)=>a-b).map(i=>i/show.fps);
}
module.exports.preparedPixelTimestamps=preparedPixelTimestamps;

// Frame-addressed macOS seeks can fail in VideoToolbox on valid H.264 sources.
// Use the browser software video decoder for prepared offline capture and QA;
// GPU composition, shaders and native Living Light remain enabled.
function configurePreparedVideoDecode(app,{platform=process.platform,prepared=true}={}){
 const software=prepared&&platform==='darwin';
 if(software){if(app.isReady())throw Error('Prepared video decoding must be configured before Electron is ready');app.commandLine.appendSwitch('disable-accelerated-video-decode');}
 return {videoDecode:software?'software':'platform-default',gpuSceneRendering:'unchanged',scope:'prepared-offline-capture'};
}
module.exports.configurePreparedVideoDecode=configurePreparedVideoDecode;
