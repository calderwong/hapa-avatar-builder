import {useState} from 'react';
import {LIVING_LIGHT_MEDIA_SCHEMA,livingLightMediaSurfaces,livingLightMediaKey} from '../domain/living-light-media.js';
const labels={'wall-left':'Left wall','wall-right':'Right wall',portal:'Portal face'};
function Surface({surfaceId,instanceId,placement,sources,disabled,onChange}){
 const [choice,setChoice]=useState(placement?livingLightMediaKey(placement.mediaRef):''),[start,setStart]=useState(String((placement?.trim.inUs||0)/1e6)),[end,setEnd]=useState(placement?.trim.outUs==null?'':String(placement.trim.outUs/1e6)),[loop,setLoop]=useState(placement?.loopPolicy||'loop'),[brightness,setBrightness]=useState(placement?.brightness??.9),[enabled,setEnabled]=useState(placement?.enabled??true),[error,setError]=useState('');
 const source=sources.find(s=>livingLightMediaKey(s.ref)===choice),missing=!!choice&&!source;
 function apply(){
  setError('');if(!choice){onChange(surfaceId,null);return;}
  const input=Number(start),output=end.trim()===''?null:Number(end);
  if(start.trim()===''||!Number.isFinite(input)||input<0||(output!==null&&(!Number.isFinite(output)||output<=input))){setError('Enter a valid source range; leave End empty to use the clip’s end.');return;}
  onChange(surfaceId,{schemaVersion:LIVING_LIGHT_MEDIA_SCHEMA,enabled,surfaceRef:{instanceId,surfaceId},mediaRef:source?.ref||placement.mediaRef,trim:{inUs:Math.round(input*1e6),outUs:output===null?null:Math.round(output*1e6)},loopPolicy:loop,brightness:Number(brightness)});
 }
 return <fieldset disabled={disabled}><legend>{labels[surfaceId]}</legend>
  <label>Clip <select aria-label={labels[surfaceId]+' clip'} value={choice} onChange={event=>{setChoice(event.target.value);setStart('0');setEnd('');}}><option value="">No clip</option>{missing&&<option value={choice}>Saved source unavailable in this cut</option>}{sources.map((s,index)=><option key={livingLightMediaKey(s.ref)} value={livingLightMediaKey(s.ref)}>{index+1}. {s.title} · {s.ref.shotId}</option>)}</select></label>
  {choice&&<><label><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Show clip</label><label>Start seconds <input aria-label={labels[surfaceId]+' start seconds'} type="number" min="0" step="0.1" value={start} onChange={e=>setStart(e.target.value)}/></label><label>End seconds <input aria-label={labels[surfaceId]+' end seconds'} placeholder="Clip end" type="number" min="0" step="0.1" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>At clip end <select value={loop} onChange={e=>setLoop(e.target.value)}><option value="loop">Loop</option><option value="hold">Hold final frame</option></select></label><label>Brightness <input type="number" min="0" max="2" step="0.1" value={brightness} onChange={e=>setBrightness(e.target.value)}/></label></>}
  {missing&&<p>Open the source cut to resolve this placement, or choose a replacement explicitly.</p>}
  <button type="button" onClick={apply}>Apply {labels[surfaceId].toLowerCase()}</button>{error&&<p role="alert">{error}</p>}
 </fieldset>;
}
export default function LivingLightMediaControls({thing,instanceId,slots,sources=[],disabled,onChange}){
 const surfaces=livingLightMediaSurfaces(thing);
 return <section className="living-light-media-controls" aria-label="Paint clips into this use"><h5>Paint clips into this use</h5><p>Choose videos from this Echo cut. Up to two surfaces per recipe; clips are muted and follow the song clock. Apply, then Study this recipe to preview.</p>
 {!surfaces.length?<p>This scene has no painted surface in the first preview. Try a continuous Tunnel, Fractal Loom, Silken Current, Media Weave, Solar Reliquary, or Tidal Observatory.</p>:<>{!sources.length&&<p>This cut has no resolved video choices.</p>}{surfaces.map(surfaceId=>{const placement=slots.find(s=>s.surfaceRef?.instanceId===instanceId&&s.surfaceRef.surfaceId===surfaceId);return <Surface key={instanceId+surfaceId+JSON.stringify(placement)} {...{surfaceId,instanceId,placement,sources,disabled,onChange}}/>;})}</>}
 </section>;
}
