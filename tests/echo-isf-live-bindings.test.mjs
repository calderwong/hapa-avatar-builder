import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";
import {
  resolveVerifiedEchoStemBinding,
} from "../src/domain/echo-visualizer-audio-envelope.js";
import { createEchoLiveSignalTracker } from "../src/domain/echo-live-signal-transport.js";

const source = fs.readFileSync(new URL("../src/components/HapaEchosView.jsx", import.meta.url), "utf8");

function between(start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing start marker: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `missing end marker: ${end}`);
  return source.slice(startIndex, endIndex);
}

function functionSource(name) {
  const start = source.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const bodyStart = source.indexOf(") {", start) + 2;
  assert.ok(bodyStart > 1, `missing body for ${name}`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    else if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated function ${name}`);
}

function loadHelpers() {
  const names = [
    "paletteSignalForPerspective",
    "visualizerCompositionInput"
  ];
  const context = { result: null, Uint8Array, Math, Number, String, Set, Array, Object };
  vm.runInNewContext(`${names.map(functionSource).join("\n")}\nresult = { ${names.join(", ")} };`, context);
  return context.result;
}

test("Echo binds only the currently presented media frame, never a standby decoder", () => {
  const players = between("function PersistentEchoABPlayers", "function PresentedEchoImage");
  assert.match(players, /slot\?\.key === sourceKey/);
  assert.match(players, /slot\?\.frameReady/);
  assert.match(players, /video\.dataset\.echoSourceKey === sourceKey/);
  assert.match(players, /video\.readyState >= 2/);
  assert.match(players, /video\.videoWidth > 0/);
  assert.match(players, /element: video/);
  assert.match(players, /presented: true/);
  const image = between("function PresentedEchoImage", "const CAMERA_MOTION_OPTIONS");
  assert.match(image, /element\?\.complete/);
  assert.match(image, /naturalWidth/);
  assert.match(image, /reason: "binding-released"/);
  const resolver = functionSource("resolvePresentedEchoMediaBinding");
  assert.match(resolver, /video\[data-echo-player="current"\]\[data-frame-presented="true"\]/);
  assert.match(resolver, /isPresentedEchoVideoElement\(element, sourceKey\)/);
  assert.match(resolver, /recoveredFrom: "current-dom-player"/);
  const exactDraw = between("const expectedMediaId", "const compositionInput");
  assert.match(exactDraw, /resolvePresentedEchoMediaBinding\(/);
  assert.match(exactDraw, /directorPreviewFullscreenRef\.current/);
  assert.match(exactDraw, /presentedMediaRef\.current/);
  assert.match(source, /mediaElement: currentPresentedMedia\?\.element \|\| null/);
  assert.match(source, /mediaIdentity: currentPresentedMedia \?/);
});

test("Echo uses a bounded generation-bound verified stem decoder pool and never invents a near-match", () => {
  const verifiedStemBinding = resolveVerifiedEchoStemBinding;
  const verifiedGraph = {
    stems: { nativeStatus: "verified-local-registry-paths", items: [{ id: "stem-synth", audioPath: "/verified/synth.mp3" }, { id: "stem-vocals", audioPath: "/verified/vocals.mp3" }] },
    directorV2: { stemBuses: [
      { id: "bus:synth", stemId: "stem-synth", stemType: "Synth", audioPath: "/verified/synth.mp3", truthStatus: "verified_registry_path" },
      { id: "bus:vocals", stemId: "stem-vocals", stemType: "Vocals", audioPath: "/verified/vocals.mp3", truthStatus: "verified_registry_path" }
    ] }
  };
  const synth = verifiedStemBinding(verifiedGraph, { visualization: { card: { stemFocus: "synth" } } });
  assert.equal(synth.status, "verified-stem");
  assert.equal(synth.bus.id, "bus:synth");
  const vocals = verifiedStemBinding(verifiedGraph, { visualization: { card: { stemFocus: "leadVocals" } } });
  assert.equal(vocals.bus.id, "bus:vocals", "the one declared leadVocals→Vocals alias is supported");
  const missing = verifiedStemBinding(verifiedGraph, { visualization: { card: { stemFocus: "strings" } } });
  assert.equal(missing.status, "master-fallback");
  assert.equal(missing.bus, null);
  assert.equal(missing.fallbackReason, "requested-stem-not-found");
  const unverified = verifiedStemBinding({ ...verifiedGraph, stems: { ...verifiedGraph.stems, nativeStatus: "declared" } }, { visualization: { card: { stemFocus: "synth" } } });
  assert.equal(unverified.status, "master-fallback");
  assert.equal(unverified.bus, null);

  const bindingBlock = between("const ensureActiveStemBinding", "useEffect(() => {\n    activeProjectRef.current");
  assert.equal((bindingBlock.match(/document\.createElement\("audio"\)/g) || []).length, 1);
  assert.match(bindingBlock, /stemDecoderPoolRef\.current/);
  assert.match(bindingBlock, /pool\.set\(desiredKey, resource\)/);
  assert.match(bindingBlock, /element\.src = targetUri/);
  assert.match(bindingBlock, /dataset\.echoStemDecoder = "bounded-pool"/);
  assert.match(bindingBlock, /silentGain\.gain\.value = 0/);
  assert.match(bindingBlock, /readyGeneration = sourceGeneration/);
  assert.match(bindingBlock, /readyUri = targetUri/);
  assert.match(bindingBlock, /eventMatchesGeneration/);
  assert.match(bindingBlock, /echoStemDecoderRetryDue/);
  assert.match(bindingBlock, /nextEchoStemDecoderRetryState/);
  assert.match(bindingBlock, /failureCount: retrySeed\.failureCount/);
  assert.match(bindingBlock, /pool\.set\(desiredKey, fallback\)/);
  const pruneBlock = functionSource("pruneEchoStemDecoderPool");
  assert.match(pruneBlock, /pauseEchoStemDecoderPool\(pool, playingKeys\)/);
  assert.match(pruneBlock, /while \(pool\.size > hardLimit/);
  assert.match(pruneBlock, /disposeEchoStemResource\(resource\)/);
  assert.doesNotMatch(pruneBlock, /pool\.size <= limit\) return/);
  assert.match(source, /crossOrigin = "anonymous"/);
  assert.match(source, /const shouldPlayStem = isPlayingRef\.current/);
  assert.match(source, /resource\.playbackBlocked = true/);
  assert.match(source, /stem-decoder-playback-blocked/);
  assert.match(source, /resource\.playbackRetryExhausted !== true/);
  assert.match(source, /resource\.playbackNextRetryAtMs == null \|\| echoStemPlaybackRetryDue\(resource, echoStemDecoderNow\(\)\)/);
  assert.match(source, /Object\.assign\(resource, nextEchoStemPlaybackRetryState\(resource, echoStemDecoderNow\(\)\)\)/);
  assert.match(source, /const playGeneration = resource\.sourceGeneration/);
  assert.match(source, /resource\.sourceGeneration === playGeneration/);
  assert.match(source, /targetTimeSeconds: targetTime/);
  assert.match(source, /echoIsfRequiredStemFocuses\(graphVisualizerCard\)\.slice\(0, ECHO_STEM_DECODER_POOL_LIMIT\)/);
  assert.match(source, /protectedResourceKeys,\s+ECHO_STEM_DECODER_POOL_LIMIT,\s+currentResourceKeys,/);
  assert.match(source, /pauseEchoStemDecoderPool\(stemDecoderPoolRef\.current\)/);
  assert.doesNotMatch(source, /expectedActivity: !allowSilent/);
  assert.match(source, /if \(!transport\.usable\) continue/);
  assert.match(source, /compactStemSignalBinding\(stemResource, stemTransport\)/);
  assert.doesNotMatch(source, /stemElement\.play\(\)\)\.catch\(\(\) => \{\}\)/);
});

test("Echo live signal frames cover the complete album vocabulary without procedural exact-path signals", () => {
  const { paletteSignalForPerspective } = loadHelpers();
  const tracker = createEchoLiveSignalTracker();
  const analyser = {
    context: { sampleRate: 48_000 },
    frequencyBinCount: 8,
    getByteFrequencyData(target) { target.set([255, 192, 128, 96, 64, 32, 16, 8]); },
    getByteTimeDomainData(target) { target.set([128, 160, 96, 144, 112, 136, 120, 128]); }
  };
  const frame = tracker.sample(analyser, 2, { observedAtSeconds: 2, palette: paletteSignalForPerspective("magenta") });
  for (const signal of ["rms", "beat", "energy", "bass", "mid", "treble", "palette", "orbit", "off"]) {
    assert.equal(Number.isFinite(frame[signal]), true, signal);
    assert.ok(frame[signal] >= 0 && frame[signal] <= 1, signal);
  }
  assert.equal(frame.bass, frame.low);
  assert.equal(frame.treble, frame.high);
  assert.equal(frame.truthStatus, "live-analyser-vocabulary-aligned");
  const unavailable = tracker.sample(null, 0, { observedAtSeconds: 3, palette: 0.25 });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.truthStatus, "no-live-analyser");
  assert.equal(unavailable.palette, 0);
  assert.match(source, /const signalFrames = \{\};/);
  assert.match(source, /if \(masterSignalFrame\.status === "live"\)/);
  assert.match(source, /signalFrames\[binding\.role\] = stemFrame/);
  assert.match(source, /echoIsfRequiredStemFocuses\(graphVisualizerCard\)/);
});

test("Echo applies returned blend, opacity, and only real fade-like transitions", () => {
  const { visualizerCompositionInput } = loadHelpers();
  const base = {
    startSeconds: 0,
    endSeconds: 10,
    parameters: { opacity: 0.5, blendMode: "screen" },
    visualization: { card: { layer: { mix: 0.8, target: "program" } } }
  };
  const cut = visualizerCompositionInput({ ...base, transition: "cut" }, 0);
  assert.equal(cut.transitionAlpha, 1);
  assert.equal(cut.opacity, 0.5);
  assert.equal(cut.mix, 0.8);
  assert.equal(cut.blend, "screen");
  const fadeStart = visualizerCompositionInput({ ...base, transition: "crossfade" }, 0);
  const fadeMiddle = visualizerCompositionInput({ ...base, transition: "crossfade" }, 5);
  assert.equal(fadeStart.transitionAlpha, 0);
  assert.equal(fadeMiddle.transitionAlpha, 1);
  assert.match(source, /ctx\.globalAlpha = Math\.max/);
  assert.match(source, /ctx\.globalCompositeOperation = composition\.canvasComposite/);
  assert.match(source, /const audioEnvelope = echoVisualizerAudioEnvelope\(selectedSignalFrame \|\| masterSignalFrame\)/);
  assert.match(source, /ctx\.filter = `brightness\(\$\{audioEnvelope\.brightness\.toFixed\(3\)\}\)/);
  assert.match(source, /ctx\.scale\(audioEnvelope\.scale, audioEnvelope\.scale\)/);
  assert.match(source, /ctx\.drawImage\(presentationCanvas, -width \/ 2, -height \/ 2, width, height\)/);
});

test("Echo surfaces bounded frame, media, stem, and composition receipts", () => {
  assert.match(source, /Math\.floor\(t \* 4\)/);
  assert.match(source, /compactFrameReceipt\(presentation\.frameReceipt\)/);
  assert.match(source, /__HAPA_ECHO_ISF_BINDING_DIAGNOSTICS__/);
  assert.match(source, /data-echo-isf-media-binding/);
  assert.match(source, /data-echo-isf-stem-binding/);
  assert.match(source, /data-echo-isf-frame-receipt/);
  assert.match(source, /receiptHash/);
});
