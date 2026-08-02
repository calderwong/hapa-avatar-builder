import test from "node:test";
import assert from "node:assert/strict";
import { buildSafeCameraPath, classifyMediaRole, validateSafeCameraPath } from "../src/domain/media-role-camera.js";

test("portrait and comic media stay full-bleed and subject-safe at all target aspects", () => {
  for (const fixture of [
    { id: "portrait", technical: { width: 768, height: 1168, durationSec: 5, fps: 24 }, analysis: { status: "verified", evidence: "vision-face-union-mid-frame", faceCount: 1, subjectROI: { x: 0.55, y: 0.2, width: 0.28, height: 0.5 } } },
    { id: "comic", technical: { width: 2048, height: 3072, durationSec: 0, fps: 0, codec: "image" }, analysis: { status: "verified", evidence: "vision-attention-saliency-mid-frame", faceCount: 0, subjectROI: { x: 0.12, y: 0.12, width: 0.7, height: 0.76 } } },
  ]) {
    const role = classifyMediaRole({ technical: fixture.technical, subjectROI: fixture.analysis.subjectROI });
    const path = buildSafeCameraPath({ mediaId: fixture.id, technical: fixture.technical, analysis: fixture.analysis, role, phraseCue: { id: "phrase:1", startSeconds: 2, source: "registry" } });
    assert.ok(validateSafeCameraPath(path).ok);
    if (fixture.id === "portrait") assert.equal(path.id, "camera-path:d040994af6c15131");
    assert.equal(role, "portrait");
    assert.equal(path.zoomLimits.startCloseCrop, true);
    assert.ok(path.corridors.every((row) => row.fullBleed && !row.blackMatExposure));
    assert.ok(path.corridors.every((row) => [row.startCrop, row.endCrop].every((crop) => crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001)));
  }
});

test("camera crops preserve the top-origin vertical position of an off-center subject", () => {
  const technical = { width: 720, height: 1280, durationSec: 5, fps: 24 };
  const build = (subjectROI) => buildSafeCameraPath({
    mediaId: `portrait:${subjectROI.y}`,
    technical,
    analysis: { status: "verified", evidence: "vision-subject-roi", subjectROI },
    role: "portrait",
    phraseCue: { id: "phrase:roi", startSeconds: 0, source: "registry" },
    targetAspects: [16 / 9],
  });
  const top = build({ x: 0.25, y: 0.05, width: 0.5, height: 0.2 });
  const bottom = build({ x: 0.25, y: 0.7, width: 0.5, height: 0.2 });
  assert.ok(top.corridors[0].startCrop.y < bottom.corridors[0].startCrop.y);
  assert.ok(top.corridors[0].endCrop.y < bottom.corridors[0].endCrop.y);
});
