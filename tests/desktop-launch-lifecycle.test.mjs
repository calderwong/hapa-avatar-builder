import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);
const electronPath = new URL("../electron/main.cjs", import.meta.url);
const launcherPath = new URL("../scripts/launch-desktop-dedicated.zsh", import.meta.url);
const [electron, launcher] = await Promise.all([
  readFile(electronPath, "utf8"),
  readFile(launcherPath, "utf8"),
]);

test("desktop shell is single-instance and a repeat launch restores the Builder window", () => {
  assert.match(electron, /app\.requestSingleInstanceLock\(\)/);
  assert.match(electron, /app\.on\("second-instance"[\s\S]*ensureMainWindow\(\)/);
  assert.match(electron, /function focusMainWindow\(\)[\s\S]*\.restore\(\)[\s\S]*\.show\(\)[\s\S]*\.focus\(\)/);
  assert.match(electron, /app\.on\("window-all-closed"[\s\S]*app\.quit\(\)/);
});

test("optional operator-console collisions cannot block the Builder UI", () => {
  assert.match(electron, /HAPA_AVATAR_OPERATOR_PORT/);
  assert.match(electron, /uniquePorts\([\s\S]*\.filter\(\(port\) => port !== OPERATOR_CONSOLE_PORT\)/);
  assert.match(electron, /server\.on\("error"/);
  assert.match(electron, /EADDRINUSE/);
  assert.match(electron, /continuing without the optional console\. The Builder UI can still launch/);
  assert.match(electron, /await startOperatorConsoleServer\(\);[\s\S]*return ensureMainWindow\(\)/);
  assert.match(electron, /before-quit[\s\S]*closeOperatorConsoleServer\(\)/);
});

test("dedicated launcher waits for owned desktop shutdown and reserves port 8799", async () => {
  const candidates = launcher.match(/port_candidates=\(([^)]+)\)/)?.[1] || "";
  assert.doesNotMatch(candidates, /\b8799\b/);
  assert.match(launcher, /desktop_process_pids\(\)/);
  assert.match(launcher, /is_owned_desktop_process\(\)/);
  assert.match(launcher, /kill -TERM/);
  assert.match(launcher, /Force-stopping unresponsive Hapa Avatar Builder desktop process/);
  assert.match(launcher, /kill -KILL/);
  assert.doesNotMatch(launcher, /ps -axo pid=,command= \| while/);
  await exec("/bin/zsh", ["-n", launcherPath.pathname]);
});
