import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createEchoProxyFrameDecoder } from '../src/domain/echo-proxy-frame-decoder.js';

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
  return { frames, decoders, calls, chunks, index, cue, owner: createEchoProxyFrameDecoder({ fetchImpl }) };
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
