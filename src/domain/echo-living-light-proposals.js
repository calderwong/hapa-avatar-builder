import {canonicalJSON,LivingLightValidationError} from './living-light-contracts.js';
import {echoProjectLivingLightCues,validateEchoLivingLightCues} from './echo-living-light-cues.js';
import {editEchoLivingLightCues} from './echo-living-light-editor.js';
export const ECHO_LIVING_LIGHT_PROPOSAL_SCHEMA='hapa.echo.living-light-proposal.v1';
const fail=(code,message)=>{throw new LivingLightValidationError(code,'proposal',message);};
const equal=(a,b)=>canonicalJSON(a)===canonicalJSON(b);
const object=(value,fields)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!fields.includes(k)))fail('living_light_proposal_invalid','Use only the supported proposal fields.');};
const id=value=>{if(typeof value!=='string'||!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,255}$/.test(value))fail('living_light_proposal_invalid','An exact saved identifier is required.');};
const ref=value=>{object(value,['journeyId','revisionId']);id(value.journeyId);id(value.revisionId);};
/** Inert metadata: no author assertions, source recipes, unlocks, or arbitrary project patches. */
export function validateEchoLivingLightProposal(proposal){
 object(proposal,['schemaVersion','proposalId','title','target','baseCues','operations']);
 if(proposal.schemaVersion!==ECHO_LIVING_LIGHT_PROPOSAL_SCHEMA)fail('living_light_proposal_invalid','Unsupported director proposal version.');
 id(proposal.proposalId);object(proposal.target,['songId','cutId']);id(proposal.target.songId);id(proposal.target.cutId);
 if(typeof proposal.title!=='string'||!proposal.title.trim()||proposal.title.length>160)fail('living_light_proposal_invalid','Give the proposal a short title.');
 if(!Array.isArray(proposal.baseCues))fail('living_light_proposal_invalid','The proposal must retain the complete starting cue list.');
 validateEchoLivingLightCues(proposal.baseCues,{songId:proposal.target.songId});
 if(!Array.isArray(proposal.operations)||!proposal.operations.length||proposal.operations.length>32)fail('living_light_proposal_invalid','Review between 1 and 32 cue changes at a time.');
 for(const action of proposal.operations){
  const fields={insert:['type','cue'],remove:['type','cueId'],move:['type','cueId','startUs'],window:['type','cueId','journeyWindow'],swap:['type','cueId','journeyRef','role','journeyWindow']}[action?.type];
  if(!Array.isArray(fields))fail('living_light_proposal_invalid','Proposals may insert, remove, move, trim or swap cues. Locks require a separate manual edit.');
  object(action,fields);
  if(action.type==='insert')validateEchoLivingLightCues([action.cue],{songId:proposal.target.songId});else id(action.cueId);
  if(action.type==='swap')ref(action.journeyRef);
 }
 return proposal;
}
export function echoLivingLightProposalBasis(project,cutId,proposalId){
 return {schemaVersion:ECHO_LIVING_LIGHT_PROPOSAL_SCHEMA,proposalId,title:'Proposed scene changes',target:{songId:project.song_id,cutId},baseCues:structuredClone(echoProjectLivingLightCues(project)),operations:[]};
}
export function previewEchoLivingLightProposal(project,proposal,{cutId,resolveJourney}={}){
 validateEchoLivingLightProposal(proposal);
 if(proposal.target.songId!==project.song_id||proposal.target.cutId!==cutId)fail('living_light_proposal_target','Open the exact song and cut named by this proposal.');
 const before=echoProjectLivingLightCues(project);
 if(!equal(before,proposal.baseCues))fail('living_light_edit_conflict','The cues changed since this proposal was made. Keep your draft and request an updated proposal.');
 let cues=structuredClone(before);const changes=[];
 for(const operation of proposal.operations){
  const action=structuredClone(operation),cueId=action.cueId||action.cue.cueId,previous=cues.find(c=>c.cueId===cueId)||null;
  if(action.type==='swap'){
   const record=resolveJourney?.(action.journeyRef),journey=record?.journey||record;
   if(!journey||journey.journeyId!==action.journeyRef.journeyId||journey.revisionId!==action.journeyRef.revisionId)fail('living_light_journey_unavailable','The proposed exact Journey revision is unavailable.');
   action.journey=journey;
  }
  cues=editEchoLivingLightCues({...project,living_light_cues:cues},action,{resolveJourney,expectedCues:cues});
  changes.push({type:action.type,cueId,before:structuredClone(previous),after:structuredClone(cues.find(c=>c.cueId===cueId)||null)});
 }
 return {schemaVersion:'hapa.echo.living-light-proposal-preview.v1',proposalId:proposal.proposalId,title:proposal.title,target:structuredClone(proposal.target),before:structuredClone(before),cues,changes,readOnly:true,state:'draft-review',changed:!equal(before,cues)};
}
/** Resolve only referenced saved revisions, never embedded recipes or latest heads. */
export async function resolveEchoLivingLightProposal(project,proposal,{cutId,loadJourney,signal}={}){
 validateEchoLivingLightProposal(proposal);
 // Check target/base before any owner reads.
 if(proposal.target.songId!==project.song_id||proposal.target.cutId!==cutId)fail('living_light_proposal_target','Open the exact song and cut named by this proposal.');
 if(!equal(echoProjectLivingLightCues(project),proposal.baseCues))fail('living_light_edit_conflict','The cues changed since this proposal was made. Keep your draft and request an updated proposal.');
 const records=new Map(),references=new Map(proposal.baseCues.map(c=>[c.cueId,c.journeyRef]));
 for(const action of proposal.operations){
  const cueId=action.cueId||action.cue.cueId;
  const target=action.type==='insert'?action.cue.journeyRef:action.type==='swap'?action.journeyRef:references.get(cueId);
  if(action.type!=='remove'&&target){const key=canonicalJSON(target);if(!records.has(key)){signal?.throwIfAborted();records.set(key,await loadJourney(target,signal));signal?.throwIfAborted();}}
  if(action.type==='remove')references.delete(cueId);else if(target)references.set(cueId,target);
 }
 const resolveJourney=reference=>records.get(canonicalJSON(reference));
 return {preview:previewEchoLivingLightProposal(project,proposal,{cutId,resolveJourney}),resolveJourney};
}
