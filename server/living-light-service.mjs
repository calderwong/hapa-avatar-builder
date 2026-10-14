import {resolveLivingLightMediaReferences} from '../src/domain/living-light-media-resolution.js';
import {exportLivingLightPackage,previewLivingLightImport,commitLivingLightImport,readLivingLightImport,PORTABLE_SCHEMA} from './living-light-portable.mjs';
import path from 'node:path';
import {livingLightCardTarget,livingLightEntityRef} from '../src/overcard/livingLight.js';
import {createHash} from 'node:crypto';
import {previewJourneyFork,forkPreviewContent} from '../src/domain/living-light-fork.js';
import {LivingLightStore} from './living-light-store.mjs';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {validateActor} from '../src/domain/living-light-contracts.js';

/** Native authoring owner. Caller provenance is supplied by the protected route,
 * never inferred from an actor name in client JSON. No automatic publication. */
export function createLivingLightService({root,storePath=path.join(root,'data/living-light/authoring.sqlite3'),registry=createLivingLightRegistry(),custodyOwner,resolveSong,resolveCut}={}){
 const store=new LivingLightStore({file:storePath,registry}),pending=new Map();
 const actor=caller=>{
  if(!caller||!['trusted-local-ui','authenticated-api'].includes(caller.mode))throw Object.assign(Error('Protected caller provenance required'),{code:'unauthorized',statusCode:401});
  validateActor(caller.actor);
  if(caller.mode==='authenticated-api'&&caller.actor.kind!=='agent')throw Object.assign(Error('API callers cannot claim human attribution'),{code:'human_attribution_denied',statusCode:403});
  if(caller.mode==='trusted-local-ui'&&(caller.actor.actorId!=='human:local-operator'||caller.actor.kind!=='human'))throw Object.assign(Error('UI attribution must be server-derived'),{code:'human_attribution_denied',statusCode:403});
  return caller.actor;
 };
 async function custody(id,who){
  if(store.identity(id)?.custody)return {state:'verified',rootReceipt:store.identity(id).custody};
  if(!custodyOwner)return {state:'pending',reason:'Existing Card custody owner unavailable'};
  if(!pending.has(id))pending.set(id,Promise.resolve().then(async()=>{try{const intent=store.pendingCustody(id);if(!intent)return {state:'not-created'};const result=await custodyOwner.ensure({card:intent.payload,actorId:who.actorId,evidenceRef:'living-light:explicit-durable-use'});store.recordCustody(id,result.receipt);return {state:'verified',rootReceipt:result.receipt};}catch{store.custodyFailure(id);return {state:'pending',reason:'Card birth is pending owner recovery; saved authoring remains intact'};}finally{pending.delete(id);}}));
  return pending.get(id);
 }
 const verifySong=async value=>{if(!resolveSong)throw Object.assign(Error('Canonical Song owner is unavailable'),{code:'song_owner_unavailable',statusCode:503});const song=await resolveSong(value.songId);if(!song||song.id!==value.songId)throw Object.assign(Error('The exact Song is not in the canonical library'),{code:'song_not_found',statusCode:404});};
 const forkKeys=['sourceRevisionId','targetSongId','title','durationUs','timingPolicy'];
 async function previewFork(journeyId,options){
  const saved=store.journey(journeyId,options?.sourceRevisionId);
  await verifySong({songId:options?.targetSongId});
  const preview=previewJourneyFork(saved.journey,options,{resolveThing:ref=>{try{return store.thing(ref.thingId,ref.revisionId).thing;}catch{return null;}}});
  return {...preview,previewDigest:createHash('sha256').update(forkPreviewContent(preview)).digest('hex')};
 }
 async function finishSave(result,who){const ids=[...new Set(result.journey.instances.map(i=>i.thingRef.thingId)),result.journey.journeyId],receipts=[];for(const id of ids)receipts.push({id,...await custody(id,who)});return {...result,custody:receipts.at(-1),moduleCustody:receipts.slice(0,-1)};}
 async function importPreview(packet){let songAvailable=true;if(packet?.journey){try{await verifySong(packet.journey);}catch{songAvailable=false;}}return previewLivingLightImport(store,packet,{songAvailable});}
 async function importCommit(request,caller){
  if(!request||typeof request!=='object'||Array.isArray(request))throw Object.assign(Error('A reviewed import request is required'),{code:'invalid_import',statusCode:422});
  for(const key of Object.keys(request))if(!['package','previewDigest','idempotencyKey'].includes(key))throw Object.assign(Error('Unsupported import field: '+key),{code:'unknown_field',statusCode:422});
  const who=actor(caller),preview=await importPreview(request.package),result=commitLivingLightImport(store,request.package,preview,request,who);
  const ids=new Set([...result.createdIds,result.root.kind==='journey'?result.root.journeyId:result.root.thingRef.thingId]);
  for(const entry of preview.plannedThings)ids.add(entry.thing.derivedFrom.thingId);
  const receipts=[];for(const id of ids)receipts.push({id,...await custody(id,who)});return {...result,custody:receipts};
 }
 function sharedCard(input){
  const target=livingLightCardTarget(input),record=target.kind==='thing'?store.thing(target.id,target.revision):store.journey(target.id,target.revision);
  return {target,entity:livingLightEntityRef(record,target.kind),custody:record.custody,publication:'not-acknowledged'};
 }
 async function prepareSharedCard(input,caller){
  const who=actor(caller),target=livingLightCardTarget(input);sharedCard(target); // Verify exact availability before any durable write.
  if(target.kind==='thing')store.materializeThing(target.id,who);
  await custody(target.id,who);return sharedCard(target);
 }
 return {store,sharedCard,prepareSharedCard,resolveMedia:refs=>resolveLivingLightMediaReferences(refs,{loadCut:resolveCut}),
  capabilities:()=>({schemaVersion:'hapa.living-light.capabilities.v1',schemas:{thing:'hapa.living-light.thing.v1',journey:'hapa.living-light.journey.v1',notes:'hapa.living-light.note.v1',signalBinding:'hapa.living-light.signal-binding.v1',mediaPlacement:'hapa.living-light.media-placement.v1',portable:PORTABLE_SCHEMA},authoring:['shared-card-exact-read','shared-card-explicit-custody','things','preset-revisions','archive','restore','journeys','journey-revisions','painted-media-placements','location-destination-pins','exact-cut-media-read','reviewed-forks','notes','note-history','import-preview','import-commit','metadata-export'],limits:{bodyBytes:1048576,pageRows:200,portableThingRevisions:100,portableNoteIdentities:200},actor:'server-derived; API clients are agents',publication:'local-pending; no automatic delivery',playback:'native continuous and authored tour study; up to two muted exact-cut video surfaces; visual qualification pending',preparation:'not implemented by this service; existing Atlas remains owner',finalEncoding:'unsupported'}),
  exportPackage:options=>exportLivingLightPackage(store,options),importPreview,importCommit,importRecord:id=>readLivingLightImport(store,id),
  importRefs:(entityId,{offset=0,limit=50}={})=>{if(typeof entityId!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/.test(entityId)||!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)throw Object.assign(Error('Exact entity and bounded page required'),{code:'invalid_page',statusCode:422});const db=store.open();if(!db)return {imports:[],total:0,nextOffset:null};const total=Number(db.prepare("SELECT count(*) n FROM intents WHERE entity_id=? AND kind='portable-import'").get(entityId).n);const rows=db.prepare("SELECT id FROM intents WHERE entity_id=? AND kind='portable-import' ORDER BY rowid LIMIT ? OFFSET ?").all(entityId,limit,offset);return {imports:rows.map(r=>({importId:r.id.slice('portable-import:'.length)})),total,nextOffset:offset+limit<total?offset+limit:null};},
registry,
  previewFork,
  forkJourney:async(journeyId,request,caller)=>{
   const who=actor(caller);if(!request||typeof request!=='object'||Array.isArray(request))throw Object.assign(Error('A fork request is required'),{code:'invalid_fork',statusCode:422});
   for(const key of Object.keys(request))if(![...forkKeys,'previewDigest','idempotencyKey'].includes(key))throw Object.assign(Error('Unsupported fork field: '+key),{code:'unknown_field',statusCode:422});
   const options=Object.fromEntries(forkKeys.map(key=>[key,request[key]])),preview=await previewFork(journeyId,options);
   if(request.previewDigest!==preview.previewDigest)throw Object.assign(Error('The conversion preview changed. Review it again before saving.'),{code:'fork_preview_mismatch',statusCode:409});
   const lineage={journeyId:preview.source.journeyId,revisionId:preview.source.revisionId,fork:{previewDigest:preview.previewDigest,timingPolicy:preview.timingPolicy,sourceSongId:preview.source.songId,plannedDurationUs:preview.target.plannedDurationUs,notesCopied:false}};
   return finishSave(store.saveJourney({journey:preview.journey,expectedRevision:null,idempotencyKey:request.idempotencyKey,lineage},who),who);
  },
  listJourneys:options=>store.listJourneys(options),journey:(id,revision)=>store.journey(id,revision),journeyHistory:(id,options)=>store.journeyHistory(id,options),
  validateJourney:async value=>{const validation=store.validateJourneyDraft(value);await verifySong(value);return validation;},
  saveJourney:async(request,caller)=>{const who=actor(caller);store.validateJourneyDraft(request.journey);await verifySong(request.journey);return finishSave(store.saveJourney(request,who),who);},
  listThings:options=>store.listThings(options),thing:(id,revision)=>store.thing(id,revision),thingHistory:(id,options)=>store.thingHistory(id,options),thingVisibilityHistory:(id,options)=>store.thingVisibilityHistory(id,options),
  setThingVisibility:async(id,archived,request,caller)=>{const who=actor(caller),result=store.setThingVisibility(id,archived,request,who),receipt=await custody(id,who);return {...result,custody:receipt};},
  savePreset:async(id,request,caller)=>{const who=actor(caller),result=store.savePreset({thingId:id,request},who);const parentCustody=await custody(result.thing.derivedFrom.thingId,who),receipt=await custody(result.thing.thingId,who);return {...result,custody:receipt,parentCustody};},
  notes:options=>store.notes(options),noteHistory:(id,options)=>store.noteHistory(id,options),
  materializeThing:async(id,caller)=>{const who=actor(caller);store.materializeThing(id,who);await custody(id,who);return store.thing(id);},
  saveNote:async(request,caller)=>{const who=actor(caller),result=store.saveNote(request,who),target=result.note.target;const receipt=target.kind==='thing'?await custody(target.thingId,who):{state:'not-requested'};return {...result,custody:receipt};},
  close:()=>store.close()};
}
