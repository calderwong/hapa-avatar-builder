import test from "node:test";
import assert from "node:assert/strict";
import {
  compileEchoCutModulationBindings,
  echoSectionEnergySource,
  ECHO_SLOT_OPACITY_RANGE,
} from "../src/domain/echo-recipe-execution.js";
import { prepareDirectorModulationTimeline, evaluatePreparedDirectorModulation, createDirectorModulationRuntime } from "../src/domain/director-modulation-v2.js";
import {
  echoPreparedVisualizerOpacityScale,
  echoSectionEnergyLevel,
  echoVisualizerLayerPresentation,
  echoVisualizerRecipeMix as echoVisualizerRecipeMixFor,
  isolateEchoPreparedModulation,
  normalizeEchoVisualizerCardAudioMap,
  scaleEchoCompositionOpacity,
} from "../src/domain/hyperframes-visualizer-runtime.js";
import { buildEchoIsfFrameIntent, normalizeEchoIsfComposition } from "../src/domain/echo-isf-frame-intent.js";
import { projectToEditorGraph } from "../src/domain/multitrack-editor.js";
import { buildPortableVisualizerCard } from "../src/domain/portable-visualizer-card.js";

const sections = [
  { id: "s0", startSeconds: 0, endSeconds: 10, energy: 0.2 },
  { id: "s1", startSeconds: 10, endSeconds: 20, energy: 0.9 },
  { id: "s2", startSeconds: 20, endSeconds: 30, energy: 0.55 },
];

function shaderCard(id, { cueId, audioMap = { gain: { signal: "rms", depth: 0.4 } }, mappings, persistentSlotId, start = 0, end = 30 } = {}) {
  return {
    id, ...(cueId ? { cueId } : {}), startSeconds: start, endSeconds: end,
    ...(persistentSlotId ? { persistentSlotId, alwaysOn: true } : {}),
    visualization: { sourceId: `isf:${id}`, card: { id: `isf:${id}`, stemFocus: "master", audioMap, inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.2, MIN: 0, MAX: 1 }] } },
    parameters: { opacity: 0.4, ...(mappings ? { visualizerMappings: mappings } : {}) },
  };
}

/** A saved cut's graph: inherited bindings from its song's compile name shaders this cut no longer plays. */
function savedCutGraph({ locks = [] } = {}) {
  return {
    song: { id: "song", durationSeconds: 30 },
    tracks: [
      { id: "track-b", role: "visualizer", cards: [shaderCard("projected:track-b:0"), shaderCard("projected:track-b:1", { cueId: "visualizer:1:kept", audioMap: { gain: { signal: "beat", depth: 0.5 } } })] },
      { id: "track-shader-always-on-1", role: "visualizer", cards: [shaderCard("card:persistent:always-on-1", { persistentSlotId: "always-on-1" })] },
      { id: "track-accent", role: "accent", cards: [{ id: "accent:0", startSeconds: 4, endSeconds: 5, visualization: { card: { audioMap: { gain: { signal: "rms" } } } } }] },
    ],
    directorV2: {
      recipe: { visualizerMix: 0.5 },
      locks,
      visualBudgetPolicy: { sections },
      modulationBindings: [
        { id: "visualizer:0:isf-other:gain", source: { kind: "stem_signal", stemFocus: "master", signal: "rms" }, target: { kind: "visualizer_uniform", visualizerId: "visualizer:0:isf-other", uniform: "gain" }, envelope: {} },
        { id: "visualizer:1:kept:gain", source: { kind: "stem_signal", stemFocus: "drums", signal: "peak" }, target: { kind: "visualizer_uniform", visualizerId: "visualizer:1:kept", uniform: "gain" }, envelope: { depth: 0.9 } },
        { id: "camera:bass-mass", source: { kind: "stem_signal", stemFocus: "bass", signal: "bass" }, target: { kind: "camera", property: "scale" }, envelope: {} },
      ],
    },
  };
}

test("saved cuts drop inherited bindings that name no card and compile their own from each card's audio map", () => {
  const compiled = compileEchoCutModulationBindings(savedCutGraph());
  const bindings = compiled.directorV2.modulationBindings;
  const uniform = bindings.filter((binding) => binding.target.kind === "visualizer_uniform");
  assert.equal(bindings.some((binding) => binding.target.visualizerId === "visualizer:0:isf-other"), false, "the other cut's shader binding is dropped");
  assert.deepEqual(bindings.find((binding) => binding.id === "visualizer:1:kept:gain").envelope, { depth: 0.9 }, "a binding that still names a card is kept as authored");
  assert.ok(bindings.some((binding) => binding.target.kind === "camera"), "non-shader bindings are kept");
  const own = uniform.find((binding) => binding.target.visualizerId === "projected:track-b:0");
  assert.equal(own.source.signal, "rms");
  assert.equal(own.target.uniform, "gain");
  assert.equal(own.envelope.depth, 0.2, "depth follows the card's mapping and the cut's recipe mix (0.4 × 0.5)");
  assert.equal(uniform.some((binding) => binding.target.visualizerId === "accent:0"), false, "accent cards are not shader layers");
  assert.ok(uniform.some((binding) => binding.target.visualizerId === "card:persistent:always-on-1"), "always-on slots get uniform bindings too");
  assert.deepEqual(compiled.directorV2.cutModulation, {
    schemaVersion: "hapa.echo.cut-modulation.v1",
    droppedInheritedBindings: 1,
    shaderCards: 3,
    cardsWithUniformBindings: 3,
    cardsWithoutAudioMap: 0,
    slotOpacityBindings: ["slot-opacity:always-on-1"],
    sectionEnergy: "song-relative",
  });
});

test("compiling a cut's telemetry is deterministic and idempotent", () => {
  const once = compileEchoCutModulationBindings(savedCutGraph());
  assert.deepEqual(compileEchoCutModulationBindings(once), once);
  assert.deepEqual(compileEchoCutModulationBindings(savedCutGraph()), once);
});

test("parameter mappings override a card's portable audio map, exactly as export reads it", () => {
  const card = shaderCard("projected:track-b:0", { mappings: { gain: "bass:beat" } });
  assert.deepEqual(normalizeEchoVisualizerCardAudioMap(card.visualization.card, card.parameters.visualizerMappings).gain.signal, "beat");
  const graph = savedCutGraph();
  graph.tracks[0].cards[0] = card;
  const binding = compileEchoCutModulationBindings(graph).directorV2.modulationBindings.find((row) => row.target.visualizerId === card.id);
  assert.equal(binding.source.signal, "beat");
  assert.equal(binding.source.stemFocus, "bass");
  assert.equal(binding.envelope.quantize, "beat");
});

test("operator locks keep telemetry as authored", () => {
  const graph = savedCutGraph({ locks: [{ targetId: "shader-treatment" }] });
  assert.equal(compileEchoCutModulationBindings(graph), graph, "a locked shader treatment is left alone");
  const lockedCard = savedCutGraph({ locks: [{ targetId: "projected:track-b:0" }] });
  const compiled = compileEchoCutModulationBindings(lockedCard).directorV2.modulationBindings;
  assert.equal(compiled.some((binding) => binding.target.visualizerId === "projected:track-b:0"), false);
  const lockedSlot = compileEchoCutModulationBindings(savedCutGraph(), { project: { persistent_shader_slots: [{ id: "always-on-1", locks: ["opacity"] }] } });
  assert.deepEqual(lockedSlot.directorV2.cutModulation.slotOpacityBindings, [], "a slot whose opacity is locked keeps its authored opacity");
  const lockedBinding = savedCutGraph();
  lockedBinding.directorV2.modulationBindings[0].locked = true;
  assert.ok(compileEchoCutModulationBindings(lockedBinding).directorV2.modulationBindings.some((binding) => binding.target.visualizerId === "visualizer:0:isf-other"));
});

test("section energy is relative to the song, and a song without contrast leaves slots at their authored opacity", () => {
  const source = echoSectionEnergySource(sections);
  assert.deepEqual(source.sections.map((row) => row.level), [0, 1, 0.5]);
  assert.equal(echoSectionEnergyLevel(source, 15), 1);
  assert.equal(echoSectionEnergyLevel(source, 30), 0.5, "the song end holds the last section");
  const gapped = echoSectionEnergySource([{ startSeconds: 2, endSeconds: 8, energy: 0.2 }, { startSeconds: 8, endSeconds: 12, energy: 0.9 }, { startSeconds: 20, endSeconds: 30, energy: 0.2 }]);
  assert.equal(echoSectionEnergyLevel(gapped, 16), 1, "a gap between sections holds the last section's level");
  assert.equal(echoSectionEnergyLevel(gapped, 0), 0, "time before the first section takes its level");
  assert.equal(echoSectionEnergySource([{ startSeconds: 0, endSeconds: 9, energy: 0.4 }, { startSeconds: 9, endSeconds: 20, energy: 0.4 }]), null);
  assert.equal(echoSectionEnergySource([{ startSeconds: 0, endSeconds: 9, energy: 0.4 }]), null);
  const older = savedCutGraph();
  delete older.directorV2.visualBudgetPolicy;
  older.directorV2.cueGraph = { sections };
  assert.deepEqual(compileEchoCutModulationBindings(older).directorV2.cutModulation.slotOpacityBindings, ["slot-opacity:always-on-1"], "older compiles keep sections in the cue graph");
  delete older.directorV2.cueGraph;
  const edit = { song_edit_map: { sections: sections.map(({ startSeconds, endSeconds, energy }) => ({ start: startSeconds, end: endSeconds, energy })) } };
  assert.deepEqual(compileEchoCutModulationBindings(older, { project: edit }).directorV2.modulationBindings.find((binding) => binding.target.kind === "visualizer_opacity").source,
    echoSectionEnergySource(sections), "an uncertified cut reads the song edit map");
  const flat = savedCutGraph();
  flat.directorV2.visualBudgetPolicy.sections = sections.map((section) => ({ ...section, energy: 0.5 }));
  const compiled = compileEchoCutModulationBindings(flat).directorV2;
  assert.deepEqual(compiled.cutModulation.slotOpacityBindings, []);
  assert.equal(compiled.cutModulation.sectionEnergy, "unavailable");
});

test("a slot's prepared opacity scale settles low in quiet sections and high in loud ones, independent of stem solo", () => {
  const bindings = compileEchoCutModulationBindings(savedCutGraph()).directorV2.modulationBindings.filter((binding) => binding.target.kind === "visualizer_opacity");
  const timeline = prepareDirectorModulationTimeline(bindings, { durationSeconds: 30, fps: 60, sourceFingerprint: "fixture", sampleSignals: () => ({}) });
  const scaleAt = (time, solo = "") => echoPreparedVisualizerOpacityScale(evaluatePreparedDirectorModulation(isolateEchoPreparedModulation(timeline, solo), time), ["card:persistent:always-on-1"]);
  const [floor, ceiling] = ECHO_SLOT_OPACITY_RANGE;
  assert.equal(scaleAt(0), floor);
  assert.ok(Math.abs(scaleAt(9.5) - floor) < 1e-6);
  assert.ok(Math.abs(scaleAt(19.5) - ceiling) < 1e-3, `loud section settles at the ceiling, got ${scaleAt(19.5)}`);
  assert.ok(Math.abs(scaleAt(29.5) - (floor + ceiling) / 2) < 1e-3);
  assert.ok(scaleAt(10.3) > floor && scaleAt(10.3) < ceiling, "section changes ramp instead of jumping");
  assert.equal(scaleAt(19.5, "drums"), scaleAt(19.5), "section energy is not a stem signal");
  const live = createDirectorModulationRuntime(bindings);
  assert.equal(live.step({ atSeconds: 15 })[0].value, ceiling, "the live runtime evaluates the same source");
  assert.equal(echoPreparedVisualizerOpacityScale([], ["x"]), null);
});

test("preview and export apply the same slot opacity scale to the painted alpha", () => {
  const card = shaderCard("card:persistent:always-on-1", { persistentSlotId: "always-on-1" });
  const shader = { id: "isf:card", shaderType: "generator", inputs: card.visualization.card.inputs };
  const bindings = compileEchoCutModulationBindings(savedCutGraph()).directorV2.modulationBindings.filter((binding) => binding.target.visualizerId === card.id);
  const preparedModulation = prepareDirectorModulationTimeline(bindings, { durationSeconds: 30, fps: 60, sourceFingerprint: "fixture", sampleSignals: () => ({ master: { rms: 0.5 } }) });
  for (const time of [5, 10.4, 19.5, 25]) {
    const preview = buildEchoIsfFrameIntent({ shader, card, timestampSeconds: time, signalFrames: { master: { rms: 0.5 } }, preparedModulation }).composition;
    const scale = echoPreparedVisualizerOpacityScale(evaluatePreparedDirectorModulation(preparedModulation, time), [card.id]);
    const exported = scaleEchoCompositionOpacity(normalizeEchoIsfComposition(card, card.startSeconds, {}, shader), scale);
    assert.equal(preview.opacityScale, scale);
    assert.equal(echoVisualizerLayerPresentation({ composition: preview, recipeMix: 0.5 }).effectiveAlpha,
      echoVisualizerLayerPresentation({ composition: exported, recipeMix: 0.5 }).effectiveAlpha, `alpha at ${time}s`);
  }
  const quiet = buildEchoIsfFrameIntent({ shader, card, timestampSeconds: 5, preparedModulation }).composition.opacity;
  const loud = buildEchoIsfFrameIntent({ shader, card, timestampSeconds: 19.5, preparedModulation }).composition.opacity;
  assert.equal(quiet, 0.2, "authored 0.4 at the quietest section is halved");
  assert.ok(Math.abs(loud - 0.52) < 1e-4, `authored 0.4 at the loudest section is raised by 1.3, got ${loud}`);
  assert.equal(normalizeEchoIsfComposition({ ...card, parameters: { opacity: 0.9 } }, 0, { opacityScale: 1.3 }).opacity, 1, "opacity never exceeds 1");
  assert.equal(normalizeEchoIsfComposition(card, 0, {}).opacityScale, undefined, "no binding leaves the composition unchanged");
});

test("the editor graph compiles telemetry for a working copy's own shaders and slots", () => {
  const shader = { id: "isf:fixture", title: "Fixture", source: "void main() { gl_FragColor = vec4(1.); }", sourceHash: `sha256:${"c".repeat(64)}`,
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.1, MIN: 0, MAX: 1 }], audioMap: { gain: { signal: "rms", depth: 0.3 } } };
  const portable = buildPortableVisualizerCard(shader);
  const graph = savedCutGraph();
  graph.tracks = [{ id: "track-b", role: "visualizer", cards: [{ id: "card:b:0", startSeconds: 0, endSeconds: 30, visualization: { sourceId: shader.id, card: portable }, parameters: {} }] }];
  const editor = projectToEditorGraph({ song_id: "song", duration: 30, director_show_graph: graph,
    visualizer_timeline: [{ visualizer_id: shader.id, start_sec: 0, end_sec: 30 }],
    persistent_shader_slots: [{ id: "always-on-shader-1", enabled: true, shader_id: shader.id, portable_visualizer_card: portable }] });
  const cueIds = editor.tracks.flatMap((track) => track.cards || []).filter((card) => card.visualization?.card?.id === shader.id).map((card) => card.cueId);
  assert.equal(cueIds.length, 2, "the timeline cue and the always-on slot");
  const bindings = editor.directorV2.modulationBindings;
  assert.equal(bindings.some((binding) => binding.target.visualizerId === "visualizer:0:isf-other"), false);
  for (const cueId of cueIds) assert.ok(bindings.some((binding) => binding.target.kind === "visualizer_uniform" && binding.target.visualizerId === cueId), cueId);
  assert.ok(editor.directorV2.cutModulation.slotOpacityBindings.includes("slot-opacity:always-on-shader-1"));
});

test("export paints an always-on slot at its section-energy opacity, and the preview frame uses the same scale", async () => {
  const crypto = await import("node:crypto");
  const { compileHyperFramesShow } = await import("../src/domain/hyperframes-show-compiler.js");
  const { evaluateHyperFramesVisualizers } = await import("../src/domain/hyperframes-visualizer-runtime.js");
  const shader = { id: "isf:fixture-exact", title: "Fixture exact", source: "void main() { gl_FragColor = vec4(1.); }",
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.1, MIN: 0, MAX: 1 }], audioMap: { gain: { signal: "rms", depth: 0.2 } } };
  shader.sourceHash = `sha256:${crypto.createHash("sha256").update(shader.source).digest("hex")}`;
  const portable = buildPortableVisualizerCard(shader);
  const proxy = { id: shader.id, sourceHash: portable.source.hash, assetPath: "/static/fixture.png", repositoryPath: "fixture.png", assetSha256: `sha256:${"b".repeat(64)}`,
    width: 16, height: 9, frameWidth: 16, frameHeight: 9, atlasWidth: 128, atlasHeight: 9, frameCount: 8, fps: 4, frameTimes: [0, .25, .5, .75, 1, 1.25, 1.5, 1.75] };
  const graph = { schemaVersion: "hapa.music-viz.native-show-graph.v2", song: { id: "fixture", durationSeconds: 30 }, stems: { items: [] },
    tracks: [{ id: "track-b", role: "visualizer", cards: [] }], directorV2: { visualBudgetPolicy: { sections }, modulationBindings: [] } };
  const project = { duration: 30, director_show_graph: graph, visualizer_timeline: [],
    persistent_shader_slots: [{ id: "always-on-shader-1", enabled: true, shader_id: shader.id, portable_visualizer_card: portable, opacity: 0.4 },
      { id: "always-on-shader-2", enabled: false }, { id: "always-on-shader-3", enabled: false }] };
  const editor = projectToEditorGraph(project);
  const buses = [{ id: "master", role: "master", durationSeconds: 30, originSeconds: 0, frames: [0, 10, 20, 29.9].map((t) => ({ t, rms: .4, peak: .6, silence: false })) }];
  const performance = { schemaVersion: "hapa.echo.music-performance.v1", masterAudioHash: "a".repeat(64), lyrics: editor.song.lyricOverlay, fingerprint: "fixture-slot", durationSeconds: 30, buses, events: [], missingData: {} };
  const show = compileHyperFramesShow({ showGraph: editor, project, telemetry: { masterMix: { audioHash: performance.masterAudioHash } }, performance, proxyRegistry: { proxies: [proxy] } });
  const slot = editor.tracks.flatMap((track) => track.cards || []).find((card) => card.persistentSlotId === "always-on-shader-1");
  const exportedAt = (time) => evaluateHyperFramesVisualizers(show, time).layers.find((layer) => layer.persistentSlotId === "always-on-shader-1");
  const [floor, ceiling] = ECHO_SLOT_OPACITY_RANGE;
  const quiet = exportedAt(9.5), loud = exportedAt(19.5);
  assert.ok(Math.abs(quiet.opacityScale - floor) < 1e-4 && Math.abs(loud.opacityScale - ceiling) < 1e-3, `${quiet.opacityScale} / ${loud.opacityScale}`);
  assert.ok(loud.effectiveOpacity > quiet.effectiveOpacity * 2.5, "the loud section paints the slot brighter");
  // The fixture has no live ISF, so export takes the proxy path (with its own audio
  // presentation factor); on both paths the slot's alpha moves exactly with its scale.
  const previewAt = (time) => {
    const composition = buildEchoIsfFrameIntent({ shader, card: slot, timestampSeconds: time, preparedModulation: show.automation.preparedModulation }).composition;
    return { scale: composition.opacityScale, alpha: echoVisualizerLayerPresentation({ composition, recipeMix: echoVisualizerRecipeMixFor(editor) }).effectiveAlpha };
  };
  const [pq, pl] = [previewAt(9.5), previewAt(19.5)];
  assert.equal(pq.scale, quiet.opacityScale);
  assert.equal(pl.scale, loud.opacityScale);
  assert.ok(Math.abs(pq.alpha / pq.scale - pl.alpha / pl.scale) < 1e-4, "preview alpha follows the scale");
  assert.ok(Math.abs(quiet.effectiveOpacity / quiet.opacityScale - loud.effectiveOpacity / loud.opacityScale) < 1e-4, "export alpha follows the scale");
  assert.ok(Math.abs(quiet.baseEffectiveOpacity * quiet.opacityScale - pq.alpha) < 1e-6, "both start from the same authored opacity × recipe mix");
});
