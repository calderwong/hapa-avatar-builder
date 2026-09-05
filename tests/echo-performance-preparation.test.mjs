import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createEchoPerformancePreparation, runEchoPreparationStage } from '../server/echo-performance-preparation.mjs';

async function fixture(t) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-preparation-')); t.after(() => fs.rm(root, { recursive: true, force: true })); return root; }
async function until(check, timeout = 3000) { const start = Date.now(); while (!check()) { if (Date.now() - start > timeout) throw new Error('condition timeout'); await new Promise(resolve => setTimeout(resolve, 10)); } }
const input = songId => ({ songId, variantId: 'cut-1', masterPath: '/verified/master.wav', graph: { song: { id: songId }, stems: { items: [] } } });

test('preparation deduplicates active input, bounds the queue, cancels queued/running work and preserves source graphs', async t => {
  const root = await fixture(t), calls = [];
  const service = createEchoPerformancePreparation({ root, maxQueued: 1, runStage: async (command, args, options) => {
    calls.push({ command, args }); await new Promise((resolve, reject) => {
      if (options.signal.aborted) reject(new Error('cancelled'));
      else options.signal.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    });
  } });
  t.after(() => service.close());
  const source = input('one'), snapshot = JSON.stringify(source);
  const first = service.start(source), replay = service.start(source);
  assert.equal(first.id, replay.id);
  const second = service.start(input('two'));
  assert.throws(() => service.start(input('three')), { code: 'echo_preparation_queue_full', statusCode: 429 });
  assert.equal(service.cancel(second.id).status, 'cancelled');
  assert.equal(service.latest('one', 'cut-1').id, first.id);
  await until(() => calls.length === 1);
  assert.equal(service.cancel(first.id).status, 'cancelling');
  await until(() => service.get(first.id).status === 'cancelled');
  assert.equal(calls.length, 1, 'cancelled analysis never starts publication');
  assert.equal(JSON.stringify(source), snapshot);
  await service.close();
  assert.equal((await fs.readdir(path.join(root, 'artifacts/echo-performance-preparation', first.id))).includes('graph.json'), false);
  assert.throws(() => service.start(source), { code: 'echo_preparation_stopping' });
});

test('prepared stages are sequential and expose the publication receipt; failures release the next job', async t => {
  const root = await fixture(t), order = [];
  const service = createEchoPerformancePreparation({ root, runStage: async (command, args, options) => {
    order.push(args[0]); options.onOutput('progress\n');
    const output = args.find(arg => arg.startsWith('--output='))?.slice(9);
    if (output) await fs.writeFile(`${output}.receipt.json`, JSON.stringify({ fingerprint: 'verified-test', publication: { key: 'test' } }));
    else if (order.length === 1) throw new Error('fixture analyzer failure');
  } });
  t.after(() => service.close());
  const first = service.start(input('fails')), second = service.start(input('works'));
  await until(() => service.get(second.id).status === 'ready');
  assert.equal(service.get(first.id).status, 'failed');
  assert.equal(service.get(second.id).fingerprint, 'verified-test');
  assert.deepEqual(order.map(file => path.basename(file)), ['build-stem-telemetry-bundle.py', 'build-stem-telemetry-bundle.py', 'prepare-echo-music-performance.mjs']);
  assert.equal(service.get(second.id).outputTail, 'progress\nprogress\n');
  const edited = input('works'); edited.graph.song.lyricOverlay = { lines: ['revision'] };
  assert.notEqual(service.start(edited).key, second.key);
  await service.close();
});

test('owned process stages strip inherited Node options, terminate a resistant child tree, and finish after failed startup', async t => {
  const root = await fixture(t), parent = path.join(root, 'parent.cjs'), descendant = path.join(root, 'descendant.cjs');
  await fs.writeFile(descendant, "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);");
  await fs.writeFile(parent, `const { spawn } = require('node:child_process');\nconst child = spawn(process.execPath, [${JSON.stringify(descendant)}], { stdio: 'ignore' });\nconsole.log(JSON.stringify({ pid: process.pid, child: child.pid, nodeOptions: process.env.NODE_OPTIONS || null, role: process.env.HAPA_ECHO_PREPARATION_STAGE, execArgv: process.execArgv }));\nprocess.on('SIGTERM', () => {}); setInterval(() => {}, 1000);`);
  const controller = new AbortController(); let output = '';
  const result = runEchoPreparationStage(process.execPath, [parent], { cwd: root, signal: controller.signal, onOutput: text => { output += text; }, killAfterMs: 50 });
  await until(() => output.includes('\n'));
  const receipt = JSON.parse(output.trim());
  assert.equal(receipt.nodeOptions, null); assert.equal(receipt.role, '1'); assert.deepEqual(receipt.execArgv, []);
  controller.abort();
  await assert.rejects(result, { code: 'echo_preparation_cancelled' });
  await until(() => { try { process.kill(receipt.pid, 0); return false; } catch (error) { return error.code === 'ESRCH'; } });
  await until(() => { try { process.kill(receipt.child, 0); return false; } catch (error) { return error.code === 'ESRCH'; } });
  await assert.rejects(runEchoPreparationStage(path.join(root, 'does-not-exist'), [], { cwd: root }), { code: 'ENOENT' });
  await assert.rejects(runEchoPreparationStage(process.execPath, [descendant], { cwd: root, timeoutMs: 50, killAfterMs: 50 }), { code: 'echo_preparation_timeout' });
});
