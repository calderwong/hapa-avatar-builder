import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import {
  echoCameraCoverSourceRect,
  echoCameraMotionPresentation,
} from "../src/domain/echo-camera-framing.js";
import { buildSafeCameraPath } from "../src/domain/media-role-camera.js";

const source = await readFile(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}`);
  assert.ok(start >= 0, `missing function ${name}`);
  const signatureEnd = source.indexOf(") {", start);
  assert.ok(signatureEnd >= 0, `missing function body ${name}`);
  const bodyStart = signatureEnd + 2;
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function previewHelpers() {
  const names = [
    "positiveEchoMediaDimension",
    "resolveEchoShotSourceDimensions",
    "cameraPresentationForShot",
    "drawEchoCameraFramedMediaInput",
  ];
  const context = {
    result: null,
    echoCameraCoverSourceRect,
    echoCameraMotionPresentation,
    Math,
    Number,
    Object,
  };
  vm.runInNewContext(
    `${names.map(functionSource).join("\n")}\nresult = { ${names.join(", ")} };`,
    context,
  );
  return context.result;
}

test("720x1280 media stays full-bleed, moving, and crop-preserving in a 1920x1080 Preview", () => {
  const cameraPath = buildSafeCameraPath({
    mediaId: "portrait-cue",
    technical: { width: 720, height: 1280, durationSec: 8, fps: 30 },
    analysis: {
      status: "verified",
      evidence: "portrait-fixture",
      subjectROI: { x: 0.42, y: 0.16, width: 0.34, height: 0.62 },
      faceCount: 1,
    },
    role: "portrait",
    phraseCue: { id: "phrase:portrait", atSeconds: 0, source: "test" },
    targetAspects: [16 / 9],
  });
  const common = {
    startSeconds: 0,
    endSeconds: 8,
    motion: "pan-down",
    intensity: 1,
    speed: 1,
    shotIndex: 0,
    sourceId: "portrait-cue",
    isPortrait: true,
  };
  const startPresentation = echoCameraMotionPresentation({
    ...common,
    timeSeconds: 0,
    crop: cameraPath.corridors[0].startCrop,
  });
  const endPresentation = echoCameraMotionPresentation({
    ...common,
    timeSeconds: 8,
    crop: cameraPath.corridors[0].endCrop,
  });
  const startRect = echoCameraCoverSourceRect({
    sourceWidth: 720,
    sourceHeight: 1280,
    outputWidth: 1920,
    outputHeight: 1080,
    presentation: startPresentation,
  });
  const endRect = echoCameraCoverSourceRect({
    sourceWidth: 720,
    sourceHeight: 1280,
    outputWidth: 1920,
    outputHeight: 1080,
    presentation: endPresentation,
  });

  assert.deepEqual(startPresentation.crop, cameraPath.corridors[0].startCrop);
  assert.deepEqual(endPresentation.crop, cameraPath.corridors[0].endCrop);
  assert.equal(startPresentation.isPortrait, true);
  assert.ok(startPresentation.cropScale > 1);
  assert.ok(Math.abs((startRect.width / startRect.height) - (16 / 9)) < 0.00001);
  assert.ok(Math.abs((endRect.width / endRect.height) - (16 / 9)) < 0.00001);
  assert.ok(startRect.x >= 0 && startRect.y >= 0);
  assert.ok(startRect.x + startRect.width <= 720.000001);
  assert.ok(startRect.y + startRect.height <= 1280.000001);
  assert.notEqual(startRect.y, endRect.y, "the portrait cue must move through its safe crop corridor");
});

test("Echo filter input is an offscreen camera-framed canvas, not the raw portrait decoder", () => {
  const helpers = previewHelpers();
  const drawCalls = [];
  const context = {
    clearRect() {},
    drawImage(...args) { drawCalls.push(args); },
  };
  const canvas = {
    width: 0,
    height: 0,
    dataset: {},
    getContext() { return context; },
  };
  const mediaElement = { videoWidth: 720, videoHeight: 1280 };
  const shot = {
    media_id: "portrait-cue",
    start_sec: 0,
    end_sec: 8,
    camera_motion: "pan-down",
    camera_intensity: 1,
    camera_speed: 1,
    media_contract: { dimensions: { width: 720, height: 1280 } },
  };
  const crop = { x: 0.05, y: 0.36, width: 0.9, height: 0.28 };
  const result = helpers.drawEchoCameraFramedMediaInput({
    canvas,
    mediaElement,
    shot,
    timeSeconds: 4,
    shotIndex: 0,
    cameraCrop: crop,
    outputWidth: 1920,
    outputHeight: 1080,
  });

  assert.ok(result);
  assert.equal(result.dimensions.source, "media-contract-dimensions");
  assert.equal(result.dimensions.isPortrait, true);
  assert.deepEqual(result.presentation.crop, crop);
  assert.equal(canvas.width, 1920);
  assert.equal(canvas.height, 1080);
  assert.equal(canvas.dataset.echoMediaInput, "camera-framed");
  assert.equal(canvas.dataset.echoSourceOrientation, "portrait");
  assert.equal(drawCalls.length, 1);
  assert.equal(drawCalls[0][0], mediaElement);
  assert.ok(Math.abs((drawCalls[0][3] / drawCalls[0][4]) - (16 / 9)) < 0.00001);
  assert.deepEqual(drawCalls[0].slice(5), [0, 0, 1920, 1080]);

  const contractWins = helpers.resolveEchoShotSourceDimensions(
    { media_contract: { dimensions: { width: 720, height: 1280 } } },
    { videoWidth: 1920, videoHeight: 1080 },
  );
  assert.equal(contractWins.isPortrait, true);
  assert.equal(contractWins.source, "media-contract-dimensions");
  const decodedFallback = helpers.resolveEchoShotSourceDimensions(
    { media_contract: {} },
    { videoWidth: 720, videoHeight: 1280 },
  );
  assert.equal(decodedFallback.isPortrait, true);
  assert.equal(decodedFallback.source, "decoded-media");
});

test("Echo Preview integration preserves crop at 30fps and cannot CSS-squish its output canvas", () => {
  const players = source.slice(
    source.indexOf("function PersistentEchoABPlayers"),
    source.indexOf("function PresentedEchoImage"),
  );
  assert.match(players, /1000 \/ 30/);
  assert.match(players, /echoCameraKeyframeAt\(cameraKeyframes, cameraTime\)/);
  assert.match(players, /cameraKeyframe\?\.crop \|\| null/);
  assert.match(source, /mediaElement: framedMediaInput\?\.canvas \|\| null/);
  assert.doesNotMatch(source, /mediaElement: currentPresentedMedia\?\.element \|\| null/);
  assert.match(source, /objectFit: 'cover'/);

  const previewFrame = source.slice(
    source.indexOf('data-testid="echo-director-preview-frame"'),
    source.indexOf("{/* Neon HUD Overlay */"),
  );
  assert.match(previewFrame, /aspectRatio: `\$\{activeOutputProfile\.width\} \/ \$\{activeOutputProfile\.height\}`/);
  assert.doesNotMatch(previewFrame, /minHeight:/);
  assert.doesNotMatch(previewFrame, /maxHeight:/);
  assert.match(previewFrame, /width: '100%',\s*height: '100%'/);
});
