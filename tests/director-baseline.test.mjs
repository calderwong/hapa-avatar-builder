import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("Echo Director baseline remains machine-readable and truth-focused", () => {
  const baselinePath = "./artifacts/echo-director-v2/baseline.json";
  assert.ok(fs.existsSync(baselinePath), "run scripts/audit-echo-director-v2.mjs before regression tests");
  const report = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
  assert.equal(report.schemaVersion, "hapa.echo.director-baseline.v2");
  assert.equal(report.mutationMode, "read-only");
  assert.ok(report.summary.projects >= 79);
  assert.ok(report.summary.shots > 0);
  assert.ok(report.summary.visualizerSegments > 0);
  assert.ok(report.summary.projectBytes > 0);
  assert.ok(report.summary.mediaBytes > 0);
  assert.equal(report.summary.visualizerFieldCoverage.inputs, 0, "v1 source plans remain unhydrated until migrated to Director v2");
  assert.equal(report.summary.visualizerFieldCoverage.audioMap, 0, "v1 source plans remain unhydrated until migrated to Director v2");
  assert.ok(report.summary.provenanceStatuses.generated_placeholder > 0);
});
