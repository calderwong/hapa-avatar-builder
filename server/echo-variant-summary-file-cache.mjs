import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const SCHEMA = "hapa.echo.variant-summary-file-cache.v1";
const hash = (value) => createHash("sha256").update(value).digest("hex");

/**
 * Persistent per-cut-file summaries for the album catalog. A saved cut file is
 * append-only, so it is parsed once: later catalog rebuilds reuse its small
 * summary rows while the file's stat stamp and the song key are unchanged. A
 * song gaining a cut parses only the new file, never all of the song's cuts.
 * The cut files stay authoritative; this cache is disposable.
 */
export function createEchoVariantSummaryFileCache({ cacheRoot, maxSongBytes = 16 * 1024 * 1024, logger = console } = {}) {
  const songs = new Map();
  const fileFor = (songId) => path.join(cacheRoot, `${hash(String(songId))}.json`);

  async function load(songId) {
    if (songs.has(songId)) return songs.get(songId);
    const entry = { entries: new Map(), dirty: false };
    try {
      const saved = JSON.parse(await readFile(fileFor(songId), "utf8"));
      if (saved.schemaVersion === SCHEMA && saved.songId === songId && saved.entries && typeof saved.entries === "object") {
        for (const [name, value] of Object.entries(saved.entries)) if (value && typeof value.stamp === "string" && Array.isArray(value.rows)) entry.entries.set(name, value);
      }
    } catch (error) { if (error.code !== "ENOENT") logger.warn?.("Echo cut summary cache will be rebuilt:", songId, error.message); }
    songs.set(songId, entry);
    return entry;
  }

  return {
    /** Summary rows for one cut file: cached while its stamp and key match, else computed. */
    async rows(songId, name, { stamp, key }, compute) {
      const song = await load(songId);
      const hit = song.entries.get(name);
      if (hit && hit.stamp === stamp && hit.key === key) return hit.rows;
      const rows = await compute();
      song.entries.set(name, { stamp, key, rows });
      song.dirty = true;
      return rows;
    },
    /** Drop entries for removed files and persist the song if it changed. */
    async flush(songId, liveNames) {
      const song = songs.get(songId);
      if (!song) return;
      for (const name of [...song.entries.keys()]) if (!liveNames.has(name)) { song.entries.delete(name); song.dirty = true; }
      if (!song.dirty) return;
      const serialized = JSON.stringify({ schemaVersion: SCHEMA, songId, entries: Object.fromEntries(song.entries) });
      if (Buffer.byteLength(serialized) > maxSongBytes) { logger.warn?.("Echo cut summary cache too large for", songId); return; }
      let temp;
      try {
        await mkdir(cacheRoot, { recursive: true });
        temp = `${fileFor(songId)}.${randomUUID()}.tmp`;
        await writeFile(temp, serialized, { flag: "wx" });
        await rename(temp, fileFor(songId));
        temp = null;
        song.dirty = false;
      } catch (error) {
        logger.warn?.("Echo cut summary cache persistence failed:", songId, error.message);
      } finally { if (temp) await rm(temp, { force: true }).catch(() => {}); }
    },
  };
}
