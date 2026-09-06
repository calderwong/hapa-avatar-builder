import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateEchoAudibleClock, measureEchoPresentedFrame, createEchoPresentationTimingRecorder, observeEchoPresentedFrames } from '../src/domain/echo-presentation-timing.js';

const audio = { currentTime: 12, playbackRate: 1, paused: false, seeking: false };
const context = { state: 'running', currentTime: 20, getOutputTimestamp: () => ({ contextTime: 19.97, performanceTime: 1000 }) };
const video = { currentTime: 7, duration: 30, seeking: false };
const shot = { media_id: 'clip', start_sec: 10, end_sec: 20, media_contract: { sourceInSeconds: 5, sourceOutSeconds: 15 } };
const metadata = { mediaTime: 7, expectedDisplayTime: 1010, presentationTime: 999, presentedFrames: 60, processingDuration: .008 };

test('presentation evidence separates decoded timestamps, output estimates, and unsupported fallback', () => {
  const measured = measureEchoPresentedFrame({ audio, context, video, shot, nowMs: 1000, metadata });
  assert.equal(measured.route, 'decoded-frame-callback');
  assert.ok(Math.abs(measured.clock.audibleSongTime - 11.98) < 1e-8);
  assert.ok(Math.abs(measured.audibleEstimateResidualMs - 20) < 1e-6);
  assert.ok(Math.abs(measured.elementResidualMs + 10) < 1e-6);
  assert.equal(measured.decodeProcessingMs, 8);
  assert.equal(measured.clock.physicallyCalibrated, false);
  const fallback = measureEchoPresentedFrame({ audio, video, shot, nowMs: 1000 });
  assert.equal(fallback.route, 'element-time-fallback');
  assert.equal(fallback.clock.status, 'element-clock-only');
  assert.equal(fallback.audibleEstimateResidualMs, null);
  for (const bad of [{ ...context, state: 'suspended' }, { ...context, getOutputTimestamp: () => ({ contextTime: 0, performanceTime: 0 }) }, { ...context, getOutputTimestamp: () => ({ contextTime: 10, performanceTime: 1 }) }]) {
    assert.equal(estimateEchoAudibleClock({ audio, context: bad, nowMs: 1000 }).audibleSongTime, null);
  }
});

test('rate-mapped source frames cannot change the song clock; paused and seeking samples are excluded', () => {
  const mapped = { ...shot, end_sec: 12 + 1 / 30, media_contract: { sourceInSeconds: 5, sourceOutSeconds: 15,
    timeMapping: { schemaVersion: 'hapa.echo.transition-time-map.v1', mode: 'fit-source-once-to-cue', sourceInSeconds: 5, sourceOutSeconds: 15,
      cueDurationSeconds: 2 + 1 / 30, cueSampleSpanSeconds: 2, outputFps: 30, playbackRate: 5, valid: true, reachesDeclaredLastFrame: true } } };
  const a = { ...audio, currentTime: 11 };
  const value = measureEchoPresentedFrame({ audio: a, context, video, shot: mapped, nowMs: 1000, metadata: { ...metadata, mediaTime: 10 } });
  assert.equal(value.sourceRate, 5);
  assert.ok(Math.abs(value.audibleEstimateResidualMs - 20) < 1e-6);
  assert.equal(a.currentTime, 11);
  for (const changed of [{ ...a, paused: true }, { ...a, seeking: true }]) {
    const sample = measureEchoPresentedFrame({ audio: changed, context, video, shot, nowMs: 1000, metadata });
    assert.equal(sample.eligible, false); assert.equal(sample.audibleEstimateResidualMs, null);
  }
});

test('presentation ring bounds retention and does not count fallback clocks as decoded evidence', () => {
  const recorder = createEchoPresentationTimingRecorder({ capacity: 16 });
  for (let i = 0; i < 100; i++) recorder.record({ eligible: true, route: 'decoded-frame-callback', audibleEstimateResidualMs: i, elementResidualMs: -i, callbackLateMs: 0 });
  const snapshot = recorder.snapshot();
  assert.equal(snapshot.retained, 16); assert.equal(snapshot.total, 100);
  assert.equal(snapshot.audibleEstimateAbsoluteResidualP95Ms, 99);
  recorder.record({ eligible: true, route: 'element-time-fallback', audibleEstimateResidualMs: 1000 });
  assert.equal(recorder.snapshot().decodedSamples, 15);
  recorder.reset(); assert.equal(recorder.snapshot().audibleEstimateAbsoluteResidualP95Ms, null);
});

test('observer cancels its own callback and cannot reschedule after release, with explicit RAF fallback', () => {
  for (const decoded of [true, false]) {
    let callback, cancelled, requests = 0;
    const request = fn => { callback = fn; return ++requests; };
    const cancel = id => { cancelled = id; };
    const activeVideo = { ...video, ...(decoded ? { requestVideoFrameCallback: request, cancelVideoFrameCallback: cancel } : {}) };
    const samples = [];
    const stop = observeEchoPresentedFrames({ video: activeVideo, getContext: () => ({ audio, context, shot }), onSample: sample => samples.push(sample), requestFrame: request, cancelFrame: cancel });
    callback(1000, metadata); assert.equal(requests, 2); assert.equal(samples.length, 1);
    assert.equal(samples[0].route, decoded ? 'decoded-frame-callback' : 'element-time-fallback');
    stop(); assert.equal(cancelled, 2); callback(1020, metadata); assert.equal(requests, 2); assert.equal(samples.length, 1);
  }
});
