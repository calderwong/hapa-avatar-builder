import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createLivingLightRegistry} from '../../src/living-light/registry.js';
import LivingLightJourneyEditor from '../../src/components/LivingLightJourneyEditor.jsx';
import LivingLightLibrary from '../../src/components/LivingLightLibrary.jsx';
import '../../src/components/LivingLightWorkspace.css';
function Proof(){const registry=useMemo(()=>createLivingLightRegistry(),[]),[songId,setSongId]=useState('fixture:song'),[addRequest,setAddRequest]=useState(null);return <main className="living-light-workspace"><h3>Isolated Living Light fork proof</h3><p>Synthetic records only. These are the canonical Builder components and protected owner API. No album playback or Calder creative approval.</p><label>Proof song <select aria-label="Proof song" value={songId} onChange={event=>{setAddRequest(null);setSongId(event.target.value);}}><option value="fixture:song">Synthetic source song</option><option value="fixture:target">Synthetic target song</option></select></label><LivingLightJourneyEditor key={songId} songId={songId} title={songId==='fixture:song'?'Synthetic source':'Synthetic target'} durationUs={songId==='fixture:song'?20000000:40000000} registry={registry} addRequest={addRequest}/><LivingLightLibrary registry={registry} onAdd={thing=>setAddRequest({thing,nonce:crypto.randomUUID()})}/></main>;}
createRoot(document.getElementById('root')).render(<Proof/>);
