#!/usr/bin/env node
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
const prefix='/api/echos/living-light';
const fail=(code,message,status=422)=>{throw Object.assign(Error(message),{code,status});};
export async function runLivingLightCLI(argv,{env=process.env,fetcher=fetch,readFile=fs.readFile,stat=fs.stat}={}){
 const [op='help',...args]=argv,options={},pos=[];
 const flags=new Set(['api-url','kind','id','revision','song','format','limit','offset','search','variant-kind','include-archived','include-notes','file','preview-digest','key','dry-run','target','entity','history','run-offset','max-runs','request-id','job-id']);
 for(let i=0;i<args.length;i++){const a=args[i];if(!a.startsWith('--')){pos.push(a);continue;}const eq=a.indexOf('='),name=a.slice(2,eq<0?undefined:eq);if(!flags.has(name)||Object.hasOwn(options,name))fail('invalid_argument','Unknown or repeated option: '+name);if(['dry-run','include-archived','include-notes','history'].includes(name)){options[name]=eq<0?true:a.slice(eq+1)==='true';if(eq>=0&&!['true','false'].includes(a.slice(eq+1)))fail('invalid_argument','Boolean option must be true or false');}else{const value=eq<0?args[++i]:a.slice(eq+1);if(!value||value.startsWith('--'))fail('invalid_argument','Option requires a value: '+name);options[name]=value;}}
 const help={ok:true,interface:'protected Builder API; no direct store writes',usage:['capabilities','list --kind thing|journey [--song ID --search TEXT --include-archived]','get --kind thing|journey --id ID [--revision REV]','history --kind thing|journey --id ID','validate --file REQUEST.json','save --kind thing|journey [--id ID] --file REQUEST.json [--dry-run]','archive|restore --id ID --file REQUEST.json','fork --id JOURNEY --file REQUEST.json [--dry-run]','notes --target TARGET.json [--history --id NOTE]','note-save|note-revise|note-retract [--id NOTE] --file REQUEST.json','readiness --song ID','export --kind thing|journey --id ID [--revision REV --include-notes]','import --file PACKAGE.json [--preview-digest DIGEST --key KEY]','imports --entity ID | import-record --id DIGEST'],authentication:'HAPA_AVATAR_ADMIN_TOKEN environment only; never argv/browser storage',writes:'explicit native writes; import/fork previews are read-only; no automatic ambiguous retry',limits:{bodyBytes:1048576,responseBytes:4194304,timeoutMs:10000}};
 help.usage.push('resolve-media --file REFS.json (read-only exact cut lookup)','shared-card --kind thing|journey --id ID --revision REV','prepare-shared-card --kind thing|journey --id ID --revision REV [--dry-run]','signals --song ID','prepare-signals --song ID --request-id RETAINED_ID','signals-status --song ID [--request-id ID | --job-id ID]','cancel-signals --song ID --request-id ID | --job-id ID');help.limits.signalResponseBytes=33554432;
 if(op==='help'||op==='--help')return help;
 if(pos.length)fail('invalid_argument','Use named options; positional values are unsupported');
 const token=env.HAPA_AVATAR_ADMIN_TOKEN;if(typeof token!=='string'||!token.trim())fail('auth_not_configured','HAPA_AVATAR_ADMIN_TOKEN must be configured for protected CLI access',401);
 let url;try{url=new URL(options['api-url']||env.HAPA_AVATAR_API_URL||'http://127.0.0.1:8797');}catch{fail('invalid_api_url','Expected the local Builder URL');}
 if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.protocol!=='http:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)fail('invalid_api_url','Use a literal loopback HTTP Builder authority without credentials, path, query or fragment');
 const input=async file=>{if(!file)fail('input_required','An explicit metadata JSON file is required');if((await stat(file)).size>1048576)fail('payload_too_large','Input exceeds the 1 MiB request limit',413);try{return JSON.parse(await readFile(file,'utf8'));}catch{fail('invalid_json','Metadata input is not valid JSON');}};
 const query=fields=>'?'+new URLSearchParams(Object.entries(fields).filter(([,v])=>v!==undefined).map(([k,v])=>[k,String(v)])).toString(),exact=v=>{if(typeof v!=='string'||!v||v.length>256||!/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(v))fail('invalid_id','An exact namespaced ID is required');return encodeURIComponent(v);};
 let suffix,method='GET',body;
 const kind=options.kind;if(['list','get','history','save','export','shared-card','prepare-shared-card'].includes(op)&&!['thing','journey'].includes(kind))fail('invalid_kind','Choose --kind thing or journey');
 if(op==='capabilities')suffix='/capabilities';
 else if(op==='resolve-media'){suffix='/media/resolve';method='POST';body=await input(options.file);}
 else if(['signals','prepare-signals','signals-status','cancel-signals'].includes(op)){
  exact(options.song);
  if(options['request-id']!==undefined&&!/^[a-zA-Z0-9-]{16,80}$/.test(options['request-id']))fail('invalid_request_id','Retain one bounded request ID for this preparation.');
  if(options['job-id']!==undefined)exact(options['job-id']);
  if(options['request-id']&&options['job-id'])fail('invalid_argument','Choose one request ID or job ID.');
  if(op==='signals'&&(options['request-id']||options['job-id']))fail('invalid_argument','Prepared reads use only the exact Song.');
  if(op==='prepare-signals'&&(!options['request-id']||options['job-id']))fail('idempotency_required','Preparation requires the retained --request-id; no job ID.');
  if(op==='cancel-signals'&&!options['request-id']&&!options['job-id'])fail('identity_required','Cancel only an explicitly selected request or job.');
  if(['prepare-signals','cancel-signals'].includes(op)&&options['dry-run'])fail('dry_run_unsupported','Use signals-status for a read-only check; no mutation was submitted.');
  suffix=(op==='signals'?'/performance':'/performance/prepare')+query({songId:options.song,requestId:options['request-id'],jobId:options['job-id']});
  if(op==='prepare-signals'){method='POST';body={};}if(op==='cancel-signals')method='DELETE';
 }
 else if(['shared-card','prepare-shared-card'].includes(op)){
  exact(options.id);exact(options.revision);const target={kind,id:options.id,revision:options.revision};
  if(op==='prepare-shared-card'&&!options['dry-run']){suffix='/shared-card/prepare';method='POST';body=target;}else suffix='/shared-card'+query(target);
 }
 else if(op==='list')suffix=(kind==='thing'?'/things':'/journeys')+query({songId:options.song,search:options.search,limit:options.limit,offset:options.offset,variantKind:options['variant-kind'],includeArchived:options['include-archived']});
 else if(['get','history'].includes(op))suffix=(kind==='thing'?'/things/':'/journeys/')+exact(options.id)+(op==='history'?'/history'+query({limit:options.limit,offset:options.offset}):options.revision?'/revisions/'+exact(options.revision):'');
 else if(op==='readiness')suffix='/readiness'+query({songId:options.song,format:options.format,runOffset:options['run-offset'],maxRuns:options['max-runs']});
 else if(op==='export')suffix='/export'+query({kind,id:options.id,revision:options.revision,includeNotes:options['include-notes']});
 else if(op==='imports')suffix='/imports'+query({entityId:options.entity,limit:options.limit,offset:options.offset});
 else if(op==='import-record')suffix='/imports/'+exact(options.id);
 else if(op==='notes')suffix=options.history?'/notes/'+exact(options.id)+'/history'+query({limit:options.limit,offset:options.offset}):'/notes'+query({target:JSON.stringify(await input(options.target)),limit:options.limit,offset:options.offset});
 else if(op==='import'){const packet=await input(options.file);method='POST';if(options['preview-digest']&&!options['dry-run']){if(!options.key)fail('idempotency_required','Commit requires the retained --key for this exact reviewed import');suffix='/import/commit';body={package:packet,previewDigest:options['preview-digest'],idempotencyKey:options.key};}else{suffix='/import/preview';body={package:packet};}}
 else if(op==='validate'){suffix='/validate';method='POST';body=await input(options.file);}
 else if(op==='save'){body=await input(options.file);method='POST';if(options['dry-run']){if(kind==='thing')fail('dry_run_unsupported','Preset write preview is not qualified; no mutation was submitted');suffix='/validate';body={journey:body.journey};}else suffix=(kind==='thing'?'/things':'/journeys')+(options.id?'/'+exact(options.id)+'/revisions':'');}
 else if(op==='fork'){method='POST';body=await input(options.file);suffix='/journeys/'+exact(options.id)+'/fork'+(options['dry-run']?'/preview':'');}
 else if(['archive','restore','note-save','note-revise','note-retract'].includes(op)){if(options['dry-run'])fail('dry_run_unsupported','This write has no qualified dry-run route; no mutation was submitted');method='POST';body=await input(options.file);suffix=op==='note-save'?'/notes':op==='note-revise'?'/notes/'+exact(options.id)+'/revisions':op==='note-retract'?'/notes/'+exact(options.id)+'/retract':'/things/'+exact(options.id)+'/'+op;}
 else fail('unknown_command','Unknown Living Light command; use help');
 const serialized=body===undefined?undefined:JSON.stringify(body);if(serialized&&Buffer.byteLength(serialized)>1048576)fail('payload_too_large','Request exceeds the 1 MiB body limit',413);
 let response;try{response=await fetcher(url.origin+prefix+suffix,{method,headers:{authorization:'Bearer '+token,...(serialized?{'content-type':'application/json'}:{})},body:serialized,signal:AbortSignal.timeout(10000),redirect:'error'});}catch{fail('transport_unresolved',method!=='GET'?'Request outcome is unresolved. Keep this exact request identity and reconcile before retrying.':'Local Builder transport failed; inspect its owner service before retrying.',503);}
 const responseLimit=op==='signals'?33554432:4194304;
 let bytes=0,chunks=[];if(response.body){const reader=response.body.getReader();try{for(;;){const row=await reader.read();if(row.done)break;bytes+=row.value.byteLength;if(bytes>responseLimit)fail('response_too_large','Response exceeds the bounded CLI limit',413);chunks.push(Buffer.from(row.value));}}finally{await reader.cancel().catch(()=>{});}}
 let result;try{result=JSON.parse(Buffer.concat(chunks).toString());}catch{fail('invalid_response','Builder returned invalid JSON',502);}
 if(!response.ok||result.ok===false)throw Object.assign(Error(result.message||'Builder rejected the request'),{code:result.error||'request_rejected',status:response.status,...(result.currentHead?{currentHead:result.currentHead}:{}),...(result.currentVisibilityRevision!==undefined?{currentVisibilityRevision:result.currentVisibilityRevision}:{})});return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(await fs.realpath(process.argv[1]).catch(()=>process.argv[1])).href){try{console.log(JSON.stringify(await runLivingLightCLI(process.argv.slice(2)),null,2));}catch(e){console.error(JSON.stringify({ok:false,error:e.code||'living_light_cli_failed',message:e.message,status:e.status||500,...(e.currentHead?{currentHead:e.currentHead}:{}),...(e.currentVisibilityRevision!==undefined?{currentVisibilityRevision:e.currentVisibilityRevision}:{})}));process.exitCode=1;}}
