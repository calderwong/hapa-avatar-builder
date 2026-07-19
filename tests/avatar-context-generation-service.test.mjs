import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  AvatarContextGenerationService,
  openAvatarContextGenerationService,
  verifyContextGenerationEvents,
} from "../server/avatar-context-generation-service.mjs";

const hex = (character) => character.repeat(64);
const cards = [
  { id: "hapa-card:concept:empathy", cardRevisionId: "r4", cardCoreKey: hex("a"), cardRecordDigest: hex("b"), title: "Empathy", summary: "Meet meaning from more than one cultural direction.", keywords: ["language", "care"] },
  { id: "hapa-card:wisdom:listen", cardRevisionId: "r2", cardCoreKey: hex("c"), cardRecordDigest: hex("d"), title: "Listen twice", summary: "Hold interpretation until context arrives.", keywords: ["wisdom", "context"] },
];

function fixture(root, options = {}) {
  return new AvatarContextGenerationService({ root, now: () => "2026-07-19T12:00:00.000Z", ...options });
}

function packetRequest() {
  return {
    evidenceCards: cards.map((card) => ({ card, selectedFields: ["title", "summary", "keywords"] })),
    purpose: "Create one bridge lesson without rewriting either source.",
    actor: { actorId: "calder", actorType: "human", displayName: "Calder" },
    gate: { formationDigest: hex("e"), gateCommitment: hex("f"), redactedAddress: "hapa-gate:v1:demo…safe", orderedCardIds: cards.map((card) => card.id) },
  };
}

test("human-selected evidence freezes exact Card revisions and deterministic mode never claims generation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-context-generation-"));
  const service = fixture(root);
  const packet = await service.freezePacket(packetRequest());
  assert.equal(packet.schemaVersion, "hapa.avatar-builder.context-packet.v1");
  assert.deepEqual(packet.evidence.map((item) => item.sourceRef.cardRevisionId), ["r4", "r2"]);
  assert.equal(packet.authority.semanticInference, false);
  assert.match(packet.packetDigest, /^[a-f0-9]{64}$/);

  const result = await service.generate({ packetId: packet.packetId, mode: "deterministic_scaffold", instruction: "Combine the lessons.", actor: { actorId: "calder", actorType: "human", displayName: "Calder" } });
  assert.equal(result.run.generationPerformed, false);
  assert.equal(result.run.semantic, false);
  assert.equal(result.run.provider, null);
  assert.match(result.run.truthBoundary, /No model was invoked/);
  assert.equal(result.card.lifecycleStatus, "proposed_unminted");
  assert.equal(result.card.minted, false);
  assert.equal(result.card.contextGenerationResult.generationPerformed, false);
  assert.match(result.card.imageUri, /^data:image\/svg\+xml/);
  assert.equal(result.card.relationships.length, 2);
  assert.equal(result.card.authority.sourceMutation, false);
  assert.equal(service.list().packets.length, 1);
  assert.equal(service.list().runs.length, 1);
  verifyContextGenerationEvents(service.events);

  const reopened = await openAvatarContextGenerationService({ root });
  assert.equal(reopened.list().runs[0].runDigest, result.run.runDigest);
});

test("packet order is bound to the active Stargate Formation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-context-order-"));
  const request = packetRequest();
  request.gate.orderedCardIds.reverse();
  await assert.rejects(() => fixture(root).freezePacket(request), (error) => error.code === "context_formation_order_mismatch");
});

test("Ollama mode records concrete runtime, model, prompt and response provenance", async (t) => {
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push({ path: request.url, body: body ? JSON.parse(body) : null });
    response.setHeader("content-type", "application/json");
    if (request.url === "/api/version") return response.end(JSON.stringify({ version: "0.24.0" }));
    if (request.url === "/api/tags") return response.end(JSON.stringify({ models: [{ name: "fixture-model", digest: `sha256:${hex("9")}` }] }));
    if (request.url === "/api/chat") return response.end(JSON.stringify({ done: true, model: "fixture-model", message: { role: "assistant", content: JSON.stringify({ title: "Converging lesson", summary: "A bounded proposal grounded in both selected Cards.", proposedCardType: "concept_card", evidenceUse: [{ position: 0, use: "frames empathy" }, { position: 1, use: "adds listening" }] }) }, prompt_eval_count: 120, eval_count: 32, total_duration: 44 }));
    response.statusCode = 404;
    response.end(JSON.stringify({ error: "not found" }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => server.close());

  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-context-ollama-"));
  const service = fixture(root, { ollamaEndpoint: `http://127.0.0.1:${server.address().port}` });
  const packet = await service.freezePacket(packetRequest());
  const result = await service.generate({ packetId: packet.packetId, mode: "ollama_local", modelId: "fixture-model", instruction: "Propose a Concept Card.", actor: { actorId: "calder", actorType: "human", displayName: "Calder" } });
  assert.equal(result.run.generationPerformed, true);
  assert.equal(result.run.providerInvocationVerified, true);
  assert.equal(result.run.provider.providerVersion, "0.24.0");
  assert.equal(result.run.provider.modelVersion, `sha256:${hex("9")}`);
  assert.equal(result.run.provider.endpoint, `127.0.0.1:${server.address().port}`);
  assert.match(result.run.prompt.digest, /^[a-f0-9]{64}$/);
  assert.match(result.run.responseDigest, /^[a-f0-9]{64}$/);
  assert.equal(result.card.truthStatus, "provider_proposal");
  assert.equal(result.card.authority.autoMint, false);
  const chat = requests.find((item) => item.path === "/api/chat");
  assert.equal(chat.body.stream, false);
  assert.equal(chat.body.options.temperature, 0);
  assert.equal(chat.body.model, "fixture-model");
});

test("remote and credential-bearing provider endpoints are rejected before invocation", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "hapa-context-endpoint-"));
  const service = fixture(root);
  const packet = await service.freezePacket(packetRequest());
  for (const endpoint of ["https://models.example.com", "http://user:secret@127.0.0.1:11434", "http://127.0.0.1:11434?token=secret"]) {
    await assert.rejects(() => service.generate({ packetId: packet.packetId, mode: "ollama_local", modelId: "x", endpoint, instruction: "Test", actor: { actorId: "calder", actorType: "human", displayName: "Calder" } }), (error) => ["remote_provider_not_allowed", "context_generation_rejected"].includes(error.code));
  }
});
