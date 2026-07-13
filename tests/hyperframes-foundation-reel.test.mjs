import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildFoundationFfmpegArgs,
  buildFoundationTimeline,
  installFoundationReelInShow,
  inlineFoundationRuntimeHtml,
  patchFoundationReelHtml,
} from "../src/domain/hyperframes-foundation-reel.js";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-foundation-reel-"));
  fs.mkdirSync(path.join(root, "assets/media"), { recursive: true });
  fs.writeFileSync(path.join(root, "assets/media/a.mp4"), "source-a");
  const show = {
    title: "Fixture Song",
    duration: 6,
    packaging: {},
    automation: { camera: [{ atSeconds: 0, motion: "pan-left" }] },
    instances: {
      media: [
        { id: "a", start: 0, end: 3, duration: 3, source: { type: "video", compiledUri: "assets/media/a.mp4", fidelity: "source-media" }, cameraKeyframes: [{ atSeconds: 0, motion: "pan-left", intensity: 1.2, speed: 1.5 }] },
        { id: "generated", start: 3, end: 4, duration: 1, source: { type: "generated-visualizer" }, cameraKeyframes: [] },
        { id: "a-again", start: 4, end: 6, duration: 2, source: { type: "video", compiledUri: "assets/media/a.mp4", fidelity: "source-media" }, cameraKeyframes: [{ atSeconds: 4, motion: "pan-up-right", intensity: 1, speed: 1.3 }] },
      ],
      visualizers: [{ id: "viz" }],
      lyrics: [{ id: "lyrics" }],
      accents: [{ id: "accent" }],
    },
  };
  return { root, show };
}

test("foundation timeline permits black only for explicit generated/no-source intervals", () => {
  const { root, show } = fixture();
  const plan = buildFoundationTimeline(show, { projectRoot: root, fps: 30 });
  assert.equal(plan.totalFrames, 180);
  assert.equal(plan.mediaSegments, 2);
  assert.equal(plan.explicitBlackSegments, 1);
  assert.deepEqual(plan.explicitBlackIntervals, [{ id: "generated", start: 3, end: 4, duration: 1 }]);
  assert.equal(plan.cameraBakedSegments, 2);

  const missing = structuredClone(show);
  missing.instances.media[1].start = 3.5;
  assert.throws(() => buildFoundationTimeline(missing, { projectRoot: root }), /Unexplained foundation gap/);

  const unresolved = structuredClone(show);
  unresolved.instances.media[0].source.compiledUri = "assets/media/missing.mp4";
  assert.throws(() => buildFoundationTimeline(unresolved, { projectRoot: root }), /Foundation source is unavailable/);
});

test("foundation ffmpeg contract is CFR H.264 yuv420p faststart with baked camera crops", () => {
  const { root, show } = fixture();
  const plan = buildFoundationTimeline(show, { projectRoot: root, fps: 30 });
  const args = buildFoundationFfmpegArgs(plan, path.join(root, "reel.mp4"));
  const serialized = args.join(" ");
  assert.match(serialized, /libx264/);
  assert.match(serialized, /yuv420p/);
  assert.match(serialized, /\+faststart/);
  assert.match(serialized, /-frames:v 180/);
  assert.match(serialized, /concat=n=3:v=1:a=0/);
  assert.match(serialized, /crop=1920:1080:x=/);
  assert.match(serialized, /color=c=0x02040a/);
  assert.doesNotMatch(serialized, /bootstrap/i);
});

test("derived show and HTML use one real reel while retaining overlays and provenance", () => {
  const { show } = fixture();
  const derived = installFoundationReelInShow(show, {
    compiledUri: "assets/media/fixture-foundation-reel.mp4",
    sha256: `sha256:${"a".repeat(64)}`,
    planSha256: `sha256:${"b".repeat(64)}`,
    explicitBlackIntervals: [{ start: 3, end: 4 }],
  });
  assert.equal(derived.instances.media.length, 1);
  assert.equal(derived.instances.visualizers.length, 1);
  assert.equal(derived.instances.lyrics.length, 1);
  assert.equal(derived.instances.accents.length, 1);
  assert.equal(derived.packaging.foundationReel.sourceMediaInstanceCount, 3);
  assert.equal(derived.packaging.foundationReel.physicalVideoElementCount, 1);
  assert.equal(derived.packaging.mediaBufferPolicy.bootstrapUri, null);

  const html = `<script>(function(){const defer=()=>{}})();</script><div id="root" data-duration="60"><audio id="mix-audio" data-duration="60"></audio><div id="media-root"><video src="hapa-video-bootstrap.mp4" data-media-src="assets/media/a.mp4"></video></div><div id="proxy-root"><img></div></div><script>const S={},media=[...document.querySelectorAll('.media')],proxyImages=new Map();function mediaFrame(t){media.forEach(()=>{})}function sampleHash(){}window.HAPA_ASSETS_READY=Promise.all([...proxyImages.values()].map(img=>img.decode?img.decode().catch(()=>{}):Promise.resolve())).then(()=>{});</script>`;
  const patched = patchFoundationReelHtml(html, { duration: 6, reelUri: "assets/media/fixture-foundation-reel.mp4" });
  assert.equal((patched.match(/<video\b/g) || []).length, 1);
  assert.match(patched, /src="assets\/media\/fixture-foundation-reel\.mp4"/);
  assert.match(patched, /data-camera-baked="true"/);
  assert.match(patched, /foundationReady/);
  assert.match(patched, /id="root" data-duration="6"/);
  assert.match(patched, /id="mix-audio" data-duration="6"/);
  assert.doesNotMatch(patched, /data-media-src|hapa-video-bootstrap/);

  const linked = `<script src="assets/data/show.js"></script><script src="assets/runtime/pinned-timeline.js"></script><script type="module">import{evaluateHyperFramesVisualizers}from'./assets/runtime/hyperframes-visualizer-runtime.js';evaluateHyperFramesVisualizers({},0)</script>`;
  const inlined = inlineFoundationRuntimeHtml(linked, {
    showScript: "window.HAPA_EXECUTABLE_SHOW={};",
    pinnedTimelineSource: "globalThis.HapaPinnedTimeline=class{};",
    visualizerRuntimeSource: "export function evaluateHyperFramesVisualizers(){}\nexport const HapaHyperFramesVisualizerRuntime={evaluateHyperFramesVisualizers};globalThis.HapaHyperFramesVisualizerRuntime=HapaHyperFramesVisualizerRuntime;",
  });
  assert.doesNotMatch(inlined, /<script\b[^>]*\bsrc=|type="module"|\bexport\s+function/);
  assert.match(inlined, /globalThis\.HapaHyperFramesVisualizerRuntime\.evaluateHyperFramesVisualizers/);
});
