import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

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
    "normalizedStemFocus",
    "requestedStemFocus",
    "verifiedStemBinding",
    "analyserBandAverage",
    "paletteSignalForPerspective",
    "liveSignalFrame",
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
  const exactDraw = between("const expectedMediaId", "const compositionInput");
  assert.match(exactDraw, /presentedMedia\.mediaId === expectedMediaId/);
  assert.match(exactDraw, /presentedMedia\.uri === expectedMediaUri/);
  assert.match(source, /mediaElement: currentPresentedMedia\?\.element \|\| null/);
  assert.match(source, /mediaIdentity: currentPresentedMedia \?/);
});

test("Echo uses one reusable verified stem decoder and never invents a near-match", () => {
  const { verifiedStemBinding } = loadHelpers();
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
  assert.match(bindingBlock, /if \(!resource\?\.element\)/);
  assert.match(bindingBlock, /resource\.element\.src = targetUri/);
  assert.match(bindingBlock, /dataset\.echoStemDecoder = "active-singleton"/);
  assert.match(bindingBlock, /silentGain\.gain\.value = 0/);
});

test("Echo live signal frames cover the complete album vocabulary without procedural exact-path signals", () => {
  const { liveSignalFrame, paletteSignalForPerspective } = loadHelpers();
  const analyser = {
    frequencyBinCount: 8,
    getByteFrequencyData(target) { target.set([255, 192, 128, 96, 64, 32, 16, 8]); },
    getByteTimeDomainData(target) { target.set([128, 160, 96, 144, 112, 136, 120, 128]); }
  };
  const frame = liveSignalFrame(analyser, 2, { palette: paletteSignalForPerspective("magenta") });
  for (const signal of ["rms", "beat", "energy", "bass", "mid", "treble", "palette", "orbit", "off"]) {
    assert.equal(Number.isFinite(frame[signal]), true, signal);
    assert.ok(frame[signal] >= 0 && frame[signal] <= 1, signal);
  }
  assert.equal(frame.bass, frame.low);
  assert.equal(frame.treble, frame.high);
  const unavailable = liveSignalFrame(null, 0, { palette: 0.25 });
  assert.equal(unavailable.status, "unavailable");
  assert.equal(unavailable.truthStatus, "no-live-analyser");
  assert.equal(unavailable.palette, 0.25);
  assert.match(source, /const signalFrames = \{\};/);
  assert.match(source, /if \(masterSignalFrame\.status === "live"\)/);
  assert.match(source, /signalFrames\[stemResource\.requestedStem\] = stemFrame/);
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
  assert.match(source, /ctx\.drawImage\(presentationCanvas, 0, 0, width, height\)/);
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
