import assert from "node:assert/strict";
import test from "node:test";

import {
  createFlux2ReferenceArtAdapter,
  Flux2ReferenceArtError,
} from "../server/flux2-reference-art-adapter.mjs";

function job() {
  return {
    jobHash: "sha256:test",
    prompt: { prompt: "{\"objective\":\"reference art\"}" },
    generation: {
      model: "flux-2-max",
      width: 1536,
      height: 2048,
      seed: 42,
      outputFormat: "png",
      inputImages: [],
    },
  };
}

test("FLUX.2 adapter submits, polls, and downloads without exposing its API key", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith("/v1/flux-2-max")) {
      return Response.json({ id: "request-1", polling_url: "https://api.bfl.ai/v1/get_result?id=request-1" });
    }
    if (String(url).startsWith("https://api.bfl.ai/v1/get_result")) {
      return Response.json({ status: "Ready", result: { sample: "https://delivery.us.bfl.ai/result.png?sig=test", seed: 42 } });
    }
    return new Response(Buffer.from([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
  };
  const adapter = createFlux2ReferenceArtAdapter({ apiKey: "secret-key", fetchImpl });
  const inspection = adapter.inspect();
  const submitted = await adapter.submit(job());
  const ready = await adapter.poll(submitted.pollingUrl);
  const image = await adapter.download(ready.deliveryUrl);

  assert.equal(inspection.configured, true);
  assert.equal(JSON.stringify(inspection).includes("secret-key"), false);
  assert.equal(submitted.requestId, "request-1");
  assert.equal(ready.ready, true);
  assert.equal(image.contentType, "image/png");
  assert.equal(image.deliveryHost, "delivery.us.bfl.ai");
  assert.equal(calls[0].options.headers["x-key"], "secret-key");
  assert.equal(calls[2].options.headers["x-key"], undefined, "signed delivery does not receive the API key");
});

test("FLUX.2 adapter fails closed for missing credentials and untrusted polling hosts", async () => {
  const missing = createFlux2ReferenceArtAdapter({ apiKey: "", fetchImpl: async () => Response.json({}) });
  assert.equal(missing.inspect().configured, false);
  await assert.rejects(() => missing.submit(job()), (error) => (
    error instanceof Flux2ReferenceArtError && error.code === "flux2_api_key_missing"
  ));

  const adapter = createFlux2ReferenceArtAdapter({ apiKey: "secret", fetchImpl: async () => Response.json({}) });
  await assert.rejects(() => adapter.poll("https://attacker.example/result"), (error) => (
    error instanceof Flux2ReferenceArtError && error.code === "untrusted_flux2_polling_host"
  ));
});
