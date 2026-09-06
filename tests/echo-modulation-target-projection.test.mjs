import test from 'node:test';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { buildPortableVisualizerCard } from '../src/domain/portable-visualizer-card.js';
import { projectToEditorGraph } from '../src/domain/multitrack-editor.js';
import { compileHyperFramesShow } from '../src/domain/hyperframes-show-compiler.js';
import { buildEchoIsfFrameIntent } from '../src/domain/echo-isf-frame-intent.js';
import { echoPreparedPerformanceSignalFrames, evaluateHyperFramesVisualizers } from '../src/domain/hyperframes-visualizer-runtime.js';

const shader = { id: 'isf:fixture-exact', title: 'Fixture exact', source: 'void main() { gl_FragColor = vec4(1.); }',
  inputs: [{ NAME: 'gain', TYPE: 'float', DEFAULT: 0.1, MIN: 0, MAX: 1 }], audioMap: { gain: { signal: 'rms', stemFocus: 'leadVocals', depth: 0.2 } } };
shader.sourceHash = 'sha256:' + crypto.createHash('sha256').update(shader.source).digest('hex');
function fixture() {
  const portable = buildPortableVisualizerCard(shader);
  const proxy = { id: shader.id, sourceHash: portable.source.hash, assetPath: '/static/fixture.png', repositoryPath: 'fixture.png', assetSha256: `sha256:${'b'.repeat(64)}`, width: 16, height: 9, frameWidth: 16, frameHeight: 9, atlasWidth: 128, atlasHeight: 9, frameCount: 8, fps: 4, frameTimes: [0, .25, .5, .75, 1, 1.25, 1.5, 1.75] };
  const targets = ['visualizer:0:isf-fixture-exact', 'visualizer:1:isf-fixture-exact', 'visualizer:persistent:always-on-shader-1:isf-fixture-exact'];
  const cards = [0, 1].map(i => ({ id: `card:b:${i}`, sourceCueIndex: 99, startSeconds: i, endSeconds: i + 1, visualization: { sourceId: shader.id, card: portable }, parameters: {} }));
  const graph = { schemaVersion: 'hapa.music-viz.native-show-graph.v2', song: { id: 'fixture', durationSeconds: 2 }, stems: { items: [] }, tracks: [{ id: 'track-b', role: 'visualizer', cards }], directorV2: {
    modulationBindings: targets.map((visualizerId, i) => ({ id: `binding-${i}`, source: { kind: 'stem_signal', stemFocus: 'leadVocals', signal: 'rms' }, target: { kind: 'visualizer_uniform', visualizerId, uniform: 'gain' }, envelope: { baseValue: 0.6 + i / 10, depth: 0, clamp: [0, 1] } })) } };
  const project = { duration: 2, director_show_graph: graph, visualizer_timeline: [0, 1].map(i => ({ visualizer_id: shader.id, start_sec: i, end_sec: i + 1 })), persistent_shader_slots: [
    { id: 'always-on-shader-1', enabled: true, shader_id: shader.id, portable_visualizer_card: portable },
    { id: 'always-on-shader-2', enabled: false }, { id: 'always-on-shader-3', enabled: false }] };
  const buses = ['master', 'vocals'].map(role => ({ id: role, role, durationSeconds: 2, originSeconds: 0, frames: [0, 1, 1.9].map(t => ({ t, rms: .4, peak: .6, silence: false })) }));
  const performance = { schemaVersion: 'hapa.echo.music-performance.v1', masterAudioHash: 'a'.repeat(64), lyrics: projectToEditorGraph(project).song.lyricOverlay, fingerprint: 'fixture-targets', durationSeconds: 2, buses, events: [], missingData: {} };
  return { project, performance, proxy, targets };
}

test('saved projections deliver distinct repeated-cue and persistent envelopes to preview and HyperFrames ports', () => {
  const { project, performance, proxy, targets } = fixture();
  const projected = projectToEditorGraph(project);
  const reloaded = projectToEditorGraph(JSON.parse(JSON.stringify({ ...project, director_show_graph: projected })));
  for (const graph of [projected, reloaded]) {
    const cards = graph.tracks.flatMap(t => t.cards);
    assert.deepEqual(cards.map(c => c.cueId), targets);
    assert.deepEqual(cards.map(c => c.sourceCueIndex), [0, 1, 2], 'template source indices must not leak');
    const show = compileHyperFramesShow({ showGraph: graph, project, telemetry: { masterMix: { audioHash: performance.masterAudioHash } }, performance, proxyRegistry: { proxies: [proxy] } });
    assert.deepEqual(show.instances.visualizers.map(c => c.cueId).sort(), [...targets].sort());
    assert.ok(show.instances.visualizers.every(c => c.execution.drawable), 'exercise real drawable instances');
    for (const t of [.5, 1.5, .5]) {
      const exported = evaluateHyperFramesVisualizers(show, t).layers;
      for (const layer of exported) {
        const card = cards.find(c => c.id === layer.id);
        const preview = buildEchoIsfFrameIntent({ shader, card, timestampSeconds: t, signalFrames: echoPreparedPerformanceSignalFrames(performance, t), preparedModulation: show.automation.preparedModulation });
        const expected = 0.6 + targets.indexOf(card.cueId) / 10;
        assert.equal(preview.frameReceipt.input.modulationBindings.filter(b => b.status === 'prepared-absolute-modulation').length, 1);
        assert.ok(Math.abs(preview.values.gain - expected) < 1e-6);
        assert.ok(Math.abs(layer.controlValues.gain - expected) < 1e-6);
      }
      assert.equal(exported.length, 2, 'one timeline cue and one persistent slot');
    }
  }
});

test('replacing a shader cannot inherit a former template modulation target', () => {
  const { project, performance, proxy } = fixture();
  const replacement = { ...shader, id: 'isf:replacement' };
  project.visualizer_timeline[0] = { ...project.visualizer_timeline[0], visualizer_id: replacement.id, portable_visualizer_card: buildPortableVisualizerCard(replacement) };
  const graph = projectToEditorGraph(project);
  const card = graph.tracks[0].cards[0];
  assert.equal(card.cueId, 'visualizer:0:isf-replacement');
  const show = compileHyperFramesShow({ showGraph: graph, project, telemetry: { masterMix: { audioHash: performance.masterAudioHash } }, performance, proxyRegistry: { proxies: [proxy] } });
  const preview = buildEchoIsfFrameIntent({ shader: replacement, card, timestampSeconds: .5, signalFrames: echoPreparedPerformanceSignalFrames(performance, .5), preparedModulation: show.automation.preparedModulation });
  assert.equal(preview.frameReceipt.input.modulationBindings.filter(b => b.status === 'prepared-absolute-modulation').length, 0);
});

test('projection preserves a verified default-bus rebind until the operator changes the requested focus', () => {
  const { project } = fixture();
  const card = project.persistent_shader_slots[0].portable_visualizer_card;
  card.stemFocus = 'master';
  card.audioMap.gain = { signal: 'rms', depth: .2 };
  card.provenance = { ...card.provenance, stemBindingDecision: { requestedRole: 'leadVocals', selectedRole: 'master', status: 'fallback-master-requested-stem-missing', selectedEvidence: { audioHash: 'a'.repeat(64) } } };
  project.persistent_shader_slots[0].stem_focus = 'leadVocals';
  const persistent = graph => graph.tracks.find(t => t.id === 'track-shader-always-on-1').cards[0];
  const initial = projectToEditorGraph(project);
  assert.equal(persistent(initial).visualization.card.stemFocus, 'master');
  assert.equal(persistent(initial).parameters.stemFocus, 'master');
  const saved = JSON.parse(JSON.stringify({ ...project, director_show_graph: initial }));
  assert.equal(persistent(projectToEditorGraph(saved)).visualization.card.stemFocus, 'master');
  saved.persistent_shader_slots[0].stem_focus = 'drums';
  const edited = persistent(projectToEditorGraph(saved));
  assert.equal(edited.visualization.card.stemFocus, 'drums');
  assert.equal(edited.parameters.stemFocus, 'drums');
});
