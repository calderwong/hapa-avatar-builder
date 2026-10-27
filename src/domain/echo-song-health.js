import {echoLyricWrittenLinesCheck, echoLyricHasManualTiming} from './echo-lyric-sync-safety.js';
import {inspectEchoLyricTimingAdjudication} from './echo-lyric-promotion.js';
export const SONG_HEALTH_VERSION='hapa.echo.song-health.v1';
export const songHealthCheck=(id,status,message,evidence={},action=null)=>({id,status,message,evidence,action});
// Compare what is displayed, including word clocks and unresolved flags, not
// incidental IDs, confidence rounding or generated section labels.
export function lyricPlaybackSignature(lines=[]){return JSON.stringify(lines.map(l=>({text:l.text,start:l.start,end:l.end,review:l.alignmentReview?.needsReview===true,voice:l.voice||null,words:(l.words||[]).map(w=>({word:w.word??w.text,start:w.start,end:w.end})),voices:l.voices||[]})));}
export function inspectSongLyrics({song,project,timing,sourceVerified=false,sourceReason='',duplicateIdentity=false}){
 const checks=[],add=(...a)=>checks.push(songHealthCheck(...a));
 const written=echoLyricWrittenLinesCheck(project?.timed_lyrics,song.lyrics);
 const canonicalText=s=>(String(s||'').normalize('NFC').toLowerCase().replace(/[’‘]/gu, "'").match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu)||[]).join(' ');
 const wordTextDifferences=(project?.timed_lyrics||[]).flatMap((l,i)=>l.words?.length&&canonicalText(l.words.map(w=>w.word??w.text??'').join(' '))!==canonicalText(l.text)?[{line:i+1,written:l.text,wordText:l.words.map(w=>w.word??w.text??'').join(' ')}]:[]);
 if(wordTextDifferences.length){written.ok=false;written.reason='displayed-word-text-differs-from-written';written.wordTextDifferences=wordTextDifferences;}
 add('lyrics.written',written.ok?'pass':'fail',written.ok?'Displayed text matches the written Song Card, in order.':`Written lyrics do not match the project: ${written.reason}.`,written,'retime-written');
 if(duplicateIdentity)add('identity.unique','fail','Another Song Card uses this recording ID. Resolve identity before publication.',{},'resolve-identity');
 const sourceText=echoLyricWrittenLinesCheck(timing?.lines,song.lyrics);
 add('lyrics.source',sourceVerified&&sourceText.ok?'pass':'fail',sourceVerified&&sourceText.ok?'Timing is bound to the current recording and written text.':sourceReason||'Current recording-bound, written-lyric timing is missing.',{sourceText,sourceVerified},'retime-written');
 const unresolved=[...new Set([...(timing?.passageReview?.unresolvedLines||[]),...(timing?.lines||[]).flatMap((l,i)=>l.alignmentReview?.needsReview?[i]:[])])].sort((a,b)=>a-b);
 const structure=inspectEchoLyricTimingAdjudication(timing||{});
 const reasons=structure.structuralReasons.filter(r=>!['audio-source-hash-missing','lyric-source-hash-missing'].includes(r));
 add('lyrics.passages',timing&&timing.passageReview?.accepted===true&&!unresolved.length&&!reasons.length?'pass':'fail',unresolved.length?`${unresolved.length} written passages still need timing resolution.`:!timing?.passageReview?'No passage-level acceptance evidence.':reasons.length?reasons.join(', '):'Passage review has not passed.',{unresolvedLines:unresolved.map(i=>({line:i+1,text:timing?.lines?.[i]?.text,start:timing?.lines?.[i]?.start,end:timing?.lines?.[i]?.end})),reasons,operatorDecision:timing?.operatorDecision?.decision||null},'resolve-passages');
 const lines=timing?.lines||[],words=lines.flatMap(l=>l.words||[]),measured=words.filter(w=>w.matched===true).length;
 add('lyrics.word-evidence',words.length&&lines.every(l=>!l.text?.trim()||(l.words||[]).some(w=>w.matched===true))?'pass':'fail',`${measured}/${words.length} written words have measured anchors; ${words.length-measured} have no measured-word flag.`,{measured,total:words.length,interpolated:words.length-measured,limit:'Machine evidence is not a listening certificate.'},'retime-written');
 const canonical=timing?.lines?.length?lyricPlaybackSignature(timing.lines):null;
 // Source normalization is handled by the collector before this comparison.
 add('lyrics.project-current',canonical&&lyricPlaybackSignature(project?.timed_lyrics||[])===canonical?'pass':'fail','The base project must carry the current timing, not merely name its source.',{},'sync-project');
 return {checks,unresolved,manualProtected:echoLyricHasManualTiming(project)};
}
export function inspectCutLyrics({cut,canonicalLines,writtenLyrics}){
 const project=cut.project,lines=project?.timed_lyrics||[],graphLines=project?.director_show_graph?.song?.lyricOverlay?.lines;
 const current=lyricPlaybackSignature(lines)===lyricPlaybackSignature(canonicalLines||[]);
 const graphCurrent=Array.isArray(graphLines)&&lyricPlaybackSignature(graphLines)===lyricPlaybackSignature(canonicalLines||[]);
 return {id:cut.id,title:cut.title||cut.id,parentId:cut.parentId||null,manualProtected:echoLyricHasManualTiming(project),written:echoLyricWrittenLinesCheck(lines,writtenLyrics),current,graphCurrent,graphPresent:Array.isArray(graphLines),lineCount:lines.length,firstStart:lines[0]?.start??null,issues:[...(!current?['saved-lyrics-stale']:[]),...(!graphCurrent?[Array.isArray(graphLines)?'saved-graph-lyrics-stale':'saved-graph-unverified']:[])]};
}
export function summarizeSongHealth(rows=[]){
 const counts={songs:rows.length,healthy:0,noncompliant:0,unknown:0,byCheck:{}};
 for(const row of rows){counts[row.status==='healthy'?'healthy':row.status==='unknown'?'unknown':'noncompliant']++;for(const c of row.checks||[]){const v=counts.byCheck[c.id]??={pass:0,fail:0,unknown:0};v[c.status==='pass'?'pass':c.status==='fail'?'fail':'unknown']++;}}
 return counts;
}
export const REQUIRED_SONG_HEALTH_CHECKS=['audio.current','lyrics.written','lyrics.source','lyrics.passages','lyrics.word-evidence','lyrics.project-current','beats.measured','cuts.current','telemetry.prepared','beats.stem-clock','living-light.bound','playback.lyrics','shaders.bound','response.observed','direction.current'];
export function finishSongHealth(row){const checks=row.checks||[];return {...row,schemaVersion:SONG_HEALTH_VERSION,status:checks.some(c=>c.status==='fail')?'noncompliant':REQUIRED_SONG_HEALTH_CHECKS.some(id=>!checks.some(c=>c.id===id&&c.status==='pass'))||checks.some(c=>c.status!=='pass')?'unknown':'healthy'};}
export function healthStemCoversWindow(stem,startUs,endUs){if(stem?.state!=='qualified'||!stem.frames||!Number.isFinite(startUs)||!(endUs>startUs))return false;let covered=startUs;for(const m of [...(stem.timeMap||[])].sort((a,b)=>a.songStartUs-b.songStartUs)){if(m.songEndUs<=covered)continue;if(m.songStartUs>covered)return false;covered=Math.max(covered,m.songEndUs);if(covered>=endUs)return true;}return false;}
export function healthRepairOutcome(before,after){const regressions=regressionChecks(before,after),ready=['cuts.current','playback.lyrics'].every(id=>after.checks.find(c=>c.id===id)?.status==='pass');return {regressions,ready,status:regressions.length?'regressed':ready?'completed':'needs-delivery-review',ok:!regressions.length&&ready};}
export function regressionChecks(before,after){const map=new Map(after.checks.map(c=>[c.id,c.status]));return before.checks.filter(c=>c.status==='pass'&&map.get(c.id)!=='pass').map(c=>c.id);}
export const HEALTH_ACTIONS={
 'retime-written':'Audio Atlas: match the unchanged written lyrics to lead/backing/master STT evidence, forced-align, then pass the existing promotion gate. Never replace text with a transcript.',
 'resolve-passages':'Inspect the listed passages and existing source evidence; run bounded local alignment only where evidence is missing. Keep unresolved written text and review flags; do not invent times or omit words.',
 'resolve-identity':'Resolve duplicate recording identity through Song Registry/Builder before writing timing.',
 'sync-project':'Run the existing lyric sync for this exact registry ID, after source and manual-lock checks.',
 'fork-current-timing':'Append a timing-corrected child of the Music Response cut, preserving visual direction. Rebuild its graph and re-audit; preserve the parent.',
 'measure-beats':'Run Audio Atlas with beats enabled on the exact current master and coherent stems; verify source hashes and beat/section coordinates.',
 'prepare-signals':'Prepare the exact coherent source set through the existing performance owner, then qualify its visual timing. Never treat master fallback as a measured stem.',
 'connect-living-light':'Repair Journey role bindings through an append-only Journey/cut revision. Check active windows, mapped stem spans, silent inputs and explicit fallback.',
 'connect-shaders':'Inspect the delivered shader cards and audio maps; bind measured prepared signals and verify quiet/strong, silence and reverse-seek behavior.',
 'verify-playback':'Verify the delivered selected cut, with Score Dust on and off, at lyric/beat/cue boundaries. Measure Living Light and shader response at fixed visual time; retain source-bound evidence.',
 'choose-direction':'Save a locally suggested Score Dust direction only when none exists; preserve existing authored directions.'
};

// A passed label is not a proof. A playback harness must supply the measured
// comparisons and immutable artifact digests bound to these exact inputs.
export function validateSongHealthPlaybackProof(proof,{fingerprint,cutId,canonicalLines=[]}={}){
 const errors=[],hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
 if(proof?.schemaVersion!=='hapa.echo.song-health-playback-proof.v1')errors.push('proof-schema');
 if(proof?.inputFingerprint!==fingerprint||proof?.cutId!==cutId)errors.push('proof-inputs-changed');
 if(!proof?.producer||!proof?.createdAt)errors.push('proof-provenance');
 for(const surface of ['living-light','shader']){
  const rows=(proof?.responseTrials||[]).filter(r=>r.surface===surface);
  for(const mode of ['quiet-strong','silence','reverse-seek']){
   const r=rows.find(x=>x.mode===mode);
   if(!r||!hash(r.artifactSha256)||!r.artifactPath||!Number.isFinite(r.visualTime)||!Number.isFinite(r.delta)||!Number.isFinite(r.tolerance)||r.tolerance<0)errors.push(`${surface}:${mode}:missing-measurement`);
   else if(mode==='quiet-strong'?(r.delta<=Math.max(r.tolerance,0)||!(r.strongEnergy>r.quietEnergy)):r.delta>r.tolerance)errors.push(`${surface}:${mode}:failed-comparison`);
  }
 }
 if(!Array.isArray(proof?.responseTrials)||proof.responseTrials.length>128)errors.push('response-proof-budget');
 const lyrics=Array.isArray(proof?.lyricSamples)?proof.lyricSamples:[];
 if(lyrics.length>512)errors.push('lyric-proof-budget');
 if(!canonicalLines.length)errors.push('canonical-lyrics-missing');
 for(const r of lyrics){const line=canonicalLines.find(l=>r.at>=l.start&&r.at<l.end);if(!line||r.expectedText!==line.text)errors.push('lyric-proof-not-canonical');}
 if(lyrics.length<5||new Set(lyrics.map(r=>r.at)).size<5)errors.push('lyric-boundary-coverage');
 for(const r of lyrics)if(!Number.isFinite(r.at)||!Number.isFinite(r.offsetSeconds)||Math.abs(r.offsetSeconds)>.15||r.scoreDustOnText!==r.expectedText||r.scoreDustOffText!==r.expectedText||!r.artifactPath||!hash(r.artifactSha256))errors.push('lyric-playback-mismatch');
 return {ok:!errors.length,errors:[...new Set(errors)]};
}
