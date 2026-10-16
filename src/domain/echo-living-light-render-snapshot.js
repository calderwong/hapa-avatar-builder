import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {canonicalJSON,validateJourney} from './living-light-contracts.js';
import {validateEchoLivingLightCues,resolveEchoLivingLightCue} from './echo-living-light-cues.js';
import {extendLivingLightRegistry} from './living-light-preset.js';
import {livingLightMediaKey} from './living-light-media.js';
import {livingLightPreparedBinding,livingLightDurationMatches} from './living-light-prepared-binding.js';
import {createLivingLightFeatureBank} from './living-light-features.js';
import {createLivingLightRegistry} from '../living-light/registry.js';

export const ECHO_LIVING_LIGHT_RENDER_SCHEMA='hapa.echo.living-light-render.v1';
export const livingLightRenderDigest=value=>bytesToHex(sha256(new TextEncoder().encode(canonicalJSON(value))));
const key=ref=>JSON.stringify([ref.journeyId,ref.revisionId]);
const fail=message=>{throw Object.assign(Error(message),{code:'living_light_render_snapshot_invalid'});};
const fields=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Unsupported render snapshot fields.');};
const same=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
function portable(value){
 if(typeof value==='string'&&(/(?:\/Users\/|file:\/\/|[A-Za-z]:\\|\/private\/|\/var\/folders\/)/i.test(value)||/https?:\/\/[^\s/]+:[^\s/]+@/i.test(value)))fail('Render metadata cannot carry raw workstation paths or URL credentials.');
 if(value&&typeof value==='object')for(const [name,child]of Object.entries(value)){if(/^(token|bearer|secret|password|privateKey|authorization|custody|rootReceipt)$/i.test(name))fail('Render metadata cannot carry credentials or custody authority.');portable(child);}
}

/** Immutable export input, separate from mutable authoring or execution authority.
 * Only catalog implementations and inherited preset defaults can be admitted. */
export function validateLivingLightRenderSnapshot(snapshot,{cues,songId,durationUs}={}){
 fields(snapshot,['schemaVersion','songId','durationUs','cues','recipes','preparedSource','snapshotDigest']);
 const {snapshotDigest,...body}=snapshot;
 portable(body);
 if(new TextEncoder().encode(canonicalJSON(body)).byteLength>64*1024**2)fail('Render metadata exceeds 64 MiB.');
 if(snapshot.schemaVersion!==ECHO_LIVING_LIGHT_RENDER_SCHEMA||!/^[a-f0-9]{64}$/.test(snapshotDigest)||livingLightRenderDigest(body)!==snapshotDigest)fail('Render snapshot content digest differs.');
 if(!Number.isSafeInteger(snapshot.durationUs)||snapshot.durationUs<1||snapshot.durationUs>1800e6)fail('A bounded exact song duration is required.');
 validateEchoLivingLightCues(snapshot.cues,{songId:snapshot.songId,durationUs:snapshot.durationUs});
 if(!snapshot.cues.length||!Array.isArray(snapshot.recipes)||snapshot.recipes.length>128)fail('A bounded nonempty cue snapshot is required.');
 if((songId!==undefined&&songId!==snapshot.songId)||(durationUs!==undefined&&durationUs!==snapshot.durationUs)||(cues!==undefined&&!same(cues,snapshot.cues)))fail('The snapshot belongs to another cut or song timeline.');
 const base=createLivingLightRegistry(),recipes=new Map(),needed=new Set(snapshot.cues.map(c=>key(c.journeyRef)));
 let bound=false;
 for(const row of snapshot.recipes){
  fields(row,['package','sources']);const packet=row.package;
  if(!packet||packet.schemaVersion!=='hapa.living-light.package.v1'||packet.root?.kind!=='journey'||packet.noteHistories?.length!==0)fail('Use the owner’s exact Journey metadata export without notes.');
  const {packageDigest,...packageBody}=packet;
  if(livingLightRenderDigest(packageBody)!==packageDigest)fail('Journey package content digest differs.');
  const journey=packet.journey,id=key(packet.root.journeyRef);
  if(!needed.has(id)||recipes.has(id)||id!==key(journey||{}))fail('Unexpected, duplicate or mismatched Journey revision.');
  if(!Array.isArray(packet.things)||!packet.things.length||packet.things.length>100)fail('A bounded exact module list is required.');
  const refs=new Set(),presets=[];
  for(const thing of packet.things){
   const ref={thingId:thing.thingId,revisionId:thing.revisionId},identity=canonicalJSON(ref);
   if(refs.has(identity))fail('Duplicate module revision.');refs.add(identity);
   const original=base.resolveThing(ref);
   if(original){if(!same(original,thing))fail('A source module definition changed.');}else presets.push(thing);
  }
  for(const thing of packet.things)for(const parent of [thing.derivedFrom,thing.aliasOf].filter(Boolean))if(!refs.has(canonicalJSON(parent)))fail('An exact module parent is absent.');
  const registry=extendLivingLightRegistry(base,[],presets);
  for(const instance of journey.instances||[])if(!refs.has(canonicalJSON(instance.thingRef)))fail('A Journey module was omitted.');
  validateJourney(journey,{resolveThing:registry.resolveThing});
  if(journey.songId!==snapshot.songId)fail('The Journey belongs to another song.');
  bound ||= !!journey.sourceBindingRef||journey.instances.some(i=>Object.keys(i.bindings).length);
  const mediaRefs=new Map(journey.mediaSlots.filter(s=>s.enabled&&s.mediaRef).map(s=>[livingLightMediaKey(s.mediaRef),s.mediaRef]));
  if(!Array.isArray(row.sources)||row.sources.length!==mediaRefs.size)fail('Every enabled painted source must be packaged exactly once.');
  const seen=new Set();
  for(const source of row.sources){
   fields(source,['ref','uri','sha256','bytes','identityBasis']);const sourceKey=livingLightMediaKey(source.ref||{});
   if(!mediaRefs.has(sourceKey)||seen.has(sourceKey))fail('A painted source differs from the saved reference.');seen.add(sourceKey);
   if(!/^[a-f0-9]{64}$/.test(source.sha256)||!Number.isSafeInteger(source.bytes)||source.bytes<1||source.bytes>2*1024**3||source.identityBasis!=='exact-cut-source-declaration-and-packaged-bytes')fail('A bounded content-addressed video is required.');
   if(!new RegExp('^assets/living-light/'+source.sha256+'\\.(mp4|webm|mov|m4v)$').test(source.uri))fail('Painted media must use a package-local content address.');
  }
  recipes.set(id,{journey,registry,sources:row.sources});
 }
 if(recipes.size!==needed.size)fail('A referenced Journey revision was omitted.');
 for(const cue of snapshot.cues)resolveEchoLivingLightCue(cue,{resolveJourney:()=>recipes.get(key(cue.journeyRef))?.journey});
 if(bound&&!snapshot.preparedSource)fail('Saved audio choices need their exact prepared source.');
 if(snapshot.preparedSource){
  fields(snapshot.preparedSource,['performance','playbackReceipt']);
  const {performance,playbackReceipt}=snapshot.preparedSource;
  if(playbackReceipt?.sourceSelection?.kind==='stem')fail('A stem audition cannot replace the song master.');
  const binding=livingLightPreparedBinding({songId:snapshot.songId,performance,playbackReceipt});
  const bank=createLivingLightFeatureBank({songId:snapshot.songId,performance,playbackReceipt,sourceBinding:binding});
  // Authored decimal seconds and decoded PCM can round opposite sides of the
  // terminal sample. Admit at most one sample (rounded to integer microseconds),
  // without stretching the bank or changing its exact source coordinates.
  try{if(!livingLightDurationMatches(bank.identity.durationUs,snapshot.durationUs,playbackReceipt.sampleRate))fail('Prepared signals differ from the song timeline.');}finally{bank.dispose();}
  for(const {journey}of recipes.values())if(journey.sourceBindingRef&&!same(journey.sourceBindingRef,{bindingId:binding.bindingId,revisionId:binding.revisionId}))fail('A saved audio-binding revision differs from packaged preparation.');
 }
 return {recipes,songId:snapshot.songId,durationUs:snapshot.durationUs,cues:snapshot.cues,preparedSource:snapshot.preparedSource};
}
