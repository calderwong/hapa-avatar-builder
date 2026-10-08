import {canonicalJSON} from './living-light-contracts.js';
const schemaVersion='hapa.living-light.note-draft.v1';
export const noteDraftKey=target=>'hapa.living-light.note-draft.v1:'+encodeURIComponent(canonicalJSON(target));
const textOK=value=>typeof value==='string'&&new TextEncoder().encode(value).length<=16384;
const idOK=value=>typeof value==='string'&&value.length>0&&value.length<=256;
export function emptyNoteDraft(target){return {schemaVersion,target:structuredClone(target),body:'',editing:null,pending:null};}
export function recoverNoteDraft(raw,target){
 try{
  if(typeof raw!=='string'||raw.length>65536)return null;
  const value=JSON.parse(raw);
  if(value.schemaVersion!==schemaVersion||canonicalJSON(value.target)!==canonicalJSON(target)||!textOK(value.body))return null;
  const editing=value.editing;
  if(editing&&(!idOK(editing.noteId)||!idOK(editing.expectedRevision)||!textOK(editing.originalBody)))return null;
  const result={...emptyNoteDraft(target),body:value.body,editing:editing?{noteId:editing.noteId,expectedRevision:editing.expectedRevision,originalBody:editing.originalBody}:null};
  if(value.pending&&idOK(value.pending.key)&&value.pending.fingerprint===noteOperation(result).fingerprint)result.pending={fingerprint:value.pending.fingerprint,key:value.pending.key};
  return result;
 }catch{return null;}
}
export function changeNoteDraft(draft,body){return {...draft,body,pending:null};}
export function editNoteDraft(target,row){return {...emptyNoteDraft(target),body:row.note.body,editing:{noteId:row.note.noteId,expectedRevision:row.note.revisionId,originalBody:row.note.body}};}
export function noteOperation(draft,{retractRow}={}){
 const editing=retractRow?{noteId:retractRow.note.noteId,expectedRevision:retractRow.note.revisionId}:draft.editing;
 const operation=retractRow?'retract':editing?'revisions':'create';
 const route=editing?'/notes/'+encodeURIComponent(editing.noteId)+'/'+operation:'/notes';
 const content={...(editing?{}:{target:draft.target}),body:retractRow?'':draft.body,expectedRevision:editing?.expectedRevision||null};
 return {route,content,fingerprint:canonicalJSON({route,content})};
}
export function prepareNoteRequest(draft,key){const operation=noteOperation(draft),idempotencyKey=draft.pending?.fingerprint===operation.fingerprint?draft.pending.key:key;return {draft:{...draft,pending:{fingerprint:operation.fingerprint,key:idempotencyKey}},route:operation.route,payload:{...operation.content,idempotencyKey}};}
