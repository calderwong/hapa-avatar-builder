// Score Dust layer renders, owned by the page rather than by a panel.
//
// A whole-song layer render takes minutes. It used to live in the preview
// overlay's component state, so switching workbench tab, reloading the cut or
// anything else that unmounted the overlay orphaned it: its progress and result
// vanished and Render layer started again from frame 0. Jobs here are keyed by
// the layer's exact score (song, layer, score fingerprint, seed, window); any
// overlay showing that layer reattaches to the running job, and a finished job's
// result is kept until an overlay binds it.

const jobs = new Map();
const listeners = new Map();

/** The identity a render belongs to: exactly what its frames depend on. */
export function echoScoreDustLayerRenderKey(layer) {
  if (!layer?.binding || !layer.window) return "";
  return [layer.songId, layer.layerId, layer.binding.scoreFingerprint, layer.binding.seed, `${layer.window.startUs}-${layer.window.endUs}`].join("|");
}

function emit(key) {
  for (const listener of listeners.get(key) || []) listener(jobs.get(key) || null);
}

function update(key, patch) {
  const job = jobs.get(key);
  if (!job) return;
  jobs.set(key, { ...job, ...patch });
  emit(key);
}

/** The current job for a layer: { key, state: running|done|error|cancelled, progress, message, result? } or null. */
export function echoScoreDustLayerRenderJob(key) {
  return jobs.get(key) || null;
}

/** Follow a layer's job; the listener gets the job (or null) on every change. Returns an unsubscribe. */
export function subscribeEchoScoreDustLayerRender(key, listener) {
  if (!listeners.has(key)) listeners.set(key, new Set());
  listeners.get(key).add(listener);
  return () => {
    listeners.get(key)?.delete(listener);
    if (!listeners.get(key)?.size) listeners.delete(key);
  };
}

/**
 * Start a render for a layer, or return the one already running. `run` gets
 * { signal, report } and resolves with the bindable result; report({ progress,
 * message }) updates every subscriber. With { render, save }, the rendered
 * video is kept on the job between the two phases, so a failed save can be
 * retried without rendering again (retryEchoScoreDustLayerSave).
 */
export function startEchoScoreDustLayerRender(key, run) {
  const current = jobs.get(key);
  if (current?.state === "running") return current;
  if (typeof run === "object") {
    const { render, save } = run;
    return startEchoScoreDustLayerRender(key, async (context) => {
      const rendered = await render(context);
      update(key, { rendered, save });
      return save(rendered, context);
    });
  }
  const controller = new AbortController();
  jobs.set(key, { key, state: "running", progress: 0, message: "Starting the layer render…", controller, startedAt: Date.now() });
  emit(key);
  const report = ({ progress, message } = {}) => {
    if (jobs.get(key)?.controller !== controller) return;
    update(key, { ...(Number.isFinite(progress) ? { progress } : {}), ...(message ? { message } : {}) });
  };
  const owns = () => jobs.get(key)?.controller === controller && jobs.get(key)?.state === "running";
  Promise.resolve()
    .then(() => {
      if (controller.signal.aborted) throw new DOMException("Layer render cancelled", "AbortError");
      return run({ signal: controller.signal, report });
    })
    .then((result) => {
      if (!owns() || controller.signal.aborted) return;
      update(key, { state: "done", progress: 1, result, message: "Rendered. Binding it to the layer…", finishedAt: Date.now() });
    }, (error) => {
      if (!owns()) return;
      update(key, controller.signal.aborted
        ? { state: "cancelled", message: "Layer render cancelled." }
        : { state: "error", message: String(error?.message || error) });
    });
  return jobs.get(key);
}

/** Save a finished render again after its save failed; the frames are not rendered twice. */
export function retryEchoScoreDustLayerSave(key) {
  const job = jobs.get(key);
  if (!job?.rendered || !job.save || job.state === "running" || job.state === "done") return job || null;
  const { rendered, save } = job;
  const next = startEchoScoreDustLayerRender(key, async (context) => save(rendered, context));
  update(key, { rendered, save });
  return next;
}

export function cancelEchoScoreDustLayerRender(key) {
  const job = jobs.get(key);
  if (job?.state !== "running") return;
  job.controller.abort();
  // Cancelled at once; a late result from the aborted render is ignored.
  update(key, { state: "cancelled", message: "Layer render cancelled." });
}

/** Forget a finished job once its result is bound (or dismissed). */
export function clearEchoScoreDustLayerRender(key) {
  const job = jobs.get(key);
  if (!job || job.state === "running") return;
  jobs.delete(key);
  emit(key);
}

/** For tests: drop every job. */
export function resetEchoScoreDustLayerRenders() {
  for (const job of jobs.values()) job.controller?.abort();
  jobs.clear();
  listeners.clear();
}
