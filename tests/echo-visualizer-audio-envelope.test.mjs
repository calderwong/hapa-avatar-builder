import test from "node:test";
import assert from "node:assert/strict";
import {
  echoVisualizerAudioEnvelope,
  normalizeEchoStemFocus,
  resolveVerifiedEchoStemBinding,
} from "../src/domain/echo-visualizer-audio-envelope.js";

test("stem aliases normalize to the registry bus vocabulary", () => {
  assert.equal(normalizeEchoStemFocus("Lead Vocals"), "vocals");
  assert.equal(normalizeEchoStemFocus("Backing Vocals"), "backingvocals");
  assert.equal(normalizeEchoStemFocus("master mix"), "master");
});

test("one incomplete archive row does not disable a verified requested stem", () => {
  const graph = {
    stems: {
      nativeStatus: "partial-local-paths",
      items: [
        { id: "stem:archive", stemType: "archive-zip", audioPath: "" },
        { id: "stem:synth", stemType: "Synth", audioPath: "/stems/synth.wav" },
      ],
    },
    directorV2: {
      stemBuses: [
        { id: "bus:archive", stemId: "stem:archive", stemType: "archive-zip", audioPath: "", truthStatus: "declared_without_path" },
        { id: "bus:synth", stemId: "stem:synth", stemType: "Synth", audioPath: "/stems/synth.wav", truthStatus: "verified_registry_path" },
      ],
    },
  };
  const result = resolveVerifiedEchoStemBinding(graph, { visualization: { card: { stemFocus: "synth" } } });
  assert.equal(result.status, "verified-stem");
  assert.equal(result.bus.audioPath, "/stems/synth.wav");
});

test("a bus path must match a registry stem before live decoding", () => {
  const graph = {
    stems: { nativeStatus: "verified-local-registry-paths", items: [{ id: "stem:drums", stemType: "Drums", audioPath: "/other/drums.wav" }] },
    directorV2: { stemBuses: [{ id: "bus:drums", stemId: "stem:drums", stemType: "Drums", audioPath: "/stems/drums.wav", truthStatus: "verified_registry_path" }] },
  };
  const result = resolveVerifiedEchoStemBinding(graph, { provenance: { stemFocus: "drums" } });
  assert.equal(result.status, "master-fallback");
  assert.equal(result.fallbackReason, "requested-stem-path-unverified");
});

test("generic live presentation is silent at zero and materially responds to energy", () => {
  const quiet = echoVisualizerAudioEnvelope({ status: "live", rms: 0, energy: 0, low: 0, beat: 0 });
  const loud = echoVisualizerAudioEnvelope({ status: "live", source: "verified-registry-stem", rms: 0.22, energy: 0.38, low: 0.5, beat: 0.8 });
  assert.equal(quiet.scale, 1);
  assert.equal(quiet.brightness, 1);
  assert.ok(loud.scale > 1.02);
  assert.ok(loud.brightness > 1.25);
  assert.ok(loud.saturation > 1.25);
  assert.equal(loud.signalSource, "verified-registry-stem");
});
