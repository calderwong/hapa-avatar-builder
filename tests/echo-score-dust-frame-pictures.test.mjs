import test from "node:test";
import assert from "node:assert/strict";
import { dustPictureScale } from "../src/components/echo-score-dust-renderer.js";
import { imageRefProblem, normalizeDustPlaySettings } from "../src/domain/echo-visual-score.js";
import { planEchoScoreDustLayer, bindEchoScoreDustLayerRender } from "../src/domain/echo-score-dust-layer.js";

test("a filled dust picture spans the frame as its shot does; an unfilled one stays a centred card", () => {
  assert.equal(dustPictureScale(1920, 1080), 2.4);
  assert.equal(dustPictureScale(1920, 1080, true), 7.1); // landscape: the frame's width
  assert.equal(dustPictureScale(1000, 1000, true), 4); // square: the frame's height
  assert.equal(dustPictureScale(800, 1200, true), 4); // portrait: its longer side is the frame's height
  assert.equal(dustPictureScale(0, 0, true), 2.4);
  assert.equal(imageRefProblem({ assetId: "media:a", url: "/media/a.jpg", fill: true }), null);
  assert.match(imageRefProblem({ assetId: "media:a", url: "/media/a.jpg", fill: "yes" }), /fill/);
});

test("dust exposure is a bounded play setting outside the score", () => {
  assert.equal(normalizeDustPlaySettings({}).exposure, 1);
  assert.equal(normalizeDustPlaySettings({ exposure: 2 }).exposure, 2);
  assert.equal(normalizeDustPlaySettings({ exposure: 40 }).exposure, 4);
  assert.equal(normalizeDustPlaySettings({ particleCount: 12000, exposure: 2 }).seed, normalizeDustPlaySettings({}).seed);
});

test("a render binds only to a layer with the play settings it was made with", () => {
  const layer = (playSettings) => planEchoScoreDustLayer({ songId: "song", atlasRunId: "run", direction: {}, playSettings, scoreFingerprint: "fnv1a:12345678", seed: 7, startSeconds: 0, endSeconds: 10 });
  const receipt = (extra) => ({ width: 1920, height: 1080, fps: 30, startSeconds: 0, durationSeconds: 10, background: "transparent", scoreFingerprint: "fnv1a:12345678", seed: 7, loopBridgeSeconds: 0, ...extra });
  const render = (extra) => ({ recordingId: "rec-1", uri: "/media/r.webm", sha256: "a".repeat(64), receipt: receipt(extra) });
  assert.equal(bindEchoScoreDustLayerRender(layer(null), render({ particles: 6000 })).render.particles, 6000);
  const dense = bindEchoScoreDustLayerRender(layer({ particleCount: 12000, exposure: 2 }), render({ particles: 12000, exposure: 2 }));
  assert.deepEqual([dense.render.particles, dense.render.exposure], [12000, 2]);
  assert.throws(() => bindEchoScoreDustLayerRender(layer({ particleCount: 12000, exposure: 2 }), render({ particles: 6000 })), /particle count/);
  assert.throws(() => bindEchoScoreDustLayerRender(layer({ particleCount: 12000, exposure: 2 }), render({ particles: 12000 })), /exposure/);
  assert.throws(() => bindEchoScoreDustLayerRender(layer(null), render({ particles: 12000, exposure: 2 })), /particle count/);
});
