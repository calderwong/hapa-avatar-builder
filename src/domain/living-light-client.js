/** Same owner/session/retry rules as Atlas, with typed conflicts and inert notes. */
export function createLivingLightClient(fetcher=globalThis.fetch){
 let connecting=null;
 const connect=()=>connecting||=(fetcher('/api/echos/living-light/session',{method:'POST',credentials:'same-origin',headers:{'X-Hapa-First-Party-Intent':'living-light'},signal:AbortSignal.timeout(15000)})
  .then(async response=>{if(!response.ok){const value=await response.json().catch(()=>({}));throw Object.assign(Error(value.message||'Open the local Builder to connect notes.'),{code:value.error||'living_light_session_failed'});}}).finally(()=>{connecting=null;}));
 async function request(route,{signal,...options}={},retry=true){
  const response=await fetcher('/api/echos/living-light'+route,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json','X-Hapa-First-Party-Intent':'living-light',...options.headers},signal:signal||AbortSignal.timeout(30000)});
  const value=await response.json();
  if(retry&&response.status===401&&value.error==='unauthorized'&&value.preDispatch===true){await connect();return request(route,{...options,signal},false);}
  if(!response.ok)throw Object.assign(Error(value.message||(response.status===404&&value.error==='not_found'?'This running Builder has not loaded Living Light saving yet. Your draft is kept.':value.error)||'Could not save. Your draft is retained.'),{code:value.error,status:response.status,currentHead:value.currentHead});
  return value;
 }
 return {request,connect};
}
