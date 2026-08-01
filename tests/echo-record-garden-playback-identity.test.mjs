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
  assert.match(component, /projectSongIdentity\(packet\?\.project\) !== activeProjectSongId/);

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

test("placement immediately moves the same record object and warms the real audio element before playback", () => {
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
  const projectLoad = placement.indexOf("const packet = await loadRecordProject(songId)");
  const identityCheck = placement.indexOf("projectSongIdentity(nextProject) !== songId");
  const routeCheck = placement.indexOf("if (!audioUri)");
  const realAudioPreparation = placement.indexOf("await prepareRecordAudioElement(audio, audioUri");
  const activeProjectCommit = placement.indexOf("setActiveProjectPacket(packet)");
  const placedIdCommit = placement.indexOf("setPlacedRecordId(songId)");
  const objectPlacementCommit = placement.indexOf("gameRef.current?.setPlacedRecord(songId)");

  assert.ok(placedIdCommit >= 0);
  assert.ok(objectPlacementCommit > placedIdCommit);
  assert.ok(projectLoad > objectPlacementCommit, "the physical record is placed before network/media preparation");
  assert.ok(identityCheck >= 0);
  assert.ok(routeCheck > identityCheck);
  assert.ok(realAudioPreparation > routeCheck);
  assert.ok(activeProjectCommit > realAudioPreparation);
  assert.doesNotMatch(placement, /validateRecordAudioSource/);
  assert.match(placement, /if \(error\?\.name === "AbortError"\) return/);
});

test("Director shaders sample the same master audio element instead of a synthetic Preview pulse", () => {
  const signalSource = sourceBlock(
    "function createRecordGardenMasterSignalSource",
    "function createRecordGardenDirectorPreviewAdapters",
  );
  assert.match(signalSource, /context\.createMediaElementSource\(audio\)/);
  assert.match(signalSource, /source\.connect\(analyser\)/);
  assert.match(signalSource, /analyser\.connect\(context\.destination\)/);
  assert.match(signalSource, /sampleEchoLiveSignalFrame\(analyser, seconds/);
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
  assert.match(component, /await directorAudioSignalRef\.current\?\.resume\?\.\(\)\.catch\(\(\) => false\);[\s\S]*?await audio\.play\(\)/);
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
