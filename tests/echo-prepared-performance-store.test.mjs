import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createPreparedEchoPerformanceStore, publishEchoPerformance } from '../server/echo-prepared-performance-store.mjs';

test('published audio rebinds lyrics without analysis and rejects source revisions or corrupt publications', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-performance-publish-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  // Header-only identity fixtures exercise byte validation, not audio decoding.
  const source = async (name, bytes) => { const file = path.join(root, name); await fs.writeFile(file, bytes); return { path: file, sha256: createHash('sha256').update(bytes).digest('hex') }; };
  const master = await source('master.wav', Buffer.from('RIFF0000WAVE-master-fixture'));
  const stem = await source('vocals.wav', Buffer.from('RIFF0000WAVE-vocal-fixture'));
  const bundle = { schemaVersion: 'hapa.echo.music-performance.v1', masterAudioHash: master.sha256, fingerprint: 'original', lyrics: {},
    buses: [{ role: 'master', audioHash: master.sha256 }, { role: 'vocals', audioHash: stem.sha256 }] };
  const published = await publishEchoPerformance({ root, bundle, sourceChecks: [{ ...master, role: 'master' }, { ...stem, role: 'vocals' }] });
  const store = createPreparedEchoPerformanceStore({ root });
  const input = { masterPath: master.path, stems: [{ stemType: 'vocals', audioPath: stem.path }], lyrics: { audioHash: master.sha256, lines: [] } };
  const loaded = await store.load(input);
  assert.equal(loaded.sourceValidation.analysisExecuted, false);
  assert.deepEqual(loaded.performance.buses, bundle.buses);
  const edited = await store.load({ ...input, lyrics: { ...input.lyrics, lines: [{ text: 'new timing', start: .123, end: .8 }] } });
  assert.notEqual(edited.performance.fingerprint, loaded.performance.fingerprint);
  assert.deepEqual(edited.performance.buses, loaded.performance.buses);
  const alias = path.join(root, 'vocals-alias.wav');
  await fs.rename(stem.path, alias);
  assert.equal((await store.load({ ...input, stems: [{ stemType: 'vocals', audioPath: alias }] })).sourceValidation.analysisExecuted, false);
  await fs.rename(alias, stem.path);
  await assert.rejects(store.load({ ...input, lyrics: { audioHash: 'a'.repeat(64) } }), { code: 'echo_performance_lyric_master_mismatch' });
  await assert.rejects(store.load({ ...input, stems: [{ stemType: 'vocals', audioPath: master.path }] }), { code: 'echo_performance_stem_revision_mismatch' });
  await fs.appendFile(stem.path, 'changed');
  await assert.rejects(store.load(input), { code: 'echo_performance_source_changed' });
  await fs.writeFile(path.join(root, 'published', `${published.key}.json`), JSON.stringify({ bundle: { ...bundle, masterAudioHash: 'b'.repeat(64) }, sourceChecks: [] }));
  await assert.rejects(store.load(input), { code: 'echo_performance_cache_invalid' });
});

test('unprepared masters return an actionable result without decoding', async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'echo-performance-empty-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const store = createPreparedEchoPerformanceStore({ root, inspect: async () => ({ status: 'bytes-verified', audioHeaderRecognized: true, sha256: 'f'.repeat(64) }) });
  await assert.rejects(store.load({ masterPath: 'fixture' }), { code: 'echo_performance_not_prepared' });
});
