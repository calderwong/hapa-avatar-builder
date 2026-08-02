import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const component = await readFile(
  new URL("../src/components/EchoRecordGarden3DView.jsx", import.meta.url),
  "utf8",
);

function sourceBlock(start, end) {
  const startIndex = component.indexOf(start);
  const endIndex = component.indexOf(end, startIndex + start.length);
  assert.ok(startIndex >= 0, `missing source block start: ${start}`);
  assert.ok(endIndex > startIndex, `missing source block end: ${end}`);
  return component.slice(startIndex, endIndex);
}

test("the placed record owns the active project while another sleeve is merely selected", () => {
  assert.match(component, /const activeProjectSongId = placedRecordId \|\| selectedRecordId;/);
  assert.match(component, /loadRecordProject\(activeProjectSongId\)/);
  assert.match(component, /assertRecordGardenProjectIdentity\(activeRecord, packet\?\.project, apiBase\)/);

  const loader = sourceBlock(
    "const loadRecordProject = useCallback",
    "useEffect(() => () => {",
  );
  assert.doesNotMatch(
    loader,
    /setActiveProjectPacket/,
    "fetching a browsed sleeve must not replace the record-player project",
  );
});

test("placement seats the same Record and starts the real audio lane before Director hydration", () => {
  const audioPreparation = sourceBlock(
    "function prepareRecordAudioElement",
    "function waitForMediaPresentation",
  );
  assert.match(audioPreparation, /audio\.getAttribute\("src"\) === audioUri && audio\.readyState >= 1/);
  assert.match(audioPreparation, /warmed: true/);
  assert.match(audioPreparation, /audio\.addEventListener\("loadedmetadata"/);
  assert.match(audioPreparation, /audio\.addEventListener\("error"/);
  assert.match(audioPreparation, /signal\?\.addEventListener\("abort"/);
  assert.match(audioPreparation, /audio\.src = audioUri/);
  assert.match(audioPreparation, /audio\.preload = "auto"/);
  assert.match(audioPreparation, /audio\.load\(\)/);
  assert.doesNotMatch(audioPreparation, /document\.createElement\("audio"\)/);

  const placement = sourceBlock(
    "const placeRecord = useCallback",
    "const togglePlayback = useCallback",
  );
  const audioPreparationStart = placement.indexOf("const audioPreparationPromise = prepareRecordAudioElement(audio, audioUri");
  const projectLoadStart = placement.indexOf("const directorPacketPromise = loadRecordProject(songId)");
  const audioPipelineStart = placement.indexOf("const audioPipeline = (async () =>");
  const directorPipelineStart = placement.indexOf("const directorPipeline = (async () =>");
  const projectAwait = placement.indexOf("const packet = await directorPacketPromise");
  const audioPlay = placement.indexOf("await audio.play()");
  const presentationWait = placement.indexOf("await waitForMediaPresentation(primaryPresentation)");
  const identityCheck = placement.indexOf("assertRecordGardenProjectIdentity(record, nextProject, apiBase)");
  const activeProjectCommit = placement.indexOf("setActiveProjectPacket(packet)");
  const placedIdCommit = placement.indexOf("setPlacedRecordId(songId)");
  const objectPlacementCommit = placement.indexOf("gameRef.current?.setPlacedRecord(songId)");
  const seatingMilestone = placement.indexOf('markPlacement("seated")');

  assert.ok(placedIdCommit >= 0);
  assert.ok(objectPlacementCommit > placedIdCommit);
  assert.ok(seatingMilestone > objectPlacementCommit, "same-frame physical seating owns the first milestone");
  assert.ok(audioPreparationStart > seatingMilestone, "the real audio element starts prewarming immediately after seating");
  assert.ok(projectLoadStart > audioPreparationStart, "Director detail fetch cannot delay starting the audio request");
  assert.ok(audioPipelineStart > projectLoadStart);
  assert.ok(directorPipelineStart > audioPipelineStart);
  assert.ok(audioPlay > audioPipelineStart && audioPlay < directorPipelineStart);
  assert.ok(projectAwait > directorPipelineStart, "Director hydration has its own concurrent await lane");
  assert.ok(identityCheck > projectAwait);
  assert.ok(activeProjectCommit > identityCheck, "hydrated state commits only after exact audio identity validation");
  assert.ok(presentationWait > activeProjectCommit, "first-frame presentation remains visual-lane work");
  assert.match(placement, /await Promise\.all\(\[audioPipeline, directorPipeline\]\)/);
  assert.doesNotMatch(
    placement.slice(audioPipelineStart, directorPipelineStart),
    /directorPacketPromise|waitForMediaPresentation/,
    "audio playback must not await Director detail or compositor presentation",
  );
  assert.doesNotMatch(placement, /validateRecordAudioSource/);
  assert.match(placement, /if \(error\?\.name === "AbortError"\)/);
});

test("placement publishes bounded warm/cold latency traces with fail-visible identity errors", () => {
  assert.match(component, /createEchoRecordPlacementLatencyState/);
  assert.match(component, /markEchoRecordPlacementMilestone/);
  assert.match(component, /summarizeEchoRecordPlacementLatencies/);
  assert.match(component, /const warmed = Boolean\([\s\S]*?audio\.readyState >= 1/);
  assert.match(component, /placementLatencySamplesRef\.current = publishRecordGardenPlacementLatency/);
  assert.match(component, /summary: summarizeEchoRecordPlacementLatencies\(next\)/);

  const placement = sourceBlock(
    "const placeRecord = useCallback",
    "const togglePlayback = useCallback",
  );
  for (const milestone of [
    "seated",
    "audio-unlock-start",
    "audio-unlocked",
    "metadata",
    "decoded",
    "audio-start",
    "fetch-start",
    "fetch-complete",
    "director-graph-ready",
    "first-frame",
    "failed",
    "cancelled",
  ]) {
    assert.match(placement, new RegExp(`markPlacement\\("${milestone}"`));
  }
  const identityGate = sourceBlock(
    "function assertRecordGardenProjectIdentity",
    "function abortError",
  );
  assert.match(identityGate, /projectSongIdentity\(project\) !== songId/);
  assert.match(identityGate, /Director project audio route did not match the placed Record summary/);
  assert.match(identityGate, /Director project audio identity did not match the placed Record summary/);
  assert.match(placement, /setProjectLoadError\(error\?\.message/);
  assert.match(placement, /setPlayback\(\(current\) => \(\{[\s\S]*?error: error\?\.message/);
});

test("Director shaders sample the same master audio element instead of a synthetic Preview pulse", () => {
  const signalSource = sourceBlock(
    "function createRecordGardenMasterSignalSource",
    "function createRecordGardenDirectorPreviewAdapters",
  );
  assert.match(signalSource, /context\.createMediaElementSource\(audio\)/);
  assert.match(signalSource, /source\.connect\(analyser\)/);
  assert.match(signalSource, /analyser\.connect\(monitorGain\)/);
  assert.match(signalSource, /monitorGain\.connect\(context\.destination\)/);
  assert.match(signalSource, /analyser\.connect\(captureDestination\)/);
  assert.match(signalSource, /captureStream\(\) \{\s*return captureDestination\.stream;/s);
  assert.match(signalSource, /sampleEchoLiveSignalFrame\(analyser, lastMasterSeconds/);
  assert.match(signalSource, /source: "record-garden-master-audio-analyser"/);
  assert.match(signalSource, /silentGain\.gain\.value = 0/);
  assert.match(signalSource, /source: "verified-registry-stem"/);

  const adapters = sourceBlock(
    "function createRecordGardenDirectorPreviewAdapters",
    "export default function EchoRecordGarden3DView",
  );
  assert.match(adapters, /signalSource\?\.sample\?\.\(frame\.clock\.seconds\)/);
  assert.match(adapters, /resolveVerifiedEchoStemBinding\(showGraph/);
  assert.match(adapters, /signalSource\?\.createStem\?\./);
  assert.match(adapters, /frames\[binding\.requested\] = stemFrame/);
  assert.match(adapters, /signalFrames: signalBinding\.frames/);
  assert.match(adapters, /verified-stem-buffering-master-fallback/);
  assert.doesNotMatch(adapters, /const pulse = 0\.5 \+ Math\.sin/);
  assert.match(component, /Promise\.resolve\(directorAudioSignalRef\.current\?\.resume\?\.\(\)\)/);
  assert.match(component, /const audioPipeline = \(async \(\) => \{[\s\S]*?await audio\.play\(\)/);
});

test("visual Card receipts remain bound to the active project's song identity", () => {
  const cardAction = sourceBlock(
    "const generateCardForVisual = useCallback",
    "actionsRef.current = {",
  );
  assert.match(cardAction, /const activeSongId = projectSongIdentity\(project\)/);
  assert.match(cardAction, /const visualSongId = String\(visual\.songId \|\| ""\)/);
  assert.match(cardAction, /visualSongId !== activeSongId/);
  assert.match(cardAction, /Number\(audioRef\.current\?\.currentTime\) \|\| playback\.currentTime/);
  assert.match(cardAction, /sourceSongId: visualSongId \|\| activeSongId/);
  assert.match(cardAction, /cardRequestGenerationRef\.current = requestGeneration/);
  assert.match(cardAction, /resolveVisualCard\.cancelVisual\?\.\(previousResolution\.visualId\)/);
  assert.match(cardAction, /requestGeneration !== cardRequestGenerationRef\.current/);
  assert.match(cardAction, /requestKey: error\?\.requestKey \|\| pendingRequestKey/);
  assert.match(cardAction, /sourceCardId: String\(/);
  assert.match(cardAction, /sourceRevisionId: printed\.revisionId/);
  assert.match(cardAction, /directorRevisionId: visual\.source\?\.revisionId/);
  assert.match(cardAction, /attached\.echoRecordAttachment\?\.sourceRevisionId/);
  assert.match(cardAction, /cardSchemaVersion: String\(attached\.schemaVersion/);
  assert.match(cardAction, /receiptEdition: Math\.max\(0, Number\(resolution\.receipt\?\.edition\)/);
  assert.doesNotMatch(cardAction, /sourceSongId: placedRecord\?\.songId \|\| selectedRecord\?\.songId/);
});

test("acceptance seeks count committed Director-boundary gestures instead of slider input events", () => {
  assert.match(component, /const seekGestureRef = useRef\(null\)/);
  assert.match(component, /const beginSeekGesture = useCallback/);
  assert.match(component, /const commitSeekGesture = useCallback/);
  assert.match(component, /fromCueId: directorCueIdAt\(fromSeconds\)/);
  assert.match(component, /toCueId: directorCueIdAt\(toSeconds\)/);
  assert.match(component, /fromCueId === toCueId/);
  assert.match(component, /run\.seekTransitions = \[\.\.\.existing, transition\]/);
  assert.match(component, /onPointerDown=\{beginSeekGesture\}/);
  assert.match(component, /onPointerUp=\{commitSeekGesture\}/);
  assert.doesNotMatch(
    component.slice(component.indexOf("const seekPlayback"), component.indexOf("const toggleMuted")),
    /noteAcceptanceAction\("seek"/,
  );
});
