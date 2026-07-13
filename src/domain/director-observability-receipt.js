import { contextHash } from "./song-context-packet.js";

export const DIRECTOR_OBSERVABILITY_SCHEMA = "hapa.director.playback-receipt.v1";

export function createBoundedRuntimeRecorder({ maxSamples = 120, sampleIntervalMs = 250 } = {}) {
  const counters = {};
  const samples = [];
  let lastSampleAt = -Infinity;
  return {
    increment(name, amount = 1) { counters[name] = Number(counters[name] || 0) + Number(amount || 0); },
    sample(atMs, values = {}) { if (Number(atMs) - lastSampleAt < sampleIntervalMs) return false; lastSampleAt = Number(atMs); samples.push({ atMs: Number(atMs), ...values }); if (samples.length > maxSamples) samples.splice(0, samples.length - maxSamples); return true; },
    export() { return { schemaVersion: "hapa.playback.bounded-runtime-counters.v1", policy: { maxSamples, sampleIntervalMs, perFrameLogging: false, reactStateWrites: false }, counters: { ...counters }, samples: [...samples], sampleCount: samples.length }; },
  };
}

export function buildDirectorPlaybackReceipt({ source, compilation, adapter, preview, exportValidation, evidenceIndex = {} } = {}) {
  const base = { schemaVersion: DIRECTOR_OBSERVABILITY_SCHEMA, source, compilation, adapter, preview, exportValidation, evidenceIndex, lineage: { sourceManifestHash: source?.manifestHash || null, treatmentId: compilation?.treatmentId || null, cueGraphId: compilation?.cueGraphId || null, variantId: compilation?.variantId || null, variantHash: compilation?.variantHash || null, adapterId: adapter?.adapterId || null, previewSessionId: preview?.sessionId || null, exportArtifactHash: exportValidation?.artifactHash || null }, compactPolicy: { noPerFrameLogs: true, boundedRuntimeSamples: true, noReactStatePerFrame: true } };
  return { ...base, receiptHash: contextHash(base) };
}

export function explainFromDirectorReceipt(receipt, { kind, id } = {}) {
  const table = receipt.evidenceIndex?.[kind] || {};
  const evidence = table[id];
  if (!evidence) return { found: false, kind, id, reason: "saved-evidence-not-found" };
  return { found: true, kind, id, evidence, receiptHash: receipt.receiptHash, reconstructionRule: "saved-receipt-evidence-only" };
}
