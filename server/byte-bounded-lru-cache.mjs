function boundedPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/**
 * A small Map-compatible LRU used for parsed JSON trees whose in-memory size
 * is materially larger than their source files. The source byte count is a
 * conservative, deterministic budget signal; callers can supply a different
 * sizeOf function when they have a better measurement.
 */
export class ByteBoundedLruCache {
  constructor({
    maxBytes,
    maxEntries,
    maxEntryBytes = maxBytes,
    sizeOf = (value) => value?.size,
  } = {}) {
    this.maxBytes = boundedPositiveInteger(maxBytes, 64 * 1024 * 1024);
    this.maxEntries = boundedPositiveInteger(maxEntries, 64);
    this.maxEntryBytes = Math.min(
      this.maxBytes,
      boundedPositiveInteger(maxEntryBytes, this.maxBytes),
    );
    this.sizeOf = sizeOf;
    this.entries = new Map();
    this.bytes = 0;
    this.evictions = 0;
    this.oversizeSkips = 0;
  }

  get size() {
    return this.entries.size;
  }

  get(key) {
    if (!this.entries.has(key)) return undefined;
    const value = this.entries.get(key);
    // Reinsert so Map order remains least-recently-used to most-recently-used.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  has(key) {
    return this.entries.has(key);
  }

  set(key, value) {
    const size = Math.max(0, Number(this.sizeOf(value)) || 0);
    this.delete(key);
    if (size > this.maxEntryBytes || size > this.maxBytes) {
      this.oversizeSkips += 1;
      return this;
    }
    this.entries.set(key, value);
    this.bytes += size;
    this.#prune();
    return this;
  }

  delete(key) {
    if (!this.entries.has(key)) return false;
    const value = this.entries.get(key);
    const size = Math.max(0, Number(this.sizeOf(value)) || 0);
    this.entries.delete(key);
    this.bytes = Math.max(0, this.bytes - size);
    return true;
  }

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }

  telemetry() {
    return {
      entries: this.size,
      bytes: this.bytes,
      maxBytes: this.maxBytes,
      maxEntries: this.maxEntries,
      maxEntryBytes: this.maxEntryBytes,
      evictions: this.evictions,
      oversizeSkips: this.oversizeSkips,
    };
  }

  #prune() {
    while (this.entries.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.delete(oldestKey);
      this.evictions += 1;
    }
  }
}
