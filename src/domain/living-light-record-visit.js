import {validateLivingLightDestination,livingLightDestinationAvailability} from './living-light-navigation.js';
import {normalizeEchoRecordSummaryRows} from './echo-record-garden.js';
import {echoDirectionVariantId,echoDirectionVariantSourceFingerprint} from './echo-direction-variants.js';

/** Reads the existing catalog and cut owners. A changed declaration or missing
 * pinned cut cannot silently open the latest cut. No compilation or writes. */
export async function loadLivingLightRecordDestination(target,{request,signal}={}){
 validateLivingLightDestination(target);if(target.kind!=='record')throw Error('Choose an album record destination.');
 const records=normalizeEchoRecordSummaryRows(await request('/director-projects?summary=1',{signal}));
 const available=livingLightDestinationAvailability(target,{records});
 if(!available.record)throw Error(available.message);
 const params=new URLSearchParams({songId:target.ref.songId});if(target.ref.cutId!=='legacy')params.set('variantId',target.ref.cutId);
 const detail=await request('/director-project?'+params,{signal}),project=detail?.music_video_project;
 if(project?.song_id!==target.ref.songId||!Array.isArray(project.timeline))throw Error('The destination returned another song or an incomplete timeline.');
 const cut=target.ref.cutId==='legacy'?project:project.direction_script_variants?.find(row=>echoDirectionVariantId(row)===target.ref.cutId&&Array.isArray(row.timeline));
 if(!cut)throw Error('The exact destination cut is unavailable.');
 const expected=available.record.preview.cutFingerprint;
 if(expected&&echoDirectionVariantSourceFingerprint(cut)!==expected)throw Error('The destination cut changed since its catalog declaration. Reload the catalog before choosing a replacement.');
 return {songId:target.ref.songId,cutId:target.ref.cutId,title:available.record.title,detail,workingFork:null,dirty:false,timeSeconds:0};
}
const copy=value=>{const json=JSON.stringify(value);if(new TextEncoder().encode(json).byteLength>32*1024*1024)throw Error('This editing session is too large to hold for a record visit. Save it before navigating.');return JSON.parse(json);};
/** One reversible excursion. The caller owns selection/audio and supplies the
 * current edit token; stale reads may not replace a newly edited session. */
export function createLivingLightRecordVisit({readCurrent,load,activate,pause=()=>{},onState=()=>{}}){
 let origin=null,pending=null,disposed=false;
 const emit=(state,message)=>{if(!disposed)onState({state,message,canReturn:!!origin,originTitle:origin?.title||''});};
 function current(){if(disposed)throw Error('This album session has closed.');const value=readCurrent();if(value.busy)throw Error('Wait for the current album operation before navigating.');return value;}
 return {
  async open(target){
   if(pending||origin)throw Error('Return to the original record before opening another destination.');
   const before=current(),snapshot=copy(before.snapshot),controller=new AbortController();pause();pending=controller;emit('loading','Loading the exact destination record…');
   try{
    const destination=await load(target,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
    if(disposed||controller.signal.aborted)return false;
    const latest=current();if(latest.token!==before.token)throw Error('The current song or cut changed while the destination loaded. Your current work is retained.');
    origin=snapshot;
    try{activate(destination);}catch(error){origin=null;throw error;}
    emit('visiting','Destination opened paused. Your original editing session is held for return.');return true;
   }catch(error){if(!disposed&&!controller.signal.aborted)emit('error',error.message);if(controller.signal.aborted)return false;throw error;}
   finally{if(pending===controller)pending=null;}
  },
  return(){
   if(pending)throw Error('Cancel the pending destination lookup first.');if(!origin)return false;
   const value=current();if(value.snapshot.dirty)throw Error('Save or discard the destination cut changes before returning. Both sessions are retained.');
   activate(copy(origin));origin=null;emit('idle','Returned to your original cut and paused song bookmark.');return true;
  },
  cancel(){pending?.abort();pending=null;emit(origin?'visiting':'idle','Destination lookup canceled. Your current work is retained.');},
  dispose(){disposed=true;pending?.abort();pending=null;origin=null;},
  diagnostics:()=>({disposed,pending:!!pending,heldSessions:origin?1:0})
 };
}
