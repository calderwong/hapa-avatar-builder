import {LL_SCHEMAS,LIVING_LIGHT_MUSIC_ROLES,validateMusicResponse} from './living-light-contracts.js';
import {canonicalLivingLightRole} from './living-light-source-binding.js';
export const MUSIC_RESPONSE_VERSION='hapa.living-light.music-response.v1';
export function suggestLivingLightMusicResponse(performance,{preset='dance',intensity=1}={}){
 if(performance?.stemSelectionPolicy!=='coherent-stems-v1')throw Error('Prepare one coherent stem set before choosing musical movement.');
 const roles={};
 for(const bus of performance.buses.filter(b=>b.id!=='master')){
  const role=canonicalLivingLightRole(bus.declaredRole);if(!LIVING_LIGHT_MUSIC_ROLES.includes(role))continue;
  if(roles[role])throw Error('Musical movement requires one exact source per role.');
  roles[role]={schemaVersion:LL_SCHEMAS.signalBinding,sourceRefs:[{kind:'stem',assetId:bus.assetId}],feature:'energy',aggregation:'max',onUnavailable:'master'};
 }
 // These are explicit authored movement assignments, not claims of separated
 // bass, vocal or harmonic measurements in the master soundtrack.
 if(!Object.keys(roles).length)for(const role of ['bass','lead-vocals','synth'])roles[role]={schemaVersion:LL_SCHEMAS.signalBinding,sourceRefs:[{kind:'master'}],feature:'energy',aggregation:'max',onUnavailable:'master'};
 return validateMusicResponse({schemaVersion:MUSIC_RESPONSE_VERSION,preset,intensity,roles});
}
export function sampleLivingLightMusicRole(bank,response,role,feature,timeUs,known=new Set(bank.assets().map(a=>a.assetId))){
 const binding=response.roles[role];if(!binding)return {value:null,availability:'missing',reason:'movement-role-not-assigned'};
 const missing=binding.sourceRefs.some((s,i)=>s.kind==='stem'&&!known.has(s.assetId)&&(binding.aggregation!=='weighted-sum'||binding.weights[i]>0));
 const refs=binding.sourceRefs.filter(s=>s.kind==='master'||known.has(s.assetId));
 const weights=binding.weights?.filter((_,i)=>binding.sourceRefs[i].kind==='master'||known.has(binding.sourceRefs[i].assetId));
 const selected=missing?{value:null,availability:'unknown',reason:'asset-not-in-selected-source'}:refs.length?bank.aggregate({sourceRefs:refs,feature,operation:binding.aggregation,...(weights?{weights}: {})},timeUs):{value:0,availability:'silent',contributions:[]};
 const available=['present','silent'].includes(selected.availability);
 const fallback=!available&&binding.onUnavailable==='master'&&feature==='energy'?bank.sample('master','energy',timeUs):null;
 const effective=available?selected:fallback;
 const gain={gentle:.65,dance:1,surge:1.35}[response.preset]*response.intensity;
 return {value:effective?.value==null?null:Math.min(1,Math.max(0,effective.value*gain)),availability:effective?.availability||'missing',selected,fallback,state:available?'measured':fallback?'explicit-master-fallback':binding.onUnavailable==='block'?'blocked':'neutral-unavailable',sourceRefs:structuredClone(binding.sourceRefs),feature,role,gain};
}
