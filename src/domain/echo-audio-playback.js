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

/** Read only a bounded interval of the already verified PCM playback file.
 * This is a channel-extrema waveform, not a transcription or vocal detector. */
export async function readEchoPlaybackWaveform({ url, receipt, startSeconds = 0, endSeconds,
  bins = 1000, signal, fetchImpl = (...args) => fetch(...args) } = {}) {
  const fail = message => { throw new Error(message); };
  if (!url || receipt?.fidelity !== 'source-equivalent-ffmpeg-decoded-float32'
    || !/^(sha256:)?[a-f0-9]{64}$/.test(receipt.sourceHash || '')
    || !/^[a-f0-9]{64}$/.test(receipt.pcmSha256 || '')
    || !Number.isSafeInteger(receipt.byteSize) || receipt.byteSize <= 44) fail('Verified playback audio is required for waveform review.');
  const range = async (start, end) => {
    if (signal?.aborted) fail('Waveform request cancelled.');
    const response = await fetchImpl(url, { headers: { Range: `bytes=${start}-${end}` }, cache: 'no-store', signal });
    const declared = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('content-range') || '');
    if (response.status !== 206 || !declared || Number(declared[1]) !== start || Number(declared[2]) !== end || Number(declared[3]) !== receipt.byteSize) {
      await response.body?.cancel?.(); fail('Waveform source range is unavailable or changed. Prepare playback again.');
    }
    const reader = response.body?.getReader?.();
    if (!reader) fail('Waveform source does not support bounded streaming.');
    const bytes = new Uint8Array(end - start + 1); let offset = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        if (signal?.aborted) fail('Waveform request cancelled.');
        if (offset + value.byteLength > bytes.length) fail('Waveform response exceeded the requested byte budget.');
        bytes.set(value, offset); offset += value.byteLength;
      }
      if (offset !== bytes.length) fail('Waveform source range was truncated.');
      return bytes;
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  };
  const header = await range(0, Math.min(receipt.byteSize - 1, 65535));
  const view = new DataView(header.buffer), tag = at => String.fromCharCode(...header.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') fail('Waveform review requires the prepared WAV format.');
  let format = null, data = null;
  for (let offset = 12; offset + 8 <= header.length;) {
    const size = view.getUint32(offset + 4, true), body = offset + 8;
    if (tag(offset) === 'fmt ' && size >= 16 && body + size <= header.length) {
      let codec = view.getUint16(body, true);
      if (codec === 65534 && size >= 40) {
        const guidTail = [0, 0, 16, 0, 128, 0, 0, 170, 0, 56, 155, 113];
        if (view.getUint16(body + 16, true) < 22 || view.getUint16(body + 18, true) !== 32
          || !guidTail.every((value, i) => header[body + 28 + i] === value)) fail('Prepared waveform has an unsupported extensible format.');
        codec = view.getUint32(body + 24, true);
      }
      format = { codec, channels: view.getUint16(body + 2, true), sampleRate: view.getUint32(body + 4, true), blockAlign: view.getUint16(body + 12, true), bits: view.getUint16(body + 14, true) };
    }
    if (tag(offset) === 'data') { data = { offset: body, bytes: size }; break; }
    offset = body + size + (size % 2);
  }
  if (!format || !data || format.codec !== 3 || format.bits !== 32 || format.channels !== receipt.channels || format.sampleRate !== receipt.sampleRate
    || format.channels < 1 || format.channels > 8 || format.sampleRate < 8000 || format.sampleRate > 192000
    || format.blockAlign !== format.channels * 4 || data.offset + data.bytes > receipt.byteSize || data.bytes % format.blockAlign) fail('Prepared waveform format does not match its source receipt.');
  const totalFrames = data.bytes / format.blockAlign;
  if (!Number.isFinite(Number(startSeconds)) || !Number.isFinite(Number(endSeconds)) || Number(startSeconds) < 0 || Number(endSeconds) <= Number(startSeconds)) fail('Choose a valid waveform time interval.');
  const first = Math.min(totalFrames, Math.floor(Number(startSeconds) * format.sampleRate));
  const last = Math.min(totalFrames, Math.ceil(Number(endSeconds) * format.sampleRate), first + Math.floor(4 * 1024 ** 2 / format.blockAlign), first + format.sampleRate * 12);
  if (last <= first) fail('The waveform interval is outside the prepared audio.');
  const bytes = await range(data.offset + first * format.blockAlign, data.offset + last * format.blockAlign - 1);
  const samples = new DataView(bytes.buffer), count = Math.max(1, Math.min(2000, Math.round(Number(bins) || 1000), last - first));
  const peaks = [];
  for (let bin = 0; bin < count; bin++) {
    const begin = Math.floor(bin * (last - first) / count), end = Math.floor((bin + 1) * (last - first) / count);
    let minimum = Infinity, maximum = -Infinity;
    for (let frame = begin; frame < end; frame++) for (let channel = 0; channel < format.channels; channel++) {
      const sample = samples.getFloat32((frame * format.channels + channel) * 4, true);
      if (!Number.isFinite(sample)) fail('Prepared waveform contains a non-finite sample.');
      minimum = Math.min(minimum, sample); maximum = Math.max(maximum, sample);
    }
    peaks.push({ startSeconds: (first + begin) / format.sampleRate, endSeconds: (first + end) / format.sampleRate, minimum, maximum });
  }
  return { schemaVersion: 'hapa.echo.playback-waveform.v1', sourceHash: receipt.sourceHash, pcmSha256: receipt.pcmSha256,
    sampleRate: format.sampleRate, channels: format.channels, startSeconds: first / format.sampleRate, endSeconds: last / format.sampleRate,
    requestedEndSeconds: Number(endSeconds), limited: last < Math.min(totalFrames, Math.ceil(Number(endSeconds) * format.sampleRate)),
    bytesRead: header.length + bytes.length, peakResolutionSeconds: (last - first) / format.sampleRate / count,
    scope: 'Minimum/maximum across all playback channels; not isolated vocals or measured word alignment', peaks };
}
