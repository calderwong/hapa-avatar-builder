import test from "node:test";
import assert from "node:assert/strict";
import { createTarotKrea2Adapter } from "../server/krea2-tarot-adapter.mjs";

const digest = "c".repeat(64);

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });
}

test("Builder Krea adapter discovers presets, forwards assets/edits, and rewrites private artifact routes", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    const route = new URL(url).pathname;
    if (route === "/health") return jsonResponse({ status: "ok", model: { phase: "ready", ready: true } });
    if (route === "/v1/presets") return jsonResponse({ default_preset: "build_week_fast", presets: [{ id: "avatar_builder_portrait_quality", enabled: true }] });
    if (route === "/v1/assets" && options.method === "POST") return jsonResponse({ asset_id: `sha256:${digest}`, sha256: digest, media_type: "image/png", width: 32, height: 32 }, 201);
    if (route === "/v1/edits") return jsonResponse({ task_id: "kidtask_demo", status: "queued", progress: 0 }, 202);
    if (route === "/v1/tasks/kidtask_demo") return jsonResponse({
      task_id: "kidtask_demo",
      status: "succeeded",
      progress: 1,
      artifacts: [{ asset_id: `sha256:${digest}`, sha256: digest, media_type: "image/png", uri: `/v1/assets/sha256:${digest}/content` }]
    });
    if (route === `/v1/assets/sha256%3A${digest}/content` || route === `/v1/assets/sha256:${digest}/content`) {
      return new Response(Uint8Array.from([137, 80, 78, 71]), { status: 200, headers: { "content-type": "image/png" } });
    }
    return jsonResponse({ error: { code: "missing", message: route } }, 404);
  };
  const adapter = createTarotKrea2Adapter({
    baseUrl: "http://127.0.0.1:8774",
    fetchImpl,
    readToken: async () => "x".repeat(48),
  });

  const status = await adapter.inspect();
  assert.equal(status.connected, true);
  assert.equal(status.presets.presets[0].id, "avatar_builder_portrait_quality");

  const asset = await adapter.uploadImage(Buffer.from([137, 80, 78, 71]), { mimeType: "image/png", fileName: "Red.png" });
  assert.equal(asset.asset_id, `sha256:${digest}`);
  assert.ok(calls.find((call) => new URL(call.url).pathname === "/v1/assets")?.options.body instanceof FormData);

  const submitted = await adapter.submitEdit({ schema: "hapa.krea2_identity_edit.request.v2" });
  assert.equal(submitted.task_id, "kidtask_demo");
  const task = await adapter.task("kidtask_demo");
  assert.equal(task.artifacts[0].node_uri, `/v1/assets/sha256:${digest}/content`);
  assert.equal(task.artifacts[0].uri, `/api/tarot/krea2/assets/${encodeURIComponent(`sha256:${digest}`)}/content`);
  const content = await adapter.assetContent(`sha256:${digest}`);
  assert.equal(content.contentType, "image/png");
  assert.equal(content.buffer.length, 4);

  const protectedCalls = calls.filter((call) => new URL(call.url).pathname.startsWith("/v1/"));
  assert.ok(protectedCalls.every((call) => call.options.headers?.Authorization === `Bearer ${"x".repeat(48)}`));
});

test("Builder Krea adapter reports an offline node without inventing presets", async () => {
  const adapter = createTarotKrea2Adapter({
    fetchImpl: async () => { throw new Error("connection refused"); },
    readToken: async () => "x".repeat(48),
    timeoutMs: 500,
  });
  const status = await adapter.inspect();
  assert.equal(status.connected, false);
  assert.equal(status.presets, null);
  assert.equal(status.error.code, "krea2_node_unreachable");
});
