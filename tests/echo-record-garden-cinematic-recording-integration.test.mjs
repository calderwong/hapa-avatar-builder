import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildEchoRecordGardenRecordingCard,
  finalizeEchoRecordGardenRecordingCard,
} from "../server/echo-record-garden-recording-card.mjs";

const [app, component, echoAlbum, css, server] = await Promise.all([
  readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8"),
  readFile(new URL("../src/index.css", import.meta.url), "utf8"),
  readFile(new URL("../server/api.mjs", import.meta.url), "utf8"),
]);

function sourceBlock(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0, `missing source block: ${startMarker}`);
  assert.ok(end > start, `missing source boundary: ${endMarker}`);
  return source.slice(start, end);
}

test("Cinematic Mode is shell-owned, reversible, focus-safe, and keeps only its mode dock visible", () => {
  assert.match(app, /const \[echoRecordGardenCinematic, setEchoRecordGardenCinematic\] = useState\(false\)/);
  assert.match(
    app,
    /activeView === "echo-records" && echoRecordGardenCinematic \? "record-garden-cinematic-active" : ""/,
  );
  assert.match(
    app,
    /if \(activeView !== "echo-records" && echoRecordGardenCinematic\) \{\s*setEchoRecordGardenCinematic\(false\);/s,
  );
  assert.match(app, /cinematicMode=\{echoRecordGardenCinematic\}/);
  assert.match(app, /onCinematicModeChange=\{setEchoRecordGardenCinematic\}/);

  const cinematic = sourceBlock(
    component,
    "const cinematicMode = typeof controlledCinematicMode",
    "useEffect(() => () => {",
  );
  assert.match(cinematic, /setLocalCinematicMode\(Boolean\(next\)\)/);
  assert.match(cinematic, /onCinematicModeChange\?\.\(Boolean\(next\)\)/);
  assert.match(cinematic, /cinematicReturnFocusRef\.current = document\.activeElement/);
  assert.match(cinematic, /setCinematicMode\(true\)/);
  assert.match(cinematic, /canvasRef\.current\?\.focus\?\.\(\)/);
  assert.match(cinematic, /if \(event\.key !== "Escape"\) return/);
  assert.match(cinematic, /event\.preventDefault\(\);\s*exitCinematicMode\(\)/s);
  assert.match(cinematic, /cinematicReturnFocusRef\.current \|\| cinematicToggleRef\.current/);
  assert.match(cinematic, /if \(cinematicMode && sceneError\) exitCinematicMode\(\)/);

  const modeDockIndex = component.indexOf('className="echo-record-garden-mode-dock"');
  const chromeIndex = component.indexOf('className="echo-record-garden-chrome"');
  assert.ok(modeDockIndex >= 0 && modeDockIndex < chromeIndex, "the exit/record dock must remain outside hidden chrome");
  assert.match(component, /data-cinematic=\{cinematicMode \? "true" : "false"\}/);
  assert.match(component, /aria-label=\{cinematicMode \? "Exit cinematic mode" : "Enter cinematic mode"\}/);
  assert.match(component, /hidden=\{cinematicMode\}/);
  assert.match(component, /aria-hidden=\{cinematicMode \? "true" : undefined\}/);
  assert.match(component, /inert=\{cinematicMode \? "" : undefined\}/);

  assert.match(css, /\.app-shell\.record-garden-cinematic-active[\s\S]*?height: 100vh;[\s\S]*?overflow: hidden;/);
  assert.match(
    css,
    /\.app-shell\.record-garden-cinematic-active \.topbar,[\s\S]*?\.app-shell\.record-garden-cinematic-active \.sidebar \{\s*display: none;/s,
  );
  assert.match(css, /\.app-shell\.record-garden-cinematic-active \.workspace[\s\S]*?padding: 0;[\s\S]*?overflow: hidden;/);
  assert.match(css, /\.echo-record-garden\[data-cinematic="true"\] \.echo-record-garden-mode-dock/);
  assert.match(css, /@media \(max-width: 1720px\)[\s\S]*?\.echo-record-garden:not\(\[data-cinematic="true"\]\) \.echo-record-garden-mode-dock[\s\S]*?top: 176px;/);
  assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.echo-record-garden:not\(\[data-cinematic="true"\]\) \.echo-record-garden-mode-dock[\s\S]*?top: 154px;/);
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*?\.echo-record-cinematic-toggle, \.echo-record-capture-toggle/);
});

test("Record Mode combines the live canvas with the mastered audio graph and saves exact capture lineage", () => {
  const masterSignal = sourceBlock(
    component,
    "function createRecordGardenMasterSignalSource",
    "function createRecordGardenDirectorPreviewAdapters",
  );
  assert.match(masterSignal, /context\.createMediaElementSource\(audio\)/);
  assert.match(masterSignal, /const captureDestination = context\.createMediaStreamDestination\(\)/);
  assert.match(masterSignal, /const monitorGain = context\.createGain\(\)/);
  assert.match(masterSignal, /source\.connect\(analyser\)/);
  assert.match(masterSignal, /analyser\.connect\(monitorGain\)/);
  assert.match(masterSignal, /monitorGain\.connect\(context\.destination\)/);
  assert.match(masterSignal, /analyser\.connect\(captureDestination\)/);
  assert.match(masterSignal, /captureStream\(\) \{\s*return captureDestination\.stream;/s);
  assert.match(masterSignal, /monitorGain\.gain\.setTargetAtTime\(value \? 0 : 1/);
  assert.match(masterSignal, /captureDestination\.stream\?\.getTracks\?\.\(\)\.forEach/);

  const lease = sourceBlock(
    component,
    "function acquireRecordGardenMasterSignalSource",
    "function createRecordGardenDirectorPreviewAdapters",
  );
  assert.match(lease, /RECORD_GARDEN_MASTER_SIGNAL_SOURCE_LEASES\.get\(audio\)/);
  assert.match(lease, /entry\.references \+= 1/);
  assert.match(lease, /globalThis\.setTimeout\(\(\) =>/);
  assert.match(lease, /if \(entry\.references \|\| RECORD_GARDEN_MASTER_SIGNAL_SOURCE_LEASES\.get\(audio\) !== entry\) return/);
  assert.match(lease, /RECORD_GARDEN_MASTER_SIGNAL_SOURCE_LEASES\.delete\(audio\)/);

  const startCapture = sourceBlock(
    component,
    "const startRecordMode = useCallback",
    "const retryRecordGardenCaptureSave = useCallback",
  );
  assert.match(startCapture, /canvas\.captureStream\(RECORD_GARDEN_CAPTURE_FPS\)/);
  assert.match(startCapture, /directorAudioSignalRef\.current\?\.captureStream\?\.\(\)/);
  assert.match(startCapture, /canvasStream\?\.getVideoTracks\?\.\(\) \|\| \[\]/);
  assert.match(startCapture, /audioStream\?\.getAudioTracks\?\.\(\) \|\| \[\]\)\.map\(\(track\) => track\.clone\(\)\)/);
  assert.match(startCapture, /if \(!videoTracks\.length\) throw new Error/);
  assert.match(startCapture, /if \(!audioTracks\.length\) throw new Error/);
  assert.match(startCapture, /new MediaStream\(\[\.\.\.videoTracks, \.\.\.audioTracks\]\)/);
  assert.match(startCapture, /new MediaRecorder\(stream, \{/);
  assert.match(startCapture, /videoBitsPerSecond: RECORD_GARDEN_CAPTURE_VIDEO_BITS_PER_SECOND/);
  assert.match(startCapture, /audioBitsPerSecond: 160_000/);
  assert.match(startCapture, /songId: activeRecord\.songId/);
  assert.match(startCapture, /cutId: cut\.id/);
  assert.match(startCapture, /weatherPhase: normalizeWeatherPhase\(weatherPhase\)/);
  assert.match(startCapture, /rightsStatus: project\?\.rights\?\.status/);
  assert.match(startCapture, /if \(!activeRecord\?\.songId \|\| !cut\?\.id\)/);
  assert.match(startCapture, /waiting for the placed record's exact song and Director cut identity/);
  assert.match(startCapture, /let provisionalTracks = \[\]/);
  assert.match(startCapture, /provisionalTracks = \[\.\.\.videoTracks, \.\.\.audioTracks\]/);
  assert.match(startCapture, /session\.cancelled = true/);
  assert.match(startCapture, /session\.stream\?\.getTracks\?\.\(\)\.forEach\(\(track\) =>/);
  assert.match(startCapture, /if \(recordingSessionRef\.current === session\) recordingSessionRef\.current = null/);
  assert.match(startCapture, /provisionalTracks\.forEach\(\(track\) =>/);

  const saveCapture = sourceBlock(
    component,
    "const finalizeRecordGardenCapture = useCallback",
    "const stopRecordMode = useCallback",
  );
  assert.match(saveCapture, /fetch\(`\$\{base\}\/api\/local-ui-session`/);
  assert.match(saveCapture, /fetch\(`\$\{base\}\/api\/echo-record-garden\/recordings`/);
  assert.match(saveCapture, /"Idempotency-Key": `record-garden:\$\{session\.id\}`/);
  assert.match(saveCapture, /"x-hapa-recording-audio-tracks": String\(session\.audioTrackCount\)/);
  assert.match(saveCapture, /"x-hapa-recording-cut-id": String\(lineage\.cutId \|\| ""\)/);
  assert.match(saveCapture, /"x-hapa-recording-weather": normalizeWeatherPhase\(lineage\.weatherPhase\)/);
  assert.match(saveCapture, /gameRef\.current\?\.spawnPrintedCard\(card\)/);
  assert.match(saveCapture, /durable local Hapa Card with verified custody/);
  assert.match(saveCapture, /failedCaptureRef\.current = session/);
  assert.match(saveCapture, /saveError\.recordGardenFailure = payload/);
  assert.match(saveCapture, /session\.lastSaveFailure = failurePayload/);
  assert.match(saveCapture, /Object\.values\(durability\)\.some\(Boolean\)/);
  assert.match(saveCapture, /Retry will safely resume its durable transaction/);
  assert.match(saveCapture, /preserved in this tab only/);
});

test("a verified recording becomes one durable-local Card truth copy without mint or publication claims", () => {
  const contentHash = "a".repeat(64);
  const recording = {
    sessionId: "record-garden-session-fixture-001",
    title: "Sunset Garden Session",
    songId: "echo-song-fixture",
    songTitle: "Echo Song",
    cutId: "director-cut-fixture",
    cutTitle: "Sunset Cut",
    weatherPhase: "sunset",
    rightsStatus: "review-required-before-public-release",
    durationSeconds: 12.5,
    width: 1280,
    height: 720,
    fps: 30,
    videoTracks: 1,
    audioTracks: 1,
    mimeType: "video/webm",
    contentType: "video/webm;codecs=vp9,opus",
    videoCodecs: ["V_VP9"],
    audioCodecs: ["A_OPUS"],
    sizeBytes: 4096,
    contentHash,
  };
  const mediaUri = `/media/echo-record-garden-${contentHash}.webm`;
  const proposed = buildEchoRecordGardenRecordingCard({
    recording,
    mediaUri,
    actorId: "local-test-operator",
    createdAt: "2026-08-01T12:00:00.000Z",
  });
  const receipt = {
    cardId: proposed.id,
    cardCoreKey: "b".repeat(64),
    cardRecordDigest: "c".repeat(64),
    createdAt: "2026-08-01T12:00:01.000Z",
    minted: false,
    catalogPublished: false,
    canonical: false,
    commerceEligible: false,
  };

  const finalized = finalizeEchoRecordGardenRecordingCard({ card: proposed, receipt });

  assert.equal(proposed.truthStatus, "proposed-unminted-recording-card", "finalization must not rewrite the proposal input");
  assert.equal(finalized.truthStatus, "durable-local-card");
  assert.equal(finalized.enrichment.media.recordGarden.truthStatus, "durable-local-card");
  assert.equal(finalized.echoRecordAttachment.truthStatus, "durable-local-card");
  assert.equal(finalized.echoRecordAttachment.presentation.playbackMode, "loop");
  assert.equal(finalized.echoRecordAttachment.presentation.videoUri, mediaUri);
  assert.equal(finalized.assets[0].uri, mediaUri);
  assert.equal(finalized.assets[0].metadata.sha256, contentHash);
  assert.equal(finalized.mediaTelemetry.audioTracks, 1);
  assert.equal(finalized.mediaTelemetry.videoTracks, 1);
  assert.equal(finalized.authorityState.custody, "origin_appended");
  assert.equal(finalized.custody.cardCoreKey, receipt.cardCoreKey);
  assert.equal(finalized.minted, false);
  assert.equal(finalized.published, false);
  assert.equal(finalized.canonical, false);
  assert.equal(finalized.commerceEligible, false);
  assert.deepEqual(
    finalized.sourceRefs.map(({ kind }) => kind),
    ["recording-content", "song", "director-cut"],
  );
  assert.equal(finalized.lineage.sourceSongId, recording.songId);
  assert.equal(finalized.lineage.sourceCutId, recording.cutId);
  assert.equal(finalized.lineage.captureSessionId, recording.sessionId);

  assert.throws(
    () => finalizeEchoRecordGardenRecordingCard({
      card: proposed,
      receipt: { ...receipt, minted: true },
    }),
    /must remain unminted, unpublished, non-canonical, and commerce-ineligible/,
  );

  const recordingRoute = sourceBlock(
    server,
    'if (pathname === "/api/echo-record-garden/recordings"',
    'if (pathname === "/api/media"',
  );
  const custodyIndex = recordingRoute.indexOf("avatarCardCustodyService.ensure");
  const finalizeIndex = recordingRoute.indexOf("finalizeEchoRecordGardenRecordingCard");
  const persistIndex = recordingRoute.indexOf("addTarotCard(latestStore, finalizedCard)");
  assert.ok(custodyIndex >= 0 && finalizeIndex > custodyIndex && persistIndex > finalizeIndex);
  assert.ok(
    recordingRoute.indexOf("echoRecordGardenRecordingTransactionLedger.begin") < custodyIndex,
    "the durable full-request transaction must precede custody",
  );
  assert.match(recordingRoute, /createdAt: recordingTransaction\.cardCreatedAt/);
  assert.match(recordingRoute, /eventId: recordingTransaction\.subscriberEventId/);
  assert.match(recordingRoute, /occurredAt: recordingTransaction\.subscriberOccurredAt/);
  assert.match(recordingRoute, /card = finalizeEchoRecordGardenRecordingCard\(\{/);
  assert.match(recordingRoute, /persisted: true/);
  assert.match(recordingRoute, /minted: false/);
  assert.match(recordingRoute, /Public mint, canon, publication, and commerce remain separate explicit authority actions/);
});

test("the mouse wheel re-orients only a held or hit printed Card and persists its transform", () => {
  const wheel = sourceBlock(component, "const handleWheel = (event) => {", "const handleContextLost =");
  assert.match(wheel, /const entry = heldPrintedEntry \|\| printedCardHit\(\)/);
  assert.match(wheel, /if \(!entry\) return/);
  assert.match(wheel, /event\.deltaMode === 2/);
  assert.match(wheel, /event\.deltaMode === 1/);
  assert.match(wheel, /THREE\.MathUtils\.clamp\(Number\(event\.deltaY\) \* pageScale \* 0\.0015, -0\.32, 0\.32\)/);
  assert.match(wheel, /if \(event\.shiftKey \|\| event\.altKey\)/);
  assert.match(wheel, /entry\.root\.rotation\.x = THREE\.MathUtils\.clamp/);
  assert.match(wheel, /entry\.root\.rotation\.y = THREE\.MathUtils\.euclideanModulo/);
  assert.match(wheel, /entry\.home\.copy\(entry\.root\.position\)/);
  assert.match(wheel, /onPrintedCardTransform\?\.\(entry\.card\.id, \{/);
  assert.match(wheel, /rotation: entry\.root\.rotation\.toArray\(\)\.slice\(0, 3\)/);
  assert.match(wheel, /manipulated: true/);
  assert.match(wheel, /event\.preventDefault\(\)/);
  assert.match(wheel, /event\.stopImmediatePropagation\(\)/);
  assert.match(component, /addEventListener\("wheel", handleWheel, \{ passive: false, capture: true \}\)/);
  assert.match(component, /removeEventListener\("wheel", handleWheel, \{ capture: true \}\)/);
});

test("Record Mode locks source-record identity across React controls and Three interactions", () => {
  assert.match(
    component,
    /const captureLocked = \["preparing", "recording", "finalizing", "saving"\]\.includes\(captureState\.status\)/,
  );
  assert.match(component, /gameRef\.current\?\.setCaptureLocked\?\.\(captureLocked\)/);

  const eject = sourceBlock(
    component,
    "const ejectPlacedRecord = useCallback",
    "useEffect(() => () => {",
  );
  assert.match(eject, /if \(captureLocked\) \{/);
  assert.match(eject, /Stop Record Mode before lifting the source record/);
  assert.match(eject, /\[captureLocked, placedRecordId/);

  const pointerDown = sourceBlock(component, "const handlePointerDown", "const handlePointerMove");
  const printedCardIndex = pointerDown.indexOf("const printedEntry = printedCardHit()");
  const recordIndex = pointerDown.indexOf("const entry = recordHit()");
  const lockIndex = pointerDown.indexOf("if (captureLocked)");
  assert.ok(printedCardIndex >= 0 && recordIndex > printedCardIndex && lockIndex > recordIndex);
  assert.match(pointerDown, /Stop Record Mode before moving the source record/);
  assert.match(pointerDown, /event\.preventDefault\(\);\s*return;/s);

  const lockSetter = sourceBlock(component, "const setCaptureLocked", "const setWeatherPhase");
  assert.match(lockSetter, /captureLocked = Boolean\(nextLocked\)/);
  assert.match(lockSetter, /if \(captureLocked && heldEntry\) handlePointerCancel\(\)/);
  assert.match(lockSetter, /canvas\.dataset\.captureLocked = captureLocked \? "true" : "false"/);
  assert.match(component, /disabled=\{!placedRecord \|\| captureLocked\}/);
  assert.match(component, /disabled=\{!selectedRecord \|\| captureLocked\}/);
});

test("the live audio visualizer is updated inside the frame loop and follows the playing record", () => {
  assert.match(component, /import \{ createEchoRecordGardenAudioVisualizer \} from "\.\/echo-record-garden-audio-visualizer\.js"/);
  assert.match(component, /getAudioSignal: \(seconds\) => directorAudioSignalRef\.current\?\.latest\?\.\(seconds, \{/);
  assert.match(component, /const audioVisualizer = createEchoRecordGardenAudioVisualizer\(\{ world \}\)/);
  assert.match(component, /audioVisualizer\.setDetailTier\?\.\(nextTier\)/);
  assert.match(component, /audioVisualizer\.dispose\(\)/);

  const snapshot = sourceBlock(component, "const snapshot = () => {", "const restoreSnapshot =");
  const render = sourceBlock(component, "const render = (frameTimestamp = 0) => {", "\n  render();");
  assert.doesNotMatch(snapshot, /audioVisualizer\.update\(/, "snapshot serialization must stay side-effect free");
  assert.match(render, /const visualizerRecordId = placedRecordId \|\| previewRecordId/);
  assert.match(render, /getAudioSignal\?\.\(framePlayback\.currentTime\)/);
  assert.match(render, /audioVisualizer\.setTarget\(visualizerEntry\?\.root \|\| null\)/);
  assert.match(render, /audioVisualizer\.update\(\{/);
  assert.match(render, /active: Boolean\(visualizerEntry && framePlayback\.playing\)/);
  assert.match(render, /reducedMotion: framePlayback\.reducedMotion/);
  assert.match(render, /diagnostics\.visualizerStatus/);
  assert.ok(
    render.indexOf("audioVisualizer.update") < render.indexOf("renderer.render(scene, camera)"),
    "the audio-reactive geometry must update before its frame is rendered",
  );
});

test("Garden camera framing follows the Director output contract instead of guessing from decoded source orientation", () => {
  const sourceRect = sourceBlock(
    component,
    "export function resolveRecordGardenDirectorSourceRect",
    "function drawDirectorPreviewMedia",
  );
  assert.match(sourceRect, /frame\?\.outputProfile\?\.width/);
  assert.match(sourceRect, /frame\?\.outputProfile\?\.height/);
  assert.match(sourceRect, /declaredOutputHeight > declaredOutputWidth/);
  assert.match(sourceRect, /: sourceAspect < 1/);
  assert.match(sourceRect, /cue\.camera\?\.motion/);
  assert.match(sourceRect, /motion: declaredCameraMotion \|\| camera\.motion \|\| "auto"/);
  assert.match(sourceRect, /intensity: camera\.intensity/);
  assert.match(sourceRect, /speed: camera\.speed/);
  assert.match(sourceRect, /sourceCueIndex \?\? cue\.sourceCueIndex/);
  assert.match(sourceRect, /sourceId: cue\.cameraSeedId \|\| ""/);
  assert.match(sourceRect, /echoCameraCoverSourceRect\(\{/);

  const echoAlbumCamera = sourceBlock(
    echoAlbum,
    "function cameraMotionStyleForShot",
    "function EchoPlaybackClockBoundary",
  );
  assert.match(echoAlbumCamera, /echoCameraMotionPresentation\(\{/);
  assert.match(echoAlbumCamera, /sourceId: item\.section_id \|\| item\.media_id \|\| ""/);
  assert.match(echoAlbumCamera, /speed: item\.camera_speed \?\? item\.camera\?\.speed/);
  assert.match(echoAlbum, /vertical=\{isVerticalOutput\}/);
  assert.doesNotMatch(echoAlbum, /vertical=\{isVerticalSource\}/);
});

test("weather selection flows from placed records through the scene and into recording truth", () => {
  assert.match(component, /const RECORD_GARDEN_WEATHER_PHASES = Object\.freeze\(\["high-noon", "sunset", "night", "sunrise"\]\)/);
  assert.match(component, /const \[weatherPhase, setWeatherPhase\] = useState\("high-noon"\)/);
  const weatherCycle = sourceBlock(
    component,
    "useEffect(() => {\n    if (!placedRecordId || weatherRecordRef.current === placedRecordId) return;",
    "const recordBySongId = useMemo",
  );
  assert.match(weatherCycle, /weatherCycleRef\.current = \(weatherCycleRef\.current \+ 1\) % RECORD_GARDEN_WEATHER_PHASES\.length/);
  assert.match(weatherCycle, /setWeatherPhase\(nextPhase\)/);
  assert.match(weatherCycle, /gameRef\.current\?\.setWeatherPhase\?\.\(nextPhase\)/);
  assert.match(component, /gameRef\.current\?\.setWeatherPhase\?\.\(weatherPhase\)/);

  const sceneSetter = sourceBlock(component, "const setWeatherPhase = (phase = \"next\") => {", "const spawnPrintedCard");
  assert.match(sceneSetter, /sceneResources\.setWeatherPhase\?\.\(phase\)/);
  assert.match(sceneSetter, /diagnostics\.weatherPhase = String\(phase \|\| "next"\)/);
  assert.match(sceneSetter, /canvas\.dataset\.weatherPhase = diagnostics\.weatherPhase/);

  const sundayUpdate = sourceBlock(component, "function updateSundayScene", "function createRecordPlayer");
  assert.match(sundayUpdate, /updateEchoRecordGardenVisualSystem\(resources, elapsed, false\)/);
  assert.match(component, /data-weather-phase=\{weatherPhase\}/);
  assert.match(component, /weatherPhaseLabel\(weatherPhase\)/);
  assert.match(component, /weatherPhase: normalizeWeatherPhase\(weatherPhase\)/);
  assert.match(component, /"x-hapa-recording-weather": normalizeWeatherPhase\(lineage\.weatherPhase\)/);
});
