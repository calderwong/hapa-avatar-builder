import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createEchoProjectCatalog } from "../server/echo-project-catalog.mjs";

async function fixture(t, overrides = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "echo-catalog-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const projectsRoot = path.join(root, "projects");
  const variantsRoot = path.join(root, "variants");
  const cacheRoot = path.join(root, "cache");
  await fs.mkdir(projectsRoot); await fs.mkdir(variantsRoot);
  const calls = [], reads = [];
  const write = (songId, title = songId) => fs.writeFile(path.join(projectsRoot, `${songId}-video-project.json`), JSON.stringify({ music_video_project: { song_id: songId, song_title: title, timeline: [{ heavy: "x".repeat(10_000) }] } }));
  await write("a"); await write("b");
  const options = { projectsRoot, variantsRoot, cacheRoot, logger: { warn() {} },
    io: { ...fs, readFile: async (...args) => { reads.push(args[0]); return fs.readFile(...args); } },
    summarize: async ({ payload, songId }) => {
      calls.push(songId);
      return { summary: { music_video_project: { song_id: songId, song_title: payload.music_video_project.song_title } } };
    }, ...overrides };
  return { root, projectsRoot, variantsRoot, cacheRoot, options, write, calls, reads, catalog: createEchoProjectCatalog(options) };
}

test("warm and process-cold indexed catalog reads zero full projects; edits rebuild only one song", async t => {
  const f = await fixture(t);
  assert.equal((await f.catalog.get()).rebuilt, 2);
  f.calls.length = 0; f.reads.length = 0;
  assert.equal((await f.catalog.get()).rebuilt, 0);
  assert.equal(f.reads.length, 0);
  const cold = createEchoProjectCatalog(f.options);
  assert.equal((await cold.get()).rebuilt, 0);
  assert.equal(f.reads.filter(file => file.startsWith(f.projectsRoot)).length, 0);
  await f.write("b", "changed");
  const changed = await cold.get();
  assert.equal(changed.rebuilt, 1);
  assert.deepEqual(f.calls, ["b"]);
  assert.equal(changed.summary[1].music_video_project.song_title, "changed");
  assert.ok((await fs.stat(cold.cachePath)).size < 2000, "no timelines are retained in disk summaries");
});

test("per-song variant revisions include edits, deletion and older files; unrelated index rewrites do not rebuild every song", async t => {
  const f = await fixture(t);
  await fs.mkdir(path.join(f.variantsRoot, "a"));
  const file = path.join(f.variantsRoot, "a/old-cut.json");
  await fs.writeFile(file, "{}");
  await f.catalog.get();
  await fs.writeFile(file, '{"changed":true}');
  assert.equal((await f.catalog.get()).rebuilt, 1);
  await fs.rm(file);
  assert.equal((await f.catalog.get()).rebuilt, 1);
  await fs.writeFile(path.join(f.variantsRoot, "index.json"), JSON.stringify({ variants: [{ songId: "b", id: "new-cut" }] }));
  f.calls.length = 0;
  assert.equal((await f.catalog.get()).rebuilt, 1);
  assert.deepEqual(f.calls, ["b"]);
  await fs.writeFile(path.join(f.variantsRoot, "index.json"), JSON.stringify({ variants: [{ songId: "b", id: "new-cut" }], updatedAt: "later" }));
  assert.equal((await f.catalog.get()).rebuilt, 0);
});

test("concurrent clients share one bounded rebuild; explicit invalidation affects one row", async t => {
  const f = await fixture(t);
  let active = 0, peak = 0;
  const catalog = createEchoProjectCatalog({ ...f.options, concurrency: 1, summarize: async input => {
    peak = Math.max(peak, ++active);
    await new Promise(resolve => setTimeout(resolve, 5));
    const value = await f.options.summarize(input);
    active--; return value;
  } });
  const results = await Promise.all(Array.from({ length: 20 }, () => catalog.get()));
  assert.equal(f.calls.length, 2);
  assert.equal(peak, 1);
  assert.ok(results.every(result => result === results[0]));
  catalog.invalidate("a");
  assert.equal((await catalog.get()).rebuilt, 1);
});

test("corrupt cache recovers; corrupt project is reported without publishing stale cut; additions and removals reconcile", async t => {
  const f = await fixture(t);
  await f.catalog.get();
  await fs.writeFile(f.catalog.cachePath, "{broken");
  const next = createEchoProjectCatalog(f.options);
  assert.equal((await next.get()).rebuilt, 2);
  await fs.writeFile(path.join(f.projectsRoot, "a-video-project.json"), "{broken");
  const partial = await next.get();
  assert.equal(partial.summary.length, 1);
  assert.equal(partial.errors[0].songId, "a");
  await f.write("a", "repaired"); await f.write("c");
  await fs.rm(path.join(f.projectsRoot, "b-video-project.json"));
  assert.deepEqual((await next.get()).summary.map(row => row.music_video_project.song_id), ["a", "c"]);
});

test("an edit during summary work is not cached under the old revision", async t => {
  const f = await fixture(t);
  let once = false;
  const catalog = createEchoProjectCatalog({ ...f.options, summarize: async input => {
    if (!once && input.songId === "a") { once = true; await f.write("a", "new revision"); }
    return f.options.summarize(input);
  } });
  const first = await catalog.get();
  assert.equal(first.errors[0].error, "catalog_source_changed_retry");
  assert.equal(first.summary.some(row => row.music_video_project.song_id === "a"), false);
  const next = await catalog.get();
  assert.equal(next.summary[0].music_video_project.song_title, "new revision");
});

test("bounded inputs and failed persistence preserve other usable rows", async t => {
  const f = await fixture(t, { maxProjectBytes: 5 });
  const oversized = await f.catalog.get();
  assert.equal(oversized.summary.length, 0);
  assert.equal(oversized.errors.length, 2);
  const blockedCache = path.join(f.root, "not-a-directory");
  await fs.writeFile(blockedCache, "occupied");
  const catalog = createEchoProjectCatalog({ ...f.options, maxProjectBytes: 32_000, cacheRoot: blockedCache });
  const result = await catalog.get();
  assert.equal(result.summary.length, 2);
  assert.ok(result.persistenceError);
  assert.equal((await catalog.get()).rebuilt, 0);
});
