import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BUILDER_HOST_TARGETS } from "../src/overcard/hostTargets.js";

test("every generated menu host mounts an exact attachment toggle and shared slot surface", async () => {
  const [app, tab, css] = await Promise.all([
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/overcard/BuilderMenuHostTab.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);
  assert.equal(BUILDER_HOST_TARGETS.length, 16);
  assert.match(app, /<BuilderMenuHostTab/);
  assert.match(tab, /<OvercardHostSlots/);
  assert.match(tab, /builder-menu-host__slot-toggle/);
  assert.match(tab, /pickup\.held\?\.entity/);
  assert.match(tab, /requestResponsibility=\{async \(\{ entity, attachment \}\)/);
  assert.match(tab, /createActiveHellWeekBinding/);
  assert.match(tab, /kind: "responsibility-binding"/);
  assert.match(css, /\.builder-menu-host__slot-toggle/);
  assert.match(css, /\.builder-menu-host__popover/);
});

test("menu slots expose actionable health, context, fallback, detach, and shared persistence inputs", async () => {
  const [tab, shared] = await Promise.all([
    readFile(new URL("../src/overcard/BuilderMenuHostTab.jsx", import.meta.url), "utf8"),
    readFile(new URL("../node_modules/@hapa/overcard/dist/react/index.js", import.meta.url), "utf8"),
  ]);
  for (const token of ["offline", "degraded", "effectiveContext", "fallback"]) assert.match(tab, new RegExp(token));
  for (const token of ["Replace first + return it", "Detach + return", "Earlier", "Later", "Undo", "Incompatible drop", "failed:"]) assert.ok(shared.includes(token));
  assert.match(shared, /state\.upsert/);
  assert.match(shared, /expectedLedgerRevision/);
  assert.match(shared, /OVERCARD_ENTITY_MIME/);
  assert.doesNotMatch(shared, /localStorage/);
});
