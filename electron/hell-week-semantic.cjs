const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const {prepare,hash,AESTHETIC}=require('./hell-week-contract.cjs');
const {validateSelections,cardAvatarLineage}=require('./hell-week-avatars.cjs');
const {describe,createSourceReader}=require('./hell-week-source.cjs');
const grammar=require('./hell-week-json-stream.cjs');
const contract=require('./hell-week-semantic-contract.cjs');
const SCHEMA='hapa.builder-hell-week.v2';
const json=async f=>JSON.parse(await fs.readFile(f,'utf8'));
const optional=async f=>json(f).catch(e=>{if(e.code==='ENOENT')return null;throw e;});
const numbered=n=>String(n).padStart(12,'0');
function createSemanticHellWeek({root,atomic,safeError,lock,worker,credentialStore,registerCard,mediaStore,avatarReferences,previewImage,fetchImpl=globalThis.fetch,now=()=>Date.now(),leaseMs=1800000,textTimeoutMs=180000,imageTimeoutMs=240000,importLeaseMs=1800000}) {
 let active=null,activeId=null;const sourceReader=createSourceReader();
 const local=id=>{if(!/^hw-[a-f0-9-]{36}$/.test(id))throw Error('Invalid run ID.');return path.join(root,id)};
 const dir=id=>{local(id);if(!mediaStore?.root)throw Error('The registered external store is required for large-run records. No local media fallback.');return path.join(mediaStore.root,'runs-v2',id)};
 async function admission(){if(!mediaStore)throw Error('Configure the registered external store before preparation.');await mediaStore.preflight();}
 async function save(run){
  // Every call receipt is independently durable; the small UI cursor retains only unresolved calls.
  for(const [id,receipt]of Object.entries(run.calls||{})){await atomic(path.join(dir(run.id),`${id}.receipt.json`),receipt);if(receipt.state==='complete'){run.lastCall={id,...receipt};delete run.calls[id];}}
  run.updatedAt=new Date(now()).toISOString();const bytes=Buffer.byteLength(JSON.stringify(run,null,2));if(bytes>128*1024)throw Error('Run control record exceeded its 128 KiB ceiling; saved work retained.');const {treeBytes}=require('./hell-week-storage.cjs');if(await treeBytes(root)+bytes>128*1024**2)throw Error('Private controls reached their shared storage ceiling. Saved external results are retained.');await atomic(path.join(local(run.id),'run.json'),run);
 }
 async function journal(id,event){await atomic(path.join(dir(id),'events',`${Date.now()}-${randomUUID()}.json`),{at:new Date(now()).toISOString(),...event});}
 async function read(id){const run=await json(path.join(local(id),'run.json')),plan=await json(path.join(local(id),'source.json'));if(run.schema!==SCHEMA||hash(JSON.stringify(plan))!==run.planHash||hash(JSON.stringify(plan.avatars||[]))!==hash(JSON.stringify(run.avatars||[])))throw Error('Run source/configuration/Avatar digest changed. Quarantined.');return{run,plan};}
 const paid=require('./hell-week-transport.cjs').createHellWeekTransport({root,dir,atomic,save,journal,credentialStore,fetchImpl,mediaStore,avatarReferences,now,textTimeoutMs,imageTimeoutMs,admitRecords:admission,persistReceipts:true});
 function request(model,spec){return{model,store:false,instructions:spec.instructions,input:spec.input,max_output_tokens:16000,text:{format:{type:'json_schema',name:'hapa_semantic_stage',strict:true,schema:spec.schema}}};}
 function parsed(result){if(result.body?.status!=='completed')throw Error('Incomplete agent output retained for review.');const content=(result.body.output||[]).flatMap(o=>o.content||[]);if(content.some(c=>c.type==='refusal'))throw Error('Agent declined this section. Saved response retained.');try{return JSON.parse(content.filter(c=>c.type==='output_text').map(c=>c.text).join(''))}catch{throw Error('Invalid structured response retained for review.')}}
 async function importDesigns(raw){const {validate,prepareReviewed}=require('./hell-week-reviewed-designs.cjs');const spec=validate(raw);if(active)throw Error('A Hell Week run is active.');const unlock=await lock(spec.id);try{return await prepareReviewed(raw,{atomic,root,local,dir,save,read,admission,now});}finally{await unlock();}}
 async function create(input){
  // Validate credentials-free options first. The legacy limit is not part of this plan.
  const config={...prepare({...input,text:'Configuration validation',name:'configuration.txt',format:'text',maxCards:1}).config};delete config.maxCards;
  const selections=validateSelections(input.avatarSelections);const avatars=selections.length?await avatarReferences.snapshot(selections):[];
  const id=`hw-${randomUUID()}`,unlock=await lock(id);
  try{
   await admission();const {treeBytes}=require('./hell-week-storage.cjs');if(await treeBytes(root)+9*1024**2>128*1024**2)throw Error('Private controls reached their shared storage ceiling. Existing runs are preserved.');
   let sourcePath=input.filePath;
   if(!sourcePath){const text=String(input.text||'');if(!text.trim())throw Error('Add a document first.');if(Buffer.byteLength(text)>8*1024**2)throw Error('For large sources choose the original file; pasted text is bounded to 8 MiB per UI transfer.');const extension=/\.json$/i.test(input.name||'')?'.json':'.txt';sourcePath=path.join(root,'sources',hash(text)+extension);try{await fs.access(sourcePath)}catch(e){if(e.code!=='ENOENT')throw e;await atomic(sourcePath,text)}}
   const source=await sourceReader.describe(sourcePath);const plan={schema:SCHEMA,name:String(input.name||path.basename(sourcePath)).slice(0,200),config,avatars,source,digestAlgorithm:'sha256-chain-of-ordered-utf8-sections-v1'};
   const run={id,schema:SCHEMA,name:plan.name,config,avatars,planHash:hash(JSON.stringify(plan)),sourceHash:null,sourceDigestAlgorithm:plan.digestAlgorithm,createdAt:new Date(now()).toISOString(),state:'importing',stage:'Preparing complete source',calls:{},attempts:0,cards:[],leo:[],totalCards:0,savedCards:0,imageCount:0,duplicateOccurrences:0,processedSections:0,sectionCount:0,importOffset:0,sourceBytes:source.size,sourceChain:hash('hapa-source-chain-v1'),jsonState:source.format==='json'?grammar.initial():null,phase:'prepare',windowStart:0,chunkCursor:0,pageCursor:0,recent:[],imageCursor:0,analysisComplete:false,lastCommittedAt:null,error:null};
   await atomic(path.join(local(id),'source.json'),plan);await save(run);activeId=id;active=importSource(run,plan).finally(async()=>{await unlock();active=null;activeId=null});active.catch(()=>{});return{...run,workerActive:true};
  }catch(e){await unlock();throw e;}
 }
 async function importSource(run,plan){const deadline=now()+importLeaseMs;let units=0;run.state='importing';run.error=null;await save(run);
  try{while(run.importOffset<plan.source.size){const control=await optional(path.join(local(run.id),'control.json'));if(control?.pauseRequested||now()>=deadline&&units){run.state='preparation-paused';run.stage='Source preparation checkpoint saved';await save(run);return;}
   if(units%64===0)await admission();const part=await sourceReader.next(plan.source,run.importOffset);const nextJson=run.jsonState?structuredClone(run.jsonState):null;const jsonPath=nextJson?grammar.location(nextJson):null;if(nextJson)grammar.feed(nextJson,part.text,part.end===plan.source.size);
   const meta={id:`section-${run.sectionCount+1}`,start:part.start,end:part.end,bytes:part.bytes,sha256:part.sha256,jsonPath};await atomic(path.join(dir(run.id),'sections',numbered(run.sectionCount)+'.json'),meta);
   run.jsonState=nextJson;run.importOffset=part.end;run.sectionCount++;run.sourceChain=hash(run.sourceChain+part.sha256);run.lastCommittedAt=new Date(now()).toISOString();units++;await save(run);
  }
  run.sourceHash=run.sourceChain;run.phase='analysis';run.state='prepared';run.stage='Source ready · Card count will be discovered';delete run.jsonState;await save(run);await journal(run.id,{event:'source-prepared',bytes:run.sourceBytes,sections:run.sectionCount,sourceHash:run.sourceHash});
  }catch(e){run.state='blocked';run.error=safeError(e);await save(run);throw e}
 }
 async function prepareMore({id}){if(active)throw Error('Preparation is already active.');const unlock=await lock(id);try{const{run,plan}=await read(id);if(run.phase!=='prepare'){await unlock();return status({id});}await admission();await atomic(path.join(local(id),'control.json'),{pauseRequested:false});activeId=id;active=importSource(run,plan).finally(async()=>{await unlock();active=null;activeId=null});active.catch(()=>{});return{...run,workerActive:true};}catch(e){await unlock();throw e;}}
 async function section(run,plan,n){return sourceReader.chunk(plan.source,await json(path.join(dir(run.id),'sections',numbered(n)+'.json')));}
 async function catalog(run,chunk){const terms=new Set(chunk.text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]);const best=[];let count=0;const folder=path.join(dir(run.id),'catalog');await fs.mkdir(folder,{recursive:true});for await(const entry of await fs.opendir(folder)){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;const card=await json(path.join(folder,entry.name));const tokens=new Set(`${card.title} ${card.summary} ${card.concept_key}`.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu)||[]);const score=[...tokens].filter(t=>terms.has(t)).length;best.push({...card,score});best.sort((a,b)=>b.score-a.score);best.length=Math.min(best.length,16);if(++count%100===0)await new Promise(r=>setImmediate(r));}return best.map(({score,...card})=>card);}
 async function acceptPage(run,plan,chunk,callId,value,existing){
  const file=path.join(dir(run.id),'pages',callId+'.json');let page=await optional(file);
  if(!page){const validated=contract.validatePage(value,plan,chunk,[...existing,...run.recent]);let ordinal=run.totalCards;const decisions=[],within=new Map();
   for(const[index,design]of validated.cards.entries()){
    const digest=contract.conceptDigest(design.concept_key);const known=within.get(digest)||await optional(path.join(dir(run.id),'catalog',digest+'.json'));const duplicate=design.duplicate_of||known?.id||null;const id=duplicate||`${run.id}-card-${hash(`${callId}:${index}`).slice(0,20)}`;
    const decision={index,id,ordinal:duplicate?null:ordinal++,duplicate,conceptDigest:digest,design};decisions.push(decision);if(!duplicate)within.set(digest,{id});
   }
   page={callId,chunkId:chunk.id,hasMore:validated.has_more,coverageNote:validated.coverage_note,decisions,totalAfter:ordinal,duplicatesBefore:run.duplicateOccurrences};await atomic(file,page);
  }
  for(const d of page.decisions){if(d.duplicate){const occurrence=path.join(dir(run.id),'occurrences',d.id,`${callId}-${d.index}.json`);await atomic(occurrence,{cardId:d.id,sourceHash:run.sourceHash,chunkId:chunk.id,spans:chunk.spans.map(({text,...span})=>span),evidenceQuotes:d.design.evidence_quotes,reason:'same-concept',callId});continue;}
   const file=path.join(dir(run.id),'cards',numbered(d.ordinal)+'.json');const old=await optional(file);
   if(old&&old.id!==d.id)throw Error('Card ordinal conflict; accepted page retained for review.');
   if(!old)await atomic(file,{id:d.id,ordinal:d.ordinal,chunkId:chunk.id,sectionIndex:run.chunkCursor,sourceSpans:chunk.spans.map(({text,...span})=>span),design:d.design,avatarLineage:cardAvatarLineage(plan.avatars,d.design.avatar_uses),state:'designed',originCallId:callId});
   await atomic(path.join(dir(run.id),'card-ids',d.id+'.json'),{ordinal:d.ordinal});
   await atomic(path.join(dir(run.id),'catalog',d.conceptDigest+'.json'),{id:d.id,ordinal:d.ordinal,title:d.design.title,summary:d.design.summary.slice(0,700),concept_key:d.design.concept_key});
  }
  run.totalCards=page.totalAfter;run.duplicateOccurrences=page.duplicatesBefore+page.decisions.filter(d=>d.duplicate).length;run.recent=[...run.recent,...page.decisions.map(d=>({id:d.id,concept_key:d.design.concept_key,title:d.design.title.slice(0,300)}))].slice(-16);
  return page;
 }
 async function execute(id,unlock,{mode='all',imageLimit=null,recoveryOnly=false}={}){let run;try{
  const loaded=await read(id);run=loaded.run;const plan=loaded.plan;await admission();if(['prepare','reviewed-design-import'].includes(run.phase))throw Error('Finish source/design preparation before starting artwork.');
  const deadline=now()+leaseMs,startImages=run.imageCount,startAttempts=run.attempts;
  run.state='running';run.error=null;await save(run);
  async function admit(stage,millis){const control=await optional(path.join(local(id),'control.json'));const recovered=run.recoveryCall&&(await optional(path.join(dir(id),run.recoveryCall+'.receipt.json')))?.state==='complete';const reason=control?.pauseRequested?'operator':recovered||recoveryOnly&&run.attempts>startAttempts?'recovery':now()+millis+30000>deadline?'lease':null;
   if(reason){if(reason==='recovery')delete run.recoveryCall;run.state=reason==='lease'?'yielded':'paused';run.pauseReason=reason;run.stage=reason==='lease'?'Execution window finished · saved work ready to resume':'Paused at a saved checkpoint';await save(run);return false;}run.stage=stage;await save(run);return true;}
  if(!run.analysisComplete){if(mode==='images')throw Error('Finish Card discovery before illustrating.');
   while(run.chunkCursor<run.sectionCount){
    if(!await admit(`Reviewing source section ${run.chunkCursor+1}/${run.sectionCount}`,1000))return;
    const current=await section(run,plan,run.chunkCursor);
    if(!current.text.trim()){await atomic(path.join(dir(id),'coverage',numbered(run.chunkCursor)+'.json'),{sectionId:current.id,reason:'Whitespace only; no semantic content',sourceHash:run.sourceHash});run.chunkCursor++;run.processedSections=run.chunkCursor;await save(run);continue;}
    const windowStart=Math.floor(run.chunkCursor/4)*4,windowId=`leo-${windowStart}`;let prepared=await optional(path.join(dir(id),'preparation',windowId+'.json'));
    if(!prepared){if(!await admit(`LEO · sections ${windowStart+1}–${Math.min(windowStart+4,run.sectionCount)}`,textTimeoutMs))return;const chunks=[];for(let n=windowStart;n<Math.min(windowStart+4,run.sectionCount);n++){const c=await section(run,plan,n);if(c.text.trim())chunks.push(c);}
     const result=await paid(run,windowId,'leo',request(plan.config.leoModel,contract.leo(plan,chunks,run.continuity)));prepared=contract.validateLeo(parsed(result),chunks.map(c=>c.id));await atomic(path.join(dir(id),'preparation',windowId+'.json'),prepared);run.continuity={set_name:prepared.set_name,summary:prepared.summary.slice(0,2000),yarn:prepared.yarn?.slice(0,4000)||''};await save(run);
    }
    const chunk=current;if(!await admit(`Thor · section ${run.chunkCursor+1}/${run.sectionCount} · discovery page ${run.pageCursor+1}`,textTimeoutMs))return;
    if((run.stalledPages||0)>=2)throw Error('Thor continued twice without discovering a new concept. Saved pages need review before further paid discovery.');
    const callId=`thor-${run.chunkCursor}-${run.pageCursor}`;let accepted=await optional(path.join(dir(id),'pages',callId+'.json'));
    if(!accepted){const existing=await catalog(run,chunk);const result=await paid(run,callId,'thor',request(plan.config.thorModel,contract.thor(plan,chunk,prepared,existing,run.pageCursor,run.recent)));accepted=await acceptPage(run,plan,chunk,callId,parsed(result),existing);}
    else accepted=await acceptPage(run,plan,chunk,callId,null,[]);
    const newCount=accepted.decisions.filter(d=>!d.duplicate).length;run.stalledPages=accepted.hasMore&&!newCount?(run.stalledPages||0)+1:0;
    if(accepted.hasMore)run.pageCursor++;else{run.chunkCursor++;run.processedSections=run.chunkCursor;run.pageCursor=0;run.recent=[];}
    run.lastCommittedAt=new Date(now()).toISOString();await save(run);
   }
   run.analysisComplete=true;run.phase='artwork';run.stage=`Discovery complete · ${run.totalCards} Cards designed`;await save(run);
  }
  if(mode==='design'){run.state='designed';run.pauseReason='design-review';await save(run);return;}
  while(run.imageCursor<run.totalCards){
   const cardFile=path.join(dir(id),'cards',numbered(run.imageCursor)+'.json');const card=await json(cardFile);
   if(!card.image){if(imageLimit!==null&&run.imageCount-startImages>=imageLimit){run.state='paused';run.pauseReason='image-budget';run.stage=`Image batch complete · ${run.totalCards-run.imageCursor} designs waiting`;await save(run);return;}
    if(!await admit(`Artwork · ${run.imageCursor+1}/${run.totalCards}`,imageTimeoutMs))return;await registerCard.preflight?.({run});
    const used=(card.design.avatar_uses||[]).map(use=>({use,avatar:plan.avatars.find(a=>a.avatarId===use.avatar_id)}));if(used.some(x=>!x.avatar))throw Error('Unknown Avatar in saved design.');const references=used.filter(x=>x.avatar.image);
    card.imagePrompt=`${card.design.image_prompt}\n\n${AESTHETIC}`+(used.length?'\n\nCreative Avatar references:\n'+used.map(({avatar,use})=>`${avatar.name}: ${use.role}. ${use.reason} ${avatar.image?`Reference image ${references.findIndex(x=>x.avatar.avatarId===avatar.avatarId)+1}; preserve recognizable identity.`:'Text profile only: '+JSON.stringify(avatar.context)}`).join('\n')+'\nPreserve the adventurous scene; do not copy a reference sheet.':'');
    if(plan.reviewedDesigns?.exactPrompt){if(card.reviewedDesign?.promptSha256!==hash(card.design.image_prompt))throw Error('Reviewed prompt changed; prepare an explicit new branch.');card.imagePrompt=card.design.image_prompt;}
    card.image=await paid(run,`image-${run.imageCursor}`,'image',{model:plan.config.imageModel,prompt:card.imagePrompt,quality:plan.config.quality,size:plan.config.size,output_format:'png',n:1,...(references.length?{referenceImages:references.map(x=>x.avatar.image)}:{})});card.state='illustrated';await atomic(cardFile,card);
   }
   // Derive counts from the sequential durable ordinal, including cursor/receipt recovery gaps.
   run.imageCount=Math.max(run.imageCount,run.imageCursor+1);await save(run);
   if(!card.registration){if(!await admit(`Saving Card · ${run.imageCursor+1}/${run.totalCards}`,30000))return;const chunk={id:card.chunkId,spans:card.sourceSpans};card.relatedSourceCount=(await fs.readdir(path.join(dir(id),'occurrences',card.id)).catch(e=>{if(e.code==='ENOENT')return [];throw e;})).length;const bytes=await mediaStore.read(card.image.storage);if(hash(bytes)!==card.image.sha256)throw Error('Artwork digest mismatch.');card.registration=await registerCard({run,card,chunk,imageBytes:bytes});card.state='saved';await atomic(cardFile,card);}
   run.imageCursor++;run.savedCards=run.imageCursor;run.lastCommittedAt=new Date(now()).toISOString();await save(run);
  }
  run.phase='complete';run.state='complete';run.stage=run.totalCards?'Ready for review':'Source reviewed · no distinct Cards warranted';await save(run);
 }catch(error){if(run){run.state='blocked';run.error=safeError(error);await save(run);}else throw error;}finally{await unlock();}}
 async function start({id,mode='all',imageLimit=null,retryUnknownCallId=null,acknowledgePossibleDuplicateCharge=false,retryRejected=false,repairThorEvidence=false,repairLeoWindow=null}={}){
  if(repairThorEvidence||repairLeoWindow!==null)throw Error('Legacy repair options do not apply to this discovery run. Saved responses are retained for review.');if(active)throw Error('A Hell Week run is active.');if(!['all','design','images'].includes(mode))throw Error('Choose discovery, images or the complete workflow.');if(imageLimit!==null&&(!Number.isSafeInteger(imageLimit)||imageLimit<1))throw Error('Image batch size must be a positive whole number, or empty for all.');
  const unlock=await lock(id);try{const{run}=await read(id);if(run.phase==='reviewed-design-import')throw Error('Resume the exact reviewed-design import before artwork.');if(run.state==='complete'){await unlock();return status({id});}await admission();
   if(retryUnknownCallId&&retryRejected)throw Error('Choose one recovery action.');
   let recoveryOnly=false;
   for(const[callId,receipt]of Object.entries(run.calls)){
    const retry=callId===retryUnknownCallId&&['submitted','unknown'].includes(receipt.state)||retryRejected&&receipt.state==='rejected';if(!retry)continue;
    if(receipt.attempt>=2)throw Error('This request has reached its one-retry limit.');if(receipt.state!=='rejected'&&!acknowledgePossibleDuplicateCharge)throw Error('Acknowledge possible duplicate billing before retrying this uncertain request.');
    if(await optional(path.join(dir(id),callId+'.result.json')))throw Error('A saved response exists. Use ordinary Resume without another paid request.');
    await atomic(path.join(dir(id),'attempts',`${callId}-${receipt.attempt}.json`),{receipt,request:await json(path.join(dir(id),callId+'.request.json'))});receipt.state='retry-authorized';receipt.retryAuthorization={at:new Date(now()).toISOString(),possibleDuplicateChargeAcknowledged:acknowledgePossibleDuplicateCharge};run.recoveryCall=callId;recoveryOnly=true;
   }
   if(retryUnknownCallId&&!recoveryOnly)throw Error('That request is not eligible for recovery.');
   if(run.recoveryCall&&run.calls[run.recoveryCall]?.state==='retry-authorized')recoveryOnly=true;
   await atomic(path.join(local(id),'control.json'),{pauseRequested:false});await journal(id,{event:'execution-authorized',mode,imageLimit,recoveryOnly,attempts:run.attempts,imageCount:run.imageCount});await save(run);activeId=id;active=execute(id,unlock,{mode,imageLimit,recoveryOnly}).finally(()=>{active=null;activeId=null});active.catch(()=>{});return{...run,state:'starting'};
  }catch(e){await unlock();throw e;}
 }
 async function status({id,offset=0,limit=24,includeCards=true}={}){const{run}=await read(id);const live=activeId===id||(await worker())?.runId===id;offset=Math.max(0,Number.isSafeInteger(offset)?offset:0);limit=Math.min(48,Math.max(1,Number.isSafeInteger(limit)?limit:24));const cards=[];let storageError=null;
  if(includeCards&&run.totalCards)try{await mediaStore.access();for(let n=offset;n<Math.min(offset+limit,run.totalCards);n++)cards.push(await json(path.join(dir(id),'cards',numbered(n)+'.json')));}catch(e){storageError=safeError(e);}
  return{...run,cards,leo:[],workerActive:live,state:['running','importing'].includes(run.state)&&!live?'interrupted':run.state,storageError,page:{offset,limit,hasMore:offset+limit<run.totalCards},plannedCalls:null};
 }
 async function pause({id}){await read(id);await atomic(path.join(local(id),'control.json'),{pauseRequested:true});return{id,pauseRequested:true};}
 async function asset({id,cardId}){await read(id);await mediaStore.access();if(typeof cardId!=='string'||!new RegExp('^'+id+'-card-[a-f0-9]{20}$').test(cardId))throw Error('Invalid Card identity.');const {ordinal}=await json(path.join(dir(id),'card-ids',cardId+'.json'));const card=await json(path.join(dir(id),'cards',numbered(ordinal)+'.json'));if(!card.image)throw Error('Artwork pending.');const bytes=await mediaStore.read(card.image.storage);return{dataUrl:previewImage?await previewImage(bytes):`data:image/png;base64,${bytes.toString('base64')}`};}
 async function reconcile(){throw Error('Resume this run to reconcile its next saved artwork without repeating generation. Completed Cards retain their owner links.');}
 return{create,importDesigns,prepareMore,start,pause,status,asset,reconcile,_active:()=>active};
}
module.exports={createSemanticHellWeek,SCHEMA};
