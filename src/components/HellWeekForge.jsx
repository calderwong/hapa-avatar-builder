import { useEffect, useRef, useState } from 'react';
import { Upload, Play, Pause, RefreshCw, Flame } from 'lucide-react';
import './HellWeekForge.css';
import HellWeekSemanticRun from './HellWeekSemanticRun.jsx';
import HellWeekAvatarPicker from './HellWeekAvatarPicker.jsx';

function Art({ bridge, runId, card }) {
  const [src, setSrc] = useState('');
  const [visible, setVisible] = useState(false);
  const frame = useRef(null);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '200px' });
    if (frame.current) observer.observe(frame.current);
    return () => observer.disconnect();
  }, []);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    if (!visible) { setSrc(''); return; }
    if (card.image) bridge.asset({ id: runId, cardId: card.id }).then(r => {
      if (alive) { if (r.ok) setSrc(r.dataUrl); else setError(r.message); }
    }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [bridge, runId, card.id, card.image?.sha256, visible]);
  return <div ref={frame}>{src ? <img src={src} alt={card.design.visual_thesis} loading="lazy" /> : <div className="hw-art-placeholder">{error || (card.image ? 'Loading artwork…' : 'Artwork pending')}</div>}</div>;
}

export default function HellWeekForge() {
  const bridge = window.hapaHellWeek;
  const [input, setInput] = useState({ name: '', text: '', filePath: '', workflow: 'semantic', leoModel: 'gpt-4o', thorModel: 'gpt-4o-mini', imageModel: 'gpt-image-2.5-sunburst-2026-09-08', quality: 'high' });
  const [avatarSelections, setAvatarSelections] = useState([]);
  const [avatarReady, setAvatarReady] = useState(true);
  const [runs, setRuns] = useState([]);
  const [selected, setSelected] = useState('');
  const [cardOffset, setCardOffset] = useState(0);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const fileInput = useRef(null);
  const output = useRef(null);
  function selectRun(id) { setCardOffset(0); setSelected(id); requestAnimationFrame(() => output.current?.scrollIntoView({ block: 'start' })); }
  const run = runs.find(r => r.id === selected);
  const running = run?.workerActive || run?.state === 'starting';
  const unknownCall = Object.entries(run?.calls || {}).find(([, c]) => ['unknown', 'submitted'].includes(c.state));
  async function refresh() {
    if (!bridge) return;
    const result = await bridge.status();
    if (!result.ok) throw Error(result.message);
    const chosen = selected || result.runs?.[0]?.id;
    const detail = chosen ? await bridge.status({ id: chosen, offset: cardOffset, limit: 24 }) : null;
    if (detail && !detail.ok) throw Error(detail.message);
    setRuns((result.runs || []).map(r => r.id === chosen ? detail : r));
    setSelected(current => current || result.runs?.[0]?.id || '');
  }
  useEffect(() => {
    let alive = true;
    const poll = () => { if (alive) refresh().catch(e => setError(e.message)); };
    poll(); const timer = setInterval(poll, 2500);
    return () => { alive = false; clearInterval(timer); };
  }, [bridge, selected, cardOffset]);
  async function act(label, operation) {
    setBusy(label); setError('');
    try { const result = await operation(); if (!result.ok) throw Error(result.message || 'Operation failed.'); await refresh(); return result; }
    catch (e) { setError(e.message); }
    finally { setBusy(''); }
  }
  async function upload(files) {
    setBusy('Reading document…'); setError('');
    try {
      if (files.length !== 1) throw Error('Drop one document or conversation export per run.');
      const file = files[0];
      if (!/\.(txt|md|markdown|json)$/i.test(file.name)) throw Error('Use .txt, .md or conversation .json. For PDF or Word, export or paste the text first.');
      const filePath = bridge?.filePath?.(file);
      if (!filePath) throw Error('Choose the original file in the desktop app so large sources can be read incrementally.');
      setInput(current => ({ ...current, name: file.name, filePath, text: '' })); setSelected(''); setCardOffset(0);
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  }
  return <section className="hw-forge" aria-label="Create Hapa Cards">
    <header className="hw-head">
      <div><span className="eyebrow">HELL WEEK · OPENAI</span><h2>Ideas become Cards.</h2><p>Drop a conversation or document. LEO finds the purpose; Thor forges the meaning and artwork.</p></div>
      <button className="hapa-btn" onClick={() => act('Refreshing…', async () => { await refresh(); return { ok: true }; })} disabled={!!busy}><RefreshCw size={14} /> Refresh</button>
    </header>
    {!bridge && <p role="status" className="hw-notice">Open the Hapa Avatar Builder desktop app to generate with its saved OpenAI key. Existing Dev Proto cards remain available in the other tab.</p>}
    {error && <p role="alert" className="hw-error">{error}</p>}
    {busy && <p role="status" aria-live="polite">{busy}</p>}
    <div className="hw-columns">
      <aside className="hapa-panel hw-intake" data-variant="notch">
        <h3>Source material</h3>
        <button className="hw-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); upload(e.dataTransfer.files); }} onClick={() => fileInput.current.click()} disabled={!!busy}>
          <Upload size={24} /><strong>Drop a document or choose a file</strong><span>Text · Markdown · Conversation JSON</span>
        </button>
        <input ref={fileInput} type="file" hidden accept=".txt,.md,.markdown,.json" onChange={e => { if (e.target.files.length) upload(e.target.files); e.target.value = ''; }} />
        <label>Source name<input className="hapa-input" value={input.name} onChange={e => setInput({ ...input, name: e.target.value })} placeholder="A conversation, lesson or collection" /></label>
        {input.filePath && <p className="hw-notice">File selected: {input.name}. Its complete contents will be indexed without loading the whole file into this screen.<button className="hapa-btn" onClick={()=>setInput({...input,filePath:''})}>Use pasted text instead</button></p>}
        <label>Or paste text<textarea className="hapa-input" value={input.text} onChange={e => setInput({ ...input, filePath: '', text: e.target.value })} placeholder="Paste the source you want to turn into Hapa Cards…" rows={8} /></label>
        <HellWeekAvatarPicker bridge={bridge} selections={avatarSelections} onChange={setAvatarSelections} onReady={setAvatarReady} disabled={!!busy} />
        <p className="hw-small">Card count is discovered from the source. There is no fixed Card ceiling; an optional image batch size is available after preparation.</p>
        <details><summary>Models and image quality</summary>
          {[['leoModel', 'LEO model'], ['thorModel', 'Thor model'], ['imageModel', 'Image model']].map(([key, label]) => <label key={key}>{label}<input className="hapa-input" value={input[key]} onChange={e => setInput({ ...input, [key]: e.target.value })} /></label>)}
          <label>Image quality<select className="hapa-select" value={input.quality} onChange={e => setInput({ ...input, quality: e.target.value })}><option>low</option><option>medium</option><option>high</option></select></label>
        </details>
        <button className="hapa-btn" data-intent="primary" disabled={!bridge || !!busy || !avatarReady || !input.text.trim() && !input.filePath} onClick={async () => {
          const result = await act('Preparing source…', () => bridge.create({ ...input, avatarSelections })); if (result?.id) selectRun(result.id);
        }}>Prepare run · no API spend</button>
        <p className="hw-small">Source files stay in place; private run records use the registered external store. Starting discovery sends source sections to OpenAI. Generated Cards retain source links and remain review candidates.</p>
        <details><summary>Workflow and recovery</summary><p className="hw-small">Prepare saves and checks the complete source without spending. Generate runs LEO, Thor, artwork and Card saving automatically. Cards stay review candidates in Items. Pause lets the current step finish; Resume reuses saved results. An uncertain paid request stops for review and is never automatically sent again.</p><p className="hw-small">Choose UTF-8 text, Markdown or conversation JSON files for incremental processing. Pasted text has an 8 MiB transfer limit; use a file for larger sources. PDF/Word still need exported text. Discovery can create zero or many Cards per section; image batch limits pause illustration only. Models and image quality apply to newly prepared runs.</p></details>
        <h3>Saved runs</h3>
        <div className="hw-runs">{runs.map(r => <button key={r.id} className="hapa-btn" aria-pressed={r.id === selected} onClick={() => selectRun(r.id)}><strong>{r.name}</strong><span>{r.schema === 'hapa.builder-hell-week.v2' && !r.analysisComplete ? `${r.totalCards} discovered · count still open` : `${r.savedCards ?? r.cards.filter(c => c.state === 'saved').length}/${r.totalCards} saved`} · {r.state}</span></button>)}</div>
      </aside>
      <main className="hw-output" ref={output}>
        {run?.schema === 'hapa.builder-hell-week.v2' ? <HellWeekSemanticRun key={run.id} run={run} bridge={bridge} act={act} busy={!!busy} Art={Art} onPage={setCardOffset} /> : run ? <>
          <section className="hapa-panel hw-run" data-variant="notch">
            <div><span className="eyebrow">{run.leo[0]?.set_name || run.name}</span><h3>{run.stage || 'Ready to begin'}</h3><p role="status" aria-live="polite">{run.state} · {run.cards.filter(c => c.state === 'saved').length}/{run.totalCards} Cards saved · {run.attempts}/{run.plannedCalls} planned API calls dispatched</p></div>
            {!!run.avatars?.length && <details className="hw-foundations"><summary>Run Avatar foundations · {run.avatars.length}</summary>{run.avatars.map(a => <div key={a.avatarId}><strong>{a.name}</strong><p>{a.image ? `Image + profile · ${a.image.role.replaceAll('_', ' ')}` : 'Text profile only'}</p><small>{a.avatarId} · snapshot {a.snapshotHash.slice(0, 12)}</small></div>)}<p className="hw-small">Saved at preparation. Each Card records the subset Thor used.</p></details>}
            <progress max={run.totalCards} value={run.cards.filter(c => c.state === 'saved').length} aria-label="Saved Cards" />
            {run.error && <p className="hw-error" role="alert">{run.error}</p>}
            <div className="hw-actions">
              {!running && bridge?.reconcile && run.cards.some(c => c.image) && <button className="hapa-btn" disabled={!!busy} onClick={() => act('Verifying saved Card links…', () => bridge.reconcile({ id: run.id }))}>Verify saved Card links · no generation</button>}
              {running ? <button className="hapa-btn" disabled={!!busy} onClick={() => act('Pausing after the current result…', () => bridge.pause({ id: run.id }))}><Pause size={14} /> Pause after this step</button>
                : run.state !== 'complete' && !unknownCall && <button className="hapa-btn" disabled={!bridge || !!busy} onClick={() => act('Starting…', () => bridge.start({ id: run.id }))}><Play size={14} />{run.state === 'prepared' ? `Generate ${run.totalCards} Cards with OpenAI` : 'Resume saved work'}</button>}
              {!running && unknownCall && <div className="hw-recovery"><p className="hw-notice">Connection recovery: {unknownCall[0]} has no saved response. It may already have been billed. Completed LEO work remains saved; ordinary Resume will not repeat this uncertain request.</p>{unknownCall[1].attempt < 2 ? <button className="hapa-btn" disabled={!!busy} onClick={() => {
                const accepted = window.confirm(`Retry only ${unknownCall[0]} once? OpenAI may already have billed the earlier request. This can incur a duplicate charge. Completed work will be reused, and the run will pause after saving the recovery step.`);
                if (accepted) act('Recovering one step, then pausing…', () => bridge.start({ id: run.id, retryUnknownCallId: unknownCall[0], acknowledgePossibleDuplicateCharge: true }));
              }}>Retry uncertain step once · then pause</button> : <p className="hw-small">The one-retry limit has been reached. Review this request before creating any replacement work.</p>}</div>}
              {!running && run.leoCoverage && <div className="hw-recovery"><p className="hw-notice">LEO saved {run.leoCoverage.savedCount}/{run.leoCoverage.expected.length} preparations in this window. Missing: {run.leoCoverage.missing.join(', ')}. Existing results will be kept.</p><button className="hapa-btn" disabled={!!busy} onClick={() => act('Completing missing preparation, then pausing…', () => bridge.start({ id: run.id, repairLeoWindow: run.leoCoverage.windowIndex }))}>Complete missing preparation · one API call, then pause</button></div>}
              {!running && run.thorEvidence && <div className="hw-recovery"><p className="hw-notice">Thor's design is saved, but its quotations need exact source excerpts.</p><button className="hapa-btn" disabled={!!busy} onClick={() => act('Selecting source quotes…', () => bridge.start({ id: run.id, repairThorEvidence: true }))}>Repair source quotes · continue run</button></div>}
              {Object.values(run.calls).some(c => c.state === 'rejected' && c.attempt < 2) && <button className="hapa-btn" disabled={running || !!busy} onClick={() => act('Retrying the rejected request…', () => bridge.start({ id: run.id, retryRejected: true }))}>Retry rejected request once</button>}
            </div>
            <p className="hw-small">One image per Card · {run.config.size} · {run.config.quality} quality. Previous image tests took about 40–60 seconds each; agent timing varies. Uses API credits; no automatic retries or background restart.</p>
          </section>
          {run.leo.length > 0 && <details className="hapa-panel hw-context"><summary>LEO’s preparation · {run.leo.length} saved window(s)</summary>{run.leo.map((l, i) => <div key={i}><h4>{l.set_name}</h4><p>{l.summary}</p><p>{l.yarn}</p></div>)}</details>}
          <div className="hw-card-grid">{Array.from({ length: run.totalCards }, (_, i) => {
            const card = run.cards[i];
            return <article className="hapa-card hw-card" data-card-type={card?.design.kind || 'quest'} data-state={card?.state || 'pending'} key={card?.id || i}>
              {card ? <><Art bridge={bridge} runId={run.id} card={card} /><div className="hw-card-copy"><span className="eyebrow">{card.design.kind} · {card.state}</span><h3>{card.design.title}</h3><p>{card.design.summary}</p><details><summary>Lore, skills and source evidence</summary><p>{card.design.lore}</p>{card.design.skills.map((s, k) => <p key={k}><strong>{s.name} · {s.type}</strong><br />{s.description}</p>)}{card.design.evidence_quotes.map((q, k) => <blockquote key={k}>{q}</blockquote>)}<p>Source: {run.name} · {card.chunkId}</p>{!!run.avatars?.length && <div><strong>Avatars used for this Card</strong>{card.avatarLineage?.used?.length ? card.avatarLineage.used.map(a => <p key={a.avatarId}>{a.name} · {a.mode === 'profile-and-image' ? 'image + profile' : 'profile only'}<br />{a.role} — {a.reason}</p>) : <p>No Avatar used · abstract or environmental direction</p>}</div>}{card.design.validationWarnings?.map((warning, k) => <p key={k} className="hw-notice">{warning}</p>)}{[['Source-supported claims', card.design.facts], ['Desires and proposals', card.design.desires], ['Uncertainty', card.design.uncertainties]].map(([label, values]) => values.length > 0 && <div key={label}><strong>{label}</strong>{values.map((value, k) => <p key={k}>{value}</p>)}</div>)}</details><details><summary>Image direction</summary><p>{card.design.visual_thesis}</p><p>{card.imagePrompt || card.design.image_prompt}</p></details>{card.state === 'saved' && <small>Saved to Items · pending human review</small>}</div></>
                : <div className="hw-waiting"><Flame size={28} /><h3>Card {i + 1}</h3><p>{run.leo.length ? 'Waiting for Thor' : 'Waiting for LEO'}</p></div>}
            </article>;
          })}</div>
        </> : <div className="hapa-panel hw-empty"><Flame size={38} /><h3>Start with something worth keeping.</h3><p>A conversation, a design document, a lesson learned. Prepare the full source without spending; then discover the useful Cards and review designs before illustration.</p><div className="hw-stages"><span>01 · LEO prepares</span><span>02 · Thor designs</span><span>03 · OpenAI illustrates</span><span>04 · Cards saved</span></div></div>}
      </main>
    </div>
  </section>;
}
