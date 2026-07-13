import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { projectOvercardHostSnapshot } from "../src/overcard/hostAdapter.js";

test("Overcard host projection maps canonical record kinds without app-owned reducers", () => {
  const snapshot = {
    revision: 9,
    records: {
      entity: { kind: "entity-ref", id: "red", value: { schema: "hapa.entity-ref.v2", entityId: "red" } },
      collections: { kind: "collection-ledger", id: "shared", value: { schema: "hapa.collection-ledger.v1", collections: {} } },
      placement: { kind: "placement-ledger", id: "shared", value: { schema: "hapa.placement-ledger.v1", revision: 2 } },
      formation: { kind: "formation", id: "red-hell-week", value: { schema: "hapa.formation.v2", id: "red-hell-week" } },
      binding: { kind: "responsibility-binding", id: "red-manager", value: { schema: "hapa.responsibility-binding.v2", id: "red-manager" } },
      target: { kind: "host-target", id: "hell-week", value: { id: "hell-week", nodeId: "hapa-avatar-builder" } },
      telemetry: { kind: "telemetry", id: "event-1", value: { id: "event-1", level: "info" } },
    },
  };
  const projected = projectOvercardHostSnapshot(snapshot);
  assert.equal(projected.revision, 9);
  assert.equal(projected.catalog.red.entityId, "red");
  assert.equal(projected.collections.schema, "hapa.collection-ledger.v1");
  assert.equal(projected.placement.schema, "hapa.placement-ledger.v1");
  assert.equal(projected.formations["red-hell-week"].id, "red-hell-week");
  assert.equal(projected.responsibilityBindings["red-manager"].id, "red-manager");
  assert.equal(projected.hostTargets[0].id, "hell-week");
  assert.equal(projected.telemetry[0].id, "event-1");
});

test("the canonical provider wraps the true Builder root and labels offline behavior", async () => {
  const main = await readFile(new URL("../src/main.jsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../src/App.jsx", import.meta.url), "utf8");
  const headerHand = await readFile(new URL("../src/overcard/BuilderHeaderHand.jsx", import.meta.url), "utf8");
  const api = await readFile(new URL("../server/api.mjs", import.meta.url), "utf8");
  const css = await readFile(new URL("../src/index.css", import.meta.url), "utf8");
  assert.match(main, /<OvercardProvider[\s\S]*<App overcardAdapter=\{overcardAdapter\} \/>[\s\S]*<\/OvercardProvider>/);
  assert.doesNotMatch(main, /<OvercardHand/);
  assert.match(app, /<BuilderHeaderHand/);
  assert.match(headerHand, /surfaceId="hapa-avatar-builder"/);
  assert.match(headerHand, /defaultPresentationMode="docked-minified"/);
  assert.match(main, /renderers=\{avatarBuilderOvercardRenderers\}/);
  assert.match(main, /@hapa\/overcard\/styles\.css/);
  assert.match(main, /\/api\/overcard\/catalog\?limit=500/);
  assert.doesNotMatch(main, /OvercardRootStatus/);
  assert.doesNotMatch(css, /\.builder-overcard-status/);
  assert.match(app, /BUILDER_HOST_TARGETS\.map/);
  assert.match(api, /\/api\/overcard\/runtime-context\/preview/);
});
