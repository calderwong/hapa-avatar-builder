import assert from "node:assert/strict";
import test from "node:test";
import {
  createEchoLiveSignalTracker,
  echoStemDecoderRetryDue,
  evaluateEchoStemTransportHealth,
  nextEchoStemDecoderRetryState,
  resolveEchoExpectedActivityEvidence,
} from "../src/domain/echo-live-signal-transport.js";

function analyserFixture({ silent = false, low = 220, mid = 120, high = 40 } = {}) {
  return {
    context: { sampleRate: 48_000 },
    frequencyBinCount: 256,
    getByteFrequencyData(target) {
      target.fill(0);
      if (silent) return;
      // 48 kHz / 512 FFT = 93.75 Hz per bin. These bins therefore match
      // the offline 20-250, 250-2000, and 2000-Nyquist boundaries.
      target.fill(low, 1, 3);
      target.fill(mid, 3, 22);
      target.fill(high, 22);
    },
    getByteTimeDomainData(target) {
      target.fill(128);
      if (silent) return;
      for (let index = 0; index < target.length; index += 1) target[index] = index % 2 ? 152 : 104;
    },
  };
}

function readyResource(analyser, overrides = {}) {
  return {
    status: "ready",
    analyser,
    context: { state: "running" },
    sourceGeneration: 3,
    readyGeneration: 3,
    targetUri: "http://127.0.0.1/stem.mp3",
    readyUri: "http://127.0.0.1/stem.mp3",
    element: { readyState: 4, seeking: false, paused: false, currentTime: 12 },
    ...overrides,
  };
}

test("live Preview signals use offline frequency bands and derived-signal semantics", () => {
  const tracker = createEchoLiveSignalTracker();
  const analyser = analyserFixture();
  const first = tracker.sample(analyser, 2, { observedAtSeconds: 10 });
  const second = tracker.sample(analyser, 2.1, { observedAtSeconds: 10.1 });
  assert.ok(first.rawBands.low > first.rawBands.mid);
  assert.ok(first.rawBands.mid > first.rawBands.high);
  assert.equal(first.onset, 0, "offline telemetry defines the first onset delta as zero");
  assert.equal(second.beat, second.onset, "beat is the shared onset alias");
  assert.equal(second.truthStatus, "live-analyser-vocabulary-aligned");
  assert.equal(second.energy, Number((second.rms * 0.55 + second.low * 0.2 + second.mid * 0.15 + second.high * 0.1).toFixed(9)));
  assert.ok(second.palette >= 0 && second.palette <= 1);
  assert.ok(second.orbit >= 0 && second.orbit <= 1);
});

test("transport rejects stale, under-ready, seeking, and drifted decoders while warming remains diagnostic", () => {
  const tracker = createEchoLiveSignalTracker();
  const analyser = analyserFixture();
  const stemFrame = tracker.sample(analyser, 12, { observedAtSeconds: 1 });
  const masterFrame = { rawRms: 0.2, rawPeak: 0.4, signalHealth: { currentActive: true } };
  const base = readyResource(analyser);
  const cases = [
    ["stem-decoder-stale-generation", { readyGeneration: 2 }],
    ["stem-decoder-stale-uri", { readyUri: "http://127.0.0.1/old.mp3" }],
    ["stem-decoder-frame-not-ready", { element: { ...base.element, readyState: 1 } }],
    ["stem-decoder-seeking", { element: { ...base.element, seeking: true } }],
    ["stem-decoder-clock-drift", { element: { ...base.element, currentTime: 11.5 } }],
  ];
  for (const [reason, overrides] of cases) {
    const result = evaluateEchoStemTransportHealth(readyResource(analyser, overrides), {
      playing: true,
      targetTimeSeconds: 12,
      stemFrame,
      masterFrame,
    });
    assert.equal(result.usable, false, reason);
    assert.equal(result.reason, reason);
  }
  const warming = evaluateEchoStemTransportHealth(base, { playing: true, targetTimeSeconds: 12, stemFrame, masterFrame });
  assert.equal(warming.usable, true);
  assert.equal(warming.reason, "");
  assert.equal(warming.diagnostic, "stem-analyser-health-warming");
});

test("rolling zero-signal is diagnostic unless bounded offline evidence expects activity at this timestamp", () => {
  const tracker = createEchoLiveSignalTracker();
  const analyser = analyserFixture({ silent: true });
  let frame;
  for (const observedAtSeconds of [1, 1.05, 1.1, 1.2]) frame = tracker.sample(analyser, 12, { observedAtSeconds });
  assert.equal(frame.signalHealth.warm, true);
  assert.equal(frame.signalHealth.stalled, true);
  const resource = readyResource(analyser);
  const masterFrame = { rawRms: 0.2, rawPeak: 0.4, signalHealth: { currentActive: true } };
  const rest = evaluateEchoStemTransportHealth(resource, {
    playing: true,
    targetTimeSeconds: 12,
    stemFrame: frame,
    masterFrame,
    expectedActivity: true,
  });
  assert.equal(rest.usable, true, "a generic activity hint may not turn a real musical rest into a fallback");
  assert.equal(rest.diagnostic, "stem-analyser-sub-floor-diagnostic");
  const unrelatedEvidence = evaluateEchoStemTransportHealth(resource, {
    playing: true,
    targetTimeSeconds: 12,
    stemFrame: frame,
    masterFrame,
    expectedActivityEvidence: { source: "offline-stem-telemetry", expectedActive: true, startSeconds: 13, endSeconds: 14 },
  });
  assert.equal(unrelatedEvidence.usable, true);
  const stalled = evaluateEchoStemTransportHealth(resource, {
    playing: true,
    targetTimeSeconds: 12,
    stemFrame: frame,
    masterFrame,
    expectedActivityEvidence: { source: "offline-stem-telemetry", expectedActive: true, startSeconds: 11.9, endSeconds: 12.1 },
  });
  assert.equal(stalled.usable, false);
  assert.equal(stalled.reason, "stem-analyser-stalled-zero-signal");
  const intentional = evaluateEchoStemTransportHealth(resource, {
    playing: true,
    targetTimeSeconds: 12,
    stemFrame: frame,
    masterFrame,
    allowSilent: true,
    expectedActivityEvidence: { source: "offline-stem-telemetry", expectedActive: true, startSeconds: 11.9, endSeconds: 12.1 },
  });
  assert.equal(intentional.usable, true);
  assert.equal(intentional.allowSilent, true);
});

test("expected-activity evidence must be offline, active, and time-bounded", () => {
  assert.equal(resolveEchoExpectedActivityEvidence({ source: "live-analyser", expectedActive: true, startSeconds: 1, endSeconds: 2 }, 1.5), null);
  assert.equal(resolveEchoExpectedActivityEvidence({ source: "offline-stem-telemetry", expectedActive: false, startSeconds: 1, endSeconds: 2 }, 1.5), null);
  assert.equal(resolveEchoExpectedActivityEvidence({ source: "offline-stem-telemetry", expectedActive: true }, 1.5), null);
  assert.equal(resolveEchoExpectedActivityEvidence({ source: "offline-stem-telemetry", expectedActive: true, startSeconds: 1, endSeconds: 2 }, 2), null);
  assert.deepEqual(resolveEchoExpectedActivityEvidence({ source: "offline-stem-telemetry", expectedActive: true, timestampSeconds: 1.5, frameDurationSeconds: 0.2 }, 1.5), {
    source: "offline-stem-telemetry",
    expectedActive: true,
    timestampSeconds: 1.5,
    frameDurationSeconds: 0.2,
    matchedStartSeconds: 1.4,
    matchedEndSeconds: 1.6,
  });
});

test("decoder retry uses bounded exponential backoff and stops after the cap", () => {
  let state = nextEchoStemDecoderRetryState({}, 1_000);
  assert.deepEqual(state, { failureCount: 1, retryDelayMs: 500, nextRetryAtMs: 1_500, retryExhausted: false });
  assert.equal(echoStemDecoderRetryDue(state, 1_499), false);
  assert.equal(echoStemDecoderRetryDue(state, 1_500), true);
  state = nextEchoStemDecoderRetryState(state, 1_500);
  assert.equal(state.retryDelayMs, 1_000);
  assert.equal(state.nextRetryAtMs, 2_500);
  state = nextEchoStemDecoderRetryState(state, 2_500);
  assert.equal(state.retryDelayMs, 2_000);
  state = nextEchoStemDecoderRetryState(state, 4_500);
  assert.equal(state.retryDelayMs, 4_000);
  state = nextEchoStemDecoderRetryState(state, 8_500);
  assert.equal(state.failureCount, 5);
  assert.equal(state.retryExhausted, true);
  assert.equal(state.nextRetryAtMs, null);
  assert.equal(echoStemDecoderRetryDue(state, Number.MAX_SAFE_INTEGER), false);
});

test("rolling health rejects a detached analyser noise floor instead of requiring exact zeros", () => {
  const tracker = createEchoLiveSignalTracker();
  const analyser = analyserFixture({ silent: true });
  analyser.getFloatFrequencyData = (target) => target.fill(-80);
  let frame;
  for (const observedAtSeconds of [1, 1.05, 1.1, 1.2]) frame = tracker.sample(analyser, 12, { observedAtSeconds });
  assert.equal(frame.signalHealth.exactZeroRatio, 0, "the synthetic decoder emits a non-zero FFT noise floor");
  assert.equal(frame.signalHealth.rawActiveRatio, 0);
  assert.equal(frame.signalHealth.stalled, true, "the activity-floor watchdog must still reject the detached decoder");
});

test("a synchronized decoder with a warmed live signal is admitted", () => {
  const tracker = createEchoLiveSignalTracker();
  const analyser = analyserFixture();
  let frame;
  for (const observedAtSeconds of [1, 1.05, 1.1, 1.2]) frame = tracker.sample(analyser, 12, { observedAtSeconds });
  const result = evaluateEchoStemTransportHealth(readyResource(analyser), {
    playing: true,
    targetTimeSeconds: 12.08,
    stemFrame: frame,
    masterFrame: { rawRms: 0.2, rawPeak: 0.4, signalHealth: { currentActive: true } },
  });
  assert.equal(result.usable, true);
  assert.ok(result.clockDriftSeconds <= 0.12);
});
