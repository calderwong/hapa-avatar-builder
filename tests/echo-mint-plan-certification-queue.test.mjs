import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  createEchoMintPlanCertificationQueue,
  readFreshEchoPlanCertificationBlockers,
} from "../server/echo-mint-plan-certification-queue.mjs";

test("different saved plans certify serially while duplicate starts share one job", async () => {
  const queue = createEchoMintPlanCertificationQueue();
  let active = 0;
  let maximumActive = 0;
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  let firstRuns = 0;
  const task = (name, gate = Promise.resolve()) => async () => {
    if (name === "first") firstRuns += 1;
    active += 1;
    maximumActive = Math.max(maximumActive, active);
    await gate;
    active -= 1;
    return name;
  };
  const first = queue.run("plan:first", task("first", firstGate));
  const duplicate = queue.run("plan:first", task("duplicate"));
  const second = queue.run("plan:second", task("second"));
  assert.equal(first, duplicate);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(active, 1);
  releaseFirst();
  assert.deepEqual(await Promise.all([first, duplicate, second]), ["first", "first", "second"]);
  assert.equal(firstRuns, 1);
  assert.equal(maximumActive, 1);
});

test("a failed certification does not poison the serial tail and its key can retry once", async () => {
  const queue = createEchoMintPlanCertificationQueue();
  let failedRuns = 0;
  let followingRuns = 0;
  const failed = queue.run("plan:failed", () => {
    failedRuns += 1;
    throw new Error("fixture failure");
  });
  const following = queue.run("plan:following", async () => {
    followingRuns += 1;
    return "ready";
  });
  await assert.rejects(failed, /fixture failure/u);
  assert.equal(await following, "ready");
  assert.equal(queue.size, 0);
  const retried = await queue.run("plan:failed", async () => {
    failedRuns += 1;
    return "retried";
  });
  assert.equal(retried, "retried");
  assert.equal(failedRuns, 2);
  assert.equal(followingRuns, 1);
});

test("automatic certification surfaces blockers only from a fresh exact-plan report", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-plan-cert-report-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const reportPath = path.join(root, "report.json");
  const planId = `plan:${"a".repeat(32)}`;
  const planSha256 = `sha256:${"b".repeat(64)}`;
  const startedAtMs = Date.now() - 100;
  fs.writeFileSync(reportPath, JSON.stringify({
    schemaVersion: "hapa.echo.album-render-readiness.v1",
    source: { selection: { mode: "targeted-exact-plan", planId, planSha256 } },
    summary: { status: "blocked" },
    blockers: [{ stage: "visual-media-decode", code: "media-decode-failed", songId: "song", cutId: planId, message: "One source video cannot decode." }],
    cuts: [{ cutId: planId, cutKind: "saved-mint-plan", cutFingerprint: planSha256, blockers: [] }],
  }));
  const fresh = readFreshEchoPlanCertificationBlockers({ reportPath, planId, planSha256, startedAtMs });
  assert.equal(fresh.blockers[0].message, "One source video cannot decode.");

  const mismatch = readFreshEchoPlanCertificationBlockers({
    reportPath,
    planId,
    planSha256: `sha256:${"c".repeat(64)}`,
    startedAtMs,
  });
  assert.equal(mismatch, null);

  fs.writeFileSync(reportPath, JSON.stringify({
    schemaVersion: "hapa.echo.album-render-readiness.v1",
    source: { selection: { mode: "targeted-exact-plan", planId, planSha256 } },
    summary: { status: "blocked" },
    blockers: [{ stage: "global-input", code: "server-restart-required", message: "Restart the Builder to load the current certifier." }],
    cuts: [],
  }));
  const global = readFreshEchoPlanCertificationBlockers({ reportPath, planId, planSha256, startedAtMs });
  assert.equal(global.blockers[0].code, "server-restart-required");

  const old = new Date(Date.now() - 60_000);
  fs.utimesSync(reportPath, old, old);
  assert.equal(readFreshEchoPlanCertificationBlockers({ reportPath, planId, planSha256, startedAtMs }), null);
});
