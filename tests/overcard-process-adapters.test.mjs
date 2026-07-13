import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SCHEMAS, validateCanonical } from "@hapa/overcard/core";
import { BUILDER_PROCESS_ADAPTERS, builderProcessAdapterRegistrations, freezeBuilderRunContext, getBuilderProcessAdapter } from "../src/overcard/processAdapters.js";
import { BUILDER_HOST_TARGETS } from "../src/overcard/hostTargets.js";

const fixtures = JSON.parse(await readFile("/Users/calderwong/Desktop/hapa-overcard/test/fixtures/canonical-contract-fixtures.json", "utf8"));

test("one registry declares local, remote, and embedded process ownership with complete typed sockets", () => {
  assert.deepEqual(new Set(BUILDER_PROCESS_ADAPTERS.map((entry) => entry.mode)), new Set(["local", "remote", "embedded"]));
  assert.ok(BUILDER_PROCESS_ADAPTERS.length >= 10);
  for (const adapter of BUILDER_PROCESS_ADAPTERS) {
    assert.equal(validateCanonical(SCHEMAS.processDefinition, adapter.definition).ok, true, adapter.id);
    assert.ok(adapter.ownerNodeId); assert.ok(adapter.launch.uri); assert.ok(adapter.inspect.uri); assert.ok(adapter.fallback);
    for (const socket of adapter.definition.sockets) {
      assert.ok(socket.role); assert.ok(socket.accepts.length); assert.ok(Array.isArray(socket.requiredCapabilities));
      assert.ok(Array.isArray(socket.requiredPermissions)); assert.ok(socket.interruptionPolicy); assert.ok(socket.activation);
    }
  }
  assert.equal(getBuilderProcessAdapter("hell-week").ownerNodeId, "hapa-dev-proto");
  assert.equal(getBuilderProcessAdapter("builder-kanban-actions-remote").appendOnly, true);
  assert.equal(getBuilderProcessAdapter("builder-bank-embed").definition.sockets.every((socket) => socket.effect !== "authority"), true);
});

test("runtime-bearing HostTargets resolve to the same adapter registry", () => {
  for (const target of BUILDER_HOST_TARGETS.filter((entry) => entry.processId)) assert.ok(getBuilderProcessAdapter(target.adapterId), `${target.id}:${target.adapterId}`);
  const registrations = builderProcessAdapterRegistrations();
  assert.ok(registrations.every((entry) => entry.runContextUri.includes(entry.id)));
});

test("an active binding is resolved only at run-start and freezes a revisioned canonical context", () => {
  const binding = structuredClone(fixtures.binding);
  binding.status = "active"; binding.mode = "operator"; binding.activatedAt = "2026-07-11T16:00:00.000Z"; binding.activatedBy = "calder";
  binding.target.processId = "hell-week"; binding.permissions = ["hell-week.preview"]; binding.capabilityIds = ["process.manage"];
  binding.memoryPolicy = { sources: ["none"], visibility: ["public"], classifications: ["unclassified"], allowWriteback: false, writebackRequiresApproval: true };
  const envelope = { ...structuredClone(fixtures.capabilityEnvelope), nodeId: "hapa-dev-proto", trusted: true, authorized: true, running: true };
  const authority = { permissions: ["hell-week.preview"], capabilities: ["process.manage"], tools: [], memorySources: ["none"], memoryVisibility: ["public"], memoryClassifications: ["unclassified"], allowWriteback: false, writebackRequiresApproval: true, fallback: "process-default" };
  const input = { phase: "run-start", binding, operator: { ...authority, allowedModes: ["operator"], allowedSecretRefSchemes: [], maxBudgetUsd: 2, maxTokenBudget: 1000 }, processAllowance: { ...authority, maxBudgetUsd: 2, maxTokenBudget: 1000 }, runtime: { ...authority, envelope, maxBudgetUsd: 2, maxTokenBudget: 1000 }, satisfiedHumanGates: ["activate-manager"], now: "2026-07-11T16:01:00.000Z", traceId: "run-red" };
  const sources = { avatars: { updatedAt: "a1", avatars: [{ id: binding.principal.entityId, updatedAt: "red-1" }] } };
  const frozen = freezeBuilderRunContext("builder-hell-week-remote", input, sources);
  assert.equal(Object.isFrozen(frozen), true); assert.equal(Object.isFrozen(frozen.runtimeContext), true);
  assert.equal(frozen.runtimeContext.schema, SCHEMAS.runtimeContext); assert.equal(frozen.runtimeContext.process.entityId, "hell-week");
  assert.equal(frozen.runtimeContext.sourceRevisions.avatar, "red-1"); assert.equal(frozen.ownerNodeId, "hapa-dev-proto");
  binding.principal.label = "Mutated"; assert.notEqual(frozen.runtimeContext.principal.label, "Mutated");
  assert.throws(() => freezeBuilderRunContext("builder-hell-week-remote", { ...input, phase: "preview" }, sources), /run-start/);
  assert.throws(() => freezeBuilderRunContext("builder-hell-week-remote", { ...input, binding: { ...input.binding, status: "staged" } }, sources), /active/);
});

test("HTTP discovery, run-context routes, and menu launch/inspect controls are visible", async () => {
  const [server, menu, manifest] = await Promise.all([
    readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/overcard/BuilderMenuHostTab.jsx", import.meta.url), "utf8"),
    readFile(new URL("../overcard-adapter.json", import.meta.url), "utf8"),
  ]);
  assert.match(server, /\/api\/overcard\/process-adapters/); assert.match(server, /freezeBuilderRunContext/);
  assert.match(menu, />Launch</); assert.match(menu, />Inspect capability</); assert.match(menu, /owned by/);
  const parsed = JSON.parse(manifest); assert.equal(parsed.processAdapters.length, BUILDER_PROCESS_ADAPTERS.length);
});
