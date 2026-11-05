// Shared bounded starting state. The caller supplies a fresh score controller
// and retains ownership of the GPU device, including on cancellation.
export async function prepareCampfireSongStart({device,sim,swarm,renderer,performance,bandsAt,onProgress=()=>{},shouldStop=()=>false}){
 if(performance.captureControlState().simulated!==null)throw Error('Song start requires a fresh score controller.');
 performance.advanceTo(0,{bandsAt});
 // Match first launch: initialize all uploaded controls, then warm only the
 // physical fire. Neither operation advances the score/audio cursor.
 swarm.step(1/60,{bands:bandsAt(0),omega:4,flow:.1,rotation:0});swarm.time=0;
 for(let i=0;i<90;i++){
  const enc=device.createCommandEncoder();sim.step(enc,1/60);device.queue.submit([enc.finish()]);
  if(i%15===14){await device.queue.onSubmittedWorkDone();if(shouldStop())return false;onProgress((i+1)/90);}
 }
 renderer.histReset=true;renderer.lastLightTime=null;renderer.sharpStamp=null;
 return true;
}
