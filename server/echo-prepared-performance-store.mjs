import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createEchoSourceInspector } from './echo-source-inventory.mjs';
import { normalizeHyperFramesStemRole } from '../src/domain/hyperframes-visualizer-runtime.js';

const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const plainHash = value => String(value || '').replace(/^sha256:/, '');
const error = (code, message) => Object.assign(new Error(message), { code, statusCode: 409 });
async function read(file, limit) {
  if ((await fs.stat(file)).size > limit) throw error('echo_performance_budget_exceeded', 'Prepared performance exceeds the read budget.');
  return JSON.parse(await fs.readFile(file, 'utf8'));
}
async function atomic(file, value) {
  const temporary = file + '.' + randomUUID() + '.tmp';
  try { await fs.writeFile(temporary, JSON.stringify(value), { flag: 'wx' }); await fs.rename(temporary, file); }
  finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
}

/** Publication is a disposable cache, never a mutation of a song or saved cut. */
export async function publishEchoPerformance({ root, bundle, sourceChecks }) {
  if (!/^[a-f0-9]{64}$/.test(plainHash(bundle?.masterAudioHash))) throw error('echo_performance_master_mismatch', 'Publication needs an exact master hash.');
  if (!Array.isArray(sourceChecks) || !bundle.buses?.length || bundle.buses.length > 64 || bundle.buses.some(bus => !sourceChecks.some(source => normalizeHyperFramesStemRole(source.role) === bus.role && source.sha256 === plainHash(bus.audioHash)))) throw error('echo_performance_source_unverified', 'Every published audio bus needs matching source-byte evidence.');
  const value = { bundle, sourceChecks };
  if (Buffer.byteLength(JSON.stringify(value)) > 32 * 1024 * 1024) throw error('echo_performance_budget_exceeded', 'Prepared publication exceeds 32 MiB.');
  const key = digest(value);
  const directory = path.join(root, 'published');
  await fs.mkdir(directory, { recursive: true });
  await atomic(path.join(directory, `${key}.json`), value);
  await atomic(path.join(directory, `master-${plainHash(bundle.masterAudioHash)}.json`), { key });
  const entries = [];
  for (const name of await fs.readdir(directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
    const info = await fs.stat(path.join(directory, name)).catch(() => null);
    if (info) entries.push({ name, bytes: info.size, modified: info.mtimeMs });
  }
  let bytes = entries.reduce((sum, entry) => sum + entry.bytes, 0), count = entries.length;
  for (const entry of entries.sort((a, b) => a.modified - b.modified)) {
    if (bytes <= 2 * 1024 ** 3 && count <= 512) break;
    if (entry.name === `${key}.json`) continue;
    await fs.rm(path.join(directory, entry.name), { force: true });
    bytes -= entry.bytes; count--;
  }
  return { key, masterAudioHash: bundle.masterAudioHash };
}

/** Prepared loads verify the current audio sources. No decoder, analyzer or
 * model is invoked by opening a cut or seeking. Lyrics can rebind independently.
 */
export function createPreparedEchoPerformanceStore({ root, inspect = createEchoSourceInspector().inspect }) {
  const records = new Map();
  return {
    async load({ masterPath, stems = [], lyrics = {} }) {
      const master = await inspect(masterPath);
      if (master.status !== 'bytes-verified' || !master.audioHeaderRecognized) throw error('echo_performance_master_unavailable', 'The selected master audio cannot be verified.');
      let pointer;
      try { pointer = await read(path.join(root, 'published', `master-${master.sha256}.json`), 1024); }
      catch (cause) { if (cause.code === 'ENOENT') throw error('echo_performance_not_prepared', 'This exact master has no prepared performance bundle.'); throw cause; }
      if (!/^[a-f0-9]{64}$/.test(pointer.key || '')) throw error('echo_performance_cache_invalid', 'Prepared performance pointer is invalid.');
      const file = path.join(root, 'published', `${pointer.key}.json`);
      const info = await fs.stat(file).catch(cause => { if (cause.code === 'ENOENT') throw error('echo_performance_not_prepared', 'The prepared entry was evicted; prepare this audio again.'); throw cause; });
      const stamp = `${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`;
      let record = records.get(pointer.key);
      if (!record || record.stamp !== stamp) {
        const value = await read(file, 32 * 1024 * 1024);
        if (digest(value) !== pointer.key) throw error('echo_performance_cache_invalid', 'Prepared performance content hash changed.');
        record = { value, stamp }; records.set(pointer.key, record);
        while (records.size > 2) records.delete(records.keys().next().value);
      }
      const { bundle, sourceChecks } = record.value;
      if (plainHash(bundle.masterAudioHash) !== master.sha256 || bundle.schemaVersion !== 'hapa.echo.music-performance.v1') throw error('echo_performance_master_mismatch', 'Prepared performance does not match the selected master.');
      if (lyrics.audioHash && plainHash(lyrics.audioHash) !== master.sha256) throw error('echo_performance_lyric_master_mismatch', 'Lyrics were aligned against a different master revision.');
      if (!Array.isArray(sourceChecks) || sourceChecks.length > 65) throw error('echo_performance_cache_invalid', 'Prepared source inventory is invalid.');
      for (const source of sourceChecks) {
        const selectedSource = stems.find(stem => normalizeHyperFramesStemRole(stem.stemType || stem.role || stem.title || stem.id) === normalizeHyperFramesStemRole(source.role));
        const current = source.role === 'master' ? master : await inspect(selectedSource?.audioPath || source.path);
        if (current.status !== 'bytes-verified' || current.sha256 !== source.sha256) throw error(selectedSource?.audioPath && selectedSource.audioPath !== source.path ? 'echo_performance_stem_revision_mismatch' : 'echo_performance_source_changed', `Prepared ${source.role} source changed or is unavailable.`);
      }
      // A cut cannot silently replace a stem while retaining old analysis.
      for (const stem of stems) {
        if (!stem.audioPath) continue;
        const role = normalizeHyperFramesStemRole(stem.stemType || stem.role || stem.title || stem.id);
        const buses = bundle.buses.filter(bus => bus.role === role);
        const current = await inspect(stem.audioPath);
        if (buses.length !== 1 || current.status !== 'bytes-verified' || plainHash(buses[0].audioHash) !== current.sha256) throw error('echo_performance_stem_revision_mismatch', `The selected ${role} stem has no matching prepared analysis.`);
      }
      const rebound = { ...structuredClone(bundle), lyrics: structuredClone(lyrics), baseFingerprint: bundle.fingerprint };
      rebound.fingerprint = `sha256:${digest({ base: pointer.key, lyrics })}`;
      return { performance: rebound, sourceValidation: { masterAudioHash: master.sha256, sourcesChecked: sourceChecks.length, analysisExecuted: false, checkedAt: new Date().toISOString() } };
    },
  };
}
