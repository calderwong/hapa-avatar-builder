/** Track actual WebGL allocations around inherited constructors/hooks. A native
 * compile failure can occur before a renderer object exists to dispose itself.
 * Delegation preserves the real canvas/context and native pass ordering. */
export function createLivingLightGraphicsLease(canvas){
 const kinds={createShader:'deleteShader',createProgram:'deleteProgram',createBuffer:'deleteBuffer',createVertexArray:'deleteVertexArray',createTexture:'deleteTexture',createFramebuffer:'deleteFramebuffer',createRenderbuffer:'deleteRenderbuffer',createQuery:'deleteQuery',createSampler:'deleteSampler',fenceSync:'deleteSync'};
 const contexts=new Map();let disposed=false;
 function wrap(gl){
  if(contexts.has(gl))return contexts.get(gl).proxy;
  const resources=new Map(Object.values(kinds).map(key=>[key,new Set()])),methods=new Map();
  const proxy=new Proxy(gl,{get(target,key){
   const value=Reflect.get(target,key,target);if(typeof value!=='function')return value;
   if(!methods.has(key))methods.set(key,function(...args){
    if(kinds[key]&&disposed)throw Error('Graphics lease disposed');
    const result=Reflect.apply(value,target,args);
    if(kinds[key]&&result!==null&&result!==undefined)resources.get(kinds[key]).add(result);
    if(resources.has(key))resources.get(key).delete(args[0]);
    return result;
   });
   return methods.get(key);
  }});
  contexts.set(gl,{proxy,resources});return proxy;
 }
 const nativeCanvas=new Proxy(canvas,{get(target,key){
  if(key==='getContext')return (kind,options)=>{if(disposed)throw Error('Graphics lease disposed');const context=target.getContext(kind,options);return context&&kind==='webgl2'?wrap(context):context;};
  const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
 },set:(target,key,value)=>Reflect.set(target,key,value,target)});
 function dispose(){
  if(disposed)return;disposed=true;
  // Each native deletion already removes its exact handle; clean only survivors.
  for(const [gl,{resources}]of contexts)for(const [method,handles]of resources){for(const handle of handles){try{gl[method](handle);}catch{}}handles.clear();}
 }
 return {canvas:nativeCanvas,dispose,diagnostics:()=>({disposed,contexts:contexts.size,liveResources:[...contexts.values()].reduce((n,{resources})=>n+[...resources.values()].reduce((s,set)=>s+set.size,0),0)})};
}
