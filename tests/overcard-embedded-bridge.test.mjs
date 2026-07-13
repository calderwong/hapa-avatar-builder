import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { EMBED_PROTOCOL, EMBED_SCHEMAS, allowedEmbedOrigins, authorizeEmbeddedAction, negotiateEmbeddedHandshake, projectEmbeddedContext } from "../src/overcard/embeddedBridge.js";

const avatar = { schema: "hapa.entity-ref.v2", sourceSystem: "hapa-avatar-builder", entityType: "avatar", entityId: "red", revision: "7", availability: "available", label: "Red", resolver: { uri: "private" }, capabilityIds: ["process.manage"] };
const attachment = { id: "a-bank", revision: 3, entity: avatar, host: { nodeId: "hapa-avatar-builder", hostId: "bank", socketId: "filter" }, mode: "view-context", role: "filter", status: "active", provenance: { source: "private-path" }, bindingId: "private-binding" };
const hello = { schema: EMBED_SCHEMAS.handshake, protocol: EMBED_PROTOCOL, version: 1, surfaceId: "bank", nonce: "nonce-1", capabilities: ["context.read"], actions: [] };

test("unknown origin, schema, version, surface, capability, and action fail closed", () => {
  const options = { origin: "https://evil.example", allowedOrigins: ["http://127.0.0.1:8787"], attachments: { [attachment.id]: attachment }, sessionId: "session-1" };
  assert.equal(negotiateEmbeddedHandshake(hello, options).code, "origin_denied");
  assert.equal(negotiateEmbeddedHandshake({ ...hello, schema: "evil" }, { ...options, origin: options.allowedOrigins[0] }).code, "schema_denied");
  assert.equal(negotiateEmbeddedHandshake({ ...hello, version: 2 }, { ...options, origin: options.allowedOrigins[0] }).code, "version_denied");
  assert.equal(negotiateEmbeddedHandshake({ ...hello, surfaceId: "finance-admin" }, { ...options, origin: options.allowedOrigins[0] }).code, "surface_denied");
  assert.equal(negotiateEmbeddedHandshake({ ...hello, capabilities: ["authority.grant"] }, { ...options, origin: options.allowedOrigins[0] }).code, "capability_denied");
  const session = { sessionId: "session-1", surfaceId: "bank", grantedActions: [] };
  assert.equal(authorizeEmbeddedAction({ schema: EMBED_SCHEMAS.action, protocol: EMBED_PROTOCOL, version: 1, surfaceId: "bank", sessionId: "session-1", requestId: "r", action: "transfer.money", args: {} }, session).code, "action_denied");
});

test("Bank is read-only until it advertises the one approved view action", () => {
  const options = { origin: "http://127.0.0.1:8787", allowedOrigins: ["http://127.0.0.1:8787"], attachments: { [attachment.id]: attachment }, sessionId: "session-1" };
  const readOnly = negotiateEmbeddedHandshake(hello, options); assert.equal(readOnly.accepted, true); assert.equal(readOnly.readOnly, true); assert.deepEqual(readOnly.grantedActions, []);
  const filtered = negotiateEmbeddedHandshake({ ...hello, actions: ["view.filter", "transfer.money"] }, options); assert.equal(filtered.readOnly, false); assert.deepEqual(filtered.grantedActions, ["view.filter"]);
  const request = { schema: EMBED_SCHEMAS.action, protocol: EMBED_PROTOCOL, version: 1, surfaceId: "bank", sessionId: "session-1", requestId: "r", action: "view.filter", args: { entityId: "red" } };
  assert.equal(authorizeEmbeddedAction(request, filtered).accepted, true);
  assert.equal(authorizeEmbeddedAction({ ...request, args: { token: "leak" } }, filtered).code, "unsafe_args");
});

test("phone and embed context are minimum safe projections", () => {
  const phone = { ...attachment, id: "a-phone", host: { nodeId: "hapa-avatar-builder", hostId: "phone", socketId: "context" }, mode: "process-context" };
  const context = projectEmbeddedContext("phone", { [phone.id]: phone }); assert.equal(context.attachments.length, 1);
  assert.deepEqual(Object.keys(context.attachments[0]).sort(), ["attachmentId", "entity", "mode", "revision", "role", "socketId", "status"]);
  assert.deepEqual(Object.keys(context.attachments[0].entity).sort(), ["availability", "entityId", "entityType", "label", "revision", "schema", "sourceSystem"]);
  for (const forbidden of ["bindingId", "provenance", "capabilityIds", "resolver"]) assert.equal(JSON.stringify(context).includes(forbidden), false);
  assert.deepEqual(allowedEmbedOrigins("http://127.0.0.1:8787", "https://trusted.example, javascript:bad"), ["http://127.0.0.1:8787", "https://trusted.example"]);
});

test("the live Builder root installs one origin-checked bridge without store access", async () => {
  const [main, bridge] = await Promise.all([readFile(new URL("../src/main.jsx", import.meta.url), "utf8"), readFile(new URL("../src/overcard/BuilderEmbeddedOvercardBridge.jsx", import.meta.url), "utf8")]);
  assert.match(main, /<BuilderEmbeddedOvercardBridge \/>/); assert.match(bridge, /window\.addEventListener\("message"/); assert.match(bridge, /event\.origin/); assert.match(bridge, /event\.source\.postMessage\(result, event\.origin\)/); assert.doesNotMatch(bridge, /useOvercardSnapshot|useOvercardStore/);
});
