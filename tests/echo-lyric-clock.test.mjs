import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareEchoLyricIntervals, echoLyricIntervalAt, observeEchoLyricClock } from '../src/domain/echo-lyric-clock.js';

test('indexed lyric selection preserves overlap precedence, gaps, aliases and immutable source intervals', () => {
  const lines = Object.freeze([
    Object.freeze({ start: 0, end: 20, text: 'sustained' }),
    Object.freeze({ startSeconds: 10, endSeconds: 12, text: 'overlap' }),
    Object.freeze({ start: 2, end: 3, text: 'out of order' }),
    Object.freeze({ start: 8, end: 7, text: 'invalid' }),
    Object.freeze({ start: 30, end: 31, text: 'last' }),
  ]);
  const index = prepareEchoLyricIntervals(lines);
  assert.equal(index.invalidIntervals, 1);
  for (const [time, row] of [[-1,null],[0,0],[2.5,2],[3,0],[10,1],[12,0],[20,null],[30,4],[31,null],[10,1]]) {
    assert.equal(echoLyricIntervalAt(index,time), row === null ? null : lines[row]);
  }
});

test('lyric clock samples audio time at output cadence, reverses on seeks, and cancels its owned callback', () => {
  let time = 0, next = 0; const queue = new Map(), frames = [];
  const tick = () => { const pending = [...queue.values()]; queue.clear(); for (const fn of pending) fn(999999); };
  const stop = observeEchoLyricClock({ getTime: () => time, fps: 30, onFrame: frame => frames.push(frame),
    requestFrame: fn => { queue.set(++next, fn); return next; }, cancelFrame: token => queue.delete(token) });
  time = .01; tick(); time = .04; tick(); time = 4; tick(); time = 1; tick(); tick();
  assert.deepEqual(frames, [0,1,120,30]);
  assert.equal(queue.size,1); stop(); assert.equal(queue.size,0); tick(); assert.equal(frames.length,4);
});

test('paused lyrics sample a direct seek once without a running animation callback', () => {
  const frames=[];
  const stop = observeEchoLyricClock({ getTime: () => 5.1, fps: 30, active: false, onFrame: value => frames.push(value), requestFrame: () => { throw Error('unexpected RAF'); } });
  assert.deepEqual(frames,[153]); stop();
});
