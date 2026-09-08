/** Existing preparation queue + range-streamed PCM. No browser-sized WAV blob,
 * source rewrite or fallback to a different master. */
export async function prepareEchoAudioPlayback({ apiBase = '', songId, variantId = 'legacy', sourceUri,
  signal, onProgress = () => {}, fetchImpl = (...args) => fetch(...args), requestId = crypto.randomUUID(),
  pollMs = 250, timeoutMs = 180000 } = {}) {
  if (signal?.aborted) throw new Error('Audio preparation cancelled');
  const base = String(apiBase).replace(/\/$/, '');
  const query = new URLSearchParams({ songId, variantId, requestId });
  let jobId = null, released = false, completed = false;
  const release = () => {
    if (released) return; released = true;
    globalThis.removeEventListener?.('pagehide', release);
    signal?.removeEventListener('abort', release);
    const params = new URLSearchParams(jobId ? { jobId } : { requestId });
    Promise.resolve().then(() => fetchImpl(`${base}/api/echos/music-performance/prepare?${params}`, { method: 'DELETE', keepalive: true })).catch(() => {});
  };
  const read = async (url, options = {}) => {
    const response = await fetchImpl(url, { ...options, signal, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.message || body.error || `HTTP ${response.status}`);
    return body;
  };
  const wait = () => new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); signal?.removeEventListener('abort', cancel); error ? reject(error) : resolve(); };
    const cancel = () => finish(new Error('Audio preparation cancelled'));
    const timer = setTimeout(() => finish(), pollMs);
    signal?.addEventListener('abort', cancel, { once: true }); if (signal?.aborted) cancel();
  });
  signal?.addEventListener('abort', release, { once: true });
  globalThis.addEventListener?.('pagehide', release, { once: true });
  try {
    let job = await read(`${base}/api/echos/playback-audio/prepare?${query}`, { method: 'POST' });
    jobId = job.id;
    if (!jobId || job.kind !== 'playback-audio') throw new Error('Playback preparation returned a different job type');
    const started = Date.now(); let lastMessage = '';
    while (job.status !== 'ready') {
      if (!['queued', 'running'].includes(job.status)) throw new Error(job.message || 'Audio preparation failed');
      if (Date.now() - started > timeoutMs) throw new Error('Audio preparation timed out. Retry to reuse cached work.');
      if (job.message && job.message !== lastMessage) { onProgress(job.message); lastMessage = job.message; }
      await wait(); job = await read(`${base}/api/echos/music-performance/prepare?${new URLSearchParams({ jobId })}`);
    }
    const value = job.result;
    if (signal?.aborted || released) throw new Error('Audio preparation cancelled');
    if (value?.sourceUri !== sourceUri || value?.fidelity !== 'source-equivalent-ffmpeg-decoded-float32'
      || !/^[a-f0-9]{64}$/.test(String(value.sourceHash).replace(/^sha256:/, ''))
      || !/^[a-f0-9]{64}$/.test(value.pcmSha256 || '') || !(value.durationSeconds > 0)) throw new Error('Prepared playback does not match the selected master');
    completed = true;
    return { url: `${base}/api/echos/playback-audio?${new URLSearchParams({ jobId })}`,
      receipt: { sourceUri, sourceHash: value.sourceHash, pcmSha256: value.pcmSha256, durationSeconds: value.durationSeconds,
        sampleRate: value.sampleRate, channels: value.channels, byteSize: value.byteSize, fidelity: value.fidelity, cached: value.cached }, release };
  } finally {
    if (!completed) { release(); signal?.removeEventListener('abort', release); }
  }
}
