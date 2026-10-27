import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ECHO_SCORE_DUST_LAYER_SCHEMA, ECHO_SCORE_DUST_LAYER_ORDER, validateEchoScoreDustLayer, compileEchoScoreDustTrack, planEchoScoreDustLayer,
  bindEchoScoreDustLayerRender, echoScoreDustLayerFrame, echoScoreDustLayerSourceRect, paintEchoScoreDustLayer, seekEchoScoreDustLayerVideo, echoScoreDustLayerVideoAt,
  assertEchoScoreDustLayerExportable,
} from '../src/domain/echo-score-dust-layer.js';
import { buildDirectorV2Artifacts } from '../src/domain/echo-director-v2.js';
import { validateEchoCompiledShowGraph, reidentifyEchoCompiledShowGraph } from '../src/domain/echo-compiled-show-graph.js';
import { compileHyperFramesShow, clipHyperFramesShow } from '../src/domain/hyperframes-show-compiler.js';
import { adaptShowGraphWithLossReport } from '../src/domain/show-graph-capabilities.js';
import { projectToEditorGraph } from '../src/domain/multitrack-editor.js';
import { pickEchoDirectionVariantProjectPatch, deriveEchoDirectionVariantProject } from '../src/domain/echo-direction-variants.js';
import { prepareEchoProjectForPersistence } from '../server/echo-project-persistence.mjs';
import { preparedSongCardCompilerReady, preparedScoreDustPixelProof } from '../server/song-card-living-light.mjs';
import encoding from '../scripts/lib/prepared-frame-encoding.cjs';

const FP = 'score-fp-0123456789abcdef';
const rejects = (fn, code) => assert.throws(fn, (error) => error.code === code);
function layer(overrides = {}) {
  return { ...planEchoScoreDustLayer({ songId: 'song-fixture', atlasRunId: 'run-1', direction: { maxDensity: 0.8 }, scoreFingerprint: FP, seed: 7, startSeconds: 4, endSeconds: 20, opacity: 0.9 }), ...overrides };
}
function receipt(overrides = {}) {
  return { schemaVersion: 'hapa.echo.score-dust.export.v1', scoreFingerprint: FP, seed: 7, particles: 6000, codec: 'vp09.00.10.08', width: 1920, height: 1080, fps: 30, frames: 480,
    startSeconds: 4, durationSeconds: 16, loopBridgeSeconds: 0, background: 'transparent', ...overrides };
}
const SHA = 'a'.repeat(64);
function bound(overrides = {}) {
  return bindEchoScoreDustLayerRender(layer(), { recordingId: 'rec_score_dust_1', uri: '/media/score-dust-renders/rec_score_dust_1.webm', sha256: SHA, receipt: receipt(overrides) });
}
function project(scoreDustLayer = layer()) {
  return { song_id: 'song-fixture', song_title: 'Fixture', duration: 24, timeline: [], visualizer_timeline: [], score_dust_layer: scoreDustLayer };
}

test('the layer contract is exact, song-bound and never clipped', () => {
  const planned = layer();
  assert.equal(planned.schemaVersion, ECHO_SCORE_DUST_LAYER_SCHEMA);
  assert.deepEqual(planned.window, { startUs: 4e6, endUs: 20e6 });
  assert.equal(planned.render, null);
  assert.equal(validateEchoScoreDustLayer(planned, { songId: 'song-fixture', durationUs: 24e6 }), planned);
  assert.equal(validateEchoScoreDustLayer(undefined), null);
  rejects(() => validateEchoScoreDustLayer(planned, { songId: 'other-song' }), 'score_dust_layer_song');
  rejects(() => validateEchoScoreDustLayer(planned, { durationUs: 10e6 }), 'score_dust_layer_duration');
  rejects(() => validateEchoScoreDustLayer({ ...planned, finalEncoding: 'ready' }), 'score_dust_layer_field');
  rejects(() => validateEchoScoreDustLayer({ ...planned, opacity: 0 }), 'score_dust_layer_opacity');
  rejects(() => validateEchoScoreDustLayer({ ...planned, blend: 'multiply' }), 'score_dust_layer_blend');
  rejects(() => validateEchoScoreDustLayer({ ...planned, window: { startUs: 5e6, endUs: 5e6 } }), 'score_dust_layer_window');
  rejects(() => validateEchoScoreDustLayer({ ...planned, binding: { scoreFingerprint: FP, seed: -1 } }), 'score_dust_layer_seed');
  rejects(() => validateEchoScoreDustLayer({ ...planned, source: { atlasRunId: 'run-1', direction: null, playSettings: null } }), 'score_dust_layer_direction');
  // Windows snap inward to whole milliseconds so they fit a millisecond-rounded song.
  assert.deepEqual(planEchoScoreDustLayer({ songId: 's', atlasRunId: 'r', direction: {}, scoreFingerprint: FP, seed: 1, startSeconds: 0.0004, endSeconds: 9.9999 }).window, { startUs: 1000, endUs: 9999000 });
});

test('only a transparent render of the bound score and seed that covers the window can bind', () => {
  const ok = bound();
  assert.equal(ok.render.sha256, `sha256:${SHA}`);
  assert.equal(ok.render.recordingId, 'rec_score_dust_1');
  rejects(() => bound({ background: 'score' }), 'score_dust_render_background');
  rejects(() => bound({ background: 'cut' }), 'score_dust_render_background');
  rejects(() => bound({ scoreFingerprint: 'another-score' }), 'score_dust_render_fingerprint');
  rejects(() => bound({ seed: 8 }), 'score_dust_render_seed');
  rejects(() => bound({ loopBridgeSeconds: 1.5 }), 'score_dust_render_loop');
  rejects(() => bound({ startSeconds: 6, durationSeconds: 14 }), 'score_dust_render_coverage');
  rejects(() => bound({ durationSeconds: 10 }), 'score_dust_render_coverage');
  rejects(() => bindEchoScoreDustLayerRender(layer(), { recordingId: 'rec_1', uri: '/x.webm', sha256: 'not-a-hash', receipt: receipt() }), 'score_dust_render_hash');
  rejects(() => bindEchoScoreDustLayerRender(layer(), { recordingId: 'rec_1', uri: '/x.webm', sha256: SHA }), 'score_dust_render_receipt');
  // A render that starts earlier and runs longer still covers the window.
  assert.equal(bound({ startSeconds: 0, durationSeconds: 24 }).render.startSeconds, 0);
});

test('track status, stacking order and the shared frame clock', () => {
  const required = compileEchoScoreDustTrack(project());
  assert.equal(required.status, 'render-required');
  assert.equal(required.readiness.finalEncoding, 'blocked-render-required');
  assert.deepEqual(required.order, ECHO_SCORE_DUST_LAYER_ORDER);
  assert.ok(required.order.indexOf('score-dust') > required.order.indexOf('living-light') && required.order.indexOf('score-dust') < required.order.indexOf('lyrics'));
  assert.equal(echoScoreDustLayerFrame(required, 10).active, false, 'an unbound layer never paints');
  const track = compileEchoScoreDustTrack(project(bound({ startSeconds: 2, durationSeconds: 20 })));
  assert.equal(track.status, 'bound');
  assert.equal(echoScoreDustLayerFrame(track, 3.999).active, false);
  assert.deepEqual(echoScoreDustLayerFrame(track, 4), { active: true, sourceSeconds: 2, sourceFrame: 60, seekSeconds: 60.5 / 30, renderFps: 30, opacity: 0.9, canvasComposite: 'source-over', cssBlend: 'normal' });
  // A frame is chosen by index and sought at its middle, away from millisecond timestamp boundaries.
  assert.equal(echoScoreDustLayerFrame(track, 12 + 0.999 / 30).sourceFrame, 300);
  assert.equal(echoScoreDustLayerFrame(track, 12 + 1 / 30).sourceFrame, 301);
  assert.equal(echoScoreDustLayerFrame(track, 19.999).sourceFrame, 539);
  assert.equal(echoScoreDustLayerFrame(compileEchoScoreDustTrack(project(bound())), 19.999).sourceFrame, 479, 'never past the last rendered frame');
  assert.equal(echoScoreDustLayerFrame(track, 20).active, false, 'half-open window');
  const screen = compileEchoScoreDustTrack(project({ ...bound(), blend: 'screen' }));
  assert.equal(echoScoreDustLayerFrame(screen, 5).canvasComposite, 'screen');
  assert.equal(echoScoreDustLayerFrame(screen, 5).cssBlend, 'screen');
  assert.deepEqual(echoScoreDustLayerSourceRect(1920, 1080, 1920, 1080), [0, 0, 1920, 1080]);
  assert.deepEqual(echoScoreDustLayerSourceRect(1920, 1080, 1080, 1080), [420, 0, 1080, 1080]);
});

test('the shared seek lands on the middle of the chosen frame and refuses a stalled seek', async () => {
  const track = compileEchoScoreDustTrack(project(bound()));
  const frame = echoScoreDustLayerFrame(track, 8);
  const listeners = {};
  const video = { currentTime: 0, seeking: false, readyState: 4, paused: false, pause() { this.paused = true; },
    addEventListener: (type, fn) => { (listeners[type] ||= new Set()).add(fn); }, removeEventListener: (type, fn) => listeners[type]?.delete(fn) };
  Object.defineProperty(video, 'currentTime', { get() { return this._t ?? 0; }, set(value) { this._t = value - 2e-6; queueMicrotask(() => listeners.seeked?.forEach((fn) => fn())); } });
  const result = await seekEchoScoreDustLayerVideo(video, frame);
  assert.equal(result.sourceFrame, frame.sourceFrame);
  assert.ok(Math.abs(result.observedSeconds - frame.seekSeconds) < 1e-5, 'a seek that lands a few microseconds short is still the same frame');
  assert.equal(video.paused, true);
  assert.equal(echoScoreDustLayerVideoAt(video, frame), true);
  assert.equal(echoScoreDustLayerVideoAt({ ...video, currentTime: frame.seekSeconds + 0.3 / 30, seeking: false, readyState: 4 }, frame), false);
  const stalled = { currentTime: 0, seeking: true, readyState: 4, pause() {}, addEventListener() {}, removeEventListener() {} };
  await assert.rejects(seekEchoScoreDustLayerVideo(stalled, frame, { timeoutMs: 20 }), /timed out/);
  assert.equal(await seekEchoScoreDustLayerVideo(video, echoScoreDustLayerFrame(track, 1)), null);
});

test('painting applies the layer opacity and composite and restores the context', () => {
  const calls = [];
  const ctx = { save: () => calls.push('save'), restore: () => calls.push('restore'), drawImage: (...args) => calls.push(['draw', ctx.globalAlpha, ctx.globalCompositeOperation, ...args.slice(1)]), globalAlpha: 1, globalCompositeOperation: 'source-over' };
  const video = { videoWidth: 1920, videoHeight: 1080 };
  const track = compileEchoScoreDustTrack(project({ ...bound(), blend: 'lighter' }));
  assert.equal(paintEchoScoreDustLayer(ctx, video, echoScoreDustLayerFrame(track, 8), 1920, 1080), true);
  assert.deepEqual(calls, ['save', ['draw', 0.9, 'lighter', 0, 0, 1920, 1080, 0, 0, 1920, 1080], 'restore']);
  assert.equal(paintEchoScoreDustLayer(ctx, video, echoScoreDustLayerFrame(track, 1), 1920, 1080), false);
  assert.equal(paintEchoScoreDustLayer(ctx, { videoWidth: 0 }, echoScoreDustLayerFrame(track, 8), 1920, 1080), false);
});

test('Director V2 binds the track into graph identity and the compiled-graph validator', () => {
  const p = project(bound()), options = { project: p, manifest: { shaders: [] }, duration: 24 };
  const graph = buildDirectorV2Artifacts(options).showGraph;
  assert.deepEqual(graph.scoreDust, compileEchoScoreDustTrack(p));
  assert.equal(validateEchoCompiledShowGraph({ project: p, graph }).ok, true);
  const unbound = buildDirectorV2Artifacts({ ...options, project: project() }).showGraph;
  assert.notEqual(graph.directorV2.variantHash, unbound.directorV2.variantHash, 'binding a render is a new cut identity');
  const omitted = structuredClone(graph); delete omitted.scoreDust;
  assert.ok(validateEchoCompiledShowGraph({ project: p, graph: reidentifyEchoCompiledShowGraph(omitted) }).reasons.includes('score_dust_track_mismatch'));
  const legacy = project(); delete legacy.score_dust_layer;
  assert.equal(buildDirectorV2Artifacts({ ...options, project: legacy }).showGraph.scoreDust, undefined);
  rejects(() => buildDirectorV2Artifacts({ ...options, duration: 10 }), 'score_dust_layer_duration');
});

test('editor graphs, saved-cut patches and persistence carry the layer', () => {
  const p = project(bound());
  assert.deepEqual(projectToEditorGraph(p).scoreDust, compileEchoScoreDustTrack(p));
  assert.equal(projectToEditorGraph({ ...p, score_dust_layer: null, director_show_graph: projectToEditorGraph(p) }).scoreDust, undefined);
  assert.deepEqual(pickEchoDirectionVariantProjectPatch(p).score_dust_layer, p.score_dust_layer);
  const child = deriveEchoDirectionVariantProject(p, { id: 'child', timeline: [], visualizer_timeline: [], project_patch: { score_dust_layer: p.score_dust_layer } });
  assert.deepEqual(child.director_show_graph.scoreDust.layer, p.score_dust_layer);
  assert.deepEqual(prepareEchoProjectForPersistence(p).score_dust_layer, p.score_dust_layer);
  rejects(() => prepareEchoProjectForPersistence(project({ ...layer(), songId: 'wrong' })), 'score_dust_layer_song');
  rejects(() => pickEchoDirectionVariantProjectPatch({ score_dust_layer: { ...layer(), blend: 'add' } }), 'score_dust_layer_blend');
});

test('final export refuses an unbound or stale layer and admits a bound one for prepared capture', () => {
  const options = (p, graph) => ({ project: p, showGraph: graph, telemetry: { fps: 10, stems: [] } });
  const unbound = project(), unboundGraph = buildDirectorV2Artifacts({ project: unbound, manifest: { shaders: [] }, duration: 24 }).showGraph;
  rejects(() => compileHyperFramesShow(options(unbound, unboundGraph)), 'score_dust_render_required');
  const p = project(bound()), graph = buildDirectorV2Artifacts({ project: p, manifest: { shaders: [] }, duration: 24 }).showGraph;
  rejects(() => compileHyperFramesShow(options(p, unboundGraph)), 'score_dust_graph_mismatch');
  const stale = structuredClone(graph); delete stale.scoreDust;
  rejects(() => compileHyperFramesShow(options(p, stale)), 'score_dust_graph_mismatch');
  rejects(() => assertEchoScoreDustLayerExportable({ ...p, score_dust_layer: undefined }, graph), 'score_dust_graph_mismatch');
  const show = compileHyperFramesShow(options(p, graph));
  assert.equal(show.scoreDust.requiresPreparedFrames, true);
  assert.equal(show.scoreDust.captureRoute, 'hapa-prepared-electron-v1');
  assert.deepEqual(show.scoreDust.source, { uri: p.score_dust_layer.render.uri, sha256: `sha256:${SHA}` });
  assert.deepEqual(clipHyperFramesShow(show, 8).scoreDust.layer, show.scoreDust.layer);
  assert.equal(show.livingLight, undefined);
});

test('prepared encoding and pixel proof require a painted dust frame inside the window', () => {
  const p = project(bound()), graph = buildDirectorV2Artifacts({ project: p, manifest: { shaders: [] }, duration: 24 }).showGraph;
  const show = { ...compileHyperFramesShow({ project: p, showGraph: graph, telemetry: { fps: 10, stems: [] } }), packaging: { audio: { uri: 'assets/audio/full_mix.mp3', sha256: `sha256:${'b'.repeat(64)}` } } };
  assert.equal(encoding.encodingPlan(show, '/package', '/output').frameCount, Math.ceil(show.duration * show.fps));
  assert.throws(() => encoding.encodingPlan({ ...show, scoreDust: undefined }, '/package', '/output'), /Living Light or Score Dust/);
  const frame = (index, scoreDust) => ({ frameIndex: index, showHash: show.showHash, livingLight: null, snapshotDigest: null, scoreDust });
  const inside = Math.round(8 * show.fps), outside = Math.round(1 * show.fps), songUs = (i) => Math.round(i * 1e6 / show.fps);
  encoding.checkFrameReceipt(frame(inside, { frameIndex: inside, songUs: songUs(inside), active: true, painted: true }), inside, show);
  encoding.checkFrameReceipt(frame(outside, { frameIndex: outside, songUs: songUs(outside), active: false, painted: false }), outside, show);
  assert.throws(() => encoding.checkFrameReceipt(frame(inside, { frameIndex: inside, songUs: songUs(inside), active: true, painted: false }), inside, show), /Score Dust/);
  assert.throws(() => encoding.checkFrameReceipt(frame(inside, { frameIndex: inside, songUs: songUs(inside), active: false, painted: false }), inside, show), /Score Dust/);
  assert.throws(() => encoding.checkFrameReceipt(frame(inside, null), inside, show), /requested cut/);
  const packageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'score-dust-layer-'));
  fs.writeFileSync(path.join(packageDir, 'executable-show.json'), JSON.stringify({ scoreDust: { requiresPreparedFrames: true } }));
  assert.throws(() => encoding.assertLegacyCaptureRoute(['render'], packageDir), /Score Dust layer package requires/);
  fs.rmSync(packageDir, { recursive: true, force: true });
  const times = encoding.preparedPixelTimestamps(show, [0]);
  for (const second of [4, 20 - 1 / show.fps]) assert.ok(times.some((t) => Math.abs(t - second) < 1e-9), `samples the window edge at ${second}s`);
  const packaged = { ...show, scoreDust: { ...show.scoreDust, compiledUri: 'assets/score-dust/x.webm', compiledSha256: `sha256:${SHA}` } };
  const validation = { ...Object.fromEntries(['lint', 'inspect', 'cueCoverage', 'mediaPreflight', 'mediaOffline', 'visualizerPreflight', 'visualizerOffline', 'shaderFidelity'].map((k) => [k, 'pass'])), preparedCapture: 'requires-hapa-prepared-electron-v1', showcaseReady: false };
  assert.equal(preparedSongCardCompilerReady({ ok: true, showHash: packaged.showHash, validation }, packaged, null), true);
  assert.equal(preparedSongCardCompilerReady({ ok: true, showHash: packaged.showHash, validation }, { ...packaged, scoreDust: { ...packaged.scoreDust, compiledSha256: `sha256:${'c'.repeat(64)}` } }, null), false);
  assert.equal(preparedSongCardCompilerReady({ ok: true, showHash: packaged.showHash, validation: { ...validation, preparedCapture: 'not-required' } }, packaged, null), false);
  const proofFrame = (index, active, nonBlank = true) => ({ timestamp: index / show.fps, metrics: { nonBlank }, preparedFrame: frame(index, { frameIndex: index, songUs: songUs(index), active, painted: active }) });
  assert.equal(preparedScoreDustPixelProof(packaged, { showHash: show.showHash, frames: [proofFrame(outside, false), proofFrame(inside, true)] }).paintedSamples, 1);
  assert.throws(() => preparedScoreDustPixelProof(packaged, { showHash: show.showHash, frames: [proofFrame(outside, false)] }), /omitted/);
  assert.throws(() => preparedScoreDustPixelProof(packaged, { showHash: show.showHash, frames: [proofFrame(inside, true, false)] }), /visible/);
});

test('adapters that cannot composite the layer report a visible loss', () => {
  const graph = buildDirectorV2Artifacts({ project: project(bound()), manifest: { shaders: [] }, duration: 24 }).showGraph;
  assert.ok(adaptShowGraphWithLossReport(graph, 'hyperframes').requiredFeatures.includes('scoreDust'));
  assert.equal(adaptShowGraphWithLossReport(graph, 'hyperframes').losses.some((loss) => loss.feature === 'scoreDust'), false);
  const native = adaptShowGraphWithLossReport(graph, 'music-viz-native');
  assert.deepEqual(native.losses.find((loss) => loss.feature === 'scoreDust'), { feature: 'scoreDust', support: 'unsupported', fallback: null, visible: true, approved: false, approval: null });
  assert.equal(native.ok, false);
});

test('the export page imports the layer module and stays import-free for packaging', () => {
  const source = fs.readFileSync(new URL('../src/domain/echo-score-dust-layer.js', import.meta.url), 'utf8');
  assert.equal(/^\s*import\s/m.test(source), false);
  const compiler = fs.readFileSync(new URL('../scripts/compile-hyperframes-show-v2.mjs', import.meta.url), 'utf8');
  assert.match(compiler, /"echo-score-dust-layer\.js"\]/);
  assert.match(compiler, /paintEchoScoreDustLayer\(X,scoreDustVideo/);
  // The setup runs before the page declares S, so it reads the window global;
  // the alpha video is created at runtime so lint/upstream never see a clip.
  assert.match(compiler, /scoreDustVideo=Object\.assign\(document\.createElement\('video'\),\{[^}]*src:window\.HAPA_EXECUTABLE_SHOW\.scoreDust\.compiledUri\}\)/);
  assert.match(compiler, /seekEchoScoreDustLayerVideo\(scoreDustVideo,layerFrame/);
  assert.doesNotMatch(compiler, /<video id="score-dust-layer"/);
  // Painted after Living Light and before the lyric layer.
  assert.ok(compiler.indexOf('livingLightReceipt=livingLightRenderer.paintFrame') < compiler.indexOf('paintEchoScoreDustLayer(X,scoreDustVideo'));
  assert.ok(compiler.indexOf('paintEchoScoreDustLayer(X,scoreDustVideo') < compiler.indexOf('const lyricState=drawLyric('));
});
