import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildEchoMusicPerformance, evaluateEchoMusicPerformance } from "../src/domain/echo-music-performance.js";
import { createEchoPerformanceCache } from "../server/echo-performance-cache.mjs";
import { compileHyperFramesShow } from "../src/domain/hyperframes-show-compiler.js";
import { evaluateHyperFramesVisualizers, echoVisualSignalIsolation, echoPreparedPerformanceSignalFrames } from "../src/domain/hyperframes-visualizer-runtime.js";

const masterHash = "a".repeat(64), stemHash = "b".repeat(64);
const frames = [{ t: 0, rms: 0, peak: 0, onset: 1, silence: true }, { t: 0.1, rms: 0.5, peak: 0.7, onset: 0.8 }, { t: 0.2, rms: 1, peak: 1, onset: 0.7 }, { t: 0.3, rms: 0, peak: 0, silence: true }];
const input = () => ({ telemetry: { schemaVersion: "hapa.stem-telemetry-bundle.v1", analysisVersion: "test-analyzer-1", fps: 10, sampleRate: 8000, durationSeconds: 1, songId: "s",
  masterMix: { audioHash: masterHash, frames, durationSeconds: 1, normalization: { rmsP99: 0.83 } },
  stems: [{ id: "d", role: "drums", audioHash: stemHash, frames, originSeconds: 0.013, durationSeconds: 1, normalization: { rmsP99: 0.42 } }] },
  expectedMasterHash: masterHash, lyricContract: { audioHash: masterHash, timingHash: "timing-1", lines: [{ start: 0.131, end: 0.283, text: "hello" }] },
  events: [{ kind: "beat", resourceId: "d", audioHash: stemHash, atSeconds: 0.13125, precisionSeconds: 0.000125, method: "annotated-sample", truthStatus: "measured", confidence: 1 }] });

test("performance retains sparse subframe events, independent normalization, origins, and missing evidence", () => {
  const bundle = buildEchoMusicPerformance(input());
  assert.equal(bundle.events[0].atSeconds, 0.14425);
  assert.equal(bundle.buses[1].normalization.rmsP99, 0.42);
  assert.equal(bundle.buses[0].normalization.rmsP99, 0.83);
  assert.equal(bundle.buses[1].originSeconds, 0.013);
  assert.equal(bundle.buses[1].sourceSampleRate, null);
  assert.equal(bundle.buses[1].analysisSampleRate, 8000);
  assert.equal(bundle.reconstruction.automaticOriginCorrection, false);
  assert.equal(bundle.missingData.measuredBeats, false);
  assert.deepEqual(bundle.missingData.unverifiedOrigins, ["master", "d"]);
  assert.equal(bundle.lyrics.lines[0].start, 0.131);
});

test("absolute sampling preserves rests, precise event pulses, and arbitrary seek order", () => {
  const bundle = buildEchoMusicPerformance(input());
  const times = [0, 0.14425, 0.6, 0.17, 0.01, 0.14425, 0.313, 0.9, 0.14425];
  const sampled = times.map(time => evaluateEchoMusicPerformance(bundle, time));
  assert.deepEqual(sampled[1], sampled[5]); assert.deepEqual(sampled[5], sampled[8]);
  assert.equal(sampled[0].master.rms, 0, "normalized noise cannot turn an intentional rest into energy");
  assert.equal(sampled[1].stems.drums.beat, 1);
  assert.equal(evaluateEchoMusicPerformance(bundle, 0.14424).stems.drums.beat, 0);
  assert.equal(sampled[1].master.beat, 0, "drum event must not leak to the master bus");
  assert.equal(sampled[6].stems.drums.rms, 0);
  assert.equal(evaluateEchoMusicPerformance(bundle, -1).master.rms, 0);
});

test("display-grid onset and source-mismatched events cannot become measured beats", () => {
  const value = input(); value.events[0].audioHash = "wrong";
  const bundle = buildEchoMusicPerformance(value);
  assert.equal(bundle.events.length, 0); assert.equal(bundle.missingData.measuredBeats, true);
  assert.equal(evaluateEchoMusicPerformance(bundle, 0.15).master.beat, 0);
  assert.ok(evaluateEchoMusicPerformance(bundle, 0.15).master.onsetEnvelope > 0);
  assert.equal(bundle.rejectedEvents[0].reason, "event-source-mismatch");
  assert.throws(() => buildEchoMusicPerformance({ ...input(), expectedMasterHash: "c".repeat(64) }), { code: "echo_performance_master_mismatch" });
  assert.throws(() => buildEchoMusicPerformance({ ...input(), lyricContract: { audioHash: "different" } }), { code: "echo_performance_lyric_master_mismatch" });
});

test("content cache reuses resources across lyric edits and invalidates exactly the changed stem", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "echo-performance-"));
  try {
    const cache = createEchoPerformanceCache({ root });
    const initial = input();
    const [a, b] = await Promise.all([cache.prepare(initial), cache.prepare(initial)]);
    assert.equal(a.fingerprint, b.fingerprint); assert.equal(cache.metrics().builds, 3);
    const reopened = createEchoPerformanceCache({ root });
    assert.equal((await reopened.prepare(initial)).fingerprint, a.fingerprint);
    assert.equal(reopened.metrics().diskHits, 3); assert.equal(reopened.metrics().builds, 0);
    const lyricEdit = { ...initial, lyricContract: { ...initial.lyricContract, timingHash: "timing-2" } };
    const c = await cache.prepare(lyricEdit);
    assert.notEqual(c.fingerprint, a.fingerprint); assert.equal(cache.metrics().builds, 4);
    assert.deepEqual(c.resourceKeys, a.resourceKeys);
    const stemEdit = structuredClone(lyricEdit); stemEdit.telemetry.stems[0].audioHash = "c".repeat(64);
    const d = await cache.prepare(stemEdit);
    assert.equal(cache.metrics().builds, 6); assert.equal(d.resourceKeys[0], c.resourceKeys[0]); assert.notEqual(d.resourceKeys[1], c.resourceKeys[1]);
    assert.equal(cache.metrics().analysisCalls, 0);
    a.buses[0].frames[1].rms = 999;
    assert.equal((await cache.prepare(initial)).buses[0].frames[1].rms, 0.5, "caller edits cannot poison cached data");
    await fs.writeFile(path.join(root, `resource-${a.resourceKeys[0]}.json`), "corrupt");
    const repaired = createEchoPerformanceCache({ root });
    await repaired.prepare(initial); assert.equal(repaired.metrics().corrupt, 1); assert.equal(repaired.metrics().builds, 1);
  } finally { await fs.rm(root, { force: true, recursive: true }); }
});

test("compiler carries prepared events into the actual HyperFrames adapter", () => {
  const value = input();
  const performance = buildEchoMusicPerformance(value);
  const graph = { schemaVersion: "hapa.music-viz.native-show-graph.v2", song: { id: "s", durationSeconds: 1, lyricOverlay: value.lyricContract }, tracks: [] };
  const show = compileHyperFramesShow({ showGraph: graph, telemetry: value.telemetry, project: {}, performance });
  assert.equal(show.stemFrames.performance.events[0].atSeconds, 0.14425);
  assert.equal(show.stemFrames.stems[0].originSeconds, 0.013);
  // Real adapter smoke, alongside event/bus checks above. Pixel parity is a separate ECHO-18 gate.
  assert.equal(evaluateHyperFramesVisualizers(show, 0.14425).receipt.runtimeAudioAnalysis, false);
});


test("visual signal solo is temporary, role-specific and deterministic across seeks and rests", () => {
  const bundle = buildEchoMusicPerformance(input()), before = structuredClone(bundle);
  for (const t of [0.17, 0.14425, 0.6, 0, 0.17]) {
    const normal = echoPreparedPerformanceSignalFrames(bundle, t);
    const drums = echoPreparedPerformanceSignalFrames(bundle, t, { soloStem: "drums" });
    assert.deepEqual(drums.drums, normal.drums);
    assert.equal(drums.master.rms, 0);
    assert.equal(drums.master.status, "diagnostic-muted");
    const master = echoPreparedPerformanceSignalFrames(bundle, t, { soloStem: "masterMix" });
    assert.deepEqual(master.master, normal.master);
    assert.equal(master.drums.rms, 0);
    assert.equal(master.drums.beat, 0, "muted sparse events cannot leak through");
    const muted = echoPreparedPerformanceSignalFrames(bundle, t, { soloStem: "__silence__" });
    assert.ok(Object.values(muted).every(f => ["rms", "peak", "bass", "treble", "beat", "onset", "energy", "palette", "orbit", "transient"].every(signal => f[signal] === 0)), "derived orbit must not revive muted audio activity");
    if (t === 0) assert.equal(normal.master.orbit, 0, "declared rest must preserve zero derived orbit");
  }
  assert.deepEqual(bundle, before);
  assert.throws(() => echoVisualSignalIsolation(bundle, "vocals"), /unavailable/);
  assert.throws(() => evaluateHyperFramesVisualizers({}, 0, { soloStem: "drums" }), /requires prepared/);
  const ambiguous = structuredClone(bundle); ambiguous.missingData.ambiguousRoles = ["drums"];
  assert.throws(() => echoVisualSignalIsolation(ambiguous, "drums"), /unavailable/);
  assert.equal(echoPreparedPerformanceSignalFrames(ambiguous, 0.17, { soloStem: "__silence__" }).master.rms, 0);
});
