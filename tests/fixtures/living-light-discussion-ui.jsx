import React,{useMemo,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {createLivingLightRegistry} from '../../src/living-light/registry.js';
import LivingLightJourneyEditor from '../../src/components/LivingLightJourneyEditor.jsx';
import LivingLightLibrary from '../../src/components/LivingLightLibrary.jsx';
import '../../src/components/LivingLightWorkspace.css';
function Proof(){const registry=useMemo(()=>createLivingLightRegistry(),[]),[addRequest,setAddRequest]=useState(null);return <main className="living-light-workspace"><h3>Isolated Living Light discussion proof</h3><p>Synthetic records only. This uses the canonical Builder components and owner API. It is not Calder’s artistic approval or album playback.</p><LivingLightJourneyEditor songId="fixture:song" title="Synthetic fixture" durationUs={20000000} registry={registry} addRequest={addRequest}/><LivingLightLibrary registry={registry} onAdd={thing=>setAddRequest({thing,nonce:crypto.randomUUID()})}/></main>;}
createRoot(document.getElementById('root')).render(<Proof/>);
