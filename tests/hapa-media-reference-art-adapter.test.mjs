import assert from "node:assert/strict";
import test from "node:test";

import { createHapaMediaReferenceArtAdapter } from "../server/hapa-media-reference-art-adapter.mjs";

function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("adapter verifies node identity and keeps the bearer token out of request bodies", async () => {
  const calls = [];
  const adapter = createHapaMediaReferenceArtAdapter({
    baseUrl: "http://127.0.0.1:8723",
    readToken: async () => "local-secret",
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/health")) return json({ service: "hapa-media-gen-node", status: "ok" });
      if (url.endsWith("/capabilities")) {
        return json({ modalities: { image: { models: ["flux2-klein-9b"], modes: ["txt2img"], engines: ["mflux"] } } });
      }
      if (url.endsWith("/v1/images/generations")) return json({ task_id: "task_12345678" });
      if (url.endsWith("/v1/tasks/task_12345678")) return json({ status: "succeeded", result: { asset_id: "asset_12345678" } });
      if (url.endsWith("/v1/assets/asset_12345678/download")) {
        return new Response(Buffer.from("png"), { headers: { "content-type": "image/png" } });
      }
      return json({ message: "missing" }, 404);
    },
  });
  const inspection = await adapter.inspect();
  assert.equal(inspection.connected, true);
  const submission = await adapter.submit({
    scene: { generationPrompt: "Full-bleed original scene." },
    generation: { width: 1024, height: 1024, steps: 4, guidance: 1 },
  }, { id: "candidate:one", seed: 123 });
  const task = await adapter.task(submission.taskId);
  const asset = await adapter.download(task.result.asset_id);
  assert.equal(asset.buffer.toString(), "png");
  assert.equal(calls[0].init.headers.Authorization, undefined);
  assert.equal(calls.slice(1).every((call) => call.init.headers.Authorization === "Bearer local-secret"), true);
  assert.equal(calls.some((call) => String(call.init.body || "").includes("local-secret")), false);
});

test("adapter rejects non-loopback services", () => {
  assert.throws(
    () => createHapaMediaReferenceArtAdapter({ baseUrl: "https://media.example.com" }),
    /literal loopback/,
  );
});
