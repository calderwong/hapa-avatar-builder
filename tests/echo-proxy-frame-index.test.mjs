import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { prepareEchoPlaybackProxy, readEchoPlaybackProxyFrameIndex } from '../server/echo-playback-proxy.mjs';
import { runEchoPreparationStage } from '../server/echo-performance-preparation.mjs';

test('direct frame index describes only current hash-verified independently coded proxy packets', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-frame-index-')); t.after(() => fs.rm(root, { recursive: true, force: true }));
  const sourcePath = path.join(root, 'source.mp4'), proxyRoot = path.join(root, 'proxies');
  await runEchoPreparationStage('ffmpeg', ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=size=64x48:rate=30', '-t', '0.2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', sourcePath]);
  const original = await fs.readFile(sourcePath);
  const ordinary = await prepareEchoPlaybackProxy({ sourcePath, proxyRoot });
  await assert.rejects(readEchoPlaybackProxyFrameIndex({ proxyRoot, key: ordinary.key }), /unsupported/);
  const proxy = await prepareEchoPlaybackProxy({ sourcePath, proxyRoot, seekOptimized: true });
  const first = await readEchoPlaybackProxyFrameIndex({ proxyRoot, key: proxy.key });
  const warm = await readEchoPlaybackProxyFrameIndex({ proxyRoot, key: proxy.key });
  assert.deepEqual(first, warm); assert.equal(first.sha256, proxy.sha256); assert.equal(first.packets.length, 6);
  assert.equal(first.width, 64); assert.equal(first.height, 48); assert.match(first.codec, /^avc1\.[a-f0-9]{6}$/);
  assert.equal(first.description.slice(0, 2), '01');
  assert.deepEqual(first.packets.map(p => p.timestamp), [0, 33333, 66667, 100000, 133333, 166667]);
  for (const p of first.packets) assert.ok(p.offset >= 0 && p.size > 0 && p.offset + p.size <= first.byteSize);
  const changed = await fs.readFile(proxy.path); changed[changed.length - 1] ^= 1; await fs.writeFile(proxy.path, changed);
  await assert.rejects(readEchoPlaybackProxyFrameIndex({ proxyRoot, key: proxy.key }), /hash-mismatch/);
  await assert.rejects(readEchoPlaybackProxyFrameIndex({ proxyRoot, key: '../source.mp4' }), /key-invalid/);
  assert.deepEqual(await fs.readFile(sourcePath), original);
});
