import { useEffect, useRef, useState } from 'react';

const busy = value => ['queued', 'running', 'cancelling'].includes(value?.status);
export default function EchoPreviewPreparationControl({ apiBase, songId, variantId = 'legacy', pendingCount, onProjection }) {
  const [job, setJob] = useState({ status: 'idle' });
  const [pending, setPending] = useState(false), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const callback = useRef(onProjection); callback.current = onProjection;
  const selectionRef = useRef(''), commandRef = useRef(null);
  const selection = `songId=${encodeURIComponent(songId)}&variantId=${encodeURIComponent(variantId)}`;
  selectionRef.current = selection;
  const endpoint = `${apiBase}/api/echos/director-preview/prepare`;
  useEffect(() => {
    const controller = new AbortController(); let timer, disposed = false;
    setJob({ status: 'idle' }); setError(''); callback.current?.(null);
    async function poll() {
      const timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(`${endpoint}?${selection}`, { signal: controller.signal, cache: 'no-store' });
        const value = await response.json();
        if (!response.ok) throw new Error(value.message || 'Could not read preview preparation.');
        if (disposed) return;
        setJob(value); callback.current?.(value);
        if (busy(value)) timer = setTimeout(poll, 1500);
      } catch (cause) { if (!disposed) setError(cause.name === 'AbortError' ? 'Progress request timed out. Reconnect to check preparation.' : cause.message); }
      finally { clearTimeout(timeout); }
    }
    void poll();
    return () => { disposed = true; controller.abort(); clearTimeout(timer); const command = commandRef.current; commandRef.current = null; command?.abort(); setPending(false); };
  }, [endpoint, selection, refresh]);
  async function command(method) {
    if (pending) return;
    setPending(true); setError('');
    const controller = new AbortController(); commandRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const query = method === 'DELETE' ? `jobId=${encodeURIComponent(job.id)}` : selection;
      const response = await fetch(`${endpoint}?${query}`, { method, signal: controller.signal });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || 'Preview preparation failed.');
      if (selectionRef.current !== selection || controller.signal.aborted) return;
      setJob(value); callback.current?.(value); setRefresh(n => n + 1);
    } catch (cause) {
      if (selectionRef.current === selection && commandRef.current === controller) setError(cause.name === 'AbortError'
        ? 'Request timed out. Reconnect to check whether preparation started.' : cause.message);
    }
    finally { clearTimeout(timeout); if (commandRef.current === controller) { commandRef.current = null; setPending(false); } }
  }
  return <span data-testid="echo-preview-preparation" data-job-status={job.status} data-ready-cues={job.items?.filter(row => row.status === 'ready').length || 0} style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', fontSize: 11 }}>
    {busy(job) ? <><span role="status">{job.completed || 0}/{job.total || pendingCount} video cues prepared</span><button className="hapa-btn" type="button" disabled={pending} onClick={() => command('DELETE')}>Cancel previews</button></>
      : (pendingCount > 0 || ['partial', 'failed', 'cancelled', 'interrupted', 'stale'].includes(job.status)) && <button className="hapa-btn" type="button" disabled={pending || !songId} onClick={() => command('POST')}>{pending ? 'Starting…' : 'Prepare selected-cut preview'}</button>}
    {!busy(job) && job.message && <span role="status">{job.message}</span>}
    {error && <span role="alert">{error} <button className="hapa-btn" type="button" onClick={() => setRefresh(n => n + 1)}>Reconnect</button></span>}
  </span>;
}
