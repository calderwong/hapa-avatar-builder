// Recognition evidence locates passages; forced alignment alone cannot prove words were sung.
const COMMON = new Set('a an and are as at be but by for from go i in is it me my of on or our so that the their them there these they this to was we were will with you your'.split(' '));
export function echoLyricLexemes(text) {
  return (String(text || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu) || []).map(s => s.replace(/['’]/g, ''));
}
/**
 * A compact English sound key: the recognizer writes what it hears ("see",
 * "rough", "wannabes") while songs are often written with puns or creative
 * spelling ("Sea", "Ruff", "Wanna Bees"). Consonants keep their sound class,
 * the first vowel sound is kept and later vowels dropped, doubled letters merge.
 */
const VOWEL_CLASS = [[/^(ea|ee|ei|ie)/,'e'],[/^(ou|oo|ew)/,'u'],[/^(ai|ay)/,'a'],[/^(oa|ow)/,'o'],[/^(au|aw)/,'o']];
export function echoLyricSoundKey(token) {
  let w = String(token || '').toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return '';
  w = w.replace(/^kn/, 'n').replace(/^wr/, 'r').replace(/^ps/, 's').replace(/^wh/, 'w').replace(/(ou|au)gh$/, '$1f').replace(/gh/g, '')
    .replace(/ph/g, 'f').replace(/tch/g, 'ch').replace(/sch/g, 'sk').replace(/ck/g, 'k').replace(/dg/g, 'j')
    .replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks').replace(/z/g, 's');
  let out = '', vowel = false;
  for (let i = 0; i < w.length;) {
    if (/[aeiou]/.test(w[i]) || (w[i] === 'y' && i > 0)) {
      let j = i; while (j < w.length && (/[aeiou]/.test(w[j]) || (w[j] === 'y' && j > 0))) j++;
      const group = w.slice(i, j);
      if (!vowel) { out += VOWEL_CLASS.find(([re]) => re.test(group))?.[1] || (group[0] === 'y' ? 'i' : group[0]); vowel = true; }
      i = j; continue;
    }
    if (out.at(-1) !== w[i]) out += w[i];
    i++;
  }
  return out;
}
function editDistanceAtMost(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, k) => k);
  for (let i = 1; i <= a.length; i++) {
    const row = [i]; let best = i;
    for (let k = 1; k <= b.length; k++) { row[k] = Math.min(previous[k] + 1, row[k - 1] + 1, previous[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)); best = Math.min(best, row[k]); }
    if (best > limit) return false;
    previous = row;
  }
  return previous[b.length] <= limit;
}
/**
 * How a written lyric token may match a recognized one. Common words match
 * only exactly; distinctive words may also match by sound or a close spelling.
 * → { kind, weight } | null, where weight ranks evidence for the sequence match.
 */
export function echoLyricTokenMatch(written, heard, writtenKey = echoLyricSoundKey(written), heardKey = echoLyricSoundKey(heard)) {
  if (!written || !heard) return null;
  if (written === heard) return { kind: 'exact', weight: COMMON.has(written) ? 2 : 8 };
  if (COMMON.has(written) || COMMON.has(heard)) return null;
  if (writtenKey.length >= 2 && writtenKey === heardKey && Math.min(written.length, heard.length) >= 3) return { kind: 'sounds-alike', weight: 6 };
  if (written.length >= 5 && heard.length >= 4 && written[0] === heard[0] && editDistanceAtMost(written, heard, Math.floor(written.length / 4))) return { kind: 'close-spelling', weight: 5 };
  return null;
}
const joinedMatch = (a, b) => a.length >= 4 && a === b;

export function echoLyricPerformanceMap(lines, transcriptWords) {
  const tokens = lines.flatMap((text, line) => echoLyricLexemes(text).map((norm,lineTokenIndex) => ({norm, line, lineTokenIndex, key: echoLyricSoundKey(norm)})));
  const words = transcriptWords.flatMap((word, index) => echoLyricLexemes(word.text ?? word.word).map(norm => ({...word, norm, index, key: echoLyricSoundKey(norm)})));
  // Distinctive words outweigh coincidences such as "the" and "go". Occurrences are consumed once.
  // Recognizers misspell or split/join words, so distinctive tokens may also match by sound
  // ("Sea"/"see"), close spelling, or two written words heard as one ("Wanna Bees"/"wannabes").
  const n=tokens.length, m=words.length;
  const single=(i,j)=>echoLyricTokenMatch(tokens[i].norm,words[j].norm,tokens[i].key,words[j].key);
  // Both joined words must be distinctive: a vowel-only word ("I", "a") adds nothing to a sound key.
  const merged=(i,j)=>i+1<n&&tokens[i+1].line===tokens[i].line&&!COMMON.has(tokens[i].norm)&&!COMMON.has(tokens[i+1].norm)&&tokens[i].key.length>=2&&tokens[i+1].key.length>=2&&joinedMatch(echoLyricSoundKey(tokens[i].norm+tokens[i+1].norm),words[j].key)?{kind:'joined-words',weight:6}:null;
  const split=(i,j)=>j+1<m&&!COMMON.has(tokens[i].norm)&&joinedMatch(tokens[i].key,echoLyricSoundKey(words[j].norm+words[j+1].norm))?{kind:'split-word',weight:6}:null;
  const dp=Array.from({length:n+2},()=>new Uint32Array(m+2));
  for(let i=n-1;i>=0;i--) for(let j=m-1;j>=0;j--){
    let best=Math.max(dp[i+1][j],dp[i][j+1]);
    const s=single(i,j);if(s)best=Math.max(best,s.weight+dp[i+1][j+1]);
    const g=merged(i,j);if(g)best=Math.max(best,g.weight*2+dp[i+2][j+1]);
    const p=split(i,j);if(p)best=Math.max(best,p.weight+dp[i+1][j+2]);
    dp[i][j]=best;
  }
  const pairs=[],soft=new Map();let i=0,j=0;
  while(i<n&&j<m){
    const s=single(i,j);
    if(s&&dp[i][j]===s.weight+dp[i+1][j+1]){if(s.kind!=='exact')soft.set(i,{kind:s.kind});pairs.push([i++,j++]);continue;}
    const g=merged(i,j);
    if(g&&dp[i][j]===g.weight*2+dp[i+2][j+1]){soft.set(i,{kind:g.kind});soft.set(i+1,{kind:g.kind});pairs.push([i,j],[i+1,j]);i+=2;j++;continue;}
    const p=split(i,j);
    if(p&&dp[i][j]===p.weight+dp[i+1][j+2]){soft.set(i,{kind:p.kind,endWord:j+1});pairs.push([i,j]);i++;j+=2;continue;}
    if(dp[i+1][j]>=dp[i][j+1])i++;else j++;
  }
  const exactPairs=[...pairs], variants=new Set();
  const nearSpelling=(a,b)=>{
    if(a===b||COMMON.has(a)||COMMON.has(b)||Math.min(a.length,b.length)<4||a[0]!==b[0]||Math.abs(a.length-b.length)>1)return false;
    let i=0,j=0,edits=0;while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}if(++edits>1)return false;if(a.length>=b.length)i++;if(b.length>=a.length)j++;}
    return edits+(i<a.length||j<b.length?1:0)===1;
  };
  const bounds=[[-1,-1],...exactPairs,[n,m]];
  for(let k=1;k<bounds.length;k++){
    const [pt,pw]=bounds[k-1],[nt,nw]=bounds[k],count=nt-pt-1;
    if(count<1||count>2||nw-pw-1!==count)continue;
    const proposals=[];
    for(let offset=1;offset<=count;offset++){
      const t=pt+offset,w=pw+offset,line=tokens[t].line;
      const distinctiveNeighbor=[pt,nt].some(x=>x>=0&&x<n&&tokens[x].line===line&&!COMMON.has(tokens[x].norm));
      if(!distinctiveNeighbor||!nearSpelling(tokens[t].norm,words[w].norm)||words[w].end-words[w].start>5)break;
      proposals.push([t,w]);
    }
    if(proposals.length===count)for(const pair of proposals){pairs.push(pair);variants.add(pair[0]);}
  }
  pairs.sort((a,b)=>a[0]-b[0]);
  const mapped=lines.map((text,line)=>({line,text,tokenCount:echoLyricLexemes(text).length,matches:[]}));
  for(const [t,w] of pairs){
    const softMatch=soft.get(t),last=softMatch?.endWord!==undefined?words[softMatch.endWord]:words[w];
    mapped[tokens[t].line].matches.push({token:tokens[t].norm,recognizedToken:softMatch?.endWord!==undefined?`${words[w].norm} ${last.norm}`:words[w].norm,matchKind:variants.has(t)?'local-spelling-variant':softMatch?.kind||'exact',lineTokenIndex:tokens[t].lineTokenIndex,transcriptIndex:words[w].index,start:words[w].start,end:last.end});
  }
  for(const row of mapped){
    row.coverage=row.tokenCount?row.matches.length/row.tokenCount:0;
    // Sound and spelling matches only ever pair distinctive words, so they count as distinctive evidence.
    row.distinctiveMatches=row.matches.filter(w=>!COMMON.has(w.token)).length;
    row.supported=row.tokenCount>0 && row.coverage>=.45 && (row.distinctiveMatches>=2 || (row.distinctiveMatches>=1 && row.matches.length>=2 && row.coverage>=.6) || row.coverage===1);
    row.start=row.supported?row.matches[0].start:null;
    row.end=row.supported?row.matches.at(-1).end:null;
    row.reason=row.supported?'distinctive-monotonic-transcript-evidence':'insufficient-performance-evidence';
  }
  const passages=[];
  for(let k=0;k<mapped.length;){
    if(mapped[k].supported){k++;continue;}
    const first=k;while(k+1<mapped.length&&!mapped[k+1].supported)k++;
    passages.push({firstLine:first,lastLine:k,lineCount:k-first+1,tokenCount:mapped.slice(first,k+1).reduce((n,r)=>n+r.tokenCount,0),reason:'recognition-gap-not-proof-of-absence'});k++;
  }
  return {schemaVersion:'hapa.echo.lyric-performance-map.v1',policy:'distinctive-monotonic-v1',lines:mapped,passages,supportedLines:mapped.filter(r=>r.supported).length};
}

// The aligner converts seconds with Math.round(seconds*16000); ending on a whole hundredth inside the
// recording keeps the excerpt within the source (the exact length can round past its last sample).
const lastHundredth=duration=>Math.floor(duration*100)/100;

/**
 * Forced-alignment windows (≤ maxSeconds, the aligner's crop limit) for the
 * primary performance of every written line. A window never mixes vocal
 * sources: each line is aligned on the stem its evidence came from (unsupported
 * lines inherit the nearest supported line's source). A line whose estimated
 * span exceeds the limit gets a full-length search window around its
 * estimated position, flagged searchLimited, instead of failing the song.
 */
export function echoLyricAlignmentWindows(lines, mapping, duration, {maxSeconds=30}={}) {
  const spans=mapping.lines.map(r=>r.supported?[r.start,r.end]:null);
  const sources=mapping.lines.map(r=>r.supported?(r.alignSourceId??r.sourceId):undefined);
  for(let i=0;i<sources.length;i++)if(sources[i]===undefined)sources[i]=sources.slice(0,i).reverse().find(s=>s!==undefined)??sources.slice(i+1).find(s=>s!==undefined);
  // Allocate a missing run as a run; never repeatedly consume the same whole gap.
  for(let i=0;i<spans.length;){
    if(spans[i]){i++;continue;}
    const first=i;while(i+1<spans.length&&!spans[i+1])i++;
    const start=spans[first-1]?.[1]??0,end=spans[i+1]?.[0]??duration,total=lines.slice(first,i+1).reduce((n,l)=>n+Math.max(1,l.length),0);
    let cursor=start;
    for(let k=first;k<=i;k++){const next=cursor+(end-start)*Math.max(1,lines[k].length)/total;spans[k]=[cursor,next];cursor=next;}i++;
  }
  const windows=[],limit=maxSeconds-.5;
  for(const [line,[start,end]] of spans.entries()){
    let s=Math.max(0,start-1),e=Math.min(duration,end+1),searchLimited=false;
    if(e<=s){s=Math.max(0,Math.min(start,duration)-1);e=Math.min(duration,s+2);}
    // Never clip a long passage into one window: give the line its own full-length search window.
    if(e-s>limit){const mid=(start+end)/2;s=Math.max(0,Math.min(mid-limit/2,duration-limit));e=Math.min(duration,s+limit);searchLimited=true;}
    const previous=windows.at(-1),sourceId=sources[line];
    if(previous&&!searchLimited&&!previous.searchLimited&&previous.sourceId===sourceId&&e-previous.startSeconds<=limit){previous.endSeconds=Math.max(previous.endSeconds,e);previous.lines.push(line);}
    else windows.push({startSeconds:s,endSeconds:e,lines:[line],...(sourceId!==undefined?{sourceId}:{}),...(searchLimited?{searchLimited:true}:{})});
  }
  return windows.map(w=>({...w,startSeconds:Math.floor(w.startSeconds*100)/100,endSeconds:Math.min(lastHundredth(duration),Math.ceil(w.endSeconds*100)/100),text:w.lines.map(i=>lines[i]).join('\n'),state:'planned',runId:null}));
}

/**
 * Windows for every additional voice performance (backing doubles, echoes):
 * each is aligned on its own stem against the same written line, so a backing
 * part gets its own word timing. Entries keep their line index; a window may
 * hold the same line twice when the singers repeat it.
 */
export function echoLyricPerformanceWindows(lines, mapping, duration, {maxSeconds=30}={}) {
  const entries=mapping.lines.flatMap((row,line)=>(row.performances||[]).filter(p=>p.voice!=='mix'&&Number.isFinite(p.start)&&p.end>p.start).map((p,k)=>({line,performance:k,sourceId:p.sourceId,voice:p.voice,start:p.start,end:p.end})))
    .sort((a,b)=>String(a.sourceId).localeCompare(String(b.sourceId))||a.start-b.start);
  const windows=[],limit=maxSeconds-.5;
  for(const entry of entries){
    const s=Math.max(0,entry.start-1),e=Math.min(duration,entry.end+1);
    if(e-s>limit)continue;
    const previous=windows.at(-1);
    if(previous&&previous.sourceId===entry.sourceId&&e-previous.startSeconds<=limit&&s>=previous.entries.at(-1).start-1){previous.endSeconds=Math.max(previous.endSeconds,e);previous.entries.push(entry);}
    else windows.push({kind:'performance',sourceId:entry.sourceId,voice:entry.voice,startSeconds:s,endSeconds:e,entries:[entry]});
  }
  return windows.map(w=>({...w,startSeconds:Math.floor(w.startSeconds*100)/100,endSeconds:Math.min(lastHundredth(duration),Math.ceil(w.endSeconds*100)/100),lines:w.entries.map(x=>x.line),text:w.entries.map(x=>lines[x.line]).join('\n'),state:'planned',runId:null}));
}

export function inspectEchoLyricPassages(timing) {
  const reasons=[],lines=timing.lines||[];
  // Enforce locally, even when aggregate confidence is high. Never reinterpret a gap as omission.
  const unresolved=[];
  for(const [index,line] of lines.entries()){
    const review=line.alignmentReview;
    // Each line is judged on the evidence that timed it: recognizer timestamps or forced alignment.
    const recognizerTimed=timing.provenance?.measurementKind==='transcript-timestamps'||review?.evidence==='transcript-timestamps';
    const supported=recognizerTimed ? review?.performanceSupported===true && review.performanceCoverage>=.45 : Number.isFinite(review?.modelAgreementRatio) && review.modelAgreementRatio>=.4;
    if(!supported || !line.words?.some(w=>w.matched))unresolved.push(index);
    if((line.words?.length||0)/(Number(line.end)-Number(line.start))>12)reasons.push('compressed-lyric-line');
  }
  if(unresolved.length)reasons.push('unresolved-lyric-passages');
  if((timing.provenance?.timingOmissions||[]).length)reasons.push('written-lyrics-omitted');
  return {accepted:reasons.length===0,reasons:[...new Set(reasons)],unresolvedLines:unresolved};
}

// Compare corresponding written tokens, not only the first word: ASR can absorb preceding silence.
export function echoLyricComparePerformanceMaps(primary, alternate, {preferPrimary=false,corroboratingWords=[]}={}) {
  const conflicts=[],repairs=[];
  const lines=primary.lines.map((row,i)=>{
    const alt=alternate.lines[i], a=new Map(row.matches.map(w=>[w.lineTokenIndex,w])),b=new Map(alt.matches.map(w=>[w.lineTokenIndex,w]));
    const common=row.matches.filter(w=>b.get(w.lineTokenIndex)?.token===w.token);
    const residuals=common.map(w=>Math.abs(w.start-b.get(w.lineTokenIndex).start)).sort((a,b)=>a-b);
    const median=residuals.length?residuals[Math.floor(residuals.length/2)]:null;
    let conflict=row.supported&&alt.supported&&median!==null&&median>2,corroboratedChoice=null;
    if(conflict&&corroboratingWords.length){
      const support=r=>r.matches.filter(w=>corroboratingWords.some(c=>c.lineText===r.text&&c.token===w.token&&Math.abs(c.start-w.start)<=1)).length;
      const needed=Math.min(2,row.tokenCount),p=support(row)>=needed,a=support(alt)>=needed;
      if(p!==a){corroboratedChoice=a?'alternate':'primary';conflict=false;}
    }
    if(conflict)conflicts.push(i);
    const chooseAlternate=corroboratedChoice?corroboratedChoice==='alternate':!preferPrimary&&alt.coverage>row.coverage,chosen=chooseAlternate?alt:row,peers=chooseAlternate?a:b;
    const stable=common.filter(w=>Math.abs(w.start-b.get(w.lineTokenIndex).start)<=.7).length;
    const matches=chosen.matches.map(w=>{
      const peer=peers.get(w.lineTokenIndex);
      if(stable>=2&&stable>=common.length*2/3&&peer?.token===w.token&&Math.abs(w.start-peer.start)>1&&Math.abs(w.end-peer.end)<=.35&&(peer.end-peer.start)<(w.end-w.start)*.5){
        repairs.push({line:i,tokenIndex:w.lineTokenIndex,token:w.token,oldStart:w.start,newStart:peer.start,oldEnd:w.end,newEnd:peer.end,reason:'cross-source-leading-silence-boundary'});
        return {...peer,boundaryFromAlternate:!chooseAlternate};
      }
      return {...w};
    });
    return {...chosen,matches,sourceChoice:chooseAlternate?'alternate':'primary',conflictResolution:corroboratedChoice?'existing-qwen-and-recognizer-agreement':null,supported:chosen.supported&&!conflict,start:chosen.supported?matches[0]?.start:null,end:chosen.supported?matches.at(-1)?.end:null,reason:conflict?'cross-source-passage-time-disagreement':chosen.reason};
  });
  return {...primary,lines,supportedLines:lines.filter(l=>l.supported).length,conflictingLines:conflicts,boundaryRepairs:repairs};
}
