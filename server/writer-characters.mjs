import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';

export const WRITER_CHARACTER_CONTRACT = 'hapa.writer-characters/v1';
const BASE = '/v1/writer-characters';
const OWNER = 'hapa-avatar-builder';
const LAYERS = ['canon', 'memory', 'development', 'lore'];
const INPUT_LIMIT = 256 * 1024;
const OUTPUT_LIMIT = 2 * 1024 * 1024;
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
  let bytes = 0;
  for (const k of LAYERS) {
    const size = Buffer.byteLength(layers[k]); bytes += size;
    if (size > 16384) throw fail('layer_too_large', `${k} exceeds 16,384 UTF-8 bytes.`);
  }
  if (bytes > 65536) throw fail('layers_too_large', 'Character layers exceed 65,536 UTF-8 bytes.');
  return Object.fromEntries(LAYERS.map(k => [k, layers[k]]));
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
export function createCharacterMemoryClient({ python, script, accessFile, timeoutMs = 15000, spawnImpl = spawn, env = {} }) {
  if (![python, script, accessFile].every(p => typeof p === 'string' && p.startsWith('/'))) throw new Error('Character memory paths must be explicit absolute paths.');
  let active = false, stopping = false, stopActive = null, activeClosed = Promise.resolve();
  const memory = async function memory(command, request, { signal, apply = false } = {}) {
    if (!['read','save','history'].includes(command)) throw fail('invalid_command', 'Unsupported character memory command.');
    if (active) throw fail('memory_busy', 'Another character memory operation is finishing. Retry after it completes.', 503);
    if (stopping) throw fail('memory_unavailable','Character service is stopping.',503);
    if (signal?.aborted) throw fail('request_aborted', 'Request cancelled.', 499);
    const payload = JSON.stringify(request);
    if (Buffer.byteLength(payload) > INPUT_LIMIT) throw fail('request_too_large', 'Character memory request is too large.', 413);
    active = true;
    let markClosed; activeClosed = new Promise(resolve => { markClosed=resolve; });
    try {
      return await new Promise((resolve, reject) => {
        const args = ['-E', '-s', '-B', script, command, '--access-file', accessFile, '--request', '-', ...(apply ? ['--apply'] : [])];
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
        child.stdout.on('data', chunk => { outputBytes += chunk.length; if (outputBytes > OUTPUT_LIMIT) terminate(fail('memory_response_too_large','Second Brain response exceeded its limit.',502)); else output += decoder.write(chunk); });
        child.stderr.on('data', chunk => { stderrBytes += chunk.length; if (stderrBytes > 65536) terminate(fail('memory_error_too_large','Second Brain diagnostics exceeded their limit.',502)); });
        child.stdin.on('error', () => {});
        child.on('error', () => { issue ||= fail('memory_unavailable','Second Brain could not be started.',503); });
        child.on('close', (code) => {
          clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort);
          if (issue) { reject(issue); return; }
          let result; try { result = JSON.parse(output + decoder.end()); } catch { reject(fail('memory_invalid_response','Second Brain returned an invalid response.',502)); return; }
          if (code !== 0 || result.ok !== true) {
            const conflict = result.error?.code === 'revision_conflict';
            reject(fail(conflict ? 'memory_revision_conflict' : (result.error?.code || 'memory_unavailable'), conflict ? 'Character memory changed. Refresh and compare your draft.' : 'Second Brain could not complete this operation.', conflict ? 409 : 503, {current:result.error?.current})); return;
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
async function body(req) {
  let size=0; const chunks=[];
  for await (const chunk of req) { size+=chunk.length; if (size>INPUT_LIMIT) throw fail('request_too_large','Character request exceeds 256 KiB.',413); chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw fail('invalid_json','Expected a JSON request.'); }
}
const loopbackHost = host => ['127.0.0.1','[::1]','::1'].includes(String(host).toLowerCase());
const localPeer = peer => ['127.0.0.1','::1','::ffff:127.0.0.1'].includes(peer);

export function createWriterCharactersHandler({getAvatars, writerRoomIndexPath, port, host, adminToken='', secondBrain, memoryClient, serveAsset, instanceId=`instance:avatar-builder:${randomBytes(12).toString('hex')}`, now=Date.now}) {
  if (typeof getAvatars !== 'function') throw new Error('getAvatars owner reader required.');
  const memory = memoryClient || createCharacterMemoryClient(secondBrain);
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
  async function getCharacter(id, scope, signal) {
    const avatars = await getAvatars();
    const matches = avatars.filter(a=>a.id===id && !a.isExternalProjection && !a.projection?.readOnly);
    if (!matches.length) throw fail('avatar_not_found','Avatar not found in the canonical Builder.',404);
    if (matches.length !== 1) throw fail('ambiguous_avatar','Duplicate stable Avatar ID requires owner repair.',409);
    const view = projectWriterCharacter(matches[0],{assetsEnabled:Boolean(serveAsset)});
    try {
      const result = await memory('read',{owner:OWNER,avatarId:id,scope},{signal});
      if (!plain(result.character) || result.character.owner !== OWNER || result.character.avatarId !== id || stable(result.character.scope)!==stable(scope)) throw fail('memory_identity_mismatch','Second Brain returned a different character identity.',502);
      return {...view,scope,memoryStatus:'available',memory:result.character};
    } catch(error) {
      if (signal?.aborted) throw error;
      return {...view,scope,memoryStatus:'unavailable',memory:null,memoryError:{code:error.code||'memory_unavailable',message:error.message}};
    }
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
      if(pathname===`${BASE}/capabilities` && req.method==='GET') {send(res,200,{ok:true,contract:WRITER_CHARACTER_CONTRACT,owner:OWNER,memoryOwner:'hapa-second-brain',features:['list','read','save','history','sync','owner-media'],layers:LAYERS,limits:{layerBytes:16384,totalLayerBytes:65536,list:100,requestBytes:INPUT_LIMIT},identity:'Exact Builder avatarId and explicit project/branch/scene scope; no name joins.',stage:'prototype'});return true;}
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
      const match=pathname.match(/^\/v1\/writer-characters\/([^/]+)(?:\/(sync|history))?$/);
      if(!match)throw fail('not_found','Unknown character route.',404);
      const id=identifier(decodeURIComponent(match[1]),'avatarId');
      if(req.method==='GET') {
        const scope=writerScope(Object.fromEntries(['projectId','branchId','sceneId'].filter(k=>url.searchParams.has(k)).map(k=>[k,url.searchParams.get(k)])));
        if(match[2]==='history') {
          await getCharacter(id,scope,controller.signal);
          const result=await memory('history',{owner:OWNER,avatarId:id,scope,limit:20},{signal:controller.signal});send(res,200,result);
        } else if(!match[2])send(res,200,await getCharacter(id,scope,controller.signal));
        else throw fail('method_not_allowed','Use POST to refresh character context.',405);
        return true;
      }
      if((req.method==='PUT'&&!match[2])||(req.method==='POST'&&match[2]==='sync')) {
        const input=await body(req);
        if(!plain(input))throw fail('invalid_request','Expected a character request object.');
        const scope=writerScope(input.scope||{});
        const current=await getCharacter(id,scope,controller.signal);
        if(match[2]==='sync') {send(res,200,current);return true;}
        if(input.expectedOwnerRevision!==current.ownerRevision)throw fail('owner_revision_conflict','Avatar Builder changed. Refresh and compare your draft.',409,{current:{ownerRevision:current.ownerRevision}});
        if(current.memoryStatus!=='available')throw fail('memory_unavailable','Second Brain is unavailable; your draft was not saved.',503);
        const layers=validateWriterLayers(input.layers);
        const operationId=identifier(input.operationId,'operationId');
        if(!Number.isSafeInteger(input.expectedMemoryRevision)||input.expectedMemoryRevision<0 || !(input.expectedMemoryDigest===null||/^[a-f0-9]{64}$/.test(input.expectedMemoryDigest||'')))throw fail('invalid_revision','Supply the exact memory revision and digest.');
        const bearer = adminToken && equal(req.headers.authorization, `Bearer ${adminToken}`);
        const result=await memory('save',{owner:OWNER,avatarId:id,scope,operationId,actor:{actorId:bearer?'api-client':'local-operator',instanceId},expectedRevision:input.expectedMemoryRevision,expectedDigest:input.expectedMemoryDigest,layers,sources:[{owner:OWNER,avatarId:id,revision:current.ownerRevision}]},{signal:controller.signal,apply:input.dryRun!==true});
        if(result.character?.owner!==OWNER || result.character?.avatarId!==id || stable(result.character?.scope)!==stable(scope)) throw fail('memory_identity_mismatch','Second Brain returned a different character identity.',502);
        const character=result.currentHead && result.currentHead.revision!==result.character.revision ? await getCharacter(id,scope,controller.signal) : {...current,memoryStatus:'available',memory:result.character};
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
