import {livingLightJourneySelection} from '../src/domain/living-light-stem-selection.js';
import fs from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {pipeline} from 'node:stream/promises';
import {Transform} from 'node:stream';
import {echoProjectLivingLightCues,resolveEchoLivingLightCue} from '../src/domain/echo-living-light-cues.js';
import {livingLightMediaKey} from '../src/domain/living-light-media.js';
import {ECHO_LIVING_LIGHT_RENDER_SCHEMA,livingLightRenderDigest,validateLivingLightRenderSnapshot} from '../src/domain/echo-living-light-render-snapshot.js';
import {hyperFramesMediaSourceCandidates} from '../src/domain/hyperframes-show-compiler.js';

const fail=message=>{throw Object.assign(Error(message),{code:'living_light_render_package_failed'});};
const stamp=stat=>[stat.size,stat.ino,stat.mtimeMs,stat.ctimeMs].join(':');
async function fileDigest(file){const hash=createHash('sha256');for await(const chunk of createReadStream(file))hash.update(chunk);return hash.digest('hex');}

/** Only already-resolved owner declarations enter this file packager. No URL
 * fetch, transcoding, analysis, source overwrite or authoring mutation occurs. */
export function createLivingLightMediaPackager({root,projectPath,output,signal}){
 const pending=new Map();
 return source=>{
  const id=livingLightMediaKey(source.ref);
  if(!pending.has(id))pending.set(id,(async()=>{
   signal?.throwIfAborted();
   if(typeof source.uri!=='string'||/^[a-z]+:\/\//i.test(source.uri)&&!source.uri.startsWith('file://'))fail('Only local owner media can be packaged.');
   const candidates=hyperFramesMediaSourceCandidates({source:{runtimeUri:source.uri}},{root,projectPath});let selected;
   for(const candidate of candidates){const info=await fs.stat(candidate).catch(()=>null);if(info?.isFile()){selected=await fs.realpath(candidate);break;}}
   if(!selected)fail('The exact painted source is unavailable locally.');
   const extension=path.extname(selected).toLowerCase();if(!['.mp4','.webm','.mov','.m4v'].includes(extension))fail('Unsupported painted source container.');
   const before=await fs.stat(selected);if(before.size<1||before.size>2*1024**3)fail('Painted source exceeds the 2 GiB file budget.');
   const directory=path.join(output,'assets','living-light');await fs.mkdir(directory,{recursive:true});
   const temporary=path.join(directory,'.copy-'+randomUUID()+'.tmp'),hash=createHash('sha256');let bytes=0;
   try{
    await pipeline(createReadStream(selected),new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>before.size)return callback(Error('Painted source grew while packaging.'));hash.update(chunk);callback(null,chunk);}}),createWriteStream(temporary,{flags:'wx'}),{signal});
    if(bytes!==before.size||stamp(before)!==stamp(await fs.stat(selected)))fail('Painted source changed while packaging.');
    const digest=hash.digest('hex'),name=digest+extension,destination=path.join(directory,name);
    try{await fs.link(temporary,destination);}catch(error){if(error.code!=='EEXIST')throw error;const current=await fs.lstat(destination);if(!current.isFile()||current.isSymbolicLink()||current.size!==bytes||await fileDigest(destination)!==digest)fail('Existing packaged media failed its content check.');}
    return {ref:structuredClone(source.ref),uri:'assets/living-light/'+name,sha256:digest,bytes,identityBasis:'exact-cut-source-declaration-and-packaged-bytes'};
   }finally{await fs.unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}
  })());
  return pending.get(id);
 };
}

/** Snapshot through the existing authoring owner and exact media resolver.
 * Files written before a failure remain inert; no valid snapshot is returned. */
export async function packageLivingLightRender({project,owner,packageMedia,preparedSource=null,readPreparedSource,signal}){
 const body=project.music_video_project||project.project||project,cues=structuredClone(echoProjectLivingLightCues(project));
 if(!cues.length)return null;
 const recipes=[],seen=new Set();
 for(const cue of cues){
  signal?.throwIfAborted();const id=JSON.stringify(cue.journeyRef);if(seen.has(id))continue;seen.add(id);
  const result=await owner.exportPackage({kind:'journey',id:cue.journeyRef.journeyId,revision:cue.journeyRef.revisionId,includeNotes:false});
  if(result.storeMutation!==false||result.analysisExecuted!==false)fail('The Journey owner did not return a read-only export.');
  const packet=structuredClone(result.package),journey=resolveEchoLivingLightCue(cue,{resolveJourney:()=>packet.journey});
  const refs=[...new Map(journey.mediaSlots.filter(s=>s.enabled&&s.mediaRef).map(s=>[livingLightMediaKey(s.mediaRef),s.mediaRef])).values()];
  const resolution=refs.length?await owner.resolveMedia(refs):{readOnly:true,results:[]};
  if(!resolution.readOnly||!Array.isArray(resolution.results))fail('The media owner did not return an exact read-only resolution.');
  const sources=[];
  for(const ref of refs){signal?.throwIfAborted();const matches=resolution.results.filter(row=>livingLightMediaKey(row.ref||{})===livingLightMediaKey(ref));
   if(matches.length!==1||matches[0].state!=='resolved'||livingLightMediaKey(matches[0].source?.ref||{})!==livingLightMediaKey(ref))fail('An exact painted source cannot be resolved.');
   sources.push(await packageMedia(matches[0].source));
  }
  recipes.push({package:packet,sources});
 }
 const bound=recipes.some(({package:{journey}})=>journey.sourceBindingRef||journey.instances.some(instance=>Object.keys(instance.bindings).length||instance.musicResponse));
 // Resolve once, only for saved audio choices. Neutral recipes must not start
 // preparation or acquire an incidental source identity.
 const selections=new Set(recipes.filter(({package:{journey}})=>journey.sourceBindingRef||journey.instances.some(i=>Object.keys(i.bindings).length||i.musicResponse)).map(({package:{journey}})=>livingLightJourneySelection(journey)));
 if(selections.size>1)fail('This cut mixes legacy and coherent stem banks. Save its bound cues against one reviewed source set before export.');
 const stemSelectionPolicy=[...selections][0]||null;
 if(bound&&!preparedSource&&readPreparedSource)preparedSource=await readPreparedSource({songId:body.song_id,signal,...(stemSelectionPolicy?{stemSelectionPolicy}:{})});
 const snapshot={schemaVersion:ECHO_LIVING_LIGHT_RENDER_SCHEMA,songId:body.song_id,durationUs:Math.round(body.duration*1e6),cues,recipes,preparedSource:structuredClone(preparedSource)};
 snapshot.snapshotDigest=livingLightRenderDigest(snapshot);validateLivingLightRenderSnapshot(snapshot,{cues,songId:body.song_id,durationUs:snapshot.durationUs});signal?.throwIfAborted();return snapshot;
}
