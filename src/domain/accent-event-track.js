import {sha256} from "@noble/hashes/sha2.js";
import {bytesToHex} from "@noble/hashes/utils.js";

export const ACCENT_EVENT_SCHEMA = "hapa.director.accent-event-track.v1";
export const SAFE_ACCENT_LIMITS = Object.freeze({
  maxFlashHz: 3,
  maxLuminanceDelta: 0.2,
  maxFrameArea: 0.25,
  maxDurationSeconds: 0.42,
  minFlashSeparationSeconds: 1 / 3,
});

const stableNumber = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const digest = (value) => bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));
const kinds = ["scan", "glitch", "bloom", "shutter", "deck-swap", "flicker"];
// Only generate targets that have an executable presentation surface. Legacy
// authored card-layer events retain their source identity and report unresolved.
const targets = ["visualizer-layer", "media-layer", "lyric-layer"];

export const SECTION_ACCENT_POLICY = "hapa.director.section-accent-budget.v1";

export function sectionAccentBudget(section = {}, density = .5) {
  const role = String(section.type || section.sectionRole || "").toLowerCase();
  const energy = Number.isFinite(Number(section.energy)) ? Number(section.energy) : /chorus|hook|drop/.test(role) ? .85 : /intro|outro|bridge|break/.test(role) ? .2 : .5;
  const band = energy < .35 ? "quiet" : energy >= .75 ? "peak" : "steady";
  const amount = Math.max(0, Math.min(1, stableNumber(density, .5)));
  return { schemaVersion: SECTION_ACCENT_POLICY, sectionId: section.id || "unsectioned", band, windowSeconds: 8,
    maxEvents: Math.ceil(({ quiet: 3, steady: 6, peak: 10 })[band] * amount),
    minimumSeparationSeconds: ({ quiet: 1.2, steady: .65, peak: .4 })[band] };
}

function accentGesture(cue) {
  const kind = String(cue.kind || "").replace(/_/g, "-");
  if (kind === "downbeat") return { kind: "bloom", target: "visualizer-layer", role: "downbeat-weight", priority: 4 };
  if (kind === "vocal-entry") return { kind: "scan", target: "lyric-layer", role: "vocal-entry-reveal", priority: 5 };
  if (kind === "phrase-end") return { kind: "bloom", target: "media-layer", role: "phrase-release", priority: 3 };
  if (kind === "phrase" || kind === "phrase-start") return { kind: "scan", target: "lyric-layer", role: "lyric-phrase-reveal", priority: 2 };
  return { priority: 1, role: "source-accent" };
}

/** Admit musical gestures before dense onset candidates. A rolling window
 * crosses section boundaries; entering a quiet section cannot reset the count. */
export function selectSectionAccentCues(cues, { sections = [], density = .5 } = {}) {
  const sectionAt = time => sections.find(s => Number(s.startSeconds ?? s.start) <= time && Number(s.endSeconds ?? s.end) > time) || {};
  const selected = [], decisions = [];
  const candidates = [...cues].sort((a,b) => accentGesture(b).priority - accentGesture(a).priority || a.atSeconds-b.atSeconds || String(a.id).localeCompare(String(b.id)));
  const upperBound = (rows,time) => { let low=0,high=rows.length;while(low<high){const mid=(low+high)>>>1;if(rows[mid].atSeconds<=time)low=mid+1;else high=mid;}return low; };
  const admitted = candidate => {
    const position=upperBound(selected,candidate.atSeconds), budget=sectionAccentBudget(sectionAt(candidate.atSeconds),density);
    if(!budget.maxEvents)return -1;
    for(const neighbor of [selected[position-1],selected[position]].filter(Boolean)) {
      if(Math.abs(neighbor.atSeconds-candidate.atSeconds)<Math.max(budget.minimumSeparationSeconds,sectionAccentBudget(sectionAt(neighbor.atSeconds),density).minimumSeparationSeconds)-1e-8)return -1;
    }
    const timeline=[...selected.slice(0,position),candidate,...selected.slice(position)];
    for(let i=position;i<timeline.length&&timeline[i].atSeconds<candidate.atSeconds+8;i++){
      const current=timeline[i],limit=sectionAccentBudget(sectionAt(current.atSeconds),density);
      if(i-upperBound(timeline,current.atSeconds-limit.windowSeconds)+1>limit.maxEvents)return -1;
    }
    return position;
  };
  for(const cue of candidates) {
    const position=admitted(cue),accepted=position>=0,budget=sectionAccentBudget(sectionAt(cue.atSeconds),density);
    if(accepted)selected.splice(position,0,cue);
    decisions.push({cueId:cue.id,atSeconds:cue.atSeconds,accepted,reason:accepted?"within-section-budget":"section-density-or-spacing",budget,gestureRole:accentGesture(cue).role});
  }
  return { cues:selected.sort((a,b)=>a.atSeconds-b.atSeconds||String(a.id).localeCompare(String(b.id))),decisions };
}

export function buildAccentEventTrack({ cues = [], density = 0.5, durationSeconds = Infinity, reducedMotion = false, sections = [] } = {}) {
  const eligible = cues
    .filter((cue) => cue?.approved !== false && stableNumber(cue.atSeconds, -1) >= 0 && stableNumber(cue.atSeconds) <= durationSeconds)
    .filter((cue) => (cue.eligibleActions || []).some((action) => action === "accent" || action === "effect"))
    .sort((a, b) => a.atSeconds - b.atSeconds || String(a.id).localeCompare(String(b.id)));
  const admission = selectSectionAccentCues(eligible, { sections, density });
  const events = [];
  let lastFlash = -Infinity;
  for (let index = 0; index < admission.cues.length; index++) {
    const cue = admission.cues[index];
    const gesture = accentGesture(cue);
    const token = parseInt(digest(cue.id || `${cue.atSeconds}`).slice(0, 8), 16);
    let kind = gesture.kind || kinds[token % kinds.length];
    if (reducedMotion && ["glitch", "shutter", "flicker"].includes(kind)) kind = token % 2 ? "scan" : "bloom";
    const flashBearing = kind === "flicker" || kind === "shutter";
    if (flashBearing && cue.atSeconds - lastFlash < SAFE_ACCENT_LIMITS.minFlashSeparationSeconds) kind = "scan";
    if (kind === "flicker" || kind === "shutter") lastFlash = cue.atSeconds;
    const intensity = Math.max(0.18, Math.min(0.68, stableNumber(cue.evidence?.onset ?? cue.confidence, 0.5) * 0.54 + 0.14));
    events.push({
      id: `accent:${digest([cue.id, kind, index]).slice(0, 16)}`,
      schemaVersion: ACCENT_EVENT_SCHEMA,
      cueId: cue.id,
      atSeconds: stableNumber(cue.atSeconds),
      endSeconds: stableNumber(cue.atSeconds) + Math.min(SAFE_ACCENT_LIMITS.maxDurationSeconds, kind === "deck-swap" ? 0.36 : 0.18),
      kind,
      preset: intensity >= 0.55 ? "safe-strong" : intensity >= 0.35 ? "safe-medium" : "safe-soft",
      intensity,
      target: { scope: "single-layer", layer: gesture.target || targets[(token >>> 4) % targets.length] },
      gestureRole: gesture.role,
      sectionBudget: admission.decisions.find(row=>row.cueId===cue.id)?.budget,
      source: { timingBasis: cue.evidence?.timingBasis || null, timingStatus: cue.evidence?.timingStatus || "source-status-unchanged", source: cue.source || null, confidence: cue.confidence ?? null, kind: cue.kind || "director-hit", stemRole: cue.evidence?.stemRole || "master", signal: cue.evidence?.stemRole ? "onset" : "director" },
      safety: {
        mode: reducedMotion ? "reduced-motion" : "safe-default",
        flashCount: kind === "flicker" || kind === "shutter" ? 1 : 0,
        flashHz: kind === "flicker" || kind === "shutter" ? 3 : 0,
        luminanceDelta: Math.min(SAFE_ACCENT_LIMITS.maxLuminanceDelta, intensity * 0.26),
        frameArea: kind === "bloom" ? 0.25 : 0.16,
        limits: SAFE_ACCENT_LIMITS,
      },
      keyframes: [
        { offset: 0, value: 0 },
        { offset: 0.28, value: intensity },
        { offset: 1, value: 0 },
      ],
    });
  }
  return { schemaVersion: ACCENT_EVENT_SCHEMA, reducedMotion, limits: SAFE_ACCENT_LIMITS, sectionPolicy: SECTION_ACCENT_POLICY, eventCount: events.length, events };
}

export function validateAccentEventTrack(track, { overrideReceipt = null } = {}) {
  const errors = [];
  const warnings = [];
  const flashTimes = [];
  for (const event of track?.events || []) {
    if (!event.cueId) errors.push(`${event.id}:missing-cue`);
    if (event.target?.scope !== "single-layer") errors.push(`${event.id}:full-frame-target`);
    if (!event.source?.stemRole) errors.push(`${event.id}:missing-stem-address`);
    if (!Array.isArray(event.keyframes) || event.keyframes.length < 2) errors.push(`${event.id}:missing-keyframes`);
    const safety = event.safety || {};
    if (safety.flashHz > SAFE_ACCENT_LIMITS.maxFlashHz || safety.luminanceDelta > SAFE_ACCENT_LIMITS.maxLuminanceDelta || safety.frameArea > SAFE_ACCENT_LIMITS.maxFrameArea) warnings.push(`${event.id}:strong-treatment`);
    if (safety.flashCount > 0) flashTimes.push(event.atSeconds);
  }
  for (let i = 1; i < flashTimes.length; i += 1) if (flashTimes[i] - flashTimes[i - 1] < SAFE_ACCENT_LIMITS.minFlashSeparationSeconds - 1e-6) errors.push("flash-density-over-3hz");
  if (warnings.length && !(overrideReceipt?.operator && overrideReceipt?.reason && overrideReceipt?.acknowledgedAt)) errors.push("strong-treatment-missing-operator-override");
  return { ok: errors.length === 0, errors, warnings, overrideAccepted: warnings.length > 0 && errors.length === 0 };
}

export function createAccentOverrideReceipt({ operator, reason, acknowledgedAt, eventIds = [] } = {}) {
  const receipt = { schemaVersion: "hapa.director.accent-safety-override.v1", operator, reason, acknowledgedAt, eventIds: [...eventIds].sort() };
  return { ...receipt, receiptHash: digest(receipt) };
}

/** Recut windows share a rolling budget with preserved neighboring events.
 * Locked/source events stay byte-for-byte intact even if already over budget;
 * that condition is reported and can never justify adding another violation.
 */
export function admitMergedAccentEvents(protectedEvents = [], additions = []) {
  const time = event => stableNumber(event.atSeconds ?? event.startSeconds);
  const budget = event => event.sectionBudget || sectionAccentBudget({}, .5);
  const ordered = rows => [...rows].sort((a, b) => time(a) - time(b) || String(a.id).localeCompare(String(b.id)));
  const violations = rows => {
    const failures = [];
    for (let i = 0; i < rows.length; i++) {
      const current = rows[i], limit = budget(current), at = time(current);
      let left = i;
      while (left > 0 && time(rows[left - 1]) > at - limit.windowSeconds + 1e-8) left--;
      const recent = rows.slice(left, i + 1);
      if (recent.length > limit.maxEvents) failures.push({ id: current.id, reason: 'section-density', involved: recent.map(row => row.id) });
      if (i && at - time(rows[i - 1]) < Math.max(limit.minimumSeparationSeconds, budget(rows[i - 1]).minimumSeparationSeconds) - 1e-8)
        failures.push({ id: current.id, reason: 'section-spacing', involved: [rows[i - 1].id, current.id] });
    }
    return failures;
  };
  let events = ordered(protectedEvents);
  const decisions = [], preservedViolations = violations(events);
  for (const event of ordered(additions)) {
    if (events.some(row => row.id === event.id)) {
      decisions.push({ id: event.id, accepted: false, reasons: ['existing-event-identity-preserved'] });
      continue;
    }
    const candidate = ordered([...events, event]);
    const failures = violations(candidate).filter(row => row.involved.includes(event.id));
    if (!failures.length) events = candidate;
    decisions.push({ id: event.id, accepted: failures.length === 0, reasons: [...new Set(failures.map(row => row.reason))] });
  }
  return { events, receipt: { policy: SECTION_ACCENT_POLICY, decisions, preservedViolations } };
}
