const prefix='/api/echos/living-light';
const literalLoopback=value=>['127.0.0.1','localhost','[::1]'].includes(value);
/** Strong first-party browser boundary on the existing process-scoped session.
 * API/CLI bearer clients remain agents; JSON cannot assert human authority. */
export function livingLightBrowserContext(req,{allowedOrigins,loopbackAddress,serverBind='127.0.0.1',bootstrap=false}={}){
 let origin=req.headers.origin;
 if(!origin&&!bootstrap&&req.method==='GET'){try{origin=new URL(req.headers.referer).origin;}catch{}}
 if(!['127.0.0.1','localhost','::1'].includes(serverBind))return false;
 if(!origin||!loopbackAddress(req.socket?.remoteAddress)||req.headers['sec-fetch-site']!=='same-origin'||req.headers['x-hapa-first-party-intent']!=='living-light')return false;
 try{const url=new URL(origin),protocol=req.socket?.encrypted?'https:':'http:';return literalLoopback(url.hostname)&&url.protocol===protocol&&origin===`${protocol}//${req.headers.host}`&&allowedOrigins.has(origin);}catch{return false;}
}
export async function handleLivingLight({req,res,url,service,authorize,bootstrap,readBody,sendJson,sourceEvidence,performance}){
 if(!url.pathname.startsWith(prefix+'/'))return false;
 const suffix=url.pathname.slice(prefix.length);
 if(suffix==='/session'&&req.method==='POST'){await bootstrap(req,res);return true;}
 const caller=authorize(req,res);if(!caller)return true;
 try{
  const params=Object.fromEntries(url.searchParams),limit=params.limit===undefined?100:Number(params.limit),offset=params.offset===undefined?0:Number(params.offset);
  if(params.includeArchived!==undefined&&!['true','false'].includes(params.includeArchived))throw Object.assign(Error('includeArchived must be true or false'),{code:'invalid_filter',statusCode:422});
  let value,status=200;
  const journey=suffix.match(/^\/journeys\/([^/]+)(?:\/(revisions)\/([^/]+)|\/(history|revisions))?$/),fork=suffix.match(/^\/journeys\/([^/]+)\/fork(?:\/(preview))?$/);
  const thing=suffix.match(/^\/things\/([^/]+)(?:\/revisions\/([^/]+)|\/(materialize|history|revisions|archive|restore|visibility-history))?$/),note=suffix.match(/^\/notes\/([^/]+)\/(history|revisions|retract)$/);
  if(['/performance','/performance/prepare'].includes(suffix)){
   if(!performance)throw Object.assign(Error('Prepared signal owner unavailable'),{code:'signal_owner_unavailable',statusCode:503});
   const allowed=suffix==='/performance'?['songId']:['songId','requestId','jobId'];
   for(const key of Object.keys(params))if(!allowed.includes(key))throw Object.assign(Error('Unknown preparation field'),{code:'unknown_field',statusCode:422});
   if(suffix==='/performance'&&req.method==='GET')value=await performance.read(params);
   else if(suffix==='/performance/prepare'&&req.method==='POST'){if(params.jobId)throw Object.assign(Error('Use a fresh request ID to prepare'),{code:'invalid_preparation',statusCode:422});const body=await readBody(req,1024);if(body&&(typeof body!=='object'||Array.isArray(body)||Object.keys(body).length))throw Object.assign(Error('Preparation takes no source paths or body fields'),{code:'unknown_field',statusCode:422});value=await performance.prepare(params);status=202;}
   else if(suffix==='/performance/prepare'&&req.method==='GET')value=performance.status(params);
   else if(suffix==='/performance/prepare'&&req.method==='DELETE')value=performance.cancel(params);
   else throw Object.assign(Error('Method not allowed'),{code:'method_not_allowed',statusCode:405});
  }
  else if(suffix==='/capabilities'&&req.method==='GET')value={...service.capabilities(),preparedSignals:performance?.capabilities?.()||{state:'owner-unavailable'}};
  else if(suffix==='/director-proposals/preview'&&req.method==='POST'){
   let body;try{body=await readBody(req,1024*1024);}catch(error){if(error instanceof SyntaxError)throw Object.assign(Error('Director proposal is not valid JSON'),{code:'invalid_json',statusCode:400});throw error;}
   if(Object.keys(params).length||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!Object.hasOwn(body,'proposal'))throw Object.assign(Error('Supply only a director proposal'),{code:'invalid_director_proposal',statusCode:422});
   value=await service.previewDirectorProposal(body.proposal);
  }
  else if(suffix==='/media/resolve'&&req.method==='POST'){
   const body=await readBody(req,4096);if(Object.keys(params).length||!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).length!==1||!Object.hasOwn(body,'refs'))throw Object.assign(Error('Supply only exact media refs'),{code:'invalid_media_resolution',statusCode:422});
   value=await service.resolveMedia(body.refs);
  }
  else if(suffix==='/shared-card'&&req.method==='GET')value=service.sharedCard(params);
  else if(suffix==='/shared-card/prepare'&&req.method==='POST'){
   if(Object.keys(params).length)throw Object.assign(Error('Card preparation takes no query fields'),{code:'unknown_field',statusCode:422});
   let body;try{body=await readBody(req,4096);}catch(error){if(error instanceof SyntaxError)throw Object.assign(Error('Card target is not valid JSON'),{code:'invalid_json',statusCode:400});throw error;}
   value=await service.prepareSharedCard(body,caller);
  }
  else if(suffix==='/export'&&req.method==='GET'){
   if(params.includeNotes!==undefined&&!['true','false'].includes(params.includeNotes))throw Object.assign(Error('includeNotes must be true or false'),{code:'invalid_filter',statusCode:422});
   value=service.exportPackage({kind:params.kind,id:params.id,revision:params.revision,includeNotes:params.includeNotes==='true'});
  }
  else if(suffix==='/imports'&&req.method==='GET')value=service.importRefs(params.entityId,{offset,limit});
  else if(/^\/imports\/[a-f0-9]{64}$/.test(suffix)&&req.method==='GET')value=service.importRecord(suffix.split('/')[2]);
  else if(['/import/preview','/import/commit'].includes(suffix)&&req.method==='POST'){
   let body;try{body=await readBody(req,1024*1024);}catch(error){if(error instanceof SyntaxError)throw Object.assign(Error('Portable import is not valid JSON'),{code:'invalid_json',statusCode:400});if(error.statusCode===413)error.code='payload_too_large';throw error;}
   if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(Error('A portable import object is required'),{code:'invalid_import',statusCode:422});
   if(suffix==='/import/preview'){for(const key of Object.keys(body))if(key!=='package')throw Object.assign(Error('Unsupported preview field: '+key),{code:'unknown_field',statusCode:422});value=await service.importPreview(body.package);}else{value=await service.importCommit(body,caller);status=value.idempotentReplay?200:201;}
  }
  else if(suffix==='/readiness'&&req.method==='GET'){
   if(!sourceEvidence)throw Object.assign(Error('Source evidence owner unavailable'),{code:'source_owner_unavailable',statusCode:503});
   const evidence=await sourceEvidence({songId:params.songId,format:params.format||'mp3',runOffset:Number(params.runOffset||0),maxRuns:Number(params.maxRuns||1)});
   value={schemaVersion:'hapa.living-light.readiness.v1',songId:evidence.songId,evidence,authoring:'native-draft',sourceBinding:'unresolved',visualSignals:'unqualified',mixedRoutes:'unqualified',finalEncoding:'unsupported',analysisExecuted:false,storeMutation:false};
  }
  else if(fork&&req.method==='POST'){
   let body;try{body=await readBody(req,1024*1024);}catch(error){if(error instanceof SyntaxError)throw Object.assign(Error('Fork request is not valid JSON'),{code:'invalid_json',statusCode:400});if(error.statusCode===413)error.code='payload_too_large';throw error;}
   if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(Error('A fork request object is required'),{code:'invalid_fork',statusCode:422});
   const allowed=['sourceRevisionId','targetSongId','title','durationUs','timingPolicy',...(fork[2]?[]:['previewDigest','idempotencyKey'])];for(const key of Object.keys(body))if(!allowed.includes(key))throw Object.assign(Error('Unsupported request field: '+key),{code:'unknown_field',statusCode:422});
   value=fork[2]?await service.previewFork(decodeURIComponent(fork[1]),body):await service.forkJourney(decodeURIComponent(fork[1]),body,caller);status=fork[2]||value.idempotentReplay?200:201;
  }
  else if(suffix==='/journeys'&&req.method==='GET')value=service.listJourneys({songId:params.songId,search:params.search,offset,limit});
  else if(journey&&req.method==='GET'&&journey[4]!=='revisions')value=journey[4]==='history'?service.journeyHistory(decodeURIComponent(journey[1]),{offset,limit}):service.journey(decodeURIComponent(journey[1]),journey[3]?decodeURIComponent(journey[3]):params.revision);
  else if((suffix==='/journeys'||suffix==='/validate'||journey?.[4]==='revisions')&&req.method==='POST'){
   let body;try{body=await readBody(req,1024*1024);}catch(error){if(error instanceof SyntaxError)throw Object.assign(Error('Journey request is not valid JSON'),{code:'invalid_json',statusCode:400});if(error.statusCode===413)error.code='payload_too_large';throw error;}
   if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(Error('A Journey request object is required'),{code:'invalid_journey_request',statusCode:422});
   const allowed=suffix==='/validate'?['journey']:['journey','expectedRevision','idempotencyKey'];for(const key of Object.keys(body))if(!allowed.includes(key))throw Object.assign(Error('Unsupported request field: '+key),{code:'unknown_field',statusCode:422});
   value=suffix==='/validate'?await service.validateJourney(body.journey):await service.saveJourney({...body,journeyId:journey?decodeURIComponent(journey[1]):undefined},caller);status=suffix==='/validate'||value.idempotentReplay?200:201;
  }
  else if(suffix==='/things'&&req.method==='GET')value=service.listThings({kind:params.kind,variantKind:params.variantKind,search:params.search,offset,limit,includeArchived:params.includeArchived==='true'});
  else if((suffix==='/things'||thing?.[3]==='revisions')&&req.method==='POST'){
   let body;try{body=await readBody(req,1024*1024);}catch(error){if(error instanceof SyntaxError)throw Object.assign(Error('Preset request is not valid JSON'),{code:'invalid_json',statusCode:400});if(error.statusCode===413)error.code='payload_too_large';throw error;}
   if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(Error('A preset request object is required'),{code:'invalid_preset',statusCode:422});
   for(const key of Object.keys(body))if(!['derivedFrom','title','summary','parameters','expectedRevision','idempotencyKey'].includes(key))throw Object.assign(Error('Unsupported request field: '+key),{code:'unknown_field',statusCode:422});
   value=await service.savePreset(thing?decodeURIComponent(thing[1]):undefined,body,caller);status=value.idempotentReplay?200:201;
  }
  else if(['archive','restore'].includes(thing?.[3])&&req.method==='POST'){
   let body;try{body=await readBody(req,1024*1024);}catch(error){if(error instanceof SyntaxError)throw Object.assign(Error('Archive/restore request is not valid JSON'),{code:'invalid_json',statusCode:400});if(error.statusCode===413)error.code='payload_too_large';throw error;}
   value=await service.setThingVisibility(decodeURIComponent(thing[1]),thing[3]==='archive',body,caller);status=value.idempotentReplay||value.unchanged?200:201;
  }
  else if(thing?.[3]==='visibility-history'&&req.method==='GET')value=service.thingVisibilityHistory(decodeURIComponent(thing[1]),{offset,limit});
  else if(thing?.[3]==='history'&&req.method==='GET')value=service.thingHistory(decodeURIComponent(thing[1]),{offset,limit});
  else if(thing&&req.method==='GET'&&!thing[3])value=service.thing(decodeURIComponent(thing[1]),thing[2]?decodeURIComponent(thing[2]):undefined);
  else if(thing?.[3]==='materialize'&&req.method==='POST'){value=await service.materializeThing(decodeURIComponent(thing[1]),caller);status=201;}
  else if(suffix==='/notes'&&req.method==='GET'){
   let target;try{target=JSON.parse(params.target);}catch{throw Object.assign(Error('An exact note target is required'),{code:'invalid_note_target',statusCode:422});}
   value=service.notes({target,offset,limit,includeRetracted:params.includeRetracted==='true'});
  }else if(note?.[2]==='history'&&req.method==='GET')value=service.noteHistory(decodeURIComponent(note[1]),{offset,limit});
  else if((suffix==='/notes'||note)&&req.method==='POST'){
   let body;try{body=await readBody(req,1024*1024);}catch(error){if(error instanceof SyntaxError)throw Object.assign(Error('Note request is not valid JSON'),{code:'invalid_json',statusCode:400});if(error.statusCode===413)error.code='payload_too_large';throw error;}
   if(!body||typeof body!=='object'||Array.isArray(body))throw Object.assign(Error('A note request object is required'),{code:'invalid_note_request',statusCode:422});
   for(const key of Object.keys(body))if(!['target','body','expectedRevision','idempotencyKey'].includes(key))throw Object.assign(Error('Unsupported request field: '+key),{code:'unknown_field',statusCode:422});
   if(note?.[2]==='history')throw Object.assign(Error('Method not allowed'),{code:'method_not_allowed',statusCode:405});
   const eventType=suffix==='/notes'?'created':note[2]==='retract'?'retracted':'edited';
   value=await service.saveNote({...body,body:eventType==='retracted'?'':body.body,noteId:note?decodeURIComponent(note[1]):undefined,eventType},caller);status=value.idempotentReplay?200:201;
  }else if(suffix==='/source-evidence'&&req.method==='GET'&&sourceEvidence)value=await sourceEvidence({songId:params.songId,format:params.format||'mp3',runOffset:Number(params.runOffset||0),maxRuns:Number(params.maxRuns||1)});
  else throw Object.assign(Error('Living Light route is unavailable'),{code:'living_light_route_not_found',statusCode:404});
  sendJson(res,status,{ok:true,...value});
 }catch(error){sendJson(res,Number(error.statusCode||error.status||500),{ok:false,error:error.code||'living_light_request_failed',message:Number(error.statusCode||error.status||500)>=500?'Living Light could not complete this action. Your draft is retained.':error.message,...(error.currentHead?{currentHead:error.currentHead}:{}),...(error.currentVisibilityRevision!==undefined?{currentVisibilityRevision:error.currentVisibilityRevision}:{})});}
 return true;
}
