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
    assert.equal(role, "portrait");
    assert.equal(path.zoomLimits.startCloseCrop, true);
    assert.ok(path.corridors.every((row) => row.fullBleed && !row.blackMatExposure));
    assert.ok(path.corridors.every((row) => [row.startCrop, row.endCrop].every((crop) => crop.x >= 0 && crop.y >= 0 && crop.x + crop.width <= 1.000001 && crop.y + crop.height <= 1.000001)));
  }
});
