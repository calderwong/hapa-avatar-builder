import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEchoHorizontalPortraitCameraDoctrine,
  applyEchoPortraitScanCamera,
  echoShotPortraitScanEligibility,
  ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINES,
} from "../src/domain/echo-horizontal-portrait-camera-doctrine.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";
import { echoCameraCoverSourceRect, echoCameraMotionPresentation } from "../src/domain/echo-camera-framing.js";

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

test("top-first and bottom-first doctrines scan the full portrait height in opposite directions", () => {
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

  assert.equal(ECHO_HORIZONTAL_PORTRAIT_CAMERA_DOCTRINES.length, 3);
  assert.equal(firstCorridor.startCrop.y, 0);
  assert.ok(Math.abs(firstCorridor.endCrop.y - maximumY) < 0.000001);
  assert.ok(Math.abs(arrivalCorridor.startCrop.y - maximumY) < 0.000001);
  assert.equal(arrivalCorridor.endCrop.y, 0);
  assert.equal(topFirst.timeline[0].camera_motion, "scan-down");
  assert.equal(topArrival.timeline[0].camera_motion, "scan-up");
  assert.equal(topFirst.timeline[0].camera_speed, 1);
  assert.equal(topFirst.timeline[0].camera_intensity, 1);
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
  assert.ok(frames.every((row) => row.speed === 1 && row.intensity === 1));
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

test("the Director policy scans every tall clip, alternating down then up, and leaves frame-filling clips alone", () => {
  const tall = (index, width, height, extra = {}) => portraitShot({
    shot_index: index, start_sec: index * 6, end_sec: index * 6 + 6, media_id: `clip-${index}`, media_uri: `/media/clip-${index}.mp4`,
    camera_motion: "static", camera_intensity: 0, media_contract: { type: "video", dimensions: { width, height } }, ...extra,
  });
  const project = landscapeProject([
    tall(0, 1080, 1920),
    tall(1, 1920, 1080),
    tall(2, 1024, 1024),
    tall(3, 768, 1168, { media_contract: { type: "image", dimensions: { width: 768, height: 1168 } } }),
    tall(4, 1440, 1080),
    tall(5, 720, 1280, { locks: ["camera"] }),
  ]);
  const result = applyEchoPortraitScanCamera({ project });
  assert.deepEqual(result.timeline.map((shot) => shot.camera_motion), ["scan-down", "static", "scan-up", "scan-down", "static", "static"]);
  assert.equal(result.telemetry.reframedShots, 3);
  assert.deepEqual(result.telemetry.skipped, { "camera-locked": 1 });
  assert.equal(echoShotPortraitScanEligibility(project.timeline[4], project.output_profile).reason, "fits-frame");
  for (const shot of result.timeline.filter((row) => row.camera_motion.startsWith("scan-"))) {
    assert.equal(shot.camera_focus, "vertical-scan");
    assert.equal(shot.decision_evidence.preservedDirection.camera, false);
    assert.equal(shot.decision_evidence.cameraFraming.previousMotion, "static");
  }
});

test("scan motions travel from the exact top to the exact bottom with no zoom, even at zero intensity", () => {
  const sample = (motion, timeSeconds) => {
    const presentation = echoCameraMotionPresentation({ startSeconds: 0, endSeconds: 4, timeSeconds, motion, intensity: 0, isPortrait: true });
    return { presentation, rect: echoCameraCoverSourceRect({ sourceWidth: 1080, sourceHeight: 1920, outputWidth: 1920, outputHeight: 1080, presentation }) };
  };
  const visible = 1080 * 1080 / 1920;
  const down = [0, 2, 4].map((t) => sample("scan-down", t));
  assert.deepEqual(down.map(({ presentation }) => presentation.scale), [1, 1, 1]);
  assert.equal(down[0].rect.y, 0);
  assert.ok(Math.abs(down[1].rect.y - (1920 - visible) / 2) < 1e-6);
  assert.ok(Math.abs(down[2].rect.y - (1920 - visible)) < 1e-6);
  assert.ok(Math.abs(down[0].rect.height - visible) < 1e-6);
  const up = [0, 4].map((t) => sample("scan-up", t).rect.y);
  assert.ok(Math.abs(up[0] - (1920 - visible)) < 1e-6);
  assert.equal(up[1], 0);
  assert.equal(sample("portrait-scan-down", 0).presentation.motion, "scan-down");
});

test("compact Director mode drops stale framing contracts and keeps small scan evidence", () => {
  const shot = portraitShot({ camera_motion: "slow-push-in", camera_framing_contract: { cropPolicy: "aspect-cover-full-bleed", motion: "slow-push-in" } });
  const result = applyEchoPortraitScanCamera({ project: landscapeProject([shot]) });
  const next = result.timeline[0];
  assert.equal(next.camera_motion, "scan-down");
  assert.equal(next.camera_framing_contract, undefined);
  assert.equal(next.decision_evidence.cameraFraming.reason, "portrait-source-in-landscape-output-full-height-scan");
  assert.equal(next.decision_evidence.cameraFraming.previousMotion, "slow-push-in");
  assert.ok(JSON.stringify(next.decision_evidence.cameraFraming).length < 400);
});

test("the editor projection plays a compact scan as a full-height crop path, not a centered crop", () => {
  const project = landscapeProject([portraitShot({ camera_motion: "slow-push-in" })]);
  const scanned = applyEchoPortraitScanCamera({ project }).timeline;
  assert.equal(scanned[0].camera_framing_contract, undefined);
  const graph = projectToEditorGraph({ ...project, timeline: scanned });
  const frames = graph.directorV2.cameraKeyframes.filter((row) => row.crop);
  assert.ok(frames.length >= 2, "the projection must emit crop keyframes for the tall shot");
  const visible = (768 / 1168) / (1920 / 1080);
  assert.equal(frames[0].crop.y, 0);
  assert.ok(Math.abs(frames.at(-1).crop.y - (1 - visible)) < 1e-6, "scan-down must end on the exact bottom");
  assert.ok(Math.abs(frames[0].crop.height - visible) < 1e-6, "no zoom beyond cover");
});
