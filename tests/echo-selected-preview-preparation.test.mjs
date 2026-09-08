import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openEchoPreviewPreparation as openService } from '../server/echo-preview-preparation.mjs';
import { prepareEchoPlaybackProxy } from '../server/echo-playback-proxy.mjs';
import { runEchoPreparationStage } from '../server/echo-performance-preparation.mjs';
import { applyEchoPreviewProjection, echoPreviewShotKey, echoPreviewHistoryMediaCue } from '../src/domain/echo-preview-projection.js';

const stamp = value => [value.size, value.mtimeMs, value.ctimeMs, value.ino].join(':');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const services = new Map();
async function openEchoPreviewPreparation(options) {
  const service = await openService(options);
  services.get(options.root)?.push(service); return service;
}
const cue = (id = 'source') => ({ media_id: id, media_uri: `/media/${id}.mp4`, start_sec: 8, end_sec: 9,
  media_contract: { type: 'video', originalUri: `/media/${id}.mp4`, sourceInSeconds: .5, sourceOutSeconds: 1.5, timeMapping: { mode: 'linear', rate: 1 } }, camera_motion: 'pan-left' });
async function temporary(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-selected-preview-'));
  services.set(root, []);
  await fs.mkdir(path.join(root, 'data/media'), { recursive: true });
  t.after(async () => { for (const service of services.get(root)) await service.close(); services.delete(root); await fs.rm(root, { recursive: true, force: true }); }); return root;
}
async function terminal(service, id) {
  for (let n = 0; n < 1000; n++) {
    const job = await service.get(id);
    if (!['queued', 'running', 'cancelling'].includes(job.status)) return job;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error('preview test job did not settle');
}
test('preview projection is cut-scoped, preserves trim/rate, and never mutates the authoring timeline', () => {
  const timeline = [cue()], before = structuredClone(timeline), proxy = { key: 'a'.repeat(64), sha256: 'b'.repeat(64), uri: `/media/echo-proxies-v2/${'a'.repeat(64)}/preview.mp4` };
  const receipt = { songId: 'song', variantId: 'cut-a', items: [{ status: 'ready', shotKey: echoPreviewShotKey(cue()), proxy }] };
  const result = applyEchoPreviewProjection(timeline, receipt, { songId: 'song', variantId: 'cut-a' });
  assert.equal(result[0].runtime_media_uri, proxy.uri);
  assert.equal(result[0].media_contract.sourceInSeconds, .5);
  assert.deepEqual(result[0].media_contract.timeMapping, before[0].media_contract.timeMapping);
  assert.deepEqual(timeline, before);
  assert.equal(applyEchoPreviewProjection(timeline, receipt, { songId: 'song', variantId: 'cut-b' }), timeline);
  const edited = [{ ...cue(), media_contract: { ...cue().media_contract, sourceInSeconds: 1 } }];
  assert.equal(applyEchoPreviewProjection(edited, receipt, { songId: 'song', variantId: 'cut-a' })[0], edited[0]);
  const moved = [{ ...cue(), camera_motion: 'zoom-out' }];
  assert.equal(applyEchoPreviewProjection(moved, receipt, { songId: 'song', variantId: 'cut-a' })[0].camera_motion, 'zoom-out');
});
test('selected cut prepares full source once, survives restart, rejects changed bytes, and repairs corrupt derivatives', async t => {
  const root = await temporary(t), media = path.join(root, 'data/media'), source = path.join(media, 'source.mp4');
  await runEchoPreparationStage('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=320x180:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', source], { timeoutMs: 15000 });
  const sourceHash = hash(await fs.readFile(source));
  const selected = { songId: 'song', variantId: 'cut-a', fingerprint: 'saved-cut-fingerprint', timeline: [cue(), { ...cue(), start_sec: 9, end_sec: 10 }] };
  const before = structuredClone(selected);
  let service = await openEchoPreviewPreparation({ root, loadSelection: async selection => { assert.equal(selection.variantId, 'cut-a'); return selected; } });
  t.after(() => service.close());
  await assert.rejects(openEchoPreviewPreparation({ root, loadSelection: async () => selected }), { statusCode: 503 });
  let job = await terminal(service, (await service.start({ songId: 'song', variantId: 'cut-a' })).id);
  assert.equal(job.status, 'ready'); assert.equal(job.transcoded, 1); assert.equal(job.total, 2);
  assert.equal(job.items[0].proxy.seekOptimized, true);
  assert.equal(job.items[0].proxy.gopSeconds, 1 / 30);
  assert.equal(job.items[0].proxy.durationSeconds, 2); // not the one-second cue length
  assert.equal(job.items[0].sourcePath, undefined);
  assert.deepEqual(selected, before); assert.equal(hash(await fs.readFile(source)), sourceHash);
  assert.equal(await service.latest('song', 'cut-b'), null);
  await service.close();
  service = await openEchoPreviewPreparation({ root, loadSelection: async () => selected });
  assert.equal((await service.latest('song', 'cut-a')).status, 'ready');
  job = await terminal(service, (await service.start({ songId: 'song', variantId: 'cut-a' })).id);
  assert.equal(job.cacheHits, 1); assert.equal(job.transcoded, 0);
  const proxyPath = path.join(media, 'echo-proxies-v2', job.items[0].proxy.key, 'preview.mp4');
  await fs.writeFile(proxyPath, 'broken owned derivative');
  assert.equal((await service.get(job.id)).status, 'stale');
  job = await terminal(service, (await service.start({ songId: 'song', variantId: 'cut-a' })).id);
  assert.equal(job.status, 'ready'); assert.equal(job.transcoded, 1);
  assert.equal(hash(await fs.readFile(source)), sourceHash);
  await fs.appendFile(source, 'changed source');
  assert.equal((await service.get(job.id)).items[0].status, 'stale');
  assert.deepEqual(selected, before);
});
test('serial queue deduplicates selected snapshots, bounds queued work, cancels, and retains restart interruption', async t => {
  const root = await temporary(t);
  let calls = 0;
  const service = await openEchoPreviewPreparation({ root, maxQueued: 1,
    loadSelection: async ({ variantId }) => ({ songId: 'song', variantId, fingerprint: variantId, timeline: [cue()] }),
    prepareProxy: async ({ signal }) => { calls++; await new Promise((resolve, reject) => { if (signal.aborted) reject(new Error('cancelled')); else signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true }); }); },
  });
  t.after(() => service.close());
  const first = await service.start({ variantId: 'first' });
  assert.equal((await service.start({ variantId: 'first' })).id, first.id);
  const second = await service.start({ variantId: 'second' });
  await assert.rejects(service.start({ variantId: 'third' }), { statusCode: 429 });
  assert.equal((await service.cancel(second.id)).status, 'cancelled');
  await service.cancel(first.id); assert.equal((await terminal(service, first.id)).status, 'cancelled');
  assert.ok(calls <= 1);
  await service.close();
  const file = path.join(root, 'data/cache/echo-preview-preparation', `${first.id}.json`);
  const interrupted = JSON.parse(await fs.readFile(file)); interrupted.status = 'running';
  await fs.writeFile(file, JSON.stringify(interrupted));
  const restarted = await openEchoPreviewPreparation({ root, loadSelection: async () => { throw new Error('restart must not read source cuts or spawn encoders'); } });
  t.after(() => restarted.close());
  assert.equal((await restarted.get(first.id)).status, 'interrupted');
});
test('positive video origins survive preview encoding and retain absolute stream end bounds', async t => {
  const root = await temporary(t), source = path.join(root, 'data/media/offset.mp4');
  await runEchoPreparationStage('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:r=30:d=2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-output_ts_offset', '1', source], { timeoutMs: 15000 });
  const before = hash(await fs.readFile(source));
  const options = { sourcePath: source, proxyRoot: path.join(root, 'data/media/echo-proxies-v2') };
  const result = await prepareEchoPlaybackProxy(options);
  assert.equal(result.startSeconds, 1); assert.equal(result.durationSeconds, 3);
  assert.equal(result.settings.sourceOrigin, 'preserved-positive');
  assert.equal(result.settings.copyTimestamps, true);
  assert.equal((await prepareEchoPlaybackProxy(options)).cached, true);
  assert.equal(hash(await fs.readFile(source)), before);
});
test('missing and excluded sources stay on original media, while pre-cancelled encoder creates no proxy', async t => {
  const root = await temporary(t); let called = false;
  const selection = { songId: 'song', variantId: 'cut', fingerprint: 'cut', timeline: [{ ...cue(), provenance: { sourceSystem: 'hapa-dev-proto' } }] };
  const service = await openEchoPreviewPreparation({ root, loadSelection: async () => selection, prepareProxy: async () => { called = true; } });
  t.after(() => service.close());
  const result = await terminal(service, (await service.start({})).id);
  assert.equal(result.status, 'partial'); assert.equal(called, false); assert.equal(result.items[0].proxy, undefined);
  assert.equal(applyEchoPreviewProjection(selection.timeline, result, selection)[0], selection.timeline[0]);
  const controller = new AbortController(); controller.abort();
  const source = path.join(root, 'data/media/source.mp4'); await fs.writeFile(source, 'not a video');
  await assert.rejects(prepareEchoPlaybackProxy({ sourcePath: source, proxyRoot: path.join(root, 'data/media/echo-proxies-v2'), signal: controller.signal }));
  await assert.rejects(fs.stat(path.join(root, 'data/media/echo-proxies-v2')), { code: 'ENOENT' });
});

test('preview selection shares the UI duration projection without changing raw cut timing or trims', async () => {
  const {echoPreviewSelectionInput}=await import('../server/echo-preview-preparation.mjs');
  const {deriveEchoDirectionVariantProject}=await import('../src/domain/echo-direction-variants.js');
  const project={song_id:'song',duration:213.68,timeline:[],visualizer_timeline:[]};
  const variant={id:'cut',timeline:[{...cue(),start_sec:210.7,end_sec:213.7}],visualizer_timeline:[]};
  const before=structuredClone({project,variant});
  const input=echoPreviewSelectionInput({project,variant,songId:'song',variantId:'cut'});
  assert.equal(input.timeline[0].end_sec,213.68);
  const proxy={key:'c'.repeat(64),sha256:'d'.repeat(64),uri:`/media/echo-proxies-v2/${'c'.repeat(64)}/preview.mp4`};
  const job={songId:'song',variantId:'cut',items:[{status:'ready',shotKey:echoPreviewShotKey(input.timeline[0]),proxy}]};
  const displayed=deriveEchoDirectionVariantProject(project,variant);
  const result=applyEchoPreviewProjection(displayed.timeline,job,input);
  assert.equal(result[0].runtime_media_uri,proxy.uri);
  assert.equal(result[0].media_contract.sourceInSeconds,.5);
  assert.equal(result[0].media_contract.sourceOutSeconds,1.5);
  assert.deepEqual({project,variant},before);
  assert.equal(echoPreviewSelectionInput({project,songId:'song'}).timeline,project.timeline);
});

test('the canonical preview API prepares projected selected cues and the proof rejects unapplied video cues', async()=>{
  const api=await fs.readFile(new URL('../server/api.mjs',import.meta.url),'utf8');
  const load=api.slice(api.indexOf('function getEchoPreviewPreparation()'),api.indexOf('function compileEchoDirectorProject('));
  assert.match(load,/return echoPreviewSelectionInput\(\{ project, variant, songId, variantId \}\)/);
  assert.doesNotMatch(load,/timeline: \(variant \|\| project\)\.timeline/);
  const ui=await fs.readFile(new URL('../src/components/EchoPreviewPreparationControl.jsx',import.meta.url),'utf8');
  assert.match(ui,/data-pending-cues=\{pendingCount\}/);
  const proof=await fs.readFile(new URL('../scripts/prove-echo-presentation-timing.cjs',import.meta.url),'utf8');
  assert.match(proof,/control\?\.dataset\.pendingCues==='0'/);
});

test('historical shader input follows the approved visible preview without borrowing another cue rendition', () => {
  const shot = cue(), proxy = { sha256: 'b'.repeat(64), uri: `/media/echo-proxies-v2/${'a'.repeat(64)}/preview.mp4` };
  const preview = applyEchoPreviewProjection([shot], { songId:'song', variantId:'cut', items:[{status:'ready',shotKey:echoPreviewShotKey(shot),proxy}] }, {songId:'song',variantId:'cut'})[0];
  const frame = {startSeconds:8,durationSeconds:1,media:{id:'source',kind:'video',uri:'/media/source.mp4',sourceInSeconds:.5,sourceOutSeconds:1.5,timeMapping:{mode:'linear'}}};
  const before = structuredClone(frame), mapped = echoPreviewHistoryMediaCue(frame,shot,preview);
  assert.equal(mapped.media.uri,proxy.uri); assert.equal(mapped.media.sourceHash,proxy.sha256);
  assert.equal(mapped.media.originalUri,frame.media.uri); assert.match(mapped.media.fidelity,/sampled/);
  assert.equal(mapped.media.sourceInSeconds,.5); assert.deepEqual(mapped.media.timeMapping,frame.media.timeMapping);
  assert.deepEqual(frame,before);
  assert.equal(echoPreviewHistoryMediaCue(frame,{...shot,media_id:'other'},preview),frame);
  assert.equal(echoPreviewHistoryMediaCue(frame,shot,{...preview,start_sec:9}),frame);
  assert.equal(echoPreviewHistoryMediaCue(frame,shot,{...preview,runtime_media_uri:'/other.mp4'}),frame);
});
