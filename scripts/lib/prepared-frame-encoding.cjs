'use strict';
const path=require('node:path');
function encodingPlan(show,root,output){
  const {width,height}=show.outputProfile||{},fps=show.fps,duration=show.duration;
  if(!Number.isInteger(fps)||fps<1||fps>120||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=3840&&n%2===0)||!Number.isFinite(duration)||duration<=0||duration>1800)throw Error('Invalid prepared output timeline or profile');
  const audio=show.packaging?.audio;
  if(!audio||!/^assets\/audio\/[a-zA-Z0-9_.-]+$/.test(audio.uri)||!/^sha256:[a-f0-9]{64}$/.test(audio.sha256))throw Error('Prepared encoding requires one packaged master soundtrack');
  if(show.livingLight?.captureRoute!=='hapa-prepared-electron-v1'||show.livingLight.requiresPreparedFrames!==true)throw Error('Use the prepared encoder only for a declared Living Light composite');
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
  if(receipt?.frameIndex!==index||receipt.showHash!==show.showHash||receipt.snapshotDigest!==show.livingLight.snapshotDigest||receipt.livingLight?.frameIndex!==index||receipt.livingLight.songUs!==Math.round(index*1e6/show.fps))throw Error('Prepared frame receipt differs from the requested cut/frame');
  const cue=show.livingLight.cues.find(c=>receipt.livingLight.songUs>=c.window.startUs&&receipt.livingLight.songUs<c.window.endUs);
  if(receipt.livingLight.active!==!!cue||cue&&receipt.livingLight.cue?.cueId!==cue.cueId)throw Error('Prepared frame has the wrong Living Light cue');
}
function checkPreparedSoundtrack(snapshot,audio){
  if(!snapshot.preparedSource)return;
  const receipt=snapshot.preparedSource.playbackReceipt;
  const hash=String(audio.sha256||'').replace(/^sha256:/,'');
  if(![receipt?.sourceHash,receipt?.sha256].filter(Boolean).map(v=>String(v).replace(/^sha256:/,'')).includes(hash))throw Error('Prepared Living Light signals differ from the packaged soundtrack bytes');
}
module.exports={encodingPlan,encoderEnvironment,checkFrameReceipt,checkPreparedSoundtrack};

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
 if(!show.livingLight)return timestamps;
 const count=Math.ceil(show.duration*show.fps),indices=new Set(timestamps.map(t=>Math.min(count-1,Math.max(0,Math.floor(t*show.fps+1e-8)))));
 for(const cue of show.livingLight.cues){
  const first=Math.ceil(cue.window.startUs*show.fps/1e6),last=Math.min(count-1,Math.ceil(cue.window.endUs*show.fps/1e6)-1);
  if(first>last)continue;
  for(const i of [first-1,first,Math.floor((first+last)/2),last,last+1])if(i>=0&&i<count)indices.add(i);
 }
 return [...indices].sort((a,b)=>a-b).map(i=>i/show.fps);
}
module.exports.preparedPixelTimestamps=preparedPixelTimestamps;
