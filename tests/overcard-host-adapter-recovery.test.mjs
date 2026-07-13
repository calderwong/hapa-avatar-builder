import assert from "node:assert/strict";
import test from "node:test";
import {
  createAvatarBuilderOvercardAdapter,
  describeOvercardHostLoadFailure,
} from "../src/overcard/hostAdapter.js";

test("Overcard load diagnostics retain endpoint, renderer origin, and transport cause", () => {
  const message = describeOvercardHostLoadFailure(new TypeError("Failed to fetch"), {
    baseUrl: "http://127.0.0.1:8794/",
    rendererOrigin: "http://127.0.0.1:8797",
  });

  assert.match(message, /http:\/\/127\.0\.0\.1:8794/);
  assert.match(message, /http:\/\/127\.0\.0\.1:8797/);
  assert.match(message, /use Reconnect host for a typed diagnosis/);
  assert.doesNotMatch(message, /origin|cors/i);
  assert.match(message, /Cause: Failed to fetch/);
});

test("Overcard origin rejection is reported as an exact-origin failure", () => {
  const message = describeOvercardHostLoadFailure(new Error("Overcard host request failed with HTTP 403."), {
    baseUrl: "http://127.0.0.1:8794",
    rendererOrigin: "http://localhost:5178",
  });

  assert.match(message, /rejected renderer origin http:\/\/localhost:5178/);
  assert.match(message, /exact-origin registration/);
  assert.match(message, /HTTP 403/);
});

test("adapter load preserves Builder catalog while exposing the original host failure", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:8794/")) throw new TypeError("Failed to fetch");
    if (url.includes("/catalog")) {
      return new Response(JSON.stringify({ entities: [{
        ref: { sourceSystem: "hapa-avatar-builder", entityType: "avatar", entityId: "red", label: "Red" },
        rendererId: "avatar-card",
      }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/host-targets")) {
      return new Response(JSON.stringify({ targets: [{ id: "builder" }] }), { status: 200, headers: { "content-type": "application/json" } });
    }
    throw new Error(`Unexpected URL: ${url}`);
  };

  try {
    const adapter = createAvatarBuilderOvercardAdapter({
      baseUrl: "http://127.0.0.1:8794",
      rendererOrigin: "http://127.0.0.1:8797",
      catalogUrl: "http://127.0.0.1:8787/api/overcard/catalog",
      hostTargetsUrl: "http://127.0.0.1:8787/api/overcard/host-targets",
    });

    await assert.rejects(adapter.load(), (error) => {
      assert.match(error.message, /http:\/\/127\.0\.0\.1:8794/);
      assert.match(error.message, /http:\/\/127\.0\.0\.1:8797/);
      assert.equal(error.baseUrl, "http://127.0.0.1:8794");
      assert.equal(error.rendererOrigin, "http://127.0.0.1:8797");
      assert.equal(error.cause?.message, "Failed to fetch");
      assert.equal(error.partialSnapshot.catalog["hapa-avatar-builder:avatar:red"].label, "Red");
      assert.deepEqual(error.partialSnapshot.hostTargets, [{ id: "builder" }]);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
