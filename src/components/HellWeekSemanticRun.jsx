import { useState } from 'react';

export default function HellWeekSemanticRun({ run, bridge, act, busy, Art, onPage }) {
 const [batch, setBatch] = useState('');
 const running = run.workerActive;
 const imageLimit = batch === '' ? null : Number(batch);
 const valid = imageLimit === null || Number.isSafeInteger(imageLimit) && imageLimit > 0;
 const unknown = Object.entries(run.calls || {}).find(([,c]) => ['unknown','submitted'].includes(c.state));
 const rejected = Object.entries(run.calls || {}).find(([,c]) => c.state === 'rejected');
 const launch = (mode, extra={}) => act('Starting from saved progress…', () => bridge.start({ id: run.id, mode, imageLimit, ...extra }));
 return <>
  <section className="hapa-panel hw-run" data-variant="notch">
   <span className="eyebrow">{run.name}</span><h3>{run.stage}</h3>
   <p role="status" aria-live="polite">{run.state} · {run.totalCards} Cards discovered · {run.savedCards} illustrated and saved · {run.attempts} API calls dispatched</p>
   {run.phase === 'prepare' ? <><progress max={run.sourceBytes || 1} value={run.importOffset} aria-label="Source preparation" /><p>{(run.importOffset/1024/1024).toFixed(2)} / {(run.sourceBytes/1024/1024).toFixed(2)} MiB indexed · no API spend</p></> : <><progress max={run.sectionCount || 1} value={run.processedSections} aria-label="Source sections reviewed" /><p>{run.processedSections}/{run.sectionCount} source sections reviewed{run.analysisComplete ? ' · discovery complete' : ' · final Card count not known yet'}</p></>}
   {run.duplicateOccurrences > 0 && <p>{run.duplicateOccurrences} repeated concepts linked to existing Cards with source evidence.</p>}
   {!!run.avatars?.length && <details className="hw-foundations"><summary>Run Avatar foundations · {run.avatars.length}</summary>{run.avatars.map(a=><p key={a.avatarId}><strong>{a.name}</strong> · {a.image?'image + profile':'profile only'}<br/><small>{a.avatarId} · snapshot {a.snapshotHash.slice(0,12)}</small></p>)}</details>}
   {run.error && <p role="alert" className="hw-error">{run.error}</p>}
   {run.storageError && <p role="alert" className="hw-error">Saved designs are currently unavailable: {run.storageError}</p>}
   {run.phase !== 'prepare' && run.state !== 'complete' && <label className="hw-image-batch">Images per continuation · optional<input className="hapa-input" type="number" min="1" step="1" placeholder="All pending images" value={batch} onChange={e=>setBatch(e.target.value)} disabled={running}/><span className="hw-small">Empty means all pending images, within the execution window. This never limits document coverage or Card discovery. Analysis also uses API credits.</span></label>}
   <div className="hw-actions">
    {running ? <button className="hapa-btn" disabled={busy} onClick={()=>act('Pausing at the next saved checkpoint…',()=>bridge.pause({id:run.id}))}>Pause after this step</button>
     : run.phase === 'prepare' ? <button className="hapa-btn" disabled={busy} onClick={()=>act('Continuing source preparation…',()=>bridge.prepareMore({id:run.id}))}>Continue preparation · no API spend</button>
     : run.state !== 'complete' && !unknown && !rejected && <>
       {!run.analysisComplete && <button className="hapa-btn" disabled={busy || !valid} onClick={()=>launch('design')}>Discover Cards · review before images</button>}
       <button className="hapa-btn" disabled={busy || !valid} onClick={()=>launch('all')}>{run.analysisComplete ? 'Illustrate saved designs' : 'Discover and illustrate'} · uses OpenAI</button>
      </>}
    {!running && unknown && <div className="hw-recovery"><p>This request’s completion is uncertain and it may already have been billed. Resume checks for a saved response and never repeats an uncertain request automatically.</p><button className="hapa-btn" disabled={busy||!valid} onClick={()=>launch('all')}>Resume saved work · no uncertain replay</button>{unknown[1].attempt<2 && <button className="hapa-btn" disabled={busy||!valid} onClick={()=>{if(window.confirm(`Retry ${unknown[0]} once, then pause? OpenAI may already have billed the original request; this can duplicate its charge.`))launch('all',{retryUnknownCallId:unknown[0],acknowledgePossibleDuplicateCharge:true});}}>Retry uncertain step once · then pause</button>}</div>}
    {!running && rejected && rejected[1].attempt<2 && <button className="hapa-btn" disabled={busy||!valid} onClick={()=>launch('all',{retryRejected:true})}>Retry rejected step once · then pause</button>}
   </div>
   <p className="hw-small">Source sections are processing units, not a Card quota. Thor may produce zero, one or many Cards. Discovery finishes before illustration. Long work checkpoints and yields; Resume reuses saved results. Source files remain in their original location—keep them unchanged until discovery finishes.</p>
  </section>
  <div className="hw-actions"><span>{run.totalCards ? `Cards ${Math.min((run.page?.offset||0)+1,run.totalCards)}–${Math.min((run.page?.offset||0)+(run.cards?.length||0),run.totalCards)} of ${run.totalCards}` : 'Cards appear as meaningful concepts are discovered.'}</span>{run.page?.offset>0 && <button className="hapa-btn" onClick={()=>onPage(Math.max(0,run.page.offset-run.page.limit))}>Previous Cards</button>}{run.page?.hasMore && <button className="hapa-btn" onClick={()=>onPage(run.page.offset+run.page.limit)}>Next Cards</button>}</div>
  <div className="hw-card-grid">{run.cards.map(card=><article className="hapa-card hw-card" key={card.id} data-card-type={card.design.kind} data-state={card.state}>
   <Art bridge={bridge} runId={run.id} card={card}/><div className="hw-card-copy"><span className="eyebrow">{card.design.kind} · {card.state}</span><h3>{card.design.title}</h3><p>{card.design.summary}</p>
    <details><summary>Lore, skills and source evidence</summary><p>{card.design.lore}</p>{card.design.skills.map((s,i)=><p key={i}><strong>{s.name} · {s.type}</strong><br/>{s.description}</p>)}{card.design.evidence_quotes.map((q,i)=><blockquote key={i}>{q}</blockquote>)}<p>Source: {run.name} · {card.chunkId}</p>{['facts','desires','uncertainties'].map(k=>card.design[k]?.length>0&&<div key={k}><strong>{k}</strong>{card.design[k].map((v,i)=><p key={i}>{v}</p>)}</div>)}<p>Concept: {card.design.concept_key}</p>{card.avatarLineage?.used?.map(a=><p key={a.avatarId}>{a.name} · {a.mode}<br/>{a.role} — {a.reason}</p>)}</details>
    <details><summary>Image direction</summary><p>{card.design.visual_thesis}</p><p>{card.imagePrompt||card.design.image_prompt}</p></details><small>{card.state==='saved'?'Saved to Items · pending human review':'Design saved · artwork pending'}</small>
   </div></article>)}</div>
 </>;
}
