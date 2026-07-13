import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Tarot frame capture is demand-gated and single-flight", () => {
  const source = fs.readFileSync("./src/components/TarotDraw3DView.jsx", "utf8");
  assert.ok(source.includes("/api/tarot/stream-demand"));
  assert.ok(source.includes("tarotStreamDemand && !tarotFrameUploadInFlight"));
  assert.ok(source.includes("nowMs - lastTarotFramePostMs >= 200"));
  assert.ok(source.includes("tarotFrameUploadInFlight = false"));
  assert.ok(!source.includes("window.__lastFramePostTime"));
});

test("Tarot sync is lease-backed, delta-throttled, and disposed", () => {
  const source = fs.readFileSync("./src/components/TarotDraw3DView.jsx", "utf8");
  assert.ok(source.includes('type: "subscriber-lease"'));
  assert.ok(source.includes("elapsedTime - lastBroadcastTime > 0.1"));
  assert.ok(source.includes("signature !== lastBroadcastSignature"));
  assert.ok(source.includes("syncChannel.close()"));
  assert.ok(!source.includes("Tarot Draw Sync [Broadcaster]"));
  assert.ok(!source.includes("Tarot Draw Sync [Subscriber]"));
});

test("Tarot server rejects producer frames without an active consumer", () => {
  const source = fs.readFileSync("./server/api.mjs", "utf8");
  assert.ok(source.includes('pathname === "/api/tarot/stream-demand"'));
  assert.ok(source.includes("activeTarotStreamConsumers <= 0"));
  assert.ok(source.includes('reason: "no-active-stream-consumer"'));
  assert.ok(source.includes("activeTarotStreamConsumers = Math.max(0, activeTarotStreamConsumers - 1)"));
});

test("Electron production mode keeps DevTools closed and logs bounded", () => {
  const source = fs.readFileSync("./electron/main.cjs", "utf8");
  assert.ok(source.includes('HAPA_AVATAR_DESKTOP_DEBUG === "1"'));
  assert.ok(source.includes("MAX_CONSOLE_LOGS = 500"));
  assert.ok(source.includes("if (level < 2) return"));
  assert.ok(!source.includes("window.webContents.openDevTools();"));
});

test("Echo preview bounds preload and keeps each VideoTexture paired to its video", () => {
  const source = fs.readFileSync("./src/components/TarotDraw3DView.jsx", "utf8");
  const pool = fs.readFileSync("./src/domain/echo-player-pool.js", "utf8");
  assert.ok(pool.includes("ECHO_PLAYER_POOL_LIMIT = 3"));
  assert.ok(pool.includes("offset < 3"));
  assert.ok(source.includes("pairDropZoneScreenVideoTexture(screen, preloadedVideo)"));
  assert.ok(source.includes("const texture = new THREE.VideoTexture(nextVideo)"));
  assert.ok(!source.includes("screen.texture.image = preloadedVideo"));
  assert.ok(source.includes("canonicalEchoAssetKey(value)"));
  assert.ok(source.includes("preloadedVideo.readyState < 2"));
  assert.ok(source.includes('preloadedVideo.addEventListener("loadeddata", handler, { once: true })'));
});
