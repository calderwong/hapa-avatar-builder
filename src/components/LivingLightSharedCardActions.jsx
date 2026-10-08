import {useEffect,useMemo,useRef,useState} from 'react';
import {useOvercardPickup,useOvercardSnapshot,useOvercardStore} from '@hapa/overcard/react';
import {createLivingLightClient} from '../domain/living-light-client.js';
import {useLivingLightSharedCard} from '../overcard/livingLightHand.js';
/** Mounted only by Builder's existing shared provider. */
export default function LivingLightSharedCardActions({target}){
 const store=useOvercardStore(),snapshot=useOvercardSnapshot(),{setHeld}=useOvercardPickup(),client=useMemo(()=>createLivingLightClient(),[]),controller=useRef(null);
 const [busy,setBusy]=useState(false),[status,setStatus]=useState('');
 useEffect(()=>()=>controller.current?.abort(),[]);
 async function useCard(mode){
  if(controller.current)return;const c=new AbortController();controller.current=c;setBusy(true);setStatus('Checking this exact Card’s custody…');
  try{const result=await useLivingLightSharedCard({target,mode,client,store,setHeld,signal:AbortSignal.any([c.signal,AbortSignal.timeout(30000)])});if(!c.signal.aborted)setStatus(result.state==='held'?'Card picked up. Use Open held Living Light Card in the Header to inspect it.':'Added to '+result.handName+'. Notes remain with the original Card.');}
  catch(error){if(!c.signal.aborted)setStatus((error.message||'The outcome is unresolved.')+' No automatic retry; inspect the source and shared Hand before trying again.');}
  finally{controller.current=null;if(!c.signal.aborted)setBusy(false);}
 }
 const offline=snapshot.sync.connection!=='online';
 return <div className="living-light-card-actions" aria-label="Shared Living Light Card"><button type="button" disabled={busy||offline} onClick={()=>useCard('pickup')}>Pick up Card</button><button type="button" disabled={busy||offline} onClick={()=>useCard('add')}>Add to Hand</button><p role="status">{offline?'Shared Hand offline. Reconnect in the Header.':status}</p></div>;
}
