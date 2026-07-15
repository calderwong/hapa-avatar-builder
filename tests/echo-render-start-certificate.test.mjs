import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  canonicalEchoExecutionPublicationIdentity,
  createEchoRenderStartCertificateBinding,
} from "../server/echo-render-start-certificate.mjs";

const sha = (character) => `sha256:${character.repeat(64)}`;
const planId = `plan:${"a".repeat(32)}`;
const planSha256 = sha("b");

function resolvedReceipt(receiptSha256 = sha("c")) {
  return {
    sourceHash: sha("d"),
    cutId: planId,
    cutKind: "saved-mint-plan",
    cutFingerprint: planSha256,
    executionGraph: {
      receiptSchemaVersion: "hapa.echo.execution-graph-receipt.v2",
      receiptSha256,
      parentGraphSha256: sha("e"),
      outputGraphSha256: sha("f"),
      cutKind: "saved-mint-plan",
      cutFingerprint: planSha256,
      registries: {
        shaderCatalogSha256: sha("1"),
        proxyRegistrySha256: sha("2"),
        songRegistrySha256: sha("3"),
        songbookSha256: sha("4"),
      },
      rendererBuildSha256: sha("5"),
      deliveryRuntimeBuildSha256: sha("6"),
      serverDeliveryBuildSha256: sha("7"),
      certifierSourceSha256: sha("8"),
      visualInputCount: 17,
      proxyInputCount: 4,
      pointer: {
        schemaVersion: "hapa.echo.execution-graph-pointer.v1",
        status: "ready",
        songId: "fixture-song",
        cutId: planId,
        cutKind: "saved-mint-plan",
        cutFingerprint: planSha256,
        artifactId: "9".repeat(64),
        parentGraphSha256: sha("e"),
        executionGraphPath: "artifacts/fixture/show-graph.json",
        executionGraphSha256: sha("f"),
        receiptPath: "artifacts/fixture/receipt.json",
        receiptSha256,
        variantId: "variant:fixture",
        variantHash: "0".repeat(64),
      },
    },
  };
}

test("render-start certificate changes when immutable publication evidence is republished with the same graph and counts", () => {
  const first = createEchoRenderStartCertificateBinding({
    candidateId: "candidate:fixture",
    planId,
    planSha256,
    receipt: resolvedReceipt(sha("c")),
  });
  const republished = createEchoRenderStartCertificateBinding({
    candidateId: "candidate:fixture",
    planId,
    planSha256,
    receipt: resolvedReceipt(sha("a")),
  });

  assert.notEqual(first.certificateSha256, republished.certificateSha256);
  assert.notEqual(first.publicationIdentitySha256, republished.publicationIdentitySha256);
  assert.equal(first.publicationIdentity.executionGraphSha256, republished.publicationIdentity.executionGraphSha256);
  assert.equal(first.publicationIdentity.receiptSha256, sha("c"));
  assert.equal(republished.publicationIdentity.receiptSha256, sha("a"));
  assert.deepEqual(Object.keys(first.publicationIdentity), [
    "schemaVersion",
    "pointerSchemaVersion",
    "receiptSchemaVersion",
    "artifactId",
    "cutId",
    "cutKind",
    "cutFingerprint",
    "parentGraphSha256",
    "executionGraphSha256",
    "receiptSha256",
    "variantId",
    "variantHash",
  ]);
  assert.equal(JSON.stringify(first.publicationIdentity).includes("receiptPath"), false);
  assert.equal(JSON.stringify(first.publicationIdentity).includes("executionGraphPath"), false);
});

test("publication identity rejects pointer/receipt drift instead of certifying an unverified digest", () => {
  const receipt = resolvedReceipt(sha("c"));
  receipt.executionGraph.receiptSha256 = sha("a");
  assert.throws(
    () => canonicalEchoExecutionPublicationIdentity(receipt.executionGraph, {
      expectedCutId: planId,
      expectedCutKind: "saved-mint-plan",
      expectedCutFingerprint: planSha256,
    }),
    /disagree about the receipt identity/u,
  );

  const wrongCut = resolvedReceipt();
  wrongCut.executionGraph.pointer.cutId = `plan:${"d".repeat(32)}`;
  assert.throws(
    () => createEchoRenderStartCertificateBinding({
      candidateId: "candidate:fixture",
      planId,
      planSha256,
      receipt: wrongCut,
    }),
    /different cut ID/u,
  );
});

test("the local render-start API publishes and rechecks the immutable execution publication", () => {
  const source = fs.readFileSync(new URL("../server/api.mjs", import.meta.url), "utf8");
  assert.match(source, /executionReceiptSha256: certified\.executionPublication\.receiptSha256/u);
  assert.match(source, /expectedExecutionPublicationSha256: certified\.executionPublicationSha256/u);
  assert.match(source, /certificateBinding\.publicationIdentitySha256 !== expectedExecutionPublicationSha256/u);
});
