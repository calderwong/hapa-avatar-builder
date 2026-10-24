import test from "node:test";
import assert from "node:assert/strict";
import { scoreDustCastFor, scoreDustPictureOption } from "../src/domain/echo-score-dust-pictures.js";
import { sampleDustTargetsFromPixels } from "../src/domain/echo-dust-swarm.js";
import { buildEchoMusicalTimelineFromAtlas, composeEchoVisualScore, validateEchoVisualScore } from "../src/domain/echo-visual-score.js";
import { atlasFixture } from "./echo-score-dust-fixture.mjs";

test("cast lists explicit song bindings before evergreen cast, without duplicates", () => {
  const bella = scoreDustCastFor("dear-papa-song-i-knew-a-bella");
  assert.equal(bella[0].avatarId, "pinokio-bella");
  assert.ok(bella.length > 1 && new Set(bella.map((m) => m.avatarId)).size === bella.length);
  assert.ok(scoreDustCastFor("unknown-song").every((m) => m.castClass === "evergreen"));
});

test("picture option prefers the registered seed image, then a backgroundless one", () => {
  const avatar = { id: "avatar-5", assets: [
    { id: "a", type: "image", uri: "/media/a.png", name: "portrait" },
    { id: "b", type: "image", uri: "/media/b.png", name: "fullbody backgroundless" },
    { id: "v", type: "video", uri: "/media/v.mp4" },
  ] };
  assert.equal(scoreDustPictureOption(avatar, { name: "Thorsun", seedAssetId: "a" }, (u) => `http://x${u}`).url, "http://x/media/a.png");
  const fallback = scoreDustPictureOption(avatar, { name: "Thorsun", seedAssetId: "missing" });
  assert.equal(fallback.assetId, "avatar:avatar-5:b");
  assert.equal(fallback.source, "avatar-asset");
  assert.equal(scoreDustPictureOption({ id: "x", assets: [{ id: "v", type: "video", uri: "/v.mp4" }] }, {}), null);
});

test("backgroundless pictures form their alpha silhouette, including dark pixels", () => {
  const width = 40, height = 40, data = new Uint8ClampedArray(width * height * 4);
  // A black figure on a transparent background: luminance alone would find nothing.
  for (let y = 5; y < 35; y++) for (let x = 15; x < 25; x++) data.set([10, 10, 10, 255], (y * width + x) * 4);
  const points = sampleDustTargetsFromPixels({ width, height, data }, { count: 200, seed: 2 });
  assert.equal(points.count, 200);
  for (let i = 0; i < points.count; i++) assert.ok(Math.abs(points.position[i * 3]) < 0.25, "points stay on the figure");
  const opaque = new Uint8ClampedArray(width * height * 4).fill(255);
  for (let i = 0; i < width * height; i++) opaque.set([0, 0, 0, 255], i * 4);
  assert.equal(sampleDustTargetsFromPixels({ width, height, data: opaque }, { count: 50 }).count, 0, "an opaque black image has nothing lit");
});

test("picture motifs validate against the available picture assets", () => {
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
  const group = timeline.sections[1].repeatGroup;
  const score = composeEchoVisualScore(timeline, { images: { [group]: { assetId: "avatar:avatar-5:b", url: "/media/b.png" } } });
  assert.equal(validateEchoVisualScore(score, { timeline, assets: ["avatar:avatar-5:b"] }).ok, true);
  assert.ok(validateEchoVisualScore(score, { timeline, assets: [] }).errors.some((e) => e.code === "absent-asset"));
});

test("picture motifs face the viewer for their whole section", async () => {
  const { buildScoreDustMotion } = await import("../src/domain/echo-score-dust-performance.js");
  const timeline = buildEchoMusicalTimelineFromAtlas(atlasFixture());
  const group = timeline.sections[1].repeatGroup, section = timeline.sections[1];
  const motion = buildScoreDustMotion(composeEchoVisualScore(timeline, { images: { [group]: { assetId: "a", url: "/a.png" } } }));
  const late = motion.rotationAt(section.end - 0.1), turn = Math.round(late / (2 * Math.PI)) * 2 * Math.PI;
  assert.ok(Math.abs(late - turn) < 1e-3);
  assert.equal(motion.rotationAt(section.end - 0.1), motion.rotationAt(section.end - 2), "no spin while the picture is shown");
});
