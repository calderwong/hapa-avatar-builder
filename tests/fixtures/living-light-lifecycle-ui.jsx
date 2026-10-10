import React,{useRef,useState} from 'react';
import {createRoot} from 'react-dom/client';
import LivingLightWorkspace from '../../src/components/LivingLightWorkspace.jsx';
import {createLivingLightRuntime} from '../../src/living-light/runtime.js';
import {createNativeNamespace} from '../../src/living-light/native.generated.js';
import {createLivingLightRegistry} from '../../src/living-light/registry.js';
function Proof(){
 const audioRef=useRef(null),lostExtensionRef=useRef(null),[open,setOpen]=useState(true),[fault,setFault]=useState(null);
 function lose(){lostExtensionRef.current=document.querySelector('[data-testid="living-light-canvas"]')?.getContext('webgl2')?.getExtension('WEBGL_lose_context');lostExtensionRef.current?.loseContext();}
 function restore(){lostExtensionRef.current?.restoreContext();}
 function compileFailure(){
  const registry=createLivingLightRegistry(),thing=registry.entries[0],n={...createNativeNamespace()},canvas=document.createElement('canvas');
  const Native=n.HapaRenderer;
  // Real GL compiler fault before the inherited constructor completes. The host
  // cleanup tracker sees the shader even though no renderer object is returned.
  n.HapaRenderer=class {constructor(nativeCanvas){const gl=nativeCanvas.getContext('webgl2'),shader=gl.createShader(gl.FRAGMENT_SHADER);gl.shaderSource(shader,'#version 300 es\ninvalid deliberate fixture');gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Deliberate native shader compile rejection');return new Native(nativeCanvas);}};
  const runtime=createLivingLightRuntime({canvas,registry,nativeFactory:()=>n});
  const journey={schemaVersion:'hapa.living-light.journey.v1',journeyId:'fixture:fault',revisionId:'fixture:r',parentRevisionId:null,title:'Compile fixture',songId:'fixture:song',sourceBindingRef:null,state:'draft-unresolved',mode:'continuous',seed:109,instances:[{instanceId:'use',thingRef:{thingId:thing.thingId,revisionId:thing.revisionId},parameters:{},bindings:{}}],schedule:[{instanceId:'use',startUs:0,endUs:20000000}],actorTreatment:'none',mediaSlots:[]};
  let error=null;try{runtime.prepare({journeyRevision:journey,sourceBinding:{songId:'fixture:song',durationUs:20000000},generation:1,neutralStudy:true});}catch(e){error=e.message;}
  const after=runtime.diagnostics();runtime.dispose();canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();setFault({error,after,disposed:runtime.diagnostics().disposed});
 }
 return <main><p>Synthetic native lifecycle proof. Source media and human acceptance are not qualified here.</p><audio muted ref={audioRef} src="/master.wav"/><button onClick={()=>setOpen(value=>!value)}>{open?'Leave preview':'Enter preview'}</button><button onClick={()=>{audioRef.current.pause();audioRef.current.currentTime=7.5;}}>Seek master to 7.5s</button><button onClick={lose}>Lose graphics context</button><button onClick={restore}>Restore graphics context</button><button onClick={compileFailure}>Test native shader rejection</button>{fault&&<pre data-testid="native-fault-result">{JSON.stringify(fault,null,2)}</pre>}
 {open&&<LivingLightWorkspace songId="fixture:song" title="Native lifecycle fixture" duration={20} audioRef={audioRef} audioReceipt={{durationSeconds:20}} powerMode="active"/>}</main>;
}
createRoot(document.getElementById('root')).render(<Proof/>);
