import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createEchoScoreDustThreeLayer } from "../src/components/echo-score-dust-three.js";
import { loadEchoScoreDustForSong, clearEchoScoreDustLoaderCache } from "../src/components/echo-score-dust-loader.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, prepareEchoScorePlayback } from "../src/domain/echo-visual-score.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
const score = composeEchoVisualScore(timeline);

test("the floor reflection mirrors the dust as a thin pool on the surface, sharing its geometry", () => {
  const world = new THREE.Group(), anchor = new THREE.Object3D();
  anchor.position.set(1, 0.5, 0); world.add(anchor);
  const layer = createEchoScoreDustThreeLayer({ world, particleCount: 600 });
  layer.setPlayback(prepareEchoScorePlayback(score, timeline), { seed: 3 }, "k");
  layer.setTarget(anchor);
  assert.equal(layer.update({ currentTime: 30 }).reflection, false, "off unless a floor is given");
  const report = layer.update({ currentTime: 31, floorY: "target", radius: 0.8, heightOffset: 0.2 });
  assert.equal(report.reflection, true);
  assert.equal(layer.reflection.geometry, layer.points.geometry, "no second buffer");
  assert.ok(Math.abs(layer.reflection.position.y - 0.504) < 1e-9, "on the anchor's surface");
  assert.ok(layer.reflection.scale.y < 0 && Math.abs(layer.reflection.scale.y) < layer.root.scale.y * 0.2, "mirrored and flattened");
  assert.equal(layer.reflection.material.depthWrite, false);
  assert.ok(layer.update({ currentTime: 32, floorY: -0.2 }).reflection && Math.abs(layer.reflection.position.y + 0.196) < 1e-9);
  layer.update({ active: false });
  assert.equal(layer.reflection.visible, false);
  assert.equal(layer.metrics.drawables, 2);
  layer.dispose();
  assert.equal(world.children.includes(layer.reflection), false);
});

test("3D stages load a Song's saved score once, and explain when they cannot", async () => {
  clearEchoScoreDustLoaderCache();
  const calls = [];
  const client = { request: async (route) => {
    calls.push(route);
    if (route.startsWith("/jobs?")) return { jobs: [{ id: "run-trip", state: "complete" }] };
    return { timeline, score, validation: { ok: true }, playSettings: { pulse: "half", seed: 4 } };
  } };
  const first = await loadEchoScoreDustForSong({ songId: "song-trip", client });
  assert.equal(first.playback.score.fingerprint, score.fingerprint);
  assert.deepEqual([first.settings.pulse, first.settings.seed, first.runId], ["half", 4, "run-trip"]);
  await loadEchoScoreDustForSong({ songId: "song-trip", client });
  assert.equal(calls.length, 2, "cached per Song");
  const none = await loadEchoScoreDustForSong({ songId: "other", client: { request: async () => ({ jobs: [] }) } });
  assert.match(none.reason, /no completed Audio Atlas analysis/);
  const broken = await loadEchoScoreDustForSong({ songId: "broken", client: { request: async () => { throw new Error("Atlas offline"); } } });
  assert.equal(broken.playback, null); assert.equal(broken.reason, "Atlas offline");
  assert.equal((await loadEchoScoreDustForSong({ songId: "" })).reason, "No Song on the table.");
});
