import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {OvercardProvider} from '@hapa/overcard/react';
import {createAvatarBuilderOvercardAdapter} from '../../src/overcard/hostAdapter.js';
import {avatarBuilderOvercardRenderers} from '../../src/overcard/renderers.jsx';
import BuilderHeaderHand from '../../src/overcard/BuilderHeaderHand.jsx';
import LivingLightWorkspace from '../../src/components/LivingLightWorkspace.jsx';
import '@hapa/overcard/styles.css';
function Proof({adapter}){
 const audioRef=useRef(null),[receipt,setReceipt]=useState(null),[tab,setTab]=useState('living-light'),[request,setRequest]=useState(null),[song,setSong]=useState('fixture:song');
 useEffect(()=>{const c=new AbortController();fetch('/fixture-audio.json',{signal:c.signal}).then(r=>r.json()).then(setReceipt).catch(()=>{});return()=>c.abort();},[]);
 return <main><p>Synthetic native shared Hand proof using the canonical package and actual isolated shared host. No creative approval.</p>
  <BuilderHeaderHand adapter={adapter} onOpenLivingLight={target=>{setRequest({target,nonce:crypto.randomUUID()});setTab('living-light');}}/>
  <button type="button" onClick={()=>setTab('living-light')}>Return to Living Light</button><button type="button" onClick={()=>setTab('preview')}>Inspect other work surface</button><button type="button" onClick={()=>setSong(song==='fixture:song'?'fixture:other-song':'fixture:song')}>Switch synthetic song</button>
  <p>Selected song: {song} · Surface: {tab}</p><audio ref={audioRef} src="/master.wav" controls/>
  <div hidden={tab!=='living-light'}><LivingLightWorkspace songId={song} title="Shared Hand fixture" duration={20} audioRef={audioRef} audioReceipt={receipt} powerMode={tab==='living-light'?'active':'hidden'} sharedHandEnabled openCardRequest={request}/></div>
 </main>;
}
fetch('/fixture-overcard.json').then(r=>r.json()).then(config=>{
 const adapter=createAvatarBuilderOvercardAdapter({baseUrl:config.baseUrl});
 createRoot(document.getElementById('root')).render(<OvercardProvider adapter={adapter} renderers={avatarBuilderOvercardRenderers}><Proof adapter={adapter}/></OvercardProvider>);
});
