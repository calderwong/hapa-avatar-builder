import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';

const failure = (code, message, statusCode = 409) => Object.assign(new Error(message), { code, statusCode });
const active = job => ['queued', 'running', 'cancelling'].includes(job.status);

/** One owned process group per stage. No shell, inherited Node eval arguments,
 * or recursive worker entry point. Abort and timeout terminate descendants. */
export function runEchoPreparationStage(command, args, { cwd, signal, onOutput = () => {}, timeoutMs = 600000, killAfterMs = 2000 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(failure('echo_preparation_cancelled', 'Preparation cancelled.')); return; }
    const env = { ...process.env, HAPA_ECHO_PREPARATION_STAGE: '1' };
    delete env.NODE_OPTIONS;
    let child, timer, killTimer, reapTimer, stopped = null, settled = false;
    const kill = sig => {
      if (!child?.pid) return;
      try { process.platform === 'win32' ? child.kill(sig) : process.kill(-child.pid, sig); }
      catch (error) { if (error.code !== 'ESRCH') onOutput(`Process cleanup: ${error.message}`); }
    };
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(reapTimer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const stop = reason => {
      if (stopped || settled) return;
      stopped = reason; kill('SIGTERM');
      killTimer = setTimeout(() => {
        kill('SIGKILL');
        reapTimer = setTimeout(() => finish(reason), killAfterMs);
      }, killAfterMs);
    };
    const abort = () => stop(failure('echo_preparation_cancelled', 'Preparation cancelled.'));
    try {
      child = spawn(command, args, { cwd, env, shell: false, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', chunk => onOutput(String(chunk)));
      child.stderr.on('data', chunk => onOutput(String(chunk)));
      child.once('error', error => finish(error));
      child.once('close', (code, childSignal) => {
        // A killed stage may have descendants after its parent exits.
        if (stopped) kill('SIGKILL');
        finish(stopped || (code === 0 ? null : failure('echo_preparation_stage_failed', `Preparation process exited ${code ?? childSignal}.`)));
      });
      signal?.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => stop(failure('echo_preparation_timeout', 'Preparation exceeded its ten-minute stage limit.')), timeoutMs);
      if (signal?.aborted) abort();
    } catch (error) { kill('SIGKILL'); finish(error); }
  });
}

/** Extends the existing analyzer/preparer. Jobs write only disposable artifacts;
 * cache keys allow retries to reuse completed audio resources after restart. */
export function createEchoPerformancePreparation({ root, runStage = runEchoPreparationStage, maxQueued = 8, maxRetained = 32,
  playbackCacheRoot = path.join(root, 'data/cache/echo-playback-audio'), analysisCacheRoot = path.join(root, 'data/cache/stem-analysis'), performanceCacheRoot = path.join(root, 'data/cache/echo-performance'), jobRoot = path.join(root, 'artifacts/echo-performance-preparation') } = {}) {
  const jobs = new Map(), queue = [];
  const releasing = new Set();
  function releasePlayback(job) {
    if (!job.view.result?.leaseId) return;
    const work = import('./echo-playback-audio.mjs').then(({ releaseEchoPlaybackAudio }) => releaseEchoPlaybackAudio(job.view.result))
      .catch(error => update(job, { releaseError: error.message }));
    releasing.add(work); work.finally(() => releasing.delete(work));
  }
  let current = null, closing = false, runningPromise = Promise.resolve();
  const publicJob = job => {
    if (!job) return null;
    const value = structuredClone(job.view);
    if(value.variantId === 'living-light-assets-v1' || value.variantId === 'living-light-assets-v1:coherent-stems-v1') value.outputTail='';
    if (value.kind === 'playback-audio' && value.result) for (const key of ['path','sourcePath','sourceStamp','outputStamp','leaseId']) delete value.result[key];
    return value;
  };
  const update = (job, value) => Object.assign(job.view, value, { updatedAt: new Date().toISOString() });
  async function perform(job) {
    const { graph, masterPath, kind } = job.input;
    const directory = path.join(jobRoot, job.view.id);
    const graphPath = path.join(directory, 'graph.json'), telemetryPath = path.join(directory, 'telemetry.json');
    const analyzedGraphPath = path.join(directory, 'analyzed-graph.json'), output = path.join(directory, 'performance.json');
    try {
      await fs.mkdir(directory, { recursive: true });
      if (kind === 'playback-audio') {
        update(job, { stage: 'preparing-playback', message: 'Preparing audio for precise seeking.' });
        const { prepareEchoPlaybackAudio } = await import('./echo-playback-audio.mjs');
        const result = await prepareEchoPlaybackAudio({ sourcePath: masterPath, cacheRoot: playbackCacheRoot, signal: job.controller.signal, leaseId: job.view.id });
        if (job.controller.signal.aborted) {
          job.view.result = result; releasePlayback(job);
          throw failure('echo_preparation_cancelled', 'Preparation cancelled.');
        }
        update(job, { status: 'ready', stage: 'complete', message: 'Audio ready for precise seeking.', result: { ...result, sourceUri: job.input.sourceUri, ...(job.input.sourceSelection ? {sourceSelection:job.input.sourceSelection} : {}) } });
        return;
      }
      await fs.writeFile(graphPath, JSON.stringify(graph), { flag: 'wx' });
      const options = { cwd: root, signal: job.controller.signal, onOutput: text => update(job, { outputTail: (job.view.outputTail + text).slice(-4000) }) };
      update(job, { stage: 'analyzing', message: 'Analyzing audio; unchanged resources reuse cached results.' });
      await runStage(process.env.HAPA_PYTHON || 'python3', [path.join(root, 'scripts/build-stem-telemetry-bundle.py'), '--graph', graphPath, '--master', masterPath, '--output', telemetryPath, '--graph-output', analyzedGraphPath, '--cache-dir', analysisCacheRoot], options);
      if (job.controller.signal.aborted) throw failure('echo_preparation_cancelled', 'Preparation cancelled.');
      update(job, { stage: 'publishing', message: 'Verifying source bytes and publishing prepared timing.' });
      await runStage(process.execPath, [path.join(root, 'scripts/prepare-echo-music-performance.mjs'), `--telemetry=${telemetryPath}`, `--graph=${analyzedGraphPath}`, `--master=${masterPath}`, `--output=${output}`, `--cache=${performanceCacheRoot}`], options);
      if (job.controller.signal.aborted) throw failure('echo_preparation_cancelled', 'Preparation cancelled.');
      const receipt = JSON.parse(await fs.readFile(`${output}.receipt.json`, 'utf8'));
      update(job, { status: 'ready', stage: 'complete', message: 'Prepared timing is ready. Alignment confidence is reported separately.', fingerprint: receipt.fingerprint, publication: receipt.publication });
    } catch (error) {
      update(job, { status: job.controller.signal.aborted ? 'cancelled' : 'failed', message: error.message, error: error.code || 'echo_preparation_failed' });
    } finally {
      update(job, { completedAt: new Date().toISOString() });
      job.input = null;
      // The reusable cache and compact receipt survive; duplicate multi-MiB
      // graph/telemetry transport files must not accumulate with every retry.
      await Promise.all(['graph.json', 'telemetry.json', 'analyzed-graph.json', 'performance.json'].map(name => fs.rm(path.join(directory, name), { force: true }).catch(() => {})));
      await fs.writeFile(path.join(directory, 'job.json'), JSON.stringify(job.view)).catch(() => {});
    }
  }
  function pump() {
    if (current || closing) return;
    const job = queue.shift(); if (!job) return;
    current = job; update(job, { status: 'running', startedAt: new Date().toISOString() });
    runningPromise = perform(job).finally(() => { current = null; pump(); });
  }
  return {
    start(input) {
      if (closing) throw failure('echo_preparation_stopping', 'The preparation service is shutting down.', 503);
      if (!input?.songId || !input.masterPath || (input.kind !== 'playback-audio' && !input.graph?.song)) throw failure('echo_preparation_inputs_missing', 'A selected song, exact master and director graph are required.', 422);
      const bytes = JSON.stringify(input);
      // Request-size guard only; stem count is bounded by choosing one stem set per song, not by a cap.
      if (Buffer.byteLength(bytes) > 32 * 1024 * 1024) throw failure('echo_preparation_input_budget', 'Preparation request exceeds 32 MiB.', 422);
      const key = createHash('sha256').update(bytes).digest('hex');
      const existing = [...jobs.values()].find(job => job.view.key === key && active(job.view));
      if (existing) return publicJob(existing);
      if (queue.length >= maxQueued) throw failure('echo_preparation_queue_full', 'The audio preparation queue is full. Retry after a job finishes.', 429);
      for (const [id, job] of jobs) { if (jobs.size < maxRetained) break; if (!active(job.view) && !(job.view.kind === 'playback-audio' && job.view.status === 'ready')) jobs.delete(id); }
      if (jobs.size >= maxRetained) throw failure('echo_preparation_retention_full', 'Close an unused preparation session before starting another.', 429);
      const job = { input: JSON.parse(bytes), controller: new AbortController(), view: { id: randomUUID(), key, kind: input.kind || 'performance', requestId: input.requestId || null, songId: input.songId, variantId: input.variantId || 'legacy', status: 'queued', stage: 'queued', queuedAt: new Date().toISOString(), outputTail: '', message: 'Waiting for the audio analyzer.' } };
      jobs.set(job.view.id, job); if (input.kind === 'playback-audio') queue.unshift(job); else queue.push(job); pump(); return publicJob(job);
    },
    get(id) { return publicJob(jobs.get(id)); },
    getPlaybackReceipt(id) { const job = jobs.get(id); return job?.view.kind === 'playback-audio' && job.view.status === 'ready' ? structuredClone(job.view.result) : null; },
    findRequest(requestId) { return publicJob([...jobs.values()].find(job => job.view.requestId === requestId)); },
    latest(songId, variantId = 'legacy') { return publicJob([...jobs.values()].reverse().find(job => job.view.kind !== 'playback-audio' && job.view.songId === songId && job.view.variantId === variantId)); },
    cancel(id) {
      const job = jobs.get(id); if (!job) return null;
      if (job.view.kind === 'playback-audio' && job.view.status === 'ready') { update(job, { status: 'released', message: 'Playback session released.' }); releasePlayback(job); }
      if (active(job.view)) {
        job.controller.abort();
        const index = queue.indexOf(job);
        if (index >= 0) { queue.splice(index, 1); job.input = null; update(job, { status: 'cancelled', completedAt: new Date().toISOString(), message: 'Preparation cancelled.' }); }
        else update(job, { status: 'cancelling', message: 'Stopping the audio analyzer.' });
      }
      return publicJob(job);
    },
    async close() { closing = true; for (const job of jobs.values()) this.cancel(job.view.id); await runningPromise; await Promise.all([...releasing]); },
  };
}
