import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { sampleDustTargetsFromTriangles } from "../src/domain/echo-dust-swarm.js";
import { trianglesFromObject3D } from "../src/components/echo-score-dust-model.js";
import { scoreDustModelOption } from "../src/domain/echo-score-dust-pictures.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, imageRefProblem, validateEchoVisualScore } from "../src/domain/echo-visual-score.js";
import { buildScoreDustMotion } from "../src/domain/echo-score-dust-performance.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

test("mesh sampling spreads points over the surface by area, centred and scaled", () => {
  // A big square (two triangles, area 4) and a tiny one (area 0.04) far away.
  const tris = Float32Array.of(0, 0, 0, 2, 0, 0, 2, 2, 0, 0, 0, 0, 2, 2, 0, 0, 2, 0, 10, 10, 0, 10.2, 10, 0, 10.2, 10.2, 0);
  const colors = Uint8Array.of(255, 0, 0, 255, 0, 0, 0, 0, 255);
  const points = sampleDustTargetsFromTriangles(tris, { count: 2000, seed: 3, scale: 2, colors });
  assert.equal(points.count, 2000);
  const blue = Array.from({ length: 2000 }, (_, i) => points.color[i * 3 + 2]).filter((b) => b === 255).length;
  assert.ok(blue < 2000 * 0.02, `${blue} points on the tiny far triangle (area share ≈ 0.5%)`);
  let maxAbs = 0; for (const v of points.position) maxAbs = Math.max(maxAbs, Math.abs(v));
  assert.ok(maxAbs <= 1 + 1e-6, "the largest extent fits the scale");
  assert.ok(Math.abs(points.normal[2]) > 0.99, "flat squares face +z");
  assert.deepEqual(sampleDustTargetsFromTriangles(tris, { count: 50, seed: 3 }).position, sampleDustTargetsFromTriangles(tris, { count: 50, seed: 3 }).position, "deterministic");
  assert.equal(sampleDustTargetsFromTriangles(new Float32Array(9), { count: 10 }).count, 0, "degenerate meshes give no points");
});

test("Three.js meshes flatten into world-space triangles with material colours", () => {
  const group = new THREE.Group();
  const box = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x00ff00 }));
  box.position.set(5, 0, 0); group.add(box);
  const { triangles, colors } = trianglesFromObject3D(group);
  assert.equal(triangles.length / 9, 12);
  let minX = Infinity; for (let i = 0; i < triangles.length; i += 3) minX = Math.min(minX, triangles[i]);
  assert.ok(Math.abs(minX - 4.5) < 1e-6, "world transform applied");
  assert.deepEqual([...colors.subarray(0, 3)], [0, 255, 0]);
  const capped = trianglesFromObject3D(group, { maxTriangles: 5 });
  assert.equal(capped.triangles.length / 9, 5); assert.equal(capped.truncated, true);
});

test("Avatar models become 3D shape options that keep turning instead of facing the viewer", () => {
  const avatar = { id: "av", primaryName: "Ava", assets: [{ id: "img", type: "image", uri: "/media/a.png" }, { id: "rig", type: "model", uri: "/media/ava.glb" }] };
  const option = scoreDustModelOption(avatar, { name: "Ava" });
  assert.deepEqual([option.kind, option.url, option.assetId], ["model", "/media/ava.glb", "avatar-model:av:rig"]);
  assert.equal(scoreDustModelOption({ id: "x", assets: [{ id: "f", type: "model", uri: "/m.fbx" }] }, {}), null, "only glTF/GLB load in the browser");
  assert.equal(imageRefProblem({ assetId: "m", kind: "model" }), "3D models need a url.");
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture()), group = timeline.sections[0].repeatGroup;
  const score = composeEchoVisualScore(timeline, { images: { [group]: { assetId: option.assetId, kind: "model", url: option.url, label: option.label } } });
  assert.equal(validateEchoVisualScore(score, { timeline, assets: [option.assetId] }).ok, true);
  assert.ok(validateEchoVisualScore(score, { timeline, assets: [] }).errors.some((e) => e.code === "absent-asset"), "models are Avatar assets and must resolve");
  const cue = score.cues[0], mid = (cue.start + cue.end) / 2;
  const faces = (s) => buildScoreDustMotion(s).segments.find((seg) => mid >= seg.start && mid < seg.end).face;
  assert.equal(faces(score), false, "a model keeps turning");
  assert.equal(faces(composeEchoVisualScore(timeline, { images: { [group]: { assetId: "avatar:av:img", url: "/media/a.png" } } })), true, "a flat picture faces the viewer");
});
