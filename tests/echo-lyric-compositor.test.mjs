import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { prepareEchoLyricIntervals, echoLyricIntervalAt, observeEchoLyricClock } from '../src/domain/echo-lyric-clock.js';
import { resolveEchoLyricTemplateFrame, echoLyricFrameTime } from '../src/domain/echo-lyric-template-runtime.js';
import { normalizeEchoLyricContract } from '../src/domain/echo-lyric-contract.js';
import { resolveEchoOutputProfile } from '../src/domain/echo-output-profile.js';
const source = fs.readFileSync(new URL('../src/components/EchoLyricOverlay.jsx', import.meta.url), 'utf8');
const begin = source.indexOf('function EchoLyricOverlay('), end = source.indexOf('  if (!enabled) return null;', begin);
const component = source.slice(begin, end) + 'return {enabled,surfaceRef};}\nEchoLyricOverlay';
function mount(extra = {}) {
  const effects = [], paints = [], surface = { dataset: {}, clientWidth: 1280, clientHeight: 720 }, presentationRef = { current: null };
  const context = { useMemo: f => f(), useRef: value => ({ current: value === null ? surface : value }), useLayoutEffect: f => effects.push(f),
    prepareEchoLyricIntervals, echoLyricIntervalAt, observeEchoLyricClock, resolveEchoLyricTemplateFrame, echoLyricFrameTime, resolveEchoOutputProfile,
    renderEchoLyricSurface: (element, value) => paints.push(value), sizeEchoLyricSurface: () => {},
    ResizeObserver: class { observe() {} disconnect() {} },
    EchoAccentPresentation: { frame: () => ({}), lyric: () => {} } };
  const render = vm.runInNewContext(component, context);
  const result = render({ contract: normalizeEchoLyricContract({ lyrics_enabled: true }),
    lines: [{ id: 'first', start: 1, end: 2, text: 'First phrase' }, { id: 'next', start: 3, end: 4, text: 'Next phrase' }],
    presentationRef, initialTime: 0, ...extra });
  const cleanup = effects.map(f => f());
  return { result, paints, surface, presentationRef, close() { cleanup.forEach(f => f?.()); } };
}
test('actual lyric component paints the requested song frame synchronously without a React state update', () => {
  const f = mount();
  assert.equal(f.paints.at(-1).line, null);
  f.presentationRef.current(1.04);
  assert.equal(f.paints.at(-1).line.id, 'first');
  assert.equal(f.surface.dataset.frame, '31');
  const count = f.paints.length;
  f.presentationRef.current(1.05); assert.equal(f.paints.length, count, 'duplicate output frame does not rebuild words');
  f.presentationRef.current(3.1); assert.equal(f.paints.at(-1).line.id, 'next');
  f.presentationRef.current(2.5); assert.equal(f.paints.at(-1).line, null, 'gap clears the visible phrase');
  f.presentationRef.current(1.1); assert.equal(f.paints.at(-1).line.id, 'first', 'reverse seek restores original timing');
  f.close(); assert.equal(f.presentationRef.current, null);
});
test('hidden and disabled lyrics cannot retain an active compositor painter', () => {
  for (const extra of [{ hidden: true }, { powerMode: 'hidden' }, { contract: normalizeEchoLyricContract({ lyrics_enabled: false }) }]) {
    const f = mount(extra); assert.equal(f.result.enabled, false); assert.equal(f.presentationRef.current, null); assert.equal(f.paints.length, 0); f.close();
  }
});
test('cleanup cannot erase a replacement lyric owner', () => {
  const f = mount(), replacement = () => {};
  f.presentationRef.current = replacement; f.close(); assert.equal(f.presentationRef.current, replacement);
});
