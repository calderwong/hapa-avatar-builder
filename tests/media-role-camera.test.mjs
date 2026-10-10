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

test('section camera limits constrain actual interpolated crop motion, including short shots and reverse seeks', async () => {
  const { echoSectionVisualBudget, echoSectionCameraBudgetForWindow } = await import('../src/domain/hyperframes-visualizer-runtime.js');
  const { echoCameraKeyframeAt, echoCameraMotionPresentation, echoCameraCoverSourceRect } = await import('../src/domain/echo-camera-framing.js');
  for (const type of ['intro', 'verse', 'chorus']) for (const durationSeconds of [.2, 2, 8]) {
    const budget = echoSectionVisualBudget({ type });
    const path = buildSafeCameraPath({ mediaId:'motion-proof', technical:{width:1920,height:1080}, analysis:{subjectROI:{x:.2,y:.2,width:.4,height:.4}}, role:'reveal', durationSeconds, motionBudget:budget });
    assert.equal(path.easing, 'smootherstep');
    const corridor = path.corridors[0];
    assert.ok(corridor.maximumVelocity <= budget.maxCameraVelocity + 1e-10);
    assert.ok(corridor.maximumAcceleration <= budget.maxCameraAcceleration + 1e-10);
    const keyframes = [{atSeconds:0,cameraPathId:path.id,slotId:'one',crop:corridor.startCrop,easing:path.easing,sectionMotionBudget:budget},{atSeconds:durationSeconds,cameraPathId:path.id,slotId:'one',crop:corridor.endCrop}];
    const keys=['x','y','width','height'], dt=durationSeconds/1000;
    for(let i=1;i<1000;i++) {
      const t=i*dt, a=echoCameraKeyframeAt(keyframes,t-dt).crop,b=echoCameraKeyframeAt(keyframes,t).crop,c=echoCameraKeyframeAt(keyframes,t+dt).crop;
      const acceleration=Math.hypot(...keys.map(k=>(c[k]-2*b[k]+a[k])/(dt*dt)));
      assert.ok(acceleration <= budget.maxCameraAcceleration + .0002, `${type}/${durationSeconds}/${t}: ${acceleration}`);
    }
    const sample=echoCameraKeyframeAt(keyframes,durationSeconds*.25);
    echoCameraKeyframeAt(keyframes,durationSeconds*.9);
    assert.deepEqual(echoCameraKeyframeAt(keyframes,durationSeconds*.25),sample);
    const presentation=echoCameraMotionPresentation({crop:sample.crop,motion:'pan-left',intensity:2,speed:2,timeSeconds:durationSeconds*.25,endSeconds:durationSeconds});
    assert.equal(presentation.scale,1); assert.equal(presentation.translateXPercent,0);
    const rect=echoCameraCoverSourceRect({sourceWidth:1920,sourceHeight:1080,outputWidth:1920,outputHeight:1080,presentation});
    assert.ok(Math.abs(rect.x-sample.crop.x*1920)<1e-6);
  }
  const spanning=echoSectionCameraBudgetForWindow([{id:'peak',type:'chorus',start:0,end:2},{id:'quiet',type:'outro',start:2,end:4}],1,3);
  assert.equal(spanning.maxCameraAcceleration,echoSectionVisualBudget({type:'outro'}).maxCameraAcceleration);
});

test("a Director full-height scan survives the section motion budget: exact top to exact bottom, no zoom", () => {
  const budget = { maxCameraVelocity: 0.02, maxCameraAcceleration: 0.01 };
  const common = { mediaId: "tall", technical: { width: 1080, height: 1920 }, analysis: { subjectROI: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 } },
    role: "hold", phraseCue: { id: "cue" }, targetAspects: [16 / 9], durationSeconds: 4, motionBudget: budget };
  const down = buildSafeCameraPath({ ...common, scan: "scan-down" });
  const visible = (1080 / 1920) / (16 / 9);
  assert.equal(down.scan, "scan-down");
  assert.deepEqual(down.zoomLimits, { min: 1, max: 1, startCloseCrop: true });
  assert.equal(down.keyframes[0].crop.y, 0);
  assert.ok(Math.abs(down.keyframes[1].crop.y - (1 - visible)) < 1e-9, "the budget must not clamp the travel short of the bottom");
  assert.equal(down.keyframes[0].crop.cameraModel, "section-crop-v1");
  assert.ok(Math.abs(down.keyframes[0].crop.height - visible) < 1e-9);
  assert.deepEqual(validateSafeCameraPath(down).errors, []);
  const up = buildSafeCameraPath({ ...common, scan: "scan-up" });
  assert.equal(up.keyframes[1].crop.y, 0);
  assert.notEqual(up.id, down.id);
  const unscanned = buildSafeCameraPath(common);
  assert.ok(Math.abs(unscanned.keyframes[1].crop.y - unscanned.keyframes[0].crop.y) < 0.1, "ordinary section paths still drift within budget");
});
