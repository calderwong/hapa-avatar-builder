import { useEffect, useState } from 'react';
import { localFileApiUri } from '../domain/local-media-uri.js';

export default function HellWeekAvatarPicker({ bridge, selections, onChange, disabled, onReady }) {
  const [avatars, setAvatars] = useState([]);
  const [details, setDetails] = useState({});
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  async function load() {
    if (!bridge?.avatars) return;
    setLoading(true); setError('');
    try { const r = await bridge.avatars(); if (!r.ok) throw Error(r.message); setAvatars(r.avatars); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [bridge]);
  useEffect(() => { onReady(selections.every(s => !!details[s.avatarId])); }, [selections, details, onReady]);
  async function toggle(a) {
    if (selections.some(s => s.avatarId === a.avatarId)) { onChange(selections.filter(s => s.avatarId !== a.avatarId)); return; }
    if (selections.length >= 8) return;
    setError(''); onChange([...selections, { avatarId: a.avatarId, ...(details[a.avatarId] ? { assetId: details[a.avatarId].defaultAssetId } : {}) }]);
    if (details[a.avatarId]) return;
    try { const r = await bridge.avatarOptions({ avatarId: a.avatarId }); if (!r.ok) throw Error(r.message); setDetails(d => ({ ...d, [a.avatarId]: r })); onChange(current => current.map(s => s.avatarId === a.avatarId && s.assetId === undefined ? { ...s, assetId: r.defaultAssetId } : s)); }
    catch (e) { setError(`${a.name}: ${e.message} Remove and select again to retry.`); }
  }
  const visible = avatars.filter(a => `${a.name} ${a.avatarId} ${a.aliases.join(' ')}`.toLowerCase().includes(search.toLowerCase()));
  return <fieldset className="hw-avatar-picker" disabled={disabled || !bridge?.avatars}>
    <legend>Avatar foundations · optional</legend>
    <p className="hw-small">Choose up to 8. LEO and Thor use their profiles; matching artwork can use their images. Thor can leave a Card abstract.</p>
    <label>Find Avatars<input className="hapa-input" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your Avatar library" /></label>
    {loading && <p role="status">Loading Avatars…</p>}
    {error && <p role="alert" className="hw-error">{error}</p>}
    {!loading && !avatars.length && <p className="hw-small">No Avatars loaded. You can still prepare without references.</p>}
    <div className="hw-avatar-roster" aria-label="Available Avatar foundations">{visible.map(a => {
      const checked = selections.some(s => s.avatarId === a.avatarId);
      return <label key={a.avatarId} className="hw-avatar-choice"><input type="checkbox" checked={checked} disabled={!checked && selections.length >= 8} onChange={() => toggle(a)} /><span>{a.name}<small>{a.avatarId}</small></span></label>;
    })}</div>
    {!!avatars.length && !visible.length && <p>No matching Avatars.</p>}
    <button type="button" className="hapa-btn" disabled={loading} onClick={load}>Refresh Avatar library</button>
    <p className="hw-small">{selections.length}/8 selected · none means the original creative workflow</p>
    {selections.map(s => {
      const d = details[s.avatarId]; const assetId = s.assetId === undefined ? d?.defaultAssetId : s.assetId;
      const image = d?.images.find(i => i.assetId === assetId);
      const uri = image?.thumbnailUri || image?.uri || '';
      const src = uri.startsWith('/media/') ? uri : localFileApiUri(uri);
      return <div key={s.avatarId} className="hw-avatar-selected">
        <strong>{d?.name || avatars.find(a => a.avatarId === s.avatarId)?.name || s.avatarId}</strong>
        {d ? <><p className="hw-small">{d.context.summary}</p>{src && <img src={src} alt={`${d.name} reference`} loading="lazy" />}
          <label>Reference image<select className="hapa-select" value={assetId || ''} onChange={e => onChange(selections.map(v => v.avatarId === s.avatarId ? { ...v, assetId: e.target.value || null } : v))}><option value="">Text context only</option>{d.images.map(i => <option value={i.assetId} key={i.assetId}>{i.role.replaceAll('_', ' ')} · {i.label}</option>)}</select></label>
          {!d.images.length && <small>No local reference images available; profile context will be used.</small>}</> : <p role="status">Loading reference choices…</p>}
        <button type="button" className="hapa-btn" onClick={() => onChange(selections.filter(v => v.avatarId !== s.avatarId))}>Remove {d?.name || 'Avatar'}</button>
      </div>;
    })}
    <p className="hw-small">Prepare freezes these choices for the new run. Generate sends selected profiles and each Card’s used images to OpenAI. Existing runs keep their own references.</p>
  </fieldset>;
}
