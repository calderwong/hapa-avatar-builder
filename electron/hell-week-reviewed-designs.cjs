// Builder-owned adapter: reviewed designs enter the existing v2 artwork engine.
// No discovery, credentials, provider calls or input-media copies occur here.
const fs = require('node:fs/promises');
const path = require('node:path');
const { hash } = require('./hell-week-contract.cjs');
const SCHEMA = 'hapa.dreamer.builder-designs.v1';
const ADAPTER = 'hapa.builder.reviewed-designs.v1';
const optional = async file => { try { return await fs.readFile(file, 'utf8'); } catch(e) { if(e.code==='ENOENT')return null; throw e; } };
function text(value, label, max=12000) { if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(`Invalid ${label}.`); return value; }
function identity(ref) { if(!ref||typeof ref.id!=='string'||!/^[\w:-]{1,160}$/.test(ref.id)||!Number.isInteger(ref.revision)||ref.revision<1||!/^[a-f0-9]{64}$/.test(ref.digest))throw Error('An exact source record identity is required.'); return ref; }
function validate(raw) {
 if(typeof raw!=='string'||Buffer.byteLength(raw)>512*1024)throw Error('Reviewed design packet exceeds 512 KiB. Split the explicit selection; no cards are truncated.');
 const packet=JSON.parse(raw);if(packet.schema!==SCHEMA||packet.owner!=='hapa-dreamer')throw Error('Unsupported reviewed-design source.');
 text(packet.request_id,'request identity',160);if(!/^[\w:-]{1,160}$/.test(packet.request_id))throw Error('Invalid request identity.');identity(packet.set);
 const model=text(packet.model,'image model',120);if(!/^[a-zA-Z0-9_.:-]+$/.test(model))throw Error('Select an explicit valid image model.');
 const settings=packet.settings||{};if(Object.keys(settings).some(k=>!['quality','size'].includes(k)))throw Error('Unsupported image settings; no settings are silently dropped.');
 if(!['low','medium','high'].includes(settings.quality)||settings.size!=='1024x1536')throw Error('Choose explicit quality and 1024x1536 size for this owner route.');
 if(!Array.isArray(packet.cards)||!packet.cards.length||packet.cards.length>128)throw Error('Select 1–128 exact designs per import packet. This is a transfer bound, not a discovery quota.');
 const seen=new Set();const cards=packet.cards.map((item,index)=>{
  identity(item.record);if(seen.has(item.record.id))throw Error('Repeated design identity in set.');seen.add(item.record.id);
  text(item.record_json,'raw source record',256*1024);if(hash(item.record_json)!==item.record.digest)throw Error('Source design fingerprint mismatch.');
  const rawRecord=JSON.parse(item.record_json), b=rawRecord.body;
  if(rawRecord.kind!=='card_design'||!b||!Array.isArray(rawRecord.source_refs)||!rawRecord.source_refs.length)throw Error('Expected an evidence-linked Card design.');
  for(const key of ['name','description','flavor_text','image_prompt'])text(b[key],key);
  if(!Array.isArray(b.abilities)||b.abilities.length>32||!Array.isArray(b.parameters)||b.parameters.length>64)throw Error('Structured abilities and parameters are required.');
  for(const ability of b.abilities)for(const k of ['name','purpose','trigger','effect','limits','implementation_status'])text(ability[k],k,2000);
  if(!b.parameters.length)text(b.no_parameters_reason,'empty-parameter reason',1000);
  for(const p of b.parameters){for(const k of ['name','domain','constraints','purpose'])text(p[k],k,2000);const ok=p.type==='string'?typeof p.value==='string':p.type==='boolean'?typeof p.value==='boolean':p.type==='integer'?Number.isSafeInteger(p.value):p.type==='number'?typeof p.value==='number'&&Number.isFinite(p.value):false;if(!ok)throw Error('Invalid typed parameter.');}
  if(item.prompt_sha256!==hash(b.image_prompt))throw Error('Reviewed prompt fingerprint mismatch.');
  return {source:item.record,rawRecord,recordJson:item.record_json,promptSha256:item.prompt_sha256,ordinal:index,
   design:{concept_key:b.concept_id||item.record.id,title:b.name,kind:['object','skill','protocol'].includes(b.card_kind)?b.card_kind:'object',summary:b.description,
    facts:[],desires:[],uncertainties:['Reviewed source design; factual claims have not been independently verified by this import.'],
    lore:b.flavor_text,flavor_text:b.flavor_text,parameters:b.parameters,skills:b.abilities.map(a=>({name:a.name,description:[a.purpose,a.trigger,a.effect,a.limits,a.implementation_status].join('\n'),type:'Passive'})),
    evidence_quotes:[],visual_thesis:b.description,image_prompt:b.image_prompt,tags:['dreamer','reviewed-design-import'],avatar_uses:[],validationWarnings:['Source references retained exactly; this adapter invents no supporting quotations.']}};
 });
 const h=hash(packet.request_id),id=`hw-${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
 return {packet,cards,id,packetHash:hash(raw),config:{imageModel:model,quality:settings.quality,size:settings.size}};
}
async function prepareReviewed(raw,{atomic,root,local,dir,save,read,admission,now=()=>Date.now()}) {
 const spec=validate(raw),{id,packet,packetHash}=spec;const deadline=now()+45000;
 await admission();const {treeBytes}=require('./hell-week-storage.cjs');if(await treeBytes(root)+9*1024**2>128*1024**2)throw Error('Private controls reached their shared byte ceiling.');
 const plan={schema:'hapa.builder-hell-week.v2',name:text(packet.name,'set name',200),config:spec.config,avatars:[],
  source:{kind:'reviewed-design-packet',size:Buffer.byteLength(raw),sha256:packetHash},digestAlgorithm:'sha256-reviewed-design-packet-v1',
  reviewedDesigns:{adapter:ADAPTER,owner:packet.owner,requestId:packet.request_id,set:packet.set,packetHash,exactPrompt:true}};
 const control=await optional(path.join(local(id),'control.json'));if(control&&JSON.parse(control).pauseRequested)throw Error('Reviewed import is explicitly paused; owner control remains unchanged.');
 const existing=await optional(path.join(local(id),'run.json'));let run;
 if(existing){({run}=await read(id));if(run.reviewedDesigns?.packetHash!==packetHash)throw Error('Import identity already belongs to a different packet.');if(run.phase!=='reviewed-design-import')return run;}
 else {
  const prior=await optional(path.join(local(id),'source.json'));if(prior&&hash(prior)!==hash(JSON.stringify(plan,null,2)))throw Error('Interrupted import has a different frozen plan.');
  await atomic(path.join(local(id),'source.json'),plan);
  run={id,schema:plan.schema,name:plan.name,config:spec.config,avatars:[],planHash:hash(JSON.stringify(plan)),sourceHash:packetHash,sourceDigestAlgorithm:plan.digestAlgorithm,
   reviewedDesigns:plan.reviewedDesigns,createdAt:new Date(now()).toISOString(),state:'importing-designs',phase:'reviewed-design-import',stage:'Saving exact reviewed designs',calls:{},cards:[],leo:[],attempts:0,
   totalCards:spec.cards.length,savedCards:0,imageCount:0,duplicateOccurrences:0,processedSections:0,sectionCount:0,sourceBytes:Buffer.byteLength(raw),importCursor:0,imageCursor:0,analysisComplete:false,lastCommittedAt:null,error:null};
  await save(run);
 }
 const sourceFile=path.join(dir(id),'reviewed-input.json'),priorSource=await optional(sourceFile);
 if(priorSource&&hash(priorSource)!==packetHash)throw Error('Retained import packet changed.');if(!priorSource)await atomic(sourceFile,raw);
 for(let i=run.importCursor;i<spec.cards.length;i++){
  const currentControl=await optional(path.join(local(id),'control.json'));
  if(currentControl&&JSON.parse(currentControl).pauseRequested){run.state='import-paused';run.stage='Import paused by owner';await save(run);return run;}
  if(now()+15000>deadline){run.state='import-paused';run.stage='Reviewed design import checkpoint saved';await save(run);return run;}
  if(i%16===0)await admission();
  const c=spec.cards[i],cardId=`${id}-card-${hash(c.source.id+':'+c.source.revision).slice(0,20)}`,file=path.join(dir(id),'cards',String(i).padStart(12,'0')+'.json');
  const existingCard=await optional(file);
  if(existingCard){const old=JSON.parse(existingCard);if(old.id!==cardId||old.reviewedDesign?.source.digest!==c.source.digest)throw Error('Saved design conflicts with import commitment.');}
  else await atomic(file,{id:cardId,ordinal:i,chunkId:'reviewed-design-'+i,sectionIndex:i,sourceSpans:c.rawRecord.source_refs.map(sourceId=>({sourceId,owner:'hapa-dreamer',kind:'exact-evidence-reference'})),
   design:c.design,state:'designed',originCallId:'reviewed-import',reviewedDesign:{adapter:ADAPTER,sourceOwner:'hapa-dreamer',sourceRun:packet.request_id,set:packet.set,source:c.source,recordJson:c.recordJson,promptSha256:c.promptSha256,packetHash}});
  await atomic(path.join(dir(id),'card-ids',cardId+'.json'),{ordinal:i});run.importCursor=i+1;run.lastCommittedAt=new Date(now()).toISOString();await save(run);
 }
 run.analysisComplete=true;run.phase='artwork';run.state='designed';run.pauseReason='design-review';run.stage='Exact designs ready for owner artwork review';await save(run);return run;
}
module.exports={SCHEMA,ADAPTER,validate,prepareReviewed};
