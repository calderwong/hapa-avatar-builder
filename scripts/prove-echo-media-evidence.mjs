import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createEchoMediaEvidenceReader,echoEvidenceStamp} from '../server/echo-media-evidence-index.mjs';
import {prepareEchoTimelineMediaEvidence,validateEchoForkMedia} from '../server/echo-media-eligibility.mjs';
const root=path.resolve(import.meta.dirname,'..');
const output=path.resolve(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||path.join(root,'artifacts/echo-media-evidence-proof'));
const reader=createEchoMediaEvidenceReader({root,indexPath:path.join(root,'data/echo-media-evidence/index.json')});
const cohort=JSON.parse(await fs.readFile(path.join(root,'artifacts/echo-enhancement-current-baseline/cohort.json'))).cohort;
const hash=b=>createHash('sha256').update(b).digest('hex');
const samples=[],results=[];const cold=performance.now();const index=await reader.get();const coldMs=performance.now()-cold;
if(index.status!=='ready')throw new Error('Prepare canonical index before proof');
for(let i=0;i<20;i++){const started=performance.now();if((await reader.get()).revision!==index.revision)throw new Error('Index changed');samples.push(performance.now()-started);}
for(const row of cohort){
 const file=path.join(root,'data/music-video-project-variants',row.songId,row.selectedCut.id+'.json');const before=await fs.readFile(file);const variant=JSON.parse(before);
 const started=performance.now();const prepared=await prepareEchoTimelineMediaEvidence(variant.timeline,{root,mediaEvidenceReader:reader});
 const characterShots=prepared.timeline.filter(s=>s.characterIds?.length),sceneShots=prepared.timeline.filter(s=>s.sceneIds?.length);
 let authoritativeSaveGate=null;
 if(characterShots.length){const shot=characterShots[0];const receipt=await validateEchoForkMedia([{...shot,characterIds:['forged'],media_contract:{...shot.media_contract,characterIds:['forged']}}],{requiredCharacterIds:shot.characterIds,requiredSceneIds:shot.sceneIds},{root,mediaEvidenceReader:reader});authoritativeSaveGate={pass:JSON.stringify(receipt.preparedTimeline[0].characterIds)===JSON.stringify(shot.characterIds),persisted:false};}
 if(!(await fs.readFile(file)).equals(before))throw new Error('Canonical source cut changed');
 results.push({songId:row.songId,variantId:row.selectedCut.id,variantSha256:hash(before),sourceUnchanged:true,shots:prepared.timeline.length,sourceChecks:prepared.sourcesChecked,elapsedMs:performance.now()-started,characterShots:characterShots.length,sceneShots:sceneShots.length,characterIds:[...new Set(characterShots.flatMap(s=>s.characterIds))],sceneIds:[...new Set(sceneShots.flatMap(s=>s.sceneIds))],authoritativeSaveGate,statuses:prepared.timeline.reduce((all,s)=>{const status=s.identityEvidence?.status||'non-media';all[status]=(all[status]||0)+1;return all},{})});
}
if((await reader.get()).revision!==index.revision)throw new Error('Index changed during proof');
const report={pass:true,scope:'Canonical declarations and current source stamps; no visual identity verification, no new cuts saved',indexRevision:index.revision,coldIndexMs:coldMs,warmIndexP95Ms:[...samples].sort((a,b)=>a-b)[18],warmSamples:samples,results,humanAccepted:false};
await fs.mkdir(output,{recursive:true});await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({pass:report.pass,coldIndexMs:coldMs,warmIndexP95Ms:report.warmIndexP95Ms,cohort:results.map(r=>({songId:r.songId,shots:r.shots,characterShots:r.characterShots,sceneShots:r.sceneShots,sourceChecks:r.sourceChecks,elapsedMs:r.elapsedMs}))}));
