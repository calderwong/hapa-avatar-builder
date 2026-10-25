import test from "node:test";
import assert from "node:assert/strict";
import { ensureScoreDustTimeline, scoreDustPreviewLyrics } from "../src/domain/echo-score-dust-ready.js";
const ready = { run: { id: "beat-run", beats: 400, sections: true } };
const missing = { run: { id: "lyric-run", beats: 0, sections: false } };

test("existing musical analysis is reused without starting a job", async () => {
  const calls = [];
  const result = await ensureScoreDustTimeline({ request: async (...args) => { calls.push(args); return ready; } }, "song");
  assert.equal(result, ready); assert.equal(calls.length, 1);
});
test("lyric-only results trigger one local beat analysis then select its musical timeline", async () => {
  let selects = 0; const calls = [], progress = [];
  const client = { request: async (route, options) => {
    calls.push([route, options]);
    if (route.startsWith("/visual-score-run")) return ++selects === 1 ? missing : ready;
    if (route === "/jobs") return { id: "new", state: "running" };
    return { id: "new", state: "complete" };
  } };
  assert.equal(await ensureScoreDustTimeline(client, "song", { wait: async () => {}, onProgress: x => progress.push(x) }), ready);
  assert.deepEqual(JSON.parse(calls.find(([r]) => r === "/jobs")[1].body), { songId: "song", beats: true });
  assert.ok(progress.length); assert.equal(selects, 2);
});
test("simultaneous mounts share an in-flight preparation dispatch", async () => {
  let posts = 0, release;
  const pending = new Promise(resolve => { release = resolve; });
  let complete = false;
  const client = { request: async route => {
    if (route.startsWith("/visual-score-run")) return complete ? ready : missing;
    posts++; await pending; return { state: "complete" };
  } };
  const a = ensureScoreDustTimeline(client, "shared"), b = ensureScoreDustTimeline(client, "shared");
  await new Promise(resolve => setImmediate(resolve)); complete = true; release();
  await Promise.all([a, b]); assert.equal(posts, 1);
});
test("failure, abort and polling expiry do not silently qualify a fallback or retry writes", async () => {
  for (const state of ["failed", "running", "complete"]) {
    let posts = 0;
    const client = { request: async route => {
      if (route.startsWith("/visual-score-run")) return missing;
      if (route === "/jobs") posts++;
      return { id: "job", state, error: state === "failed" ? "Beat model missing" : null };
    } };
    await assert.rejects(ensureScoreDustTimeline(client, state, { maxPolls: 1, wait: async () => {} }));
    assert.equal(posts, 1);
  }
  const controller = new AbortController(); controller.abort(); let posts = 0;
  await assert.rejects(ensureScoreDustTimeline({ request: async route => { if (route === "/jobs") posts++; return missing; } }, "aborted", { signal: controller.signal }));
  assert.equal(posts, 0);
});
test("current lyric timing replaces stale cut timing only in Score Dust preview, preserving locks and source", () => {
  const old = [{ start: 6, text: "Hey Brother" }], current = [{ start: 12.18, text: "Hey Brother" }];
  const project = { timed_lyrics: old };
  assert.equal(scoreDustPreviewLyrics({ enabled: true, currentLines: current, project, graphLines: old }), current);
  assert.equal(scoreDustPreviewLyrics({ enabled: false, currentLines: current, project, graphLines: old }), old);
  assert.equal(scoreDustPreviewLyrics({ enabled: true, currentLines: current, project: { ...project, lyric_timing_manual_edit: true }, graphLines: old }), old);
  assert.equal(project.timed_lyrics, old);
});
