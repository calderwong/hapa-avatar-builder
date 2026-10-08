import {previewJourneyFork,forkPreviewContent} from './living-light-fork.js';
/** Browser draft data is recoverable input, never authoring or session authority. */
export function recoverForkDraft(raw,source,registry){
 try{
  if(typeof raw!=='string'||raw.length>256*1024)return null;
  const input=JSON.parse(raw);if(!input||input.schemaVersion!=='hapa.living-light.fork-draft.v1'||input.sourceRevisionId!==source.revisionId)return null;
  const options=Object.fromEntries(['sourceRevisionId','targetSongId','title','durationUs','timingPolicy'].map(key=>[key,input[key]]));
  const expected=previewJourneyFork(source,options,{resolveThing:registry.resolveThing});let preview=null,pending=null;
  if(input.preview){const {previewDigest,...content}=input.preview;if(typeof previewDigest==='string'&&/^[a-f0-9]{64}$/.test(previewDigest)&&forkPreviewContent(content)===forkPreviewContent(expected))preview={...expected,previewDigest};}
  if(preview&&input.pending?.fingerprint===JSON.stringify({...options,previewDigest:preview.previewDigest})&&typeof input.pending.key==='string'&&input.pending.key.length<=256&&/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(input.pending.key))pending={fingerprint:input.pending.fingerprint,key:input.pending.key};
  return {schemaVersion:input.schemaVersion,...options,preview,pending};
 }catch{return null;}
}
