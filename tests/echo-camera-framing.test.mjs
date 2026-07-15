import assert from "node:assert/strict";
import test from "node:test";
import {
  echoCameraCropPresentation,
  echoCameraKeyframeAt,
} from "../src/domain/echo-camera-framing.js";

test("off-center Echo camera crops become subject-aware CSS framing", () => {
  const framing = echoCameraCropPresentation({ x: 0.62, y: 0.1, width: 0.25, height: 0.8 });
  assert.equal(framing.objectPosition, "74.500% 50.000%");
  assert.equal(framing.transformOrigin, framing.objectPosition);
  assert.equal(framing.scale, 1.25);
});

test("Echo camera corridors interpolate crop geometry within one shot", () => {
  const rows = [
    { atSeconds: 0, slotId: "shot-1", cameraPathId: "camera-1", crop: { x: 0.1, y: 0, width: 0.3, height: 1 } },
    { atSeconds: 4, slotId: "shot-1", cameraPathId: "camera-1", crop: { x: 0.5, y: 0.2, width: 0.3, height: 0.8 } },
  ];
  assert.deepEqual(echoCameraKeyframeAt(rows, 2).crop, { x: 0.3, y: 0.1, width: 0.3, height: 0.9 });
});
