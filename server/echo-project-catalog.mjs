import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const SCHEMA = "hapa.echo.project-catalog.v1";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const stamp = (info) => `${info.size}:${info.mtimeMs}:${info.ctimeMs}:${info.ino}`;
const safeSegment = (value) => value && path.basename(value) === value && value !== "." && value !== "..";

async function mapBounded(values, concurrency, fn) {
  const result = new Array(values.length);
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, async () => {
    while (cursor < values.length) {
      const index = cursor++;
      result[index] = await fn(values[index], index);
    }
  }));
  return result;
}

/** Persistent, disposable summaries. Project/variant stores remain authoritative.
 * Only stat manifests and the small variant index are inspected on a cache hit.
 * A revision includes every variant's stamp, not just the newest mtime: deleting
 * or editing an older cut must invalidate the song too. No full graphs are kept.
 *
 * With responseBudgetMs, a request never waits for the whole album: when the
 * budget runs out it answers with every finished row, the previous row of each
 * song still refreshing, or (cold cache) a project-only `summarizeLight` row,
 * and reports `pending`. The refresh keeps running and later requests see it.
 */
export function createEchoProjectCatalog({
  projectsRoot, variantsRoot, cacheRoot, summarize, summarizeLight = null, responseBudgetMs = Infinity,
  version = "1", concurrency = 2, maxProjectBytes = 32 * 1024 * 1024,
  maxRowBytes = 64 * 1024, maxCacheBytes = 32 * 1024 * 1024,
  maxRows = 10_000, io = { readFile, readdir, stat }, logger = console,
} = {}) {
  if (typeof summarize !== "function") throw new TypeError("summarize is required");
  const root = path.resolve(projectsRoot);
  const variants = path.resolve(variantsRoot);
  const identity = hash(JSON.stringify([SCHEMA, root, variants, version]));
  const cachePath = path.join(cacheRoot, `${identity}.json`);
  const workers = Math.max(1, Math.min(4, Math.floor(concurrency) || 1));
  let rows = new Map();
  let loaded = false;
  let inFlight;
  let variantIndexCache;
  const invalidations = new Map();

  async function readBounded(file, limit) {
    const info = await io.stat(file);
    if (info.size > limit) throw new Error(`catalog_input_too_large: ${path.basename(file)}`);
    const raw = await io.readFile(file, "utf8");
    if (Buffer.byteLength(raw) > limit) throw new Error("catalog_input_grew_too_large");
    return raw;
  }

  async function loadCache() {
    if (loaded) return;
    loaded = true;
    try {
      const saved = JSON.parse(await readBounded(cachePath, maxCacheBytes));
      if (saved.schemaVersion !== SCHEMA || saved.identity !== identity || !Array.isArray(saved.rows)
        || saved.rows.length > maxRows) throw new Error("invalid_catalog_schema");
      const checked = new Map();
      for (const row of saved.rows) {
        if (!safeSegment(row.file) || !safeSegment(row.songId) || typeof row.revision !== "string"
          || !row.value?.summary?.music_video_project
          || Buffer.byteLength(JSON.stringify(row.value)) > maxRowBytes) throw new Error("invalid_catalog_row");
        checked.set(row.file, row);
      }
      rows = checked;
    } catch (error) {
      if (error.code !== "ENOENT") logger.warn?.("Echo catalog cache will be rebuilt:", error.message);
    }
  }

  async function indexBySong() {
    const indexFile = path.join(variants, "index.json");
    let signature = "missing";
    try { signature = stamp(await io.stat(indexFile)); } catch (error) { if (error.code !== "ENOENT") throw error; }
    if (variantIndexCache?.signature === signature) return variantIndexCache.bySong;
    const bySong = new Map();
    if (signature !== "missing") {
      try {
        const index = JSON.parse(await readBounded(indexFile, 32 * 1024 * 1024));
        if (!Array.isArray(index.variants)) throw new Error("invalid_variant_index");
        const grouped = new Map();
        for (const row of index.variants) {
          const id = row.songId || row.song_id;
          if (!safeSegment(id)) continue;
          if (!grouped.has(id)) grouped.set(id, []);
          grouped.get(id).push(JSON.stringify(row));
        }
        for (const [id, values] of grouped) bySong.set(id, hash(values.sort().join("\n")));
      } catch (error) {
        logger.warn?.("Echo catalog variant metadata unavailable:", error.message);
        bySong.set("*", `invalid:${signature}`);
      }
    }
    variantIndexCache = { signature, bySong };
    return bySong;
  }

  async function revisionFor(file, songId, index) {
    const projectStamp = stamp(await io.stat(path.join(root, file)));
    let names;
    try {
      names = (await io.readdir(path.join(variants, songId), { withFileTypes: true }))
        .filter(entry => entry.isFile() && entry.name.endsWith(".json")).map(entry => entry.name).sort();
    } catch (error) { if (error.code !== "ENOENT") throw error; names = []; }
    const stamps = await mapBounded(names, 8, async name => [name, stamp(await io.stat(path.join(variants, songId, name)))]);
    return hash(JSON.stringify([projectStamp, stamps, index.get(songId) || index.get("*") || "none"]));
  }

  async function lightRow(file) {
    try {
      const payload = JSON.parse(await readBounded(path.join(root, file), maxProjectBytes));
      const songId = payload.music_video_project?.song_id || file.replace(/-video-project\.json$/u, "");
      if (!safeSegment(songId)) return null;
      const value = await summarizeLight({ payload, file, songId });
      return value?.summary?.music_video_project ? value : null;
    } catch { return null; }
  }

  async function refresh(state) {
    await loadCache();
    const started = state.started;
    const index = await indexBySong();
    let entries;
    try { entries = await io.readdir(root, { withFileTypes: true }); }
    catch (error) { if (error.code !== "ENOENT") throw error; entries = []; }
    const files = entries.filter(entry => entry.isFile() && entry.name.endsWith(".json")).map(entry => entry.name).sort();
    if (files.length > maxRows) throw new Error("catalog_row_limit_exceeded");
    state.files = files;
    // Songs never summarized get a project-only row first, so a cold catalog can answer at once.
    if (summarizeLight) await mapBounded(files.filter(file => !rows.has(file)), 8, async file => {
      const value = await lightRow(file);
      if (value) state.light.set(file, value);
    });
    state.listed();
    let rebuilt = 0;
    const errors = state.errors;
    const next = new Map();
    let retainedBytes = 0;
    const retain = (file, row) => {
      const bytes = Buffer.byteLength(JSON.stringify(row));
      if (retainedBytes + bytes > maxCacheBytes - 1024) throw new Error("catalog_memory_budget_exceeded");
      retainedBytes += bytes;
      next.set(file, row);
    };
    const results = await mapBounded(files, workers, async file => {
      const old = rows.get(file);
      let songId = old?.songId || file.replace(/-video-project\.json$/u, "");
      try {
        let revision = await revisionFor(file, songId, index);
        const generation = invalidations.get(songId) || 0;
        if (old?.revision === revision && !generation) { retain(file, old); state.done.set(file, old.value); return old.value; }
        const payload = JSON.parse(await readBounded(path.join(root, file), maxProjectBytes));
        const declaredId = payload.music_video_project?.song_id || songId;
        if (!safeSegment(declaredId)) throw new Error("invalid_song_id");
        if (declaredId !== songId) { songId = declaredId; revision = await revisionFor(file, songId, index); }
        const value = await summarize({ payload, file, songId });
        if (!value?.summary?.music_video_project) throw new Error("invalid_catalog_summary");
        if (Buffer.byteLength(JSON.stringify(value)) > maxRowBytes) throw new Error("catalog_summary_too_large");
        // Never publish a row constructed across an edit. A subsequent request retries it.
        const afterIndex = await indexBySong();
        if (await revisionFor(file, songId, afterIndex) !== revision || (invalidations.get(songId) || 0) !== generation) {
          throw new Error("catalog_source_changed_retry");
        }
        const row = { file, songId, revision, value };
        retain(file, row);
        invalidations.delete(songId);
        rebuilt += 1; state.rebuilt = rebuilt;
        state.done.set(file, value);
        return value;
      } catch (error) {
        errors.push({ file, songId, error: error.message });
        state.done.set(file, null);
        return null;
      }
    });
    const changed = rebuilt > 0 || rows.size !== next.size || errors.length > 0;
    rows = next;
    const values = results.filter(Boolean);
    const summary = values.map(value => value.summary);
    const result = { summary, values, errors, rebuilt, pending: 0, partial: false, cachePath, elapsedMs: performance.now() - started };
    if (changed) {
      let temp;
      try {
        const serialized = JSON.stringify({ schemaVersion: SCHEMA, identity, rows: [...rows.values()] });
        if (Buffer.byteLength(serialized) > maxCacheBytes) throw new Error("catalog_cache_too_large");
        await mkdir(cacheRoot, { recursive: true });
        temp = `${cachePath}.${randomUUID()}.tmp`;
        await writeFile(temp, serialized, { flag: "wx" });
        await rename(temp, cachePath);
      } catch (error) {
        result.persistenceError = error.message;
        logger.warn?.("Echo catalog cache persistence failed:", error.message);
      } finally { if (temp) await rm(temp, { force: true }).catch(() => {}); }
    }
    return result;
  }

  /** What the catalog can serve now, while a refresh is still running. */
  function snapshot(state) {
    const values = [];
    let pending = 0;
    for (const file of state.files || [...rows.keys()]) {
      if (state.done.has(file)) { const value = state.done.get(file); if (value) values.push(value); continue; }
      pending += 1;
      const value = rows.get(file)?.value || state.light.get(file);
      if (value) values.push(value);
    }
    if (!state.files) pending = Math.max(pending, 1);
    return { summary: values.map(value => value.summary), values, errors: [...state.errors], rebuilt: state.rebuilt, pending, partial: true,
      cachePath, elapsedMs: performance.now() - state.started };
  }

  return {
    cachePath,
    // Concurrent clients share work; a disconnect does not abort another client's
    // cache build. HTTP/UI clients can abort their own subscription independently.
    get() {
      if (!inFlight) {
        let listed;
        const state = { files: null, done: new Map(), light: new Map(), errors: [], rebuilt: 0, started: performance.now(), listedPromise: new Promise(resolve => { listed = resolve; }) };
        state.listed = listed;
        inFlight = { state, promise: refresh(state).finally(() => { inFlight = null; }) };
      }
      const { state, promise } = inFlight;
      if (!Number.isFinite(responseBudgetMs)) return promise;
      let timer;
      // A first answer lists every song: it waits for the project-only rows (never for cut files).
      const budget = new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, responseBudgetMs)); });
      return Promise.race([promise, Promise.all([budget, state.listedPromise]).then(() => snapshot(state))])
        .finally(() => clearTimeout(timer));
    },
    invalidate(songId) { invalidations.set(songId, (invalidations.get(songId) || 0) + 1); },
  };
}
