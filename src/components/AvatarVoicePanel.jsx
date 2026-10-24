import {useEffect,useRef,useState} from 'react';
import {VOICE_STYLES,voiceStyleCoverage} from '../domain/avatar-voice.js';
import './AvatarVoicePanel.css';

const dataUrl=file=>new Promise((resolve,reject)=>{
  if(file.size>15*1024*1024)return reject(new Error('Choose an audio clip smaller than 15 MB.'));
  const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('Cannot read audio.'));reader.readAsDataURL(file);
});
async function request(avatarId,action='',body,retry=true){
  const r=await fetch(`/api/avatar-voices/${encodeURIComponent(avatarId)}${action?'/'+action:''}`,{method:body?'POST':'GET',credentials:'same-origin',headers:{'Content-Type':'application/json','X-Hapa-First-Party-Intent':'avatar-voice'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(60000)});
  const value=await r.json();
  if(retry&&value.preDispatch===true&&value.error==='unauthorized'){
    const session=await fetch('/api/avatar-voices/session',{method:'POST',credentials:'same-origin',headers:{'X-Hapa-First-Party-Intent':'avatar-voice'}});
    if(!session.ok)throw new Error('Open the Builder on this Mac to use the voice sampler.');
    return request(avatarId,action,body,false);
  }
  if(!r.ok)throw new Error(value.message||value.error);return value;
}

function StyleCapture({definition,cards,disabled,consent,acquireMic,releaseMic,onDraft,onSave,onDelete,onRestoreArchive}){
  const {id,title,direction,text}=definition;
  const [transcript,setTranscript]=useState(text),[clip,setClip]=useState(null),[preview,setPreview]=useState(''),[recording,setRecording]=useState(false),[starting,setStarting]=useState(false),[replacing,setReplacing]=useState(null),[error,setError]=useState('');
  const recorder=useRef(null),stream=useRef(null),timer=useRef(null),mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;clearTimeout(timer.current);if(recorder.current?.state==='recording')recorder.current.stop();stream.current?.getTracks().forEach(t=>t.stop());releaseMic(id);};},[]);
  useEffect(()=>{onDraft(id,!!clip||!!replacing||starting||recording);},[clip,replacing,starting,recording]);
  useEffect(()=>{if(!clip){setPreview('');return;}const url=URL.createObjectURL(clip);setPreview(url);return()=>URL.revokeObjectURL(url);},[clip]);
  const ready=cards.filter(c=>!c.archived&&c.custodyState==='verified');
  function clear(){setClip(null);setReplacing(null);setTranscript(text);setError('');}
  async function record(card){
    if(!acquireMic(id))return;setStarting(true);setError('');
    if(card){setReplacing(card);setTranscript(card.transcript);}
    try{
      if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw new Error('Microphone recording is unavailable here. Use Upload instead.');
      const source=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});stream.current=source;
      if(!mounted.current){source.getTracks().forEach(t=>t.stop());releaseMic(id);return;}
      const type=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const r=new MediaRecorder(source,type?{mimeType:type}:undefined),chunks=[];recorder.current=r;
      r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      r.onstop=()=>{clearTimeout(timer.current);source.getTracks().forEach(t=>t.stop());releaseMic(id);if(mounted.current){setClip(new Blob(chunks,{type:r.mimeType}));setRecording(false);}};
      r.start();setClip(null);setRecording(true);timer.current=setTimeout(()=>{if(r.state==='recording')r.stop();},29000);
    }catch(e){stream.current?.getTracks().forEach(t=>t.stop());releaseMic(id);if(mounted.current)setError(e.message);}
    finally{if(mounted.current)setStarting(false);}
  }
  async function save(){setError('');try{await onSave({style:id,transcript,replacesVoiceCardId:replacing?.id,provenance:replacing?.provenance,dataUrl:await dataUrl(clip)});if(mounted.current)clear();}catch(e){if(mounted.current)setError(e.message);}}
  return <section className={`voice-style-tile ${ready.length?'is-complete':''} ${recording?'is-recording':''}`} aria-label={`${title} voice style`}>
    <div className="voice-style-heading"><h3>{title}</h3><span className="voice-style-status">{recording?'● Recording':ready.length?`${ready.length} saved`:'Needs a recording'}</span></div>
    <p className="voice-style-direction">{direction}</p>
    <label className="voice-prompt-label">{title} prompt / exact transcript<textarea rows={3} value={transcript} disabled={recording||starting} maxLength={1200} onChange={e=>setTranscript(e.target.value)}/></label>
    <div className="voice-actions">
      <button className="hapa-btn voice-primary" disabled={starting||(disabled&&!recording)} onClick={()=>recording?recorder.current?.state==='recording'&&recorder.current.stop():record()} aria-label={recording?`Stop ${title} recording`:`Record ${title}`}>{recording?'Stop recording':starting?'Opening microphone…':clip?'Re-record take':ready.length?'Record another':'Record'}</button>
      <label className={`hapa-btn voice-upload ${disabled||recording||starting?'is-disabled':''}`}>Upload<input aria-label={`Upload ${title} recording`} type="file" accept="audio/*" disabled={disabled||recording||starting} onChange={e=>{const file=e.target.files[0];e.target.value='';if(file){setClip(file);setError('');}}}/></label>
    </div>
    {recording&&<p role="status">Read the prompt above. Stops at 29 seconds.</p>}
    {replacing&&<p role="status">Replacing a saved take. It stays available until this take saves.</p>}
    {preview&&<audio controls src={preview} aria-label={`${title} unsaved recording`}/>}
    {(clip||replacing)&&!recording&&<div className="voice-draft"><span>Unsaved take</span><div className="voice-actions"><button className="hapa-btn voice-primary" disabled={disabled||!clip||!consent} onClick={save}>{replacing?'Save replacement':'Save recording'}</button><button className="hapa-btn" disabled={disabled} onClick={clear}>{replacing?'Cancel re-recording':'Discard take'}</button></div>{!consent&&<small>Confirm voice permission above to save.</small>}</div>}
    {error&&<p role="alert" className="voice-error">{error}</p>}
    <div className="voice-style-takes">
      {!cards.length&&<p className="voice-empty">No saved takes yet · record or upload here.</p>}
      {cards.map(c=><article className="voice-saved-take" key={c.id}><div className="voice-take-meta"><strong>{c.speaker} · {c.duration}s</strong><span>{c.archived?'Archived':c.custodyState==='verified'?'Saved take':'Pending verification'}</span></div><audio controls preload="none" src={c.audioUrl} aria-label={`${title} saved recording`}/><div className="voice-actions"><button className="hapa-btn" disabled={disabled||!!clip||!!replacing} title={clip||replacing?'Save or discard the draft first':undefined} onClick={()=>record(c)}>Re-record</button><button className="hapa-btn" disabled={disabled} onClick={()=>onDelete(c)}>Delete</button>{c.archived&&<button className="hapa-btn" disabled={disabled} onClick={()=>onRestoreArchive(c)}>Restore</button>}</div><details><summary>Transcript & source</summary><p>{c.transcript}</p><p>{c.provenance}</p></details></article>)}
    </div>
  </section>;
}

function VoiceWorkbench({avatarId,label}){
  const [library,setLibrary]=useState(null),[busy,setBusy]=useState(''),[error,setError]=useState(''),[speakerId,setSpeakerId]=useState(avatarId),[provenance,setProvenance]=useState('Recorded by me in Avatar Builder'),[consent,setConsent]=useState(false),[auto,setAuto]=useState(true),[recordingStyle,setRecordingStyle]=useState(null),[drafts,setDrafts]=useState({}),[voiceId,setVoiceId]=useState(''),[title,setTitle]=useState('New Avatar Clip'),[text,setText]=useState(''),[expression,setExpression]=useState('neutral'),[gesture,setGesture]=useState('rest');
  const mounted=useRef(true),micOwner=useRef(null);
  const load=()=>request(avatarId).then(v=>{if(mounted.current)setLibrary(v);});
  useEffect(()=>{mounted.current=true;load().catch(e=>setError(e.message));return()=>{mounted.current=false;};},[avatarId]);
  useEffect(()=>{if(!library?.clips.some(c=>['queued','generating'].includes(c.state)))return;const t=setInterval(()=>load().catch(e=>setError(e.message)),2000);return()=>clearInterval(t);},[library?.clips,avatarId]);
  function acquireMic(id){if(micOwner.current)return false;micOwner.current=id;setRecordingStyle(id);return true;}
  function releaseMic(id){if(micOwner.current!==id)return;micOwner.current=null;if(mounted.current)setRecordingStyle(null);}
  const onDraft=(id,present)=>setDrafts(v=>v[id]===present?v:{...v,[id]:present});
  async function mutate(label,fn){setBusy(label);setError('');try{const result=await fn();if(mounted.current)setLibrary(result);return result;}catch(e){if(mounted.current)setError(e.message);throw e;}finally{if(mounted.current)setBusy('');}}
  const work=(label,fn)=>void mutate(label,fn).catch(()=>{});
  const cards=(library?.cards||[]).filter(c=>(c.speakerAvatarId||avatarId)===speakerId);
  const coverage=voiceStyleCoverage(cards),activeCards=cards.filter(c=>!c.deletedAt&&!c.archived&&c.custodyState==='verified');
  const selected=activeCards.find(c=>c.id===voiceId)||activeCards.at(-1);
  const locked=!!busy||!!recordingStyle||!library,hasDrafts=Object.values(drafts).some(Boolean);
  return <div className="avatar-voice-workbench">
    <div className="voice-dashboard-head"><div><span className="voice-eyebrow">VOICE LIBRARY · {label}</span><h3>Give every style a voice.</h3><p>Record or upload directly into each style. Your takes and progress stay in view.</p></div><div className="voice-coverage" aria-live="polite"><strong>{library?coverage.complete:'—'}<span> / {VOICE_STYLES.length}</span></strong><span>{library?`styles captured · ${coverage.percent}%`:'Loading saved recordings…'}</span>{library&&<progress aria-label="Voice style completeness" max={VOICE_STYLES.length} value={coverage.complete}/>}</div></div>
    <div className="voice-dashboard-settings"><label>Speaker<select value={speakerId} disabled={locked||hasDrafts} onChange={e=>{setSpeakerId(e.target.value);setConsent(false);setVoiceId('');}}>{(library?.speakers?.length?library.speakers:[{id:avatarId,label}]).map(a=><option key={a.id} value={a.id}>{a.label}{a.id===avatarId?' · selected Avatar':''}</option>)}</select></label><div className="voice-dashboard-context"><strong>Saving to {label} · speaking as {library?.speakers?.find(a=>a.id===speakerId)?.label||label}</strong><span>{library?.provider?.ready?'● Local voice engine ready':library?.provider?.error||'Checking voice engine…'}</span><small>{hasDrafts?'Save or discard your drafts before changing speaker.':'Aim for 6–15 seconds per style. Quiet room, one speaker, no music.'}</small></div></div>
    <div className="voice-capture-preferences"><label className="voice-check"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/>I have permission to use this voice for generated speech.</label><label className="voice-check"><input type="checkbox" checked={auto} onChange={e=>setAuto(e.target.checked)}/>Create two starter scripts and voice-overs after each save.</label><details><summary>Recording source</summary><label>Source / permission note<input value={provenance} onChange={e=>setProvenance(e.target.value)} maxLength={500}/></label></details></div>
    {error&&<p role="alert" className="voice-error">{error}</p>}{busy&&<p role="status">{busy}…</p>}
    <div className="voice-style-grid">{VOICE_STYLES.map(definition=><StyleCapture key={`${speakerId}:${definition.id}`} definition={definition} cards={cards.filter(c=>c.style===definition.id&&!c.deletedAt)} disabled={locked} consent={consent} acquireMic={acquireMic} releaseMic={releaseMic} onDraft={onDraft} onSave={input=>mutate(`Saving ${definition.title} recording`,()=>request(avatarId,'capture',{...input,speakerAvatarId:speakerId,provenance:input.provenance||provenance,consent,autoGenerate:auto}))} onDelete={c=>work('Deleting capture',()=>request(avatarId,'delete',{voiceCardId:c.id,deleted:true}))} onRestoreArchive={c=>work('Restoring capture',()=>request(avatarId,'archive',{voiceCardId:c.id,archived:false}))}/>)}</div>
    <p className="voice-coverage-note">Coverage counts styles with a saved, active recording for this speaker. It does not grade voice quality. Unsaved, deleted, archived, and unverified takes do not count.</p>
    {!!cards.some(c=>c.deletedAt)&&<details className="voice-deleted"><summary>Deleted captures ({cards.filter(c=>c.deletedAt).length})</summary><p>Existing clips keep their source history. Restore a take to use it again.</p>{cards.filter(c=>c.deletedAt).map(c=><article className="voice-card" key={c.id}><strong>{c.title}</strong><span>{c.speaker} · {c.duration}s{c.replacedByVoiceCardId?' · replaced by a new take':''}</span><button className="hapa-btn" disabled={locked} onClick={()=>work('Restoring capture',()=>request(avatarId,'delete',{voiceCardId:c.id,deleted:false}))}>Restore deleted capture</button></article>)}</details>}
    <section className="voice-scripts-section"><h3>Scripts for Avatar Clips</h3><p>Choose a saved take, write a line, and give your Avatar something to say.</p>
      <div className="voice-columns"><label>Script title<input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120}/></label><label>Voice Card<select value={selected?.id||''} onChange={e=>setVoiceId(e.target.value)}><option value="" disabled>Capture a voice first</option>{activeCards.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label></div>
      <label>Spoken script<textarea rows={3} value={text} onChange={e=>setText(e.target.value)} maxLength={420}/></label>
      <div className="voice-actions"><label>Expression<select value={expression} onChange={e=>setExpression(e.target.value)}>{['neutral','smile','concern','surprise'].map(x=><option key={x}>{x}</option>)}</select></label><label>Gesture<select value={gesture} onChange={e=>setGesture(e.target.value)}>{['rest','pinch','thumbs-up','emphasis'].map(x=><option key={x}>{x}</option>)}</select></label><button className="hapa-btn" disabled={!!busy||!text.trim()} onClick={()=>work('Saving script',()=>request(avatarId,'scripts',{title,text,style:selected?.style||'natural',expression,gesture,turn:0}))}>Save script</button></div>
      {library?.scripts.map(s=><article className="voice-script" key={s.id}><strong>{s.title}</strong><p>{s.text}</p><small>{s.style} · {s.expression} · {s.gesture}</small><div className="voice-actions"><button className="hapa-btn" disabled={!!busy||!selected} onClick={()=>work('Queueing voice-over',()=>request(avatarId,'generate',{scriptId:s.id,voiceCardId:selected.id}))}>Generate voice-over</button><button className="hapa-btn" onClick={()=>{setTitle(s.title);setText(s.text);setExpression(s.expression);setGesture(s.gesture);}}>Copy to editor</button></div></article>)}
    </section>
    <section><h3>Generated clips</h3><div className="voice-actions"><button className="hapa-btn" onClick={()=>work('Refreshing',()=>request(avatarId))}>Refresh</button><button className="hapa-btn" disabled={!!busy||!library?.clips.some(c=>['queued','generating'].includes(c.state))} onClick={()=>work('Stopping generation',()=>request(avatarId,'cancel',{}))}>Stop generation</button></div>
      {library?.clips.slice().reverse().map(c=><article className="voice-script" key={c.id}><strong>{c.script.title} · {c.state}</strong><p>{c.script.text}</p>{c.state==='ready'?<><audio controls preload="none" src={c.audioUrl}/><a href={c.audioUrl} download={`${c.script.title}.wav`}>Download voice-over</a><a href={`/api/avatar-voices/${encodeURIComponent(avatarId)}/bundle/${c.id}`} download="avatar-clip.json">Download Avatar Player clip</a><span>AI-generated · {library.cards.find(v=>v.id===c.voiceCardId)?.title}</span></>:<p role="status">{c.error||'Waiting for local speech generation…'}</p>}</article>)}
    </section>
  </div>;
}
export default function AvatarVoicePanel({avatarId,label}){const [open,setOpen]=useState(true);return <section className="avatar-voice-panel panel hapa-panel" data-variant="resting"><div className="section-head hapa-panel-head"><span>Voice & Scripts</span><button className="hapa-btn" onClick={()=>setOpen(!open)}>{open?'Close sampler':'Open voice sampler'}</button></div>{open&&<VoiceWorkbench key={avatarId} avatarId={avatarId} label={label}/>}</section>;}
