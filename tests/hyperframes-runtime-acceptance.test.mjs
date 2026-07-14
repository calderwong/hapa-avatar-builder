import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import * as hyperframes from "../src/domain/hyperframes-show-compiler.js";
import { evaluateHyperFramesVisualizers } from "../src/domain/hyperframes-visualizer-runtime.js";

const MUSIC_VIZ_ROOT = process.env.HAPA_MUSIC_VIZ_ROOT || "/Users/calderwong/Desktop/hapa-music-viz";
const read = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const graph = read("work/dear-papa-stem-telemetry/native-show-graph.json");
const telemetry = read("work/dear-papa-stem-telemetry/stem-telemetry.json");
const project = read("data/music-video-projects/dear-papa-song-dear-papa-video-project.json");
const proxyRegistry = read(path.join(MUSIC_VIZ_ROOT, "web/isf/proxies/native-exact-proxies.json"));
const golden = read("tests/fixtures/hyperframes-dear-papa-golden-timestamps.json");
const visualizerMix = 0.64;

function sourceVisualizerCues(showGraph) {
  const rows = [];
  for (const track of showGraph.tracks || []) {
    for (const [cardIndex, card] of (track.cards || []).entries()) {
      const executable = Boolean(card.visualization && (
        track.role === "visualizer"
        || track.id === "track-b"
        || card.visualization.card?.schemaVersion === "hapa.visualizer-card.v2"
      ));
      if (executable) rows.push({ track, card, cardIndex });
    }
  }
  return rows.sort((left, right) => (
    left.card.startSeconds - right.card.startSeconds
    || left.card.endSeconds - right.card.endSeconds
    || left.card.id.localeCompare(right.card.id)
  ));
}

function compile(sourceGraph = graph) {
  return hyperframes.compileHyperFramesShow({
    showGraph: sourceGraph,
    telemetry,
    project,
    proxyRegistry,
    fps: 30,
    visualizerMix,
  });
}

function pinnedTimelineHarness(duration = 20_000) {
  const context = vm.createContext({
    draws: [],
    queueMicrotask,
  });
  const runtimeSource = fs.readFileSync("src/domain/hapa-pinned-timeline.js", "utf8");
  vm.runInContext(runtimeSource, context);
  vm.runInContext(`globalThis.timeline=new HapaPinnedTimeline(${duration},(time)=>{draws.push(time);return time})`, context);
  return context;
}

test("Hapa pinned timeline coalesces HyperFrames volume-scan seeks and paints before an async evaluation boundary", async () => {
  const context = pinnedTimelineHarness();

  vm.runInContext("for(let index=0;index<10000;index+=1)timeline.seek(index/60)", context);
  assert.equal(context.draws.length, 0, "a synchronous seek burst must not run an expensive draw inline");
  await Promise.resolve();
  assert.deepEqual(context.draws, [9_999 / 60], "the burst must paint once at its latest requested time");
  assert.equal(vm.runInContext("timeline.lastRenderedTime", context), 9_999 / 60);

  vm.runInContext("timeline.seek(731.25)", context);
  await Promise.resolve();
  assert.deepEqual(context.draws, [9_999 / 60, 731.25], "a normal per-frame async evaluation must observe its requested paint");
  assert.equal(vm.runInContext("timeline.time()", context), 731.25);
  assert.equal(vm.runInContext("timeline.seek()", context), 731.25, "HyperFrames must be able to snapshot timeline time before a media-envelope probe");
  assert.equal(vm.runInContext("timeline.lastRenderedTime", context), 731.25);
});

test("Hapa pinned timeline flush and renderNow preserve same-stack probes without duplicate microtask paints", async () => {
  const context = pinnedTimelineHarness(100);

  assert.equal(vm.runInContext("timeline.seek(12.5);timeline.flush()", context), 12.5);
  assert.deepEqual(context.draws, [12.5], "flush must synchronously paint a pending seek");
  await Promise.resolve();
  assert.deepEqual(context.draws, [12.5], "a flushed seek must cancel its queued duplicate paint");

  assert.equal(vm.runInContext("timeline.seek(25);timeline.renderNow()", context), 25);
  assert.deepEqual(context.draws, [12.5, 25], "renderNow must synchronously paint the latest time");
  await Promise.resolve();
  assert.deepEqual(context.draws, [12.5, 25], "renderNow must not leave a duplicate microtask paint");
});

test("Dear Papa HyperFrames schedules every sequential visualizer cue with exact per-layer execution fields", () => {
  const expected = sourceVisualizerCues(graph);
  const show = compile();
  assert.equal(expected.length, 3, "Dear Papa source fixture should expose all three sequential Track-B cues");
  assert.equal(show.instances.visualizers.length, expected.length);
  assert.deepEqual(show.instances.visualizers.map((row) => row.cueId), expected.map((row) => row.card.id));
  assert.deepEqual(show.instances.visualizers.map((row) => row.visualizerId), expected.map((row) => row.card.visualization.sourceId));
  assert.equal(show.visualizerCoverage.sourceCueCount, expected.length);
  assert.equal(show.visualizerCoverage.firstStart, 0);
  assert.equal(show.visualizerCoverage.lastEnd, show.duration);

  for (let index = 0; index < expected.length; index += 1) {
    const { track, card } = expected[index];
    const portable = card.visualization.card;
    const instance = show.instances.visualizers[index];
    assert.equal(instance.trackId, track.id);
    assert.equal(instance.start, card.startSeconds);
    assert.equal(instance.end, card.endSeconds);
    assert.equal(instance.duration, card.endSeconds - card.startSeconds);
    if (index > 0) assert.equal(instance.start, show.instances.visualizers[index - 1].end, `cue seam ${index} must be gapless`);
    assert.equal(instance.stemFocus, portable.stemFocus || "master");
    assert.deepEqual(instance.inputs, portable.inputs || []);
    assert.deepEqual(instance.controls, { ...(portable.controls || {}), ...(card.parameters?.visualizerControls || {}) });
    assert.ok(Object.values(instance.audioMap).every((mapping) => mapping && typeof mapping === "object" && !Array.isArray(mapping)));
    for (const [uniform, editorMapping] of Object.entries(card.parameters?.visualizerMappings || {})) {
      const parts = String(editorMapping).split(":");
      assert.equal(instance.audioMap[uniform].signal, parts.at(-1));
      if (parts.length > 1) assert.equal(instance.audioMap[uniform].stemFocus, parts.slice(0, -1).join(":"));
      if (portable.audioMap?.[uniform]?.depth != null) {
        assert.equal(instance.audioMap[uniform].depth, portable.audioMap[uniform].depth, "editor aliases must preserve portable mapping depth");
      }
    }
    assert.ok(instance.audioSignal.length > 0);
    assert.equal(instance.baseOpacity, portable.layer?.opacity ?? 1);
    assert.equal(instance.opacity, card.parameters?.opacity ?? instance.baseOpacity);
    assert.equal(instance.visualizerMix, visualizerMix);
    assert.ok(Math.abs(instance.effectiveOpacity - instance.opacity * visualizerMix) < 1e-12);
    assert.equal(instance.blendMode, portable.layer?.blend || card.parameters?.blendMode || "screen");
    assert.equal(instance.target, portable.layer?.target || card.parameters?.target || "program");
    assert.ok(instance.transition);
    assert.match(instance.sourceHash, /^sha256:[0-9a-f]{64}$/);
    assert.match(instance.declaredSourceHash, /^(?:sha256:[0-9a-f]{64}|fnv1a32:[0-9a-f]{8})$/);
    assert.equal(instance.execution.route, "hash-bound-exact-proxy");
    assert.equal(instance.execution.status, "exact");
    assert.equal(instance.execution.drawable, true);
    assert.equal(instance.execution.silentDefault, false);
    assert.equal(instance.nativeRoute?.schemaVersion, "hapa.music-viz.native-shader-route.v1");
    assert.equal(instance.nativeRoute?.route, "hash-bound-exact-proxy");
    assert.equal(instance.nativeRoute?.status, "exact");
    assert.equal(instance.nativeRoute?.requested?.id, instance.visualizerId);
    assert.equal(instance.nativeRoute?.requested?.sourceHash, instance.sourceHash);
    assert.equal(instance.nativeRoute?.silentDefault, false);
    assert.equal(instance.rendererTruth.status, "exact");
    assert.equal(instance.rendererTruth.route, "hash-bound-exact-proxy");
    assert.deepEqual(instance.rendererTruth.fidelityLoss, []);
    assert.equal(instance.rendererTruth.visible, true);
    assert.equal(instance.rendererTruth.silentDefault, false);
    assert.ok(instance.proxy?.assetPath.startsWith("/static/isf/proxies/"));
    assert.match(instance.proxy?.assetSha256 || "", /^sha256:[0-9a-f]{64}$/);
    assert.equal(instance.proxy?.sourceHash, instance.sourceHash);
    assert.ok(instance.proxy?.frameCount > 1);
    assert.ok(instance.proxy?.fps > 0);
    assert.equal(instance.pixelIdentitySeed, hyperframes.hyperFramesPixelIdentity(instance, 0));
  }

  assert.equal(show.visualizerCoverage.exactProxyCount, expected.length);
  assert.equal(show.visualizerCoverage.unsupportedCount, 0);
  assert.equal(show.visualizerCoverage.silentDefaultCount, 0);
  assert.deepEqual(show.instances.accents, graph.directorV2?.accentTrack?.events || []);
  assert.ok(hyperframes.inspectHyperFramesShow(show).ok, hyperframes.inspectHyperFramesShow(show).errors.join(", "));
});

test("HyperFrames evaluator is deterministic and a sequential visualizer ID change changes pixels", () => {
  assert.equal(typeof evaluateHyperFramesVisualizers, "function", "runtime evaluator must be exported");
  const show = compile();
  const midpoints = show.instances.visualizers.map((row) => row.start + row.duration / 2);
  assert.deepEqual(midpoints, golden.samples.map((row) => row.timestamp));
  const states = midpoints.map((timestamp) => evaluateHyperFramesVisualizers(show, timestamp));
  const repeated = midpoints.map((timestamp) => evaluateHyperFramesVisualizers(show, timestamp));
  assert.deepEqual(states, repeated, "same show and timestamp must produce identical render state");
  assert.equal(states.length, 3);
  for (let index = 0; index < states.length; index += 1) {
    const expected = show.instances.visualizers[index];
    const layers = states[index].layers || states[index].instances || [];
    const layer = layers.find((row) => (row.cueId || row.id) === expected.cueId);
    assert.ok(layer, `active layer missing for ${expected.cueId}`);
    assert.equal(layer.visualizerId, expected.visualizerId);
    assert.equal(layer.cueId || layer.id, golden.samples[index].cueId);
    assert.equal(layer.visualizerId, golden.samples[index].visualizerId);
    assert.equal(layer.stemFocus?.requested || layer.stemFocus, expected.stemFocus);
    assert.ok(layer.controls?.values || layer.controls);
    const expectedModulatedOpacity = expected.effectiveOpacity
      * layer.transitionAlpha
      * (layer.presentationModulation?.opacityMultiplier ?? 1);
    assert.ok(Math.abs(layer.effectiveOpacity - expectedModulatedOpacity) < 1e-9);
    assert.equal(layer.blendMode, expected.blendMode);
    assert.equal(layer.target, expected.target);
    assert.ok(layer.proxyFrame?.frameIndex >= 0);
  }
  const firstLayer = (state) => (state.layers || state.instances || [])[0];
  assert.equal(new Set(states.map((row) => firstLayer(row)?.visualizerId)).size, 3);
  const pixelIdentities = states.map((state, index) => hyperframes.hyperFramesPixelIdentity(show.instances.visualizers[index], firstLayer(state)?.proxyFrame?.frameIndex));
  assert.equal(new Set(pixelIdentities).size, 3, "different requested shader IDs must not collapse to the same pixel identity");

  const seam = show.instances.visualizers[0].end;
  assert.equal(firstLayer(evaluateHyperFramesVisualizers(show, seam - 0.0001))?.id, show.instances.visualizers[0].cueId);
  assert.equal(firstLayer(evaluateHyperFramesVisualizers(show, seam))?.id, show.instances.visualizers[1].cueId);
});

test("HyperFrames keeps undeclared shaders visible as unsupported instead of substituting or dropping them", () => {
  const mutated = structuredClone(graph);
  const card = mutated.tracks.find((row) => row.id === "track-b").cards[1];
  card.visualization.sourceId = "isf:qa-undeclared-shader";
  card.visualization.card.id = "isf:qa-undeclared-shader";
  card.visualization.card.source = { uri: "/static/isf/shaders/qa-undeclared.fs", hash: "sha256:" + "0".repeat(64), truthStatus: "manifest-source-reference" };
  const show = compile(mutated);
  assert.equal(show.instances.visualizers.length, 3);
  const unsupported = show.instances.visualizers.find((row) => row.visualizerId === "isf:qa-undeclared-shader");
  assert.ok(unsupported);
  assert.equal(unsupported.execution.route, "unsupported");
  assert.equal(unsupported.execution.drawable, false);
  assert.equal(unsupported.execution.silentDefault, false);
  assert.equal(unsupported.rendererTruth.status, "unsupported");
  assert.equal(unsupported.rendererTruth.route, "unsupported");
  assert.equal(unsupported.rendererTruth.visible, true);
  assert.equal(unsupported.rendererTruth.silentDefault, false);
  assert.ok(unsupported.rendererTruth.fidelityLoss.includes("requested-shader-not-presented"));
  assert.equal(unsupported.proxy, null);
  assert.equal(show.visualizerCoverage.exactProxyCount, 2);
  assert.equal(show.visualizerCoverage.unsupportedCount, 1);
  assert.equal(show.visualizerCoverage.silentDefaultCount, 0);
  assert.ok(hyperframes.inspectHyperFramesShow(show).ok, hyperframes.inspectHyperFramesShow(show).errors.join(", "));
});

test("HyperFrames project generation and pixel capture are offline-only and locally runnable", () => {
  const show = compile();
  const serialized = JSON.stringify(show);
  assert.doesNotMatch(serialized, /https?:\/\//);
  assert.doesNotMatch(serialized, /Math\.random|Date\.now|AudioContext|getUserMedia|fetch\(/);
  assert.equal(show.deterministicPolicy.networkCalls, false);
  assert.equal(show.deterministicPolicy.runtimeAudioAnalysis, false);
  assert.equal(show.deterministicPolicy.wallClockCalls, false);
  assert.equal(show.deterministicPolicy.randomCalls, false);

  const compilerSource = fs.readFileSync("scripts/compile-hyperframes-show-v2.mjs", "utf8");
  assert.doesNotMatch(compilerSource, /https?:\/\//, "compiled index may not import CDN/network scripts");
  assert.doesNotMatch(compilerSource, /<script[^>]+src=["']https?:/i);
  assert.match(compilerSource, /window\.HAPA_LAST_RENDER_STATE/);
  assert.match(compilerSource, /window\.__timelines/);
  assert.match(compilerSource, /seek/);
  assert.match(compilerSource, /timeline\.seek\(0\)\.pause\(\);timeline\.flush\(\)/, "asset readiness must synchronously prime frame zero while media hydration is disarmed");
  assert.match(compilerSource, /id=\\?"hf-static-media-manifest\\?"/, "the compiler must expose an inert static media manifest to HyperFrames");
  assert.match(compilerSource, /staticVideoManifestMarkup[\s\S]+<video \$\{attrs\} src=/, "video sources must remain statically discoverable to HyperFrames");
  assert.match(compilerSource, /staticAudioManifestMarkup[\s\S]+mix-audio[\s\S]+compiledAudio\.uri/, "the packaged mix must remain statically discoverable for final muxing");
  assert.match(compilerSource, /manifest\.remove\(\);const mount=/, "the inert manifest must leave the browser DOM before live media mounts");
  assert.match(compilerSource, /const schedule=\(\)=>setTimeout\(mount,0\)[\s\S]+DOMContentLoaded',schedule/, "live media must mount one task after DOMContentLoaded so HyperFrames navigation cannot traverse every clip");
  assert.match(compilerSource, /document\.createElement\('video'\)/, "live preview videos must be constructed in the HTML namespace");
  assert.match(compilerSource, /video\.dataset\.mediaSrc=descriptor\.source[\s\S]+video\.preload='none'/, "live videos must retain rolling-window source metadata without eager loading");
  assert.match(compilerSource, /hapa:media-mounted[\s\S]+media=\[\.\.\.document\.querySelectorAll\('\.media'\)\]/, "the renderer must refresh its live media list after deferred mounting");
  assert.doesNotMatch(compilerSource, /MutationObserver[^\n]+removeAttribute\('src'\)/, "the capture page must not race navigation by adding then aborting every video request");

  const pinnedTimelineSource = fs.readFileSync("src/domain/hapa-pinned-timeline.js", "utf8");
  assert.match(pinnedTimelineSource, /queueMicrotask/);
  assert.match(pinnedTimelineSource, /_renderPending/);
  assert.match(pinnedTimelineSource, /flush\(\)/);
  assert.match(pinnedTimelineSource, /renderNow\(\)/);

  const captureSource = fs.readFileSync("scripts/hyperframes-pixel-capture.cjs", "utf8");
  assert.match(captureSource, /onBeforeRequest/);
  assert.match(captureSource, /timeline\.seek/);
  assert.match(captureSource, /HAPA_LAST_RENDER_STATE/);
  assert.match(captureSource, /capturePage/);
  assert.match(captureSource, /pngSha256/);
  assert.match(captureSource, /canvasPngSha256/);
  assert.match(captureSource, /evaluateHyperFramesPixelAcceptance/);
  assert.match(captureSource, /pixel-qa-progress/);
  const pixelAcceptanceSource = fs.readFileSync("scripts/hyperframes-pixel-acceptance.mjs", "utf8");
  const visualizerRuntimeSource = fs.readFileSync("src/domain/hyperframes-visualizer-runtime.js", "utf8");
  assert.match(pixelAcceptanceSource, /normalizeHyperFramesStemRole/);
  assert.match(visualizerRuntimeSource, /leadvocals: "vocals"/);
  assert.match(pixelAcceptanceSource, /positiveEffectiveOpacity/);
  assert.match(pixelAcceptanceSource, /canvasChangedTransitions/);
  assert.match(pixelAcceptanceSource, /expectedDistinctIdTransitions/);
  assert.doesNotMatch(pixelAcceptanceSource, /distinctIdTransitions > 0/);
  assert.match(captureSource, /derivedSamples\(manifest, timestamps\)/, "default expectations must come from the executable show");
  assert.doesNotMatch(captureSource, /hyperframes-dear-papa-golden-timestamps/, "a song-specific fixture may not be an implicit default");
  assert.match(captureSource, /details\.level === ["']error["']/, "warnings may not be promoted to console errors");

  const cli = spawnSync(process.execPath, ["scripts/run-local-hyperframes.mjs", "--print-path"], { cwd: process.cwd(), encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const resolved = JSON.parse(cli.stdout);
  assert.match(resolved.version, /^0\.7\./);
  assert.ok(fs.existsSync(resolved.cliPath));
});
