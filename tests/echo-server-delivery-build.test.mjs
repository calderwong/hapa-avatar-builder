import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  inspectEchoServerBootFreshness,
  inspectEchoServerDeliveryBuildIdentity,
} from "../server/echo-server-delivery-build.mjs";

test("server boot identity fails closed after edits, additions, or removals until restart", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "echo-server-boot-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "server"), { recursive: true });
  fs.mkdirSync(path.join(root, "src/domain"), { recursive: true });
  fs.mkdirSync(path.join(root, "scripts"), { recursive: true });
  fs.writeFileSync(path.join(root, "server/api.mjs"), "export const api = 1;\n");
  fs.writeFileSync(path.join(root, "server/render.mjs"), "export const render = 1;\n");
  fs.writeFileSync(path.join(root, "src/domain/echo.js"), "export const echo = 1;\n");
  fs.writeFileSync(path.join(root, "scripts/preflight-echo-render-readiness.mjs"), "export const certifier = 1;\n");

  const boot = inspectEchoServerDeliveryBuildIdentity({ root });
  assert.equal(inspectEchoServerBootFreshness(boot, { root, refresh: true }).ok, true);
  fs.writeFileSync(path.join(root, "scripts/preflight-echo-render-readiness.mjs"), "export const certifier = 2;\n");
  assert.equal(inspectEchoServerBootFreshness(boot, { root, refresh: true }).reason, "server_restart_required");

  const restartedAfterCertifier = inspectEchoServerDeliveryBuildIdentity({ root });
  fs.writeFileSync(path.join(root, "server/render.mjs"), "export const render = 2;\n");
  assert.equal(inspectEchoServerBootFreshness(restartedAfterCertifier, { root, refresh: true }).reason, "server_restart_required");

  const restarted = inspectEchoServerDeliveryBuildIdentity({ root });
  assert.equal(inspectEchoServerBootFreshness(restarted, { root, refresh: true }).ok, true);
  fs.writeFileSync(path.join(root, "server/new-adapter.mjs"), "export const adapter = 1;\n");
  assert.equal(inspectEchoServerBootFreshness(restarted, { root, refresh: true }).reason, "server_restart_required");

  const restartedAgain = inspectEchoServerDeliveryBuildIdentity({ root });
  fs.rmSync(path.join(root, "src/domain/echo.js"));
  assert.equal(inspectEchoServerBootFreshness(restartedAgain, { root, refresh: true }).reason, "server_restart_required");
});
