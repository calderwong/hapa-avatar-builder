const fs = require('node:fs/promises');
const path = require('node:path');
const { promisify } = require('node:util');
const execFile = promisify(require('node:child_process').execFile);
const { createHash } = require('node:crypto');
const MiB = 1024 * 1024;
const DEFAULT = Object.freeze({ directory: 'Hapa-Avatar-Builder/HellWeek', storeId: 'hapa-avatar-builder-hell-week-v1', maxBytes: 2048 * MiB, maxObjectBytes: 16 * MiB });
const digest = b => createHash('sha256').update(b).digest('hex');
async function treeBytes(root) {
  let total = await fs.stat(root).then(stat => (stat.blocks || 0) * 512).catch(e => { if (e.code === 'ENOENT') return 0; throw e; });
  for (const entry of await fs.readdir(root, { withFileTypes: true }).catch(e => { if (e.code === 'ENOENT') return []; throw e; })) {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw Error('Storage contains an unexpected symbolic link.');
    const stat = await fs.stat(file);
    // Count filesystem allocation (including coarse external clusters) and
    // sparse logical commitments; neither may hide growth from admission.
    total += entry.isDirectory() ? await treeBytes(file) : Math.max(stat.size, (stat.blocks || 0) * 512);
  }
  return total;
}
async function probe(config) {
  const { stdout } = await execFile('/usr/sbin/diskutil', ['info', '-plist', config.mount], { timeout: 10000 });
  const value = key => stdout.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]+)</string>`))?.[1];
  if (value('VolumeUUID') !== config.volumeUUID || value('MountPoint') !== config.mount || !/<key>Internal<\/key>\s*<false\/>/.test(stdout) || !/<key>WritableVolume<\/key>\s*<true\/>/.test(stdout)) throw Error('Artwork held: the registered external drive is unavailable, changed, or read-only.');
  const info = await fs.statfs(config.mount);
  if (info.bavail * info.bsize < 100 * 1024 ** 3 + config.maxObjectBytes) throw Error('Artwork held: external drive safety reserve reached.');
}
// One shared engine worker.lock serializes all production callers. Reservations
// survive process loss and are reused by call ID; no output is copied per retry.
function createHellWeekStorage({ config, configFile, probeImpl = probe, readFileImpl = fs.readFile, readTimeoutMs = 15000 } = {}) {
  if (!config && configFile) { try { config = JSON.parse(require('node:fs').readFileSync(configFile, 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
  config = { ...DEFAULT, ...config };
  const root = config.mount ? path.join(config.mount, config.directory) : null;
  const marker = { storeId: config.storeId, volumeUUID: config.volumeUUID, maxBytes: config.maxBytes, maxObjectBytes: config.maxObjectBytes };
  // A blocked OS open cannot always be cancelled. Retain the pending read and
  // refuse new reads after a timeout so repeated UI retries cannot fill the pool.
  let stalledRead = null;
  async function readExternal(file, encoding) {
    if (stalledRead) throw Error('Artwork held: external drive read is still unresponsive. Restore drive access before resuming.');
    let timer;
    const pending = Promise.resolve().then(() => readFileImpl(file, encoding));
    pending.then(() => { if (stalledRead === pending) stalledRead = null; }, () => { if (stalledRead === pending) stalledRead = null; });
    try {
      return await Promise.race([pending, new Promise((_, reject) => {
        timer = setTimeout(() => {
          stalledRead = pending;
          reject(Error('Artwork held: external drive read timed out. Saved results are retained; restore drive access before resuming.'));
        }, readTimeoutMs);
      })]);
    } finally { clearTimeout(timer); }
  }
  async function access() {
    if (!root || !config.volumeUUID) throw Error('Configure the registered external artwork store before generation.');
    await probeImpl(config); // Must precede mkdir: never create a missing mount lookalike.
    await fs.mkdir(root, { recursive: true });
    if (await fs.realpath(root) !== root) throw Error('Artwork store path must not be redirected.');
    const file = path.join(root, 'store.json');
    try { await fs.writeFile(file, JSON.stringify(marker), { flag: 'wx' }); }
    catch (e) { if (e.code !== 'EEXIST') throw e; }
    if (JSON.stringify(JSON.parse(await readExternal(file, 'utf8'))) !== JSON.stringify(marker)) throw Error('Artwork store identity or budget changed.');
  }
  async function preflight() {
    await access();
    if (await treeBytes(root) + config.maxObjectBytes + Math.max(64 * 1024, Math.ceil(config.maxObjectBytes / 4)) > config.maxBytes) throw Error('Artwork store reached its shared byte ceiling.');
  }
  async function reserve(callId) {
    await preflight();
    // The global worker permits only one in-flight image, across all saved runs.
    await fs.writeFile(path.join(root, 'reservation.json'), JSON.stringify({ callId, bytes: config.maxObjectBytes, at: new Date().toISOString() }));
  }
  async function put(bytes, callId) {
    if (bytes.length > config.maxObjectBytes) throw Error('Artwork exceeds the admitted 16 MiB object limit.');
    await preflight();
    const reservation = JSON.parse(await readExternal(path.join(root, 'reservation.json'), 'utf8'));
    if (reservation.callId !== callId) throw Error('Artwork reservation ownership changed.');
    const sha256 = digest(bytes), relativePath = `objects/${sha256}.png`, file = path.join(root, relativePath);
    await fs.mkdir(path.dirname(file), { recursive: true });
    try { const existing = await readExternal(file); if (digest(existing) !== sha256) throw Error('External artwork digest mismatch.'); }
    catch (e) {
      if (e.code !== 'ENOENT') throw e;
      const temp = `${file}.part`;
      try {
        const h = await fs.open(temp, 'wx');
        try { await h.writeFile(bytes); await h.sync(); } finally { await h.close(); }
      } catch (e) { if (e.code !== 'EEXIST') throw e; }
      if (digest(await readExternal(temp)) !== sha256) throw Error('Interrupted external object requires review; retained without overwrite.');
      await fs.rename(temp, file);
    }
    const storage = { kind: 'external-object', ...marker, relativePath, path: file, sha256, bytes: bytes.length };
    await read(storage);
    await fs.writeFile(path.join(root, 'reservation.json'), JSON.stringify({ callId, bytes: 0, committed: sha256 }));
    return storage;
  }
  async function read(storage) {
    await probeImpl(config);
    if (storage.storeId !== config.storeId || storage.volumeUUID !== config.volumeUUID || !/^[a-f0-9]{64}$/.test(storage.sha256) || storage.relativePath !== `objects/${storage.sha256}.png`) throw Error('Invalid external artwork reference.');
    const file = path.join(root, storage.relativePath);
    if (await fs.realpath(file) !== file) throw Error('Artwork path was redirected.');
    const bytes = await readExternal(file);
    if (bytes.length !== storage.bytes || digest(bytes) !== storage.sha256) throw Error('External artwork digest mismatch.');
    return bytes;
  }
  return { access, preflight, reserve, put, read, root, config };
}
module.exports = { createHellWeekStorage, treeBytes, DEFAULT };
