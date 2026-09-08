import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createEchoProxyFrameDecoder, createEchoProxySourceCache } from '../src/domain/echo-proxy-frame-decoder.js';

function fixture(t, { noOutput = false, corrupt = false, packetCount = 2 } = {}) {
  const frames = [], decoders = [], calls = [], chunks = [], bytes = Uint8Array.from({ length: packetCount * 2 }, (_, i) => i % 256), key = 'a'.repeat(64);
  const previous = { decoder: globalThis.VideoDecoder, chunk: globalThis.EncodedVideoChunk };
  globalThis.EncodedVideoChunk = class { constructor(value) { Object.assign(this, value); } };
  globalThis.VideoDecoder = class {
    static async isConfigSupported() { return { supported: true }; }
    constructor(callbacks) { this.callbacks = callbacks; this.state = 'unconfigured'; decoders.push(this); }
    configure() { this.state = 'configured'; }
    decode(chunk) { chunks.push(chunk); if (!noOutput) queueMicrotask(() => {
      const frame = { timestamp: chunk.timestamp, displayWidth: 2, displayHeight: 2, closed: false, close() { this.closed = true; } }; frames.push(frame); this.callbacks.output(frame);
    }); }
    close() { this.state = 'closed'; }
  };
  t.after(() => { if (previous.decoder) globalThis.VideoDecoder = previous.decoder; else delete globalThis.VideoDecoder; if (previous.chunk) globalThis.EncodedVideoChunk = previous.chunk; else delete globalThis.EncodedVideoChunk; });
  const index = { schemaVersion: 'hapa.echo.proxy-frame-index.v1', key, byteSize: bytes.length, sha256: corrupt ? '0'.repeat(64) : createHash('sha256').update(bytes).digest('hex'), description: '0164101f', codec: 'avc1.64101f', width: 2, height: 2, startSeconds: 0, durationSeconds: packetCount / 30,
    packets: Array.from({ length: packetCount }, (_, i) => ({ offset: i * 2, size: 2, timestamp: Math.round(i * 1e6 / 30), duration: 33333 })) };
  const fetchImpl = async url => { calls.push(String(url)); return String(url).includes('/api/') ? { ok: true, json: async () => index } : { ok: true, headers: new Headers({ 'Content-Length': String(bytes.length) }), arrayBuffer: async () => bytes.slice().buffer }; };
  const cue = { startSeconds: 0, durationSeconds: packetCount / 30, media: { uri: `http://localhost/media/echo-proxies-v2/${key}/preview.mp4`, kind: 'video', sourceInSeconds: 0 } };
  return { frames, decoders, calls, chunks, index, cue, fetchImpl, owner: createEchoProxyFrameDecoder({ fetchImpl }) };
}

test('direct decoder preserves timestamp selection across reverse seeks and closes each replaced frame and decoder', async t => {
  const f = fixture(t); t.after(() => f.owner.dispose());
  const one = await f.owner.at(f.cue, 0), two = await f.owner.at(f.cue, .04);
  assert.equal(one.receipt.observedTimeSeconds, 0); assert.equal(two.receipt.observedTimeSeconds, .033333);
  assert.equal(one.element.closed, true); assert.equal(two.element.closed, false);
  const reversed = await f.owner.at(f.cue, 0);
  assert.equal(two.element.closed, true); assert.equal(reversed.element.timestamp, 0);
  assert.equal(f.calls.length, 2, 'one metadata read and one verified byte fetch per source');
  f.owner.dispose(); assert.ok(f.frames.every(frame => frame.closed)); assert.ok(f.decoders.every(decoder => decoder.state === 'closed'));
  await assert.rejects(f.owner.at(f.cue, 0), /cancelled/);
});

test('direct decoding refuses altered bytes before constructing a decoder', async t => {
  const f = fixture(t, { corrupt: true }); t.after(() => f.owner.dispose());
  await assert.rejects(f.owner.at(f.cue, 0), /hash-mismatch/);
  assert.equal(f.decoders.length, 0);
});

test('aborting an in-flight decode closes its decoder and does not publish a frame', async t => {
  const f = fixture(t, { noOutput: true }); t.after(() => f.owner.dispose());
  const controller = new AbortController(), pending = f.owner.at(f.cue, 0, { signal: controller.signal });
  for (let i = 0; i < 100 && !f.decoders.length; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(f.decoders.length, 1); controller.abort();
  await assert.rejects(pending, /cancelled/); assert.equal(f.decoders[0].state, 'closed'); assert.equal(f.frames.length, 0);
});


test('look-ahead submits a bounded window, reuses decoded frames and releases them while advancing', async t => {
  const f = fixture(t, { packetCount: 12 }); t.after(() => f.owner.dispose());
  for (let n = 0; n < 12; n++) {
    const row = await f.owner.at(f.cue, n / 30);
    assert.equal(row.element.timestamp, Math.round(n * 1e6 / 30));
    assert.ok(row.receipt.retainedFrames + row.receipt.queuedFrames <= 4);
    assert.ok(f.frames.filter(frame => !frame.closed).length <= 4);
    if (n === 0) assert.equal(f.chunks.length, 4, 'decode the next frames before their consumers request them');
  }
  assert.equal(f.chunks.length, 12, 'each sequential source frame decoded once');
  const repeated = await f.owner.at(f.cue, 11 / 30);
  assert.equal(repeated.element.closed, false); assert.equal(f.chunks.length, 12);
  f.owner.dispose(); assert.ok(f.frames.every(frame => frame.closed));
});

test('reverse seek discards pending future output and cannot adopt a stale decoder generation', async t => {
  const f = fixture(t, { packetCount: 12, noOutput: true }); t.after(() => f.owner.dispose());
  const first = f.owner.at(f.cue, 4 / 30);
  for (let i = 0; i < 100 && !f.chunks.length; i++) await new Promise(resolve => setTimeout(resolve, 1));
  assert.equal(f.chunks.length, 4);
  await assert.rejects(f.owner.at(f.cue, 0), /already preparing/);
  const frame = timestamp => ({ timestamp, closed: false, close() { this.closed = true; } });
  const initial = frame(f.chunks[0].timestamp); f.decoders[0].callbacks.output(initial); await first;
  const reverse = f.owner.at(f.cue, 0), stale = frame(0);
  f.decoders[0].callbacks.output(stale);
  assert.equal(initial.closed, true); assert.equal(stale.closed, true);
  const correct = frame(0); f.decoders[1].callbacks.output(correct);
  assert.equal((await reverse).element, correct);
  f.owner.dispose(); assert.equal(correct.closed, true);
});


test('two history decoders lease one verified payload and release frames independently', async t => {
  const f = fixture(t, { packetCount: 12 }), cache = createEchoProxySourceCache({ maxBytes: 48 });
  const a = createEchoProxyFrameDecoder({ fetchImpl: f.fetchImpl, sourceCache: cache });
  const b = createEchoProxyFrameDecoder({ fetchImpl: f.fetchImpl, sourceCache: cache });
  t.after(() => { a.dispose(); b.dispose(); f.owner.dispose(); cache.dispose(); });
  const [first, second] = await Promise.all([a.at(f.cue, 0), b.at(f.cue, 0)]);
  assert.equal(f.calls.length, 2); assert.equal(cache.getDiagnostics().bytes, 24);
  assert.equal(cache.getDiagnostics().leases, 2); assert.notEqual(first.element, second.element);
  a.dispose(); assert.equal(first.element.closed, true); assert.equal(second.element.closed, false);
  assert.equal(cache.getDiagnostics().leases, 1); await b.at(f.cue, 1 / 30);
  b.dispose(); assert.equal(cache.getDiagnostics().leases, 0); cache.dispose(); assert.equal(cache.getDiagnostics().bytes, 0);
});

test('shared source abort cancels only its lease; last pending lease aborts the fetch', async () => {
  const cache = createEchoProxySourceCache({ maxBytes: 10 });
  let complete, upstream;
  const load = (signal, reserve) => { upstream = signal; reserve(8); return new Promise(resolve => { complete = resolve; }); };
  const stop = new AbortController();
  const a = cache.acquire('a', load, { signal: stop.signal }), b = cache.acquire('a', load);
  await Promise.resolve(); stop.abort(); await assert.rejects(a, /cancelled/);
  assert.equal(upstream.aborted, false); complete({ payload: 'same' });
  const lease = await b; assert.equal(lease.value.payload, 'same'); lease.release();
  const stopLast = new AbortController();
  const pending = cache.acquire('b', load, { signal: stopLast.signal }); await Promise.resolve();
  stopLast.abort(); await assert.rejects(pending, /cancelled/); assert.equal(upstream.aborted, true);
  complete({ payload: 'abandoned' }); await Promise.resolve(); cache.dispose(); assert.equal(cache.getDiagnostics().bytes, 0);
});

test('shared byte budget evicts idle payloads and refuses to evict active sources', async () => {
  const cache = createEchoProxySourceCache({ maxBytes: 10, maxEntries: 2 });
  const load = async (_, reserve) => { reserve(6); return { payload: new Uint8Array(6) }; };
  const a = await cache.acquire('a', load);
  await assert.rejects(cache.acquire('b', load), /cache busy/);
  assert.equal(cache.getDiagnostics().bytes, 6); assert.equal(cache.getDiagnostics().leases, 1);
  a.release(); const b = await cache.acquire('b', load); assert.equal(cache.getDiagnostics().evictions, 1);
  assert.ok(cache.getDiagnostics().peakBytes <= 10); b.release(); b.release();
  assert.equal(cache.getDiagnostics().leases, 0); cache.dispose();
});

test('failed shared verification is never reused as a successful payload', async t => {
  const f = fixture(t, { corrupt: true }), cache = createEchoProxySourceCache();
  const owner = createEchoProxyFrameDecoder({ fetchImpl: f.fetchImpl, sourceCache: cache });
  t.after(() => { owner.dispose(); f.owner.dispose(); cache.dispose(); });
  await assert.rejects(owner.at(f.cue, 0), /hash-mismatch/);
  assert.equal(cache.getDiagnostics().bytes, 0); assert.equal(cache.getDiagnostics().entries, 0);
  await assert.rejects(owner.at(f.cue, 0), /hash-mismatch/); assert.equal(f.calls.length, 4);
});


test('closing a shared cache retains honest byte accounting until live leases release', async () => {
  const cache = createEchoProxySourceCache({ maxBytes: 10 });
  const lease = await cache.acquire('a', async (_, reserve) => { reserve(6); return new Uint8Array(6); });
  cache.dispose(); assert.equal(cache.getDiagnostics().bytes, 6);
  await assert.rejects(cache.acquire('b', async () => {}), /cancelled/);
  lease.release(); assert.equal(cache.getDiagnostics().bytes, 0); assert.equal(cache.getDiagnostics().entries, 0);
});
