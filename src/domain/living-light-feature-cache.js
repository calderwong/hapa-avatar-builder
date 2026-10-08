/** One active source bank plus at most four inactive LRU banks. Array ownership
 * stays in the bank; leases never expose typed arrays or duplicate them. */
const fail=(code,message)=>{throw Object.assign(new Error(message),{code});};
export function createLivingLightFeatureCache({maxBytes=128*1024**2,maxInactive=4}={}) {
 if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>128*1024**2||!Number.isSafeInteger(maxInactive)||maxInactive<0||maxInactive>4)fail('feature_cache_budget_invalid','Bounded resident budgets required.');
 const entries=new Map();let bytes=0,closed=false,clock=0;
 const remove=key=>{const e=entries.get(key);if(!e)return;entries.delete(key);bytes-=e.bank.identity.bytes;e.bank.dispose();};
 const evict=()=>{
  let idle=[...entries].filter(([,e])=>!e.refs).sort((a,b)=>a[1].used-b[1].used);
  while(idle.length>maxInactive||bytes>maxBytes){const next=idle.shift();if(!next)break;remove(next[0]);}
 };
 function acquire({key,create,signal,requiredBytes=maxBytes}={}){
  if(closed)fail('feature_cache_disposed','Feature cache was released.');
  if(typeof key!=='string'||!key||key.length>4096)fail('feature_cache_key_invalid','Exact source/configuration key required.');
  if(!Number.isSafeInteger(requiredBytes)||requiredBytes<1||requiredBytes>maxBytes)fail('feature_cache_entry_oversize','Prepared source exceeds resident capacity.');
  if(signal?.aborted)fail('feature_preparation_cancelled','Feature preparation cancelled.');
  if([...entries].some(([id,e])=>id!==key&&e.refs))fail('feature_cache_source_pinned','Release the previous active source before adopting another.');
  let e=entries.get(key);
  if(!e){
   if(typeof create!=='function')fail('feature_cache_entry_missing','Prepared bank is unavailable.');
   // Reclaim idle allocations before the caller prepares the next bank. This
   // cannot account for the caller's already-loaded JSON/decoder buffers.
   const idle=[...entries].filter(([,entry])=>!entry.refs).sort((a,b)=>a[1].used-b[1].used);
   while(bytes+requiredBytes>maxBytes){const next=idle.shift();if(!next)fail('feature_cache_source_pinned','Active leases prevent safe preparation.');remove(next[0]);}
   const bank=create({maxBytes:requiredBytes});
   if(!bank?.identity||!Number.isSafeInteger(bank.identity.bytes)||bank.identity.bytes<0||bank.identity.bytes>requiredBytes||typeof bank.dispose!=='function'||typeof bank.sample!=='function') {bank?.dispose?.();fail('feature_cache_entry_invalid','Bank exceeds resident limits or lacks lifecycle ownership.');}
   if(signal?.aborted){bank.dispose();fail('feature_preparation_cancelled','Feature preparation cancelled before adoption.');}
   e={bank,refs:0,used:++clock};entries.set(key,e);bytes+=bank.identity.bytes;
  }
  e.refs++;e.used=++clock;let released=false;
  const live=()=>{if(released||closed)fail('feature_lease_disposed','Feature lease was released.');};
  return {identity:e.bank.identity,sample(...args){live();return e.bank.sample(...args);},aggregate(...args){live();return e.bank.aggregate(...args);},assets(){live();return e.bank.assets();},release(){if(released)return;released=true;if(closed)return;e.refs--;e.used=++clock;evict();}};
 }
 return {acquire,diagnostics:()=>({residentBytes:bytes,maxBytes,entries:entries.size,activeEntries:[...entries.values()].filter(e=>e.refs).length,inactiveEntries:[...entries.values()].filter(e=>!e.refs).length,leases:[...entries.values()].reduce((n,e)=>n+e.refs,0),maxInactive,closed}),dispose(){if(closed)return;closed=true;for(const key of entries.keys())remove(key);}};
}
