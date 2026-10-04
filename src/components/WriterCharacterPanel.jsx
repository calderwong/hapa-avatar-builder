import {useEffect, useState} from 'react';
import './WriterCharacterPanel.css';

// The frame uses the Builder-owned loopback feature entrypoint. Its requests
// remain same-origin inside that frame; the legacy LAN API receives no new grant.
export default function WriterCharacterPanel({avatarId, label}) {
  const [open,setOpen]=useState(false);
  const [state,setState]=useState('idle');
  const hash=`#view=characters&avatar=${encodeURIComponent(avatarId)}`;
  const href=`http://127.0.0.1:8795/writers-room/${hash}`;
  useEffect(()=>{setState(open?'loading':'idle');},[avatarId,open]);
  useEffect(()=>{if(state!=='loading')return;const timer=setTimeout(()=>setState('waiting'),12000);return()=>clearTimeout(timer);},[state]);
  return <section className="writer-character-panel panel hapa-panel" data-variant="resting">
    <div className="section-head hapa-panel-head"><span>Writer’s Room · Character layers</span><small>Shared with Second Brain</small></div>
    <p>Canon, Memory, Development, and Lore for {label || avatarId}. Each saved revision stays with this exact Avatar; the existing Avatar Mind and appearance records remain source context.</p>
    <div className="writer-character-actions">
      <button type="button" className="hapa-btn" onClick={()=>{setOpen(!open);setState(open?'idle':'loading');}}>{open?'Close shared layers':'Open shared layers'}</button>
      <a className="hapa-btn" href={href} target="_blank" rel="noopener noreferrer">Open connected Writer’s Room ↗</a>
    </div>
    {open && <>
      {['loading','waiting','error'].includes(state) && <p role="status">{state==='loading'?'Opening the connected character editor…':'If the character editor does not appear, launch the connected Writer’s Room from its desktop launcher, then reopen these layers. Your existing Avatar Mind is still available below.'}</p>}
      <iframe key={avatarId} title={`${label || avatarId} shared character layers`} src={`${href}&embed=character`} onLoad={()=>setState('loaded')} onError={()=>setState('error')} referrerPolicy="strict-origin-when-cross-origin" />
      <p className="writer-character-note">Changes save explicitly in the editor. A character memory layer describes the character’s experience; it does not write an Agent Writer’s private memory.</p>
    </>}
  </section>;
}
