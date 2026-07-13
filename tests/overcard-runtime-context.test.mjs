import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveBuilderRuntimeContext, sanitizeSettings } from "../src/overcard/runtimeContext.js";

const fixtures = JSON.parse(await readFile("/Users/calderwong/Desktop/hapa-overcard/test/fixtures/canonical-contract-fixtures.json", "utf8"));

function allowedInput() {
  const binding = structuredClone(fixtures.binding);
  binding.status = "active";
  binding.mode = "advisor";
  binding.permissions = ["hell-week.run", "private.admin"];
  binding.capabilityIds = ["process.manage", "private.admin"];
  binding.activatedAt = "2026-07-11T09:55:00.000Z";
  binding.activatedBy = "calder";
  const tool = { ...structuredClone(fixtures.entities.tarotCard), entityType: "tool", entityId: "hell-week-reader", label: "Hell Week Reader" };
  binding.toolRefs = [tool];
  binding.memoryPolicy = {
    sources: ["avatar-mind", "second-brain"],
    visibility: ["public", "shared"],
    classifications: ["persona", "process-context"],
    allowWriteback: false,
    writebackRequiresApproval: true,
  };
  const envelope = structuredClone(fixtures.capabilityEnvelope);
  envelope.trusted = true;
  envelope.authorized = true;
  envelope.running = true;
  const toolKey = `${tool.sourceSystem}:${tool.entityType}:${tool.entityId}@${tool.revision}`;
  const authority = {
    permissions: ["hell-week.run"], capabilities: ["process.manage"], tools: [toolKey],
    memorySources: ["avatar-mind"], memoryVisibility: ["public", "shared"], memoryClassifications: ["persona", "process-context"],
  };
  return {
    binding,
    process: structuredClone(fixtures.processDefinition),
    operator: {
      ...authority, allowedModes: ["context", "advisor", "operator", "reviewer"], allowWriteback: false,
      writebackRequiresApproval: true, allowedSecretRefSchemes: ["keychain"], fallback: "process-default", maxBudgetUsd: 8, maxTokenBudget: 12000,
    },
    processAllowance: { ...authority, allowWriteback: false, writebackRequiresApproval: true, fallback: "pause", maxBudgetUsd: 5, maxTokenBudget: 10000 },
    runtime: { ...authority, envelope, allowWriteback: false, maxBudgetUsd: 4, maxTokenBudget: 9000 },
    satisfiedHumanGates: ["activate-manager", "socket:manager:human-gate"],
    settings: {
      process: { temperature: 0.4, topP: 0.8, apiKey: "must-not-leak" },
      operator: { temperature: 0.6 },
      binding: { temperature: 0.7, nested: { safe: true, accessToken: "must-not-leak-either" } },
    },
    provider: "local-mlx",
    model: "hapa-red-operator",
    estimatedToolCalls: 12,
    now: "2026-07-11T10:00:00.000Z",
    traceId: "preview-red-hell-week",
  };
}

function sourceData() {
  return {
    avatars: {
      updatedAt: "avatars-r10",
      avatars: [{
        id: "red-reaper",
        primaryName: "Red",
        updatedAt: "red-r42",
        runtimeSettings: { temperature: 0.2, voice: "red" },
        mind: {
          facts: [
            { id: "public-persona", visibility: "public", classification: "persona", text: "allowed text must still not be copied" },
            { id: "private-persona", visibility: "private", classification: "persona", text: "private memory must never leak" },
          ],
          context: [{ id: "shared-context", visibility: "shared", classification: "process-context", text: "summary only" }],
          journalEntries: [{ id: "private-journal", visibility: "private", classification: "process-context", body: "private journal" }],
        },
      }],
    },
    tarot: {
      updatedAt: "tarot-r8",
      decks: [{ id: "red-protocol-deck", cardIds: ["tarot-red-001", "tarot-red-002"] }],
      sets: [],
    },
    items: { updatedAt: "items-r3" },
    inventory: { updatedAt: "inventory-r4" },
    world: { updatedAt: "world-r5" },
    songs: { updatedAt: "songs-r6" },
    teams: { updatedAt: "teams-r2" },
  };
}

test("runtime preview exposes exact safe sources and context without memory or credential values", () => {
  const preview = resolveBuilderRuntimeContext(allowedInput(), sourceData());
  assert.equal(preview.previewOnly, true);
  assert.equal(preview.policy.decision, "allow");
  assert.equal(preview.status.avatarContext.status, "available");
  assert.equal(preview.status.executableRuntime.status, "context-only");
  assert.equal(preview.runtimeContext.mode, "advisor");
  assert.deepEqual(preview.runtimeContext.permissions, ["hell-week.run"]);
  assert.equal(preview.runtimeContext.settings.temperature, 0.7);
  assert.equal(preview.runtimeContext.settings.topP, 0.8);
  assert.equal(preview.runtimeContext.settings.voice, "red");
  assert.deepEqual(preview.runtimeContext.settings.nested, { safe: true });
  assert.equal(preview.runtimeContext.budget.costUsd, 4);
  assert.equal(preview.runtimeContext.budget.tokens, 9000);
  assert.equal(preview.runtimeContext.budget.toolCalls, 12);
  assert.deepEqual(preview.exact.decks[0].memberKeys, ["hapa-avatar-builder:card:tarot-red-001", "hapa-avatar-builder:card:tarot-red-002"]);
  assert.deepEqual(preview.runtimeContext.memory.resultRefs.sort(), ["avatar-mind:context:shared-context", "avatar-mind:facts:public-persona"]);
  assert.deepEqual(preview.redactions.rejectedSettingPaths.sort(), ["$.apiKey", "$.nested.accessToken"]);
  assert.deepEqual(new Set(preview.sources.map((source) => source.kind)), new Set(["process", "binding", "avatar", "deck", "inventory", "items", "tarot", "world", "songs", "teams"]));
  assert.equal(preview.redactions.rawMemoryIncluded, false);
  assert.equal(preview.redactions.credentialValuesIncluded, false);
  const serialized = JSON.stringify(preview);
  assert.doesNotMatch(serialized, /allowed text must still not be copied|private memory must never leak|private journal|must-not-leak/);
  assert.match(serialized, /public-persona/);
  assert.match(serialized, /red-r42/);
});

test("avatar source availability remains distinct from denied executable runtime", () => {
  const input = allowedInput();
  input.runtime.envelope.trusted = false;
  const preview = resolveBuilderRuntimeContext(input, sourceData());
  assert.equal(preview.policy.decision, "deny");
  assert.equal(preview.status.avatarContext.sourceAvailable, true);
  assert.equal(preview.status.avatarContext.status, "available-not-authorized");
  assert.equal(preview.status.executableRuntime.status, "denied");
  assert.deepEqual(preview.runtimeContext.permissions, []);
  assert.deepEqual(preview.runtimeContext.memory.resultRefs, []);
  assert.deepEqual(preview.runtimeContext.contextRefs, []);
  assert.deepEqual(preview.runtimeContext.collectionRefs, []);
});

test("settings sanitizer is bounded, deterministic, and reference-safe", () => {
  const result = sanitizeSettings({
    model: "safe",
    password: "nope",
    secretRef: "keychain://provider/account",
    nested: { privateKey: "nope", values: [1, 2, Number.POSITIVE_INFINITY] },
  });
  assert.deepEqual(result.value, { model: "safe", secretRef: "keychain://provider/account", nested: { values: [1, 2] } });
  assert.deepEqual(result.rejectedPaths.sort(), ["$.nested.privateKey", "$.password"]);
});
