import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export const WRITER_CHARACTER_CONTRACT = 'hapa.writer-characters/v2';
export const WRITER_TRANSFER_DEFAULTS = Object.freeze({requestLimitBytes:32*1024*1024,outputLimitBytes:64*1024*1024});
const BASE = '/v1/writer-characters';
const OWNER = 'hapa-avatar-builder';
const LAYERS = ['canon', 'memory', 'development', 'lore'];
const transferLimit = value => { if (!Number.isSafeInteger(value) || value < 1) throw new Error('Transfer limits must be positive safe integer byte counts.'); return value; };
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const fail = (code, message, statusCode = 400, extra = {}) => Object.assign(new Error(message), { code, statusCode, ...extra });
const equal = (a, b) => {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length > 0 && x.length === y.length && timingSafeEqual(x, y);
};
const plain = (x) => x && typeof x === 'object' && !Array.isArray(x);
const stable = (value) => JSON.stringify(value, function (_key, x) {
  return plain(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x;
});
const digest = (value) => createHash('sha256').update(stable(value)).digest('hex');
const text = (value, limit = 2048) => typeof value === 'string' ? value.slice(0, limit) : '';
const identifier = (value, name) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(value)) throw fail('invalid_identifier', `${name} must be an exact stable identifier.`);
  return value;
};
const projectionCache = new WeakMap();
export function writerScope(input = {}) {
  if (!plain(input) || Object.keys(input).some(k => !['projectId','branchId','sceneId'].includes(k))) throw fail('invalid_scope', 'Unknown character scope field.');
  return { projectId: identifier(input.projectId ?? 'global', 'projectId'), branchId: input.branchId == null ? null : identifier(input.branchId, 'branchId'), sceneId: input.sceneId == null ? null : identifier(input.sceneId, 'sceneId') };
}
export function validateWriterLayers(layers) {
  if (!plain(layers) || Object.keys(layers).length !== 4 || LAYERS.some(k => typeof layers[k] !== 'string')) throw fail('invalid_layers', 'Supply exactly Canon, Memory, Development and Lore as text.');
  return Object.fromEntries(LAYERS.map(k => [k, layers[k]]));
}


export function validateWriterSources(sources, maximum = 127) {
  if (!Array.isArray(sources) || !sources.length || sources.length > maximum) throw fail('invalid_sources', `Supply 1–${maximum} structured source references.`);
  return sources.map(source => {
    if (!plain(source) || Object.keys(source).some(k=>!['owner','id','revision','digest','kind','uri'].includes(k))) throw fail('invalid_sources','Use owner, id, revision and optional digest, kind or uri for each source.');
    for (const k of ['owner','id','revision']) if (typeof source[k] !== 'string' || !source[k].trim() || source[k].length > 240) throw fail('invalid_sources',`Source ${k} must be a nonblank string of at most 240 characters.`);
    if (source.digest !== undefined && !hash(source.digest)) throw fail('invalid_sources','Source digest must be SHA-256.');
    if (source.kind !== undefined && (typeof source.kind !== 'string' || !source.kind.trim() || source.kind.length > 240)) throw fail('invalid_sources','Source kind must be nonblank text of at most 240 characters.');
    if (source.uri !== undefined && (typeof source.uri !== 'string' || !source.uri.trim() || source.uri.length > 4096)) throw fail('invalid_sources','Source URI must be nonblank text of at most 4096 characters.');
    return {...source};
  });
}
export function validateWriterProvenance(value, checkpoint = false) {
  if (!plain(value) || Object.keys(value).some(k=>!['changeType','reason','restoreFrom'].includes(k)) || ![checkpoint?'checkpoint':'edit','restore'].includes(value.changeType) || typeof value.reason !== 'string' || !value.reason.trim() || value.reason.length > 16000) throw fail('invalid_provenance','Supply the change type and a nonblank reason (up to 16000 metadata characters).');
  if (value.changeType === 'restore') {
    if (!plain(value.restoreFrom) || Object.keys(value.restoreFrom).some(k=>!['revision','digest'].includes(k)) || !Number.isSafeInteger(value.restoreFrom.revision) || value.restoreFrom.revision < 1 || !hash(value.restoreFrom.digest)) throw fail('invalid_provenance','Restoring requires an exact historical revision and SHA-256 digest.');
  } else if (value.restoreFrom !== undefined) throw fail('invalid_provenance','Only a restore may name restoreFrom.');
  return {...value};
}
function expectedRevision(revision, value) {
  if (!Number.isSafeInteger(revision) || revision < 0 || (revision===0 ? value!==null : !hash(value))) throw fail('invalid_revision','Supply the exact current revision and digest (zero/null only for an uninitialized scope).');
}
function positiveParameter(value, name, maximum = Number.MAX_SAFE_INTEGER) {
  if (!/^[1-9][0-9]*$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value)>maximum) throw fail('invalid_revision',`${name} must be a positive integer${maximum<Number.MAX_SAFE_INTEGER?` up to ${maximum}`:''}.`);
  return Number(value);
}
function historicalQuery(params, revision) {
  const result={};
  if (revision !== undefined) result.revision=positiveParameter(revision,'revision');
  if (params.has('asOf')) {
    if (revision!==undefined) throw fail('invalid_revision','Choose either an exact revision or an as-of timestamp.');
    const value=params.get('asOf');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value) || !Number.isFinite(Date.parse(value))) throw fail('invalid_timestamp','asOf must be an explicit UTC ISO timestamp.');
    result.asOf=value;
  }
  return result;
}
function historyQuery(params) {
  return {...(params.has('beforeRevision')?{beforeRevision:positiveParameter(params.get('beforeRevision'),'beforeRevision')}:{}),limit:params.has('limit')?positiveParameter(params.get('limit'),'limit',100):20};
}
function scopeQuery(params) {return writerScope(Object.fromEntries(['projectId','branchId','sceneId'].filter(k=>params.has(k)).map(k=>[k,params.get(k)])));}
function checkpointKey(input) {
  return {owner:'hapa-writers-room',projectId:identifier(input.projectId,'projectId'),branchId:input.branchId==null?null:identifier(input.branchId,'branchId')};
}

// The display projection deliberately excludes paths, embedded media and generated
// normalizer timestamps. It is an exact revision of this bounded owner view.
export function projectWriterCharacter(avatar, { assetsEnabled = false } = {}) {
  const cached = projectionCache.get(avatar);
  if (cached?.assetsEnabled === assetsEnabled) return cached.projection;
  const id = identifier(avatar.id, 'avatarId');
  const mind = plain(avatar.mind) ? avatar.mind : {};
  const omissions = [];
  function bounded(value, key, depth = 0) {
    if (typeof value === 'string') { if (value.length > 4096) omissions.push(`${key}: text shortened`); return value.slice(0, 4096); }
    if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
    if (depth > 4) { omissions.push(`${key}: nested detail omitted`); return null; }
    if (Array.isArray(value)) { if (value.length > 12) omissions.push(`${key}: ${value.length - 12} records omitted`); return value.slice(0,12).map((v,i) => bounded(v, `${key}[${i}]`, depth+1)); }
    if (!plain(value)) return null;
    const entries = Object.entries(value).filter(([k]) => !/(path|uri|url|token|secret|password|createdAt|updatedAt)/i.test(k));
    if (entries.length > 24) omissions.push(`${key}: fields omitted`);
    return Object.fromEntries(entries.slice(0,24).map(([k,v]) => [k, bounded(v, `${key}.${k}`, depth+1)]));
  }
  const fields = ['personaAnchor','selfKnowledge','memoryLedger','canonicalChoices','storySpine','voiceGuide','soulSeed','consciousnessContext'];
  const sourceContext = { owner: OWNER, authority: 'Existing Avatar Mind; source classifications are preserved and are not promoted into the four new layers.', fields: Object.fromEntries(fields.filter(k => mind[k] != null).map(k => [k, bounded(mind[k], k)])), backgroundNarrative: bounded(avatar.three_paragraph_background_narrative || '', 'backgroundNarrative'), omissions };
  // Prevent an unexpectedly rich legacy object from creating an unbounded UI packet.
  if (Buffer.byteLength(JSON.stringify(sourceContext)) > 128 * 1024) {
    sourceContext.fields = { personaAnchor: bounded(mind.personaAnchor || {}, 'personaAnchor') };
    omissions.push('Extended source context omitted: display exceeds 128 KiB; inspect the native Avatar Mind.');
    if (Buffer.byteLength(JSON.stringify(sourceContext)) > 128 * 1024) {
      sourceContext.fields = {};
      sourceContext.omissions = ['Native Mind context exceeds the 128 KiB display bound; inspect this Avatar’s native Mind before drawing conclusions.'];
    }
  }
  const allAssets = Array.isArray(avatar.assets) ? avatar.assets : [];
  const appearances = allAssets.slice(0,80).map(asset => {
    const assetId = text(asset.id,160);
    const kind = ['image','video','model','audio'].includes(asset.type) ? asset.type : 'other';
    const endpoint = assetsEnabled && assetId && ['image','video'].includes(kind) ? `${BASE}/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}` : null;
    return {assetId, label:text(asset.name || asset.label || asset.id,160), kind, previewUrl:endpoint ? `${endpoint}?variant=preview` : null, mediaUrl:endpoint, source:text(typeof asset.source === 'string' ? asset.source : asset.source?.type,160), rights:text(asset.rights?.label || (typeof asset.rights === 'string' ? asset.rights : ''),160), generated: Boolean(asset.generated || asset.metadata?.generated || asset.generation), status:text(asset.status,80)};
  });
  if (allAssets.length > appearances.length) sourceContext.omissions.push(`appearances: ${allAssets.length - appearances.length} records omitted; inspect Builder media.`);
  if (Buffer.byteLength(JSON.stringify(sourceContext)) > 128 * 1024) {
    sourceContext.fields = {};
    sourceContext.omissions = ['Native Mind context exceeds the 128 KiB display bound; inspect this Avatar’s native Mind and media before drawing conclusions.'];
  }
  const projection = { avatarId:id, label:text(avatar.primaryName || id,160), aliases:(avatar.names || []).map(n=>text(typeof n==='string'?n:n.name,160)).filter(Boolean).slice(0,16), sourceContext, appearances };
  const ownerRevision = digest({ ...projection, nativeUpdatedAt:avatar.updatedAt || null, assets:allAssets.map(a=>({id:a.id,uriDigest:createHash('sha256').update(String(a.uri||'')).digest('hex'),thumbnailDigest:createHash('sha256').update(String(a.thumbnailUri||a.metadata?.thumbnailUri||'')).digest('hex'),updatedAt:a.updatedAt})) });
  const result = { ...projection, owner:OWNER, ownerRevision, thumbnailUrl:appearances.find(a=>a.kind==='image' && a.previewUrl)?.previewUrl || null };
  projectionCache.set(avatar,{assetsEnabled,projection:result});
  return result;
}

// One finite Python owner invocation at a time. No shell, inherited preload,
// model process, daemon, retry loop or background queue exists on this path.
export function createCharacterMemoryClient({ python, script, accessFile, timeoutMs = 15000, requestLimitBytes = WRITER_TRANSFER_DEFAULTS.requestLimitBytes, outputLimitBytes = WRITER_TRANSFER_DEFAULTS.outputLimitBytes, spawnImpl = spawn, env = {} }) {
  if (![python, script, accessFile].every(p => typeof p === 'string' && p.startsWith('/'))) throw new Error('Character memory paths must be explicit absolute paths.');
  transferLimit(requestLimitBytes); transferLimit(outputLimitBytes);
  let active = false, stopping = false, stopActive = null, activeClosed = Promise.resolve();
  const memory = async function memory(command, request, { signal, apply = false } = {}) {
    if (!['read','save','history','verify','checkpoint-read','checkpoint-save','checkpoint-history','checkpoint-verify'].includes(command)) throw fail('invalid_command', 'Unsupported character memory command.');
    if (active) throw fail('memory_busy', 'Another character memory operation is finishing. Retry after it completes.', 503);
    if (stopping) throw fail('memory_unavailable','Character service is stopping.',503);
    if (signal?.aborted) throw fail('request_aborted', 'Request cancelled.', 499);
    const payload = JSON.stringify(request);
    if (Buffer.byteLength(payload) > requestLimitBytes) throw fail('request_transport_limit', `This transfer exceeds the configured ${requestLimitBytes}-byte request budget. No text was truncated or saved.`, 413);
    active = true;
    let markClosed; activeClosed = new Promise(resolve => { markClosed=resolve; });
    try {
      return await new Promise((resolve, reject) => {
        const args = ['-E', '-s', '-B', script, command, '--access-file', accessFile, '--request', '-', '--request-limit-bytes', String(requestLimitBytes), '--output-limit-bytes', String(outputLimitBytes), ...(apply ? ['--apply'] : [])];
        const child = spawnImpl(python, args, { shell:false, detached:false, stdio:['pipe','pipe','pipe'], env:{ PATH:'/usr/bin:/bin:/usr/sbin:/sbin', LANG:'en_US.UTF-8', HAPA_CHARACTER_MEMORY_WORKER:'1', ...Object.fromEntries(Object.entries(env).filter(([k])=>['HOME','TMPDIR'].includes(k))) } });
        let output = '', outputBytes = 0, stderrBytes = 0, issue = null, killTimer;
        const decoder = new StringDecoder('utf8');
        const terminate = (error) => {
          if (issue) return; issue = error;
          child.kill('SIGTERM');
          killTimer = setTimeout(() => child.kill('SIGKILL'), 750);
        };
        stopActive = () => terminate(fail('request_aborted','Character service is stopping; refresh before retrying a save.',499));
        const timer = setTimeout(() => terminate(fail('memory_timeout', 'Second Brain did not finish in time. Refresh before retrying a save.', 504)), timeoutMs);
        const abort = () => terminate(fail('request_aborted', 'Request cancelled. Refresh before retrying a save.', 499));
        signal?.addEventListener('abort', abort, { once:true });
        child.stdout.on('data', chunk => { outputBytes += chunk.length; if (outputBytes > outputLimitBytes) terminate(fail('output_transport_limit','Second Brain response exceeded its configured transfer budget. Refresh before retrying a save.',413)); else output += decoder.write(chunk); });
        child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) terminate(fail('memory_error_too_large','Second Brain diagnostics exceeded their limit.',502)); });
        child.stdin.on('error', () => {});
        child.on('error', () => { issue ||= fail('memory_unavailable','Second Brain could not be started.',503); });
        child.on('close', (code) => {
          clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
          if (issue) { reject(issue); return; }
          let result; try { result = JSON.parse(output + decoder.end()); } catch { reject(fail('memory_invalid_response','Second Brain returned an invalid response.',502)); return; }
          if (code !== 0 || result.ok !== true) {
            const sourceCode=result.error?.code || 'memory_unavailable';
            const conflict=sourceCode==='revision_conflict';
            const mapped=conflict ? (command.startsWith('checkpoint-')?'checkpoint_revision_conflict':'memory_revision_conflict') : sourceCode;
            const invalid=sourceCode.startsWith('invalid_') || ['restore_reference_mismatch','character_reference_mismatch','song_excerpt_digest_mismatch','nonempty_structured_sources_required','reference_envelope_limit','duplicate_character_reference','snapshot_json_string_required','exclusive_revision_or_asof_required'].includes(sourceCode);
            const status=conflict || sourceCode==='operation_id_conflict' ? 409 : sourceCode==='revision_not_found'?404 : ['request_transport_limit','output_transport_limit','json_nesting_transport_limit'].includes(sourceCode)?413 : invalid?400 : ['access_denied','project_access_denied','actor_not_granted'].includes(sourceCode)?403:503;
            reject(fail(mapped, conflict ? 'Saved history changed. Refresh and compare your draft.' : status===413?'The configured transfer budget was exceeded. No text was truncated.':'Second Brain could not complete this operation.', status, {current:result.error?.current})); return;
          }
          resolve(result);
        });
        child.stdin.end(payload);
      });
    } finally { active = false; stopActive=null; markClosed(); }
  };
  memory.close = async () => { stopping=true; stopActive?.(); await activeClosed; };
  return memory;
}

function send(res, status, body) {
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
  res.end(JSON.stringify(body));
}
async function body(req, limit) {
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if (size>limit) throw fail('request_transport_limit',`This transfer exceeds the configured ${limit}-byte request budget. No text was truncated or saved.`,413); chunks.push(chunk); }
  try { return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks))); } catch { throw fail('invalid_json','Expected a JSON request.'); }
}
const loopbackHost = host => ['127.0.0.1','[::1]','::1'].includes(String(host).toLowerCase());
const localPeer = peer => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);

export function createWriterCharactersHandler({getAvatars, writerRoomIndexPath, port, host, adminToken='', secondBrain, memoryClient, serveAsset, handleExtension, requestLimitBytes=secondBrain?.requestLimitBytes??WRITER_TRANSFER_DEFAULTS.requestLimitBytes, outputLimitBytes=secondBrain?.outputLimitBytes??WRITER_TRANSFER_DEFAULTS.outputLimitBytes, instanceId=`instance:avatar-builder:${randomBytes(12).toString('hex')}`, now=Date.now}) {
  if (typeof getAvatars !== 'function') throw new Error('getAvatars owner reader required.');
  transferLimit(requestLimitBytes); transferLimit(outputLimitBytes);
  const memory = memoryClient || createCharacterMemoryClient({...secondBrain,requestLimitBytes,outputLimitBytes});
  const cookieName = `hapa_writer_character_${port}`;
  const sessions = new Map();
  const TTL = 20 * 60 * 1000;
  function browserContext(req, { mutation=false, bootstrap=false, asset=false }={}) {
    if (!loopbackHost(host) || !localPeer(req.socket?.remoteAddress)) return false;
    const authority = req.headers.host;
    if (authority !== `${String(host).includes(':')?'[::1]':host}:${port}`) return false;
    const expected = `${req.socket?.encrypted?'https':'http'}://${authority}`;
    if (req.headers['sec-fetch-site'] !== 'same-origin') return false;
    if (!asset && req.headers['x-hapa-first-party'] !== 'writers-room') return false;
    if (mutation || bootstrap) return req.headers.origin === expected;
    try { return (req.headers.origin || new URL(req.headers.referer).origin) === expected; } catch { return false; }
  }
  function authorized(req, { asset=false }={}) {
    if (adminToken && equal(req.headers.authorization, `Bearer ${adminToken}`)) return true;
    if (!browserContext(req,{mutation:!['GET','HEAD'].includes(req.method),asset})) return false;
    const value = String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
    const expires = sessions.get(value);
    if (!expires || expires <= now()) { if(value) sessions.delete(value); return false; }
    return true;
  }
  async function getOwnerView(id) {
    const avatars=await getAvatars();
    const matches=avatars.filter(a=>a.id===id && !a.isExternalProjection && !a.projection?.readOnly);
    if (!matches.length) throw fail('avatar_not_found','Avatar not found in the canonical Builder.',404);
    if (matches.length!==1) throw fail('ambiguous_avatar','Duplicate stable Avatar ID requires owner repair.',409);
    return projectWriterCharacter(matches[0],{assetsEnabled:Boolean(serveAsset)});
  }
  function characterIdentity(character,id,scope) {
    if (!plain(character) || character.owner!==OWNER || character.avatarId!==id || stable(character.scope)!==stable(scope)) throw fail('memory_identity_mismatch','Second Brain returned a different character identity.',502);
  }
  async function getCharacter(id, scope, signal, selection={}) {
    const view=await getOwnerView(id);
    try {
      const result=await memory('read',{owner:OWNER,avatarId:id,scope,...selection},{signal});
      characterIdentity(result.character,id,scope);
      return {...view,scope,memoryStatus:'available',memory:result.character,historical:Boolean(result.historical || selection.revision || selection.asOf),currentMemoryHead:result.currentHead||{revision:result.character.revision,digest:result.character.digest},sourceContextState:'current-owner-projection'};
    } catch(error) {
      if (signal?.aborted || error.code==='revision_not_found' || error.code==='memory_identity_mismatch' || error.statusCode===413) throw error;
      return {...view,scope,memoryStatus:'unavailable',memory:null,memoryError:{code:error.code||'memory_unavailable',message:error.message},sourceContextState:'current-owner-projection'};
    }
  }
  function checkpointIdentity(result,key,required=true) {
    if ((required && !plain(result.checkpoint)) || (result.checkpoint && stable(result.checkpoint.key)!==stable(key))) throw fail('memory_identity_mismatch','Second Brain returned a different checkpoint identity.',502);
  }
  const handle = async function handle(req,res,url) {
    const pathname = url.pathname;
    if (['/writers-room/','/writers-room/index.html','/writers-room'].includes(pathname)) {
      if(req.method!=='GET') {send(res,405,{error:'method_not_allowed'});return true;}
      try {const bytes=await readFile(writerRoomIndexPath);res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(bytes);} catch {send(res,503,{error:'writers_room_unavailable',message:'The installed Writer’s Room could not be opened.'});}
      return true;
    }
    if (pathname!==BASE && !pathname.startsWith(`${BASE}/`)) return false;
    const controller = new AbortController();
    const close = () => {if(!res.writableEnded)controller.abort();};
    res.on('close',close);
    try {
      if(pathname===`${BASE}/session` && req.method==='POST') {
        if(!browserContext(req,{bootstrap:true}) || Number(req.headers['content-length']||0)!==0 || req.headers['transfer-encoding']) throw fail('writer_session_denied','Open the connected room on its literal loopback address.',403);
        for(const [token,expires] of sessions) if(expires<=now())sessions.delete(token);
        if(sessions.size>=128)throw fail('writer_session_limit','Close unused connected rooms and try again later.',503);
        const token=randomBytes(32).toString('base64url'); sessions.set(token,now()+TTL);
        res.setHeader('Set-Cookie',`${cookieName}=${token}; Path=${BASE}; HttpOnly; SameSite=Strict; Max-Age=${TTL/1000}${req.socket?.encrypted?'; Secure':''}`);
        send(res,201,{ok:true,contract:WRITER_CHARACTER_CONTRACT,expiresInSeconds:TTL/1000});return true;
      }
      const assetMatch=pathname.match(/^\/v1\/writer-characters\/([^/]+)\/assets\/([^/]+)$/);
      if(!authorized(req,{asset:Boolean(assetMatch)})) {send(res,401,{error:'writer_session_required',preDispatch:true,message:'A fresh connected-room session is required.'});return true;}
      const actor={actorId:adminToken && equal(req.headers.authorization, `Bearer ${adminToken}`)?'api-client':'local-operator',instanceId};
      if(pathname===`${BASE}/capabilities` && req.method==='GET') {send(res,200,{ok:true,contract:WRITER_CHARACTER_CONTRACT,owner:OWNER,memoryOwner:'hapa-second-brain',features:['list','read','save','history','historical-read','as-of-read','append-only-restore','verify','checkpoints','sync','owner-media'],layers:LAYERS,layerLengthLimit:null,transferLimits:{requestBytes:requestLimitBytes,outputBytes:outputLimitBytes,policy:'Configured transfer resource budgets; no authoring limit and no truncation.'},limits:{list:100,historyPage:100,sources:128},identity:'Exact Builder avatarId and explicit project/branch/scene scope; no name joins.',stage:'prototype'});return true;}
      if (handleExtension && await handleExtension(req,res,{url,actor,instanceId,signal:controller.signal})) return true;
      const checkpointMatch=pathname.match(/^\/v1\/writer-characters\/checkpoints(?:\/(current|[1-9][0-9]*))?$/);
      if (checkpointMatch) {
        if (req.method==='GET') {
          const key=checkpointKey({projectId:url.searchParams.get('projectId'),branchId:url.searchParams.get('branchId')});
          const command=checkpointMatch[1]?'checkpoint-read':'checkpoint-history';
          const query=checkpointMatch[1]?historicalQuery(url.searchParams,checkpointMatch[1]==='current'?undefined:checkpointMatch[1]):historyQuery(url.searchParams);
          const result=await memory(command,{...key,...query},{signal:controller.signal});
          checkpointIdentity(result,key,command!=='checkpoint-history'); send(res,200,result); return true;
        }
        if (req.method==='POST' && !checkpointMatch[1]) {
          const input=await body(req,requestLimitBytes);
          if (!plain(input)) throw fail('invalid_request','Expected a checkpoint request object.');
          const key=checkpointKey(input);
          const operationId=identifier(input.operationId,'operationId'); expectedRevision(input.expectedRevision,input.expectedDigest);
          if (typeof input.snapshotJson!=='string' || !Array.isArray(input.characterRefs) || !Array.isArray(input.songRefs)) throw fail('invalid_checkpoint','Supply the exact project JSON string and explicit character/song reference arrays.');
          try {if(!plain(JSON.parse(input.snapshotJson)))throw new Error();} catch {throw fail('invalid_checkpoint','snapshotJson must preserve a valid JSON object.');}
          const sources=validateWriterSources(input.sources,128),provenance=validateWriterProvenance(input.provenance,true);
          const result=await memory('checkpoint-save',{...key,operationId,actor,expectedRevision:input.expectedRevision,expectedDigest:input.expectedDigest,snapshotJson:input.snapshotJson,characterRefs:input.characterRefs,songRefs:input.songRefs,sources,provenance},{signal:controller.signal,apply:input.dryRun!==true});
          checkpointIdentity(result,key);send(res,200,{...result,saved:input.dryRun!==true});return true;
        }
        throw fail('method_not_allowed','Unsupported checkpoint operation.',405);
      }
      if(assetMatch && req.method==='GET') {
        const id=decodeURIComponent(assetMatch[1]), assetId=decodeURIComponent(assetMatch[2]);
        const avatar=(await getAvatars()).find(a=>a.id===id && !a.isExternalProjection && !a.projection?.readOnly);
        const asset=avatar?.assets?.find(a=>a.id===assetId);
        if(!asset || !serveAsset || !await serveAsset({req,res,asset,avatarId:id,variant:url.searchParams.get('variant')==='preview'?'preview':'full'}))send(res,404,{error:'asset_unavailable'});
        return true;
      }
      if(pathname===BASE && req.method==='GET') {
        const all=(await getAvatars()).filter(a=>!a.isExternalProjection && !a.projection?.readOnly);
        const q=(url.searchParams.get('q')||'').slice(0,160).toLowerCase();
        const matching=all.filter(a=>!q||`${a.id} ${a.primaryName}`.toLowerCase().includes(q));
        const offset=Math.max(0,Math.trunc(Number(url.searchParams.get('offset'))||0)),limit=Math.max(1,Math.min(100,Math.trunc(Number(url.searchParams.get('limit'))||50)));
        const characters=matching.slice(offset,offset+limit).map(a=>{const p=projectWriterCharacter(a,{assetsEnabled:Boolean(serveAsset)});return {avatarId:p.avatarId,label:p.label,ownerRevision:p.ownerRevision,thumbnailUrl:p.thumbnailUrl};});
        send(res,200,{contract:WRITER_CHARACTER_CONTRACT,owner:OWNER,total:matching.length,offset,limit,hasMore:offset+limit<matching.length,characters});return true;
      }
      const match=pathname.match(/^\/v1\/writer-characters\/([^/]+)(?:\/(sync|history|verify)|\/revisions\/([1-9][0-9]*))?$/);
      if(!match)throw fail('not_found','Unknown character route.',404);
      const id=identifier(decodeURIComponent(match[1]),'avatarId');
      if(req.method==='GET') {
        const scope=scopeQuery(url.searchParams);
        if(['history','verify'].includes(match[2])) {
          await getOwnerView(id);
          const result=await memory(match[2],{owner:OWNER,avatarId:id,scope,...historyQuery(url.searchParams)},{signal:controller.signal});send(res,200,result);
        } else if(!match[2])send(res,200,await getCharacter(id,scope,controller.signal,historicalQuery(url.searchParams,match[3])));
        else throw fail('method_not_allowed','Use POST to refresh character context.',405);
        return true;
      }
      if((req.method==='PUT'&&!match[2]&&!match[3])||(req.method==='POST'&&match[2]==='sync')) {
        const input=await body(req,requestLimitBytes);
        if(!plain(input))throw fail('invalid_request','Expected a character request object.');
        const scope=writerScope(input.scope||{});
        if(match[2]==='sync') {send(res,200,await getCharacter(id,scope,controller.signal));return true;}
        const current=await getOwnerView(id);
        if(input.expectedOwnerRevision!==current.ownerRevision)throw fail('owner_revision_conflict','Avatar Builder changed. Refresh and compare your draft.',409,{current:{ownerRevision:current.ownerRevision}});
        const layers=validateWriterLayers(input.layers),operationId=identifier(input.operationId,'operationId');
        expectedRevision(input.expectedMemoryRevision,input.expectedMemoryDigest);
        const sources=validateWriterSources(input.sources),provenance=validateWriterProvenance(input.provenance);
        sources.push({owner:OWNER,id,revision:current.ownerRevision,digest:current.ownerRevision,kind:'builder-projection'});
        const result=await memory('save',{owner:OWNER,avatarId:id,scope,operationId,actor,expectedRevision:input.expectedMemoryRevision,expectedDigest:input.expectedMemoryDigest,layers,sources,provenance},{signal:controller.signal,apply:input.dryRun!==true});
        characterIdentity(result.character,id,scope);
        const character=result.currentHead && result.currentHead.revision!==result.character.revision ? await getCharacter(id,scope,controller.signal) : {...current,scope,memoryStatus:'available',memory:result.character,historical:false,currentMemoryHead:result.currentHead||{revision:result.character.revision,digest:result.character.digest},sourceContextState:'current-owner-projection'};
        send(res,200,{saved:input.dryRun!==true,status:result.status,character});return true;
      }
      throw fail('method_not_allowed','Unsupported character operation.',405);
    } catch(error) {if(!res.destroyed&&!res.headersSent)send(res,error.statusCode||500,{error:error.code||'writer_character_error',message:error.code?error.message:'The character operation could not be completed.',...(error.current?{current:error.current}:{})});}
    finally {res.off('close',close);}
    return true;
  };
  handle.close = async () => { sessions.clear(); await memory.close?.(); };
  return handle;
}
