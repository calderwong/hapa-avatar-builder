export function echoLyricHasManualTiming(value={}) {
 return Boolean(value.lyric_timing_manual_edit) || (value.timed_lyrics || value.lyricTimings || []).some(line=>line.locked || line.manual_locked || line.timingCorrection || (line.words || []).some(word=>word.locked || word.manual_locked || word.timingCorrection));
}
export function echoLyricSourceLines(value) {
 const text=typeof value==='string'?value:value?.text||'';
 return text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!/^\[[^\]]*\]$/.test(line));
}
export function echoLyricSourceMatches(lines,lyrics) {
 const source=echoLyricSourceLines(lyrics);
 return source.length===lines.length && source.every((text,i)=>text===lines[i].text);
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
