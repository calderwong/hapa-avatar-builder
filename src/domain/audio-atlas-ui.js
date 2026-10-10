// Atlas UI uses the existing same-origin, process-scoped session contract.
export function createAtlasClient(base = '', fetcher = globalThis.fetch) {
  let pending;
  const connect = () => pending ||= fetcher(`${base}/api/local-ui-session`, {
    method: 'POST', credentials: 'same-origin', headers: {'X-Hapa-First-Party-Intent': 'audio-atlas'}, signal: AbortSignal.timeout(15000),
  }).then(r => { if (!r.ok) throw new Error('Cannot connect to the local Builder. Reopen the loopback preview and retry.'); }).finally(() => { pending = null; });
  const request = async (route, options = {}, retry = true) => {
    const response = await fetcher(`${base}/api/echos/audio-atlas${route}`, {credentials: 'same-origin', ...options, headers: {'Content-Type': 'application/json', ...options.headers}, signal: options.signal || AbortSignal.timeout(30000)});
    const value = await response.json();
    // Only typed pre-dispatch rejection may replay a mutation. Never replay a timeout or ambiguous server failure.
    if (retry && ((response.status === 401 && value.error === 'unauthorized') || (response.status === 503 && value.error === 'admin_auth_not_configured'))) {
      await connect(); return request(route, options, false);
    }
    if (!response.ok) throw new Error(value.message || value.error || 'Audio Atlas is unavailable. Retry this action.');
    return value;
  };
  return {request, connect};
}
export function timeLabel(seconds) {
  const value = Math.round(Math.max(0, Number(seconds) || 0) * 100) / 100;
  return `${Math.floor(value / 60)}:${(value % 60).toFixed(2).padStart(5, '0')}`;
}
export function correctionSamples(start, end, rate, count, instant = false) {
  if (String(start).trim() === '' || (!instant && String(end).trim() === '')) return null;
  const from = Math.round(Number(start) * rate), to = instant ? from : Math.round(Number(end) * rate);
  return Number.isSafeInteger(from) && Number.isSafeInteger(to) && from >= 0 && from < count && to >= from && to <= count && (instant || to > from) ? {start_sample: from, end_sample: to} : null;
}
export const eventLabel = row => row.payload?.text || row.kind?.split('.').at(-1).replaceAll('_', ' ') || 'Observation';
export const reviewLabel = state => ({unreviewed: 'Not reviewed', needs_review: 'Flagged for review', accepted_by_human: 'Accepted by a person', rejected: 'Rejected'}[state] || state?.replaceAll('_', ' ') || 'Not reviewed');
export function matchesFileFilter(entry, filter) {
  if (filter === 'all') return true;
  if (!entry) return filter === 'attention';
  const values = [entry.wav, entry.mp3, entry.wav_stems, entry.mp3_stems];
  if (filter === 'attention') return values.some(v => v?.state !== 'available');
  return entry[filter]?.state !== 'available';
}
