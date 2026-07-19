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
  assert.match(electron, /url\.pathname === "\/v1\/focus"[\s\S]*ensureMainWindow\(\)[\s\S]*focusMainWindow\(\)[\s\S]*hapa-avatar-builder-desktop/);
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

test("dedicated launcher serializes preparation, fast-opens healthy UI, and reserves port 8799", async () => {
  const candidates = launcher.match(/port_candidates=\(([^)]+)\)/)?.[1] || "";
  assert.doesNotMatch(candidates, /\b8799\b/);
  assert.match(launcher, /LAUNCH_LOCK_DIR/);
  assert.match(launcher, /acquire_launch_lock\(\)/);
  assert.match(launcher, /Another Avatar Builder launch is preparing; waiting instead of starting a competing build/);
  assert.match(launcher, /Healthy canonical Hapa UI is already ready[\s\S]*skipping rebuild/);
  assert.match(launcher, /Canonical port \$CANONICAL_PORT is owned and listening but busy; preserving it and opening the Builder instead of rebuilding or restarting/);
  assert.ok(launcher.indexOf("wait_for_hapa_endpoint \"$CANONICAL_PORT\"") < launcher.indexOf("npm run build"));
  assert.match(launcher, /HAPA_AVATAR_FORCE_REBUILD/);
  assert.match(launcher, /HAPA_AVATAR_REPLACE_DESKTOP/);
  assert.match(launcher, /focus_existing_desktop\(\)/);
  assert.match(launcher, /Focused the existing Hapa Avatar Builder window through its loopback desktop control/);
  assert.ok(launcher.indexOf("if focus_existing_desktop") < launcher.indexOf("npm run desktop 2>&1"));
  assert.match(launcher, /Preserving any existing Avatar Builder window; Electron will focus it on a repeat launch/);
  assert.match(launcher, /release_launch_lock[\s\S]*npm run desktop 2>&1 \| \/usr\/bin\/awk/);
  assert.match(launcher, /HAPA_AVATAR_PROBE_TIMEOUT_SECONDS:-5/);
  assert.match(launcher, /HAPA_AVATAR_MAX_DESKTOP_LOG_BYTES:-20971520/);
  assert.match(launcher, /rotate_log_if_large "\$LOG_FILE"/);
  assert.match(launcher, /Repeated Metal pipeline errors suppressed after five samples/);
  assert.match(launcher, /ELECTRON_LOG_FILE/);
  assert.match(launcher, /desktop_process_pids\(\)/);
  assert.match(launcher, /is_owned_desktop_process\(\)/);
  assert.match(launcher, /kill -TERM/);
  assert.match(launcher, /Force-stopping unresponsive Hapa Avatar Builder desktop process/);
  assert.match(launcher, /kill -KILL/);
  assert.doesNotMatch(launcher, /Stopping stale Hapa desktop server process/);
  assert.doesNotMatch(launcher, /ps -axo pid=,command= \| while/);
  assert.match(launcher, /echoDeliveryFreshness/);
  assert.match(launcher, /echo_freshness\.get\("ok"\) is True/);
  await exec("/bin/zsh", ["-n", launcherPath.pathname]);
});
