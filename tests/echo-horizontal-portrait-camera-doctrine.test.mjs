import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEchoHorizontalPortraitCameraDoctrine,
  ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINES,
} from "../src/domain/echo-horizontal-portrait-camera-doctrine.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";

function portraitShot(overrides = {}) {
  return {
    shot_index: 0,
    section_id: "verse-one",
    section_label: "Verse One",
    start_sec: 0,
    end_sec: 6,
    media_id: "portrait-video-one",
    media_title: "Portrait Video One",
    media_uri: "/media/portrait-video-one.mp4",
    runtime_media_uri: "/media/portrait-video-one.mp4",
    media_technical_identity: "uri:/media/portrait-video-one.mp4",
    media_contract: {
      type: "video",
      runtimeUri: "/media/portrait-video-one.mp4",
      dimensions: { width: 768, height: 1168, maxDimension: 1168 },
    },
    camera_motion: "pan-down",
    camera_intensity: 1.25,
    camera_speed: 1.1,
    decision_evidence: { preservedDirection: { timing: true, camera: true } },
    ...overrides,
  };
}

function landscapeProject(timeline = [portraitShot()]) {
  return {
    song_id: "portrait-doctrine-song",
    song_title: "Portrait Doctrine Song",
    duration: 6,
    output_profile: {
      id: "landscape",
      width: 1920,
      height: 1080,
      fps: 30,
    },
    timeline,
  };
}

test("the two landscape doctrines scan full portrait height in opposite directions", () => {
  const project = landscapeProject();
  const topFirst = applyEchoHorizontalPortraitCameraDoctrine({
    project,
    doctrine: "top-first-fast-scan-v1",
  });
  const topArrival = applyEchoHorizontalPortraitCameraDoctrine({
    project,
    doctrine: "top-arrival-fast-scan-v1",
  });
  const firstCorridor = topFirst.timeline[0].camera_framing_contract.path.corridors[0];
  const arrivalCorridor = topArrival.timeline[0].camera_framing_contract.path.corridors[0];
  const maximumY = 1 - firstCorridor.startCrop.height;

  assert.equal(ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINES.length, 2);
  assert.equal(firstCorridor.startCrop.y, 0);
  assert.ok(Math.abs(firstCorridor.endCrop.y - maximumY) < 0.000001);
  assert.ok(Math.abs(arrivalCorridor.startCrop.y - maximumY) < 0.000001);
  assert.ok(arrivalCorridor.endCrop.y <= maximumY * 0.015001);
  assert.equal(topFirst.timeline[0].camera_speed, 2.4);
  assert.equal(topArrival.timeline[0].camera_speed, 2.4);
  assert.equal(topFirst.timeline[0].camera_intensity, 0);
  assert.equal(topFirst.telemetry.reframedShots, 1);
  assert.equal(topArrival.telemetry.reframedShots, 1);
});

test("editor projection preserves the declared full-height doctrine corridor", () => {
  const project = landscapeProject();
  const result = applyEchoHorizontalPortraitCameraDoctrine({
    project,
    doctrine: "top-first-fast-scan-v1",
  });
  const declared = result.timeline[0].camera_framing_contract.path.corridors[0];
  const graph = projectToEditorGraph({ ...project, timeline: result.timeline });
  const rebound = graph.directorV2.mediaRoleCamera[0];
  const frames = graph.directorV2.cameraKeyframes.filter((row) => row.cameraPathId === rebound.id);

  assert.match(rebound.plannerPathId, /^camera-path:horizontal-portrait:/u);
  assert.deepEqual(rebound.corridors[0].startCrop, declared.startCrop);
  assert.deepEqual(rebound.corridors[0].endCrop, declared.endCrop);
  assert.deepEqual(frames.map((row) => row.crop), [declared.startCrop, declared.endCrop]);
  assert.ok(frames.every((row) => row.speed === 2.4 && row.intensity === 0));
});

test("certified atomic transition framing remains byte-identical", () => {
  const atomic = portraitShot({
    camera_motion: "static",
    camera_intensity: 0,
    camera_speed: 1,
    camera_framing_contract: {
      schemaVersion: "hapa.echo.asset-camera-framing.v2",
      cropPolicy: "certified-centered-cover-no-motion",
    },
    decision_evidence: {
      atomicTransition: {
        role: "authored-transition",
        visualValidation: { decision: "certified" },
      },
    },
  });
  const project = landscapeProject([atomic]);
  const result = applyEchoHorizontalPortraitCameraDoctrine({
    project,
    doctrine: "top-arrival-fast-scan-v1",
  });

  assert.deepEqual(result.timeline[0], atomic);
  assert.equal(result.telemetry.certifiedAtomicShotsPreserved, 1);
  assert.equal(result.telemetry.reframedShots, 0);
});

test("vertical output is outside the horizontal-cut doctrine", () => {
  const project = {
    ...landscapeProject(),
    output_profile: { id: "vertical", width: 1080, height: 1920, fps: 30 },
  };
  const result = applyEchoHorizontalPortraitCameraDoctrine({
    project,
    doctrine: "top-first-fast-scan-v1",
  });

  assert.deepEqual(result.timeline, project.timeline);
  assert.equal(result.telemetry.skippedNonLandscapeOutput, true);
  assert.equal(result.telemetry.reframedShots, 0);
});
