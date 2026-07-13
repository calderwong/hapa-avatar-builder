import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { SCHEMAS, validateCanonical } from "@hapa/overcard/core";
import { createActiveHellWeekBinding, prepareHellWeekNextRun, transitionHellWeekBinding } from "../src/overcard/hellWeekResponsibility.js";
import { consumePendingHellWeekContext, controlHellWeekBinding, stageHellWeekRunContext } from "/Users/calderwong/Desktop/hapa-dev-proto/electron/hell-week-run-context.ts";

const fixtures = JSON.parse(await readFile("/Users/calderwong/Desktop/hapa-overcard/test/fixtures/canonical-contract-fixtures.json", "utf8"));

function bindingFixture() {
  const principal = structuredClone(fixtures.entities.red);
  const attachment = { id: "attach-red", revision: 2, provenance: { traceId: "trace-red-slot" } };
  return createActiveHellWeekBinding({ principal, attachment, actor: "calder", at: "2026-07-11T17:00:00.000Z", formation: { id: "formation-red", revision: 4 }, contextAttachments: [{ entity: { ...structuredClone(fixtures.entities.tarotCard), entityType: "card" }, status: "active" }, { entity: { ...structuredClone(fixtures.entities.deck), entityType: "deck", revision: "3" }, status: "active" }] });
}

test("Red's Builder attachment creates a bounded active canonical responsibility without impersonation", () => {
  const binding = bindingFixture(); assert.equal(validateCanonical(SCHEMAS.responsibilityBinding, binding).ok, true);
  assert.equal(binding.principal.entityId, "red-reaper"); assert.equal(binding.target.nodeId, "hapa-dev-proto"); assert.equal(binding.role, "manager");
  assert.deepEqual(binding.permissions, ["hell-week.run"]); assert.deepEqual(binding.capabilityIds, ["process.manage"]); assert.deepEqual(binding.secretRefs, []);
  assert.equal(binding.memoryPolicy.allowWriteback, false); assert.equal(binding.executionPolicy.fallback, "process-default");
});

test("run preparation distinguishes avatar context from executable remote runtime and freezes safe revisions", () => {
  const binding = bindingFixture(); const remote = { ...structuredClone(fixtures.capabilityEnvelope), nodeId: "hapa-dev-proto", installed: true, running: true, compatible: true, trusted: false, authorized: false, processes: ["hell-week"] };
  const sources = { avatars: { updatedAt: "avatars-10", avatars: [{ id: "red-reaper", updatedAt: "red-42", runtimeSettings: { temperature: .2, apiKey: "must-not-leak" }, mind: { facts: [{ id: "public", visibility: "public", classification: "persona", text: "private excerpt must not cross" }] } }] }, tarot: { decks: [{ id: binding.collectionRefs[0].id, cardIds: ["policy-card"] }], sets: [] } };
  const prepared = prepareHellWeekNextRun({ binding, remoteCapabilities: remote, trustGrant: { granted: true, nodeId: "hapa-dev-proto", grantId: "trust-red" }, authorizationGrant: { granted: true, nodeId: "hapa-dev-proto", grantId: "authorize-red" }, now: "2026-07-11T17:02:00.000Z", traceId: "red-next-run" }, sources);
  assert.equal(prepared.runtimeContext.principal.entityId, "red-reaper"); assert.equal(prepared.runtimeContext.process.entityId, "hell-week"); assert.equal(prepared.runtimeContext.sourceRevisions.avatar, "red-42");
  assert.equal(prepared.policy.canExecuteProcess, true); assert.equal(Object.isFrozen(prepared.runtimeContext), true);
  const serialized = JSON.stringify(prepared); assert.doesNotMatch(serialized, /must-not-leak|private excerpt must not cross/); assert.match(serialized, /avatar-mind:facts:public/);
  assert.throws(() => prepareHellWeekNextRun({ binding, remoteCapabilities: remote, trustGrant: { granted: false }, authorizationGrant: { granted: true, nodeId: "hapa-dev-proto" } }, sources), /trust grant/);
});

test("pause/revoke/remove define current-run behavior and restore defaults for the next run", () => {
  const binding = bindingFixture();
  assert.deepEqual(["paused", "revoked", "removed"].map((status) => transitionHellWeekBinding(binding, status, "calder").nextRun), ["process-defaults", "process-defaults", "process-defaults"]);
  assert.equal(transitionHellWeekBinding(binding, "paused", "calder").currentRun, "pause-at-checkpoint"); assert.equal(transitionHellWeekBinding(binding, "revoked", "calder").currentRun, "immutable-until-complete");
});

test("menu activation, Hell Week controls, Builder proxy, and Dev Proto inbox are wired", async () => {
  const [menu, view, server] = await Promise.all([readFile(new URL("../src/overcard/BuilderMenuHostTab.jsx", import.meta.url), "utf8"), readFile(new URL("../src/components/HellWeekView.jsx", import.meta.url), "utf8"), readFile(new URL("../server/api.mjs", import.meta.url), "utf8")]);
  assert.match(menu, /createActiveHellWeekBinding/); assert.match(menu, /responsibility-binding/);
  assert.match(view, /Prepare next run/); assert.match(view, /Pause/); assert.match(view, /Revoke/); assert.match(view, /process defaults/);
  assert.match(server, /\/api\/overcard\/hell-week\/prepare-next-run/); assert.match(server, /\/v1\/hell-week\/run-context/);
});

test("real Builder output enters Dev Proto's durable inbox and controls the following run", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "builder-devproto-red-"));
  try {
    const binding = bindingFixture(); const remote = { ...structuredClone(fixtures.capabilityEnvelope), nodeId: "hapa-dev-proto", installed: true, running: true, compatible: true, trusted: false, authorized: false, processes: ["hell-week"] };
    const sources = { avatars: { avatars: [{ id: "red-reaper", updatedAt: "red-42" }], updatedAt: "avatars-10" } };
    const prepared = prepareHellWeekNextRun({ binding, remoteCapabilities: remote, trustGrant: { granted: true, nodeId: "hapa-dev-proto", grantId: "trust-red" }, authorizationGrant: { granted: true, nodeId: "hapa-dev-proto", grantId: "authorize-red" }, now: "2026-07-11T17:03:00.000Z" }, sources);
    await stageHellWeekRunContext(root, prepared.runtimeContext, "hapa-avatar-builder");
    const first = await consumePendingHellWeekContext(root, "hell-week-run-1"); assert.equal(first.principal.entityId, "red-reaper");
    assert.equal(await consumePendingHellWeekContext(root, "hell-week-run-2"), undefined);
    await stageHellWeekRunContext(root, prepared.runtimeContext, "hapa-avatar-builder"); await controlHellWeekBinding(root, { bindingId: binding.id, status: "paused", actor: "calder", at: "2026-07-11T17:04:00.000Z" });
    assert.equal(await consumePendingHellWeekContext(root, "hell-week-run-3"), undefined);
  } finally { await rm(root, { recursive: true, force: true }); }
});
