// No-spend owner interface for exact-design intake and bounded receipt readback.
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {createHellWeekGeneration,safeError}=require('../electron/hell-week-generation.cjs');
const {createHellWeekStorage}=require('../electron/hell-week-storage.cjs');
const {validate}=require('../electron/hell-week-reviewed-designs.cjs');
function projection(run){return{ok:true,owner:'hapa-avatar-builder',schema:'hapa.builder.reviewed-design-status.v1',id:run.id,state:run.state,stage:run.stage,
 imported:run.reviewedDesigns,totalCards:run.totalCards,savedCards:run.savedCards,imageCount:run.imageCount,attempts:run.attempts,updatedAt:run.updatedAt,
 workerActive:run.workerActive===true,error:run.error||run.storageError||null,page:run.page||null,
 cards:(run.cards||[]).map(c=>({id:c.id,source:c.reviewedDesign?.source,promptSha256:c.reviewedDesign?.promptSha256,state:c.state,
  image:c.image?{sha256:c.image.sha256,width:c.image.width,height:c.image.height,bytes:c.image.storage?.bytes}:null,
  registration:c.registration||null})),nativeDispatch:false};}
async function main(){
 const [command,value,...flags]=process.argv.slice(2);if(command==='--help'){console.log('node cli/hell-week-designs.cjs prepare PACKET.json [--dry-run] | check PACKET.json | status RUN_ID [--offset=N]. No provider, registration, resume or paid actions. Use the existing Hell Week UI/CLI for explicit artwork execution.');return;}
 if(!['prepare','check','status'].includes(command)||!value||flags.some(f=>f!=='--dry-run'&&!/^--offset=\d+$/.test(f)))throw Error('Use --help for exact arguments.');
 let raw,spec;if(command!=='status'){const stat=await fs.stat(value);if(stat.size>512*1024)throw Error('Import packet exceeds 512 KiB.');raw=await fs.readFile(value,'utf8');spec=validate(raw);if(flags.includes('--dry-run')){console.log(JSON.stringify({ok:true,dryRun:true,owner:'hapa-avatar-builder',id:spec.id,packetHash:spec.packetHash,cards:spec.cards.length,nativeDispatch:false}));return;}}
 if(process.platform!=='darwin')throw Error('This installed owner route requires the existing macOS Builder profile.');
 const userDataPath=path.join(os.homedir(),'Library','Application Support','hapa-avatar-builder');
 const refuse=async()=>{throw Error('This no-spend interface cannot execute providers or register Cards.');};
 const engine=createHellWeekGeneration({userDataPath,credentialStore:{read:refuse},registerCard:refuse,fetchImpl:refuse,
  mediaStore:createHellWeekStorage({configFile:path.join(userDataPath,'hell-week-storage.json')})});
 if(command==='check'){console.log(JSON.stringify(await inspectPacket(engine,spec)));return;}
 let run;if(command==='prepare'){const prepared=await engine.importDesigns(raw);run=await engine.status({id:prepared.id,limit:48});}
 else run=await engine.status({id:value,offset:Number(flags.find(f=>f.startsWith('--offset='))?.slice(9)||0),limit:48});
 if(!run.reviewedDesigns)throw Error('This route reads only reviewed-design imports.');console.log(JSON.stringify(projection(run)));
}
if(require.main===module)main().catch(e=>{console.error(JSON.stringify({ok:false,error:safeError(e)}));process.exitCode=1;});
async function inspectPacket(engine,spec){
 const runFile=path.join(engine.root,spec.id,'run.json');
 try{await fs.access(runFile);}catch(e){if(e.code!=='ENOENT')throw e;return{ok:true,owner:'hapa-avatar-builder',id:spec.id,packetHash:spec.packetHash,fresh:false,exists:false,nativeDispatch:false};}
 const control=await engine.status({id:spec.id,includeCards:false});
 if(control.reviewedDesigns?.packetHash!==spec.packetHash)throw Error('Native run conflicts with the frozen import packet.');
 if(control.phase==='reviewed-design-import')return{...projection(control),packetHash:spec.packetHash,fresh:false,exists:true};
 const first=await engine.status({id:spec.id,limit:48});
 if(first.reviewedDesigns?.packetHash!==spec.packetHash)throw Error('Native run conflicts with the frozen import packet.');
 const result=projection(first);result.packetHash=spec.packetHash;result.exists=true;
 for(let offset=48;offset<spec.cards.length;offset+=48){const next=await engine.status({id:spec.id,offset,limit:48});if(next.updatedAt!==first.updatedAt)throw Error('Native run advanced during readback; check again.');if(next.storageError)throw Error(next.storageError);result.cards.push(...projection(next).cards);}
 if(first.storageError)throw Error(first.storageError);
 const complete=first.phase!=='reviewed-design-import'&&result.cards.length===spec.cards.length;
 for(let i=0;i<result.cards.length;i++){const c=result.cards[i],expected=spec.cards[i];if(!expected||JSON.stringify(c.source)!==JSON.stringify(expected.source)||c.promptSha256!==expected.promptSha256)throw Error('Native design commitment differs from the reviewed source.');}
 result.fresh=complete;return result;
}
module.exports={projection,inspectPacket};
