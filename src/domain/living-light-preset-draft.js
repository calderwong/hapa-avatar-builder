import {canonicalJSON,validateRef,validateParameterValue} from './living-light-contracts.js';
import {effectiveThingParameters} from './living-light-preset.js';
export function presetDraftKey(thing,mode='create'){return 'hapa.living-light.preset-draft.v1:'+mode+':'+thing.thingId+'@'+thing.revisionId;}
export function readPresetDraft(raw,thing,mode='create'){
 try{
  if(typeof raw!=='string'||raw.length>65536)return null;const saved=JSON.parse(raw),ref=mode==='revise'?thing.derivedFrom:{thingId:thing.thingId,revisionId:thing.revisionId};validateRef(ref);
  if(typeof saved.title!=='string'||saved.title.length>200||typeof saved.summary!=='string'||saved.summary.length>4000||!saved.parameters||typeof saved.parameters!=='object'||Array.isArray(saved.parameters))return null;
  for(const [key,value]of Object.entries(saved.parameters)){if(!Object.hasOwn(thing.parameters,key))return null;validateParameterValue(thing.parameters[key],value);}
  const value={title:saved.title,summary:saved.summary,parameters:saved.parameters},fingerprint=canonicalJSON({derivedFrom:ref,...value,expectedRevision:mode==='revise'?thing.revisionId:null});
  if(saved.pending?.fingerprint===fingerprint&&typeof saved.pending.key==='string'&&saved.pending.key.length<=256&&/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(saved.pending.key))value.pending={fingerprint,key:saved.pending.key};return value;
 }catch{return null;}
}
export function initialPresetDraft(thing,parameters={},mode='create'){return {title:mode==='revise'?thing.title:thing.title.slice(0,191)+' — preset',summary:thing.summary,parameters:effectiveThingParameters(thing,parameters)};}
