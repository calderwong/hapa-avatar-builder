import { hyperFramesVideoFrameTime } from './hyperframes-media-frame-runtime.js';

const MAX_BYTES = 32 * 1024 ** 2;
// One verified source and at most four decoded/queued frames per history owner.
// All-intra packets permit bounded look-ahead without changing seek semantics.
export function createEchoProxyFrameDecoder({ fetchImpl = (...args) => fetch(...args), timeoutMs = 10000, hardwareAcceleration = 'no-preference', lookaheadFrames = 3 } = {}) {
  if (!Number.isInteger(lookaheadFrames) || lookaheadFrames < 0 || lookaheadFrames > 3) throw new Error('Invalid proxy look-ahead budget');
  let disposed = false, decoder = null, bytes = null, index = null, uri = '', config = null, busy = false, generation = 0;
  const slots = new Map(), lifetime = new AbortController();
  const clearDecoder = () => {
    generation++;
    for (const slot of slots.values()) { slot.frame?.close(); slot.reject(new Error('Proxy frame cancelled')); }
    slots.clear();
    if (decoder && decoder.state !== 'closed') decoder.close();
    decoder = null;
  };
  const release = () => { clearDecoder(); bytes = null; index = null; uri = ''; config = null; };
  const configure = () => {
    const revision = generation;
    decoder = new VideoDecoder({ output: frame => {
      const slot = revision === generation && !disposed ? slots.get(frame.timestamp) : null;
      if (!slot || slot.frame) { frame.close(); return; }
      slot.frame = frame; slot.resolve(frame);
    }, error: error => { if (revision === generation) for (const slot of slots.values()) slot.reject(error); } });
    decoder.configure(config);
  };
  const requestPacket = packet => {
    let slot = slots.get(packet.timestamp);
    if (slot) return slot;
    slot = { frame: null };
    slot.ready = new Promise((resolve, reject) => { slot.resolve = resolve; slot.reject = reject; });
    // Look-ahead failures are observed on consumption; cancellation may discard
    // an unconsumed slot, so its promise must never become an unhandled rejection.
    slot.ready.catch(() => {});
    slots.set(packet.timestamp, slot);
    try { decoder.decode(new EncodedVideoChunk({ type: 'key', timestamp: packet.timestamp, duration: packet.duration, data: bytes.subarray(packet.offset, packet.offset + packet.size) })); }
    catch (error) { slot.reject(error); }
    return slot;
  };
  const load = async (sourceUri, signal) => {
    const source = new URL(sourceUri, globalThis.location?.href);
    const key = source.pathname.match(/^\/media\/echo-proxies-v2\/([a-f0-9]{64})\/preview\.mp4$/)?.[1];
    if (!key || typeof globalThis.VideoDecoder !== 'function') throw new Error('direct-decoder-unavailable');
    const response = await fetchImpl(new URL(`/api/echos/playback-proxy-frame-index?key=${key}`, source), { signal, cache: 'no-store' });
    if (!response.ok) throw new Error(`direct-index-unavailable-${response.status}`);
    const data = await response.json();
    if (data.schemaVersion !== 'hapa.echo.proxy-frame-index.v1' || data.key !== key || !(data.byteSize > 0 && data.byteSize <= MAX_BYTES) || !/^[a-f0-9]{64}$/.test(data.sha256 || '') || !/^[a-f0-9]+$/i.test(data.description || '') || data.description.length > 2048 || data.description.length % 2 || !Array.isArray(data.packets) || !data.packets.length || data.packets.length > 4096 || ![data.width, data.height].every(n => Number.isInteger(n) && n > 0 && n <= 1280)) throw new Error('direct-index-invalid');
    if (data.packets.some((p, i) => ![p.timestamp, p.duration, p.offset, p.size].every(Number.isSafeInteger) || p.timestamp < 0 || p.duration <= 0 || p.size <= 0 || p.offset < 0 || p.offset + p.size > data.byteSize || (i > 0 && p.timestamp <= data.packets[i - 1].timestamp))) throw new Error('direct-index-packets-invalid');
    config = { codec: data.codec, description: Uint8Array.from(data.description.match(/../g).map(x => parseInt(x, 16))), codedWidth: data.width, codedHeight: data.height, optimizeForLatency: true, hardwareAcceleration };
    if (!(await VideoDecoder.isConfigSupported(config)).supported) throw new Error('direct-codec-unsupported');
    const media = await fetchImpl(source, { signal });
    if (!media.ok || Number(media.headers.get('Content-Length')) !== data.byteSize) throw new Error('direct-proxy-size-mismatch');
    const buffer = await media.arrayBuffer();
    if (buffer.byteLength !== data.byteSize) throw new Error('direct-proxy-size-mismatch');
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(x => x.toString(16).padStart(2, '0')).join('');
    if (digest !== data.sha256) throw new Error('direct-proxy-hash-mismatch');
    if (disposed || signal.aborted) throw new Error('Proxy frame cancelled');
    bytes = new Uint8Array(buffer); index = data; uri = sourceUri;
    configure();
  };
  return {
    async at(cue, songTime, { fps = 30, signal, sourceUri = cue.media.uri } = {}) {
      if (disposed || signal?.aborted) throw new Error('Proxy frame cancelled');
      if (busy) throw new Error('Direct frame already preparing');
      busy = true;
      try {
      const combined = AbortSignal.any([lifetime.signal, ...(signal ? [signal] : []), AbortSignal.timeout(timeoutMs)]);
      if (uri !== sourceUri || !decoder || decoder.state !== 'configured') { release(); await load(sourceUri, combined); }
      const media = cue.media;
      const time = hyperFramesVideoFrameTime({ duration: index.durationSeconds, dataset: { start: cue.startSeconds, mediaStart: media.sourceInSeconds || 0, mediaEnd: media.sourceOutSeconds, logicalDuration: cue.durationSeconds, playbackRate: 1, playbackMode: media.playbackMode || 'once' } }, songTime, fps, media.timeMapping);
      const target = Math.ceil(Math.max(time, index.startSeconds) * 1e6 - 1e-6);
      let lo = 0, hi = index.packets.length;
      while (lo + 1 < hi) { const mid = (lo + hi) >>> 1; if (index.packets[mid].timestamp <= target) lo = mid; else hi = mid; }
      const packet = index.packets[lo];
      // A jump outside the retained window invalidates speculative requests.
      // Reconfigure the decoder, retaining the verified bytes and packet index.
      if (slots.size && !slots.has(packet.timestamp)) { clearDecoder(); configure(); }
      for (const [timestamp, slot] of slots) {
        if (timestamp < packet.timestamp) { slot.frame?.close(); slots.delete(timestamp); }
      }
      const selected = requestPacket(packet);
      for (let i = lo + 1; i <= lo + lookaheadFrames && i < index.packets.length && slots.size < lookaheadFrames + 1; i++) requestPacket(index.packets[i]);
      const frame = await new Promise((resolve, reject) => {
        const abort = () => { release(); reject(new Error('Proxy frame cancelled')); };
        const finish = callback => value => { combined.removeEventListener('abort', abort); callback(value); };
        combined.addEventListener('abort', abort, { once: true });
        if (combined.aborted) { abort(); return; }
        selected.ready.then(finish(resolve), finish(reject));
      });
      if (disposed || combined.aborted) throw new Error('Proxy frame cancelled');
      return { element: frame, receipt: { route: 'decoded-proxy-frame', presentationEvidence: 'webcodecs-decoded-output', sourceTimeSeconds: time, observedTimeSeconds: packet.timestamp / 1e6, sourceOriginSeconds: index.startSeconds, sourceOriginClamped: time < index.startSeconds, songTimeSeconds: songTime, width: index.width, height: index.height, uri: sourceUri, sourceHash: index.sha256, retainedEncodedBytes: bytes.byteLength, retainedFrames: [...slots.values()].filter(slot => slot.frame).length, queuedFrames: [...slots.values()].filter(slot => !slot.frame).length, maxFrames: lookaheadFrames + 1 } };
      } finally { busy = false; }
    },
    reset: release,
    dispose() { if (disposed) return; disposed = true; lifetime.abort(); release(); },
  };
}
