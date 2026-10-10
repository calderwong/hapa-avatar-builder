import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import LivingLightRegistryProvider,{useLivingLightRegistry} from '../../src/components/LivingLightRegistryProvider.jsx';
import LivingLightJourneyEditor from '../../src/components/LivingLightJourneyEditor.jsx';
import LivingLightLibrary from '../../src/components/LivingLightLibrary.jsx';
import '../../src/components/LivingLightWorkspace.css';
function Proof(){const {registry}=useLivingLightRegistry(),[addRequest,setAddRequest]=useState(null);return <main className="living-light-workspace"><h3>Isolated Living Light preset proof</h3><p>Synthetic authoring only. Canonical components and protected API; no album playback or Calder creative acceptance.</p><LivingLightJourneyEditor songId="fixture:song" title="Synthetic preset study" durationUs={20000000} registry={registry} addRequest={addRequest}/><LivingLightLibrary registry={registry} onAdd={thing=>setAddRequest({thing,nonce:crypto.randomUUID()})}/></main>;}
createRoot(document.getElementById('root')).render(<LivingLightRegistryProvider><Proof/></LivingLightRegistryProvider>);
