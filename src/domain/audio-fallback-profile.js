import crypto from "node:crypto";

export const AUDIO_FALLBACK_SCHEMA = "hapa.director.audio-fallback-profile.v1";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stemName = (stem) => String(stem?.stemType || stem?.title || stem || "").trim();

export function buildAudioFallbackProfile({ stems = [], sections = [], lyricCues = [], beatTimes = [], durationSeconds = 0, fps = 10, timingTruth = {} } = {}) {
  const isolated = stems.filter((stem) => stem?.truthStatus === "verified-registry-stem" || stem?.audioPath).map(stemName).filter(Boolean);
  const noStems = isolated.length === 0;
  const frames = Array.from({ length: Math.max(1, Math.floor(durationSeconds * fps) + 1) }, (_, index) => {
    const t = index / fps;
    const section = sections.find((row) => t >= Number(row.startSeconds) && t < Number(row.endSeconds));
    const activeLyrics = lyricCues.filter((line) => t >= Number(line.startSeconds) && t < Number(line.endSeconds));
    const beat = beatTimes.some((value) => Math.abs(Number(value) - t) <= 0.5 / fps) ? 1 : 0;
    return { t, sectionEnergy: Number(section?.energy ?? 0.35), lyricDensity: Math.min(1, activeLyrics.reduce((sum, line) => sum + (line.words?.length || String(line.text || "").split(/\s+/).length), 0) / 8), beatCue: beat, manualCue: 0 };
  });
  const unavailableSignals = noStems ? ["isolated-vocals", "isolated-drums", "isolated-bass", "isolated-synth", "per-stem-rms", "per-stem-onset", "per-stem-bands"] : [];
  return {
    schemaVersion: AUDIO_FALLBACK_SCHEMA,
    mode: noStems ? "master-structural-fallback" : "isolated-stems",
    truthStatus: noStems ? "deterministic-structural-control-envelope-not-isolated-audio" : "verified-isolated-stems",
    isolatedStemCount: isolated.length,
    isolatedStems: isolated,
    unavailableSignals,
    buses: noStems ? [
      { id: "fallback:master-mix", kind: "mix_signal", isolatedStem: false, availableSignals: ["master-rms-when-decoded", "master-onset-when-decoded"] },
      { id: "fallback:section-energy", kind: "cue_signal", isolatedStem: false, availableSignals: ["sectionEnergy"] },
      { id: "fallback:lyric-density", kind: "cue_signal", isolatedStem: false, availableSignals: ["lyricDensity"] },
      { id: "fallback:manual-cue", kind: "manual_signal", isolatedStem: false, availableSignals: ["manualCue"] },
    ] : isolated.map((name) => ({ id: `stem:${name.toLowerCase().replace(/\s+/g, "-")}`, kind: "stem_signal", isolatedStem: true, availableSignals: ["rms", "peak", "onset", "low", "mid", "high"] })),
    deterministicControlEnvelope: { schemaVersion: "hapa.director.structural-control-envelope.v1", fps, durationSeconds, hash: hash(frames), frames },
    targetGrammar: { bounded: true, targets: ["visualizer-uniform", "camera", "effect", "visual-time", "opacity", "blend"], sourceRule: noStems ? "mix/cue/manual only; never remap to stem_signal" : "verified stem buses plus mix/cue/manual" },
    timingConfidence: timingTruth.lyric || timingTruth.status || timingTruth.source || "unknown",
    upgradePath: noStems ? {
      status: "available-when-source-improves",
      title: "Add isolated stems or stronger timing",
      steps: ["Attach registry-linked isolated stems", "Run offline stem telemetry extraction", "Attach verified lyric/beat timing source", "Recompile this variant; treatment locks and manual cues are retained"],
      preserves: ["treatment", "media locks", "manual cues", "approved timing boundaries"],
    } : { status: "not-needed", title: "Isolated stems available", steps: [] },
  };
}

export function validateAudioFallbackProfile(profile) {
  const errors = [];
  if (profile.mode === "master-structural-fallback") {
    if (profile.isolatedStemCount !== 0 || profile.buses.some((bus) => bus.isolatedStem || bus.kind === "stem_signal")) errors.push("invented-isolated-stem");
    if (!profile.unavailableSignals.length) errors.push("missing-unavailable-signal-declaration");
    if (profile.upgradePath?.status !== "available-when-source-improves" || !profile.upgradePath.steps?.length) errors.push("missing-upgrade-path");
  }
  if (!profile.deterministicControlEnvelope?.hash || !profile.deterministicControlEnvelope?.frames?.length) errors.push("missing-deterministic-envelope");
  if (!profile.targetGrammar?.bounded) errors.push("unbounded-target-grammar");
  return { ok: errors.length === 0, errors };
}
