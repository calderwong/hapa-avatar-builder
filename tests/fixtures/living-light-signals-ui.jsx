import React,{useEffect,useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LivingLightWorkspace from '../../src/components/LivingLightWorkspace.jsx';
function Proof(){const audioRef=useRef(null),[receipt,setReceipt]=useState(null);useEffect(()=>{const c=new AbortController();fetch('/fixture-audio.json',{signal:c.signal}).then(r=>r.json()).then(setReceipt).catch(()=>{});return()=>c.abort();},[]);return <main><p>Synthetic source-bound native UI proof. The two Guitar assets and missing Drums are isolated fixtures. No album map or creative approval.</p><audio ref={audioRef} src="/master.wav" controls/><LivingLightWorkspace songId="fixture:song" title="Signal integration fixture" duration={20} audioRef={audioRef} audioReceipt={receipt} powerMode="active"/></main>;}
createRoot(document.getElementById('root')).render(<Proof/>);
