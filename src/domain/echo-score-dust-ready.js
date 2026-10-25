// Enabling Score Dust is an explicit request to prepare this song locally.
// Reuse Atlas jobs/results; never run transcription or alter a saved cut here.
import { echoLyricHasManualTiming } from "./echo-lyric-sync-safety.js";
const starts = new Map();

export function scoreDustPreviewLyrics({ enabled, currentLines, project, graphLines }) {
  if (enabled && currentLines?.length && !echoLyricHasManualTiming(project)) return currentLines;
  return graphLines?.length ? graphLines : project?.timed_lyrics || [];
}
const structured = (selection) => selection?.run?.beats > 0 && selection.run.sections;
const delay = (ms, signal) => new Promise((resolve, reject) => {
  const abort = () => { clearTimeout(timer); reject(signal.reason || new Error("Preparation stopped")); };
  const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
  signal?.addEventListener("abort", abort, { once: true });
  if (signal?.aborted) abort();
});

export async function ensureScoreDustTimeline(client, songId, { key = songId, signal, onProgress = () => {}, wait = delay, maxPolls = 600 } = {}) {
  const select = () => client.request(`/visual-score-run?songId=${encodeURIComponent(songId)}`, { signal });
  let selection = await select();
  if (structured(selection)) return selection;
  signal?.throwIfAborted();
  onProgress("Preparing this song’s beats and sections in Audio Atlas…");
  // StrictMode/remounts share the dispatched request. Do not abort an ambiguous
  // POST and replay it; Atlas itself owns durable job identity and deduplication.
  if (!starts.has(key)) {
    const pending = client.request("/jobs", { method: "POST", body: JSON.stringify({ songId, beats: true }) });
    starts.set(key, pending);
    pending.finally(() => { if (starts.get(key) === pending) starts.delete(key); }).catch(() => {});
  }
  let job = await starts.get(key);
  for (let i = 0; i < maxPolls; i++) {
    signal?.throwIfAborted();
    if (job.state === "complete") {
      selection = await select();
      if (!structured(selection)) throw new Error("Atlas finished without usable beats and sections. Open Audio Atlas to inspect this song’s result.");
      return selection;
    }
    if (!["queued", "running", "cancelling"].includes(job.state)) throw new Error(job.error || `Audio Atlas preparation ${job.state || "failed"}.`);
    onProgress(`Preparing song timing · ${job.progress?.stage || job.state}. The Atlas job is saved and can be reopened.`);
    await wait(2000, signal);
    job = await client.request(`/jobs/${encodeURIComponent(job.id)}`, { signal });
  }
  throw new Error("Atlas is still preparing this song. Its job is saved; retry to reconnect.");
}
