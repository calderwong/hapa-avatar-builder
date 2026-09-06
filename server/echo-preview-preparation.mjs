import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { prepareEchoPlaybackProxy } from './echo-playback-proxy.mjs';
import { resolveEchoRuntimeMediaUri } from './echo-runtime-media-route.mjs';
import { echoPreviewShotKey, echoPreviewSourceUri } from '../src/domain/echo-preview-projection.js';
import { hasExcludedEchoDirectorOrigin } from '../src/domain/echo-media-source-policy.js';
import { deriveEchoDirectionVariantProject, echoDirectionVariantFingerprint } from '../src/domain/echo-direction-variants.js';

const busy = job => ['queued', 'running', 'cancelling'].includes(job?.status);
const fail = (message, statusCode = 422) => Object.assign(new Error(message), { statusCode });
const stamp = stat => [stat.size, stat.mtimeMs, stat.ctimeMs, stat.ino].join(':');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

// The UI projects saved cuts to the canonical song duration. Preview keys must
// use that same projection; raw authored tails can be rounded beyond the song.
export function echoPreviewSelectionInput({ project, variant = null, songId, variantId = 'legacy' }) {
  const projected = variant ? deriveEchoDirectionVariantProject(project, variant) : project;
  return { songId, variantId, fingerprint: echoDirectionVariantFingerprint(variant || { timeline: project.timeline }),
    timeline: projected.timeline };
}

function acquireOwner(directory) {
  const database = new DatabaseSync(path.join(directory, 'owner.sqlite'));
  const token = randomUUID(); let released = false;
  try {
    database.exec('PRAGMA busy_timeout=2000; CREATE TABLE IF NOT EXISTS owner (id INTEGER PRIMARY KEY, pid INTEGER NOT NULL, token TEXT NOT NULL); BEGIN IMMEDIATE;');
    const owner = database.prepare('SELECT pid FROM owner WHERE id=1').get();
    if (owner) {
      let alive = true;
      try { process.kill(owner.pid, 0); } catch (error) { if (error.code === 'ESRCH') alive = false; }
      if (alive) throw fail('Preview preparation is owned by another running Builder service.', 503);
    }
    database.prepare('INSERT OR REPLACE INTO owner (id,pid,token) VALUES (1,?,?)').run(process.pid, token);
    database.exec('COMMIT');
  } catch (error) { try { database.exec('ROLLBACK'); } catch {} database.close(); throw error; }
  return () => { if (released) return; released = true; try { database.prepare('DELETE FROM owner WHERE id=1 AND token=?').run(token); } finally { database.close(); } };
}

/** Owns the former song-only preview queue. Serial preparation bounds decoder
 * pressure; atomic disposable receipts survive restart. Retry resolves the
 * current saved cut again and reuses individually verified proxy resources. */
export async function openEchoPreviewPreparation({ root, mediaDir, cacheRoot, loadSelection,
  prepareProxy = prepareEchoPlaybackProxy, maxQueued = 8, maxRetained = 32 } = {}) {
  const directory = path.resolve(cacheRoot || path.join(root, 'data/cache/echo-preview-preparation'));
  const mediaRoot = path.resolve(mediaDir || path.join(root, 'data/media'));
  const jobs = new Map(), queue = [];
  let current = null, closing = false, running = Promise.resolve(), mutation = Promise.resolve();
  await fs.mkdir(directory, { recursive: true });
  const releaseOwner = acquireOwner(directory);
  const jobPath = id => path.join(directory, `${id}.json`);
  async function persist(job) {
    const temporary = `${jobPath(job.id)}.${randomUUID()}.tmp`;
    try { await fs.writeFile(temporary, JSON.stringify(job), { flag: 'wx' }); await fs.rename(temporary, jobPath(job.id)); }
    finally { await fs.rm(temporary, { force: true }); }
  }
  function serial(action) {
    const result = mutation.then(action); mutation = result.catch(() => {}); return result;
  }
  try {
  const entries = (await fs.readdir(directory)).filter(name => /^[a-f0-9-]{36}\.json$/.test(name));
  // Files are owned disposable receipts, never sources or scripts. Keep bounded
  // startup reads and delete only oldest owned receipts beyond retention.
  const ordered = await Promise.all(entries.map(async name => ({ name, stat: await fs.stat(path.join(directory, name)) })));
  ordered.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  for (const { name, stat } of ordered.slice(0, maxRetained).reverse()) {
    if (stat.size > 4 * 1024 * 1024) continue;
    try {
      const job = JSON.parse(await fs.readFile(path.join(directory, name), 'utf8'));
      if (job.schemaVersion !== 'hapa.echo.preview-preparation.v2' || `${job.id}.json` !== name) continue;
      if (busy(job)) { job.status = 'interrupted'; job.message = 'Preparation was interrupted. Retry to reuse completed previews.'; await persist(job); }
      jobs.set(job.id, { view: job, controller: new AbortController(), input: null });
    } catch { /* Corrupt disposable receipts are not execution inputs. */ }
  }
  await Promise.all(ordered.slice(maxRetained).map(({ name }) => fs.rm(path.join(directory, name), { force: true })));
  } catch (error) { releaseOwner(); throw error; }

  async function publicJob(job) {
    if (!job) return null;
    const view = structuredClone(job.view);
    // No decode or hash work on progress reads. Preparation records verified
    // hashes and stat identities; any changed source/derivative is unavailable.
    const checks = new Map();
    for (const item of view.items || []) {
      if (item.status !== 'ready') continue;
      const checkKey = `${item.sourcePath}:${item.proxy?.key}`;
      if (!checks.has(checkKey)) checks.set(checkKey, (async () => {
        try {
          if (!/^[a-f0-9]{64}$/.test(item.proxy?.key || '')) return false;
          const proxyPath = path.join(mediaRoot, 'echo-proxies-v2', item.proxy.key, 'preview.mp4');
          return await fs.realpath(item.declaredPath) === item.sourcePath
            && stamp(await fs.stat(item.sourcePath)) === item.sourceStamp && stamp(await fs.stat(proxyPath)) === item.proxyStamp;
        } catch { return false; }
      })());
      if (!await checks.get(checkKey)) { item.status = 'stale'; item.error = 'Source or preview changed. Retry preparation.'; delete item.proxy; }
      delete item.sourcePath; delete item.declaredPath; delete item.sourceStamp; delete item.proxyStamp;
    }
    if (view.status === 'ready' && view.items.some(item => item.status === 'stale')) {
      view.status = 'stale'; view.message = 'Some preview sources changed. Originals remain in use; retry preparation.';
    }
    return view;
  }
  async function update(job, values) {
    Object.assign(job.view, values, { updatedAt: new Date().toISOString() });
    await persist(job.view);
  }
  async function perform(job) {
    const timer = setTimeout(() => job.controller.abort(), 30 * 60 * 1000);
    try {
      await update(job, { status: 'running', startedAt: new Date().toISOString(), message: 'Preparing the selected cut’s video previews.' });
      const resources = new Map();
      for (const item of job.input) {
        if (job.controller.signal.aborted) throw fail('Preparation cancelled.');
        const row = { shotKey: item.shotKey, status: 'failed' };
        try {
          if (item.excluded) throw fail('Source is excluded by Echo media policy.');
          const route = resolveEchoRuntimeMediaUri(item.uri, { root, mediaDir: mediaRoot });
          if (!route.ok) throw fail(route.reason);
          let resource = resources.get(route.resolvedPath);
          if (!resource) {
            const proxy = await prepareProxy({ sourcePath: route.resolvedPath,
              proxyRoot: path.join(mediaRoot, 'echo-proxies-v2'), signal: job.controller.signal });
            const sourcePath = await fs.realpath(route.resolvedPath);
            if (stamp(await fs.stat(sourcePath)) !== proxy.sourceStamp) throw fail('Source changed after proxy verification.');
            resource = { proxy: { key: proxy.key, status: 'ready', uri: proxy.uri, sha256: proxy.sha256,
              width: proxy.width, height: proxy.height, byteSize: proxy.byteSize, durationSeconds: proxy.durationSeconds,
              sourceHash: proxy.sourceHash, sourceDurationSeconds: proxy.sourceDurationSeconds, fidelity: proxy.fidelity },
              sourcePath, declaredPath: route.resolvedPath, sourceStamp: proxy.sourceStamp, proxyStamp: stamp(await fs.stat(proxy.path)) };
            resources.set(route.resolvedPath, resource);
            job.view.cacheHits += proxy.cached ? 1 : 0; job.view.transcoded += proxy.cached ? 0 : 1;
          }
          Object.assign(row, resource, { status: 'ready' });
        } catch (error) {
          if (job.controller.signal.aborted) throw error;
          row.error = String(error.message).slice(0, 300);
        }
        job.view.items.push(row);
        await update(job, { completed: job.view.items.length, message: `Prepared ${job.view.items.length} of ${job.input.length} video cues.` });
      }
      const failures = job.view.items.filter(row => row.status !== 'ready').length;
      await update(job, { status: failures ? 'partial' : 'ready', failures,
        message: failures ? `${failures} cues keep their original media. Retry preparation to recover unavailable previews.` : 'Selected-cut previews ready. Original media and saved cuts are unchanged.' });
    } catch (error) {
      await update(job, { status: job.controller.signal.aborted ? 'cancelled' : 'failed', message: String(error.message).slice(0, 500) });
    } finally {
      clearTimeout(timer); job.input = null;
      await update(job, { completedAt: new Date().toISOString() });
    }
  }
  function pump() {
    if (current || closing) return;
    const job = queue.shift(); if (!job) return;
    current = job;
    running = perform(job).catch(error => { job.view.status = 'failed'; job.view.message = `Could not persist preparation: ${error.message}`; })
      .finally(() => { current = null; pump(); });
  }
  return {
    start(selection) { return serial(async () => {
      if (closing) throw fail('Preparation service is stopping.', 503);
      const input = await loadSelection(selection);
      if (!input?.songId || !input.fingerprint || !Array.isArray(input.timeline) || input.timeline.length > 4096) throw fail('Selected cut exceeds preview preparation limits.');
      const snapshot = input.timeline.filter(shot => {
        const type = shot.media_contract?.type;
        return shot.media_id !== 'none' && echoPreviewSourceUri(shot) && (type ? type === 'video' : !/\.(png|jpe?g|webp|gif|avif)(?:$|\?)/i.test(echoPreviewSourceUri(shot)));
      }).map(shot => ({ shotKey: echoPreviewShotKey(shot), uri: echoPreviewSourceUri(shot), excluded: hasExcludedEchoDirectorOrigin(shot) }));
      if (Buffer.byteLength(JSON.stringify(snapshot)) > 1024 * 1024) throw fail('Selected cut exceeds preview input budget.');
      const key = digest({ songId: input.songId, variantId: input.variantId, fingerprint: input.fingerprint, snapshot });
      const existing = [...jobs.values()].find(job => job.view.key === key && busy(job.view));
      if (existing) return publicJob(existing);
      if (queue.length >= maxQueued) throw fail('Preview preparation queue is full. Retry after a job finishes.', 429);
      for (const [id, job] of jobs) {
        if (jobs.size < maxRetained) break;
        if (!busy(job.view)) { await fs.rm(jobPath(id), { force: true }); jobs.delete(id); }
      }
      if (jobs.size >= maxRetained) throw fail('Preview preparation retention limit reached.', 429);
      const job = { controller: new AbortController(), input: snapshot, view: {
        schemaVersion: 'hapa.echo.preview-preparation.v2', id: randomUUID(), key,
        songId: input.songId, variantId: input.variantId || 'legacy', sourceFingerprint: input.fingerprint,
        status: 'queued', queuedAt: new Date().toISOString(), total: snapshot.length, completed: 0,
        items: [], cacheHits: 0, transcoded: 0, message: 'Waiting for the preview encoder.' } };
      await persist(job.view); jobs.set(job.view.id, job); queue.push(job); pump(); return publicJob(job);
    }); },
    get(id) { return publicJob(jobs.get(id)); },
    latest(songId, variantId = 'legacy') { return publicJob([...jobs.values()].reverse().find(job => job.view.songId === songId && job.view.variantId === variantId)); },
    cancel(id) { return serial(async () => {
      const job = jobs.get(id); if (!job) return null;
      if (busy(job.view)) {
        job.controller.abort();
        const index = queue.indexOf(job);
        if (index >= 0) { queue.splice(index, 1); job.input = null; await update(job, { status: 'cancelled', message: 'Preparation cancelled.', completedAt: new Date().toISOString() }); }
        // The running owner persists cancellation after its child process exits.
      }
      return publicJob(job);
    }); },
    async close() { closing = true; try { await mutation; for (const job of [...queue, ...(current ? [current] : [])]) await this.cancel(job.view.id); await running; } finally { releaseOwner(); } },
  };
}
