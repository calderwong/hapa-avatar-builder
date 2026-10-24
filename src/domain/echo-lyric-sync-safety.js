export function echoLyricHasManualTiming(value={}) {
 return Boolean(value.lyric_timing_manual_edit) || (value.timed_lyrics || value.lyricTimings || []).some(line=>line.locked || line.manual_locked || line.timingCorrection || (line.words || []).some(word=>word.locked || word.manual_locked || word.timingCorrection));
}
export function echoLyricSourceLines(value) {
 const text=typeof value==='string'?value:value?.text||'';
 return text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^\[[^\]]*\]$/.test(line));
}
export function echoLyricSourceMatches(lines,lyrics) {
 return echoLyricWrittenLinesCheck(lines,lyrics).ok;
}

/**
 * The written lyrics are the text of record: a timing may only show them. The timed lines must be
 * exactly the written lyric lines — same text, same order, same count — whatever engine produced
 * the timing. Section tags such as "[Chorus]" are not sung lyrics and are ignored on both sides.
 * Speech-to-text output never replaces written text; it only supplies timing for written words.
 * → { ok, writtenLines, timedLines, reason?, firstDifference?: { index, written, timed } }
 */
export function echoLyricWrittenLinesCheck(timingLines=[],writtenLyrics) {
 const written=echoLyricSourceLines(writtenLyrics);
 const timed=(Array.isArray(timingLines)?timingLines:[]).map(line=>String(line?.text??'').trim()).filter(text=>text&&!/^\[[^\]]*\]$/.test(text));
 const base={writtenLines:written.length,timedLines:timed.length};
 if(!written.length)return {...base,ok:false,reason:'no-written-lyrics'};
 const index=written.findIndex((text,i)=>text!==timed[i]);
 if(index<0&&timed.length===written.length)return {...base,ok:true};
 const at=index<0?written.length:index;
 return {...base,ok:false,reason:timed.length<written.length?'written-lines-missing':timed.length>written.length?'lines-not-in-written-lyrics':'timed-text-differs-from-written',
  firstDifference:{index:at,written:written[at]??null,timed:timed[at]??null}};
}

/** The written lyrics of the Song whose canonical timing ID is registryTrackId (null when none). */
export function echoLyricWrittenLyricsFor(registryTrackId,songs=[]) {
 const song=(songs||[]).find(s=>registryTrackId&&echoLyricRegistryTrackId(s)===String(registryTrackId));
 return song ? song.lyrics ?? '' : null;
}

// Match the canonical Songbook lineage used by sync; audio projections can retain another take's ID.
export function echoLyricRegistryTrackId(song={}) {
 return song.lineage?.registryTrackId || song.audio?.registryTrackId || song.registryTrackId || song.attribution?.songRegistryTrackId || '';
}

export function echoLyricDuplicateRegistryIds(songs=[]) {
 const seen=new Set(),duplicates=new Set();
 for(const song of songs){const id=echoLyricRegistryTrackId(song);if(!id)continue;if(seen.has(id))duplicates.add(id);seen.add(id);}
 return duplicates;
}

function normalizeTimingWords(words, start, end) {
  return Array.isArray(words)
    ? words.map((word, wordIndex) => ({
        word: String(word.word || word.text || word.token || ""),
        start: Number(word.start ?? word.startTime ?? start),
        end: Number(word.end ?? word.endTime ?? end),
        matched: word.matched ?? undefined,
        ...(word.evidence?{evidence:word.evidence}:{}),
        ...(word.evidenceSourceRun?{evidenceSourceRun:word.evidenceSourceRun}:{}),
        ...(word.recognitionMatches?{recognitionMatches:word.recognitionMatches}:{}),
        index: Number(word.index ?? wordIndex)
      })).filter((word) => word.word)
    : [];
}

// Lead/backing voice data (audio-atlas-lyric-timing.v3-voices) travels with each line: the singer of
// the primary timing, and every other voice performance with its own word timing.
function normalizeTimingVoices(voices) {
  if (!Array.isArray(voices)) return [];
  return voices.flatMap((voice) => {
    const start = Number(voice?.start), end = Number(voice?.end);
    if (!voice?.voice || !Number.isFinite(start) || !(end > start)) return [];
    return [{ voice: String(voice.voice), relation: String(voice.relation || ""), sourceId: voice.sourceId || null, sourceRun: voice.sourceRun || null,
      start: Number(start.toFixed(6)), end: Number(end.toFixed(6)), evidence: voice.evidence || null, coverage: Number(voice.coverage ?? 0), words: normalizeTimingWords(voice.words, start, end) }];
  });
}

/** The timed-lyric line shape written to Song Cards and Director projects (keeps lead/backing voices). */
export function normalizeEchoLyricTimingLines(lines = []) {
  if (!Array.isArray(lines)) return [];
  return lines
    .map((line, index) => {
      const start = Number(line.start ?? line.startTime ?? line.t0 ?? 0);
      const end = Number(line.end ?? line.endTime ?? line.t1 ?? start);
      const words = normalizeTimingWords(line.words, start, end);
      const voices = normalizeTimingVoices(line.voices);
      return {
        id: line.id || `timed-line-${index + 1}`,
        start: Number(start.toFixed(6)),
        end: Number(end.toFixed(6)),
        text: line.text || line.line || line.lyric || "",
        section: line.section || line.section_label || "",
        section_id: line.section_id || line.sectionId || "",
        section_label: line.section_label || line.sectionLabel || line.section || "",
        confidence: Number(line.confidence ?? 0),
        ...(line.alignmentReview ? { alignmentReview: line.alignmentReview } : {}),
        ...(line.voice ? { voice: String(line.voice) } : {}),
        words,
        ...(voices.length ? { voices } : {})
      };
    })
    .filter((line) => line.text && Number.isFinite(line.start) && Number.isFinite(line.end) && line.end >= line.start);
}
