import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BUILDER_HOST_TARGETS } from "../src/overcard/hostTargets.js";

test("Builder Overcard docs name canonical ownership, all hosts, scopes, boundaries, parity, and verification", async () => {
  const [doc, agents, readme, node] = await Promise.all([readFile(new URL("../docs/OVERCARD.md", import.meta.url), "utf8"), readFile(new URL("../AGENTS.md", import.meta.url), "utf8"), readFile(new URL("../README.md", import.meta.url), "utf8"), readFile(new URL("../hapa-node.json", import.meta.url), "utf8")]);
  assert.match(doc, /\/Users\/calderwong\/Desktop\/hapa-avatar-builder/); assert.match(doc, /not `hapa-avatar-dashboard`/); assert.match(doc, /\/Users\/calderwong\/Desktop\/hapa-overcard/);
  assert.equal(BUILDER_HOST_TARGETS.length, 16); for (const target of BUILDER_HOST_TARGETS) assert.match(doc, new RegExp(target.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  for (const scope of ["operator-personal", "avatar-private", "workspace"]) assert.match(doc, new RegExp(scope));
  for (const boundary of ["Non-executing", "Local, remote, and embedded", "Hell Week", "Visual placement never grants authority"]) assert.match(doc, new RegExp(boundary));
  for (const surface of ["UI", "API", "CLI", "DATA", "EVENT", "DESKTOP", "PACKAGE", "TESTS", "DOCS"]) assert.match(doc, new RegExp(`\\| ${surface} \\|`));
  assert.match(agents, /docs\/OVERCARD\.md/); assert.match(readme, /docs\/OVERCARD\.md/); assert.doesNotThrow(() => JSON.parse(node));
});
