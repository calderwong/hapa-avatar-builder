import {validateSignalBinding,LL_SCHEMAS} from './living-light-contracts.js';
export const LIVING_LIGHT_ROUTING_VERSION='exact-source-ports-to-native-offsets-v1';
/** Stateless source-time evaluation. No role joins, inferred alignment, audible
 * mixer or last-frame history; backward seeks give the same result. */
export function createLivingLightSignalRouter({journey,registry,bank}) {
 const known=new Set(bank.assets().map(asset=>asset.assetId));
 for(const instance of journey.instances)for(const [portId,binding]of Object.entries(instance.bindings)){
  if(binding.schemaVersion!==LL_SCHEMAS.signalBinding)throw Object.assign(Error('Re-select legacy signal choices as exact sources before previewing.'),{code:'legacy_signal_binding_unqualified'});
  validateSignalBinding(binding,registry.resolveThing(instance.thingRef).signalPorts.find(port=>port.portId===portId));
 }
 function evaluate(timelineUs,signalUs=timelineUs) {
  const row=journey.schedule.find(row=>timelineUs>=row.startUs&&timelineUs<row.endUs)||(timelineUs===journey.schedule.at(-1).endUs?journey.schedule.at(-1):null);
  if(!row)throw Error('Signal time is outside the Journey schedule.');
  const instance=journey.instances.find(instance=>instance.instanceId===row.instanceId),ports={};
  for(const [portId,binding]of Object.entries(instance.bindings)){
   const missing=ref=>ref.kind==='stem'&&!known.has(ref.assetId),absent=binding.sourceRefs.filter((ref,i)=>missing(ref)&&(binding.aggregation!=='weighted-sum'||binding.weights[i]>0));
   const retained=binding.sourceRefs.map((ref,i)=>({ref,weight:binding.weights?.[i]})).filter(({ref})=>!missing(ref));
   const result=absent.length?{value:null,availability:'unknown',reason:'asset-not-in-selected-source',missingSourceRefs:structuredClone(absent)}:!retained.length?{value:0,availability:'silent',contributions:[]}:bank.aggregate({sourceRefs:retained.map(item=>item.ref),feature:binding.feature,operation:binding.aggregation,weights:binding.weights?retained.map(item=>item.weight):undefined},signalUs);
   result.sourceRefs=structuredClone(binding.sourceRefs);
   const available=['present','silent'].includes(result.availability),policy=binding.onUnavailable;
   const fallback=!available&&policy==='master'?bank.sample({kind:'master'},'energy',signalUs):null;
   ports[portId]={feature:binding.feature,selected:result,policy,effectiveValue:available?result.value:fallback?.value??0,state:available?'measured':fallback?'explicit-master-fallback':policy==='block'?'blocked':'neutral-unavailable',fallback};
  }
  const offsets={};
  // An explicit energy binding replaces the global basic-master response. An
  // unavailable neutral selection never silently inherits the master offsets.
  const energy=ports.energy?.effectiveValue;
  if(energy!==undefined)Object.assign(offsets,{'material.emission':.4*energy,'world.breath':.05*energy});
  if(ports.onset)offsets['world.impulse']=.25*ports.onset.effectiveValue;
  return {version:LIVING_LIGHT_ROUTING_VERSION,instanceId:instance.instanceId,timelineUs,signalUs,ports,offsets,blocked:Object.values(ports).some(port=>port.state==='blocked')};
 }
 return {evaluate};
}
