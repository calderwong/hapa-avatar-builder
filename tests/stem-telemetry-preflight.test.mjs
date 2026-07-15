import test from "node:test";
import assert from "node:assert/strict";
import {
  createStemTelemetryPreflightError,
  deriveRequiredStemTelemetryBindings,
  preflightStemTelemetryBundle,
  STEM_TELEMETRY_PREFLIGHT_ERROR_CODE,
  STEM_TELEMETRY_PREFLIGHT_SCHEMA,
} from "../server/stem-telemetry-preflight.mjs";

const DURATION = 10;
const FPS = 10;

function frames({ flat = false } = {}) {
  return Array.from({ length: DURATION * FPS }, (_, index) => {
    const phase = flat ? 0.25 : ((index % 17) / 16);
    return {
      t: index / FPS,
      rawRms: flat ? 0.02 : 0.01 + (phase * 0.04),
      rawPeak: flat ? 0.04 : 0.02 + (((index % 13) / 12) * 0.08),
      rms: phase,
      peak: flat ? 0.25 : ((index % 13) / 12),
      onset: flat ? 0.25 : (index % 8 === 0 ? 1 : 0),
      bands: {
        low: flat ? 0.25 : ((index % 11) / 10),
        mid: flat ? 0.25 : ((index % 7) / 6),
        high: flat ? 0.25 : ((index % 5) / 4),
      },
      silence: flat,
    };
  });
}

function stem(role, options = {}) {
  return {
    id: `stem:${role}`,
    role,
    title: role,
    status: "verified-local-analysis",
    audioPath: `/tmp/${role}.wav`,
    audioHash: "a".repeat(64),
    durationSeconds: DURATION,
    frames: frames(options),
    masterAlignmentDiagnostic: {
      version: "rms-power-reconstruction-role-shift.v2",
      analysisFps: 100,
      maximumLagSeconds: 2,
      zeroLagCorrelation: 0.72,
      bestCorrelation: 0.72,
      bestLagSeconds: 0,
      frameCount: DURATION * 100,
    },
  };
}

function bundle(stems = [stem("synth"), stem("drums")]) {
  return {
    schemaVersion: "hapa.stem-telemetry-bundle.v1",
    analysisVersion: "hapa.stem-telemetry.numpy-rfft.v1",
    truthStatus: "offline-decoded-local-stems",
    fps: FPS,
    sampleRate: 8_000,
    durationSeconds: DURATION,
    canonicalStemCount: stems.length,
    usableStemCount: stems.length,
    stems,
    masterMix: {
      role: "master",
      method: "authoritative-registry-master",
      audioPath: "/tmp/master.wav",
      audioHash: "b".repeat(64),
      durationSeconds: DURATION,
      frames: frames(),
      isolatedStemReconstructionDiagnostic: {
        available: true,
        method: "mean-of-isolated-stems",
        sampleCount: DURATION * 8_000,
        alignment: {
          version: "rms-envelope-cross-correlation.v1",
          analysisFps: 100,
          maximumLagSeconds: 2,
          zeroLagCorrelation: 0.82,
          bestCorrelation: 0.82,
          bestLagSeconds: 0,
          frameCount: DURATION * 100,
        },
      },
    },
  };
}

function graph() {
  return {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { id: "song:test", title: "Test", durationSeconds: DURATION },
    stems: {},
    tracks: [{
      id: "track-b",
      role: "visualizer",
      cards: [{
        id: "visualizer:synth",
        startSeconds: 0,
        endSeconds: DURATION,
        visualization: {
          card: {
            schemaVersion: "hapa.visualizer-card.v2",
            stemFocus: "synth",
            audioSignal: ["rms"],
            audioMap: {
              gain: { signal: "rms", depth: 0.4 },
              pulse: { signal: "beat", depth: 0.5, stemFocus: "drums" },
            },
          },
        },
        parameters: {
          visualizerMappings: {
            gain: "synth:energy",
          },
        },
      }],
    }],
  };
}

test("certifies verified, varying, full-duration telemetry for exact visualizer stem bindings", () => {
  const report = preflightStemTelemetryBundle({ telemetry: bundle(), showGraph: graph() });
  assert.equal(report.schemaVersion, STEM_TELEMETRY_PREFLIGHT_SCHEMA);
  assert.equal(report.ok, true);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.bindings.requiredRoles, ["drums", "synth"]);
  assert.ok(report.bindings.entries.some((binding) => binding.stemRole === "drums" && binding.signal === "beat"));
  assert.ok(report.bindings.entries.some((binding) => binding.stemRole === "synth" && binding.signal === "energy"));
  assert.ok(report.bindings.entries.every((binding) => binding.startSeconds === 0 && binding.endSeconds === DURATION));
  assert.equal(report.bindings.masterFallbackAllowedForIsolatedRoles, false);
  assert.equal(report.resources.find((resource) => resource.role === "synth").frameCount, DURATION * FPS);
});

test("derives executable-show mappings as well as source graph mappings", () => {
  const bindings = deriveRequiredStemTelemetryBindings({
    show: {
      instances: {
        visualizers: [{
          id: "compiled:1",
          stemFocus: "lead vocals",
          audioSignal: ["rms"],
          audioMap: { intensity: { stemFocus: "drums", signal: "peak" } },
          presentationModulation: { primarySignal: "mid", accentSignal: "onset" },
        }],
      },
    },
  });
  assert.ok(bindings.some((binding) => binding.stemRole === "drums" && binding.signal === "peak"));
  assert.ok(bindings.some((binding) => binding.stemRole === "vocals" && binding.signal === "mid"));
  assert.ok(bindings.some((binding) => binding.stemRole === "vocals" && binding.signal === "onset"));
});

test("classifies explicit transient mappings as event-driven without making injected RMS fallback mandatory", () => {
  const eventGraph = {
    song: { id: "song:event", durationSeconds: DURATION },
    tracks: [{
      id: "track-b",
      role: "visualizer",
      cards: [{
        id: "visualizer:event",
        startSeconds: 0,
        endSeconds: DURATION,
        visualization: {
          card: {
            schemaVersion: "hapa.visualizer-card.v2",
            stemFocus: "drums",
            audioSignal: ["onset"],
            audioMap: { pulse: { stemFocus: "drums", signal: "onset" } },
          },
        },
      }],
    }],
  };
  const bindings = deriveRequiredStemTelemetryBindings({ showGraph: eventGraph });
  assert.ok(bindings.length >= 3);
  assert.ok(bindings.every((binding) => binding.activityClass === "event"));
  assert.ok(bindings.some((binding) => binding.signal === "onset" && binding.variationRequired === true));
  assert.ok(bindings.some((binding) => (
    binding.signal === "rms"
    && binding.source === "show-graph.presentation.primary"
    && binding.variationRequired === false
  )));

  const continuousGraph = structuredClone(eventGraph);
  continuousGraph.tracks[0].cards[0].visualization.card.audioMap.gain = { stemFocus: "drums", signal: "rms" };
  const continuousBindings = deriveRequiredStemTelemetryBindings({ showGraph: continuousGraph });
  assert.ok(continuousBindings.some((binding) => binding.activityClass === "continuous"));
});

test("event-driven telemetry requires a real cue event but permits otherwise sparse frames", () => {
  const eventGraph = {
    song: { id: "song:event", durationSeconds: DURATION },
    tracks: [{
      id: "track-b",
      role: "visualizer",
      cards: [{
        id: "visualizer:event",
        startSeconds: 2,
        endSeconds: 8,
        visualization: {
          card: {
            schemaVersion: "hapa.visualizer-card.v2",
            stemFocus: "drums",
            audioMap: { pulse: { stemFocus: "drums", signal: "onset" } },
          },
        },
      }],
    }],
  };
  const sparseEventStem = stem("drums", { flat: true });
  sparseEventStem.frames = sparseEventStem.frames.map((frame, index) => ({
    ...frame,
    rms: 0,
    peak: index === 50 ? 1 : 0,
    onset: index === 50 ? 1 : 0,
    bands: { low: 0, mid: 0, high: 0 },
    silence: index !== 50,
  }));
  const ready = preflightStemTelemetryBundle({ telemetry: bundle([sparseEventStem]), showGraph: eventGraph });
  assert.equal(ready.ok, true, JSON.stringify(ready.findings));
  const window = ready.resources.find((resource) => resource.role === "drums").bindingWindows[0];
  assert.equal(window.activityClass, "event");
  assert.deepEqual(window.requiredSignals, ["onset"]);
  assert.equal(window.eventEvidence.onset.eventFrameCount, 1);

  const missingEventStem = structuredClone(sparseEventStem);
  for (const frame of missingEventStem.frames) {
    frame.peak = 0;
    frame.onset = 0;
  }
  const blocked = preflightStemTelemetryBundle({ telemetry: bundle([missingEventStem]), showGraph: eventGraph });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.findings.some((finding) => (
    finding.code === "stem-telemetry-event-missing"
    && finding.role === "drums"
    && finding.cueId === "visualizer:event"
  )));
});

test("rejects master fallback when an isolated visualizer role is absent", () => {
  const report = preflightStemTelemetryBundle({ telemetry: bundle([stem("drums")]), showGraph: graph() });
  assert.equal(report.ok, false);
  const missing = report.findings.find((finding) => finding.code === "visualizer-stem-role-missing");
  assert.equal(missing.role, "synth");
  assert.equal(missing.masterFallbackRejected, true);
  assert.ok(missing.affectedBindings.length > 0);
});

test("binds master telemetry to the exact playback master path and content hash", () => {
  const telemetry = bundle();
  const ready = preflightStemTelemetryBundle({
    telemetry,
    showGraph: graph(),
    expectedMasterPath: "/tmp/master.wav",
    expectedMasterSha256: `sha256:${"b".repeat(64)}`,
  });
  assert.equal(ready.ok, true);
  const detached = preflightStemTelemetryBundle({
    telemetry,
    showGraph: graph(),
    expectedMasterPath: "/tmp/other-master.wav",
    expectedMasterSha256: `sha256:${"c".repeat(64)}`,
  });
  assert.ok(detached.errors.includes("stem-telemetry-master-path-mismatch"));
  assert.ok(detached.errors.includes("stem-telemetry-master-hash-mismatch"));
});

test("accepts path aliases when the master and stem content hashes prove identical bytes", () => {
  const telemetry = bundle();
  const report = preflightStemTelemetryBundle({
    telemetry,
    showGraph: graph(),
    expectedMasterPath: "/private/tmp/master.wav",
    expectedMasterSha256: `sha256:${"b".repeat(64)}`,
    expectedStemSources: [
      { role: "synth", path: "/private/tmp/synth.wav", sha256: `sha256:${"a".repeat(64)}` },
      { role: "drums", path: "/private/tmp/drums.wav", sha256: `sha256:${"a".repeat(64)}` },
    ],
  });
  assert.equal(report.ok, true);
  assert.ok(!report.errors.includes("stem-telemetry-master-path-mismatch"));
  assert.ok(!report.errors.includes("stem-telemetry-source-path-mismatch"));
});

test("binds every required isolated role to the verified stem path and bytes", () => {
  const telemetry = bundle();
  const report = preflightStemTelemetryBundle({
    telemetry,
    showGraph: graph(),
    expectedStemSources: [
      { role: "synth", path: "/tmp/RIGHT-synth.wav", sha256: `sha256:${"d".repeat(64)}` },
      { role: "drums", path: "/tmp/drums.wav", sha256: `sha256:${"a".repeat(64)}` },
    ],
  });
  assert.equal(report.ok, false);
  assert.ok(report.errors.includes("stem-telemetry-source-path-mismatch"));
  assert.ok(report.errors.includes("stem-telemetry-source-hash-mismatch"));
});

test("rejects isolated-stem telemetry that aligns only after a material timing shift", () => {
  const telemetry = bundle();
  telemetry.masterMix.isolatedStemReconstructionDiagnostic.alignment = {
    version: "rms-envelope-cross-correlation.v1",
    analysisFps: 100,
    maximumLagSeconds: 2,
    zeroLagCorrelation: 0.05,
    bestCorrelation: 0.91,
    bestLagSeconds: 1,
    frameCount: DURATION * 100,
  };
  const report = preflightStemTelemetryBundle({ telemetry, showGraph: graph() });
  assert.equal(report.ok, false);
  assert.ok(report.errors.includes("stem-telemetry-alignment-offset"));
});

test("a well-aligned unused stem cannot mask a delayed stem that drives a visualizer", () => {
  const telemetry = bundle();
  telemetry.masterMix.isolatedStemReconstructionDiagnostic.alignment = {
    version: "rms-envelope-cross-correlation.v1",
    analysisFps: 100,
    maximumLagSeconds: 2,
    zeroLagCorrelation: 0.94,
    bestCorrelation: 0.94,
    bestLagSeconds: 0,
    frameCount: DURATION * 100,
  };
  telemetry.stems.find((entry) => entry.role === "synth").masterAlignmentDiagnostic = {
    version: "rms-power-reconstruction-role-shift.v2",
    analysisFps: 100,
    maximumLagSeconds: 2,
    zeroLagCorrelation: 0.05,
    bestCorrelation: 0.88,
    bestLagSeconds: 1,
    frameCount: DURATION * 100,
  };
  const report = preflightStemTelemetryBundle({ telemetry, showGraph: graph() });
  assert.equal(report.ok, false);
  const finding = report.findings.find((entry) => entry.code === "stem-telemetry-role-alignment-offset");
  assert.equal(finding.role, "synth");
});

test("requires an alignment proof whenever an isolated stem drives a visualizer", () => {
  const telemetry = bundle();
  delete telemetry.masterMix.isolatedStemReconstructionDiagnostic;
  const report = preflightStemTelemetryBundle({ telemetry, showGraph: graph() });
  assert.equal(report.ok, false);
  assert.ok(report.errors.includes("stem-telemetry-alignment-proof-missing"));
});

test("rejects unverified, malformed, nonmonotonic, incomplete, and non-finite telemetry", () => {
  const brokenSynth = stem("synth");
  brokenSynth.status = "missing-path";
  brokenSynth.frames[3].t = brokenSynth.frames[2].t;
  brokenSynth.frames[4].rms = Number.NaN;
  brokenSynth.frames.splice(20, 20);
  const telemetry = bundle([brokenSynth, stem("drums")]);
  telemetry.schemaVersion = "wrong";
  telemetry.usableStemCount = 2;
  telemetry.durationSeconds = 8;
  const report = preflightStemTelemetryBundle({ telemetry, showGraph: graph() });
  assert.equal(report.ok, false);
  for (const code of [
    "stem-telemetry-schema-invalid",
    "stem-telemetry-stem-unverified",
    "stem-telemetry-usable-count-mismatch",
    "stem-telemetry-bundle-duration-mismatch",
    "stem-telemetry-frames-nonmonotonic",
    "stem-telemetry-frame-gap",
    "stem-telemetry-signal-nonfinite",
    "visualizer-stem-role-missing",
  ]) assert.ok(report.errors.includes(code), code);
});

test("flat telemetry is blocked unless that exact role has an explicit allow-silent contract", () => {
  const silentBundle = bundle([stem("synth", { flat: true }), stem("drums")]);
  const blocked = preflightStemTelemetryBundle({ telemetry: silentBundle, showGraph: graph() });
  assert.equal(blocked.ok, false);
  assert.ok(blocked.findings.some((finding) => finding.code === "stem-telemetry-audio-variance-missing" && finding.role === "synth"));
  assert.ok(blocked.findings.some((finding) => finding.code === "stem-telemetry-signal-flat" && finding.role === "synth"));

  const contractedGraph = graph();
  contractedGraph.stems.signalContracts = { synth: { allowSilent: true, reason: "intentional silent performance stem" } };
  const allowed = preflightStemTelemetryBundle({ telemetry: silentBundle, showGraph: contractedGraph });
  assert.equal(allowed.ok, true);
  assert.deepEqual(allowed.allowSilentRoles, ["synth"]);
});

test("variance is scoped to each requested cue while unused finite flat stems remain structural evidence", () => {
  const scopedGraph = graph();
  const card = scopedGraph.tracks[0].cards[0];
  card.startSeconds = 4;
  card.endSeconds = 6;
  card.visualization.card.audioSignal = ["rms"];
  card.visualization.card.audioMap = {
    gain: { signal: "rms", depth: 0.4, stemFocus: "synth" },
  };
  card.parameters.visualizerMappings = { gain: "synth:rms" };

  const ready = preflightStemTelemetryBundle({
    telemetry: bundle([stem("synth"), stem("drums", { flat: true })]),
    showGraph: scopedGraph,
  });
  assert.equal(ready.ok, true);
  const unused = ready.resources.find((resource) => resource.role === "drums");
  assert.equal(unused.activeVariationScope, "structural-only");
  assert.equal(unused.signalStats.rms.finite, true);
  assert.equal(unused.signalStats.rms.varianceRange, 0);

  const quietSynth = stem("synth");
  for (const frame of quietSynth.frames) {
    if (frame.t < 4 || frame.t >= 6) continue;
    frame.rms = 0.25;
    frame.peak = 0.25;
    frame.onset = 0.25;
    frame.bands = { low: 0.25, mid: 0.25, high: 0.25 };
    frame.silence = true;
  }
  const blocked = preflightStemTelemetryBundle({
    telemetry: bundle([quietSynth, stem("drums", { flat: true })]),
    showGraph: scopedGraph,
  });
  assert.equal(blocked.ok, false);
  const cueFinding = blocked.findings.find((finding) => (
    finding.code === "stem-telemetry-audio-variance-missing"
    && finding.role === "synth"
    && finding.activityScope === "bound-cue-window"
  ));
  assert.equal(cueFinding.cueId, "visualizer:synth");
  assert.equal(cueFinding.startSeconds, 4);
  assert.equal(cueFinding.endSeconds, 6);
  assert.ok(!blocked.findings.some((finding) => finding.role === "drums" && /variance|flat/u.test(finding.code)));
});

test("produces an actionable renderer-safe structured error", () => {
  const report = preflightStemTelemetryBundle({ telemetry: bundle([stem("drums")]), showGraph: graph() });
  const error = createStemTelemetryPreflightError(report);
  assert.equal(error.name, "StemTelemetryPreflightError");
  assert.equal(error.code, STEM_TELEMETRY_PREFLIGHT_ERROR_CODE);
  assert.equal(error.statusCode, 409);
  assert.equal(error.details.stage, "stem-telemetry-preflight");
  assert.deepEqual(error.details.preflight, report);
  assert.match(error.message, /cannot safely drive/u);
});
