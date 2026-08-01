import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [panel, css] = await Promise.all([
  readFile(new URL("../src/components/EchoRecordGardenAcceptancePanel.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
]);

function between(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `${startNeedle} exists`);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.notEqual(end, -1, `${endNeedle} exists after ${startNeedle}`);
  return source.slice(start, end);
}

test("acceptance binds the actually loaded production chunk at review start and finish", () => {
  const proof = between(
    panel,
    "export async function captureLoadedRecordGardenDeliveryProof",
    "function assertBrowserDeliveryMatchesContext",
  );
  assert.match(panel, /ACCEPTANCE_PANEL_MODULE_URL = import\.meta\.url/);
  assert.match(proof, /RECORD_GARDEN_CHUNK_NAME\.test\(componentChunkFile\)/);
  assert.match(proof, /fetch\(componentUrl\.href,[\s\S]*cache: "no-store"/);
  assert.match(proof, /crypto\.subtle\.digest\("SHA-256", bytes\)/);
  assert.match(proof, /const sanitizedComponentUrl = `\$\{componentUrl\.origin\}\$\{componentUrl\.pathname\}`/);
  assert.match(proof, /origin: pageUrl\.origin,[\s\S]*path: componentUrl\.pathname,[\s\S]*url: sanitizedComponentUrl,[\s\S]*sha256: componentChunkSha256/);
  assert.doesNotMatch(proof, /pageHref|pageUrl\.search|pageUrl\.href/);
  assert.match(panel, /assertBrowserDeliveryMatchesContext\(loadedDelivery, context\)/);
  assert.match(panel, /assertSameBrowserDelivery\(browserDeliveryStart, browserDeliveryEnd\)/);
  assert.match(panel, /browserDeliveryStart,[\s\S]*browserDeliveryEnd,[\s\S]*\}\),/);
  assert.match(panel, /FINAL_CAPTURE_SIGNAL_IDS = new Set\(\["browser-chunk", "review-timeline"\]\)/);
  assert.match(panel, /!evaluation\.canRecordPass && !passReadyForFinalCapture/);

  const save = between(panel, "const saveReceipt = async", "const openPanel =");
  assert.ok(
    save.indexOf("const finalDiagnostics = captureRuntimeDiagnostics()")
      < save.indexOf("const contextEnd = await fetchAcceptanceContext(base)"),
    "runtime diagnostics are frozen before the final server context request",
  );
});

test("acceptance stops telemetry on every review exit", () => {
  for (const reason of [
    "panel-closed",
    "panel-unmounted",
    "review-cancelled",
    "review-restarted",
    "receipt-save-requested",
  ]) {
    assert.match(panel, new RegExp(`stopAcceptanceRun\\(\"${reason}\"\\)`));
  }
  assert.match(panel, /run\.running = false/);
  assert.match(panel, /disabled=\{!reviewRunning \|\| busy\}/);
});

test("acceptance avoids storing a browser fingerprint by default", () => {
  assert.doesNotMatch(panel, /navigator\?\.userAgent/);
  assert.match(panel, /browserDevice: "Current browser and device"/);
});

test("acceptance dialog traps and restores keyboard focus", () => {
  assert.match(panel, /role="dialog"/);
  assert.match(panel, /aria-modal="true"/);
  assert.match(panel, /aria-labelledby=\{RECORD_GARDEN_REVIEW_TITLE_ID\}/);
  assert.match(panel, /tabIndex=\{-1\}/);
  assert.match(panel, /event\.key === "Escape"/);
  assert.match(panel, /event\.key !== "Tab"/);
  assert.match(panel, /panel\.querySelectorAll\(FOCUSABLE_SELECTOR\)/);
  assert.match(panel, /addEventListener\("focusin", handleFocusIn, true\)/);
  assert.match(panel, /restoreTarget\.focus\(\{ preventScroll: true \}\)/);
  assert.match(panel, /aria-controls="echo-record-review-panel"/);
  assert.match(panel, /className="echo-record-review-backdrop"/);
  assert.match(css, /\.echo-record-review-backdrop \{[\s\S]*inset: 0;/);
});

test("acceptance statuses and controls remain textual, readable, and touch-sized", () => {
  assert.match(panel, /signal\.pass \? "Passed" : "Not yet"/);
  assert.match(panel, /role="listitem"/);
  assert.match(css, /\.echo-record-review-panel > header button \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
  assert.match(css, /\.echo-record-review-check button \{[\s\S]*min-height: 44px;/);
  assert.match(css, /\.echo-record-review-progress span \{[\s\S]*font-size: 11px;/);
  assert.match(css, /\.echo-record-review-fields :is\(input, textarea\) \{[\s\S]*font: 13px\/1\.45/);
});
