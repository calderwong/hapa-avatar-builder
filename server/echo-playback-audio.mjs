import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createEchoSourceInspector } from './echo-source-inventory.mjs';
import { runEchoPreparationStage } from './echo-performance-preparation.mjs';
import { acquireOwnedFileLock, releaseOwnedFileLock } from './owned-file-lock.mjs';
import { setTimeout as delay } from 'node:timers/promises';

const VERSION = 'hapa.echo.playback-audio.v1';
const stamp = info => [info.size, info.mtimeMs, info.ctimeMs, info.ino].join(':');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const LEASE_SCHEMA = 'hapa.echo.playback-leases.v1';
async function cacheLock(root, signal) {
  const started = Date.now();
  for (;;) {
    if (signal?.aborted) throw new Error('playback-audio-cancelled');
    try { return acquireOwnedFileLock({ lockPath: path.join(root, '.writer.lock'), schemaVersion: 'hapa.echo.playback-audio-lock.v1', staleLegacyMs: 120000 }); }
    catch (error) {
      if (error.code !== 'OWNED_FILE_LOCK_BUSY' || Date.now() - started > 60000) throw error;
      await delay(100, undefined, { signal });
    }
  }
}
async function readLeases(directory) {
  const file = path.join(directory, 'leases.json');
  const stat = await fs.lstat(file).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
  if (!stat) return {};
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error('playback-audio-leases-invalid');
  const value = JSON.parse(await fs.readFile(file, 'utf8'));
  if (value.schemaVersion !== LEASE_SCHEMA || !value.leases || typeof value.leases !== 'object') throw new Error('playback-audio-leases-invalid');
  const live = {};
  for (const [id, lease] of Object.entries(value.leases)) {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(id) || !Number.isSafeInteger(lease.pid) || lease.pid <= 0) throw new Error('playback-audio-leases-invalid');
    try { process.kill(lease.pid, 0); live[id] = lease; }
    catch (error) { if (error.code !== 'ESRCH') live[id] = lease; }
  }
  return live;
}
async function writeLeases(directory, leases) {
  const temporary = path.join(directory, 'leases.json.tmp');
  await fs.writeFile(temporary, JSON.stringify({ schemaVersion: LEASE_SCHEMA, leases }));
  await fs.rename(temporary, path.join(directory, 'leases.json'));
}
async function pin(directory, leaseId) {
  if (!leaseId) return;
  const leases = await readLeases(directory);
  if (Object.keys(leases).length >= 128 && !leases[leaseId]) throw new Error('playback-audio-lease-budget');
  leases[leaseId] = { pid: process.pid, touchedAt: Date.now() };
  await writeLeases(directory, leases);
}
/** Called by the existing preparation queue when its playback job is released. */
export async function releaseEchoPlaybackAudio(receipt) {
  if (!receipt?.leaseId || receipt.schemaVersion !== VERSION) return;
  const directory = path.dirname(receipt.path), root = path.dirname(directory);
  const lock = await cacheLock(root);
  try {
    if (path.basename(directory) !== receipt.key || await fs.realpath(directory) !== directory) throw new Error('playback-audio-release-path-invalid');
    const leases = await readLeases(directory);
    if (leases[receipt.leaseId]?.pid === process.pid) { delete leases[receipt.leaseId]; await writeLeases(directory, leases); }
  } finally { releaseOwnedFileLock(lock); }
}

// Under the writer lock: only verified cache-owned entries with no live reader
// may be removed. Unknown files/leases are retained; originals never live here.
async function reserveCache(root, required, maximum) {
  const candidates = []; let retained = 0;
  for (const name of (await fs.readdir(root)).filter(name => /^[a-f0-9]{64}$/.test(name))) {
    const directory = path.join(root, name), dir = await fs.lstat(directory);
    if (!dir.isDirectory() || dir.isSymbolicLink()) continue;
    const audio = await fs.lstat(path.join(directory, 'audio.wav')).catch(() => null);
    if (!audio?.isFile() || audio.isSymbolicLink()) continue;
    retained += audio.size;
    try {
      const manifestStat = await fs.lstat(path.join(directory, 'manifest.json'));
      if (!manifestStat.isFile() || manifestStat.isSymbolicLink() || manifestStat.size > 65536) continue;
      const manifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
      if (manifest.schemaVersion !== VERSION || manifest.key !== name || manifest.byteSize !== audio.size) continue;
      if (Object.keys(await readLeases(directory)).length) continue;
      candidates.push({ directory, bytes: audio.size, touchedAt: dir.mtimeMs });
    } catch { /* Preserve unknown or damaged entries for explicit diagnosis. */ }
  }
  if (retained + required - candidates.reduce((sum, c) => sum + c.bytes, 0) > maximum) throw new Error('playback-audio-cache-full: close unused Echo playback windows and retry; active audio is protected');
  let evictedEntries = 0;
  for (const candidate of candidates.sort((a, b) => a.touchedAt - b.touchedAt)) {
    if (retained + required <= maximum) break;
    await fs.rm(candidate.directory, { recursive: true }); retained -= candidate.bytes; evictedEntries++;
  }
  return { retainedBytes: retained, evictedEntries };
}
async function command(executable, args, signal) {
  let output = '';
  await runEchoPreparationStage(executable, args, { signal, timeoutMs: 60000,
    onOutput: chunk => { if (output.length < 1024 * 1024) output += chunk; } });
  if (output.length >= 1024 * 1024) throw new Error('playback-audio-process-output-budget');
  return output;
}
async function probe(file, signal) {
  const data = JSON.parse(await command('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries',
    'stream=codec_name,sample_rate,channels,duration:format=duration', '-of', 'json', file], signal));
  const row = data.streams?.[0];
  const sampleRate = Number(row?.sample_rate), channels = Number(row?.channels), durationSeconds = Number(row?.duration ?? data.format?.duration);
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000 || !Number.isInteger(channels) || channels < 1 || channels > 8 || !(durationSeconds > 0 && durationSeconds <= 1800)) throw new Error('playback-audio-format-budget');
  return { codec: row.codec_name, sampleRate, channels, durationSeconds };
}
const pcmHash = async (file, signal) => {
  const output = await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', file, '-map', '0:a:0', '-c:a', 'pcm_f32le', '-f', 'hash', '-hash', 'sha256', '-'], signal);
  const match = output.match(/^SHA256=([a-f0-9]{64})\s*$/);
  if (!match) throw new Error('playback-audio-pcm-proof-missing');
  return match[1];
};

/** Cheap request-time freshness check after content verification at preparation. */
export async function verifyEchoPlaybackAudioReceipt(receipt) {
  try {
    return receipt?.schemaVersion === VERSION && await fs.realpath(receipt.sourcePath) === receipt.sourcePath
      && stamp(await fs.stat(receipt.sourcePath)) === receipt.sourceStamp
      && await fs.realpath(receipt.path) === receipt.path && stamp(await fs.stat(receipt.path)) === receipt.outputStamp;
  } catch { return false; }
}

/** Sample-preserving PCM for precise native seeking. Originals remain authoring
 * truth. The preparation queue serializes work; the lock protects shared caches
 * across API processes. No audio blob is retained by this owner. */
export async function prepareEchoPlaybackAudio({ sourcePath, cacheRoot, signal,
  leaseId, maxEntryBytes = 512 * 1024 ** 2, maxCacheBytes = 2 * 1024 ** 3 } = {}) {
  if (signal?.aborted) throw new Error('playback-audio-cancelled');
  if (leaseId && !/^[a-zA-Z0-9-]{16,80}$/.test(leaseId)) throw new Error('playback-audio-lease-id-invalid');
  if (![maxEntryBytes, maxCacheBytes].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error('playback-audio-cache-budget-invalid');
  const source = await fs.realpath(sourcePath), root = path.resolve(cacheRoot);
  await fs.mkdir(root, { recursive: true });
  const realRoot = await fs.realpath(root);
  if (source === realRoot || source.startsWith(realRoot + path.sep)) throw new Error('playback-cache-cannot-own-source');
  const lock = await cacheLock(realRoot, signal);
  let temporary;
  try {
    const inspector = createEchoSourceInspector();
    const before = await fs.stat(source);
    if (!before.isFile() || before.size > 2 * 1024 ** 3 || before.size === 0) throw new Error('playback-audio-source-budget');
    const identity = await inspector.inspect(source);
    if (identity.status !== 'bytes-verified' || !identity.sha256) throw new Error('playback-audio-source-unverified');
    const original = await probe(source, signal);
    if (Math.ceil(original.durationSeconds * original.sampleRate * original.channels * 4) + 8192 > maxEntryBytes) throw new Error('playback-audio-decoded-size-budget');
    const decoder = (await command('ffmpeg', ['-version'], signal)).split('\n')[0];
    const key = digest({ version: VERSION, sourceHash: identity.sha256, decoder, sampleRate: original.sampleRate, channels: original.channels, codec: 'pcm_f32le' });
    const directory = path.join(realRoot, key), target = path.join(directory, 'audio.wav'), manifestPath = path.join(directory, 'manifest.json');
    const unchanged = async () => { if (stamp(await fs.stat(source)) !== stamp(before)) throw new Error('playback-audio-source-changed'); };
    const existing = await fs.lstat(directory).catch(error => { if (error.code !== 'ENOENT') throw error; return null; });
    if (existing?.isSymbolicLink()) throw new Error('playback-audio-cache-symlink');
    if (existing) {
      const info = await fs.stat(manifestPath);
      if (info.size > 65536) throw new Error('playback-audio-manifest-budget');
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
      const measured = await inspector.inspect(target);
      if (manifest.schemaVersion !== VERSION || manifest.key !== key || manifest.sourceHash !== identity.sha256 || measured.sha256 !== manifest.sha256 || measured.bytes !== manifest.byteSize || manifest.codec !== 'pcm_f32le' || manifest.sampleRate !== original.sampleRate || manifest.channels !== original.channels || manifest.fidelity !== 'source-equivalent-ffmpeg-decoded-float32' || !/^[a-f0-9]{64}$/.test(manifest.pcmSha256 || '')) throw new Error('playback-audio-cache-integrity-failed');
      await unchanged();
      if (measured.bytes > maxEntryBytes) throw new Error('playback-audio-output-budget');
      if (signal?.aborted) throw new Error('playback-audio-cancelled');
      await pin(directory, leaseId);
      await fs.utimes(directory, new Date(), new Date());
      return { ...manifest, leaseId, path: target, sourcePath: source, sourceStamp: stamp(before), outputStamp: stamp(await fs.stat(target)), cached: true };
    }
    const reservedBytes = Math.ceil(original.durationSeconds * original.sampleRate * original.channels * 4) + 8192;
    const cache = await reserveCache(realRoot, reservedBytes, maxCacheBytes);
    temporary = await fs.mkdtemp(path.join(realRoot, '.preparing-'));
    const output = path.join(temporary, 'audio.wav');
    await command('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-i', source, '-map', '0:a:0', '-map_metadata', '-1', '-c:a', 'pcm_f32le', '-threads', '1', output], signal);
    const decoded = await probe(output, signal);
    const sourcePcmSha256 = await pcmHash(source, signal), outputPcmSha256 = await pcmHash(output, signal);
    if (sourcePcmSha256 !== outputPcmSha256 || decoded.codec !== 'pcm_f32le' || decoded.sampleRate !== original.sampleRate || decoded.channels !== original.channels) throw new Error('playback-audio-decoded-samples-changed');
    const measured = await inspector.inspect(output);
    if (!measured.sha256 || measured.bytes > maxEntryBytes) throw new Error('playback-audio-output-budget');
    await unchanged();
    const receipt = { schemaVersion: VERSION, key, status: 'ready', sourceHash: identity.sha256,
      sha256: measured.sha256, pcmSha256: sourcePcmSha256, byteSize: measured.bytes,
      ...decoded, decoder, fidelity: 'source-equivalent-ffmpeg-decoded-float32', maxEntryBytes, maxCacheBytes };
    await fs.writeFile(path.join(temporary, 'manifest.json'), JSON.stringify(receipt, null, 2), { flag: 'wx' });
    if (signal?.aborted) throw new Error('playback-audio-cancelled');
    await fs.rename(temporary, directory); temporary = null;
    await pin(directory, leaseId);
    return { ...receipt, leaseId, cache, path: target, sourcePath: source, sourceStamp: stamp(before), outputStamp: stamp(await fs.stat(target)), cached: false };
  } finally { if (temporary) await fs.rm(temporary, { recursive: true, force: true }); releaseOwnedFileLock(lock); }
}
