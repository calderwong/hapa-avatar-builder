import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Scene uploads persist through the bounded asset-batch route instead of a full world PUT", async () => {
  const [appSource, apiSource] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(appSource, /attachSceneMediaBatch\(normalizedSceneGraph, selectedScene\.id, sceneAssets/);
  assert.match(appSource, /api\/world\/scenes\/\$\{encodeURIComponent\(sceneId\)\}\/assets/);
  assert.match(appSource, /persist: false/);
  assert.match(apiSource, /sceneAssetBatchMatch/);
  assert.match(apiSource, /attachSceneMediaBatch\(currentGraph, sceneId, assets/);
  assert.match(apiSource, /MAX_SCENE_ASSET_BATCH_BYTES/);
});
