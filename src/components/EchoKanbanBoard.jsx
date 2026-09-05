import { useEffect, useRef, useState } from 'react';

const STATUSES = ['backlog', 'todo', 'in_progress', 'review', 'blocked', 'done'];
const label = status => status.replaceAll('_', ' ');

export default function EchoKanbanBoard({ board, apiBase, onBoardChange, onNotice }) {
  const [selected, setSelected] = useState(null);
  const [targetStatus, setTargetStatus] = useState('');
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const retryCommand = useRef(null);
  const dialogRef = useRef(null);
  const openerRef = useRef(null);
  const lane = board?.lanes?.find(item => item.id === selected?.laneId);
  const card = lane?.cards?.find(item => item.id === selected?.cardId);
  useEffect(() => { if (card && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal(); }, [card?.id]);
  const inspect = (laneId, card) => { openerRef.current = document.activeElement; setSelected({ laneId, cardId: card.id }); setTargetStatus(card.status); setReason(''); retryCommand.current = null; };
  async function refresh() {
    const response = await fetch(`${apiBase}/api/echos/kanban`);
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || `Board refresh failed (${response.status})`);
    onBoardChange(body);
    return body;
  }
  async function changeStatus(event) {
    event.preventDefault();
    if (!card || pendingRef.current) return;
    pendingRef.current = true; setPending(true);
    const proposal = { laneId: lane.id, cardId: card.id, status: targetStatus, reason: reason.trim() };
    const signature = JSON.stringify(proposal);
    if (retryCommand.current?.signature !== signature) retryCommand.current = {
      signature,
      body: { ...proposal, expectedRevision: board._sync?.revision, commandId: crypto.randomUUID() },
    };
    try {
      const response = await fetch(`${apiBase}/api/echos/kanban`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(retryCommand.current.body) });
      const body = await response.json();
      if (!response.ok) {
        if (body.error === 'echo_board_revision_conflict') {
          await refresh(); retryCommand.current = null;
          throw new Error('Another writer changed the board. Review the refreshed card, then apply your choice again.');
        }
        throw new Error(body.message || `Board update failed (${response.status}); refresh to check its recorded state.`);
      }
      onBoardChange(body); retryCommand.current = null;
      onNotice(`${card.title}: ${label(targetStatus)}. Local board saved; Overwatch synchronization is not confirmed.`);
    } catch (error) { onNotice(error.message || String(error)); }
    finally { pendingRef.current = false; setPending(false); }
  }
  return <>
    <div style={{ padding: 8, fontSize: 13 }} role="status">
      Select a card to inspect it. Status changes use the controls below.
      <div>Local projection: {board?._sync?.localProjection || 'awaiting revision'} · Overwatch: {board?._sync?.overwatch || 'not confirmed'}</div>
      {board?._sync?.checkedAt && <div>Last checked: <time dateTime={board._sync.checkedAt}>{new Date(board._sync.checkedAt).toLocaleString()}</time></div>}
      <button type="button" className="hapa-btn" disabled={pending} onClick={() => refresh().catch(error => onNotice(error.message))}>Refresh board</button>
    </div>
    <div className="kanban-board" style={{ display: 'flex', gap: 8, padding: 8, overflow: 'auto', flex: 1, minHeight: 180 }}>
      {board?.lanes?.map(lane => <section key={lane.id} className={`kanban-lane accent-${lane.accent || 'cyan'}`} style={{ minWidth: 190, flex: '1 0 190px', overflowY: 'auto' }}>
        <h3 style={{ fontSize: 14 }}>{lane.title}</h3>
        {lane.cards.map(card => <button key={card.id} type="button" className={`kanban-card hapa-card status-${card.status}`} aria-pressed={selected?.cardId === card.id} aria-label={`Inspect ${card.title}. Status ${label(card.status)}`} onClick={() => inspect(lane.id, card)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 10, marginBottom: 8, cursor: 'pointer' }}>
          <strong style={{ fontSize: 14, display: 'block' }}>{card.title}</strong>
          <span style={{ fontSize: 12 }}>{card.owner} · {label(card.status)}</span>
        </button>)}
      </section>)}
    </div>
    {card && <dialog ref={dialogRef} aria-label="Requirement details" onClose={() => { setSelected(null); openerRef.current?.focus(); }} style={{ padding: 24, width: 'min(880px, 90vw)', maxHeight: '85vh', overflowY: 'auto', color: 'var(--text, #f4f4f5)', background: '#151923', border: '1px solid #06b6d4', borderRadius: 8 }}>
      <button type="button" className="hapa-btn" onClick={() => dialogRef.current.close()} style={{ float: 'right' }}>Close details</button>
      <h3>{card.title}</h3>
      <p style={{ whiteSpace: 'pre-wrap', fontSize: 14 }}>{card.body || card.description}</p>
      <p>Priority: {card.priority || 'unassigned'} · Owner: {card.owner || 'unassigned'} · Review: {card.reviewStatus || 'not recorded'}</p>
      {card.dependencies?.length > 0 && <p>Dependencies: {card.dependencies.join(', ')}</p>}
      {(card.acceptance || []).length > 0 && <><h4>Acceptance criteria</h4><ul>{card.acceptance.map((criterion, index) => <li key={index}>{criterion}</li>)}</ul></>}
      {card.blockedReason && <p>Blocked: {card.blockedReason}</p>}
      {card.resumeWhen && <p>Resume when: {card.resumeWhen}</p>}
      {(card.artifactLinks || []).map((link, i) => <p key={i}>{/^https?:\/\//i.test(link.href || '') ? <a href={link.href} target="_blank" rel="noreferrer">{link.label}</a> : <><strong>{link.label}</strong><br /><code style={{ overflowWrap: 'anywhere' }}>{link.href}</code></>}</p>)}
      {(card.implementationEvidence || []).map((evidence, i) => <p key={i}>{evidence.body} {evidence.accepted === false && <strong>Acceptance pending.</strong>}</p>)}
      <form onSubmit={changeStatus} style={{ display: 'grid', gap: 8 }}>
        <label>Status <select aria-label="Requirement status" value={targetStatus} disabled={pending} onChange={event => setTargetStatus(event.target.value)}>
          {!STATUSES.includes(card.status) && <option value={card.status}>{label(card.status)}</option>}
          {STATUSES.map(status => <option key={status} value={status}>{label(status)}</option>)}
        </select></label>
        <label>Reason {card.status === 'blocked' || targetStatus === 'blocked' ? '(required)' : '(optional)'}
          <textarea value={reason} maxLength={2000} required={card.status === 'blocked' || targetStatus === 'blocked'} disabled={pending} onChange={event => setReason(event.target.value)} />
        </label>
        <button className="hapa-btn" type="submit" disabled={pending || !board?._sync?.revision || targetStatus === card.status}>{pending ? 'Saving status…' : `Apply status: ${label(targetStatus)}`}</button>
      </form>
    </dialog>}
  </>;
}
