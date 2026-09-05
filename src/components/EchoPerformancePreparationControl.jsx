import { useEffect, useRef, useState } from 'react';

const busy = job => ['queued', 'running', 'cancelling'].includes(job?.status);

/** Song-scoped controls for the existing analysis pipeline. Leaving the song
 * aborts transport only; returning reconnects to the owned preparation job. */
export default function EchoPerformancePreparationControl({ apiBase, songId, variantId = 'legacy', ready, onReady }) {
  const [job, setJob] = useState({ status: 'idle' });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const requestRef = useRef(null);
  const notified = useRef(null);
  const onReadyRef = useRef(onReady); onReadyRef.current = onReady;
  const selection = `songId=${encodeURIComponent(songId)}&variantId=${encodeURIComponent(variantId)}`;
  const endpoint = `${apiBase}/api/echos/music-performance/prepare`;
  useEffect(() => {
    const controller = new AbortController();
    let timer, timeout, disposed = false;
    async function poll() {
      timeout = setTimeout(() => controller.abort(), 30000);
      try {
        const response = await fetch(`${endpoint}?${selection}`, { signal: controller.signal, cache: 'no-store' });
        const value = await response.json();
        if (!response.ok) throw new Error(value.message || 'Could not load preparation progress.');
        if (disposed) return;
        setJob(value);
        if (value.status === 'ready' && notified.current !== value.id) { notified.current = value.id; onReadyRef.current?.(); }
        if (busy(value)) timer = setTimeout(poll, 1500);
      } catch (cause) { if (!disposed) setError(cause.name === 'AbortError' ? 'Preparation progress timed out. Retry to reconnect.' : cause.message); }
      finally { clearTimeout(timeout); }
    }
    poll();
    return () => { disposed = true; clearTimeout(timer); clearTimeout(timeout); controller.abort(); };
  }, [endpoint, selection, job.id, pending]);
  useEffect(() => () => { const request = requestRef.current; requestRef.current = null; request?.abort(); }, []);
  async function command(method) {
    if (pending) return;
    setPending(true); setError('');
    const controller = new AbortController(); requestRef.current = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const query = method === 'DELETE' ? `jobId=${encodeURIComponent(job.id)}` : selection;
      const response = await fetch(`${endpoint}?${query}`, { method, signal: controller.signal });
      const value = await response.json();
      if (!response.ok) throw new Error(value.message || 'Audio preparation request failed.');
      setJob(value);
    } catch (cause) { if (requestRef.current === controller) setError(cause.name === 'AbortError' ? 'Request timed out. Retry to reconnect; preparation may still be running.' : cause.message); }
    finally { clearTimeout(timeout); if (requestRef.current === controller) { requestRef.current = null; setPending(false); } }
  }
  return <span>
    {busy(job) ? <><span role="status">{job.message}</span>{' '}<button type="button" className="hapa-btn" disabled={pending || job.status === 'cancelling'} onClick={() => command('DELETE')}>Cancel preparation</button></>
      : !ready && <button type="button" className="hapa-btn" disabled={pending || !songId} onClick={() => command('POST')}>{pending ? 'Starting preparation…' : 'Prepare song timing'}</button>}
    {['failed', 'cancelled'].includes(job.status) && <span role="status"> {job.message}</span>}
    {error && <span role="alert"> {error} <button type="button" className="hapa-btn" disabled={pending} onClick={() => command('POST')}>Reconnect preparation</button></span>}
  </span>;
}
