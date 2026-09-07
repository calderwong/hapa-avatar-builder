import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Human Enricher exposes independently refreshed, truth-bounded agent telemetry", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../src/components/HumanEnricherView.jsx", import.meta.url), "utf8"),
    readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /setInterval\(refreshOpticalCampaign, 4_000\)/);
  assert.match(source, /Array\.isArray\(campaign\?\.workers\)/);
  assert.match(source, /First · Mid · Last optical \+ palette campaign/);
  assert.match(source, /Full catalog resolved/);
  assert.match(source, /Direct optical \+ palette complete/);
  assert.match(source, /compliantOpticalReviews/);
  assert.doesNotMatch(source, /dashboardSummary\?\.agentReviewed/);
  assert.match(source, /legacy palette repairs/);
  assert.match(source, /missing-frame deferrals/);
  assert.match(source, /Campaign planned/);
  assert.match(source, /Planned work submitted/);
  assert.match(source, /Assignment unavailable/);
  assert.match(source, /Progress unavailable/);
  assert.match(source, /Lease freshness unavailable/);
  assert.match(source, /Agent identity unavailable/);
  assert.match(source, /formatPassAccounting/);
  assert.match(source, /inputTokens/);
  assert.match(source, /outputTokens/);
  assert.match(source, /packetRecords/);
  assert.match(source, /budget stopped/);
  assert.match(source, /MINIMAL OPTICAL PASS/);
  assert.match(source, /Overall description/);
  assert.match(source, /First · Middle · Last/);
  assert.doesNotMatch(source, /REFERENCE PASS · BOUNDED HAPA CARDS/);
  assert.match(source, /\["first", "mid", "last"\]/);
  assert.match(css, /\.human-agent-telemetry\s*\{/);
  assert.match(css, /\.human-agent-worker-grid\s*\{/);
  assert.match(css, /\.human-agent-frame-progress\s*\{/);
});
