import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { EchoAccentPresentation as runtime, echoAccentPresentationBrowserSource } from '../src/domain/echo-accent-presentation.js';

const event = (overrides = {}) => ({ id: 'downbeat', atSeconds: 1, endSeconds: 2, kind: 'bloom', intensity: .5,
  target: { scope: 'single-layer', layer: 'visualizer-layer' }, safety: { frameArea: .25, luminanceDelta: .2 },
  keyframes: [{ offset: 0, value: 0 }, { offset: .25, value: .5 }, { offset: 1, value: 0 }], ...overrides });
const context = () => {
  const calls = [];
  return new Proxy({ calls }, { get(object, key) { if (key in object) return object[key]; return (...args) => calls.push([key, ...args]); } });
};
const target = { layer: 'visualizer-layer', primary: true, instanceId: 'shader-1' };

test('native and packaged runtime use the same keyframes across reverse seeks and half-open boundaries', () => {
  const packaged = vm.runInNewContext(echoAccentPresentationBrowserSource() + ';EchoAccentPresentation');
  const input = [event()], before = JSON.stringify(input);
  for (const time of [1.25, 1.8, 1, .999, 2, 1.25]) assert.equal(JSON.stringify(packaged.frame(input, time)), JSON.stringify(runtime.frame(input, time)));
  assert.equal(runtime.frame(input, 1.25).events[0].alpha, .2);
  assert.equal(runtime.frame(input, 1).events[0].alpha, 0);
  assert.equal(runtime.frame(input, 2).events.length, 0);
  assert.equal(JSON.stringify(input), before);
});

test('explicit missing targets do not fall back, and unaddressed events paint only the primary matching layer', () => {
  const explicit = runtime.frame([event({ target: { scope: 'single-layer', layer: 'visualizer-layer', instanceId: 'absent' } })], 1.25);
  assert.deepEqual(runtime.paint(context(), explicit, 1920, 1080, target), []);
  const generic = runtime.frame([event()], 1.25);
  assert.deepEqual(runtime.paint(context(), generic, 1920, 1080, { ...target, layer: 'media-layer' }), []);
  assert.deepEqual(runtime.paint(context(), generic, 1920, 1080, { ...target, primary: false }), []);
  assert.equal(runtime.paint(context(), generic, 1920, 1080, target).length, 1);
});

test('combined rendered area, alpha and layer count stay bounded for dense authored tracks', () => {
  const input = Array.from({ length: 20 }, (_, index) => event({ id: `event-${index}`, safety: { frameArea: 9, luminanceDelta: 9 } }));
  const state = runtime.frame(input, 1.25);
  assert.equal(state.events.length, 3); assert.equal(state.suppressedIds.length, 17);
  assert.ok(state.events.reduce((sum, row) => sum + row.alpha, 0) <= .2 + 1e-9);
  const painted = runtime.paint(context(), state, 1080, 1920, target);
  assert.ok(painted.reduce((sum, row) => sum + row.rect.width * row.rect.height / (1080 * 1920), 0) <= .25 + 1e-9);
});

test('all six gestures paint different primitives inside a clipped region in landscape and portrait', () => {
  for (const [width, height] of [[1920, 1080], [1080, 1920]]) {
    const signatures = new Set();
    for (const kind of ['scan', 'bloom', 'glitch', 'shutter', 'deck-swap', 'flicker']) {
      const ctx = context();
      const rows = runtime.paint(ctx, runtime.frame([event({ kind, target: { ...event().target, focalPoint: { x: 0, y: 1 } } })], 1.25), width, height, target);
      assert.equal(rows.length, 1); const { rect } = rows[0];
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height);
      assert.ok(ctx.calls.findIndex(row => row[0] === 'clip') < ctx.calls.findIndex(row => ['fillRect', 'ellipse'].includes(row[0])));
      signatures.add(JSON.stringify(ctx.calls));
    }
    assert.equal(signatures.size, 6);
  }
});

test('reduced motion substitutes one stationary bloom and restores context on every paint', () => {
  const input = [event({ kind: 'glitch' }), event({ id: 'second', kind: 'flicker' })];
  const first = runtime.frame(input, 1.25, { reducedMotion: true }), later = runtime.frame(input, 1.5, { reducedMotion: true });
  assert.equal(first.events.length, 1); assert.equal(first.events[0].kind, 'bloom');
  const a = context(), b = context(); runtime.paint(a, first, 1920, 1080, target); runtime.paint(b, later, 1920, 1080, target);
  assert.deepEqual(a.calls, b.calls);
  assert.equal(a.calls[0][0], 'save'); assert.equal(a.calls.at(-1)[0], 'restore');
});

test('zero area, zero intensity, missing scope and expired intervals never paint', () => {
  const input = [event({ safety: { frameArea: 0 } }), event({ id: 'off', intensity: 0, keyframes: [] }), event({ target: { layer: 'visualizer-layer' } })];
  assert.deepEqual(runtime.paint(context(), runtime.frame(input, 1.25), 1920, 1080, target), []);
});
