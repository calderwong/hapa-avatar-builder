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

test("placement validates identity and detached audio before switching the player", () => {
  const validator = sourceBlock(
    "function validateRecordAudioSource",
    "function surfaceKindLabel",
  );
  assert.match(validator, /document\.createElement\("audio"\)/);
  assert.match(validator, /addEventListener\("loadedmetadata"/);
  assert.match(validator, /addEventListener\("error"/);
  assert.match(validator, /signal\?\.addEventListener\("abort"/);
  assert.match(validator, /Audio validation timed out/);

  const placement = sourceBlock(
    "const placeRecord = useCallback",
    "const togglePlayback = useCallback",
  );
  const identityCheck = placement.indexOf("projectSongIdentity(nextProject) !== songId");
  const routeCheck = placement.indexOf("if (!audioUri)");
  const detachedValidation = placement.indexOf("await validateRecordAudioSource");
  const mainAudioPause = placement.indexOf("audio.pause()");
  const activeProjectCommit = placement.indexOf("setActiveProjectPacket(packet)");
  const placedIdCommit = placement.indexOf("setPlacedRecordId(songId)");

  assert.ok(identityCheck >= 0);
  assert.ok(routeCheck > identityCheck);
  assert.ok(detachedValidation > routeCheck);
  assert.ok(mainAudioPause > detachedValidation);
  assert.ok(activeProjectCommit > detachedValidation);
  assert.ok(placedIdCommit > detachedValidation);
  assert.match(placement, /if \(error\?\.name === "AbortError"\) return/);
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
  assert.doesNotMatch(cardAction, /sourceSongId: placedRecord\?\.songId \|\| selectedRecord\?\.songId/);
});
