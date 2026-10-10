import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { prepareEchoPlaybackAudio, verifyEchoPlaybackAudioReceipt, releaseEchoPlaybackAudio } from '../server/echo-playback-audio.mjs';
import { createEchoPerformancePreparation } from '../server/echo-performance-preparation.mjs';
import { prepareEchoAudioPlayback } from '../src/domain/echo-audio-playback.js';

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-precise-audio-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const samples = Buffer.alloc(4800 * 2 * 4);
  for (let i = 0; i < 4800; i++) {
    samples.writeFloatLE(Math.sin(i * 0.17) * 0.4, i * 8);
    samples.writeFloatLE(Math.cos(i * 0.11) * 0.2, i * 8 + 4);
  }
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + samples.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(3, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(48000, 24); header.writeUInt32LE(48000 * 8, 28); header.writeUInt16LE(8, 32);
  header.writeUInt16LE(32, 34); header.write('data', 36); header.writeUInt32LE(samples.length, 40);
  const sourcePath = path.join(root, 'source.wav'), bytes = Buffer.concat([header, samples]);
  await fs.writeFile(sourcePath, bytes);
  return { root, sourcePath, cacheRoot: path.join(root, 'cache'), bytes, pcmHash: createHash('sha256').update(samples).digest('hex') };
}
async function terminal(service, id) {
  const start = Date.now();
  while (['queued', 'running', 'cancelling'].includes(service.get(id).status)) {
    if (Date.now() - start > 10000) throw new Error('Playback job did not terminate');
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  return service.get(id);
}

test('PCM preparation preserves decoded samples and original bytes; warm use verifies cached output', async t => {
  const f = await fixture(t), cold = await prepareEchoPlaybackAudio(f), warm = await prepareEchoPlaybackAudio(f);
  assert.equal(cold.cached, false); assert.equal(warm.cached, true);
  assert.equal(cold.key, warm.key); assert.equal(cold.pcmSha256, f.pcmHash);
  assert.equal(cold.durationSeconds, 0.1); assert.equal(cold.sampleRate, 48000); assert.equal(cold.channels, 2);
  assert.deepEqual(await fs.readFile(f.sourcePath), f.bytes);
  assert.equal(await verifyEchoPlaybackAudioReceipt(warm), true);
  const output = await fs.open(warm.path, 'r+');
  await output.write(Buffer.from([1]), 0, 1, 80); await output.close();
  assert.equal(await verifyEchoPlaybackAudioReceipt(warm), false);
  await assert.rejects(prepareEchoPlaybackAudio(f), /cache-integrity-failed/);
});

test('source edits invalidate playback; size, cache and abort limits reject without publishing', async t => {
  const f = await fixture(t);
  await assert.rejects(prepareEchoPlaybackAudio({ ...f, maxEntryBytes: 100 }), /decoded-size-budget/);
  await assert.rejects(prepareEchoPlaybackAudio({ ...f, maxCacheBytes: 100 }), /cache-full/);
  await assert.rejects(prepareEchoPlaybackAudio({ ...f, signal: AbortSignal.abort() }), /cancelled/);
  const first = await prepareEchoPlaybackAudio(f);
  const changed = Buffer.from(f.bytes); changed.writeFloatLE(0.7, 44); await fs.writeFile(f.sourcePath, changed);
  assert.equal(await verifyEchoPlaybackAudioReceipt(first), false);
  const second = await prepareEchoPlaybackAudio(f);
  assert.notEqual(first.key, second.key); assert.notEqual(first.pcmSha256, second.pcmSha256);
  assert.equal((await fs.readdir(f.cacheRoot)).some(n => n.startsWith('.preparing-') || n === '.writer.lock'), false);
});

test('existing queue prepares playback without a graph or analysis, pins ready sessions and releases retention', async t => {
  const f = await fixture(t); let analysisCalls = 0;
  const service = createEchoPerformancePreparation({ root: f.root, maxRetained: 1, runStage: async () => { analysisCalls++; } });
  t.after(() => service.close());
  const input = { kind: 'playback-audio', songId: 'song', masterPath: f.sourcePath, sourceUri: 'registry:master', requestId: 'request-0000000001',sourceSelection:{kind:'stem',songId:'song',assetId:'exact-asset',clock:'source-local',alignmentState:'alignment-unverified'} };
  const job = service.start(input), result = await terminal(service, job.id);
  assert.equal(result.status, 'ready', result.message); assert.equal(result.result.pcmSha256, f.pcmHash);
  assert.deepEqual(result.result.sourceSelection,input.sourceSelection);
  assert.equal(result.result.path,undefined);assert.equal(result.result.sourcePath,undefined);assert.equal(result.result.leaseId,undefined);
  assert.equal(service.getPlaybackReceipt(job.id).sourcePath,await fs.realpath(f.sourcePath));
  assert.equal(analysisCalls, 0); assert.equal(service.latest('song'), null);
  assert.equal(service.findRequest(input.requestId).id, job.id);
  assert.throws(() => service.start({ ...input, requestId: 'request-0000000002' }), { code: 'echo_preparation_retention_full' });
  assert.equal(service.cancel(job.id).status, 'released');
  const next = service.start({ ...input, requestId: 'request-0000000002' });
  assert.equal((await terminal(service, next.id)).result.cached, true);
  await service.close(); assert.equal(service.get(next.id).status, 'released');
  assert.equal(service.getPlaybackReceipt(next.id),null);
  const leases = JSON.parse(await fs.readFile(path.join(f.root,'data/cache/echo-playback-audio',result.result.key,'leases.json'), 'utf8'));
  assert.deepEqual(leases.leases, {});
});

test('bounded cache protects both live readers then evicts the released derivative while preserving originals', async t => {
  const f = await fixture(t), budget = 50000;
  const first = await prepareEchoPlaybackAudio({ ...f, maxCacheBytes: budget, leaseId: 'playback-reader-0001' });
  const second = await prepareEchoPlaybackAudio({ ...f, maxCacheBytes: budget, leaseId: 'playback-reader-0002' });
  const otherPath = path.join(f.root, 'other.wav'), other = Buffer.from(f.bytes); other.writeFloatLE(0.8, 44); await fs.writeFile(otherPath, other);
  const next = { ...f, sourcePath: otherPath, maxCacheBytes: budget };
  await assert.rejects(prepareEchoPlaybackAudio(next), /cache-full/);
  await releaseEchoPlaybackAudio(first);
  await assert.rejects(prepareEchoPlaybackAudio(next), /cache-full/);
  assert.equal(await verifyEchoPlaybackAudioReceipt(second), true);
  await releaseEchoPlaybackAudio(second);
  const replacement = await prepareEchoPlaybackAudio(next);
  assert.equal(replacement.cache.evictedEntries, 1);
  await assert.rejects(fs.stat(first.path), { code: 'ENOENT' });
  assert.deepEqual(await fs.readFile(f.sourcePath), f.bytes); assert.deepEqual(await fs.readFile(otherPath), other);
});

test('concurrent preparation shares the locked artifact and abandoned process leases do not pin it forever', async t => {
  const f = await fixture(t);
  const [one, two] = await Promise.all([prepareEchoPlaybackAudio(f), prepareEchoPlaybackAudio(f)]);
  assert.equal(one.key, two.key); assert.deepEqual([one.cached, two.cached].sort(), [false, true]);
  const deadPid = 999999999;
  assert.throws(() => process.kill(deadPid, 0), { code: 'ESRCH' });
  await fs.writeFile(path.join(path.dirname(one.path), 'leases.json'), JSON.stringify({ schemaVersion: 'hapa.echo.playback-leases.v1', leases: { 'dead-reader-0000001': { pid: deadPid } } }));
  const changed = Buffer.from(f.bytes); changed.writeFloatLE(0.9, 44); await fs.writeFile(f.sourcePath, changed);
  const replacement = await prepareEchoPlaybackAudio({ ...f, maxCacheBytes: 50000 });
  assert.equal(replacement.cache.evictedEntries, 1);
});

const selected = 'registry:master';
const result = { sourceUri: selected, sourceHash: 'a'.repeat(64), pcmSha256: 'b'.repeat(64), durationSeconds: 0.1, sampleRate: 48000, channels: 2, byteSize: 38514, fidelity: 'source-equivalent-ffmpeg-decoded-float32' };
const response = value => ({ ok: true, json: async () => value });

test('client follows queue progress, streams the selected master and releases only its own session on exit', async () => {
  const controller = new AbortController(), calls = [], progress = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, ...options });
    return response(options.method === 'POST' ? { id: 'job-one', kind: 'playback-audio', status: 'running', message: 'Preparing' } : { id: 'job-one', status: 'ready', result });
  };
  const prepared = await prepareEchoAudioPlayback({ apiBase: 'http://localhost:1234', songId: 'song', sourceUri: selected, signal: controller.signal, fetchImpl, onProgress: text => progress.push(text), pollMs: 1 });
  assert.equal(prepared.url, 'http://localhost:1234/api/echos/playback-audio?jobId=job-one');
  assert.deepEqual(progress, ['Preparing']); assert.equal(prepared.receipt.pcmSha256, result.pcmSha256);
  controller.abort(); prepared.release(); await Promise.resolve();
  const deletes = calls.filter(c => c.method === 'DELETE');
  assert.equal(deletes.length, 1); assert.match(deletes[0].url, /jobId=job-one$/); assert.equal(deletes[0].signal, undefined);
});

test('client rejects a different master and cancels an interrupted POST by request identity', async () => {
  const calls = [];
  await assert.rejects(prepareEchoAudioPlayback({ songId: 'song', sourceUri: selected, fetchImpl: async (url, options) => {
    calls.push({ url, ...options }); return response({ id: 'wrong', kind: 'playback-audio', status: 'ready', result: { ...result, sourceUri: 'registry:other' } });
  } }), /does not match/);
  await Promise.resolve(); assert.equal(calls.filter(c => c.method === 'DELETE').length, 1);
  const controller = new AbortController(), cancelled = [];
  const pending = prepareEchoAudioPlayback({ songId: 'song', sourceUri: selected, signal: controller.signal, requestId: 'request-0000000003', fetchImpl: (url, options) => {
    cancelled.push({ url, ...options });
    if (options.method === 'DELETE') return Promise.resolve(response({}));
    return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }));
  } });
  controller.abort(); await assert.rejects(pending, /cancelled/); await Promise.resolve();
  assert.equal(cancelled.filter(c => c.method === 'DELETE').length, 1);
  assert.match(cancelled.find(c => c.method === 'DELETE').url, /requestId=request-0000000003$/);
});
