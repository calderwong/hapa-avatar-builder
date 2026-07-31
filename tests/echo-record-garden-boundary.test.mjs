import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Record Garden owns a recoverable component boundary outside its lazy loader", async () => {
  const [app, boundary] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/components/EchoRecordGardenBoundary.jsx", import.meta.url), "utf8"),
  ]);

  assert.match(app, /<EchoRecordGardenBoundary>[\s\S]*?<Suspense[\s\S]*?<EchoRecordGarden3DView/);
  assert.match(boundary, /getDerivedStateFromError/);
  assert.match(boundary, /role="alert"/);
  assert.match(boundary, /Retry Record Garden/);
  assert.match(boundary, /revision: current\.revision \+ 1/);
  assert.match(boundary, /Reload Builder/);
  assert.match(boundary, /globalThis\.location\?\.reload\?\.\(\)/);
});
