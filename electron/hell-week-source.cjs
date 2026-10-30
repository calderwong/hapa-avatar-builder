const fs = require('node:fs/promises');
const path = require('node:path');
const { hash } = require('./hell-week-contract.cjs');
const WINDOW = 12 * 1024;
function fingerprint(stat) { return { size: stat.size, mtimeMs: stat.mtimeMs, dev: stat.dev, ino: stat.ino }; }
async function describe(file) {
  const real = await fs.realpath(file); const stat = await fs.stat(real);
  if (!stat.isFile() || !stat.size) throw Error('Choose a nonempty text document.');
  if (!/\.(md|markdown|txt|json)$/i.test(real)) throw Error('Use UTF-8 Markdown, text or conversation JSON.');
  return { path: real, ...fingerprint(stat), format: /\.json$/i.test(real) ? 'json' : 'text' };
}
// Keep filesystem work bounded even when an OS file open cannot be cancelled.
function createSourceReader({ timeoutMs = 15000 } = {}) {
 let pending = null;
 async function guarded(operation) {
  if (pending) throw Error('A source read is still pending. Restore storage access before retrying.');
  const task=operation();pending=task;task.then(()=>{pending=null},()=>{pending=null});let timer;
  try{return await Promise.race([task,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Source read timed out; saved progress is retained.')),timeoutMs)})]);}finally{clearTimeout(timer)}
 }
 async function read(source, start, length) { return guarded(async()=>{
  const stat=await fs.stat(source.path);
  if (await fs.realpath(source.path)!==source.path || JSON.stringify(fingerprint(stat))!==JSON.stringify({size:source.size,mtimeMs:source.mtimeMs,dev:source.dev,ino:source.ino})) throw Error('Source document changed or moved. Restore the original file or prepare a new run; accepted work is retained.');
  const handle=await fs.open(source.path,'r');const buffer=Buffer.alloc(length);let offset=0;
  try{while(offset<length){const r=await handle.read(buffer,offset,length-offset,start+offset);if(!r.bytesRead)break;offset+=r.bytesRead;}}finally{await handle.close()}
  if(offset!==length)throw Error('Source ended unexpectedly. No source content was silently skipped.');
  if(JSON.stringify(fingerprint(await fs.stat(source.path)))!==JSON.stringify(fingerprint(stat)))throw Error('Source changed during reading.');
  return buffer;
 }); }
 async function next(source, start) {
  const raw=await read(source,start,Math.min(WINDOW,source.size-start));let end=raw.length;
  if(start+end<source.size){const boundary=raw.lastIndexOf(Buffer.from('\n\n'));if(boundary>WINDOW/3)end=boundary+2;}
  let text;
  for(let trim=0;trim<4;trim++){const bytes=raw.subarray(0,end-trim);const value=bytes.toString('utf8');if(Buffer.from(value).equals(bytes)){end-=trim;text=value;break;}}
  if(text===undefined||!end)throw Error('Source is not valid UTF-8 text. Export it as UTF-8 before importing.');
  return {start,end:start+end,bytes:end,sha256:hash(raw.subarray(0,end)),text};
 }
 async function chunk(source, meta) { const bytes=await read(source,meta.start,meta.bytes);if(hash(bytes)!==meta.sha256)throw Error('Source section digest changed. No request sent for this section.');return {id:meta.id,text:bytes.toString('utf8'),spans:[{sourceId:'document',parentId:null,role:source.format==='json'?'conversation-json':'document',start:meta.start,end:meta.end,offsetUnit:'utf8-byte',jsonPath:meta.jsonPath||null,text:bytes.toString('utf8')}]}; }
 return {next,chunk,describe:file=>guarded(()=>describe(file))};
}
module.exports={describe,createSourceReader,WINDOW};
