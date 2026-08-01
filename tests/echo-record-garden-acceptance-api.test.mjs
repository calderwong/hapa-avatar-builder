import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { saveEchoRecordGardenAcceptanceReceipt } from "../server/echo-record-garden-acceptance-store.mjs";

const [api, panel, component, storeSource] = await Promise.all([
  readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
  readFile(new URL("../src/components/EchoRecordGardenAcceptancePanel.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url), "utf8"),
  readFile(new URL("../server/echo-record-garden-acceptance-store.mjs", import.meta.url), "utf8"),
]);

function routeSlice(pathname, nextPathname) {
  const start = api.indexOf(`pathname === "${pathname}"`);
  assert.notEqual(start, -1, `${pathname} route is registered`);
  const end = nextPathname ? api.indexOf(`pathname === "${nextPathname}"`, start + 1) : start + 4_000;
  return api.slice(start, end > start ? end : start + 4_000);
}

test("acceptance context and receipt routes require a trusted admin session", () => {
  const contextRoute = routeSlice(
    "/api/echos/record-garden/acceptance-context",
    "/api/echos/record-garden/acceptance-receipts",
  );
  const receiptRoute = routeSlice(
    "/api/echos/record-garden/acceptance-receipts",
    "/api/echos/kanban",
  );
  assert.match(contextRoute, /if \(!requireAdmin\(req, res\)\) return/);
  assert.match(receiptRoute, /if \(!requireAdmin\(req, res\)\) return/);
  assert.match(contextRoute, /Cache-Control", "no-store"/);
  assert.match(receiptRoute, /Cache-Control", "no-store"/);
});

test("acceptance receipt POST is bounded JSON and cannot mutate the Kanban", () => {
  const route = routeSlice(
    "/api/echos/record-garden/acceptance-receipts",
    "/api/echos/kanban",
  );
  assert.match(route, /application\\\/json/);
  assert.match(route, /readRawBody\(req, 64 \* 1024\)/);
  assert.match(route, /verifyEchoRecordGardenAcceptanceContext\(input\.contextStart\)/);
  assert.match(route, /contextStart, contextEnd: context/);
  assert.match(route, /contextEnd: context/);
  assert.match(route, /boardMutated: false/);
  assert.doesNotMatch(route, /receiptPath: result\.receiptPath/);
  assert.doesNotMatch(route, /error\?\.message|error\?\.details|String\(error\)/);
  assert.doesNotMatch(route, /KANBAN|kanban|events\.ndjson|appendFile|writeFile/);
});

test("server context binds human evidence to the exact fresh delivery and verification ledger", () => {
  const start = api.indexOf("const ECHO_RECORD_GARDEN_ACCEPTANCE_CONTEXT_SCHEMA");
  const end = api.indexOf("const execFileAsync", start);
  const contextBuilder = api.slice(start, end);
  assert.match(contextBuilder, /inspectEchoDeliveryRuntimeBuildIdentity\(\{[\s\S]*strict: true,[\s\S]*refresh: true/);
  assert.match(contextBuilder, /currentEchoServerBootFreshness\(\)/);
  assert.match(contextBuilder, /canonicalImplementationRevision/);
  assert.match(contextBuilder, /recordGardenChunk\.file/);
  assert.match(contextBuilder, /recordGardenChunk\.sha256/);
  assert.match(contextBuilder, /deliveryReceipt\.sourceSha256/);
  assert.match(contextBuilder, /deliveryReceipt\.servedBundleSha256/);
  assert.match(contextBuilder, /deliveryReceipt\.semanticSha256/);
  assert.match(contextBuilder, /record_garden_verification_ledger_stale/);
  assert.match(contextBuilder, /verificationLedgerSha256/);
  assert.match(contextBuilder, /serverDeliveryBuildSha256: freshness\.bootSha256/);
  assert.match(contextBuilder, /deliveryReceiptFileSha256/);
  assert.match(contextBuilder, /bootSha256/);
  assert.match(contextBuilder, /EchoRecordGarden3DView-/);
  assert.match(contextBuilder, /createHmac\("sha256", ECHO_RECORD_GARDEN_ACCEPTANCE_CONTEXT_SIGNING_KEY\)/);
  assert.match(contextBuilder, /contextProof/);
  assert.match(contextBuilder, /ECHO_RECORD_GARDEN_ACCEPTANCE_CONTEXT_MAX_AGE_MS/);
  assert.match(contextBuilder, /timingSafeTextEqual\(signature, expected\)/);
});

test("acceptance routes expose only fixed safe errors", () => {
  const contextRoute = routeSlice(
    "/api/echos/record-garden/acceptance-context",
    "/api/echos/record-garden/acceptance-receipts",
  );
  const receiptRoute = routeSlice(
    "/api/echos/record-garden/acceptance-receipts",
    "/api/echos/kanban",
  );
  assert.match(contextRoute, /recordGardenAcceptanceRouteError/);
  assert.match(receiptRoute, /recordGardenAcceptanceRouteError/);
  for (const route of [contextRoute, receiptRoute]) {
    assert.doesNotMatch(route, /error\?\.message|error\?\.details|String\(error\)/);
  }
});

test("the review-only panel remains manual, same-origin, and separate from board closeout", () => {
  assert.match(panel, /recordGardenReview"\) === "1"/);
  assert.match(panel, /\/api\/local-ui-session/);
  assert.match(panel, /credentials: "same-origin"/);
  assert.match(panel, /\/api\/echos\/record-garden\/acceptance-context/);
  assert.match(panel, /\/api\/echos\/record-garden\/acceptance-receipts/);
  assert.match(panel, /Save passing receipt/);
  assert.match(panel, /Save issue receipt/);
  assert.match(panel, /!evaluation\.canRecordPass/);
  assert.match(panel, /never mints, publishes, or closes a board card/i);
  assert.doesNotMatch(panel, /\.click\(|playwright|webdriver|puppeteer/);
  assert.match(component, /acceptanceSnapshot/);
  assert.match(component, /gl\.readPixels/);
  assert.match(component, /recordChanges/);
  assert.match(component, /cardEvidence/);
  assert.match(storeSource, /flag: "wx"|open\(temporaryPath, "wx"/);
  assert.match(storeSource, /await temporaryHandle\.sync\(\)/);
  assert.match(storeSource, /await link\(temporaryPath, receiptPath\)/);
  assert.match(storeSource, /browserDeliveryStart: input\.browserDeliveryStart/);
  assert.match(storeSource, /browserDeliveryEnd: input\.browserDeliveryEnd/);
});

function failureInput() {
  return {
    result: "fail",
    draft: {
      operator: "Local operator",
      observedAt: "2026-08-01T12:00:00.000Z",
      notes: "A display surface remained blank during the review.",
      checks: { "desktop-layout": "fail" },
    },
    diagnostics: {
      acceptanceRun: {
        startedAt: "2026-08-01T11:55:00.000Z",
        running: false,
      },
    },
  };
}

test("acceptance receipts embed full integrity, retain stable replay identity, and reject tampering", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "record-garden-receipt-integrity-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = failureInput();
  const first = await saveEchoRecordGardenAcceptanceReceipt({
    root,
    input,
    receivedAt: "2026-08-01T12:01:00.000Z",
  });
  assert.match(first.receipt.integrity.observationSha256, /^sha256:[a-f0-9]{64}$/);
  assert.match(first.receipt.integrity.persistedContentSha256, /^sha256:[a-f0-9]{64}$/);
  const observationDigest = first.receipt.integrity.observationSha256.slice("sha256:".length);
  assert.equal(path.basename(first.receiptPath).endsWith(`-${observationDigest}.json`), true);

  const replay = await saveEchoRecordGardenAcceptanceReceipt({
    root,
    input,
    receivedAt: "2026-08-01T12:02:00.000Z",
  });
  assert.equal(replay.idempotentReplay, true);
  assert.equal(replay.receiptPath, first.receiptPath);
  assert.equal(replay.receipt.integrity.persistedContentSha256, first.receipt.integrity.persistedContentSha256);

  const tampered = JSON.parse(await readFile(first.receiptPath, "utf8"));
  tampered.receivedAt = "2026-08-01T12:03:00.000Z";
  await writeFile(first.receiptPath, `${JSON.stringify(tampered, null, 2)}\n`, { mode: 0o600 });
  await assert.rejects(
    saveEchoRecordGardenAcceptanceReceipt({ root, input }),
    (error) => error?.code === "acceptance_receipt_integrity_invalid",
  );
});

test("acceptance receipt replay rejects a symlink at the immutable receipt path", async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), "record-garden-receipt-symlink-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = failureInput();
  const first = await saveEchoRecordGardenAcceptanceReceipt({ root, input });
  const targetPath = path.join(root, "untrusted-receipt.json");
  await writeFile(targetPath, await readFile(first.receiptPath), { mode: 0o600 });
  await unlink(first.receiptPath);
  await symlink(targetPath, first.receiptPath);
  await assert.rejects(
    saveEchoRecordGardenAcceptanceReceipt({ root, input }),
    (error) => error?.code === "acceptance_receipt_path_invalid",
  );
});
