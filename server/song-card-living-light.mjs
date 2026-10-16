import fs from 'node:fs/promises';
import path from 'node:path';
import {echoProjectLivingLightCues} from '../src/domain/echo-living-light-cues.js';
import {validateLivingLightRenderSnapshot} from '../src/domain/echo-living-light-render-snapshot.js';
import {packageLivingLightRender,createLivingLightMediaPackager} from './living-light-render-package.mjs';
import {verifyLivingLightPackageMedia} from '../scripts/lib/hyperframes-living-light-package.mjs';
import encoding from '../scripts/lib/prepared-frame-encoding.cjs';
const fail=message=>{throw Object.assign(Error(message),{code:'local_living_light_source_not_ready',statusCode:409});};

/** Freeze through the saved Journey/media owners, before checkpoint identity.
 * Content-addressed copies are execution inputs; authoring is never changed. */
export async function prepareSongCardLivingLight({project,owner,root,cacheRoot,readPreparedSource,signal}){
 if(!echoProjectLivingLightCues(project).length)return null;
 if(typeof owner==='function')owner=owner();
 if(!owner?.exportPackage||!owner?.resolveMedia)fail('The exact Living Light source owner is unavailable.');
 await fs.mkdir(cacheRoot,{recursive:true,mode:0o700});
 const temporary=await fs.mkdtemp(path.join(cacheRoot,'.preparing-'));
 try{
  const snapshot=await packageLivingLightRender({project,owner,signal,readPreparedSource,packageMedia:createLivingLightMediaPackager({root,projectPath:path.join(root,'data/music-video-projects/selected-project.json'),output:temporary,signal})});
  // The snapshot validator still refuses absent or changed prepared bindings.
  const directory=path.join(cacheRoot,snapshot.snapshotDigest),manifest=path.join(directory,'living-light-render.json');
  await fs.writeFile(path.join(temporary,'living-light-render.json'),JSON.stringify(snapshot),{flag:'wx'});
  try{await fs.rename(temporary,directory);}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;}
  const stored=JSON.parse(await fs.readFile(manifest,'utf8'));validateLivingLightRenderSnapshot(stored);
  if(stored.snapshotDigest!==snapshot.snapshotDigest)fail('The saved render package differs from its exact source.');
  const media=await verifyLivingLightPackageMedia(stored,directory);signal?.throwIfAborted();
  return {snapshot:stored,manifest,additionalSources:[{inputRole:'living-light-snapshot',path:manifest},...media.map(m=>({inputRole:'living-light-painted-media',path:m.file,expectedContentSha256:'sha256:'+m.sha256}))]};
 }finally{await fs.rm(temporary,{recursive:true,force:true});}
}
export function preparedSongCardCompilerReady(report,show,snapshot){
 if(!snapshot)return report?.ok===true&&report?.validation?.showcaseReady===true;
 validateLivingLightRenderSnapshot(snapshot);
 return report?.ok===true&&report?.showHash===show?.showHash&&show?.livingLight?.snapshotDigest===snapshot.snapshotDigest
  &&show.livingLight.captureRoute==='hapa-prepared-electron-v1'&&show.livingLight.requiresPreparedFrames===true
  &&report.validation?.preparedCapture==='requires-hapa-prepared-electron-v1'
  &&['lint','inspect','cueCoverage','mediaPreflight','mediaOffline','visualizerPreflight','visualizerOffline','shaderFidelity'].every(k=>report.validation[k]==='pass');
}
export function preparedSongCardPixelProof(show,report){
 if(!show?.livingLight)return null;
 const frames=report?.frames||[],needed=show.livingLight.cues.filter(c=>c.window.startUs<show.duration*1e6),seen=new Set();
 if(report.showHash!==show.showHash||!frames.length)fail('Living Light has no matching native pixel proof.');
 for(const frame of frames){
  const index=Math.round(frame.timestamp*show.fps);encoding.checkFrameReceipt(frame.preparedFrame,index,show);
  if(Math.abs(frame.timestamp-index/show.fps)>1e-7)fail('Prepared pixel samples must use the output frame clock.');
  if(frame.preparedFrame.livingLight.active){if(!frame.metrics?.nonBlank||!frame.metrics?.nonFlat)fail('A Living Light cue has no visible pixel proof.');seen.add(frame.preparedFrame.livingLight.cue.cueId);}
 }
 if(needed.some(c=>!seen.has(c.cueId)))fail('A Living Light cue was omitted from native pixel verification.');
 return {ok:true,captureRoute:show.livingLight.captureRoute,snapshotDigest:show.livingLight.snapshotDigest,cueIds:[...seen],sampleCount:frames.length};
}
