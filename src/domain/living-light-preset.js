import {validateRef,validateParameterValue,validateThing,LivingLightValidationError,canonicalJSON} from './living-light-contracts.js';
const fail=(code,message)=>{throw new LivingLightValidationError(code,'preset',message);};
/** Metadata/defaults only. A request can never introduce a renderer or capability. */
export function presetDefinition(parent,request,{thingId,revisionId,implementations}){
 if(!request||typeof request!=='object'||Array.isArray(request))fail('invalid_preset','A preset request is required');
 for(const key of Object.keys(request))if(!['derivedFrom','title','summary','parameters','expectedRevision','idempotencyKey'].includes(key))fail('unknown_field','Unsupported preset field: '+key);
 validateRef(request.derivedFrom,'derivedFrom');
 if(request.derivedFrom.thingId!==parent.thingId||request.derivedFrom.revisionId!==parent.revisionId)fail('preset_parent_mismatch','The exact parent revision is required');
 if(!request.parameters||typeof request.parameters!=='object'||Array.isArray(request.parameters))fail('invalid_preset_parameters','Provide parameter overrides as an object');
 const value={...structuredClone(parent),thingId,revisionId,title:request.title,summary:request.summary,derivedFrom:structuredClone(request.derivedFrom),aliasOf:null,previewRef:null,readiness:{state:'catalogued',reasons:['New preset defaults require independent visual qualification; measured signals and final rendering remain unqualified'],evidenceRefs:[]}};
 for(const [key,setting]of Object.entries(request.parameters)){
  if(!Object.hasOwn(value.parameters,key))fail('unknown_parameter','Unknown preset control: '+key);
  validateParameterValue(value.parameters[key],setting,'parameters.'+key);value.parameters[key].default=structuredClone(setting);
 }
 validateThing(value,{implementations});return value;
}
export function effectiveThingParameters(thing,overrides={}){
 const value=Object.fromEntries(Object.entries(thing.parameters).map(([key,def])=>[key,structuredClone(def.default)]));
 for(const [key,setting]of Object.entries(overrides)){
  if(!Object.hasOwn(thing.parameters,key))fail('unknown_parameter','Unknown instance control: '+key);
  validateParameterValue(thing.parameters[key],setting,'parameters.'+key);value[key]=structuredClone(setting);
 }return value;
}
/** Retained pinned revisions resolve separately from visible latest heads. */
export function extendLivingLightRegistry(base,heads=[],revisions=[],{hiddenThingIds=[]}={}){
 const byKey=new Map(base.entries.map(t=>[t.thingId+'@'+t.revisionId,t])),nativeHeads=new Map();
 const admit=thing=>{
  validateThing(thing,{implementations:base.implementations});
  if(!thing.thingId.startsWith('ll-preset:')||!thing.derivedFrom)fail('invalid_preset_identity','Only native preset records may extend the source catalog');
  const key=thing.thingId+'@'+thing.revisionId,old=byKey.get(key);if(old&&canonicalJSON(old)!==canonicalJSON(thing))fail('preset_revision_conflict','A retained revision cannot change');
  byKey.set(key,structuredClone(thing));
 };
 // Admit parent chains first; source membership and inherited execution fields are checked below.
 for(const thing of [...revisions,...heads])admit(thing);
 for(const thing of [...revisions,...heads]){
  const parent=byKey.get(thing.derivedFrom.thingId+'@'+thing.derivedFrom.revisionId);if(!parent)fail('preset_parent_unavailable','The exact preset parent must be retained');
  const expected=presetDefinition(parent,{derivedFrom:thing.derivedFrom,title:thing.title,summary:thing.summary,parameters:Object.fromEntries(Object.entries(thing.parameters).map(([key,def])=>[key,def.default]))},{thingId:thing.thingId,revisionId:thing.revisionId,implementations:base.implementations});
  if(canonicalJSON(expected)!==canonicalJSON(thing))fail('preset_inheritance_mismatch','Presets may change presentation and defaults only');
 }
 for(const thing of heads)nativeHeads.set(thing.thingId,byKey.get(thing.thingId+'@'+thing.revisionId));
 const hidden=new Set(hiddenThingIds);
 return Object.freeze({...base,entries:Object.freeze([...base.entries,...nativeHeads.values()].filter(thing=>!hidden.has(thing.thingId))),resolveThing:ref=>byKey.get(ref.thingId+'@'+ref.revisionId)||null});
}
