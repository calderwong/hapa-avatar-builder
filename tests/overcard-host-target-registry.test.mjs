import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BUILDER_HOST_TARGETS, builderHostTargetRegistrations, getBuilderHostTarget, resolveBuilderHostAlias } from "../src/overcard/hostTargets.js";

const expected = ["builder", "mind", "scenes", "items", "loops", "lookbook", "lore", "songs", "echos", "kanban", "protocol", "bank", "tarot-library", "hell-week", "tarot", "creator-sets"];

test("one registry completely describes all sixteen menu hosts and typed slots", () => {
  assert.deepEqual(BUILDER_HOST_TARGETS.map((target) => target.route), expected);
  assert.equal(new Set(BUILDER_HOST_TARGETS.map((target) => target.id)).size, 16);
  for (const target of BUILDER_HOST_TARGETS) {
    assert.ok(target.aliases.includes(target.route));
    assert.equal(target.launchAction.view, target.route);
    assert.ok(target.renderer.startsWith("builder-host-"));
    assert.ok(target.adapterId);
    assert.ok(target.fallback);
    assert.match(target.effectExplanation, /(filters|contributes|selects|can stage)/);
    assert.ok(["view-context", "process-context", "responsibility"].includes(target.contextMode));
    assert.ok(target.slots.length >= 1);
    assert.equal(new Set(target.slots.map((slot) => slot.id)).size, target.slots.length);
    for (const slot of target.slots) {
      assert.ok(slot.accepts.length); assert.ok(slot.capacity > 0);
      assert.ok(["presentation", "context", "authority"].includes(slot.effect));
    }
  }
  assert.equal(getBuilderHostTarget("hell-week").slots[0].effect, "authority");
  assert.equal(getBuilderHostTarget("bank").slots[0].effect, "presentation");
  assert.equal(getBuilderHostTarget("tarot").slots[0].effect, "context");
});

test("every URL alias resolves to a live registry host", () => {
  for (const target of BUILDER_HOST_TARGETS) for (const alias of target.aliases) assert.equal(resolveBuilderHostAlias(alias), target.route);
  assert.equal(resolveBuilderHostAlias("avatar-card"), "protocol");
  assert.equal(resolveBuilderHostAlias("tarot-draw"), "tarot");
  assert.equal(resolveBuilderHostAlias("hellweek"), "hell-week");
  assert.equal(resolveBuilderHostAlias("unknown"), "builder");
});

test("navigation, lazy loading, capability projection, and attachment registration consume the registry", async () => {
  const registrations = builderHostTargetRegistrations();
  assert.equal(registrations.length, 16);
  assert.ok(registrations.every((target) => target.slots?.[0]?.role && target.contextMode && target.effectExplanation));
  const [app, api, adapter, main, manifest] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"), readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/overcard/hostAdapter.js", import.meta.url), "utf8"), readFile(new URL("../src/main.jsx", import.meta.url), "utf8"),
    readFile(new URL("../overcard-adapter.json", import.meta.url), "utf8"),
  ]);
  assert.match(app, /BUILDER_HOST_TARGETS\.map/);
  assert.match(app, /getBuilderHostTarget\(activeView\)\.lazyLoad/);
  assert.match(app, /resolveBuilderHostAlias/);
  assert.match(api, /builderHostTargetRegistrations/);
  assert.match(api, /\/api\/overcard\/host-targets/);
  assert.match(adapter, /hostTargetsUrl/);
  assert.match(main, /\/api\/overcard\/host-targets/);
  assert.deepEqual(JSON.parse(manifest).hostTargets, []);
});
