// Adapt Echo's picture-target contract for Campfire. Preload before playback so
// a motif does not change halfway through its cue. Only same-origin images are
// fetched; an absent/unusable picture retains Echo's family fallback.
import {sampleDustTargetsFromPixels} from './vendor/echo-dust-swarm.js';
const MAX_ASSETS=8,MAX_BYTES=4*1024*1024,MAX_SIDE=256;
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
function surface(w,h){if(typeof OffscreenCanvas==='function')return new OffscreenCanvas(w,h);const c=document.createElement('canvas');c.width=w;c.height=h;return c;}
async function fetchBounded(url,signal){
 const parsed=new URL(url,location.href);if(parsed.origin!==location.origin||!['http:','https:'].includes(parsed.protocol))throw Error('picture is not a same-origin image');
 const response=await fetch(parsed,{credentials:'same-origin',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)});if(!response.ok)throw Error('picture could not be loaded');
 const type=(response.headers.get('content-type')||'').split(';')[0].toLowerCase();if(!['image/png','image/jpeg','image/webp'].includes(type))throw Error('picture format is not supported');
 if(Number(response.headers.get('content-length'))>MAX_BYTES||!response.body)throw Error('picture exceeds the size limit');
 const reader=response.body.getReader(),parts=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw Error('picture exceeds the size limit');}parts.push(value);}}finally{reader.releaseLock();}
 if(!size)throw Error('picture is empty');return new Blob(parts,{type});
}
export async function preparePictureTargets({score,count,seed,phraseTargets,requireDigest=false,signal=null}={}){
 signal?.throwIfAborted();
 const refs=new Map();for(const motif of score?.motifs||[]){const ref=motif?.imageRef;if(!ref)continue;if(!ref.assetId||typeof ref.assetId!=='string')throw Error('Picture motif is missing its asset identity.');const old=refs.get(ref.assetId);if(old&&JSON.stringify(old)!==JSON.stringify(ref))throw Error(`Conflicting picture references: ${ref.assetId}`);refs.set(ref.assetId,ref);}
 if(refs.size>MAX_ASSETS)throw Error(`Campfire supports at most ${MAX_ASSETS} picture motifs per song.`);
 const targets=new Map(),warnings=[];
 for(const [id,ref] of refs){try{
  let points;
  if(ref.kind==='text'){if(typeof ref.text!=='string'||!ref.text.trim()||ref.text.length>24)throw Error('text logo is invalid');points=phraseTargets({id:`picture:${id}`,text:ref.text,font:ref.font},count,seed);}
  else {
   if(ref.kind==='model'||ref.kind==='svg')throw Error(`${ref.kind} targets are not yet supported by Campfire`);
   if(typeof ref.url!=='string'||!ref.url)throw Error('picture URL is missing');
   if(requireDigest&&!/^[a-f0-9]{64}$/i.test(ref.sha256||''))throw Error('picture needs a source SHA-256 for reproducible export');
   const blob=await fetchBounded(ref.url,signal),bytes=await blob.arrayBuffer(),actual=await sha256(bytes);
   if(ref.sha256&&String(ref.sha256).toLowerCase()!==actual)throw Error('picture digest does not match its source');
   const image=await createImageBitmap(blob);try{
    signal?.throwIfAborted();
    const grid=ref.grid||[1,1],cell=ref.cell||[0,0];if(!Array.isArray(grid)||!Array.isArray(cell)||grid.length!==2||cell.length!==2||grid.some(n=>!Number.isSafeInteger(n)||n<1||n>16)||cell.some((n,i)=>!Number.isSafeInteger(n)||n<0||n>=grid[i]))throw Error('picture atlas cell is invalid');
    const w=Math.floor(image.width/grid[0]),h=Math.floor(image.height/grid[1]);if(w<1||h<1)throw Error('picture dimensions are invalid');const factor=Math.min(1,MAX_SIDE/Math.max(w,h));const canvas=surface(Math.max(1,Math.round(w*factor)),Math.max(1,Math.round(h*factor))),ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('picture rasterizer is unavailable');
    ctx.drawImage(image,cell[0]*w,cell[1]*h,w,h,0,0,canvas.width,canvas.height);points=sampleDustTargetsFromPixels(ctx.getImageData(0,0,canvas.width,canvas.height),{count,seed,threshold:ref.threshold??.3,scale:2.4,mode:'auto'});
   }finally{image.close();}
  }
  if(!points?.count)throw Error('picture has no visible target pixels');points.campfireKind='picture';targets.set(id,points);
 }catch(error){if(signal?.aborted)throw error;warnings.push({assetId:id,reason:error.message||'picture unavailable'});}}
 if(requireDigest&&warnings.length)throw Error(`Picture export unavailable: ${warnings.map(w=>`${w.assetId}: ${w.reason}`).join('; ')}`);
 return {targetsFor:motif=>targets.get(motif?.imageRef?.assetId)||null,warnings,clear:()=>targets.clear()};
}
