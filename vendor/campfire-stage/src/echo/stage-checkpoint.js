// Same-device stage checkpoint shared by interactive seeks and the legacy
// offline adapter. Its serialized form can be handed to a bounded owner; this
// class alone provides no durable store or cross-device pixel guarantee. The
// caller owns and destroys it. Capture at a quiescent frame boundary.
const FORMAT='hapa.campfire.gpu-checkpoint.v1';
const clone = value => structuredClone(value);
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');
const metadataDigest = metadata => digest(new TextEncoder().encode(JSON.stringify(metadata)));
const dustKeys=['time','ashClock','formation','kickAmount','shockAmount','formed','participation','readingClearance','settings','cameraYaw','changed','stagger','targetIsObject','targetIsPicture','targetIsFigure','targetIsBurst','sourceColour','targetCopyable','constructionNotice','snappedFormation','signals','motion','targetBounds','frameBounds','cameraComfort','sceneKey','environmentAccent','environmentQuality','reading','palette','lastStep','reduced'];
const sparkKeys=['rate','carry','bursts','time','frame','params'];
const simKeys=['time','frame','params','geoReady'];
function fields(object,keys){return Object.fromEntries(keys.filter(k=>object[k]!==undefined).map(k=>[k,clone(object[k])]));}
function assign(object,state){for(const [key,value] of Object.entries(state))object[key]=clone(value);}

export class CampfireStageCheckpoint {
  static async capture({device,sim,swarm,sparks,renderer,performance,key}) {
    if(typeof key!=='string'||!key||!renderer.hist||!renderer.w||!renderer.h)throw Error('A source key and initialized renderer are required.');
    const control=performance.captureControlState();
    if(control.simulated===null||Math.abs(swarm.time-control.simulated/60)>1e-4)throw Error('Stage and score clocks must match at checkpoint.');
    const checkpoint=new CampfireStageCheckpoint();
    Object.assign(checkpoint,{format:FORMAT,device,key,width:renderer.w,height:renderer.h,res:sim.res.slice(),count:swarm.count,sparkCount:sparks.count,
      control:clone(control),sim:fields(sim,simKeys),swarm:fields(swarm,dustKeys),sparks:fields(sparks,sparkKeys),
      arrays:Object.fromEntries(['target','normal','param','flex','tint'].map(name=>[name,swarm[name].slice()])),
      uniforms:swarm.U.data.slice(),renderer:{histReset:renderer.histReset,lastLightTime:renderer.lastLightTime,params:clone(renderer.params)},resources:[]});
    const enc=device.createCommandEncoder({label:'campfire-checkpoint-capture'});
    const addTexture=(name,source,size,format,dimension)=>{
      const saved=device.createTexture({label:`checkpoint-${name}`,size,dimension,format,usage:GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});
      checkpoint.resources.push(saved);enc.copyTextureToTexture({texture:source},{texture:saved},size);return saved;
    };
    const addBuffer=(name,source,size)=>{
      const saved=device.createBuffer({label:`checkpoint-${name}`,size,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});
      checkpoint.resources.push(saved);enc.copyBufferToBuffer(source,0,saved,0,size);return saved;
    };
    try {
      checkpoint.fluid=Object.fromEntries(['vel','S','S2'].map(name=>[name,addTexture(name,sim[name],sim.res,'rgba16float','3d')]));
      checkpoint.pressure=sim.levels.map((level,i)=>addTexture(`pressure-${i}`,level.p,level.dims,'r32float','3d'));
      checkpoint.history=addTexture('history',renderer.hist,[renderer.w,renderer.h,1],'rgba16float','2d');
      checkpoint.particles=addBuffer('particles',swarm.state,swarm.count*32);
      checkpoint.targets=addBuffer('targets',swarm.targets,swarm.count*48);
      checkpoint.embers=addBuffer('embers',sparks.buf,sparks.count*64);
      checkpoint.lights=addBuffer('light-state',renderer.lightState,renderer.lightState.size);
      device.queue.submit([enc.finish()]);await device.queue.onSubmittedWorkDone();
      return checkpoint;
    } catch(error) {checkpoint.destroy();throw error;}
  }
  async restore({device,sim,swarm,sparks,renderer,performance,key}) {
    if(this.destroyed||this.format!==FORMAT||device!==this.device||key!==this.key||renderer.w!==this.width||renderer.h!==this.height||
      swarm.count!==this.count||sparks.count!==this.sparkCount||sim.res.some((v,i)=>v!==this.res[i])||sim.levels.length!==this.pressure.length)
      throw Error('Incompatible or destroyed Campfire checkpoint.');
    // Validate score identity and time before GPU state is mutated. Controller
    // restoration itself happens only after the host state has been restored.
    const current=performance.captureControlState();
    if(current.scoreFingerprint!==this.control.scoreFingerprint||current.seed!==this.control.seed||current.count!==this.control.count)
      throw Error('Checkpoint score or particle identity does not match.');
    const enc=device.createCommandEncoder({label:'campfire-checkpoint-restore'});
    for(const name of ['vel','S','S2'])enc.copyTextureToTexture({texture:this.fluid[name]},{texture:sim[name]},sim.res);
    sim.levels.forEach((level,i)=>enc.copyTextureToTexture({texture:this.pressure[i]},{texture:level.p},level.dims));
    enc.copyTextureToTexture({texture:this.history},{texture:renderer.hist},[this.width,this.height,1]);
    for(const [saved,target,size] of [[this.particles,swarm.state,swarm.count*32],[this.targets,swarm.targets,swarm.count*48],[this.embers,sparks.buf,sparks.count*64],[this.lights,renderer.lightState,renderer.lightState.size]])enc.copyBufferToBuffer(saved,0,target,0,size);
    device.queue.submit([enc.finish()]);await device.queue.onSubmittedWorkDone();
    assign(sim,this.sim);assign(swarm,this.swarm);assign(sparks,this.sparks);
    for(const [name,value] of Object.entries(this.arrays))swarm[name].set(value);
    swarm.U.data.set(this.uniforms);swarm.U.upload();
    renderer.histReset=this.renderer.histReset;renderer.lastLightTime=this.renderer.lastLightTime;Object.assign(renderer.params,clone(this.renderer.params));renderer.sharpStamp=null;
    performance.restoreControlState(this.control,{swarmRestored:true});
  }
  destroy(){if(this.destroyed)return;this.destroyed=true;for(const resource of this.resources||[])resource.destroy();this.resources=[];}
}

// Structured-cloneable transfer payload for a future durable owner. This does
// not itself write to disk or establish cross-device numerical equivalence.
export async function serializeStageCheckpoint(checkpoint) {
  if(checkpoint.destroyed)throw Error('Checkpoint has been destroyed.');
  const device=checkpoint.device,resources={};
  async function readBuffer(name,buffer){
    const staging=device.createBuffer({size:buffer.size,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{const enc=device.createCommandEncoder();enc.copyBufferToBuffer(buffer,0,staging,0,buffer.size);device.queue.submit([enc.finish()]);await staging.mapAsync(GPUMapMode.READ);resources[name]={kind:'buffer',data:new Uint8Array(staging.getMappedRange().slice(0))};staging.unmap();}finally{staging.destroy();}
  }
  async function readTexture(name,texture,size,bytesPerPixel,format,dimension){
    const bytesPerRow=Math.ceil(size[0]*bytesPerPixel/256)*256, length=bytesPerRow*size[1]*size[2];
    const staging=device.createBuffer({size:length,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});
    try{const enc=device.createCommandEncoder();enc.copyTextureToBuffer({texture},{buffer:staging,bytesPerRow,rowsPerImage:size[1]},size);device.queue.submit([enc.finish()]);await staging.mapAsync(GPUMapMode.READ);resources[name]={kind:'texture',size:size.slice(),format,dimension,bytesPerRow,data:new Uint8Array(staging.getMappedRange().slice(0))};staging.unmap();}finally{staging.destroy();}
  }
  for(const name of ['vel','S','S2'])await readTexture(name,checkpoint.fluid[name],checkpoint.res,8,'rgba16float','3d');
  for(let i=0;i<checkpoint.pressure.length;i++){
    const tex=checkpoint.pressure[i],size=[tex.width,tex.height,tex.depthOrArrayLayers];
    await readTexture(`pressure-${i}`,tex,size,4,'r32float','3d');
  }
  await readTexture('history',checkpoint.history,[checkpoint.width,checkpoint.height,1],8,'rgba16float','2d');
  for(const name of ['particles','targets','embers','lights'])await readBuffer(name,checkpoint[name]);
  const metadata=Object.fromEntries(['format','key','width','height','res','count','sparkCount','control','sim','swarm','sparks','arrays','uniforms','renderer'].map(name=>[name,clone(checkpoint[name])]));
  for(const resource of Object.values(resources))resource.sha256=await digest(resource.data);
  return {version:1,metadata,metadataSha256:await metadataDigest(metadata),resources};
}

export async function importStageCheckpoint({payload,device,sim,swarm,sparks,renderer,performance,key}) {
  const m=payload?.metadata,r=payload?.resources,current=performance.captureControlState();
  if(payload?.version!==1||!m||!r||m.format!==FORMAT||m.key!==key||m.width!==renderer.w||m.height!==renderer.h||
    m.count!==swarm.count||m.sparkCount!==sparks.count||!Array.isArray(m.res)||m.res.length!==3||m.res.some((v,i)=>v!==sim.res[i])||
    m.control?.scoreFingerprint!==current.scoreFingerprint||m.control?.seed!==current.seed||m.control?.count!==current.count)
    throw Error('Incompatible serialized Campfire checkpoint.');
  const textureSpecs=[...['vel','S','S2'].map(n=>[n,sim.res,8,'rgba16float','3d']),
    ...sim.levels.map((l,i)=>[`pressure-${i}`,l.dims,4,'r32float','3d']),['history',[renderer.w,renderer.h,1],8,'rgba16float','2d']];
  const bufferSpecs=[['particles',swarm.count*32],['targets',swarm.count*48],['embers',sparks.count*64],['lights',renderer.lightState.size]];
  let total=0;
  for(const [name,size,bpp,format,dimension] of textureSpecs){const x=r[name],row=Math.ceil(size[0]*bpp/256)*256;
    if(x?.kind!=='texture'||x.format!==format||x.dimension!==dimension||!Array.isArray(x.size)||x.size.length!==3||x.size.some((v,i)=>v!==size[i])||x.bytesPerRow!==row||!(x.data instanceof Uint8Array)||x.data.byteLength!==row*size[1]*size[2])throw Error(`Invalid checkpoint texture ${name}.`);total+=x.data.byteLength;}
  for(const [name,size] of bufferSpecs){const x=r[name];if(x?.kind!=='buffer'||!(x.data instanceof Uint8Array)||x.data.byteLength!==size)throw Error(`Invalid checkpoint buffer ${name}.`);total+=size;}
  if(total>128*1024*1024||Object.keys(r).length!==textureSpecs.length+bufferSpecs.length)throw Error('Checkpoint payload exceeds the size limit or has unexpected resources.');
  if(typeof payload.metadataSha256!=='string'||await metadataDigest(m)!==payload.metadataSha256)throw Error('Checkpoint metadata digest mismatch.');
  for(const [name,resource] of Object.entries(r))if(typeof resource.sha256!=='string'||await digest(resource.data)!==resource.sha256)throw Error(`Checkpoint resource digest mismatch: ${name}.`);
  for(const name of ['target','normal','param','flex','tint'])if(!m.arrays?.[name]||m.arrays[name].constructor!==swarm[name].constructor||m.arrays[name].length!==swarm[name].length)throw Error(`Invalid checkpoint array ${name}.`);
  if(!(m.uniforms instanceof Float32Array)||m.uniforms.length!==swarm.U.data.length)throw Error('Invalid checkpoint uniforms.');
  const checkpoint=new CampfireStageCheckpoint();Object.assign(checkpoint,clone(m),{device,resources:[],fluid:{},pressure:[]});
  try{
    for(const [name,size,,format,dimension] of textureSpecs){const x=r[name],texture=device.createTexture({label:`import-${name}`,size,format,dimension,usage:GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});checkpoint.resources.push(texture);
      device.queue.writeTexture({texture},x.data,{bytesPerRow:x.bytesPerRow,rowsPerImage:size[1]},size);
      if(name==='history')checkpoint.history=texture;else if(name.startsWith('pressure-'))checkpoint.pressure.push(texture);else checkpoint.fluid[name]=texture;
    }
    for(const [name,size] of bufferSpecs){const buffer=device.createBuffer({label:`import-${name}`,size,usage:GPUBufferUsage.COPY_SRC|GPUBufferUsage.COPY_DST});checkpoint.resources.push(buffer);device.queue.writeBuffer(buffer,0,r[name].data);checkpoint[name]=buffer;}
    await device.queue.onSubmittedWorkDone();return checkpoint;
  }catch(error){checkpoint.destroy();throw error;}
}
