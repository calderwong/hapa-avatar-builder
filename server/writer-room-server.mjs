#!/usr/bin/env node
// Builder-owned, deliberately limited entrypoint: no album recovery or workers.
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {readFile, stat, realpath} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createWriterCharactersHandler} from './writer-characters.mjs';
import {readWriterPrivateFile} from './writer-room-credentials.mjs';
import {createWriterEchoExtension} from './writer-echo.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.HAPA_WRITER_ROOM_PORT || 8795);
const HOST = '127.0.0.1';
if (!Number.isInteger(PORT) || PORT < 1024 || PORT > 65535 || [8794,8799].includes(PORT)) throw new Error('Invalid Writer Room port');
if (process.env.HAPA_CHARACTER_MEMORY_WORKER === '1') throw new Error('A memory worker cannot launch the server');
const configPath = process.env.HAPA_WRITER_ROOM_CONFIG || path.join(os.homedir(), '.hapa-second-brain/writers-room-characters/service.json');
const config = JSON.parse(await readWriterPrivateFile(configPath, 4096));
const adminToken = process.env.HAPA_WRITER_ROOM_ADMIN_TOKEN || (await readWriterPrivateFile(config.apiTokenFile, 4096)).trim();
if (!/^[A-Za-z0-9_-]{32,128}$/.test(adminToken)) throw new Error('Invalid local API token');
const storePath = path.join(ROOT, 'data/avatar-store.json');
const writerRoomIndexPath = process.env.HAPA_WRITER_ROOM_INDEX || path.join(os.homedir(), 'Desktop/hapa-writers-room/index.html');
let cached = null, cachedSignature = null, reading = null;
const signature = s => `${s.dev}:${s.ino}:${s.size}:${s.mtimeMs}:${s.ctimeMs}`;
async function getAvatars() {
  if (reading) return reading;
  reading = (async () => {
    const before = await stat(storePath);
    if (before.size > 512 * 1024 * 1024 || !before.isFile()) throw new Error('Avatar store outside supported size/type');
    if (cached && signature(before) === cachedSignature) return cached;
    const parsed = JSON.parse(await readFile(storePath, 'utf8'));
    const after = await stat(storePath);
    if (signature(before) !== signature(after)) throw new Error('Avatar store changed while reading; refresh again');
    if (!Array.isArray(parsed.avatars) || parsed.avatars.length > 2000 || new Set(parsed.avatars.map(a=>a.id)).size !== parsed.avatars.length) throw new Error('Invalid native Avatar identity inventory');
    cached = parsed.avatars; cachedSignature = signature(after);
    return cached;
  })();
  try { return await reading; } finally { reading = null; }
}
const mime = {'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.gif':'image/gif','.mp4':'video/mp4','.webm':'video/webm'};
async function serveAsset({req,res,asset,variant}) {
  const uri = variant === 'preview' ? (asset.metadata?.thumbnailUri || asset.metadata?.thumbnail?.uri || asset.uri) : asset.uri;
  if (typeof uri !== 'string' || !uri.startsWith('/') || uri.startsWith('//') || /[?#\0]/.test(uri)) return false;
  let base, suffix;
  if (uri.startsWith('/media/')) { base=path.join(ROOT,'data/media'); suffix=uri.slice(7); }
  else if (uri.startsWith('/generated-media/')) { base=path.join(os.homedir(),'Library/Application Support/Hapa Avatar Builder/generated-media'); suffix=uri.slice(17); }
  else return false;
  let decoded; try { decoded=decodeURIComponent(suffix); } catch { return false; }
  if (decoded.includes('\\') || decoded.split('/').some(p=>p==='..'||p==='.'||!p)) return false;
  const resolvedBase = await realpath(base);
  let file; try { file = await realpath(path.join(resolvedBase, decoded)); } catch { return false; }
  if (!file.startsWith(resolvedBase+path.sep) || !mime[path.extname(file).toLowerCase()]) return false;
  const info = await stat(file);
  if (!info.isFile() || info.size > 512*1024*1024) return false;
  res.writeHead(200, {'Content-Type':mime[path.extname(file).toLowerCase()],'Content-Length':info.size,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});
  await pipeline(createReadStream(file),res); return true;
}
const handleExtension = createWriterEchoExtension({root:ROOT});
const handler = createWriterCharactersHandler({getAvatars,writerRoomIndexPath,port:PORT,host:HOST,adminToken,secondBrain:config.secondBrain,serveAsset,handleExtension});
const server = http.createServer(async (req,res) => {
  try {
    if (req.headers.host !== `${HOST}:${PORT}` || !['127.0.0.1','::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) { res.writeHead(403); res.end(); return; }
    const url = new URL(req.url,`http://${HOST}:${PORT}`);
    if (req.method==='GET' && url.pathname==='/health') { res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({ok:true,service:'hapa-avatar-builder-writer-room',contractVersion:'hapa.writer-characters/v1',port:PORT}));return; }
    if (req.method==='GET' && url.pathname==='/') { res.writeHead(302,{Location:'/writers-room/#view=characters'}); res.end(); return; }
    if (await handler(req,res,url)) return;
    res.writeHead(404,{'Content-Type':'application/json'}); res.end(JSON.stringify({ok:false,error:'not_found'}));
  } catch { if (!res.headersSent) { res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({ok:false,error:'owner_unavailable',message:'Character owner unavailable. Retry after checking the local owner service.'})); } else res.destroy(); }
});
server.headersTimeout = 10000; server.requestTimeout = 30000; server.keepAliveTimeout=5000;
let stopping=false;
async function stop() {
  if(stopping)return;stopping=true;
  server.close();server.closeIdleConnections();
  const force=setTimeout(()=>{server.closeAllConnections();process.exit(1);},12000);
  force.unref();
  await handler.close?.();
  server.closeAllConnections();
}
process.once('SIGINT',stop);process.once('SIGTERM',stop);
server.listen(PORT,HOST,()=>process.stdout.write(JSON.stringify({ok:true,service:'hapa-avatar-builder-writer-room',url:`http://${HOST}:${PORT}/writers-room/#view=characters`,stop:'Ctrl-C in this terminal'})+'\n'));
