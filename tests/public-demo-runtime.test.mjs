import assert from "node:assert/strict";
import test from "node:test";
import {
  publicBuildWeekDemoRequested,
  resolvePublicDemoAssetUri,
} from "../src/domain/public-demo-runtime.js";

test("Pages can force the bounded public demo without a query string", () => {
  assert.equal(publicBuildWeekDemoRequested({ search: "", forced: true }), true);
  assert.equal(publicBuildWeekDemoRequested({ search: "?stargateDemo=1" }), true);
  assert.equal(publicBuildWeekDemoRequested({ search: "?view=builder" }), false);
});

test("curated demo assets resolve beneath the GitHub project site base", () => {
  assert.equal(
    resolvePublicDemoAssetUri("/demo/red-avatar.svg", "/hapa-avatar-builder/"),
    "/hapa-avatar-builder/demo/red-avatar.svg",
  );
  assert.equal(resolvePublicDemoAssetUri("/demo/blue-avatar.svg", "/"), "/demo/blue-avatar.svg");
  assert.equal(resolvePublicDemoAssetUri("https://example.test/avatar.svg", "/hapa-avatar-builder/"), "https://example.test/avatar.svg");
});
