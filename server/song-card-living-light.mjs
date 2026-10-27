import fs from 'node:fs/promises';
import path from 'node:path';
import {echoProjectLivingLightCues} from '../src/domain/echo-living-light-cues.js';
import {validateLivingLightRenderSnapshot} from '../src/domain/echo-living-light-render-snapshot.js';
import {packageLivingLightRender,createLivingLightMediaPackager} from './living-light-render-package.mjs';
import {verifyLivingLightPackageMedia} from '../scripts/lib/hyperframes-living-light-package.mjs';
import encoding from '../scripts/lib/prepared-frame-encoding.cjs';
const fail=message=>{throw Object.assign(Error(message),{code:'local_living_light_source_not_ready',statusCode:409});};

// Hydrated editor detail can contain a selected cut's ID and full sidecar
// while its top-level fields still describe Legacy. It is not a render input
// until the saved-cut projection has applied the editorial patch.
export function assertLivingLightRenderProjection(project={}) {
 const body=project.music_video_project||project.project||project;
 const selected=body.selected_direction_script_variant_id;
 const variant=body.direction_script_variants?.find(row=>row.id===selected);
 const declared=(variant?.project_patch||variant?.projectPatch)?.living_light_cues;
 if(selected&&declared?.length&&body.living_light_cues===undefined) {
  fail('The selected saved cut contains Living Light scenes, but its render input is still the Legacy projection. Reopen the saved cut and choose Retry plan before rendering.');
 }
}

/** Freeze through the saved Journey/media owners, before checkpoint identity.
 * Content-addressed copies are execution inputs; authoring is never changed. */
export async function prepareSongCardLivingLight({project,owner,root,cacheRoot,readPreparedSource,signal}){
 assertLivingLightRenderProjection(project);
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
 const scoreDustPrepared=!show?.scoreDust||show.scoreDust.captureRoute==='hapa-prepared-electron-v1'&&show.scoreDust.requiresPreparedFrames===true&&/^sha256:[0-9a-f]{64}$/.test(show.scoreDust.compiledSha256||'')&&show.scoreDust.compiledSha256===show.scoreDust.source?.sha256;
 if(!snapshot&&!show?.scoreDust)return report?.ok===true&&report?.validation?.showcaseReady===true;
 if(snapshot)validateLivingLightRenderSnapshot(snapshot);
 return report?.ok===true&&report?.showHash===show?.showHash&&scoreDustPrepared
  &&(!snapshot||show?.livingLight?.snapshotDigest===snapshot.snapshotDigest&&show.livingLight.captureRoute==='hapa-prepared-electron-v1'&&show.livingLight.requiresPreparedFrames===true)
  &&report.validation?.preparedCapture==='requires-hapa-prepared-electron-v1'
  &&['lint','inspect','cueCoverage','mediaPreflight','mediaOffline','visualizerPreflight','visualizerOffline','shaderFidelity'].every(k=>report.validation[k]==='pass');
}
/** Every Score Dust layer window inside the take has visible, painted dust pixels. */
export function preparedScoreDustPixelProof(show,report){
 if(!show?.scoreDust)return null;
 const frames=report?.frames||[],window=show.scoreDust.layer.window;let painted=0;
 if(report?.showHash!==show.showHash||!frames.length)fail('The Score Dust layer has no matching prepared pixel proof.');
 for(const frame of frames){
  const index=Math.round(frame.timestamp*show.fps);encoding.checkFrameReceipt(frame.preparedFrame,index,show);
  if(frame.preparedFrame.scoreDust.active){if(!frame.metrics?.nonBlank)fail('A Score Dust layer frame has no visible pixel proof.');painted++;}
 }
 if(window.startUs<show.duration*1e6&&!painted)fail('The Score Dust layer was omitted from prepared pixel verification.');
 return {ok:true,captureRoute:show.scoreDust.captureRoute,renderSha256:show.scoreDust.compiledSha256,recordingId:show.scoreDust.layer.render.recordingId,paintedSamples:painted,sampleCount:frames.length};
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
