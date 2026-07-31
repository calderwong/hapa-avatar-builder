import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [component, resolver, app, hostTargets, adapters, css] = await Promise.all([
  readFile(new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/domain/echo-record-card-resolution.js", import.meta.url), "utf8"),
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/overcard/hostTargets.js", import.meta.url), "utf8"),
  readFile(new URL("../src/overcard/processAdapters.js", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
]);

test("Record Garden is a lazy, independently routed Builder experience", () => {
  assert.match(app, /lazy\(\(\) => import\("\.\/components\/EchoRecordGarden3DView\.jsx"\)\)/);
  assert.match(app, /activeView === "echo-records"/);
  assert.match(hostTargets, /host\("echo-records", "Echo Record Garden", "record-player"/);
  assert.match(adapters, /adapter\("builder-echo-record-garden", "echo-record-garden"/);
  assert.match(adapters, /\/api\/echos\/director-projects\?summary=1/);
});

test("Record Garden exposes a stable, accessible smoke contract", () => {
  for (const testId of [
    "echo-record-garden",
    "echo-record-garden-canvas",
    "echo-record-item",
    "echo-record-player-slot",
    "echo-record-play-toggle",
    "echo-record-visual",
    "echo-record-generate-card",
    "echo-record-card-receipt",
  ]) {
    assert.match(component, new RegExp(`data-testid="${testId}"`));
  }
  assert.match(component, /aria-label="Echo State Record Garden 3D album explorer"/);
  assert.match(component, /aria-label="Record playback position"/);
  assert.match(component, /role="listbox"/);
  assert.match(component, /aria-live="polite"/);
});

test("album data stays bounded and selected-record detail is race safe", () => {
  assert.match(component, /const SCREEN_COUNT = 3/);
  assert.match(component, /director-projects\?summary=1/);
  assert.match(component, /director-project\?\$\{projectQuery\.toString\(\)\}/);
  assert.match(component, /projectQuery\.set\("variantId", latestCut\.id\)/);
  assert.match(component, /const cutRevision = latestCut\?\.fingerprint/);
  assert.match(component, /was not delivered exactly/);
  assert.match(component, /projectEchoRecordSelectedDirectorCut/);
  assert.match(component, /most recent Director cut/);
  assert.match(component, /data-testid="echo-record-director-cut"/);
  assert.match(component, /references\/tarot-cards\?songId=/);
  assert.match(component, /requestControllerRef\.current\?\.abort\(\)/);
  assert.match(component, /signal: controller\.signal/);
  assert.doesNotMatch(component, /fetch\(`\$\{[^`]*\/api\/echos\/references`/);
});

test("the turntable and surfaces share the live audio clock", () => {
  assert.match(component, /getAudioClock: \(\) =>/);
  assert.match(component, /currentTime: Number\(audio\.currentTime\)/);
  assert.match(component, /echoRecordVinylSpinRadians\(framePlayback\.currentTime/);
  assert.match(component, /rpm: ECHO_RECORD_DISPLAY_RPM/);
  assert.doesNotMatch(component, /const RECORD_RPM/);
  assert.match(component, /updateAlbumScreen\(screen, \{\s*playback: framePlayback/s);
  assert.match(component, /echoRecordVideoPlaybackPlan/);
  assert.match(component, /SCREEN_MEDIA_POOL_LIMIT = SCREEN_COUNT \* 2/);
  assert.match(component, /setScreenVideoPlaying\(resource, plan\.shouldPlay\)/);
  assert.match(component, /video\.addEventListener\("canplay", handleCanPlay\)/);
  assert.match(component, /video\.addEventListener\("waiting", handleWaiting\)/);
  assert.match(component, /mediaPool\.acquire\(visual\)/);
  assert.match(component, /const clipIdentity = mode === "audio-clock"/);
  assert.match(component, /canvas\.dataset\.recordAngle/);
});

test("visual clicks generate explicit Cards without claiming a mint", () => {
  assert.match(component, /createEchoRecordVisualCardResolver/);
  assert.match(component, /Generated attached Card:/);
  assert.match(component, /local, unminted Card projection/);
  assert.match(component, /truthStatus: resolution\.truthStatus/);
  assert.match(component, /resolution\.mode === "authoritative-edition-print"/);
  assert.match(resolver, /resolveAuthoritativeTarotSongCardPrint/);
  assert.match(resolver, /cards-at-time\?timeMs=/);
  assert.match(resolver, /surface: "echo-record-garden"/);
  assert.match(resolver, /pending\.has\(requestKey\)/);
  assert.match(resolver, /mode: "local-unminted-projection"/);
  assert.doesNotMatch(component, /fetch\([^)\n]*\/api\/[^)\n]*mint/i);
  assert.doesNotMatch(resolver, /\/api\/tarot\/cards/);
  assert.doesNotMatch(component, /confirm mint/i);
});

test("versioned scene recovery restores the full paused garden state", () => {
  assert.match(component, /ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA/);
  assert.match(component, /schemaVersion: ECHO_RECORD_GARDEN_SNAPSHOT_SCHEMA/);
  assert.match(component, /normalizeEchoRecordGardenSnapshot/);
  assert.match(component, /reconcileEchoRecordGardenSnapshot/);
  assert.match(component, /placedSongId: value\.placedSongId/);
  assert.match(component, /selectedVisualId: value\.selectedVisualId/);
  assert.match(component, /crateOrder: Array\.isArray\(value\.crateOrder\)/);
  assert.match(component, /recordTransforms: value\.recordTransforms/);
  assert.match(component, /cardJob: value\.cardJob/);
  assert.match(component, /playbackSeconds: playback\.currentTime/);
  assert.match(component, /recordTransforms: recordTransformsRef\.current/);
  assert.match(component, /const snapshot = \(\) => \{/);
  assert.match(component, /schemaVersion: "hapa\.echo-record-garden\.scene\.v2"/);
  assert.match(component, /restored on the turntable, paused/);
  assert.match(component, /previous Card request was interrupted/);
  assert.match(component, /const flushPendingGardenPreferences = useCallback/);
  assert.match(component, /pendingPreferenceRef\.current = captureGardenPreferences\(\)/);
  assert.match(component, /if \(persistenceTimerRef\.current\) return/);
  assert.match(component, /addEventListener\?\.\("pagehide", flushPendingGardenPreferences\)/);
  assert.match(component, /transform\?\.manipulated === true/);
});

test("the Three scene owns complete input and renderer lifecycle cleanup", () => {
  for (const eventName of [
    "pointerdown",
    "pointermove",
    "pointerup",
    "pointercancel",
    "lostpointercapture",
    "webglcontextlost",
    "webglcontextrestored",
  ]) {
    assert.match(component, new RegExp(`addEventListener\\("${eventName}"`));
    assert.match(component, new RegExp(`removeEventListener\\("${eventName}"`));
  }
  assert.match(component, /resizeObserver\.disconnect\(\)/);
  assert.match(component, /cancelAnimationFrame\(animationFrame\)/);
  assert.match(component, /controls\.dispose\(\)/);
  assert.match(component, /renderer\.dispose\(\)/);
  assert.match(component, /video\.removeAttribute\("src"\)/);
  assert.match(component, /visibilitychange/);
});

test("the warm outdoor shell has desktop, compact, mobile, and reduced-motion layouts", () => {
  assert.match(css, /\.echo-record-garden\s*\{/);
  assert.match(css, /@media \(max-width: 1450px\)/);
  assert.match(css, /@media \(max-width: 1080px\)/);
  assert.match(css, /@media \(max-width: 760px\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /\.echo-record-garden-controls/);
  assert.match(css, /\.echo-record-visual-inspector/);
});
