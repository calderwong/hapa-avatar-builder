import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  clearRenderAudioInputPreflightCache,
  loadRenderAudioInputPreflightCache,
  preflightRenderAudioInputs,
  probeAndDecodeAudioInput,
  renderDurationToleranceSeconds,
  renderAudioInputsFromShowGraph,
  validateAudioInputSignalCoverage,
  writeRenderAudioInputPreflightCache,
  RENDER_AUDIO_INPUT_CACHE_SCHEMA,
} from "../server/render-audio-input-preflight.mjs";

function fixture(t, name = "input.audio") {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-audio-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, "not-read-by-the-injected-decoder");
  return { root, filePath };
}

function metadata({ streamDuration = 12, containerDuration = 12, startTime = 0 } = {}) {
  return JSON.stringify({
    streams: [{
      index: 0,
      codec_type: "audio",
      codec_name: "pcm_s16le",
      sample_rate: "48000",
      channels: 2,
      channel_layout: "stereo",
      duration: String(streamDuration),
      start_time: String(startTime),
      time_base: "1/48000",
    }],
    format: { duration: String(containerDuration) },
  });
}

function decodedSignal({ meanVolumeDb = -18, maxVolumeDb = -1 } = {}) {
  const display = (value) => Number.isFinite(value) ? String(value) : "-inf";
  return {
    stdout: "",
    stderr: `[Parsed_volumedetect] mean_volume: ${display(meanVolumeDb)} dB\n[Parsed_volumedetect] max_volume: ${display(maxVolumeDb)} dB\n`,
  };
}

test("audio preflight uses the independent stream duration and performs a full strict decode", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const calls = [];
  const result = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 12,
    minimumToleranceSeconds: 0,
    toleranceRatio: 0,
    runCommand: async (command, args) => {
      calls.push({ command, args });
      return command === "ffprobe" ? { stdout: metadata({ streamDuration: 12, containerDuration: 999 }) } : decodedSignal();
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, "audio-input-render-ready");
  assert.equal(result.durationValidation.basis, "audio-stream-not-container");
  assert.equal(result.durationValidation.streamDurationSeconds, 12);
  assert.equal(result.durationValidation.containerDurationSeconds, 999);
  assert.equal(calls.length, 2);
  const decode = calls.find((call) => call.command === "ffmpeg");
  assert.ok(decode.args.includes("-nostdin"));
  assert.ok(decode.args.includes("-xerror"));
  assert.match(decode.args[decode.args.indexOf("-af") + 1], /silencedetect/);
  assert.deepEqual(decode.args.slice(decode.args.indexOf("-map"), decode.args.indexOf("-map") + 2), ["-map", "0:a:0"]);
  assert.equal(decode.args.includes("-t"), false, "the gate must decode the entire stream");
});

test("container duration cannot hide an audio-stream duration mismatch", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  let decodeCalls = 0;
  const result = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 10,
    minimumToleranceSeconds: 0,
    toleranceRatio: 0,
    runCommand: async (command) => {
      if (command === "ffmpeg") decodeCalls += 1;
      return command === "ffprobe" ? { stdout: metadata({ streamDuration: 7, containerDuration: 10 }) } : decodedSignal();
    },
  });

  assert.equal(decodeCalls, 1, "duration failures still receive a complete corruption check");
  assert.equal(result.ok, false);
  assert.equal(result.code, "audio-input-duration-mismatch");
  assert.equal(result.durationValidation.streamDurationSeconds, 7);
  assert.equal(result.durationValidation.containerDurationSeconds, 10);
});

test("a duration-correct stream with shifted timestamps cannot certify synchronized playback", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const result = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 12,
    runCommand: async (command) => command === "ffprobe"
      ? { stdout: metadata({ startTime: 2.978 }) }
      : decodedSignal(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "audio-input-start-time-mismatch");
  assert.equal(result.durationValidation.startTimeSeconds, 2.978);
});

test("default input duration tolerance matches final release QA and stays bounded", async (t) => {
  assert.ok(Math.abs(renderDurationToleranceSeconds(296.12) - 0.7403) < 1e-9);
  assert.equal(renderDurationToleranceSeconds(10), 0.15);
  assert.equal(renderDurationToleranceSeconds(1_000), 1);

  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const result = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 296.12,
    runCommand: async (command) => command === "ffprobe"
      ? { stdout: metadata({ streamDuration: 291.12, containerDuration: 296.12 }) }
      : decodedSignal(),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "audio-input-duration-mismatch");
  assert.ok(Math.abs(result.durationValidation.toleranceSeconds - 0.7403) < 1e-9);
});

test("a full-length silent input cannot certify music-reactive rendering", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const result = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 12,
    runCommand: async (command) => command === "ffprobe"
      ? { stdout: metadata() }
      : decodedSignal({ meanVolumeDb: Number.NEGATIVE_INFINITY, maxVolumeDb: Number.NEGATIVE_INFINITY }),
  });
  assert.equal(result.ok, false);
  assert.equal(result.code, "audio-input-silent");
  assert.equal(result.audio.signal.nonSilent, false);
});

test("a click followed by near-total silence fails active-audio coverage unless the exact stem is contracted silent", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const sparseSignal = {
    stdout: "",
    stderr: [
      "silence_start: 0.01",
      "silence_duration: 11.99",
      "silence_end: 12",
      "mean_volume: -30 dB",
      "max_volume: 0 dB",
    ].join("\n"),
  };
  const runCommand = async (command) => command === "ffprobe"
    ? { stdout: metadata() }
    : sparseSignal;
  const blocked = await probeAndDecodeAudioInput(filePath, { expectedDurationSeconds: 12, runCommand });
  assert.equal(blocked.ok, false);
  assert.equal(blocked.code, "audio-input-active-coverage-insufficient");
  assert.ok(blocked.audio.signal.activeSeconds < 0.02);

  const contracted = await probeAndDecodeAudioInput(filePath, { expectedDurationSeconds: 12, allowSilent: true, runCommand });
  assert.equal(contracted.ok, true);
  assert.equal(contracted.signalContract.allowSilent, true);
});

test("failed decode evidence is never cached or persisted", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { root, filePath } = fixture(t);
  const cachePath = path.join(root, "audio-cache.json");
  let probeCalls = 0;
  let decodeCalls = 0;
  const runCommand = async (command) => {
    if (command === "ffprobe") {
      probeCalls += 1;
      return { stdout: metadata() };
    }
    decodeCalls += 1;
    const error = new Error("corrupt packet at the end of the file");
    error.stderr = "decoder: invalid data";
    throw error;
  };

  const first = await probeAndDecodeAudioInput(filePath, { runCommand });
  const second = await probeAndDecodeAudioInput(filePath, { runCommand });
  assert.equal(first.code, "audio-input-full-decode-failed");
  assert.equal(second.code, "audio-input-full-decode-failed");
  assert.equal(probeCalls, 2);
  assert.equal(decodeCalls, 2);
  assert.equal(writeRenderAudioInputPreflightCache(cachePath).written, 0);
  assert.deepEqual(JSON.parse(fs.readFileSync(cachePath, "utf8")).entries, []);
});

test("signal-contract failures are re-evaluated from structural evidence without poisoning a later scope", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const invocationFailures = new Map();
  let commandCalls = 0;
  const runCommand = async (command) => {
    commandCalls += 1;
    if (command === "ffprobe") return { stdout: metadata() };
    return decodedSignal({ meanVolumeDb: Number.NEGATIVE_INFINITY, maxVolumeDb: Number.NEGATIVE_INFINITY });
  };
  const first = await probeAndDecodeAudioInput(filePath, { runCommand, failureCache: invocationFailures });
  const sameSweep = await probeAndDecodeAudioInput(filePath, { runCommand, failureCache: invocationFailures });
  assert.equal(first.ok, false);
  assert.equal(sameSweep.ok, false);
  assert.equal(commandCalls, 4, "caller-injected structural evidence is never cached as a scoped signal failure");

  const unused = await probeAndDecodeAudioInput(filePath, {
    runCommand,
    failureCache: invocationFailures,
    activeCoverageRequired: false,
    activityReason: "unused-by-selected-cut",
  });
  assert.equal(unused.ok, true);
  assert.equal(unused.signalContract.scope, "structural-only");
  assert.equal(commandCalls, 6);
});

test("canceling one audio verification cannot cancel a concurrent candidate using the same file", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const firstController = new AbortController();
  const secondController = new AbortController();
  let firstProbeStarted;
  const started = new Promise((resolve) => { firstProbeStarted = resolve; });
  const runCommand = async (command, _args, options = {}) => {
    if (command === "ffprobe") {
      if (options.signal === firstController.signal) {
        firstProbeStarted();
        await new Promise((resolve, reject) => {
          options.signal.addEventListener("abort", () => reject(Object.assign(new Error("first canceled"), { name: "AbortError" })), { once: true });
        });
      }
      return { stdout: metadata() };
    }
    return decodedSignal();
  };

  const canceled = probeAndDecodeAudioInput(filePath, { signal: firstController.signal, runCommand });
  await started;
  const independent = probeAndDecodeAudioInput(filePath, { signal: secondController.signal, runCommand });
  firstController.abort();
  await assert.rejects(canceled, (error) => error?.name === "AbortError");
  assert.equal((await independent).ok, true);
});

test("caller-injected decoder evidence cannot enter or reuse the authoritative cache", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { root, filePath } = fixture(t);
  const cachePath = path.join(root, "audio-cache.json");
  let commandCalls = 0;
  const runCommand = async (command) => {
    commandCalls += 1;
    return command === "ffprobe" ? { stdout: metadata({ streamDuration: 5, containerDuration: 5 }) } : decodedSignal();
  };

  const first = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 5,
    minimumToleranceSeconds: 0,
    toleranceRatio: 0,
    runCommand,
  });
  const second = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 7,
    minimumToleranceSeconds: 0,
    toleranceRatio: 0,
    runCommand,
  });
  assert.equal(first.ok, true);
  assert.equal(second.code, "audio-input-duration-mismatch");
  assert.equal(commandCalls, 4, "custom decoder evidence is rechecked and never promoted");
  assert.equal(writeRenderAudioInputPreflightCache(cachePath).written, 0);

  clearRenderAudioInputPreflightCache();
  assert.equal(loadRenderAudioInputPreflightCache(cachePath).loaded, 0);
  const persisted = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 5,
    minimumToleranceSeconds: 0,
    toleranceRatio: 0,
    runCommand,
  });
  assert.equal(persisted.ok, true);
  assert.notEqual(persisted.cache.origin, "persistent-cache");
  assert.equal(commandCalls, 6);

  fs.appendFileSync(filePath, "changed");
  const changed = await probeAndDecodeAudioInput(filePath, {
    expectedDurationSeconds: 5,
    minimumToleranceSeconds: 0,
    toleranceRatio: 0,
    runCommand,
  });
  assert.equal(changed.ok, true);
  assert.equal(changed.cache.hit, false);
  assert.equal(commandCalls, 8, "a changed stat identity forces both checks to run again");
});

test("a forged persistent cache row cannot certify arbitrary bytes", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { root, filePath } = fixture(t);
  const cachePath = path.join(root, "forged-audio-cache.json");
  fs.writeFileSync(cachePath, JSON.stringify({
    schemaVersion: RENDER_AUDIO_INPUT_CACHE_SCHEMA,
    entries: [{
      key: "forged",
      evidence: {
        schemaVersion: "totally-forged",
        ok: true,
        path: filePath,
        tools: { ffprobe: "imaginary", ffmpeg: "imaginary" },
        decode: { fullAudioDecode: true, xerror: true, nostdin: true },
        audio: { signal: { nonSilent: true } },
        checks: [],
      },
    }],
  }));
  assert.deepEqual(loadRenderAudioInputPreflightCache(cachePath), { loaded: 0, rejected: 1, path: cachePath });
});

test("master and stem inputs share one aggregate contract and ignore archive-only lineage", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { root, filePath } = fixture(t);
  const stemPath = path.join(root, "stem.wav");
  fs.copyFileSync(filePath, stemPath);
  fs.appendFileSync(stemPath, "distinct-stem-bytes");
  const collected = renderAudioInputsFromShowGraph({
    masterPath: filePath,
    showGraph: {
      stems: {
        items: [
          { id: "stem:vocals", stemType: "vocals", audioPath: stemPath },
          { id: "stem:archive", stemType: "Archive ZIP" },
        ],
      },
    },
  });
  let commandCalls = 0;
  const report = await preflightRenderAudioInputs({
    ...collected,
    expectedDurationSeconds: 12,
  }, {
    concurrency: 2,
    minimumToleranceSeconds: 0,
    toleranceRatio: 0,
    runCommand: async (command) => {
      commandCalls += 1;
      return command === "ffprobe" ? { stdout: metadata() } : decodedSignal();
    },
  });

  assert.equal(report.ok, true);
  assert.equal(report.declaredInputCount, 2);
  assert.equal(report.uniqueInputCount, 2);
  assert.equal(report.verifiedUniqueInputCount, 2);
  assert.equal(report.ignoredInputCount, 1);
  assert.equal(report.ignoredInputs[0].reason, "non-audio-archive-lineage");
  assert.equal(commandCalls, 4);
});

test("unused sparse stems stay structural-only while a stem silent inside its requested cue is blocked", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { root, filePath: masterPath } = fixture(t, "master.wav");
  const unusedPath = path.join(root, "unused-percussion.wav");
  const boundPath = path.join(root, "bound-strings.wav");
  fs.writeFileSync(unusedPath, "distinct-unused-stem-bytes");
  fs.writeFileSync(boundPath, "distinct-bound-stem-bytes");
  const showGraph = {
    stems: {
      items: [
        { id: "stem:percussion", stemType: "percussion", audioPath: unusedPath },
        { id: "stem:strings", stemType: "strings", audioPath: boundPath },
      ],
    },
  };
  const collected = renderAudioInputsFromShowGraph({
    masterPath,
    showGraph,
    stemTelemetryBindings: [{
      stemRole: "strings",
      signal: "rms",
      cueId: "card:b:6",
      startSeconds: 4,
      endSeconds: 8,
    }],
  });
  const report = await preflightRenderAudioInputs({
    ...collected,
    expectedDurationSeconds: 12,
  }, {
    runCommand: async (command, args) => {
      if (command === "ffprobe") return { stdout: metadata() };
      const sourcePath = args[args.indexOf("-i") + 1];
      if (sourcePath === unusedPath) {
        return {
          stdout: "",
          stderr: [
            "silence_start: 0.01",
            "silence_duration: 11.99",
            "silence_end: 12",
            "mean_volume: -30 dB",
            "max_volume: 0 dB",
          ].join("\n"),
        };
      }
      if (sourcePath === boundPath) {
        return {
          stdout: "",
          stderr: [
            "silence_start: 4",
            "silence_duration: 4",
            "silence_end: 8",
            "mean_volume: -24 dB",
            "max_volume: -2 dB",
          ].join("\n"),
        };
      }
      return decodedSignal();
    },
  });

  assert.equal(report.ok, false);
  const unused = report.entries.find((entry) => entry.role === "percussion");
  const bound = report.entries.find((entry) => entry.role === "strings");
  assert.equal(unused.ok, true);
  assert.equal(unused.signalContract.scope, "structural-only");
  assert.equal(unused.audio.signal.activeCoverageSufficient, false);
  assert.equal(bound.ok, false);
  assert.equal(bound.code, "audio-input-bound-window-activity-insufficient");
  assert.equal(bound.signalContract.insufficientActivityWindows[0].cueId, "card:b:6");
  assert.equal(bound.signalContract.insufficientActivityWindows[0].activeSeconds, 0);
});

test("event-only cue windows accept a real transient while continuous controls keep a sparse activity floor", () => {
  const collected = renderAudioInputsFromShowGraph({
    masterPath: "/tmp/master.wav",
    showGraph: { stems: { items: [{ id: "stem:drums", stemType: "drums", audioPath: "/tmp/drums.wav" }] } },
    stemTelemetryBindings: [{
      stemRole: "drums",
      signal: "onset",
      cueId: "cue:onset-only",
      source: "show-graph.audio-map",
      startSeconds: 0,
      endSeconds: 20,
      activityClass: "event",
    }],
  });
  const collectedWindow = collected.inputs.find((input) => input.role === "drums").activityWindows[0];
  assert.equal(collectedWindow.activityClass, "event");
  assert.deepEqual(collectedWindow.bindingSources, ["show-graph.audio-map"]);

  const evidence = {
    ok: true,
    audio: {
      signal: {
        measured: true,
        activeCoverageMeasured: true,
        nonSilent: true,
        silenceSpans: [
          { startSeconds: 0, endSeconds: 10, durationSeconds: 10 },
          { startSeconds: 10.05, endSeconds: 20, durationSeconds: 9.95 },
        ],
      },
    },
  };
  const event = validateAudioInputSignalCoverage(evidence, {
    activityWindows: [{
      cueId: "cue:onset-only",
      startSeconds: 0,
      endSeconds: 20,
      signals: ["beat", "onset"],
      activityClass: "event",
      bindingSources: ["show-graph.audio-map"],
    }],
  });
  assert.equal(event.ok, true);
  assert.equal(event.signalContract.activityWindows[0].activityRule, "event-present");
  assert.ok(Math.abs(event.signalContract.activityWindows[0].activeSeconds - 0.05) < 1e-6);
  assert.equal(event.signalContract.activityWindows[0].minimumActiveSeconds, 0);

  const continuous = validateAudioInputSignalCoverage(evidence, {
    activityWindows: [{
      cueId: "cue:rms",
      startSeconds: 0,
      endSeconds: 20,
      signals: ["rms"],
      activityClass: "continuous",
    }],
  });
  assert.equal(continuous.ok, false);
  assert.equal(continuous.code, "audio-input-bound-window-activity-insufficient");
  assert.equal(continuous.signalContract.insufficientActivityWindows[0].activityRule, "sparse-continuous-floor");
  assert.equal(continuous.signalContract.insufficientActivityWindows[0].minimumActiveSeconds, 0.1);

  const silentEvent = validateAudioInputSignalCoverage({
    ...evidence,
    audio: {
      signal: {
        ...evidence.audio.signal,
        nonSilent: false,
        silenceSpans: [{ startSeconds: 0, endSeconds: 20, durationSeconds: 20 }],
      },
    },
  }, {
    activityWindows: [{ cueId: "cue:silent-onset", startSeconds: 0, endSeconds: 20, signals: ["onset"], activityClass: "event" }],
  });
  assert.equal(silentEvent.ok, false);
  assert.equal(silentEvent.signalContract.insufficientActivityWindows[0].activeSeconds, 0);
});

test("sparse continuous thresholds still reject the known detached Bok Bok cue activity levels", () => {
  const scopedEvidence = (durationSeconds, activeSeconds) => ({
    ok: true,
    audio: {
      signal: {
        measured: true,
        activeCoverageMeasured: true,
        nonSilent: true,
        silenceSpans: [{
          startSeconds: activeSeconds,
          endSeconds: durationSeconds,
          durationSeconds: durationSeconds - activeSeconds,
        }],
      },
    },
  });
  for (const fixture of [
    { cueId: "card:b:0", role: "synth", durationSeconds: 16, activeSeconds: 0.024, minimumActiveSeconds: 0.08 },
    { cueId: "card:b:6", role: "strings", durationSeconds: 22, activeSeconds: 0.041, minimumActiveSeconds: 0.1 },
  ]) {
    const result = validateAudioInputSignalCoverage(scopedEvidence(fixture.durationSeconds, fixture.activeSeconds), {
      activityWindows: [{
        cueId: fixture.cueId,
        startSeconds: 0,
        endSeconds: fixture.durationSeconds,
        signals: ["rms"],
        activityClass: "continuous",
      }],
    });
    assert.equal(result.ok, false, `${fixture.role} must remain blocked`);
    const window = result.signalContract.insufficientActivityWindows[0];
    assert.ok(Math.abs(window.activeSeconds - fixture.activeSeconds) < 1e-6);
    assert.ok(Math.abs(window.minimumActiveSeconds - fixture.minimumActiveSeconds) < 1e-9);
  }
});

test("distinct stem roles cannot silently collapse onto one audio source without an explicit alias contract", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const probe = async (command) => command === "ffprobe" ? { stdout: metadata() } : decodedSignal();
  const collapsed = await preflightRenderAudioInputs({
    expectedDurationSeconds: 12,
    inputs: [
      { id: "master", role: "master", kind: "master", path: filePath },
      { id: "vocals", role: "vocals", kind: "stem", path: filePath },
      { id: "drums", role: "drums", kind: "stem", path: filePath },
    ],
  }, { runCommand: probe });
  assert.equal(collapsed.ok, false);
  assert.equal(collapsed.sharedSourceFailureCount, 1);
  assert.deepEqual(collapsed.failures.at(-1).roles, ["master", "vocals", "drums"]);

  const contracted = await preflightRenderAudioInputs({
    expectedDurationSeconds: 12,
    inputs: [
      { id: "left", role: "left", kind: "stem", path: filePath, allowSharedSource: true, sharedSourceGroup: "intentional-pair" },
      { id: "right", role: "right", kind: "stem", path: filePath, allowSharedSource: true, sharedSourceGroup: "intentional-pair" },
    ],
  }, { runCommand: probe });
  assert.equal(contracted.ok, true);
});

test("byte-identical stem copies are treated as one source even when their paths and inodes differ", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { root, filePath } = fixture(t);
  const copiedPath = path.join(root, "copied-stem.wav");
  fs.copyFileSync(filePath, copiedPath);
  const report = await preflightRenderAudioInputs({
    expectedDurationSeconds: 12,
    inputs: [
      { id: "vocals", role: "vocals", kind: "stem", path: filePath },
      { id: "drums", role: "drums", kind: "stem", path: copiedPath },
    ],
  }, {
    runCommand: async (command) => command === "ffprobe" ? { stdout: metadata() } : decodedSignal(),
  });
  assert.equal(report.ok, false);
  assert.equal(report.failures.at(-1).code, "audio-input-distinct-stems-share-source");
  assert.match(report.failures.at(-1).sourceIdentity, /^content:sha256:/u);
});

test("aggregate certification fails closed when the show duration is missing", async (t) => {
  clearRenderAudioInputPreflightCache();
  const { filePath } = fixture(t);
  const report = await preflightRenderAudioInputs({
    inputs: [{ id: "master", kind: "master", path: filePath }],
  }, {
    runCommand: async (command) => command === "ffprobe" ? { stdout: metadata() } : decodedSignal(),
  });
  assert.equal(report.ok, false);
  assert.equal(report.failures[0].code, "audio-input-expected-duration-missing");
});

test("the real decoder accepts a complete audio file and stem telemetry uses the same strict flags", async (t) => {
  const available = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
    && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;
  if (!available) return t.skip("ffmpeg and ffprobe are not installed");
  clearRenderAudioInputPreflightCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-real-audio-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const audioPath = path.join(root, "tone.wav");
  const generated = spawnSync("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-y",
    "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=0.3",
    "-c:a", "pcm_s16le", audioPath,
  ], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);

  const result = await probeAndDecodeAudioInput(audioPath, {
    expectedDurationSeconds: 0.3,
    minimumToleranceSeconds: 0.02,
    toleranceRatio: 0,
  });
  assert.equal(result.ok, true);
  assert.equal(result.decode.fullAudioDecode, true);
  assert.match(result.contentSha256, /^sha256:[a-f0-9]{64}$/u);

  const cachePath = path.join(root, "trusted-cache.json");
  assert.equal(writeRenderAudioInputPreflightCache(cachePath).written, 1);
  clearRenderAudioInputPreflightCache();
  assert.equal(loadRenderAudioInputPreflightCache(cachePath).loaded, 1);
  const reused = await probeAndDecodeAudioInput(audioPath, { expectedDurationSeconds: 0.3, signal: new AbortController().signal });
  assert.equal(reused.ok, true);
  assert.equal(reused.cache.origin, "persistent-cache");

  const telemetrySource = fs.readFileSync(path.resolve("scripts/build-stem-telemetry-bundle.py"), "utf8");
  assert.match(telemetrySource, /"ffmpeg", "-nostdin", "-v", "error", "-xerror"/u);
});

test("cached silent structural evidence is safely re-evaluated for each cut binding contract", async (t) => {
  const available = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0
    && spawnSync("ffprobe", ["-version"], { stdio: "ignore" }).status === 0;
  if (!available) return t.skip("ffmpeg and ffprobe are not installed");
  clearRenderAudioInputPreflightCache();
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hapa-silent-audio-preflight-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const audioPath = path.join(root, "silent.wav");
  const cachePath = path.join(root, "silent-cache.json");
  const generated = spawnSync("ffmpeg", [
    "-hide_banner", "-nostdin", "-v", "error", "-xerror", "-y",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=mono:sample_rate=48000:d=0.3",
    "-c:a", "pcm_s16le", audioPath,
  ], { encoding: "utf8" });
  assert.equal(generated.status, 0, generated.stderr);

  const structural = await probeAndDecodeAudioInput(audioPath, {
    expectedDurationSeconds: 0.3,
    minimumToleranceSeconds: 0.02,
    toleranceRatio: 0,
    activeCoverageRequired: false,
    activityReason: "unused-by-selected-cut",
  });
  assert.equal(structural.ok, true);
  assert.equal(structural.signalContract.scope, "structural-only");
  assert.equal(writeRenderAudioInputPreflightCache(cachePath).written, 1);

  clearRenderAudioInputPreflightCache();
  assert.equal(loadRenderAudioInputPreflightCache(cachePath).loaded, 1);
  const bound = await probeAndDecodeAudioInput(audioPath, { expectedDurationSeconds: 0.3 });
  assert.equal(bound.ok, false);
  assert.equal(bound.code, "audio-input-silent");
  assert.equal(bound.cache.origin, "persistent-cache");
  const unused = await probeAndDecodeAudioInput(audioPath, { expectedDurationSeconds: 0.3, activeCoverageRequired: false });
  assert.equal(unused.ok, true);
  assert.equal(unused.cache.origin, "persistent-cache");
});
