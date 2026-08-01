import test from "node:test";
import assert from "node:assert/strict";
import { ByteBoundedLruCache } from "../server/byte-bounded-lru-cache.mjs";

test("byte-bounded cache evicts the least recently used entry by byte budget", () => {
  const cache = new ByteBoundedLruCache({ maxBytes: 10, maxEntries: 10 });
  cache.set("first", { size: 4, value: 1 });
  cache.set("second", { size: 4, value: 2 });
  assert.equal(cache.get("first").value, 1);
  cache.set("third", { size: 4, value: 3 });
  assert.equal(cache.has("first"), true, "a cache hit must refresh LRU order");
  assert.equal(cache.has("second"), false);
  assert.deepEqual(cache.telemetry(), {
    entries: 2,
    bytes: 8,
    maxBytes: 10,
    maxEntries: 10,
    maxEntryBytes: 10,
    evictions: 1,
    oversizeSkips: 0,
  });
});

test("byte-bounded cache enforces entry count and replacement accounting", () => {
  const cache = new ByteBoundedLruCache({ maxBytes: 100, maxEntries: 2 });
  cache.set("one", { size: 10 });
  cache.set("two", { size: 20 });
  cache.set("two", { size: 7 });
  assert.equal(cache.bytes, 17);
  cache.set("three", { size: 5 });
  assert.equal(cache.has("one"), false);
  assert.equal(cache.bytes, 12);
  assert.equal(cache.evictions, 1);
});

test("byte-bounded cache does not retain an oversized parsed tree", () => {
  const cache = new ByteBoundedLruCache({
    maxBytes: 100,
    maxEntries: 4,
    maxEntryBytes: 30,
  });
  cache.set("large", { size: 31 });
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
  assert.equal(cache.oversizeSkips, 1);
});

test("byte-bounded cache clear releases accounting without falsifying eviction telemetry", () => {
  const cache = new ByteBoundedLruCache({ maxBytes: 100, maxEntries: 4 });
  cache.set("one", { size: 10 });
  cache.clear();
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
  assert.equal(cache.evictions, 0);
});
