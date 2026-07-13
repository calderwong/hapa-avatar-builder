import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { classifyTelemetryProjection } from "@hapa/overcard/core";
import { buildAttachmentNavigation } from "../src/overcard/deepLinks.js";

const attachment = { id: "a", revision: 5, entity: { sourceSystem: "hapa-avatar-builder", entityType: "avatar", entityId: "red", revision: "7" }, host: { nodeId: "hapa-dev-proto", hostId: "hell-week", processId: "hell-week" }, bindingId: "binding-red", provenance: { traceId: "trace-red" } };
test("every attachment resolves source, binding, process, and bounded recent safe evidence", () => {
  const links = buildAttachmentNavigation(attachment, { catalog: { red: { ...attachment.entity, detailUri: "/api/avatars/red" } }, bindings: { "binding-red": { formation: { revision: 4 } } }, processAdapter: { inspect: { uri: "/api/hell-week/capabilities" } }, telemetry: [{ id: "old", traceId: "trace-red", at: "2026-07-11T01:00:00Z", level: "info", summary: "Old" }, { id: "new", traceId: "binding-red", at: "2026-07-11T02:00:00Z", level: "info", summary: "New" }] });
  assert.equal(links.source.href, "/api/avatars/red"); assert.match(links.binding.href, /^hapa:\/\/overcard/); assert.equal(links.process.href, "/api/hell-week/capabilities"); assert.deepEqual(links.evidence.map((entry) => entry.id), ["new", "old"]);
  assert.deepEqual(Object.keys(links.evidence[0]).sort(), ["at", "href", "id", "label", "level"]);
});
test("Builder and Dev Proto mount one telemetry truth surface without duplicate badges", async () => {
  const [builder, dev] = await Promise.all([readFile(new URL("../src/main.jsx", import.meta.url), "utf8"), readFile("/Users/calderwong/Desktop/hapa-dev-proto/src/main.tsx", "utf8")]);
  assert.match(builder, /<OvercardTelemetryBadge/); assert.match(dev, /<SystemStatusBar/); assert.doesNotMatch(dev, /<OvercardTelemetryBadge/);
  const input = { connection: "online", status: "ready", entries: [], projection: { present: false, revision: 0, updatedAt: null }, now: "2026-07-11T20:00:00Z" };
  assert.equal(classifyTelemetryProjection(input).state, "absent"); assert.equal(classifyTelemetryProjection({ ...input, projection: { present: true, revision: 9, updatedAt: input.now } }).state, "healthy-zero");
});
