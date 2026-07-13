import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  buildEchoIsfFrameIntent,
  echoIsfManifestDefaults,
  normalizeEchoIsfComposition,
  validateEchoIsfCardBindings,
} from "../src/domain/echo-isf-frame-intent.js";

const manifestPath = "/Users/calderwong/Desktop/hapa-music-viz/web/isf/manifest.json";
const albumRoot = "./artifacts/echo-director-v2/album";

function portableCard(overrides = {}) {
  return {
    id: "card:b:fixture",
    startSeconds: 2,
    endSeconds: 8,
    transition: "crossfade",
    media: { id: "media:fixture", localPath: "/media/fixture.mp4" },
    visualization: {
      sourceId: "isf:fixture",
      card: {
        id: "isf:fixture",
        controls: { gain: 0.3 },
        audioMap: { gain: { signal: "rms", depth: 0.8 } },
        stemFocus: "drums",
        layer: { opacity: 0.5, mix: 0.8, blend: "screen", target: "program" },
      },
    },
    parameters: { opacity: 0.6, blendMode: "plus-lighter", target: "program" },
    ...overrides,
  };
}

test("all manifest value types receive normalized defaults and modulation remains bounded", () => {
  const shader = {
    id: "isf:fixture",
    shaderType: "generator",
    inputs: [
      { NAME: "gain", TYPE: "float", DEFAULT: 0.2, MIN: 0, MAX: 1 },
      { NAME: "mode", TYPE: "long", DEFAULT: 4, VALUES: [0, 2, 4] },
      { NAME: "enabled", TYPE: "bool", DEFAULT: true },
      { NAME: "reset", TYPE: "event" },
      { NAME: "tint", TYPE: "color", DEFAULT: [0.1, 0.2, 0.3, 1] },
      { NAME: "origin", TYPE: "point2D", DEFAULT: [-2, 3], MIN: [-5, -5], MAX: [5, 5] },
      { NAME: "inputImage", TYPE: "image" },
    ],
  };
  assert.deepEqual(echoIsfManifestDefaults(shader), {
    gain: 0.2,
    mode: 4,
    enabled: true,
    reset: false,
    tint: [0.1, 0.2, 0.3, 1],
    origin: [-2, 3],
  });
  const intent = buildEchoIsfFrameIntent({
    shader,
    card: portableCard(),
    timestampSeconds: 3,
    sourceHash: "sha256:source",
    signalFrames: { drums: { rms: 1 }, master: { rms: 0.1 } },
    values: { origin: [99, -99] },
  });
  assert.equal(intent.ok, true);
  assert.equal(intent.values.gain, 1, "control + modulation must clamp to the declared maximum");
  assert.deepEqual(intent.values.origin, [5, -5]);
  assert.equal(intent.frameReceipt.stem.fallbackUsed, false);
  assert.equal(intent.frameReceipt.input.modulationBindings[0].resolvedStem, "drums");
});

test("master fallback is explicit only when the requested stem frame is absent", () => {
  const shader = { id: "isf:fixture", shaderType: "generator", inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.2, MIN: 0, MAX: 1 }] };
  const card = portableCard();
  const fallback = buildEchoIsfFrameIntent({ shader, card, signalFrames: { master: { rms: 0.5 } } });
  assert.equal(fallback.values.gain, 0.7);
  assert.deepEqual(fallback.frameReceipt.stem, {
    requestedStem: "drums",
    requestedStemPresent: false,
    resolvedStem: "master",
    fallbackUsed: true,
    fallbackReason: "requested-stem-absent-master-frame-used",
    frame: { rms: 0.5 },
    hash: fallback.frameReceipt.stem.hash,
  });
  const requestedPresent = buildEchoIsfFrameIntent({ shader, card, signalFrames: { drums: { peak: 1 }, master: { rms: 0.5 } } });
  assert.equal(requestedPresent.values.gain, 0.3, "a missing signal must not silently fall through to master when the requested stem exists");
  assert.equal(requestedPresent.frameReceipt.stem.fallbackUsed, false);
  assert.equal(requestedPresent.frameReceipt.input.modulationBindings[0].status, "missing-signal");
});

test("filter media, audio-map validation, and composition failures are explicit", () => {
  const shader = {
    id: "isf:filter",
    shaderType: "filter",
    inputs: [{ NAME: "inputImage", TYPE: "image" }, { NAME: "gain", TYPE: "float", DEFAULT: 0.2 }],
    audioMap: { inputImage: { signal: "canvas", depth: 0 } },
  };
  const invalidCard = portableCard({ visualization: { sourceId: "isf:filter", card: { audioMap: { ghost: { signal: "rms", depth: 1 } }, stemFocus: "master", layer: {} } } });
  assert.deepEqual(validateEchoIsfCardBindings(shader, invalidCard).errors, ["audio-map-uniform-not-declared:ghost"]);
  const missing = buildEchoIsfFrameIntent({ shader, card: portableCard(), mediaElement: { ready: false } });
  assert.equal(missing.status, "input-error");
  assert.match(missing.error, /filter-media-input-not-ready/);
  assert.equal(missing.frameReceipt.media.ready, false);
  const media = { ready: true, width: 1920, height: 1080 };
  const ready = buildEchoIsfFrameIntent({ shader, card: portableCard(), mediaElement: media, timestampSeconds: 3 });
  assert.equal(ready.status, "ready");
  assert.equal(ready.imageInputs.inputImage, media);
  assert.equal(Object.hasOwn(ready.values, "inputImage"), false);
  assert.equal(ready.frameReceipt.input.modulationBindings.find((binding) => binding.uniform === "inputImage")?.status, "image-input-handled-separately");
  assert.deepEqual(ready.composition, {
    opacity: 0.6,
    mix: 0.8,
    blend: "plus-lighter",
    canvasComposite: "lighter",
    target: "program",
    transitionAlpha: 1,
    effectiveAlpha: 0.48,
  });
});

test("controls, modulation, and composition change receipts while identical viewer inputs remain identical", () => {
  const shader = { id: "isf:fixture", shaderType: "generator", inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.2, MIN: 0, MAX: 1 }] };
  const common = {
    shader,
    card: portableCard(),
    timestampSeconds: 3.125,
    sourceHash: "sha256:verified",
    signalFrames: { drums: { rms: 0.25 }, master: { rms: 0.1 } },
    mediaIdentity: { id: "media:fixture", sourceHash: "sha256:media", uri: "/media/fixture.mp4" },
  };
  const echo = buildEchoIsfFrameIntent(common);
  const tarot = buildEchoIsfFrameIntent({ ...common, signalFrames: { master: { rms: 0.1 }, drums: { rms: 0.25 } } });
  assert.deepEqual(echo.frameReceipt, tarot.frameReceipt);
  assert.equal(echo.frameReceipt.timestampSeconds, 3.125);
  assert.equal(echo.frameReceipt.sourceHash, "sha256:verified");
  for (const field of ["card", "input", "media", "stem", "composition", "receiptHash"]) assert.ok(echo.frameReceipt[field]);

  const changedControl = buildEchoIsfFrameIntent({ ...common, values: { gain: 0.8 } });
  const changedModulation = buildEchoIsfFrameIntent({ ...common, signalFrames: { drums: { rms: 0.75 } } });
  const changedComposition = buildEchoIsfFrameIntent({ ...common, composition: { opacity: 0.2, transitionAlpha: 0.5 } });
  assert.notEqual(echo.frameReceipt.receiptHash, changedControl.frameReceipt.receiptHash);
  assert.notEqual(echo.frameReceipt.receiptHash, changedModulation.frameReceipt.receiptHash);
  assert.notEqual(echo.frameReceipt.receiptHash, changedComposition.frameReceipt.receiptHash);
  assert.notDeepEqual(normalizeEchoIsfComposition(common.card, 3.125), changedComposition.composition);
});

test("the complete catalog and album satisfy media/default/audio-map frame contracts", () => {
  assert.equal(fs.existsSync(manifestPath), true, `required shader manifest is missing: ${manifestPath}`);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const readyMedia = { ready: true, width: 1920, height: 1080 };
  let filters = 0;
  let generators = 0;
  for (const shader of manifest.shaders || []) {
    const card = {
      id: `card:${shader.id}`,
      visualization: {
        sourceId: shader.id,
        card: { id: shader.id, controls: {}, audioMap: shader.audioMap || {}, stemFocus: "master", layer: {} },
      },
    };
    const intent = buildEchoIsfFrameIntent({ shader, card, mediaElement: readyMedia, signalFrames: { master: {} } });
    if (shader.shaderType === "filter") {
      filters += 1;
      assert.equal(intent.status, "ready", `${shader.id} filter must receive current media`);
      assert.ok(Object.keys(intent.imageInputs).length >= 1, `${shader.id} filter needs a bound image input`);
    } else {
      generators += 1;
      assert.equal(intent.status, "ready", `${shader.id} generator defaults must be executable`);
      const declaredValues = (shader.inputs || []).filter((input) => String(input.TYPE || input.type).toLowerCase() !== "image");
      assert.ok(declaredValues.every((input) => Object.hasOwn(intent.values, input.NAME || input.name)), `${shader.id} missing a manifest default`);
    }
  }
  assert.equal(filters, 37);
  assert.equal(generators, 145);

  assert.equal(fs.existsSync(albumRoot), true, `required compiled album is missing: ${albumRoot}`);
  const byId = new Map((manifest.shaders || []).map((shader) => [shader.id, shader]));
  let graphCount = 0;
  let cardCount = 0;
  for (const directory of fs.readdirSync(albumRoot)) {
    const graphPath = path.join(albumRoot, directory, "native-show-graph.json");
    if (!fs.existsSync(graphPath)) continue;
    graphCount += 1;
    const graph = JSON.parse(fs.readFileSync(graphPath, "utf8"));
    for (const card of graph.tracks?.find((track) => track.id === "track-b")?.cards || []) {
      cardCount += 1;
      const shader = byId.get(card.visualization?.sourceId);
      assert.ok(shader, `${directory} references unknown shader ${card.visualization?.sourceId}`);
      assert.equal(validateEchoIsfCardBindings(shader, card).ok, true, `${directory}/${card.id} maps an undeclared uniform`);
    }
  }
  assert.equal(graphCount, 79);
  assert.equal(cardCount, 791);
});
