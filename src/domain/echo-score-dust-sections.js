// Per-section editing for Score Dust (P2 item 10). Direction field `sections`:
//
//   { merge: [t], move: [{from, to}], split: [t], cues: { [cueId]: patch } }
//
// Boundary edits apply in that order to the composed cues: merge removes the
// boundary at t, move slides a boundary, split adds one. A cue patch edits one
// occurrence only: family, picture (or null for shape only), palette, density
// and busy range. An edit that would leave a cue shorter than the readable
// minimum is skipped and reported, never forced.
import { DUST_FORMATION_FAMILIES } from "./echo-dust-swarm.js";

export const SECTION_EDIT_TOLERANCE = 0.05;
const MAX_EDITS = 64, MAX_CUE_PATCHES = 128;
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v, d = 3) => Number(Number(v).toFixed(d));
const near = (a, b) => Math.abs(a - b) <= SECTION_EDIT_TOLERANCE;
const validPalette = (colors) => Array.isArray(colors) && colors.length >= 1 && colors.length <= 5 && colors.every((c) => finite(c?.h) && c.h >= 0 && c.h < 360 && finite(c?.s) && c.s >= 0 && c.s <= 1 && finite(c?.l) && c.l >= 0 && c.l <= 1);

export function validateSectionEdits(sections) {
  if (sections === undefined) return [];
  const errors = [];
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return ["sections must be an object."];
  for (const key of Object.keys(sections)) if (!["merge", "move", "split", "cues"].includes(key)) errors.push(`Unknown sections field ${key}.`);
  for (const key of ["merge", "split"]) if (sections[key] !== undefined && (!Array.isArray(sections[key]) || sections[key].length > MAX_EDITS || !sections[key].every((t) => finite(t) && t >= 0))) errors.push(`sections.${key} must be up to ${MAX_EDITS} non-negative times.`);
  if (sections.move !== undefined && (!Array.isArray(sections.move) || sections.move.length > MAX_EDITS || !sections.move.every((m) => finite(m?.from) && finite(m?.to) && m.from >= 0 && m.to >= 0))) errors.push(`sections.move must be up to ${MAX_EDITS} {from, to} times.`);
  if (sections.cues !== undefined) {
    if (!sections.cues || typeof sections.cues !== "object" || Array.isArray(sections.cues) || Object.keys(sections.cues).length > MAX_CUE_PATCHES) errors.push(`sections.cues maps up to ${MAX_CUE_PATCHES} cue ids to edits.`);
    else for (const [id, patch] of Object.entries(sections.cues)) {
      if (!patch || typeof patch !== "object" || Array.isArray(patch) || Object.keys(patch).some((k) => !["family", "image", "palette", "density", "busy"].includes(k))) { errors.push(`Cue edit ${id} allows family, image, palette, density and busy.`); continue; }
      if (patch.family !== undefined && !DUST_FORMATION_FAMILIES.includes(patch.family)) errors.push(`Unknown family ${patch.family} for ${id}.`);
      if (patch.image !== undefined && patch.image !== null && (typeof patch.image?.assetId !== "string" || !patch.image.assetId || (patch.image.kind !== undefined && !["text", "svg"].includes(patch.image.kind)))) errors.push(`Image for ${id} needs an assetId (or null for shape only).`);
      if (patch.palette !== undefined && !validPalette(patch.palette)) errors.push(`Palette for ${id} needs 1–5 valid colours.`);
      if (patch.density !== undefined && (!finite(patch.density) || patch.density <= 0 || patch.density > 1)) errors.push(`Density for ${id} must be within (0, 1].`);
      if (patch.busy !== undefined && (!Array.isArray(patch.busy) || patch.busy.length !== 2 || !patch.busy.every((v) => finite(v) && v >= 0 && v <= 1) || patch.busy[0] > patch.busy[1])) errors.push(`Busy for ${id} must be [low, high] within 0–1.`);
    }
  }
  return errors;
}

/**
 * Apply section edits to composed cues (pure). Returns new cues, motifs and
 * palettes plus a report { applied, skipped: [{op, at, reason}] }.
 */
export function applySectionEdits({ cues, motifs, palettes, maxDensity = 1, minCueSeconds = 0.5 }, sections = {}) {
  const report = { applied: 0, skipped: [] };
  let out = cues.map((cue) => ({ ...cue }));
  const skip = (op, at, reason) => report.skipped.push({ op, at, reason });
  for (const t of sections.merge || []) {
    const i = out.findIndex((cue, k) => k > 0 && near(cue.start, t));
    if (i < 0) { skip("merge", t, "no section boundary there"); continue; }
    const [a, b] = [out[i - 1], out[i]];
    out.splice(i - 1, 2, { ...a, end: b.end, busy: [Math.min(a.busy[0], b.busy[0]), Math.max(a.busy[1], b.busy[1])], density: Math.max(a.density, b.density), reason: `${a.reason} · merged with ${b.id}`, mergedCueIds: [...(a.mergedCueIds || []), b.id] });
    report.applied++;
  }
  for (const { from, to } of sections.move || []) {
    const i = out.findIndex((cue, k) => k > 0 && near(cue.start, from));
    if (i < 0) { skip("move", from, "no section boundary there"); continue; }
    if (to - out[i - 1].start < minCueSeconds || out[i].end - to < minCueSeconds) { skip("move", from, `would leave a section shorter than ${minCueSeconds}s`); continue; }
    out[i - 1] = { ...out[i - 1], end: round(to) }; out[i] = { ...out[i], start: round(to) };
    report.applied++;
  }
  for (const t of sections.split || []) {
    const i = out.findIndex((cue) => t > cue.start && t < cue.end);
    if (i < 0 || out.some((cue) => near(cue.start, t))) { skip("split", t, "not inside a section"); continue; }
    const cue = out[i];
    if (t - cue.start < minCueSeconds || cue.end - t < minCueSeconds) { skip("split", t, `would leave a section shorter than ${minCueSeconds}s`); continue; }
    out.splice(i, 1, { ...cue, end: round(t) }, { ...cue, id: `${cue.id}-split-${Math.round(t * 1000)}`, start: round(t), reason: `${cue.reason} · split at ${round(t, 2)}s` });
    report.applied++;
  }
  const nextMotifs = [...motifs], nextPalettes = { ...palettes }, byId = new Map(motifs.map((m) => [m.id, m]));
  for (const [cueId, patch] of Object.entries(sections.cues || {})) {
    const i = out.findIndex((cue) => cue.id === cueId);
    if (i < 0) { skip("cue", cueId, "no such section after boundary edits"); continue; }
    let cue = { ...out[i] };
    if (patch.density !== undefined) cue.density = round(Math.min(maxDensity, patch.density));
    if (patch.busy !== undefined) cue.busy = patch.busy.map((v) => round(v));
    if (patch.family !== undefined || patch.image !== undefined || patch.palette !== undefined) {
      // One occurrence gets its own motif, so its repeat group is untouched.
      const base = byId.get(cue.motifId), id = `${base.id}@${cue.id}`;
      const motif = { ...base, id, occurrenceOf: cue.id, reason: `edited for ${cue.id} only` };
      if (patch.family !== undefined) motif.family = patch.family;
      if (patch.image === null) delete motif.imageRef; else if (patch.image) motif.imageRef = structuredClone(patch.image);
      if (patch.palette) { motif.paletteId = `${base.paletteId}@${cue.id}`; nextPalettes[motif.paletteId] = structuredClone(patch.palette); }
      nextMotifs.push(motif); cue.motifId = id;
    }
    cue.edited = true; out[i] = cue; report.applied++;
  }
  return { cues: out, motifs: nextMotifs, palettes: nextPalettes, report };
}

// Direction helpers for editors (pure; return a new `sections` object).
const list = (sections, key) => [...(sections?.[key] || [])];
export const splitSectionAt = (sections = {}, t) => (list(sections, "split").some((x) => near(x, t)) ? sections : { ...sections, split: [...list(sections, "split"), round(t)] });
export const mergeSectionBoundary = (sections = {}, t) => (list(sections, "merge").some((x) => near(x, t)) ? sections : { ...sections, merge: [...list(sections, "merge"), round(t)] });
/** Moving a boundary that was already moved updates that move instead of stacking another. */
export function moveSectionBoundary(sections = {}, from, to) {
  const moves = list(sections, "move"), i = moves.findIndex((m) => near(m.to, from));
  if (i >= 0) { const origin = moves[i].from; moves.splice(i, 1); if (!near(origin, to)) moves.push({ from: origin, to: round(to) }); }
  else if (!near(from, to)) moves.push({ from: round(from), to: round(to) });
  return { ...sections, move: moves };
}
export function editSectionCue(sections = {}, cueId, patch) {
  const cues = { ...(sections.cues || {}) }, next = { ...(cues[cueId] || {}), ...patch };
  for (const [k, v] of Object.entries(next)) if (v === undefined) delete next[k];
  if (Object.keys(next).length) cues[cueId] = next; else delete cues[cueId];
  return { ...sections, cues };
}
/** Undo every edit that touches one cue: its patch, and boundary edits at its edges. */
export function resetSectionCue(sections = {}, cue) {
  const touches = (t) => near(t, cue.start) || near(t, cue.end) || (t > cue.start && t < cue.end);
  const cues = { ...(sections.cues || {}) };
  delete cues[cue.id];
  return { merge: list(sections, "merge").filter((t) => !touches(t)), move: list(sections, "move").filter((m) => !touches(m.from) && !touches(m.to)), split: list(sections, "split").filter((t) => !touches(t)), cues };
}
