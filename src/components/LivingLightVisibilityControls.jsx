import {useEffect,useMemo,useRef,useState} from 'react';
import {createLivingLightClient} from '../domain/living-light-client.js';
import {visibilityDraftKey,visibilityFingerprint,readVisibilityPending} from '../domain/living-light-visibility-draft.js';
export default function LivingLightVisibilityControls({row,onSaved}){
 const client=useMemo(()=>createLivingLightClient(),[]),live=useRef(true),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),id=row.thing.thingId;
 useEffect(()=>{live.current=true;return()=>{live.current=false;};},[]);
 async function change(){if(busy)return;const archived=!row.visibility?.archived,request={expectedRevision:row.currentHead,expectedVisibilityRevision:row.visibility?.revisionId||null},fingerprint=visibilityFingerprint(id,archived,request);let pending;try{pending=readVisibilityPending(localStorage.getItem(visibilityDraftKey(id)),id);}catch{}
  const key=pending&&visibilityFingerprint(id,pending.archived,pending)===fingerprint?pending.key:crypto.randomUUID();try{localStorage.setItem(visibilityDraftKey(id),JSON.stringify({thingId:id,archived,...request,key}));}catch{}setBusy(true);setMessage(archived?'Archiving in the library…':'Restoring to the library…');
  try{const result=await client.request('/things/'+encodeURIComponent(id)+(archived?'/archive':'/restore'),{method:'POST',body:JSON.stringify({...request,idempotencyKey:key})});if(!live.current)return;await onSaved(result);if(live.current)setMessage(archived?'Archive recorded. Settings, recipes and notes are retained.':'Restore recorded. The Card is available in the library.');}
  catch(error){if(live.current)setMessage(['revision_conflict','visibility_conflict'].includes(error.code)?'This Card or its visibility changed. Your request is retained. Reload saved Cards before trying again.':error.message);}finally{if(live.current)setBusy(false);}
 }
 return <div className="living-light-visibility-controls"><p>{row.visibility?.archived?'Archived in the library. Saved uses and notes remain available.':'Archiving hides this Card from normal selection; it preserves all settings, recipes and notes.'}</p><button type="button" disabled={busy} onClick={change}>{busy?'Working…':row.visibility?.archived?'Restore Card to library':'Archive Card in library'}</button><p role="status">{message}</p></div>;
}
