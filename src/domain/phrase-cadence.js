import crypto from "node:crypto";

export const PHRASE_CADENCE_SCHEMA = "hapa.director.phrase-cadence.v1";
const hash = (value) => crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
const roleOf = (section) => {
  const value = `${section.type || ""} ${section.label || ""}`.toLowerCase();
  if (/chorus|hook|drop/.test(value)) return /drop/.test(value) ? "drop" : "hook";
  if (/bridge|breakdown/.test(value)) return "bridge";
  if (/outro|ending/.test(value)) return "outro";
  if (/verse/.test(value)) return "verse";
  return "intro";
};
const grammars = {
  intro: { range: [0.12, 0.24], hold: "establish-and-breathe", peak: "first-vocal-reveal", transitions: ["materialize", "scanline-dissolve"] },
  verse: { range: [0.18, 0.34], hold: "hold-through-phrase-then-answer", peak: "phrase-answer", transitions: ["crossfade", "light-sweep"] },
  hook: { range: [0.3, 0.5], hold: "motif-repeat-with-one-hero-hold", peak: "hook-title-and-deck-reveal", transitions: ["deck-swap", "scanline-dissolve", "crossfade"] },
  drop: { range: [0.36, 0.62], hold: "syncopated-impact-bursts", peak: "drop-reveal", transitions: ["shutter", "light-sweep"] },
  bridge: { range: [0.12, 0.26], hold: "strip-down-and-ringout", peak: "single-human-focus", transitions: ["slow-crossfade", "temporal-echo"] },
  outro: { range: [0.1, 0.22], hold: "final-ringout", peak: "last-card", transitions: ["slow-crossfade", "fade-to-black-final-only"] },
};

export function buildPhraseCadence({ sections = [], editCues = [], beatTimes = [], durationSeconds = Infinity, minimumTailSeconds = 0.75 } = {}) {
  const normalizedSections = [];
  for (const source of [...sections].sort((a, b) => a.startSeconds - b.startSeconds)) {
    const section = { ...source, mergedSectionIds: [] };
    const sectionDuration = Number(section.endSeconds) - Number(section.startSeconds);
    if (sectionDuration < minimumTailSeconds && normalizedSections.length) {
      const previous = normalizedSections.at(-1);
      previous.endSeconds = Math.max(Number(previous.endSeconds), Number(section.endSeconds));
      previous.mergedSectionIds.push(section.id);
      continue;
    }
    normalizedSections.push(section);
  }
  const plans = normalizedSections.map((section, sectionIndex) => {
    const role = roleOf(section);
    const grammar = grammars[role];
    const start = Number(section.startSeconds);
    const end = Math.min(durationSeconds, Number(section.endSeconds));
    const candidates = editCues.filter((cue) => Number(cue.atSeconds) > start + 0.2 && Number(cue.atSeconds) < end - 0.2).sort((a, b) => a.atSeconds - b.atSeconds);
    const minGap = 1 / grammar.range[1];
    const cuts = [{ id: `cadence:${hash([section.id, start]).slice(0, 12)}`, atSeconds: start, cueId: `section-start:${section.id}`, reason: "section-boundary", syncopation: false }];
    for (const cue of candidates) {
      if (cue.atSeconds - cuts.at(-1).atSeconds < minGap) continue;
      const nearBeat = beatTimes.some((beat) => Math.abs(Number(beat) - Number(cue.atSeconds)) <= 0.08);
      cuts.push({ id: `cadence:${hash([section.id, cue.id]).slice(0, 12)}`, atSeconds: Number(cue.atSeconds), cueId: cue.id, reason: cue.source || cue.type || "approved-phrase-cue", syncopation: !nearBeat, syncopationLabel: nearBeat ? null : "intentional-off-beat-phrase-cut" });
    }
    let tailRepair = section.mergedSectionIds.length ? { action: "merge-short-section-fragments", mergedSectionIds: section.mergedSectionIds, minimumTailSeconds } : null;
    if (cuts.length > 1 && end - cuts.at(-1).atSeconds < minimumTailSeconds) {
      const removed = cuts.pop();
      tailRepair = { ...(tailRepair || {}), action: tailRepair ? "merge-short-sections-and-tail" : "merge-tail-into-previous-hold", removedCutId: removed.id, tailSeconds: end - removed.atSeconds };
    }
    const intervals = cuts.map((cut, index) => ({ startSeconds: cut.atSeconds, endSeconds: cuts[index + 1]?.atSeconds ?? end })).filter((row) => row.endSeconds > row.startSeconds);
    return {
      id: `cadence-section:${hash(section.id || sectionIndex).slice(0, 12)}`,
      sectionId: section.id,
      sectionRole: role,
      startSeconds: start,
      endSeconds: end,
      targetCutDensityPerSecond: { min: grammar.range[0], max: grammar.range[1] },
      actualCutDensityPerSecond: cuts.length > 1 ? (cuts.length - 1) / Math.max(0.001, end - start) : 0,
      holdStrategy: grammar.hold,
      visualPeak: grammar.peak,
      transitionGrammar: grammar.transitions,
      cuts,
      holds: intervals.map((row, index) => ({ ...row, strategy: index === intervals.length - 1 ? "section-ringout" : grammar.hold })),
      tailRepair,
    };
  });
  return { schemaVersion: PHRASE_CADENCE_SCHEMA, minimumTailSeconds, truth: "approved-section-and-phrase-cues", sourceSectionCount: sections.length, sectionCount: plans.length, mergedShortSectionCount: sections.length - plans.length, sections: plans };
}

export function validatePhraseCadence(track, { beatTimes = [] } = {}) {
  const errors = [];
  for (const section of track?.sections || []) {
    if (!section.holdStrategy || !section.visualPeak || !section.transitionGrammar?.length) errors.push(`${section.id}:missing-section-grammar`);
    const intervals = section.holds || [];
    if (intervals.some((row) => row.endSeconds - row.startSeconds < track.minimumTailSeconds && row.endSeconds === section.endSeconds)) errors.push(`${section.id}:short-tail`);
    const beatCuts = section.cuts.filter((cut) => beatTimes.some((beat) => Math.abs(Number(beat) - cut.atSeconds) <= 0.08)).length;
    const beatsInSection = beatTimes.filter((beat) => beat >= section.startSeconds && beat < section.endSeconds).length;
    if (beatsInSection > 2 && beatCuts >= beatsInSection) errors.push(`${section.id}:cuts-every-beat`);
    if (section.cuts.some((cut) => cut.syncopation && !cut.syncopationLabel)) errors.push(`${section.id}:unlabeled-syncopation`);
    if (section.cuts.some((cut) => !cut.cueId)) errors.push(`${section.id}:uncited-cut`);
  }
  return { ok: errors.length === 0, errors };
}
