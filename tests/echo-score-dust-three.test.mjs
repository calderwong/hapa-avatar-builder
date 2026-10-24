import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createEchoScoreDustThreeLayer, ECHO_SCORE_DUST_STAGE_CONTRACT } from "../src/components/echo-score-dust-three.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback } from "../src/domain/echo-visual-score.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const playback = prepareEchoScorePlayback(composeEchoVisualScore(timeline), timeline);

test("the 3D layer follows the stage contract: depth-tested, no depth writes, additive, fogged", () => {
  const world = new THREE.Group(), layer = createEchoScoreDustThreeLayer({ world, particleCount: 600 });
  const material = layer.points.material;
  assert.equal(material.depthTest, true);
  assert.equal(material.depthWrite, false, "luminous dust never writes depth (black-dot lead)");
  assert.equal(material.blending, THREE.AdditiveBlending);
  assert.equal(material.fog, true);
  assert.equal(layer.metrics.lights, 0);
  assert.deepEqual(ECHO_SCORE_DUST_STAGE_CONTRACT.depth, { depthTest: true, depthWrite: false, blending: "additive", renderOrder: 5 });
  assert.equal(layer.update({ currentTime: 10 }).active, false, "no target or playback → hidden");
  assert.equal(layer.root.visible, false);
  layer.dispose();
  assert.equal(world.children.length, 0);
});

test("on the song clock it fills buffers around the anchor and reports colour and energy", () => {
  const world = new THREE.Group(), anchor = new THREE.Object3D();
  anchor.position.set(2, 0, -1); world.add(anchor);
  const layer = createEchoScoreDustThreeLayer({ world, particleCount: 800 });
  layer.setPlayback(playback, { seed: 5 }, "k1");
  layer.setTarget(anchor);
  let report;
  for (let t = 30; t <= 32; t += 1 / 30) report = layer.update({ currentTime: t, radius: 0.8 });
  assert.equal(report.active, true);
  assert.ok(report.visible > 400);
  assert.ok(report.energy >= 0 && report.energy <= 1);
  assert.ok(Number.isInteger(report.meanColor));
  assert.ok(report.centroid.distanceTo(new THREE.Vector3(2, 0.78, -1)) < 0.6, "dust centres over the anchor");
  const positions = layer.points.geometry.attributes.position.array;
  assert.ok(positions.every(Number.isFinite));
  layer.setDetailTier("reduced");
  assert.equal(layer.points.geometry.drawRange.count, Math.floor(800 * 0.4));
  layer.setPlayback(playback, { seed: 5 }, "k1");
  assert.equal(layer.playbackKey, "k1", "same key keeps the running performance");
  layer.dispose();
});
