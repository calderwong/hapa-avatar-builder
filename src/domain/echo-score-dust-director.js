// Score Dust director (P2 item 15): a local, deterministic writer of
// directions. It never calls a model provider; it reads the evidence it is
// given and explains every choice so a person can keep or discard it.
//
// - suggestDustDirection: a starting direction from the Song's mood and tags,
//   the Atlas structure (repeats, energy, lifts, tempo) and the lyrics.
// - interpretDustCue: plain-language cues ("orbit during the chorus, neon
//   colours, make the second chorus jellyfish") → direction edits.
// Section names (chorus, verse, bridge) are inferred from repeats and energy
// and are always reported as "likely", never as verified structure.
import { DUST_FORMATION_FAMILIES } from "./echo-dust-swarm.js";
import { ECHO_VISUAL_SCORE_CAMERA_MODES, ECHO_VISUAL_SCORE_EVENT_RESPONSES, placeCameraMove } from "./echo-visual-score.js";
import { DUST_COLOUR_MODES, DUST_COLOUR_PRESETS } from "./echo-score-dust-colour.js";
import { splitSectionAt, mergeSectionBoundary, editSectionCue } from "./echo-score-dust-sections.js";
import { DUST_LYRIC_FONTS } from "./echo-score-dust-lyrics.js";

export const SCORE_DUST_DIRECTOR_SCHEMA = "hapa.echo.score-dust.director.v1";
const round = (v, d = 2) => Number(Number(v).toFixed(d));
const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const MOODS = Object.freeze([
  { words: ["dark", "sad", "melanchol", "grief", "lonely", "lost", "haunt", "mourn", "blue"], preset: "ice", mode: "depth", background: { kind: "gradient", colour: "#0a1224", colour2: "#020409", shape: "radial" }, lift: "gather", label: "melancholy" },
  { words: ["angry", "rage", "fierce", "fire", "burn", "fight", "war", "rebel"], preset: "ember", mode: "speed", background: { kind: "palette", shape: "radial" }, lift: "shock", label: "fierce" },
  { words: ["joy", "happy", "bright", "sun", "summer", "celebrat", "euphor", "dance", "party"], preset: "sunset", mode: "frequency", background: { kind: "palette", shape: "radial" }, lift: "shock", label: "bright" },
  { words: ["dream", "float", "calm", "gentle", "soft", "peace", "lullab", "ambient", "tender"], preset: "ice", mode: "height", background: { kind: "gradient", colour: "#101828", colour2: "#03050a", shape: "linear" }, lift: "gather", label: "dreamy" },
  { words: ["electr", "neon", "cyber", "synth", "club", "rave", "techno", "edm"], preset: "neon", mode: "frequency", background: { kind: "black" }, lift: "shock", label: "electric" },
  { words: ["hope", "rise", "uplift", "anthem", "triumph", "home", "return", "love"], preset: "sunset", mode: "palette", background: { kind: "palette", shape: "radial" }, lift: "shock", label: "uplifting" },
]);

/** Likely section roles from repeats and energy (evidence, not labels). */
export function sectionRoles(timeline) {
  const sections = timeline?.sections || [];
  const groups = new Map();
  for (const s of sections) {
    const row = groups.get(s.repeatGroup) || { group: s.repeatGroup, count: 0, energy: 0, seconds: 0, first: s.start };
    row.count++; row.seconds += s.end - s.start; row.energy += s.meanIntensity * (s.end - s.start); groups.set(s.repeatGroup, row);
  }
  const rows = [...groups.values()].map((r) => ({ ...r, energy: r.energy / Math.max(1e-6, r.seconds) }));
  const repeated = rows.filter((r) => r.count > 1).sort((a, b) => b.energy - a.energy || b.count - a.count);
  const chorus = repeated[0] || null, verse = repeated.find((r) => r !== chorus) || null;
  const middle = sections.filter((s) => s.index > 0 && s.index < sections.length - 1 && groups.get(s.repeatGroup).count === 1 && s.start > (timeline.durationSeconds || 0) * 0.4);
  return {
    chorus: chorus && { group: chorus.group, reason: `most energetic repeated group (${chorus.count}×, energy ${round(chorus.energy)})` },
    verse: verse && { group: verse.group, reason: `other repeated group (${verse.count}×, energy ${round(verse.energy)})` },
    bridge: middle[0] ? { group: middle[0].repeatGroup, reason: `one-off section in the second half at ${clock(middle[0].start)}` } : null,
    intro: sections[0] ? { sectionId: sections[0].id, group: sections[0].repeatGroup, reason: "first section" } : null,
    outro: sections.at(-1) ? { sectionId: sections.at(-1).id, group: sections.at(-1).repeatGroup, reason: "last section" } : null,
  };
}

/** A starting direction from mood, tags, structure and lyrics, with reasons. */
export function suggestDustDirection({ timeline, mood = "", tags = [], lyricLines = null, title = "" } = {}) {
  const text = [mood, ...(tags || []), title].join(" ").toLowerCase(), reasons = [], direction = {};
  const scored = MOODS.map((m) => ({ m, hits: m.words.filter((w) => text.includes(w)).length })).sort((a, b) => b.hits - a.hits);
  const energy = (timeline.sections || []).reduce((s, x) => s + x.meanIntensity * (x.end - x.start), 0) / Math.max(1e-6, timeline.durationSeconds);
  const pick = scored[0].hits ? scored[0].m : energy > 0.55 ? MOODS[4] : MOODS[3];
  reasons.push(scored[0].hits ? `mood/tags read as ${pick.label} (${pick.words.filter((w) => text.includes(w)).join(", ")})` : `no mood words; average energy ${round(energy)} → ${pick.label}`);
  direction.colour = { preset: pick.preset, mode: pick.mode };
  if (pick.background.kind !== "black") direction.background = pick.background;
  const lifts = (timeline.events || []).filter((e) => e.kind === "lift").length;
  if (lifts) { direction.eventResponses = { lift: pick.lift }; reasons.push(`${lifts} energy lift${lifts === 1 ? "" : "s"} → ${pick.lift}`); }
  const roles = sectionRoles(timeline);
  if (roles.chorus) {
    direction.families = { [roles.chorus.group]: energy > 0.5 ? "attractor" : "jellyfish" };
    direction.cameraMoves = [];
    for (const s of timeline.sections.filter((x) => x.repeatGroup === roles.chorus.group)) direction.cameraMoves = placeCameraMove(direction.cameraMoves, { mode: "orbit", start: s.start, end: s.end }, { duration: timeline.durationSeconds });
    reasons.push(`likely chorus ${roles.chorus.group} (${roles.chorus.reason}) → ${direction.families[roles.chorus.group]}, orbiting camera`);
  }
  if (roles.verse) { direction.families = { ...(direction.families || {}), [roles.verse.group]: "ring" }; reasons.push(`likely verse ${roles.verse.group} → ring`); }
  if (timeline.tempo?.ambiguous && timeline.tempo.bpm > 140) { direction.playSettings = { pulse: "half" }; reasons.push(`tempo ${round(timeline.tempo.bpm, 1)} BPM is ambiguous → half-time pulse`); }
  const lines = Array.isArray(lyricLines) ? lyricLines.filter((l) => String(l?.text || "").trim()) : [];
  if (lines.length) {
    const counts = new Map(); for (const l of lines) { const k = String(l.text).toLowerCase().trim(); counts.set(k, (counts.get(k) || 0) + 1); }
    const repeatedLines = [...counts.values()].filter((c) => c > 1).length;
    direction.lyrics = { pick: "hooks", max: repeatedLines >= 3 ? 6 : 4, font: pick.label === "melancholy" || pick.label === "dreamy" ? "serif" : "sans" };
    reasons.push(`${lines.length} timed lyric lines, ${repeatedLines} repeated → up to ${direction.lyrics.max} hooks in ${direction.lyrics.font}`);
  } else reasons.push("no timed lyrics → shapes only");
  return { schemaVersion: SCORE_DUST_DIRECTOR_SCHEMA, direction, reasons, roles, evidence: { mood, tags, energy: round(energy), lifts, tempo: timeline.tempo?.bpm ?? null } };
}

// ---------------------------------------------------------------------------
// Plain-language cues.

const COLOUR_WORDS = { neon: "neon", monochrome: "monochrome", "black and white": "monochrome", greyscale: "monochrome", grayscale: "monochrome", sunset: "sunset", ice: "ice", icy: "ice", cold: "ice", ember: "ember", fire: "ember", fiery: "ember", warm: "sunset", red: "red", green: "green", blue: "blue", album: "album" };
const MODE_WORDS = [["by frequency", "frequency"], ["by pitch", "frequency"], ["by speed", "speed"], ["by depth", "depth"], ["along the shape", "height"], ["by height", "height"], ["from the picture", "picture"], ["picture colou", "picture"], ["single palette", "palette"]];
const CAMERA_WORDS = [["push in", "push"], ["push", "push"], ["zoom in", "push"], ["orbit", "orbit"], ["circle", "orbit"], ["spin around", "orbit"], ["drift", "drift"], ["hold", "hold"], ["still", "hold"], ["steady", "hold"], ["lock", "hold"]];
const STEMS = { drums: "drums", drum: "drums", percussion: "drums", bass: "bass", vocals: "vocals", vocal: "vocals", voice: "vocals", singer: "vocals", keys: "harmony", synth: "harmony", synths: "harmony", guitar: "harmony", guitars: "harmony", harmony: "harmony", piano: "harmony", strings: "harmony" };
const MOMENTS = { lift: "lift", lifts: "lift", drop: "lift", drops: "lift", fall: "fall", falls: "fall", build: "build", builds: "build", break: "break", breaks: "break", change: "change", changes: "change" };
const ORDINALS = { first: 0, second: 1, third: 2, fourth: 3, "1st": 0, "2nd": 1, "3rd": 2, "4th": 3, last: -1, final: -1 };
const NAMED_HEX = { red: "#7a0b12", blue: "#0b1f5a", green: "#0b3d22", purple: "#2a0b4a", violet: "#2a0b4a", black: "#000000", white: "#f0f0f0", navy: "#081436", gold: "#4a3a08", orange: "#5a2a06", pink: "#4a0b30", grey: "#202226", gray: "#202226" };

function parseTime(text) {
  const m = text.match(/(\d+):(\d{1,2}(?:\.\d+)?)/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const s = text.match(/(\d+(?:\.\d+)?)\s*(?:s|sec|secs|seconds)\b/);
  return s ? Number(s[1]) : null;
}
function parseRange(text) {
  const m = text.match(/from\s+(\S+)\s+(?:to|until|till|-)\s+(\S+)/);
  if (!m) return null;
  const a = parseTime(m[1].includes(":") || /s$/.test(m[1]) ? m[1] : `${m[1]}s`), b = parseTime(m[2].includes(":") || /s$/.test(m[2]) ? m[2] : `${m[2]}s`);
  return a !== null && b !== null && b > a ? { start: a, end: b } : null;
}

/** Sections a cue clause names: "the chorus", "the second chorus", "the intro", "group-B", "the section at 1:20". */
function targetsIn(clause, timeline, roles) {
  const sections = timeline.sections || [];
  const at = clause.match(/section (?:at|around) (\S+)/);
  if (at) { const t = parseTime(at[1]); const s = t === null ? null : sections.find((x) => t >= x.start && t < x.end); return s ? { kind: "sections", sections: [s], label: `the section at ${clock(t)}` } : null; }
  const group = clause.match(/group[- ]([a-z0-9]+)/);
  if (group) { const g = `group-${group[1].toUpperCase()}`; const list = sections.filter((s) => s.repeatGroup === g); return list.length ? { kind: "group", group: g, sections: list, label: g } : null; }
  for (const role of ["chorus", "verse", "bridge", "intro", "outro"]) {
    if (!new RegExp(`\\b${role}(e?s)?\\b`).test(clause) || !roles[role]) continue;
    const list = sections.filter((s) => (roles[role].sectionId ? s.id === roles[role].sectionId : s.repeatGroup === roles[role].group));
    const ordinal = Object.keys(ORDINALS).find((w) => new RegExp(`\\b${w}\\b`).test(clause));
    if (ordinal) { const i = ORDINALS[ordinal], s = i < 0 ? list.at(-1) : list[i]; return s ? { kind: "sections", sections: [s], label: `the ${ordinal} likely ${role}` } : null; }
    return { kind: roles[role].sectionId ? "sections" : "group", group: roles[role].group, sections: list, label: `the likely ${role}${list.length > 1 ? `es (${roles[role].group})` : ""}`.replace("chorues", "choruses") };
  }
  return null;
}

/**
 * Interpret a plain-language cue against the current direction.
 * → { direction, steps: [{said, did}], unknown: [clause], understood }
 */
export function interpretDustCue(text, { timeline, score = null, direction = {} } = {}) {
  let next = structuredClone(direction || {});
  const steps = [], unknown = [], roles = sectionRoles(timeline), duration = timeline.durationSeconds;
  const cueFor = (section) => (score?.cues || []).find((c) => c.sectionId === section.id && Math.abs(c.start - section.start) < 0.05)?.id || `cue-${section.id}`;
  const clauses = String(text || "").toLowerCase().replace(/[“”"']/g, "").split(/[,;.\n]|\bthen\b|\band also\b|\band\b(?=\s+(?:make|turn|use|go|show|hide|no|more|less|orbit|hold|push|drift|split|merge|add|set|put|give|calm|reduce))/).map((c) => c.trim()).filter(Boolean);
  for (const clause of clauses) {
    const did = [];
    const target = targetsIn(clause, timeline, roles), range = parseRange(clause);
    // Words.
    if (/\bno (words|lyrics|text)\b|\bhide (the )?(words|lyrics)\b/.test(clause)) { next.lyrics = { ...(next.lyrics || {}), pick: "off" }; delete next.lyricPhrases; did.push("no lyric words"); }
    if (/word[- ]by[- ]word|one word at a time/.test(clause)) { next.lyrics = { ...(next.lyrics || {}), wordByWord: !/\bno word|\bnot word/.test(clause) }; did.push(`word by word ${next.lyrics.wordByWord ? "on" : "off"}`); }
    const font = Object.keys(DUST_LYRIC_FONTS).find((f) => new RegExp(`\\b${f}\\b`).test(clause) && /(font|words|lyrics|type|letters)/.test(clause));
    if (font) { next.lyrics = { ...(next.lyrics || {}), font }; did.push(`${font} font for words`); }
    if (/\b(upper ?case|all caps|capitals)\b/.test(clause)) { next.lyrics = { ...(next.lyrics || {}), textCase: "upper" }; did.push("upper-case words"); }
    const hooks = clause.match(/(?:up to |show |max(?:imum)? )(\d+) (?:hooks|lines|phrases)/);
    if (hooks) { next.lyrics = { ...(next.lyrics || {}), pick: "hooks", max: Math.min(16, Math.max(1, Number(hooks[1]))) }; did.push(`up to ${next.lyrics.max} lyric hooks`); }
    // Colour and background.
    const isBackground = /\bbackground\b|\bbackdrop\b/.test(clause);
    if (isBackground) {
      const hex = clause.match(/#[0-9a-f]{6}/), named = Object.keys(NAMED_HEX).find((n) => new RegExp(`\\b${n}\\b`).test(clause));
      if (/follow|section colou?r|palette/.test(clause)) { next.background = { kind: "palette", shape: "radial" }; did.push("background follows section colours"); }
      else if (/\b(black|none|clear|off)\b/.test(clause) && !hex) { delete next.background; did.push("black background"); }
      else if (/gradient/.test(clause)) { next.background = { kind: "gradient", colour: hex?.[0] || NAMED_HEX[named] || "#0b1026", colour2: "#020409", shape: /linear|top/.test(clause) ? "linear" : "radial" }; did.push("gradient background"); }
      else if (hex || named) { next.background = { kind: "solid", colour: hex?.[0] || NAMED_HEX[named] }; did.push(`solid ${hex?.[0] || named} background`); }
    } else {
      const colourWord = Object.keys(COLOUR_WORDS).sort((a, b) => b.length - a.length).find((w) => new RegExp(`\\b${w}\\b`).test(clause) && /(colou?r|palette|look|make it|go |tone|dust)/.test(clause));
      if (colourWord) { next.colour = { ...(next.colour || {}), preset: COLOUR_WORDS[colourWord] }; did.push(`${COLOUR_WORDS[colourWord]} colours`); }
      const mode = MODE_WORDS.find(([w]) => clause.includes(w));
      if (mode && DUST_COLOUR_MODES.includes(mode[1])) { next.colour = { ...(next.colour || {}), mode: mode[1] }; did.push(`colour ${mode[0]}`); }
    }
    // Shapes for a named section or group.
    const family = DUST_FORMATION_FAMILIES.find((f) => new RegExp(`\\b${f}s?\\b`).test(clause));
    if (family && target) {
      if (target.kind === "group") { next.families = { ...(next.families || {}), [target.group]: family }; did.push(`${target.label} → ${family}`); }
      else for (const s of target.sections) { next.sections = editSectionCue(next.sections || {}, cueFor(s), { family }); did.push(`${target.label} (${clock(s.start)}) → ${family}`); }
    } else if (family && !target) unknown.push(`${clause} (which section? say “the chorus”, “the second verse” or “the section at 1:20”)`);
    // Camera.
    const camera = CAMERA_WORDS.find(([w]) => new RegExp(`\\b${w}\\b`).test(clause));
    if (camera && ECHO_VISUAL_SCORE_CAMERA_MODES.includes(camera[1]) && !isBackground && (target || range || /camera/.test(clause))) {
      const spans = range ? [range] : target ? target.sections.map((s) => ({ start: s.start, end: s.end })) : [{ start: 0, end: duration }];
      for (const span of spans) next.cameraMoves = placeCameraMove(next.cameraMoves || [], { mode: camera[1], ...span }, { duration });
      did.push(`camera ${camera[1]} ${range ? `${clock(range.start)}–${clock(range.end)}` : target ? `during ${target.label}` : "for the whole song"}`);
    }
    // Moments.
    const moment = Object.keys(MOMENTS).find((w) => new RegExp(`\\b${w}\\b`).test(clause));
    const response = ECHO_VISUAL_SCORE_EVENT_RESPONSES.find((r) => new RegExp(`\\b${r}\\b`).test(clause)) || (/\bnothing\b/.test(clause) ? "none" : /\bexplode|\bburst\b/.test(clause) ? "shock" : null);
    if (moment && response && /\bon\b|\bat\b|\bfor\b|\bwhen\b/.test(clause)) { next.eventResponses = { ...(next.eventResponses || {}), [MOMENTS[moment]]: response }; did.push(`${response} on ${MOMENTS[moment]}s`); }
    // Instruments.
    const stem = Object.keys(STEMS).find((w) => new RegExp(`\\b${w}\\b`).test(clause));
    const amount = /\b(no|mute|ignore|without)\b/.test(clause) ? 0 : /\b(less|softer|quieter|lower)\b/.test(clause) ? 0.4 : /\b(more|louder|stronger|bigger|full)\b/.test(clause) ? 1 : null;
    if (stem && amount !== null) { next.stemResponses = { ...(next.stemResponses || {}), [STEMS[stem]]: amount }; did.push(`${STEMS[stem]} response ${amount}`); }
    // Comfort and density.
    if (/reduced motion|less motion|calmer motion|motion sick/.test(clause)) { next.playSettings = { ...(next.playSettings || {}), reducedMotion: true }; did.push("reduced motion"); }
    if (/no flash|without flash|stop flash/.test(clause)) { next.playSettings = { ...(next.playSettings || {}), flashLimitPerSecond: 0 }; did.push("no bright flashes"); }
    if (/\b(busier|denser|more dust|thicker)\b/.test(clause)) { next.maxDensity = 1; did.push("full density"); }
    if (/\b(sparser|thinner|less dust|lighter)\b/.test(clause)) { next.maxDensity = 0.6; did.push("density capped at 0.6"); }
    // Section boundaries.
    const split = clause.match(/\bsplit\b.*?(\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?\s*s\b)/), merge = clause.match(/\bmerge\b.*?(\d+:\d{1,2}(?:\.\d+)?|\d+(?:\.\d+)?\s*s\b)/);
    if (split) { const t = parseTime(split[1]); if (t !== null) { next.sections = splitSectionAt(next.sections || {}, t); did.push(`split at ${clock(t)}`); } }
    if (merge) { const t = parseTime(merge[1]); if (t !== null) { next.sections = mergeSectionBoundary(next.sections || {}, t); did.push(`merge the boundary at ${clock(t)}`); } }
    if (did.length) steps.push({ said: clause, did });
    else if (!unknown.some((u) => u.startsWith(clause))) unknown.push(clause);
  }
  return { schemaVersion: SCORE_DUST_DIRECTOR_SCHEMA, direction: next, steps, unknown, understood: steps.length > 0, roles };
}

/** Example cues shown to people (each is understood by interpretDustCue). */
export const SCORE_DUST_CUE_EXAMPLES = Object.freeze([
  "orbit during the chorus, neon colours",
  "make the second chorus jellyfish",
  "background follows section colours",
  "gather on lifts, less drums",
  "word by word in serif font",
  "hold the camera from 1:10 to 1:30",
]);
export const SCORE_DUST_PRESET_NAMES = Object.freeze(Object.keys(DUST_COLOUR_PRESETS));
