import { useState } from 'react';
import { avatarWorkBoardUrl } from '../domain/avatar-work-board.js';
import './AvatarWorkBoardPanel.css';

export default function AvatarWorkBoardPanel({ avatar }) {
  const [embedded, setEmbedded] = useState(false);
  const href = avatarWorkBoardUrl(avatar?.id);
  if (!href) return null;
  const label = avatar.primaryName || avatar.id;
  return <section className="avatar-work-board hapa-panel" aria-label={`${label} work board`}>
    <p className="avatar-work-board__eyebrow">Avatar coordination · append-only · prototype</p>
    <h2>{label} · Work Board</h2>
    <p>Persistent tasks, evidence, shared notes and completion cards. This is separate from the derived healing queue below.</p>
    <div className="avatar-work-board__actions">
      <a href={href} target="_blank" rel="noreferrer">Open {label}’s board ↗</a>
      <button type="button" onClick={() => setEmbedded(value => !value)} aria-expanded={embedded}>{embedded ? 'Hide embedded board' : 'Show board here'}</button>
      <a href="http://127.0.0.1:5181/docs/avatar-boards" target="_blank" rel="noreferrer">Human / agent protocol</a>
    </div>
    <p className="avatar-work-board__status">Task owner: Hapa Overwatch Kanban · identity: {avatar.id}. Requires the local Kanban service on port 5181. If unavailable, open the board link for diagnosis; no cached success is claimed.</p>
    {embedded && <iframe key={avatar.id} src={href} title={`${label} live work board`} loading="lazy" />}
  </section>;
}
