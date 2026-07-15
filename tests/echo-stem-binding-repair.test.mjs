import test from "node:test";
import assert from "node:assert/strict";
import {
  declaredEchoStemRolesForWindow,
  repairEchoShowGraphStemBindings,
  selectEchoActiveStemBinding,
} from "../src/domain/echo-stem-binding-repair.js";
import { buildDirectorV2Artifacts } from "../src/domain/echo-director-v2.js";
import { compileHyperFramesShow } from "../src/domain/hyperframes-show-compiler.js";
import { deriveRequiredStemTelemetryBindings } from "../server/stem-telemetry-preflight.mjs";

function frames(start, end, { rms = 0, peak = rms, onsetEvery = 0 } = {}) {
  return Array.from({ length: Math.round((end - start) * 10) }, (_, index) => ({
    t: Number((start + index / 10).toFixed(1)),
    rawRms: rms * (1 + ((index % 7) * 0.03)),
    rawPeak: peak * (1 + ((index % 5) * 0.04)),
    rms: rms > 0 ? 0.25 + ((index % 7) * 0.04) : 0,
    peak: peak > 0 ? 0.3 + ((index % 5) * 0.05) : 0,
    onset: onsetEvery > 0 && index % onsetEvery === 0 ? 0.8 : 0,
    bands: {
      low: rms > 0 ? 0.2 + ((index % 3) * 0.06) : 0,
      mid: rms > 0 ? 0.3 + ((index % 5) * 0.04) : 0,
      high: rms > 0 ? 0.4 + ((index % 7) * 0.03) : 0,
    },
  }));
}

function fixtureHash(value) {
  const hex = Buffer.from(String(value)).toString("hex") || "00";
  return (hex.repeat(Math.ceil(64 / hex.length))).slice(0, 64);
}

function resource(role, cueFrames, index = 0) {
  const durationSeconds = cueFrames.length ? Number((cueFrames.at(-1).t + 0.1).toFixed(3)) : 0;
  return {
    id: `stem:${role}`,
    role,
    status: "verified-local-analysis",
    audioPath: `/tmp/${role}.mp3`,
    audioHash: fixtureHash(`audio:${role}:${index}`),
    pathHash: fixtureHash(`path:${role}:${index}`),
    durationSeconds,
    frames: cueFrames,
    normalization: { rmsP99: 1, peakP99: 1 },
    sourceLineage: [{ id: `registry:${index}` }],
  };
}

function telemetry(stems, masterFrames = null) {
  const durationSeconds = Math.max(0, ...stems.map((stem) => Number(stem.durationSeconds || 0)));
  const resolvedMasterFrames = masterFrames || frames(0, durationSeconds, { rms: 0.1, peak: 0.2, onsetEvery: 5 });
  return {
    schemaVersion: "hapa.stem-telemetry-bundle.v1",
    analysisVersion: "fixture-absolute-window-v1",
    truthStatus: "offline-decoded-local-stems",
    fps: 10,
    sampleRate: 48000,
    durationSeconds,
    canonicalStemCount: stems.length,
    usableStemCount: stems.length,
    stems,
    masterMix: {
      id: "master",
      method: "authoritative-registry-master",
      audioPath: "/tmp/master.mp3",
      audioHash: fixtureHash("audio:master"),
      pathHash: fixtureHash("path:master"),
      durationSeconds,
      frames: resolvedMasterFrames,
      normalization: { rmsP99: 1, peakP99: 1 },
    },
  };
}

function sourcesFor(bundle) {
  return bundle.stems.map((stem) => ({
    id: stem.id,
    stemType: stem.role,
    audioPath: stem.audioPath,
    audioHash: stem.audioHash,
  }));
}

test("silent requested stems deterministically rebind to the strongest declared active isolated stem", () => {
  const bundle = telemetry([
    resource("synth", frames(0, 16, { rms: 0.00001, peak: 0.0001 })),
    resource("vocals", frames(0, 16, { rms: 0.05, peak: 0.2, onsetEvery: 4 })),
    resource("guitar", frames(0, 16, { rms: 0.02, peak: 0.08, onsetEvery: 8 })),
    resource("fx", frames(0, 16, { rms: 0.09, peak: 0.3, onsetEvery: 2 })),
  ]);
  const decision = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "synth",
    startSeconds: 0,
    endSeconds: 16,
    signals: ["rms", "beat", "mid"],
    declaredActiveRoles: ["Vocals", "Guitar", "Synth"],
    preferredRoles: ["synth", "keyboard", "strings"],
    availableStemSources: sourcesFor(bundle),
  });
  assert.equal(decision.status, "rebound-active-isolated-stem");
  assert.equal(decision.selectedRole, "leadVocals");
  assert.equal(decision.selectedCanonicalRole, "vocals");
  assert.equal(decision.candidateScope, "declared-active-stems");
  assert.equal(decision.selectedEvidence.audioHash, fixtureHash("audio:vocals:0"));
  assert.equal(decision.changed, true);
});

test("window scoring selects drums for an inactive strings cue and retains a proven active request", () => {
  const bundle = telemetry([
    resource("strings", frames(0, 24, { rms: 0.00001, peak: 0.0001 })),
    resource("drums", frames(0, 24, { rms: 0.12, peak: 0.4, onsetEvery: 2 })),
    resource("bass", frames(0, 24, { rms: 0.06, peak: 0.18, onsetEvery: 5 })),
    resource("vocals", frames(0, 24, { rms: 0.05, peak: 0.2, onsetEvery: 4 })),
  ]);
  const repaired = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "strings",
    startSeconds: 11,
    endSeconds: 13,
    signals: ["rms", "beat"],
    declaredActiveRoles: ["Strings", "Vocals", "Drums", "Bass"],
    availableStemSources: sourcesFor(bundle),
  });
  assert.equal(repaired.selectedRole, "drums");
  assert.equal(repaired.reason, "requested-stem-silent-selected-strongest-declared-active-stem");

  const retained = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "bass",
    startSeconds: 11,
    endSeconds: 13,
    signals: ["rms"],
    declaredActiveRoles: ["Drums", "Bass"],
    availableStemSources: sourcesFor(bundle),
  });
  assert.equal(retained.status, "retained-active");
  assert.equal(retained.selectedRole, "bass");
  assert.equal(retained.changed, false);
});

test("master is an explicit last resort, not a default replacement", () => {
  const bundle = telemetry([
    resource("synth", frames(0, 2, { rms: 0.00001, peak: 0.0001 })),
    resource("vocals", frames(0, 2, { rms: 0.00001, peak: 0.0001 })),
  ], frames(0, 2, { rms: 0.08, peak: 0.2, onsetEvery: 4 }));
  const decision = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "synth",
    startSeconds: 0,
    endSeconds: 2,
    signals: ["rms"],
    availableStemSources: sourcesFor(bundle),
  });
  assert.equal(decision.status, "fallback-master-after-isolated-stems-exhausted");
  assert.equal(decision.selectedRole, "master");
  assert.ok(decision.candidates.every((candidate) => candidate.sufficient === false));
});

test("a valid master-only graph retains its master binding without isolated-stem certificates", () => {
  const bundle = telemetry([resource("placeholder", frames(0, 2, { rms: 0.01, peak: 0.02 }))]);
  bundle.stems = [];
  bundle.canonicalStemCount = 0;
  bundle.usableStemCount = 0;
  const decision = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "master",
    startSeconds: 0,
    endSeconds: 2,
    signals: ["rms"],
    availableStemSources: [],
  });
  assert.equal(decision.status, "retained-active-master");
  assert.equal(decision.selectedRole, "master");
});

test("an explicit allow-silent contract retains intentional silent stems", () => {
  const synth = resource("synth", frames(0, 2, { rms: 0.00001, peak: 0.0001 }));
  synth.allowSilent = true;
  const vocals = resource("vocals", frames(0, 2, { rms: 0.08, peak: 0.2 }));
  const bundle = telemetry([synth, vocals]);
  const decision = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "synth",
    startSeconds: 0,
    endSeconds: 2,
    signals: ["rms"],
    declaredActiveRoles: ["Synth", "Vocals"],
    availableStemSources: sourcesFor(bundle),
    allowSilentRoles: ["synth"],
  });
  assert.equal(decision.status, "retained-explicit-allow-silent");
  assert.equal(decision.selectedRole, "synth");
  assert.equal(decision.changed, false);
  assert.equal(decision.selectedEvidence.silentContractEligible, true);
});

test("candidate selection rejects a louder stem when the exact mapped band is flat", () => {
  const synth = resource("synth", frames(0, 2, { rms: 0.00001, peak: 0.0001 }));
  const drums = resource("drums", frames(0, 2, { rms: 0.2, peak: 0.5, onsetEvery: 2 }));
  const vocals = resource("vocals", frames(0, 2, { rms: 0.05, peak: 0.2, onsetEvery: 4 }));
  drums.frames = drums.frames.map((frame) => ({ ...frame, bands: { ...frame.bands, high: 0.75 } }));
  const bundle = telemetry([synth, drums, vocals]);
  const decision = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "synth",
    startSeconds: 0,
    endSeconds: 2,
    signals: ["high"],
    declaredActiveRoles: ["Drums", "Vocals"],
    availableStemSources: sourcesFor(bundle),
  });
  assert.equal(decision.selectedCanonicalRole, "vocals");
  const drumEvidence = decision.candidates.find((candidate) => candidate.role === "drums");
  assert.equal(drumEvidence.sufficient, false);
  assert.deepEqual(drumEvidence.cueSignals.flatRequiredSignals, ["high"]);
  assert.equal(decision.selectedEvidence.cueSignals.eligible, true);
});

test("continuous cues reject mostly-silent isolated stems and use proven master coverage", () => {
  const sparseFrames = frames(0, 17, { rms: 0.00001, peak: 0.0001 }).map((frame, index) => (
    index < 30
      ? { ...frame, rawRms: 0.06, rawPeak: 0.2 }
      : frame
  ));
  const synth = resource("synth", sparseFrames);
  const bundle = telemetry([synth]);
  const decision = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "synth",
    startSeconds: 0,
    endSeconds: 17,
    signals: ["rms"],
    declaredActiveRoles: ["Synth"],
    availableStemSources: sourcesFor(bundle),
  });
  assert.equal(decision.selectedRole, "master");
  assert.equal(decision.status, "fallback-master-after-isolated-stems-exhausted");
  assert.ok(decision.requestedEvidence.activeRatio < 0.25);
  assert.equal(decision.requestedEvidence.cueSignals.rawActivity.sufficient, false);
  assert.equal(decision.selectedEvidence.cueSignals.rawActivity.sufficient, true);
});

test("all-silent cue windows remain blocked and are never reported as verified-no-change", () => {
  const bundle = telemetry([
    resource("synth", frames(0, 2, { rms: 0.00001, peak: 0.0001 })),
    resource("vocals", frames(0, 2, { rms: 0.00001, peak: 0.0001 })),
  ], frames(0, 2, { rms: 0.00001, peak: 0.0001 }));
  const stored = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { durationSeconds: 2 },
    stems: { items: sourcesFor(bundle) },
    tracks: [{ id: "track-b", role: "visualizer", cards: [{
      id: "silent-card",
      sourceCueIndex: 0,
      startSeconds: 0,
      endSeconds: 2,
      visualization: { card: { schemaVersion: "hapa.visualizer-card.v2", stemFocus: "synth", audioMap: { gain: { signal: "rms" } } } },
      parameters: { visualizerMappings: { gain: "synth:rms" } },
    }] }],
    directorV2: { visualizerLayers: [{ id: "silent-layer", sourceCueIndex: 0, startSeconds: 0, endSeconds: 2, stemFocus: "synth" }] },
  };
  const result = repairEchoShowGraphStemBindings(stored, { telemetry: bundle, scope: "all-silent-fixture" });
  assert.equal(result.changed, false);
  assert.equal(result.receipt.status, "blocked");
  assert.equal(result.receipt.blockedDecisionCount, 1);
  assert.equal(result.graph.stems.bindingActivity.blockedCount, 1);
  assert.equal(result.graph.tracks[0].cards[0].visualization.stemBinding.status, "blocked-no-active-signal-source");
});

test("unverified or out-of-graph telemetry resources cannot become repair candidates", () => {
  const synth = resource("synth", frames(0, 2, { rms: 0.00001, peak: 0.0001 }));
  const vocals = resource("vocals", frames(0, 2, { rms: 0.05, peak: 0.2 }));
  const drums = resource("drums", frames(0, 2, { rms: 0.3, peak: 0.6 }));
  drums.status = "decode-failed";
  const bundle = telemetry([synth, vocals, drums]);
  const certified = sourcesFor(bundle).filter((source) => source.stemType !== "drums");
  const decision = selectEchoActiveStemBinding({
    telemetry: bundle,
    requestedRole: "synth",
    startSeconds: 0,
    endSeconds: 2,
    signals: ["rms"],
    declaredActiveRoles: ["Drums", "Vocals"],
    availableStemSources: certified,
  });
  assert.equal(decision.selectedCanonicalRole, "vocals");
  assert.equal(decision.candidates.some((candidate) => candidate.role === "drums"), false);
});

test("declared active roles are the deterministic union of overlapping source shots", () => {
  assert.deepEqual(declaredEchoStemRolesForWindow([
    { start_sec: 0, end_sec: 3, active_stems: ["Vocals", "Keyboard"] },
    { start_sec: 3, end_sec: 6, active_stems: ["Drums", "Bass"] },
    { start_sec: 6, end_sec: 9, active_stems: ["Strings"] },
  ], 2, 5), ["leadVocals", "keyboard", "drums", "bass"]);
});

test("Director compilation applies activity repair before portable visualizer wiring and preserves lineage", () => {
  const project = { music_video_project: {
    song_id: "binding-fixture",
    song_title: "Binding Fixture",
    registry_track_id: "binding-track",
    audio_id: "binding-track",
    duration: 4,
    stems_available: ["Synth", "Vocals", "Guitar"],
    song_edit_map: { sections: [{ id: "intro", type: "intro", start: 0, end: 4 }], editPulses: [] },
    timed_lyrics: [],
    timeline: [{ section_id: "intro", section_type: "intro", start_sec: 0, end_sec: 4, media_id: "m1", media_uri: "/media/one.mp4", active_stems: ["Synth", "Vocals", "Guitar"] }],
    visualizer_timeline: [{ start_sec: 0, end_sec: 4, visualizer_id: "isf:fixture", visualizer_title: "Fixture" }],
  } };
  const registry = { stems: ["Synth", "Vocals", "Guitar"].map((stemType) => ({
    id: `stem:${stemType.toLowerCase()}`,
    parentId: "binding-track",
    stemType,
    title: stemType,
    duration: 4,
    localPath: `/tmp/${stemType.toLowerCase()}.mp3`,
  })) };
  const manifest = { shaders: [{
    id: "isf:fixture",
    title: "Fixture",
    source: "/fixture.fs",
    inputs: [{ NAME: "gain", TYPE: "float", DEFAULT: 0.2 }],
    audioMap: { gain: { signal: "rms", depth: 0.4 } },
  }] };
  const bundle = telemetry([
    resource("synth", frames(0, 4, { rms: 0.00001, peak: 0.0001 })),
    resource("vocals", frames(0, 4, { rms: 0.05, peak: 0.2, onsetEvery: 4 })),
    resource("guitar", frames(0, 4, { rms: 0.02, peak: 0.08, onsetEvery: 8 })),
  ], frames(0, 4, { rms: 0.1, peak: 0.2 }));
  const result = buildDirectorV2Artifacts({ project, manifest, registry, stemTelemetry: bundle, duration: 4, recipe: "visualizer-forward", seed: "binding-fixture" });
  const card = result.showGraph.tracks.find((track) => track.id === "track-b").cards[0];
  assert.equal(card.visualization.card.stemFocus, "leadVocals");
  assert.equal(card.parameters.visualizerMappings.gain, "leadVocals:rms");
  assert.equal(card.provenance.requestedStemFocus, "synth");
  assert.equal(card.provenance.stemBindingStatus, "rebound-active-isolated-stem");
  assert.equal(card.visualization.stemBinding.selectedEvidence.audioHash, fixtureHash("audio:vocals:0"));
  assert.equal(result.treatment.visualizers[0].stemBinding.candidateScope, "declared-active-stems");
  assert.equal(result.showGraph.stems.bindingActivity.repairedCount, 1);
});

test("runtime repair derives a new execution graph and rewires every cue binding without mutating the stored edit", () => {
  const project = { music_video_project: {
    timeline: [{ start_sec: 0, end_sec: 4, active_stems: ["Synth", "Vocals", "Guitar"] }],
  } };
  const stored = {
    schemaVersion: "hapa.music-viz.native-show-graph.v2",
    song: { durationSeconds: 4 },
    stems: { items: [
      { id: "stem:synth", stemType: "Synth", audioPath: "/tmp/synth.mp3", audioHash: fixtureHash("audio:synth:0") },
      { id: "stem:vocals", stemType: "Vocals", audioPath: "/tmp/vocals.mp3", audioHash: fixtureHash("audio:vocals:0") },
      { id: "stem:guitar", stemType: "Guitar", audioPath: "/tmp/guitar.mp3", audioHash: fixtureHash("audio:guitar:0") },
    ] },
    tracks: [{ id: "track-b", role: "visualizer", cards: [{
      id: "card:b:0",
      trackId: "track-b",
      sourceCueIndex: 0,
      startSeconds: 0,
      endSeconds: 4,
      provenance: { stemFocus: "synth" },
      parameters: { visualizerMappings: { gain: "synth:rms", pulse: { stemFocus: "synth", signal: "beat" } } },
      visualization: { sourceId: "isf:fixture", card: {
        schemaVersion: "hapa.visualizer-card.v2",
        id: "isf:fixture",
        stemFocus: "synth",
        audioSignal: ["rms", "beat"],
        audioMap: { gain: { signal: "rms" }, pulse: { signal: "beat", stemFocus: "synth" } },
        automation: [{ uniform: "gain", signal: "rms", stemFocus: "synth" }, { uniform: "pulse", signal: "beat", stemFocus: "synth" }],
        provenance: {},
      } },
    }] }],
    directorV2: {
      visualizerLayers: [{ id: "visualizer:0", sourceCueIndex: 0, stemFocus: "synth", audioMap: { gain: { signal: "rms" } }, portableCard: { stemFocus: "synth" } }],
      modulationBindings: [{ id: "visualizer:0:gain", source: { kind: "stem_signal", stemFocus: "synth", signal: "rms" }, target: { kind: "visualizer_uniform", visualizerId: "visualizer:0", uniform: "gain" } }],
    },
  };
  const bundle = telemetry([
    resource("synth", frames(0, 4, { rms: 0.00001, peak: 0.0001 })),
    resource("vocals", frames(0, 4, { rms: 0.05, peak: 0.2, onsetEvery: 4 })),
    resource("guitar", frames(0, 4, { rms: 0.02, peak: 0.08, onsetEvery: 8 })),
  ], frames(0, 4, { rms: 0.1, peak: 0.2 }));
  const telemetrySha256 = `sha256:${"f".repeat(64)}`;
  const result = repairEchoShowGraphStemBindings(stored, { telemetry: bundle, telemetrySha256, project, scope: "fixture" });
  const repaired = result.graph.tracks[0].cards[0];
  assert.equal(result.changed, true);
  assert.equal(result.receipt.nonDestructiveStoredEdit, true);
  assert.equal(stored.tracks[0].cards[0].visualization.card.stemFocus, "synth");
  assert.equal(repaired.visualization.card.stemFocus, "leadVocals");
  assert.equal(repaired.visualization.card.automation[0].stemFocus, "leadVocals");
  assert.equal(repaired.visualization.card.audioMap.pulse.stemFocus, "leadVocals");
  assert.equal(repaired.parameters.visualizerMappings.gain, "leadVocals:rms");
  assert.equal(repaired.parameters.visualizerMappings.pulse.stemFocus, "leadVocals");
  assert.equal(repaired.provenance.requestedStemFocus, "synth");
  assert.equal(result.graph.directorV2.visualizerLayers[0].stemFocus, "leadVocals");
  assert.equal(result.graph.directorV2.modulationBindings[0].source.stemFocus, "leadVocals");
  const bindings = deriveRequiredStemTelemetryBindings({ showGraph: result.graph });
  assert.ok(bindings.some((binding) => binding.stemRole === "vocals"));
  assert.equal(bindings.some((binding) => binding.stemRole === "synth"), false);
  const compiled = compileHyperFramesShow({ showGraph: result.graph, telemetry: bundle, project, proxyRegistry: {}, fps: 30 });
  assert.equal(compiled.instances.visualizers[0].stemFocus, "leadVocals", "the exact repaired execution graph must reach the offline compiler");
  assert.equal(compiled.instances.visualizers[0].audioMap.gain.stemFocus, "leadVocals");
  const repeated = repairEchoShowGraphStemBindings(result.graph, { telemetry: bundle, telemetrySha256, project, scope: "fixture-repeat" });
  assert.equal(repeated.reusedCertifiedExecutionGraph, true);
  assert.strictEqual(repeated.graph, result.graph);
  assert.deepEqual(repeated.graph, result.graph);
  assert.equal(repeated.graph.tracks[0].cards[0].provenance.requestedStemFocus, "synth");
  assert.equal(repeated.receipt.decisions[0].decision.requestedCanonicalRole, "synth");

  const revisedBundle = telemetry([
    resource("synth", frames(0, 4, { rms: 0.08, peak: 0.2, onsetEvery: 4 })),
    resource("vocals", frames(0, 4, { rms: 0.00001, peak: 0.0001 })),
    resource("guitar", frames(0, 4, { rms: 0.02, peak: 0.08, onsetEvery: 8 })),
  ], frames(0, 4, { rms: 0.1, peak: 0.2 }));
  const revisedTelemetrySha256 = `sha256:${"e".repeat(64)}`;
  const freshRevision = repairEchoShowGraphStemBindings(stored, {
    telemetry: revisedBundle,
    telemetrySha256: revisedTelemetrySha256,
    project,
    scope: "fixture-revised",
  });
  const derivedRevision = repairEchoShowGraphStemBindings(result.graph, {
    telemetry: revisedBundle,
    telemetrySha256: revisedTelemetrySha256,
    project,
    scope: "fixture-revised",
  });
  const freshCard = freshRevision.graph.tracks[0].cards[0];
  const derivedCard = derivedRevision.graph.tracks[0].cards[0];
  assert.equal(derivedRevision.reusedCertifiedExecutionGraph, undefined);
  assert.equal(derivedRevision.receipt.decisions[0].decision.requestedCanonicalRole, "synth");
  assert.equal(derivedRevision.receipt.decisions[0].decision.selectedCanonicalRole, "synth");
  assert.equal(derivedCard.visualization.card.stemFocus, "synth");
  assert.deepEqual(derivedCard.visualization.card.audioMap, freshCard.visualization.card.audioMap);
  assert.deepEqual(derivedCard.visualization.card.automation, freshCard.visualization.card.automation);
  assert.deepEqual(derivedCard.parameters.visualizerMappings, freshCard.parameters.visualizerMappings);
  assert.equal(derivedRevision.graph.directorV2.modulationBindings[0].source.stemFocus, "synth");
});
