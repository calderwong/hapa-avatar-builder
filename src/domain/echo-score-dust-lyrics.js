// Lyric control for Score Dust (P2 item 12). Direction field `lyrics`:
//
//   { pick: "hooks" | "chosen" | "off", lines: [lineIndex], max: 1–16,
//     font: "sans" | "serif" | "mono" | "script", textCase: "as-sung" | "upper" | "lower",
//     wordByWord: boolean }
//
// "hooks" keeps the automatic selection (repeated lines, out of lift run-ups);
// "chosen" shows exactly the lines picked, still refusing overlaps; word by
// word turns each shown line into one phrase per sung word using the measured
// word timing. Everything is a pure function of the lines and the timeline.

export const DUST_LYRIC_FONTS = Object.freeze({
  sans: { label: "Bold sans", css: (px) => `800 ${px}px system-ui, sans-serif` },
  serif: { label: "Serif", css: (px) => `700 ${px}px Georgia, "Times New Roman", serif` },
  mono: { label: "Mono", css: (px) => `700 ${px}px ui-monospace, Menlo, Consolas, monospace` },
  script: { label: "Script", css: (px) => `italic 700 ${px}px "Brush Script MT", "Segoe Script", cursive` },
});
export const DUST_LYRIC_CASES = Object.freeze(["as-sung", "upper", "lower"]);
const PICKS = ["hooks", "chosen", "off"];
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v, d = 4) => Number(Number(v).toFixed(d));
const lineTime = (line, key) => { const value = Number(line?.[key] ?? line?.[`${key}Seconds`]); return Number.isFinite(value) ? value : NaN; };
const strip = (v) => String(v || "").replace(/^sha256:/, "").toLowerCase();

/** `lyricPhrases: "off"` (the earlier switch) still means off. */
export function normalizeLyricControl(lyrics = {}, legacy = undefined) {
  const pick = PICKS.includes(lyrics?.pick) ? lyrics.pick : legacy === "off" ? "off" : "hooks";
  return { pick, lines: Array.isArray(lyrics?.lines) ? [...new Set(lyrics.lines.filter((i) => Number.isSafeInteger(i) && i >= 0))].sort((a, b) => a - b) : [],
    max: Number.isSafeInteger(lyrics?.max) ? Math.min(16, Math.max(1, lyrics.max)) : 8,
    font: DUST_LYRIC_FONTS[lyrics?.font] ? lyrics.font : "sans", textCase: DUST_LYRIC_CASES.includes(lyrics?.textCase) ? lyrics.textCase : "as-sung",
    wordByWord: lyrics?.wordByWord === true };
}

export function validateLyricControl(lyrics) {
  if (lyrics === undefined) return [];
  if (!lyrics || typeof lyrics !== "object" || Array.isArray(lyrics)) return ["lyrics must be an object."];
  const errors = [];
  for (const key of Object.keys(lyrics)) if (!["pick", "lines", "max", "font", "textCase", "wordByWord"].includes(key)) errors.push(`Unknown lyrics field ${key}.`);
  if (lyrics.pick !== undefined && !PICKS.includes(lyrics.pick)) errors.push(`lyrics.pick must be ${PICKS.join(", ")}.`);
  if (lyrics.lines !== undefined && (!Array.isArray(lyrics.lines) || lyrics.lines.length > 64 || !lyrics.lines.every((i) => Number.isSafeInteger(i) && i >= 0))) errors.push("lyrics.lines must be up to 64 line indices.");
  if (lyrics.max !== undefined && (!Number.isSafeInteger(lyrics.max) || lyrics.max < 1 || lyrics.max > 16)) errors.push("lyrics.max must be 1–16.");
  if (lyrics.font !== undefined && !DUST_LYRIC_FONTS[lyrics.font]) errors.push(`lyrics.font must be ${Object.keys(DUST_LYRIC_FONTS).join(", ")}.`);
  if (lyrics.textCase !== undefined && !DUST_LYRIC_CASES.includes(lyrics.textCase)) errors.push(`lyrics.textCase must be ${DUST_LYRIC_CASES.join(", ")}.`);
  if (lyrics.wordByWord !== undefined && typeof lyrics.wordByWord !== "boolean") errors.push("lyrics.wordByWord must be true or false.");
  return errors;
}

function timedWords(line) {
  return (line?.words || []).map((w) => ({ text: String(w?.text ?? w?.word ?? "").trim(), start: lineTime(w, "start"), end: lineTime(w, "end") })).filter((w) => w.text && w.end > w.start);
}

/** Exactly the chosen lines (by index), in time order; overlaps and unusable lines are reported. */
export function chosenLyricPhrases(lines, timeline, indices, { lyricAudioHash = null, events = [] } = {}) {
  if (lyricAudioHash && timeline.source?.sourceSha256 && strip(lyricAudioHash) !== strip(timeline.source.sourceSha256)) {
    return { status: "audio-mismatch", reason: "Lyric timing belongs to different master audio bytes than this Atlas run.", phrases: [], skipped: [] };
  }
  const shocks = (events || []).filter((e) => e.response === "shock").map((e) => e.at), phrases = [], skipped = [];
  for (const index of indices) {
    const line = lines?.[index], start = lineTime(line, "start"), end = lineTime(line, "end");
    let text = String(line?.text || "").trim();
    if (!text || !(end > start) || start < 0 || end > timeline.durationSeconds + 1e-3) { skipped.push({ index, reason: "no measured timing inside this recording" }); continue; }
    // Long lines keep as many whole words as fit the 64-character phrase limit.
    if (text.length > 64) { const words = text.split(/\s+/); text = ""; for (const w of words) { if (`${text} ${w}`.trim().length > 64) break; text = `${text} ${w}`.trim(); } }
    if (phrases.some((p) => start < p.end && p.start < end)) { skipped.push({ index, reason: "overlaps an earlier chosen line" }); continue; }
    const readable = 0.4 + 0.06 * text.length;
    phrases.push({ id: `lyric-${line.id ?? index}`, text, start: round(start), end: round(end), burst: shocks.some((at) => at >= start - 0.25 && at <= end + 0.3) || end - start < readable,
      source: { kind: "lyric-line", lineId: line.id ?? null, lineIndex: index, reason: "chosen by direction" } });
  }
  phrases.sort((a, b) => a.start - b.start);
  return { status: phrases.length ? "chosen" : "none-readable", reason: `${phrases.length} of ${indices.length} chosen lines shown`, phrases, skipped };
}

/** Split each lyric phrase into one phrase per sung word (needs ≥ 2 timed words). */
export function wordByWordPhrases(phrases, lines) {
  return phrases.flatMap((phrase) => {
    const line = lines?.[phrase.source?.lineIndex];
    const words = [];
    for (const w of timedWords(line)) {
      if (w.start < phrase.start - 1e-3 || w.end > phrase.end + 1e-3) continue;
      // A word starting within 50 ms of the previous one joins it.
      if (words.length && w.start - words.at(-1).start < 0.05) words.at(-1).text += ` ${w.text}`; else words.push({ ...w });
    }
    if (words.length < 2) return [phrase];
    return words.map((word, i) => {
      // Each word holds until the next one starts, so the line reads as a flow.
      const next = words[i + 1], end = next ? next.start : Math.max(word.end, Math.min(phrase.end, word.start + 0.35));
      return { ...phrase, id: `${phrase.id}-w${i}`, text: word.text.slice(0, 64), start: round(word.start), end: round(end), burst: false, wordOf: phrase.id };
    });
  });
}

export function styleLyricPhrase(phrase, control) {
  const text = control.textCase === "upper" ? phrase.text.toUpperCase() : control.textCase === "lower" ? phrase.text.toLowerCase() : phrase.text;
  return { ...phrase, text, font: control.font };
}

export function lyricFontCss(font, px) {
  return (DUST_LYRIC_FONTS[font] || DUST_LYRIC_FONTS.sans).css(px);
}
