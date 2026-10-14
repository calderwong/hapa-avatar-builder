import {useEffect,useRef,useState} from 'react';
import {canonicalJSON} from '../domain/living-light-contracts.js';
import {echoLivingLightProposalBasis,resolveEchoLivingLightProposal,previewEchoLivingLightProposal} from '../domain/echo-living-light-proposals.js';
const describe=cue=>cue?`${cue.role==='transition'?'Transition':'Scene'} · ${cue.window.startUs/1e6}–${cue.window.endUs/1e6}s · Journey ${cue.journeyWindow.startUs/1e6}–${cue.journeyWindow.endUs/1e6}s · ${cue.journeyRef.journeyId} @ ${cue.journeyRef.revisionId}`:'No cue';
const names={insert:'Insert',remove:'Remove',move:'Move',window:'Trim',swap:'Swap Journey / role'};
/** Review is local and inert. Applying enters the parent editor's existing one-step history. */
export default function EchoLivingLightProposalReview({project,cutId,client,onApply,disabled=false}){
 const [text,setText]=useState(''),[review,setReview]=useState(null),[busy,setBusy]=useState(false),[status,setStatus]=useState('');
 const request=useRef(null),sequence=useRef(0),current=useRef({project,cutId});current.current={project,cutId};
 const signature=canonicalJSON(project.living_light_cues||[]),target=canonicalJSON([project.song_id,cutId]);
 function invalidate(){sequence.current++;request.current?.abort();request.current=null;setBusy(false);setReview(null);}
 useEffect(()=>{invalidate();setStatus(previous=>previous==='Review every change below. The cut has not changed.'?'The draft changed. Review this proposal again.':previous);return()=>{sequence.current++;request.current?.abort();};},[signature,target]);
 function change(value){invalidate();setText(value);setStatus('');}
 async function preview(){
  invalidate();const ticket=++sequence.current,controller=new AbortController();request.current=controller;setBusy(true);setStatus('Checking exact Journeys, timing and locks…');
  try{
   if(new TextEncoder().encode(text).byteLength>1048576)throw Error('Proposal exceeds the 1 MiB limit.');
   let proposal;try{proposal=JSON.parse(text);}catch{throw Error('Paste a complete director proposal to review.');}
   const result=await resolveEchoLivingLightProposal(project,proposal,{cutId,signal:controller.signal,loadJourney:(ref,signal)=>client.request('/journeys/'+encodeURIComponent(ref.journeyId)+'/revisions/'+encodeURIComponent(ref.revisionId),{signal})});
   if(ticket!==sequence.current)return;
   // A draft/cut can change while the exact revision reads are pending.
   const latest=previewEchoLivingLightProposal(current.current.project,proposal,{cutId:current.current.cutId,resolveJourney:result.resolveJourney});
   setReview({...result,preview:latest,proposal});setStatus('Review every change below. The cut has not changed.');
  }catch(error){if(ticket===sequence.current)setStatus(error.message);}finally{if(ticket===sequence.current){setBusy(false);request.current=null;}}
 }
 function apply(){
  if(disabled||busy||!review)return;
  try{const next=previewEchoLivingLightProposal(project,review.proposal,{cutId,resolveJourney:review.resolveJourney});onApply(next.cues);setReview(null);setStatus('Proposal applied to the draft as one undoable edit. Use Save as new cut to keep it.');}catch(error){setReview(null);setStatus(error.message);}
 }
 return <details className="echo-light-proposals"><summary>Director proposals</summary>
  <p>Review suggested scene changes before applying them. Existing locks stay in force. Proposal text is a suggestion, not verified authorship.</p>
  <button type="button" disabled={disabled||busy} onClick={()=>change(JSON.stringify(echoLivingLightProposalBasis(project,cutId,'ll-proposal:'+crypto.randomUUID()),null,2))}>Start from this cut</button>
  <label>Paste a director proposal<textarea aria-label="Director proposal" value={text} onChange={event=>change(event.target.value)} rows={7} maxLength={1048576}/></label>
  <div className="echo-light-cue-toolbar"><button type="button" disabled={disabled||busy||!text.trim()} onClick={preview}>Review proposal</button><button type="button" disabled={!text&&!review} onClick={()=>change('')}>Dismiss proposal</button></div>
  {review&&<section aria-label="Proposed scene changes"><h5>{review.preview.title}</h5><ol>{review.preview.changes.map((change,index)=><li key={index}><strong>{names[change.type]} · {change.cueId}</strong><p>Before: {describe(change.before)}</p><p>After: {describe(change.after)}</p></li>)}</ol><button type="button" disabled={disabled||busy||!review.preview.changed} onClick={apply}>Apply proposed changes</button></section>}
  <p role="status">{status}</p>
 </details>;
}
