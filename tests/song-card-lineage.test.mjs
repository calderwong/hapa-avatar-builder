import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  appendBoundedSongCardLifecycleEvent,
  buildPrintedCardLineageReceipt,
  buildSongCardEditionLineage,
  createSongCardLifecycleEvent,
  validatePrintedCardLineageReceipt,
  validateSongCardEditionLineage,
} from "../src/domain/song-card-lineage.js";

const sha = (char) => char.repeat(64);
const stable = (value) => Array.isArray(value) ? value.map(stable) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])])) : value;
const input = (edition = 1) => ({
  headId: "song-card:dear-papa",
  edition,
  semanticFingerprint: `sha256:${sha(edition === 1 ? "1" : "2")}`,
  registryRevision: { id: "registry:dear-papa:7", revision: 7, hash: sha("a") },
  editorSnapshot: { id: `editor:${edition}`, revision: edition, graphHash: sha("b") },
  treatment: { treatmentId: "treatment:dear-papa", hash: sha("c") },
  variant: { variantId: `variant:${edition}`, variantHash: sha("d") },
  patches: edition === 1 ? [] : [{ id: "patch:swap", kind: "replace-card", hash: sha("e") }],
  showGraph: { runId: `show:${edition}`, schemaVersion: "hapa.music-viz.native-show-graph.v2", hash: sha("f") },
  artifacts: [
    { role: "master", sha256: sha("1"), byteSize: 1200, durationMs: 10_000, mimeType: "video/mp4" },
    { role: "poster", sha256: sha("2"), byteSize: 100, mimeType: "image/jpeg" },
  ],
  appearanceIndex: { indexDigest: `sha256:${sha("3")}`, intervalRule: "half-open-[startMs,endMs)", appearances: [{ appearanceId: "a", startMs: 0, endMs: 10_000, sourceDigest: `sha256:${sha("4")}` }] },
  changedFamilies: edition === 1 ? ["initial"] : ["videos", "cards"],
  incrementReason: edition === 1 ? "initial-edition" : "editor-media-swap",
  mintedAt: `2026-07-12T16:00:0${edition}Z`,
});

test("edition lineage covers every required source, artifact, temporal index, and edge", () => {
  const lineage = buildSongCardEditionLineage(input());
  assert.equal(validateSongCardEditionLineage(lineage).ok, true);
  for (const kind of ["registry-revision", "editor-snapshot", "treatment", "variant", "patch-lineage", "show-graph", "artifact", "temporal-index", "song-card-edition"]) assert.ok(lineage.nodes.some((node) => node.kind === kind), kind);
  assert.equal(lineage.nodes.filter((node) => node.kind === "artifact").length, 2);
  assert.ok(lineage.edges.some((row) => row.relation === "graph-indexed-by"));
  assert.ok(lineage.edges.some((row) => row.relation === "artifact-included-in"));
  for (const node of lineage.nodes) {
    const expected = createHash("sha256").update(JSON.stringify(stable(node.payload))).digest("hex");
    assert.equal(node.hash, `sha256:${expected}`, `${node.id} must carry a real SHA-256 digest`);
    assert.doesNotMatch(expected, /^(.{16})\1\1\1$/u, `${node.id} must not repeat a short non-cryptographic hash`);
  }
});

test("Edition 2 requires consecutive prior supersession and a material explanation", () => {
  const first = buildSongCardEditionLineage(input());
  const second = buildSongCardEditionLineage({ ...input(2), priorEdition: { id: "song-card:dear-papa:edition:1", headId: "song-card:dear-papa", edition: 1, semanticFingerprint: input().semanticFingerprint, lineageHash: first.lineageHash } });
  assert.equal(validateSongCardEditionLineage(second).ok, true);
  assert.ok(second.edges.some((row) => row.relation === "prior-edition-superseded-by"));
  assert.throws(() => buildSongCardEditionLineage(input(2)), /prior edition/i);
  assert.throws(() => buildSongCardEditionLineage({ ...input(2), changedFamilies: [], priorEdition: { edition: 1 } }), /material explanation/i);
});

test("validation fails closed for missing kinds, edges, loops, hashes, and unexplained increments", () => {
  const first = buildSongCardEditionLineage(input());
  const prior = { id: "song-card:dear-papa:edition:1", headId: "song-card:dear-papa", edition: 1, semanticFingerprint: input().semanticFingerprint, lineageHash: first.lineageHash };
  const valid = buildSongCardEditionLineage({ ...input(2), priorEdition: prior });
  const cases = [
    { mutate: (row) => { row.nodes = row.nodes.filter((node) => node.kind !== "registry-revision"); }, error: "missing-kind:registry-revision" },
    { mutate: (row) => { row.edges = row.edges.filter((edge) => edge.relation !== "graph-indexed-by"); }, error: "missing-edge:graph-indexed-by" },
    { mutate: (row) => { const last = row.nodes.filter((node) => node.kind === "artifact").at(-1); row.edges = row.edges.filter((edge) => !(edge.to === last.id && edge.relation === "graph-rendered-artifact")); }, error: "unconnected-artifact" },
    { mutate: (row) => { row.edges.push({ from: row.outputNodeId, to: row.nodes.find((node) => node.kind === "registry-revision").id, relation: "bad-loop" }); }, error: "lineage-cycle" },
    { mutate: (row) => { row.nodes.find((node) => node.kind === "artifact").payload.byteSize += 1; }, error: "node-hash-mismatch" },
    { mutate: (row) => { const output = row.nodes.find((node) => node.kind === "song-card-edition"); output.payload.changedFamilies = []; output.payload.incrementReason = ""; }, error: "unexplained-edition-increment" },
  ];
  for (const fixture of cases) {
    const broken = structuredClone(valid);
    fixture.mutate(broken);
    const result = validateSongCardEditionLineage(broken);
    assert.equal(result.ok, false);
    assert.ok(result.errors.some((error) => error.includes(fixture.error)), `${fixture.error}: ${result.errors.join(",")}`);
  }
  assert.throws(() => buildSongCardEditionLineage({ ...input(), artifacts: [{ role: "master", sha256: "not-a-hash" }] }), /SHA-256/);
});

test("printed cards are immutable children of their edition and exact historical appearance", () => {
  const lineage = buildSongCardEditionLineage(input());
  const appearance = { appearanceId: "appearance:a", sourceCardId: "tarot:a", sourceDigest: `sha256:${sha("4")}`, startMs: 0, endMs: 5000, trackId: "track-a", snapshot: { id: "tarot:a", title: "Historical A" } };
  const receipt = buildPrintedCardLineageReceipt({ lineage, appearance, timestampMs: 4999, printedCard: appearance.snapshot, printedAt: "2026-07-12T16:01:00Z" });
  assert.equal(validatePrintedCardLineageReceipt(receipt, { lineage }).ok, true);
  assert.ok(receipt.edges.some((row) => row.relation === "appearance-printed-as"));
  assert.throws(() => buildPrintedCardLineageReceipt({ lineage, appearance, timestampMs: 5000, printedCard: appearance.snapshot }), /inside/);
  const tampered = structuredClone(receipt); tampered.nodes.find((node) => node.kind === "printed-card").payload.card.title = "Current mutable title";
  assert.equal(validatePrintedCardLineageReceipt(tampered, { lineage }).ok, false);
});

test("published and revoked telemetry is append-only, idempotent, bounded, and never per-frame", () => {
  const lineage = buildSongCardEditionLineage(input());
  const published = createSongCardLifecycleEvent({ type: "published", headId: lineage.headId, edition: 1, lineageHash: lineage.lineageHash, at: "2026-07-12T16:02:00Z" });
  const revoked = createSongCardLifecycleEvent({ type: "revoked", headId: lineage.headId, edition: 1, lineageHash: lineage.lineageHash, reason: "rights correction", at: "2026-07-12T16:03:00Z" });
  let events = appendBoundedSongCardLifecycleEvent([], published);
  events = appendBoundedSongCardLifecycleEvent(events, published);
  events = appendBoundedSongCardLifecycleEvent(events, revoked);
  assert.deepEqual(events.map((row) => row.type), ["published", "revoked"]);
  assert.ok(events.every((row) => row.perFrame === false));
  assert.throws(() => appendBoundedSongCardLifecycleEvent(events, createSongCardLifecycleEvent({ type: "published", headId: lineage.headId, edition: 2, lineageHash: lineage.lineageHash }), { maxEvents: 2 }), /capacity/);
  assert.throws(() => createSongCardLifecycleEvent({ type: "revoked", headId: lineage.headId, edition: 1, lineageHash: lineage.lineageHash }), /reason/);
  assert.throws(() => createSongCardLifecycleEvent({ type: "published", headId: lineage.headId, edition: 1, lineageHash: "not-a-sha" }), /SHA-256/);
});
