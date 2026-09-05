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
export function createEchoPerformancePreparation({ root, runStage = runEchoPreparationStage, maxQueued = 8, maxRetained = 32 } = {}) {
  const jobs = new Map(), queue = [];
  let current = null, closing = false, runningPromise = Promise.resolve();
  const publicJob = job => job ? structuredClone(job.view) : null;
  const update = (job, value) => Object.assign(job.view, value, { updatedAt: new Date().toISOString() });
  async function perform(job) {
    const { graph, masterPath } = job.input;
    const directory = path.join(root, 'artifacts/echo-performance-preparation', job.view.id);
    const graphPath = path.join(directory, 'graph.json'), telemetryPath = path.join(directory, 'telemetry.json');
    const analyzedGraphPath = path.join(directory, 'analyzed-graph.json'), output = path.join(directory, 'performance.json');
    try {
      await fs.mkdir(directory, { recursive: true });
      await fs.writeFile(graphPath, JSON.stringify(graph), { flag: 'wx' });
      const options = { cwd: root, signal: job.controller.signal, onOutput: text => update(job, { outputTail: (job.view.outputTail + text).slice(-4000) }) };
      update(job, { stage: 'analyzing', message: 'Analyzing audio; unchanged resources reuse cached results.' });
      await runStage(process.env.HAPA_PYTHON || 'python3', [path.join(root, 'scripts/build-stem-telemetry-bundle.py'), '--graph', graphPath, '--master', masterPath, '--output', telemetryPath, '--graph-output', analyzedGraphPath], options);
      if (job.controller.signal.aborted) throw failure('echo_preparation_cancelled', 'Preparation cancelled.');
      update(job, { stage: 'publishing', message: 'Verifying source bytes and publishing prepared timing.' });
      await runStage(process.execPath, [path.join(root, 'scripts/prepare-echo-music-performance.mjs'), `--telemetry=${telemetryPath}`, `--graph=${analyzedGraphPath}`, `--master=${masterPath}`, `--output=${output}`], options);
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
      if (!input?.songId || !input.masterPath || !input.graph?.song) throw failure('echo_preparation_inputs_missing', 'A selected song, exact master and director graph are required.', 422);
      const bytes = JSON.stringify(input);
      if (Buffer.byteLength(bytes) > 32 * 1024 * 1024 || (input.graph.stems?.items?.length || 0) > 32) throw failure('echo_preparation_input_budget', 'Preparation exceeds the graph or stem count budget.', 422);
      const key = createHash('sha256').update(bytes).digest('hex');
      const existing = [...jobs.values()].find(job => job.view.key === key && active(job.view));
      if (existing) return publicJob(existing);
      if (queue.length >= maxQueued) throw failure('echo_preparation_queue_full', 'The audio preparation queue is full. Retry after a job finishes.', 429);
      for (const [id, job] of jobs) { if (jobs.size < maxRetained) break; if (!active(job.view)) jobs.delete(id); }
      const job = { input: JSON.parse(bytes), controller: new AbortController(), view: { id: randomUUID(), key, songId: input.songId, variantId: input.variantId || 'legacy', status: 'queued', stage: 'queued', queuedAt: new Date().toISOString(), outputTail: '', message: 'Waiting for the audio analyzer.' } };
      jobs.set(job.view.id, job); queue.push(job); pump(); return publicJob(job);
    },
    get(id) { return publicJob(jobs.get(id)); },
    latest(songId, variantId = 'legacy') { return publicJob([...jobs.values()].reverse().find(job => job.view.songId === songId && job.view.variantId === variantId)); },
    cancel(id) {
      const job = jobs.get(id); if (!job) return null;
      if (active(job.view)) {
        job.controller.abort();
        const index = queue.indexOf(job);
        if (index >= 0) { queue.splice(index, 1); job.input = null; update(job, { status: 'cancelled', completedAt: new Date().toISOString(), message: 'Preparation cancelled.' }); }
        else update(job, { status: 'cancelling', message: 'Stopping the audio analyzer.' });
      }
      return publicJob(job);
    },
    async close() { closing = true; for (const job of [...queue, ...(current ? [current] : [])]) this.cancel(job.view.id); await runningPromise; },
  };
}
