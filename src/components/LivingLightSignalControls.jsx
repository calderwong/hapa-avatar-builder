import {useState} from 'react';
import {LL_SCHEMAS,signalSourceKey,validateSignalBinding} from '../domain/living-light-contracts.js';
function Port({port,binding,assets,disabled,onChange}) {
 const current=binding?.schemaVersion===LL_SCHEMAS.signalBinding?binding:null;
 const [choice,setChoice]=useState(()=>current?structuredClone(current):{schemaVersion:LL_SCHEMAS.signalBinding,sourceRefs:port.feature==='energy'?[{kind:'master'}]:[],feature:port.feature,aggregation:'max',onUnavailable:'neutral'});
 const sources=[{ref:{kind:'master'},label:'Song master',state:port.feature==='energy'?'Measured energy when prepared':'Onset unavailable'},...assets.map(asset=>({ref:{kind:'stem',assetId:asset.assetId},label:`${asset.declaredRole} · ${asset.assetId}`,state:asset.state}))];
 for(const ref of choice.sourceRefs)if(!sources.some(source=>signalSourceKey(source.ref)===signalSourceKey(ref)))sources.push({ref,label:ref.assetId||'Song master',state:'Not in current prepared source'});
 let error=null;try{validateSignalBinding(choice,port);}catch(caught){error=caught.message;}
 const update=patch=>setChoice(value=>({...value,...patch}));
 function toggle(ref,checked) {
  const key=signalSourceKey(ref),index=choice.sourceRefs.findIndex(source=>signalSourceKey(source)===key);
  const refs=checked?[...choice.sourceRefs,ref]:choice.sourceRefs.filter((_,i)=>i!==index),weights=choice.aggregation==='weighted-sum'?(checked?[...choice.weights,0]:choice.weights.filter((_,i)=>i!==index)):undefined;
  setChoice(value=>{const next={...value,sourceRefs:refs};if(weights)next.weights=weights;return next;});
 }
 return <fieldset disabled={disabled} className="living-light-signal-port"><legend>{port.feature==='energy'?'Loudness response':'Attack response'}</legend>
  <p>{port.feature==='energy'?'Adds emission and structural breath. Without an override, prepared basic master loudness is used.':'Adds a bounded light impulse from measured loudness changes. This is not certified beat timing.'}</p>
  {binding&&!current&&<p>Older audio choice is kept in the recipe. Re-select exact sources here before using it in a preview.</p>}
  <div className="living-light-signal-sources">{sources.map(source=>{const key=signalSourceKey(source.ref),index=choice.sourceRefs.findIndex(ref=>signalSourceKey(ref)===key);return <div key={key}><label><input type="checkbox" checked={index>=0} onChange={event=>toggle(source.ref,event.target.checked)}/>{source.label}</label><small>{source.state}</small>{choice.aggregation==='weighted-sum'&&index>=0&&<label>Weight for {source.label}<input aria-label={`${port.portId} weight ${source.label}`} type="number" min="0" max="1" step="0.05" value={choice.weights[index]} onChange={event=>update({weights:choice.weights.map((weight,i)=>i===index?Number(event.target.value):weight)})}/></label>}</div>;})}</div>
  <label>Combine selected signals <select aria-label={`${port.portId} combination`} value={choice.aggregation} onChange={event=>setChoice(value=>{const next={...value,aggregation:event.target.value};if(next.aggregation==='weighted-sum')next.weights=next.sourceRefs.map(()=>0);else delete next.weights;return next;})}><option value="max">Strongest signal</option><option value="mean">Average</option><option value="weighted-sum">Weighted sum</option></select></label>
  {choice.aggregation==='weighted-sum'&&<p>Weights total at most 1. A zero weight excludes that source from the response.</p>}
  <label>If a selected signal is unavailable <select aria-label={`${port.portId} unavailable policy`} value={choice.onUnavailable} onChange={event=>update({onUnavailable:event.target.value})}><option value="neutral">Keep this response neutral</option><option value="block">Block visual response until signals are available</option>{port.feature==='energy'&&<option value="master">Use the song master explicitly</option>}</select></label>
  <div className="living-light-card-actions"><button type="button" disabled={!!error} onClick={()=>onChange(choice)}>Apply {port.portId} choice to this use</button><button type="button" disabled={!binding} onClick={()=>onChange(null)}>Remove {port.portId} override</button></div>
  {error&&<p role="status">{error}</p>}
 </fieldset>;
}
/** Draft controls only; the existing Journey owner saves revisions/custody. */
export default function LivingLightSignalControls({thing,bindings,performance,disabled,onChange}) {
 const assets=(performance?.buses||[]).filter(bus=>bus.id!=='master').map(bus=>({assetId:bus.assetId,declaredRole:bus.declaredRole,state:bus.frames?.length?'Measured · timing unverified':'Measurements unavailable'}));
 return <details className="living-light-signal-controls"><summary>Audio choices for this use</summary><p>Visual participation is separate from the audible source. Stem timing needs an applied owner map; an unavailable selection keeps its saved intent.</p>{!performance&&<p>Prepare this song’s signals above to list its exact stems.</p>}{thing.signalPorts.map(port=><Port key={port.portId+':'+JSON.stringify(bindings[port.portId]||null)} port={port} binding={bindings[port.portId]} assets={assets} disabled={disabled} onChange={binding=>onChange(port.portId,binding)}/>)}</details>;
}
