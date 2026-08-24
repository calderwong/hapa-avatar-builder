import assert from "node:assert/strict";
import test from "node:test";
import {
  echoCameraCoverSourceRect,
  echoCameraCropPresentation,
  echoCameraFramingRuntimeBrowserSource,
  echoCameraKeyframeAt,
  echoCameraMotionPresentation,
} from "../src/domain/echo-camera-framing.js";

function cssPreviewVisibleSourceRect({
  sourceWidth,
  sourceHeight,
  outputWidth,
  outputHeight,
  presentation,
}) {
  const coverScale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight);
  const renderedWidth = sourceWidth * coverScale;
  const renderedHeight = sourceHeight * coverScale;
  const objectLeft = (outputWidth - renderedWidth) * (presentation.objectPositionXPercent / 100);
  const objectTop = (outputHeight - renderedHeight) * (presentation.objectPositionYPercent / 100);
  const originX = outputWidth * (presentation.transformOriginXPercent / 100);
  const originY = outputHeight * (presentation.transformOriginYPercent / 100);
  const translateX = outputWidth * (presentation.translateXPercent / 100);
  const translateY = outputHeight * (presentation.translateYPercent / 100);
  const left = originX + ((0 - originX) / presentation.scale) - translateX;
  const top = originY + ((0 - originY) / presentation.scale) - translateY;
  return {
    x: (left - objectLeft) / coverScale,
    y: (top - objectTop) / coverScale,
    width: outputWidth / (coverScale * presentation.scale),
    height: outputHeight / (coverScale * presentation.scale),
  };
}

test("off-center Echo camera crops become subject-aware CSS framing", () => {
  const framing = echoCameraCropPresentation({ x: 0.62, y: 0.1, width: 0.25, height: 0.8 });
  assert.equal(framing.objectPosition, "82.667% 50.000%");
  assert.equal(framing.transformOrigin, framing.objectPosition);
  assert.equal(framing.scale, 1.25);
});

test("portrait crop endpoints map to the exact top and bottom CSS cover overflow", () => {
  const sourceWidth = 768;
  const sourceHeight = 1168;
  const outputWidth = 1920;
  const outputHeight = 1080;
  const cropHeight = (sourceWidth / sourceHeight) / (outputWidth / outputHeight);
  const maximumY = 1 - cropHeight;
  const source = { sourceWidth, sourceHeight, outputWidth, outputHeight };
  const top = echoCameraCoverSourceRect({
    ...source,
    presentation: echoCameraMotionPresentation({
      motion: "pan-up",
      intensity: 0,
      speed: 2.4,
      isPortrait: true,
      crop: { x: 0, y: 0, width: 1, height: cropHeight },
    }),
  });
  const bottom = echoCameraCoverSourceRect({
    ...source,
    presentation: echoCameraMotionPresentation({
      motion: "pan-up",
      intensity: 0,
      speed: 2.4,
      isPortrait: true,
      crop: { x: 0, y: maximumY, width: 1, height: cropHeight },
    }),
  });
  assert.ok(top.y < 0.00001);
  assert.ok(Math.abs(bottom.y - (sourceHeight - bottom.height)) < 0.00001);
});

test("Echo camera corridors interpolate crop geometry within one shot", () => {
  const rows = [
    { atSeconds: 0, slotId: "shot-1", cameraPathId: "camera-1", crop: { x: 0.1, y: 0, width: 0.3, height: 1 } },
    { atSeconds: 4, slotId: "shot-1", cameraPathId: "camera-1", crop: { x: 0.5, y: 0.2, width: 0.3, height: 0.8 } },
  ];
  assert.deepEqual(echoCameraKeyframeAt(rows, 2).crop, { x: 0.3, y: 0.1, width: 0.3, height: 0.9 });
});

test("portrait auto motion deterministically selects a moving pan", () => {
  const input = {
    startSeconds: 10,
    endSeconds: 20,
    shotIndex: 4,
    sourceId: "portrait-card",
    isPortrait: true,
    motion: "auto",
    intensity: 1,
    speed: 1,
  };
  const start = echoCameraMotionPresentation({ ...input, timeSeconds: 10 });
  const end = echoCameraMotionPresentation({ ...input, timeSeconds: 20 });
  const repeated = echoCameraMotionPresentation({ ...input, timeSeconds: 10 });

  assert.deepEqual(start, repeated);
  assert.equal(start.motion, "pan-down");
  assert.equal(start.auto, true);
  assert.equal(start.isPortrait, true);
  assert.ok(start.translateYPercent < 0);
  assert.ok(end.translateYPercent > 0);
  assert.equal(start.translateXPercent, 0);
});

test("camera crop and directional motion compose without re-zooming a declared corridor", () => {
  const input = {
    startSeconds: 0,
    endSeconds: 8,
    isPortrait: true,
    motion: "pan-up",
    intensity: 1,
    speed: 1,
    crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
  };
  const start = echoCameraMotionPresentation({ ...input, timeSeconds: 0 });
  const end = echoCameraMotionPresentation({ ...input, timeSeconds: 8 });

  assert.deepEqual(start.crop, { x: 0.25, y: 0.1, width: 0.5, height: 0.8 });
  assert.equal(start.cropScale, 1.25);
  assert.equal(start.scale, 1.3);
  assert.equal(start.objectPositionXPercent, 50);
  assert.equal(start.objectPositionYPercent, 50);
  assert.equal(start.transformOriginXPercent, 50);
  assert.equal(start.transformOriginYPercent, 50);
  assert.ok(start.translateYPercent > 0);
  assert.ok(end.translateYPercent < 0);
});

test("camera intensity and speed scale motion while speed also paces progress", () => {
  const common = {
    startSeconds: 0,
    endSeconds: 10,
    timeSeconds: 0,
    motion: "pan-right",
  };
  const gentle = echoCameraMotionPresentation({ ...common, intensity: 0.5, speed: 1 });
  const energetic = echoCameraMotionPresentation({ ...common, intensity: 1, speed: 2 });
  const paced = echoCameraMotionPresentation({ ...common, timeSeconds: 2.5, intensity: 1, speed: 2 });

  assert.equal(gentle.translateXPercent, -2.4);
  assert.equal(energetic.translateXPercent, -9.6);
  assert.equal(energetic.speed, 2);
  assert.equal(energetic.intensity, 1);
  assert.equal(paced.rawProgress, 0.25);
  assert.equal(paced.pacedProgress, 0.5);
  assert.equal(paced.progress, 0.5);
});

test("tilt aliases and landscape auto choices resolve to canonical motions", () => {
  const tilted = echoCameraMotionPresentation({ motion: "tilt-up", speed: 1 });
  const automatic = echoCameraMotionPresentation({ motion: "auto", shotIndex: 4, speed: 1 });
  const fallback = echoCameraMotionPresentation({
    motion: "auto",
    shotIndex: 0,
    sourceId: "garden-open",
  });

  assert.equal(tilted.declaredMotion, "tilt-up");
  assert.equal(tilted.motion, "pan-up");
  assert.equal(automatic.motion, "slow-push-in");
  assert.equal(fallback.motion, "pan-down");
  assert.equal(fallback.speed, 1.67);
});

test("a zero-intensity static portrait crop is not zoomed beyond its certified framing", () => {
  const crop = { x: 0, y: 0.341796875, width: 1, height: 0.31640625 };
  for (const timeSeconds of [0, 2, 4]) {
    const presentation = echoCameraMotionPresentation({
      startSeconds: 0,
      endSeconds: 4,
      timeSeconds,
      motion: "static",
      intensity: 0,
      speed: 1,
      isPortrait: true,
      crop,
    });
    assert.deepEqual(presentation.crop, crop);
    assert.equal(presentation.scale, 1);
    assert.equal(presentation.translateXPercent, 0);
    assert.equal(presentation.translateYPercent, 0);
  }
});

test("Canvas framing samples the same bounds as CSS cover for portrait media in landscape output", () => {
  const presentation = echoCameraMotionPresentation({
    startSeconds: 0,
    endSeconds: 10,
    timeSeconds: 7,
    motion: "pan-down-right",
    intensity: 0.9,
    speed: 1.25,
    isPortrait: false,
    crop: { x: 0.48, y: 0.08, width: 0.34, height: 0.78 },
  });
  const input = {
    sourceWidth: 1080,
    sourceHeight: 1920,
    outputWidth: 1920,
    outputHeight: 1080,
    presentation,
  };
  const expected = cssPreviewVisibleSourceRect(input);
  const actual = echoCameraCoverSourceRect(input);

  assert.ok(Math.abs(actual.x - expected.x) < 0.00001);
  assert.ok(Math.abs(actual.y - expected.y) < 0.00001);
  assert.ok(Math.abs(actual.width - expected.width) < 0.00001);
  assert.ok(Math.abs(actual.height - expected.height) < 0.00001);
  assert.notEqual(
    actual.x + (actual.width / 2),
    presentation.objectPositionXPercent / 100 * input.sourceWidth,
    "CSS object-position is based on remaining overflow, not a normalized source center",
  );
});

test("Canvas framing samples the same bounds as CSS cover for landscape media in portrait output", () => {
  const presentation = echoCameraMotionPresentation({
    startSeconds: 3,
    endSeconds: 11,
    timeSeconds: 5,
    motion: "pan-up-left",
    intensity: 0.75,
    speed: 1.1,
    isPortrait: true,
  });
  const input = {
    sourceWidth: 1920,
    sourceHeight: 1080,
    outputWidth: 1080,
    outputHeight: 1920,
    presentation,
  };
  const expected = cssPreviewVisibleSourceRect(input);
  const actual = echoCameraCoverSourceRect(input);

  assert.ok(Math.abs(actual.x - expected.x) < 0.00001);
  assert.ok(Math.abs(actual.y - expected.y) < 0.00001);
  assert.ok(Math.abs(actual.width - expected.width) < 0.00001);
  assert.ok(Math.abs(actual.height - expected.height) < 0.00001);
});

test("packaged browser camera runtime preserves the live portrait cover contract", () => {
  const source = echoCameraFramingRuntimeBrowserSource("PackagedEchoCamera");
  const runtime = Function(`${source}\nreturn PackagedEchoCamera;`)();
  const input = {
    startSeconds: 0,
    endSeconds: 8,
    timeSeconds: 4,
    motion: "pan-down",
    intensity: 1.1,
    speed: 1.8,
    shotIndex: 2,
    sourceId: "portrait-export",
    isPortrait: true,
    crop: { x: 0.2, y: 0.05, width: 0.6, height: 0.9 },
  };
  const livePresentation = echoCameraMotionPresentation(input);
  const packagedPresentation = runtime.echoCameraMotionPresentation(input);
  assert.deepEqual(packagedPresentation, livePresentation);
  assert.deepEqual(
    runtime.echoCameraCoverSourceRect({
      sourceWidth: 720,
      sourceHeight: 1280,
      outputWidth: 1920,
      outputHeight: 1080,
      presentation: packagedPresentation,
    }),
    echoCameraCoverSourceRect({
      sourceWidth: 720,
      sourceHeight: 1280,
      outputWidth: 1920,
      outputHeight: 1080,
      presentation: livePresentation,
    }),
  );
});
