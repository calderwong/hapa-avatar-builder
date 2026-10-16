/** Test-only observation below the production graphics lease. Retains context
 * references for inspection, never creates graphics resources or animation work. */
export function createNativeResourceProbe(){
 const original=HTMLCanvasElement.prototype.getContext,records=new Map();
 const kinds={createShader:'deleteShader',createProgram:'deleteProgram',createBuffer:'deleteBuffer',createVertexArray:'deleteVertexArray',createTexture:'deleteTexture',createFramebuffer:'deleteFramebuffer',createRenderbuffer:'deleteRenderbuffer',createQuery:'deleteQuery',createSampler:'deleteSampler',fenceSync:'deleteSync'};
 function observe(canvas,gl){
  if(records.has(gl))return;
  const handles=new Map(Object.values(kinds).map(k=>[k,new Set()])),methods=new Map();
  const row={canvas,handles,methods,created:0,deleted:0,losses:0};records.set(gl,row);
  for(const name of [...Object.keys(kinds),...Object.values(kinds)]){
   const method=gl[name];methods.set(name,method);
   gl[name]=function(...args){const result=Reflect.apply(method,this,args);
    if(kinds[name]&&result){handles.get(kinds[name]).add(result);row.created++;}
    if(handles.get(name)?.delete(args[0]))row.deleted++;
    return result;
   };
  }
  row.lost=()=>{row.losses++;for(const set of handles.values())set.clear();};
  canvas.addEventListener('webglcontextlost',row.lost);
 }
 function wrapped(kind,...args){const gl=Reflect.apply(original,this,[kind,...args]);if(gl&&kind==='webgl2'&&this.matches('[data-testid="living-light-canvas"]'))observe(this,gl);return gl;}
 HTMLCanvasElement.prototype.getContext=wrapped;
 return {
  snapshot:()=>({observerRetainsContextReferences:true,contexts:[...records.values()].map((r,index)=>({index,connected:r.canvas.isConnected,created:r.created,deleted:r.deleted,losses:r.losses,liveResources:[...r.handles.values()].reduce((n,set)=>n+set.size,0)}))}),
  dispose(){if(HTMLCanvasElement.prototype.getContext===wrapped)HTMLCanvasElement.prototype.getContext=original;for(const [gl,r]of records){for(const [name,method]of r.methods)gl[name]=method;r.canvas.removeEventListener('webglcontextlost',r.lost);}records.clear();}
 };
}
