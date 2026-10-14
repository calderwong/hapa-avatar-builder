import {canonicalJSON,LivingLightValidationError} from './living-light-contracts.js';
import {ECHO_LIVING_LIGHT_CUE_SCHEMA,echoProjectLivingLightCues,resolveEchoLivingLightCue} from './echo-living-light-cues.js';
const clone=value=>structuredClone(value);
const fail=(code,message)=>{throw new LivingLightValidationError(code,'living_light_cues',message);};
const equal=(a,b)=>canonicalJSON(a)===canonicalJSON(b);

export function createEchoLivingLightCue({journey,cueId,role='scene',startUs,journeyWindow}={}) {
 const window=journeyWindow||{startUs:0,endUs:journey?.schedule?.at(-1)?.endUs};
 const cue={schemaVersion:ECHO_LIVING_LIGHT_CUE_SCHEMA,cueId,role,songId:journey?.songId,journeyRef:{journeyId:journey?.journeyId,revisionId:journey?.revisionId},sourceBindingRef:clone(journey?.sourceBindingRef??null),window:{startUs,endUs:startUs+window.endUs-window.startUs},journeyWindow:clone(window),clock:'echo-song',mapping:'offset-1x',outputProfile:'project',locks:{timing:false,journey:false}};
 resolveEchoLivingLightCue(cue,{resolveJourney:()=>journey});return cue;
}

/** Atomic human/agent edit spine. No I/O, saved recipe mutation or hidden unlock. */
export function editEchoLivingLightCues(project,action,{resolveJourney,expectedCues}={}) {
 const before=echoProjectLivingLightCues(project);
 if(expectedCues!==undefined&&!equal(before,expectedCues))fail('living_light_edit_conflict','The cut changed. Keep this draft and reload the current cues before editing.');
 const next=clone(before),index=next.findIndex(cue=>cue.cueId===action.cueId),cue=next[index];
 if(action.type==='insert'){
  next.push(clone(action.cue));
 }else{
  if(!cue)fail('living_light_cue_missing','Select an existing cue.');
  if(action.type==='lock'){
   if(!['timing','journey'].includes(action.lock)||typeof action.value!=='boolean')fail('living_light_lock_invalid','Choose a timing or Journey lock.');
   cue.locks[action.lock]=action.value;
  }else if(action.type==='remove'){
   if(cue.locks.timing||cue.locks.journey)fail('living_light_cue_locked','Unlock this cue before removing it.');
   next.splice(index,1);
  }else if(action.type==='move'){
   if(cue.locks.timing)fail('living_light_cue_locked','Unlock timing before moving this cue.');
   const duration=cue.window.endUs-cue.window.startUs;cue.window={startUs:action.startUs,endUs:action.startUs+duration};
  }else if(action.type==='window'){
   if(cue.locks.timing)fail('living_light_cue_locked','Unlock timing before trimming this cue.');
   cue.journeyWindow=clone(action.journeyWindow);cue.window.endUs=cue.window.startUs+cue.journeyWindow.endUs-cue.journeyWindow.startUs;
  }else if(action.type==='swap'){
   if(cue.locks.journey)fail('living_light_cue_locked','Unlock the Journey before swapping it.');
   const replacement=createEchoLivingLightCue({journey:action.journey,cueId:cue.cueId,role:action.role??cue.role,startUs:cue.window.startUs,journeyWindow:action.journeyWindow??cue.journeyWindow});
   if(cue.locks.timing&&(!equal(replacement.window,cue.window)||!equal(replacement.journeyWindow,cue.journeyWindow)))fail('living_light_cue_locked','This swap changes the timing. Unlock timing or choose a compatible source window.');
   next[index]={...replacement,locks:clone(cue.locks)};
  }else fail('living_light_edit_unsupported','Unsupported Living Light cue edit.');
 }
 echoProjectLivingLightCues({...project,living_light_cues:next});
 // Only changed references need resolving. Existing missing cues remain visible
 // and can be removed; an unrelated lock/edit must not silently substitute them.
 for(const row of next){const old=before.find(item=>item.cueId===row.cueId);if(!old||!equal({...old,locks:row.locks},row))resolveEchoLivingLightCue(row,{resolveJourney});}
 return next;
}

/** Cue-only history preserves unrelated media, lyrics and settings on undo. */
export function createEchoLivingLightEditHistory(initial=[]) {
 let present=clone(initial),past=[],future=[];
 const check=current=>{if(!equal(present,current))fail('living_light_edit_conflict','Cues changed outside this edit history. Reload them before undoing.');};
 return {
  commit(current,next){check(current);if(equal(current,next))return clone(present);past.push(clone(present));if(past.length>50)past.shift();present=clone(next);future=[];return clone(present);},
  undo(current){check(current);if(!past.length)return clone(present);future.push(present);present=past.pop();return clone(present);},
  redo(current){check(current);if(!future.length)return clone(present);past.push(present);present=future.pop();return clone(present);},
  reset(current){present=clone(current);past=[];future=[];},
  state(){return {present:clone(present),canUndo:past.length>0,canRedo:future.length>0};},
 };
}
