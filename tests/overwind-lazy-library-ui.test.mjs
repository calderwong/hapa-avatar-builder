import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { getBuilderHostTarget } from "../src/overcard/hostTargets.js";

const source = fs.readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

test("Echos keeps the 300 MB Overwind authoring library cold until a route needs it", () => {
  assert.deepEqual(getBuilderHostTarget("echos").lazyLoad, []);
  assert.ok(getBuilderHostTarget("builder").lazyLoad.some((entry) => entry.store === "avatars"));
  assert.match(source, /const performOverwindLibraryHydration = \(\) => fetch\(`\$\{API_BASE\}\/api\/overwind\/library`\)/);
  assert.match(source, /const needsFullCardLibrary = getBuilderHostTarget\(activeView\)\.lazyLoad/);
  assert.match(source, /entry\.store === "avatars" \|\| entry\.store === "items"/);
  assert.match(source, /overwindLibraryHydratorRef\.current\?\.\(\)/);
  assert.match(source, /if \(activeView === "echos"\) return undefined;[\s\S]*?ensureAvatarLoaded\(selectedAvatarId/);
  assert.doesNotMatch(source, /setTimeout\(\(\) => hydrateOverwindLibrary\(\).*?, 0\)/su);
});
