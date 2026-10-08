import { normalizeHyperFramesStemRole } from "./hyperframes-visualizer-runtime.js";
export { sampleEchoPerformanceBus, evaluateEchoMusicPerformance } from "./hyperframes-visualizer-runtime.js";

export const ECHO_MUSIC_PERFORMANCE_SCHEMA = "hapa.echo.music-performance.v1";
export const ECHO_MUSIC_PERFORMANCE_VERSION = "absolute-song-time-1";
const finite = (value, fallback = null) => value !== null && value !== undefined && Number.isFinite(Number(value)) ? Number(value) : fallback;
const hashValue = value => String(value || "").replace(/^sha256:/, "");
const kinds = new Set(["transient", "beat", "downbeat", "bar", "phrase-start", "phrase-end", "section", "vocal-entry"]);

export function normalizeEchoPerformanceResource(resource = {}, telemetry = {}) {
  if ((resource.frames || []).length > 200_000) {
    const error = new Error("Performance resource exceeds 200000 frame budget"); error.code = "echo_performance_budget_exceeded"; throw error;
  }
  const role = normalizeHyperFramesStemRole(resource.role || resource.id || "unknown");
  const originSeconds = finite(resource.originSeconds, 0);
  const frames = (resource.frames || []).map(frame => ({
    t: finite(frame.t), rms: finite(frame.rms, 0), peak: finite(frame.peak, 0),
    low: finite(frame.low ?? frame.bands?.low, 0), mid: finite(frame.mid ?? frame.bands?.mid, 0), high: finite(frame.high ?? frame.bands?.high, 0),
    rawRms: finite(frame.rawRms), rawPeak: finite(frame.rawPeak), silence: frame.silence === true,
    // A display-grid derivative is retained as an envelope, never a beat time.
    onsetEnvelope: finite(frame.onset, 0),
  }));
  if (frames.some((frame, index) => frame.t === null || frame.t < 0 || (index > 0 && frame.t <= frames[index - 1].t))) {
    throw new Error(`Invalid performance frame time for ${role}`);
  }
  const featureAvailability = resource.identityPolicy === "living-light-assets-v1" ? Object.fromEntries([
    ["energy", f => [f.rms,f.rawRms].every(v => typeof v === "number" && Number.isFinite(v))],
    ["peak", f => [f.peak,f.rawPeak].every(v => typeof v === "number" && Number.isFinite(v))],
    ...["low","mid","high"].map(k => [k, f => typeof (f[k] ?? f.bands?.[k]) === "number" && Number.isFinite(f[k] ?? f.bands?.[k])]),
    ["onset", f => typeof f.onset === "number" && Number.isFinite(f.onset)],
  ].map(([name, available]) => [name, (resource.frames || []).length > 0 && resource.frames.every(available)])) : null;
  return {
    ...(featureAvailability ? {featureAvailability} : {}),
    ...(resource.identityPolicy === "living-light-assets-v1" ? {assetId: resource.assetId, declaredRole: resource.declaredRole, identityPolicy: resource.identityPolicy} : {}),
    id: String(resource.id || role), role, audioHash: hashValue(resource.audioHash) || null,
    sourceSampleRate: finite(resource.sourceSampleRate), analysisSampleRate: finite(resource.sampleRate ?? telemetry.sampleRate),
    sourceChannels: finite(resource.sourceChannels), analysisChannels: finite(resource.analysisChannels, 1),
    sourceStreamStartSeconds: finite(resource.sourceStreamStartSeconds),
    durationSeconds: finite(resource.durationSeconds ?? telemetry.durationSeconds, 0),
    originSeconds, originStatus: resource.originStatus || "analysis-zero-not-verified-alignment",
    ...(resource.decodedAnalysis ? {decodedAnalysis:structuredClone(resource.decodedAnalysis)} : {}),
    normalization: structuredClone(resource.normalization || {}),
    analyzer: { version: telemetry.analysisVersion || "unknown", envelopeFps: finite(telemetry.fps),
      sampleRate: finite(telemetry.sampleRate), settings: structuredClone(telemetry.analysisSettings || {}) },
    status: frames.length ? resource.status || "prepared-envelope" : "missing-analysis",
    confidence: finite(resource.confidence),
    alignment: structuredClone(resource.masterAlignmentDiagnostic || null),
    provenance: structuredClone(resource.sourceLineage || []), frames,
  };
}

/** Extends prepared telemetry; it cannot decode audio or invent beat grids.
 * Incoming events must identify the exact analyzed source and their precision.
 * Word/phrase times stay attached to their lyric revision, not media trim/rate. */
export function buildEchoMusicPerformance({ telemetry = {}, lyricContract = {}, events = [], expectedMasterHash = null } = {}) {
  const resources = [telemetry.masterMix, ...(telemetry.stems || [])].filter(Boolean);
  if (resources.length > 64 || resources.reduce((sum, resource) => sum + (resource.frames || []).length, 0) > 1_000_000 || events.length > 200_000) {
    const error = new Error("Performance input exceeds resource, frame or event budget"); error.code = "echo_performance_budget_exceeded"; throw error;
  }
  const masterHash = hashValue(telemetry.masterMix?.audioHash);
  if (expectedMasterHash && hashValue(expectedMasterHash) !== masterHash) {
    const error = new Error("Prepared telemetry does not match the selected master audio bytes.");
    error.code = "echo_performance_master_mismatch";
    throw error;
  }
  if (lyricContract.audioHash && hashValue(lyricContract.audioHash) !== masterHash) {
    const error = new Error("Lyric alignment belongs to a different master audio revision.");
    error.code = "echo_performance_lyric_master_mismatch";
    throw error;
  }
  const buses = [
    ...(telemetry.masterMix ? [normalizeEchoPerformanceResource({ ...telemetry.masterMix, id: "master", role: "master" }, telemetry)] : []),
    ...(telemetry.stems || []).map(stem => normalizeEchoPerformanceResource(stem, telemetry)),
  ];
  const resourceById = new Map(buses.map(bus => [bus.id, bus]));
  const rejectedEvents = [];
  const acceptedEvents = events.flatMap((event, index) => {
    const bus = resourceById.get(String(event.resourceId || "master"));
    const at = finite(event.atSeconds);
    const precision = finite(event.precisionSeconds);
    const reason = !kinds.has(event.kind) ? "unsupported-event-kind"
      : at === null || at < 0 ? "invalid-event-time"
        : !bus?.audioHash || hashValue(event.audioHash) !== bus.audioHash ? "event-source-mismatch"
          : !(precision > 0) ? "event-precision-unmeasured"
            : !event.method ? "event-method-missing" : null;
    if (reason) { rejectedEvents.push({ index, reason }); return []; }
    return [{ ...structuredClone(event), atSeconds: Number((at + bus.originSeconds).toFixed(12)), resourceId: bus.id,
      audioHash: bus.audioHash, precisionSeconds: precision, confidence: finite(event.confidence),
      truthStatus: event.truthStatus || "inferred-unreviewed" }];
  }).sort((a, b) => a.atSeconds - b.atSeconds || String(a.id || a.kind).localeCompare(String(b.id || b.kind)));
  const duplicateRoles = [...new Set(buses.filter((bus, index) => buses.findIndex(other => other.role === bus.role) !== index).map(bus => bus.role))];
  return {
    schemaVersion: ECHO_MUSIC_PERFORMANCE_SCHEMA, version: ECHO_MUSIC_PERFORMANCE_VERSION,
    ...(telemetry.sourcePolicy === "living-light-assets-v1" ? {sourcePolicy: telemetry.sourcePolicy} : {}),
    sourceSchemaVersion: telemetry.schemaVersion || null, songId: telemetry.songId || null,
    masterAudioHash: masterHash || null, durationSeconds: finite(telemetry.durationSeconds, 0),
    timebase: { unit: "seconds", origin: "selected-master-presentation-zero", eventQuantization: "none", seekingRunsAnalysis: false },
    buses, events: acceptedEvents, rejectedEvents,
    lyrics: structuredClone(lyricContract),
    reconstruction: { masterAudioHash: masterHash || null, stemAudioHashes: buses.filter(bus => telemetry.sourcePolicy === "living-light-assets-v1" ? bus.id !== "master" : bus.role !== "master").map(bus => bus.audioHash),
      diagnostic: structuredClone(telemetry.masterMix?.isolatedStemReconstructionDiagnostic || null),
      automaticOriginCorrection: false, policy: "Sparse role correlation cannot establish an origin shift." },
    missingData: { masterIdentity: !masterHash, measuredBeats: !acceptedEvents.some(event => ["beat", "downbeat"].includes(event.kind) && ["measured", "verified"].includes(event.truthStatus) && event.precisionSeconds <= 1 / 30),
      sourceSampleRates: buses.filter(bus => !bus.sourceSampleRate).map(bus => bus.id),
      unverifiedOrigins: buses.filter(bus => bus.originStatus !== "verified").map(bus => bus.id),
      ambiguousRoles: duplicateRoles, missingBuses: buses.filter(bus => !bus.frames.length).map(bus => bus.id) },
  };
}
