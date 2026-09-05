import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { ByteBoundedLruCache } from "./byte-bounded-lru-cache.mjs";
import { buildEchoMusicPerformance, normalizeEchoPerformanceResource, ECHO_MUSIC_PERFORMANCE_VERSION } from "../src/domain/echo-music-performance.js";

const stable = value => Array.isArray(value) ? value.map(stable) : value && typeof value === "object"
  ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, stable(value[key])])) : value;
const digest = value => crypto.createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

/** Cache the prepared performance layer, independently from costly decoding.
 * Resource keys contain actual analysis values as well as source/settings
 * identity. A lyric-only edit reuses every audio resource. No analyzer is called.
 * Cache files are disposable; corruption is checked by content digest.
 */
export function createEchoPerformanceCache({ root, maxBytes = 64 * 1024 * 1024, maxEntryBytes = 16 * 1024 * 1024, maxDiskEntries = 2048 } = {}) {
  if (!root) throw new Error("Performance cache root is required");
  const cache = new ByteBoundedLruCache({ maxBytes, maxEntryBytes, maxEntries: 64 });
  const inflight = new Map();
  const metrics = { diskHits: 0, memoryHits: 0, builds: 0, corrupt: 0, diskErrors: 0, analysisCalls: 0 };
  let mutation = Promise.resolve();
  const serialize = action => {
    const result = mutation.then(action); mutation = result.catch(() => {}); return result;
  };
  async function prepared(kind, key, build) {
    const id = `${kind}-${key}`;
    const hit = cache.get(id);
    if (hit) { metrics.memoryHits++; return structuredClone(hit.value); }
    if (inflight.has(id)) return structuredClone(await inflight.get(id));
    const work = (async () => {
      const file = path.join(root, `${id}.json`);
      try {
        const info = await fs.stat(file);
        if (info.size > maxEntryBytes) throw new Error("oversize-cache-entry");
        const record = JSON.parse(await fs.readFile(file, "utf8"));
        if (record.key !== key || record.version !== ECHO_MUSIC_PERFORMANCE_VERSION || digest(record.value) !== record.digest) throw new Error("cache-content-mismatch");
        cache.set(id, { value: record.value, size: info.size }); metrics.diskHits++;
        return record.value;
      } catch (error) { if (error.code !== "ENOENT") metrics.corrupt++; }
      const value = build();
      const encoded = JSON.stringify({ version: ECHO_MUSIC_PERFORMANCE_VERSION, key, digest: digest(value), value });
      const size = Buffer.byteLength(encoded);
      if (size > maxEntryBytes) { const error = new Error(`Performance resource exceeds ${maxEntryBytes} byte budget`); error.code = "echo_performance_budget_exceeded"; throw error; }
      metrics.builds++;
      cache.set(id, { value, size });
      await serialize(async () => {
        const temporary = path.join(root, `.${id}-${crypto.randomUUID()}.tmp`);
        try {
          await fs.mkdir(root, { recursive: true });
          await fs.writeFile(temporary, encoded, { flag: "wx" });
          await fs.rename(temporary, file);
          const names = (await fs.readdir(root)).filter(name => /^(?:resource|bundle)-[a-f0-9]{64}\.json$/.test(name));
          if (names.length > maxDiskEntries) {
            const entries = await Promise.all(names.map(async name => ({ name, time: await fs.stat(path.join(root, name)).then(info => info.mtimeMs).catch(() => Infinity) })));
            for (const old of entries.sort((a, b) => a.time - b.time).slice(0, names.length - maxDiskEntries)) {
              if (old.name !== `${id}.json`) await fs.unlink(path.join(root, old.name)).catch(() => {});
            }
          }
        } catch { metrics.diskErrors++; } finally { await fs.rm(temporary, { force: true }).catch(() => {}); }
      });
      return value;
    })();
    inflight.set(id, work);
    try { return structuredClone(await work); } finally { if (inflight.get(id) === work) inflight.delete(id); }
  }
  return {
    async prepare(input = {}) {
      const telemetry = input.telemetry || {};
      // Validate source/lyric identity before using any cached projection.
      const assembled = buildEchoMusicPerformance(input);
      if (assembled.buses.length > 64) throw new Error("Performance bundle exceeds 64 resource budget");
      const resources = [];
      const resourceKeys = [];
      const sources = [...(telemetry.masterMix ? [{ ...telemetry.masterMix, id: "master", role: "master" }] : []), ...(telemetry.stems || [])];
      for (const source of sources) {
        const normalized = normalizeEchoPerformanceResource(source, telemetry);
        const key = digest({ version: ECHO_MUSIC_PERFORMANCE_VERSION, resource: normalized });
        resources.push(await prepared("resource", key, () => normalized)); resourceKeys.push(key);
      }
      const key = digest({ version: ECHO_MUSIC_PERFORMANCE_VERSION, ...assembled, buses: resourceKeys });
      // Bundle manifests refer to content-addressed resources, avoiding duplicate
      // envelope storage for every lyric/cut revision.
      const manifest = await prepared("bundle", key, () => ({ ...assembled, buses: undefined, resourceKeys, fingerprint: `sha256:${key}` }));
      return { ...manifest, buses: resources };
    },
    metrics: () => ({ ...metrics, inflight: inflight.size, memory: cache.telemetry() }),
  };
}
