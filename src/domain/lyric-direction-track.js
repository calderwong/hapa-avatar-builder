import crypto from "node:crypto";

export const LYRIC_DIRECTION_SCHEMA = "hapa.director.lyric-direction.v1";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const roleOf = (section) => {
  const value = `${section.type || ""} ${section.label || ""}`.toLowerCase();
  if (/chorus|hook|drop/.test(value)) return "hook";
  if (/bridge|breakdown/.test(value)) return "bridge";
  if (/intro|instrumental/.test(value)) return "intro";
  if (/outro/.test(value)) return "outro";
  return "verse";
};
const placementFor = (roi = {}) => {
  const occupied = new Set(roi.occupiedRegions || []);
  if (occupied.has("right")) return "lower-left";
  if (occupied.has("left")) return "lower-right";
  if (occupied.has("lower")) return "right-rail";
  if (occupied.has("center")) return "lower-third-safe-band";
  return "lower-third-safe-band";
};

export function buildLyricDirectionTrack({ sections = [], lyricCues = [], mediaSlots = [], mediaROIs = {} } = {}) {
  const plans = sections.map((section, index) => {
    const start = Number(section.startSeconds);
    const end = Number(section.endSeconds);
    const lines = lyricCues.filter((line) => Number(line.startSeconds) < end && Number(line.endSeconds) > start);
    const confidence = lines.length ? Math.min(...lines.map((line) => Number(line.confidence ?? 0))) : 1;
    const media = mediaSlots.find((slot) => Number(slot.startSeconds) < end && Number(slot.endSeconds) > start);
    const roi = mediaROIs[media?.media?.id] || media?.media?.roi || { status: "unknown", occupiedRegions: [] };
    const role = roleOf(section);
    let mode = role === "hook" ? "stacked-echo" : role === "bridge" ? "scanline-ribbon" : role === "intro" && !lines.length ? "no-text" : "signal-karaoke";
    if (media?.media?.sourceKind === "pure-visualizer") mode = role === "hook" ? "stacked-echo" : "phrase-window";
    if ((roi.occupiedRegions || []).length) mode = role === "hook" ? "stacked-echo" : "orbit-caption";
    const truthStatus = confidence < 0.6 ? "low-confidence-calm" : lines.some((line) => /synthetic|inferred/i.test(line.source || "")) ? "inferred-timing-labeled" : "canonical-timing";
    if (confidence < 0.6 && mode !== "no-text") mode = "phrase-window";
    const exactWords = lines.flatMap((line) => (line.words || []).map((word) => ({ lineId: line.id, text: word.text, startSeconds: Number(word.startSeconds), endSeconds: Number(word.endSeconds) })));
    return {
      id: `lyric-direction:${hash([section.id, mode, placementFor(roi)]).slice(0, 16)}`,
      sectionId: section.id,
      startSeconds: start,
      endSeconds: end,
      mode,
      placement: placementFor(roi),
      motionPreset: confidence < 0.6 ? "calm-no-jitter" : role === "hook" ? "hook-echo" : "word-progress",
      timing: { confidence, truthStatus, exactWordWindowsPreserved: true, words: exactWords },
      mediaContext: { mediaId: media?.media?.id || null, sourceKind: media?.media?.sourceKind || "none", roiStatus: roi.status || ((roi.occupiedRegions || []).length ? "declared" : "unknown"), occupiedRegions: roi.occupiedRegions || [], safeRegionInfluencedPlacement: (roi.occupiedRegions || []).length > 0 },
      changeBoundary: { kind: "section-boundary", atSeconds: start },
    };
  });
  return { schemaVersion: LYRIC_DIRECTION_SCHEMA, modes: ["signal-karaoke", "stacked-echo", "orbit-caption", "phrase-window", "scanline-ribbon", "no-text"], sectionCount: plans.length, sections: plans };
}

export function validateLyricDirectionTrack(track, lyricCues = []) {
  const errors = [];
  const sourceWords = lyricCues.flatMap((line) => (line.words || []).map((word) => `${Number(word.startSeconds)}:${Number(word.endSeconds)}:${word.text}`));
  const directedWords = track.sections.flatMap((section) => section.timing.words).map((word) => `${word.startSeconds}:${word.endSeconds}:${word.text}`);
  for (const section of track?.sections || []) {
    if (section.changeBoundary?.kind !== "section-boundary" || section.changeBoundary.atSeconds !== section.startSeconds) errors.push(`${section.id}:mid-section-mode-change`);
    if (!track.modes.includes(section.mode)) errors.push(`${section.id}:unknown-mode`);
    if (section.timing.confidence < 0.6 && (section.motionPreset !== "calm-no-jitter" || section.timing.truthStatus !== "low-confidence-calm")) errors.push(`${section.id}:unsafe-low-confidence-motion`);
    if (section.mediaContext.safeRegionInfluencedPlacement && section.placement === "lower-third-safe-band" && section.mediaContext.occupiedRegions.includes("lower")) errors.push(`${section.id}:roi-overlap`);
  }
  if (!sourceWords.every((word) => directedWords.includes(word))) errors.push("exact-word-windows-lost");
  return { ok: errors.length === 0, errors };
}
