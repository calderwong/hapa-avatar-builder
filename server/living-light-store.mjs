import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {presetDefinition} from '../src/domain/living-light-preset.js';
import {canonicalJSON,validateActor,validateRef,validateNote,validateJourney,LivingLightValidationError} from '../src/domain/living-light-contracts.js';

const sha=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const fail=(code,message,status=422,detail={})=>{throw Object.assign(new LivingLightValidationError(code,'authoring',message),{statusCode:status,...detail});};
const boundedId=(value,label)=>{if(typeof value!=='string'||value.length>256||!/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(value))fail('invalid_id',`${label} must be a stable identifier`);return value;};
const targetKey=target=>target.kind==='thing'?`thing:${target.thingId}`:target.kind==='journey'?`journey:${target.journeyId}`:`instance:${target.journeyId}:${target.observedRevisionId}:${target.instanceId}`;

/** Builder-owned native discussion. Reads do not create databases or Card cores.
 * Immutable revisions, CAS heads and idempotency receipts share one transaction.
 * Hypercore/outbox delivery is a separate, crash-recoverable pending intent. */
export class LivingLightStore {
 constructor({file,registry,now=()=>new Date().toISOString()}={}){
  if(!file||!registry)throw Error('Authoring path and exact registry required');
  this.file=file;this.registry=registry;this.now=now;this.db=null;
 }
 open(create=false){
  if(this.db)return this.db;
  if(!create&&!existsSync(this.file))return null;
  if(create)mkdirSync(path.dirname(this.file),{recursive:true});
  const db=new DatabaseSync(this.file);db.exec('PRAGMA busy_timeout=2000; PRAGMA foreign_keys=ON;');
  const version=Number(db.prepare('PRAGMA user_version').get().user_version);
  if(version!==0&&version!==1){db.close();fail('authoring_migration_required','Unsupported authoring store version; preserve and migrate explicitly',409);}
  if(version===0){
   if(!create){db.close();fail('authoring_migration_required','Store has not been initialized',409);}
   db.exec(`PRAGMA journal_mode=WAL; BEGIN IMMEDIATE;
    CREATE TABLE identities(id TEXT PRIMARY KEY,kind TEXT NOT NULL,head TEXT,card_snapshot TEXT NOT NULL,custody_json TEXT,custody_state TEXT NOT NULL DEFAULT 'pending');
    CREATE TABLE revisions(entity_id TEXT NOT NULL,revision_id TEXT NOT NULL,revision_number INTEGER NOT NULL,parent_revision_id TEXT,semantic_digest TEXT NOT NULL,payload_json TEXT NOT NULL,actor_json TEXT NOT NULL,occurred_at TEXT NOT NULL,PRIMARY KEY(entity_id,revision_id),UNIQUE(entity_id,revision_number),FOREIGN KEY(entity_id) REFERENCES identities(id));
    CREATE TABLE note_heads(note_id TEXT PRIMARY KEY,target_key TEXT NOT NULL,target_json TEXT NOT NULL,head TEXT NOT NULL,retracted INTEGER NOT NULL DEFAULT 0,FOREIGN KEY(note_id) REFERENCES identities(id));
    CREATE INDEX note_target ON note_heads(target_key,note_id);
    CREATE TABLE intents(id TEXT PRIMARY KEY,entity_id TEXT NOT NULL,kind TEXT NOT NULL,payload_json TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'pending',last_error TEXT,FOREIGN KEY(entity_id) REFERENCES identities(id));
    CREATE TABLE requests(actor_id TEXT NOT NULL,idempotency_key TEXT NOT NULL,request_digest TEXT NOT NULL,response_json TEXT NOT NULL,PRIMARY KEY(actor_id,idempotency_key));
    PRAGMA user_version=1; COMMIT;`);
  }
  this.db=db;return db;
 }
 close(){this.db?.close();this.db=null;}
 transaction(fn){const db=this.open(true);db.exec('BEGIN IMMEDIATE');try{const value=fn(db);db.exec('COMMIT');return value;}catch(error){db.exec('ROLLBACK');throw error;}}
 identity(id){const row=this.open()?.prepare('SELECT * FROM identities WHERE id=?').get(id);return row?{...row,card:JSON.parse(row.card_snapshot),custody:row.custody_json?JSON.parse(row.custody_json):null}:null;}
 insertIdentity(db,id,kind,snapshot){db.prepare('INSERT OR IGNORE INTO identities(id,kind,card_snapshot) VALUES(?,?,?)').run(id,kind,canonicalJSON(snapshot));}
 materializeThingInTransaction(db,thing){
  const id=thing.thingId,snapshot={id,cardId:id,title:thing.title,summary:thing.summary,cardType:thing.kind==='location'?'living_light_location':'living_light_tunnel',sourceKind:'living-light',revisionId:thing.revisionId,tags:thing.tags,attribution:{creator:thing.source.attribution,source:'Hapa Living Light 109',license:thing.source.rights},sourceRefs:[{kind:'living-light-source',cardId:id,revisionId:thing.revisionId,recordDigest:thing.source.artifactDigest,label:thing.source.moduleId}]};
  this.insertIdentity(db,id,'thing',snapshot);
  const existing=db.prepare('SELECT head FROM identities WHERE id=?').get(id);
  if(!existing.head){db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?,?)').run(id,thing.revisionId,1,null,sha(thing),canonicalJSON(thing),canonicalJSON({actorId:'agent:living-light-source-import',kind:'agent',displayName:'Living Light source definition'}),this.now());db.prepare('UPDATE identities SET head=? WHERE id=?').run(thing.revisionId,id);
   db.prepare('INSERT INTO intents(id,entity_id,kind,payload_json) VALUES(?,?,?,?)').run(`custody:${id}`,id,'card-birth',canonicalJSON(snapshot));
  }
 }
 thing(id,revisionId){
  const identity=this.identity(id);if(identity&&identity.kind!=='thing')fail('thing_revision_not_found','This identity is not a Thing',404);const pinned=revisionId||identity?.head;
  const native=pinned?this.open()?.prepare('SELECT * FROM revisions WHERE entity_id=? AND revision_id=?').get(id,pinned):null;
  const definition=native?JSON.parse(native.payload_json):this.registry.entries.find(t=>t.thingId===id&&(!revisionId||t.revisionId===revisionId));
  if(!definition)fail('thing_revision_not_found','This Thing revision is unavailable',404);
  const count=this.open()?.prepare('SELECT count(*) n FROM note_heads WHERE target_key=? AND retracted=0').get(`thing:${id}`)?.n||0;
  return {thing:structuredClone(definition),authoringRevisionId:definition.revisionId,revisionNumber:native?Number(native.revision_number):1,parentRevisionId:native?.parent_revision_id||null,actor:native?JSON.parse(native.actor_json):null,occurredAt:native?.occurred_at||null,currentHead:identity?.head||definition.revisionId,noteCount:Number(count),usedIn:this.thingUses(id),custody:{state:identity?.custody?'verified':identity?'pending':'not-created',rootReceipt:identity?.custody||null},publication:'not-acknowledged',visibility:this.thingVisibility(id)};
 }
 listThings({kind,variantKind,search='',offset=0,limit=100,includeArchived=false}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200||typeof search!=='string'||search.length>200)fail('invalid_page','Use a bounded metadata page');
  if(typeof includeArchived!=='boolean')fail('invalid_filter','includeArchived must be boolean');
  if(kind&&!['tunnel','location'].includes(kind))fail('invalid_filter','Unknown Thing kind');
  if(variantKind&&!['continuous-profile','passage-style','destination'].includes(variantKind))fail('invalid_filter','Unknown variant');
  const query=search.trim().toLowerCase(),rows=this.registry.entries.filter(t=>(includeArchived||!this.thingVisibility(t.thingId).archived)&&(!kind||t.kind===kind)&&(!variantKind||t.variantKind===variantKind)&&(!query||[t.title,t.summary,...t.tags].join(' ').toLowerCase().includes(query)));
  const db=this.open(),where=`i.kind='thing' AND i.id GLOB 'll-preset:*' AND (?=1 OR COALESCE((SELECT json_extract(v.payload_json,'$.archived') FROM intents v WHERE v.entity_id=i.id AND v.kind='thing-visibility' ORDER BY v.rowid DESC LIMIT 1),0)=0) AND (? IS NULL OR json_extract(r.payload_json,'$.kind')=?) AND (? IS NULL OR json_extract(r.payload_json,'$.variantKind')=?) AND (?='' OR instr(lower(json_extract(r.payload_json,'$.title')||' '||json_extract(r.payload_json,'$.summary')||' '||json_extract(r.payload_json,'$.tags')),?)>0)`,args=[includeArchived?1:0,kind||null,kind||null,variantKind||null,variantKind||null,query,query];
  const nativeTotal=db?Number(db.prepare(`SELECT count(*) n FROM identities i JOIN revisions r ON r.entity_id=i.id AND r.revision_id=i.head WHERE ${where}`).get(...args).n):0,total=rows.length+nativeTotal,sourceRows=rows.slice(offset,offset+limit),remaining=limit-sourceRows.length;
  const nativeRows=db&&remaining?db.prepare(`SELECT i.id FROM identities i JOIN revisions r ON r.entity_id=i.id AND r.revision_id=i.head WHERE ${where} ORDER BY i.id LIMIT ? OFFSET ?`).all(...args,remaining,Math.max(0,offset-rows.length)):[];
  return {things:[...sourceRows.map(t=>this.thing(t.thingId)),...nativeRows.map(row=>this.thing(row.id))],total,nextOffset:offset+limit<total?offset+limit:null,analysisExecuted:false};
 }
 thingUses(id){
  const db=this.open();if(!db)return [];
  return db.prepare(`SELECT i.id,r.revision_id,r.payload_json FROM identities i JOIN revisions r ON r.entity_id=i.id AND r.revision_id=i.head WHERE i.kind='journey' AND EXISTS (SELECT 1 FROM json_each(r.payload_json,'$.instances') x WHERE json_extract(x.value,'$.thingRef.thingId')=?) ORDER BY i.id LIMIT 100`).all(id).map(row=>{const value=JSON.parse(row.payload_json);return {journeyId:row.id,revisionId:row.revision_id,title:value.title,songId:value.songId};});
 }
 journey(id,revisionId){
  const identity=this.identity(id);if(!identity||identity.kind!=='journey')fail('journey_not_found','Saved Journey is unavailable',404);
  const row=this.open().prepare('SELECT * FROM revisions WHERE entity_id=? AND revision_id=?').get(id,revisionId||identity.head);if(!row)fail('journey_revision_not_found','Pinned Journey revision is unavailable',404);
  const value=JSON.parse(row.payload_json),count=this.open().prepare('SELECT count(*) n FROM note_heads WHERE target_key=? AND retracted=0').get(`journey:${id}`).n;
  return {journey:value,revisionNumber:Number(row.revision_number),actor:JSON.parse(row.actor_json),occurredAt:row.occurred_at,currentHead:identity.head,noteCount:Number(count),lineage:identity.card.lineage||null,custody:{state:identity.custody?'verified':'pending',rootReceipt:identity.custody},publication:'not-acknowledged',previewOnly:true,finalRenderUnsupported:true};
 }
 listJourneys({songId,search='',offset=0,limit=100}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200||typeof search!=='string'||search.length>200)fail('invalid_page','Use a bounded Journey page');
  if(songId)boundedId(songId,'Song ID');const db=this.open();if(!db)return {journeys:[],total:0,nextOffset:null,analysisExecuted:false};
  const where=`i.kind='journey' AND (? IS NULL OR json_extract(r.payload_json,'$.songId')=?) AND (?='' OR instr(lower(json_extract(r.payload_json,'$.title')),lower(?))>0)`,args=[songId||null,songId||null,search.trim(),search.trim()];
  const total=Number(db.prepare(`SELECT count(*) n FROM identities i JOIN revisions r ON r.entity_id=i.id AND r.revision_id=i.head WHERE ${where}`).get(...args).n);
  const rows=db.prepare(`SELECT i.id FROM identities i JOIN revisions r ON r.entity_id=i.id AND r.revision_id=i.head WHERE ${where} ORDER BY i.id LIMIT ? OFFSET ?`).all(...args,limit,offset);
  return {journeys:rows.map(row=>this.journey(row.id)),total,nextOffset:offset+limit<total?offset+limit:null,analysisExecuted:false};
 }
 journeyHistory(id,{offset=0,limit=100}={}){
  this.journey(id);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)fail('invalid_page','Use a bounded revision page');
  const db=this.open(),total=Number(db.prepare('SELECT count(*) n FROM revisions WHERE entity_id=?').get(id).n),rows=db.prepare('SELECT revision_id FROM revisions WHERE entity_id=? ORDER BY revision_number LIMIT ? OFFSET ?').all(id,limit,offset);
  return {revisions:rows.map(row=>this.journey(id,row.revision_id)),total,nextOffset:offset+limit<total?offset+limit:null};
 }
 validateJourneyDraft(value){
  if(!value||typeof value!=='object'||Array.isArray(value))fail('invalid_journey','A Journey draft is required');
  const allowed=['schemaVersion','title','songId','sourceBindingRef','state','mode','seed','instances','schedule','actorTreatment','motion','mediaSlots'];for(const key of Object.keys(value))if(!allowed.includes(key))fail('unknown_field','Unsupported Journey field: '+key);
  // Source admission is deliberately independent of authoring. A draft never
  // promotes an unverified timeline, module or signal to playable readiness.
  if(value.state!=='draft-unresolved')fail('journey_readiness_unqualified','Save as an unresolved draft until exact source and visual qualification exist');
  const candidate={...structuredClone(value),journeyId:'ll-journey:validation',revisionId:'ll-journey-r:validation',parentRevisionId:null};
  validateJourney(candidate,{resolveThing:ref=>{try{return this.thing(ref.thingId,ref.revisionId).thing;}catch{return null;}}});
  const scheduled=new Set(candidate.schedule.map(row=>row.instanceId));if(candidate.instances.some(row=>!scheduled.has(row.instanceId)))fail('unused_instance','Every saved instance must appear in the schedule');
  return {valid:true,durationUs:candidate.schedule.at(-1).endUs,readiness:{state:'draft-unresolved',reasons:['Exact source/feature admission and visual compatibility qualification pending']},previewOnly:true,finalRenderUnsupported:true};
 }
 saveJourney({journeyId,journey,expectedRevision,idempotencyKey,lineage=null}={},actor){
  validateActor(actor);boundedId(idempotencyKey,'Idempotency key');if(journeyId)boundedId(journeyId,'Journey ID');
  if(!journeyId&&expectedRevision!==null)fail('expected_revision_required','Creating a Journey requires expectedRevision: null');if(journeyId)boundedId(expectedRevision,'Expected revision');
  this.validateJourneyDraft(journey);const digest=sha({journeyId:journeyId||null,journey,expectedRevision,lineage});
  return this.transaction(db=>{
   const previous=db.prepare('SELECT * FROM requests WHERE actor_id=? AND idempotency_key=?').get(actor.actorId,idempotencyKey);if(previous){if(previous.request_digest!==digest)fail('idempotency_conflict','This request key belongs to different content',409);return {...JSON.parse(previous.response_json),idempotentReplay:true};}
   const current=journeyId?this.journey(journeyId):null;if(current&&current.currentHead!==expectedRevision)fail('revision_conflict','The Journey changed. Keep your draft and compare the latest revision.',409,{currentHead:current.currentHead});
   if(current&&current.journey.songId!==journey.songId)fail('journey_song_immutable','Fork a Journey explicitly to change its song');
   if(lineage){const source=this.journey(lineage.journeyId,lineage.revisionId);if(current)fail('lineage_immutable','Lineage is established only on an explicit new fork');if(source.journey.songId!==journey.songId&&journey.instances.some(i=>Object.keys(i.bindings).length))fail('fork_bindings_not_reset','A new song cannot inherit unverified source-specific signal bindings');}
   const id=journeyId||`ll-journey:${randomUUID()}`,parent=current?.journey.revisionId||null,number=(current?.revisionNumber||0)+1,revisionId='ll-journey-r:'+sha({journey,parent}).slice(0,32),value={...structuredClone(journey),journeyId:id,revisionId,parentRevisionId:parent};
   for(const instance of value.instances)this.materializeThingInTransaction(db,this.thing(instance.thingRef.thingId,instance.thingRef.revisionId).thing);
   if(!current){const snapshot={id,cardId:id,title:value.title,summary:'Living Light Journey recipe',cardType:'living_light_journey',sourceKind:'living-light',revisionId,attribution:{creator:actor.displayName,source:'Builder-authored recipe; source module notices retained'},sourceRefs:value.instances.map(i=>({kind:'living-light-thing',cardId:i.thingRef.thingId,revisionId:i.thingRef.revisionId})),...(lineage?{lineage}: {})};this.insertIdentity(db,id,'journey',snapshot);db.prepare('INSERT INTO intents(id,entity_id,kind,payload_json) VALUES(?,?,?,?)').run(`custody:${id}`,id,'card-birth',canonicalJSON(snapshot));}
   const time=this.now();db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?,?)').run(id,revisionId,number,parent,sha(journey),canonicalJSON(value),canonicalJSON(actor),time);db.prepare('UPDATE identities SET head=? WHERE id=?').run(revisionId,id);
   db.prepare('INSERT INTO intents(id,entity_id,kind,payload_json) VALUES(?,?,?,?)').run(`journey:${id}:${revisionId}`,id,'journey-revision',canonicalJSON({journey:value,actor,occurredAt:time}));
   const response={...this.journey(id),idempotentReplay:false,delivery:'local-pending'};db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(actor.actorId,idempotencyKey,digest,canonicalJSON(response));return response;
  });
 }
 thingVisibility(id){
  const row=this.open()?.prepare("SELECT payload_json FROM intents WHERE entity_id=? AND kind='thing-visibility' ORDER BY rowid DESC LIMIT 1").get(id);
  if(!row)return {archived:false,revisionId:null,revisionNumber:0};
  const event=JSON.parse(row.payload_json);return {archived:event.archived,revisionId:event.revisionId,revisionNumber:event.revisionNumber,observedRevisionId:event.observedRevisionId,actor:event.actor,occurredAt:event.occurredAt};
 }
 thingVisibilityHistory(id,{offset=0,limit=100}={}){
  this.thing(id);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)fail('invalid_page','Use a bounded visibility history page');
  const db=this.open();if(!db)return {events:[],total:0,nextOffset:null};
  const total=Number(db.prepare("SELECT count(*) n FROM intents WHERE entity_id=? AND kind='thing-visibility'").get(id).n),events=db.prepare("SELECT payload_json FROM intents WHERE entity_id=? AND kind='thing-visibility' ORDER BY rowid LIMIT ? OFFSET ?").all(id,limit,offset).map(row=>JSON.parse(row.payload_json));
  return {events,total,nextOffset:offset+limit<total?offset+limit:null};
 }
 setThingVisibility(id,archived,request,actor){
  validateActor(actor);boundedId(id,'Thing ID');if(typeof archived!=='boolean')fail('invalid_visibility','Choose archive or restore');
  if(!request||typeof request!=='object'||Array.isArray(request))fail('invalid_visibility_request','A visibility request is required');
  for(const key of Object.keys(request))if(!['expectedRevision','expectedVisibilityRevision','idempotencyKey'].includes(key))fail('unknown_field','Unsupported archive/restore field: '+key);
  boundedId(request.expectedRevision,'Expected Thing revision');if(request.expectedVisibilityRevision!==null)boundedId(request.expectedVisibilityRevision,'Expected visibility revision');boundedId(request.idempotencyKey,'Idempotency key');
  this.thing(id,request.expectedRevision);const digest=sha({thingId:id,archived,request});
  return this.transaction(db=>{
   const replay=db.prepare('SELECT * FROM requests WHERE actor_id=? AND idempotency_key=?').get(actor.actorId,request.idempotencyKey);if(replay){if(replay.request_digest!==digest)fail('idempotency_conflict','This request key belongs to different content',409);return {...JSON.parse(replay.response_json),idempotentReplay:true};}
   const current=this.thing(id),before=current.visibility;
   if(current.currentHead!==request.expectedRevision)fail('revision_conflict','This Thing changed. Reload and compare before changing library visibility.',409,{currentHead:current.currentHead});
   if(before.revisionId!==request.expectedVisibilityRevision)fail('visibility_conflict','Library visibility changed. Reload its current state before retrying.',409,{currentVisibilityRevision:before.revisionId});
   const unchanged=before.archived===archived;
   if(!unchanged){
    this.materializeThingInTransaction(db,current.thing);
    db.exec("CREATE INDEX IF NOT EXISTS thing_visibility_lookup ON intents(entity_id,kind)");
    const semantic={thingId:id,archived,observedRevisionId:request.expectedRevision,parentRevisionId:before.revisionId},revisionId='ll-visibility-r:'+sha(semantic).slice(0,32),event={schemaVersion:'hapa.living-light.thing-visibility.v1',...semantic,revisionId,revisionNumber:before.revisionNumber+1,actor:structuredClone(actor),occurredAt:this.now()};
    db.prepare('INSERT INTO intents(id,entity_id,kind,payload_json) VALUES(?,?,?,?)').run('visibility:'+id+':'+revisionId,id,'thing-visibility',canonicalJSON(event));
   }
   const response={...this.thing(id),unchanged,idempotentReplay:false,delivery:'local-pending'};db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(actor.actorId,request.idempotencyKey,digest,canonicalJSON(response));return response;
  });
 }
 thingHistory(id,{offset=0,limit=100}={}){
  this.thing(id);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)fail('invalid_page','Use a bounded revision page');
  const db=this.open(),native=this.identity(id),total=native?Number(db.prepare('SELECT count(*) n FROM revisions WHERE entity_id=?').get(id).n):1;
  const revisions=native?db.prepare('SELECT revision_id FROM revisions WHERE entity_id=? ORDER BY revision_number LIMIT ? OFFSET ?').all(id,limit,offset).map(row=>this.thing(id,row.revision_id)):offset===0?[this.thing(id)]:[];
  return {revisions,total,nextOffset:offset+limit<total?offset+limit:null};
 }
 savePreset({thingId,request}={},actor){
  validateActor(actor);boundedId(request?.idempotencyKey,'Idempotency key');if(thingId)boundedId(thingId,'Thing ID');
  if(!thingId&&request.expectedRevision!==null)fail('expected_revision_required','Creating a preset requires expectedRevision: null');if(thingId)boundedId(request.expectedRevision,'Expected revision');
  validateRef(request.derivedFrom,'derivedFrom');const parent=this.thing(request.derivedFrom.thingId,request.derivedFrom.revisionId).thing;
  presetDefinition(parent,request,{thingId:'ll-preset:validation',revisionId:'ll-preset-r:validation',implementations:this.registry.implementations});
  const digest=sha({thingId:thingId||null,request});
  return this.transaction(db=>{
   const previous=db.prepare('SELECT * FROM requests WHERE actor_id=? AND idempotency_key=?').get(actor.actorId,request.idempotencyKey);if(previous){if(previous.request_digest!==digest)fail('idempotency_conflict','This request key belongs to different content',409);return {...JSON.parse(previous.response_json),idempotentReplay:true};}
   const current=thingId?this.thing(thingId):null;if(current&&!current.thing.derivedFrom)fail('source_definition_immutable','Source definitions cannot be revised; save a new preset');
   if(current&&current.currentHead!==request.expectedRevision)fail('revision_conflict','This preset changed. Keep your draft and compare the latest revision.',409,{currentHead:current.currentHead});
   if(current&&canonicalJSON(current.thing.derivedFrom)!==canonicalJSON(request.derivedFrom))fail('preset_lineage_immutable','A preset retains its exact parent revision');
   const id=thingId||`ll-preset:${randomUUID()}`,parentRevisionId=current?.thing.revisionId||null,number=(current?.revisionNumber||0)+1;
   const provisional=presetDefinition(parent,request,{thingId:id,revisionId:'ll-preset-r:pending',implementations:this.registry.implementations}),semantic=structuredClone(provisional);delete semantic.thingId;delete semantic.revisionId;const revisionId='ll-preset-r:'+sha({semantic,parentRevisionId}).slice(0,32),thing={...provisional,revisionId};
   this.materializeThingInTransaction(db,parent);
   if(!current){const snapshot={id,cardId:id,title:thing.title,summary:thing.summary,cardType:thing.kind==='location'?'living_light_location':'living_light_tunnel',sourceKind:'living-light',revisionId,attribution:{creator:actor.displayName,source:'Builder-authored preset; original module credits retained',upstream:thing.source.attribution,license:thing.source.rights},sourceRefs:[{kind:'living-light-thing',cardId:parent.thingId,revisionId:parent.revisionId}],lineage:{derivedFrom:thing.derivedFrom}};this.insertIdentity(db,id,'thing',snapshot);db.prepare('INSERT INTO intents(id,entity_id,kind,payload_json) VALUES(?,?,?,?)').run(`custody:${id}`,id,'card-birth',canonicalJSON(snapshot));}
   const time=this.now();db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?,?)').run(id,revisionId,number,parentRevisionId,sha(thing),canonicalJSON(thing),canonicalJSON(actor),time);db.prepare('UPDATE identities SET head=? WHERE id=?').run(revisionId,id);
   db.prepare('INSERT INTO intents(id,entity_id,kind,payload_json) VALUES(?,?,?,?)').run(`thing:${id}:${revisionId}`,id,'thing-revision',canonicalJSON({thing,parentRevisionId,actor,occurredAt:time}));
   const response={...this.thing(id),parentRevisionId,idempotentReplay:false,delivery:'local-pending'};db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(actor.actorId,request.idempotencyKey,digest,canonicalJSON(response));return response;
  });
 }
 checkTarget(target){
  if(target.kind==='thing'){
   let thing;try{thing=this.thing(target.thingId).thing;}catch{fail('note_target_unavailable','Unknown Thing target',404);}
   if(target.observedRevisionId){try{this.thing(target.thingId,target.observedRevisionId);}catch{fail('note_target_revision_unavailable','Observed revision does not exist',404);}}
   return thing;
  }
  // Journey/instance notes require actual saved native references, not invented IDs.
  const id=target.journeyId,identity=this.identity(id);if(!identity||identity.kind!=='journey')fail('note_target_unavailable','Save this Journey before adding a note about its use',404);
  const row=this.open().prepare('SELECT payload_json FROM revisions WHERE entity_id=? AND revision_id=?').get(id,target.observedRevisionId);
  if(!row)fail('note_target_revision_unavailable','Observed Journey revision is unavailable',404);
  const journey=JSON.parse(row.payload_json);
  if(target.kind==='instance'){
   if(!journey.instances.some(i=>i.instanceId===target.instanceId))fail('note_instance_unavailable','Instance is not in the observed revision',404);
   if(target.sourceBindingRevisionId&&target.sourceBindingRevisionId!==journey.sourceBindingRef?.revisionId)fail('note_source_revision_mismatch','Cue note source revision differs');
   const end=journey.schedule.at(-1)?.endUs;if(target.endUs!==undefined&&target.endUs>end)fail('note_range_outside_journey','Note range is outside this Journey');
   if(target.startUs!==undefined&&!journey.schedule.some(row=>row.instanceId===target.instanceId&&target.startUs>=row.startUs&&target.endUs<=row.endUs))fail('note_range_outside_instance','Cue range is outside this observed instance');
  }
  return null;
 }
 note(id,revisionId){
  const db=this.open(),head=db?.prepare('SELECT * FROM note_heads WHERE note_id=?').get(id);if(!head)fail('note_not_found','Note is unavailable',404);
  const row=db.prepare('SELECT * FROM revisions WHERE entity_id=? AND revision_id=?').get(id,revisionId||head.head);if(!row)fail('note_revision_not_found','Note revision is unavailable',404);
  return {note:JSON.parse(row.payload_json),revisionNumber:Number(row.revision_number),currentHead:head.head,retracted:JSON.parse(row.payload_json).eventType==='retracted'};
 }
 notes({target,offset=0,limit=100,includeRetracted=false}={}){
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)fail('invalid_page','Use a bounded note page');
  const probe={schemaVersion:'hapa.living-light.note.v1',noteId:'probe',revisionId:'probe',parentRevisionId:null,target,body:'',actor:{actorId:'agent:query',kind:'agent',displayName:'Query validation'},createdAt:this.now(),editedAt:this.now(),eventType:'created'};validateNote(probe);this.checkTarget(target);
  const db=this.open();if(!db)return {notes:[],total:0,nextOffset:null};
  const key=targetKey(target),args=[key,includeRetracted?1:0],total=Number(db.prepare('SELECT count(*) n FROM note_heads WHERE target_key=? AND (?=1 OR retracted=0)').get(...args).n),rows=db.prepare('SELECT h.note_id FROM note_heads h JOIN revisions r ON r.entity_id=h.note_id AND r.revision_id=h.head WHERE h.target_key=? AND (?=1 OR h.retracted=0) ORDER BY json_extract(r.payload_json,\'$.createdAt\'),h.note_id LIMIT ? OFFSET ?').all(...args,limit,offset);
  return {notes:rows.map(row=>this.note(row.note_id)),total,nextOffset:offset+limit<total?offset+limit:null};
 }
 noteHistory(id,{offset=0,limit=100}={}){
  this.note(id);if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>200)fail('invalid_page','Use a bounded history page');
  const db=this.open(),total=Number(db.prepare('SELECT count(*) n FROM revisions WHERE entity_id=?').get(id).n),rows=db.prepare('SELECT payload_json,revision_number FROM revisions WHERE entity_id=? ORDER BY revision_number LIMIT ? OFFSET ?').all(id,limit,offset);
  return {revisions:rows.map(row=>({note:JSON.parse(row.payload_json),revisionNumber:Number(row.revision_number)})),total,nextOffset:offset+limit<total?offset+limit:null};
 }
 saveNote({noteId,target,body,expectedRevision,idempotencyKey,eventType='created'}={},actor){
  validateActor(actor);boundedId(idempotencyKey,'Idempotency key');
  if(!['created','edited','retracted'].includes(eventType))fail('invalid_note_operation','Unknown note action');
  if(eventType==='created'&&expectedRevision!==null)fail('expected_revision_required','Creating a note requires expectedRevision: null');
  if(eventType!=='created')boundedId(expectedRevision,'Expected revision');
  const input={noteId:noteId||null,target:target||null,body,expectedRevision,idempotencyKey,eventType},requestDigest=sha(input);
  return this.transaction(db=>{
   const previous=db.prepare('SELECT * FROM requests WHERE actor_id=? AND idempotency_key=?').get(actor.actorId,idempotencyKey);
   if(previous){if(previous.request_digest!==requestDigest)fail('idempotency_conflict','This request key belongs to different content',409);return {...JSON.parse(previous.response_json),idempotentReplay:true};}
   const existing=eventType==='created'?null:this.note(boundedId(noteId,'Note ID'));
   if(existing?.currentHead!==undefined&&existing.currentHead!==expectedRevision)fail('revision_conflict','The note changed. Keep your draft and compare the latest version.',409,{currentHead:existing.currentHead});
   if(existing?.note.actor.actorId!==undefined&&existing.note.actor.actorId!==actor.actorId)fail('note_author_mismatch','Only the attributed author may edit or retract this note',403);
   if(existing?.retracted)fail('note_retracted','A retracted note keeps its history and cannot be edited',409);
   if(existing&&target&&canonicalJSON(target)!==canonicalJSON(existing.note.target))fail('note_target_immutable','Editing cannot move a note to another Thing or use');
   const id=existing?.note.noteId||`ll-note:${randomUUID()}`,time=this.now(),resolvedTarget=existing?.note.target||target;
   const semantic={target:resolvedTarget,body:eventType==='retracted'?'':body,eventType,parentRevisionId:existing?.note.revisionId||null};
   const revisionId='ll-note-r:'+sha(semantic).slice(0,32);
   const note={schemaVersion:'hapa.living-light.note.v1',noteId:id,revisionId,parentRevisionId:semantic.parentRevisionId,target:resolvedTarget,body:semantic.body,actor:structuredClone(actor),createdAt:existing?.note.createdAt||time,editedAt:time,eventType};
   validateNote(note);const thing=this.checkTarget(note.target);if(thing)this.materializeThingInTransaction(db,thing);
   if(!existing)this.insertIdentity(db,id,'note',{id,title:'Living Light note',cardType:'discussion-event'});
   const number=(existing?.revisionNumber||0)+1;
   db.prepare('INSERT INTO revisions VALUES(?,?,?,?,?,?,?,?)').run(id,revisionId,number,note.parentRevisionId,sha(semantic),canonicalJSON(note),canonicalJSON(actor),time);
   db.prepare('UPDATE identities SET head=? WHERE id=?').run(revisionId,id);
   db.prepare('INSERT INTO note_heads VALUES(?,?,?,?,?) ON CONFLICT(note_id) DO UPDATE SET head=excluded.head,retracted=excluded.retracted').run(id,targetKey(note.target),canonicalJSON(note.target),revisionId,eventType==='retracted'?1:0);
   const intentId=`note:${id}:${revisionId}`;db.prepare('INSERT INTO intents(id,entity_id,kind,payload_json) VALUES(?,?,?,?)').run(intentId,id,'discussion-event',canonicalJSON(note));
   const response={note,revisionNumber:number,currentHead:revisionId,retracted:eventType==='retracted',idempotentReplay:false,delivery:'local-pending'};
   db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(actor.actorId,idempotencyKey,requestDigest,canonicalJSON(response));return response;
  });
 }
 materializeThing(id,actor){validateActor(actor);const thing=this.thing(id).thing;this.transaction(db=>this.materializeThingInTransaction(db,thing));return this.thing(id);}
 pendingCustody(id){const row=this.open()?.prepare("SELECT * FROM intents WHERE id=? AND state='pending'").get(`custody:${id}`);return row?{...row,payload:JSON.parse(row.payload_json)}:null;}
 recordCustody(id,receipt){
  if(!receipt||receipt.cardId!==id||!receipt.cardCoreKey||!receipt.cardRecordDigest)fail('custody_receipt_mismatch','Card birth receipt differs from native identity');
  this.transaction(db=>{const row=db.prepare('SELECT custody_json FROM identities WHERE id=?').get(id);if(!row)fail('custody_identity_missing','Native identity disappeared');if(row.custody_json&&row.custody_json!==canonicalJSON(receipt))fail('custody_root_immutable','Root receipt cannot change',409);db.prepare("UPDATE identities SET custody_json=?,custody_state='verified' WHERE id=?").run(canonicalJSON(receipt),id);db.prepare("UPDATE intents SET state='complete',last_error=NULL WHERE id=?").run(`custody:${id}`);});
 }
 custodyFailure(id){this.open()?.prepare("UPDATE intents SET last_error='owner-custody-failed' WHERE id=?").run(`custody:${id}`);}
}
