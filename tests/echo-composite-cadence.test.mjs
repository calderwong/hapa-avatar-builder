import test from 'node:test';
import assert from 'node:assert/strict';
import { createEchoCompositeCadence } from '../src/domain/echo-presentation-timing.js';
const base = { surface: {}, width: 1920, height: 1080, playing: true, nowMs: 0, songTime: 0 };

test('high-refresh callbacks preserve every output frame without duplicate compositing', () => {
  for (const fps of [24, 30, 60]) for (const hz of [60, 75, 120, 144]) {
    const cadence = createEchoCompositeCadence({ fps }), frames = [];
    for (let i = 0; i < hz * 5; i++) {
      const songTime = i / hz, nowMs = songTime * 1000;
      if (cadence.begin({ ...base, songTime, nowMs })) { frames.push(Math.floor(songTime * fps + 1e-7)); cadence.end(nowMs + 2); }
    }
    assert.deepEqual(frames, Array.from({ length: fps * 5 }, (_, i) => i), `${fps} fps at ${hz} Hz`);
    assert.equal(cadence.snapshot().paints, fps * 5);
    assert.equal(cadence.snapshot().duplicateCallbacks, (hz - fps) * 5);
  }
});

test('paused preparation refreshes while seeks, resize, remount and resume paint immediately', () => {
  const cadence = createEchoCompositeCadence();
  const paint = (nowMs, change = {}) => {
    const accepted = cadence.begin({ ...base, playing: false, songTime: 8, nowMs, ...change });
    if (accepted) cadence.end(nowMs + 1);
    return accepted;
  };
  assert.equal(paint(0), true);
  assert.equal(paint(10), false);
  assert.equal(paint(34), true, 'async-ready pixels are eventually painted at the same position');
  assert.equal(paint(35, { songTime: 7.999 }), true, 'subframe reverse seek is immediate');
  assert.equal(paint(36, { width: 1280 }), true);
  assert.equal(paint(37, { surface: {} }), true);
  assert.equal(paint(38, { playing: true }), true);
});

test('stalled clock refreshes held progress and transport jumps never wait for wall cadence', () => {
  const cadence = createEchoCompositeCadence();
  for (const [nowMs, songTime, expected] of [[0, 200, true], [10, 200, false], [251, 200, true], [252, 0, true], [253, 10, true], [254, .1, true]]) {
    assert.equal(cadence.begin({ ...base, nowMs, songTime }), expected);
    if (expected) cadence.end(nowMs + .1);
  }
});

test('live-jam captures and legacy animation retain callback cadence', () => {
  const cadence = createEchoCompositeCadence();
  for (let i = 0; i < 144; i++) {
    assert.equal(cadence.begin({ ...base, cadenceEnabled: false, nowMs: i, songTime: 0 }), true);
    cadence.end(i + .5);
  }
  assert.equal(cadence.snapshot().paints, 144);
});

test('whole-session work histogram stays bounded and retains slow/overflow work truth', () => {
  const cadence = createEchoCompositeCadence();
  for (let i = 0; i < 10000; i++) {
    const nowMs = i * 40;
    assert.equal(cadence.begin({ ...base, songTime: i, nowMs }), true);
    cadence.end(nowMs + (i < 9000 ? 2.4 : 3000));
  }
  const s = cadence.snapshot();
  assert.equal(s.paints, 10000); assert.equal(s.p95UpperBoundMs, null);
  assert.equal(s.overflowSamples, 1000); assert.equal(s.workOverBudget, 1000);
  assert.equal(s.histogramBytes, 2002 * 8); assert.equal(s.maximumWorkMs, 3000);
  cadence.end(1e9); assert.equal(cadence.snapshot().paints, 10000, 'unpaired completion is ignored');
});
