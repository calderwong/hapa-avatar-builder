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
    "echo-record-card-receipt",
  ]) {
    assert.match(component, new RegExp(`data-testid="${testId}"`));
  }
  assert.doesNotMatch(component, /data-testid="echo-record-generate-card"/);
  assert.match(component, /aria-label="Echo State Record Garden 3D album explorer"/);
  assert.match(component, /aria-label="Record playback position"/);
  assert.match(component, /role="listbox"/);
  assert.match(component, /aria-live="polite"/);
});

test("album data stays bounded, uses one cinematic preview, and keeps selected-record detail race safe", () => {
  assert.match(component, /const SCREEN_COUNT = 1/);
  assert.match(
    component,
    /function createAlbumScreens\(world, materialKit = null\) \{\s*const specs = \[\s*\{ x: 0, y: 2\.72, z: -2\.68, ry: 0, scale: 2 \},\s*\];/s,
  );
  assert.match(component, /createEchoGardenRoundedBoxGeometry\(7\.44, 4\.34, 0\.2, 0\.085, 4\)/);
  assert.match(component, /new THREE\.PlaneGeometry\(7\.08, 3\.98\)/);
  assert.match(component, /const screenMaterial = new THREE\.MeshBasicMaterial\(\{[\s\S]*?toneMapped: false,[\s\S]*?fog: false/);
  assert.match(component, /const PROJECT_PACKET_CACHE_LIMIT = 12/);
  assert.match(component, /function readCachedProjectPacket/);
  assert.match(component, /function retainProjectPacket/);
  assert.match(component, /while \(cache\.size > PROJECT_PACKET_CACHE_LIMIT\)/);
  assert.match(component, /projectCacheRef\.current\.clear\(\)/);
  assert.match(component, /projectCacheEvictions/);
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

test("the cinematic preview preserves source color and exposes renderer budget evidence", () => {
  const screenFactory = component.slice(
    component.indexOf("function createAlbumScreens"),
    component.indexOf("function setScreenVideoPlaying"),
  );
  assert.match(screenFactory, /new THREE\.PlaneGeometry\(7\.08, 3\.98\)/);
  assert.match(
    screenFactory,
    /const screenMaterial = new THREE\.MeshBasicMaterial\(\{[\s\S]*?color: 0xffffff,[\s\S]*?toneMapped: false,[\s\S]*?fog: false/s,
  );

  const textureAssignment = component.slice(
    component.indexOf("function assignMaterialTexture"),
    component.indexOf("function setPlayerRecordVisual"),
  );
  assert.match(textureAssignment, /material\.color\?\.setHex\?\.\(0xffffff\)/);
  assert.match(component, /renderer\.outputColorSpace = THREE\.SRGBColorSpace/);
  assert.match(component, /calls: Number\(renderer\.info\.render\.calls\) \|\| 0/);
  assert.match(component, /triangles: Number\(renderer\.info\.render\.triangles\) \|\| 0/);
  assert.match(component, /diagnostics\.visualProfile = sceneResources\.metrics/);
});

test("the garden sheds only secondary detail after sustained frame pressure and recovers with hysteresis", () => {
  assert.match(component, /let adaptiveDetailTier = "full"/);
  assert.match(component, /basePixelRatio \* 0\.82/);
  assert.match(component, /profile\.shadows && adaptiveDetailTier !== "reduced"/);
  assert.match(component, /const p95FrameMs = recentFrameTimes\[/);
  assert.match(component, /p95FrameMs > 28/);
  assert.match(component, /pressureWindows >= 2/);
  assert.match(component, /p95FrameMs < 19/);
  assert.match(component, /recoveryWindows >= 4/);
  assert.match(component, /sceneResources\.setDetailTier\?\.\(nextTier\)/);
  assert.match(component, /!activeAcceptanceRun\(\)/);
  assert.match(component, /const timingDiscontinuity = document\.hidden \|\| rawDelta > 0\.25/);
  assert.match(component, /resetAdaptiveTiming\(\)/);
  assert.match(component, /acceptanceDetailTierBeforeRun = adaptiveDetailTier/);
  assert.match(component, /setAdaptiveDetailTier\("full"\)/);
  assert.match(component, /setAdaptiveDetailTier\(acceptanceDetailTierBeforeRun\)/);
  assert.match(component, /canvas\.dataset\.adaptiveDetailTier = nextTier/);
});

test("project packets use a twelve-entry LRU and release on teardown", () => {
  const helperSource = component.slice(
    component.indexOf("function readCachedProjectPacket"),
    component.indexOf("function resolveGardenMediaUri"),
  );
  const createHarness = new Function(`
    const PROJECT_PACKET_CACHE_LIMIT = 12;
    ${helperSource}
    return { readCachedProjectPacket, retainProjectPacket };
  `);
  const { readCachedProjectPacket, retainProjectPacket } = createHarness();
  const cache = new Map();
  const diagnostics = { projectCacheEntries: 0, projectCacheEvictions: 0 };
  for (let index = 0; index < 12; index += 1) {
    retainProjectPacket(cache, `song-${index}`, { index }, diagnostics);
  }
  assert.equal(readCachedProjectPacket(cache, "song-0", diagnostics).index, 0);
  retainProjectPacket(cache, "song-12", { index: 12 }, diagnostics);
  assert.equal(cache.size, 12);
  assert.equal(cache.has("song-0"), true, "a recent hit stays warm");
  assert.equal(cache.has("song-1"), false, "the least recent packet is released");
  assert.equal(diagnostics.projectCacheEntries, 12);
  assert.equal(diagnostics.projectCacheEvictions, 1);
});

test("the turntable and surfaces share the live audio clock", () => {
  assert.match(component, /getAudioClock: \(\) =>/);
  assert.match(component, /currentTime: Number\(audio\.currentTime\)/);
  assert.match(component, /echoRecordVinylSpinRadians\(framePlayback\.currentTime/);
  assert.match(component, /rpm: ECHO_RECORD_DISPLAY_RPM/);
  assert.doesNotMatch(component, /const RECORD_RPM/);
  assert.match(component, /updateAlbumScreen\(screen, \{\s*playback: framePlayback/s);
  assert.match(component, /echoRecordVideoPlaybackPlan/);
  assert.match(component, /const VISIBLE_RECORD_VIDEO_LIMIT = RECORDS_PER_CRATE/);
  assert.match(component, /const SCREEN_MEDIA_POOL_LIMIT = VISIBLE_RECORD_VIDEO_LIMIT \+ 4/);
  assert.match(component, /setScreenVideoPlaying\(resource, plan\.shouldPlay\)/);
  assert.match(component, /video\.addEventListener\("canplay", handleCanPlay\)/);
  assert.match(component, /video\.addEventListener\("waiting", handleWaiting\)/);
  assert.match(component, /mediaPool\.acquire\(visual\)/);
  assert.match(component, /const clipIdentity = mode === "audio-clock"/);
  assert.match(component, /canvas\.dataset\.recordAngle/);
});

test("the large preview prints its exact attached Card by pointer or keyboard without claiming a mint", () => {
  assert.match(component, /runtime\.createCardPrintIntent\(\{ surface: "echo-record-garden-cinematic-preview" \}\)/);
  assert.match(component, /resolutionPolicy: "exact-id-or-fail"/);
  assert.match(component, /cardId: intent\.card\.id/);
  assert.match(component, /lookupId: intent\.card\.id/);
  assert.match(component, /onKeyDown=\{\(event\) => \{/);
  assert.match(component, /if \(!\["Enter", " "\]\.includes\(event\.key\)\) return/);
  assert.match(component, /const visual = directorCompositeVisual \|\| directorVisual \|\| selectedVisual/);
  assert.match(component, /if \(visual\.directorPreview\) void generateCurrentDirectorPreviewCard\(\)/);
  assert.match(component, /if \(visual\?\.directorPreview\) \{\s*void actionsRef\.current\.generateCurrentDirectorPreviewCard\?\.\(\);/s);
  assert.match(component, /Exact Preview Card identity changed from/);
  assert.doesNotMatch(component, /data-testid="echo-record-generate-card"/);
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
